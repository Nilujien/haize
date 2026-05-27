# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 22:23 (Jubis — cron planification)_

---

## Bilan du tour précédent (exécuté avant ce cron)

Les 3 priorités du dernier plan N'ont PAS encore été implémentées — elles restent au programme.  
Le code est stable, aucune régression détectée.

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Architecture FSM 9 états — stable et cohérente
- Trail coloré selon état FSM — lisibilité immédiate
- 3 caches liens (friend/rancor/recruit) — O(n²) sorti du hot path
- Heatmap LUT + OffscreenCanvas — perf propre
- Cycle jour/nuit, étoiles, lune, decay rancune au crépuscule
- Panneau inspect complet : sparkline, contacts, expérience, rancœurs, zones
- Budget frame confortable : update ~3-6ms, render ~3-7ms → 60fps tenu

### Qualité globale
Le code est bien structuré et commenté. La simulation "vit" de façon plausible.  
Principaux points à améliorer : feedback visuel global manquant (on ne voit pas facilement le résumé des états), et la simulation manque encore d'événements locaux spontanés qui créeraient des moments narratifs sans intervention du joueur.

---

## Bugs / régressions détectés

### Bug 1 — `introFactor` sémantiquement incohérent (simulation.js ~l.390)
Deux `introFactor` distincts coexistent dans `_update` :
- Ligne ~390 : `const introFactor = 1 - e.character.socialite` → utilisé pour la charge sociale
- Ligne ~401 : `const introFactor2 = 1 - e.character.extraversion` → utilisé pour la territorialité

Le premier utilise `socialite` comme proxy d'introversion alors que `extraversion` est la variable sémantiquement correcte. Par exemple, IM (extraversion=0.10, socialite=0.15) donne introFactor=0.85 dans les deux cas — cohérent par accident. Mais SB (extraversion=0.60, socialite=0.90) donne introFactor=0.10 via socialite vs 0.40 via extraversion — différence significative.

**Fix recommandé :** Normaliser sur `extraversion` partout. Rename `introFactor` → `extravertFactor` (0=introverti) et supprimer `introFactor2`.

### Bug 2 — Double boucle O(n²) résiduelle dans `_renderFriendshipLinks` (simulation.js fin de méthode)
La "passe cœur rapproché" en fin de `_renderFriendshipLinks` refait une double boucle complète sur `this.entities` pour les paires proches (dist < INTERACTION_RADIUS). Avec 12 entités c'est ~66 paires / frame, négligeable aujourd'hui mais la logique devrait utiliser le cache `_activeFriendLinks` (qui inclut `isClose: true` pour ces cas). La boucle séparée est donc redondante.

**Fix recommandé :** Utiliser le cache `_activeFriendLinks` avec le flag `isClose` déjà calculé pour cette passe — éliminer la double boucle inline.

### Bug 3 — `energyDrain` formulation obscure (simulation.js ~l.670)
```js
const energyDrain = speed * 0.002 * dt * (1 - (this.isNight ? 1 : 0) * 0.8);
```
La nuit → facteur 0.2, le jour → 1.0. C'est correct mais illisible.  
**Fix :** `const energyDrain = speed * 0.002 * dt * (this.isNight ? 0.2 : 1.0);`

### Observation — Pas de cap de durée pour CONCENTRE
Contrairement à EUPHORIQUE qui a un cap de 15-25s, CONCENTRE peut durer indéfiniment si `energy < 20` et `mood > -0.3`. Une entité épuisée avec mood neutre peut rester CONCENTRÉ des minutes entières. C'est plausible (retraite prolongée) mais mérite une borne max optionnelle (ex: 60s).

---

## Perf

Budget frame mesuré : **update 3-6ms, render 3-7ms** → 60fps avec marge ~45%.  
L'adaptive render skip (skip 1 frame/2 si update > 8ms) est fonctionnel.  
Le spatial partitioning reste une optimisation préventive, non urgente.

**Goulot potentiel :** Le `ImageData` fillRect dans `Heatmap.render()` fait des boucles pixel par pixel (`for py / for px`). Sur un écran 1920×1080, les cellules remplissent ~5184 cellules × 20×20px = potentiellement coûteux. La LUT est bien précalculée, mais la boucle double reste dans le hot path lors d'un `_dirty`. Impact estimé : 1-3ms lors des dirties (toutes les 5s).

---

## Priorités recommandées pour le prochain tour

### 1. 📊 Compteurs d'état dans le panneau info (15 min) — PRIORITÉ HAUTE

**Pourquoi :** Le panneau liste les 12 entités une par une mais ne donne pas de vision d'ensemble instantanée. Un seul regard devrait permettre de savoir "3 entités sont euphoriques, 2 en fuite, 1 saturé".

**Comment :**  
Dans `_updatePanel()`, ajouter une section `<div class="state-summary">` juste après le `cycle-indicator`, qui compte les entités par état :

```js
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
```

Ajouter le style CSS `.state-summary` : font 9px, couleur rgba(255,255,255,0.5), padding 4px 0, border-bottom 1px solid rgba(255,255,255,0.07).

### 2. 🎭 Micro-événements spontanés locaux (25 min) — PRIORITÉ HAUTE

**Pourquoi :** La simulation manque de "moments" narratifs spontanés. Les événements globaux (FÊTE, TEMPÊTE…) couvrent le macro, mais pas les drames individuels. L'ajout de déclencheurs locaux basés sur les données existantes (rancœurs, affinités) créerait des histoires sans intervention.

**Comment :**  
Ajouter `_updateSpontaneousEvents(dt)` dans la boucle `_update`, appelé après `_updateGlobalEvents`. Fréquence : vérification toutes les 2s (timer `_spontaneousTimer`).

```js
// Toutes les 2s de jeu
_spontaneousEventCheck(entities) {
  // 1. Dispute spontanée entre deux ennemis proches
  for (const [ck, count] of Object.entries(this._conflictCount)) {
    if (count < 4) continue;
    const [idA, idB] = ck.split('-');
    const a = entities.find(e => e.id === idA);
    const b = entities.find(e => e.id === idB);
    if (!a || !b) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) > 120) continue;
    if (Math.random() > 0.15) continue; // 15% de chance si proches
    // Déclencher fuite mutuelle + log
    a.mood = Math.max(-1, a.mood - 0.2);
    b.mood = Math.max(-1, b.mood - 0.2);
    a.state = STATE.FUITE; a._stateTimer = 0;
    b.state = STATE.FUITE; b._stateTimer = 0;
    this._spawnFloatingEmoji((a.x+b.x)/2, (a.y+b.y)/2, '💥');
    this.pushEvent(`💥 Dispute! ${idA} ↔ ${idB} (rancune ×${count})`, '#e74c3c', 'conflict');
    return; // un seul événement par check
  }
  // 2. Contagion d'euphorie entre amis proches
  for (const { a, b, score } of this._activeFriendLinks) {
    if (score < 30) continue;
    if (a.state !== STATE.EUPHORIQUE && b.state !== STATE.EUPHORIQUE) continue;
    const euphoricOne = a.state === STATE.EUPHORIQUE ? a : b;
    const other = euphoricOne === a ? b : a;
    if (other.state === STATE.SATURE || other.state === STATE.CONCENTRE) continue;
    if (Math.random() > 0.12) continue;
    other.mood = Math.min(1, other.mood + 0.25);
    other.energy = Math.min(100, other.energy + 10);
    this._spawnFloatingEmoji(other.x, other.y, '✨');
    this.pushEvent(`✨ ${euphoricOne.id} entraîne ${other.id} dans l'euphorie`, euphoricOne.color, 'social');
    return;
  }
}
```

### 3. 🔧 Fix double boucle `_renderFriendshipLinks` (10 min) — PRIORITÉ BASSE

Utiliser le flag `isClose` déjà dans le cache `_activeFriendLinks` pour éliminer la passe inline O(n²) en fin de méthode. Remplacer la boucle `for (let i = 0; i < this.entities.length; i++) { for (let j...)...}` par un filtre sur `_activeFriendLinks.filter(l => l.isClose && l.score >= 40)`.

---

## Contraintes à respecter

- `SAVE_KEY = 'haize_save_v1'` — ne pas changer
- FSM 9 états — ne pas modifier `STATE` ni la logique `_updateState`
- `PROJECT_MAX = 3`, 12 entités, `ENTITY_DEFS` — structures immuables
- Ne pas toucher à `Heatmap` (risque de régression perf)
- Pas d'`async` dans la boucle de rendu
- `_activeFriendLinks` structure `{ a, b, score, strength, isClose }` — stable
- `_activeRecruitLinks` structure `{ recruiter, other, aff, dist }` — stable
- `_activeRancorLinks` structure `{ a, b, count, dist }` — stable
- Le check spontané ne doit déclencher qu'UN seul événement par vérification (early return) pour éviter le spam

## Code à écrire (extraits prêts)

### Compteur d'états — CSS à ajouter dans style.css
```css
.state-summary {
  font-size: 9px;
  color: rgba(255,255,255,0.5);
  padding: 4px 0 6px 0;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  line-height: 1.5;
  word-break: break-all;
}
```

### Timer spontané — à ajouter dans `constructor`
```js
this._spontaneousTimer = 0;
this.SPONTANEOUS_INTERVAL = 2000; // ms game time
```

### Appel dans `_update` (juste après `_updateProjects`)
```js
this._spontaneousTimer += dt;
if (this._spontaneousTimer >= this.SPONTANEOUS_INTERVAL) {
  this._spontaneousTimer = 0;
  this._spontaneousEventCheck(entities);
}
```
