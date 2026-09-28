-- ============================================================================
-- VÉRIFICATION LECTURE SEULE — TM6 (anciens Stepper) et Apley — PRODUCTION
-- ============================================================================
-- À lancer dans Supabase > SQL Editor de la PRODUCTION.
--
-- ⚠️ CINQ requêtes SELECT, AUCUNE écriture (aucun INSERT / UPDATE / DELETE).
-- ⚠️ Lancer LES REQUÊTES UNE PAR UNE : sélectionner UN bloc (de « -- REQUÊTE n »
--    jusqu'au « ; » final), puis Run. Le SQL Editor n'affiche que le résultat de
--    la dernière requête exécutée.
-- Aucun nom ni donnée personnelle dans les résultats : 8 caractères d'identifiant de
-- bilan, des dates, des nombres, et le nom des variantes de test (texte libre du praticien).
-- ⚠️ Nom réel retiré de ce fichier (données de santé) : la requête 1 contient un
-- placeholder <NOM_BENEFICIAIRE_REFERENCE> à remplacer avant exécution. Ne jamais
-- recommiter ce fichier avec un nom réel renseigné.
--
-- Ce que l'on cherche : dans quelle FORME les TM6 sont stockés (anciens Stepper), et si
-- des résultats ont été effacés par un ré-enregistrement (bug de bilanToDb, PR A).
-- ============================================================================


-- ── REQUÊTE 1 — Cas de référence : forme de ses TM6 et de son Apley ───────────
-- ⚠️ Remplacer les placeholders ci-dessous par le nom réel avant exécution.
select left(b.id::text, 8)                         as bilan,
       b.date, b.type, b.trimestre,
       b.tm6_mode                                  as mode,
       b.tm6_distance_metres                       as dist,
       b.tm6_repetitions                           as repet,
       b.tm6_nb_pas                                as nb_pas,
       b.tm6_nb_tours                              as nb_tours,
       v.nom                                       as variante,
       v.type_mesure                               as variante_type,
       (b.tm6_fc_avant is not null or b.tm6_spo2_avant is not null or b.tm6_borg_rpe is not null)
                                                   as tm6_realise_selon_fc,
       b.apley_data->>'score'                      as apley_score,
       (p.tests_actifs::text like '%apley%')       as apley_dans_profil
from bilans b
join participants p on p.id = b.participant_id
left join tm6_variantes v on v.id = b.tm6_variante_id
where p.nom ilike '<NOM_BENEFICIAIRE_REFERENCE>%' and p.prenom ilike '<INITIALE_PRENOM>%'
order by b.date;


-- ── REQUÊTE 2 — Formes de TM6 dans TOUS les bilans (comptages seulement) ──────
select
  case
    when tm6_mode in ('stepper', 'marche_sur_place') then 'nouveau modèle : ' || tm6_mode
    when tm6_variante_id is not null then 'variante personnalisée'
    when coalesce(tm6_distance_metres, 0) > 0 and (tm6_nb_pas is not null or tm6_repetitions is not null)
      then 'AMBIGU : distance ET pas'
    when coalesce(tm6_distance_metres, 0) > 0 then 'marche (distance)'
    when tm6_nb_pas is not null or tm6_repetitions is not null then 'ANCIEN PAS sans mode (à risque)'
    when tm6_nb_tours is not null then 'anciens tours'
    when (tm6_fc_avant is not null or tm6_spo2_avant is not null or tm6_borg_rpe is not null or tm6_fc_apres is not null)
      then 'SUSPECT : TM6 réalisé, aucun résultat (effacé ?)'
    else 'pas de TM6'
  end                as forme,
  count(*)           as nb_bilans
from bilans
group by 1
order by 2 desc;


-- ── REQUÊTE 3 — Les variantes personnalisées (dont « Stepper classique ») ─────
select left(v.id::text, 8)   as variante,
       v.nom,
       v.type_mesure,
       v.created_at::date    as creee_le,
       (select count(*) from bilans b where b.tm6_variante_id = v.id) as nb_bilans
from tm6_variantes v
order by nb_bilans desc;


-- ── REQUÊTE 4 — Apley : bilans avec valeurs, et ceux « invisibles » à la réouverture
select count(*) filter (where b.apley_data is not null)                                   as bilans_avec_apley,
       count(*) filter (where b.apley_data is not null
                          and not (p.tests_actifs::text like '%apley%'))                  as apley_en_base_mais_absent_du_profil,
       count(*)                                                                           as bilans_total
from bilans b
join participants p on p.id = b.participant_id;


-- ── REQUÊTE 5 — Indice d'effacement : depuis quand des TM6 « réalisés » sans résultat ?
-- (Le bug d'effacement date du 2026-09-21, fusion de la #62. Cette requête répartit par MOIS
--  de dernière modification les bilans de la ligne « SUSPECT » de la requête 2, pour voir
--  s'ils se concentrent après cette date. Pas de nom, pas de valeur : des comptages.)
select to_char(date_trunc('month', coalesce(b.updated_at, b.created_at)), 'YYYY-MM') as mois_derniere_modif,
       count(*) as nb_bilans_suspects
from bilans b
where coalesce(b.tm6_distance_metres, 0) = 0
  and b.tm6_nb_pas is null and b.tm6_repetitions is null and b.tm6_nb_tours is null
  and b.tm6_variante_id is null
  and (b.tm6_fc_avant is not null or b.tm6_spo2_avant is not null or b.tm6_borg_rpe is not null or b.tm6_fc_apres is not null)
group by 1
order by 1;


-- ── REQUÊTE 6 — Apley depuis la PR #50 (colonne apley_data créée le 2026-09-14,
-- correctif de persistance mergé le 2026-09-15) : le correctif écrit-il vraiment
-- des scores depuis son déploiement, ou 0/41 reste-t-il vrai même après ?
-- Seuil au lendemain du merge pour ne compter que les bilans enregistrés APRÈS
-- le correctif (updated_at, à défaut created_at). Comptages seulement.
select
  count(*) filter (
    where coalesce(b.updated_at, b.created_at) >= '2026-09-15'
  )                                                                          as bilans_depuis_correctif,
  count(*) filter (
    where coalesce(b.updated_at, b.created_at) >= '2026-09-15'
      and b.apley_data is not null
  )                                                                          as dont_apley_rempli,
  count(*) filter (
    where coalesce(b.updated_at, b.created_at) >= '2026-09-15'
      and (p.tests_actifs::text like '%apley%')
      and b.apley_data is null
  )                                                                          as apley_actif_mais_toujours_vide
from bilans b
join participants p on p.id = b.participant_id;
