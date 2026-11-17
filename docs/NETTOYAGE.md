# Nettoyage d'Horizon : état des lieux et plan

Ouvert le 2026-11-17, à la suite du rendez-vous avec le prestataire, qui
jugeait la plateforme « lourde » et encombrée. Ce document part de
**mesures** prises sur `main` (#201), pas d'impressions. À tenir à jour à
chaque lot.

## Outils

| Commande | Ce qu'elle mesure |
| --- | --- |
| `npm run build && npm run poids` | poids du front : paquet chargé au démarrage et total précaché par la PWA |
| `npm run nettoyage:inventaire` | knip : fichiers jamais importés, exports et dépendances inutilisés (`knip.json`) |

La CI affiche les deux dans le résumé du job `build`, sans bloquer pour
l'instant.

## Mesures du 2026-11-17

### Ce qui est sain

- **Code mort : quasi nul.** knip trouve un seul fichier jamais importé
  (`src/pages/RegisterPage.tsx`, conservé volontairement, voir `App.tsx`) et une
  dépendance inutile (`@types/uuid`, `uuid` 14 fournit ses types). Les
  « exports inutilisés » (≈ 240) sont presque tous des fonctions et des types
  exportés mais utilisés dans leur propre fichier : c'est cosmétique.
- **Base de données : aucune table orpheline.** Les 62 tables créées par
  `supabase/migrations/` sont toutes lues par le code ou par des fonctions SQL
  (`compteurs_facture`, `organisation_membres`). Rien à supprimer avant la
  bascule HDS.
- **Mémoire du serveur.** Mesurée en local : ≈ 60 Mo au repos, ≈ 190 Mo une fois
  les 12 routes chargées. L'instance Clever Cloud XS (1 Go) a de la marge, même
  avec PostgREST dans la même instance.
- **Commentaires.** 11 % des lignes (src, api, functions, clevercloud), dans la
  norme. Ils n'ont aucun coût à l'exécution.

### Ce qui est lourd

1. **Le paquet chargé au démarrage : 3,5 Mo bruts, 1,07 Mo compressés**, pour
   tout le monde, patients sur mobile compris, avant le premier affichage. Il
   contient des outils dont la plupart des écrans n'ont pas besoin :
   - génération de PDF `@react-pdf` (pdfkit, reconciler, fontkit, yoga, brotli,
     hyphen) : ≈ 1,1 Mo bruts ;
   - import Excel `xlsx` : ≈ 410 Ko ;
   - carte `leaflet` : ≈ 150 Ko (importée dans `src/main.tsx`) ;
   - `framer-motion` (≈ 90 Ko), animations.

   Cause : `App.tsx` importe directement `Dashboard`, `ParticipantProfile`,
   `EspacePatient`… qui tirent les exports PDF et l'import Excel.
2. **Cinq bibliothèques PDF** pour des usages voisins : `@react-pdf/renderer`
   (exports), `jspdf` + `html2canvas` (rapport d'évolution, statistiques),
   `pdfmake` (assistant : 1,8 Mo à lui seul), `pdf-lib` (formulaires, serveur),
   `pdfjs-dist` + `mammoth` (lecture de modèles).
3. **L'image Docker de Clever Cloud embarque 545 Mo de bibliothèques**, dont le
   serveur n'utilise que 8 (Supabase, pdf-lib, fontkit, date-fns, Sentry,
   web-push, jose, ical-generator) : ≈ 136 Mo. Déploiements plus lents, sans
   effet sur la mémoire.
4. **Deux formats de programme (V1 et V2)** cohabitent : l'espace patient, les
   PDF et l'assistant gardent un repli V1. Ne peut être retiré que si la
   production ne contient plus aucun programme V1 actif (comptage à faire).
5. **Documents de travail.** `docs/PLAN-BETA.md` (1 948 lignes, en partie sur
   l'historique de son propre suivi), `docs/archive/` (≈ 2 000 lignes), une
   dizaine de scripts ponctuels déjà appliqués. Sans effet sur l'application,
   mais ils alourdissent la prise en main du dépôt.

## Plan, par lots

Chaque lot = une PR, CI verte (build, unitaires, e2e, harnais RLS), merge sur
accord de Lorenzo. Aucun lot ne touche au schéma de la base.

| Lot | Contenu | Visible ? | Gain attendu | Risque |
| --- | --- | --- | --- | --- |
| 0 | Outillage (cette PR) : `knip.json`, `npm run poids`, résumé en CI, retrait de `@types/uuid` | non | mesure continue | nul |
| 1 | Chargement à la demande : PDF, Excel, carte et pages lourdes chargés seulement quand on les ouvre | non (sauf un bref « Chargement… » à la première ouverture) | démarrage ≈ divisé par deux (estimation à confirmer avec `npm run poids`) | faible, couvert par l'e2e |
| 2 | Image Docker : bibliothèques du serveur seules | non | 545 → ≈ 136 Mo | moyen tant que l'image n'a jamais été construite : à valider en recette Clever Cloud |
| 3 | Documents et scripts : archiver `PLAN-BETA`, `docs/archive/`, scripts ponctuels (l'historique reste dans git) | non | lisibilité du dépôt | nul |
| 4 | Programmes V1 : retrait du repli si le comptage en production donne zéro | oui si des V1 subsistent | code plus simple | à décider après comptage |
| 5 | PDF : converger vers une ou deux bibliothèques | **oui** (rendu des PDF) | ≈ 2 Mo de moins au total | à valider document par document par Pierre |

Ordre proposé : 0 → 1 → 3 avant l'arrivée du prestataire ; 2 pendant la
recette Clever Cloud ; 4 et 5 après la bascule HDS.

## Journal

- 2026-11-17 : mesures initiales, lot 0.
