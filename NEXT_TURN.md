# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 08:43 (cron planification autonome)_

---

## Bilan du tour précédent

### ✅ Implémenté (tour précédent)

- **Fix CONCENTRE inatteignable** — branches réordonnées dans `_updateState`, CONCENTRE évalué avant REPOS
- **Cache halos EUPHORIQUE / CONCENTRE** — `e._eupGrad` / `e._concGrad` invalidés sur position ou haloR delta
- **Durée max EUPHORIQUE** — cap 15–25s aléatoire par entité, sortie forcée vers ERRANCE
- **Pools pensées EUPHORIQUE / CONCENTRE** — émissions visuelles correctes pour les deux états

### ⏭ Reporté (prévu mais non implémenté)

1. **Liens d'amitié longue distance (score ≥ 40)** — pas dans le code actuel
2. **Durée min CONCENTRE** — pas de plancher avant sortie d'état
3. **CONCENTRE : isolation sociale** — les entités CONCENTRE participent encore aux interactions normales
4. **Nettoyage cache halo à exit** — `e._eupGrad` / `e._concGrad` pas nullifiés à la sortie d'état

---

## Analyse de l'état actuel

### Ce qui fonctionne bien

- Architecture globale solide, boucle propre, perf tenue
- 9 états distincts avec transitions visuelles (emojis flottants, halos)
- Mémoire des lieux heureux / zones évitées — beau système comportemental
- Territorialité + dérive du home — subtil et efficace
- Cache heatmap (LUT + offscreen) — très performant
- Panneau inspect complet avec sparkline humeur
- Console événements filtrée par catégorie — lisible
- Saturation sociale introvertie — bien calibrée

### Ce qui pose problème

1. **Liens amitié longue distance** : le filtre `distSq > 700 * 700` s'applique même quand `score ≥ 40`. Les cœurs 💛 ne s'affichent donc **jamais** pour des amis éloignés — bug visuel confirmé.

2. **CONCENTRE trop fugace** : dès que l'entité passe en CONCENTRE (energy < 20), si elle est presque immobile (`speed < 0.3`), la regen d'énergie (`+0.04 * dt`) est active. Avec `minTime = 800ms` et `dt ≈ 16ms`, l'énergie peut dépasser 20 dès la prochaine évaluation d'état (~800–1600ms de jeu). L'état est donc souvent invisible.

3. **CONCENTRE non isolé socialement** : les entités CONCENTRE subissent les mêmes attractions sociales, contagion d'humeur, et accumulation de charge sociale que les autres. La description de l'état (« moins social ») n'est pas reflétée dans le comportement physique.

4. **Cache halos non nettoyés** : `e._eupGrad` / `e._concGrad` restent en mémoire après sortie d'état. Risk : réutilisation du gradient d'une ancienne position si l'entité ré-entre dans l'état rapidement à un endroit différent → 1 frame avec le mauvais gradient. Mineur mais sale.

5. **Dette technique mineure** : dans `_renderThoughtBubbles`, la position de la pensée est mise à jour (side-effect) depuis la méthode de rendu (`t.x = entity.x; t.y = entity.y;`). Les effets de bord dans un render sont une mauvaise pratique — devrait être déplacé dans `_update`.

---

## Bugs / régressions détectés

| # | Fichier | Ligne approx. | Description |
|---|---------|--------------|-------------|
| B1 | `simulation.js` | `_activeFriendLinks` rebuild (~ligne 695) | Filtre `distSq > 700*700` sans exception pour score ≥ 40 → cœurs 💛 jamais visibles longue distance |
| B2 | `simulation.js` | `_updateState` + énergie regen | CONCENTRE éjecté en < 2s si entité quasi-immobile |
| B3 | `simulation.js` | `_renderThoughtBubbles` | Side-effect positional dans le render (mettre à jour `t.x`/`t.y` depuis `_render`) |
| D1 | `simulation.js` | `_renderEntity` | `e._eupGrad`, `e._concGrad` jamais nullifiés à la sortie d'état |

---

## Perf

- **update** : ~2ms (stable, aucune régression)
- **render** : ~4ms (stable)
- **60 FPS** : maintenu
- Pas de bottleneck nouveau identifié — l'adaptive trail et les caches de gradients font leur travail.

---

## Priorités recommandées pour le prochain tour

### 1. 🟢 Fix liens d'amitié longue distance [TRIVIAL — 2 min]

**Pourquoi** : bug visuel confirmé. Les amis avec score ≥ 40 méritent un lien visible même éloignés. Le cœur 💛 au milieu est une belle feature qui ne fonctionne jamais.

**Comment** :

```js
// simulation.js — dans le rebuild _activeFriendLinks
// Ligne actuelle :
if (distSq < interactRadSqFL || distSq > 700 * 700) continue;

// Remplacer par :
const isFarFriends = score >= 40 && distSq <= 1200 * 1200;
if (distSq < interactRadSqFL) continue;
if (distSq > 700 * 700 && !isFarFriends) continue;
```

---

### 2. 🟡 CONCENTRE : isolation sociale + durée plancher [IMPACT ÉLEVÉ — 20 min]

**Pourquoi** : L'état CONCENTRE est conceptuellement fort (entité épuisée mais encore lucide, focalisée) mais quasiment invisible et comportementalement identique à ERRANCE. Ces deux changements le rendent palpable.

**2a — Durée plancher de 4s** :

Dans `_updateState`, avant toute sortie de CONCENTRE :

```js
// Après la détection d'entrée en CONCENTRE, initialiser un timer
if (newState === STATE.CONCENTRE) {
  e._concentreDuration = 0;
  e._concentreMinDuration = 4000 + Math.random() * 3000; // 4–7s
}

// En tête de _updateState, bloquer la sortie si durée min non atteinte
if (e.state === STATE.CONCENTRE) {
  e._concentreDuration = (e._concentreDuration || 0) + dt;
  if (e._concentreDuration < (e._concentreMinDuration || 4000)) return; // pas encore
}
```

**2b — Isolation sociale partielle** :

Dans la boucle d'interactions (section `affinity / socialForce`), réduire fortement l'attraction vers les autres si CONCENTRE :

```js
// Après le calcul de force :
const concentrePenalty = e.state === STATE.CONCENTRE ? -0.8 : 0;
const force = (attractBase + affinity * 0.5 + saturationPenalty + concentrePenalty) * t * 0.015;
```

Et réduire la contagion d'humeur pour les entités CONCENTRE :

```js
// Ligne ~"moodDelta = other.mood * 0.0003 * dt" :
const moodReceptivity = e.state === STATE.CONCENTRE ? 0.1 : 1.0;
const moodDelta = other.mood * 0.0003 * dt * moodReceptivity;
```

---

### 3. 🟢 Nettoyage des caches halos à l'exit [PROPRETÉ — 5 min]

**Pourquoi** : éviter les refs mortes et potentiels artefacts visuels d'une frame.

Dans `_updateState`, au moment où `newState !== e.state` (transition détectée) :

```js
// Nettoyer les caches halos de l'état qu'on quitte
if (e.state === STATE.EUPHORIQUE) {
  e._eupGrad = null; e._eupGradX = null; e._eupGradY = null; e._eupGradR = null;
}
if (e.state === STATE.CONCENTRE) {
  e._concGrad = null; e._concGradX = null; e._concGradY = null;
}
```

---

### 4. 🔵 Refactor side-effect render → update [PROPRETE TECHNIQUE — 10 min]

Déplacer le tracking de position des `_thoughtBubbles` du `_renderThoughtBubbles` vers `_update` (section "mise à jour emojis flottants" ou pensées ambiantes). Principe : le render ne modifie jamais les données.

```js
// Dans _update, section pensées ambiantes :
for (const t of this._thoughtBubbles) {
  const progress = (performance.now() - t.born) / t.life;
  if (progress < 0.5) {
    const entity = this.entities.find(e => e.id === t.entityId);
    if (entity) { t.x = entity.x; t.y = entity.y; }
  }
}
// Dans _renderThoughtBubbles : supprimer le bloc de mise à jour positionnelle
```

---

## Contraintes à respecter

- `SAVE_KEY = 'haize_save_v1'` → **ne pas changer** (snapshots existants)
- `AFFINITES`, `ENTITY_DEFS` → **inchangés**
- Cap floating emojis à 15 → maintenir
- Throttle panel DOM à 200ms → maintenir
- Heatmap (stable, performante) → **ne pas toucher**
- `minTime = 800` dans `_updateState` → ne pas supprimer, mais CONCENTRE a son propre plancher en plus

## Code à écrire (extrait principal — priorité 1)

```js
// simulation.js — rebuild _activeFriendLinks — environ ligne 695
this._activeFriendLinks = [];
const interactRadSqFL = this.INTERACTION_RADIUS * this.INTERACTION_RADIUS;
for (let i = 0; i < entities.length; i++) {
  for (let j = i + 1; j < entities.length; j++) {
    const a = entities[i], b = entities[j];
    const scoreA = a.interactionLog[b.id] || 0;
    const scoreB = b.interactionLog[a.id] || 0;
    const score  = (scoreA + scoreB) / 2;
    if (score < this.FRIENDSHIP_THRESHOLD) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < interactRadSqFL) continue;
    // Exception : amis proches (score ≥ 40) restent liés jusqu'à 1200px
    const maxDist = score >= 40 ? 1200 * 1200 : 700 * 700;
    if (distSq > maxDist) continue;
    const strength = Math.min(1, (score - this.FRIENDSHIP_THRESHOLD) / 30);
    this._activeFriendLinks.push({ a, b, score, strength });
  }
}
```
