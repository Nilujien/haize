# HAIZE — Plan du prochain tour
_Rédigé le : 14/06/2026 21:03_

## Bilan du tour

### ✅ Implémenté

**Fix 1 — isClose destructuring (CRITIQUE)**  
`simulation.js` ~l.2249 : ajout de `isClose` dans la destructuration du premier `for...of` de `_renderFriendshipLinks`. Le bug faisait que `!undefined === true` en permanence, causant un double-rendu du cœur 💛 pour toutes les paires score > 40, qu'elles soient proches ou non. Fix : 1 caractère.

**Fix 2 — concentreCap save/load (SÉCURITÉ DONNÉES)**  
`simulation.js` save() : ajout de `cap: e._concentreCap || 50000` dans l'objet `concentreDurations`.  
`simulation.js` load() : restauration `e._concentreCap = d.cap ?? 50000`.  
Plus d'inconsistance d'état CONCENTRE après save/load.

**Feature — Journal des Relations (📖, touche J)**  
- Méthode `buildRelationJournal()` dans `Simulation` — calculé à la demande, coût nul sur la boucle
- Panneau overlay `#journal-panel` dans index.html (toggle bouton 📖 + touche J)
- CSS dédié dans style.css (fond semi-opaque, border jaune doré, fermeture clic hors panneau)
- 5 types de faits : meilleure alliance (interactionLog croisé), rancœur la plus profonde (_conflictCount), star des projets (successCount), expert de type (projectHistory ≥5), paire en harmonie (affinité sans conflit actif)
- Limité à 6 faits max, rendu uniquement à l'ouverture

### ⏭ Laissé de côté

- Rien d'urgent détecté. Le budget perf reste sain (pas d'O(n²) ajouté dans la boucle).

---

## État actuel

Tous les bugs critiques et gaps connus du plan précédent sont résolus.  
Le Journal des Relations est opérationnel — donne du sens narratif aux émergences de la simulation.

---

## Observations pour le prochain tour

- Le journal est purement textuel — une future amélioration pourrait ajouter un **mini-graphe de relations** (SVG inline, calculé à la demande)
- La détection "réconciliée" est heuristique (affinité > 5 + absence de conflit actif). Une vraie réconciliation trackée (timestamp + flag) donnerait plus de précision narrative.
- Envisager un **historique de session** : compteur de "jours simulés" affiché quelque part + dans le journal ("Jour 12 de la simulation")
- Les `_projectHistory` par entité ne sont pas persistés dans save/load → gap mineur, les experts perdent leur historique après load
- Perf : toujours dans le budget. Aucun bottleneck détecté.

---

## Priorités suggérées pour le prochain tour

1. **🟡 Fix save/load `_projectHistory`** — ajouter dans snapshot, même pattern que concentreDurations
2. **🌟 Compteur de "jours simulés"** — incrémenter lors du cycle nuit→jour, afficher dans title + journal
3. **💡 Mini-graphe SVG dans le journal** — visualiser les liens (alliances/rancœurs) en SVG statique calculé au toggle
