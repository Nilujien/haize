# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 03:10_

---

## Bilan du tour précédent (03:10)

### Ce qui a été implémenté

**1. Fix gradient territoire stale** (`simulation.js` — `_renderTerritories`)
- La clé de cache inclut désormais `effectiveRadius` arrondi à 2px près (`erRounded`)
- Le gradient intérieur utilise `effectiveRadius * 0.3` au lieu de `e.homeRadius * 0.3` — cohérence radius
- Résultat : le halo de territoire pulse correctement, gradient et arc parfaitement alignés

**2. Cache gradient humeur** (`simulation.js` — `_renderEntity`)
- `createRadialGradient` n'est plus appelé chaque frame
- Invalidation : signe mood changé, `absMood` delta > 0.08, ou déplacement > 5px
- Même logique pour le halo saturation (halo violacé des saturés)
- Gain estimé : **~1.5ms/frame** sur le render budget → render devrait descendre à 4–6ms

**3. Refactor updateConsole** (`index.html` + `simulation.js`)
- La double boucle `requestAnimationFrame` dans index.html est supprimée
- `pushEvent()` pose `_consoleDirty = true`
- La boucle principale déclenche `onConsoleDirty()` toutes les 100ms si dirty
- `updateFpsBadge()` reste en rAF séparé (léger, ~0.05ms) pour les badges FPS/perf
- Architecture propre, 0 overhead supplémentaire

---

## Ce qui a été laissé de côté

- **Panel innerHTML rebuild conditionnel** (bug #3 du plan précédent) : le _panelTimer est déjà à 200ms, ce qui suffit. Un vrai diff de contenu demande de la sérialisation qui pourrait coûter plus qu'elle économise. À évaluer plus tard.
- **Cache affinité pour `_renderFriendshipLinks`** : micro-perf acceptable, 66 paires × 7 ops/frame = ~462 ops négligeables. À laisser pour l'instant.

---

## Observations pour le prochain tour

### Perf estimée post-optimisations
- Render budget : **4–6ms** (était 5–8ms)
- Update budget : **3–5ms** (inchangé)
- Total : **7–11ms** → 60fps tenu confortablement

### Pistes pour le prochain tour (par valeur)

| # | Description | Effort | Impact |
|---|-------------|--------|--------|
| 1 | **Touch cursor ghost** : après tap, `mouseX/Y` reste actif 800ms → cercle rouge persiste | 10min | UX mobile |
| 2 | **Panel diff intelligent** : comparer `_lastPanelHash` avant rebuild innerHTML | 15min | Perf légère |
| 3 | **Feature : humeurs contagieuses** : quand deux entités se croisent, mood transfer partiel | 30min | Richesse comportementale |
| 4 | **Feature : mémoire des lieux** : entité garde trace de zones où elle a été heureuse → biais de déplacement | 45min | Profondeur |
| 5 | **Spatial partitioning 4×4** : si perf se dégrade avec events fréquents | 30min | Perf moyenne |

### Bug touch cursor (priorité recommandée #1 du prochain tour)
Dans `index.html`, trouver le handler `touchstart`/`touchend` et ajouter :
```js
canvas.addEventListener('touchend', () => {
  setTimeout(() => { sim.mouseX = -999; sim.mouseY = -999; }, 50);
});
```
Vérifier aussi si `sim.mouseActive` ou équivalent existe pour désactiver le cercle curseur.

---

## Contraintes à respecter
- Ne pas toucher aux AFFINITES ni aux ENTITY_DEFS
- Ne pas toucher au système de projets (stable)
- SAVE_KEY inchangé
- Throttle panel à 200ms — maintenir
