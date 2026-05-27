# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 18:09 (bilan post-tour autonome)_

---

## Bilan du tour actuel

### Ce qui a été implémenté

**B1/B2 — Snapshot `_socialLoadTimer` + `_concentreViaP3`** (entities.js)
- Ces deux propriétés sont maintenant incluses dans `toSnapshot()` et restaurées dans `fromSnapshot()`.
- Effet : les introvertis en retraite P3 conservent leur timer après reload. Le badge 🎯/🧘 ne flashe plus au chargement.

**B3 — Snapshot `_euphoriqueDuration/_euphoriqueCap` + `_concentreDuration/_concentreMinDuration`** (simulation.js)
- Persistés dans `save()` via `euphoriqueDurations` et `concentreDurations`.
- Restaurés dans `load()` en boucle sur les entités.
- Effet : une entité en EUPHORIQUE ne peut plus y rester indéfiniment après un reload (cap conservé). Une entité en CONCENTRE ne sort plus immédiatement (plancher conservé).

**B5 — Suppression de `e.social` (dead property)** (entities.js + simulation.js)
- `this.social = ...` retiré du constructeur Entity.
- `e.social += ...` retiré de la boucle `_update` dans simulation.js.
- Non inclus dans snapshot → backward compat automatique (champs inconnus ignorés).

**Feature — Cascade CELEBRATION** (simulation.js)
- Après résolution d'un projet de type CELEBRATION, les entités non-participantes dans un rayon de 300px reçoivent un bonus mood proportionnel à la proximité (+0.15 max).
- Les entités à moins de 150px spawne un emoji 🎊.
- Un event "🎊 Vague de joie" est loggé dans le panel.
- Impact render : zéro (logique uniquement, exécutée une fois au moment de la résolution).

---

## Ce qui a été laissé de côté

**Cache `_renderRancorLinks`** (B4 mineur) : O(n²) non caché au rendu, mais avec 12 entités ~66 itérations, impact < 0.1ms. Toujours accepté pour le moment.

**Badge `×N` sur liens rancune** : idée déjà notée dans le bilan précédent, toujours reportée. Pertinente visuellement mais pas prioritaire.

---

## Observations pour le prochain tour

### Idées de features
1. **CELEBRATION → forcer EUPHORIQUE** : actuellement, la vague pousse le mood mais ne force pas l'état EUPHORIQUE. On pourrait vérifier si mood > 0.7 dans la vague et forcer la transition (plus spectaculaire).
2. **Cache `_activeRancorLinks`** : parallèle à `_activeFriendLinks`, rebuild à ~5×/s. Propre architecturalement, inutile en perf pour 12 entités.
3. **Badge `×N` rancune** : afficher l'intensité (`conflictCount`) directement sur les liens ❄️ pour lisibilité.
4. **Decay `socialCharge` pendant la nuit** : les introvertis récupèrent plus vite la nuit, actuellement le decay est constant.

### Perf estimée post-tour
- Aucun impact perf de ce tour. Le dead code `e.social` est retiré (~1 op/frame × 12 entités), gain négligeable.
- Budget frame inchangé : ~6-11ms, confortablement dans les 16.6ms.

### Contraintes rappelées
- `SAVE_KEY = 'haize_save_v1'` — ne pas changer
- FSM 9 états — stable, ne pas refactorer
- `PROJECT_MAX = 3`, `ENTITY_DEFS`, `AFFINITES` — immuables
