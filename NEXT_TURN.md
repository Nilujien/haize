# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 17:09 (analyse pré-tour autonome)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien

- FSM 9 états solide, transitions cohérentes, plancher CONCENTRE opérationnel
- Système rancune complet : accumulation, decay nuit, panel, liens visuels ❄️
- Badge 🧘 vs 🎯 pour les deux chemins CONCENTRE — narrativement riche
- Heatmap LUT + offscreen : perf propre, ~1 drawImage/frame
- Cache friendship links (rebuild 5×/s via `_activeFriendLinks`) : O(n²) sorti du render hot path
- DOM panel hash : ~1200 créations de nœuds évitées entre les updates silencieux
- Save/Load complet avec conflictCount persisté
- Happy/avoid zones avec mémoire spatiale — comportement plausible

### Ce qui pose problème

- **Timers critiques non persistés** dans snapshot : état partiellement corrompu après reload
- **`e.social`** est calculé (bruit aléatoire) mais n'est utilisé nulle part dans la FSM ni dans les interactions — dead code qui pollue les snapshots
- **`_renderRancorLinks` et "passe cœur rapproché"** sont des boucles O(n²) au moment du rendu, non cachées — mineur avec 12 entités mais principe mauvais
- **Cascade narrative absente** : quand un projet CELEBRATION se résout, aucun effet de vague — l'euphorie collective n'est pas exploitée

---

## Bugs / régressions détectés

| # | Fichier | Ligne approx. | Description |
|---|---------|---------------|-------------|
| B1 | `entities.js` | `toSnapshot()`/`fromSnapshot()` | `_socialLoadTimer` absent du snapshot → introvertis perdent leur timer de retraite au reload (prévu mais non fait) |
| B2 | `entities.js` | `toSnapshot()`/`fromSnapshot()` | `_concentreViaP3` absent → flash visuel 🎯→🧘 au reload en CONCENTRE |
| B3 | `simulation.js` | `_updateState()` ~ligne EUPHORIQUE | `_euphoriqueDuration`, `_euphoriqueCap`, `_concentreDuration`, `_concentreMinDuration` non persistés → après reload, une entité en EUPHORIQUE peut y rester indéfiniment (cap reset) ou une entité CONCENTRE sortir immédiatement (plancher reset) |
| B4 | `simulation.js` | `_renderFriendshipLinks()` | Second O(n²) "passe cœur rapproché" effectué **au rendu** (non caché) — fonctionne mais incohérent avec l'architecture cache du reste |
| B5 | `entities.js` | Classe `Entity` | `e.social` est modifié chaque frame (`Math.random()`) mais **jamais lu** dans la logique — dead property, polluant et trompeur |

---

## Perf

**Budget frame actuel (estimé) :**
- `_update` : ~4-7ms sur machine typique (66 pairs × 10+ opérations vectorielles + projets + zones)
- `_render` : ~2-4ms (trails, halos gradients cachés, heatmap en O(cells) seulement si dirty)
- `_updatePanel` : ~0.3ms (throttlé 200ms, hash évite le rebuild DOM)
- **Total : ~6-11ms → confortablement dans le budget 60fps (16.6ms)**

**Bottlenecks identifiés :**
1. `_renderRancorLinks` : O(n²) par frame, non caché (66 iter. × sort/check → ~0.1ms, tolérable mais sale)
2. "passe cœur rapproché" dans `_renderFriendshipLinks` : second O(n²) au rendu (~0.05ms)
3. `_updateState` : appelle `this.projects.some(...)` pour chaque entité en PROJET → O(n×projets), négligeable

---

## Priorités recommandées pour le prochain tour

### 1. Fix snapshots : persister les timers manquants (B1, B2, B3)

**Pourquoi :** Correctness de la save. Une entité en EUPHORIQUE qui recharge peut y rester permanent. Une entité CONCENTRE en retraite introvertie perd son contexte.

**Comment :**

Dans `entities.js` → `toSnapshot()` :
```js
_socialLoadTimer:       e._socialLoadTimer || 0,
_concentreViaP3:        e._concentreViaP3 || false,
```

Dans `entities.js` → `fromSnapshot()` :
```js
e._socialLoadTimer  = snap._socialLoadTimer  ?? 0;
e._concentreViaP3   = snap._concentreViaP3   ?? false;
```

Dans `simulation.js` → `save()` :
```js
euphoriqueDurations:  Object.fromEntries(
  this.entities.map(e => [e.id, {
    dur: e._euphoriqueDuration || 0,
    cap: e._euphoriqueCap     || 20000,
  }])
),
concentreDurations: Object.fromEntries(
  this.entities.map(e => [e.id, {
    dur: e._concentreDuration    || 0,
    min: e._concentreMinDuration || 4000,
  }])
),
```

Dans `simulation.js` → `load()` :
```js
if (snap.euphoriqueDurations) {
  for (const e of this.entities) {
    const d = snap.euphoriqueDurations[e.id];
    if (d) { e._euphoriqueDuration = d.dur; e._euphoriqueCap = d.cap; }
  }
}
if (snap.concentreDurations) {
  for (const e of this.entities) {
    const d = snap.concentreDurations[e.id];
    if (d) { e._concentreDuration = d.dur; e._concentreMinDuration = d.min; }
  }
}
```

---

### 2. Supprimer `e.social` (B5 — dette technique)

**Pourquoi :** Dead code depuis de nombreux tours. Fausse les snapshots, trompe les futurs lecteurs.

**Comment :**
- Supprimer `this.social = ...` dans le constructeur Entity
- Supprimer `e.social += ...` dans `_update`
- **NE PAS** inclure dans `toSnapshot()` / `fromSnapshot()` (backward compat : juste ignorer si présent dans les vieux saves)
- Aucun usage dans la FSM ou les interactions → suppression sans risque

---

### 3. Cascade narrative : CELEBRATION → vague d'euphorie locale (feature)

**Pourquoi :** Le projet CELEBRATION est le seul à avoir un affinity `socialite` avec le reward mood le plus élevé (0.50). Sa résolution devrait déclencher une onde visible. Impact narratif maximal, effort minimal.

**Comment :**

Dans `_updateProjects()`, après la boucle de résolution d'un projet :
```js
if (proj.resolved && proj.type === 'CELEBRATION') {
  // Vague d'euphorie : les entités proches (<300px) gagnent un bonus mood
  for (const e of this.entities) {
    if (!proj.participants.has(e.id)) continue; // déjà traité
    const nearbyBonus = this.entities.filter(o =>
      o !== e && Math.hypot(o.x - proj.x, o.y - proj.y) < 300
    );
    for (const o of nearbyBonus) {
      o.mood = Math.min(1, o.mood + 0.20);
      this._spawnFloatingEmoji(o.x, o.y, '🎉');
    }
  }
  this.pushEvent(`🎊 Vague de joie autour de "${proj.label}"`, proj.color, 'project');
}
```

Note : la vague ne force pas le state EUPHORIQUE directement (ça serait intrusif) — elle pousse le mood, et la FSM le détectera naturellement au prochain `_updateState` si energy > 70.

---

## Contraintes à respecter

- **Ne pas changer `SAVE_KEY`** (`haize_save_v1`) — backward compat requis
- **Ne pas refactorer la FSM** — les 9 états sont stabilisés
- **`PROJECT_MAX = 3`, `ENTITY_DEFS`, `AFFINITES`** — immuables
- **60 FPS non négociable**
- Toute section inspect : mettre à jour le calcul de `PH`
- Les nouvelles propriétés du snapshot doivent être **optionnelles** (vieux saves ne les ont pas)

---

## Code à écrire — extrait principal (priorité 3)

```js
// Dans _updateProjects(), dans le bloc `if (proj.progress >= proj.difficulty)` :
// Après le for loop existant qui gère mood/energy/successCount...

if (proj.type === 'CELEBRATION') {
  const now = performance.now();
  for (const o of this.entities) {
    if (proj.participants.has(o.id)) continue; // déjà récompensé ci-dessus
    const d = Math.hypot(o.x - proj.x, o.y - proj.y);
    if (d < 300) {
      const proximity = 1 - d / 300;
      o.mood = Math.min(1, o.mood + 0.15 * proximity);
      if (proximity > 0.5) {
        this._spawnFloatingEmoji(o.x, o.y - 10, '🎊');
      }
    }
  }
}
```

---

## Notes complémentaires

- **`_renderRancorLinks` cache** (B4 mineur) : pourrait être intégré dans le rebuild `_activeFriendLinks` sous forme de `_activeRancorLinks`, mais vu les 12 entités = 66 pairs max, l'impact est négligeable. À faire si un jour on passe à plus d'entités.
- **Badge `×N` sur liens rancune** (idée issue du bilan précédent) : toujours pertinent visuellement mais moins urgent que les fixes snapshot. Peut accompagner la priorité 3 si le budget temps le permet.
