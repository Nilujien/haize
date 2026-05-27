# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 20:15 (analyse autonome Jubis)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien

- Architecture FSM 9 états toujours solide, bien documentée
- **Fix B1 réalisé** : `isClose` intégré dans `_activeFriendLinks` — la "passe proche-amis" utilise désormais le cache, O(n²) render eliminé ✅
- Gradients halos (humeur, euphorique, concentré, saturation) correctement invalidés par cache
- Heatmap OffscreenCanvas + LUT → optimal
- Panel inspect Canvas avec sparkline, rancœurs, expériences
- Adaptive render skip fonctionnel (skip 1 frame/2 si update > 8ms)
- Territoires + dérive lente du home → cohérent visuellement
- Mémoire lieux heureux/évités avec decay progressif
- Save/load complet avec backward compat
- Pensées ambiantes et emojis flottants → bon feedback visuel

### Ce qui pose problème

1. **`_renderRecruitLinks` toujours O(n²) non-caché** — priorité 1 non finalisée du dernier plan
2. **6 paires AFFINITES seulement** — couverture trop faible, simulation démarre "froide"
3. **Click-to-select depuis info-panel non branché** — `data-id` généré mais aucun listener
4. **`successCounts` dead code dans `save()`** — grossit inutilement le snapshot
5. **Inconsistance sémantique `introFactor`** — mineur, toujours présent
6. **Pas de type de projet REPOS/RETRAIT** — les introvertis saturés n'ont aucun projet "adapté" à leur état CONCENTRE

---

## Bugs / régressions détectés

### B1 — `_renderRecruitLinks` : O(n²) non-caché (non corrigé du tour précédent)
**simulation.js ~L1720** — Double boucle `entities × entities` à chaque frame render.  
Avec 12 entités = 66 paires × ~60fps = ~4000 itérations/s inutiles.  
Le cache `_activeFriendLinks` / `_activeRancorLinks` est le pattern établi — il suffit de l'appliquer.

### B2 — Double stockage `successCounts` dans le snapshot (non corrigé)
**simulation.js `save()`** — `successCounts: Object.fromEntries(...)` est inclus au niveau top-level du snapshot mais jamais lu dans `load()`. Dead code qui grossit le localStorage. Fix trivial : supprimer la ligne.

### B3 — Légende des affinités dans index.html ne reflète pas la réalité
**index.html ~L50** — La légende AFFINITES est statiquement générée depuis `AFFINITES` array. Si on ajoute des paires, la légende se met à jour automatiquement. OK — pas de bug, juste à confirmer.

### B4 — `infoPanel.addEventListener('click')` manquant (feature incomplète)
**index.html après `sim.start()`** — `data-id` généré dans `_updatePanel` mais aucun handler. UX dégradée : l'utilisateur voit les entités dans le panel mais ne peut pas cliquer dessus pour les inspecter.

### B5 — `entity-row` manque `cursor: pointer` (CSS)
**style.css, `.entity-row`** — Sans curseur pointer, l'utilisateur n'a aucun feedback visuel que les lignes du panel sont cliquables.

---

## Perf

**Budget frame actuel estimé :**
- `_update` (12 entités, O(n²) interactions) : ~3-6ms
- `_render` (Canvas 2D, halos + trails + liens) : ~3-7ms
- Total : ~6-13ms / 16.6ms cible → marge confortable (~22-64%)
- Adaptive render skip protège si update > 8ms

**Bottlenecks restants :**
1. `_renderRecruitLinks` : O(n²) non-caché — ~0.3ms/frame selon nombre d'entités PROJET
2. `_thoughtBubbles` : `entities.find` dans la boucle de rendu — négligeable à 12 entités

**Après fix `_activeRecruitLinks`** : économie estimée ~0.3ms/frame, budget render → ~2.7-6.7ms.

---

## Priorités recommandées pour le prochain tour

### 1. Fix B1 — Créer `_activeRecruitLinks` (cache rebuild 5×/s)

**Pourquoi :** Report du tour précédent. Cohérence architecturale. O(n²) dans le render loop est une dette technique active.

**Comment :**

```js
// Dans simulation.js, constructor — après _activeRancorLinks:
this._activeRecruitLinks = [];

// Dans reset() — après _activeRancorLinks:
this._activeRecruitLinks = [];

// Dans _update, bloc `if (this._friendLinkTimer >= 200)` — après rebuild _activeRancorLinks:
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

// Dans _renderRecruitLinks — remplacer la double boucle par lecture du cache:
_renderRecruitLinks(ctx) {
  if (!this._activeRecruitLinks || this._activeRecruitLinks.length === 0) return;
  ctx.save();
  for (const { recruiter, other, aff, dist } of this._activeRecruitLinks) {
    const alpha = aff * 0.22 * (1 - dist / 300);
    ctx.beginPath();
    ctx.moveTo(recruiter.x, recruiter.y);
    ctx.lineTo(other.x, other.y);
    ctx.strokeStyle = `rgba(255,215,0,${alpha.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}
```

### 2. Fix B4+B5 — Brancher click-to-select depuis info-panel + CSS cursor

**Pourquoi :** UX manquante flagrante. `data-id` est déjà généré — il manque juste l'event listener. 5 lignes de code, impact UX immédiat : l'utilisateur peut cliquer sur une ligne du panel latéral pour inspecter l'entité.

**Comment :**

```js
// Dans index.html, APRÈS sim.start() :
infoPanel.addEventListener('click', (ev) => {
  const row = ev.target.closest('[data-id]');
  if (!row) return;
  const entity = sim.entities.find(e => e.id === row.dataset.id);
  if (entity) sim.selectedEntity = (sim.selectedEntity === entity) ? null : entity;
});
```

```css
/* Dans style.css, ajouter dans .entity-row : */
cursor: pointer;
```

### 3. Enrichir AFFINITES — ajouter 8 paires ciblées (4 positives + 4 négatives/neutres)

**Pourquoi :** 6 paires pour 12 entités = 9% de couverture. Les premières minutes sont "mortes" (peu de liens visibles, tout dépend de l'accumulation lente). Impact visuel immédiat sur le démarrage. Coût : 8 lignes dans entities.js.

**Paires recommandées :**
```js
// Positives
['JG',  'IM',  0.78],  // Deux curieux introvertis : affinité intellectuelle forte
['CM',  'SB',  0.82],  // Médiateur + Sociable : alliance naturelle évidente
['TR',  'JC',  0.72],  // Deux extravertis curieux : énergie partagée
['LPL', 'SB',  0.70],  // Deux jovials sociables : bonne compagnie

// Négatives (friction latente)
['ER',  'LD',  0.15],  // Agressif vs Solitaire-pacifique : friction naturelle
['FT',  'GD',  0.10],  // Hyperactif vs Prudent-introverti : incompatibles
['ER',  'IM',  0.20],  // Agressif vs Introspectif-sensible
['FT',  'IM',  0.18],  // Hyperactif vs Introverti silencieux
```

**Note :** L'ajout de paires négatives (<0.3) n'impacte pas les liens d'amitié (threshold = 8 interactionLog) mais influence les forces d'attraction/répulsion sociale dès le début, rendant les séparations de groupes plus lisibles.

---

## Contraintes à respecter

- `SAVE_KEY = 'haize_save_v1'` — ne pas changer
- FSM 9 états — stable, ne pas refactorer `_updateState`
- `PROJECT_MAX = 3`, 12 entités, `ENTITY_DEFS` — structures immuables
- Ne pas toucher à `Heatmap`
- Ne pas introduire de `async` dans la boucle de rendu
- `_activeFriendLinks` structure `{ a, b, score, strength, isClose }` — stable (isClose ajouté au tour précédent)
- Conserver backward compat des snapshots localStorage
- **Ne pas casser** le signal 📡 throttlé par paire dans `_update` (recrutement physique) — le cache `_activeRecruitLinks` n'affecte que le rendu, pas la physique

---

## Code à écrire (extraits clés)

### Fix B2 — Supprimer `successCounts` dead code dans `save()`
```js
// Retirer de simulation.js save() — les 3 lignes suivantes :
successCounts: Object.fromEntries(
  this.entities.map(e => [e.id, e.successCount])
),
// successCount est déjà dans entity.toSnapshot() → restauré via fromSnapshot()
```

### Initialiser `_activeRecruitLinks` dans constructor
```js
// Après la ligne `this._activeRancorLinks = [];` dans constructor :
this._activeRecruitLinks = [];
```

### Ajouter dans reset()
```js
// Après `this._activeRancorLinks = [];` dans reset() :
this._activeRecruitLinks = [];
```

### Rebuild dans `_update` (bloc `_friendLinkTimer >= 200`)
```js
// À la fin du bloc if (_friendLinkTimer >= 200), après rebuild _activeRancorLinks :
// Cache liens de recrutement (5×/s, comme friend/rancor)
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

### `_renderRecruitLinks` — remplacer la double boucle
```js
_renderRecruitLinks(ctx) {
  if (!this._activeRecruitLinks || this._activeRecruitLinks.length === 0) return;
  ctx.save();
  for (const { recruiter, other, aff, dist } of this._activeRecruitLinks) {
    const alpha = aff * 0.22 * (1 - dist / 300);
    ctx.beginPath();
    ctx.moveTo(recruiter.x, recruiter.y);
    ctx.lineTo(other.x, other.y);
    ctx.strokeStyle = `rgba(255,215,0,${alpha.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}
```
