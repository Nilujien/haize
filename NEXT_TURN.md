# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 23:29 (Jubis — cron planification)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien ✅

- FSM 9 états stable, transitions cohérentes
- Micro-événements spontanés (dispute + contagion euphorie) bien intégrés
- Cache liens amitié/rancœur/recrutement à 5×/s — O(n²) limité
- Compteur d'états dans le panel — lisibilité instantanée
- Heatmap LUT précalculée — perf solide
- Budget frame tenu : update 3-6ms, render 3-7ms → 60fps
- Gradient cache (saturation, euphorique, concentré, mood, territoire) bien invalidés
- Système de rancune avec decay nuit → oubli naturel crédible

### Ce qui manque / sonne faux

- **Pas de réconciliation** : les rancunes ne peuvent que décroître passivement (nuit) ou par le cron de planification. Il manque l'arc narratif opposé à la dispute spontanée.
- **Double-render du cœur** : le 💛 est dessiné deux fois pour les amis proches avec score > 40 (une fois dans la boucle principale, une fois dans la passe `isClose`). Artefact visuel subtil mais réel.
- **Durée CONCENTRÉ non cappée** : `_euphoriqueCap` existe (15-25s), mais CONCENTRÉ peut durer indéfiniment si l'énergie reste < 20. Les entités épuisées peuvent rester figées trop longtemps.
- **Console non filtrable** : tous les événements sont mélangés. Quand plusieurs choses se passent simultanément, la lecture est confuse.

---

## Bugs / régressions détectés

### Bug 1 — Double `introFactor` dans `_update` (cosmétique, pas de régression)
**simulation.js** lignes ~390 et ~409 :
```js
const introFactor = 1 - e.character.socialite;   // déclaration 1 (charge sociale)
// ...
const introFactor = 1 - e.character.socialite;   // déclaration 2 (récupération nocturne)
```
JS n'en fait pas un crash (re-déclaration `const` dans des blocs séparés = OK) mais c'est trompeur. Renommer la seconde `introFactorNight` pour clarté.

### Bug 2 — Double-render du cœur 💛 (artefact visuel)
**simulation.js** — `_renderFriendshipLinks` :
- Boucle 1 (ligne ~1755) : dessine 💛 si `score > 40`
- Boucle 2 "passe cœur rapproché" (ligne ~1774) : dessine 💛 si `isClose && score >= 40`

Pour une paire **proche + score ≥ 40**, le cœur est dessiné deux fois par frame à des opacités différentes → scintillement/épaississement parasite.

**Fix** : dans la boucle 1, conditionner l'affichage du cœur à `!isClose` (laisser la passe 2 gérer les proches). Ou supprimer la redondance dans la passe 2 si déjà dessiné.

### Bug 3 — Absence de cap CONCENTRÉ (comportement pathologique)
Pas un crash, mais un état persistant problématique : une entité épuisée (energy < 20) peut rester CONCENTRÉ indéfiniment si elle ne se repose jamais. La FSM sort de CONCENTRÉ uniquement si `energy ≥ 20` (via les branches inférieures), mais en CONCENTRÉ la vitesse est réduite (-50%) donc l'énergie se régénère lentement. Résultat : entités gelées 2-3 minutes réelles.

**Fix** : ajouter `_concentreCap` (45-60s, similaire à `_euphoriqueCap`).

---

## Perf

Budget frame inchangé : update ~3-6ms, render ~3-7ms → 60fps tenu.
- Aucun nouveau goulot introduit au tour précédent
- La heatmap dirty-blit (offscreen ImageData) reste le seul point à surveiller si fenêtre s'agrandit
- `_activeRecruitLinks` rebuild O(n²) mais n=12, négligeable (~0.1ms)
- Les gradients avec cache key positionnelle (territoire, mood, halo) économisent ~1-2ms/frame
- Marges disponibles pour 1-2 features supplémentaires sans risque

---

## Priorités recommandées pour le prochain tour

### 1. Fix double-render cœur + cap CONCENTRÉ (warm-up, 15 min)

Deux petits bugs de qualité à corriger en début de tour pour "démarrer propre".

**Double cœur** — `_renderFriendshipLinks` boucle 1 :
```js
// Avant :
if (score > 40) { ctx.fillText('💛', midX, midY); }

// Après :
if (score > 40 && !isClose) { ctx.fillText('💛', midX, midY); }
```

**Cap CONCENTRÉ** — `_updateState` bloc EUPHORIQUE :
```js
// Ajouter APRÈS le bloc euphorique similaire :
if (e.state === STATE.CONCENTRE) {
  e._concentreDuration = (e._concentreDuration || 0) + dt;
  if (e._concentreDuration > (e._concentreCap || 50000)) {
    e.state = STATE.REPOS; // sortie vers repos, pas errance (entité épuisée)
    e._stateTimer = 0;
    e._concentreDuration = 0;
    return;
  }
}
// Et dans le bloc newState === STATE.CONCENTRE :
e._concentreCap = 40000 + Math.random() * 20000; // 40-60s
```

---

### 2. Réconciliation spontanée (feature principale, ~30 min)

Arc narratif manquant : la dispute spontanée existe, la réconciliation non. Le système de rancune n'a qu'une décroissance passive (nuit / oubli). Ajouter un événement miroir dans `_spontaneousEventCheck`.

**Déclencheur** : deux entités avec `conflictCount[ck] ≥ 4` ET `a.mood > 0.3` ET `b.mood > 0.3` ET proches (`dist < 100px`) → **8% de chance** → réconciliation.

**Effets** :
- `this._conflictCount[ck] = Math.max(0, this._conflictCount[ck] - 2)` (réduction partielle, pas reset total)
- Bonus mood léger : `a.mood = Math.min(1, a.mood + 0.1)` / idem b
- Spawn emoji 💚 au point médian
- Log vert : `💚 ${idA} ↔ ${idB} se réconcilient (rancune ×N → ×M)`
- **Pas** de reset à 0 : la rancune a une mémoire, elle cicatrise mais ne disparaît pas complètement

**Placement** : dans `_spontaneousEventCheck`, entre la dispute et l'euphorie contagieuse (ordre : dispute → réconciliation → euphorie), avec `return` pour garantir un seul événement par check.

**Pseudo-code** :
```js
// Entre dispute et euphorie :
for (const [ck, count] of Object.entries(this._conflictCount)) {
  if (count < 4) continue;
  const [idA, idB] = ck.split('-');
  const a = entities.find(e => e.id === idA);
  const b = entities.find(e => e.id === idB);
  if (!a || !b) continue;
  // Condition : les deux de bonne humeur et proches
  if (a.mood <= 0.3 || b.mood <= 0.3) continue;
  const dx = a.x - b.x, dy = a.y - b.y;
  if (dx*dx + dy*dy > 100*100) continue;
  if (Math.random() > 0.08) continue;
  // Réconciliation
  const newCount = Math.max(0, count - 2);
  if (newCount === 0) {
    delete this._conflictCount[ck];
  } else {
    this._conflictCount[ck] = newCount;
  }
  a.mood = Math.min(1, a.mood + 0.1);
  b.mood = Math.min(1, b.mood + 0.1);
  this._spawnFloatingEmoji((a.x + b.x) / 2, (a.y + b.y) / 2 - 10, '💚');
  this.pushEvent(
    `💚 ${idA} et ${idB} se réconcilient (rancune ×${count} → ×${newCount})`,
    '#00b894', 'social'
  );
  return;
}
```

---

### 3. Filtrage de la console par catégorie (feature UI, ~20 min, optionnel si budget serré)

La console mélange state/social/conflict/project/global. Ajouter des boutons de filtre dans `#event-console-header`.

**HTML** (dans index.html) :
```html
<div id="console-filters">
  <button class="filter-btn active" data-cat="all">ALL</button>
  <button class="filter-btn" data-cat="conflict">⚔️</button>
  <button class="filter-btn" data-cat="social">💬</button>
  <button class="filter-btn" data-cat="project">🔧</button>
  <button class="filter-btn" data-cat="global">🌐</button>
</div>
```

**JS** : variable `activeFilter = 'all'`, filtrer `sim.eventLog` dans `updateConsole()` sur `entry.category`.

**CSS** : `.filter-btn { font-size:9px; padding:2px 6px; border-radius:3px; cursor:pointer; opacity:0.4 } .filter-btn.active { opacity:1; }`

---

## Contraintes à respecter

- `SAVE_KEY = 'haize_save_v1'` — ne pas changer (backward compat save)
- FSM 9 états — ne pas modifier `STATE` ni ajouter de nouvel état
- `PROJECT_MAX = 3`, 12 entités, `ENTITY_DEFS` — immuables
- Ne pas toucher à la classe `Heatmap`
- Pas d'`async` dans la boucle de rendu
- `_activeFriendLinks` shape `{ a, b, score, strength, isClose }` — stable
- Ne pas modifier la signature de `_spontaneousEventCheck` (appelée depuis `_update`)
- Le cap CONCENTRÉ doit être initialisé dans le bloc `newState === STATE.CONCENTRE` de `_updateState`, pas ailleurs

---

## Résumé des fichiers à modifier

| Fichier | Changements |
|---|---|
| `simulation.js` | Fix double-cœur (1 ligne), cap CONCENTRÉ (~10 lignes), réconciliation (~20 lignes dans `_spontaneousEventCheck`) |
| `index.html` | Filtres console (~5 lignes HTML + ~15 lignes JS) |
| `style.css` | Style `.filter-btn` (~8 lignes) |

Budget total estimé : 50-60 lignes nettes. Risque faible.
