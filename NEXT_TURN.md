# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 15:03 (analyse pré-tour autonome)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- Architecture solide, aucune régression visible depuis le tour précédent
- Système rancune (`_conflictCount` + malus affinité) bien intégré dans la physique et le rendu
- `_projectHistory` + bonus expérience en place et fonctionnel
- Fix recrutement PROJET (projet le plus proche) correct
- Budget perf confortable : update ~3-5ms, render ~5-8ms → marge ~8ms sur 60fps
- Heatmap offscreen + LUT très efficace
- Cache liens d'amitié rebuild 5×/s : bon pattern
- FSM des états bien structurée, transitions propres

### Observations générales
Le code est propre et bien commenté. Le tour précédent a consolidé la profondeur comportementale (rancune, expérience, recrutement ciblé). Il reste 3 petites dettes techniques triviales à solder, et une feature comportementale intéressante à explorer.

---

## Bugs / régressions détectés

### B1 — `_conflictCount` non persisté (simulation.js : méthodes `save()` / `load()`)
**Impact : moyen.** Les rancunes disparaissent au rechargement. Le snapshot sauvegarde `interactionLog`, `_projectHistory`, `happyZones`, etc. mais oublie `_conflictCount`.
```js
// Dans save() → ajouter dans snapshot :
conflictCount: { ...this._conflictCount },

// Dans load() → restaurer après la boucle entities :
if (snap.conflictCount) this._conflictCount = { ...snap.conflictCount };
```
Aucun risque de migration (SAVE_KEY inchangé, le champ est optionnel à la lecture).

### B2 — `_panelStateHash` inclut le flag selectedEntity (simulation.js ~ligne 1764)
**Impact : mineur mais récurrent.** À chaque clic sur une entité, le DOM du panel info est entièrement rebuilé même si les stats n'ont pas changé. Le panneau inspect est rendu sur Canvas — le DOM rebuild est inutile dans ce cas.
```js
// Ligne actuelle :
`${e.id}:${e.state}:${Math.round(e.mood * 10)}:${Math.round(e.energy)}:${e === this.selectedEntity ? 1 : 0}`
// Corriger en supprimant le dernier fragment :
`${e.id}:${e.state}:${Math.round(e.mood * 10)}:${Math.round(e.energy)}`
```

### B3 — Mutation d'objet dans le `.reduce()` de recrutement (simulation.js ~ligne 885)
**Impact : faible mais code smell.** `p._rdist = d` modifie l'objet `Project` en cours de reduce. Aucun bug visible à 12 entités, mais c'est fragile.
```js
// Remplacer par :
const proj = (() => {
  let closest = null, closestDist = Infinity;
  for (const p of this.projects) {
    if (p.resolved || p.isExpired) continue;
    const d = Math.hypot(p.x - recruiter.x, p.y - recruiter.y);
    if (d < p.radius && d < closestDist) { closest = p; closestDist = d; }
  }
  return closest;
})();
```

---

## Perf

- **Update budget estimé :** ~3-5ms (O(n²) = 66 paires, toutes opérations légères)
- **Render budget estimé :** ~5-8ms (12 gradients cachés, offscreen heatmap, 66 lignes connexion)
- **Total frame :** ~10-13ms → ~4-7ms de marge avant d'atteindre 16.7ms (60fps)
- **Pas de bottleneck critique** dans l'état actuel
- Seul point à surveiller : `_renderFriendshipLinks` contient une double boucle O(n²) _supplémentaire_ pour les "amis rapprochés" (la passe cœurs côte à côte), non couverte par le cache. Pour n=12 c'est 66 paires, négligeable — mais à ne pas dupliquer si on ajoute des features de rendu.

---

## Priorités recommandées pour le prochain tour

### P1 — Badge expérience dans le panneau inspect (entities.js display + simulation.js `_renderInspectPanel`)
**Impact visuel fort, effort minimal (~20 lignes), 0 risque.**
Les entités vétéranes ont un `_projectHistory` rempli depuis 2 tours — il est invisible. Afficher un badge `⭐TYPE (×N)` dans la section CARACTÈRE ou CONTACTS du panneau inspect récompense visuellement la profondeur comportementale déjà implémentée.

Implémentation :
```js
// Dans _renderInspectPanel, après la section CARACTÈRE :
const expEntries = Object.entries(e._projectHistory || {})
  .filter(([, count]) => count >= 2)
  .sort((a, b) => b[1] - a[1]);
if (expEntries.length > 0) {
  drawSep();
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('EXPÉRIENCE', X, cy);
  cy += 11 + SECTION_GAP;
  for (const [type, count] of expEntries) {
    ctx.font = '9px monospace';
    ctx.fillStyle = count >= 5 ? '#ffd700' : 'rgba(255,255,255,0.55)';
    ctx.fillText(`⭐ ${type} ×${count}`, X, cy + 1);
    cy += LINE_H;
  }
}
// ⚠️ Penser à ajouter la hauteur de cette section dans le calcul de PH en haut de la fonction
```

### P2 — Fixes B1 + B2 + B3 (corrections techniques rapides)
**Impact : cohérence + perf marginale. Effort : ~15 lignes total. 0 risque.**
- Persister `_conflictCount` (B1) : 2 lignes dans `save()`, 1 ligne dans `load()`
- Fix stateHash (B2) : 1 ligne dans `_updatePanel`
- Fix mutation reduce (B3) : remplacer ~5 lignes

Ces 3 corrections peuvent être groupées dans un seul commit propre.

### P3 — CONCENTRE contextuel pour introvertis saturés (simulation.js `_updateState`)
**Impact comportemental notable. Effort : ~15 lignes. Risque : modéré (FSM), tester soigneusement.**

Actuellement CONCENTRE n'est accessible que si `energy < 20`. Les introvertis (extraversion < 0.3) devraient pouvoir entrer en CONCENTRE après une longue surcharge sociale même avec de l'énergie, comme une retraite volontaire.

Condition proposée :
```js
// Dans _updateState, avant le bloc energy < 20 :
const isIntrovert = e.character.extraversion < 0.3;
const sociallyOverloaded = e.socialCharge > e.socialSaturationThreshold * 0.85;
const socialLoadedLong = (e._socialLoadTimer || 0) > 25000; // 25s de charge haute
if (isIntrovert && sociallyOverloaded && socialLoadedLong && e.state !== STATE.SATURE && e.state !== STATE.PROJET) {
  newState = STATE.CONCENTRE;
}
// Dans _update, mettre à jour _socialLoadTimer :
e._socialLoadTimer = e.socialCharge > e.socialSaturationThreshold * 0.7
  ? (e._socialLoadTimer || 0) + dt
  : Math.max(0, (e._socialLoadTimer || 0) - dt * 2);
```
⚠️ Vérifier que CONCENTRE ne bloque pas SATURE (SATURE doit rester prioritaire → vérifier l'ordre des conditions dans `_updateState`). Le plancher `_concentreMinDuration` déjà en place protège contre les oscillations.

---

## Contraintes à respecter

- **Ne pas changer SAVE_KEY** — sauf si migration nécessaire (ce n'est pas le cas ici, les nouveaux champs sont optionnels)
- **Ne pas refactorer la FSM globalement** — modifier `_updateState` chirurgicalement seulement
- **PROJECT_MAX = 3, ENTITY_DEFS, AFFINITES** — inchangés
- **Ne pas toucher à la Heatmap** — fonctionnelle et optimisée, rien à gagner
- **Calcul PH dans `_renderInspectPanel`** — si on ajoute une section, mettre à jour le calcul de hauteur totale (en haut de la fonction, ~ligne 1620) sinon le fond du panneau sera trop court

---

## Code à écrire (ébauche principale — P1)

```js
// simulation.js — _renderInspectPanel
// Après la section CARACTÈRE (après les 2 lignes de traits), avant drawSep() CONTACTS :

const expEntries = Object.entries(e._projectHistory || {})
  .filter(([, count]) => count >= 2)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3); // max 3 types affichés

if (expEntries.length > 0) {
  drawSep();
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('EXPÉRIENCE', X, cy);
  cy += 11 + SECTION_GAP;

  for (const [type, count] of expEntries) {
    const isVet = count >= 5;
    ctx.font = '9px monospace';
    ctx.fillStyle = isVet ? '#ffd700' : 'rgba(255,200,100,0.65)';
    const stars = isVet ? '⭐⭐' : '⭐';
    ctx.fillText(`${stars} ${type} ×${count}`, X, cy + 1);
    cy += LINE_H;
  }
}

// Et dans le calcul de PH initial (ligne ~1630), ajouter :
// + (expEntries.length > 0 ? SEP_H * 2 + 11 + SECTION_GAP + expEntries.length * LINE_H : 0)
// Note : calculer expEntries AVANT le bloc de calcul PH (le sortir en variable locale en début de fonction)
```

---

## Ordre d'implémentation recommandé

1. Calculer `expEntries` en tête de `_renderInspectPanel` (variable locale réutilisée dans PH + rendu)
2. Mettre à jour le calcul `PH`
3. Ajouter la section rendu entre CARACTÈRE et CONTACTS
4. Appliquer B1 (save/load `_conflictCount`)
5. Appliquer B2 (stateHash sans selectedEntity)
6. Appliquer B3 (fix mutation reduce)
7. Si budget temps OK : implémenter P3 (CONCENTRE contextuel)
