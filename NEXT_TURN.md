# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 12:50 (analyse pré-tour autonome)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien

- Architecture `_update` (write) / `_render` (read) bien tenue, zéro confusion
- Les 3 features du tour précédent sont proprement intégrées :
  - Perturbation CONCENTRÉ 🤫 (Map dédiée, throttlée, réinitialisée au reset)
  - Euphorie contagieuse 🌈 (symétrique à ÉPIDÉMIE, bouton ajouté)
  - Fix liens d'amitié au contact rapproché 💛 (passe dédiée dans `_renderFriendshipLinks`)
- Cache de liens d'amitié (`_activeFriendLinks`) efficace, rebuild 5×/s uniquement
- Caches gradients canvas (halos mood/euphorique/concentré/saturation) bien invalidés
- Territoires, zones heureuses/évitées, oubli progressif : mécanique solide
- Support tactile mobile présent et correct
- LUT heatmap précalculée : rendu perf-optimisé

### Ce qui pose légèrement problème

- `_updatePanel()` reconstruit l'intégralité du `innerHTML` toutes les 200ms → ~1200 nodes recréés à blanc. Pas de lag visible pour l'instant mais dette réelle.
- La passe "ami proche" dans `_renderFriendshipLinks` tourne **chaque frame sans throttle** (O(n²) sur 66 paires). Léger mais gratuit.
- Les projets n'exercent aucune attraction "sociale" sur les entités affinitaires. Un projet CONSTRUCTION n'attire que par `e.character.extraversion` — pas de logique de recrutement entre entités proches qui se font confiance.
- Aucune mémoire des conflits répétés : deux entités peuvent se bagarrer 50 fois sans que ça laisse de trace narrative visible.

---

## Bugs / régressions détectés

| # | Fichier | Ligne approx. | Description | Sévérité |
|---|---------|---------------|-------------|----------|
| 1 | `simulation.js` | ~221 | `EPIDEMIE._initialized` / `_patientZero` mutés sur l'objet constant `GLOBAL_EVENTS` (fragile si jamais deux événements tournent en parallèle — non possible aujourd'hui mais ticking bomb) | Faible |
| 2 | `simulation.js` | `_renderFriendshipLinks` bottom | Passe O(n²) non throttlée dans `_render` pour les paires proches score ≥ 40. Pas de cache, recalcul chaque frame. | Très faible |
| 3 | `simulation.js` | `_updatePanel` | `innerHTML` complet toutes les 200ms. ~1200 nodes DOM recréés. Pas de lag visible mais inefficace. | Faible |
| 4 | `simulation.js` | `_updateState` | Transitions EUPHORIQUE → ERRANCE (via cap durée) ne passent PAS par le `stateLabels` log — la sortie de l'euphorie n'est pas loggée dans la console. Cosmétique. | Cosmétique |

Aucune régression depuis le tour précédent. Tous les anciens comportements restent intacts.

---

## Perf

Budget frame estimé (canvas 1920×1080, 12 entités) :
- `_update` : ~3-5ms (O(n²) × 3 passes : voisins, interactions, friendLinks rebuild)
- `_render` : ~3-6ms (gradients LRU, heatmap ImageData 1×/dirty, trails, halos)
- `_updatePanel` : ~0.5ms toutes les 200ms (innerHTML brut, pas sur le chemin critique)
- `_renderFriendshipLinks` bottom pass : ~0.1ms/frame (66 paires, conditions légères)
- **Marge disponible** : large. Budget 16.67ms non approché en conditions normales.

---

## Priorités recommandées pour le prochain tour

### 1. PROJET enrichi — recrutement implicite par affinité 🎯 *(fort impact narratif)*

**Pourquoi :** Les entités en PROJET sont actuellement des îlots isolés. Aucune dynamique sociale autour du travail. Rendre les projets magnétiques pour les alliés naturels créerait des clusters visuels lisibles et crédibles.

**Comment l'implémenter :**
- Dans `_update`, pour chaque entité `e` en `STATE.PROJET` :
  - Parcourir les autres entités `other` à distance < `proj.radius * 4`
  - Si `e.getAffinityWith(other.id) >= 0.5` ET `other.state` pas SATURE/FUITE/PROJET :
    - Appliquer une faible force d'attraction vers le projet sur `other` (0.02 × affinité)
    - Spawn occasionnel d'emoji `📡` au milieu (throttlé ~1/5s par paire)
- Dans `_render`, ajouter une passe visuelle "signal recrutement" :
  - Pour chaque lien projet-recrutement actif : trait pointillé doré, 2px, opacité 0.25
  - Uniquement si entité source est visible à l'écran (toujours vrai ici)

**Coût perf :** O(n × participants_projet) soit ≤ 36 paires. Négligeable.

**Risque :** Faible. Attention à ne pas sur-recruter (cap à 4 recrutés simultanés par projet max).

---

### 2. Mémoire de rancune entre entités ❄️ *(profondeur narrative, coût minimal)*

**Pourquoi :** Deux entités très agressives peuvent se bagarrer sans cesse sans que ça laisse de trace. Ajouter une mémoire de conflits répétés rend les relations plus riches et lisibles.

**Comment l'implémenter :**
- Dans `Simulation` : ajouter `this._conflictCount = {}` (Map clé `"A-B"` → nb conflits)
  - Reset dans `reset()`
- Dans `_update`, dans la branche "conflit agressif" (distSq < CONFLICT_RADIUS²) :
  - Incrémenter `_conflictCount[ck]` avec throttle 1/3s (utiliser `_lastConflictLog` existant)
- Dans `_renderFriendshipLinks` ou dans `_renderEntity` :
  - Si `_conflictCount[ck] >= 3` et score d'interaction >= 5 :
    - Afficher ❄️ entre les deux entités (au lieu de ou en plus du trait neutre)
    - Trait rouge-brun pulsant entre elles si à portée
- **Optionnel** : dans `getAffinityWith`, si conflit count >= 5, malus de -0.2 sur l'affinité dynamique

**Coût perf :** Map.get/set dans la boucle d'interaction — négligeable (déjà throttlé).

---

### 3. Optimisation `_updatePanel` DOM *(hygiène, gain CPU silencieux)*

**Pourquoi :** Reconstruction de 1200+ nodes toutes les 200ms. Facile à corriger, gain CPU modeste mais propre.

**Comment l'implémenter :**
- Générer le HTML une seule fois au démarrage (structure fixe des `.entity-row`)
- Sur chaque tick (200ms), ne mettre à jour que les `textContent` / `style.color` des spans déjà en place via `querySelectorAll('[data-id]')` + `dataset.id`
- Alternative plus simple : conserver le `innerHTML` actuel mais ne rebuilder QUE si un état a changé depuis le dernier tick (comparer un hash état+mood+energy rapide)

**Coût perf :** Suppression de ~1200 allocations DOM toutes les 200ms.

---

## Contraintes à respecter

- **Ne pas toucher** la LUT heatmap (parfaite, aucune raison)
- **Ne pas modifier** les seuils de saturation sociale (`socialSaturationThreshold`)
- **Garder** la séparation stricte `_update` (write) / `_render` (read-only canvas)
- **60 FPS non négociable** — tester avec le slider speed × 4
- Tout nouvel état Simulation → le réinitialiser dans `reset()`
- Ne pas introduire de nouveaux états dans `STATE` sans aussi ajouter les CSS `.state-xxx` dans `style.css`
- Le cap de recrutement PROJET (priorité 1) : max 4 entités recrutées simultanément par projet actif

---

## Code à écrire (ébauche priorité 1 — recrutement PROJET)

### Dans `_update`, après la boucle "attraction vers les projets" (~ligne 490) :

```js
// ── Recrutement PROJET : entités affinitaires attirées par leurs alliés en projet ──
for (const e of entities) {
  if (e.state !== STATE.PROJET) continue;
  const proj = this.projects.find(p =>
    !p.resolved && !p.isExpired && Math.hypot(p.x - e.x, p.y - e.y) < p.radius
  );
  if (!proj) continue;

  let recruitCount = 0;
  for (const other of entities) {
    if (other === e) continue;
    if (other.state === STATE.SATURE || other.state === STATE.FUITE || other.state === STATE.PROJET) continue;
    if (recruitCount >= 4) break;

    const aff = e.getAffinityWith(other.id);
    if (aff < 0.5) continue;

    const dx = proj.x - other.x, dy = proj.y - other.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > proj.radius * 4) continue;

    const pull = aff * 0.018 * (1 - dist / (proj.radius * 4));
    other.vx += (dx / dist) * pull;
    other.vy += (dy / dist) * pull;
    recruitCount++;

    // Signal visuel : emoji 📡 throttlé
    const rKey = `recruit-${e.id}-${other.id}`;
    const nowR = performance.now();
    if (!this._recruitTimers) this._recruitTimers = {};
    if (!this._recruitTimers[rKey] || nowR - this._recruitTimers[rKey] > 5000) {
      this._recruitTimers[rKey] = nowR;
      this._spawnFloatingEmoji((e.x + other.x) / 2, (e.y + other.y) / 2 - 10, '📡');
    }
  }
}
```

**→ Ajouter `this._recruitTimers = {}` dans le constructeur ET dans `reset()`.**

### Dans `_render`, dans `_renderFriendshipLinks` ou dans un `_renderRecruitLinks` dédié :

```js
// Trait recrutement : si entité en PROJET avec affinité ≥ 0.5 vers autre entité proche
for (const e of this.entities) {
  if (e.state !== STATE.PROJET) continue;
  for (const other of this.entities) {
    if (other === e) continue;
    if (other.state === STATE.PROJET) continue;
    const aff = e.getAffinityWith(other.id);
    if (aff < 0.5) continue;
    const dist = Math.hypot(other.x - e.x, other.y - e.y);
    if (dist > 300) continue;
    const alpha = aff * 0.22 * (1 - dist / 300);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(other.x, other.y);
    ctx.strokeStyle = `rgba(255,215,0,${alpha.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
```

---

## Notes de timing

- Tour précédent : 3 priorités livrées intégralement. Budget bien géré.
- Ce tour : priorité 1 est la plus dense (deux zones de code + reset). Priorité 2 est quasi-triviale. Priorité 3 peut être optionnelle si budget serré.
- Ordre suggéré : 1 → 2 → 3 (si énergie restante).
