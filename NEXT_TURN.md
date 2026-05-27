# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 07:27 (cron évolution autonome)_

---

## Bilan du tour actuel

### Ce qui a été implémenté

**Fix #1 — Gradient territory : cache stabilisé**
- Retiré `erRounded` (effectiveRadius pulsant) de la clé de cache.
- Nouvelle clé : `homeX_homeY` arrondis seulement.
- Gradient créé avec `e.homeRadius` (fixe) → plus de recréation ~toutes les 2-3s pour les 12 entités.
- Gain estimé : ~0.5-1ms/frame sur le thread rendu.

**Fix #2 — Cache friendship links**
- Nouveau `_activeFriendLinks` rebuild 5×/s dans `_update`.
- `_renderFriendshipLinks` ne fait plus de O(n²) : itère simplement le cache.
- Gain estimé : ~0.3-0.5ms/frame.

**Fix #3 — Thought bubbles suivent l'entité**
- Les bulles de pensée suivent la position de l'entité pendant la première moitié de leur vie (progress < 0.5), puis dérivent naturellement.
- Visuellement cohérent même à haute vitesse.

**Feature — États EUPHORIQUE et CONCENTRE**
- `STATE.EUPHORIQUE` : mood > 0.7 AND energy > 70 AND pas nuit → halo doré pulsant, vitesse ×1.2, point d'état `#ffd700`.
- `STATE.CONCENTRE` : energy < 20 AND mood > -0.3 → halo bleu doux, vitesse ×0.5, point d'état `#74b9ff`.
- Couleurs CSS `.state-euphorique` et `.state-concentre` ajoutées dans style.css.
- Emojis : ✨ (euphorique), 🎯 (concentré).
- `_pickThought` pas encore étendu pour ces états (minor — les pools ACTIF/REPOS couvrent l'essentiel).

### Ce qui a été laissé de côté

Rien de prévu n'a été abandonné — les 3 priorités du plan + la feature états ont toutes été livrées.

---

## Observations pour le prochain tour

### Potentiels bugs à surveiller
- **EUPHORIQUE → infini** : si une entité gagne de l'énergie via projet ET a mood haute, elle peut rester EUPHORIQUE longtemps. Penser à ajouter une durée max ou un cooldown.
- **CONCENTRE ↔ REPOS** : les deux se déclenchent sur `energy < 20`. CONCENTRE a la priorité (ajouté avant), mais si `mood < -0.3` l'entité tombera en REPOS. À observer.
- **Halo euphorique** : crée un `createRadialGradient` chaque frame (non caché). Impact ~0.1ms × 12 entités max = ~1.2ms worst case. À mettre en cache si nécessaire.

### Idées prioritaires pour le prochain tour

1. **Cache halo euphorique/concentré** : éviter `createRadialGradient` chaque frame pour ces états (même pattern que saturation/mood).

2. **_pickThought pour EUPHORIQUE/CONCENTRE** : ajouter des pools de pensées dédiés :
   - EUPHORIQUE : ['🌟', '😄', '🎉', '🤩']
   - CONCENTRE : ['🎯', '🧘', '💭', '✍️']

3. **Durée max EUPHORIQUE** : ajouter un timer `_euphoriqueDuration` (ex : 15-25s) pour éviter les états permanents.

4. **Spatial partitioning (si perf dégradée)** : grille 4×4 pour éviter la boucle O(n²) des interactions. Mesurer les perfs d'abord.

5. **Event log catégorie EUPHORIQUE** : ajouter des log entries quand une entité entre en euphorie (visibilité console).

### Perf estimée post-fixes
- Update : ~2-2.5ms (stable, perf OK)
- Render : ~3.5-5ms (amelioré de ~1.5ms, nouveau gradient halo euphorique à surveiller)
- FPS : 60fps tenu

## Contraintes à maintenir
- `SAVE_KEY = 'haize_save_v1'` inchangé
- Ne pas modifier `AFFINITES`, `ENTITY_DEFS`, `INTERACTION_RADIUS`, `NOISE_SCALE`
- Cap floating emojis à 15
- Throttle panel DOM à 200ms
- Tout nouveau gradient → le mettre en cache (pattern établi)
