# HAIZE — Plan du prochain tour
_Rédigé le : 28/05/2026 00:29_

## Analyse de l'état actuel

Ce qui fonctionne bien :
- Architecture FSM solide avec 9 états, transitions logiques et caps de durée
- Système de projets, recrutement, rancune/réconciliation cohérent
- Rendu performant (heatmap LUT, gradient caches, adaptive trail, panel hash)
- Micro-événements spontanés : dispute, contagion euphorie, réconciliation
- Territorialité, happy/avoid zones, mémoire d'interaction

Ce qui pose problème :
- **Bug de regression introduit dans le dernier tour** : le fix "double-render cœur" est cassé (voir section bugs)
- `_concentreCap` toujours absent de la sérialisation save/load (gap connu, non réglé)
- Aucune feature narrative depuis plusieurs tours — la simulation manque de "sens" emergent visible

---

## Bugs / régressions détectés

### 🔴 BUG CRITIQUE — Double-render cœur 💛 toujours actif (simulation.js ~l.1625)

**Symptôme :** Le fix du tour précédent est inefficace. Dans `_renderFriendshipLinks`, le premier `for` loop ne destructure pas `isClose` :

```js
// AVANT (bugué) :
for (const { a, b, score, strength } of this._activeFriendLinks) {
  // ...
  if (score > 40 && !isClose) {  // ← isClose est undefined ici !
    // !undefined === true → condition TOUJOURS vraie
    // cœur rendu à chaque frame pour score > 40, isClose ou non
  }
}
```

Le `!isClose` vaut `!undefined` = `true` en permanence. La deuxième passe (close-range) dessine aussi le cœur pour les paires proches. Résultat : les amis proches (score > 40) ont encore leur cœur affiché deux fois.

**Fix (1 ligne) :**
```js
// APRÈS (correct) :
for (const { a, b, score, strength, isClose } of this._activeFriendLinks) {
```

### 🟡 GAP — `_concentreCap` non sérialisé (simulation.js save/load)

Le save persiste `_concentreMinDuration` (`min`) mais pas `_concentreCap`. Après un load, une entité en CONCENTRE voit son cap reset à 50000ms (défaut du constructeur), alors qu'elle avait peut-être 41000ms aléatoire. Risque : état CONCENTRE qui dure anormalement longtemps post-load.

Champ manquant dans `save()` :
```js
concentreDurations: Object.fromEntries(
  this.entities.map(e => [e.id, {
    dur: e._concentreDuration    || 0,
    min: e._concentreMinDuration || 4000,
    cap: e._concentreCap         || 50000,  // ← MANQUE
  }])
),
```
Et dans `load()` pour le restaurer :
```js
if (d) {
  e._concentreDuration    = d.dur;
  e._concentreMinDuration = d.min;
  e._concentreCap         = d.cap ?? 50000; // ← MANQUE
}
```

---

## Perf

Budget frame actuel estimé :
- `_update` : ~3-6ms (O(n²) interactions sur 12 entités = 66 paires, rapide)
- `_render` : ~2-4ms (gradient caches bien throttlés, heatmap dirty-flag OK)
- Panel DOM : throttlé à 200ms, hash guard opérationnel
- Console HTML : event-driven via `onConsoleDirty`, pas de poll
- **Pas de régression perf introduite dans le dernier tour** (les 3 changes étaient O(n) max)

Aucun nouveau bottleneck détecté. Le budget est sain pour ajouter une feature légère.

---

## Priorités recommandées pour le prochain tour

### 1. ✅ Fix `isClose` destructuring (CRITIQUE — 1 ligne)

Corriger le bug de double-render cœur décrit ci-dessus. Change minimal, impact immédiat et visible.

**Fichier :** `simulation.js`, fonction `_renderFriendshipLinks`  
**Change :** Ajouter `isClose` dans la destructuration du premier `for...of`

### 2. ✅ Fix save/load `_concentreCap` (SÉCURITÉ DONNÉES — 2 lignes)

Ajouter `cap: e._concentreCap || 50000` dans le `save()` et le restaurer dans `load()`.  
Faible effort, évite une inconsistance après save/load prolongé.

### 3. 🌟 Feature : Journal des Relations (impact narratif fort)

**Pourquoi :** La simulation accumule des données riches (rancœurs, interactionLog, happyZones, successCount) mais rien ne les synthétise visuellement. L'utilisateur ne voit pas "l'histoire" qui s'est jouée.

**Quoi :** Un overlay `#relation-journal` (panneau flottant, toggle via touche `J`) qui génère en texte court les relations les plus notables de la session :

```
📖 JOURNAL — Jour 3
💛 FT ↔ TR : meilleurs alliés (score 42, 3 projets communs)
❄️ ER ↔ IM : ennemis jurés (rancune ×7)
🌟 JG : explorateur vétéran (5× EXPLORATION)
🤝 LD ↔ SB : réconciliés hier (rancune → 0)
```

**Comment :**
- Calculé à la demande (au toggle), pas en temps réel → coût nul sur la boucle
- Trier les paires par `interactionLog` score + `_conflictCount` pour trouver les relations les plus intenses
- Afficher les 4-6 faits les plus marquants (best alliance, deepest rancor, solo star, recent reconciliation)
- Panneau positionné center-screen, fond semi-opaque, fermeture via `J` ou click outside

**Valeur :** Donne du sens aux comportements émergents. Fort impact narratif sans modifier la physique.

---

## Contraintes à respecter

- Ne pas toucher aux paramètres de physique (forces, thresholds) — la simulation est équilibrée
- Ne pas modifier `FRIENDSHIP_THRESHOLD = 8` — calibré sur les patterns observés
- Le journal ne doit PAS être calculé chaque frame (coût prohibitif) — uniquement à la demande
- Garder la backward-compat save/load : tout nouveau champ dans snapshot doit avoir un `?? fallback`
- Les touches clavier existantes : `H` (heatmap), pas de conflit → `J` libre pour journal

---

## Code à écrire (pseudo-code)

### Fix 1 (isClose destructuring) — simulation.js

```js
// Remplacer la ligne ~1608 :
for (const { a, b, score, strength } of this._activeFriendLinks) {
// Par :
for (const { a, b, score, strength, isClose } of this._activeFriendLinks) {
```

### Fix 2 (concentreCap save/load) — simulation.js

Dans `save()`, objet `concentreDurations` :
```js
cap: e._concentreCap || 50000,
```

Dans `load()`, restauration `concentreDurations` :
```js
e._concentreCap = d.cap ?? 50000;
```

### Feature 3 (Journal) — simulation.js + index.html

**Méthode `_buildRelationJournal()` dans Simulation :**
```js
_buildRelationJournal() {
  const facts = [];
  // 1. Meilleure alliance (interactionLog croisé max)
  let bestPairScore = 0, bestPair = null;
  for (let i = 0; i < entities.length; i++) {
    for (let j = i+1; j < entities.length; j++) {
      const s = ((entities[i].interactionLog[entities[j].id]||0) +
                 (entities[j].interactionLog[entities[i].id]||0)) / 2;
      if (s > bestPairScore) { bestPairScore = s; bestPair = [entities[i], entities[j]]; }
    }
  }
  if (bestPair && bestPairScore > 5) facts.push(`💛 ${bestPair[0].id} ↔ ${bestPair[1].id} : meilleurs alliés (score ${bestPairScore.toFixed(0)})`);
  
  // 2. Rancœur la plus profonde
  let deepRancor = null, deepCount = 0;
  for (const [ck, count] of Object.entries(this._conflictCount)) {
    if (count > deepCount) { deepCount = count; deepRancor = ck; }
  }
  if (deepRancor && deepCount >= 3) facts.push(`❄️ ${deepRancor.replace('-',' ↔ ')} : ennemis (×${deepCount})`);
  
  // 3. Star des projets
  const star = [...this.entities].sort((a,b) => b.successCount - a.successCount)[0];
  if (star && star.successCount > 0) facts.push(`🌟 ${star.id} : ${star.successCount} projet${star.successCount>1?'s':''} résolus`);
  
  // 4. Vétéran de projet
  for (const e of this.entities) {
    for (const [type, count] of Object.entries(e._projectHistory||{})) {
      if (count >= 5) facts.push(`⭐ ${e.id} : expert ${type} (×${count})`);
    }
  }
  
  return facts.slice(0, 6);
}
```

**Dans index.html :** Ajouter `<div id="journal-panel" hidden>...</div>` + toggle `J` keydown.
