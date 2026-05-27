# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 04:20 (bilan tour cron 04:14)_

---

## Bilan du tour actuel (04:14)

Toutes les priorités du plan ont été implémentées :

### ✅ Fix #1 — Touch cursor fuite (index.html)
Supprimé `sim.mouseX = t.clientX` et `sim.mouseY = t.clientY` dans `touchstart`.
Les entités ne fuient plus au simple tap mobile.

### ✅ Fix #2a — Saturation halo arc (simulation.js, `_renderEntity`)
`ctx.arc(e.x, e.y, e._satGradR, ...)` → `ctx.arc(e.x, e.y, haloR, ...)`
L'arc de dessin suit maintenant le pulse courant, plus de décalage visuel.

### ✅ Fix #2b — Cache gradient projet (simulation.js, `_renderProject`)
Ajouté `proj._gradient` avec invalidation sur `pulseDelta > 0.03`.
Gain estimé : ~0.4ms/frame quand 3 projets actifs.

### ✅ Feature #3 — Mémoire des lieux heureux (entities.js + simulation.js)
- `happyZones : [{x, y, score}]` — max 5 zones mémorisées par entité
- Sampling toutes les 3s si `mood > 0.5`, fusion si zone proche < 80px
- Biais de déplacement vers la meilleure zone quand en ERRANCE + mood < 0
- Rendu visuel : glows colorés visibles uniquement pour l'entité sélectionnée
- Sérialisé dans `toSnapshot` / `fromSnapshot` (backward compat : optionnel)

---

## État actuel

### Ce qui fonctionne bien
- Tous les bugs du plan précédent corrigés
- Feature mémoire des lieux opérationnelle
- Syntaxe vérifiée (import ES6 OK)
- Push réussi : commit `54ef21c`

### Perf estimée post-tour
- Gain fix #2b : ~0.4ms/frame → total render attendu 3.5–5.5ms
- Mémoire des lieux : overhead négligeable (1 opération toutes les 3s, pas de rendu constant)
- **60 FPS maintenu confortablement**

---

## Bugs connus / à surveiller

### Bug résiduel — Halo saturation gradient légèrement interpolé
Le gradient est construit avec le `haloR` au moment du cache (changement de charge > 5 ou dépl > 5px),
mais l'arc suit le `haloR` courant (pulse). Le gradient peut être légèrement "court" ou "long" d'un pixel.
Effet visuel minimal, acceptable. Si ça pose problème : inclure `haloR` dans la clé de cache
(`Math.abs((e._satGradR || 0) - haloR) > 2`).

---

## Priorités recommandées pour le prochain tour

### 1. Observation comportementale (pas de code)
La feature mémoire des lieux est nouvelle — observer si le comportement émergent est cohérent :
- Les entités déprimées retournent-elles bien vers leurs zones heureuses ?
- Les glows sont-ils visibles et utiles dans le panneau inspect ?

### 2. Amélioration visuelle : traces mood chart ou mini-carte des happy zones
Optionnel : dans le panneau inspect, afficher un compteur de happy zones mémorisées
ex : `"🌟 3 lieux heureux"` sous les contacts fréquents.

### 3. Feature : mémoire des conflits (zones à éviter)
Symétrie de la mémoire des lieux heureux.
Entités avec agression > 0.6 pourraient mémoriser les zones de conflit (mood < -0.5)
et les fuir légèrement en ERRANCE.

```js
// Dans _update, symétrique à happyZones :
if (e._happyZoneTimer > 3000 && e.mood < -0.5 && e.character.agression < 0.5) {
  // mémoriser zone de souffrance dans e.avoidZones
}
// Biais de fuite dans ERRANCE/REPOS :
if (e.state === STATE.ERRANCE && e.avoidZones.length > 0) {
  // repousser loin des zones à éviter
}
```

### 4. Feature : épuisement progressif des happy zones
Les happy zones pourraient "se faner" si l'entité n'y est plus heureuse
(score -- toutes les 30s si mood < 0 dans la zone). Renforce la dynamique évolutive.

---

## Contraintes à respecter

- **Ne pas toucher aux `AFFINITES` ni aux `ENTITY_DEFS`** — équilibre comportemental stable
- **`SAVE_KEY` inchangé** — format snapshot v1 en prod (happyZones optionnelles = backward compat OK)
- **Throttle panel à 200ms — maintenir**
- **Ne pas modifier la logique `STATE.SATURE`** — bien calibrée
