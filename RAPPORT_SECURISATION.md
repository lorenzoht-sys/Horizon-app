# Rapport de sécurisation — branche `securisation`

Ce document résume tout ce qui a été fait sur la branche `securisation`, et
surtout **ce qu'il reste à faire à la main** (Lorenzo) pour que ces
corrections soient actives en production. Rien n'a été poussé sur `main` ni
exécuté directement sur la base de données : tout est dans cette branche,
prêt à être relu.

---

## 1. Résumé en une phrase

L'application laissait un accès direct et non protégé à la base de données
pour l'espace patient et le portail structure (rôle `anon` de Supabase) ;
ces accès passent maintenant par des fonctions serveur sécurisées
(`/api/patient/*`, `/api/structure/*`, `/api/claude`), et le verrouillage
final côté base de données est prêt dans des scripts SQL à exécuter
manuellement.

---

## 2. État des 8 tâches

| Tâche | Statut | Commit | Résumé |
|-------|--------|--------|--------|
| T1 | ✅ Fait | `deec834` | Script SQL `sql/rls_final.sql` : verrouille le rôle `anon` (plus aucun accès direct aux tables). **À exécuter manuellement.** |
| T2 | ✅ Fait | `a8866c5` | `MIGRATION_ANON.md` : liste complète des anciens accès "anon" et où ils ont été migrés. |
| T3 | ✅ Fait | `8999819` | Nouvelles routes serveur `/api/patient/login`, `/api/patient/me`, `/api/patient/seance`. |
| T4 | ✅ Fait | `e1d10bf` | Session patient (cookie/JWT) qui fonctionne même si plusieurs patients utilisent le même appareil. |
| T5 | ✅ Fait | `1f02b54` | Nouvelle route serveur `/api/structure/data` (remplace l'accès direct du portail structure). |
| T6 | ✅ Fait | `007f4f3` | `/api/claude` sécurisé : la clé Anthropic n'est plus accessible côté navigateur. |
| T7 | ✅ Fait | `94e5dc8` | Corrections de bugs connus (voir détail section 6). |
| T8 | ✅ Fait | `52d1c2e` | Audit des secrets dans le code + nettoyage `.gitignore` / `.env.example`. |

Aucune tâche n'est **BLOQUÉE**.

---

## 3. À faire avant la mise en production (étapes pour Lorenzo)

Ces étapes sont **dans l'ordre**. Aucune n'a été faite automatiquement —
c'est volontaire, par sécurité (on ne touche jamais à la base de données en
production sans ton accord).

### Étape 1 — Exécuter les scripts SQL dans Supabase

Va dans **Supabase > ton projet > SQL Editor**, et exécute ces fichiers
**dans cet ordre** (copier-coller le contenu de chaque fichier, puis
"Run") :

1. **`sql/rls_final.sql`** (le plus important)
   - Corrige une faille où n'importe qui pouvait lire les comptes-rendus
     de tous les patients (`documents_patient`).
   - Verrouille la table `structures` et retire les anciens accès publics.
   - Ce fichier est découpé en 6 sections numérotées avec des commentaires
     `-- SECTION 1`, `-- SECTION 2`, etc. Tu peux les exécuter une par une
     si tu préfères vérifier au fur et à mesure.
   - La **SECTION 6** est une vérification : exécute-la en dernier, elle
     doit renvoyer **0 ligne**. Si elle renvoie des lignes, préviens-moi
     (ça veut dire qu'il reste un accès public oublié).

2. **`sql/t3_patient_rate_limit.sql`**
   - Crée une petite table `patient_login_attempts` qui limite les
     tentatives de connexion patient à 5 par 15 minutes (anti
     "devinette" du code patient).

3. **`sql/t5_structure_access.sql`**
   - Crée une table `structure_access_logs` qui enregistre chaque accès
     au portail structure (utile si jamais un lien de structure fuite,
     pour voir qui s'en est servi).

> ⚠️ **Important** : tant que ces scripts ne sont pas exécutés, l'ancien
> verrou n'est pas en place — mais ce n'est pas grave si tu attends un peu,
> car les nouvelles routes `/api/patient/*` et `/api/structure/*` (T3/T5)
> fonctionnent déjà sans ce verrou. Le verrou SQL est la "deuxième
> serrure" : il empêche un accès direct à la base même si quelqu'un
> contourne les nouvelles routes.

### Étape 2 — Ajouter les variables d'environnement sur Vercel

Va dans **Vercel > ton projet > Settings > Environment Variables**, et
ajoute ces 3 nouvelles variables (coche **Production** et **Preview** pour
chacune) :

| Variable | Où la trouver / comment la créer |
|----------|-----------------------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Settings > API > section "Project API keys" > clé **`service_role`** (`secret`, **pas** la clé `anon`/`publishable`). ⚠️ Cette clé donne un accès total à la base — ne la mets **que** dans Vercel, jamais dans le code. |
| `PATIENT_SESSION_SECRET` | Une chaîne aléatoire longue que **tu inventes** (au moins 32 caractères, lettres/chiffres). Sert à signer la session des patients. Génère-la une fois (par ex. avec un générateur de mot de passe en ligne réglé sur 40+ caractères), note-la dans ton gestionnaire de mots de passe, et colle-la ici. |
| `ANTHROPIC_API_KEY` | C'est la même clé que celle déjà utilisée pour les fonctions IA Supabase (`analyser-seance`, `interpreter-bilan`) — celle qui commence par `sk-ant-...`. Tu peux la retrouver sur console.anthropic.com > API Keys, ou réutiliser celle déjà configurée côté Supabase (`supabase secrets list`). |

La variable `VITE_SUPABASE_URL` est probablement déjà configurée sur Vercel
(elle est utilisée par le site actuel) — pas besoin de la retoucher, les
nouvelles routes serveur la réutilisent automatiquement.

### Étape 3 — Pousser la branche et tester sur la "preview"

Une fois les étapes 1 et 2 faites, dis-le moi et je pourrai t'aider à :

```
git push -u origin securisation
```

Vercel va alors créer automatiquement une **URL de prévisualisation**
(preview) — un site de test identique au site réel, mais séparé. C'est sur
cette URL qu'on doit tester avant de fusionner vers `main` (le site
"officiel").

---

## 4. Checklist de test sur l'URL de preview

À faire une fois la preview disponible (l'URL ressemble à
`https://mouvtrack-xxxxx.vercel.app`) :

- [ ] **Connexion praticien** : se connecter normalement, vérifier que le
  tableau de bord, les fiches patients, les statistiques s'affichent.
- [ ] **Espace patient** (`/patient`) : se connecter avec un code patient
  existant, vérifier que le programme, l'historique des séances et les
  documents partagés s'affichent correctement.
- [ ] **Espace patient — enregistrer une séance** : faire une séance test,
  vérifier qu'elle apparaît bien dans l'historique du patient et dans le
  suivi du praticien.
- [ ] **Portail structure** (`/structure/<token>`) : ouvrir avec un token
  de structure existant, vérifier la liste des patients, cliquer sur un
  patient pour voir son détail (desktop **et** mobile si possible).
- [ ] **Export PDF** : exporter une facture (StatsPage et/ou
  StructureDetail) pour un patient/structure dont le nom contient un
  caractère un peu spécial (accent, emoji si possible) — vérifier que le
  PDF s'affiche bien sans carré vide.
- [ ] **Assistant IA** : poser une question à l'assistant clinique IA,
  vérifier que la réponse arrive normalement (vérifie que `/api/claude`
  fonctionne avec la nouvelle variable `ANTHROPIC_API_KEY`).
- [ ] **Création d'un contrat** : créer un nouveau contrat pour un
  participant, vérifier qu'il apparaît et que les séances sont générées.
- [ ] **Console du navigateur (F12)** : sur chacune des pages ci-dessus,
  vérifier qu'il n'y a pas d'erreurs rouges inattendues.

Si un point de la checklist échoue, note ce qui se passe et on corrigera
avant de fusionner vers `main`.

---

## 5. Points de vigilance / décisions prises seul

- **Faille critique trouvée et corrigée (T1, section 1 de
  `rls_final.sql`)** : la table `documents_patient` avait une règle d'accès
  `USING (true)`, ce qui rendait les comptes-rendus de **tous les
  patients** lisibles par n'importe qui sans authentification. C'est la
  correction la plus importante de tout ce travail — il est important
  d'exécuter `rls_final.sql` rapidement.

- **Code patient devinable (T1, hypothèse H1)** : le code d'accès patient
  est dérivé du prénom (`calculerCode(prenom)` = prénom + "2026"), donc
  quelqu'un qui connaît le prénom d'un patient peut deviner son code. Le
  rate limiting (T3, `sql/t3_patient_rate_limit.sql`) limite les
  tentatives automatiques (5 / 15 min), mais ne change pas le fait que le
  code est prévisible si on connaît juste le prénom. Une amélioration
  future possible serait de générer un code aléatoire indépendant du
  prénom — **non fait ici** car cela changerait la façon dont les
  praticiens communiquent leur code aux patients (impact fonctionnel,
  hors du périmètre "sécurisation sans casser l'existant").

- **`.env.local.txt` retiré du suivi git (T8)** : ce fichier contenait
  l'URL Supabase et la clé `anon`/`publishable`. Cette clé est conçue pour
  être publique (préfixe `VITE_`, elle est de toute façon envoyée au
  navigateur), donc le risque réel est faible. Elle reste cependant visible
  dans l'**historique** git (anciens commits) car la réécrire demanderait
  un `force-push`, ce qui est interdit par nos garde-fous. Si un jour tu
  veux la régénérer par précaution : Supabase > Settings > API > régénérer
  la clé `anon`/`publishable` (puis mettre à jour la variable
  `VITE_SUPABASE_ANON_KEY` sur Vercel).

- **T7-3 (mise en page portail structure) et T7-4 (erreurs de création de
  contrat)** : en vérifiant le code et l'historique git, ces deux bugs
  étaient **déjà corrigés** par des commits antérieurs à cette branche
  (`355a33d` et `e01cb42`). Aucune modification supplémentaire n'a donc été
  faite pour ces deux points — juste vérifié que tout est bien en place.

- **Vérification "site en marche" non faite pour T7** : pour les fichiers
  T7 qui touchent des pages affichées (`StatsPage.tsx`,
  `StructureDetail.tsx`), je n'ai pas pu lancer le serveur de
  développement (`npm run dev`) pour vérifier visuellement — l'autorisation
  a été refusée pendant la session. La vérification s'est donc limitée à
  la compilation (`tsc` + `build`, tous deux ✅). C'est pour ça que
  **l'export PDF des factures** figure dans la checklist de test de la
  section 4 : c'est le seul point T7 qui mérite un coup d'œil visuel sur
  la preview.

- **Hors périmètre signalé (T2)** : la page `/client/:token`
  (`src/pages/ClientView.tsx`) n'a pas été auditée — elle ne fait pas
  partie des deux espaces visés (patient / structure). À vérifier dans un
  futur durcissement si elle utilise aussi des données sensibles sans
  protection.

---

## 6. Détail des corrections de bugs (T7)

- **PDF factures avec caractères spéciaux** : nouveau fichier
  `src/utils/pdfText.ts` (`cleanTextPdf`) qui retire les emojis/symboles
  que la police par défaut des PDF ne sait pas afficher (ils
  apparaissaient comme des carrés vides). Appliqué aux factures dans
  `StatsPage.tsx` et `StructureDetail.tsx`.
- **Traitements actifs/arrêtés** : nettoyage — un seul calcul partagé
  (`getTraitementsActifs` / `getTraitementsArretes` dans
  `src/lib/anamnese.ts`) au lieu de filtres répétés dans 6 fichiers
  différents, pour éviter les incohérences.
- **Portail structure (mise en page mobile/desktop)** : vérifié, déjà
  correct (corrigé par un commit antérieur).
- **Erreurs silencieuses à la création de contrat** : vérifié, déjà
  corrigé (erreur affichée via un message "toast" + log console).

---

## 7. Confirmations finales

- ✅ `npx tsc --noEmit` : aucune erreur sur l'ensemble des 8 tâches.
- ✅ `npm run build` : build réussi (dernière vérification après T8).
- ✅ Branche de travail : `securisation` (jamais quitté cette branche).
- ✅ Aucun `push`/`merge` vers `main` effectué.
- ✅ Aucune commande SQL exécutée sur la base de production — tout est dans
  `/sql` pour exécution manuelle (section 3).
- ✅ Audit des secrets (T8) : dépôt propre, à l'exception de
  `.env.local.txt` (clé publique par design, retirée du suivi — voir
  section 5).
- ✅ Un commit par tâche, préfixé `[securisation]` :

```
52d1c2e [securisation] T8: hygiene des secrets (audit + .gitignore + .env.example)
94e5dc8 [securisation] T7: corrections bugs connus (cleanText PDF, traitements vides)
007f4f3 [securisation] T6: securisation du proxy /api/claude
1f02b54 [securisation] T5: API serverless /api/structure/data (service_role)
e1d10bf [securisation] T4: gestion session patient sur appareil partage
8999819 [securisation] T3: API serverless /api/patient/* (login, me, seance) + migration espace patient
a8866c5 [securisation] T2: MIGRATION_ANON.md - inventaire des acces anon
deec834 [securisation] T1: sql/rls_final.sql - verrouillage RLS du role anon
```

**Prochaine étape recommandée : exécuter `sql/rls_final.sql` (section 1)
en priorité**, car c'est lui qui corrige la faille la plus grave
(comptes-rendus patients lisibles publiquement).
