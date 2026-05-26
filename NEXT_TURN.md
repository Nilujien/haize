# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 01:15_

---

## Bilan du tour précédent (01:02–01:15)

### Ce qui a été implémenté

1. **Fix machine d'états — FUITE sans _stateTimer reset** (bug critique)
   - Avant : `e.state = STATE.FUITE` dans les conflits sans reset du timer → la fuite était immédiatement écrasée par `_updateState()`
   - Maintenant : `e._stateTimer = 0` ajouté → les conflits sont visuellement visibles

2. **Fix auto-event logging** (bug silencieux)
   - Les événements globaux déclenchés automatiquement ne loggaient pas dans la console HTML
   - Ajout de `pushEvent()` après auto-trigger → cohérence avec le déclenchement manuel

3. **Affinités dynamiques** (feature comportementale)
   - `getAffinityWith()` dans `entities.js` prend maintenant en compte `interactionLog`
   - Bonus max +0.4 après ~50 unités d'interaction accumulées
   - Les entités qui passent du temps ensemble s'attirent progressivement davantage

4. **Nuit enrichie — étoiles + lune** (feature visuelle)
   - 80 étoiles procédurales avec scintillement sinusoïdal (~0.001ms/frame)
   - Lune en coin supérieur droit avec halo radial
   - Générées une seule fois dans le constructor → coût render négligeable

5. **Heatmap LUT précalculée** (optimisation perf)
   - LUT de 256 entrées [r, g, b, a] générée dans `_buildLUT()` à chaque `resize()`
   - Élimine les branches if/else par cellule dans la boucle ImageData → ~3× plus rapide sur dirty frames

6. **Fix energyDrain — cast explicite** (robustesse)
   - `(1 - this.isNight * 0.8)` → `(1 - (this.isNight ? 1 : 0) * 0.8)` : plus de coercion implicite

### Ce qui a été laissé de côté

- **Cache gradient humeur** : `createRadialGradient` à chaque frame pour les entités avec `absMood > 0.15` — toujours présent. Pas critique pour 12 entités, mais un bon quick win si perf se dégrade.
- **Fusion des passes de rendu** (lignes de proximité + friendship links) : pas touché, effort moyen et risque de régression.
- **Suppression de `_renderEventLog()`** (dead code) : toujours présent en bas du fichier. À nettoyer au prochain tour.
- **Cache gradient territoire / effectiveRadius animé** : bug esthétique mineur, non prioritaire.

---

## Analyse de l'état actuel (post-tour)

### Ce qui fonctionne bien
- Machine d'états cohérente : les conflits génèrent maintenant de vraies fuites visibles
- Console événements complète : tous les déclenchements (manuels + automatiques) apparaissent
- Comportement social enrichi : les affinités évoluent avec le temps → relations émergentes
- Nuit visuellement plus riche : étoiles scintillantes + lune avec halo
- Heatmap LUT : boost perf sur les dirty frames (profil de ~2M pixel-writes)

### Points à surveiller
- Les affinités dynamiques peuvent accumuler vite si deux entités sont constamment en contact → vérifier que `Math.min(1, base + dynamic)` tient le cap visuellement
- La lune est fixe (coin supérieur droit) → envisager une position dynamique basée sur le cycle si le temps passe

---

## Bugs restants

| # | Fichier | Description |
|---|---------|-------------|
| 1 | `simulation.js` | `_renderEventLog()` dead code à supprimer (L~1930) |
| 2 | `simulation.js` | Cache gradient territoire stale (effectiveRadius animé) — esthétique mineur |
| 3 | `simulation.js` | `createRadialGradient` pour mood non mis en cache — perf mineure |

---

## Priorités recommandées pour le prochain tour

### 1. Nettoyage — Supprimer `_renderEventLog()` (5 min, dette technique)
Dead code confirmé, crée de la confusion. À supprimer.

### 2. Cache gradient humeur (15 min, perf légère)
```js
// Dans _renderEntities, avant ctx.fillStyle = moodGrad :
if (!e._moodGrad || Math.abs(e.mood - (e._moodGradMood || 0)) > 0.05) {
  e._moodGrad = ctx.createRadialGradient(...);
  e._moodGradMood = e.mood;
}
const moodGrad = e._moodGrad;
```

### 3. Feature : Position dynamique de la lune selon le cycle (20 min, visuel)
Faire orbiter la lune en arc pendant la nuit :
```js
// Dans _render, section étoiles :
const nightProgress = ...; // 0..1 basé sur elapsed dans la phase nuit
const moonAngle = Math.PI * (0.1 + nightProgress * 0.8); // arc de gauche à droite
const moonX = W * (0.1 + Math.sin(moonAngle) * 0.8);
const moonY = H * (0.05 + (1 - Math.sin(moonAngle)) * 0.15);
```

### 4. Feature : Mémoire long-terme — oubli progressif (30 min, comportemental)
`interactionLog` n'a pas de decay → après longtemps séparées, deux entités "oublient" un peu.
```js
// Dans _update, boucle entités :
e._forgetTimer = (e._forgetTimer || 0) + dt;
if (e._forgetTimer > 30000) {
  e._forgetTimer = 0;
  for (const id in e.interactionLog) {
    e.interactionLog[id] = Math.max(0, e.interactionLog[id] * 0.95);
  }
}
```

---

## Contraintes à respecter

- **Ne pas toucher à la structure de `ENTITY_DEFS`**
- **SAVE_KEY = 'haize_save_v1'** — si snapshot change → incrémenter version
- **OffscreenCanvas dans Heatmap** : conserver, la LUT s'y intègre bien
- **60 FPS non négociable** — toute feature doit rester < 0.5ms render impact
