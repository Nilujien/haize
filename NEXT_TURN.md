# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 07:43 (cron planification)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Architecture générale propre et bien découpée (`entities.js` / `simulation.js` / `index.html`)
- Caches gradient bien tenus : territoire (homeX/homeY), halo mood, halo saturation
- Cache liens d'amitié rebuild 5×/s : O(n²) contenu hors rendering
- Nouveaux états EUPHORIQUE / CONCENTRE visuellement intégrés (halos, point d'état, stateEmojis)
- Mémoire des lieux (happyZones / avoidZones) avec decay progressif : cohérent
- Heatmap via OffscreenCanvas + LUT précalculée : très propre
- Console événements pilotée par `onConsoleDirty` : pas de polling inutile
- Render skip adaptatif si update > 8ms : bon filet de sécurité
- Bruit de Perlin stable, territorialité douce bien calibrée

### Ce qui pose problème
- **Bug logique majeur** : `STATE.CONCENTRE` ne peut jamais être atteint (voir section Bugs)
- Halos EUPHORIQUE et CONCENTRE recréent un `createRadialGradient` à chaque frame
- `_pickThought` n'a pas de pools dédiés pour EUPHORIQUE / CONCENTRE
- Pas de durée max ni cooldown pour l'état EUPHORIQUE
- Liens d'amitié masqués si `distSq > 700*700` même pour des paires score > 40 (amis séparés)

---

## Bugs / régressions détectés

### 🔴 BUG CRITIQUE — `STATE.CONCENTRE` inatteignable
**Fichier** : `simulation.js`, méthode `_updateState`, ~ligne 620

```js
} else if (e.energy < 20) {
  newState = STATE.REPOS;           // ← capte TOUS les cas energy < 20
} else if (e.state === STATE.FUITE && e._stateTimer > 2000) {
  newState = STATE.ERRANCE;
} else if (e.mood > 0.7 && e.energy > 70 && !this.isNight ...) {
  newState = STATE.EUPHORIQUE;
} else if (e.energy < 20 && e.mood > -0.3 ...) {  // ← JAMAIS atteint
  newState = STATE.CONCENTRE;
```

La branche REPOS (energy < 20) est évaluée **avant** CONCENTRE. Comme CONCENTRE nécessite aussi `energy < 20`, elle est systématiquement court-circuitée. L'état CONCENTRE n'est jamais déclenché depuis la machine d'état.

**Fix** : Inverser l'ordre — tester CONCENTRE avant REPOS :
```js
} else if (e.energy < 20 && e.mood > -0.3 && e.state !== STATE.SATURE) {
  newState = STATE.CONCENTRE;
} else if (e.energy < 20) {
  newState = STATE.REPOS;
```

### 🟡 Halo euphorique/concentré non caché
**Fichier** : `simulation.js`, méthode `_renderEntity`

`createRadialGradient` appelé chaque frame pour EUPHORIQUE (~1.2ms worst case 12 entités) et pour CONCENTRE. Pattern de cache existant (`_moodGrad`, `_satGrad`) non appliqué ici.

**Fix** : Même pattern que saturation — invalider si position bougée > 5px ou état a changé.

### 🟡 `_pickThought` incomplet
**Fichier** : `simulation.js`, méthode `_pickThought`

Pools manquants pour STATE.EUPHORIQUE et STATE.CONCENTRE → ces états tombent dans le fallback `null` (aucune pensée émise), visuellement pauvre.

### 🟡 EUPHORIQUE sans limite de durée
Aucun cooldown ni timer max. Une entité avec mood haute + projet réussi peut rester EUPHORIQUE indéfiniment.

### 🟢 Liens d'amitié invisibles à longue distance
**Fichier** : `simulation.js`, rebuild `_activeFriendLinks` ~ligne 670

Filtre : `distSq > 700 * 700` → paires éloignées non affichées. Probablement intentionnel (lisibilité), mais au moins les scores très élevés (> 40) méritent un affichage même à distance. Impact cosmétique mineur.

---

## Perf

- **Update** : ~2–2.5ms estimé (12 entités, O(n²) × 2 passes = 132 iter, acceptable)
- **Render** : ~4–5ms (régression possible : 2× createRadialGradient non cachés pour halos états)
- **FPS** : 60fps tenu normalement, mais avec 5–6 entités simultanément EUPHORIQUE la perf render peut piquer
- **Heatmap** : stable (ImageData + dirty flag), throttle 10×/s bien en place
- **Console** : stable (dirty callback, pas de polling)

---

## Priorités recommandées pour le prochain tour

### 1. 🔴 Fix CONCENTRE inatteignable — priorité absolue

**Pourquoi** : C'est un bug régressif — un état entier et son visuel (halo bleu, emoji 🎯, vitesse réduite) ne s'affiche jamais. Facile à corriger, impact immédiat.

**Comment** : Dans `_updateState`, intervertir les blocs CONCENTRE et REPOS (voir pseudo-code ci-dessous).

**Risque** : Nul. Le changement est localisé à 4 lignes, la logique est identique mais dans le bon ordre.

---

### 2. 🟡 Cache halos EUPHORIQUE / CONCENTRE

**Pourquoi** : Pattern établi dans le code, gain ~1ms/frame avec plusieurs entités euphoriques.

**Comment** :
- Ajouter `e._eupGrad`, `e._eupGradX`, `e._eupGradY`, `e._eupGradR` sur l'entité (en runtime, pas dans le constructor — pas besoin de toucher entities.js)
- Invalider si position delta > 5px ou haloR delta > 3px
- Même chose pour CONCENTRE : `_concGrad` (statique donc invalide uniquement si position change)

---

### 3. 🟡 Pools de pensées EUPHORIQUE/CONCENTRE + durée max EUPHORIQUE

**Pourquoi** : EUPHORIQUE/CONCENTRE sans pensées = états muets. La durée max EUPHORIQUE évite les états permanents qui saturent visuellement (trop de halos dorés simultanément).

**Comment** :
```js
// Dans _pickThought :
[STATE.EUPHORIQUE]: ['🌟', '😄', '🎉', '🤩', '💃'],
[STATE.CONCENTRE]:  ['🎯', '🧘', '💭', '✍️', '🔍'],
```

Pour la durée max EUPHORIQUE : ajouter `e._euphoriqueDuration = 0` dans la transition `→ EUPHORIQUE`, l'incrémenter dans `_updateState`, et forcer sortie après 15–25s (aléatoire par entité).

**Risque** : Faible. Ne casse rien, améliore la cohérence comportementale.

---

## Contraintes à respecter

- `SAVE_KEY = 'haize_save_v1'` → **ne pas changer** (sinon saves existantes invalides)
- `AFFINITES`, `ENTITY_DEFS`, `INTERACTION_RADIUS`, `NOISE_SCALE` → **inchangés**
- Cap floating emojis à 15 → maintenir
- Throttle panel DOM à 200ms → maintenir
- Tout nouveau gradient → mettre en cache (pattern établi, à respecter)
- Ne pas toucher au système Heatmap (stable et bien optimisé)
- Pas de modification de la structure de sauvegarde `toSnapshot/fromSnapshot` sans bumper la version

---

## Code à écrire (pseudo-code / extraits)

### Fix #1 — CONCENTRE inatteignable (`_updateState`)

```js
// AVANT (bugué) :
} else if (e.energy < 20) {
  newState = STATE.REPOS;
} else if (...FUITE...) {
  ...
} else if (e.mood > 0.7 && e.energy > 70 && !this.isNight ...) {
  newState = STATE.EUPHORIQUE;
} else if (e.energy < 20 && e.mood > -0.3 && ...) {  // DEAD CODE
  newState = STATE.CONCENTRE;

// APRÈS (corrigé) :
} else if (e.state === STATE.FUITE && e._stateTimer > 2000) {
  newState = STATE.ERRANCE;
} else if (e.mood > 0.7 && e.energy > 70 && !this.isNight
           && e.state !== STATE.SATURE && e.state !== STATE.PROJET) {
  newState = STATE.EUPHORIQUE;
} else if (e.energy < 20 && e.mood > -0.3 && e.state !== STATE.SATURE) {
  newState = STATE.CONCENTRE;   // ← maintenant atteignable
} else if (e.energy < 20) {
  newState = STATE.REPOS;
```

### Fix #2 — Cache halo euphorique (`_renderEntity`)

```js
if (e.state === STATE.EUPHORIQUE) {
  const eupPulse = 1 + Math.sin(performance.now() * 0.004 + e._noiseOffsetX) * 0.15;
  const eupHaloR = r * 2.5 * eupPulse;
  ctx.beginPath();
  ctx.arc(e.x, e.y, eupHaloR, 0, Math.PI * 2);

  // Cache — invalider si position bougée > 5px ou haloR delta > 3
  if (!e._eupGrad
      || Math.hypot(e.x - (e._eupGradX||0), e.y - (e._eupGradY||0)) > 5
      || Math.abs((e._eupGradR||0) - eupHaloR) > 3) {
    e._eupGrad = ctx.createRadialGradient(e.x, e.y, r, e.x, e.y, eupHaloR);
    e._eupGrad.addColorStop(0, 'rgba(255,215,0,0.25)');
    e._eupGrad.addColorStop(1, 'transparent');
    e._eupGradX = e.x; e._eupGradY = e.y; e._eupGradR = eupHaloR;
  }
  ctx.fillStyle = e._eupGrad;
  ctx.fill();
}
```

### Fix #3 — Durée max EUPHORIQUE

```js
// Dans _updateState, au moment où newState devient EUPHORIQUE :
if (newState === STATE.EUPHORIQUE && e.state !== STATE.EUPHORIQUE) {
  e._euphoriqueDuration = 0;
  e._euphoriqueCap = 15000 + Math.random() * 10000; // 15–25s
}

// En début de _updateState, avant les tests :
if (e.state === STATE.EUPHORIQUE) {
  e._euphoriqueDuration = (e._euphoriqueDuration || 0) + dt;
  if (e._euphoriqueDuration > (e._euphoriqueCap || 20000)) {
    e.state = STATE.ERRANCE;
    e._stateTimer = 0;
    return;
  }
}
```
