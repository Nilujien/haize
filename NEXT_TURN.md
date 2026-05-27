# HAIZE — Plan du prochain tour
_Rédigé le : 27/05/2026 16:07 (analyse pré-tour autonome)_

---

## Analyse de l'état actuel

### Ce qui fonctionne bien
- FSM à 9 états entièrement fonctionnelle, transitions fluides
- P3 (CONCENTRE contextuel introvertis) intégré et stable
- Expérience projet (badge ⭐ dans inspect panel) lisible
- Persistance rancune + decay jour/nuit cohérente
- Heatmap LUT precalc + dirty flag : pas de bottleneck visible
- Mémoire des lieux heureux / évités + biais de déplacement
- `_panelStateHash` : DOM rebuild minimal
- Console événements avec `onConsoleDirty` : pas de polling inutile

### Ce qui pose problème
1. **`_socialLoadTimer` n'est pas reset à l'entrée dans CONCENTRE** via P3 — risque d'oscillation entrée/sortie immédiate si les conditions restent vraies.
2. **CONCENTRE via P3 et via épuisement émettent le même emoji `🎯`** — les deux chemins narratifs sont indiscernables visuellement.
3. **`_conflictCount` est persisté mais invisible dans l'UI** — la section RANCŒURS manque dans le panneau inspect, alors que la donnée est là et significative.
4. **`_socialLoadTimer` non sauvegardé** — rebuild en 25s, risque faible mais incohérence avec la philosophie B1 déjà appliquée.
5. **`_euphoriqueDuration/_Cap` et `_concentreDuration/_MinDuration` non sauvegardés** — au load, l'entité repart de zéro sur ces timers. Impact : possible court-circuit du plancher CONCENTRE juste après un load. Faible mais réel.

---

## Bugs / régressions détectés

| # | Fichier | Ligne approx | Description |
|---|---------|-------------|-------------|
| B1 | `simulation.js` | `_updateState` bloc `P3` | `_socialLoadTimer` non remis à 0 lors de la transition → CONCENTRE via P3. Si l'entité sort rapidement (mood change, projet), les conditions P3 sont immédiatement re-remplies. Fix : `e._socialLoadTimer = 0` à l'entrée newState === CONCENTRE. |
| B2 | `simulation.js` | `_updateState` stateEmojis | L'emoji `🎯` est émis pour les deux chemins CONCENTRE (énergie < 20 ET P3 retraite introvertie). Pas un bug dur, mais confusion narrative. |
| B3 | `simulation.js` | `save()` | `_socialLoadTimer` absent du snapshot → rebuild de 25s au load. Cohérence manquante. |

---

## Perf

Budget frame estimé inchangé :
- `_update` : ~3–6ms (dominant : boucle O(n²) interactions, 12 entités, 66 paires)
- `_render` : ~4–8ms (dominant : heatmap dirty + liaison liens)

**Point d'attention** : `Heatmap.render()` en mode dirty fait ~2M itérations pixel (96×54 cells × 400px) via double boucle `for py/px`. Avec le flag `_dirty` et la throttle d'enregistrement (100ms), ça reste acceptable. À surveiller si le canvas monte > 1440p ou si le CELL descend < 20px.

**Pas de skip de render recommandé** : l'adaptive skip 1 frame/2 si update > 8ms est déjà en place et sain.

---

## Priorités recommandées pour le prochain tour

### 1. B1 — Fix `_socialLoadTimer` reset à l'entrée CONCENTRE (P3)
**Pourquoi** : bug de comportement. Une entité introvertie saturée peut sortir de CONCENTRE en quelques secondes et y re-rentrer en boucle si le timer reste élevé.

**Comment** :
Dans `_updateState`, au bloc `if (newState !== e.state)` → `if (newState === STATE.CONCENTRE)` :
```js
// Déjà présent :
e._concentreDuration = 0;
e._concentreMinDuration = 4000 + Math.random() * 3000;
// AJOUTER :
e._socialLoadTimer = 0;  // évite ré-entrée immédiate via P3
```

### 2. C — Section RANCŒURS dans le panneau inspect
**Pourquoi** : `_conflictCount` est persisté depuis le tour précédent mais complètement invisible. C'est la donnée narrative la plus riche (rancunes entre entités) et elle est muette. Fort impact sur la lisibilité des histoires émergentes.

**Comment** :
Dans `_renderInspectPanel`, après la section CONTACTS, ajouter une section RANCŒURS conditionnelle :
- Lire `this._conflictCount` et filtrer les paires impliquant `e.id`
- Trier par count décroissant, afficher max 3 entrées
- Format : `❄️ ID ×N` (rouge si count ≥ 5, orange sinon)
- Mettre à jour `PH` en conséquence (ajouter `rancorEntries.length > 0 ? 11 + SECTION_GAP + rancorEntries.length * LINE_H + SEP_H * 2 : 0`)

```js
// Pré-calcul avant PH :
const rancorEntries = Object.entries(this._conflictCount)
  .filter(([ck]) => ck.includes(e.id))
  .map(([ck, count]) => {
    const otherId = ck.split('-').find(id => id !== e.id);
    return { otherId, count };
  })
  .filter(x => x.count >= 2)
  .sort((a, b) => b.count - a.count)
  .slice(0, 3);
```

### 3. D — Emoji distinctif pour CONCENTRE via P3 (retraite introvertie)
**Pourquoi** : deux chemins narratifs très différents (épuisement physique vs retraite sociale volontaire) émettent le même signal visuel `🎯`. Un introvert qui se retire pour récupérer mérite `🧘` plutôt que `🎯`.

**Comment** :
Dans `_updateState`, au moment de la transition vers CONCENTRE, détecter le chemin :
```js
// Ajouter un flag sur l'entité lors de la transition :
if (newState === STATE.CONCENTRE) {
  // Détecter si on vient de P3 (introvertie + socialLoadTimer élevé)
  const isP3Retreat = e.character.extraversion < 0.3 
    && e.socialCharge > e.socialSaturationThreshold * 0.85;
  e._concentreViaP3 = isP3Retreat;
}

// Dans le bloc stateEmojis / emoji spawn :
const emoji = newState === STATE.CONCENTRE && e._concentreViaP3 ? '🧘' : stateEmojis[newState];
```

Et dans `_renderEntity`, remplacer le badge `🎯` par `🧘` si `e._concentreViaP3 === true`.

---

## Contraintes à respecter

- **Ne pas changer SAVE_KEY** (`haize_save_v1`)
- **Ne pas refactorer la FSM globalement** — les 9 états et leurs transitions sont stables
- **`PROJECT_MAX = 3`, `ENTITY_DEFS`, `AFFINITES`** — inchangés
- **Ne pas toucher à la Heatmap** sauf nécessité absolue
- **Calcul PH dans `_renderInspectPanel`** — toute nouvelle section DOIT mettre à jour la hauteur
- **`_concentreMinDuration`** reste en place — ne pas le retirer même en ajoutant le timer reset

---

## Code à écrire (pseudo-code / extraits)

### Fix B1 (1 ligne)
```js
// simulation.js — _updateState, dans le bloc "if (newState === STATE.CONCENTRE)"
e._concentreDuration = 0;
e._concentreMinDuration = 4000 + Math.random() * 3000;
e._socialLoadTimer = 0;   // ← AJOUTER ICI
```

### Section RANCŒURS (inspect panel)
```js
// Pré-calc (avec expEntries, contacts) :
const rancorEntries = Object.entries(this._conflictCount)
  .filter(([ck]) => ck.split('-').some(id => id === e.id))
  .map(([ck, count]) => ({ otherId: ck.split('-').find(id => id !== e.id), count }))
  .filter(x => x.count >= 2)
  .sort((a, b) => b.count - a.count)
  .slice(0, 3);

// Dans PH :
+ (rancorEntries.length > 0 ? 11 + SECTION_GAP + rancorEntries.length * LINE_H + SEP_H * 2 : 0)

// Dans le rendu (après CONTACTS) :
if (rancorEntries.length > 0) {
  drawSep();
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('RANCŒURS', X, cy);
  cy += 11 + SECTION_GAP;
  for (const { otherId, count } of rancorEntries) {
    const isDeep = count >= 5;
    ctx.font = '9px monospace';
    ctx.fillStyle = isDeep ? '#e74c3c' : 'rgba(255,120,100,0.75)';
    ctx.fillText(`❄️ ${otherId} ×${count}`, X, cy + 1);
    cy += LINE_H;
  }
}
```

### Emoji P3 distinct
```js
// Dans _updateState, bloc if (newState !== e.state) :
if (newState === STATE.CONCENTRE) {
  e._concentreViaP3 = e.character.extraversion < 0.3 
    && e.socialCharge > e.socialSaturationThreshold * 0.85;
}

// Emoji spawn conditionnel :
const emojiToSpawn = (newState === STATE.CONCENTRE && e._concentreViaP3) 
  ? '🧘' 
  : (stateEmojis[newState] || null);
if (emojiToSpawn) this._spawnFloatingEmoji(e.x, e.y, emojiToSpawn);

// Dans _renderEntity, badge badge CONCENTRE :
ctx.fillText(e._concentreViaP3 ? '🧘' : '🎯', badgeX, badgeY);
```

---

## Idées pour le tour suivant (non prioritaires)

- **B (save)** : Persister `_socialLoadTimer` dans `toSnapshot()`/`fromSnapshot()` + `save()`/`load()` (1 ligne chacun)
- **A** : Spawn `⭐` flottant quand une entité atteint vétéran (count ≥ 5 pour la première fois sur un type)
- **Persistance timers EUPHORIQUE/CONCENTRE** : `_euphoriqueDuration`, `_euphoriqueCap`, `_concentreDuration`, `_concentreMinDuration` dans les snapshots — faible impact mais cohérence renforcée
