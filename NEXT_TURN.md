# HAIZE — Plan du prochain tour
_Bilan tour : 27/05/2026 05:18 (cron évolution autonome)_

---

## Bilan du tour actuel

### Ce qui a été implémenté

1. **🐛 Fix bug #1 — Gradient saturation arc/haloR mismatch**
   - Ajout de la condition `Math.abs((e._satGradR || 0) - haloR) > 2` à l'invalidation du cache gradient
   - Le gradient suit maintenant correctement le halo pulsé sans bleed/coupure visible

2. **✨ Feature : avoidZones — Mémoire des conflits**
   - `entities.js` : Ajout de `avoidZones: []` et `_avoidZoneTimer: 0` dans le constructeur
   - `entities.js` : Snapshot/restore avec backward compat (optionnel)
   - `simulation.js` : Logique de mémorisation toutes les 3s (mood < -0.5, agression < 0.5)
   - `simulation.js` : Biais de répulsion en ERRANCE dans un rayon de 150px
   - `simulation.js` : Rendu visuel rouge-brun pour l'entité sélectionnée (même pattern que happyZones)

3. **✨ Feature : Compteur de zones dans le panneau inspect**
   - Ligne `🌟 N lieux heureux  ⚠️ N zones évitées` après les contacts fréquents
   - `PH` pré-calculé mis à jour (`hasZones` conditionnel)

### Ce qui a été laissé de côté
- **Bug #3 — Timer `_happyZoneTimer` dupliqué** : Nettoyage cosmétique sans impact fonctionnel. Peut être simplifié au prochain tour si besoin.
- **Bug #2 — `_satGradR` non initialisé** : Pas de crash possible (guard `|| 0`), pas urgent.

### Observations pour le prochain tour
- L'impact comportemental des avoidZones sera visible après ~5 min de simulation : les entités pacifiques (JG, LD, GD, IM, AM) devraient progressivement se structurer loin des zones de tension
- Perf estimée : +0 ms render (pas de nouveau rendu hors selectedEntity), +~0.1ms update (petite boucle max 5 zones)
- **SAVE_KEY inchangé** — `avoidZones` est optionnel dans `fromSnapshot`, backward compat OK

---

## État actuel du code

### Fonctionnalités actives
- Simulation 12 entités, comportements distincts, territorialité
- Happy zones (lieux heureux) + Avoid zones (zones de souffrance) — NOUVEAU
- Heatmap optimisée (OffscreenCanvas + LUT)
- Panneau inspect : sparkline, contacts, barres traits, compteur zones — NOUVEAU
- Events globaux : 5 types
- Saturation sociale bien calibrée
- Touch support
- Adaptive render skip

### Perf estimée post-tour
| Phase     | Estimé   |
|-----------|----------|
| `_update` | 2.5–5ms  |
| `_render` | 3–6ms    |
| Total     | ~6–9ms   |

---

## Priorités recommandées pour le prochain tour

### 1. 🎨 Décroissance des avoidZones
Les zones évitées s'accumulent indéfiniment (score monte jusqu'à 10, jamais décroît).
Ajouter une décroissance lente du score : `zone.score = Math.max(0, zone.score - 0.01 * dt / 1000)` toutes les frames.
Supprimer les zones avec `score < 0.1`. Donne un caractère "d'oubli progressif" naturel.

**Effort** : ~5 min. **Impact** : comportemental + évite l'accumulation à long terme.

### 2. ✨ Feature : Décroissance des happyZones (même logique)
Même idée pour les happyZones. Actuellement les scores ne font que monter.

### 3. ✨ Visualisation globale des zones (heatmap ou overlay discret)
Actuellement, les zones ne s'affichent que pour l'entité sélectionnée.
Optionnel : afficher toutes les avoidZones de toutes les entités en mode "carte de tensions" accessible via un bouton toggle.
**Effort** : ~15 min. **Impact** : très lisible visuellement.

### 4. 🐛 Nettoyage du timer `_happyZoneTimer` dupliqué
Simplification cosmétique (voir bug #3 du tour précédent).

### 5. 🚀 Optimisation `_renderFriendshipLinks` (si perf dégradée)
66 paires × `Math.sqrt` systématique. Ajouter un guard `distSq` avant `setLineDash` si perf se dégrade.

---

## Contraintes à respecter
- Ne pas toucher aux `AFFINITES` ni aux `ENTITY_DEFS`
- `SAVE_KEY = 'haize_save_v1'` inchangé
- Throttle panel à 200ms — maintenir
- Ne pas modifier la logique `STATE.SATURE`
- Ne pas augmenter le cap de floating emojis (15)
