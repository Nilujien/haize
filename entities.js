/**
 * entities.js
 * Définition des entités, de leurs caractères, stats initiales et affinités.
 */

// ─── États possibles ───────────────────────────────────────────────────────────
export const STATE = {
  ACTIF:    'ACTIF',
  REPOS:    'REPOS',
  SOCIAL:   'SOCIAL',
  FUITE:    'FUITE',
  ERRANCE:  'ERRANCE',
  PROJET:   'PROJET',   // engagé sur un projet
};

// ─── Types de projets ─────────────────────────────────────────────────────────
export const PROJECT_TYPES = [
  {
    type: 'EXPLORATION',
    label: '🔭 Exploration',
    color: '#00cec9',
    difficulty: 60,
    radius: 70,
    affinity: 'curiosite',
    moodReward: 0.35,
    energyReward: 25,
  },
  {
    type: 'CONFLIT',
    label: '⚔️ Conflit',
    color: '#d63031',
    difficulty: 80,
    radius: 80,
    affinity: 'agression',
    moodReward: 0.20,
    energyReward: 15,
  },
  {
    type: 'CELEBRATION',
    label: '🎉 Célébration',
    color: '#fdcb6e',
    difficulty: 50,
    radius: 90,
    affinity: 'socialite',
    moodReward: 0.50,
    energyReward: 30,
  },
  {
    type: 'CONSTRUCTION',
    label: '🏗️ Construction',
    color: '#6c5ce7',
    difficulty: 100,
    radius: 75,
    affinity: 'extraversion',
    moodReward: 0.40,
    energyReward: 20,
  },
  {
    type: 'MEDITATION',
    label: '🧘 Méditation',
    color: '#a29bfe',
    difficulty: 40,
    radius: 60,
    affinity: 'curiosite',
    moodReward: 0.30,
    energyReward: 35,
  },
];

// ─── Classe Project ────────────────────────────────────────────────────────────
export class Project {
  constructor(canvasW, canvasH) {
    const def = PROJECT_TYPES[Math.floor(Math.random() * PROJECT_TYPES.length)];
    Object.assign(this, def);

    const margin = 100;
    this.x = margin + Math.random() * (canvasW - margin * 2);
    this.y = margin + Math.random() * (canvasH - margin * 2);

    this.progress    = 0;
    this.resolved    = false;
    this.resolvedAt  = null;
    this.participants = new Set();

    this._phase      = Math.random() * Math.PI * 2;

    this.spawnedAt   = performance.now();
    this.maxLifetime = 45000;
  }

  get progressPct() { return Math.min(1, this.progress / this.difficulty); }
  get isExpired()   { return !this.resolved && (performance.now() - this.spawnedAt) > this.maxLifetime; }
}

// ─── Affinités prédéfinies ─────────────────────────────────────────────────────
export const AFFINITES = [
  ['ER',  'SB',  0.85],
  ['JG',  'AM',  0.80],
  ['LD',  'CM',  0.75],
  ['FT',  'TR',  0.90],
  ['GD',  'IM',  0.70],
  ['LPL', 'JC',  0.65],
];

// ─── Classe Entity ─────────────────────────────────────────────────────────────
export class Entity {
  constructor(def, canvasW, canvasH) {
    this.id       = def.id;
    this.color    = def.color;
    this.radius   = 22;

    this.character = { ...def.character };

    const margin = 60;
    this.x  = margin + Math.random() * (canvasW - margin * 2);
    this.y  = margin + Math.random() * (canvasH - margin * 2);

    const speed = 0.5 + this.character.extraversion * 1.5;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    this.energy = 60 + Math.random() * 40;
    this.social = 30 + Math.random() * 70;
    this.mood   = (Math.random() * 2 - 1) * 0.3;

    this.state = STATE.ERRANCE;

    this.trail = [];
    this.trailMaxLen = 18;

    this._stateTimer = 0;

    this._noiseOffsetX = Math.random() * 1000;
    this._noiseOffsetY = Math.random() * 1000;

    // Mémoire des interactions : accumule le temps passé près de chaque autre entité
    this.interactionLog = {};

    // Mémoire des succès : nombre de projets résolus avec participation de cette entité
    this.successCount = 0;
  }

  getAffinityWith(otherId) {
    for (const [a, b, force] of AFFINITES) {
      if ((a === this.id && b === otherId) ||
          (b === this.id && a === otherId)) return force;
    }
    return 0;
  }

  // Retourne les top N entités les plus fréquemment côtoyées
  getTopContacts(n = 3) {
    return Object.entries(this.interactionLog)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id, score]) => ({ id, score }));
  }
}

// ─── Définitions des 12 entités ───────────────────────────────────────────────
export const ENTITY_DEFS = [
  {
    id: 'ER', color: '#e74c3c',
    label: 'Extraverti · Agressif · Curieux',
    character: { extraversion: 0.85, agression: 0.70, curiosite: 0.80, socialite: 0.65 },
  },
  {
    id: 'SB', color: '#e67e22',
    label: 'Sociable · Pacifique · Prudent',
    character: { extraversion: 0.60, agression: 0.15, curiosite: 0.40, socialite: 0.90 },
  },
  {
    id: 'JG', color: '#f1c40f',
    label: 'Curieux · Introverti · Pacifique',
    character: { extraversion: 0.30, agression: 0.10, curiosite: 0.95, socialite: 0.45 },
  },
  {
    id: 'LD', color: '#2ecc71',
    label: 'Calme · Solitaire · Pacifique',
    character: { extraversion: 0.20, agression: 0.05, curiosite: 0.50, socialite: 0.20 },
  },
  {
    id: 'FT', color: '#1abc9c',
    label: 'Hyperactif · Agressif · Sociable',
    character: { extraversion: 0.95, agression: 0.75, curiosite: 0.60, socialite: 0.80 },
  },
  {
    id: 'TR', color: '#3498db',
    label: 'Énergique · Curieux · Extraverti',
    character: { extraversion: 0.90, agression: 0.50, curiosite: 0.85, socialite: 0.70 },
  },
  {
    id: 'CM', color: '#9b59b6',
    label: 'Médiateur · Sociable · Doux',
    character: { extraversion: 0.55, agression: 0.08, curiosite: 0.65, socialite: 0.88 },
  },
  {
    id: 'GD', color: '#8e44ad',
    label: 'Prudent · Introverti · Réservé',
    character: { extraversion: 0.15, agression: 0.20, curiosite: 0.35, socialite: 0.30 },
  },
  {
    id: 'IM', color: '#2980b9',
    label: 'Introspectif · Solitaire · Sensible',
    character: { extraversion: 0.10, agression: 0.05, curiosite: 0.70, socialite: 0.15 },
  },
  {
    id: 'LPL', color: '#27ae60',
    label: 'Jovial · Sociable · Pacifique',
    character: { extraversion: 0.75, agression: 0.10, curiosite: 0.55, socialite: 0.92 },
  },
  {
    id: 'JC', color: '#d35400',
    label: 'Charismatique · Curieux · Ambitieux',
    character: { extraversion: 0.80, agression: 0.45, curiosite: 0.88, socialite: 0.75 },
  },
  {
    id: 'AM', color: '#c0392b',
    label: 'Rêveuse · Curieuse · Introvertie',
    character: { extraversion: 0.25, agression: 0.08, curiosite: 0.92, socialite: 0.40 },
  },
];
