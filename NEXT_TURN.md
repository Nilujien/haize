# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 21:20 (analyse Jubis — cron planification)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Architecture FSM 9 états — stable, bien isolée dans `_updateState`
- 3 caches render (friendLinks, rancorLinks, recruitLinks) — O(n²) sorti du hot path
- Click-to-select depuis canvas ET panel latéral — UX solide
- 14 paires d'affinités — dynamiques variées dès le départ
- Heatmap avec LUT précalculée + OffscreenCanvas — perf correcte
- Cycle jour/nuit avec decay des rancunes, étoiles, lune
- Budget frame estimé : update ~3-6ms, render ~3-7ms → 60fps tenu

### Ce qui pose problème
- **Bug JS critique** dans `_renderRecruitLinks` — voir section Bugs
- **Double boucle O(n²) résiduelle** dans `_renderFriendshipLinks` (hors cache)
- **Incohérence sémantique `introFactor`** — deux calculs différents pour la même notion
- **Trail visuel uniforme** — toutes les entités ont la même traîne, perte d'info état

---

## Bugs / régressions détectés

### 🔴 BUG CRITIQUE — simulation.js `_renderRecruitLinks` (ligne ~1305)

```js
// Ligne corrompue dans le fichier :
ctx.strokeStyle = 
gba(255,215,0,);
```

La template string `` `rgba(255,215,0,${alpha.toFixed(3)})` `` a été tronquée — le backtick, le `r` et l'interpolation `${}` ont disparu. Résultat : appel à `gba()` qui n'existe pas → **ReferenceError au runtime** dès qu'au moins un recruiter est en état PROJET avec des entités proches.

La fonction entière ne s'exécute pas (erreur non catchée dans `_render`), donc les liens de recrutement ne sont jamais dessinés. La simulation ne crashe pas au démarrage uniquement parce que le guard `if (!this._activeRecruitLinks || this._activeRecruitLinks.length === 0) return;` retourne immédiatement au premier tour.

**Fix :**
```js
// Remplacer :
ctx.strokeStyle = 
gba(255,215,0,);
// Par :
ctx.strokeStyle = `rgba(255,215,0,${alpha.toFixed(3)})`;
```

### 🟡 PERF — `_renderFriendshipLinks` : double O(n²) résiduelle (ligne ~1500)

La fonction utilise le cache `_activeFriendLinks` pour la passe principale, mais en bas de la fonction il y a une **boucle O(n²) non cachée** qui s'exécute à chaque frame (60fps) pour dessiner les cœurs 💛 entre amis rapprochés :

```js
// Passe cœur rapproché — exécutée à 60fps, hors cache
for (let i = 0; i < this.entities.length; i++) {
  for (let j = i + 1; j < this.entities.length; j++) {
    const score2 = ((a.interactionLog[b.id] || 0) + ...) / 2;
    if (score2 < 40) continue;
    const dist2 = Math.sqrt(dx2*dx2 + dy2*dy2);
    if (dist2 >= this.INTERACTION_RADIUS) continue;
    ...
  }
}
```

Avec 12 entités = 66 paires × 60fps = ~4000 itérations/seconde. Faible impact (entités peu nombreuses) mais **incohérent avec l'architecture de cache**. À consolider dans `_activeFriendLinks` via le flag `isClose`.

**Fix :** Dans le rebuild `_activeFriendLinks` (déjà à 5×/s), les pairs `isClose` sont déjà calculées mais filtrées. Il suffit de les inclure dans le cache avec un flag supplémentaire et les rendre dans la passe principale.

### 🟡 SÉMANTIQUE — Double `introFactor` incohérent dans `_update`

```js
// Bloc "Fatigue sociale" :
const introFactor = 1 - e.character.socialite;   // introversion ≈ pas sociable

// Bloc "Récupération nocturne" (if block, portée propre, donc pas de conflict JS) :
const introFactor = 1 - e.character.socialite;   // même calcul, redondant
```

Le problème sémantique est que `1 - socialite` ≠ introversion réelle. L'introversion est plutôt `1 - extraversion`. La `socialite` mesure l'envie de socialiser, pas le besoin de solitude. Le code fonctionne empiriquement mais mélange deux concepts. Nommer correctement clarifierait le modèle.

---

## Perf

**Budget frame actuel estimé :**
- `_update` : ~3-6ms (O(n²) interactions + caches rebuild 5×/s)
- `_render` : ~3-7ms (trails, halos, liens, projets)
- Total : ~6-13ms → **60fps confortable** avec le skip adaptatif (threshold 8ms)

**Points de vigilance :**
- `_renderFriendshipLinks` passe close-heart : ~0.05ms/frame (marginal mais architectural)
- Heatmap `_dirty` render : ~2-4ms quand déclenché (toutes les ~100ms avec 10 entités actives)
- Si le nombre d'entités monte à 20+, les paires O(n²) dans `_update` passeraient de 66 à 190 — seuil de vigilance à ~800µs pour les interactions

---

## Priorités recommandées pour le prochain tour

### 1. 🔴 Fix `_renderRecruitLinks` — bug critique (5 min)

**Pourquoi :** Les liens de recrutement sont une feature visible et interactive. Actuellement cassée silencieusement. Le bug provoque une ReferenceError qui peut potentiellement déranger le rendu canvas selon l'implémentation du browser.

**Comment :**
```js
// simulation.js, dans _renderRecruitLinks, remplacer la ligne corrompue :
ctx.strokeStyle = `rgba(255,215,0,${alpha.toFixed(3)})`;
```

---

### 2. 🎨 Trail coloré selon état — fort impact visuel (15-20 min)

**Pourquoi :** Les trails sont actuellement `e.color + '44'` pour toutes les entités. Colorer selon l'état donne un signal visuel immédiat sur l'histoire récente du déplacement — on "lit" l'état passé d'une entité dans sa traîne.

**Comment :** Dans `_renderEntity`, remplacer la couleur du trail fixe :
```js
// Remplacer :
ctx.strokeStyle = e.color + '44';

// Par (map état → suffixe couleur + opacité) :
const trailColorMap = {
  [STATE.EUPHORIQUE]: '#ffd700',   // or
  [STATE.CONCENTRE]:  '#74b9ff',   // bleu doux
  [STATE.FUITE]:      '#e74c3c',   // rouge
  [STATE.SATURE]:     '#ff7675',   // rose-rouge
  [STATE.PROJET]:     '#00cec9',   // cyan
  [STATE.SOCIAL]:     '#2ecc71',   // vert
};
const trailBase = trailColorMap[e.state] || e.color;
ctx.strokeStyle = trailBase + '55';
```

**Contrainte :** Ne pas changer `e.trailMaxLen` ni la logique de trail push/shift — uniquement la couleur de rendu.

---

### 3. 📊 Affinité brute dans le panneau CONTACTS (20 min)

**Pourquoi :** Le panneau d'inspection affiche le `score` interactionLog (dynamique, accumule avec le temps) mais pas l'**affinité prédéfinie** de base. Un joueur ne sait pas si JG et AM sont naturellement proches (0.80 défini dans AFFINITES) ou si leur lien s'est construit en jeu.

**Comment :** Dans `_renderInspectPanel`, section "CONTACTS FRÉQUENTS", enrichir chaque ligne avec la valeur `getAffinityWith()` :
```js
// Récupérer l'affinité totale (base + dynamique)
const aff = e.getAffinityWith(id);
// Afficher en couleur distincte à côté du score
// Ex : "JG  ████░░  12.3  [aff: 82%]"
```

Utiliser une couleur dorée pour les affinités > 0.6, grise pour les neutres, rouge pour les affinités négatives (< 0.3 avec rancune).

---

## Contraintes à respecter

- `SAVE_KEY = 'haize_save_v1'` — ne pas changer (backward compat localStorage)
- FSM 9 états — ne pas toucher à `_updateState` ni aux constantes STATE
- `PROJECT_MAX = 3`, 12 entités, `ENTITY_DEFS` — structures immuables
- Ne pas toucher à `Heatmap` (architecture offscreen validée)
- Pas d'`async` dans la boucle de rendu (`start()` → `requestAnimationFrame`)
- `_activeFriendLinks` structure `{ a, b, score, strength, isClose }` — stable
- `_activeRecruitLinks` structure `{ recruiter, other, aff, dist }` — stable
- Conserver backward compat snapshots (champs optionnels avec `??`)

---

## Code à écrire — extraits prêts pour le prochain tour

### Fix critique `_renderRecruitLinks` (~ligne 1305)

```js
// simulation.js — _renderRecruitLinks
_renderRecruitLinks(ctx) {
  if (!this._activeRecruitLinks || this._activeRecruitLinks.length === 0) return;
  ctx.save();
  for (const { recruiter, other, aff, dist } of this._activeRecruitLinks) {
    const alpha = aff * 0.22 * (1 - dist / 300);
    ctx.beginPath();
    ctx.moveTo(recruiter.x, recruiter.y);
    ctx.lineTo(other.x, other.y);
    ctx.strokeStyle = `rgba(255,215,0,${alpha.toFixed(3)})`;  // ← FIX
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}
```

### Trail coloré selon état (dans `_renderEntity`)

```js
// Trouver et remplacer dans le bloc "Trail" de _renderEntity :
const TRAIL_STATE_COLORS = {
  [STATE.EUPHORIQUE]: '#ffd700',
  [STATE.CONCENTRE]:  '#74b9ff',
  [STATE.FUITE]:      '#e74c3c',
  [STATE.SATURE]:     '#ff7675',
  [STATE.PROJET]:     '#00cec9',
  [STATE.SOCIAL]:     '#2ecc71',
};
const trailColor = (TRAIL_STATE_COLORS[e.state] || e.color) + '55';
ctx.strokeStyle = trailColor;
```
