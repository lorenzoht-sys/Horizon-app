# Scripts

Aucun script n'écrit en production. Ceux qui écrivent sur staging vérifient
leur cible (`assertStagingTarget`) et exigent `--apply`.

## Utilisés par le build ou la CI

| Script | Rôle |
| --- | --- |
| `pwa-manifest-postbuild.mjs` | étape `postbuild` : corrige le manifeste PWA dans `dist/` |
| `staging-reset-etat-e2e.ts` | CI, avant chaque e2e : remet le jeu de démo de staging dans un état connu |
| `run-harnais-local.mjs` | `npm run test:security` : harnais RLS contre staging |
| `verifier-resultat-harnais.mjs` | CI, job `audit` : décide du succès à partir du rapport du harnais |
| `seed-staging.sql` | jeu de données fictif de staging (comptes de démo) |
| `cartographie.mjs` | génère `docs/CARTOGRAPHIE-DONNEES.md` ; à relancer après un chantier de structure |

## Outils de staging (à la demande)

| Script | Rôle |
| --- | --- |
| `staging-query.ts` | requête SQL en lecture seule |
| `staging-dry-run.ts` | exécute du SQL dans une transaction toujours annulée |
| `staging-apply-migration.ts` | applique des migrations dans une transaction unique |
| `staging-backup.ts` | sauvegarde complète avant une opération destructive |
| `staging-reseed.ts` | purge puis recrée les comptes de démo (`seed-staging.sql`) |
| `staging-reset-praticien-a-password.ts` | réinitialise le mot de passe du praticien de démo |
| `staging-push-github-secrets.ts` | pose les secrets GitHub Actions connus |
| `dump-schema.ts` | dump du schéma `public` sans Docker |
| `seed-staging-partage-beneficiaire.sql` | jeu fictif pour le partage bénéficiaire |

## Ponctuels, déjà appliqués (conservés pour l'historique)

Chacun a servi une fois, pour un chantier daté décrit dans son en-tête. Ne
pas relancer sans relire.

| Script | Chantier |
| --- | --- |
| `backfill-code-acces.ts` | attribution des codes d'accès aux bénéficiaires existants |
| `regenerer-codes-acces-structure.ts` | régénération de codes exposés par le portail structure |
| `renouveler-contrats-expires.ts` | remédiation au déploiement du renouvellement automatique |
| `liens-acces-beneficiaires.ts` | liens d'accès direct sur le domaine canonique |
| `compter-questionnaires-incomplets.sql` | décompte avant correction des scores de questionnaires |
| `staging-apply-grant-parity.ts`, `staging-apply-grant-parity-v2.ts` | parité des GRANT staging / production |
| `staging-apply-securite-lot1.ts` | suppression de politiques RLS fantômes |
| `staging-fix-acces-participant-pour.ts` | correction de `acces_participant_pour()` |
| `staging-renseigner-titre-praticien.ts` | titre du praticien de démo |
| `staging-restaurer-etat-prod-tm6.ts` | reproduction d'un état de production pour un test |
| `staging-sonde-idor-patient.ts` | épreuve des contrôles anti-IDOR des routes patient |
