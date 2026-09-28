-- ============================================================================
-- Vérification LECTURE SEULE des anciens TMC (avant la fusion en tableau unique)
-- À lancer dans Supabase > SQL Editor. Trois requêtes SELECT, aucune écriture.
-- Lancer les requêtes une par une (sélectionner un bloc, puis Run).
-- Aucun nom ni donnée personnelle : uniquement 8 caractères d'identifiant de bilan.
-- Non exécutée avant livraison : si un bloc échoue, relever le message d'erreur.
-- ============================================================================


-- ── REQUÊTE 1 — Comptage par famille de TMC ────────────────────────────────
with b as (
  select id, date,
         tm6_mode, tm6_distance_metres, tm6_repetitions, tm6_nb_pas,
         tm6_fc_avant, tm6_fc_apres, tm6_fc_1min, tm6_fc_2min,
         tm6_spo2_avant, tm6_spo2_apres, tm6_spo2_1min, tm6_spo2_2min,
         case when jsonb_typeof(tm6_mesures_par_minute) = 'array'
              then tm6_mesures_par_minute else '[]'::jsonb end as arr
  from bilans
),
c as (
  select b.*,
         jsonb_array_length(arr) as nb_lignes,
         exists (select 1 from jsonb_array_elements(arr) e where e->>'kind' is not null) as nouveau_format,
         (select count(*) from jsonb_array_elements(arr) e
            where e->>'bpm' is not null or e->>'spo2' is not null) as nb_minutes_renseignees,
         (tm6_fc_avant is not null or tm6_fc_apres is not null or tm6_fc_1min is not null or tm6_fc_2min is not null
          or tm6_spo2_avant is not null or tm6_spo2_apres is not null or tm6_spo2_1min is not null or tm6_spo2_2min is not null
         ) as a_colonnes_avant_apres
  from b
)
select
  count(*)                                                                   as bilans_total,
  count(*) filter (where a_colonnes_avant_apres or nb_minutes_renseignees > 0
                   or tm6_distance_metres is not null or tm6_repetitions is not null
                   or tm6_nb_pas is not null)                                as bilans_avec_tmc,
  -- ce que la conversion doit reprendre :
  count(*) filter (where not nouveau_format and nb_minutes_renseignees > 0)  as anciens_avec_minutes,
  count(*) filter (where not nouveau_format and nb_minutes_renseignees = 0
                   and a_colonnes_avant_apres)                               as anciens_colonnes_seules,
  count(*) filter (where nouveau_format)                                     as deja_nouveau_format,
  -- cas limites :
  count(*) filter (where not nouveau_format and nb_lignes > 6)               as anciens_plus_de_6_minutes,
  count(*) filter (where tm6_mode in ('stepper','marche_sur_place'))         as tmc_en_pas,
  count(*) filter (where tm6_distance_metres = 0
                   and coalesce(tm6_repetitions, tm6_nb_pas, 0) > 0)         as distance_0_avec_pas
from c;


-- ── REQUÊTE 2 — Conversion simulée (5 derniers anciens TMC avec minutes) ───
-- Reproduit lireMesures() : Avant, Minute 1..N, « Juste après » (si renseigné),
-- Récupération 1 min, Récupération 2 min. Sortie = ce que l'écran affichera.
with b as (
  select id, date, tm6_fc_avant, tm6_spo2_avant, tm6_fc_apres, tm6_spo2_apres,
         tm6_fc_1min, tm6_spo2_1min, tm6_fc_2min, tm6_spo2_2min,
         case when jsonb_typeof(tm6_mesures_par_minute) = 'array'
              then tm6_mesures_par_minute else '[]'::jsonb end as arr
  from bilans
),
ech as (
  select * from b
  where not exists (select 1 from jsonb_array_elements(arr) e where e->>'kind' is not null)
    and exists (select 1 from jsonb_array_elements(arr) e where e->>'bpm' is not null or e->>'spo2' is not null)
  order by date desc
  limit 5
)
select left(ech.id::text, 8) as bilan, ech.date, l.ordre, l.moment, l.fc, l.spo2
from ech
cross join lateral (
  select 0 as ordre, 'Avant le test' as moment, ech.tm6_fc_avant as fc, ech.tm6_spo2_avant as spo2
  union all
  select g.i, 'Minute ' || g.i,
         nullif(ech.arr->(g.i - 1)->>'bpm', '')::numeric::int,
         nullif(ech.arr->(g.i - 1)->>'spo2', '')::numeric::int
  from generate_series(1, greatest(6, jsonb_array_length(ech.arr))) as g(i)
  union all
  select 100, 'Juste après', ech.tm6_fc_apres, ech.tm6_spo2_apres
  where ech.tm6_fc_apres is not null or ech.tm6_spo2_apres is not null
  union all
  select 101, 'Récupération 1 min', ech.tm6_fc_1min, ech.tm6_spo2_1min
  union all
  select 102, 'Récupération 2 min', ech.tm6_fc_2min, ech.tm6_spo2_2min
) l
order by ech.date desc, ech.id, l.ordre;


-- ── REQUÊTE 3 — Valeurs aberrantes (FC hors 30-250, SpO2 hors 50-100) ─────
-- À corriger à la main : elles s'afficheront telles quelles dans le tableau.
with b as (
  select id, date, tm6_fc_avant, tm6_fc_apres, tm6_fc_1min, tm6_fc_2min,
         tm6_spo2_avant, tm6_spo2_apres, tm6_spo2_1min, tm6_spo2_2min,
         case when jsonb_typeof(tm6_mesures_par_minute) = 'array'
              then tm6_mesures_par_minute else '[]'::jsonb end as arr
  from bilans
),
vals as (
  select id, date, 'fc_avant' as champ, tm6_fc_avant::numeric as v, 'fc' as nature from b
  union all select id, date, 'fc_apres', tm6_fc_apres, 'fc' from b
  union all select id, date, 'fc_1min',  tm6_fc_1min,  'fc' from b
  union all select id, date, 'fc_2min',  tm6_fc_2min,  'fc' from b
  union all select id, date, 'spo2_avant', tm6_spo2_avant, 'spo2' from b
  union all select id, date, 'spo2_apres', tm6_spo2_apres, 'spo2' from b
  union all select id, date, 'spo2_1min',  tm6_spo2_1min,  'spo2' from b
  union all select id, date, 'spo2_2min',  tm6_spo2_2min,  'spo2' from b
  union all
  select b.id, b.date, 'minute_' || t.ord || '_fc', nullif(t.e->>'bpm','')::numeric, 'fc'
  from b cross join lateral jsonb_array_elements(b.arr) with ordinality as t(e, ord)
  union all
  select b.id, b.date, 'minute_' || t.ord || '_spo2', nullif(t.e->>'spo2','')::numeric, 'spo2'
  from b cross join lateral jsonb_array_elements(b.arr) with ordinality as t(e, ord)
)
select left(id::text, 8) as bilan, date, champ, v as valeur
from vals
where v is not null
  and ((nature = 'fc' and (v < 30 or v > 250)) or (nature = 'spo2' and (v < 50 or v > 100)))
order by date desc
limit 50;
