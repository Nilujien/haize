# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 04:43 (analyse cron planification)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Simulation stable, 12 entités avec comportements distincts et plausibles
- Système de territorialité + happy zones opérationnel (implémenté au tour 04:14)
- Heatmap optimisée (LUT + OffscreenCanvas, ~0ms draw cost si non-dirty)
- Panneau inspect : sparkline, contacts, barres de traits — lisible et utile
- Gradient caching OK pour projets et territories
- Adaptive render skip (budget >8ms → skip 1 frame sur 2)
- Events globaux : 5 types distincts, reset EPIDEMIE correct
- Saturation sociale bien calibrée (introvertis saturent tôt, bon comportement émergent)
- Touch fixé (tap = inspect uniquement, pas de fuite)

### Ce qui pose problème
Voir "Bugs" ci-dessous.

---

## Bugs / régressions détectés

### Bug #1 — Halo saturation : gradient stale vs arc pulsé
**Fichier** : `simulation.js`, `_renderEntity`, ~ligne 827

```js
const haloR = r * (2.2 + Math.sin(performance.now() * 0.003) * 0.3);
// [...] cache invalidé si charge > 5 ou dépl > 5px
// mais haloR varie ±13% à chaque frame → gradient "court" ou "long"
ctx.arc(e.x, e.y, haloR, 0, Math.PI * 2);  // arc courant
ctx.fillStyle = e._satGrad;  // gradient construit avec l'ancien haloR
```

**Symptôme** : Le gradient de saturation (halo rougeâtre) ne suit pas exactement le contour de l'arc — bleed ou coupure visible au pic du pulse.
**Sévérité** : Faible (cosmétique), mais trivial à corriger.
**Fix** : Ajouter `Math.abs((e._satGradR || 0) - haloR) > 2` à la condition d'invalidation du cache.

### Bug #2 — `_satGradR` non initialisé au premier rendu
**Fichier** : `simulation.js`, `_renderEntity`

Au premier rendu d'une entité saturée, `e._satGradR` est `undefined`. La condition `Math.abs(undefined - haloR) > 2` retourne `NaN > 2 = false` → le gradient est quand même construit (car `e._satGrad` est aussi `undefined`). Pas de crash, mais c'est fragile.
**Fix** : Initialiser `e._satGradR = 0` dans `Entity` constructor, ou utiliser `e._satGrad` comme flag principal (déjà le cas implicitement).

### Bug #3 — Timer `_happyZoneTimer` dupliqué dans deux chemins
**Fichier** : `simulation.js`, `_update`, ~ligne 560

```js
e._happyZoneTimer = (e._happyZoneTimer || 0) + dt;
if (e._happyZoneTimer > 3000 && e.mood > 0.5) {
  e._happyZoneTimer = 0;
  // [...] add zone
} else if (e._happyZoneTimer > 3000) {
  e._happyZoneTimer = 0;
}
```

Logique correcte mais redondante — les deux branches font `= 0`. Peut être simplifié en :
```js
e._happyZoneTimer = (e._happyZoneTimer || 0) + dt;
if (e._happyZoneTimer > 3000) {
  e._happyZoneTimer = 0;
  if (e.mood > 0.5) { /* add zone */ }
}
```
**Sévérité** : Zéro impact fonctionnel. Nettoyage cosmétique seulement.

### Bug #4 — `avoidZones` inexistant mais biais de fuite non implémenté
Le plan précédent documentait la feature "mémoire des conflits" mais elle n'a pas été implémentée. Pas un bug, juste une dette de backlog.

---

## Perf

### Budget frame actuel estimé (post v4)
| Phase       | Estimé    | Notes                                          |
|-------------|-----------|------------------------------------------------|
| `_update`   | 2.5–5ms   | O(n²)=66 paires × 3 sous-boucles, main bottleneck |
| `_render`   | 3–6ms     | Heatmap dirty = +1.5ms, gradient rebuilds = +0.5ms |
| Panel DOM   | 0.1–0.3ms | Throttlé à 200ms                               |
| **Total**   | **~6–9ms**| Adaptive skip si >8ms, 60fps stable            |

### Bottlenecks potentiels
1. **`_renderFriendshipLinks`** : 66 paires, `Math.sqrt` systématique (pas de distSq guard) + `setLineDash` par lien amitié → 0.3–0.8ms si beaucoup d'amis. Optimisable mais pas urgent.
2. **Heatmap `_dirty` trop fréquent** : `record()` marque `_dirty = true` à chaque entité/frame → l'offscreen est reconstruit à chaque frame dès qu'une entité bouge. Actuellement contenu par le fait que `putImageData` est rapide, mais 12 entités = 12 appels `record()` par frame → toujours dirty. Possible d'implémenter un flag "no rebuild if only tiny delta".

---

## Priorités recommandées pour le prochain tour

### 1. 🐛 Fix saturation gradient arc/haloR mismatch (trivial, 5 min)

Ajouter la condition `haloR` à l'invalidation du cache gradient saturation.

**Pourquoi** : Correction du bug #1 documenté depuis le tour précédent. Trivial.

**Comment** :
```js
// simulation.js, _renderEntity, dans le if-cache saturation
if (!e._satGrad
    || Math.abs(e._satGradCharge - e.socialCharge) > 5
    || Math.hypot(e.x - e._satGradX, e.y - e._satGradY) > 5
    || Math.abs((e._satGradR || 0) - haloR) > 2) {  // ← ajouter cette ligne
  e._satGrad = ctx.createRadialGradient(e.x, e.y, r * 0.5, e.x, e.y, haloR);
  // [...]
  e._satGradR = haloR;  // ← déjà assigné en fin de bloc
```

### 2. ✨ Feature : Mémoire des conflits (avoidZones)

Symétrie de `happyZones`. Les entités pacifiques mémorisent les zones où elles ont souffert (mood < -0.5) et les fuient légèrement en ERRANCE. Renforce le comportement d'évitement émergent.

**Pourquoi** : Fort impact comportemental visible — les entités introvertis/pacifiques vont graduellement se structurer loin des zones d'agression. Enrichit la carte.

**Comment (entities.js)** : Ajouter `avoidZones: []` et `_avoidZoneTimer: 0` dans le constructor, ajouter `avoidZones` dans `toSnapshot`/`fromSnapshot` (optionnel pour backward compat).

**Comment (simulation.js)** :
```js
// Dans _update, après le bloc happyZone :
e._avoidZoneTimer = (e._avoidZoneTimer || 0) + dt;
if (e._avoidZoneTimer > 3000) {
  e._avoidZoneTimer = 0;
  // Mémoriser seulement pour entités peu agressives (les brutes assument les conflits)
  if (e.mood < -0.5 && e.character.agression < 0.5) {
    const nearby = e.avoidZones.find(z => Math.hypot(z.x - e.x, z.y - e.y) < 80);
    if (nearby) {
      nearby.score = Math.min(10, nearby.score + 0.5);
    } else {
      e.avoidZones.push({ x: e.x, y: e.y, score: 1 });
      if (e.avoidZones.length > 5) {
        e.avoidZones.sort((a, b) => b.score - a.score);
        e.avoidZones.length = 5;
      }
    }
  }
}

// Biais de fuite dans ERRANCE (après le biais happyZone) :
if (e.state === STATE.ERRANCE && e.avoidZones.length > 0) {
  for (const zone of e.avoidZones) {
    const zdx = e.x - zone.x, zdy = e.y - zone.y;
    const zdist = Math.hypot(zdx, zdy) || 1;
    if (zdist < 150) {
      const repel = 0.01 * (zone.score / 10) * (1 - zdist / 150);
      e.vx += (zdx / zdist) * repel;
      e.vy += (zdy / zdist) * repel;
    }
  }
}
```

**Rendu visuel** : Dans `_renderTerritories`, afficher les avoidZones pour l'entité sélectionnée (même pattern que happyZones mais couleur rouge/sombre) :
```js
if (e === this.selectedEntity && e.avoidZones?.length > 0) {
  for (const zone of e.avoidZones) {
    // glow rouge-brun
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, 12 + (zone.score / 10) * 8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(231,76,60,${0.10 + zone.score/10 * 0.18})`;
    ctx.fill();
  }
}
```

### 3. ✨ Feature : Compteur de zones dans le panneau inspect

Ajouter une ligne discrète dans `_renderInspectPanel` après les contacts fréquents :

```
🌟 3 lieux heureux  ⚠️ 2 zones évitées
```

**Pourquoi** : Valorise les features happy/avoid zones qui sinon sont invisibles sans savoir quoi chercher. Coût = 3 lignes de canvas text.

**Comment** : Dans `_renderInspectPanel`, après le bloc contacts, ajouter :
```js
if (e.happyZones.length > 0 || e.avoidZones?.length > 0) {
  drawSep();
  ctx.font = '9px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  const parts = [];
  if (e.happyZones.length > 0) parts.push(`🌟 ${e.happyZones.length} lieu${e.happyZones.length>1?'x':''} heureux`);
  if (e.avoidZones?.length > 0) parts.push(`⚠️ ${e.avoidZones.length} zone${e.avoidZones.length>1?'s':''} évitée${e.avoidZones.length>1?'s':''}`);
  ctx.fillText(parts.join('  '), X, cy);
  cy += LINE_H;
}
```
*(Ne pas oublier d'ajuster `PH` dans le pré-calcul de hauteur si cette section est ajoutée.)*

---

## Contraintes à respecter

- **Ne pas toucher aux `AFFINITES` ni aux `ENTITY_DEFS`** — équilibre comportemental stable
- **`SAVE_KEY = 'haize_save_v1'` inchangé** — `avoidZones` doit être optionnel dans `fromSnapshot` (backward compat)
- **Throttle panel à 200ms — maintenir**
- **Ne pas modifier la logique `STATE.SATURE`** — bien calibrée
- **`socialSaturationThreshold` getter inchangé** — la plage 30–90 est bien équilibrée
- **Ne pas augmenter le cap de floating emojis (15)** — évite l'accumulation visuelle

---

## Code à écrire (ébauche principale — avoidZones dans entities.js)

```js
// entities.js — dans Entity constructor, après happyZones :
this.avoidZones   = [];       // [{ x, y, score }] — max 5 zones
this._avoidZoneTimer = 0;

// entities.js — dans toSnapshot() :
avoidZones: this.avoidZones.map(z => ({ ...z })),

// entities.js — dans fromSnapshot() :
if (snap.avoidZones) this.avoidZones = snap.avoidZones.map(z => ({ ...z }));
```

---

## Résumé des priorités

| # | Type | Impact | Effort |
|---|------|--------|--------|
| 1 | 🐛 Fix gradient saturation | Faible visuel | ~5 min |
| 2 | ✨ avoidZones (conflit) | Fort comportemental | ~25 min |
| 3 | ✨ Compteur zones inspect | UI, faible | ~5 min |

**Budget tour estimé : 35–40 min.**
Si le temps manque, 1+2 suffisent, le 3 est cosmétique.
