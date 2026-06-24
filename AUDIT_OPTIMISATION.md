# AUDIT — Planificateur de tournée & d'agenda (Mode A / Mode B)

> Branche : `audit-planificateur`
> Date : 24 juin 2026
> Périmètre : lecture de code uniquement — **aucune modification fonctionnelle**.
> Fichiers audités en détail : `src/lib/planificateur.ts`, `src/components/planning/ModalPlanificateur.tsx`,
> `api/tournee/matrice-trajets.ts`, `src/hooks/useAgenda.ts`, `src/hooks/useContrats.ts`,
> `src/hooks/useIndispos.ts`, `src/lib/mappers.ts`, `src/lib/anamnese.ts`, `src/utils/horaires.ts`,
> `src/utils/kmeans.ts`, `src/types/index.ts`, migrations `20260622_refonte_contrats.sql` /
> `20260622_durees_seances_contrats.sql`, `vitest.config.ts`.
>
> ⚠️ Remplace l'ancien `AUDIT_OPTIMISATION.md` (daté du 18 juin), qui décrivait une version antérieure
> du système (TourneePage seul, sans ORS, sans planificateur.ts, sans refonte des contrats). Ce
> document-là est obsolète et son contenu n'est plus d'actualité.

---

## Résumé exécutif

Le garde-fou anti-doublon ajouté précédemment (`existeDeja`, commit `80755a2`) protège bien le cas
qu'il visait : ré-application d'un planning déjà appliqué. Mais l'audit a trouvé **trois failles plus
sérieuses qui peuvent produire deux séances le même jour pour un même patient**, plus une faille
**critique sur le point de départ de Pierre** qui fausse silencieusement tout un planning. Le tout sans
aucun test unitaire sur `planificateur.ts` (et la config Vitest actuelle ne testerait même pas ce
fichier s'il y avait des tests).

🔴 Critique : 4 — 🟠 Majeur : 5 — 🟡 Mineur : 4 — ✅ OK : 9

---

## 1. Duplication de séances

| Cas | Comportement actuel | Risque | Correction nécessaire |
|---|---|---|---|
| Re-soumission rapide du bouton "Appliquer" (double-clic) | `disabled={applying \|\| ...}` désactive le bouton dès le 1er clic (`ModalPlanificateur.tsx:392`) | ✅ Aucun | — |
| Re-génération rapide du bouton "Générer" | `disabled={loading}` (`:257`) | ✅ Aucun | — |
| Pierre relance Mode B après un 1er run déjà appliqué | `seancesParContrat` (planificateur.ts:241-247) ne reprend que les séances `statut==='planifiee'` de la semaine en cours → elles sont déplacées (`alreadyPlanned`), pas dupliquées | ✅ Aucun, si `seances` du parent est à jour | — |
| **Patient avec 2 contrats actifs simultanés** | `assignerJoursSemaine` boucle `for (const contrat of contrats)` sans regrouper par patient. Rien n'empêche que le Contrat A choisisse "lundi" pour le patient et que le Contrat B (même patient) choisisse aussi "lundi" → `candidatsDuJour` produit 2 `Candidat` distincts pour le même patient le même jour, et `planifierJour` crée 2 étapes (2 horaires différents) | 🔴 **Critique** — viole directement la règle "jamais 2 séances/jour pour un patient", et rien dans `creerContrat`/`ContratNouveauPage.tsx` n'empêche de créer un 2e contrat actif pour un patient qui en a déjà un (`contratActifDeParticipant` utilise `.find()`, qui suppose qu'il n'y en a qu'un, mais ne le garantit pas) | Dédupliquer par `participant.id` dans `assignerJoursSemaine` (un seul jour par patient, tous contrats confondus) **et** bloquer la création d'un 2e contrat actif au même patient |
| **Séance existante "orpheline" jamais nettoyée** | Si un patient avait 2 séances `planifiee` cette semaine pour un contrat, et qu'une ré-optimisation ne lui attribue plus qu'1 jour (ex: dispo réduite), `existantes.shift()` (planificateur.ts:284) ne réutilise qu'1 des 2 ids existants. Le 2e reste en base, inchangé, à son ancienne date — ni déplacé ni signalé | 🟠 Majeur — crée une séance fantôme qui finit par ressembler à un doublon dans l'agenda, sans qu'aucune alerte ne soit levée | Annuler/lister explicitement les séances existantes non réattribuées |
| Pas de contrainte d'unicité côté base | Table `seances` (cf. `schema.sql:286`, et confirmé : aucune migration n'ajoute de contrainte `UNIQUE(participant_id, date)`) | 🟠 Majeur — l'anti-doublon vit uniquement en mémoire JS, sur un snapshot `seances` potentiellement désynchronisé (onglet ouvert depuis longtemps, 2 appareils) | Ajouter une contrainte `UNIQUE (participant_id, date)` (en excluant `statut='annulee'` via index partiel) comme dernier filet |

---

## 2. "Jamais 2 séances le même jour pour un patient"

| Cas | Comportement actuel | Risque | Correction nécessaire |
|---|---|---|---|
| Garantie explicite dans `assignerJoursSemaine` pour **un seul contrat** | Oui : `choisis` est tiré de `joursDispo` (un jour de la semaine ne peut apparaître qu'une fois dans cette liste) | ✅ OK | — |
| Garantie **entre plusieurs contrats du même patient** | Non, voir tableau §1 — c'est le même bug, vu sous l'angle de cette règle | 🔴 Critique (doublon de la ligne ci-dessus) | Même correction |
| 1 jour dispo, 2 séances/semaine demandées | `joursDispo.length <= n` → `choisis = joursDispo` (1 jour) + ajout dans `impossibles` avec le message `"1/2 séance(s) possible(s)..."` | ✅ OK — va bien dans "à planifier manuellement", ne plante pas | — |
| Disponibilités du patient vides (`anamnese.organisation.joursDisponibles` absent) | `joursDispo.length === 0` → `impossibles.push(... 'Disponibilités du patient non renseignées')`, le patient est exclu de `candidats` | ✅ OK, pas de crash | — |
| **Incohérence avec la page Tournée (ad hoc)** | Le commentaire `mappers.ts:6` dit "patient sans jours saisis → toujours disponible par TourneePage", mais le planificateur (Mode A/B) traite ce même cas comme **impossible à planifier**. Les deux pages n'ont pas la même politique pour "pas de dispo connue" | 🟡 Mineur — pas un bug en soi, mais incohérence de comportement entre deux écrans qui peut surprendre Pierre | Documenter ou aligner les deux politiques |

---

## 3. Cohérence des données en entrée

| Cas | Comportement actuel | Risque | Correction nécessaire |
|---|---|---|---|
| `anamnese.organisation` null / mal formé | `getOrganisation` retombe sur le bilan initial puis sur des valeurs vides ; `getJoursDisponiblesCourts` retourne `[]` ; `orgToDisponibilites` (mappers.ts:13) retourne `undefined` si `org` n'est pas un objet | ✅ OK, pas de crash | — |
| Jours en minuscules dans `organisation.joursDisponibles` | `JOUR_DISPO_TO_JOUR_SEMAINE` (anamnese.ts:5-7) ne mappe que les formes capitalisées (`Lun`...`Sam`). `JOUR_FORM_TO_DB` (mappers.ts:7-10), utilisé pour `creneauxPreference` uniquement, accepte les deux casses. Les deux fonctions lisent la même donnée mais avec une robustesse différente | 🟡 Mineur — en pratique `ParticipantForm.tsx:903` n'enregistre que la forme capitalisée, donc non déclenché aujourd'hui, mais fragile si une autre source écrit en minuscules (import, API patient) | Normaliser la casse une seule fois, à la lecture, dans une fonction commune |
| Patient sans coordonnées GPS | `assignerJoursSemaine` (planificateur.ts:214-217) exclut le patient avec `raison: 'Adresse non géocodée'` avant tout calcul | ✅ OK | — |
| **Point de départ de Pierre non configuré** | `TourneePage.tsx:390/397` : si l'adresse de Pierre est vide, `depart` reste à `DEPART_FALLBACK` (centre de Nantes, en dur) et `departErreur=true`. L'optimiseur ad hoc bloque bien ce cas (`:464`, toast d'erreur). **Mais le bouton "Planifier la semaine" (`:749`) n'a aucune garde** — la modale s'ouvre, calcule tout le planning de la semaine (ou des 8/12 semaines) à partir du centre de Nantes, sans aucun avertissement (`departErreur` n'est jamais lu dans `ModalPlanificateur.tsx`, seul `orsWarn` l'est) | 🔴 **Critique** — planning entièrement faussé et appliqué en silence si Pierre n'a pas encore renseigné son adresse dans Paramètres | Bloquer l'ouverture de la modale (ou afficher un bandeau d'erreur dedans) si `departErreur` est vrai |
| ORS indisponible | `matrice-trajets.ts` retombe sur Haversine (`fallback:true`) à chaque point d'échec (pas de clé, erreur HTTP, exception réseau) | ✅ OK | — |
| ORS **et** Haversine échouent tous les deux | Haversine est un calcul mathématique pur sur des `lat/lng` numériques — il ne peut "échouer" que si les coordonnées elles-mêmes sont `NaN`/non numériques. Patients sans coordonnées sont déjà filtrés avant. Si une coordonnée stockée en base est corrompue (NaN), la matrice contiendrait des `NaN`, silencieusement absorbés par les comparaisons (`Math.max(1, Math.round(NaN/60))` → `NaN`, jamais `< minSec`) → ordre de tournée non garanti mais pas de crash | 🟡 Mineur — cas très improbable, mais aucune validation des coordonnées en sortie de géocodage n'existe | Valider `Number.isFinite(lat/lng)` avant d'inclure un patient dans la matrice |
| `nb_seances_semaine` = 0 | `joursDispo.length <= 0` est faux (il y a des jours dispo) → branche `else` → `scored.slice(0, 0)` = `[]` → le contrat n'obtient **aucun jour, aucune entrée dans `impossibles`** : le patient disparaît silencieusement du planning, sans message | 🔴 **Critique** — donnée corrompue → silence total, pas de remontée à "à planifier manuellement" | Ajouter un garde explicite `if (n <= 0) { impossibles.push(...); continue; }` |
| `nb_seances_semaine` négatif (ex: -1) | `Array.prototype.slice(0, -1)` en JS signifie "tout sauf le dernier élément" (sémantique d'index négatif), **pas** "zéro élément". Avec `n=-1` et 3 jours dispo, `choisis` contiendrait 2 jours — un comportement totalement fortuit, dérivé d'une particularité de `slice()`, pas d'une logique métier | 🔴 **Critique** — donnée corrompue produisant un résultat incohérent et difficile à diagnostiquer | Même garde que ci-dessus (`n <= 0`) suffit à neutraliser ce cas |

---

## 4. Logique de `assignerJoursSemaine`

| Cas | Comportement actuel | Risque | Correction nécessaire |
|---|---|---|---|
| "Most constrained first" | `candidats.sort((a,b) => a.joursDispo.length - b.joursDispo.length)` (planificateur.ts:236) — correct, tri croissant par nombre de jours dispo | ✅ OK | — |
| Scoring par temps de trajet | `matrix.durees[idx]?.[o]` (`:267`) — utilise bien la matrice ORS (ou son fallback Haversine si ORS indisponible), jamais Haversine "en silence" en plus de l'ORS : `matrix.fallback` est propagé jusqu'à l'UI (`orsWarn`) | ✅ OK | — |
| Réemploi des séances existantes — jamais une `realisee`/`annulee` | `seancesParContrat` filtre explicitement `s.statut !== 'planifiee'` → exclu (`:243`) | ✅ OK | — |
| Regroupement patients même jour/même zone | Le coût (`:264-269`) minimise le trajet vers les patients déjà placés ce jour-là (`occupants`) plutôt que vers le départ — favorise naturellement le regroupement géographique, même sans notion explicite de "zone" | ✅ OK (mais best-effort, pas une garantie — c'est un glouton, pas un optimum global ; acceptable pour ce cas d'usage) | — |
| Collision de clé matrice (`coordKey`) | `coordKey` arrondit à 6 décimales. Si le point de départ de Pierre partage exactement les mêmes coordonnées qu'un patient, ou si 2 patients ont des coordonnées identiques (même immeuble), `indexMap` (une `Map` clé→index) ne garde que le **dernier** index inséré pour cette clé | 🟡 Mineur — sans conséquence pratique sur les durées de trajet (points géographiquement identiques → durées identiques), mais peut fausser ponctuellement `departIdx` si Pierre habite à la même adresse qu'un patient | Documenter la limite, ou dédupliquer les coordonnées avant l'appel ORS (gain : moins de requêtes) |

---

## 5. Mode B (planning récurrent)

| Cas | Comportement actuel | Risque | Correction nécessaire |
|---|---|---|---|
| Fenêtre 4/8/12 semaines respectée | `for (semaine = 0; semaine < nbSemaines; semaine++)` (`:452`), `nbSemaines` configurable via le sélecteur de la modale | ✅ OK | — |
| Relance Mode B sur un planning déjà optimisé → régression ? | Chaque semaine est recalculée indépendamment, de façon déterministe (même tri, même algo glouton) à partir des données actuelles → une relance avec les mêmes données produit le même résultat ; pas de dérive cumulative | ✅ OK | — |
| Création vs mise à jour | `toCreate` (nouvelles) / `toUpdate` (déplacements, via `seanceExistanteId`) — logique correcte dans son principe | ✅ OK dans son principe (voir cependant §6 pour les échecs partiels) | — |
| **Indisponibilités non récurrentes de Pierre ignorées** | `indisposJour = indispos.filter(ind => ind.jour === jourKey **&& ind.recurrente**)` (`:406`, `:477`). Mais `IndisponibilitePierre` n'a **aucun champ date** — seulement un jour de semaine — donc une indispo "non récurrente" n'a aucune façon de dire *quelle* occurrence du jour elle vise. Pire : la page Tournée (ad hoc, `TourneePage.tsx` via `indisposDuJour`) ne fait, elle, **aucun filtre sur `recurrente`** — elle applique l'indispo à toute occurrence de ce jour de la semaine. Le Mode A/B, lui, l'ignore complètement dès que `recurrente=false` | 🟠 Majeur — une indispo que Pierre a explicitement enregistrée (ex: rendez-vous personnel un lundi, case "Récurrent" décochée) est **respectée par la page Tournée mais totalement invisible pour le planificateur Mode A/B**, qui peut placer un patient en plein dans ce créneau, sur 8 ou 12 semaines | Le modèle de données doit porter une vraie date pour les indispos ponctuelles, ou le planificateur doit appliquer la même règle que TourneePage (toutes les indispos du jour, récurrentes ou non) |

---

## 6. Interface ModalPlanificateur

| Cas | Comportement actuel | Risque | Correction nécessaire |
|---|---|---|---|
| Double-clic sur "Appliquer" | `disabled={applying \|\| etapesAcceptees.length===0}` | ✅ OK | — |
| Échec réseau pendant `bulkCreerSeances` (création) | Un seul `INSERT` Supabase pour tout le lot → tout-ou-rien côté base ; en cas d'erreur, `throw` propage jusqu'au `catch` du composant, `toast.error`, la modale reste ouverte, **aucune** séance n'a été créée → une nouvelle tentative est sûre (pas de doublon possible) | ✅ OK | — |
| Échec réseau pendant la boucle `modifierSeance` (déplacement) | `modifierSeance` (useAgenda.ts:67-76) **catch l'erreur en interne et ne la relance jamais** (`return` silencieux après le `toast.error`). La boucle `for (const e of toUpdate)` continue donc sur toutes les étapes même si certaines échouent | 🔴 **Critique** — le message final `toast.success('Séances appliquées : X déplacées...')` (`:178`) annonce systématiquement un succès complet, **y compris si certains déplacements ont réellement échoué**. Pierre n'a aucun moyen de savoir qu'une partie du planning affiché n'a pas été réellement appliquée en base | Faire en sorte que `modifierSeance` retourne un statut succès/échec exploitable par l'appelant, et que le toast final reflète les échecs réels (ex: "3 déplacées, 1 erreur — voir...") |
| "À planifier manuellement" bien exclues de l'application | `etapesAcceptees` provient uniquement de `localJours` (issus de `resultat.jours`), jamais de `resultat.impossibles` — ces dernières ne sont affichées qu'en lecture | ✅ OK | — |
| Retrait manuel d'une étape (🗑) puis "Appliquer" | `retirerEtape` filtre `localJours`, `etapesAcceptees` recalculé à chaque rendu via `.flatMap` — cohérent | ✅ OK | — |

---

## 7. Refonte contrats (régression)

| Cas | Comportement actuel | Risque | Correction nécessaire |
|---|---|---|---|
| Contrats existants avec `jours_fixe` (avant migration) | `20260622_refonte_contrats.sql` backfille `nb_seances_semaine = array_length(jours_fixe,1)` pour les lignes concernées ; colonne `NOT NULL DEFAULT 2` pour le reste | ✅ OK | — |
| Fallback JS si `nb_seances_semaine` est quand même `null`/absent | `mappers.ts:293` : `row.nb_seances_semaine ?? (joursFixe.length > 0 ? joursFixe.length : 2)` — déjà présent, défensif | ✅ OK | — |
| `durees_seances` vide/null | `mappers.ts:298-299` : fallback `dureeMinutes` si le tableau est vide ou absent | ✅ OK | — |
| Normalisation `jours_fixe` longs → courts | Déjà corrigé (commit `f772031`, fonction `normaliserJoursFixe`) | ✅ OK | — |

---

## 8. Tests unitaires

| Cas | Comportement actuel | Risque | Correction nécessaire |
|---|---|---|---|
| `doitEnvoyerRappelVeilleSeance` et fonctions de `rappels.ts` | Couvertes par `api/_lib/rappels.test.ts` (12+ cas) | ✅ OK | — |
| `assignerJoursSemaine`, `planifierSemaine`, `planifierRecurrent`, `ordonner` | **Aucun test** — `Glob "src/**/*.test.ts"` ne retourne rien | 🟠 Majeur — c'est le cœur algorithmique le plus complexe de l'app, jamais exercé par des tests, alors qu'il a déjà eu un bug de duplication en production | Écrire des tests ciblant : multi-contrats même patient (§1), `n<=0` (§3), 1 jour dispo / 2 séances (§2), réutilisation de séance `planifiee` vs non-réutilisation de `realisee`/`annulee` (§4) |
| Anti-doublon `existeDeja` (ModalPlanificateur) | Aucun test — logique UI non couverte | 🟡 Mineur | Idem, ou test d'intégration léger |
| **Config Vitest** | `vitest.config.ts:8` : `include: ['api/**/*.test.ts']` — **si un fichier `src/lib/planificateur.test.ts` était ajouté aujourd'hui, il ne serait pas exécuté** par la commande de test actuelle | 🟠 Majeur — piège silencieux : même en écrivant les tests recommandés ci-dessus, ils ne tourneraient pas sans modifier la config | Élargir `include` à `['api/**/*.test.ts', 'src/**/*.test.ts']` |

---

## Synthèse des findings par sévérité

### 🔴 Critique (à corriger en priorité absolue)
1. Un patient avec **2 contrats actifs simultanés** peut recevoir 2 séances le même jour (§1, §2).
2. Point de départ de Pierre **non configuré** → planning entier calculé depuis le centre de Nantes, sans aucun avertissement dans la modale (§3).
3. `nb_seances_semaine <= 0` (donnée corrompue) → patient disparaît silencieusement du planning, ou (cas négatif) reçoit un nombre de jours incohérent via une bizarrerie de `Array.slice()` (§3).
4. Échec silencieux de `modifierSeance` pendant l'application → toast de succès **trompeur**, planning réellement incomplet en base sans que Pierre le sache (§6).

### 🟠 Majeur
5. Séance "orpheline" non réattribuée quand les disponibilités d'un patient se réduisent (§1).
6. Pas de contrainte d'unicité `(participant_id, date)` côté base — l'anti-doublon ne vit qu'en mémoire JS (§1).
7. Indisponibilités "non récurrentes" de Pierre invisibles pour le Mode A/B, alors qu'elles sont respectées par la page Tournée — modèle de données incomplet (aucun champ date) (§5).
8. `assignerJoursSemaine` et les fonctions cœur du planificateur n'ont **aucun test unitaire** (§8).
9. La config Vitest actuelle exclurait de toute façon ces tests même s'ils existaient (§8).

### 🟡 Mineur
10. Incohérence de robustesse de casse des jours entre `anamnese.ts` et `mappers.ts` (§3).
11. Incohérence de politique "dispo non renseignée = toujours dispo vs impossible" entre TourneePage et planificateur (§2).
12. Coordonnées GPS identiques (même immeuble / même adresse que Pierre) → collision dans `indexMap` (§4).
13. Pas de validation `Number.isFinite` sur les coordonnées avant calcul de matrice (§3).

---

## Recommandation pour la Phase 2

Prioriser dans cet ordre : **#2 (départ non configuré)** et **#4 (toast trompeur)** sont les plus simples
à corriger et les plus dangereux en usage réel (faux planning appliqué en confiance). **#1 (multi-contrats)**
nécessite une vraie décision produit (interdire 2 contrats actifs, ou dédupliquer par patient dans
l'algorithme) — à valider avec toi avant de coder. **#3 (n≤0)** est une garde de 3 lignes. **#7
(indispos non récurrentes)** demande d'ajouter un champ date au modèle — plus gros chantier, à
planifier séparément.
