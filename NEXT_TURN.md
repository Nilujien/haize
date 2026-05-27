# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 14:58 (bilan post-tour autonome)_

---

## Bilan du tour actuel

### Implémenté

**P1 — Malus affinité rancune + decay journalier ❄️**
- `getAffinityWith(otherId, rancorPenalty = 0)` : nouvelle signature dans `entities.js`
- Dans la boucle interactions sociales (`simulation.js ~ligne 965`) : calcul du malus dynamique — `rancorPenalty = Math.min(0.3, conflictCount * 0.04)`, passé à `getAffinityWith`
- Decay au passage jour→nuit : `_conflictCount[key] = floor(count / 2)`, suppression à 0. Les rancunes s'estompent naturellement.
- Impact : entités en conflit répété (count ≥ 5) ont une affinité effective réduite jusqu'à -0.3. Comportement enfin cohérent avec le visuel ❄️.

**P2 — Bonus expérience par type de projet (`_projectHistory`)**
- Nouvelle propriété `_projectHistory: {}` dans `Entity` (constructeur + `toSnapshot` + `fromSnapshot` avec fallback)
- Dans `_updateProjects` : calcul de `experienceBonus = 1 + min(0.5, expCount * 0.1)` — max +50% à 5 succès
- Incrémentation de `e._projectHistory[proj.type]` à chaque résolution avec participation
- Les vétérans EXPLORATION/MEDITATION contribuent réellement plus. La simulation gagne en profondeur.

**P3 — Fix recrutement PROJET : projet le plus proche**
- Remplacé `this.projects.find(...)` par `.filter(...).reduce(...)` avec calcul de distance
- Une recruteuse attire maintenant ses alliés vers le projet le plus proche d'elle, pas le premier dans le tableau.
- Correctif O(n_projets) — négligeable pour PROJECT_MAX=3.

### Laissé de côté

- **Fix `_updatePanel` stateHash** (inclut le flag selectedEntity) : mineur, non prioritaire
- **STATE.CONCENTRE déclenchement contextuel** (introvertis saturés socialement choisissent CONCENTRE volontairement) : intéressant mais demande une analyse FSM prudente
- **Badge expérience dans le panneau inspect** (⭐EXPLORATION si count ≥ 3) : cosmétique, à faire facilement au prochain tour

---

## État actuel du code

### Ce qui fonctionne bien
- Architecture simulation solide (identique)
- Budget perf confortable (~10-15ms de marge sur 60fps)
- Rancune maintenant fonctionnelle : visuelle ET comportementale
- `_projectHistory` en place, prêt pour affichage futur

### Observations et pistes pour le prochain tour

1. **Badge expérience dans panel inspect** : simple à ajouter — `if (e._projectHistory[type] >= 3) afficher "⭐TYPE"`
2. **STATE.CONCENTRE enrichi** : déclencher volontairement pour les introvertis (extraversion < 0.3) après > 30s de charge sociale élevée, même sans fatigue énergétique
3. **Fix `_updatePanel` stateHash** : retirer `e === this.selectedEntity ? 1 : 0` du hash — évite un DOM rebuild à chaque clic
4. **Affichage rancune dynamique** : faire varier l'opacité/épaisseur du lien ❄️ selon le malus effectif (pas juste count ≥ 5)
5. **Mémoire de rancune persistée** : `_conflictCount` n'est pas dans le snapshot. Si c'est intentionnel (réinitialisation session), ok. Sinon, à ajouter dans `saveState`/`loadState`.

---

## Contraintes rappelées
- Ne pas toucher SAVE_KEY sans bump de version et migration
- Ne pas refactorer la FSM globalement
- PROJECT_MAX = 3, timers de spawn inchangés
- Ne pas modifier ENTITY_DEFS ni AFFINITES
