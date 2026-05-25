/**
 * simulation.js
 * Boucle principale, physique, interactions, rendu Canvas.
 *
 * Nouveautés v2 :
 *  - Mémoire des interactions (interactionLog par entité)
 *  - Click-to-inspect : panneau détaillé en cliquant sur une entité
 *  - Événements aléatoires globaux : Tempête, Fête, Tension, Déprime
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
    description: 'Chaos général — forces aléatoires violentes',
    apply(entities, dt) {
      for (const e of entities) {
        // Turbulence élevée
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
    description: 'Euphorie collective — tout le monde converge au centre',
    apply(entities, dt, W, H) {
      const cx = W / 2, cy = H / 2;
      for (const e of entities) {
        const dx = cx - e.x, dy = cy - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        // Attraction vers le centre, proportionnelle à la socialité
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
    description: 'Agressivité amplifiée — les conflits s\'embrasent',
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
    description: 'Apathie générale — tout le monde ralentit et se retire',
    apply(entities, dt) {
      for (const e of entities) {
        // Tout le monde se ralentit et perd de l'humeur
        e.vx *= 0.97;
        e.vy *= 0.97;
        e.mood = Math.max(-1, e.mood - 0.0008 * dt);
        e.energy = Math.max(0, e.energy - 0.015 * dt);
      }
    },
  },
];

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

    // ── Événement global actif
    this.activeEvent     = null;
    this._eventTimer     = 0;
    this._nextEventIn    = 20000 + Math.random() * 20000; // premier dans 20-40s
    this._eventBannerOpacity = 0; // pour fondu entrée/sortie

    this._lastTime   = performance.now();
    this._rafId      = null;

    this.INTERACTION_RADIUS   = 180;
    this.CONFLICT_RADIUS      = 60;
    this.FRICTION             = 0.90;
    this.MAX_SPEED            = 7.0;
    this.NOISE_SCALE          = 0.0025;
    this.NOISE_SPEED          = 0.0008;
    this._noiseTime           = 0;
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
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
    // Toggle : déselectionner si on reclique la même
    this.selectedEntity = (hit === this.selectedEntity) ? null : hit;
  }

  // ── Boucle principale ──────────────────────────────────────────────────────
  start() {
    const loop = (now) => {
      const rawDt = Math.min(now - this._lastTime, 50);
      this._lastTime = now;
      if (!this.paused) {
        const dt = rawDt * this.speedFactor;
        this._updateCycle(now);
        this._updateGlobalEvents(dt);
        this._update(dt);
        this._render();
        this._updatePanel();
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
    this.isNight   = elapsed >= dayLen;
  }

  // ── Événements globaux ─────────────────────────────────────────────────────
  _updateGlobalEvents(dt) {
    if (this.activeEvent) {
      this._eventTimer += dt;
      // Fondu entrant (1s) et sortant (1s)
      const t = this._eventTimer / this.activeEvent.duration;
      if (t < 0.08) {
        this._eventBannerOpacity = t / 0.08;
      } else if (t > 0.85) {
        this._eventBannerOpacity = Math.max(0, (1 - t) / 0.15);
      } else {
        this._eventBannerOpacity = 1;
      }

      // Appliquer les effets
      this.activeEvent.apply(this.entities, dt, this.canvas.width, this.canvas.height);

      // Fin de l'événement
      if (this._eventTimer >= this.activeEvent.duration) {
        this.activeEvent    = null;
        this._eventTimer    = 0;
        this._nextEventIn   = 25000 + Math.random() * 25000;
        this._eventBannerOpacity = 0;
      }
    } else {
      this._eventTimer += dt;
      if (this._eventTimer >= this._nextEventIn) {
        // Déclencher un événement aléatoire
        this.activeEvent  = GLOBAL_EVENTS[Math.floor(Math.random() * GLOBAL_EVENTS.length)];
        this._eventTimer  = 0;
      }
    }
  }

  // ── Mise à jour physique ───────────────────────────────────────────────────
  _update(dt) {
    const entities = this.entities;
    const W = this.canvas.width, H = this.canvas.height;

    this._noiseTime += dt * this.NOISE_SPEED;

    this._updateProjects(dt);

    for (const e of entities) {
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

      // Fuite du curseur
      const cdx  = e.x - this.mouseX;
      const cdy  = e.y - this.mouseY;
      const cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
      if (cdist < this.CURSOR_RADIUS) {
        const flee = (1 - cdist / this.CURSOR_RADIUS) * 0.35;
        e.vx += (cdx / cdist) * flee;
        e.vy += (cdy / cdist) * flee;
        e.mood = Math.max(-1, e.mood - 0.001 * dt);
        if (e.state !== STATE.PROJET) {
          e.state = STATE.FUITE;
          e._stateTimer = 0;
        }
      }

      // Attraction vers les projets
      for (const proj of this.projects) {
        if (proj.resolved || proj.isExpired) continue;
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
            const contrib = charAffinity * (e.energy / 100) * 0.012 * dt;
            proj.progress += contrib;
          }
        }
      }

      // Interactions avec les autres entités + mémorisation
      for (const other of entities) {
        if (other === e) continue;
        const dx = other.x - e.x;
        const dy = other.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx2 = dx / dist, ny2 = dy / dist;

        // Conflit agressif
        if (dist < this.CONFLICT_RADIUS &&
            e.character.agression > 0.55 &&
            other.character.agression > 0.55) {
          const f = 0.25 * (1 - dist / this.CONFLICT_RADIUS);
          e.vx -= nx2 * f;
          e.vy -= ny2 * f;
          e.mood = Math.max(-1, e.mood - 0.002 * dt);
          if (e.state !== STATE.FUITE) e.state = STATE.FUITE;
        }

        if (dist < this.INTERACTION_RADIUS) {
          const t = 1 - dist / this.INTERACTION_RADIUS;

          const affinity = e.getAffinityWith(other.id);
          const socialForce = (e.character.socialite + other.character.socialite) / 2;
          const attractBase = socialForce - 0.3;
          const force = (attractBase + affinity * 0.5) * t * 0.015;

          e.vx += nx2 * force;
          e.vy += ny2 * force;

          // Influence humeur
          if (dist < this.INTERACTION_RADIUS * 0.5) {
            const moodDelta = other.mood * 0.0003 * dt;
            e.mood = Math.max(-1, Math.min(1, e.mood + moodDelta));
            if (e.character.socialite > 0.6) {
              e.energy = Math.min(100, e.energy + 0.003 * dt);
            }

            // ── Mémorisation : incrémenter le score de contact avec other ──
            e.interactionLog[other.id] = (e.interactionLog[other.id] || 0) + dt * 0.001;
          }
        }
      }

      // Nuit : ralentissement
      const nightMult = this.isNight ? 0.3 : 1.0;

      e.vx *= this.FRICTION;
      e.vy *= this.FRICTION;
      const speed = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
      const maxSpd = this.MAX_SPEED * nightMult *
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
      const energyDrain = speed * 0.002 * dt * (1 - this.isNight * 0.8);
      e.energy = Math.max(0, e.energy - energyDrain);
      if (this.isNight || speed < 0.3) {
        e.energy = Math.min(100, e.energy + 0.04 * dt);
      }

      // Trail
      e.trail.push({ x: e.x, y: e.y });
      if (e.trail.length > e.trailMaxLen) e.trail.shift();

      // Humeur drift
      e.mood += (Math.random() - 0.5) * 0.0005 * dt;
      e.mood  = Math.max(-1, Math.min(1, e.mood));

      // Social
      e.social += (Math.random() - 0.5) * 0.02 * dt;
      e.social  = Math.max(0, Math.min(100, e.social));

      // État
      this._updateState(e, dt);
    }
  }

  // ── Gestion des projets ───────────────────────────────────────────────────
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

        for (const e of this.entities) {
          if (proj.participants.has(e.id)) {
            e.mood   = Math.min(1, e.mood + proj.moodReward);
            e.energy = Math.min(100, e.energy + proj.energyReward);
            if (e.state === STATE.PROJET) {
              e.state = STATE.SOCIAL;
              e._stateTimer = 0;
            }
          }
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

    if (e._stateTimer < minTime) return;

    let newState = e.state;

    if (e.state === STATE.PROJET) {
      const nearProject = this.projects.some(p =>
        !p.resolved && !p.isExpired &&
        Math.hypot(p.x - e.x, p.y - e.y) < p.radius
      );
      if (nearProject) return;
    }

    if (e.energy < 20) {
      newState = STATE.REPOS;
    } else if (e.state === STATE.FUITE && e._stateTimer > 2000) {
      newState = STATE.ERRANCE;
    } else if (e.mood > 0.4 && e.character.socialite > 0.5 && !this.isNight) {
      newState = STATE.SOCIAL;
    } else if (e.energy > 70 && e.character.extraversion > 0.6) {
      newState = STATE.ACTIF;
    } else if (e.energy < 40) {
      newState = STATE.ERRANCE;
    }

    if (newState !== e.state) {
      e.state = newState;
      e._stateTimer = 0;
    }
  }

  // ── Rendu Canvas ──────────────────────────────────────────────────────────
  _render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;

    // Fond persistant
    ctx.fillStyle = this.isNight ? 'rgba(5,8,20,0.22)' : 'rgba(15,17,23,0.22)';
    ctx.fillRect(0, 0, W, H);

    if (this.isNight) {
      ctx.fillStyle = 'rgba(10,10,40,0.10)';
      ctx.fillRect(0, 0, W, H);
    }

    // Overlay événement global
    if (this.activeEvent && this._eventBannerOpacity > 0) {
      this._renderEventOverlay(ctx, W, H);
    }

    // Lignes de connexion
    const entities = this.entities;
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i], b = entities[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < this.INTERACTION_RADIUS) {
          const alpha = (1 - dist / this.INTERACTION_RADIUS) * 0.3;
          const affinity = a.getAffinityWith(b.id);
          const lineAlpha = alpha + affinity * 0.2;

          // Mise en évidence si l'une des deux est sélectionnée
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
    }

    // Projets
    for (const proj of this.projects) {
      this._renderProject(ctx, proj);
    }

    // Entités
    for (const e of entities) {
      this._renderEntity(ctx, e);
    }

    // Bannière événement
    if (this.activeEvent && this._eventBannerOpacity > 0) {
      this._renderEventBanner(ctx, W);
    }

    // Panneau inspect
    if (this.selectedEntity) {
      this._renderInspectPanel(ctx, W, H);
    }
  }

  // ── Overlay fond de l'événement ───────────────────────────────────────────
  _renderEventOverlay(ctx, W, H) {
    const ev = this.activeEvent;
    const alpha = this._eventBannerOpacity * 0.06;
    // Parse la couleur hex en composantes
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
    const progress = this._eventTimer / ev.duration; // 0→1

    ctx.save();
    ctx.globalAlpha = alpha;

    // Fond de la bannière
    ctx.fillStyle = ev.color + 'cc';
    ctx.fillRect(0, 0, W, 42);

    // Barre de progression (durée restante)
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 38, W * (1 - progress), 4);

    // Texte
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${ev.label} — ${ev.description}`, W / 2, 21);

    ctx.restore();
  }

  // ── Panneau Inspect (click-to-inspect) ───────────────────────────────────
  _renderInspectPanel(ctx, W, H) {
    const e = this.selectedEntity;
    const PW = 220, PH = 240;
    const PAD = 12;
    const margin = 10;

    // Position : coin bas-droit par défaut, mais on évite de couvrir l'entité
    let px = W - PW - margin;
    let py = H - PH - margin;

    // Si l'entité est dans le coin bas-droit, basculer à gauche
    if (e.x > W * 0.6 && e.y > H * 0.6) px = margin;

    ctx.save();

    // Fond du panneau
    ctx.fillStyle = 'rgba(10,12,25,0.92)';
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px, py, PW, PH, 10);
    ctx.fill();
    ctx.stroke();

    // Ligne décorative de couleur
    ctx.fillStyle = e.color;
    ctx.fillRect(px + PAD, py + 8, 3, PH - 16);

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';

    // ID + état
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = e.color;
    ctx.fillText(e.id, px + PAD + 10, py + PAD);

    const stateColors = {
      ACTIF: '#f1c40f', REPOS: '#95a5a6', SOCIAL: '#2ecc71',
      FUITE: '#e74c3c', ERRANCE: '#9b59b6', PROJET: '#00cec9',
    };
    ctx.font = '11px monospace';
    ctx.fillStyle = stateColors[e.state] || '#fff';
    ctx.fillText(e.state, px + PAD + 10, py + PAD + 22);

    // Humeur + énergie
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px monospace';
    ctx.fillText('HUMEUR', px + PAD + 10, py + 56);
    this._drawBar(ctx, px + PAD + 70, py + 57, 120, 8,
      (e.mood + 1) / 2, e.mood > 0 ? '#2ecc71' : '#e74c3c');

    ctx.fillText('ÉNERGIE', px + PAD + 10, py + 70);
    this._drawBar(ctx, px + PAD + 70, py + 71, 120, 8,
      e.energy / 100, '#f1c40f');

    // Caractère
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('CARACTÈRE', px + PAD + 10, py + 92);

    const traits = [
      ['Extr.', e.character.extraversion],
      ['Agr.', e.character.agression],
      ['Cur.', e.character.curiosite],
      ['Soc.', e.character.socialite],
    ];
    let ty = py + 106;
    for (const [label, val] of traits) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '10px monospace';
      ctx.fillText(label, px + PAD + 10, ty);
      this._drawBar(ctx, px + PAD + 50, ty + 1, 140, 7, val, e.color);
      ty += 14;
    }

    // Top contacts (mémoire des interactions)
    const contacts = e.getTopContacts(3);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('CONTACTS FRÉQUENTS', px + PAD + 10, ty + 4);
    ty += 18;

    if (contacts.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px monospace';
      ctx.fillText('Aucun encore…', px + PAD + 10, ty);
    } else {
      for (const { id, score } of contacts) {
        const other = this.entities.find(x => x.id === id);
        const col = other ? other.color : '#fff';
        ctx.fillStyle = col;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(id, px + PAD + 10, ty);

        // Mini-barre de score (normalisée sur max 50)
        this._drawBar(ctx, px + PAD + 40, ty + 1, 110, 7,
          Math.min(1, score / 30), col);

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '9px monospace';
        ctx.fillText(score.toFixed(1), px + PAD + 155, ty);
        ty += 14;
      }
    }

    // Petit cercle pointant vers l'entité
    ctx.strokeStyle = e.color + '88';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px + PW / 2, py);
    ctx.lineTo(e.x, e.y + e.radius + 4);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  // ── Barre de progression ──────────────────────────────────────────────────
  _drawBar(ctx, x, y, w, h, pct, color) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
  }

  _renderEntity(ctx, e) {
    const r = e.radius;
    const isSelected = (e === this.selectedEntity);

    // Halo de sélection
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
      ctx.strokeStyle = e.color + '44';
      ctx.lineWidth   = r * 0.6;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.stroke();
    }

    // Halo humeur
    if (Math.abs(e.mood) > 0.15) {
      const haloColor = e.mood > 0
        ? `rgba(46,204,113,${(e.mood * 0.35).toFixed(2)})`
        : `rgba(231,76,60,${(-e.mood * 0.35).toFixed(2)})`;
      const haloR = r * (1.6 + Math.abs(e.mood) * 0.8);
      const grad = ctx.createRadialGradient(e.x, e.y, r * 0.5, e.x, e.y, haloR);
      grad.addColorStop(0, haloColor);
      grad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(e.x, e.y, haloR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Cercle principal
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    ctx.fillStyle   = e.color + 'cc';
    ctx.fill();
    ctx.strokeStyle = e.color;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Arc énergie
    const energyAngle = (e.energy / 100) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 5, -Math.PI / 2, energyAngle);
    ctx.strokeStyle = `rgba(255,255,255,0.5)`;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Initiales
    ctx.fillStyle   = '#ffffff';
    ctx.font        = `bold ${e.id.length > 2 ? 10 : 13}px monospace`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.id, e.x, e.y);

    // Point d'état
    const stateColors = {
      [STATE.ACTIF]:   '#f1c40f',
      [STATE.REPOS]:   '#95a5a6',
      [STATE.SOCIAL]:  '#2ecc71',
      [STATE.FUITE]:   '#e74c3c',
      [STATE.ERRANCE]: '#9b59b6',
      [STATE.PROJET]:  '#00cec9',
    };
    ctx.beginPath();
    ctx.arc(e.x + r * 0.65, e.y - r * 0.65, 4, 0, Math.PI * 2);
    ctx.fillStyle = stateColors[e.state] || '#ffffff';
    ctx.fill();

    // Curseur pointer (hint de cliquabilité)
    // Géré côté HTML via cursor CSS — rien à faire ici
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

    const gradient = ctx.createRadialGradient(proj.x, proj.y, r * 0.5, proj.x, proj.y, proj.radius * 1.5);
    gradient.addColorStop(0,   proj.color + '22');
    gradient.addColorStop(0.5, proj.color + '11');
    gradient.addColorStop(1,   'transparent');
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

    let html = `<div class="cycle-indicator">${cycleLabel} — ${pct}%</div>`;

    // Événement actif
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
      html += `
        <div class="entity-row${isSelected ? ' entity-row--selected' : ''}" data-id="${e.id}" style="${isSelected ? `border-left:2px solid ${e.color};padding-left:4px` : ''}">
          <span class="entity-dot" style="background:${e.color}"></span>
          <span class="entity-id">${e.id}</span>
          <span class="entity-state state-${e.state.toLowerCase()}">${e.state}</span>
          <span class="entity-stat">⚡${energyPct}</span>
          <span class="entity-stat ${moodClass}">😊${moodBar}%</span>
        </div>`;
    }

    html += `</div>`;

    // Hint click
    html += `<div style="margin-top:8px;font-size:9px;color:#555;text-align:center">Clic sur entité pour inspecter</div>`;

    this.infoPanel.innerHTML = html;
  }
}
