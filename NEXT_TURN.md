# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 18:12 (analyse pre-tour autonome)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- FSM à 9 états robuste, transitions cohérentes avec caps et planchers
- Snapshot complet : mood, energy, socialCharge, rancunes, euphoriqueDuration, concentreDuration, happyZones/avoidZones
- Heatmap optimisée (LUT + ImageData + OffscreenCanvas) — quasi zéro impact frame
- Cache liens d'amitié rebuild 5×/s — O(n²) maîtrisé
- Gradient caching multi-niveaux (mood, euphorique, concentré, saturation, territoire)
- Budget frame ~6-11ms/16.6ms, marge confortable

### Ce qui pose problème / dette accumulée
- **Aucun type de projet `MEDITATION` ne profite aux introvertis via leur FSM** : une entité en CONCENTRE est repoussée socialement mais n'est jamais attirée vers MEDITATION (l'affinité est `curiosite` et non liée au besoin d'isolement). Les introvertis profonds (LD, GD, IM) ignorent MEDITATION même quand ils en auraient le plus besoin.
- **Cache `_activeRancorLinks` absent** : `_renderRancorLinks` fait un O(n²) complet à chaque frame (~66 iter × N frames), contrairement à `_activeFriendLinks` qui est caché. Avec 12 entités, c'est ~66 iterations à 60fps = ~4000/s — faible mais asymétrique.
- **Decay nuit de `socialCharge` non implémenté** : noté dans le plan précédent, la charge sociale des introvertis reste identique de jour comme de nuit. La nuit ralentit le mouvement mais ne favorise pas la récupération intrinsèque.
- **La cascade CELEBRATION ne force pas EUPHORIQUE** : les entités proches reçoivent un boost mood mais peuvent rester en SATURE ou FUITE — le spectacle visuel est raté si les entités n'explosent pas en or au moment de la fête.
- **`_recruitTimers` et `_concentrePerturbTimers` ne sont pas sérialisés** : les clés s'accumulent entre sessions. Lors d'un reset(), `_recruitTimers` est bien réinitialisé mais `_concentrePerturbTimers` aussi (Map). OK pour reset, mais un save/load laisse ces timers à zéro — comportement correct mais prévisible.
- **`ENTITY_DEFS` contient 12 entités mais AFFINITES n'en couvre que 6 paires** : 12 entités = 66 paires possibles, seules 6 ont des affinités prédéfinies, le reste dépend du dynamic log. Visuellement, peu d'entités montrent des liens forts dans les premières minutes.

---

## Bugs / régressions détectés

### B1 — `_renderRancorLinks` : pulse `globalAlpha` non restauré correctement
**simulation.js ~ligne 1475** :
```js
ctx.globalAlpha = intensity * 0.75;
ctx.fillText('❄️', ...);
ctx.globalAlpha = 1;
```
Ici `globalAlpha = 1` est interne à la boucle, mais le bloc `ctx.save()/ctx.restore()` englobe tout — techniquement correct. Pas un vrai bug, mais `ctx.restore()` à la fin du bloc devrait suffire (redondance légère).

### B2 — Fuite curseur : entités en PROJET interrompues partiellement
**simulation.js** — condition de sortie PROJET si curseur approche :
```js
if (e.state !== STATE.PROJET && e.state !== STATE.SATURE) {
  e.state = STATE.FUITE;
```
L'état PROJET est protégé ✓ — mais la vélocité de fuite est quand même appliquée à l'entité en PROJET (les lignes `e.vx += ...` avant le bloc `if`). Une entité sur un projet est poussée physiquement par le curseur même si son état ne change pas. Régression subtile : les entités sur des projets bougent sous le curseur et peuvent sortir du rayon du projet, stoppant leur contribution.

### B3 — Decay `interactionLog` trop agressif pour les vieux liens
**simulation.js** — `_forgetTimer` toutes les 30s :
```js
e.interactionLog[id] = Math.max(0, e.interactionLog[id] * 0.94);
```
Un score de 80 (ami proche) = ~6 semaines de jeu simulé pour disparaître — OK. Mais un score de 8 (seuil d'affichage lien) disparaît en ~60s réelles à ce decay rate. Les liens d'amitié clignotent et disparaissent fréquemment même entre entités qui se côtoient encore, car le decay s'applique uniformément sans vérifier si les entités sont encore proches.

---

## Perf

- Budget frame actuel estimé : 6-11ms update + 3-5ms render = ~9-16ms total
- Bottleneck principal : `_update` contient 2 boucles O(n²) imbriquées (neighbor count + interactions) = ~132+66 iterations/frame → ~1.2ms sur 12 entités, acceptable
- `_renderRancorLinks` : O(n²) à chaque frame, non caché — ~0.2ms (négligeable mais anomalie architecturale vs `_activeFriendLinks`)
- Gradient radialGradient : 5 types de halos par entité, invalidation bien gérée — pas de fuite
- Heatmap ImageData rebuild : seul sur dirty flag, ~1-3ms quand triggered, sinon 0.1ms drawImage

**Priorité perf** : aucun urgence. Marge de 5-7ms disponible pour nouvelles features.

---

## Priorités recommandées pour le prochain tour

### 1. Fix B2 — Protéger les entités en PROJET du push curseur (impact gameplay fort)

Les entités sur un projet se font éjecter par le curseur involontairement, rendant la complétion des projets difficile en mode interactif. Fix chirurgical :

```js
// Fuite du curseur — dans _update, avant application de la force
if (cdist < this.CURSOR_RADIUS && e.state !== STATE.PROJET) {
  // appliquer vx/vy fuite seulement si pas en PROJET
  e.vx += (cdx / cdist) * flee;
  e.vy += (cdy / cdist) * flee;
  e.mood = Math.max(-1, e.mood - 0.001 * dt);
  if (e.state !== STATE.SATURE) {
    e.state = STATE.FUITE;
    e._stateTimer = 0;
  }
  // log...
}
```

### 2. Decay `socialCharge` accéléré la nuit (impact simulation, effort faible)

La nuit devrait permettre aux introvertis de récupérer. Actuellement seule la charge `energy` se régénère la nuit. Ajouter dans `_update`, après le calcul de `socialCharge` :

```js
// Récupération nocturne de la charge sociale (introvertis recharge en solitude)
if (this.isNight && neighbors === 0) {
  const introFactor = 1 - e.character.socialite;
  e.socialCharge = Math.max(0, e.socialCharge - 0.025 * dt * (0.3 + introFactor * 0.7));
}
```

Effet attendu : les introvertis en SATURE/CONCENTRE récupèrent plus naturellement la nuit, cycle biologique plus plausible.

### 3. Cache `_activeRancorLinks` + badge `×N` (qualité visuelle + cohérence archi)

Parallèle à `_activeFriendLinks` — rebuild toutes les 200ms, lu dans render :

```js
// Dans _update, dans le bloc friendLinkTimer rebuild :
this._activeRancorLinks = [];
for (let i = 0; i < entities.length; i++) {
  for (let j = i + 1; j < entities.length; j++) {
    const a = entities[i], b = entities[j];
    const ck = [a.id, b.id].sort().join('-');
    const count = this._conflictCount[ck] || 0;
    if (count < 3) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 350) continue;
    this._activeRancorLinks.push({ a, b, count, dist });
  }
}
```

Et dans `_renderRancorLinks`, remplacer le double O(n²) par itération sur `this._activeRancorLinks`.
Bonus visuel : afficher `❄️×N` au centre du lien si count ≥ 5 pour encoder l'intensité.

---

## Contraintes à respecter

- `SAVE_KEY = 'haize_save_v1'` — ne pas changer (breaking change sinon)
- FSM 9 états — stable, ne pas refactorer
- `PROJECT_MAX = 3`, `ENTITY_DEFS` (12 entités), `AFFINITES` — immuables
- Ne pas toucher à `Heatmap` — architecture solide
- Ne pas introduire de `async` dans la boucle de rendu
- `_activeFriendLinks` : ne pas modifier la structure `{ a, b, score, strength }` sans adapter `_renderFriendshipLinks`

---

## Code à écrire (ébauche principale)

### Fix B2 — protection PROJET vs curseur (simulation.js, ~ligne 620)

Repérer le bloc :
```js
const cdx  = e.x - this.mouseX;
const cdy  = e.y - this.mouseY;
const cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
if (cdist < this.CURSOR_RADIUS) {
  const flee = (1 - cdist / this.CURSOR_RADIUS) * 0.35;
  e.vx += (cdx / cdist) * flee;
  e.vy += (cdy / cdist) * flee;
  e.mood = Math.max(-1, e.mood - 0.001 * dt);
  if (e.state !== STATE.PROJET && e.state !== STATE.SATURE) {
    e.state = STATE.FUITE;
    e._stateTimer = 0;
  }
```

Modifier pour conditionner les forces de fuite à `e.state !== STATE.PROJET` :
```js
if (cdist < this.CURSOR_RADIUS && e.state !== STATE.PROJET) {
  const flee = (1 - cdist / this.CURSOR_RADIUS) * 0.35;
  e.vx += (cdx / cdist) * flee;
  e.vy += (cdy / cdist) * flee;
  e.mood = Math.max(-1, e.mood - 0.001 * dt);
  if (e.state !== STATE.SATURE) {
    e.state = STATE.FUITE;
    e._stateTimer = 0;
  }
  const nowF = performance.now();
  if (!this._lastFuiteLog[e.id] || nowF - this._lastFuiteLog[e.id] > 3000) {
    this._lastFuiteLog[e.id] = nowF;
    this.pushEvent(`👻 ${e.id} fuit le curseur`, e.color, 'flee');
  }
}
```

### Decay nocturne socialCharge (simulation.js, dans la boucle entités de _update)

Après le bloc `socialCharge` (gain/perte) :
```js
// Récupération nocturne (introvertis récupèrent en solitude la nuit)
if (this.isNight && neighbors === 0) {
  const introFactor = 1 - e.character.socialite;
  e.socialCharge = Math.max(0,
    e.socialCharge - 0.025 * dt * (0.3 + introFactor * 0.7)
  );
}
```
