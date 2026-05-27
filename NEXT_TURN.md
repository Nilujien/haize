# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 13:58 (analyse pre-tour autonome)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Architecture simulation solide : boucle RAF, cycle jour/nuit, événements globaux, états FSM bien gérés
- Perf sous contrôle : heatmap via ImageData/LUT, cache gradients, hash DOM panel, rebuild liens amitié 5×/s
- Mécanique de mémoire riche : zones heureuses/évitées, interactionLog, moodHistory, rancune
- Recrutement PROJET + signal 📡 visuellement lisible
- Liens rancune ❄️ avec pulsation : cohérent et discret

### Ce qui pose problème / lacunes
1. **Malus affinité rancune non implémenté** — prévu depuis 2 tours, décision de différer. C'est la feature la plus impactante pour la cohérence comportementale : deux entités en conflit répété continuent de s'attirer comme si de rien n'était. Incohérence visible.

2. **Pas de decay du _conflictCount** — les rancunes s'accumulent sans jamais se résorber. Sur une session longue, toutes les paires agressives finissent en rancune max. Il manque un mécanisme de réconciliation ou d'oubli.

3. **STATE.CONCENTRE sous-exploité** — l'état existe, le halo bleu et la répulsion 🤫 sont là, mais rien ne le _déclenche_ de façon intéressante depuis l'extérieur. Il arrive par épuisement (energy < 20 et mood > -0.3) mais pas par choix volontaire, ni par rapport au contexte (ex: entité introvertie après saturation sociale).

4. **Projets trop impersonnels** — les projets spawnenent aléatoirement, mais aucun lien avec l'historique. Une entité qui a résolu 5 projets EXPLORATION se comporte exactement comme une qui n'en a résolu aucun. Le successCount est affiché mais n'influence pas le comportement.

5. **_updatePanel stateHash fragile** — le hash inclut `Math.round(e.mood * 10)` et `Math.round(e.energy)`, ce qui est correct, mais inclut `e === this.selectedEntity ? 1 : 0` — ce qui force un rebuild complet du panel DOM à chaque clic même si l'état des entités n'a pas changé. Mineur mais inutile.

---

## Bugs / régressions détectés

- **simulation.js ~ligne 512** : Dans `_update`, la boucle recrutement PROJET itère sur toutes les entités pour trouver un `recruiter.state === STATE.PROJET`, puis cherche le projet le plus proche de cette recruteuse. Mais si la recruteuse est dans le rayon d'un projet résolu en cours d'animation (`!proj.resolved && !proj.isExpired`), elle ignore le projet. Le find() cherche `!p.resolved && !p.isExpired && Math.hypot(...) < p.radius` : si la recruteuse est entre deux projets, elle prend le premier trouvé (ordre tableau), pas le plus proche. Résultat : recrutement potentiellement vers le mauvais projet. Pas critique mais incohérent.

- **simulation.js ~ligne 888** : Dans `_renderFriendshipLinks`, la "passe cœur rapproché" fait un double loop O(n²) sur `this.entities` à chaque frame rendu (sans cache). Pour 12 entités = 66 comparaisons par frame. Acceptable à 12, mais c'est un oubli vs le système de cache `_activeFriendLinks` qui exclut les proches. Devrait utiliser le même cache avec un flag `nearby: true`.

- **entities.js getAffinityWith** : Les affinités dynamiques (interactionLog) s'ajoutent à la base mais ne sont jamais soustrayites par la rancune. `_conflictCount` est dans la Simulation, pas dans l'Entity — donc `getAffinityWith` ne peut pas y accéder. C'est le design-bug central qui bloque le malus de rancune.

- **simulation.js _updateState ~ligne 638** : La condition d'euphorie (`e.mood > 0.7 && e.energy > 70`) est vérifiée **avant** la condition de saturation (`socialCharge > threshold`). Or une entité saturée peut atteindre mood 0.7 juste après un projet réussi. Elle bascule en EUPHORIQUE malgré une charge sociale élevée. L'ordre devrait être : saturation → fuite → concentré → euphorique.

---

## Perf

- **_update** : ~3-5ms estimé (inchangé depuis dernier tour)
- **_render** : ~4-7ms (recrutement + rancune negligeable, ~0.05ms)
- **_updatePanel** : quasi-gratuit grâce au hash (skip DOM quand état stable)
- **Hotspot potentiel** : boucle recrutement PROJET = O(n²) avec accès `getAffinityWith` qui lui-même fait une boucle sur AFFINITES (6 entrées) = 12×12×6 = 864 ops/frame. Coût réel < 0.1ms mais à surveiller si n augmente.
- **Budget 60fps** : confortable, ~10-15ms de marge.

---

## Priorités recommandées pour le prochain tour

### P1 — Malus affinité rancune + decay journalier ❄️ (impact : cohérence comportementale)

**Pourquoi maintenant** : C'est la dette accumulée depuis 2 tours. Sans ça, la rancune est purement cosmétique. Avec ça, les entités en conflit répété s'évitent réellement.

**Comment** :
1. Passer `conflictCount` à l'Entity (ou passer une callback depuis Simulation) — solution la plus propre : ajouter un paramètre optionnel à `getAffinityWith(otherId, conflictPenalty = 0)` appelé depuis Simulation avec `this._conflictCount[ck] || 0`.
2. Dans la boucle attraction (interactions sociales), calculer le malus : si count ≥ 5, soustraire `Math.min(0.3, count * 0.04)` à l'affinité effective.
3. Decay `_conflictCount` : à la transition jour→nuit, diviser tous les counts par 2 (arrondi inf). Soft oubli naturel — les rancunes s'effacent avec le temps sauf si le conflit persiste.

### P2 — Comportement successCount : entités vétéranes plus efficaces sur leurs projets affinitaires (impact : profondeur simulacrale)

**Pourquoi** : Le successCount est affiché mais n'influence rien. Une entité avec 5 victoires sur EXPLORATION devrait contribuer davantage aux projets EXPLORATION.

**Comment** :
- Dans `_updateProjects`, lors du calcul de `contrib`, multiplier par un bonus `experienceBonus` :
  ```js
  // Dans _updateProjects, boucle participants
  const projectHistory = e._projectHistory || {};
  const expCount = projectHistory[proj.type] || 0;
  const experienceBonus = 1 + Math.min(0.5, expCount * 0.1); // max +50% à 5 succès
  const contrib = charAffinity * (e.energy / 100) * 0.012 * dt * experienceBonus;
  ```
- Incrémenter `e._projectHistory[proj.type]` à chaque résolution.
- Afficher un badge type `⭐EXPLORATION` dans le panneau inspect si count ≥ 3 (optionnel, cosmétique).

### P3 — Fix bug recrutement PROJET : cibler le projet le plus proche, pas le premier (impact : correctif logique)

**Pourquoi** : Quand plusieurs projets sont actifs, une recruteuse attire ses alliés vers le mauvais projet.

**Comment** :
```js
// Remplacer le find() par un reduce() sur distance minimale
const proj = this.projects
  .filter(p => !p.resolved && !p.isExpired && Math.hypot(p.x - recruiter.x, p.y - recruiter.y) < p.radius)
  .reduce((closest, p) => {
    const d = Math.hypot(p.x - recruiter.x, p.y - recruiter.y);
    return (!closest || d < closest._dist) ? Object.assign(p, { _dist: d }) : closest;
  }, null);
```
Propre, O(n) sur les projets actifs (max 3).

---

## Contraintes à respecter

- **Ne pas toucher le système de sauvegarde/chargement** (SAVE_KEY 'haize_save_v1') sans bump de version et migration. Si on ajoute `_projectHistory` à l'entité, l'ajouter dans `toSnapshot()` et `fromSnapshot()` avec fallback `{}`.
- **Pas de refactor majeur de la FSM** — l'ordre des conditions dans `_updateState` est intentionnel et fragile. Modifier uniquement l'ordre saturation/euphorie si P1 est fait (correction bug détecté).
- **Garder le plafond PROJECT_MAX = 3** et les timers de spawn tels quels — la densité de projets est actuellement bien calibrée visuellement.
- **Ne pas modifier ENTITY_DEFS ni AFFINITES** — les personnalités sont intentionnelles.

---

## Code à écrire (pseudo-code principal)

### Malus rancune dans getAffinityWith (entities.js)

```js
// Modifier la signature pour accepter un malus externe
getAffinityWith(otherId, rancorPenalty = 0) {
  let base = 0;
  for (const [a, b, force] of AFFINITES) {
    if ((a === this.id && b === otherId) ||
        (b === this.id && a === otherId)) { base = force; break; }
  }
  const logScore = this.interactionLog[otherId] || 0;
  const dynamic = Math.min(0.4, logScore / 50);
  return Math.max(0, Math.min(1, base + dynamic - rancorPenalty));
}
```

### Appel depuis simulation.js (partout où getAffinityWith est appelé en contexte social)

```js
// Dans la boucle interactions (_update)
const ck = [e.id, other.id].sort().join('-');
const rancorCount = this._conflictCount[ck] || 0;
const rancorPenalty = Math.min(0.3, rancorCount * 0.04);
const affinity = e.getAffinityWith(other.id, rancorPenalty);
```

### Decay rancune au passage jour→nuit (_updateCycle)

```js
if (!wasNight && this.isNight) { // transition jour → nuit
  for (const key in this._conflictCount) {
    this._conflictCount[key] = Math.floor(this._conflictCount[key] / 2);
    if (this._conflictCount[key] <= 0) delete this._conflictCount[key];
  }
}
```

### Sauvegarde _projectHistory dans Entity

```js
// toSnapshot() — ajouter :
_projectHistory: { ...(this._projectHistory || {}) },

// fromSnapshot() — ajouter :
if (snap._projectHistory) this._projectHistory = { ...snap._projectHistory };
```
