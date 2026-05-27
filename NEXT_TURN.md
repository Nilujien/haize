# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 10:43 (analyse pre-tour autonome)_

---

## Analyse de l'état actuel

### ✅ Ce qui fonctionne bien

- **Perf stable** : ~2ms update / ~4ms render, 60 FPS maintenu sur machine de dev
- **CONCENTRE** : durée plancher, isolation sociale, halo bleu — entièrement fonctionnel
- **Liens amitié longue distance** : les amis solides (score ≥ 40) restent liés jusqu'à 1200px
- **Mémoire des zones** (happy/avoid) : decay progressif, biais de déplacement — cohérent
- **Gradient caching** pour halos : saturation, euphorie, concentré, humeur — optimisation correcte
- **Separation of concerns** : `_renderThoughtBubbles` lit `t.x/t.y` mis à jour dans `_update`

### ⚠️ Ce qui mérite attention

- **Lisibilité visuelle de l'état CONCENTRE** : le badge 🎯 flottant disparaît vite (vie 3-4s). Aucun signal _persistant_ sur l'entité. L'état est difficilement identifiable en coup d'œil.
- **Liens d'amitié longue distance** visuellement indistinguables des liens proches — la "distance émotionnelle" n'est pas encodée visuellement.
- **Les entités CONCENTRE n'ont aucun feedback social** quand quelqu'un les dérange : la simulation ne "récompense" pas l'observateur qui remarque l'intrusion.

---

## Bugs / régressions détectés

### Bug mineur — `_renderThoughtBubbles` : double-lecture de position (simulation.js ~l.1180)

Malgré le refactor "render read-only" du tour précédent, `_renderThoughtBubbles` lit encore directement `entity.x` :

```js
// Dans _renderThoughtBubbles — redondant !
let bx = t.x, by;
if (progress < 0.5) {
    const entity = this.entities.find(e => e.id === t.entityId);
    if (entity) { bx = entity.x; }  // ← cette ligne est inutile
}
```

`_update` met déjà à jour `t.x = entity.x` pour progress < 0.5. La re-lecture dans le render est redondante et va à l'encontre du principe posé. Fix trivial : supprimer le bloc `if (progress < 0.5)` dans `_renderThoughtBubbles`.

### Bug mineur — `reset()` : timers orphelins (simulation.js ~l.380)

`sim.reset()` ne réinitialise pas `_friendLinkTimer`, `_heatmapRecordTimer`, `_forgetTimer`. Après un reset, ces timers gardent leur valeur antérieure — peut provoquer un rebuild immédiat ou un oubli retardé lors du premier cycle post-reset. Impact faible mais incohérent.

### Observation — pas de bug mais dette : CONCENTRE sans indicateur persistant

L'état CONCENTRE génère un halo bleu (`_concGrad`) mais celui-ci est un cercle subtil. Il n'y a aucun indicateur visuel clair distinguant CONCENTRE d'ERRANCE rapide. Le point d'état (`#74b9ff`) est 4px — quasi invisible. Ce n'est pas un bug mais une lacune UX.

---

## Perf

- **update** : ~2ms (stable) — boucle O(n²) avec 12 entités = 66 paires, négligeable
- **render** : ~4ms (stable)
- **60 FPS** : maintenu
- **Prochains risques** : aucun immédiat. Si entités > 20, la boucle sociale deviendrait le premier goulot.
- **Gradient cache** : les caches `_satGrad`, `_eupGrad`, `_concGrad`, `_moodGrad` sont bien invalidés. Ne pas toucher.

---

## Priorités recommandées pour le prochain tour

### 1. 🎯 Badge persistant CONCENTRE (priorité haute — visibilité, ~15 lignes)

**Pourquoi** : CONCENTRE est l'état le plus "précieux" cognitivement dans la simulation. Sans indicateur persistant, les observateurs le ratent. Le badge flottant est éphémère ; il faut un signal stable.

**Comment** : Dans `_renderEntity`, après le rendu du halo concentré, ajouter :

```js
// Badge CONCENTRE — icône 🎯 petite, positionnée au-dessus du cercle
if (e.state === STATE.CONCENTRE) {
    const badgeX = e.x;
    const badgeY = e.y - e.radius - 24;
    const pulse = 0.7 + Math.sin(performance.now() * 0.002 + e._noiseOffsetX) * 0.15;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎯', badgeX, badgeY);
    ctx.globalAlpha = 1;
    ctx.restore();
}
```

Ce badge est plus visible que le point d'état et moins intrusif qu'un grand halo. Position : au-dessus du cercle, là où les badges de succès (★N) sont rendus pour les autres états.

**Note** : le badge succès est en bas-gauche (`e.x - r * 0.55, e.y - r - 10`), donc le 🎯 au-dessus (`e.x, e.y - r - 24`) ne crée pas de collision visuelle.

---

### 2. 💛 Opacité réduite pour liens amitié longue distance (priorité moyenne — polish, ~8 lignes)

**Pourquoi** : Un lien d'amitié à 1100px devrait visuellement communiquer "loin" — le même alpha qu'un lien à 200px efface cette information.

**Comment** : Dans `_renderFriendshipLinks`, calculer la distance réelle et moduler l'alpha :

```js
for (const { a, b, score, strength } of this._activeFriendLinks) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const distFactor = dist > 700 ? 0.45 : 1.0;  // ← nouveau
    const alpha = strength * pulse * 0.35 * distFactor;  // ← appliquer
    // ... reste inchangé
}
```

Effet : les amis lointains (dist 700–1200px) apparaissent en pointillés quasi-transparents — la relation est visible mais signale la distance. Les amis proches restent lumineux.

---

### 3. 🤫 Réaction de perturbation CONCENTRE (priorité optionnelle — richesse comportementale, ~20 lignes)

**Pourquoi** : Quand quelqu'un approche une entité CONCENTRE, il ne se passe rien de notable. Ajouter une micro-réaction (pensée 🤫 sur le perturbateur + légère répulsion) rendrait les interactions plus "vivantes" et récompenserait l'observation.

**Comment** : Dans `_update`, dans la boucle d'interaction (après le calcul de `distSq`), ajouter :

```js
// Perturbation d'une entité CONCENTRE
if (other.state === STATE.CONCENTRE && dist < 80) {
    // Légère répulsion sur l'approchant
    const pushFactor = (1 - dist / 80) * 0.06;
    e.vx -= nx2 * pushFactor;
    e.vy -= ny2 * pushFactor;
    // Spawn pensée 🤫 sur e (l'intrus) — throttlé par paire
    const perturbKey = `perturb_${[e.id, other.id].sort().join('-')}`;
    const nowP = performance.now();
    if (!this[perturbKey] || nowP - this[perturbKey] > 5000) {
        this[perturbKey] = nowP;
        this._thoughtBubbles.push({
            entityId: e.id,
            x: e.x, y: e.y, radius: e.radius,
            text: '🤫',
            born: nowP,
            life: 2200,
        });
    }
}
```

**Contrainte** : S'assurer que la répulsion ne s'applique pas si l'entité CONCENTRE est en PROJET (pour ne pas interrompre des projets partagés qui nécessitent proximité).

---

## Fix à inclure (dette technique)

### Fix `_renderThoughtBubbles` — supprimer la double-lecture de position

```js
// AVANT (simulation.js ~l.1180) :
let bx = t.x, by;
if (progress < 0.5) {
    const entity = this.entities.find(e => e.id === t.entityId);
    if (entity) { bx = entity.x; }
}
by = t.y - (t.radius || 22) - 18 - rise;

// APRÈS — propre, utilise t.x/t.y mis à jour dans _update :
const bx = t.x;
const by = t.y - (t.radius || 22) - 18 - rise;
```

### Fix `reset()` — réinitialiser les timers orphelins

Dans `reset()`, ajouter :
```js
this._friendLinkTimer     = 0;
this._heatmapRecordTimer  = 0;
this._forgetTimer         = 0;
```

---

## Contraintes à respecter

- **Ne pas toucher** la LUT heatmap (`_buildLUT`) — bien optimisée, aucun bénéfice à la modifier
- **Ne pas modifier** les seuils de saturation sociale (`socialSaturationThreshold`) — équilibre délicat
- **Ne pas alourdir** la boucle O(n²) des interactions — toute nouvelle logique doit rester O(1) par paire
- **Garder** la séparation `_update` (write) / `_render` (read) — le fix `_renderThoughtBubbles` va dans ce sens
- **Ne pas créer de nouveaux gradients canvas** dans le render principal sans cache — coûteux (~0.3ms/gradient)

---

## Résumé des changements pour le tour (ordre suggéré)

1. Fix `_renderThoughtBubbles` (2 lignes, zéro risque)
2. Fix `reset()` timers orphelins (3 lignes, zéro risque)
3. Badge 🎯 persistant CONCENTRE dans `_renderEntity` (~15 lignes)
4. Opacité liens amitié longue distance dans `_renderFriendshipLinks` (~8 lignes)
5. (Optionnel si budget perf OK) Réaction perturbation CONCENTRE dans `_update` (~20 lignes)

Budget total estimé : ~50 lignes de diff. Impact perf : négligeable.
