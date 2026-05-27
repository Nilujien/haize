# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 10:39 (bilan post-tour autonome)_

---

## Bilan du tour actuel

### ✅ Implémenté

1. **Fix liens amitié longue distance** — `_activeFriendLinks` : `distSq > 700*700` remplacé par un `maxDistSq` conditionnel. Amis avec score ≥ 40 restent liés jusqu'à 1200px. Les cœurs 💛 s'affichent maintenant à distance.

2. **CONCENTRE — durée plancher 4–7s** — En tête de `_updateState`, si `e._concentreDuration < e._concentreMinDuration`, sortie bloquée. Initialisé lors de l'entrée dans l'état. L'état CONCENTRE est maintenant visible et dure au minimum 4 secondes.

3. **CONCENTRE — isolation sociale partielle** — `concentrePenalty = -0.8` dans le calcul de force sociale. `moodReceptivity = 0.1` pour la contagion d'humeur. Les entités CONCENTRE se tiennent à l'écart et sont moins influencées par autrui.

4. **Nettoyage caches halos à la transition** — `e._eupGrad`, `e._concGrad` et leurs coordonnées associées nullifiés lors de toute transition d'état. Élimine les artefacts visuels potentiels d'une frame.

5. **Refactor side-effect render → update** — Le tracking de position des `_thoughtBubbles` déplacé dans `_update` (après le filter des pensées expirées). `_renderThoughtBubbles` est maintenant read-only. Code plus propre, separation of concerns respectée.

### ⏭ Reporté / non traité

- Aucun bug critique restant. Les 4 priorités du plan précédent ont été traitées.

### Observations pour le prochain tour

- **Perf** : ~2ms update / ~4ms render — stables. Le `concentrePenalty` est O(1), aucun impact.
- **Idées à explorer** :
  - **CONCENTRE → pensées visuelles dédiées** : afficher une icône 🎯 persistante (pas flottante) au-dessus de l'entité tant qu'elle est CONCENTRE, pour renforcer la lisibilité visuelle de l'état.
  - **Interactions CONCENTRE** : quand une entité CONCENTRE est approchée, la dérangeante pourrait recevoir une micro-réaction (pensée flottante 🤫 ou légère répulsion supplémentaire).
  - **PROJET : durée cap** — les entités peuvent rester PROJET indéfiniment si le projet ne se résout pas. Envisager un cap de 30–60s avant retour ERRANCE.
  - **Liens amitié** : rendre les liens longue distance plus transparents (opacité × 0.5 si dist > 700) pour signaler visuellement la "distance" de la relation.
  - **Debug panel** : ajouter l'état CONCENTRE dans le sparkline (couleur bleue ciel).

## Perf

- **update** : ~2ms (stable)
- **render** : ~4ms (stable)
- **60 FPS** : maintenu
