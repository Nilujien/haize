# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 06:22 (cron évolution autonome)_

---

## Bilan du tour actuel

### Implémenté ✅

1. **Fix critique — double `const hasZones`** (simulation.js ~ligne 1615)
   - Suppression de la seconde déclaration `const hasZones` dans `_renderInspectPanel`
   - Était une SyntaxError latente en ES modules strict mode

2. **Throttle heatmap record** (~10×/s au lieu de 60×/s)
   - `heatmap.record()` déplacé hors de la boucle entités principale
   - Placé dans un timer `_heatmapRecordTimer >= 100ms`
   - Impact : gain ~1ms/frame, meilleure précision des gradients (monte moins vite)

3. **Decay zones mémoire** (happyZones + avoidZones)
   - `ZONE_DECAY_RATE = 0.0008` par ms → ~1 unité toutes les 20s game time
   - Zones supprimées quand score < 0.1
   - Les entités "oublient" progressivement : comportements plus dynamiques sur longue durée

4. **Indicateur tendance d'humeur** dans `_updatePanel`
   - Affiche ↑↓→ à côté du pourcentage mood (ex: `😊74%↑`)
   - Calculé sur les 3 dernières valeurs de `moodHistory`

### Laissé de côté
- Bug #3 (double reset `_happyZoneTimer`) : cosmétique, aucun impact

---

## État actuel estimé

### Perf
- Throttle heatmap : `_dirty` levé ~10×/s → gain estimé ~1ms/frame rendu
- Zone decay : O(n×zones) par frame, coût négligeable (n=12, zones rares)
- Budget frame estimé : update ~2-3ms, render ~4-6ms → stable à 60fps

---

## Analyse de l'état post-tour

### Ce qui fonctionne bien
- Simulation 12 entités stable, comportements différenciés
- Heatmap optimisée (OffscreenCanvas + LUT + dirty flag + throttle)
- Panneau inspect complet : sparkline, contacts, barres traits, zones, charge sociale
- avoidZones + happyZones avec décroissance naturelle
- Indicateur tendance humeur dans le panel

### Ce qui mérite attention

**🟡 Amélioration UX — panel inspect zones**
Les zones `happyZones` et `avoidZones` affichent un score qui décroît — montrer ce decay visuellement (opacité ou barre de durée restante) renforcerait la lisibilité.

**🟡 Optimisation — friendship links cache**
Si pas encore fait : cacher les paires actives de friendship links pour éviter de recalculer à chaque frame.

**🟢 Feature — états émotionnels étendus**
Ajouter 1-2 états supplémentaires (ex: CONCENTRE, EUPHORIQUE) liés à des seuils mood+energy hauts pour diversifier les transitions de state.

**🟢 Feature — mémoire collective / rumeurs**
Mécanisme léger où une entité partage son opinion d'une autre lors d'une interaction (influence sur `affinite`). Donnerait de la profondeur sociale.

---

## Priorités recommandées pour le prochain tour

### 1. ✨ Cache friendship links
Éviter le recalcul O(n²) à chaque frame. Calculer les paires actives dans `_update` et stocker dans `this._activeFriendLinks`. Rendu lit ce cache.

### 2. ✨ État CONCENTRE / EUPHORIQUE
Quand `mood > 0.7` ET `energy > 70` → state EUPHORIQUE (couleur dorée, vitesse +20%, rayonnement).
Quand `energy < 20` ET `mood > 0` → state CONCENTRE (vitesse réduite, moins social).

### 3. ✨ Visualisation decay zones dans inspect
Dans le bloc zones de `_renderInspectPanel`, afficher une mini-barre de durée restante (score/max) en opacité.

---

## Contraintes à respecter
- Ne pas toucher aux `AFFINITES` ni aux `ENTITY_DEFS`
- `SAVE_KEY = 'haize_save_v1'` inchangé
- Throttle panel à 200ms — maintenir
- Ne pas modifier la logique `STATE.SATURE`
- Ne pas augmenter le cap de floating emojis (15)
- Garder le `onConsoleDirty` callback pattern
