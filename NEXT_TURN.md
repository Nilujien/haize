# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 00:43_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Architecture solide : simulation.js / entities.js / index.html bien séparés
- Cycle jour/nuit, fatigue sociale, territorialité, projets collaboratifs — tous opérationnels
- Heatmap avec offscreen canvas + ImageData : bonne idée, mais implémentation lente (voir Perf)
- Panel inspect click-to-inspect : complet (sparkline, contacts, traits)
- Événements globaux avec 5 types, déclenchement manuel + auto — fonctionne
- Console HTML d'événements : vivante et lisible
- Touch support présent

### Points problématiques
- `_renderEventLog()` (rendu canvas) est défini mais **jamais appelé** dans `_render()` → dead code
- La machine d'états n'est pas cohérente : dans `_update`, les conflits font `e.state = STATE.FUITE` **sans** reset de `_stateTimer`, donc `_updateState()` peut immédiatement passer à un autre état dès le prochain frame
- Les affinités sont statiques (6 paires sur 66) et ne s'adaptent pas à l'`interactionLog` qui lui s'accumule — disconnect entre mémoire et comportement
- L'event auto-trigger dans `_updateGlobalEvents` ne logue pas l'événement (contrairement au déclenchement manuel qui appelle `pushEvent`)
- `energyDrain` utilise `(1 - this.isNight * 0.8)` — coercion booléenne implicite, fonctionne mais fragile
- Le gradient de territoire est mis en cache par position (arrondi à 5px) mais `effectiveRadius` change avec le pulse animé — gradient stale visuellement

---

## Bugs / régressions détectés

| # | Fichier | Ligne approx. | Description |
|---|---------|--------------|-------------|
| 1 | `simulation.js` | ~560 (conflit) | `e.state = STATE.FUITE` sans `e._stateTimer = 0` → la transition est immédiatement écrasée |
| 2 | `simulation.js` | `_render()` | `_renderEventLog(ctx, W, H)` n'est jamais appelé → dead code (méthode définie ~L900 mais pas dans _render) |
| 3 | `simulation.js` | `_updateGlobalEvents` auto | Événement auto-déclenché ne fait pas `pushEvent` → console reste muette lors d'un event spontané |
| 4 | `simulation.js` | `_renderTerritories` | Cache gradient basé sur position seulement — `effectiveRadius` animé n'invalide pas le cache → gradient stale |
| 5 | `simulation.js` | `energyDrain` | `(1 - this.isNight * 0.8)` — coercion implicite boolean→number, à rendre explicite |

---

## Perf

### Budget frame estimé (1920×1080, 12 entités)
- `_update` : ~2–4ms (O(n²) = 66 paires × opérations légères — OK)
- `_render` : ~4–8ms selon dirty heatmap
- **Bottleneck majeur : heatmap dirty** — boucle pixel-by-pixel sur la totalité de l'ImageData, soit ~2M pixel-writes par frame dirty (~5s de decay). Sur canvas full HD avec HEATMAP_CELL=20 : 96×54 = 5184 cellules × 400 pixels = **2 073 600 assignations par update dirty**
- Deux passes O(n²) en rendu : lignes de proximité + liens d'amitié (`_renderFriendshipLinks`) — peuvent être fusionnées en une passe
- Gradient humeur : créé à chaque frame si `absMood > 0.15` → 1 `createRadialGradient` par entité par frame (12/frame). À cacher.

### Optimisations prioritaires
1. **Heatmap** : précalculer une LUT de 256 couleurs `[r, g, b, a]` au lieu du if/else dans la boucle interne → ~3× plus rapide sur dirty frames
2. **Fusion des passes de rendu** : combiner la boucle de lignes de proximité + `_renderFriendshipLinks` en une seule O(n²)
3. **Cache gradient humeur** : stocker `e._moodGrad` et l'invalider seulement quand mood change d'un delta > 0.05

---

## Priorités recommandées pour le prochain tour

### 1. Fix : cohérence machine d'états dans les conflits (critique, 10 min)
**Pourquoi :** bug silencieux — les entités entrent en FUITE mais en sortent aussitôt, rendant les conflits visuellement invisibles.

**Comment :**
```js
// simulation.js, dans la section conflit ~L560
if (e.state !== STATE.FUITE && e.state !== STATE.SATURE) {
  e.state = STATE.FUITE;
  e._stateTimer = 0; // ← AJOUTER CETTE LIGNE
}
```

### 2. Feature : Affinités dynamiques — feedback interactionLog → comportement (impact fort, 30 min)
**Pourquoi :** `interactionLog` accumule du temps passé ensemble mais ça ne change rien au mouvement. Les "amis" devraient s'attirer plus fort au fil du temps.

**Comment :** Dans `_update`, remplacer `getAffinityWith()` par une version qui mixe l'affinité statique + un score dynamique dérivé de l'interactionLog :

```js
// Dans Entity.getAffinityWith()
getAffinityWith(otherId) {
  let base = 0;
  for (const [a, b, force] of AFFINITES) {
    if ((a === this.id && b === otherId) || (b === this.id && a === otherId)) {
      base = force; break;
    }
  }
  // Bonus dynamique : max +0.4 après ~20 unités d'interaction
  const logScore = this.interactionLog[otherId] || 0;
  const dynamic = Math.min(0.4, logScore / 50);
  return Math.min(1, base + dynamic);
}
```

### 3. Feature : Nuit enrichie — étoiles et lune (impact visuel, 20 min)
**Pourquoi :** La nuit actuelle est juste un overlay sombre. Ajouter des étoiles procédurales et une lune donnerait de la profondeur sans coût perf notable.

**Comment :** Dans `_render()`, après le fond, si `this.isNight` :
```js
// Générer une fois les étoiles (dans constructor ou resize)
this._stars = Array.from({length: 80}, () => ({
  x: Math.random(), y: Math.random(),
  r: 0.5 + Math.random() * 1.2,
  a: 0.3 + Math.random() * 0.5
}));

// Dans _render, section nuit :
if (this.isNight) {
  const twinkle = 0.8 + Math.sin(now * 0.001) * 0.2;
  for (const s of this._stars) {
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,220,255,${(s.a * twinkle).toFixed(2)})`;
    ctx.fill();
  }
  // Lune
  ctx.beginPath();
  ctx.arc(W * 0.85, H * 0.12, 22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(200,210,240,0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,210,240,0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
```

---

## Contraintes à respecter

- **Ne pas toucher à la structure de `ENTITY_DEFS`** — les IDs sont référencés partout (affinités, interactionLog, snapshots)
- **SAVE_KEY = 'haize_save_v1'** — si le format de snapshot change, incrémenter la version ET gérer la migration ou rejeter l'ancien format proprement
- **La boucle O(n²) dans `_update`** est intentionnellement non-optimisée par spatial hashing car n=12 est fixe — ne pas sur-ingénierer
- **OffscreenCanvas dans Heatmap** : ne pas supprimer — l'architecture est bonne, optimiser la boucle interne uniquement
- **Ne pas appeler `_renderEventLog()`** tel quel — la méthode est stale, le canal HTML event-console est le bon canal. Supprimer ou archiver la méthode canvas.

---

## Code à écrire (ébauche prête)

### Fix prioritaire (simulation.js, section conflit dans `_update`)

```js
// Chercher la section : "Conflit agressif (dans CONFLICT_RADIUS)"
// Remplacer le bloc if (e.state !== ...) par :
if (e.state !== STATE.FUITE && e.state !== STATE.SATURE) {
  e.state = STATE.FUITE;
  e._stateTimer = 0;  // reset pour laisser le temps à la fuite de s'exprimer
}
```

### Optimisation heatmap (LUT précalculée)

```js
// Dans la classe Heatmap, ajouter une méthode _buildLUT()
_buildLUT() {
  this._lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let r, g, b, a;
    if (v < 0.25)      { const t = v/0.25;        r=0;            g=Math.round(t*128); b=200;                 }
    else if (v < 0.5)  { const t=(v-0.25)/0.25;   r=0;            g=Math.round(128+t*127); b=Math.round(200*(1-t)); }
    else if (v < 0.75) { const t=(v-0.5)/0.25;    r=Math.round(t*255); g=255;           b=0;                  }
    else               { const t=(v-0.75)/0.25;   r=255;          g=Math.round(255*(1-t)); b=0;              }
    a = Math.round(v * 200);
    this._lut[i*4]=r; this._lut[i*4+1]=g; this._lut[i*4+2]=b; this._lut[i*4+3]=a;
  }
}
// Puis dans render(), remplacer le calcul r/g/b par :
const lutIdx = Math.round(v * 255) * 4;
const r = this._lut[lutIdx], g = this._lut[lutIdx+1], b = this._lut[lutIdx+2], a255 = this._lut[lutIdx+3];
```

### Auto-event logging (simulation.js, `_updateGlobalEvents`)

```js
// Dans le bloc else, après this.activeEvent = nextEv; this._eventTimer = 0;
this.pushEvent(`🌐 ${nextEv.label}`, nextEv.color || '#fff', 'global');
```
