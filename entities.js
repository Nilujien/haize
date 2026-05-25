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
// Chaque type a un nom, une couleur, une difficulté, et des affinités de caractère
// (les entités dont le caractère correspond contribuent plus vite)
export const PROJECT_TYPES = [
  {
    type: 'EXPLORATION',
    label: '🔭 Exploration',
    color: '#00cec9',
    difficulty: 60,          // points à accumuler pour résoudre
    radius: 70,              // rayon d'attraction
    affinity: 'curiosite',   // caractère qui booste la contribution
    moodReward: 0.35,        // bonus humeur à la résolution
    energyReward: 25,        // bonus énergie à la résolution
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
    // Choisir un type aléatoire
    const def = PROJECT_TYPES[Math.floor(Math.random() * PROJECT_TYPES.length)];
    Object.assign(this, def);

    // Position aléatoire (marges pour rester visible)
    const margin = 100;
    this.x = margin + Math.random() * (canvasW - margin * 2);
    this.y = margin + Math.random() * (canvasH - margin * 2);

    // Progression
    this.progress    = 0;           // 0 → difficulty = résolu
    this.resolved    = false;
    this.resolvedAt  = null;        // timestamp pour animation de fin
    this.participants = new Set();  // ids des entités contribuant

    // Animation de pulsation
    this._phase      = Math.random() * Math.PI * 2;

    // Durée de vie max (si personne ne vient) : 45s
    this.spawnedAt   = performance.now();
    this.maxLifetime = 45000;
  }

  get progressPct() { return Math.min(1, this.progress / this.difficulty); }
  get isExpired()   { return !this.resolved && (performance.now() - this.spawnedAt) > this.maxLifetime; }
}

// ─── Affinités prédéfinies (paires qui s'attirent fortement) ──────────────────
// Format : ['ID1', 'ID2', force] — force ∈ [0,1]
export const AFFINITES = [
  ['ER',  'SB',  0.85],   // ER & SB — complicité ancienne
  ['JG',  'AM',  0.80],   // JG & AM — curiosité partagée
  ['LD',  'CM',  0.75],   // LD & CM — pacifisme commun
  ['FT',  'TR',  0.90],   // FT & TR — duo énergique
  ['GD',  'IM',  0.70],   // GD & IM — prudence & introspection
  ['LPL', 'JC',  0.65],   // LPL & JC — sociabilité douce
];

// ─── Classe Entity ─────────────────────────────────────────────────────────────
export class Entity {
  /**
   * @param {object} def  — définition issue de ENTITY_DEFS
   * @param {number} canvasW
   * @param {number} canvasH
   */
  constructor(def, canvasW, canvasH) {
    // Identité
    this.id       = def.id;
    this.color    = def.color;
    this.radius   = 22;

    // Caractère (valeurs 0-1)
    this.character = { ...def.character };

    // Position initiale aléatoire avec marges
    const margin = 60;
    this.x  = margin + Math.random() * (canvasW - margin * 2);
    this.y  = margin + Math.random() * (canvasH - margin * 2);

    // Vélocité initiale
    const speed = 0.5 + this.character.extraversion * 1.5;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    // Stats
    this.energy = 60 + Math.random() * 40;
    this.social = 30 + Math.random() * 70;
    this.mood   = (Math.random() * 2 - 1) * 0.3;  // ∈ [-1, 1]

    // État courant
    this.state = STATE.ERRANCE;

    // Trail — positions récentes
    this.trail = [];
    this.trailMaxLen = 18;

    // Timer interne pour transitions d'état
    this._stateTimer = 0;

    // Bruit de Perlin — offset unique par entité
    this._noiseOffsetX = Math.random() * 1000;
    this._noiseOffsetY = Math.random() * 1000;
  }

  // ── Accès aux affinités ─────────────────────────────────────────────────────
  getAffinityWith(otherId) {
    for (const [a, b, force] of AFFINITES) {
      if ((a === this.id && b === otherId) ||
          (b === this.id && a === otherId)) return force;
    }
    return 0;
  }
}

// ─── Définitions des 12 entités ───────────────────────────────────────────────
// character fields (all 0-1) :
//   extraversion  : 0 = introverti,  1 = extraverti
//   agression     : 0 = pacifique,   1 = agressif
//   curiosite     : 0 = prudent,     1 = curieux
//   socialite     : 0 = solitaire,   1 = sociable
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
