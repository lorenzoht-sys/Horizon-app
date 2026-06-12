# MIGRATION_ANON.md — Inventaire des accès Supabase "anon"

Carte exhaustive de tous les appels Supabase effectués **sans session
praticien** (espace patient `/patient` + portail structure
`/structure/[token]`). Chaque ligne sera migrée vers un endpoint
`/api/patient/*` (T3) ou `/api/structure/*` (T5) utilisant
`SUPABASE_SERVICE_ROLE_KEY`, puis cochée ici.

Légende : ⬜ à migrer · ✅ migré.

---

## 1. Espace patient — `/patient` et `/patient/:id`

### `src/pages/PageAccesPatient.tsx` (écran de connexion)

| # | Requête | Table | R/W | Filtre client | Vers |
|---|---------|-------|-----|----------------|------|
| 1.1 | `supabase.from('participants').select('id, prenom, nom')` (ligne 38, **sans filtre** — récupère TOUS les patients de TOUS les praticiens, puis filtre côté client avec `calculerCode`) | `participants` | R | aucun | `POST /api/patient/login` |

### `src/pages/EspacePatient.tsx` — chargement des données (`charger()`, ~ligne 1559)

| # | Requête | Table | R/W | Filtre | Vers |
|---|---------|-------|-----|--------|------|
| 1.2 | `.from('participants').select('*').eq('id', id).single()` (1560) | `participants` | R | `id` (param URL, **non vérifié contre le token**) | `GET /api/patient/me` |
| 1.3 | `.from('bilans').select('*').eq('participant_id', id).order('date')` (1561) | `bilans` | R | `participant_id` = id URL | `GET /api/patient/me` |
| 1.4 | `.from('seances').select('*').eq('participant_id', id).order('date')` (1562) | `seances` | R | `participant_id` = id URL | `GET /api/patient/me` |
| 1.5 | `.from('programmes').select('*').eq('participant_id', id)` (1563) | `programmes` | R | `participant_id` = id URL | `GET /api/patient/me` |
| 1.6 | `.from('documents_patient').select('id, titre, contenu, date_creation').eq('participant_id', id).order('date_creation', {ascending:false})` (1565) | `documents_patient` | R | `participant_id` = id URL | `GET /api/patient/me` |
| 1.7 | `.from('programme_seances').select('*').in('programme_id', v2Rows.map(p=>p.id)).order('ordre')` (1585) | `programme_seances` | R | `programme_id IN (...)` dérivé de 1.5 | `GET /api/patient/me` |
| 1.8 | `.from('programme_planning').select('*').in('programme_id', v2Rows.map(p=>p.id))` (1586) | `programme_planning` | R | idem | `GET /api/patient/me` |
| 1.9 | `.from('programme_exercices').select('*').in('seance_id', seanceRows.map(s=>s.id)).order('ordre')` (1593) | `programme_exercices` | R | `seance_id IN (...)` dérivé de 1.7 | `GET /api/patient/me` |
| 1.10 | `.from('seances_patient').select('id, programme_id, seance_id, date_seance, statut, commentaire_patient, duree_minutes').eq('participant_id', id).order('date_seance',{ascending:false}).limit(15)` (1653) | `seances_patient` | R | `participant_id` = id URL | `GET /api/patient/me` |
| 1.11 | `.from('exercices_realises').select('seance_patient_id, realise').in('seance_patient_id', spRes.data.map(s=>s.id))` (1659) | `exercices_realises` | R | `seance_patient_id IN (...)` dérivé de 1.10 | `GET /api/patient/me` |

> ⚠️ Toutes ces requêtes filtrent par `id` (le paramètre d'URL `/patient/:id`),
> **pas** par un identifiant validé côté serveur. Après migration, le
> filtre doit devenir le `participant_id` extrait du JWT
> (`PATIENT_SESSION_SECRET`), jamais l'`:id` de l'URL — c'est la règle
> centrale de T3/T4 (cohérence token ↔ URL = T4).

### `src/pages/EspacePatient.tsx` — `ModeSeance.sauvegarder()` (écriture, ~ligne 716)

| # | Requête | Table | R/W | Filtre | Vers |
|---|---------|-------|-----|--------|------|
| 1.12 | `.from('seances_patient').insert({ participant_id, programme_id, seance_id, date_seance, statut, commentaire_patient, duree_minutes }).select().single()` (725-737) | `seances_patient` | W (insert) | `participant_id` fourni par le client | `POST /api/patient/seance` |
| 1.13 | `.from('exercices_realises').insert({ seance_patient_id, exercice_id, realise, commentaire })` — une fois par exercice (742-748) | `exercices_realises` | W (insert) | `seance_patient_id` = résultat de 1.12 | `POST /api/patient/seance` |

---

## 2. Portail structure — `/structure/:token` et `/structure/:token/patient/:patientId`

Toutes les requêtes ci-dessous utilisent `createStructurePortailClient(token)`
(`src/lib/supabase.ts`), qui ajoute l'en-tête `x-structure-token` lu sur
chaque requête PostgREST par `structure_token_valide()` (RLS).

### `src/pages/PortailStructure.tsx` (chargement, ~ligne 270-306)

| # | Requête | Table / RPC | R/W | Filtre | Vers |
|---|---------|-------|-----|--------|------|
| 2.1 | `.from('structures').select('id, nom, actif, tarif_seance').eq('token_acces', token).single()` (275-276) | `structures` | R | `token_acces` = token URL | `GET /api/structure/data` (validation token) |
| 2.2 | `.rpc('get_praticien_structure', { p_token: token })` (281) | RPC `get_praticien_structure` | R | `p_token` = token URL | `GET /api/structure/data` |
| 2.3 | `.from('participants').select('*, bilans(*), programmes(*)').eq('structure_id', str.id)` (285-286) | `participants` (+ jointures `bilans`, `programmes`) | R | `structure_id` = id de 2.1 | `GET /api/structure/data` |
| 2.4 | `.from('seances').select('*').in('participant_id', ids).order('date',{ascending:false})` (297) | `seances` | R | `participant_id IN (...)` dérivé de 2.3 | `GET /api/structure/data` |
| 2.5 | `.from('factures_suivi').select('*').eq('structure_id', str.id).order('periode_annee',{ascending:false}).order('periode_mois',{ascending:false})` (301) | `factures_suivi` | R | `structure_id` = id de 2.1 | `GET /api/structure/data` |
| 2.6 | `.from('documents_partages').select('*').eq('structure_id', str.id).order('partage_le',{ascending:false})` (305) | `documents_partages` | R | `structure_id` = id de 2.1 | `GET /api/structure/data` |

---

## 3. Clients Supabase à retirer/adapter (`src/lib/supabase.ts`)

| Export | Usage actuel | Action |
|--------|-------------|--------|
| `supabase` (client anon) | Importé par `PageAccesPatient.tsx` et `EspacePatient.tsx` pour 1.1 à 1.13 | Remplacé par des appels `fetch('/api/patient/...')` avec JWT patient. Le client `supabase` anon reste utilisé ailleurs par le praticien authentifié (hors scope T3/T5). |
| `createStructurePortailClient(token)` | ~~Importé par `PortailStructure.tsx` pour 2.1 à 2.6~~ | ✅ Retiré : remplacé par `fetch('/api/structure/data', { headers: { 'x-structure-token': token } })` (`src/lib/structureApi.ts`). Aucun autre fichier ne l'importait. |

---

## 4. Hors périmètre (signalé, non migré dans T3/T5)

- `src/pages/ClientView.tsx` (`/client/:token`) : route distincte des deux
  espaces visés par la consigne (patient / structure). Non auditée ici —
  à vérifier dans un futur durcissement si elle utilise aussi le client
  anon avec des données sensibles.

---

## État de migration

- [x] 1.1 → `POST /api/patient/login`
- [x] 1.2–1.11 → `GET /api/patient/me`
- [x] 1.12–1.13 → `POST /api/patient/seance`
- [x] 2.1–2.6 → `GET /api/structure/data`
