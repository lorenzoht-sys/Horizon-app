# Sécurité des écritures (RLS) — contrôle d'appartenance des clés étrangères

> Constat du 2026-10-27, chantier de sécurité avant la migration HDS.
> PR : #164 (harnais), #166 (4 premières fuites), #167 (tests), #168 (K1),
> #169 (K2), #170 (K3).

## Le défaut

Les règles de **lecture** (`USING`) étaient correctes : aucun praticien ne
lisait les données d'un autre. Les règles d'**écriture** (`WITH CHECK`)
vérifiaient seulement que **la ligne porte l'identifiant du praticien
connecté** :

```sql
WITH CHECK (praticien_id = auth.uid())
```

Elles ne vérifiaient jamais que **l'objet référencé** par une clé étrangère
(bénéficiaire, contrat, séance, structure, cours, modèle de programme,
dossier…) appartient à ce praticien. Une clé étrangère prouve qu'une ligne
**existe**, jamais qu'elle **appartient** à l'appelant.

Conséquence : un praticien B, connaissant l'identifiant d'un objet d'un
praticien A, pouvait écrire **à son nom** une ligne rattachée à cet objet, ou
**repointer** une de ses lignes vers lui. Le cas le plus grave : B rattachait
son bénéficiaire à la structure de A, et le **portail de la structure de A**
l'affichait (nom, date de naissance, bilans).

Les policies étant **permissives** (combinées par « OU »), il suffisait
qu'**une** des policies d'écriture d'une table soit trop large, y compris une
policy « organisation », pour que la fuite existe.

## Tables corrigées

| Migration | Tables |
|---|---|
| `20261102100000` (#166) | `tests_etalons_activations`, `exercices_libres_activations`, `rappel_preferences`, `participations_cours_collectifs` |
| `20261103100000` (K1, #168) | `bilans`, `contrats`, `seances`, `programmes`, `notes_seances`, `comptes_rendus_seances`, `bilans_brouillons`, `factures_suivi`, `assistant_logs` |
| `20261104100000` (K2, #169) | `participants` (structure, organisation), `documents_partages`, `cours_collectifs`, `templates_structure` |
| `20261105100000` (K3, #170) | `dossier_exercice_membres`, `exercices_personnalises`, `seances_patient`, `exercices_realises` |

Les tests qui le prouvent : `tests/security/rls.spec.ts` (bloc « Lot H ») et
`tests/security/rls-ecriture-cles.spec.ts`, qui tourne aussi sur une base
Supabase locale.

## La règle, pour toute nouvelle table ou policy

1. **Chaque policy d'écriture** (`INSERT`, `UPDATE`, `ALL`) a un `WITH CHECK`
   **explicite**. Un `UPDATE` sans `WITH CHECK` réutilise son `USING`, ce qui
   se relit mal et se perd à la première modification.
2. Pour **chaque clé étrangère** vers un objet appartenant à un praticien, le
   `WITH CHECK` vérifie que l'objet est accessible à l'utilisateur :
   - **bénéficiaire** : `public.acces_participant(participant_id)`
     (propriétaire, ou membre actif de son organisation ; un bénéficiaire
     archivé reste accessible) ;
   - **autre objet** : `EXISTS (SELECT 1 FROM public.<table> x WHERE x.id = <clé>)`,
     filtré par la règle de lecture de cette table : « je ne peux pointer que
     vers ce que je vois » ;
   - **clé facultative** : `(<clé> IS NULL OR …)`.
3. **Toutes** les policies d'écriture de la table, y compris `orga_*`,
   portent le contrôle.
4. **Récursion** : si l'`EXISTS` interrogerait la table protégée elle-même
   (ou une table dont la policy renvoie vers elle), passer par une fonction
   `SECURITY DEFINER`, avec `SET search_path = public`,
   `REVOKE ALL … FROM PUBLIC, anon, authenticated`, puis un `GRANT EXECUTE`
   ciblé. Exemple : `public.cours_accessible` (#166).
5. Pour corriger une policy existante sans toucher à la lecture :
   `ALTER POLICY … WITH CHECK (…)`, qui ne modifie pas le `USING`.
6. Un **test d'écriture croisée** par clé, dans
   `tests/security/rls-ecriture-cles.spec.ts` : insertion et repointage par
   un autre praticien, plus l'écriture légitime du propriétaire (cas archivé
   et organisation pour les tables de bénéficiaire).

## Modèle de policy d'écriture conforme

```sql
-- Table fictive « mesures », rattachée à un bénéficiaire et, en option, à une séance.
DROP POLICY IF EXISTS "mesures_ecriture" ON public.mesures;
CREATE POLICY "mesures_ecriture" ON public.mesures
  FOR ALL TO authenticated
  USING (praticien_id = auth.uid())                    -- lecture : inchangée par la règle
  WITH CHECK (
    praticien_id = auth.uid()                          -- la ligne est à moi
    AND public.acces_participant(participant_id)       -- le bénéficiaire m'est accessible
    AND (seance_id IS NULL                             -- la séance, si renseignée, m'est visible
         OR EXISTS (SELECT 1 FROM public.seances s WHERE s.id = seance_id))
  );
```

Les écritures par `service_role` (routes `api/*`, cron, Edge Functions) ne
sont pas concernées par la RLS. Elles relèvent de la règle « routes API » de
`CHECKLIST_RELEASE.md` (section 3) : tout identifiant reçu du client a un
contrôle d'appartenance explicite.
