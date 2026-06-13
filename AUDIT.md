# AUDIT.md — État des lieux (Consolidation Horizon)

> Document de travail, généré au début de la branche `consolidation`.
> Objectif : servir de référence pour les Tâches 2 à 8. Ne contient aucune
> modification de code — uniquement de l'observation.

---

## 1. Arborescence commentée

```
api/                          Fonctions serverless Vercel (convention "fichier = route")
  _lib/patientAuth.ts          helpers JWT/session patient (T3 sécurisation)
  _lib/structureAuth.ts        helpers token portail structure (T5 sécurisation)
  claude.ts                     proxy /api/claude (assistant IA, clé Anthropic côté serveur)
  patient/login.ts, me.ts, seance.ts   API espace patient (T3 sécurisation)
  structure/data.ts             API portail structure (T5 sécurisation)
  tsconfig.json                  config TS dédiée (NodeNext) — non couverte par tsc racine

src/
  App.tsx, main.tsx              bootstrap, routes, auth, chargement brouillons cloud
  index.css, App.css, styles/    CSS global + tokens (App.css = résidu template Vite, mort)

  components/
    bilan/                       formulaire de bilan (stepper + widgets de tests)
    bilan/steps/                 étapes du bilan (identité, physique, endurance/mémoire...)
    charts/                      graphiques (radar, courbes, comparaison)
    client/                      dashboard "espace patient" (ClientDashboard, ClientProgramme)
    export/                      générateurs PDF @react-pdf/renderer (Fiche bilan, Contrat,
                                  Dossier, Programme) — actifs, c'est la pile PDF "moderne"
    import/                      import Excel des participants
    journal/                     notes de séance (NoteSeanceModal = actif ;
                                  JournalTab = mort, voir §3)
    layout/                      Sidebar, PageWrapper, AuthLeftPanel
    map/                         carte (tournée, zones géographiques)
    participant/                 formulaire patient (5 étapes), contrats, modales
    pwa/                         composants liés au mode PWA
    skeletons/                   écrans de chargement (squelettes)
    ui/                          composants UI génériques (AnimatedNumber, FadeInCard...)
    AssistantCliniqueIA.tsx       MORT — jamais importé (voir §3)
    DicteePostSeance.tsx          dictée vocale post-séance (actif)
    OnboardingModal.tsx            MORT — superseded par pages/OnboardingPage.tsx (voir §3)
    YoutubePlayer.tsx               lecteur vidéo pour les exercices

  data/
    exercices.ts, norms.ts, profiles.ts   référentiels (exercices, normes de score,
                                            profils de TESTS de bilan — sans rapport avec
                                            "profil handicap")
    demoIndispos.ts                 utilisé par TourneePage (indisponibilités démo)
    demo.ts, demoContrats.ts,
    demoSeances.ts, demoZones.ts    MORTS — jeux de données de démo jamais importés (voir §3)

  hooks/                         un hook par entité Supabase (participants, contrats,
                                  programme V1 et V2, structures, agenda, zones...)
                                  → voir §5 pour la duplication useProgramme / useProgrammeV2

  lib/
    supabase.ts                   client Supabase (rôle anon)
    database.types.ts              MORT — types manuels jamais branchés au client (voir §3)
    mappers.ts                     conversions DB ⇄ types TS
    anamnese.ts                    logique partagée traitements/antécédents
    patientApi.ts, structureApi.ts  appels aux nouvelles routes /api/patient/* et /api/structure/*

  pages/                         une page par route (Dashboard, ParticipantProfile,
                                  NewBilan, ProgrammePage, StatsPage, PortailStructure,
                                  EspacePatient, ClientView = lien de partage patient...)
  pages/mobile/AppMobile.tsx     PWA mobile patient (mode séance)

  programme/
    ExerciceCard.tsx               carte exercice (utilisée dans ProgrammePage)
    AdherenceChart.tsx,
    ExerciceConfigModal.tsx,
    SuiviCalendar.tsx,
    PrintableProgramme*.tsx (3)    MORTS — jamais importés (voir §3)

  types/                         types TS partagés (Bilan, Participant, Programme...)
  utils/                         exports PDF, import Excel, géocodage, génération tokens...

supabase/
  schema.sql                     dump manuel du schéma (généré "depuis les interfaces
                                  TypeScript" — pas un vrai dump pg_dump, à remplacer en T3)
  migrations/                    22 migrations déjà trackées (29 mai → 11 juin 2026)
  functions/                     2 Edge Functions (analyser-seance, interpreter-bilan)
  (pas de config.toml → `supabase init` jamais exécuté, voir T3)

sql/                             scripts de la session "sécurisation", à exécuter à la main
                                  (rls_final.sql, t3_patient_rate_limit.sql, t5_structure_access.sql)

e2e/                              scripts Playwright ad-hoc (pas une vraie suite, voir §5)

(racine)                         ~50 captures d'écran + scripts de debug TRACKÉS dans git
                                  (voir §5) — à nettoyer
```

---

## 2. Dépendances npm (`npx depcheck`)

### À supprimer (zéro usage trouvé dans tout le repo)
| Paquet | Constat |
|---|---|
| `html2pdf.js` (+ `@types/html2pdf.js`) | Aucun import nulle part. Les exports PDF utilisent `@react-pdf/renderer` (bilan/contrat/dossier/programme) ou `jspdf`+`html2canvas` (rapport d'évolution, factures). |
| `react-hot-toast` | Aucun import. Toute l'app utilise `sonner` (27 fichiers) pour les notifications. |
| `react-countup` | Aucun import, aucun composant `CountUp`. |

### Faux positifs depcheck (à garder, ne rien faire)
- `autoprefixer`, `postcss`, `tailwindcss` → utilisés via `postcss.config.js` / `tailwind.config.js` (config-only, depcheck ne les voit pas).
- `buffer` → polyfill navigateur, déclaré dans `vite.config.ts` (`optimizeDeps.include`), utilisé par `xlsx`/`qrcode`.
- `@types/uuid`, `jose`, `@types/html2pdf.js` (sauf suppression ci-dessus) → utilisés normalement.

### Dépendance manquante à ajouter (hygiène)
- `html2canvas` est importé directement dans `src/utils/exportRapportEvolutionPDF.ts` (actif,
  utilisé par "Rapport d'évolution" dans ComparaisonPage) mais **absent de `package.json`** —
  il fonctionne uniquement car une autre dépendance l'installe en transitif. Risque de casse
  silencieuse si cette dépendance transitive change. → ajouter `html2canvas` (v1.4.1, types inclus)
  en dépendance directe.

### Scripts racine utilisant une dépendance manquante (`playwright` au lieu de `@playwright/test`)
`debug-errors.mjs`, `screenshot-*.mjs`, `verify-*.mjs` (13 fichiers) importent `playwright`
(paquet jamais installé) → ces scripts sont déjà cassés tels quels. Voir §5.

---

## 3. Code mort (`npx knip` + vérification manuelle des imports)

### Fichiers jamais importés — confirmés morts, candidats suppression T2

| Fichier | Lignes | Remarque |
|---|---|---|
| `src/components/AssistantCliniqueIA.tsx` | 488 | Jamais importé. Contient les derniers restes de "profil handicap" (`PROFIL_HANDICAP_LABELS`) — voir §6. |
| `src/components/OnboardingModal.tsx` | 207 | Superseded par `src/pages/OnboardingPage.tsx` (celle-ci est bien utilisée dans `App.tsx`). |
| `src/components/journal/JournalTab.tsx` | 107 | Superseded par `src/components/journal/NoteSeanceModal.tsx` (actif). |
| `src/data/demo.ts` | 987 | Jeu de données de démo, jamais importé. |
| `src/data/demoContrats.ts` | 199 | Idem. |
| `src/data/demoSeances.ts` | 394 | Idem. |
| `src/data/demoZones.ts` | 33 | Idem. (`demoIndispos.ts` reste — utilisé par `TourneePage`.) |
| `src/utils/questionTemplates.ts` | 25 | Jamais importé. |
| `src/lib/database.types.ts` | 234 | Types Supabase écrits à la main, jamais utilisés par `lib/supabase.ts` (le client n'est pas typé `<Database>`). Commentaire dans le fichier dit lui-même qu'il faudrait le régénérer via `supabase gen types`. |
| `src/App.css` | 184 | Résidu du template Vite (`.counter`...), jamais importé. |
| `src/programme/AdherenceChart.tsx` | 42 | Jamais importé. |
| `src/programme/ExerciceConfigModal.tsx` | 241 | Jamais importé. |
| `src/programme/SuiviCalendar.tsx` | 82 | Jamais importé. |
| `src/programme/PrintableProgramme.tsx` + `PrintableProgrammePage1.tsx` + `PrintableProgrammePage2.tsx` | 18+179+205 | Groupe interne cohérent, mais `PrintableProgramme` (point d'entrée) n'est importé nulle part. |

**Total ≈ 3 625 lignes de code mort confirmées.**

### Fichiers flaggés par knip mais qui sont des FAUX POSITIFS (à garder)
- `api/claude.ts`, `api/patient/*.ts`, `api/structure/data.ts`, `api/_lib/*.ts` — knip ne
  connaît pas la convention Vercel "1 fichier sous `/api` = 1 route serverless" ; ces fichiers
  sont bien utilisés en production (`vercel.json` route `/api/(.*)` vers `/api/$1`).
- `src/lib/supabase.ts` export `isSupabaseConfigured` : utilisé.
- Diverses "unused exports" (types `TypeQuestion`, `RADAR_LABELS`, `verifierTokenStructure`,
  `PROFILES`/`buildTestsActifs`, `EXERCICES_BASE`, etc.) : examen rapide montre que la plupart
  sont des types/constantes utilisés ailleurs via des chemins que knip ne détecte pas bien
  (re-exports, usage dans JSX). **Non traités dans cette passe** — pas de suppression proposée
  pour ces exports individuels (risque/bénéfice trop faible pour le temps que ça prendrait).

### Clarifications sur les hypothèses du prompt initial

**"Restes du profil handicap (retiré)"** → **Le profil handicap n'est PAS retiré, il est actif.**
Le praticien peut toujours définir le `profilHandicap` d'un participant via le bouton ♿ dans
`ParticipantProfile.tsx` (lignes ~966-997, `updateParticipant(id, { profilHandicap: ... })`).
Ce profil est ensuite utilisé pour adapter l'affichage des exercices (`ExerciceCard.tsx`,
`ExercicesPage.tsx`), les comparatifs de bilan (`Step2_Physical.tsx`, `BilanStepper.tsx`) et
l'export PDF du programme (`ProgrammePDF.tsx`). **Aucune suppression de cette fonctionnalité
n'est proposée.** Le seul "reste" réellement mort est `AssistantCliniqueIA.tsx` (jamais importé,
voir tableau ci-dessus), qui contient une référence à `PROFIL_HANDICAP_LABELS`.

**"Anciens générateurs PDF jsPDF remplacés par html2pdf.js"** → **Rien à supprimer.**
- `html2pdf.js` n'est utilisé nulle part (dépendance déjà morte, voir §2).
- Les générateurs "modernes" (bilan, contrat, dossier, programme) utilisent déjà
  `@react-pdf/renderer` (`src/components/export/*.tsx` + `src/utils/exportPDF.ts`,
  `exportDossierPDF.ts`, `exportContratPDF.ts`) — actifs.
- `jsPDF` + `html2canvas` sont utilisés dans 3 fichiers, tous actifs : `exportRapportEvolutionPDF.ts`
  (Rapport d'évolution, depuis `ComparaisonPage`), et les générateurs de factures dans
  `StatsPage.tsx` et `StructureDetail.tsx`. Aucun de ces 3 n'est un "ancien" générateur
  remplacé — ce sont les générateurs actuels pour ces documents-là.
- Il ne reste donc aucun générateur PDF mort à nettoyer.

**"Ancienne page Dossier dédiée"** → **N'existe pas / déjà nettoyée.** Aucune route `/dossier`
ni fichier `DossierPage.tsx`. Le commit `7930d18` ("Nettoyage et simplification des exports
PDF: nouveau Dossier/Carte de sante avec @react-pdf/renderer") a déjà fait ce travail :
aujourd'hui "Dossier" = un PDF généré par `DossierPDF.tsx` / `exportDossierPDF.ts`, exposé via
un bouton. `ClientView.tsx` (route `/client/:token`) est une fonctionnalité **distincte et
active** (lien de partage patient public sans authentification praticien) — pas concernée.

**"Attestation fiscale SAP"** (mentionnée comme 3e générateur jsPDF actif) → en réalité,
**aucun générateur n'existe pour ce document**. `ParticipantForm.tsx` (~ligne 1323-1368)
collecte déjà les coordonnées bancaires "Service à la Personne" (IBAN/BIC) avec la mention
"nécessaires pour établir les attestations fiscales SAP", mais aucun export ne les utilise
encore. C'est une fonctionnalité **incomplète**, pas du code mort — hors périmètre de cette
consolidation (pas de suppression, pas de complétion proposées ici).

---

## 4. `console.log`, `TODO`/`FIXME`, blocs commentés

- **`console.log`** : ⚠️ correction par rapport à une première estimation erronée (confusion avec
  une autre recherche) — il n'y a en réalité **qu'une seule occurrence** dans tout `src/`
  (0 dans `api/`), et elle est déjà **en commentaire** :
  `src/pages/AssistantPage.tsx:812` (`// console.log('[AssistantPage] prompt:', prompt); // Décommenter pour débugger`).
  Aucun `console.log` actif à retirer en T2. Tous les `console.error` sont conservés.
- **`TODO`/`FIXME`/`XXX`** : aucun vrai marqueur de TODO. La recherche `TODO|FIXME|XXX` ne
  remonte que des **faux positifs** : des textes de placeholder dans des champs de formulaire
  (`"XXX XXX XXX XXXXX"` pour le SIRET, `"BNPAFRPPXXX"` pour le BIC, `"SAP XXXXXXXXX"`, etc.)
  dans `AppMobile.tsx`, `ParticipantForm.tsx` et `SettingsPage.tsx`. Rien à nettoyer.
- **Blocs commentés volumineux** : un seul bloc notable, `src/hooks/useBrouillonBilan.ts`
  lignes 5-20 — c'est du **SQL d'installation en commentaire** (`CREATE TABLE bilans_brouillons...`),
  intentionnel et toujours pertinent (voir §6). **Pas du code mort, ne pas supprimer** — sera
  converti en migration réelle en Tâche 3.

---

## 5. Incohérences

### a) `useProgramme` (V1) vs `useProgrammeV2` coexistent — actif, risqué
- `useProgramme` (`src/hooks/useProgramme.ts`) lit/écrit la table `programmes` (JSON-ish via
  `mappers.ts`). Utilisé par `ClientDashboard.tsx`, `ParticipantProfileMobile.tsx`,
  `ParticipantProfile.tsx`, et `ProgrammePage.tsx`.
- `useProgrammeV2` (`src/hooks/useProgrammeV2.ts`) lit/écrit `programmes` +
  `programme_seances` + `programme_planning` + `programme_exercices` (modèle relationnel).
  Utilisé par `ProgrammePage.tsx` (qui utilise donc **les deux** en parallèle, lignes
  1383-1385).
- **Deux représentations du même concept "programme" coexistent en prod.** C'est une dette
  technique réelle, mais **toucher à ça sort largement du cadre "grand ménage" (Tâche 2)** —
  fort risque de régression sur l'espace patient (ClientDashboard) et la fiche patient mobile.
  **Aucune action proposée ici**, signalé pour une consolidation future dédiée.

### b) Fichiers de debug/captures d'écran TRACKÉS dans git (racine + e2e + test-results)
Environ **70 fichiers** committés qui n'ont aucun rapport avec l'application (captures
d'écran de sessions de design/debug passées, scripts ad-hoc) :
- Racine : `debug-errors.mjs`, `screenshot-*.mjs` (7), `verify-*.mjs` (3), et ~45 `.png`
  (`design-*.png`, `level1-*.png`, `level2-*.png`, `patients-*.png`, `sed-*.png`, `varC-*.png`,
  `verify-*.png`, `screenshot-*.png`...).
- `UserslorenAppDataLocalTempclaudescreenshots/` : 2 `.png` (nom de dossier visiblement issu
  d'un chemin Windows mal interprété lors d'un commit).
- `test-results/` : artefacts d'exécution Playwright (`.last-run.json` + captures).
- Tous les scripts `.mjs` de la racine importent `playwright` (paquet jamais installé, voir
  §2) → **déjà non fonctionnels**.

→ Candidats sûrs pour suppression en T2 (zéro impact sur l'application).

### c) `e2e/*.spec.cjs` — scripts Playwright ad-hoc, pas une vraie suite
`brouillon.spec.cjs`, `comparaison.spec.cjs`, `horizon.spec.cjs`, `journal.spec.cjs`,
`redesign.spec.cjs`, `test-bilan-mobile.cjs` : utilisent un faux login via
`localStorage.setItem('isLoggedIn', 'true')`, écrivent des captures vers des chemins en dur
(`C:/Users/loren/...`). Ce sont des scripts de debug visuel, pas des tests de non-régression.
**Proposition : laissés en place pour l'instant**, seront remplacés par la vraie suite
Playwright de la Tâche 5 (qui les rendra redondants — suppression à ce moment-là plutôt que
maintenant, pour ne pas perdre de référence avant d'avoir écrit les nouveaux tests).

---

## 5bis. Tables Supabase potentiellement inutilisées

⚠️ **Liste uniquement — aucune suppression de table n'est faite par cette consolidation.**
La suppression éventuelle se fera manuellement, plus tard, après backup.

En comparant les tables référencées par le code actuel (`.from('...')` dans `src/`, `api/`,
`supabase/functions/`) avec celles définies dans l'ancien fichier de types manuels
`src/lib/database.types.ts` (fichier mort, voir §3, mais qui reflète un schéma DB antérieur),
deux tables ressortent comme probablement obsolètes :

| Table | Pourquoi elle semble obsolète |
|---|---|
| `acces_patients` | Apparaît dans `database.types.ts` mais n'est ni dans `schema.sql`/migrations, ni interrogée via `.from()`. Le suivi des accès patients se fait aujourd'hui via `localStorage` (`horizon_acces_patients`, dans `useAccesPatients.ts`) et les nouvelles routes `/api/patient/*`. |
| `settings_praticien` | Idem : présente dans `database.types.ts` mais absente du schéma actuel. Les réglages praticien sont aujourd'hui des colonnes de la table `praticiens` (`tarif_horaire`, `couleur_theme`, etc.) + un cache `localStorage` (clé `settings_praticien`, voir `SettingsPage.tsx`). |

Toutes les autres tables (17 définies dans schema.sql/migrations + les 5 tables hors-migration
du §6 + `bilans_brouillons` du §7) sont bien référencées par le code actuel.

**Action recommandée (manuelle, hors périmètre de cette consolidation)** : vérifier dans
Supabase Studio si `acces_patients` et `settings_praticien` existent encore et contiennent des
données ; si oui, faire un export/backup, puis les supprimer une fois confirmé qu'elles ne sont
plus utiles.

---

## 6. Les 5 tables créées hors-migration (schéma non versionné)

Confirmé : ces 5 tables sont **activement utilisées en production** mais **absentes** de
`supabase/schema.sql` et de tout fichier dans `supabase/migrations/` (donc créées à la main
via Supabase Studio) :

| Table | Utilisée par |
|---|---|
| `seances_patient` | `AssistantPage.tsx`, `Dashboard.tsx`, `ParticipantProfile.tsx` |
| `exercices_realises` | `AssistantPage.tsx`, `Dashboard.tsx`, `ParticipantProfile.tsx` |
| `programme_seances` | `useProgrammeV2.ts` |
| `programme_planning` | `useProgrammeV2.ts` |
| `programme_exercices` | `useProgrammeV2.ts` |

→ Traité en **Tâche 3** : migration dédiée pour ces 5 tables, afin que le schéma soit enfin
complet et versionné.

---

## 7. Le bug `bilans_brouillons` (404 console)

**Diagnostic** : la table `bilans_brouillons` n'existe pas en base (absente de
`schema.sql` et des migrations). Le code qui la cible existe et est **actif** :
- `src/hooks/useBrouillonBilan.ts` contient, en commentaire (lignes 5-20), le SQL de création
  de la table + RLS — jamais exécuté.
- `src/App.tsx` (lignes 157 et 177) appelle `loadAllBrouillonsFromSupabase(session.user.id)`
  à chaque connexion/session restaurée → requête `SELECT * FROM bilans_brouillons WHERE
  praticien_id = ...` qui échoue (table absente) → **c'est la source du 404 en console**.
- `src/components/bilan/BilanStepper.tsx` appelle aussi `deleteBrouillonFromSupabase` /
  `syncBrouillonToSupabase` (via `useBrouillonBilan.ts`) à l'ouverture/fermeture du formulaire
  de bilan — d'où l'apparition du 404 "au chargement du formulaire de bilan" observée.
- Le code gère déjà l'absence de table avec un commentaire explicite ("Fail silently si la
  table bilans_brouillons n'existe pas encore") — **donc aucun crash, juste du bruit en
  console et une fonctionnalité de synchronisation cloud des brouillons silencieusement
  inactive** (elle retombe sur le `localStorage` local à l'appareil).

**Conclusion** : ce n'est **pas une route morte ni du code à supprimer**. C'est une
fonctionnalité réelle et déjà câblée ("sync cloud des brouillons de bilan entre appareils"),
dont la migration de la table n'a jamais été créée. → **Traité en Tâche 3** : la création de
cette table sera ajoutée aux migrations versionnées (avec son RLS, déjà écrit en commentaire
dans le code).

---

## 8. Synthèse — périmètre proposé pour la Tâche 2

Voir message de Checkpoint A pour la liste précise soumise à validation.
