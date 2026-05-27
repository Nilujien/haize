/**
 * simulation.js
 * Boucle principale, physique, interactions, rendu Canvas.
 *
 * Nouveautés v4 :
 *  - Territorialité : chaque entité a un "home" vers lequel elle est attirée en ERRANCE
 *  - Boutons de déclenchement manuel d'événements globaux
 *  - Support tactile (tap pour inspecter sur mobile)
 */

import { Entity, ENTITY_DEFS, AFFINITES, STATE, Project } from './entities.js';

// ─── Bruit de Perlin simplifié (2D) ──────────────────────────────────────────
const PERLIN = (() => {
  const p = new Uint8Array(512);
  const perm = [
    151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,
    140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,
    247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,
    57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,
    74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,
    60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,
    65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,
    200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,
    52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,
    207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,
    119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,
    129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,
    218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,
    81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,
    184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,
    222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
  ];
  for (let i = 0; i < 256; i++) { p[i] = perm[i]; p[i + 256] = perm[i]; }

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(t, a, b) { return a + t * (b - a); }
  function grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }
  function noise(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(v,
      lerp(u, grad(p[a],   x,   y),   grad(p[b],   x-1, y)),
      lerp(u, grad(p[a+1], x,   y-1), grad(p[b+1], x-1, y-1))
    );
  }
  return { noise };
})();

// ─── Définitions des événements globaux ──────────────────────────────────────
const GLOBAL_EVENTS = [
  {
    type: 'TEMPETE',
    label: '🌪️ Tempête',
    color: '#636e72',
    duration: 12000,
    description: 'Chaos général - forces aléatoires violentes',
    apply(entities, dt) {
      for (const e of entities) {
        e.vx += (Math.random() - 0.5) * 0.8;
        e.vy += (Math.random() - 0.5) * 0.8;
        e.mood = Math.max(-1, e.mood - 0.0015 * dt);
        e.energy = Math.max(0, e.energy - 0.03 * dt);
      }
    },
  },
  {
    type: 'FETE',
    label: '🎊 Grande Fête',
    color: '#fdcb6e',
    duration: 15000,
    description: 'Euphorie collective - tout le monde converge au centre',
    apply(entities, dt, W, H) {
      const cx = W / 2, cy = H / 2;
      for (const e of entities) {
        const dx = cx - e.x, dy = cy - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const pull = e.character.socialite * 0.04;
        e.vx += (dx / dist) * pull;
        e.vy += (dy / dist) * pull;
        e.mood = Math.min(1, e.mood + 0.0015 * dt);
        e.energy = Math.min(100, e.energy + 0.02 * dt);
      }
    },
  },
  {
    type: 'TENSION',
    label: '⚡ Vague de Tension',
    color: '#d63031',
    duration: 10000,
    description: 'Agressivité amplifiée - les conflits s\'embrasent',
    apply(entities, dt) {
      for (const e of entities) {
        if (e.character.agression > 0.4) {
          e.vx += (Math.random() - 0.5) * 0.4;
          e.vy += (Math.random() - 0.5) * 0.4;
          e.mood = Math.max(-1, e.mood - 0.001 * dt);
        }
      }
    },
  },
  {
    type: 'DEPRIME',
    label: '😶 Vague Dépressive',
    color: '#74b9ff',
    duration: 14000,
    description: 'Apathie générale - tout le monde ralentit et se retire',
    apply(entities, dt) {
      for (const e of entities) {
        e.vx *= 0.97;
        e.vy *= 0.97;
        e.mood = Math.max(-1, e.mood - 0.0008 * dt);
        e.energy = Math.max(0, e.energy - 0.015 * dt);
      }
    },
  },
  {
    type: 'EPIDEMIE',
    label: '🦠 Épidémie d\'Humeur',
    color: '#55efc4',
    duration: 20000,
    description: 'Patient zéro - la déprime se propage par contact entre entités',
    _initialized: false,
    _patientZero: null,
    apply(entities, dt) {
      // Initialisation : choisir un patient zéro aléatoire et le contaminer
      if (!this._initialized) {
        this._initialized = true;
        this._patientZero = entities[Math.floor(Math.random() * entities.length)];
        this._patientZero.mood = -0.8;
      }
      // Propagation : les entités très proches s'infectent mutuellement (tirant vers la plus basse humeur)
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const a = entities[i], b = entities[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < 100) {
            const spreadRate = 0.00025 * dt * (1 - dist / 100);
            if (a.mood < b.mood) {
              b.mood = Math.max(-1, b.mood - spreadRate * Math.abs(a.mood - b.mood));
            } else {
              a.mood = Math.max(-1, a.mood - spreadRate * Math.abs(b.mood - a.mood));
            }
          }
        }
      }
    },
    // Réinitialiser entre les déclenchements
    reset() { this._initialized = false; this._patientZero = null; },
  },
  {
    type: 'EUPHORIE',
    label: '🌈 Euphorie Contagieuse',
    color: '#ffd700',
    duration: 18000,
    description: 'Un sourire se propage — l\'euphorie gagne tout le monde',
    _initialized: false,
    _sourceEntity: null,
    apply(entities, dt) {
      if (!this._initialized) {
        this._initialized = true;
        // Source : entité la plus heureuse (ou aléatoire si toutes négatives)
        this._sourceEntity = entities.reduce((best, e) =>
          e.mood > best.mood ? e : best, entities[0]);
        this._sourceEntity.mood = 1.0;
      }
      // Propagation : tire vers la humeur la plus haute dans le rayon
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const a = entities[i], b = entities[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < 100) {
            const spreadRate = 0.0003 * dt * (1 - dist / 100);
            if (a.mood > b.mood) {
              b.mood = Math.min(1, b.mood + spreadRate * Math.abs(a.mood - b.mood));
            } else {
              a.mood = Math.min(1, a.mood + spreadRate * Math.abs(b.mood - a.mood));
            }
          }
        }
      }
    },
    reset() { this._initialized = false; this._sourceEntity = null; },
  },
];

// ─── Heatmap ──────────────────────────────────────────────────────────────────
const HEATMAP_CELL = 20; // taille d'une cellule en px

class Heatmap {
  constructor() {
    this.cols = 0;
    this.rows = 0;
    this.data = null;
    this._offscreenCanvas = null;
    this._offscreenCtx    = null;
    this._dirty           = true;
    this._decayTimer      = 0;
    this.DECAY_INTERVAL   = 5000; // ms entre chaque décrément global
    this.DECAY_AMOUNT     = 0.5;
  }

  resize(W, H) {
    this.cols = Math.ceil(W / HEATMAP_CELL);
    this.rows = Math.ceil(H / HEATMAP_CELL);
    this.data = new Float32Array(this.cols * this.rows);
    this._offscreenCanvas = new OffscreenCanvas(W, H);
    this._offscreenCtx    = this._offscreenCanvas.getContext('2d');
    this._dirty = true;
    this._buildLUT();
  }

  // LUT précalculée : 256 entrées [r, g, b, a] → ~3× plus rapide sur dirty frames
  _buildLUT() {
    this._lut = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      let r, g, b;
      if (v < 0.25) {
        const t = v / 0.25;
        r = 0; g = Math.round(t * 128); b = 200;
      } else if (v < 0.5) {
        const t = (v - 0.25) / 0.25;
        r = 0; g = Math.round(128 + t * 127); b = Math.round(200 * (1 - t));
      } else if (v < 0.75) {
        const t = (v - 0.5) / 0.25;
        r = Math.round(t * 255); g = 255; b = 0;
      } else {
        const t = (v - 0.75) / 0.25;
        r = 255; g = Math.round(255 * (1 - t)); b = 0;
      }
      this._lut[i * 4]     = r;
      this._lut[i * 4 + 1] = g;
      this._lut[i * 4 + 2] = b;
      this._lut[i * 4 + 3] = Math.round(v * 200);
    }
  }

  record(x, y) {
    const col = Math.floor(x / HEATMAP_CELL);
    const row = Math.floor(y / HEATMAP_CELL);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    const idx = row * this.cols + col;
    this.data[idx] = Math.min(255, this.data[idx] + 0.12);
    this._dirty = true;
  }

  decay(dt) {
    this._decayTimer += dt;
    if (this._decayTimer < this.DECAY_INTERVAL) return;
    this._decayTimer = 0;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] > 0) {
        this.data[i] = Math.max(0, this.data[i] - this.DECAY_AMOUNT);
        this._dirty = true;
      }
    }
  }

  // Rendu via ImageData pour performance maximale (1 drawImage au lieu de N fillRect)
  render(ctx, W, H, alpha = 0.55) {
    if (!this.data) return;
    if (!this._offscreenCanvas) return;

    // Ne redessiner l'offscreen que si les données ont changé
    if (this._dirty) {
      this._dirty = false;
      const offCtx = this._offscreenCtx;
      const oc = this._offscreenCanvas;

      // Trouver le max pour normalisation
      let maxVal = 1;
      for (let i = 0; i < this.data.length; i++) {
        if (this.data[i] > maxVal) maxVal = this.data[i];
      }
      const invMax = 1 / maxVal;

      // Utiliser ImageData pour un seul transfert GPU
      const imgData = offCtx.createImageData(oc.width, oc.height);
      const pixels = imgData.data;

      for (let row = 0; row < this.rows; row++) {
        for (let col = 0; col < this.cols; col++) {
          const v = this.data[row * this.cols + col] * invMax;
          if (v < 0.01) continue;

          // LUT précalculée pour éviter les branches if/else par cellule
          const lutIdx = Math.round(v * 255) * 4;
          const r = this._lut[lutIdx];
          const g = this._lut[lutIdx + 1];
          const b = this._lut[lutIdx + 2];
          const a255 = this._lut[lutIdx + 3];
          // Remplir le rectangle de la cellule dans ImageData
          const x0 = col * HEATMAP_CELL;
          const y0 = row * HEATMAP_CELL;
          const x1 = Math.min(x0 + HEATMAP_CELL, oc.width);
          const y1 = Math.min(y0 + HEATMAP_CELL, oc.height);
          for (let py = y0; py < y1; py++) {
            for (let px = x0; px < x1; px++) {
              const idx = (py * oc.width + px) * 4;
              pixels[idx]     = r;
              pixels[idx + 1] = g;
              pixels[idx + 2] = b;
              pixels[idx + 3] = a255;
            }
          }
        }
      }
      offCtx.putImageData(imgData, 0, 0);
    }

    // Un seul drawImage vers le canvas principal
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(this._offscreenCanvas, 0, 0);
    ctx.restore();
  }

  reset() {
    if (this.data) this.data.fill(0);
    this._dirty = true;
  }

  // Sérialisation compacte
  toSnapshot() {
    return { cols: this.cols, rows: this.rows, data: Array.from(this.data) };
  }

  fromSnapshot(snap, W, H) {
    if (!snap) return;
    this.resize(W, H);
    const len = Math.min(snap.data.length, this.data.length);
    for (let i = 0; i < len; i++) this.data[i] = snap.data[i];
  }
}

// ─── Persistance (localStorage) ───────────────────────────────────────────────
const SAVE_KEY = 'haize_save_v1';

// ─── Simulation ───────────────────────────────────────────────────────────────
export class Simulation {
  constructor(canvas, infoPanel) {
    this.canvas     = canvas;
    this.ctx        = canvas.getContext('2d');
    this.infoPanel  = infoPanel;

    this.paused        = false;
    this.speedFactor   = 1.0;
    this.dayDuration   = 30000;
    this.nightRatio    = 0.35;
    this.isNight       = false;
    this.cycleStart    = performance.now();

    this.mouseX        = -9999;
    this.mouseY        = -9999;
    this.CURSOR_RADIUS = 120;

    this.entities = ENTITY_DEFS.map(def =>
      new Entity(def, canvas.width, canvas.height));

    this.projects        = [];
    this._nextProjectIn  = 8000 + Math.random() * 7000;
    this._projectTimer   = 0;
    this.PROJECT_MAX     = 3;

    // ── Entité sélectionnée (click-to-inspect)
    this.selectedEntity  = null;

    // ── Historique d'événements flottant
    this.eventLog        = [];
    this.EVENT_LOG_MAX   = 60;

    // ── FPS tracking
    this.fps             = 0;
    this._fpsFrames      = 0;
    this._fpsAccum       = 0;

    // ── Throttles micro-events (éviter spam)
    this._lastConflictLog  = {};   // key: "A-B" → timestamp
    this._lastSocialLog    = {};   // key: "A-B" → timestamp
    this._lastFuiteLog     = {};   // key: entityId → timestamp
    this._lastSatLog       = {};   // key: entityId → timestamp
    this._lastMoodLog      = {};   // key: entityId → timestamp

    // ── Événement global actif
    this.activeEvent     = null;
    this._eventTimer     = 0;
    this._nextEventIn    = 20000 + Math.random() * 20000;
    this._eventBannerOpacity = 0;

    // ── Heatmap
    this.heatmap         = new Heatmap();
    this.showHeatmap     = false;
    this._heatmapOpacity = 0; // pour fondu entrée/sortie
    this.heatmap.resize(canvas.width, canvas.height);

    // ── Notification temporaire (save/load feedback)
    this._notification   = null; // { text, color, expiresAt }

    // ── Floating emojis (bulles d'état flottantes)
    this._floatingEmojis = []; // { x, y, vx, vy, text, born, life, size }

    // ── Pensées ambiantes (bulles lentes et grandes au-dessus des entités)
    this._thoughtBubbles = []; // { entityId, x, y, text, born, life }
    this._thoughtTimers  = {}; // entityId → timer avant prochaine pensée

    // ── Compteur de jours
    this.dayCount = 1;

    // ── Mood history sampling
    this._moodSampleTimer = 0;
    this.MOOD_SAMPLE_INTERVAL = 500; // ms (game time)
    this.MOOD_HISTORY_MAX = 80;

    // ── Friendship threshold (score minimum pour afficher un lien d'amitié)
    this.FRIENDSHIP_THRESHOLD = 8;

    // ── Cache liens d'amitié (rebuild 5×/s dans _update, lu dans _renderFriendshipLinks)
    this._activeFriendLinks = []; // [{ a, b, score, strength }]
    this._friendLinkTimer   = 0;
    // ── Cache liens de rancœur (rebuild simultané avec friendLinks, lu dans _renderRancorLinks)
    this._activeRancorLinks = []; // [{ a, b, count, dist }]

    // ── Timers perturbation CONCENTRÉ (Map pour éviter de polluer this)
    this._concentrePerturbTimers = new Map();

    this._lastTime   = performance.now();
    this._rafId      = null;

    this.INTERACTION_RADIUS   = 180;
    this.CONFLICT_RADIUS      = 60;
    this.FRICTION             = 0.90;
    this.MAX_SPEED            = 7.0;
    this.NOISE_SCALE          = 0.0025;
    this.NOISE_SPEED          = 0.0008;
    this._noiseTime           = 0;

    // Compteur de voisins (rempli chaque frame dans _update)
    this._neighborCount = {};

    // ── Étoiles procédurales (nuit enrichie)
    this._stars = Array.from({ length: 80 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.5 + Math.random() * 1.2,
      a: 0.3 + Math.random() * 0.5
    }));

    // 🎯 Recrutement PROJET : timers throttle par paire entité-recruté
    this._recruitTimers = {};

    // 🎭 Micro-événements spontanés : timer de déclenchement (vérification toutes les 2s)
    this._spontaneousTimer = 0;
    this.SPONTANEOUS_INTERVAL = 2000; // ms temps réel

    // ❄️ Mémoire de rancune : compteur de conflits par paire
    this._conflictCount = {};
    // 🚀 Cache hash panel info (évite DOM rebuild inutile)
    this._panelStateHash = null;
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.heatmap.resize(this.canvas.width, this.canvas.height);
  }

  reset() {
    this.entities = ENTITY_DEFS.map(def =>
      new Entity(def, this.canvas.width, this.canvas.height));
    this.projects        = [];
    this._projectTimer   = 0;
    this._nextProjectIn  = 8000 + Math.random() * 7000;
    this.cycleStart      = performance.now();
    this.isNight         = false;
    this.activeEvent     = null;
    this._eventTimer     = 0;
    this._nextEventIn    = 20000 + Math.random() * 20000;
    this.selectedEntity  = null;
    this.eventLog        = [];
    this.heatmap.reset();
    this._notification   = null;
    this._floatingEmojis = [];
    this._thoughtBubbles = [];
    this._thoughtTimers  = {};
    this.dayCount        = 1;
    this._moodSampleTimer = 0;
    this._lastConflictLog = {};
    this._lastSocialLog   = {};
    this._lastFuiteLog    = {};
    this._lastSatLog      = {};
    this._lastMoodLog     = {};
    // Fix : timers orphelins réinitialisés au reset
    this._friendLinkTimer    = 0;
    this._heatmapRecordTimer = 0;
    this._forgetTimer        = 0;
    this._activeFriendLinks  = [];
    this._activeRancorLinks  = [];
    this._activeRecruitLinks = [];
    this._concentrePerturbTimers = new Map();
    this._recruitTimers      = {};
    this._conflictCount      = {};
    this._panelStateHash     = null;
  }

  // ── Clic sur le canvas ─────────────────────────────────────────────────────
  handleClick(clientX, clientY) {
    const CLICK_RADIUS = 30;
    let hit = null;
    let minDist = Infinity;
    for (const e of this.entities) {
      const dx = e.x - clientX, dy = e.y - clientY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < CLICK_RADIUS && d < minDist) {
        minDist = d;
        hit = e;
      }
    }
    this.selectedEntity = (hit === this.selectedEntity) ? null : hit;
  }

  // ── Toggle heatmap ─────────────────────────────────────────────────────────
  toggleHeatmap() {
    this.showHeatmap = !this.showHeatmap;
  }

  // ── Déclencher un événement global manuellement ────────────────────────────
  triggerEvent(type) {
    const ev = GLOBAL_EVENTS.find(e => e.type === type);
    if (!ev) return;
    // Réinitialiser l'état interne de l'événement si disponible (ex : épidémie)
    if (typeof ev.reset === 'function') ev.reset();
    // Interrompre l'événement actuel si besoin
    this.activeEvent  = ev;
    this._eventTimer  = 0;
    this._nextEventIn = 25000 + Math.random() * 25000;
    this.pushEvent(`🌐 ${ev.label}`, ev.color || '#fff', 'global');
  }

  // ── Méthode publique : ajouter une entrée dans la console ─────────────────
  pushEvent(text, color = '#aaa', category = 'info') {
    const entry = { text, color, category, timestamp: performance.now() };
    this.eventLog.unshift(entry);
    if (this.eventLog.length > this.EVENT_LOG_MAX) {
      this.eventLog.length = this.EVENT_LOG_MAX;
    }
    // Marquer la console comme dirty pour le timer intégré
    this._consoleDirty = true;
  }

  // ── Sauvegarde ─────────────────────────────────────────────────────────────
  save() {
    try {
      const snapshot = {
        version: 1,
        savedAt: Date.now(),
        cycleElapsed: (performance.now() - this.cycleStart) % this.dayDuration,
        isNight: this.isNight,
        entities: this.entities.map(e => e.toSnapshot()),
        heatmap: this.heatmap.toSnapshot(),
        successCounts: Object.fromEntries(
          this.entities.map(e => [e.id, e.successCount])
        ),
        conflictCount: { ...this._conflictCount },  // persister les rancunes
        // B3 : persister les timers d'état euphorique/concentre
        euphoriqueDurations: Object.fromEntries(
          this.entities.map(e => [e.id, {
            dur: e._euphoriqueDuration || 0,
            cap: e._euphoriqueCap     || 20000,
          }])
        ),
        concentreDurations: Object.fromEntries(
          this.entities.map(e => [e.id, {
            dur: e._concentreDuration    || 0,
            min: e._concentreMinDuration || 4000,
          }])
        ),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
      this._showNotification('💾 Sauvegarde OK', '#2ecc71');
    } catch (err) {
      this._showNotification('❌ Erreur save', '#e74c3c');
      console.error('[HAIZE] save error', err);
    }
  }

  // ── Chargement ─────────────────────────────────────────────────────────────
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        this._showNotification('⚠️ Aucune sauvegarde', '#f39c12');
        return;
      }
      const snap = JSON.parse(raw);
      if (snap.version !== 1) {
        this._showNotification('⚠️ Format incompatible', '#f39c12');
        return;
      }

      // Restaurer les entités
      for (const e of this.entities) {
        const eSnap = snap.entities?.find(s => s.id === e.id);
        e.fromSnapshot(eSnap);
      }

      // Restaurer la heatmap
      this.heatmap.fromSnapshot(snap.heatmap, this.canvas.width, this.canvas.height);

      // Cycle
      if (snap.isNight !== undefined) this.isNight = snap.isNight;
      this.cycleStart = performance.now() - (snap.cycleElapsed ?? 0);

      // B1 : restaurer les rancunes
      if (snap.conflictCount) this._conflictCount = { ...snap.conflictCount };

      // B3 : restaurer les durées euphorique/concentre
      if (snap.euphoriqueDurations) {
        for (const e of this.entities) {
          const d = snap.euphoriqueDurations[e.id];
          if (d) { e._euphoriqueDuration = d.dur; e._euphoriqueCap = d.cap; }
        }
      }
      if (snap.concentreDurations) {
        for (const e of this.entities) {
          const d = snap.concentreDurations[e.id];
          if (d) { e._concentreDuration = d.dur; e._concentreMinDuration = d.min; }
        }
      }

      const d = new Date(snap.savedAt);
      const label = `${d.getHours()}h${String(d.getMinutes()).padStart(2,'0')}`;
      this._showNotification(`📂 Chargé (${label})`, '#3498db');
    } catch (err) {
      this._showNotification('❌ Erreur load', '#e74c3c');
      console.error('[HAIZE] load error', err);
    }
  }

  _showNotification(text, color) {
    this._notification = { text, color, expiresAt: performance.now() + 3000 };
  }

  // ── Boucle principale ──────────────────────────────────────────────────────
  start() {
    // Throttle render : si le budget frame est dépassé, on skip le rendu 1 frame sur 2
    this._renderSkipCounter = 0;

    const loop = (now) => {
      const rawDt = Math.min(now - this._lastTime, 50);
      this._lastTime = now;

      // FPS tracking
      this._fpsFrames++;
      this._fpsAccum += rawDt;
      if (this._fpsAccum >= 500) {
        this.fps = Math.round(this._fpsFrames / (this._fpsAccum / 1000));
        this._fpsFrames = 0;
        this._fpsAccum  = 0;
      }

      if (!this.paused) {
        const dt = rawDt * this.speedFactor;
        this._updateCycle(now);
        this._updateGlobalEvents(dt);

        const t0 = performance.now();
        this._update(dt);
        this.perfUpdate = performance.now() - t0;

        // Adaptive render skip : si update > 8ms, skip render 1 frame sur 2
        this._renderSkipCounter++;
        const skipRender = this.perfUpdate > 8 && (this._renderSkipCounter % 2 === 0);

        if (!skipRender) {
          const t1 = performance.now();
          this._render();
          this.perfRender = performance.now() - t1;
        }

        // Throttle panel DOM update à 200ms (perf)
        this._panelTimer = (this._panelTimer || 0) + rawDt;
        if (this._panelTimer >= 200) {
          this._panelTimer = 0;
          this._updatePanel();
        }

        // Console dirty - notifier index.html toutes les 100ms si changement
        this._consoleTimer = (this._consoleTimer || 0) + rawDt;
        if (this._consoleTimer >= 100 && this._consoleDirty) {
          this._consoleTimer = 0;
          this._consoleDirty = false;
          if (this.onConsoleDirty) this.onConsoleDirty();
        }
      }
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  // ── Cycle jour/nuit ────────────────────────────────────────────────────────
  _updateCycle(now) {
    const elapsed  = (now - this.cycleStart) % this.dayDuration;
    const dayLen   = this.dayDuration * (1 - this.nightRatio);
    const wasNight = this.isNight;
    this.isNight   = elapsed >= dayLen;
    // Log transition jour ↔ nuit
    if (wasNight !== this.isNight) {
      if (this.isNight) {
        this.pushEvent('🌙 La nuit tombe - les entités ralentissent', '#6c88c4', 'cycle');
        // Decay rancune : oubli naturel au passage jour->nuit
        for (const key in this._conflictCount) {
          this._conflictCount[key] = Math.floor(this._conflictCount[key] / 2);
          if (this._conflictCount[key] <= 0) delete this._conflictCount[key];
        }
      } else {
        this.dayCount++;
        this.pushEvent(`☀️ Jour ${this.dayCount} - simulation active`, '#f9ca24', 'cycle');
      }
    }
  }

  // ── Événements globaux ─────────────────────────────────────────────────────
  _updateGlobalEvents(dt) {
    if (this.activeEvent) {
      this._eventTimer += dt;
      const t = this._eventTimer / this.activeEvent.duration;
      if (t < 0.08) {
        this._eventBannerOpacity = t / 0.08;
      } else if (t > 0.85) {
        this._eventBannerOpacity = Math.max(0, (1 - t) / 0.15);
      } else {
        this._eventBannerOpacity = 1;
      }

      this.activeEvent.apply(this.entities, dt, this.canvas.width, this.canvas.height);

      if (this._eventTimer >= this.activeEvent.duration) {
        this.activeEvent    = null;
        this._eventTimer    = 0;
        this._nextEventIn   = 25000 + Math.random() * 25000;
        this._eventBannerOpacity = 0;
      }
    } else {
      this._eventTimer += dt;
      if (this._eventTimer >= this._nextEventIn) {
        const nextEv = GLOBAL_EVENTS[Math.floor(Math.random() * GLOBAL_EVENTS.length)];
        if (typeof nextEv.reset === 'function') nextEv.reset();
        this.activeEvent  = nextEv;
        this._eventTimer  = 0;
        // Logguer l'événement automatique (comme le déclenchement manuel)
        this.pushEvent(`🌐 ${nextEv.label}`, nextEv.color || '#fff', 'global');
      }
    }
  }

  // ── Mise à jour physique ───────────────────────────────────────────────────
  _update(dt) {
    const entities = this.entities;
    const W = this.canvas.width, H = this.canvas.height;

    this._noiseTime += dt * this.NOISE_SPEED;

    this._updateProjects(dt);

    // 🎭 Micro-événements spontanés (vérification toutes les 2s)
    this._spontaneousTimer += dt;
    if (this._spontaneousTimer >= this.SPONTANEOUS_INTERVAL) {
      this._spontaneousTimer = 0;
      this._spontaneousEventCheck(entities);
    }

    this.heatmap.decay(dt);

    // Réinitialiser compteurs voisins (passe O(n2) avec distSq - pas de sqrt)
    this._neighborCount = {};
    for (let k = 0; k < entities.length; k++) this._neighborCount[entities[k].id] = 0;
    const neighborThreshSq = (this.INTERACTION_RADIUS * 0.6) * (this.INTERACTION_RADIUS * 0.6);
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i], b = entities[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy < neighborThreshSq) {
          this._neighborCount[a.id]++;
          this._neighborCount[b.id]++;
        }
      }
    }

    for (const e of entities) {
      // ── Fatigue sociale ──────────────────────────────────────────────────
      const neighbors = this._neighborCount[e.id] || 0;
      const introFactor = 1 - e.character.socialite; // 0=extraverti, 1=introverti
      const chargeGain = neighbors * 0.004 * dt * (0.3 + introFactor * 0.7);
      const chargeLoss = (neighbors === 0 ? 0.012 : 0.001) * dt;
      e.socialCharge = Math.max(0, Math.min(100,
        e.socialCharge + chargeGain - chargeLoss
      ));

      // Récupération nocturne : les introvertis en solitude récupèrent plus vite la nuit
      if (this.isNight && neighbors === 0) {
        const introFactor = 1 - e.character.socialite;
        e.socialCharge = Math.max(0,
          e.socialCharge - 0.025 * dt * (0.3 + introFactor * 0.7)
        );
      }

      // Bruit de Perlin
      const nx = PERLIN.noise(
        e._noiseOffsetX + e.x * this.NOISE_SCALE,
        this._noiseTime
      );
      const ny = PERLIN.noise(
        e._noiseOffsetY + e.y * this.NOISE_SCALE,
        this._noiseTime + 100
      );
      const noiseForce = 0.08 * (0.4 + e.character.curiosite * 0.6);

      e.vx += nx * noiseForce;
      e.vy += ny * noiseForce;

      // Fuite du curseur — les entités en PROJET sont protégées (ne bougent pas)
      const cdx  = e.x - this.mouseX;
      const cdy  = e.y - this.mouseY;
      const cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
      if (cdist < this.CURSOR_RADIUS && e.state !== STATE.PROJET) {
        const flee = (1 - cdist / this.CURSOR_RADIUS) * 0.35;
        e.vx += (cdx / cdist) * flee;
        e.vy += (cdy / cdist) * flee;
        e.mood = Math.max(-1, e.mood - 0.001 * dt);
        if (e.state !== STATE.SATURE) {
          e.state = STATE.FUITE;
          e._stateTimer = 0;
        }
        // Log fuite curseur (throttlé par entité)
        const nowF = performance.now();
        if (!this._lastFuiteLog[e.id] || nowF - this._lastFuiteLog[e.id] > 3000) {
          this._lastFuiteLog[e.id] = nowF;
          this.pushEvent(`👻 ${e.id} fuit le curseur`, e.color, 'flee');
        }
      }

      // ── Territorialité : attraction vers le home en ERRANCE/REPOS ─────────
      if (e.state === STATE.ERRANCE || e.state === STATE.REPOS) {
        const hdx = e.homeX - e.x;
        const hdy = e.homeY - e.y;
        const hdist = Math.sqrt(hdx * hdx + hdy * hdy) || 1;
        // Attraction douce proportionnelle à la distance
        const introFactor2 = 1 - e.character.extraversion; // introvertis plus attachés
        const homePull = (0.005 + introFactor2 * 0.01) * Math.min(1, hdist / 200);
        e.vx += (hdx / hdist) * homePull * dt * 0.1;
        e.vy += (hdy / hdist) * homePull * dt * 0.1;
      }

      // ── Dérive lente du home (territoire se déplace très lentement) ───────
      e._homeWanderTimer = (e._homeWanderTimer || 0) + dt;
      if (e._homeWanderTimer > 15000 && e.state !== STATE.FUITE && e.state !== STATE.SATURE) {
        e._homeWanderTimer = 0;
        const wander = 30 * e.character.extraversion;
        e.homeX = Math.max(80, Math.min(this.canvas.width - 80,
          e.homeX + (Math.random() - 0.5) * wander));
        e.homeY = Math.max(80, Math.min(this.canvas.height - 80,
          e.homeY + (Math.random() - 0.5) * wander));
      }

      // ── Fuite sociale (entité saturée) ────────────────────────────────
      if (e.state === STATE.SATURE) {
        // Fuir vers le bord ou les zones peu peuplées
        // Force centrifuge depuis la zone dense
        let fx = 0, fy = 0;
        for (const other of entities) {
          if (other === e) continue;
          const dx = e.x - other.x, dy = e.y - other.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d < this.INTERACTION_RADIUS) {
            const push = (1 - d / this.INTERACTION_RADIUS) * 0.08;
            fx += (dx / d) * push;
            fy += (dy / d) * push;
          }
        }
        e.vx += fx;
        e.vy += fy;
      }

      // Attraction vers les projets
      for (const proj of this.projects) {
        if (proj.resolved || proj.isExpired) continue;
        // Les entités saturées ignorent les projets sociaux
        if (e.state === STATE.SATURE && proj.affinity === 'socialite') continue;

        const pdx  = proj.x - e.x;
        const pdy  = proj.y - e.y;
        const pdist = Math.sqrt(pdx * pdx + pdy * pdy) || 1;

        if (pdist < proj.radius * 2.5) {
          const charAffinity = e.character[proj.affinity] || 0.5;
          const pull = charAffinity * 0.03 * (1 - pdist / (proj.radius * 2.5));
          e.vx += (pdx / pdist) * pull * dt * 0.1;
          e.vy += (pdy / pdist) * pull * dt * 0.1;

          if (pdist < proj.radius) {
            proj.participants.add(e.id);
            e.state = STATE.PROJET;
            e._stateTimer = 0;
            // Bonus expérience : vétérans contribuent plus sur leur type de projet (max +50%)
            const expCount = (e._projectHistory || {})[proj.type] || 0;
            const experienceBonus = 1 + Math.min(0.5, expCount * 0.1);
            const contrib = charAffinity * (e.energy / 100) * 0.012 * dt * experienceBonus;
            proj.progress += contrib;
          }
        }
      }

      // 🎯 Recrutement PROJET : attraction implicite des entités affinitaires
      for (const recruiter of entities) {
        if (recruiter.state !== STATE.PROJET) continue;
        // B3 fix : éviter la mutation d'objet Project dans le reduce
        const proj = (() => {
          let closest = null, closestDist = Infinity;
          for (const p of this.projects) {
            if (p.resolved || p.isExpired) continue;
            const d = Math.hypot(p.x - recruiter.x, p.y - recruiter.y);
            if (d < p.radius && d < closestDist) { closest = p; closestDist = d; }
          }
          return closest;
        })();
        if (!proj) continue;
        let recruitCount = 0;
        const nowR = performance.now();
        for (const other of entities) {
          if (other === recruiter) continue;
          if (other.state === STATE.SATURE || other.state === STATE.FUITE || other.state === STATE.PROJET) continue;
          if (recruitCount >= 4) break;
          const aff = recruiter.getAffinityWith(other.id);
          if (aff < 0.5) continue;
          const rdx = proj.x - other.x, rdy = proj.y - other.y;
          const rdist = Math.hypot(rdx, rdy) || 1;
          if (rdist > proj.radius * 4) continue;
          const pull = aff * 0.018 * (1 - rdist / (proj.radius * 4));
          other.vx += (rdx / rdist) * pull;
          other.vy += (rdy / rdist) * pull;
          recruitCount++;
          // Signal 📡 throttlé 5s par paire recruiter-other
          const rKey = `recruit-${recruiter.id}-${other.id}`;
          if (!this._recruitTimers[rKey] || nowR - this._recruitTimers[rKey] > 5000) {
            this._recruitTimers[rKey] = nowR;
            this._spawnFloatingEmoji((recruiter.x + other.x) / 2, (recruiter.y + other.y) / 2 - 10, '📡');
          }
        }
      }

      // Interactions avec les autres entités + mémorisation
      const _interactRadSq = this.INTERACTION_RADIUS * this.INTERACTION_RADIUS;
      for (const other of entities) {
        if (other === e) continue;
        const dx = other.x - e.x;
        const dy = other.y - e.y;
        const distSq = dx * dx + dy * dy;

        if (distSq >= _interactRadSq) continue;

        const dist = Math.sqrt(distSq);
        const nx2 = dx / dist, ny2 = dy / dist;
        const t = 1 - dist / this.INTERACTION_RADIUS;

        // Conflit agressif (dans CONFLICT_RADIUS)
        if (distSq < this.CONFLICT_RADIUS * this.CONFLICT_RADIUS &&
            e.character.agression > 0.55 &&
            other.character.agression > 0.55) {
          const f = 0.25 * (1 - dist / this.CONFLICT_RADIUS);
          e.vx -= nx2 * f;
          e.vy -= ny2 * f;
          e.mood = Math.max(-1, e.mood - 0.002 * dt);
          if (e.state !== STATE.FUITE && e.state !== STATE.SATURE) {
            e.state = STATE.FUITE;
            e._stateTimer = 0; // reset pour laisser la fuite s'exprimer
          }
          // Spawn emoji conflit (throttlé : aléatoire pour ne pas spammer)
          if (Math.random() < 0.0003 * dt) {
            this._spawnFloatingEmoji(
              (e.x + other.x) / 2,
              (e.y + other.y) / 2,
              Math.random() < 0.5 ? '💢' : '⚡'
            );
            // Log conflit
            const ck = [e.id, other.id].sort().join('-');
            const now2 = performance.now();
            if (!this._lastConflictLog[ck] || now2 - this._lastConflictLog[ck] > 4000) {
              this._lastConflictLog[ck] = now2;
              this.pushEvent(`💢 ${e.id} ↔ ${other.id} conflit`, '#e74c3c', 'conflict');
              // ❄️ Rancune : incrémenter compteur de conflits répétés
              this._conflictCount[ck] = (this._conflictCount[ck] || 0) + 1;
            }
          }
        }

        {
          // ── Perturbation CONCENTRÉ : repousse les intrus proches ─────────
          if (other.state === STATE.CONCENTRE && dist < 75 && e.state !== STATE.PROJET) {
            const perturbKey = [e.id, other.id].sort().join('-');
            const nowP = performance.now();
            const lastPerturb = this._concentrePerturbTimers.get(perturbKey) || 0;
            // Répulsion légère sur e (l'entité qui dérange other)
            const pushFactor = (1 - dist / 75) * 0.05;
            e.vx -= nx2 * pushFactor;
            e.vy -= ny2 * pushFactor;
            // Bulle 🤫 throttlée à 5s par paire
            if (nowP - lastPerturb > 5000) {
              this._concentrePerturbTimers.set(perturbKey, nowP);
              this._thoughtBubbles.push({
                entityId: other.id,
                x: other.x, y: other.y, radius: other.radius,
                text: '🤫',
                born: nowP, life: 2200,
              });
            }
          }

          // Malus rancune : entités en conflit répété s'attirent moins
          const ck960 = [e.id, other.id].sort().join('-');
          const rancorCount = this._conflictCount[ck960] || 0;
          const rancorPenalty = Math.min(0.3, rancorCount * 0.04);
          const affinity = e.getAffinityWith(other.id, rancorPenalty);
          const socialForce = (e.character.socialite + other.character.socialite) / 2;
          const attractBase = socialForce - 0.3;

          // Les saturés repoussent les autres (réduction de l'attraction)
          const saturationPenalty = e.state === STATE.SATURE ? -0.5 : 0;
          // CONCENTRE : isolation sociale partielle (moins d'attraction vers autrui)
          const concentrePenalty = e.state === STATE.CONCENTRE ? -0.8 : 0;
          const force = (attractBase + affinity * 0.5 + saturationPenalty + concentrePenalty) * t * 0.015;

          e.vx += nx2 * force;
          e.vy += ny2 * force;

          // ── Répulsion douce anti-chevauchement ──────────────────────────
          // Zone : dist < 2 × rayon → les entités se frôlent mais ne se superposent pas au repos
          const minDist = (e.radius + other.radius) * 2.2;
          if (dist < minDist) {
            const overlap = 1 - dist / minDist;
            // Force quadratique : faible au frôlement, forte au chevauchement
            const repulse = overlap * overlap * 0.6;
            e.vx -= nx2 * repulse;
            e.vy -= ny2 * repulse;
          }

          if (dist < this.INTERACTION_RADIUS * 0.5) {
            // CONCENTRE : réceptivité réduite à la contagion d'humeur
            const moodReceptivity = e.state === STATE.CONCENTRE ? 0.1 : 1.0;
            const moodDelta = other.mood * 0.0003 * dt * moodReceptivity;
            e.mood = Math.max(-1, Math.min(1, e.mood + moodDelta));
            if (e.character.socialite > 0.6 && e.state !== STATE.SATURE) {
              e.energy = Math.min(100, e.energy + 0.003 * dt);
            }
            const prevScore = e.interactionLog[other.id] || 0;
            e.interactionLog[other.id] = prevScore + dt * 0.001;

            // Log interaction sociale (throttlé, seuil affinité)
            if (affinity > 0.3 && Math.random() < 0.00015 * dt) {
              const sk = [e.id, other.id].sort().join('-');
              const now3 = performance.now();
              if (!this._lastSocialLog[sk] || now3 - this._lastSocialLog[sk] > 6000) {
                this._lastSocialLog[sk] = now3;
                const tag = affinity > 0.6 ? '💛 affinité' : '🤝 contact';
                this.pushEvent(`${tag} ${e.id} ↔ ${other.id}`, e.color, 'social');
              }
            }
          }
        }
      }

      // Nuit : ralentissement
      const nightMult = this.isNight ? 0.3 : 1.0;
      // Modificateur vitesse selon état
      const stateSpeedMult = e.state === STATE.EUPHORIQUE ? 1.2
                           : e.state === STATE.CONCENTRE  ? 0.5
                           : 1.0;

      e.vx *= this.FRICTION;
      e.vy *= this.FRICTION;
      const speed = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
      const maxSpd = this.MAX_SPEED * nightMult * stateSpeedMult *
                     (0.4 + e.character.extraversion * 0.6);
      if (speed > maxSpd) {
        e.vx = (e.vx / speed) * maxSpd;
        e.vy = (e.vy / speed) * maxSpd;
      }

      e.x += e.vx * dt * 0.1;
      e.y += e.vy * dt * 0.1;

      if (e.x < e.radius) { e.x = e.radius; e.vx = Math.abs(e.vx) * 0.6; }
      if (e.x > W - e.radius) { e.x = W - e.radius; e.vx = -Math.abs(e.vx) * 0.6; }
      if (e.y < e.radius) { e.y = e.radius; e.vy = Math.abs(e.vy) * 0.6; }
      if (e.y > H - e.radius) { e.y = H - e.radius; e.vy = -Math.abs(e.vy) * 0.6; }

      // Énergie
      const energyDrain = speed * 0.002 * dt * (1 - (this.isNight ? 1 : 0) * 0.8);
      e.energy = Math.max(0, e.energy - energyDrain);
      if (this.isNight || speed < 0.3) {
        e.energy = Math.min(100, e.energy + 0.04 * dt);
      }

      // Trail (longueur adaptive selon FPS)
      const adaptiveTrailMax = this.fps > 0 && this.fps < 45
        ? Math.max(4, Math.floor(e.trailMaxLen * this.fps / 60))
        : e.trailMaxLen;
      e.trail.push({ x: e.x, y: e.y });
      if (e.trail.length > adaptiveTrailMax) e.trail.shift();

      // Humeur drift
      e.mood += (Math.random() - 0.5) * 0.0005 * dt;
      e.mood  = Math.max(-1, Math.min(1, e.mood));

      // ── Mémoire des lieux heureux ─────────────────────────────────────
      // Toutes les 3s de jeu, si l'humeur est bonne, mémoriser la position
      e._happyZoneTimer = (e._happyZoneTimer || 0) + dt;
      if (e._happyZoneTimer > 3000 && e.mood > 0.5) {
        e._happyZoneTimer = 0;
        const nearby = e.happyZones.find(z => Math.hypot(z.x - e.x, z.y - e.y) < 80);
        if (nearby) {
          nearby.score = Math.min(10, nearby.score + 0.5);
        } else {
          e.happyZones.push({ x: e.x, y: e.y, score: 1 });
          if (e.happyZones.length > 5) {
            e.happyZones.sort((a, b) => b.score - a.score);
            e.happyZones.length = 5;
          }
        }
      } else if (e._happyZoneTimer > 3000) {
        e._happyZoneTimer = 0; // reset timer même quand pas heureux
      }
      // Biais de déplacement vers la meilleure zone heureuse (en ERRANCE seulement, si déprimé)
      if (e.state === STATE.ERRANCE && e.happyZones.length > 0 && e.mood < 0) {
        const best = e.happyZones.reduce((a, b) => a.score > b.score ? a : b);
        const zdx = best.x - e.x, zdy = best.y - e.y;
        const zdist = Math.hypot(zdx, zdy) || 1;
        const pull = 0.015 * (best.score / 10) * (1 - e.mood); // plus fort si déprimé
        e.vx += (zdx / zdist) * pull;
        e.vy += (zdy / zdist) * pull;
      }

      // ── Mémoire des zones à éviter ────────────────────────────────────────
      // Toutes les 3s, si mood < -0.5, mémoriser les lieux de souffrance (entités pacifiques seulement)
      e._avoidZoneTimer = (e._avoidZoneTimer || 0) + dt;
      if (e._avoidZoneTimer > 3000) {
        e._avoidZoneTimer = 0;
        if (e.mood < -0.5 && e.character.agression < 0.5) {
          const nearby = e.avoidZones.find(z => Math.hypot(z.x - e.x, z.y - e.y) < 80);
          if (nearby) {
            nearby.score = Math.min(10, nearby.score + 0.5);
          } else {
            e.avoidZones.push({ x: e.x, y: e.y, score: 1 });
            if (e.avoidZones.length > 5) {
              e.avoidZones.sort((a, b) => b.score - a.score);
              e.avoidZones.length = 5;
            }
          }
        }
      }
      // Biais de répulsion loin des zones évitées (en ERRANCE seulement)
      if (e.state === STATE.ERRANCE && e.avoidZones.length > 0) {
        for (const zone of e.avoidZones) {
          const zdx = e.x - zone.x, zdy = e.y - zone.y;
          const zdist = Math.hypot(zdx, zdy) || 1;
          if (zdist < 150) {
            const repel = 0.01 * (zone.score / 10) * (1 - zdist / 150);
            e.vx += (zdx / zdist) * repel;
            e.vy += (zdy / zdist) * repel;
          }
        }
      }

      // P3 : timer de charge sociale prolongée (pour introvertis → CONCENTRE contextuel)
      if (e.socialCharge > e.socialSaturationThreshold * 0.7) {
        e._socialLoadTimer = (e._socialLoadTimer || 0) + dt;
      } else {
        e._socialLoadTimer = Math.max(0, (e._socialLoadTimer || 0) - dt * 2);
      }

      // État
      this._updateState(e, dt);

    }

    // ── Rebuild cache liens d'amitié (5×/s, évite O(n2)×O(affinités) à chaque frame) ──
    this._friendLinkTimer += dt;
    if (this._friendLinkTimer >= 200) {
      this._friendLinkTimer = 0;
      this._activeFriendLinks = [];
      const interactRadSqFL = this.INTERACTION_RADIUS * this.INTERACTION_RADIUS;
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const a = entities[i], b = entities[j];
          const scoreA = a.interactionLog[b.id] || 0;
          const scoreB = b.interactionLog[a.id] || 0;
          const score  = (scoreA + scoreB) / 2;
          if (score < this.FRIENDSHIP_THRESHOLD) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const distSq = dx * dx + dy * dy;
          // isClose : amis côte à côte (dist < INTERACTION_RADIUS) — affiche le cœur, pas le lien
          const isClose = distSq < interactRadSqFL;
          if (!isClose) {
            // Exception : amis solides (score ≥ 40) restent liés jusqu'à 1200px
            const maxDistSq = score >= 40 ? 1200 * 1200 : 700 * 700;
            if (distSq > maxDistSq) continue;
          }
          const strength = Math.min(1, (score - this.FRIENDSHIP_THRESHOLD) / 30);
          this._activeFriendLinks.push({ a, b, score, strength, isClose });
        }
      }
      // Rebuild cache rancœur (même cadence que friendLinks — 5×/s)
      this._activeRancorLinks = [];
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const a = entities[i], b = entities[j];
          const ck = [a.id, b.id].sort().join('-');
          const count = this._conflictCount[ck] || 0;
          if (count < 3) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 350) continue;
          this._activeRancorLinks.push({ a, b, count, dist });
        }
      }
      // Cache liens de recrutement PROJET (5x/s, comme friend/rancor)
      this._activeRecruitLinks = [];
      for (const recruiter of entities) {
        if (recruiter.state !== STATE.PROJET) continue;
        for (const other of entities) {
          if (other === recruiter || other.state === STATE.PROJET) continue;
          const aff = recruiter.getAffinityWith(other.id);
          if (aff < 0.5) continue;
          const rdx = other.x - recruiter.x, rdy = other.y - recruiter.y;
          const rdist = Math.hypot(rdx, rdy);
          if (rdist > 300) continue;
          this._activeRecruitLinks.push({ recruiter, other, aff, dist: rdist });
        }
      }
    }

    // ── Échantillonnage humeur (mood history) ─────────────────────────────
    this._moodSampleTimer += dt;
    if (this._moodSampleTimer >= this.MOOD_SAMPLE_INTERVAL) {
      this._moodSampleTimer = 0;
      for (const e of entities) {
        e.moodHistory.push(e.mood);
        if (e.moodHistory.length > this.MOOD_HISTORY_MAX) {
          e.moodHistory.shift();
        }
      }
    }

    // ── Pensées ambiantes ─────────────────────────────────────────────────
    const THOUGHT_INTERVAL_MIN = 8000;
    const THOUGHT_INTERVAL_MAX = 18000;
    for (const e of entities) {
      this._thoughtTimers[e.id] = (this._thoughtTimers[e.id] || 0) + dt;
      const interval = THOUGHT_INTERVAL_MIN +
        (1 - e.character.extraversion) * (THOUGHT_INTERVAL_MAX - THOUGHT_INTERVAL_MIN);
      if (this._thoughtTimers[e.id] >= interval) {
        this._thoughtTimers[e.id] = 0;
        const thought = this._pickThought(e);
        if (thought) {
          this._thoughtBubbles.push({
            entityId: e.id,
            x: e.x,
            y: e.y,
            radius: e.radius,
            text: thought,
            born: performance.now(),
            life: 2800 + Math.random() * 1200,
          });
        }
      }
    }
    // Nettoyer pensées expirées + suivre position entité (pendant première moitié de vie)
    const nowT = performance.now();
    this._thoughtBubbles = this._thoughtBubbles.filter(t => (nowT - t.born) < t.life);
    for (const t of this._thoughtBubbles) {
      const progress = (nowT - t.born) / t.life;
      if (progress < 0.5) {
        const entity = this.entities.find(e => e.id === t.entityId);
        if (entity) { t.x = entity.x; t.y = entity.y; }
      }
    }

    // ── Mise à jour emojis flottants ──────────────────────────────────────
    const now2 = performance.now();
    this._floatingEmojis = this._floatingEmojis.filter(fe => {
      return (now2 - fe.born) < fe.life;
    });
    for (const fe of this._floatingEmojis) {
      fe.x += fe.vx * dt * 0.05;
      fe.y += fe.vy * dt * 0.05;
      fe.vy -= 0.002 * dt; // montée légère
    }

    // ── Decay interactionLog (oubli progressif, toutes les 30s réelles) ──────
    this._forgetTimer = (this._forgetTimer || 0) + dt;
    if (this._forgetTimer > 30000) {
      this._forgetTimer = 0;
      for (const e of entities) {
        for (const id in e.interactionLog) {
          e.interactionLog[id] = Math.max(0, e.interactionLog[id] * 0.94);
          if (e.interactionLog[id] < 0.01) delete e.interactionLog[id];
        }
      }
    }

    // -- Throttle heatmap record (~10x/s au lieu de 60x/s) -------------------
    this._heatmapRecordTimer = (this._heatmapRecordTimer || 0) + dt;
    if (this._heatmapRecordTimer >= 100) {
      this._heatmapRecordTimer = 0;
      for (const e of entities) {
        this.heatmap.record(e.x, e.y);
      }
    }

    // -- Decay zones memoire (oubli progressif) --------------------------------
    const ZONE_DECAY_RATE = 0.0008; // ~1 unite toutes les 20s game time
    for (const e of entities) {
      if (e.happyZones.length > 0) {
        e.happyZones = e.happyZones
          .map(z => ({ ...z, score: z.score - ZONE_DECAY_RATE * dt }))
          .filter(z => z.score > 0.1);
      }
      if (e.avoidZones.length > 0) {
        e.avoidZones = e.avoidZones
          .map(z => ({ ...z, score: z.score - ZONE_DECAY_RATE * dt }))
          .filter(z => z.score > 0.1);
      }
    }
  }

  // ── Gestion des projets ───────────────────────────────────────────────────
  // ── Micro-événements spontanés ─────────────────────────────────────────────
  // Appelé toutes les 2s. Déclenche AU PLUS UN événement par vérification.
  _spontaneousEventCheck(entities) {
    // 1. Dispute spontanée entre deux ennemis proches (conflictCount >= 4, dist < 120)
    for (const [ck, count] of Object.entries(this._conflictCount)) {
      if (count < 4) continue;
      const [idA, idB] = ck.split('-');
      const a = entities.find(e => e.id === idA);
      const b = entities.find(e => e.id === idB);
      if (!a || !b) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      if (dx * dx + dy * dy > 120 * 120) continue;
      if (Math.random() > 0.15) continue; // 15% de chance si proches
      a.mood = Math.max(-1, a.mood - 0.2);
      b.mood = Math.max(-1, b.mood - 0.2);
      a.state = STATE.FUITE; a._stateTimer = 0;
      b.state = STATE.FUITE; b._stateTimer = 0;
      this._spawnFloatingEmoji((a.x + b.x) / 2, (a.y + b.y) / 2, '💥');
      this.pushEvent(`💥 Dispute! ${idA} ↔ ${idB} (rancune ×${count})`, '#e74c3c', 'conflict');
      return; // un seul événement par check
    }

    // 2. Contagion d'euphorie entre amis proches (score >= 30)
    for (const { a, b, score } of this._activeFriendLinks) {
      if (score < 30) continue;
      const euphoricOne = a.state === STATE.EUPHORIQUE ? a : b.state === STATE.EUPHORIQUE ? b : null;
      if (!euphoricOne) continue;
      const other = euphoricOne === a ? b : a;
      if (other.state === STATE.SATURE || other.state === STATE.CONCENTRE) continue;
      if (Math.random() > 0.12) continue; // 12% de chance
      other.mood = Math.min(1, other.mood + 0.25);
      other.energy = Math.min(100, other.energy + 10);
      this._spawnFloatingEmoji(other.x, other.y, '✨');
      this.pushEvent(`✨ ${euphoricOne.id} entraîne ${other.id} dans l'euphorie`, euphoricOne.color, 'social');
      return;
    }
  }

  _updateProjects(dt) {
    const W = this.canvas.width, H = this.canvas.height;

    this._projectTimer += dt;
    if (this._projectTimer >= this._nextProjectIn &&
        this.projects.filter(p => !p.resolved && !p.isExpired).length < this.PROJECT_MAX) {
      this.projects.push(new Project(W, H));
      this._projectTimer   = 0;
      this._nextProjectIn  = 12000 + Math.random() * 10000;
    }

    for (const proj of this.projects) {
      if (proj.resolved || proj.isExpired) continue;

      if (proj.progress >= proj.difficulty) {
        proj.resolved   = true;
        proj.resolvedAt = performance.now();

        const participantIds = [...proj.participants].join(', ');

        for (const e of this.entities) {
          if (proj.participants.has(e.id)) {
            e.mood   = Math.min(1, e.mood + proj.moodReward);
            e.energy = Math.min(100, e.energy + proj.energyReward);
            e.successCount = (e.successCount || 0) + 1;
            if (!e._projectHistory) e._projectHistory = {};
            e._projectHistory[proj.type] = (e._projectHistory[proj.type] || 0) + 1;
            if (e.state === STATE.PROJET) {
              e.state = STATE.SOCIAL;
              e._stateTimer = 0;
            }
            // Célébration visuelle
            this._spawnFloatingEmoji(e.x, e.y, '🌟');
          }
        }

        // Un seul log via pushEvent (fix double-log)
        this.pushEvent(`🌟 Projet "${proj.label}" résolu par ${participantIds || '-'}`, proj.color, 'project');

        // Cascade narrative CELEBRATION : vague de joie pour les entités proches
        if (proj.type === 'CELEBRATION') {
          for (const o of this.entities) {
            if (proj.participants.has(o.id)) continue; // déjà récompensés ci-dessus
            const d = Math.hypot(o.x - proj.x, o.y - proj.y);
            if (d < 300) {
              const proximity = 1 - d / 300;
              o.mood = Math.min(1, o.mood + 0.15 * proximity);
              if (proximity > 0.5) {
                this._spawnFloatingEmoji(o.x, o.y - 10, '🎊');
              }
            }
          }
          this.pushEvent(`🎊 Vague de joie autour de "${proj.label}"`, proj.color, 'project');
        }
      }
    }

    this.projects = this.projects.filter(p => {
      if (p.isExpired) return false;
      if (p.resolved && (performance.now() - p.resolvedAt) > 3000) return false;
      return true;
    });
  }

  // ── Transitions d'état ────────────────────────────────────────────────────
  _updateState(e, dt) {
    e._stateTimer += dt;
    const minTime = 800;

    // Cap durée EUPHORIQUE (15-25s) pour éviter états permanents
    if (e.state === STATE.EUPHORIQUE) {
      e._euphoriqueDuration = (e._euphoriqueDuration || 0) + dt;
      if (e._euphoriqueDuration > (e._euphoriqueCap || 20000)) {
        e.state = STATE.ERRANCE;
        e._stateTimer = 0;
        e._euphoriqueDuration = 0;
        return;
      }
    }

    // Plancher CONCENTRE (4-7s) : empêcher la sortie immédiate par regen d'énergie
    if (e.state === STATE.CONCENTRE) {
      e._concentreDuration = (e._concentreDuration || 0) + dt;
      if (e._concentreDuration < (e._concentreMinDuration || 4000)) return;
    }

    if (e._stateTimer < minTime) return;

    let newState = e.state;

    // Vérifier si entité reste sur un projet actif
    if (e.state === STATE.PROJET) {
      const nearProject = this.projects.some(p =>
        !p.resolved && !p.isExpired &&
        Math.hypot(p.x - e.x, p.y - e.y) < p.radius
      );
      if (nearProject) return;
    }

    // ── Fatigue sociale : prioritaire sur les introvertis ─────────────────
    const threshold = e.socialSaturationThreshold;
    if (e.socialCharge > threshold && e.state !== STATE.PROJET) {
      // L'entité se sature → fuit les foules
      if (e.state !== STATE.SATURE) {
        e.state = STATE.SATURE;
        e._stateTimer = 0;
        // Légère perte d'humeur
        e.mood = Math.max(-1, e.mood - 0.15);
        // Log saturation
        const nowS = performance.now();
        if (!this._lastSatLog[e.id] || nowS - this._lastSatLog[e.id] > 8000) {
          this._lastSatLog[e.id] = nowS;
          this.pushEvent(`😵 ${e.id} saturé (charge ${Math.round(e.socialCharge)}%)`, e.color, 'saturation');
        }
      }
      return;
    }

    // Récupération de saturation : redescendre en dessous de 60% du seuil
    if (e.state === STATE.SATURE && e.socialCharge < threshold * 0.6) {
      newState = STATE.ERRANCE;
    } else if (e.state === STATE.SATURE) {
      return; // Rester saturé jusqu'à récupération
    } else if (e.state === STATE.FUITE && e._stateTimer > 2000) {
      newState = STATE.ERRANCE;
    } else if (e.mood > 0.7 && e.energy > 70 && !this.isNight &&
               e.state !== STATE.SATURE && e.state !== STATE.PROJET) {
      // Euphorie : mood haute + énergie pleine
      newState = STATE.EUPHORIQUE;
    } else if (
      // P3 : Retraite volontaire des introvertis socialement surchargés
      e.character.extraversion < 0.3 &&
      e.socialCharge > threshold * 0.85 &&
      (e._socialLoadTimer || 0) > 25000 &&
      e.state !== STATE.SATURE && e.state !== STATE.PROJET
    ) {
      newState = STATE.CONCENTRE;
    } else if (e.energy < 20 && e.mood > -0.3 && e.state !== STATE.SATURE) {
      // Concentration : épuisé mais pas déprimé (FIX: avant REPOS pour être atteignable)
      newState = STATE.CONCENTRE;
    } else if (e.energy < 20) {
      newState = STATE.REPOS;
    } else if (e.mood > 0.4 && e.character.socialite > 0.5 && !this.isNight) {
      newState = STATE.SOCIAL;
    } else if (e.energy > 70 && e.character.extraversion > 0.6) {
      newState = STATE.ACTIF;
    } else if (e.energy < 40) {
      newState = STATE.ERRANCE;
    }

    if (newState !== e.state) {
      const prevState = e.state;
      e.state = newState;
      e._stateTimer = 0;

      // Initialiser cap durée EUPHORIQUE (15-25s aléatoire par entité)
      if (newState === STATE.EUPHORIQUE) {
        e._euphoriqueDuration = 0;
        e._euphoriqueCap = 15000 + Math.random() * 10000;
      }

      // Initialiser durée plancher CONCENTRE (4-7s)
      if (newState === STATE.CONCENTRE) {
        e._concentreDuration = 0;
        e._concentreMinDuration = 4000 + Math.random() * 3000;
        e._socialLoadTimer = 0; // B1 : évite ré-entrée immédiate via P3 si timer élevé
        // D : détecter si c'est une retraite introvertie (P3) ou épuisement physique
        e._concentreViaP3 = e.character.extraversion < 0.3
          && (e.socialCharge || 0) > (e.socialSaturationThreshold || 60) * 0.85;
      }

      // Nettoyer caches halos de l'état quitté
      if (e.state === STATE.EUPHORIQUE || prevState === STATE.EUPHORIQUE) {
        e._eupGrad = null; e._eupGradX = null; e._eupGradY = null; e._eupGradR = null;
      }
      if (e.state === STATE.CONCENTRE || prevState === STATE.CONCENTRE) {
        e._concGrad = null; e._concGradX = null; e._concGradY = null;
      }

      // Émettre un emoji flottant sur changement d'état significatif
      const stateEmojis = {
        [STATE.SOCIAL]:     '💬',
        [STATE.REPOS]:      '😴',
        [STATE.ACTIF]:      '⚡',
        [STATE.FUITE]:      '💨',
        [STATE.SATURE]:     '😵',
        [STATE.PROJET]:     '🔧',
        [STATE.ERRANCE]:    '🌀',
        [STATE.EUPHORIQUE]: '✨',
        [STATE.CONCENTRE]:  '🎯',
      };
      const stateLabels = {
        [STATE.SOCIAL]:     'SOCIAL',
        [STATE.REPOS]:      'REPOS',
        [STATE.ACTIF]:      'ACTIF',
        [STATE.FUITE]:      'FUITE',
        [STATE.SATURE]:     'SATURÉ',
        [STATE.PROJET]:     'PROJET',
        [STATE.ERRANCE]:    'ERRANCE',
        [STATE.EUPHORIQUE]: 'EUPHORIQUE',
        [STATE.CONCENTRE]:  'CONCENTRÉ',
      };
      // D : emoji distinctif pour retraite introvertie (P3) vs épuisement physique
      const emoji = (newState === STATE.CONCENTRE && e._concentreViaP3) ? '🧘' : stateEmojis[newState];
      if (emoji) {
        this._spawnFloatingEmoji(e.x, e.y, emoji);
      }
      // Log transition (sauf ERRANCE ↔ REPOS qui sont trop fréquents)
      const noisy = new Set([`${STATE.ERRANCE}-${STATE.REPOS}`, `${STATE.REPOS}-${STATE.ERRANCE}`]);
      const transKey = `${prevState}-${newState}`;
      if (!noisy.has(transKey)) {
        this.pushEvent(`${emoji || '→'} ${e.id} ${stateLabels[prevState] || '?'} → ${stateLabels[newState] || '?'}`, e.color, 'state');
      }
    }
  }

  // ── Rendu Canvas ──────────────────────────────────────────────────────────
  _render() {
    const entities = this.entities;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;

    // Fond persistant
    ctx.fillStyle = this.isNight ? 'rgba(5,8,20,0.22)' : 'rgba(15,17,23,0.22)';
    ctx.fillRect(0, 0, W, H);

    if (this.isNight) {
      ctx.fillStyle = 'rgba(10,10,40,0.10)';
      ctx.fillRect(0, 0, W, H);

      // ── Étoiles et lune ──────────────────────────────────────────────────
      const twinkle = 0.8 + Math.sin(performance.now() * 0.001) * 0.2;
      for (const s of this._stars) {
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,220,255,${(s.a * twinkle).toFixed(2)})`;
        ctx.fill();
      }
      // Lune (coin supérieur droit)
      const moonX = W * 0.87, moonY = H * 0.10;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 24, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(210,220,250,0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(210,220,250,0.22)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Halo doux autour de la lune
      const moonGrad = ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 55);
      moonGrad.addColorStop(0, 'rgba(200,215,255,0.08)');
      moonGrad.addColorStop(1, 'rgba(200,215,255,0)');
      ctx.beginPath();
      ctx.arc(moonX, moonY, 55, 0, Math.PI * 2);
      ctx.fillStyle = moonGrad;
      ctx.fill();
    }

    // ── Heatmap (sous les entités) ───────────────────────────────────────
    if (this.showHeatmap) {
      // Fondu d'entrée / sortie
      this._heatmapOpacity = Math.min(1, this._heatmapOpacity + 0.04);
      this.heatmap.render(ctx, W, H, this._heatmapOpacity * 0.50);
    } else {
      this._heatmapOpacity = Math.max(0, this._heatmapOpacity - 0.04);
      if (this._heatmapOpacity > 0) {
        this.heatmap.render(ctx, W, H, this._heatmapOpacity * 0.50);
      }
    }

    // Overlay événement global
    if (this.activeEvent && this._eventBannerOpacity > 0) {
      this._renderEventOverlay(ctx, W, H);
    }

    // Lignes de connexion (distSq pour éviter sqrt)
    const interactRadSq = this.INTERACTION_RADIUS * this.INTERACTION_RADIUS;
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i], b = entities[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distSq2 = dx*dx + dy*dy;
        if (distSq2 >= interactRadSq) continue;
        const dist = Math.sqrt(distSq2);
        const alpha = (1 - dist / this.INTERACTION_RADIUS) * 0.3;
        const affinity = a.getAffinityWith(b.id);
        const lineAlpha = alpha + affinity * 0.2;

        const isSelected = (a === this.selectedEntity || b === this.selectedEntity);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (isSelected) {
          ctx.strokeStyle = `rgba(255,255,255,${(lineAlpha * 2.5).toFixed(2)})`;
          ctx.lineWidth = 2;
        } else {
          ctx.strokeStyle = affinity > 0
            ? `rgba(255,220,100,${lineAlpha.toFixed(2)})`
            : `rgba(150,160,200,${lineAlpha.toFixed(2)})`;
          ctx.lineWidth = affinity > 0 ? 1.5 : 0.8;
        }
        ctx.stroke();
      }
    }

    // Projets
    for (const proj of this.projects) {
      this._renderProject(ctx, proj);
    }

    // ── Zones de territoire ─────────────────────────────────────────────
    this._renderTerritories(ctx);

    // Entités
    for (const e of entities) {
      this._renderEntity(ctx, e);
    }

    // ── Liens d'amitié persistants (interactionLog) ────────────────────────
    this._renderFriendshipLinks(ctx);
    this._renderRecruitLinks(ctx);
    this._renderRancorLinks(ctx);

    // ── Emojis flottants ───────────────────────────────────────────────────
    this._renderFloatingEmojis(ctx);

    // ── Pensées ambiantes ──────────────────────────────────────────────────
    this._renderThoughtBubbles(ctx);

    // Bannière événement
    if (this.activeEvent && this._eventBannerOpacity > 0) {
      this._renderEventBanner(ctx, W);
    }

    // Panneau inspect
    if (this.selectedEntity) {
      this._renderInspectPanel(ctx, W, H);
    }

    // Curseur
    if (this.mouseX > 0 && this.mouseX < W && this.mouseY > 0 && this.mouseY < H) {
      this._renderCursorZone(ctx);
    }

    // ── Notification (save/load feedback) ─────────────────────────────────
    if (this._notification) {
      this._renderNotification(ctx, W);
    }

    // ── Label heatmap ─────────────────────────────────────────────────────
    if (this._heatmapOpacity > 0.05) {
      ctx.save();
      ctx.globalAlpha = this._heatmapOpacity;
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('🌡️ HEATMAP', W - 260, 20);
      ctx.restore();
    }
  }

  // ── Notification temporaire ───────────────────────────────────────────────
  _renderNotification(ctx, W) {
    const notif = this._notification;
    const now   = performance.now();
    if (now >= notif.expiresAt) { this._notification = null; return; }

    const remaining = notif.expiresAt - now;
    const alpha = Math.min(1, remaining / 400);

    const PW = 240, PH = 36;
    const px = (W - PW) / 2;
    const py = 52; // sous la bannière éventuelle

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = 'rgba(5,8,20,0.90)';
    ctx.strokeStyle = notif.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px, py, PW, PH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = notif.color;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(notif.text, px + PW / 2, py + PH / 2);

    ctx.restore();
  }

  // ── Overlay fond de l'événement ───────────────────────────────────────────
  _renderEventOverlay(ctx, W, H) {
    const ev = this.activeEvent;
    const alpha = this._eventBannerOpacity * 0.06;
    const r = parseInt(ev.color.slice(1,3),16);
    const g = parseInt(ev.color.slice(3,5),16);
    const b = parseInt(ev.color.slice(5,7),16);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Bannière événement en haut de l'écran ─────────────────────────────────
  _renderEventBanner(ctx, W) {
    const ev = this.activeEvent;
    const alpha = this._eventBannerOpacity;
    const progress = this._eventTimer / ev.duration;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = ev.color + 'cc';
    ctx.fillRect(0, 0, W, 42);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 38, W * (1 - progress), 4);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${ev.label} - ${ev.description}`, W / 2, 21);

    ctx.restore();
  }

  // ── Panneau Inspect (click-to-inspect) - position fixe haut-gauche ────────
  _renderInspectPanel(ctx, W, H) {
    const e = this.selectedEntity;

    // ── Constantes de layout ────────────────────────────────────────────────
    const PW   = 220;           // largeur panneau
    const PX   = 16;            // x fixe (bord gauche)
    const PY   = 50;            // y fixe : sous le titre HAIZE
    const PAD  = 14;            // padding interne uniforme
    const INNER_W = PW - PAD * 2; // largeur utilisable
    const LINE_H  = 16;         // hauteur d'une ligne standard
    const SEP_H   = 10;         // espace autour d'un séparateur
    const BAR_H   = 5;          // hauteur barre de progression
    const SECTION_GAP = 6;      // espace entre titre de section et son contenu

    const stateColors = {
      ACTIF: '#f1c40f', REPOS: '#95a5a6', SOCIAL: '#2ecc71',
      FUITE: '#e74c3c', ERRANCE: '#9b59b6', PROJET: '#00cec9', SATURE: '#ff7675',
      EUPHORIQUE: '#ffd700', CONCENTRE: '#74b9ff',
    };

    // ── Pré-calculer la hauteur totale ──────────────────────────────────────
    const contacts = e.getTopContacts(3);

    // P1 : expérience projet — pré-calculer avant PH (réutilisé dans rendu)
    const expEntries = Object.entries(e._projectHistory || {})
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // C : rancœurs — pré-calculer les paires conflictuelles impliquant e
    const rancorEntries = Object.entries(this._conflictCount)
      .filter(([ck]) => ck.split('-').some(id => id === e.id))
      .map(([ck, count]) => ({ otherId: ck.split('-').find(id => id !== e.id), count }))
      .filter(x => x.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    const hasSparkline = e.moodHistory.length > 4;
    const hasZones = e.happyZones.length > 0 || (e.avoidZones?.length > 0);
    const SPARKLINE_H = 38; // label(10) + gap(4) + graphe(24)

    const PH =
      PAD                                     // top pad
      + 22                                    // nom (font 18)
      + 6                                     // gap nom→état
      + 12                                    // état (font 11)
      + SEP_H * 2                             // séparateur
      + (LINE_H * 3)                          // 3 barres stats (humeur, énergie, charge)
      + SEP_H * 2                             // séparateur
      + 11                                    // titre CARACTÈRE
      + SECTION_GAP
      + LINE_H * 2                            // 2 lignes de traits (2 cols × 2 lignes)
      + SEP_H * 2                             // séparateur
      + (expEntries.length > 0 ? 11 + SECTION_GAP + expEntries.length * LINE_H + SEP_H * 2 : 0) // P1 : expérience
      + 11                                    // titre CONTACTS
      + SECTION_GAP
      + Math.max(1, contacts.length) * LINE_H // lignes contacts (min 1 pour "aucun")
      + (rancorEntries.length > 0 ? SEP_H * 2 + 11 + SECTION_GAP + rancorEntries.length * LINE_H : 0) // C : rancœurs
      + (hasZones ? SEP_H * 2 + LINE_H : 0)  // compteur zones heureuses/évitées
      + (hasSparkline ? SEP_H * 2 + SPARKLINE_H : 0)
      + PAD;                                  // bottom pad

    const px = PX, py = PY;

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';

    // ── Fond ────────────────────────────────────────────────────────────────
    ctx.fillStyle   = 'rgba(8,10,20,0.72)';
    ctx.strokeStyle = e.color + 'aa';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect(px, py, PW, PH, 10);
    ctx.fill();
    ctx.stroke();

    // Trait coloré gauche
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.roundRect(px + 1, py + 10, 3, PH - 20, 2);
    ctx.fill();

    // ── Curseur de layout ───────────────────────────────────────────────────
    let cy = py + PAD;
    const X = px + PAD;

    // Nom
    ctx.font      = 'bold 18px monospace';
    ctx.fillStyle = e.color;
    ctx.fillText(e.id, X, cy);
    cy += 22 + 6;

    // État
    ctx.font      = '11px monospace';
    ctx.fillStyle = stateColors[e.state] || '#aaa';
    ctx.fillText(e.state, X, cy);
    cy += 12;

    // ── Séparateur ──────────────────────────────────────────────────────────
    const drawSep = () => {
      cy += SEP_H / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(px + PAD, cy);
      ctx.lineTo(px + PW - PAD, cy);
      ctx.stroke();
      cy += SEP_H / 2;
    };

    // ── Barre stat ──────────────────────────────────────────────────────────
    const LBL_W = 72;
    const drawStatBar = (label, value, color) => {
      ctx.font      = '9px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'left';
      ctx.fillText(label, X, cy + 1);

      const bx = X + LBL_W;
      const bw = INNER_W - LBL_W - 28;
      this._drawBar(ctx, bx, cy + 1, bw, BAR_H, value, color);

      ctx.font      = '9px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(value * 100) + '%', px + PW - PAD, cy + 1);
      ctx.textAlign = 'left';
      cy += LINE_H;
    };

    drawSep();
    drawStatBar('HUMEUR',     (e.mood + 1) / 2,       e.mood > 0 ? '#2ecc71' : '#e74c3c');
    drawStatBar('ÉNERGIE',    e.energy / 100,          '#f1c40f');
    const chargeColor = e.socialCharge > e.socialSaturationThreshold ? '#ff7675' : '#74b9ff';
    drawStatBar('CHARGE SOC', e.socialCharge / 100,    chargeColor);

    // ── Caractère ───────────────────────────────────────────────────────────
    drawSep();
    ctx.font      = 'bold 9px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('CARACTÈRE', X, cy);
    cy += 11 + SECTION_GAP;

    const traits = [
      ['Extr.',  e.character.extraversion],
      ['Agr.',   e.character.agression],
      ['Cur.',   e.character.curiosite],
      ['Soc.',   e.character.socialite],
    ];
    const colW = (INNER_W - 8) / 2;
    const TLBL = 28; // largeur du label de trait

    for (let i = 0; i < 4; i += 2) {
      const [lA, vA] = traits[i];
      const [lB, vB] = traits[i + 1];

      ctx.font      = '9px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.38)';

      // Colonne A
      ctx.fillText(lA, X, cy + 1);
      this._drawBar(ctx, X + TLBL, cy + 1, colW - TLBL, BAR_H, vA, e.color + 'bb');

      // Colonne B
      const bx2 = X + colW + 8;
      ctx.fillText(lB, bx2, cy + 1);
      this._drawBar(ctx, bx2 + TLBL, cy + 1, colW - TLBL, BAR_H, vB, e.color + 'bb');

      cy += LINE_H;
    }

    // ── Expérience projet ───────────────────────────────────────────────────
    if (expEntries.length > 0) {
      drawSep();
      ctx.font      = 'bold 9px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText('EXPÉRIENCE', X, cy);
      cy += 11 + SECTION_GAP;

      for (const [type, count] of expEntries) {
        const isVet = count >= 5;
        ctx.font      = '9px monospace';
        ctx.fillStyle = isVet ? '#ffd700' : 'rgba(255,200,100,0.65)';
        const stars = isVet ? '⭐⭐' : '⭐';
        ctx.fillText(`${stars} ${type} ×${count}`, X, cy + 1);
        cy += LINE_H;
      }
    }

    // ── Contacts fréquents ──────────────────────────────────────────────────
    drawSep();
    ctx.font      = 'bold 9px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('CONTACTS FRÉQUENTS', X, cy);
    cy += 11 + SECTION_GAP;

    if (contacts.length === 0) {
      ctx.font      = '9px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillText('Aucun encore...', X, cy + 1);
      cy += LINE_H;
    } else {
      for (const { id, score } of contacts) {
        const other = this.entities.find(x => x.id === id);
        const col   = other ? other.color : '#fff';

        // Dot
        ctx.beginPath();
        ctx.arc(X + 4, cy + 6, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();

        // Nom
        ctx.font      = 'bold 10px monospace';
        ctx.fillStyle = col;
        ctx.fillText(id, X + 12, cy + 1);

        // Barre
        const barStart = X + 42;
        const barW     = INNER_W - 42 - 24;
        this._drawBar(ctx, barStart, cy + 3, barW, BAR_H - 1, Math.min(1, score / 30), col + '88');

        // Score interaction
        ctx.font      = '9px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.textAlign = 'right';
        ctx.fillText(score.toFixed(1), px + PW - PAD, cy + 1);
        ctx.textAlign = 'left';

        // Affinité de base — dorée si forte, rouge si faible, grise si neutre
        if (other && e.getAffinityWith) {
          const aff = e.getAffinityWith(id);
          const affPct = Math.round(aff * 100);
          ctx.font = '8px monospace';
          ctx.fillStyle = aff >= 0.6 ? '#ffd700'
                        : aff < 0.3  ? 'rgba(231,76,60,0.75)'
                        :              'rgba(255,255,255,0.22)';
          ctx.fillText(`aff:${affPct}%`, X + 12, cy + 10);
        }

        cy += LINE_H + (other && e.getAffinityWith ? 4 : 0);
      }
    }

    // ── Rancœurs ────────────────────────────────────────────────────────────
    if (rancorEntries.length > 0) {
      drawSep();
      ctx.font      = 'bold 9px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText('RANCŒURS', X, cy);
      cy += 11 + SECTION_GAP;
      for (const { otherId, count } of rancorEntries) {
        const isDeep = count >= 5;
        ctx.font      = '9px monospace';
        ctx.fillStyle = isDeep ? '#e74c3c' : 'rgba(255,120,100,0.75)';
        ctx.fillText(`❄️ ${otherId} ×${count}`, X, cy + 1);
        cy += LINE_H;
      }
    }

    // ── Zones heureuses / évitées ──────────────────────────────────────────
    if (hasZones) {
      drawSep();
      ctx.font      = '9px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      const zoneParts = [];
      if (e.happyZones.length > 0)
        zoneParts.push(`🌟 ${e.happyZones.length} lieu${e.happyZones.length > 1 ? 'x' : ''} heureux`);
      if (e.avoidZones?.length > 0)
        zoneParts.push(`⚠️ ${e.avoidZones.length} zone${e.avoidZones.length > 1 ? 's' : ''} évitée${e.avoidZones.length > 1 ? 's' : ''}`);
      ctx.fillText(zoneParts.join('  '), X, cy + 1);
      cy += LINE_H;
    }

    // ── Sparkline humeur ────────────────────────────────────────────────────
    if (hasSparkline) {
      drawSep();
      ctx.font      = 'bold 9px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText('HISTORIQUE HUMEUR', X, cy);
      cy += 10 + 4;

      const spW = INNER_W, spH = 24;
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(X, cy, spW, spH);

      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X, cy + spH / 2);
      ctx.lineTo(X + spW, cy + spH / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const hist  = e.moodHistory;
      const step  = spW / Math.max(1, hist.length - 1);
      const sColor = e.mood >= 0 ? '#2ecc71' : '#e74c3c';

      ctx.beginPath();
      for (let i = 0; i < hist.length; i++) {
        const sx = X + i * step;
        const sy = cy + (1 - (hist[i] + 1) / 2) * spH;
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.strokeStyle = sColor;
      ctx.lineWidth   = 1.5;
      ctx.lineJoin    = 'round';
      ctx.stroke();

      const lx = X + (hist.length - 1) * step;
      const ly = cy + (1 - (hist[hist.length - 1] + 1) / 2) * spH;
      ctx.beginPath();
      ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = sColor;
      ctx.fill();
    }

    // ── Ligne pointillée vers l'entité ──────────────────────────────────────
    // Ancre : milieu bord droit du panneau (panneau toujours à gauche)
    const anchorX = px + PW;
    const anchorY = py + PH / 2;

    ctx.strokeStyle = e.color + '55';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Cercle de sélection
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = e.color + '77';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  // ── Barre de progression ──────────────────────────────────────────────────
  _drawBar(ctx, x, y, w, h, pct, color) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
  }

  // ── Liens d'amitié persistants ────────────────────────────────────────────
  // 🎯 Rendu des liens de recrutement PROJET
  _renderRecruitLinks(ctx) {
    if (!this._activeRecruitLinks || this._activeRecruitLinks.length === 0) return;
    ctx.save();
    for (const { recruiter, other, aff, dist } of this._activeRecruitLinks) {
      const alpha = aff * 0.22 * (1 - dist / 300);
      ctx.beginPath();
      ctx.moveTo(recruiter.x, recruiter.y);
      ctx.lineTo(other.x, other.y);
      ctx.strokeStyle = `rgba(255,215,0,${alpha.toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // ❄️ Rendu des liens de rancune (conflits répétés)
  _renderRancorLinks(ctx) {
    if (!this._activeRancorLinks || this._activeRancorLinks.length === 0) return;
    const now = performance.now();
    const pulse = 0.4 + Math.sin(now * 0.002) * 0.3;
    ctx.save();
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { a, b, count } of this._activeRancorLinks) {
      const intensity = Math.min(1, count / 8);
      const alpha = intensity * pulse * 0.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(180,60,60,${alpha.toFixed(3)})`;
      ctx.lineWidth = 1 + intensity;
      ctx.setLineDash([2, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Icône ❄️ au centre — badge ×N si rancœur intense (≥5)
      ctx.globalAlpha = intensity * 0.75;
      const label = count >= 5 ? `❄️×${count}` : '❄️';
      ctx.fillText(label, (a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  _renderFriendshipLinks(ctx) {
    if (this._activeFriendLinks.length === 0) return;
    const now = performance.now();
    const pulse = 0.5 + Math.sin(now * 0.0015) * 0.3;

    // Utiliser le cache pré-calculé dans _update (rebuild 5×/s) - plus de O(n2) ici
    for (const { a, b, score, strength } of this._activeFriendLinks) {
      // Attenuer les liens lointains (>700px) pour encoder la distance emotionnelle
      const dx = b.x - a.x, dy = b.y - a.y;
      const linkDist = Math.sqrt(dx*dx + dy*dy);
      const distFactor = linkDist > 700 ? 0.45 : 1.0;
      const alpha = strength * pulse * 0.35 * distFactor;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);

      ctx.strokeStyle = `rgba(255,200,100,${alpha.toFixed(3)})`;
      ctx.lineWidth   = 0.8 + strength * 1.5;
      ctx.setLineDash([4, 8]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Petit cœur au milieu si score très élevé
      if (score > 40) {
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = alpha * 2;
        ctx.fillText('💛', midX, midY);
        ctx.globalAlpha = 1;
      }
    }

    // ── Passe cœur rapproché : utilise le flag isClose du cache (élimine O(n²) inline)
    const pulseCR = 0.5 + Math.sin(now * 0.0015) * 0.2;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const { a, b, score, isClose } of this._activeFriendLinks) {
      if (!isClose || score < 40) continue;
      ctx.globalAlpha = pulseCR;
      ctx.fillText('💛', (a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.globalAlpha = 1;
    }
  }

  // ── Rendu des emojis flottants ─────────────────────────────────────────────
  _renderFloatingEmojis(ctx) {
    if (this._floatingEmojis.length === 0) return;
    const now = performance.now();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const fe of this._floatingEmojis) {
      const age  = now - fe.born;
      const t    = age / fe.life;
      // Apparaît vite, disparaît doucement
      const alpha = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
      ctx.globalAlpha = alpha;
      ctx.font = `${fe.size}px monospace`;
      ctx.fillText(fe.text, fe.x, fe.y);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Spawn d'un emoji flottant ─────────────────────────────────────────────
  _spawnFloatingEmoji(x, y, text) {
    // Cap à 15 simultanés pour éviter l'accumulation
    if (this._floatingEmojis.length >= 15) {
      this._floatingEmojis.shift(); // retirer le plus ancien
    }
    this._floatingEmojis.push({
      x,
      y: y - 20,
      vx: (Math.random() - 0.5) * 0.8,
      vy: 1.2 + Math.random() * 0.8,
      text,
      born: performance.now(),
      life: 1800 + Math.random() * 600,
      size: 14 + Math.floor(Math.random() * 4),
    });
  }

  // ── Choisir une pensée ambiante selon l'état/humeur de l'entité ──────────
  _pickThought(e) {
    const thoughts = {
      [STATE.REPOS]:      ['💤', '😴', '🌙', 'zzz...'],
      [STATE.SOCIAL]:     ['😄', '💬', '🤝', '✨'],
      [STATE.ACTIF]:      ['⚡', '🔥', '💪', '🏃'],
      [STATE.FUITE]:      ['😱', '💨', '👻', '😰'],
      [STATE.SATURE]:     ['😵', '🤯', '😤', '🙅'],
      [STATE.PROJET]:     ['🔧', '🛠️', '🎯', '💡'],
      [STATE.ERRANCE]:    ['🌀', '🤔', '👀', '🚶'],
      [STATE.EUPHORIQUE]: ['🌟', '😄', '🎉', '🤩', '💃'],
      [STATE.CONCENTRE]:  ['🎯', '🧘', '💭', '✍️', '🔍'],
    };
    const moodBonus = e.mood > 0.5  ? ['😊', '💛', '🌟'] :
                      e.mood < -0.5 ? ['😢', '💔', '😞'] : [];
    const pool = [...(thoughts[e.state] || []), ...moodBonus];
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── Rendu des pensées ambiantes ────────────────────────────────────────────
  _renderThoughtBubbles(ctx) {
    if (this._thoughtBubbles.length === 0) return;
    const now = performance.now();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this._thoughtBubbles) {
      const age = now - t.born;
      const progress = age / t.life;
      const alpha = progress < 0.2 ? progress / 0.2 : Math.max(0, 1 - (progress - 0.2) / 0.8);
      const rise = progress * 28;

      // Position mise à jour dans _update (read-only ici)
      const bx = t.x;
      const by = t.y - (t.radius || 22) - 18 - rise;

      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = 'rgba(20,22,40,0.75)';
      ctx.beginPath();
      ctx.roundRect(bx - 14, by - 12, 28, 24, 8);
      ctx.fill();

      ctx.globalAlpha = alpha;
      ctx.font = '16px monospace';
      ctx.fillText(t.text, bx, by);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  _renderTerritories(ctx) {
    const now = performance.now();
    for (const e of this.entities) {
      // N'afficher que pour les entités ERRANCE, REPOS, ou sélectionnées
      const isHome = e.state === STATE.ERRANCE || e.state === STATE.REPOS || e === this.selectedEntity;
      if (!isHome) continue;

      const dist = Math.hypot(e.x - e.homeX, e.y - e.homeY);
      const isInTerritory = dist < e.homeRadius;

      // Opacité : plus visible pour introvertis + quand entité est dans le territoire
      const introFactor = 1 - e.character.extraversion;
      const baseAlpha = 0.03 + introFactor * 0.04;
      const alpha = isInTerritory ? baseAlpha * 1.8 : baseAlpha;

      const pulse = 1 + Math.sin(now * 0.0008 + e._noiseOffsetX) * 0.04;
      const effectiveRadius = e.homeRadius * pulse;

      ctx.save();
      ctx.beginPath();
      ctx.arc(e.homeX, e.homeY, effectiveRadius, 0, Math.PI * 2);

      // Gradient : invalider uniquement si home a bougé > 5px (pas sur le pulse - imperceptible)
      const cacheKey = `${Math.round(e.homeX/5)*5}_${Math.round(e.homeY/5)*5}`;
      if (!e._territoryGradCache || e._territoryGradCacheKey !== cacheKey) {
        e._territoryGradCache = ctx.createRadialGradient(
          e.homeX, e.homeY, e.homeRadius * 0.3,
          e.homeX, e.homeY, e.homeRadius
        );
        const alphaHex1 = Math.round(alpha * 255 * 1.5).toString(16).padStart(2,'0');
        e._territoryGradCache.addColorStop(0, e.color + alphaHex1);
        e._territoryGradCache.addColorStop(1, e.color + '00');
        e._territoryGradCacheKey = cacheKey;
      }

      ctx.fillStyle = e._territoryGradCache;
      ctx.fill();

      // Contour pointillé discret
      ctx.beginPath();
      ctx.arc(e.homeX, e.homeY, effectiveRadius, 0, Math.PI * 2);
      ctx.strokeStyle = e.color + Math.round(alpha * 255 * 3).toString(16).padStart(2,'0');
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 12]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // ── Happy zones : petits glows visibles uniquement pour l'entité sélectionnée
      if (e === this.selectedEntity && e.happyZones.length > 0) {
        for (const zone of e.happyZones) {
          const zAlpha = 0.12 + (zone.score / 10) * 0.25;
          const zR = 14 + (zone.score / 10) * 10;
          ctx.save();
          ctx.beginPath();
          ctx.arc(zone.x, zone.y, zR, 0, Math.PI * 2);
          ctx.fillStyle = e.color + Math.round(zAlpha * 255).toString(16).padStart(2,'0');
          ctx.fill();
          ctx.beginPath();
          ctx.arc(zone.x, zone.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = e.color + 'cc';
          ctx.fill();
          ctx.restore();
        }
      }
      // Zones à éviter (rouge-brun) - affichées uniquement pour l'entité sélectionnée
      if (e === this.selectedEntity && e.avoidZones?.length > 0) {
        for (const zone of e.avoidZones) {
          const zAlpha = 0.10 + (zone.score / 10) * 0.18;
          const zR = 12 + (zone.score / 10) * 8;
          ctx.save();
          ctx.beginPath();
          ctx.arc(zone.x, zone.y, zR, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(231,76,60,${zAlpha.toFixed(2)})`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(zone.x, zone.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(231,76,60,0.7)';
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  _renderEntity(ctx, e) {
    const r = e.radius;
    const isSelected = (e === this.selectedEntity);
    const isSaturated = (e.state === STATE.SATURE);

    // Halo saturation sociale (aura violacée-rouge pour les saturés) - gradient caché
    if (isSaturated) {
      const satPct = Math.min(1, e.socialCharge / 100);
      const satAlpha = satPct * 0.5;
      const haloR = r * (2.2 + Math.sin(performance.now() * 0.003) * 0.3);
      // Invalider si charge sociale a varié > 5 ou position bougée > 5px ou haloR a varié > 2px
      if (!e._satGrad
          || Math.abs(e._satGradCharge - e.socialCharge) > 5
          || Math.hypot(e.x - e._satGradX, e.y - e._satGradY) > 5
          || Math.abs((e._satGradR || 0) - haloR) > 2) {
        e._satGrad = ctx.createRadialGradient(e.x, e.y, r * 0.5, e.x, e.y, haloR);
        e._satGrad.addColorStop(0, `rgba(255,118,117,${satAlpha.toFixed(2)})`);
        e._satGrad.addColorStop(1, 'transparent');
        e._satGradCharge = e.socialCharge;
        e._satGradX = e.x;
        e._satGradY = e.y;
        e._satGradR = haloR;
      }
      ctx.beginPath();
      ctx.arc(e.x, e.y, haloR, 0, Math.PI * 2); // Fix: dessiner le haloR courant (pulse), pas le cached
      ctx.fillStyle = e._satGrad;
      ctx.fill();
    }

    // Halo euphorique (aura dorée pulsante) - gradient caché pour perf
    if (e.state === STATE.EUPHORIQUE) {
      const eupPulse = 1 + Math.sin(performance.now() * 0.004 + e._noiseOffsetX) * 0.15;
      const eupHaloR = r * 2.5 * eupPulse;
      ctx.beginPath();
      ctx.arc(e.x, e.y, eupHaloR, 0, Math.PI * 2);
      // Cache : invalider si position bougée > 5px ou haloR delta > 3px
      if (!e._eupGrad
          || Math.hypot(e.x - (e._eupGradX || 0), e.y - (e._eupGradY || 0)) > 5
          || Math.abs((e._eupGradR || 0) - eupHaloR) > 3) {
        e._eupGrad = ctx.createRadialGradient(e.x, e.y, r, e.x, e.y, eupHaloR);
        e._eupGrad.addColorStop(0, 'rgba(255,215,0,0.25)');
        e._eupGrad.addColorStop(1, 'transparent');
        e._eupGradX = e.x; e._eupGradY = e.y; e._eupGradR = eupHaloR;
      }
      ctx.fillStyle = e._eupGrad;
      ctx.fill();
    }

    // Halo concentré (aura bleue douce, statique) - gradient caché pour perf
    if (e.state === STATE.CONCENTRE) {
      const concR = r * 1.8;
      ctx.beginPath();
      ctx.arc(e.x, e.y, concR, 0, Math.PI * 2);
      // Cache : invalider si position bougée > 5px
      if (!e._concGrad
          || Math.hypot(e.x - (e._concGradX || 0), e.y - (e._concGradY || 0)) > 5) {
        e._concGrad = ctx.createRadialGradient(e.x, e.y, r * 0.5, e.x, e.y, concR);
        e._concGrad.addColorStop(0, 'rgba(116,185,255,0.18)');
        e._concGrad.addColorStop(1, 'transparent');
        e._concGradX = e.x; e._concGradY = e.y;
      }
      ctx.fillStyle = e._concGrad;
      ctx.fill();
    }

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + 12, 0, Math.PI * 2);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Trail
    if (e.trail.length > 2) {
      ctx.beginPath();
      ctx.moveTo(e.trail[0].x, e.trail[0].y);
      for (let i = 1; i < e.trail.length; i++) {
        ctx.lineTo(e.trail[i].x, e.trail[i].y);
      }
      // Trail coloré selon état FSM — signal visuel de l'histoire récente
      const TRAIL_STATE_COLORS = {
        [STATE.EUPHORIQUE]: '#ffd700',
        [STATE.CONCENTRE]:  '#74b9ff',
        [STATE.FUITE]:      '#e74c3c',
        [STATE.SATURE]:     '#ff7675',
        [STATE.PROJET]:     '#00cec9',
        [STATE.SOCIAL]:     '#2ecc71',
      };
      const trailColor = (TRAIL_STATE_COLORS[e.state] || e.color) + '55';
      ctx.strokeStyle = trailColor;
      ctx.lineWidth   = r * 0.6;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.stroke();
    }

    // Halo humeur - gradient caché (invalidé si signe changé, absMood delta > 0.08, ou dépl > 5px)
    const absMood = Math.abs(e.mood);
    if (absMood > 0.15) {
      const moodSign = e.mood > 0 ? 1 : -1;
      const haloR = r * (1.6 + absMood * 0.8);
      if (!e._moodGrad
          || e._moodGradSign !== moodSign
          || Math.abs(e._moodGradAbsMood - absMood) > 0.08
          || Math.hypot(e.x - e._moodGradX, e.y - e._moodGradY) > 5) {
        const haloAlpha = absMood * 0.35;
        const haloColor = e.mood > 0
          ? `rgba(46,204,113,${haloAlpha.toFixed(2)})`
          : `rgba(231,76,60,${haloAlpha.toFixed(2)})`;
        e._moodGrad = ctx.createRadialGradient(e.x, e.y, r * 0.5, e.x, e.y, haloR);
        e._moodGrad.addColorStop(0, haloColor);
        e._moodGrad.addColorStop(1, 'transparent');
        e._moodGradSign    = moodSign;
        e._moodGradAbsMood = absMood;
        e._moodGradX       = e.x;
        e._moodGradY       = e.y;
        e._moodGradR       = haloR;
      }
      ctx.beginPath();
      ctx.arc(e.x, e.y, e._moodGradR, 0, Math.PI * 2);
      ctx.fillStyle = e._moodGrad;
      ctx.fill();
    }

    // Cercle principal
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.fillStyle   = e.color + 'cc';
    ctx.fill();
    ctx.strokeStyle = isSaturated ? '#ff7675' : e.color;
    ctx.lineWidth   = isSaturated ? 2.5 : 2;
    ctx.stroke();

    // Arc énergie
    const energyAngle = (e.energy / 100) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 5, -Math.PI / 2, energyAngle);
    ctx.strokeStyle = `rgba(255,255,255,0.5)`;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Arc charge sociale (rouge quand haute, discret)
    if (e.socialCharge > 20) {
      const chargeAngle = (e.socialCharge / 100) * Math.PI * 2 - Math.PI / 2;
      const chargeAlpha = Math.min(0.8, e.socialCharge / 100);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + 9, -Math.PI / 2, chargeAngle);
      ctx.strokeStyle = `rgba(255,118,117,${chargeAlpha.toFixed(2)})`;
      ctx.lineWidth   = 2;
      ctx.stroke();
    }

    // Initiales
    ctx.fillStyle   = '#ffffff';
    ctx.font        = `bold ${e.id.length > 2 ? 10 : 13}px monospace`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.id, e.x, e.y);

    // Point d'état
    const stateColors = {
      [STATE.ACTIF]:      '#f1c40f',
      [STATE.REPOS]:      '#95a5a6',
      [STATE.SOCIAL]:     '#2ecc71',
      [STATE.FUITE]:      '#e74c3c',
      [STATE.ERRANCE]:    '#9b59b6',
      [STATE.PROJET]:     '#00cec9',
      [STATE.SATURE]:     '#ff7675',
      [STATE.EUPHORIQUE]: '#ffd700',
      [STATE.CONCENTRE]:  '#74b9ff',
    };
    ctx.beginPath();
    ctx.arc(e.x + r * 0.65, e.y - r * 0.65, 4, 0, Math.PI * 2);
    ctx.fillStyle = stateColors[e.state] || '#ffffff';
    ctx.fill();

    // Badge de succès
    if (e.successCount > 0) {
      const badgeX = e.x - r * 0.55;
      const badgeY = e.y - r - 10;
      ctx.font      = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(`★${e.successCount}`, badgeX + 1, badgeY + 1);
      ctx.fillStyle = '#f9ca24';
      ctx.fillText(`★${e.successCount}`, badgeX, badgeY);
    }

    // Badge persistant CONCENTRE - icone visible au-dessus du cercle
    if (e.state === STATE.CONCENTRE) {
      const badgeX = e.x;
      const badgeY = e.y - r - 24;
      const pulse = 0.7 + Math.sin(performance.now() * 0.002 + e._noiseOffsetX) * 0.15;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e._concentreViaP3 ? '🧘' : '🎯', badgeX, badgeY);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  _renderCursorZone(ctx) {
    const x = this.mouseX, y = this.mouseY;
    const r = this.CURSOR_RADIUS;
    const now = performance.now();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now * 0.0005);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(231,76,60,0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0,   'rgba(231,76,60,0.08)');
    grad.addColorStop(0.6, 'rgba(231,76,60,0.03)');
    grad.addColorStop(1,   'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(231,76,60,0.5)';
    ctx.fill();

    ctx.restore();
  }

  _renderProject(ctx, proj) {
    const now   = performance.now();
    const phase = proj._phase + now * 0.002;
    const pulse = 1 + Math.sin(phase) * 0.12;

    if (proj.resolved) {
      const age   = now - proj.resolvedAt;
      const t     = age / 3000;
      const alpha = Math.max(0, 1 - t);
      const boom  = proj.radius * (1 + t * 2);
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, boom, 0, Math.PI * 2);
      ctx.strokeStyle = proj.color + Math.round(alpha * 255).toString(16).padStart(2,'0');
      ctx.lineWidth   = 3 * alpha;
      ctx.stroke();
      ctx.fillStyle = proj.color + Math.round(alpha * 80).toString(16).padStart(2,'0');
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      ctx.font      = '18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✓', proj.x, proj.y);
      return;
    }

    if (proj.isExpired) return;

    const r = proj.radius * 0.45 * pulse;

    // Cache gradient : invalider seulement si pulse a varié > 0.03 (~gain 0.4ms/frame sur 3 projets)
    const pulseDelta = Math.abs((proj._lastPulse || 0) - pulse);
    if (!proj._gradient || pulseDelta > 0.03) {
      proj._gradient = ctx.createRadialGradient(proj.x, proj.y, r * 0.5, proj.x, proj.y, proj.radius * 1.5);
      proj._gradient.addColorStop(0,   proj.color + '22');
      proj._gradient.addColorStop(0.5, proj.color + '11');
      proj._gradient.addColorStop(1,   'transparent');
      proj._lastPulse = pulse;
    }
    const gradient = proj._gradient;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.radius * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(proj.x, proj.y, r, 0, Math.PI * 2);
    ctx.fillStyle   = proj.color + '33';
    ctx.fill();
    ctx.strokeStyle = proj.color + 'cc';
    ctx.lineWidth   = 2;
    ctx.stroke();

    if (proj.progress > 0) {
      const startAngle = -Math.PI / 2;
      const endAngle   = startAngle + proj.progressPct * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, r + 8, startAngle, endAngle);
      ctx.strokeStyle = proj.color;
      ctx.lineWidth   = 4;
      ctx.lineCap     = 'round';
      ctx.stroke();
    }

    const lifeLeft = 1 - (now - proj.spawnedAt) / proj.maxLifetime;
    if (lifeLeft < 0.4 && proj.participants.size === 0) {
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, r + 14, -Math.PI / 2, -Math.PI / 2 + lifeLeft * Math.PI * 2);
      ctx.strokeStyle = `rgba(255,100,100,0.5)`;
      ctx.lineWidth   = 2;
      ctx.stroke();
    }

    ctx.fillStyle    = proj.color;
    ctx.font         = 'bold 11px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(proj.label, proj.x, proj.y - r - 14);

    if (proj.participants.size > 0) {
      ctx.fillStyle    = 'rgba(255,255,255,0.7)';
      ctx.font         = '10px monospace';
      ctx.fillText(`${proj.participants.size} contrib.`, proj.x, proj.y + r + 14);
    }
  }

  // ── Panel info (sidebar) ──────────────────────────────────────────────────
  _updatePanel() {
    if (!this.infoPanel) return;
    const cycleElapsed = (performance.now() - this.cycleStart) % this.dayDuration;
    const pct = Math.round((cycleElapsed / this.dayDuration) * 100);
    const cycleLabel = this.isNight ? '🌙 Nuit' : '☀️ Jour';

    // 🚀 Optimisation DOM : ne rebuilder que si l'état a changé (évite ~1200 node créations/200ms)
    const stateHash = this.entities.map(e =>
      `${e.id}:${e.state}:${Math.round(e.mood * 10)}:${Math.round(e.energy)}`
    ).join('|') + `|${this.dayCount}|${pct}|${this.activeEvent ? this.activeEvent.label : ''}`;
    if (stateHash === this._panelStateHash) return;
    this._panelStateHash = stateHash;

    let html = `<div class="cycle-indicator">${cycleLabel} - Jour ${this.dayCount} (${pct}%)</div>`;

    // 📊 Compteur d'états : vision d'ensemble instantanée
    {
      const stateCounts = {};
      for (const e of this.entities) {
        stateCounts[e.state] = (stateCounts[e.state] || 0) + 1;
      }
      const stateEmojis = {
        SOCIAL: '💬', ACTIF: '⚡', REPOS: '😴', ERRANCE: '🌀',
        FUITE: '💨', SATURE: '😵', PROJET: '🔧', EUPHORIQUE: '✨', CONCENTRE: '🎯'
      };
      const parts = Object.entries(stateCounts)
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${stateEmojis[s] || s} ×${n}`)
        .join(' · ');
      html += `<div class="state-summary">${parts}</div>`;
    }

    if (this.activeEvent) {
      const evPct = Math.round(this._eventTimer / this.activeEvent.duration * 100);
      html += `<div class="event-tag" style="border-color:${this.activeEvent.color};color:${this.activeEvent.color}">${this.activeEvent.label} ${evPct}%</div>`;
    }

    html += `<div class="entity-list">`;

    for (const e of this.entities) {
      const moodClass = e.mood > 0.2 ? 'mood-pos' : e.mood < -0.2 ? 'mood-neg' : 'mood-neu';
      const moodBar   = Math.round((e.mood + 1) / 2 * 100);
      const energyPct = Math.round(e.energy);
      const isSelected = (e === this.selectedEntity);
      const isSaturated = (e.state === STATE.SATURE);
      const moodTrend = (() => {
        const hist = e.moodHistory;
        if (hist.length < 3) return '';
        const delta = hist[hist.length - 1] - hist[hist.length - 3];
        return delta > 0.05 ? String.fromCodePoint(0x2191) : delta < -0.05 ? String.fromCodePoint(0x2193) : String.fromCodePoint(0x2192);
      })();
      html += `
        <div class="entity-row${isSelected ? ' entity-row--selected' : ''}" data-id="${e.id}" style="${isSelected ? `border-left:2px solid ${e.color};padding-left:4px` : ''}">
          <span class="entity-dot" style="background:${e.color}"></span>
          <span class="entity-id">${e.id}</span>
          <span class="entity-state state-${e.state.toLowerCase()}">${e.state}</span>
          <span class="entity-stat">⚡${energyPct}</span>
          <span class="entity-stat ${moodClass}">${moodBar}%${moodTrend}</span>
          ${e.successCount > 0 ? `<span class="entity-stat" style="color:#f9ca24">★${e.successCount}</span>` : ''}
          ${isSaturated ? `<span class="entity-stat" style="color:#ff7675">💤</span>` : ''}
        </div>`;
    }

    html += `</div>`;
    html += `<div style="margin-top:8px;font-size:9px;color:#555;text-align:center">Clic sur entité pour inspecter • H = heatmap</div>`;

    this.infoPanel.innerHTML = html;
  }
}
