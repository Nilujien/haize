# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 03:43_

---

## Bilan du tour précédent (03:10)

Toutes les optimisations du plan précédent ont été implémentées proprement :
- ✅ Cache gradient territoire (fix stale gradient + clé `erRounded`)
- ✅ Cache gradient humeur par entité (invalidation sign + absMood delta + position)
- ✅ Cache halo saturation
- ✅ Refactor `updateConsole` (dirty flag + `onConsoleDirty`, fin de la double boucle rAF)
- ✅ Touch cursor ghost : timeout 800ms dans `touchend` — **partiellement résolu** (voir bug #1)

Le panel diff conditionnel et le cache affinité ont été correctement abandonnés (coût > gain).

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Physique fluide, 12 entités avec personnalités distinctes, territorialité cohérente
- Système de projets actif et visuellement lisible
- Jour/nuit, étoiles, lune — ambiance réussie
- Console événements propre, panel entités à 200ms throttle
- Sauvegarde/restauration complète via localStorage
- FPS badge + perf badges en temps réel

### Ce qui pose problème (voir bugs ci-dessous)
- Halo saturation : radius de dessin potentiellement décalé du radius calculé (cache incomplet)
- Projets : gradient recréé chaque frame (3 `createRadialGradient`/frame inutiles)
- Touch : le `touchstart` active immédiatement la zone de fuite → les entités fuient brièvement au tap

---

## Bugs / régressions détectés

### Bug #1 — Touch cursor : fuite au tap (priorité HAUTE)
**Fichier : `index.html`** — handler `touchstart`

Le `touchstart` pose `sim.mouseX = t.clientX; sim.mouseY = t.clientY;` **immédiatement**, ce qui active la zone rouge de fuite curseur. Les entités proches du tap point fuient 800ms avant reset.

Sur mobile, cela donne une expérience bizarre : on tape pour inspecter une entité et elle fuit vers nous.

**Fix :**
```js
// touchstart : NE PAS setter mouseX/Y (supprimer ces deux lignes)
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  // Supprimer : sim.mouseX = t.clientX; sim.mouseY = t.clientY;
}, { passive: false });
```
Le mouseX/Y n'est utile que pour la fuite Shift+souris. Le touch n'a pas besoin de ça.

---

### Bug #2 — Saturation halo : radius de dessin potentiellement stale
**Fichier : `simulation.js`** — `_renderEntity`, vers la section `isSaturated`

```js
const haloR = r * (2.2 + Math.sin(performance.now() * 0.003) * 0.3);
```
Ce `haloR` change chaque frame (pulse). Or la condition de recréation du gradient ne vérifie **pas** si `haloR` a changé — elle vérifie seulement `socialCharge` et position. Résultat : le gradient est dessiné à `e._satGradR` (valeur au moment du dernier cache), mais le `ctx.arc` utilise le `haloR` **courant**.

Le cercle tracé peut donc être différent du gradient → halo qui "déborde" ou "tronque".

**Fix :** remplacer le `ctx.arc(e.x, e.y, e._satGradR, ...)` par `ctx.arc(e.x, e.y, haloR, ...)` — dessiner toujours le `haloR` courant, pas le cached. Le gradient est construit avec le rayon du dernier cache (légèrement décalé si pulse actif), mais l'arc suivra le pulse. **Ou** inclure `haloR` dans la clé de cache :
```js
|| Math.abs((e._satGradR || 0) - haloR) > 2
```

---

### Bug #3 — Projets : `createRadialGradient` non caché
**Fichier : `simulation.js`** — `_renderProject`

Chaque frame active, pour chaque projet (max 3) :
```js
const gradient = ctx.createRadialGradient(proj.x, proj.y, r * 0.5, proj.x, proj.y, proj.radius * 1.5);
```
Les projets sont statiques (pos fixe, radius fixe). Le seul paramètre qui varie est `r = proj.radius * 0.45 * pulse` (animation), donc `r * 0.5` change légèrement chaque frame.

**Fix :** stocker `proj._gradient` et l'invalider seulement si `pulse` a varié > 0.03 :
```js
const pulseDelta = Math.abs((proj._lastPulse || 0) - pulse);
if (!proj._gradient || pulseDelta > 0.03) {
  proj._gradient = ctx.createRadialGradient(proj.x, proj.y, r * 0.5, proj.x, proj.y, proj.radius * 1.5);
  proj._gradient.addColorStop(0,   proj.color + '22');
  proj._gradient.addColorStop(0.5, proj.color + '11');
  proj._gradient.addColorStop(1,   'transparent');
  proj._lastPulse = pulse;
}
ctx.fillStyle = proj._gradient;
```
Gain estimé : ~0.3–0.5ms/frame quand 3 projets actifs.

---

### Bug #4 (mineur) — `_renderCursorZone` : gradient non caché
**Fichier : `simulation.js`** — `_renderCursorZone`

Le `createRadialGradient` est créé dans `ctx.save()/translate()` donc les coordonnées sont `(0,0)`. La zone n'est rendue que si le curseur est dans les bounds ET Maj est enfoncé. Faible priorité — peut être batché avec les autres si on touche `_renderCursorZone`.

---

## Perf

Budget frame estimé actuel (post v4 optimisations) :
- **Update :** 3–5ms
- **Render :** 4–6ms (hors heatmap)
- **Total :** ~7–11ms → 60fps tenu confortablement

Optimisations restantes à fort levier :
- Fix bug #3 (projet gradient) : **~0.4ms/frame économisé**
- Cache curseur : ~0.1ms — négligeable

Aucun spatial partitioning nécessaire à 12 entités.

---

## Priorités recommandées pour le prochain tour

### 1. Fix touch cursor fuite (10 min — UX mobile, bug impactant)
Supprimer les deux lignes dans `touchstart` qui posent `sim.mouseX/Y`.
Le touch ne doit activer la fuite que si c'est un swipe avec Shift (scenario non existant sur mobile).

**Bénéfice :** inspection au tap fluide, pas d'entités qui fuient à chaque tap.

---

### 2. Fix saturation halo radius + cache projet gradient (15 min — perf + correction visuelle)

**2a.** Dans `_renderEntity`, remplacer `ctx.arc(e.x, e.y, e._satGradR, ...)` par `ctx.arc(e.x, e.y, haloR, ...)` — le dessin suit le pulse courant, même si le gradient interne est légèrement interpolé.

**2b.** Dans `_renderProject`, ajouter cache gradient sur `proj._gradient` avec invalidation sur `pulseDelta > 0.03` (voir pseudo-code bug #3 ci-dessus).

---

### 3. Feature : mémoire des lieux (45 min — profondeur comportementale)

Chaque entité retient les zones où elle a été heureuse (mood > 0.5). Ces zones biaisent son déplacement en `ERRANCE`.

**Dans `entities.js`** — ajouter à la classe `Entity` :
```js
this.happyZones = []; // [{x, y, score}] — max 5 zones
this._happyZoneTimer = 0;
```

**Dans `simulation.js` — `_update`**, après le calcul d'humeur :
```js
// Toutes les 3s de jeu, si humeur > 0.5, mémoriser la position
e._happyZoneTimer = (e._happyZoneTimer || 0) + dt;
if (e._happyZoneTimer > 3000 && e.mood > 0.5) {
  e._happyZoneTimer = 0;
  // Fusionner si zone proche (<80px)
  const nearby = e.happyZones.find(z => Math.hypot(z.x - e.x, z.y - e.y) < 80);
  if (nearby) {
    nearby.score = Math.min(10, nearby.score + 0.5);
  } else {
    e.happyZones.push({ x: e.x, y: e.y, score: 1 });
    if (e.happyZones.length > 5) {
      // Retirer la zone la moins mémorable
      e.happyZones.sort((a, b) => b.score - a.score);
      e.happyZones.length = 5;
    }
  }
}

// Biais de déplacement vers la meilleure zone heureuse (en ERRANCE seulement)
if (e.state === STATE.ERRANCE && e.happyZones.length > 0 && e.mood < 0) {
  const best = e.happyZones.reduce((a, b) => a.score > b.score ? a : b);
  const zdx = best.x - e.x, zdy = best.y - e.y;
  const zdist = Math.hypot(zdx, zdy) || 1;
  const pull = 0.015 * (best.score / 10) * (1 - e.mood); // plus fort si déprimé
  e.vx += (zdx / zdist) * pull;
  e.vy += (zdy / zdist) * pull;
}
```

**Visuel (optionnel) :** dans `_renderTerritories`, dessiner un petit point lumineux (glow subtle ≤ 20px) pour les `happyZones` de l'entité sélectionnée.

**Sérialisation :** ajouter `happyZones: [...this.happyZones]` dans `toSnapshot()` et la restauration dans `fromSnapshot()`.

**Bénéfice :** les entités déprimées retournent vers leurs lieux de bonheur passé — comportement crédible, émergence visible sur le long terme.

---

## Contraintes à respecter

- **Ne pas toucher aux `AFFINITES` ni aux `ENTITY_DEFS`** — l'équilibre comportemental est stable
- **Ne pas toucher au système de projets** (logique résolue/expirée fonctionne bien)
- **`SAVE_KEY` inchangé** — le format de snapshot v1 est en prod
- **Throttle panel à 200ms — maintenir** (pas de regression)
- **Ne pas modifier la logique `STATE.SATURE`** — bien calibrée
- Les `happyZones` doivent être optionnelles dans `fromSnapshot` (backward compat avec saves existantes)

---

## Code à écrire (résumé pour gagner du temps)

### Fix #1 — index.html, touchstart
```diff
- canvas.addEventListener('touchstart', (e) => {
-   e.preventDefault();
-   const t = e.changedTouches[0];
-   sim.mouseX = t.clientX;
-   sim.mouseY = t.clientY;
- }, { passive: false });
+ canvas.addEventListener('touchstart', (e) => {
+   e.preventDefault();
+ }, { passive: false });
```

### Fix #2a — simulation.js, _renderEntity
Ligne `ctx.arc(e.x, e.y, e._satGradR, ...)` → `ctx.arc(e.x, e.y, haloR, ...)`

### Fix #2b — simulation.js, _renderProject
Ajouter cache `proj._gradient` avec invalidation `pulseDelta > 0.03` (voir bug #3 pseudo-code).

### Feature #3 — entities.js + simulation.js
Voir pseudo-code complet dans section "Feature : mémoire des lieux".
