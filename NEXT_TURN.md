# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 16:03 (bilan post-tour autonome)_

---

## Bilan du tour courant

### Implémenté

**B1 — `_conflictCount` persisté dans save/load**
- `save()` : snapshot inclut `conflictCount: { ...this._conflictCount }`
- `load()` : restauration de `_conflictCount` si présent dans le snapshot
- Aucun risque de migration (champ optionnel à la lecture, SAVE_KEY inchangé)

**B2 — `_panelStateHash` sans le flag `selectedEntity`**
- Supprimé `:${e === this.selectedEntity ? 1 : 0}` du hash
- Résultat : plus de rebuild DOM inutile au clic sur entité

**B3 — Mutation d'objet dans le reduce de recrutement**
- Remplacé le `.reduce()` avec `p._rdist = d` par une simple boucle `for...of` sans mutation
- Code plus propre et robuste

**P1 — Badge expérience dans le panneau inspect**
- `expEntries` calculé en début de `_renderInspectPanel` (réutilisé dans PH + rendu)
- Hauteur PH mise à jour pour inclure la section EXPÉRIENCE si présente
- Section rendue entre CARACTÈRE et CONTACTS : `⭐ TYPE ×N` (doré si count ≥ 5)
- Limité à 3 types max, seuil minimum 2 projets réalisés

**P3 — CONCENTRE contextuel pour introvertis saturés**
- `_socialLoadTimer` mis à jour dans la boucle `_update` (montée si charge > 70% seuil, descente si < 70%)
- Dans `_updateState` : nouvel edge case → si extraversion < 0.3, charge > 85% seuil ET timer > 25s → newState = CONCENTRE
- SATURE reste prioritaire (condition insérée après le bloc SATURE)
- `_concentreMinDuration` protège contre les oscillations (déjà en place)

---

## Laissé de côté

Rien de reporté — toutes les priorités P1+P2+P3 ont été traitées dans ce tour.

---

## Observations pour le prochain tour

### Perf
- Toujours aucun bottleneck. Budget estimé inchangé : update ~3-5ms, render ~5-8ms.
- P3 ajoute une opération dt par entité par frame (négligeable).
- P1 ajoute ~3-7 fillText par frame si une entité est sélectionnée (négligeable).

### Idées pour le prochain tour

**A — Émoji réaction au badge expérience**
Quand une entité atteint le seuil vétéran (count ≥ 5 sur un type), spawner un `⭐` flottant. Signal visuel de progression.

**B — Persistance `_socialLoadTimer` dans save/load**
Ce timer vient d'être ajouté et n'est pas encore sauvegardé. Impact faible (le timer se reconstruit en 25s), mais cohérent avec la philosophie B1.

**C — Visualisation des conflits dans le panneau inspect**
`_conflictCount` est maintenant persisté — il pourrait apparaître dans le panneau inspect. Ex : section RANCŒURS avec les entités conflictuelles et un compteur.

**D — Événement "RETRAITE" lié à P3**
Quand une entité entre en CONCENTRE via la retraite introvertie (P3), spawner un emoji différent (ex: 🌿 ou 🧘) plutôt que 🎯 pour distinguer les deux chemins vers CONCENTRE.

**E — `_socialLoadTimer` reset à l'entrée CONCENTRE**
Pour éviter qu'une entité oscille trop vite en/hors CONCENTRE via P3, reset `e._socialLoadTimer = 0` lors de la transition vers CONCENTRE.

---

## Contraintes à respecter

- **Ne pas changer SAVE_KEY**
- **Ne pas refactorer la FSM globalement**
- **PROJECT_MAX = 3, ENTITY_DEFS, AFFINITES** — inchangés
- **Ne pas toucher à la Heatmap**
- **Calcul PH dans `_renderInspectPanel`** — si on ajoute une section, mettre à jour la hauteur
