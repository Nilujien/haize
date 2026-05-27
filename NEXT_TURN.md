# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 19:12 (bilan post-tour autonome)_

---

## Bilan du tour précédent (27/05 19:12)

### Ce qui a été implémenté

1. **Fix B2 — Protection PROJET contre le curseur** ✅
   - Le bloc de fuite curseur est maintenant conditionné à `e.state !== STATE.PROJET`
   - Les entités en cours de projet ne sont plus éjectées physiquement par la souris
   - Impact gameplay direct : les projets peuvent se compléter sans perturbation involontaire

2. **Decay nocturne de `socialCharge`** ✅
   - Les introvertis en solitude la nuit récupèrent leur charge sociale plus vite
   - `introFactor = 1 - e.character.socialite` — LD/GD/IM bénéficient davantage
   - Formule : `0.025 * dt * (0.3 + introFactor * 0.7)` — decay doux, non brutal
   - Cycle jour/nuit maintenant biologiquement cohérent pour la sociabilité

3. **Cache `_activeRancorLinks` + badge ×N** ✅
   - `_renderRancorLinks` refactorisé pour utiliser le cache (comme `_activeFriendLinks`)
   - Rebuild simultané toutes les 200ms (même timer que friendLinks)
   - Suppression du O(n²) à chaque frame dans le render
   - Badge `❄️×N` affiché si count ≥ 5 — encode visuellement l'intensité de la rancœur
   - `_activeRancorLinks` initialisé dans constructor et reset()

### Ce qui a été laissé de côté

- **MEDITATION pour introvertis** : intéressant mais nécessite une refonte de l'affinité FSM → reporter
- **B3 decay interactionLog** : les liens d'amitié clignotent trop — fix possible mais impact faible en pratique
- **AFFINITES étendues** : 66 paires possibles, 6 définies — enrichissement de données pur, pas urgent
- **Cascade CELEBRATION → EUPHORIQUE** : nice-to-have, pas de bug fonctionnel

### Observations

- Perf : aucun impact notable, les 3 changements sont soit neutres soit légèrement positifs (cache rancœur)
- Budget frame estimé toujours ~9-16ms/16.6ms — marge confortable
- `isNight` bien utilisé (boolean existant dans la sim)
- Cohérence architecture : `_activeRancorLinks` maintenant parfaitement parallèle à `_activeFriendLinks`

---

## Priorités pour le prochain tour

### 1. Fix B3 — Decay interactionLog conditionnel (effort moyen, impact visuel)

Le score de lien d'amitié décroît uniformément même quand deux entités sont encore proches.
Fix : dans `_forgetTimer`, ne pas appliquer le decay si les entités sont actuellement proches :

```js
// Dans _forgetTimer, modifier le decay
for (const e of entities) {
  for (const id in e.interactionLog) {
    const other = entities.find(x => x.id === id);
    if (other) {
      const dx = e.x - other.x, dy = e.y - other.y;
      const distSq = dx*dx + dy*dy;
      // Pas de decay si entités proches (dans rayon d'interaction)
      if (distSq < this.INTERACTION_RADIUS * this.INTERACTION_RADIUS) continue;
    }
    e.interactionLog[id] = Math.max(0, e.interactionLog[id] * 0.94);
    if (e.interactionLog[id] < 0.5) delete e.interactionLog[id];
  }
}
```

### 2. MEDITATION pour introvertis (effort moyen, feature gameplay)

Ajouter une transition FSM : une entité introverti en CONCENTRE/SATURE avec `socialCharge > threshold * 0.8`
peut entrer en MEDITATION si elle est seule depuis > 5s.

MEDITATION : état silencieux, halo doux, pas de déplacement, récupération accélérée.
Durée : 10-30s selon `introFactor`.

### 3. Enrichir AFFINITES (effort faible, impact immédiat sur premières minutes)

Ajouter 6-10 paires supplémentaires dans `AFFINITES` pour des liens prédéfinis entre personnages
qui n'ont pas encore d'affinités. Les premières minutes seraient plus animées visuellement.

---

## Contraintes à respecter

- `SAVE_KEY = 'haize_save_v1'` — ne pas changer
- FSM 9 états — stable, ne pas refactorer
- `PROJECT_MAX = 3`, `ENTITY_DEFS` (12 entités), `AFFINITES` — immuables
- Ne pas toucher à `Heatmap`
- Ne pas introduire de `async` dans la boucle de rendu
- `_activeFriendLinks` : structure `{ a, b, score, strength }` — stable
- `_activeRancorLinks` : structure `{ a, b, count, dist }` — stable
