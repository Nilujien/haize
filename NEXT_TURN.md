# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 13:50 (bilan post-tour autonome)_

---

## Bilan du tour — ce qui a été implémenté

### ✅ P1 — Recrutement PROJET (attraction + signal 📡)
- Dans `_update` : après la boucle attraction projets, nouvelle boucle parcourt les entités en STATE.PROJET
- Pour chaque recruteuse en projet, les entités affinitaires (affinité ≥ 0.5) à distance < `radius * 4` reçoivent une attraction légère (0.018 × affinité)
- Cap à 4 recrutés simultanés par recruteuse
- Emoji 📡 throttlé 5s par paire recruiter-other
- `_recruitTimers` initialisé dans constructeur et reset()
- Dans `_render` : nouvelle méthode `_renderRecruitLinks(ctx)` — trait pointillé doré, opacité proportionnelle à l'affinité et à la distance

### ✅ P2 — Mémoire de rancune ❄️
- `this._conflictCount` (Map clé "A-B" → nb conflits) dans constructeur + reset()
- Dans la branche conflit agressif : `_conflictCount[ck]` incrémenté à chaque log (throttlé 4s)
- Nouvelle méthode `_renderRancorLinks(ctx)` : si count ≥ 3, trait rouge-brun pulsant entre les deux entités + icône ❄️ au milieu, opacité croissante avec l'intensité (cap à 8 conflits)

### ✅ P3 — Optimisation DOM `_updatePanel`
- `_panelStateHash` : hash rapide de l'état de toutes les entités (id:state:mood:energy:selected) + jour + pct
- Si le hash est identique au tick précédent : return immédiat, zéro DOM rebuild
- Gain CPU : suppression de ~1200 node allocations toutes les 200ms quand l'état est stable

---

## Ce qui a été laissé de côté

- **Malus d'affinité dynamique pour rancune** (si conflictCount ≥ 5, -0.2 sur `getAffinityWith`) : non implémenté pour garder la PR légère et testable séparément
- **Log de sortie d'euphorie** (cosmétique, bug #4 du plan) : pas touché, très faible priorité

---

## Observations pour le prochain tour

- Perf toujours dans les marges : les deux nouvelles boucles de rendu sont O(n²) sur 12 entités = 66 paires max, coût négligeable (< 0.1ms/frame estimé)
- Le recrutement PROJET créé des clusters visuels lisibles — vérifier en jouant que ça ne crée pas de "boule" trop serrée autour d'un projet (ajuster pull si besoin)
- La rancune ❄️ ne sera visible qu'après plusieurs parties longues — songer à un reset par jour ? (ex. decay 1/jour)
- Prochain tour naturel : malus affinité rancune, decay journalier de _conflictCount, ou nouvelle mécanique (projet échoué → entités démoralisées ?)
- Nettoyer les fichiers _patch*.py/_patch_panel.js (fait dans ce tour)

---

## Perf estimée fin de tour

- `_update` : ~3-5ms (inchangé — recrutement PROJET ajoute ~0.05ms)
- `_render` : ~3-6ms (+ ~0.05ms pour _renderRecruitLinks + _renderRancorLinks)
- `_updatePanel` : maintenant quasi-gratuit quand l'état est stable (skip DOM rebuild)
- Budget 60fps : confortable, large marge
