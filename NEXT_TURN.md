# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 05:43 (cron planification)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Simulation 12 entités stable, comportements différenciés et plausibles
- Heatmap optimisée (OffscreenCanvas + LUT + dirty flag) — perf correcte
- Panneau inspect complet : sparkline, contacts, barres traits, zones, charge sociale
- Events globaux (5 types) bien calibrés
- Saturation sociale des introvertis cohérente
- Territorialité et homeWander bien intégrés
- avoidZones implémentées depuis le dernier tour ✅

### Ce qui pose problème
- **Bug critique détecté dans `_renderInspectPanel`** : double déclaration `const hasZones` dans la même portée de fonction → SyntaxError en ES module strict (voir bugs)
- avoidZones et happyZones s'accumulent sans jamais décroître → dérive comportementale longue durée
- Heatmap accumule très vite (0.12/frame × 12 entités × 60fps → saturation en ~3s) ; la normalisation masque le problème visuellement mais les données perdent leur précision fine

---

## Bugs / régressions détectés

### 🔴 Bug #1 — CRITIQUE : double `const hasZones` dans `_renderInspectPanel` (simulation.js)

Dans `_renderInspectPanel`, la variable `hasZones` est déclarée deux fois avec `const` dans la même portée de fonction :

- **Ligne ~1** (pré-calcul `PH`) :
  ```js
  const hasZones = e.happyZones.length > 0 || (e.avoidZones?.length > 0);
  ```
- **Ligne ~2** (section rendu zones) :
  ```js
  const hasZones = e.happyZones.length > 0 || (e.avoidZones?.length > 0);
  ```

En ES modules (strict mode), une re-déclaration `const` dans la même portée est une **SyntaxError** qui devrait empêcher le chargement du module. Si la simulation tourne c'est que certains runtimes/navigateurs sont plus permissifs, mais c'est fragile. **À corriger en priorité absolue** — supprimer la seconde déclaration (remplacer `const` par rien, la variable existe déjà).

**Fix** : supprimer la seconde déclaration `const hasZones = ...` dans la section rendu (vers le commentaire `// ── Zones heureuses / évitées`).

### 🟡 Bug #2 — avoidZones et happyZones sans décroissance

Les scores des zones ne décroissent jamais. Sur 10+ minutes de simulation :
- `happyZones` : toutes zones atteignent score 10 rapidement → entités biaisées vers des points fixes, comportement rigidifié
- `avoidZones` : idem, les zones deviennent des "murs invisibles" permanents

Conséquence : après ~15 min, les comportements sont dictés par des souvenirs trop anciens et trop forts.

### 🟡 Bug #3 — `_happyZoneTimer` reset dupliqué (cosmétique)
Déjà documenté au tour précédent. Le reset du timer hors condition `mood > 0.5` est correctement placé, mais la lisibilité du code souffre d'un double-reset apparent. Aucun impact fonctionnel.

---

## Perf

### Budget frame estimé (12 entités, 1080p)
| Phase     | Estimé      | Commentaire                              |
|-----------|-------------|------------------------------------------|
| `_update` | 2.5–5ms     | O(n²)=66 paires, acceptable pour n=12   |
| `_render` | 3–6ms       | Heatmap dirty = lourd (ImageData plein) |
| Total     | ~6–10ms     | Dans le budget 16ms à 60fps             |

### Bottleneck potentiel — heatmap record rate
`heatmap.record()` est appelé pour chaque entité **chaque frame** (+0.12/appel). Avec 12 entités à 60fps, une cellule populaire accumule ~86/s. Le max est 255, atteint en ~3s. La normalisation `invMax` sauve l'affichage mais :
- Le `_dirty` flag est levé à chaque frame (l'offscreen est rebuildé quasi-systématiquement)
- Les données perdent leur gradient de nuances (tout est maxé rapidement)

**Amélioration recommandée** : réduire le delta de record (0.12 → 0.04) pour lisser la montée et espacer les `_dirty`. Ou mieux : passer `record()` à un rythme throttlé (toutes les 100ms).

---

## Priorités recommandées pour le prochain tour

### 1. 🔴 Fix bug critique — supprimer le double `const hasZones`

**Fichier** : `simulation.js`, fonction `_renderInspectPanel`

Trouver la seconde occurrence de :
```js
const hasZones = e.happyZones.length > 0 || (e.avoidZones?.length > 0);
```
Et la **supprimer** (la variable existe déjà depuis le bloc de pré-calcul de `PH`).

**Effort** : 30 secondes. **Priorité** : maximale (correctness).

---

### 2. ✨ Décroissance naturelle des zones mémoire (avoidZones + happyZones)

**Logique** : à chaque update, décroître légèrement les scores de toutes les zones.
Supprimer les zones dont le score tombe sous 0.1.

**Pseudo-code** (`_update`, après les boucles entités) :
```js
// Decay zones mémoire (oubli progressif)
const ZONE_DECAY = 0.0008; // par ms game time → ~1 unité/20s
for (const e of entities) {
  e.happyZones = e.happyZones
    .map(z => ({ ...z, score: z.score - ZONE_DECAY * dt }))
    .filter(z => z.score > 0.1);
  e.avoidZones = e.avoidZones
    .map(z => ({ ...z, score: z.score - ZONE_DECAY * dt }))
    .filter(z => z.score > 0.1);
}
```

**Impact** : comportements plus dynamiques, entités qui "oublient" et se redéploient. Naturel.
**Effort** : ~5 min.

---

### 3. ✨ Throttle du heatmap record (perf + précision)

Au lieu d'appeler `heatmap.record()` à chaque frame pour chaque entité, throttler à 100ms :

```js
// Dans _update, après la boucle entités :
this._heatmapRecordTimer = (this._heatmapRecordTimer || 0) + dt;
if (this._heatmapRecordTimer >= 100) {
  this._heatmapRecordTimer = 0;
  for (const e of entities) {
    this.heatmap.record(e.x, e.y);
  }
}
```

Et retirer le `this.heatmap.record(e.x, e.y)` dans la boucle principale.

Résultat : `_dirty` levé ~10×/s au lieu de 60×/s → gain ~1ms/frame sur la heatmap, et meilleure précision des gradients (les cellules montent plus lentement).

**Effort** : ~3 min.

---

### 4. ✨ Indicateur de tendance d'humeur dans le panel info

Dans `_updatePanel()`, ajouter une petite flèche ↑↓ à côté de `😊` selon l'évolution récente de `moodHistory`.

```js
// Calcul de tendance (3 dernières valeurs)
const hist = e.moodHistory;
let trend = '';
if (hist.length >= 3) {
  const delta = hist[hist.length - 1] - hist[hist.length - 3];
  trend = delta > 0.05 ? '↑' : delta < -0.05 ? '↓' : '→';
}
```

Afficher : `😊74%↑` dans la liste entités. Très lisible d'un coup d'œil.
**Effort** : ~5 min.

---

## Contraintes à respecter
- Ne pas toucher aux `AFFINITES` ni aux `ENTITY_DEFS`
- `SAVE_KEY = 'haize_save_v1'` inchangé (decay zones doit être backward compat : les zones sans decay restaurées depuis localStorage décroîtront naturellement)
- Throttle panel à 200ms — maintenir
- Ne pas modifier la logique `STATE.SATURE`
- Ne pas augmenter le cap de floating emojis (15)
- Garder le `onConsoleDirty` callback pattern (index.html côté)

---

## Code à écrire (extraits prêts)

### Fix #1 — supprimer double const (simulation.js ~ligne 956)
Chercher le pattern exact :
```js
    // ── Zones heureuses / évitées ──────────────────────────────────────────
    const hasZones = e.happyZones.length > 0 || (e.avoidZones?.length > 0);
```
Remplacer par :
```js
    // ── Zones heureuses / évitées ──────────────────────────────────────────
```
(supprimer la ligne `const hasZones` — la variable est déjà en scope)

### Fix #2 — zone decay (simulation.js, fin de `_update`, après `_thoughtBubbles` cleanup)
```js
    // ── Decay zones mémoire (oubli progressif) ─────────────────────────────
    const ZONE_DECAY_RATE = 0.0008; // ~1 unité toutes les 20s game time
    for (const e of entities) {
      if (e.happyZones.length > 0) {
        e.happyZones = e.happyZones
          .map(z => ({ ...z, score: z.score - ZONE_DECAY_RATE * dt }))
          .filter(z => z.score > 0.1);
      }
      if (e.avoidZones.length > 0) {
        e.avoidZones = e.avoidZones
          .map(z => ({ ...z, score: z.score - ZONE_DECAY_RATE * dt }))
          .filter(z => z.score > 0.1);
      }
    }
```
