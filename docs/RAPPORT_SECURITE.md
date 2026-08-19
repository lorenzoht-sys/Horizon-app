# Rapport de sécurité — Horizon (Mouv'APA)

Audit en cours, branche `audit-securite-global`. Ce fichier est mis à jour
phase par phase (voir le prompt d'audit complet, section "MÉTHODE"). État
actuel : **Phase 1 terminée (checkpoint), aucune correction appliquée**.

**Méthode** : analyse statique du code + des 68 fichiers de
`supabase/migrations/*.sql`, en l'absence d'accès direct à la base Supabase
(staging ou prod) dans cet environnement. Tout finding dont la preuve
repose uniquement sur "le fichier de migration existe dans le repo" est
marqué `Non vérifié` — voir `docs/CARTOGRAPHIE_SECURITE.md` pour le détail
objet par objet.

**Limite connue, acceptée par Lorenzo le 2026-08-17** : le diff de schéma
prod ↔ staging ↔ migrations (initialement prévu avant le harnais de tests,
outillage prêt dans `scripts/dump-schema.ts`) n'a pas été fait. Conséquence
concrète : un run vert de `tests/security/rls.spec.ts` sur staging prouve
le cloisonnement **sur staging**, pas formellement sur prod — si les deux
bases ont dérivé l'une de l'autre (exactement le type d'écart déjà repéré
en F-10), un test vert sur staging pourrait ne rien garantir en prod. Ce
risque reste ouvert tant que le diff n'est pas fait ; à rouvrir si un doute
apparaît sur la fidélité de staging.

**✅ Mise à jour 2026-08-17** : Lorenzo a exécuté les requêtes de vérification
de F-01 sur la vraie base de production (`rjgzeuywwknubpwigozq`, lecture
seule, SQL Editor Supabase Studio). Résultat : **aucune table contenant de
la donnée patient n'a de policy `USING (true)` ni `WITH CHECK (true)`** — la
faille historique la plus grave (comptes-rendus lisibles sans authentification)
est bien corrigée en production. Voir F-01 pour le détail et la découverte
annexe qui en a résulté (F-10, F-11).

---

## Synthèse (mise à jour à chaque phase)

| Gravité | Trouvés (Phase 1) | Corrigés | Preuve par test qui échoue aujourd'hui |
|---|---|---|---|
| Critique | 5 (F-01 historique, F-02, F-03, F-05, F-10 volet policy) | 0 | Aucune — harnais en cours de mise à jour, voir §"Preuve" |
| Élevée | 2 (F-04, F-11) | 0 | Aucune |
| Moyenne | 2 (F-06, F-10 volet documentation) | 0 | Aucune |
| Faible | 2 (F-07, F-08) | 0 | Aucune |
| Info | 1 (F-09) | 0 | Aucune |

**Reclassements 2026-08-17 (sur demande explicite de Lorenzo)** : F-05 et le
volet "policy fantôme" de F-10 passent de Moyenne à **Critique** — une faille
protégée par une seule couche de défense (ici : le `REVOKE` global) se
documente avec la gravité qu'elle aurait si cette couche tombait, pas avec
la gravité atténuée par sa présence actuelle. F-11 passe de Moyenne à
**Élevée** — ce n'est pas une fuite de métadonnées mais un oracle de
validation de secret d'authentification hors rate limiting. **Aucun finding
de ce tableau n'est aujourd'hui prouvé par un test automatisé qui échoue** —
tant que ce n'est pas fait, tout est officiellement `Non vérifié`, quelle
que soit la conviction du raisonnement écrit.

**⚠️ Règle permanente pour tous les lots de correction futurs de cet
audit** : le `REVOKE ALL ... FROM anon` global de
`20260613_rls_anon_lockdown.sql` (Section 3) est une deuxième ligne de
défense indépendante des policies RLS. **Il ne doit jamais être retiré,
simplifié ou considéré comme redondant** dans un futur lot de nettoyage,
même après correction de F-05/F-10, même si toutes les policies `anon`
sont un jour propres. Défense en profondeur : les deux couches restent
nécessaires en permanence, indépendamment l'une de l'autre.

---

## Findings

### [F-01] Statut réel en production des migrations de sécurité critiques
- **Gravité** : Critique (historique) — **résolu**, voir vérification ci-dessous
- **Surface** : RLS / Infra
- **Preuve** : `supabase/migrations/README.md` et `RAPPORT_SECURISATION.md` (racine, antérieur) laissaient penser que la correction de la faille `documents_patient`/`seances_patient USING(true)` n'avait peut-être jamais été appliquée en production. **Vérifié en direct le 2026-08-17** par Lorenzo sur le projet prod `rjgzeuywwknubpwigozq` (SQL Editor, lecture seule) :
  ```sql
  select schemaname, tablename, policyname, cmd, qual, with_check
  from pg_policies
  where schemaname = 'public'
    and (qual = 'true' or qual ilike '%using (true)%'
         or with_check = 'true' or with_check ilike '%true%');
  ```
  Résultat : **4 lignes, toutes sur `tm6_variantes` uniquement** (SELECT/UPDATE/DELETE/INSERT à `true`) — table de référence (catalogue de tests), **aucune donnée patient**. Aucune ligne sur `documents_patient`, `seances_patient`, `bilans`, `programmes`, `seances` ou `programme_*`.
- **Impact concret** : la faille historique (comptes-rendus patient lisibles sans authentification) **n'est pas active en production** — confirmé par requête live, pas par supposition. En revanche, `tm6_variantes` permet à **n'importe quel praticien connecté** (pas un anonyme — GRANT `anon` est révoqué globalement) de modifier/supprimer le catalogue partagé par tous les praticiens : gênant pour l'intégrité des données de référence, mais aucune exposition de donnée de santé.
- **Exploitabilité** : Aucune sur donnée patient (confirmé). Praticien authentifié sur `tm6_variantes` (intégrité d'un catalogue partagé, pas de confidentialité).
- **Correctif proposé** : `tm6_variantes` — restreindre les policies UPDATE/DELETE/INSERT aux praticiens réellement propriétaires de leurs entrées personnalisées (ou, si c'est un catalogue système en lecture seule pour les praticiens, retirer complètement UPDATE/DELETE/INSERT côté `authenticated` et ne les laisser qu'à `service_role`/un back-office). Fait : `supabase/migrations/20260817_securite_01_tm6_variantes_rls.sql`.
- **Statut** : 🛑 **Correctif INVALIDE — casse la fonctionnalité TM6 en prod.** Le run staging du 2026-08-19 a révélé que `20260817_securite_01_tm6_variantes_rls.sql` retire toute policy d'écriture `authenticated` sur `tm6_variantes` (lecture seule pour les praticiens, écriture réservée à `service_role`), alors que `src/hooks/useTm6Variantes.ts` fait ses `insert`/`delete` directement via le client Supabase **authentifié côté navigateur**, sans aucune route backend `service_role`. Ce code est vivant, pas orphelin (voir [RÉG-01] ci-dessous pour la preuve de chemin complet). Appliquer cette migration telle quelle casse silencieusement le bouton "Créer une nouvelle variante" (`Step3_EnduranceMemory.tsx`, étape Endurance du bilan) pour tous les praticiens. **Ne pas appliquer sur staging ni prod avant correction** — voir avertissement ajouté en tête du fichier de migration. Pas de faille active sur donnée patient (ce constat-là reste valable), mais le correctif écrit pour F-01/F-09 doit être réécrit avant d'être rejouable.

### [RÉG-01] Régression : le correctif F-01/F-09 casse la création/suppression de variantes TM6 en prod
- **Origine** : découverte le 2026-08-19 en tentant de faire tourner `tests/security/rls.spec.ts -t "F-01"` sur staging — le test de seed lui-même (`admin.insert(...)` via `service_role`) a d'abord révélé que `tm6_variantes` n'existait même pas sur staging (migration `20260701_tm6_variantes.sql` jamais rejouée) ; une fois la table recréée, une vérification de l'usage réel du code (demandée avant de continuer, pas déduite) a montré que le correctif F-01/F-09 casse une fonctionnalité vivante.
- **Preuve du chemin complet (code vivant, pas mort)** :
  - `src/hooks/useTm6Variantes.ts` : `select('*')` (L22), `insert(...)` (L35), `delete()` (L46), tous via le client Supabase authentifié standard (`../lib/supabase`), aucune route `api/` dédiée (grep sur `api/` : 0 résultat pour `tm6_variantes`).
  - `src/components/bilan/steps/Step3_EnduranceMemory.tsx` : appelle `useTm6Variantes`, bouton "➕ Créer une nouvelle variante" (L258).
  - `src/components/bilan/BilanStepper.tsx` : monte `Step3_EnduranceMemory` aux étapes 2 et 3.
  - `src/pages/NewBilan.tsx`, `src/pages/EditBilan.tsx`, `src/pages/mobile/AppMobile.tsx` : montent `BilanStepper`.
  - `src/App.tsx` : route `/participant/:id/bilan/new` et `/participant/:id/bilan/:bilanId/edit` vers ces pages.
- **Impact concret** : si `20260817_securite_01_tm6_variantes_rls.sql` est appliquée telle quelle (staging ou prod), tout praticien qui clique "Créer une nouvelle variante" ou tente d'en supprimer une reçoit un échec silencieux (`permission denied` côté PostgREST, la fonction retourne juste `undefined` sans afficher d'erreur dans l'UI actuelle) — régression fonctionnelle, pas une nouvelle faille de sécurité.
- **Correctif à revoir** (pas encore écrit) : soit (a) créer une route `api/tm6-variantes/*` en `service_role` et faire pointer `useTm6Variantes.ts` dessus avant de verrouiller la table, soit (b) garder une policy `authenticated` restreinte pour INSERT/DELETE (ex. limitée à un rôle praticien vérifié) plutôt que de tout réserver à `service_role`. Décision à prendre avant de réécrire la migration — hors scope de cette étape (audit du harnais, pas correction).
- **Statut** : Ouvert. Migration existante marquée "NE PAS APPLIQUER EN L'ÉTAT". Le test `[F-01]` **reste dans le harnais** (code vivant, pas de raison de le masquer) — il continuera à échouer légitimement (`permission denied`) tant que le correctif n'est pas réécrit ; c'est le comportement attendu, pas un bug du test.

**Découverte annexe (2026-08-17, en préparant la migration correctrice)** : en cherchant la définition source des 4 policies de `tm6_variantes`, aucune n'existe dans un fichier de migration versionné — `20260701_tm6_variantes.sql` crée la table sans RLS ni policy. Ces 4 policies ont donc été créées directement dans Supabase Studio, en dehors de tout historique versionné, **exactement le même schéma que F-10** (objets existant en prod, absents des migrations). Ce n'est donc pas un cas isolé : au moins deux familles d'objets (`documents_partages`/`bilans_brouillons`/`get_praticien_structure` pour F-10, et les policies `tm6_variantes` ici) ont été modifiées hors processus de migration. Ça renforce la limite documentée en tête de ce rapport sur la fidélité de `supabase/migrations/` comme source de vérité — et la valeur du diff de schéma prod/staging/migrations que Lorenzo a choisi de reporter (voir section "Limite connue").

### [F-02] Code d'accès patient généré par `Math.random()`, pas un CSPRNG
- **Gravité** : Critique
- **Surface** : Auth
- **Preuve** : `src/utils/codeAcces.ts:17` — génération du `code_acces` (8 caractères, utilisé pour la connexion `/patient`) via `Math.random()`.
- **Impact concret** : `Math.random()` n'est pas cryptographiquement sûr ; sa sortie peut être prédite en observant plusieurs valeurs générées (le générateur interne du moteur JS n'est pas conçu pour résister à ça). Un attaquant capable d'observer/déduire l'état du générateur pourrait prédire ou restreindre fortement l'espace des codes d'accès patient valides, contournant le rate limiting qui suppose un espace de 2·10⁹+ combinaisons réellement aléatoires.
- **Exploitabilité** : Anonyme
- **Correctif proposé** : remplacer par `crypto.randomBytes` (Node, côté génération serveur si c'est fait côté API) ou `crypto.getRandomValues` (si généré côté navigateur — à vérifier où `codeAcces.ts` est réellement appelé, praticien ou serveur). Garder la même longueur/alphabet pour ne pas casser les codes déjà distribués aux patients existants (rotation progressive, pas un big-bang).
- **Statut** : **Non corrigé.** Constat de code confirmé (`Math.random()` toujours en place). Facteur atténuant confirmé par lecture directe du code (pas juste la migration) : le rate limiting existe bel et bien et est branché (`api/_lib/patientAuth.ts` : `checkRateLimit`/`recordLoginAttempt`, 5 tentatives/15 min/IP, table `patient_login_attempts`) — donc l'exploitabilité pratique de la prédictibilité de `Math.random()` est réduite, mais le problème de fond (générateur non cryptographique pour un secret d'authentification) reste entier. Hors scope du pack de correctifs appliqué le 2026-08-17 (aucun fichier touché pour ce finding) — reste à faire.

### [F-03] Portail structure : sur-exposition de colonnes sensibles (`select('*')`)
- **Gravité** : Critique / Élevée (à confirmer selon les colonnes réellement présentes en prod)
- **Surface** : API
- **Preuve** : `api/structure/data.ts:35` — la requête sur `participants` utilise `select('*', bilans(*), programmes(*))`. Comparer avec `api/patient/me.ts`, qui filtre explicitement les colonnes renvoyées (`visibilite_beneficiaire`) avant réponse.
- **Impact concret** : selon les colonnes réellement présentes sur `participants` en production (à confirmer — la cartographie liste notamment `code_acces`, potentiellement des champs bancaires et le champ `rgpd`/anamnèse), un token de structure valide pourrait recevoir en réponse HTTP des données que le portail structure n'a jamais besoin d'afficher : code d'accès patient d'un autre système, IBAN/BIC, antécédents médicaux complets — alors que le rôle "structure" n'a besoin que d'un sous-ensemble limité (nom, séances, facturation).
- **Exploitabilité** : Structure (détenteur d'un token valide, donc pas anonyme — mais un tiers externe à la relation praticien-patient)
- **Correctif proposé** : remplacer `select('*', ...)` par une liste explicite de colonnes correspondant strictement à ce que l'UI du portail structure affiche (`id, prenom, nom, ...`), sur le modèle de `api/patient/me.ts`.
- **Statut** : **Corrigé (code écrit, non testé sur staging).** `api/structure/data.ts` remplace `select('*', bilans(*), programmes(*))` par une liste explicite de colonnes, vérifiée contre `PortailStructure.tsx` (retire `code_acces`, IBAN/BIC, `rgpd`/antécédents, notes cliniques praticien). `npm run typecheck:api` vert. Non testé contre une vraie requête HTTP sur staging.

### [F-04] Token structure sans expiration ni rotation
- **Gravité** : Élevée
- **Surface** : Auth
- **Preuve** : `supabase/migrations/20260604_structures.sql` — colonne `structures.token_acces`, aucune colonne `expires_at`, aucune logique de rotation dans `api/structure/data.ts` / `api/_lib/structureAuth.ts`.
- **Impact concret** : un lien de structure qui fuit une fois (capture d'écran, transfert de compte du côté de la structure partenaire, ancien salarié de la structure) reste valide indéfiniment — aucun moyen de le révoquer sans désactiver toute la structure (`actif = false`).
- **Exploitabilité** : Structure (détenteur d'un lien qui a fuité)
- **Correctif proposé** : ajouter `expires_at` + endpoint/action de rotation manuelle par le praticien (regénérer le token), journaliser chaque usage (`structure_access_logs` existe déjà — bien, mais ne permet pas la révocation, seulement la traçabilité a posteriori).
- **Statut** : **Non corrigé.** Nécessite une migration (colonne `expires_at`) + UI praticien pour la rotation — pas dans le périmètre du pack appliqué le 2026-08-17. Reste à faire.

### [F-05] Policies fantômes `anon_read_*` — protégées par une seule couche de défense (le `REVOKE` global)
- **Gravité** : **Critique** (reclassé — voir note de méthode ci-dessous)
- **Surface** : RLS
- **Preuve** : `supabase/migrations/20260620_consolidation_seances_patient.sql` lignes 67-69, 112-114, 163-165 — policies `FOR SELECT TO anon USING (true)` sur `programme_seances`, `programme_planning`, `programme_exercices`, créées **après** que `20260620_audit_securite_rls.sql` ait supprimé ces mêmes policies (ordre lexicographique des deux fichiers datés du même jour : `audit_...` s'exécute avant `consolidation_...`).
- **Impact concret** : aujourd'hui, la seule chose qui empêche n'importe qui sur Internet de lire ces 3 tables (données de programmes patient) est le `REVOKE ALL ... FROM anon` global de `20260613_rls_anon_lockdown.sql`. **Une seule couche de défense = traité comme actif**, pas comme un risque théorique : si cette couche unique tombe (migration future qui réémet un `GRANT` sans le savoir, restauration partielle de schéma, erreur de script), l'accès anonyme complet à des données de santé est réactivé instantanément, sans qu'aucune nouvelle policy ne soit créée. C'est exactement le scénario qui s'est produit une fois dans l'historique de ce projet (cf. la faille `documents_patient`/`seances_patient USING(true)`, F-01) — rien ne garantit que ça ne se reproduise pas sur ces 3 tables précises.
- **Exploitabilité** : Anonyme, conditionnelle à la persistance du `REVOKE` global — **et c'est précisément pour ça que c'est Critique, pas Moyenne** : la gravité d'un finding RLS se juge sur ce qui est *possible dans le schéma*, pas sur la couche de défense qui, aujourd'hui, l'empêche.
- **Correctif proposé** : migration corrective qui fait `DROP POLICY IF EXISTS` sur les 3 policies fantômes, pour que le schéma ne contienne plus aucune trace de `TO anon USING (true)`, même inerte. **⚠️ Cette migration ne doit JAMAIS toucher au `REVOKE ALL ... FROM anon` de `20260613_rls_anon_lockdown.sql` — ce verrou reste la deuxième ligne de défense après le DROP, il ne se substitue pas à elle et ne doit pas être "simplifié" ou retiré dans un futur lot de nettoyage sous prétexte qu'il fait doublon avec des policies propres. Défense en profondeur : les deux couches restent nécessaires.**
- **Statut** : **Corrigé (code écrit, non testé sur staging).** `supabase/migrations/20260817_securite_02_ghost_policies_programmes.sql` — `DROP POLICY` sur les 3 policies fantômes, sans toucher au `REVOKE` global. Un test dédié existe dans `tests/security/rls.spec.ts` (`[F-05]`, introspection `pg_policies`) mais n'a jamais tourné (pas d'accès staging dans cette session) — à exécuter avant/après cette migration pour confirmer.

### [F-06] `audit_logs` : garantie append-only non verrouillée au niveau base pour `service_role`
- **Gravité** : Moyenne
- **Surface** : RLS
- **Preuve** : `supabase/migrations/20260613_audit_logs.sql` — aucune policy `UPDATE`/`DELETE` pour aucun rôle (confirmé par grep : `grep -rn "audit_logs" supabase/migrations/*.sql | grep -iE "update|delete"` ne retourne qu'un commentaire). RLS bloque donc `authenticated`, mais **RLS ne s'applique jamais à `service_role`**, qui pourrait modifier/supprimer des lignes d'audit sans qu'aucune policy ne l'en empêche.
- **Impact concret** : si une route API compromise ou un bug applicatif utilisant `service_role` modifiait ou supprimait des lignes d'`audit_logs`, rien au niveau base ne s'y opposerait — la garantie "append-only" repose entièrement sur la discipline du code, pas sur un verrou technique. Pour un journal d'audit RGPD (traçabilité des accès aux données de santé), c'est une garantie insuffisante.
- **Exploitabilité** : Accès physique/compromission (nécessite d'obtenir la clé `service_role`, pas un scénario "anonyme depuis Internet")
- **Correctif proposé** : trigger `BEFORE UPDATE OR DELETE ON audit_logs` qui lève une exception systématiquement (`RAISE EXCEPTION 'audit_logs est append-only'`), sans exception pour aucun rôle — la seule façon de "supprimer" serait une purge RGPD documentée et explicite (DDL manuel, pas une requête applicative).
- **Statut** : **Corrigé (code écrit, non testé sur staging).** `supabase/migrations/20260817_securite_03_audit_logs_immuable.sql` — trigger `BEFORE UPDATE OR DELETE ON audit_logs` qui lève systématiquement une exception, sans exception pour aucun rôle (y compris `service_role`, seul rôle que RLS ne bloque jamais). Test dédié dans `tests/security/rls.spec.ts` (`[F-06]`), conçu pour échouer avant ce correctif et passer après — jamais exécuté (pas d'accès staging dans cette session).

### [F-07] `evenements_agenda` : policy UPDATE sans clause `WITH CHECK` explicite
- **Gravité** : Faible (hygiène — pas une vulnérabilité confirmée)
- **Surface** : RLS
- **Preuve** : `supabase/migrations/20260715_evenements_agenda.sql:52-54` — `CREATE POLICY "evenements_agenda_update" ... FOR UPDATE USING (praticien_id = auth.uid())`, pas de `WITH CHECK`.
- **Impact concret** : **PostgreSQL applique par défaut la clause `USING` comme `WITH CHECK` implicite pour une policy `UPDATE` qui n'en définit pas** (comportement documenté de Postgres, pas une faille de ce projet) — donc en pratique, un praticien ne peut ni cibler ni produire une ligne `praticien_id != auth.uid()`. Listé ici par souci de complétude (correspond au point de vigilance explicitement demandé par le prompt d'audit), mais **ce n'est pas un vecteur d'exploitation réel** avec la sémantique Postgres actuelle.
- **Exploitabilité** : Aucune (comportement par défaut sûr)
- **Correctif proposé** : ajouter `WITH CHECK (praticien_id = auth.uid())` explicitement, uniquement pour la lisibilité/l'auditabilité du code (éviter qu'un futur lecteur suppose — à tort — qu'il y a un trou), pas pour combler une faille réelle.
- **Statut** : **Corrigé (code écrit, non testé sur staging).** `supabase/migrations/20260817_securite_04_evenements_agenda_with_check.sql` ajoute `WITH CHECK (praticien_id = auth.uid())` explicitement — rappel : aucun comportement réel ne change (Postgres appliquait déjà `USING` comme `WITH CHECK` implicite), c'est un correctif de lisibilité, pas la fermeture d'un exploit. Test `[F-07]` dans `tests/security/rls.spec.ts` (marqué "hygiène, pas un exploit") jamais exécuté.

### [F-08] `set_praticien_id_from_auth()` : `SECURITY DEFINER` sans `search_path` figé
- **Gravité** : Faible
- **Surface** : RLS
- **Preuve** : `docs/CARTOGRAPHIE_SECURITE.md` §3 — seule fonction du projet sans `SET search_path`, les 7 autres fonctions `SECURITY DEFINER` plus récentes suivent la convention.
- **Impact concret** : vecteur d'élévation de privilège classique en théorie (un objet homonyme dans un schéma placé avant `public` dans le `search_path` de la session pourrait être exécuté à la place de l'attendu) ; impact réel probablement faible ici car la fonction ne fait qu'un `NEW.praticien_id = auth.uid()`, mais reste un point d'hygiène à corriger par cohérence avec le reste du projet.
- **Exploitabilité** : nécessite déjà un accès élevé à la base pour créer un objet homonyme — scénario peu réaliste dans ce contexte, mais correction triviale.
- **Correctif proposé** : `ALTER FUNCTION set_praticien_id_from_auth() SET search_path = public;`
- **Statut** : **Corrigé (code écrit, non testé sur staging).** `supabase/migrations/20260817_securite_05_search_path_set_praticien_id.sql` — `ALTER FUNCTION set_praticien_id_from_auth() SET search_path = public`, sans redéfinir le corps de la fonction (pas de risque de divergence avec la définition existante en prod). Test `[F-08]` dans `tests/security/rls.spec.ts` jamais exécuté.

### [F-09] `tm6_variantes` : table sans RLS activée
- **Gravité** : Info
- **Surface** : RLS
- **Preuve** : `supabase/migrations/20260701_tm6_variantes.sql` — pas de `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- **Impact concret** : aucun — table de référence (catalogue de variantes de test fonctionnel), aucune colonne de donnée patient/praticien.
- **Exploitabilité** : —
- **Correctif proposé** : activer RLS par hygiène/cohérence globale (toute table `public` devrait avoir RLS activée, même si la policy résultante est "lecture pour tous les authentifiés"), sans urgence.
- **Statut** : **Corrigé (code écrit, non testé sur staging).** `supabase/migrations/20260817_securite_01_tm6_variantes_rls.sql` (même fichier que le correctif F-01, F-09 traité en premier dans ce fichier car il doit s'appliquer avant que les policies resserrées par F-01 aient un effet) — `ALTER TABLE tm6_variantes ENABLE ROW LEVEL SECURITY`. Test `[F-09]` dans `tests/security/rls.spec.ts` jamais exécuté.

### [F-10] `documents_partages`, `get_praticien_structure()`, `bilans_brouillons` existent réellement en prod — contrairement à ce qu'affirmait la documentation du projet
- **Gravité** : **Critique** pour le volet policy fantôme sur `documents_partages` (même raisonnement que F-05 — protection à une seule couche, traitée comme active) ; **Moyenne** pour le volet documentation trompeuse (risque de processus, distinct de l'exploitabilité)
- **Surface** : Infra / RLS
- **Preuve** : `supabase/migrations/README.md` affirmait que ces objets "n'ont jamais été réellement appliqués en production". **Vérifié en direct le 2026-08-17** :
  ```sql
  select table_name from information_schema.tables
  where table_schema = 'public' and table_name in ('documents_partages', 'bilans_brouillons');
  -- → documents_partages, bilans_brouillons : les deux existent
  select proname from pg_proc where proname = 'get_praticien_structure';
  -- → get_praticien_structure existe
  ```
- **Impact concret** : `documents_partages` a bien RLS activée avec, dans l'état actuel du fichier de migration `20260607_documents_partages.sql`, une seule policy correctement scopée (`praticien_gere_partages`, via `participant_id → participants.praticien_id`). **Mais** l'historique des migrations montre qu'une policy `structure_anon_read_documents_partages` a été recréée par `20260608_fix_structure_anon_rls.sql` (bloc conditionnel) **après** la création de la table, et que `20260613_rls_anon_lockdown.sql` ne la mentionne jamais explicitement dans ses `DROP POLICY` (contrairement à `participants`/`bilans`/`seances`/`programmes`/`factures_suivi`, listés un par un en Section 2) — seul le `REVOKE ALL ... FROM anon` global (Section 3) neutralise cette policy aujourd'hui. **C'est exactement le même schéma que F-05 (policy fantôme)**, sur une table dont l'existence même était mise en doute par la documentation. Voir aussi F-11 pour `get_praticien_structure()`.
- **Exploitabilité** : Anonyme (conditionnelle à un futur `GRANT` malencontreux sur `documents_partages`, comme F-05).
- **Correctif proposé** : (1) `DROP POLICY IF EXISTS "structure_anon_read_documents_partages" ON documents_partages;` dans la même migration corrective que F-05 — **⚠️ ne pas toucher au `REVOKE ALL ... FROM anon` global à cette occasion, même raisonnement que F-05.** (2) Corriger `supabase/migrations/README.md` pour refléter l'état réel confirmé en prod — une documentation de migration qui ment sur l'état de la base est un risque en soi (elle a été prise au mot dans la Phase 0 de cet audit, et aurait pu faire classer `documents_partages` comme "sans objet" à tort).
- **Statut** : **Corrigé (code écrit, non testé sur staging)** pour le volet policy fantôme — `supabase/migrations/20260817_securite_06_ghost_policy_documents_partages.sql` : `DROP POLICY IF EXISTS "structure_anon_read_documents_partages"`, dans un bloc conditionnel qui ne s'exécute que si la table existe (même garde que `20260608_fix_structure_anon_rls.sql`), sans toucher au `REVOKE` global. Test `[F-10]` dans `tests/security/rls.spec.ts` jamais exécuté. Volet documentation trompeuse également corrigé : voir `supabase/migrations/README.md` (mise à jour du même jour, diff distinct de ce commit).

### [F-11] `get_praticien_structure()` reste appelable directement par le rôle `anon` via l'API REST Supabase, en contournant la route serverless
- **Gravité** : **Élevée** (reclassé de Moyenne — voir justification ci-dessous)
- **Surface** : RLS / API
- **Preuve** : `supabase/migrations/20260607_praticien_portail_structure.sql:23` — `grant execute on function get_praticien_structure(text) to anon;`. Recherche dans les 68 migrations (`grep -rn "get_praticien_structure" supabase/migrations/`) : **ce GRANT n'est jamais révoqué**, contrairement à `structure_token_valide()` dont le GRANT `anon` est explicitement révoqué par `20260613_rls_anon_lockdown.sql:57`. Confirmé en prod : la fonction existe (F-10) et rien dans l'historique ne retire son exécution à `anon`.
- **Recherche d'appelants (avant correctif, comme demandé)** : `grep -rn "get_praticien_structure" src/ api/` → **aucun résultat, dans aucun des deux dossiers**. `api/structure/data.ts:34` récupère les infos du praticien via `supabase.from('praticiens').select('prenom, nom, titre, email, telephone')...` (client `service_role`), **pas** via cette fonction RPC. Le portail (`src/pages/PortailStructure.tsx`) consomme uniquement `/api/structure/data`. **Conclusion : cette fonction est orpheline, aucun code actuel n'en dépend — un `REVOKE EXECUTE` ne casse rien chez Pierre.**
- **Impact concret** : Supabase expose automatiquement toute fonction `SECURITY DEFINER` accordée à `anon` via son API REST (`POST /rest/v1/rpc/get_praticien_structure`), avec uniquement la clé `anon` publique (embarquée dans le bundle front-end). **Le risque réel n'est pas la donnée retournée (nom/email/téléphone du praticien, pas une donnée de santé) — c'est que la fonction constitue un oracle binaire "ce token existe / n'existe pas"**, utilisable pour tester des `token_acces` en masse : ce chemin passe par l'API REST générique de PostgREST, **entièrement en dehors** de tout rate limiting qui pourrait exister côté `api/structure/data.ts`. Combiné à F-04 (token structure sans expiration ni rotation), un token capturé une fois — ou un espace de tokens insuffisamment grand — devient testable indéfiniment et sans limite de débit applicative. C'est un contournement d'authentification (élévation : de "aucun accès" à "oracle de validité d'un secret d'auth"), pas juste une fuite de métadonnées — d'où le passage en Élevée.
- **Exploitabilité** : Anonyme.
- **Correctif proposé** : `REVOKE EXECUTE ON FUNCTION get_praticien_structure(text) FROM anon;` — confirmé sans risque de régression (voir recherche d'appelants ci-dessus). Envisager ensuite un `DROP FUNCTION` complet dans un lot de nettoyage ultérieur, une fois le REVOKE validé sur staging.
- **Statut** : **Corrigé (code écrit, non testé sur staging).** `supabase/migrations/20260817_securite_07_revoke_get_praticien_structure.sql` — `REVOKE EXECUTE ON FUNCTION get_praticien_structure(text) FROM anon`. Recherche d'appelants faite avant le correctif (comme exigé) : aucun résultat dans `src/` ni `api/` — fonction orpheline, ce REVOKE ne casse aucun chemin applicatif connu. Test `[F-11]` dans `tests/security/rls.spec.ts` jamais exécuté.

---

## Vérification anti-régression des correctifs déjà écrits (2026-08-19)

Déclenchée par la découverte de [RÉG-01] (le correctif F-01/F-09 casse
`useTm6Variantes.ts`) : même vérification (grep de l'objet touché dans
`src/`/`api/`, lecture du chemin d'appel jusqu'à une route montée) appliquée
aux 7 autres migrations `20260817_securite_*` déjà écrites.

| Migration | Finding | Objet touché | Usage client trouvé | Verdict |
|---|---|---|---|---|
| `securite_02` | F-05 | policies `anon` fantômes sur `programme_seances/planning/exercices` | `useProgrammeV2.ts`, `AssistantPage.tsx` — praticien authentifié uniquement ; `EspacePatient.tsx`/`PageAccesPatient.tsx` n'y touchent pas ; aucun appel dans `api/` | Pas de régression trouvée (voir limite ci-dessous) |
| `securite_03` | F-06 | trigger append-only sur `audit_logs` | seul usage écrit = `api/_lib/patientAuth.ts:97`, un `INSERT` service_role. Aucun UPDATE/DELETE nulle part dans `src/`/`api/` | Pas de régression — le trigger ne bloque que UPDATE/DELETE |
| `securite_04` | F-07 | `WITH CHECK` explicite sur `evenements_agenda` | n/a | Sûr par construction (Postgres appliquait déjà la même règle implicitement) |
| `securite_05` | F-08 | `search_path` sur `set_praticien_id_from_auth()` | n/a | Sûr — ne change ni corps ni comportement de la fonction |
| `securite_06` | F-10 | policy `anon` fantôme sur `documents_partages` | écrit par `AssistantPage.tsx:1384` (praticien authentifié, autre policy) ; lu uniquement par `api/structure/data.ts:64` (service_role) | Pas de régression trouvée (voir limite ci-dessous) |
| `securite_07` | F-11 | `REVOKE EXECUTE` sur `get_praticien_structure` | reconfirmé : 0 appelant dans `src/`/`api/` | Pas de régression |
| `securite_08` | (Phase 2, hors F-01..F-11) | seuil `claude_rate_limit` (30 req/h/praticien) | voir sous-finding dédié ci-dessous | Seuil à revoir, pas une régression de disponibilité d'accès |

**⚠️ Limite de cette vérification, à ne pas perdre de vue** (relevée à
raison — cette méthode a un angle mort) : "zéro usage trouvé par grep dans
`src/`" prouve seulement que **l'app React elle-même** ne dépend pas de la
policy retirée. Ça ne couvre pas :
- un accès direct à l'API PostgREST avec la clé `anon` **en dehors de
  l'app** (curl, script tiers, page statique non versionnée ici) — c'est
  d'ailleurs exactement le vecteur d'exploitation que F-05/F-10 documentent
  eux-mêmes, donc l'absence de dépendance interne ne dit rien sur
  l'existence d'un dépendant externe légitime ;
- un lien partagé public qui vivrait hors de ce dépôt (ex. une page
  générée dynamiquement et distribuée par un autre canal) ;
- le mode hors-ligne PWA — vérifié séparément (`vite.config.ts`,
  `VitePWA`/`workbox`) : le service worker ne fait du `runtimeCaching` que
  sur les polices Google Fonts, aucune requête Supabase/PostgREST n'est
  interceptée ou rejouée hors-ligne, donc ce vecteur précis est écarté pour
  `securite_02`/`securite_06` — mais cette vérification devrait être
  refaite à chaque nouvelle migration touchant une policy `anon`, pas
  supposée acquise.

**[F-12] Seuil de rate limiting Claude (30 req/h/praticien) mal calibré par rapport à l'usage réel**
- **Gravité** : Faible (disponibilité, pas une faille de sécurité — le mécanisme lui-même est correct)
- **Preuve** : le commentaire qui justifie le seuil (`api/_lib/rateLimit.ts:9-13`) dit *"pas un chat conversationnel à haute fréquence"* — faux : `AssistantPage.tsx` est un chat multi-tours (`genererReponse`, historique, régénération, `callClaudeAPI` appelé à chaque message). Une seule génération de programme pour **un** patient coûte déjà 2 appels (`genererQuestionsClarification` + `genererProgrammeStructure`, `src/utils/genererProgrammeIA.ts:124` et `:305` — les boucles `for` des lignes 272/365 sont du traitement local, pas des appels réseau).
- **Impact concret** : sur une session d'une heure où Pierre enchaîne 6 à 8 patients (interprétation + génération de programme + quelques échanges de chat chacun), 24 à 40 appels sont plausibles — au-dessus ou tout contre la limite de 30/h, pour un usage légitime, pas un abus. Point positif à noter : le compteur n'incrémente que sur une réponse Claude réussie (`api/claude.ts:98-101`), une panne Anthropic ne consomme donc pas le quota. Mais le message d'erreur (`api/claude.ts:37`, "réessayez dans un instant") ne donne aucun délai réel (pas de `Retry-After`), donc un praticien bloqué ne sait pas combien de temps attendre.
- **Correctif proposé** : soit relever le seuil (ex. 60-80/h) pour absorber une session multi-patients chargée, soit distinguer un coût par type d'appel (génération structurée Sonnet vs. question de chat Haiku), soit renvoyer un délai d'attente exploitable par l'UI. Pas tranché — nécessite une discussion produit, pas juste un chiffre.
- **Statut** : Ouvert, non corrigé. Migration `securite_08` déjà appliquée (créée `claude_rate_limit`) — le seuil applicatif (`CLAUDE_RATE_LIMIT_MAX` dans `api/_lib/rateLimit.ts`) reste à ajuster séparément, pas de migration à rejouer pour ça (c'est une constante côté code, pas en base).

---

## Note de méthode — mode organisation

Le mode « organisation » (migrations `20260714_*`/`20260715_*`) élargit
volontairement le modèle "praticien A ↔ praticien B totalement étanches" :
deux praticiens membres actifs d'une même organisation au statut `active`
peuvent légitimement voir les mêmes bénéficiaires, via les policies
`orga_acces_*` (fonction `acces_participant()`). Ce n'est **pas** un finding
— c'est une fonctionnalité intentionnelle — mais le harnais de tests
`tests/security/rls.spec.ts` doit continuer à vérifier séparément que deux
praticiens de **deux organisations différentes** (ou un praticien libéral
hors organisation) restent bien étanches entre eux ; c'est le cas testé par
défaut (les fixtures de test ne créent aucune organisation commune entre
praticien A et praticien B).

---

## Preuve — `tests/security/rls.spec.ts`

Harnais Vitest écrit (voir le fichier). **Il n'a jamais été exécuté avec un
vrai projet Supabase de staging** dans cet environnement (pas de
`SUPABASE_TEST_URL`/`SUPABASE_TEST_SERVICE_ROLE_KEY` disponibles) — la
suite est donc entièrement `describe.skip` (32 tests marqués "skipped",
zéro "passed"). **Aucun des findings RLS ci-dessus n'est donc prouvé par un
test qui passe.** Ce fichier devient une preuve réelle seulement le jour où
Lorenzo fournit ces variables (staging, jamais la prod) et où la commande
`npm run test -- tests/security/rls.spec.ts` est exécutée avec un résultat
vert.

## `supabase db lint`

Tenté (`npx supabase db lint`) — échoue immédiatement : `dial tcp
127.0.0.1:54322: connectex` (le lint du CLI Supabase nécessite une instance
Postgres locale via Docker, non disponible dans cet environnement). Non
exécuté, pas de résultat à rapporter. À relancer par Lorenzo avec `supabase
start` (Docker) s'il veut ce lint en plus de l'analyse de ce rapport.

---

## Prochaine étape

🛑 **CHECKPOINT 2 (2026-08-19)** — les 11 findings (F-01 à F-11) ont
désormais un correctif écrit et commité (migrations `20260817_securite_01`
à `08`, plus le pack `2bd4b44`/`747c6c8`/`2995e68`). **Aucun n'a été testé
sur staging** — le harnais `tests/security/rls.spec.ts` reste entièrement
`describe.skip` faute de `SUPABASE_TEST_URL`/`SUPABASE_TEST_SERVICE_ROLE_KEY`
dans cette session. Rien de tout ça n'a été exécuté contre une base réelle,
staging ou prod. Prochaine étape réelle : Lorenzo fournit les identifiants
de staging, faire tourner `npm run test -- tests/security/rls.spec.ts` avec
un résultat vert, **avant** tout passage en production. Pas de Phase 2 tant
que ce n'est pas fait.
