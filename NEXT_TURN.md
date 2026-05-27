# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 11:47 (analyse pré-tour autonome)_

---

## Analyse de l'état actuel

### ✅ Ce qui fonctionne bien

- Moteur physique complet (Perlin, friction, bounce, territoire)
- Machine à états robuste avec 9 états, planchers de durée, caps euphorique
- Projets, heatmap (LUT optimisée), cycle jour/nuit
- Liens d'amitié persistants avec atténuation distance (livraison tour précédent)
- Badge 🎯 CONCENTRÉ pulsant (livraison tour précédent)
- Fix timers orphelins au reset (livraison tour précédent)
- Perf très saine : ~2ms update / ~4ms render — budget restant ~10ms

### ❌ Ce qui pose problème / dettes techniques

1. **Liens d'amitié absents au contact rapproché** *(bug de logique)*
   - `simulation.js`, cache `_activeFriendLinks` ligne ~690 :
     `if (distSq < interactRadSqFL) continue;`
   - Cette condition **exclut les amis qui se trouvent proches** (< 180px). Résultat : deux meilleurs amis côte à côte n'ont ni trait doré ni cœur 💛. Ironique.
   - Impact visuel : pas critique, mais incohérent avec l'intention.

2. **`perturbKey` polluait l'objet Simulation** *(dette du plan précédent)*
   - Le pseudo-code recommandé en NEXT_TURN utilisait `this[perturbKey]` avec des clés dynamiques sur l'instance Simulation. C'est une fuite de propriétés sur l'objet.
   - À corriger : utiliser une `Map` dédiée `this._concentrePerturbTimers`.

3. **EPIDEMIE : `_initialized` et `_patientZero` sur l'objet littéral de l'événement**
   - État inter-sessions stocké sur l'objet EVENT constant (risque de persistance entre deux déclenchements si `reset()` n'est pas appelé — or `triggerEvent` l'appelle, donc c'est OK). Pas un bug actif, mais fragile.

4. **Perturbation CONCENTRÉ : non implémentée**
   - Prévu au plan précédent, non réalisé faute de temps. Entités CONCENTRÉ ne réagissent pas aux intrusions → comportement passif/plat.

---

## Bugs / régressions détectés

| Fichier | Ligne approx. | Description | Sévérité |
|---|---|---|---|
| `simulation.js` | ~690 | Liens amitié sautés si dist < INTERACTION_RADIUS | Faible (cosmétique) |
| `simulation.js` | plan préc. | Recommandation `this[perturbKey]` → pollution objet | Faible (dette) |

---

## Perf

- **Budget frame actuel** : ~6ms total (update 2ms + render 4ms). Headroom : ~10ms.
- **Bottleneck principal** : `heatmap._render()` sur dirty frame (ImageData fill ~2M pixel ops par flush). Mais le flag `_dirty` limite ça à ~1–2 flush/sec en pratique → pas de problème.
- **Render dominé par** : gradients multiples par entité (mood, sat, euph, conc) × 12 entités. Caches en place, pas de régression visible.
- **`_updatePanel()`** : innerHTML complet toutes les 200ms sur 12 entités = ~1200 DOM nodes recréés. Acceptable mais c'est la prochaine cible d'optimisation si le panel devient plus riche.
- **Tout ajout au prochain tour doit coûter < 0.5ms render.**

---

## Priorités recommandées pour le prochain tour

### 1. 🤫 Perturbation CONCENTRÉ par intrusion (priorité HAUTE — richesse comportementale, ~25 lignes)

**Pourquoi** : CONCENTRÉ est visible (badge 🎯, halo bleu, vitesse réduite) mais **passif** — aucun retour comportemental quand une entité s'approche. L'implémenter complèterait le cycle signal/réaction pour cet état.

**Comment** :

Dans `_update`, après la boucle d'interaction (juste avant le bloc `{const affinity = ...}`), ajouter la logique de perturbation. Utiliser une Map dédiée pour éviter de polluer `this` :

```js
// Dans constructor() : this._concentrePerturbTimers = new Map();

// Dans _update(), dans la boucle `for (const other of entities)`,
// après le bloc `if (distSq >= _interactRadSq) continue;` :

if (other.state === STATE.CONCENTRE && dist < 75 && e.state !== STATE.PROJET) {
  const perturbKey = [e.id, other.id].sort().join('-');
  const nowP = performance.now();
  const lastPerturb = this._concentrePerturbTimers.get(perturbKey) || 0;

  // Légère répulsion sur l'entité qui disturbe (CONCENTRÉ repousse)
  const pushFactor = (1 - dist / 75) * 0.05;
  e.vx -= nx2 * pushFactor;
  e.vy -= ny2 * pushFactor;

  // Bulle de pensée 🤫 throttlée à 5s par paire
  if (nowP - lastPerturb > 5000) {
    this._concentrePerturbTimers.set(perturbKey, nowP);
    this._thoughtBubbles.push({
      entityId: other.id,
      x: other.x, y: other.y, radius: other.radius,
      text: '🤫',
      born: nowP, life: 2200,
    });
  }
}
```

**Reset** : Ajouter `this._concentrePerturbTimers = new Map();` dans `reset()`.

**Coût perf** : une `Map.get` + `Map.set` par paire dans le rayon 75px → négligeable.

---

### 2. 🌟 Événement CONTAGION D'EUPHORIE (priorité MOYENNE — symétrie narrative, ~30 lignes)

**Pourquoi** : EPIDEMIE propage la déprime. Il manque le pendant positif : une vague d'euphorie collective qui se propage par contact. Ça rééquilibre le registre émotionnel de la simulation (trop souvent morose).

**Comment** : Ajouter un 6ème événement global `EUPHORIE_CONTAGIEUSE` dans `GLOBAL_EVENTS` :

```js
{
  type: 'EUPHORIE',
  label: '🌈 Euphorie Contagieuse',
  color: '#ffd700',
  duration: 18000,
  description: 'Un sourire se propage — l\'euphorie gagne tout le monde',
  _initialized: false,
  _sourceEntity: null,
  apply(entities, dt) {
    if (!this._initialized) {
      this._initialized = true;
      // Source : entité la plus heureuse (ou aléatoire)
      this._sourceEntity = entities.reduce((best, e) =>
        e.mood > best.mood ? e : best, entities[0]);
      this._sourceEntity.mood = 1.0;
    }
    // Propagation inverse de l'épidémie : tire vers la humeur la plus haute
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i], b = entities[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < 100) {
          const spreadRate = 0.0003 * dt * (1 - dist / 100);
          if (a.mood > b.mood) {
            b.mood = Math.min(1, b.mood + spreadRate * Math.abs(a.mood - b.mood));
          } else {
            a.mood = Math.min(1, a.mood + spreadRate * Math.abs(b.mood - a.mood));
          }
        }
      }
    }
  },
  reset() { this._initialized = false; this._sourceEntity = null; },
},
```

Ajouter le bouton dans `index.html` (après `btn-ev-epidemie`) :
```html
<button class="ctrl-btn ctrl-btn--event" id="btn-ev-euphorie" title="Déclencher Euphorie Contagieuse">🌈</button>
```

Et dans le script : `document.getElementById('btn-ev-euphorie').addEventListener('click', () => sim.triggerEvent('EUPHORIE'));`

**Coût perf** : identique à EPIDEMIE (O(n²) mais uniquement pendant l'événement, 18s).

---

### 3. 🔧 Fix : liens d'amitié visibles au contact rapproché (priorité BASSE — bug cosmétique, ~3 lignes)

**Pourquoi** : Deux meilleurs amis côte à côte devraient afficher le cœur 💛, pas le masquer.

**Comment** : Dans `_renderFriendshipLinks`, le cache filtre déjà les proches. Ajouter une passe séparée pour les amis forts (score ≥ 40) proches, qui dessine juste le cœur sans le trait :

```js
// Après la boucle principale de _renderFriendshipLinks :
for (const e of this.entities) {
  for (const other of this.entities) {
    if (e.id >= other.id) continue;
    const score = ((e.interactionLog[other.id] || 0) + (other.interactionLog[e.id] || 0)) / 2;
    if (score < 40) continue;
    const dist = Math.hypot(e.x - other.x, e.y - other.y);
    if (dist > this.INTERACTION_RADIUS) continue; // déjà géré par le cache
    const midX = (e.x + other.x) / 2, midY = (e.y + other.y) / 2;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.5 + Math.sin(performance.now() * 0.0015) * 0.2;
    ctx.fillText('💛', midX, midY);
    ctx.globalAlpha = 1;
  }
}
```

**Coût perf** : O(n²) mais seulement pour les paires avec score ≥ 40 (rare en début de session). Negligeable.

---

## Contraintes à respecter

- **Ne pas toucher** la LUT heatmap (`_buildLUT`) — perf critique
- **Ne pas modifier** les seuils de saturation sociale (`socialSaturationThreshold`)
- **Ne pas créer de nouveaux gradients** sans cache dans `_renderEntity`
- **Garder** la séparation stricte `_update` (write) / `_render` (read)
- **60 FPS non négociable** — mesurer avec les badges perf avant commit
- **`reset()`** : tout nouvel état Simulation doit y être réinitialisé
- **Ne pas utiliser `this[dynamicKey]`** pour stocker des timers — préférer des Maps dédiées

---

## Code à écrire (récapitulatif des extraits)

Le tour prochain devrait :

1. Ajouter `this._concentrePerturbTimers = new Map()` dans `constructor` et `reset()`
2. Insérer le bloc perturbation CONCENTRÉ dans `_update` (dans la boucle `for (const other of entities)`)
3. Ajouter l'objet `EUPHORIE_CONTAGIEUSE` dans le tableau `GLOBAL_EVENTS`
4. Ajouter le bouton `btn-ev-euphorie` dans `index.html` et le connecter
5. (Optionnel) Ajouter la passe cœur proche dans `_renderFriendshipLinks`

**Ordre recommandé** : 1→2 (atomique), puis 3→4 (atomique), puis 5 (optionnel si budget).
