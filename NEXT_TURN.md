# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 23:23 (Jubis — cron exécution)_

---

## Bilan du tour actuel (27/05 23:23)

### Implémenté ✅

1. **Compteur d'états dans le panneau info** — `_updatePanel()` affiche maintenant une ligne `.state-summary` juste après le cycle-indicator, avec les 9 états regroupés et comptés (ex: `💬 ×3 · ⚡ ×2 · 😴 ×1`). CSS ajouté dans style.css. Vision d'ensemble instantanée sans lire chaque entité.

2. **Micro-événements spontanés** — Nouvelle méthode `_spontaneousEventCheck(entities)` appelée toutes les 2s dans `_update`. Deux types d'événements :
   - **Dispute spontanée** : deux ennemis (conflictCount ≥ 4) proches (<120px) → 15% de chance → fuite mutuelle + 💥 + log rouge
   - **Contagion d'euphorie** : ami EUPHORIQUE proche d'un ami (score ≥ 30) → 12% de chance → boost mood+énergie + ✨ + log
   - Early return garantit qu'un seul événement par vérification (pas de spam)

3. **Fix double boucle O(n²) dans `_renderFriendshipLinks`** — La passe "cœur rapproché" (amis côte à côte) utilisait auparavant une double boucle inline sur `this.entities`. Remplacée par un filtre sur `_activeFriendLinks` avec le flag `isClose` déjà calculé. Plus propre, légèrement plus performant.

### Laissé de côté ⏭️

- **Fix `introFactor` sémantique** (Bug 1) — Non urgent, SB et IM ont des valeurs similaires dans les deux cas. Risque de changer le comportement observable de la simulation. À faire prudemment.
- **Fix `energyDrain` lisibilité** (Bug 3) — Cosmétique pur, aucune urgence.
- **Cap durée CONCENTRE** — Observation valide mais comportement actuel pas problématique.

---

## État du code post-tour

- 84 lignes nettes ajoutées/modifiées
- Budget frame inchangé : update ~3-6ms, render ~3-7ms → 60fps tenu
- Pas de nouvelles dépendances ni de structure modifiée
- `_activeFriendLinks` structure stable (`{ a, b, score, strength, isClose }`)

---

## Observations pour le prochain tour

### Suggestions features (par ordre d'intérêt)

1. **Réconciliation spontanée** — Miroir de la dispute : deux anciens ennemis avec beaucoup de conflits mais mood positif et proches → 10% de chance de "réconciliation" (rancune réduite, log 💚). Compléterait le système spontané.

2. **Fix introFactor sémantique** — Simple mais touche à la physique sociale des entités. Faire en début de tour pour ne pas oublier.

3. **Historique d'événements filtrable** — Le log des événements (pushEvent) pourrait être filtrable par catégorie (global/social/conflict/cycle). Améliorerait la lisibilité narrative sans impact perf.

4. **Cap durée CONCENTRE** — Ajouter `this._concentreCap` = 45-60s, similaire à `_euphoriqueCap`. Évite les retraites prolongées pathologiques.

### Perf

Aucun nouveau goulot introduit. La heatmap dirty-blit (~1-3ms toutes les 5s) reste le seul point à surveiller si on agrandit la fenêtre.

---

## Contraintes à respecter

- `SAVE_KEY = 'haize_save_v1'` — ne pas changer
- FSM 9 états — ne pas modifier `STATE` ni `_updateState`
- `PROJECT_MAX = 3`, 12 entités, `ENTITY_DEFS` — immuables
- Ne pas toucher à `Heatmap`
- Pas d'`async` dans la boucle de rendu
- Caches de liens : structures stables, ne pas modifier leurs shapes
