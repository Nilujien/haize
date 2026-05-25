/**
 * simulation.js
 * Boucle principale, physique, interactions, rendu Canvas.
 */

import { Entity, ENTITY_DEFS, AFFINITES, STATE } from './entities.js';

// ─── Bruit de Perlin simplifié (2D, implémentation légère) ────────────────────
// Source : adapté du domaine public (Ken Perlin)
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

// ─── Simulation ───────────────────────────────────────────────────────────────
export class Simulation {
  constructor(canvas, infoPanel) {
    this.canvas     = canvas;
    this.ctx        = canvas.getContext('2d');
    this.infoPanel  = infoPanel;

    // Paramètres globaux
    this.paused        = false;
    this.speedFactor   = 1.0;     // multiplié par deltaTime
    this.dayDuration   = 30000;   // ms — durée d'un cycle (jour+nuit)
    this.nightRatio    = 0.35;    // fraction du cycle = nuit
    this.isNight       = false;
    this.cycleStart    = performance.now();

    // Entités
    this.entities = ENTITY_DEFS.map(def =>
      new Entity(def, canvas.width, canvas.height));

    // Frame loop
    this._lastTime   = performance.now();
    this._rafId      = null;

    // Constantes physique
    this.INTERACTION_RADIUS   = 180;  // px — zone d'influence
    this.CONFLICT_RADIUS      = 60;   // px — zone de conflit
    this.FRICTION             = 0.92; // amortissement vélocité
    this.MAX_SPEED            = 4.5;
    this.NOISE_SCALE          = 0.003;
    this.NOISE_SPEED          = 0.0005;
    this._noiseTime           = 0;
  }

  // ── Resize ─────────────────────────────────────────────────────────────────
  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  reset() {
    this.entities = ENTITY_DEFS.map(def =>
      new Entity(def, this.canvas.width, this.canvas.height));
    this.cycleStart = performance.now();
    this.isNight    = false;
  }

  // ── Boucle principale ──────────────────────────────────────────────────────
  start() {
    const loop = (now) => {
      const rawDt = Math.min(now - this._lastTime, 50); // cap 50ms
      this._lastTime = now;
      if (!this.paused) {
        const dt = rawDt * this.speedFactor;
        this._updateCycle(now);
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

  // ── Mise à jour physique ───────────────────────────────────────────────────
  _update(dt) {
    const entities = this.entities;
    const W = this.canvas.width, H = this.canvas.height;

    this._noiseTime += dt * this.NOISE_SPEED;

    for (const e of entities) {
      // --- Bruit de Perlin (déplacement organique) ---
      const nx = PERLIN.noise(
        e._noiseOffsetX + e.x * this.NOISE_SCALE,
        this._noiseTime
      );
      const ny = PERLIN.noise(
        e._noiseOffsetY + e.y * this.NOISE_SCALE,
        this._noiseTime + 100
      );
      const noiseForce = 0.04 * (0.3 + e.character.curiosite * 0.7);
      e.vx += nx * noiseForce;
      e.vy += ny * noiseForce;

      // --- Interactions avec les autres entités ---
      for (const other of entities) {
        if (other === e) continue;
        const dx = other.x - e.x;
        const dy = other.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx2 = dx / dist, ny2 = dy / dist;

        // Conflit : deux agressifs proches → répulsion violente
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
          const t = 1 - dist / this.INTERACTION_RADIUS; // 0..1

          // Affinité spéciale
          const affinity = e.getAffinityWith(other.id);

          // Force d'attraction / répulsion selon caractère
          const socialForce = (e.character.socialite + other.character.socialite) / 2;
          const attractBase = socialForce - 0.3; // positif=attraction, négatif=répulsion
          const force = (attractBase + affinity * 0.5) * t * 0.015;

          e.vx += nx2 * force;
          e.vy += ny2 * force;

          // Humeur — interaction positive si mood compatible
          if (dist < this.INTERACTION_RADIUS * 0.5) {
            const moodDelta = other.mood * 0.0003 * dt;
            e.mood = Math.max(-1, Math.min(1, e.mood + moodDelta));

            // Énergie — entités sociables rechargent près des autres
            if (e.character.socialite > 0.6) {
              e.energy = Math.min(100, e.energy + 0.003 * dt);
            }
          }
        }
      }

      // --- Nuit : ralentissement & recharge ---
      const nightMult = this.isNight ? 0.3 : 1.0;

      // Friction + cap vitesse
      e.vx *= this.FRICTION;
      e.vy *= this.FRICTION;
      const speed = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
      const maxSpd = this.MAX_SPEED * nightMult *
                     (0.4 + e.character.extraversion * 0.6);
      if (speed > maxSpd) {
        e.vx = (e.vx / speed) * maxSpd;
        e.vy = (e.vy / speed) * maxSpd;
      }

      // Déplacement
      e.x += e.vx * dt * 0.1;
      e.y += e.vy * dt * 0.1;

      // Rebond sur les bords
      if (e.x < e.radius) { e.x = e.radius; e.vx = Math.abs(e.vx) * 0.6; }
      if (e.x > W - e.radius) { e.x = W - e.radius; e.vx = -Math.abs(e.vx) * 0.6; }
      if (e.y < e.radius) { e.y = e.radius; e.vy = Math.abs(e.vy) * 0.6; }
      if (e.y > H - e.radius) { e.y = H - e.radius; e.vy = -Math.abs(e.vy) * 0.6; }

      // --- Énergie ---
      const energyDrain = speed * 0.002 * dt * (1 - this.isNight * 0.8);
      e.energy = Math.max(0, e.energy - energyDrain);
      if (this.isNight || speed < 0.3) {
        e.energy = Math.min(100, e.energy + 0.04 * dt);
      }

      // --- Trail ---
      e.trail.push({ x: e.x, y: e.y });
      if (e.trail.length > e.trailMaxLen) e.trail.shift();

      // --- Humeur drift ---
      e.mood += (Math.random() - 0.5) * 0.0005 * dt;
      e.mood  = Math.max(-1, Math.min(1, e.mood));

      // --- Social stat ---
      e.social += (Math.random() - 0.5) * 0.02 * dt;
      e.social  = Math.max(0, Math.min(100, e.social));

      // --- Transitions d'état ---
      this._updateState(e, dt);
    }
  }

  // ── Transitions d'état ────────────────────────────────────────────────────
  _updateState(e, dt) {
    e._stateTimer += dt;
    const minTime = 800; // ms minimum dans un état

    if (e._stateTimer < minTime) return;

    let newState = e.state;

    if (e.energy < 20) {
      newState = STATE.REPOS;
    } else if (e.state === STATE.FUITE && e._stateTimer > 2000) {
      newState = STATE.ERRANCE;
    } else if (e.mood > 0.4 && e.character.socialite > 0.5 && this.isNight === false) {
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

    // Fond avec légère persistance (effet trail global)
    ctx.fillStyle = this.isNight ? 'rgba(5,8,20,0.22)' : 'rgba(15,17,23,0.22)';
    ctx.fillRect(0, 0, W, H);

    // Overlay nuit subtil
    if (this.isNight) {
      ctx.fillStyle = 'rgba(10,10,40,0.10)';
      ctx.fillRect(0, 0, W, H);
    }

    // ── Lignes de connexion ─────────────────────────────────────────────────
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

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = affinity > 0
            ? `rgba(255,220,100,${lineAlpha.toFixed(2)})`
            : `rgba(150,160,200,${lineAlpha.toFixed(2)})`;
          ctx.lineWidth = affinity > 0 ? 1.5 : 0.8;
          ctx.stroke();
        }
      }
    }

    // ── Entités ─────────────────────────────────────────────────────────────
    for (const e of entities) {
      this._renderEntity(ctx, e);
    }
  }

  _renderEntity(ctx, e) {
    const r = e.radius;

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

    // Indicateur énergie (arc extérieur)
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

    // Indicateur d'état (petit point coloré)
    const stateColors = {
      [STATE.ACTIF]:   '#f1c40f',
      [STATE.REPOS]:   '#95a5a6',
      [STATE.SOCIAL]:  '#2ecc71',
      [STATE.FUITE]:   '#e74c3c',
      [STATE.ERRANCE]: '#9b59b6',
    };
    ctx.beginPath();
    ctx.arc(e.x + r * 0.65, e.y - r * 0.65, 4, 0, Math.PI * 2);
    ctx.fillStyle = stateColors[e.state] || '#ffffff';
    ctx.fill();
  }

  // ── Panel info ────────────────────────────────────────────────────────────
  _updatePanel() {
    if (!this.infoPanel) return;
    const cycleElapsed = (performance.now() - this.cycleStart) % this.dayDuration;
    const pct = Math.round((cycleElapsed / this.dayDuration) * 100);
    const cycleLabel = this.isNight ? '🌙 Nuit' : '☀️ Jour';

    let html = `<div class="cycle-indicator">${cycleLabel} — ${pct}%</div>`;
    html += `<div class="entity-list">`;

    for (const e of this.entities) {
      const moodClass = e.mood > 0.2 ? 'mood-pos' : e.mood < -0.2 ? 'mood-neg' : 'mood-neu';
      const moodBar   = Math.round((e.mood + 1) / 2 * 100);
      const energyPct = Math.round(e.energy);
      html += `
        <div class="entity-row">
          <span class="entity-dot" style="background:${e.color}"></span>
          <span class="entity-id">${e.id}</span>
          <span class="entity-state state-${e.state.toLowerCase()}">${e.state}</span>
          <span class="entity-stat">⚡${energyPct}</span>
          <span class="entity-stat ${moodClass}">😊${moodBar}%</span>
        </div>`;
    }

    html += `</div>`;
    this.infoPanel.innerHTML = html;
  }
}
