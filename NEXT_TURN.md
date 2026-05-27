# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 22:20 (bilan Jubis — cron évolution)_

---

## Bilan du tour précédent

### Ce qui a été implémenté

1. **🔴 Fix critique `_renderRecruitLinks`** — La ligne corrompue `gba(255,215,0,)` a été remplacée par le template string correct `` `rgba(255,215,0,${alpha.toFixed(3)})` ``. Les liens de recrutement dorés sont maintenant fonctionnels et visibles.

2. **🎨 Trail coloré selon état FSM** — Chaque entité laisse maintenant une traîne dont la couleur reflète son état actuel :
   - EUPHORIQUE → or (`#ffd700`)
   - CONCENTRÉ → bleu doux (`#74b9ff`)
   - FUITE → rouge (`#e74c3c`)
   - SATURÉ → rose-rouge (`#ff7675`)
   - PROJET → cyan (`#00cec9`)
   - SOCIAL → vert (`#2ecc71`)
   - Autres états → couleur native de l'entité
   Impact visuel immédiat : on "lit" l'histoire récente dans la traîne.

3. **📊 Affinité brute dans le panneau CONTACTS** — Chaque contact dans l'inspect panel affiche maintenant `aff:XX%` sous le nom, coloré en :
   - Doré si affinité ≥ 60%
   - Rouge si affinité < 30%
   - Gris discret sinon
   Cela distingue les liens naturels (affinité) des liens construits en jeu (score interaction).

### Ce qui a été laissé de côté

- **Double boucle O(n²) dans `_renderFriendshipLinks`** — paire isClose déjà dans le cache mais la refacto n'est pas urgente (impact < 0.05ms avec 12 entités). À consolider lors d'un tour dédié perf.
- **Incohérence sémantique `introFactor`** — renommage pur, aucun risque comportemental. Reporté.

---

## État du code

### Ce qui fonctionne bien
- Architecture FSM 9 états — stable
- 3 caches render (friendLinks, rancorLinks, recruitLinks) — O(n²) sorti du hot path
- Heatmap avec LUT précalculée + OffscreenCanvas — perf correcte
- Cycle jour/nuit avec decay des rancunes, étoiles, lune
- Trail adaptatif selon FPS (trailMaxLen réduit si fps < 45)
- Budget frame : update ~3-6ms, render ~3-7ms → 60fps confortable

### Bugs connus résiduels
- Aucun bug critique connu après ce tour

---

## Priorités recommandées pour le prochain tour

### 1. 🎭 Événements rares spontanés (20-30 min)

Déclencher aléatoirement 1-2x par heure des micro-événements visibles :
- Dispute soudaine entre deux entités à forte rancune (FUITE immédiate + badge 💥)
- Moment d'euphorie collective (1 entité passe EUPHORIQUE, contagion aux voisins)
- Retraite solitaire (CONCENTRÉ isolé pendant 30s)

Impact fort sur le sentiment de "vie" de la simulation.

### 2. 🔊 Indicateurs d'activité dans le panneau global (15 min)

Dans la barre de statut (haut), ajouter des compteurs en temps réel :
- Nombre d'entités par état (ex: "3 SOCIAL · 2 EUPHORIQUE · 1 FUITE")
- Nombre de projets actifs
- Heure de jeu (cycle jour/nuit)

### 3. ⚡ Spatial partitioning 4×4 dans `_update` (30-40 min)

Si le rendu commence à dépasser 8ms avec des features ajoutées, implémenter une grille 4×4 pour pré-filtrer les paires dans la boucle d'interactions. Réduction attendue : O(n²) → O(n²/16) dans la plupart des cas.

---

## Contraintes à respecter

- `SAVE_KEY = 'haize_save_v1'` — ne pas changer
- FSM 9 états — ne pas toucher à `_updateState` ni STATE
- `PROJECT_MAX = 3`, 12 entités, `ENTITY_DEFS` — structures immuables
- Ne pas toucher à `Heatmap`
- Pas d'`async` dans la boucle de rendu
- `_activeFriendLinks` structure `{ a, b, score, strength, isClose }` — stable
- `_activeRecruitLinks` structure `{ recruiter, other, aff, dist }` — stable
