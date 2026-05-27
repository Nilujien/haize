# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 12:47 (bilan post-tour autonome)_

---

## Bilan du tour actuel

### ✅ Implémenté

1. **Perturbation CONCENTRÉ 🤫** (priorité 1 du plan)
   - Quand une entité s'approche à < 75px d'une entité CONCENTRÉE, elle est légèrement repoussée
   - Une bulle de pensée `🤫` apparaît sur l'entité CONCENTRÉE (throttlée à 5s/paire)
   - Utilise `this._concentrePerturbTimers` (Map dédiée, pas de pollution this)
   - Réinitialisé dans `reset()`
   - Coût perf : Map.get/set dans le rayon 75px → négligeable

2. **Événement EUPHORIE CONTAGIEUSE 🌈** (priorité 2 du plan)
   - Pendant 18s, la joie se propage par contact (inverse de l'ÉPIDÉMIE)
   - Source : l'entité avec la plus haute humeur, portée à 1.0
   - Bouton 🌈 ajouté dans `index.html`, connecté au triggerEvent('EUPHORIE')
   - Coût perf : O(n²) uniquement pendant l'événement (18s) — identique à ÉPIDÉMIE

3. **Fix liens d'amitié au contact rapproché 💛** (priorité 3 du plan)
   - Passe supplémentaire dans `_renderFriendshipLinks` pour les paires score ≥ 40 à dist < INTERACTION_RADIUS
   - Dessine le cœur 💛 même quand le cache les exclut du tracé de trait
   - Coût perf : O(n²) sur les paires proches avec score élevé (rare en début de session)

### ❌ Laissé de côté

- Aucun point du plan non traité. Toutes les 3 priorités réalisées.

---

## Observations pour le prochain tour

### État du code

- **Perf** : budget frame toujours sain (~2ms update / ~4ms render attendus). Les ajouts sont légers.
- La `_concentrePerturbTimers` Map croît potentiellement avec le nombre de paires. À monitorer si lag détecté — mais 12 entités max = 66 paires max, vraiment négligeable.
- `_renderFriendshipLinks` a maintenant une petite double-boucle O(n²) supplémentaire. Acceptable.

### Dettes techniques restantes

| Fichier | Description | Sévérité |
|---|---|---|
| `simulation.js` | `EPIDEMIE._initialized` / `_patientZero` sur l'objet constant (fragile mais pas actif) | Faible |
| `simulation.js` | `_updatePanel()` innerHTML complet toutes les 200ms = ~1200 DOM nodes | Faible |

### Idées pour le prochain tour

1. **Comportement PROJET enrichi** : les entités en PROJET pourraient attirer leurs affinités naturelles (recrutement implicite). Signal visuel : traits pointillés dorés vers les proches.
2. **Mémoire longue** : si une paire a été en conflit > 3 fois, afficher une rancune durable (emoji ❄️ au lieu de 🤝 lors des contacts).
3. **Animation d'entrée/sortie** d'état : fade-in sur les badges (🎯, etc.) pour ne pas pop brutalement.
4. **`_updatePanel` optimisation** : rendre seulement les delta (innerHTML partiel ou `textContent` sur les spans existants) pour éviter les 1200 DOM nodes.
5. **Événement REUNION** : toutes les entités avec affinité ≥ 0.4 entre elles sont aspirées dans une zone, sans forcer tout le monde vers le centre.

### Contraintes à ne pas oublier

- **Ne pas toucher** la LUT heatmap
- **Ne pas modifier** les seuils de saturation sociale
- **Garder** la séparation stricte `_update` (write) / `_render` (read)
- **60 FPS non négociable**
- Tout nouvel état Simulation → le réinitialiser dans `reset()`
