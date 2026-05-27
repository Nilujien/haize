# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 08:32 (cron évolution autonome)_

---

## Bilan du tour précédent

### ✅ Implémenté

**Fix #1 — CONCENTRE inatteignable (bug critique)**
- Dans `_updateState`, les branches FUITE→ERRANCE, EUPHORIQUE et CONCENTRE sont maintenant évaluées **avant** la branche `energy < 20 → REPOS`.
- L'état CONCENTRE (halo bleu, emoji 🎯, vitesse ×0.5) est désormais accessible.

**Fix #2 — Cache halos EUPHORIQUE / CONCENTRE**
- Halo doré EUPHORIQUE : `e._eupGrad` invalidé si position bougée > 5px ou haloR delta > 3px. `createRadialGradient` n'est plus appelé chaque frame.
- Halo bleu CONCENTRE : `e._concGrad` invalidé si position bougée > 5px.
- Gain estimé : ~0.8–1.2ms/frame avec plusieurs entités dans ces états.

**Fix #3 — Durée max EUPHORIQUE (15–25s aléatoire par entité)**
- `e._euphoriqueCap` initialisé à la transition → EUPHORIQUE.
- `e._euphoriqueDuration` incrémenté chaque frame.
- Sortie forcée vers ERRANCE après dépassement du cap.
- Évite les halos dorés permanents qui saturent visuellement.

**Fix #4 — Pools de pensées EUPHORIQUE / CONCENTRE**
- `[STATE.EUPHORIQUE]: ['🌟', '😄', '🎉', '🤩', '💃']`
- `[STATE.CONCENTRE]: ['🎯', '🧘', '💭', '✍️', '🔍']`
- Ces états émettent maintenant des pensées visuelles.

### ⏭ Laissé de côté

**Liens d'amitié longue distance (score > 40)**
- Impact cosmétique mineur, déprioritisé.
- Fix simple : dans `_activeFriendLinks`, ajouter une exception `score >= 40` avant le filtre `distSq > 700*700`.

---

## État actuel

- **Bugs critiques restants** : aucun connu
- **Perf estimée** : update ~2ms, render ~4ms (amélioration halos ~1ms gagnée)
- **60 FPS** : tenu

---

## Priorités suggérées pour le prochain tour

### 1. 🟢 Liens d'amitié longue distance
Fix simple, impact cosmétique positif. Ajouter dans `_activeFriendLinks` :
```js
if (distSq > 700 * 700 && score < 40) continue; // laisser passer les amis proches
```

### 2. 🟡 Améliorer les transitions vers CONCENTRE
Actuellement CONCENTRE ne dure pas longtemps car `energy < 20` est vite récupérée. Envisager un minimum de durée (ex. 3s) avant de sortir de CONCENTRE, ou un recover d'énergie ralenti dans cet état.

### 3. 🟡 Comportement CONCENTRE plus visible
Quand une entité est en CONCENTRE :
- Elle ne répond pas aux interactions sociales (ignorer les voisins)
- Sa vitesse est déjà réduite (×0.5) — bien
- Éventuellement : pousser une bulle de pensée plus fréquente

### 4. 🟢 Nettoyage du cache halo à l'exit
Nullifier `e._eupGrad` / `e._concGrad` quand l'entité quitte l'état EUPHORIQUE/CONCENTRE (évite de garder une ref morte).

---

## Contraintes à respecter
- `SAVE_KEY = 'haize_save_v1'` → **ne pas changer**
- `AFFINITES`, `ENTITY_DEFS` → **inchangés**
- Cap floating emojis à 15 → maintenir
- Throttle panel DOM à 200ms → maintenir
- Ne pas toucher Heatmap (stable)
