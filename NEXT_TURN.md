# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 02:43_

---

## Bilan du tour précédent (02:07 → 02:43)

Ce tour était de **planification uniquement** (cron analyse). Les fixes du tour précédent (double-log, throttle panel 200ms, decay interactionLog, suppression dead code `_renderEventLog`) sont en production et stables.

Deux points restaient ouverts et sont toujours présents dans le code :
- **Gradient territoire stale** (bug esthétique confirmé dans `_renderTerritories`)
- **Cache gradient humeur** (perf dans `_renderEntity`)

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Machine d'états solide, transitions propres (throttle ERRANCE↔REPOS filtré)
- Affinités dynamiques avec decay (oubli progressif ~30s)
- Heatmap LUT — un seul `drawImage` par frame, très performant
- `_updatePanel()` throttlé à 200ms — DOM calme
- Console événements avec guard `lastLogLen` — rebuilt seulement si changement
- Physique n² acceptable (12 entités, ~66 paires)
- Projets, événements globaux, nuit enrichie — tout cohérent

### Points qui posent problème

| # | Description | Sévérité |
|---|-------------|----------|
| 1 | **Gradient humeur stale** : `createRadialGradient` alloué chaque frame dans `_renderEntity` pour le halo humeur (si absMood > 0.15) ET pour le halo saturation. Jusqu'à 24 allocations gradient/frame. | Perf modérée |
| 2 | **Gradient territoire stale** : le cache key est basé sur `homeX/Y` (arrondi à 5px) mais le gradient utilise `effectiveRadius` qui pulse — le gradient est recalculé rarement mais son outer radius diffère de celui dessiné à chaque frame | Esthétique |
| 3 | **Panel innerHTML rebuild inconditionnelle** : `_updatePanel()` reconstruit **tout** le HTML toutes les 200ms même si aucun état n'a changé. Coût DOM non négligeable sur sessions longues | Perf légère |
| 4 | **`_renderFriendshipLinks` appelle `getAffinityWith`** à chaque frame pour les 66 paires. Chaque appel itère 6 AFFINITES + fait un lookup `interactionLog`. Sans cache = 66 × 7 ops/frame | Micro-perf |
| 5 | **Touch cursor ghost** : après un tap, `mouseX/Y` reste actif 800ms → le cercle curseur rouge persiste à la position du tap. Peut dérouter sur mobile | UX |

---

## Bugs / régressions détectés

### Bug 1 — Gradient territoire stale (simulation.js `_renderTerritories`)
```
Ligne ~L1607 : cache key = arrondi homeX/Y à 5px
Ligne ~L1610 : gradient créé avec effectiveRadius (pulse ±4%)
→ mismatch : l'arc est dessiné à effectiveRadius mais le gradient va jusqu'à l'ancienne valeur
```
Résultat visuel : le halo de territoire pulse mais le gradient reste figé entre deux recalculs (toutes les ~5s de mouvement).

### Bug 2 — Double rAF loop (index.html)
La fonction `updateConsole()` s'appelle elle-même via `requestAnimationFrame` à chaque frame, créant une **deuxième boucle rAF** en parallèle de la boucle principale de la simulation. L'overhead est faible (la fonction est guardée) mais c'est architecturalement sale. Devrait être intégré dans la boucle principale via un timer comme `_panelTimer`.

---

## Perf

Estimation budget frame actuel (60fps = 16.7ms cible) :
- `_update` : **3–5ms** (physique n², projets, decay)
- `_render` : **5–8ms** dont :
  - Gradients humeur : ~1.5–2ms (12 entités × 2 gradients potentiels)
  - Heatmap : ~0.3ms (drawImage, très léger)
  - Connexions + amitié : ~1ms
  - Entités + projets : ~1.5ms
  - UI overlay : ~0.5ms
- `_updatePanel` DOM : ~0.8ms (toutes les 200ms, amorti)

**Total estimé : 9–14ms/frame** → budget maintenu en général, mais des pics peuvent dépasser 16ms avec beaucoup d'entités saturées (double halo).

Le fix des gradients humeur devrait ramener le render à **4–6ms**.

---

## Priorités recommandées pour le prochain tour

### 1. Cache gradient humeur dans `_renderEntity` (20 min, ~1.5ms/frame)

C'est la priorité absolue — le plus grand gain perf avec le moins de risque.

**Condition d'invalidation :**
- Le signe de `e.mood` a changé (positif ↔ négatif → couleur change)
- `absMood` a varié de plus de 0.08
- La position a bougé de plus de 5px

**Code :**
```js
// Dans _renderEntity, remplacer le bloc "Halo humeur" :
const absMood = Math.abs(e.mood);
if (absMood > 0.15) {
  const moodSign = e.mood > 0 ? 1 : -1;
  const haloR = e.radius * (1.6 + absMood * 0.8);
  
  // Invalider si signe changé, absMood delta > 0.08, ou position bougée > 5px
  if (!e._moodGrad
      || e._moodGradSign !== moodSign
      || Math.abs(e._moodGradAbsMood - absMood) > 0.08
      || Math.hypot(e.x - e._moodGradX, e.y - e._moodGradY) > 5) {
    const haloAlpha = absMood * 0.35;
    const haloColor = e.mood > 0
      ? `rgba(46,204,113,${haloAlpha.toFixed(2)})`
      : `rgba(231,76,60,${haloAlpha.toFixed(2)})`;
    e._moodGrad = ctx.createRadialGradient(e.x, e.y, e.radius * 0.5, e.x, e.y, haloR);
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
```

**Même logique pour le halo saturation** (isSaturated) : invalider sur changement de `socialCharge` > 5 ou déplacement > 5px.

### 2. Fix gradient territoire stale (10 min, esthétique)

Dans `_renderTerritories`, inclure `effectiveRadius` dans la clé de cache (arrondi à 2px près) :

```js
const erRounded = Math.round(effectiveRadius / 2) * 2;
const cacheKey = `${Math.round(e.homeX/5)*5}_${Math.round(e.homeY/5)*5}_${erRounded}`;
if (!e._territoryGradCache || e._territoryGradCacheKey !== cacheKey) {
  // recréer le gradient avec les bonnes valeurs
  e._territoryGradCache = ctx.createRadialGradient(
    e.homeX, e.homeY, effectiveRadius * 0.3,
    e.homeX, e.homeY, effectiveRadius        // ← utiliser effectiveRadius, pas e.homeRadius
  );
  // ...
  e._territoryGradCacheKey = cacheKey;
}
```

Note : le gradient intérieur utilise `e.homeRadius * 0.3` dans le code actuel alors que l'arc extérieur utilise `effectiveRadius`. Corriger pour que les deux utilisent `effectiveRadius`.

### 3. Intégrer updateConsole dans la boucle principale (15 min, architecture)

Remplacer la boucle rAF autonome dans `index.html` par un timer géré dans la boucle de simulation, similaire à `_panelTimer` :

**Dans `start()` / boucle principale (simulation.js) :**
```js
this._consoleDirty = false; // setter dans pushEvent
// Dans la boucle :
this._consoleTimer = (this._consoleTimer || 0) + rawDt;
if (this._consoleTimer >= 100 && this._consoleDirty) {
  this._consoleTimer = 0;
  this._consoleDirty = false;
  // callback optionnel vers index.html
  if (this.onConsoleDirty) this.onConsoleDirty();
}
```

**Dans `pushEvent()` :** ajouter `this._consoleDirty = true;`

**Dans `index.html` :** câbler `sim.onConsoleDirty = updateConsole;` et supprimer le `requestAnimationFrame` auto.

---

## Contraintes à respecter

- **Ne pas toucher** au système de projets — stable et bien équilibré
- **Ne pas toucher** au decay interactionLog — implémenté au tour précédent, laisser maturer
- **Ne pas toucher** aux AFFINITES ni aux ENTITY_DEFS — équilibre comportemental fragile
- **Ne pas changer SAVE_KEY** — la v1 est compatible, pas de migration nécessaire
- **Garder le throttle panel à 200ms** — bon équilibre réactivité/perf
- Le cache gradient doit être **invalidé en position absolue**, pas relative — les entités bougent, les gradients doivent suivre

## Ordre d'implémentation recommandé

1. Fix gradient territoire (10min, risque zéro, esthétique immédiate)
2. Cache gradient humeur (20min, gain perf visible au perf badge)
3. Intégration updateConsole (15min, nettoyage architectural)

Budget total estimé : **45 minutes** de code, safe à implémenter en un seul tour.
