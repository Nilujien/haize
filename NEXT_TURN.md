# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 02:07_

---

## Bilan du tour précédent (02:07)

### Ce qui a été implémenté

1. **Fix double log résolution projet** — suppression du bloc `eventLog.unshift(entry)` manuel (~L1014-1022). Désormais un seul appel `pushEvent()` à la résolution. Bug confirmé et corrigé.

2. **Throttle `_updatePanel()` à 200ms** — l'appel dans la boucle principale est maintenant conditionnel via `_panelTimer`. Gain estimé ~1–2ms/frame sur sessions longues. Panneau toujours réactif (200ms imperceptible).

3. **Decay `interactionLog` (oubli progressif)** — toutes les 30s de jeu réel (en dt), chaque score est multiplié par 0.94 et supprimé si < 0.01. Les affinités dynamiques ne satureront plus à `+0.4` → comportements différenciés sur le long terme.

4. **Suppression `_renderEventLog()` dead code** — 55 lignes de code mort supprimées (méthode jamais appelée dans `_render()`). Code plus lisible, overhead parse éliminé.

### Ce qui a été laissé de côté

- **Cache gradient humeur** (priorité 5 du plan) — complexité d'invalidation sur position + sign + level. Gain estimé ~0.15ms/frame. À implémenter au prochain tour si budget serré.
- **Fix gradient territoire stale** (bug esthétique) — le gradient est recréé avec `effectiveRadius` qui pulse, mais le cache est invalidé sur home position seulement. Correction : invalider aussi si `effectiveRadius` change de plus de 2px.

### Observations pour le prochain tour

- `SAVE_KEY` **non incrémenté** : le decay interactionLog modifie la sémantique des scores mais pas leur structure — les anciens saves chargeront normalement, les scores anciens décroîtront naturellement. Migration gracieuse naturelle, pas besoin de `v2`.
- Perf estimée post-fixes : update ~3-5ms, render ~4-6ms. Budget 60fps maintenu.
- Prochaine priorité : cache gradient humeur + fix gradient territoire stale.

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Machine d'états cohérente (fix FUITE + `_stateTimer` reset)
- Affinités dynamiques avec decay (fix ce tour)
- Heatmap LUT précalculée (OffscreenCanvas + ImageData)
- Nuit enrichie, système de projets complet
- Console événements (plus de double-log)
- `_updatePanel()` throttlé à 200ms

### Points à surveiller

| # | Description | Priorité |
|---|-------------|----------|
| 1 | **Gradient territoire stale** : cache invalidé sur homeX/Y mais pas sur `effectiveRadius` qui pulse → halo décalé visuellement | Esthétique |
| 2 | **Cache gradient humeur** : `createRadialGradient` 12×/frame quand absMood > 0.15 → ~0.15ms/frame | Perf légère |

---

## Priorités recommandées

### 1. Fix gradient territoire stale (10 min, esthétique)

Dans `_renderTerritories`, invalider le cache si `effectiveRadius` a changé de > 2px :

```js
if (!e._territoryGrad
    || e._tgHomeX !== e.homeX
    || e._tgHomeY !== e.homeY
    || Math.abs(e._tgRadius - effectiveRadius) > 2) {
  // recréer gradient
  e._tgRadius = effectiveRadius;
  // ...
}
```

### 2. Cache gradient humeur (15 min, perf ~0.15ms/frame)

Voir plan précédent pour le code détaillé. Invalider sur : sign changé, mood delta > 0.08, ou position bougée > 5px.

### 3. Throttle sparkline inspect (bonus)

`_updatePanel()` recalcule le sparkline SVG inline — si l'entité inspectée n'a pas changé de moodHistory, éviter le rebuild SVG. Micro-optimisation mais propre.
