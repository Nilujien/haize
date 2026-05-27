# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 11:43 (bilan post-tour autonome)_

---

## Bilan du tour actuel

### ✅ Ce qui a été implémenté

1. **Fix `reset()` — timers orphelins** (3 lignes)
   - `_friendLinkTimer`, `_heatmapRecordTimer`, `_forgetTimer` et `_activeFriendLinks` sont maintenant réinitialisés dans `reset()`.
   - Avant ce fix, un reset pouvait déclencher un rebuild immédiat des liens ou un oubli prématuré.

2. **Fix `_renderThoughtBubbles` — suppression double-read de position** (simplification)
   - La re-lecture de `entity.x` dans le render était redondante (déjà mis à jour dans `_update`).
   - Code nettoyé : `const bx = t.x; const by = ...` — render 100% read-only.

3. **Badge persistant 🎯 pour l'état CONCENTRÉ** (~15 lignes)
   - Icône pulsante au-dessus du cercle (`e.y - r - 24`) visible tant que l'entité est en CONCENTRÉ.
   - Amplitude de pulse : 0.7–0.85, liée à `_noiseOffsetX` (phase unique par entité).
   - Ne crée pas de nouveau gradient — impact perf négligeable (une opération fillText).

4. **Atténuation des liens d'amitié lointains (>700px)** (~5 lignes dans `_renderFriendshipLinks`)
   - `distFactor = linkDist > 700 ? 0.45 : 1.0` appliqué au alpha.
   - Résultat : les amis séparés par >700px apparaissent en pointillés quasi-transparents, encodant visuellement la distance émotionnelle.

### 🚫 Ce qui a été laissé de côté

- **Réaction de perturbation CONCENTRÉ** (item optionnel du plan) — budget temps épuisé pour ce tour. À reprendre en priorité si comportement CONCENTRÉ manque encore de "vie".

---

## État de la simulation

- **Perf** : stable (~2ms update / ~4ms render) — les 4 changements n'ont aucun impact mesurable sur le budget frame.
- **60 FPS** : maintenu, pas touché.
- **Code** : propre, commenté, séparation update/render respectée.

---

## Priorités recommandées pour le prochain tour

### 1. 🤫 Réaction de perturbation CONCENTRÉ (priorité haute — richesse comportementale, ~20 lignes)

**Pourquoi** : C'était optionnel dans ce tour mais le plan le suggérait. Maintenant que le badge 🎯 rend CONCENTRÉ visible, il manque encore le feedback comportemental quand quelqu'un s'approche.

**Comment** : Dans `_update`, dans la boucle d'interaction (après le calcul de `distSq`), ajouter :

```js
// Perturbation d'une entité CONCENTRÉ
if (other.state === STATE.CONCENTRE && dist < 80 && other.state !== STATE.PROJET) {
    const pushFactor = (1 - dist / 80) * 0.06;
    e.vx -= nx2 * pushFactor;
    e.vy -= ny2 * pushFactor;
    const perturbKey = `perturb_${[e.id, other.id].sort().join('-')}`;
    const nowP = performance.now();
    if (!this[perturbKey] || nowP - this[perturbKey] > 5000) {
        this[perturbKey] = nowP;
        this._thoughtBubbles.push({
            entityId: e.id, x: e.x, y: e.y, radius: e.radius,
            text: '🤫', born: nowP, life: 2200,
        });
    }
}
```

### 2. 💛 Score de relation visible dans la sidebar (priorité moyenne — polish UX, ~10 lignes)

**Pourquoi** : Les liens d'amitié longue distance sont maintenant atténués, mais l'observateur n'a pas de moyen simple de voir qui est "vraiment ami" vs "ami lointain". Ajouter une icône dans la sidebar (`★` ou `💛`) pour les entités dont le score mutuel dépasse 40 serait utile.

**Comment** : Dans `_updatePanel`, dans la boucle des entités, vérifier `interactionLog` croisé avec la liste des entités de `_activeFriendLinks` pour badge.

### 3. 🌍 Événements globaux : réduction de la fréquence (observation de perf)

**Observation** : `_nextEventIn` est entre 20–40s. Sur une longue session, ça génère beaucoup d'overlays. Augmenter légèrement la valeur minimale à 35s (`35000 + Math.random() * 25000`) rendrait les événements plus "spéciaux".

---

## Contraintes à respecter

- **Ne pas toucher** la LUT heatmap (`_buildLUT`)
- **Ne pas modifier** les seuils de saturation sociale
- **Ne pas créer de nouveaux gradients** sans cache dans le render principal
- **Garder** la séparation `_update` (write) / `_render` (read)
- **60 FPS** non négociable — tout nouvel ajout : impact render < 0.5ms
