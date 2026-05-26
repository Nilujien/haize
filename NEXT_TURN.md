# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 01:43_

---

## Bilan du tour précédent (01:15 → tour non encore exécuté)

Le plan précédent listait 4 priorités. Aucun code n'a été implanté depuis : **les priorités restent en attente**.

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Machine d'états cohérente (fix FUITE + `_stateTimer` reset opérationnel)
- Affinités dynamiques via `interactionLog` + `getAffinityWith()` — relations émergentes visibles
- Heatmap LUT précalculée (OffscreenCanvas + ImageData) — performante
- Nuit enrichie : étoiles scintillantes, lune avec halo
- Système de projets complet : spawn, contribution, résolution, récompenses
- Console événements cohérente : déclenchements manuels + automatiques loggués
- Système de territoires avec cache gradient (invalidation sur mouvement home)
- Panneau inspect complet : barres, sparkline, contacts, traits

### Points à surveiller
- `interactionLog` n'a aucun mécanisme de décroissance → les scores s'accumulent à l'infini, les affinités dynamiques finissent toutes au max (`+0.4`) après quelques minutes de jeu soutenu
- `_updatePanel()` recrée l'intégralité du HTML à chaque frame (~60 fps) — coût DOM non négligeable sur des sessions longues

---

## Bugs / régressions détectés

| # | Fichier | Ligne approx. | Description | Sévérité |
|---|---------|--------------|-------------|----------|
| 1 | `simulation.js` | ~859–873 | **Double log à la résolution de projet** : `eventLog.unshift(entry)` direct + `pushEvent(...)` → chaque projet résolu génère 2 entrées dans la console | Moyen |
| 2 | `simulation.js` | ~1930+ | **`_renderEventLog()` dead code** : fonction complète jamais appelée (remplacée par le panneau HTML latéral) — confusion code + léger overhead parse | Faible |
| 3 | `simulation.js` | `_renderTerritories` | **Gradient territoire stale** : le cache est invalidé sur `homeX/homeY` mais le gradient est créé avec `effectiveRadius` (qui pulse à chaque frame via `Math.sin(now * 0.0008)`). Quand le radius change, l'ancien gradient est utilisé → bande colorée ne correspond plus à l'arc dessiné | Esthétique |
| 4 | `entities.js` | `getAffinityWith()` | **Accumulation sans fin** : `interactionLog[id]` croît sans decay → toutes les paires actives atteignent le bonus max `+0.4` en ~50 unités, soit ~14h de jeu réel mais très rapidement avec `speedFactor > 1` | Comportemental |

---

## Perf

| Zone | Estimation impact | Notes |
|------|------------------|-------|
| `createRadialGradient` halo humeur | ~0.15ms/frame | 12 entités × gradient si `absMood > 0.15` (quasi permanent) |
| `_updatePanel()` DOM innerHTML | ~0.5–2ms/frame | Rebuild complet 60× par seconde, jamais throttlé |
| `_renderFriendshipLinks()` O(n²) | <0.1ms | 66 paires pour 12 entités, acceptable |
| Heatmap LUT | ~0.3ms sur dirty frames | Bon, optimisé |
| **Total estimé update+render** | ~4–8ms/frame | Dans budget pour 60fps — la marge est faible si on ajoute des features |

Le bottleneck le plus accessible : **`_updatePanel()`** — throttler à 200ms permet de récupérer ~1ms/frame proprement.

---

## Priorités recommandées pour le prochain tour

### 1. Fix double log résolution projet (5 min, bug)

Dans `_updateProjects()`, supprimer le `eventLog.unshift(entry)` direct (~L859) — garder uniquement le `pushEvent()` qui suit.

```js
// SUPPRIMER ce bloc (~L859-866) :
const entry = {
  text:      `${proj.label} résolu ! (${participantIds || '—'})`,
  color:     proj.color,
  timestamp: performance.now(),
};
this.eventLog.unshift(entry);
if (this.eventLog.length > this.EVENT_LOG_MAX) {
  this.eventLog.length = this.EVENT_LOG_MAX;
}
// GARDER uniquement la ligne pushEvent qui suit
```

### 2. Supprimer `_renderEventLog()` dead code (5 min, dette)

Supprimer la méthode entière `_renderEventLog(ctx, W, H)` de `simulation.js` (~L1930-2000). Confirmer qu'elle n'est appelée nulle part (grep vérifié : absente de tout appel dans `_render()`).

### 3. Throttle `_updatePanel()` à 200ms (10 min, perf)

```js
// Dans start() → loop :
this._panelTimer = (this._panelTimer || 0) + rawDt;
if (this._panelTimer >= 200) {
  this._panelTimer = 0;
  this._updatePanel();
}
// Retirer l'appel this._updatePanel() actuel dans la boucle principale
```

Impact : ~1–2ms/frame récupérées, panneau visuellement indiscernable (200ms < perception humaine).

### 4. Decay `interactionLog` — oubli progressif (20 min, comportemental)

Sans cela, toutes les entités finissent avec toutes les affinités au max → comportement homogène, sans surprise.

```js
// Dans _update(), après la boucle entités, avant le sampling humeur :
this._forgetTimer = (this._forgetTimer || 0) + dt;
if (this._forgetTimer > 30000) {
  this._forgetTimer = 0;
  for (const e of entities) {
    for (const id in e.interactionLog) {
      e.interactionLog[id] = Math.max(0, e.interactionLog[id] * 0.94);
      if (e.interactionLog[id] < 0.01) delete e.interactionLog[id];
    }
  }
}
```

**Important** : incrémenter `SAVE_KEY` → `'haize_save_v2'` si ce changement modifie la structure snapshot (les anciens saves n'incluaient pas ce decay, les scores pourraient être très élevés).

### 5. Cache gradient humeur (15 min, perf légère)

```js
// Dans _renderEntity, avant le bloc "Halo humeur" :
if (absMood > 0.15) {
  const moodSign = e.mood > 0 ? 1 : -1;
  if (!e._moodGrad
      || e._moodGradSign !== moodSign
      || Math.abs(e.mood - (e._moodGradLevel || 0)) > 0.08) {
    const haloR = e.radius * (1.6 + absMood * 0.8);
    const haloAlpha = absMood * 0.35;
    const haloColor = e.mood > 0
      ? `rgba(46,204,113,${haloAlpha.toFixed(2)})`
      : `rgba(231,76,60,${haloAlpha.toFixed(2)})`;
    const grad = ctx.createRadialGradient(e.x, e.y, e.radius * 0.5, e.x, e.y, haloR);
    grad.addColorStop(0, haloColor);
    grad.addColorStop(1, 'transparent');
    e._moodGrad = grad;
    e._moodGradSign = moodSign;
    e._moodGradLevel = e.mood;
    e._moodGradX = e.x;
    e._moodGradY = e.y;
  }
  // ... utiliser e._moodGrad
}
```

**Attention** : `createRadialGradient` est lié au contexte et à la position — invalider aussi si `e.x/e.y` ont bougé de plus de 5px.

---

## Contraintes à respecter

- **Ne pas toucher à `ENTITY_DEFS`** — identités fixes
- **`SAVE_KEY`** : si le format snapshot change (ex. decay interactionLog), incrémenter vers `v2` et gérer la migration dans `load()` avec un fallback gracieux
- **OffscreenCanvas Heatmap** : ne pas toucher, la LUT s'y intègre proprement
- **60 FPS non négociable** — budget total update+render doit rester < 10ms
- **`_renderEventLog()`** : confirmer absence d'appel avant suppression (déjà vérifié — safe)

---

## Code à écrire — patch complet priorité 1 (fix double log)

Dans `_updateProjects()`, remplacer le bloc résolution (~L855-875) :

```js
// AVANT (bugué — double log) :
proj.resolved   = true;
proj.resolvedAt = performance.now();
const participantIds = [...proj.participants].join(', ');
for (const e of this.entities) {
  if (proj.participants.has(e.id)) {
    // ... récompenses ...
  }
}
const entry = { text: `${proj.label} résolu ! ...`, color: proj.color, timestamp: performance.now() };
this.eventLog.unshift(entry);
if (this.eventLog.length > this.EVENT_LOG_MAX) this.eventLog.length = this.EVENT_LOG_MAX;
this.pushEvent(`🌟 Projet "${proj.label}" résolu par ${participantIds || '—'}`, proj.color, 'project');

// APRÈS (corrigé — un seul log) :
proj.resolved   = true;
proj.resolvedAt = performance.now();
const participantIds = [...proj.participants].join(', ');
for (const e of this.entities) {
  if (proj.participants.has(e.id)) {
    // ... récompenses (inchangées) ...
  }
}
this.pushEvent(`🌟 Projet "${proj.label}" résolu par ${participantIds || '—'}`, proj.color, 'project');
// ← suppression du bloc eventLog.unshift manuel
```
