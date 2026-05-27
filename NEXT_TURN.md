# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 17:07 (bilan post-tour autonome)_

---

## Bilan du tour actuel

### Ce qui a été implémenté

1. **B1 — Fix `_socialLoadTimer` reset** : À l'entrée dans `STATE.CONCENTRE`, `_socialLoadTimer` est maintenant remis à 0. Cela évite la boucle d'oscillation immédiate pour les introvertis via P3.

2. **D — Emoji 🧘 pour retraite P3** : Lors de la transition vers CONCENTRE, le flag `e._concentreViaP3` est calculé (`extraversion < 0.3` et `socialCharge > threshold * 0.85`). Le badge persistant au-dessus de l'entité affiche `🧘` au lieu de `🎯`, et l'emoji flottant de transition aussi. Deux chemins narratifs enfin distincts.

3. **C — Section RANCŒURS dans l'inspect panel** : Après la section CONTACTS, une section conditionnelle RANCŒURS apparaît si l'entité a des conflits accumulés (count ≥ 2). Affichage `❄️ ID ×N` en orange clair (< 5) ou rouge vif (≥ 5). Hauteur PH mise à jour correctement.

### Ce qui a été laissé de côté

- **B3 — Persistance `_socialLoadTimer` dans save()** : Faible impact, non urgent. À faire si la philosophie B1 de cohérence complète est prioritaire.
- **Persistance timers EUPHORIQUE/CONCENTRE** : Toujours manquante (`_euphoriqueDuration`, `_euphoriqueCap`, `_concentreDuration`, `_concentreMinDuration`). À planifier.
- **Spawn ⭐ flottant vétéran** : Pas urgent mais visuel agréable.

### Observations

- Perf : aucune modification à la boucle de rendu principale — impact nul sur le budget frame.
- La section RANCŒURS avec `Object.entries(this._conflictCount)` est appelée à chaque frame inspect. Le nombre d'entrées est borné (12 entités = 66 paires max) et le filtre+sort se fait en O(n) — acceptable.
- `e._concentreViaP3` n'est pas persisté dans les snapshots. Si l'entité recharge en cours de CONCENTRE, elle perdra ce flag et affichera `🎯` jusqu'à la prochaine transition. Impact cosmétique mineur.

---

## Priorités recommandées pour le prochain tour

### 1. B3 — Persister `_socialLoadTimer` dans save()/load()
```js
// toSnapshot() → ajouter :
_socialLoadTimer: e._socialLoadTimer || 0,
// fromSnapshot() → ajouter :
e._socialLoadTimer = snap._socialLoadTimer || 0;
```

### 2. Persister `_concentreViaP3` dans snapshot
Pour éviter le flash visuel `🎯→🧘` au reload en cours de CONCENTRE.
```js
// toSnapshot() :
_concentreViaP3: e._concentreViaP3 || false,
// fromSnapshot() :
e._concentreViaP3 = snap._concentreViaP3 || false;
```

### 3. Persistance timers EUPHORIQUE/CONCENTRE
`_euphoriqueDuration`, `_euphoriqueCap`, `_concentreDuration`, `_concentreMinDuration` dans les snapshots.
Faible impact mais cohérence renforcée — évite les court-circuits de durée plancher après reload.

### 4. Idée narrative : badge rancune sur liens
Les liens `_renderRancorLinks` pourraient afficher le count `×N` au milieu du lien pour les paires fortement conflictuelles (count ≥ 5). Enrichit la lecture du canvas sans modifier la logique.

---

## Contraintes à respecter (rappel)
- **Ne pas changer SAVE_KEY** (`haize_save_v1`)
- **Ne pas refactorer la FSM** — stable
- **`PROJECT_MAX = 3`, `ENTITY_DEFS`, `AFFINITES`** — inchangés
- **60 FPS non négociable**
- Toute section inspect : mettre à jour PH
