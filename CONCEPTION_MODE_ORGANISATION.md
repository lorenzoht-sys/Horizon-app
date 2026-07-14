# Conception — Mode « organisation employeuse propriétaire »

> Document de conception, branche `feature/mode-structure`. Aucune migration ni
> code exécutable ici — tout SQL présenté est **à relire**, pas à exécuter.
>
> Décisions déjà actées :
> 1. L'organisation (EHPAD, centre) détient les données de ses bénéficiaires.
> 2. Un salarié APA qui change d'organisation ne part avec rien : les données
>    restent dans l'organisation d'origine.
> 3. L'organisation a un accès total (pas des statistiques agrégées).
> 4. **Table séparée** du concept `structures` existant (portail client par
>    token) — découplage structurel du risque « portail anonyme ».
> 5. Option A validée : propriété additive + table d'appartenance, déployée en
>    **policies additives** (on n'altère les policies existantes qu'en dernier).
>
> Source de vérité de l'existant : `supabase/_staging_schema_dump.sql`
> (dump prod du 15/06/2026) + migrations postérieures.

---

## 1. Nouvelles tables

### 1.1 Choix du nom : `organisations` — **validé le 14/07/2026**

Nom retenu : **`organisations`** (plutôt que `structures_employeuses`).
Raisons : évite toute collision mentale et SQL avec `structures` (qui reste le
portail client des libéraux) ; court ; le préfixe `organisation_` reste lisible
sur les tables filles.

### 1.2 `organisations`

```sql
CREATE TABLE organisations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom           TEXT        NOT NULL,
  siret         TEXT,                          -- optionnel, facturation/légal futur
  email_contact TEXT,
  actif         BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Volontairement absent, et pour toujours** : toute colonne `token` / `token_acces`,
et toute policy pour le rôle `anon`. C'est la traduction structurelle de la
décision n°4 : ce qui a rendu le portail `structures` risqué (lecture anon par
token) n'existe pas ici, par construction.

### 1.3 `organisation_membres`

```sql
CREATE TABLE organisation_membres (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('intervenant', 'admin')),
  actif           BOOLEAN     NOT NULL DEFAULT true,
  date_debut      DATE        NOT NULL DEFAULT CURRENT_DATE,
  date_fin        DATE,                        -- renseignée au départ du salarié
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id)
);
```

- **Départ d'un salarié** = `actif = false` + `date_fin` renseignée. Ligne
  conservée (traçabilité : qui a eu accès, quand). Il perd l'accès
  immédiatement (la fonction d'accès teste `actif`), les données ne bougent pas.
- `ON DELETE CASCADE` sur `user_id` est ici sans danger : supprimer le compte
  d'un ex-salarié supprime sa *ligne d'appartenance*, pas les données de
  l'organisation (voir §4 pour les données).
- Deux rôles suffisent en v1 : `intervenant` (salarié APA, accès aux dossiers)
  et `admin` (gère aussi les membres et la fiche organisation).

### 1.4 Rattachement : une seule colonne, sur `participants` uniquement

```sql
ALTER TABLE participants
  ADD COLUMN organisation_id UUID REFERENCES organisations(id) ON DELETE RESTRICT;
```

- `NULL` (défaut, toutes les lignes existantes) = **mode libéral inchangé**.
- Non-NULL = le dossier appartient à l'organisation ; `participants.praticien_id`
  change alors de sémantique : « intervenant référent / auteur », plus
  « propriétaire ».
- `ON DELETE RESTRICT` : on ne supprime pas une organisation qui possède encore
  des bénéficiaires (suppression = opération d'offboarding explicite, jamais
  une cascade silencieuse).
- **Aucune autre table ne reçoit `organisation_id`** : toutes les tables du
  dossier remontent déjà au participant (directement ou par jointure), c'est ce
  chemin que la fonction centrale exploite (§3). Une seule racine de propriété
  = un seul endroit à maintenir.

### 1.5 Verrou structurel portail/organisation

```sql
ALTER TABLE participants
  ADD CONSTRAINT participants_orga_ou_portail
  CHECK (organisation_id IS NULL OR structure_id IS NULL);
```

Un bénéficiaire possédé par une organisation ne peut **pas** être rattaché à
une `structures` (portail client par token). Conséquence directe : les policies
`structure_anon_read_*` existantes (qui exposent les participants ayant un
`structure_id` + token valide) ne peuvent mathématiquement jamais matcher un
bénéficiaire d'organisation. C'est le verrou du §5.

### 1.6 RLS des deux nouvelles tables

- `organisations` : SELECT pour les membres actifs ; UPDATE pour les admins ;
  pas de DELETE par policy (offboarding = opération service_role). Création
  d'une organisation en v1 : parcours dédié hors RLS (service_role), le
  créateur devient `admin` — pas de policy INSERT publique.
- `organisation_membres` : SELECT de sa propre ligne (`user_id = auth.uid()`)
  + SELECT/INSERT/UPDATE pour les admins de l'organisation.
- ⚠️ Piège connu : une policy sur `organisation_membres` qui vérifie « suis-je
  admin ? » en relisant `organisation_membres` **s'appelle elle-même**
  (récursion infinie, erreur Postgres 42P17). D'où le passage obligé par les
  fonctions `SECURITY DEFINER` du §3, qui court-circuitent la RLS de la table
  qu'elles lisent.

---

## 2. Liste table par table — la propriété suit-elle le participant ?

### 2.1 « Suit le participant » — accessible aux membres actifs de l'organisation

Le critère : la donnée fait partie du **dossier du bénéficiaire**. Aucune de
ces tables ne change de colonnes ; elles reçoivent uniquement une **policy
additive** appelant `acces_participant()` (§3).

| Table | Chemin vers le participant | Remarque |
|---|---|---|
| `participants` | — (racine) | reçoit `organisation_id` (§1.4) |
| `bilans` | `participant_id` | |
| `contrats` | `participant_id` | contrat de prise en charge du bénéficiaire |
| `seances` | `participant_id` | |
| `notes_seances` | `participant_id` | |
| `programmes` | `participant_id` | |
| `comptes_rendus_seances` | `participant_id` | |
| `retours_seance` | `participant_id` | écriture service_role inchangée |
| `tests_etalons_activations` | `participant_id` | |
| `tests_etalons_resultats` | `participant_id` | |
| `exercices_libres_activations` | `participant_id` | |
| `exercices_libres_validations` | `participant_id` | |
| `documents_patient` | `participant_id` | trigger `set_praticien_id_from_auth()` conservé : `praticien_id` y devient « auteur », ce qui est déjà sa sémantique réelle |
| `seances_patient` | `participant_id` | |
| `exercices_realises` | `seance_patient_id → seances_patient → participant_id` | |
| `programme_seances` | `programme_id → programmes → participant_id` | |
| `programme_planning` | `programme_id → programmes → participant_id` | |
| `programme_exercices` | `seance_id → programme_seances → programmes → participant_id` | |
| `audit_logs` | `participant_id` | lecture seule, comme aujourd'hui |
| `push_subscriptions` | `participant_id` | |
| `rappels_envoyes` | `participant_id` | |

### 2.2 « Reste personnelle au salarié » — aucune policy additive, rien ne change

Le critère : la donnée décrit **le praticien et son organisation de travail
personnelle**, pas un bénéficiaire.

| Table | Pourquoi elle reste personnelle |
|---|---|
| `praticiens` | profil du compte |
| `zones_geographiques` | organisation de tournée du praticien libéral |
| `indisponibilites` | agenda personnel |
| `bilans_brouillons` | brouillons en cours de saisie — un brouillon n'est pas encore une donnée du dossier ; il le devient en étant enregistré comme bilan |
| `rappel_preferences` | préférences d'envoi du praticien (voir cas limite §2.3) |
| `assistant_logs` | historique IA personnel |
| `templates_structure` | modèles de comptes rendus du praticien |
| `structures` | portail client — fonctionnalité du libéral, orthogonale |
| `documents_partages` | partage vers un portail client (voir §5) |
| `structure_access_logs` | logs du portail client |
| `factures_suivi` | outil de facturation du libéral ; une organisation ne se facture pas ses propres bénéficiaires — **hors périmètre v1** (si un besoin « facturation interne » émerge, ce sera un chantier à part) |
| `patient_login_attempts` | service_role uniquement, hors sujet |

### 2.3 Cas limites tranchés — **les 3 validés tels quels pour la v1 (14/07/2026)**

1. **`rappel_preferences`** a deux niveaux : préférences globales du praticien
   (personnelles, restent telles quelles) et préférences par participant
   (lignes avec `participant_id`). Proposition v1 : pour un bénéficiaire
   d'organisation, ce sont **les préférences du référent** (`participants.praticien_id`)
   qui s'appliquent dans le cron — comportement actuel inchangé, zéro
   modification du cron en v1. Le jour où un bénéficiaire change de référent,
   les rappels suivent le nouveau référent. Simple, prévisible, réversible.
2. **`contrats`** : classé « suit le participant » car c'est le contrat de
   prise en charge du bénéficiaire. Le champ `praticien_id` y devient
   « signataire/auteur ». Si en pratique les organisations n'utilisent pas les
   contrats en v1, la policy additive ne gêne rien.
3. **`bilans_brouillons`** : volontairement personnel. Deux salariés ne
   co-rédigent pas un brouillon ; le travail devient partagé au moment où le
   bilan est enregistré dans `bilans`.

---

## 3. Fonctions SQL centrales (prêtes à relire — pas à exécuter)

Deux fonctions, pas une : le test d'appartenance est réutilisé par les policies
des nouvelles tables elles-mêmes (et casse la récursion RLS, §1.6).

```sql
-- ── Appartenance à une organisation ──────────────────────────────────────
-- SECURITY DEFINER : lit organisation_membres en ignorant la RLS de cette
-- table (sinon : récursion infinie quand la policy de organisation_membres
-- appelle cette fonction). STABLE : résultat mis en cache par instruction.
-- search_path épinglé : obligatoire sur toute fonction SECURITY DEFINER
-- (sinon un objet homonyme dans un autre schéma peut détourner la requête).

CREATE OR REPLACE FUNCTION public.est_membre_organisation(p_organisation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organisation_membres m
    WHERE m.organisation_id = p_organisation_id
      AND m.user_id = auth.uid()
      AND m.actif
  );
$$;

-- Variante admin, pour les policies de gestion (organisations, membres) :
CREATE OR REPLACE FUNCTION public.est_admin_organisation(p_organisation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organisation_membres m
    WHERE m.organisation_id = p_organisation_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
      AND m.actif
  );
$$;

-- ── Accès à un dossier bénéficiaire ──────────────────────────────────────
-- LA fonction que toutes les policies additives appellent.
-- Mode libéral : se réduit exactement au test actuel (praticien_id = auth.uid()).
-- Mode organisation : membre actif de l'organisation propriétaire.
-- auth.uid() est NULL pour anon → EXISTS retourne false → aucun accès anon.

CREATE OR REPLACE FUNCTION public.acces_participant(p_participant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM participants p
    WHERE p.id = p_participant_id
      AND (
        p.praticien_id = auth.uid()
        OR (
          p.organisation_id IS NOT NULL
          AND public.est_membre_organisation(p.organisation_id)
        )
      )
  );
$$;

-- Hygiène des droits d'exécution (les 3 fonctions) :
REVOKE ALL ON FUNCTION public.acces_participant(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.est_membre_organisation(uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.est_admin_organisation(uuid)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acces_participant(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.est_membre_organisation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.est_admin_organisation(uuid)  TO authenticated;
```

### Motif de policy additive (le même pour les ~21 tables du §2.1)

```sql
-- Exemple : bilans. Policy AJOUTÉE, les 4 policies bilans_* actuelles restent
-- intactes (les policies PERMISSIVE s'additionnent en OR — un libéral passe
-- toujours par les anciennes, un salarié d'organisation passe par celle-ci).
CREATE POLICY "orga_acces_bilans" ON public.bilans
  FOR ALL TO authenticated
  USING (public.acces_participant(participant_id))
  WITH CHECK (public.acces_participant(participant_id));
```

Pour les tables sans `participant_id` direct (`exercices_realises`,
`programme_*`), le `USING` fait d'abord la jointure existante vers le
participant puis appelle la fonction — même principe, un niveau de sous-requête
en plus. Cas particulier `participants` : la policy porte sur `id`
(`acces_participant(id)`), et le `WITH CHECK` d'INSERT doit en plus exiger
`est_membre_organisation(organisation_id)` quand `organisation_id` est fourni
(on ne crée pas un bénéficiaire dans une organisation dont on n'est pas membre).

⚠️ Performance, à garder en tête pour l'implémentation : ces policies
s'exécutent par ligne. `STABLE` + le plan Postgres limitent le coût, et les
index existants sur `participant_id` portent la jointure, mais il faudra un
index sur `organisation_membres (user_id, organisation_id) WHERE actif` et
vérifier les listes longues (Dashboard) en staging.

---

## 4. FK `ON DELETE CASCADE` → `SET NULL` : liste précise

**Problème** : aujourd'hui, supprimer un compte `auth.users` déclenche la
suppression en cascade de tout ce qu'il « possède ». En mode organisation,
supprimer le compte d'un ex-salarié détruirait les dossiers de l'organisation.

**Constat exact** (dump prod + migrations postérieures) — FK
`praticien_id → auth.users(id) ON DELETE CASCADE` :

### 4.1 À passer en `ON DELETE SET NULL` (données du dossier, doivent survivre)

| # | Table.contrainte | Note |
|---|---|---|
| 1 | `participants.participants_praticien_id_fkey` | colonne déjà nullable |
| 2 | `bilans.bilans_praticien_id_fkey` | déjà nullable |
| 3 | `contrats.contrats_praticien_id_fkey` | déjà nullable |
| 4 | `seances.seances_praticien_id_fkey` | déjà nullable |
| 5 | `notes_seances.notes_seances_praticien_id_fkey` | déjà nullable |
| 6 | `programmes.programmes_praticien_id_fkey` | déjà nullable |
| 7 | `comptes_rendus_seances.comptes_rendus_seances_praticien_id_fkey` | déjà nullable |
| 8 | `retours_seance.praticien_id` (FK de la migration 20260618) | **NOT NULL à lever** en plus du changement de FK |
| 9 | `tests_etalons_activations.praticien_id` (migration 20260620) | **NOT NULL à lever** |
| 10 | `exercices_libres_activations.praticien_id` (migration 20260620) | **NOT NULL à lever** |

Pour 8-10, deux ALTER chacun : `DROP NOT NULL` puis recréation de la FK en
`SET NULL`. Attention effet de bord : `api/patient/retour-seance.ts` refuse
aujourd'hui un participant sans `praticien_id` — à assouplir au palier
applicatif (un bénéficiaire d'organisation dont le référent est parti a un
`praticien_id` NULL légitime).

### 4.2 À laisser en `CASCADE` (données personnelles : meurent avec le compte, c'est voulu)

| Table | |
|---|---|
| `praticiens.id` | profil |
| `zones_geographiques.praticien_id` | |
| `indisponibilites.praticien_id` | |
| `rappel_preferences.praticien_id` | |

### 4.3 Sans FK vers `auth.users` — rien à faire, vérifié

`assistant_logs.praticien_id` (FK vers `praticiens`, sans action de cascade),
`bilans_brouillons` (seule FK : participant), `documents_patient.praticien_id`
et `templates_structure.praticien_id` (UUID sans FK).

### 4.4 Conséquence assumée pour le mode libéral

Après ce changement, supprimer le compte d'un praticien **libéral** ne purge
plus ses données en cascade : elles deviennent orphelines (`praticien_id`
NULL). C'est un changement de comportement à assumer explicitement : la
suppression RGPD d'un compte libéral devra passer par une routine de purge
explicite (service_role), ce qui est de toute façon plus sain qu'une cascade
silencieuse — on trace ce qu'on efface. Aujourd'hui aucun parcours de
suppression de compte n'existe dans l'app, donc aucun comportement utilisateur
ne change à court terme.

> **Arbitrage du 14/07/2026** : point accepté, non bloquant pour ce chantier.
> La routine de purge RGPD (suppression explicite d'un compte libéral) est
> inscrite au **backlog légal** — à traiter avant d'ouvrir un parcours de
> suppression de compte dans l'app.

---

## 5. Politique du portail anonyme existant

Le découplage par table séparée règle le problème par construction. La
politique en quatre règles :

1. **Le portail `structures` ne change pas d'un iota.** Il reste ce qu'il est :
   une fonctionnalité du praticien libéral pour donner à ses *clients* (EHPAD
   facturés) une lecture par token (`structure_token_valide()`, policies
   `structure_anon_read_*`). Aucune modification de ces policies dans ce
   chantier — zéro risque de régression dessus.
2. **`organisations` n'a ni token, ni policy `anon`, jamais.** Tout accès aux
   données d'une organisation passe par un compte authentifié membre
   (`organisation_membres.actif = true`). Si un jour une organisation veut un
   « portail » (direction, familles), ce seront des comptes authentifiés avec
   un rôle dédié — jamais un token anonyme. À inscrire comme règle de revue.
3. **Le verrou structurel est la contrainte CHECK du §1.5** : un bénéficiaire
   d'organisation ne peut pas avoir de `structure_id`, donc aucune policy
   `structure_anon_read_*` ne peut jamais exposer son dossier, même par erreur
   de manipulation. La garantie est dans le schéma, pas dans la discipline.
4. **`documents_partages` (partage vers un portail client)** : de facto
   inaccessible pour un bénéficiaire d'organisation (le partage cible une
   `structures` du praticien, et le CHECK empêche le rattachement). Au palier
   applicatif, masquer aussi l'option de partage « structure » dans la modale
   de relecture quand le bénéficiaire appartient à une organisation, pour que
   l'interface reflète la règle au lieu d'échouer.

---

## 6. Rappel des impacts applicatifs (pour les paliers d'implémentation)

Hors périmètre de ce document mais identifiés, à traiter après la couche SQL :

1. Hooks à filtre explicite `.eq('praticien_id', user.id)` : `useParticipants`,
   `useFactures`, `useStructures`, `useBrouillonBilan`. Seul **`useParticipants`**
   doit évoluer (laisser la RLS filtrer, ou élargir le filtre) ; les trois
   autres concernent des tables « personnelles » (§2.2) et ne changent pas.
2. `api/_lib/patientSession.ts:90` : contrôle dur `patient.praticien_id !== user.id`
   → doit devenir l'équivalent serveur d'`acces_participant()`.
3. `api/patient/retour-seance.ts` : accepter `praticien_id` NULL (§4.1).
4. Cron rappels : inchangé en v1 (décision §2.3.1).
5. Onboarding : création d'organisation + invitation de membres — parcours
   entièrement nouveau, dernier palier.
6. RGPD : l'organisation devient responsable de traitement pour ses
   bénéficiaires — CGU / politique de confidentialité à réviser (hors code).

### Paliers suggérés (chacun livrable et testable seul, sans toucher au précédent)

1. **SQL fondations** : `organisations`, `organisation_membres`, colonne
   `participants.organisation_id`, CHECK, les 3 fonctions, leurs policies RLS
   propres. Aucune policy additive encore → strictement invisible pour
   l'existant.
2. **FK** : les 10 changements CASCADE → SET NULL (§4.1). Invisible aussi
   (aucun parcours de suppression de compte n'existe).
3. **Policies additives** : les ~21 tables du §2.1, testées en staging avec un
   jeu de données à deux organisations + un libéral (tests croisés : le
   salarié A ne voit pas l'organisation B, le libéral ne voit rien changer).
4. **Couche applicative** : `useParticipants`, `patientSession`, `retour-seance`,
   masquage du partage portail.
5. **Onboarding organisation** (création, invitations, gestion des membres).
