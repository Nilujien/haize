# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 19:15 (analyse autonome Jubis)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien

- Architecture FSM 9 états solide et bien documentée
- Caches de gradients (humeur, euphorique, concentré, saturation) correctement invalidés
- `_activeFriendLinks` / `_activeRancorLinks` parallèles et cohérents (rebuild 5×/s)
- Heatmap via OffscreenCanvas + LUT précalculée → optimal
- Panel inspect Canvas détaillé avec sparkline, rancœurs, expériences
- Adaptive render skip (skip 1 frame/2 si update > 8ms) → bonne protection CPU
- Système de territoires + dérive lente du home → cohérent et discret visuellement
- Mémoire des lieux heureux/évités fonctionnelle, decay progressif
- Save/load complet avec backward compat (happyZones, avoidZones, concentreDurations optionnels)

### Ce qui pose problème

1. **Double O(n²) non-caché dans le render** (voir Bugs)
2. **`successCounts` sauvegardé deux fois** dans le snapshot (top-level ET dans entity.toSnapshot)
3. **data-id dans info-panel jamais utilisé** — feature incomplète muette
4. **Inconsistance sémantique** : le decay nocturne de `socialCharge` utilise `1 - socialite` mais les deux autres utilisations similaires utilisent `1 - extraversion` (introvertis = basse extraversion, pas forcément basse socialite)

---

## Bugs / régressions détectés

### B1 — `_renderFriendshipLinks` : O(n²) non-caché à chaque frame render
**simulation.js ~L1780** — La "passe cœur rapproché" (amis forts côte à côte, dist < INTERACTION_RADIUS) refait le O(n²) complet à chaque frame render, en parallèle du cache `_activeFriendLinks`. Pour 12 entités = 66 paires/frame, ce n'est pas critique mais c'est incohérent avec l'architecture cache établie.

```
_renderFriendshipLinks > "passe cœur rapproché" — O(n²) non-caché
```

### B2 — `_renderRecruitLinks` : O(n²) non-caché dans le render
**simulation.js ~L1720** — Contrairement aux liens d'amitié et de rancœur qui utilisent des caches, les liens de recrutement recalculent tout depuis zéro à chaque frame. Peut devenir coûteux avec beaucoup d'entités en PROJET simultanément.

### B3 — Double stockage `successCount` dans le snapshot
**simulation.js `save()`** — `successCounts: Object.fromEntries(...)` est inclus dans le snapshot top-level mais n'est jamais utilisé dans `load()`. La restauration se fait via `e.fromSnapshot(eSnap)` qui lit `snap.successCount`. Le champ `successCounts` top-level est du dead code qui grossit inutilement le localStorage.

### B4 — Inconsistance sémantique `introFactor` (mineur, non-critique)
**simulation.js ~L350 et L356** — Le gain de charge sociale et le decay nocturne utilisent tous deux `1 - e.character.socialite`, mais les entités dites "introvertis" dans le jeu sont définies par `extraversion` faible (LD, GD, IM ont extraversion 0.10-0.20). La corrélation est approximative — LD a socialite=0.20 ET extraversion=0.20, donc ça marche en pratique, mais c'est sémantiquement fragile.

---

## Perf

**Budget frame actuel estimé :**
- `_update` (12 entités, boucle O(n²) interactions) : ~3-6ms
- `_render` (Canvas 2D, halos + trails + liens) : ~4-8ms
- Total : ~7-14ms / 16.6ms cible → marge confortable (~30-55%)
- Adaptive render skip déclenché si update > 8ms → safety net actif

**Bottlenecks identifiés :**
1. `_renderFriendshipLinks` : passe proche-amis O(n²) non-cachée — ~0.3ms/frame gaspillé
2. `_renderRecruitLinks` : O(n²) non-caché — ~0.2ms/frame supplémentaire
3. `_thoughtBubbles` : `entities.find` dans la boucle de rendu (O(n)) — négligeable à 12 entités

**Optimisation possible :** Ajouter `_activeRecruitLinks` (cache 5×/s) sur le modèle de `_activeFriendLinks`.

---

## Priorités recommandées pour le prochain tour

### 1. Fix B1+B2 — Cacher `_activeRecruitLinks` et supprimer la passe proche-amis non-cachée

**Pourquoi :** Cohérence architecturale + légère économie perf. La passe proche-amis dans `_renderFriendshipLinks` est un cas non géré du cache principal (le cache exclut distSq < INTERACTION_RADIUS). La fix la plus propre : **inclure les proches dans le cache** avec un flag `isClose: true`, et afficher le cœur depuis le cache.

**Comment :**
```js
// Dans _update, rebuild _activeFriendLinks :
// Supprimer la condition `if (distSq < interactRadSqFL) continue;`
// Remplacer par : 
const isClose = distSq < interactRadSqFL;
const maxDistSq = score >= 40 ? 1200 * 1200 : 700 * 700;
if (!isClose && distSq > maxDistSq) continue;
this._activeFriendLinks.push({ a, b, score, strength, isClose });

// Dans _renderFriendshipLinks :
// Supprimer entièrement la "passe cœur rapproché" (L~1780-1800)
// Dans la boucle principale, ajouter :
if (link.isClose && score > 40) { /* afficher cœur */ }
```

Pour `_activeRecruitLinks` : créer le cache dans le rebuild de `_friendLinkTimer` (même cadence), remplir depuis les entités STATE.PROJET, lire dans `_renderRecruitLinks`.

### 2. Enrichissement AFFINITES — ajouter 8 paires prédéfinies

**Pourquoi :** 6 paires pour 12 entités = couverture de 9% seulement. Les premières minutes de simulation sont peu lisibles (peu de liens définis, tout dépend de l'accumulation dynamique). Impact visuel immédiat sur le démarrage.

**Comment :** Ajouter dans `entities.js` (après les 6 existantes) :
```js
// Paires négatives (faible affinité = tension latente)
['ER',  'LD',  0.15],  // Agressif vs Solitaire-pacifique : friction naturelle
['FT',  'GD',  0.10],  // Hyperactif vs Prudent-introverti : incompatibles
['ER',  'IM',  0.20],  // Agressif vs Introspectif-sensible
// Paires positives supplémentaires
['JG',  'IM',  0.78],  // Deux curieux introvertis : affinité intellectuelle
['CM',  'SB',  0.82],  // Médiateur + Sociable : alliance naturelle
['TR',  'JC',  0.72],  // Deux extravertis curieux : énergie partagée
['LPL', 'SB',  0.70],  // Deux jovials sociables
['GD',  'AM',  0.65],  // Introvertis prudents : connexion discrète
```

### 3. Brancher `data-id` dans info-panel → click-to-select depuis la sidebar

**Pourquoi :** Le HTML génère déjà `data-id` sur chaque `.entity-row` mais il n'y a aucun event listener. C'est une UX manquante flagrante — l'utilisateur voit les entités dans le panel et ne peut pas cliquer dessus pour les inspecter (doit cliquer directement sur le canvas).

**Comment** (dans `index.html`, après `sim.start()`) :
```js
infoPanel.addEventListener('click', (ev) => {
  const row = ev.target.closest('[data-id]');
  if (!row) return;
  const id = row.dataset.id;
  const entity = sim.entities.find(e => e.id === id);
  if (entity) {
    sim.selectedEntity = (sim.selectedEntity === entity) ? null : entity;
  }
});
```

**CSS** — ajouter `cursor: pointer` sur `.entity-row` dans `style.css`.

---

## Contraintes à respecter

- `SAVE_KEY = 'haize_save_v1'` — ne pas changer, ne pas toucher au format save
- FSM 9 états — stable, ne pas refactorer `_updateState`
- `PROJECT_MAX = 3`, 12 entités, `ENTITY_DEFS` — structures immuables
- Ne pas toucher à `Heatmap`
- Ne pas introduire de `async` dans la boucle de rendu
- `_activeFriendLinks` structure `{ a, b, score, strength }` — étendre uniquement (ajouter `isClose`)
- `_activeRancorLinks` structure `{ a, b, count, dist }` — stable
- Conserver backward compat des snapshots localStorage

---

## Code à écrire (extraits clés)

### Fix B3 — Supprimer `successCounts` du snapshot top-level (simulation.js `save()`)
```js
// Retirer cette ligne de save() :
successCounts: Object.fromEntries(
  this.entities.map(e => [e.id, e.successCount])
),
// Le successCount est déjà dans entity.toSnapshot() → load via fromSnapshot()
```

### Cache _activeRecruitLinks (simulation.js, dans le bloc `_friendLinkTimer >= 200`)
```js
// Ajouter après rebuild _activeRancorLinks :
this._activeRecruitLinks = [];
for (const recruiter of entities) {
  if (recruiter.state !== STATE.PROJET) continue;
  for (const other of entities) {
    if (other === recruiter || other.state === STATE.PROJET) continue;
    const aff = recruiter.getAffinityWith(other.id);
    if (aff < 0.5) continue;
    const dx = other.x - recruiter.x, dy = other.y - recruiter.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 300) continue;
    this._activeRecruitLinks.push({ recruiter, other, aff, dist });
  }
}
```

### Initialiser `_activeRecruitLinks` dans constructor et reset()
```js
this._activeRecruitLinks = []; // dans constructor (ligne ~constructor)
// Et dans reset() :
this._activeRecruitLinks = [];
```

### Brancher info-panel (index.html, après `sim.start()`)
```js
infoPanel.addEventListener('click', (ev) => {
  const row = ev.target.closest('[data-id]');
  if (!row) return;
  const entity = sim.entities.find(e => e.id === row.dataset.id);
  if (entity) sim.selectedEntity = (sim.selectedEntity === entity) ? null : entity;
});
```
