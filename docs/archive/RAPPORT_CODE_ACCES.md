# Rapport — Code d'accès patient unique (branche `fix-code-acces`)

## 1. Ce qui a été fait

Le code de connexion patient (`/patient`) n'est plus recalculé depuis le
prénom (`calculerCode(prenom)` = prénom + "2026"). Chaque participant a
maintenant un **code d'accès unique, aléatoire, stocké en base**
(`participants.code_acces`).

**Format du code** : 8 caractères, MAJUSCULES, alphabet sans caractères
ambigus à l'oral/écrit (pas de `0`/`O`, `1`/`I`/`L`). Exemple : `K7P9X2M4`.

### Fichiers modifiés / créés

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260614_add_code_acces_participants.sql` | **Migration** — ajoute `participants.code_acces text` + index unique. **Pas encore appliquée** (à faire par toi, voir §2). |
| `src/utils/codeAcces.ts` | **Nouveau** — `genererCodeAcces()`, fonction unique de génération (8 car., alphabet sans ambiguïté). |
| `scripts/backfill-code-acces.ts` | **Nouveau** — script one-shot pour attribuer un code aux participants existants. |
| `src/types/index.ts`, `src/lib/mappers.ts` | Ajout du champ `codeAcces` ↔ colonne `code_acces`. |
| `src/hooks/useParticipants.ts` | À la création d'un participant, génère un `code_acces` (réessaie en cas de collision improbable, erreur Postgres `23505`). |
| `api/patient/login.ts`, `api/_lib/patientAuth.ts` | Le login cherche directement `participants.code_acces = <code saisi>` (recherche en base, plus de `.find()` sur le prénom). `calculerCode()` supprimé. |
| `src/hooks/useAccesPatients.ts` | Suppression de `calculerCode()` et `trouverParticipantParCode()` (code mort). |
| `src/pages/PageAccesPatient.tsx` | Le code saisi n'est plus mis en minuscules avant envoi (la normalisation se fait côté serveur). |
| `src/components/participant/ModalEspacePatient.tsx` | Affiche le **nouveau code** (avec bouton "Copier le code", QR, SMS). Si le participant n'a pas encore de code (avant backfill), affiche clairement **"Code non généré"** et masque les boutons de partage. |
| `e2e/helpers.ts`, `e2e/README.md`, `scripts/seed-staging.sql` | Codes de démo (Camille/Julien) au nouveau format (`CAME2E26` / `JUNE2E27`). |

### Sécurité pendant la transition (avant que tu lances le backfill)

- Tant qu'un participant a `code_acces = NULL`, **il ne peut jamais se
  connecter** : en SQL, `NULL = '<code saisi>'` est toujours faux, donc
  aucune saisie ne peut matcher une ligne `NULL`.
- Côté praticien, la fiche de ce participant affiche "Code non généré" (pas
  de code vide/cassé affiché, pas de QR/lien générés).
- Les **nouveaux participants créés après cette mise à jour** reçoivent
  automatiquement un code et fonctionnent immédiatement, sans attendre le
  backfill.

---

## 2. TES ACTIONS (pas à pas)

### Étape 1 — Appliquer la migration

Dans le **SQL Editor** de Supabase (projet de production), colle et exécute
le contenu de :

```
supabase/migrations/20260614_add_code_acces_participants.sql
```

(ou `supabase db push` si tu utilises la CLI — voir
`supabase/migrations/README.md`).

Cette migration est sans risque : elle ajoute juste une colonne vide
(`code_acces`) et un index. Rien n'est modifié pour les patients existants
— ils ne pourront simplement pas encore se connecter avec un nouveau code
jusqu'à l'étape 2.

### Étape 2 — Lancer le script de backfill

Ce script attribue un `code_acces` unique à **tous les participants
existants** qui n'en ont pas encore.

Il a besoin de deux informations (à récupérer dans Supabase > Project
Settings > API) :
- `VITE_SUPABASE_URL` (l'URL du projet)
- `SUPABASE_SERVICE_ROLE_KEY` (la clé **service_role** — secrète, ne jamais
  la mettre dans le code ni la partager)

Dans un terminal PowerShell, à la racine du projet :

```powershell
$env:VITE_SUPABASE_URL = "https://<ton-projet>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<ta clé service_role>"
npx tsx scripts/backfill-code-acces.ts
```

`npx tsx` télécharge automatiquement l'outil nécessaire pour exécuter le
script (pas d'installation préalable). Le script affiche à la fin la liste
des codes attribués (prénom, nom, code).

### Étape 3 — Récupérer la liste des nouveaux codes pour Pierre

Deux options :

- **Dans l'app** : ouvre la fiche de chaque patient → bouton "Espace
  patient" → le nouveau code est affiché avec un bouton "Copier le code"
  (et SMS si un numéro de téléphone est renseigné).
- **En une fois (SQL Editor Supabase)** :
  ```sql
  select prenom, nom, code_acces
  from participants
  order by nom, prenom;
  ```

### Étape 4 — Tester sur preview avant de fusionner

1. Pousse la branche `fix-code-acces` et ouvre une Pull Request (preview
   Vercel automatique).
2. Sur le preview, va sur `/patient`, entre le code d'un patient de test
   (par ex. un patient créé fraîchement sur le preview, qui aura
   automatiquement un code) et vérifie que son programme + ses bilans
   s'affichent bien.
3. Si tout est bon, fusionne dans `main`.

---

## 3. Plan de bascule recommandé pour Pierre

1. **Avant de prévenir les patients** : étapes 1 et 2 ci-dessus doivent être
   faites (migration + backfill), sinon les anciens patients n'auront pas
   encore de nouveau code.
2. Une fois le backfill fait, Pierre peut consulter le nouveau code de
   chaque patient dans sa fiche ("Espace patient" → code + bouton copier /
   QR / SMS).
3. **Les anciens codes ("prénom+2026") ne fonctionnent plus dès que cette
   version est déployée.** Donc : déployer en dehors des heures de
   connexion des patients si possible, et prévoir que Pierre communique le
   nouveau code à chaque patient avant sa prochaine connexion (SMS via le
   bouton "Envoyer SMS" de la fiche, ou de visu lors d'une séance).
4. Les patients qui utilisaient la PWA (session déjà enregistrée sur leur
   téléphone) ne sont pas impactés tant que leur session (30 jours) est
   valide — mais devront utiliser le nouveau code à la reconnexion suivante.

---

## 4. Confirmations

- ✅ `npx tsc --noEmit` — OK
- ✅ `npm run typecheck:api` — OK
- ✅ `npm run build` — OK
- ✅ `npm run typecheck:e2e` — OK
- ✅ Branche `fix-code-acces` (vérifié avant chaque commit)
- ✅ Aucun push / merge sur `main`
- ✅ Aucune commande SQL exécutée sur la prod (migration écrite dans
  `supabase/migrations/`, à appliquer par toi)

## Tests d'acceptation

- [x] Nouveau patient créé → reçoit un `code_acces` unique non devinable
- [x] Login patient par ce nouveau code → fonctionne, programme + bilans
      visibles (logique inchangée une fois le bon `participant.id` trouvé)
- [x] Deux patients avec le même prénom → deux codes différents, aucun
      conflit (génération aléatoire + index unique)
- [x] Le code est visible et copiable côté praticien
- [x] `calculerCode(prenom)` n'est plus utilisé nulle part dans le code
      (seules les migrations/rapports historiques en parlent)
- [x] build + tsc + typecheck:api verts
