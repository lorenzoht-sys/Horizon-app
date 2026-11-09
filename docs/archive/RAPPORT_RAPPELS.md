# Rapport — Rappels automatiques patients (branche `rappels-patients`)

Ce rapport correspond au **Checkpoint B** (fin de l'implémentation autonome
T1 → T6). Il explique ce qui a été fait, et surtout **ce que tu dois faire,
toi, pour activer la fonctionnalité** (rien n'a été exécuté sur la base de
données de production).

---

## 1. Ce qui a été fait

### Vue d'ensemble

Le système envoie automatiquement aux patients :
1. **Un rappel avant leur séance** (ex: 2h avant, réglable).
2. **Une relance s'ils n'ont pas fait leurs exercices depuis X jours** (ex:
   3 jours, réglable).

**Canal V1 : notifications push du navigateur (PWA), 100% gratuites.** Le
SMS n'est pas implémenté, mais le code est organisé pour qu'on puisse
l'ajouter plus tard sans tout refaire (voir section 4).

**Déclencheur : un job planifié côté Supabase (pg_cron)**, qui appelle une
fois par heure une route protégée de l'application. C'est ce job qui
"réveille" le système — voir section 2.3, c'est la partie la plus nouvelle
et la plus importante à configurer.

Aucune donnée médicale n'est jamais envoyée dans une notification. Les seuls
messages possibles sont :
- *"Vous avez une séance aujourd'hui."*
- *"Pensez à vos exercices !"*

### Nouvelles tables (base de données)

Définies dans `supabase/migrations/20260615_rappels_patients.sql` :

| Table | Rôle |
|---|---|
| `push_subscriptions` | Un appareil = une ligne. Stocke l'abonnement technique du navigateur d'un patient pour pouvoir lui envoyer une notification. |
| `rappel_preferences` | Réglages des rappels : une ligne "globale" par praticien (`participant_id` vide) = réglages par défaut, et optionnellement une ligne par patient = réglages personnalisés pour ce patient uniquement. |
| `rappels_envoyes` | Journal de chaque rappel déjà envoyé, pour ne **jamais envoyer deux fois** le même rappel. |

### Fichiers créés

- `api/_lib/rappels.ts` — logique pure (calcul des fenêtres horaires,
  fuseau Europe/Paris, textes des messages neutres).
- `api/_lib/notifications.ts` — envoi des notifications push (canal isolé,
  prêt pour ajouter le SMS plus tard).
- `api/cron/rappels.ts` — la route appelée par le job pg_cron. Elle traite
  les rappels de séance + les relances d'exercices, et journalise dans
  `rappels_envoyes`.
- `api/patient/push-subscribe.ts` — route appelée par l'espace patient pour
  enregistrer/supprimer un abonnement push.
- `public/push-sw.js` — petit script ajouté au "service worker" de la PWA
  pour afficher les notifications reçues.
- `src/lib/push.ts` — gère côté navigateur la demande de permission et
  l'abonnement aux notifications.
- `src/hooks/useRappelPreferences.ts` — lecture/écriture des réglages de
  rappels (globaux ou par patient).
- `api/_lib/rappels.test.ts`, `api/_lib/notifications.test.ts` — tests
  automatiques (20 tests, tous verts).
- `e2e/11-rappels-patient.spec.ts`, `e2e/12-rappels-praticien.spec.ts` —
  tests Playwright.
- `supabase/migrations/20260615_rappels_patients.sql` — nouvelles tables.
- `supabase/migrations/20260616_cron_rappels_patients.sql` — configuration
  du job pg_cron (à personnaliser, voir section 2.3).

### Fichiers modifiés

- `src/pages/EspacePatient.tsx` — ajout d'une carte **"🔔 Activer les
  rappels"** dans l'espace patient.
- `src/pages/SettingsPage.tsx` — ajout d'une section **"🔔 Rappels
  automatiques"** dans les Paramètres (réglages par défaut de Pierre).
- `src/pages/ParticipantProfile.tsx` — ajout d'un onglet **"🔔 Rappels"**
  dans la fiche de chaque patient : nombre d'appareils abonnés + réglages
  personnalisés pour ce patient.
- `src/lib/patientApi.ts`, `vite.config.ts`, `.env.example`, `package.json`
  — câblage technique (variables d'environnement, dépendances `web-push`,
  service worker).

---

## 2. Tes actions (étape par étape)

Il y a **3 choses à faire**, dans cet ordre : (1) appliquer la migration SQL,
(2) générer et configurer les clés VAPID (pour les notifications push), (3)
configurer le secret + le job automatique sur Supabase.

### 2.1. Appliquer la migration SQL (nouvelles tables)

1. Va sur **supabase.com** → ton projet → **SQL Editor** → **New query**.
2. Ouvre le fichier `supabase/migrations/20260615_rappels_patients.sql` dans
   ce projet, copie tout son contenu, colle-le dans l'éditeur SQL, clique
   **Run**.
   - Ça crée les 3 nouvelles tables (`push_subscriptions`,
     `rappel_preferences`, `rappels_envoyes`) avec leurs règles de sécurité.
   - Tu peux relancer ce script sans risque s'il y a un souci (il est conçu
     pour ne pas planter si les tables existent déjà).
3. **Ne fais pas encore** `20260616_cron_rappels_patients.sql` — on y revient
   à l'étape 2.3, après avoir préparé les informations dont il a besoin.

### 2.2. Générer les clés VAPID (pour les notifications push)

**C'est quoi ?** Pour envoyer une notification push à un navigateur, le
serveur doit "signer" l'envoi avec une paire de clés (une publique, une
privée) — un peu comme une signature électronique. Ça s'appelle **VAPID**.
On ne génère ça **qu'une seule fois** pour toute l'application.

**Étape 1 — Générer la paire de clés**

Dans un terminal, à la racine du projet (`C:\Users\loren\mouvtrack`), tape :

```bash
npx web-push generate-vapid-keys
```

Ça affiche quelque chose comme :

```
=======================================

Public Key:
BIp3k9z... (une longue chaîne de caractères)

Private Key:
4rT8z... (une autre longue chaîne)

=======================================
```

Garde cette fenêtre ouverte, tu vas copier ces deux valeurs.

**Étape 2 — Placer les clés**

Il y a **3 variables** liées aux VAPID. Voici où les mettre :

| Variable | Valeur | Où la mettre |
|---|---|---|
| `VITE_VAPID_PUBLIC_KEY` | la **Public Key** générée | Sur **Vercel** (Production *et* Preview) **et** dans ton fichier `.env.local` en local |
| `VAPID_PRIVATE_KEY` | la **Private Key** générée | Sur **Vercel uniquement** (jamais en local dans un fichier commité, jamais avec le préfixe `VITE_`) |
| `VAPID_CONTACT_EMAIL` | `mailto:ton-email@exemple.com` | Sur **Vercel** (n'importe quel email de contact, utilisé par les services de notification en cas de souci) |

**Comment ajouter une variable sur Vercel :**

1. Va sur **vercel.com** → ton projet → onglet **Settings** → **Environment
   Variables**.
2. Pour chaque ligne du tableau ci-dessus : clique **Add New**, mets le nom
   exact (ex: `VITE_VAPID_PUBLIC_KEY`), colle la valeur, sélectionne les
   environnements concernés (Production, et Preview si tu veux tester sur
   les previews), puis **Save**.
3. **Important** : après avoir ajouté ces variables, il faut **redéployer**
   l'application (Vercel → onglet Deployments → ⋯ sur le dernier déploiement
   → **Redeploy**) pour qu'elles soient prises en compte.

**En local (optionnel, pour tester sur ton ordinateur) :**

Crée (ou édite) un fichier `.env.local` à la racine du projet (ce fichier
n'est **jamais** envoyé sur GitHub) et ajoute au moins :

```
VITE_VAPID_PUBLIC_KEY=colle-ta-public-key-ici
```

> ℹ️ Le bouton "Activer les rappels" ne fonctionne pas avec `npm run dev`
> (le mode développement normal), car la PWA n'y est pas activée. Pour le
> tester en local, utilise `npm run build` puis `npm run preview`. Le plus
> simple reste de tester directement sur un déploiement Vercel (Preview ou
> Production).

### 2.3. Configurer le CRON_SECRET + le job automatique (pg_cron)

C'est la partie la plus nouvelle : on va créer une "tâche planifiée" côté
Supabase qui va, **une fois par heure**, appeler discrètement l'application
pour lui dire "vérifie s'il y a des rappels à envoyer".

Pour que personne d'autre ne puisse appeler cette route et déclencher des
envois, elle est protégée par un **mot de passe secret** (`CRON_SECRET`) que
seul Supabase connaîtra.

**Étape 1 — Choisir/générer un secret**

Tu as juste besoin d'une longue chaîne de caractères aléatoires (≥ 32
caractères), qui ne servira que pour ça. Tu peux :
- soit demander à ton gestionnaire de mots de passe de générer un mot de
  passe de 32-40 caractères ;
- soit, dans un terminal Git Bash (celui utilisé dans ce projet), taper :
  ```bash
  openssl rand -hex 32
  ```
  et copier le résultat (une longue suite de lettres/chiffres).

Note cette valeur de côté — on l'appelle `<VOTRE_CRON_SECRET>` ci-dessous.
**C'est toi qui choisis la valeur**, il n'y a rien à "récupérer" ailleurs.

**Étape 2 — Ajouter CRON_SECRET sur Vercel**

Comme à l'étape 2.2 : Vercel → ton projet → **Settings** → **Environment
Variables** → **Add New** :
- Nom : `CRON_SECRET`
- Valeur : la chaîne que tu as choisie à l'étape précédente
- Environnement : Production (et Preview si tu veux aussi tester depuis un
  preview)

Puis **redéploie** l'application (comme à l'étape 2.2) pour que la variable
soit prise en compte.

**Étape 3 — Retrouver l'URL de ton site**

Sur Vercel → ton projet → onglet **Deployments** (ou directement en haut de
la page du projet), tu vois l'URL de production, par exemple :
`https://mouvtrack.vercel.app` (sans `/` à la fin). C'est `<VOTRE_URL_VERCEL>`
ci-dessous.

**Étape 4 — Préparer et exécuter le script pg_cron**

1. Ouvre le fichier `supabase/migrations/20260616_cron_rappels_patients.sql`
   dans ce projet.
2. Fais une **copie** de son contenu (ne modifie pas le fichier du projet —
   il doit rester avec les placeholders pour rester un modèle réutilisable).
3. Dans ta copie, remplace :
   - `<VOTRE_URL_VERCEL>` par l'URL trouvée à l'étape 3 (ex:
     `https://mouvtrack.vercel.app`)
   - `<VOTRE_CRON_SECRET>` par le secret choisi à l'étape 1 (**exactement la
     même valeur** que celle mise sur Vercel à l'étape 2)
4. Va sur **supabase.com** → ton projet → **SQL Editor** → **New query**,
   colle ta copie modifiée, clique **Run**.

Ce script fait 3 choses :
- il active les extensions `pg_cron` et `pg_net` (nécessaires pour
  planifier des tâches et faire des appels web depuis la base) ;
- il supprime un éventuel job précédent du même nom (pour pouvoir relancer
  le script sans erreur si tu changes l'URL ou le secret plus tard) ;
- il crée un job nommé `rappels-patients-horaire`, programmé pour s'exécuter
  **toutes les heures à la minute 5** (00h05, 01h05, ...), qui envoie une
  requête à `https://<ton-site>/api/cron/rappels` avec l'en-tête HTTP
  `x-cron-secret: <ton secret>`.

**Étape 5 — Vérifier que le job est bien créé**

Toujours dans le SQL Editor de Supabase, exécute :

```sql
SELECT jobid, jobname, schedule, active FROM cron.job;
```

Tu dois voir une ligne `rappels-patients-horaire`, `5 * * * *`, `active =
true`.

**Étape 6 — Vérifier que ça fonctionne (après ~1h)**

```sql
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'rappels-patients-horaire')
ORDER BY start_time DESC LIMIT 5;
```

La colonne `status` doit afficher `succeeded`. Si tu vois `failed`, regarde
`return_message` : c'est souvent soit une URL mal copiée, soit un
`CRON_SECRET` qui ne correspond pas exactement entre Supabase et Vercel.

### 2.4. Test manuel (vérifier que tout marche, sans attendre 1h)

**A. Activer les rappels côté patient**

1. Ouvre l'espace patient d'un de tes patients de test, sur ton téléphone ou
   ton ordinateur, avec **Chrome** (Android/PC/Mac) ou **Safari** (sur
   iPhone/iPad, **après avoir ajouté l'app à l'écran d'accueil** — sinon le
   message "🔔 Rappels" explique cette étape).
2. Sur l'écran d'accueil de l'espace patient, une carte **"🔔 Activer les
   rappels"** doit apparaître.
3. Clique sur **"Activer les rappels"** → le navigateur demande
   l'autorisation d'envoyer des notifications → accepte.
4. La carte devient **"🔔 Rappels activés"**.
5. Vérifie dans Supabase (Table Editor → `push_subscriptions`) qu'une ligne
   est apparue pour ce patient.

**B. Déclencher le rappel manuellement (sans attendre le cron)**

Depuis un terminal (par exemple Git Bash) :

```bash
curl -X POST https://<votre-url>/api/cron/rappels \
  -H "x-cron-secret: <votre CRON_SECRET>" \
  -H "Content-Type: application/json"
```

Réponse attendue (exemple) :
```json
{"rappelsSeance":{"examinees":3,"envoyes":1},"relances":{"examines":5,"envoyes":1}}
```

- Pour qu'un **rappel de séance** soit réellement envoyé (`envoyes` > 0
  côté `rappelsSeance`), il faut qu'un patient ait une séance "planifiée"
  aujourd'hui ou demain, dont l'heure de début tombe dans la fenêtre réglée
  (par défaut : dans les 2h qui suivent).
- Pour qu'une **relance exercices** soit envoyée, il faut un patient avec un
  programme actif et sans activité récente (par défaut : ≥ 3 jours).
- Si le patient a activé les rappels (étape A), une vraie notification doit
  apparaître sur son appareil dans les secondes qui suivent.
- Si tu relances la même commande tout de suite après, `envoyes` doit
  retomber à `0` pour les mêmes éléments : c'est la table `rappels_envoyes`
  qui empêche les doublons (vérifiable dans Supabase → Table Editor →
  `rappels_envoyes`).

**C. Réglages (côté praticien)**

- **Paramètres** → section **"🔔 Rappels automatiques"** : active/désactive
  les rappels et règle les délais par défaut pour tous tes patients.
- **Fiche d'un patient** → onglet **"🔔 Rappels"** : tu vois combien
  d'appareils ce patient a abonnés, et tu peux personnaliser les réglages
  pour lui uniquement (bouton "Revenir aux réglages globaux" pour annuler).

---

## 3. Limites connues

- **iPhone/iPad (Safari)** : les notifications push ne fonctionnent que si
  le patient a installé l'app sur son écran d'accueil ("Ajouter à l'écran
  d'accueil"). Sans ça, l'app affiche un message explicatif clair (pas
  d'erreur) au lieu du bouton d'activation.
- **Taux d'activation** : tous les patients ne vont pas activer les
  notifications (certains refuseront la permission, certains utilisent un
  navigateur ancien). C'est normal — l'app gère ces cas avec des messages
  clairs, mais ça veut dire que certains patients ne recevront aucun rappel
  push tant qu'un autre canal (SMS) n'est pas ajouté.
- **Granularité horaire** : le job tourne 1 fois par heure. Un rappel "2h
  avant la séance" sera donc envoyé avec jusqu'à ~1h de marge (ex: entre 1h
  et 2h avant, selon le moment où le cron passe).
- **Abonnements expirés** : si un patient désinstalle l'app ou change de
  téléphone sans cliquer sur "Désactiver", son ancien abonnement push
  deviendra invalide. Le système le détecte automatiquement (erreur 404/410
  du service de notification) et **supprime** l'abonnement expiré tout seul,
  sans bloquer l'envoi aux autres patients.

---

## 4. Ajouter le SMS plus tard

Tout l'envoi passe par une seule fonction :
`envoyerRappel(supabase, participantId, message)` dans
`api/_lib/notifications.ts`. La planification (`api/cron/rappels.ts`) ne
connaît que cette fonction — elle ne sait pas *comment* le message est
envoyé.

Pour ajouter le SMS :
1. Ajouter une nouvelle fonction `envoyerSMS(...)` dans
   `api/_lib/notifications.ts` (avec le fournisseur SMS de ton choix, ex:
   Twilio, Brevo...).
2. Dans `envoyerRappel(...)`, après (ou à la place de) l'envoi push, appeler
   `envoyerSMS(...)` — par exemple si le patient n'a aucun abonnement push
   actif, ou si le praticien a activé un réglage "aussi par SMS".
3. Pas besoin de toucher à `api/cron/rappels.ts`, aux préférences, ni au
   journal anti-doublon (`rappels_envoyes`) : tout ça reste inchangé.

Les messages restent neutres (mêmes textes que pour le push), donc aucun
risque de fuite de donnée médicale par ce nouveau canal non plus.

---

## 5. Vérifications effectuées

- ✅ `npx tsc --noEmit` (vérification TypeScript du code applicatif)
- ✅ `npm run typecheck:api` (vérification TypeScript des routes serverless)
- ✅ `npm run test:unit` — 20/20 tests passés (logique des rappels + envoi
  push)
- ✅ `npm run build` (build de production complet, PWA générée avec succès)
- ✅ Travail effectué sur la branche `rappels-patients` (jamais sur `main`)
- ✅ Aucun `git push` / `git merge` vers `main`
- ✅ Aucune commande SQL exécutée sur la base de production — uniquement des
  fichiers de migration dans `supabase/migrations/`, à appliquer par toi
  (section 2)

---

## 6. Tests d'acceptation

| # | Test | Statut |
|---|---|---|
| 1 | Un patient peut activer les rappels (navigateur compatible) | Implémenté — à tester manuellement (section 2.4.A) |
| 2 | iOS / navigateur non supporté → message clair, sans erreur | ✅ Implémenté (états "ios" / "non_supporte" dans `EspacePatient.tsx`) |
| 3 | Le cron détecte une séance à venir et envoie un push | Implémenté — à tester manuellement (section 2.4.B) |
| 4 | Le cron détecte l'inactivité et envoie une relance | Implémenté — à tester manuellement (section 2.4.B) |
| 5 | Pas de double envoi (journal `rappels_envoyes`) | ✅ Implémenté (index unique + vérification avant envoi) |
| 6 | Aucun contenu médical dans les notifications | ✅ Messages fixes, neutres, sans donnée patient |
| 7 | Pierre peut activer/désactiver et voir le statut des rappels | ✅ Implémenté (Paramètres + fiche patient) |
| 8 | `build` + `tsc` + `typecheck:api` verts | ✅ Confirmé (section 5) |

---

## 7. Commits de cette branche

```
c2a3785 [rappels] T1/T3/T4: schema rappels, module notifications push, cron de rappels
97c401b [rappels] T2: abonnement push cote patient (PWA)
b5c68a7 [rappels] T5: reglages rappels (global praticien + surcharge par patient)
c1268de [rappels] T6: specs Playwright + tests unitaires envoi push
fb0eac2 [rappels] T4: migration pg_cron + correction colonne inexistante
```
