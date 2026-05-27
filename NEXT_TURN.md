# NEXT_TURN.md — Bilan tour 28/05/2026 00:18

## ✅ Implémenté ce tour

### 1. Fix double-render du cœur (💛)
- La boucle principale `_renderFriendshipLinks` affichait le cœur pour TOUS les liens avec score > 40, y compris ceux en `isClose=true` — ces derniers étaient déjà rendus par la passe rapprochée.
- **Fix** : ajout du guard `&& !isClose` dans la boucle principale.
- Impact render : ~-0.1ms (évite N fillText en double)

### 2. Cap durée CONCENTRÉ (40-60s)
- Les entités épuisées pouvaient rester bloquées en CONCENTRÉ indéfiniment si l'énergie restait < 20 et que la condition `mood > -0.3` était true en permanence.
- **Fix** : fusionné le bloc cap + plancher en un seul `if (state === CONCENTRE)` avec :
  - Cap max = 40-60s aléatoire (init via `_concentreCap` à l'entrée de l'état)
  - Plancher min = 4-7s inchangé
  - Sortie forcée vers REPOS si cap dépassé
- `_concentreCap` initialisé dans le bloc `newState === STATE.CONCENTRE`.

### 3. Réconciliation spontanée (micro-événement #3)
- Ajouté dans `_spontaneousEventCheck()` comme 3e vérification après dispute + contagion euphorie
- Condition : `conflictCount` 2-4 (pas les rancunes profondes >4), distance < 100px, mood > 0.2 pour les deux
- Probabilité : 8% par check (toutes les 2s), soit ~0-4% par minute par paire éligible
- Effet : `conflictCount -= 2`, boost mood +0.15, emoji 🤝, log console

## ⏭ Laissé de côté

- **Filtres console** (catégories on/off) : pas urgent, aucun impact perf
- **Réconciliation → SOCIAL** : si besoin, la prochaine itération peut ajouter une transition d'état explicite post-réconciliation
- **_concentreCap dans le save/load** : actuellement non persisté (comme `_euphoriqueCap` l'était déjà). À ajouter si besoin.

## Observations pour le prochain tour

- Le fix du cœur est minimal mais correct — vérifier visuellement que les 💛 n'apparaissent plus en double sur les amis proches
- La réconciliation n'a pas de test unitaire — observer en simulation si des paires à conflictCount=2-3 se réconcilent dans les premières minutes
- Perf : aucune régression attendue. Les 3 changes sont O(n) max ou des guards.
- Next candidates : filtres console, cap EUPHORIQUE via P3 introvertis (protection contre contagion euphorie trop forte), ou feature narrative (générer une histoire des interactions)
