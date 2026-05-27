# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 06:43 (cron planification autonome)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Simulation 12 entités stable, comportements différenciés et plausibles
- Heatmap optimisée (OffscreenCanvas + LUT + dirty flag + throttle 10×/s)
- Panneau inspect complet : sparkline, contacts, barres traits, zones, charge sociale, tendance humeur
- happyZones + avoidZones avec decay progressif (ZONE_DECAY_RATE = 0.0008)
- Indicateur tendance humeur ↑↓→ dans le panel HTML
- Système de projets fonctionnel (5 types, progress, reward)
- Cycle jour/nuit, 5 événements globaux déclenchables manuellement
- Thought bubbles, floating emojis, friendship links

### Ce qui mérite attention

- **Cache friendship links** : prévu au tour précédent mais NON implémenté. `_renderFriendshipLinks` fait encore un double-loop O(n²) + appel `getAffinityWith` (loop AFFINITES) chaque frame.
- **Territory gradient cache : invalidation trop fréquente** — la clé inclut `effectiveRadius` (qui pulse chaque frame via `Math.sin`), ce qui force une recréation de gradient presque à chaque frame pour chaque entité.
- **États EUPHORIQUE / CONCENTRE** : priorité #2 du plan précédent, non implémentée. Le système d'états est prêt à l'accueillir.
- **Thought bubbles ne suivent pas l'entité** : `t.x, t.y` figés à la création → bulle se détache visuellement de l'entité en mouvement. Mineure mais visible à haute vitesse.

---

## Bugs / régressions détectés

### Bug #1 — Territory gradient recréé ~chaque frame (simulation.js ~ligne 1115)
```js
const erRounded = Math.round(effectiveRadius / 2) * 2;
const cacheKey = `${Math.round(e.homeX/5)*5}_${Math.round(e.homeY/5)*5}_${erRounded}`;
```
`effectiveRadius = e.homeRadius * pulse` avec `pulse = 1 + Math.sin(now * 0.0008 + …) * 0.04`.
Sur homeRadius ~120px → variation ±4.8px → `erRounded` change fréquemment → cache invalide ~toutes les 2-3s.
**Impact** : `createRadialGradient` × 12 entités × fréquentes invalidations = coût inutile sur le thread rendu.
**Fix** : retirer `erRounded` de la clé, ne recréer que sur mouvement du home (>5px).

### Bug #2 — Friendship links : O(n²) × O(affinités) sans cache (simulation.js _renderFriendshipLinks)
66 paires × appel `getAffinityWith` (loop 6 AFFINITES) = ~396 comparaisons/frame juste pour déterminer si lien visible.
**Impact** : ~0.3-0.5ms/frame gaspillé. À 60fps = ~18-30ms/s de CPU pour le rendu seul.
**Fix** : calculer `_activeFriendLinks` dans `_update` (throttlé à 5×/s), lire ce cache dans `_render`.

### Bug #3 — Thought bubbles figées (simulation.js _renderThoughtBubbles)
```js
this._thoughtBubbles.push({ entityId: e.id, x: e.x, y: e.y, … })
```
Position capturée à la création. L'entité bouge mais la bulle non.
**Fix** : dans `_renderThoughtBubbles`, récupérer `e.x, e.y` via `entityId` si `age < 500ms`, sinon laisser dériver (naturel).

### Pas de régression critique détectée sur :
- Logic projets, saturation sociale, decay zones, cycle jour/nuit, événements globaux

---

## Perf

- **Budget actuel estimé** (stable d'après plan précédent) : update ~2-3ms, render ~4-6ms → 60fps OK
- **Gradient territory** : potentiellement +0.5-1ms/frame si tous recréés chaque frame
- **Friendship links** : ~0.3-0.5ms/frame (66 paires × `getAffinityWith`)
- **Total gains potentiels** des deux fixes : ~0.8-1.5ms/frame → budget rendu à ~3-4.5ms

---

## Priorités recommandées pour le prochain tour

### 1. ✅ Fix gradient territory — retirer `effectiveRadius` de la clé de cache
**Pourquoi** : création de gradient est coûteuse, ~12 recréations/frame inutiles. Quick win.
**Comment** : clé = `homeX_homeY` arrondi seulement. Tolérer que le pulse ne se reflète pas dans le gradient (visuellement imperceptible, le pulse est sur le contour dessiné, pas le fill).

```js
// Avant
const erRounded = Math.round(effectiveRadius / 2) * 2;
const cacheKey = `${Math.round(e.homeX/5)*5}_${Math.round(e.homeY/5)*5}_${erRounded}`;
// Après
const cacheKey = `${Math.round(e.homeX/5)*5}_${Math.round(e.homeY/5)*5}`;
// Et dans createRadialGradient, utiliser e.homeRadius (fixe) au lieu de effectiveRadius
```

### 2. ✅ Cache friendship links dans `_update`
**Pourquoi** : O(n²) par frame pour les liens d'amitié est le plus gros gaspillage identifié.
**Comment** :
```js
// Dans Simulation constructor :
this._activeFriendLinks = [];   // [{ a, b, score, strength }]
this._friendLinkTimer = 0;

// Dans _update (après la boucle entities) :
this._friendLinkTimer += dt;
if (this._friendLinkTimer >= 200) {  // Rebuild 5×/s
  this._friendLinkTimer = 0;
  this._activeFriendLinks = [];
  const interactRadSq = this.INTERACTION_RADIUS * this.INTERACTION_RADIUS;
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i], b = entities[j];
      const scoreA = a.interactionLog[b.id] || 0;
      const scoreB = b.interactionLog[a.id] || 0;
      const score = (scoreA + scoreB) / 2;
      if (score < this.FRIENDSHIP_THRESHOLD) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < interactRadSq || distSq > 700 * 700) continue;
      const strength = Math.min(1, (score - this.FRIENDSHIP_THRESHOLD) / 30);
      this._activeFriendLinks.push({ a, b, score, strength });
    }
  }
}

// Dans _renderFriendshipLinks : itérer this._activeFriendLinks (pas de recalcul)
```

### 3. ✨ États EUPHORIQUE et CONCENTRE (feature)
**Pourquoi** : diversifie les comportements visuels, utilise des seuils mood+energy déjà disponibles.
**Comment** :

Dans `entities.js` :
```js
export const STATE = {
  // … existants …
  EUPHORIQUE: 'EUPHORIQUE',  // mood > 0.7 AND energy > 70 → couleur dorée, vitesse +20%
  CONCENTRE:  'CONCENTRE',   // energy < 20 AND mood > -0.3 → vitesse réduite, moins social
};
```

Dans `_updateState` (simulation.js), ajouter avant les transitions existantes :
```js
// Euphorie : mood haute + énergie pleine
if (e.mood > 0.7 && e.energy > 70 && !this.isNight && e.state !== STATE.SATURE && e.state !== STATE.PROJET) {
  newState = STATE.EUPHORIQUE;
}
// Concentration : épuisé mais pas déprimé
else if (e.energy < 20 && e.mood > -0.3 && e.state !== STATE.SATURE) {
  newState = STATE.CONCENTRE;
}
```

Dans `_renderEntity` : ajouter des couleurs pour les nouveaux états :
- EUPHORIQUE → point d'état doré `#ffd700`, halo jaune-or, léger scale ou speed boost
- CONCENTRE → point d'état bleu pâle `#74b9ff`, trail plus court, vitesse réduite dans maxSpd

Dans `_update`, modifier maxSpd :
```js
const stateSpeedMult = e.state === STATE.EUPHORIQUE ? 1.2
                     : e.state === STATE.CONCENTRE  ? 0.5
                     : 1.0;
const maxSpd = this.MAX_SPEED * nightMult * (0.4 + e.character.extraversion * 0.6) * stateSpeedMult;
```

---

## Contraintes à respecter
- Ne pas toucher aux `AFFINITES` ni aux `ENTITY_DEFS`
- `SAVE_KEY = 'haize_save_v1'` inchangé (pas de migration save)
- Throttle panel DOM à 200ms — maintenir
- Ne pas modifier la logique `STATE.SATURE` (seuils, récupération)
- Ne pas augmenter le cap de floating emojis (15)
- Garder le `onConsoleDirty` callback pattern
- `NOISE_SCALE`, `NOISE_SPEED`, `INTERACTION_RADIUS` — ne pas modifier sans test de stabilité
- Pour les nouveaux états : ajouter les entrées dans `stateColors`, `stateEmojis`, `stateLabels` ET les classes CSS `.state-euphorique` et `.state-concentre` dans `style.css`

## Ordre d'implémentation recommandé
1. Fix gradient territory (5 min, 2 lignes)
2. Cache friendship links (15 min, ajout `_activeFriendLinks`)
3. États EUPHORIQUE/CONCENTRE (30 min : entities.js + simulation.js + style.css)

Total estimé : ~50 min de dev propre.
