# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 21:15 (bilan tour Jubis)_

---

## Bilan du tour actuel

### Implémenté

1. **Fix B1 — `_activeRecruitLinks` cache** : La double boucle O(n²) dans `_renderRecruitLinks` est remplacée par un cache rebuild à 5x/s dans `_update`, exactement comme `_activeFriendLinks` et `_activeRancorLinks`. Économie estimée ~0.3ms/frame render.

2. **Fix B2 — Dead code `successCounts` dans `save()`** : Supprimé les 3 lignes inutiles. `successCount` est déjà inclus dans `entity.toSnapshot()`, pas besoin du doublon au niveau top-level du snapshot.

3. **Fix B4+B5 — Click-to-select depuis le panel info** : Listener `click` ajouté sur `infoPanel` en `index.html`. CSS `.entity-row { cursor: pointer }` ajouté dans `style.css`. L'utilisateur peut maintenant cliquer sur une ligne du panel pour inspecter/désélectionner une entité.

4. **Enrichissement AFFINITES — 8 nouvelles paires** :
   - Positives (×4) : JG-IM (0.78), CM-SB (0.82), TR-JC (0.72), LPL-SB (0.70)
   - Négatives/friction (×4) : ER-LD (0.15), FT-GD (0.10), ER-IM (0.20), FT-IM (0.18)
   - Couverture AFFINITES : 6 → 14 paires (9% → 21% de couverture)

### Laissé de côté

- **`introFactor` incohérence sémantique** — mineur, pas urgent
- **Type de projet REPOS/RETRAIT pour introvertis** — intéressant mais complexe à équilibrer ; laisser pour un tour dédié "feature"

---

## Analyse de l'état actuel

### Ce qui fonctionne bien

- Architecture solide, FSM 9 états stable
- 3 caches render : `_activeFriendLinks`, `_activeRancorLinks`, `_activeRecruitLinks` — O(n²) render loop éliminé
- Click-to-select fonctionne depuis canvas ET depuis le panel latéral (nouveauté)
- 14 paires d'affinités — simulation démarre avec plus de dynamiques visibles
- Budget frame : update ~3-6ms, render ~3-7ms — 60fps tient confortablement

### Opportunités pour le prochain tour

1. **UX Inspect — afficher l'affinité brute dans les CONTACTS** : En plus du `score` interactionLog, afficher la valeur `getAffinityWith()` réelle (base + dynamic) pour mieux comprendre les relations.

2. **Indicateur de recrutement actif dans le panel** : Quand une entité est en PROJET, afficher dans son panneau d'inspection les entités qu'elle cherche à recruter (depuis `_activeRecruitLinks`).

3. **Type REPOS/RETRAIT** : Projet solo, accessible uniquement en état CONCENTRE, permet de regagner de l'énergie vite. Les introvertis s'y réfugient quand socialement saturés.

4. **Trail coloré selon état** : Actuellement `e.color + '44'` fixe. Teinter en orange pour EUPHORIQUE, bleu pour CONCENTRE, rouge pour FUITE — signal visuel supplémentaire sans coût render.

5. **Save enrichi — conserver `_conflictCount` dans affichage** : Le panel latéral ne montre pas les rancours généraux, uniquement dans l'inspect. Ajouter un compteur "conflits actifs" visible en hover ou dans le cycle indicator.

---

## Perf estimée post-tour

- `_renderRecruitLinks` : O(n²) → O(k), k = nb paires actives (~0-6)
- Économie render : ~0.3ms/frame quand des entités sont en PROJET
- Budget total estimé : update ~3-5ms, render ~2.7-6.7ms → marges confortables

---

## Contraintes à respecter

- `SAVE_KEY = 'haize_save_v1'` — ne pas changer
- FSM 9 états — stable, ne pas refactorer `_updateState`
- `PROJECT_MAX = 3`, 12 entités, `ENTITY_DEFS` — structures immuables
- Ne pas toucher à `Heatmap`
- Ne pas introduire de `async` dans la boucle de rendu
- `_activeFriendLinks` structure `{ a, b, score, strength, isClose }` — stable
- `_activeRecruitLinks` structure `{ recruiter, other, aff, dist }` — stable (nouveau ce tour)
- Conserver backward compat des snapshots localStorage
