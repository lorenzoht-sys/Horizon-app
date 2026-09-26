-- ============================================================================
-- VÉRIFICATION LECTURE SEULE — Bug 16 : doublon "Stepper" + 6 anciens bénéficiaires
-- ============================================================================
-- À lancer dans Supabase > SQL Editor de la PRODUCTION.
--
-- ⚠️ QUATRE requêtes SELECT, AUCUNE écriture (aucun INSERT / UPDATE / DELETE).
-- ⚠️ Lancer LES REQUÊTES UNE PAR UNE : sélectionner UN bloc (de « -- REQUÊTE n »
--    jusqu'au « ; » final), puis Run. Le SQL Editor n'affiche que le résultat de
--    la dernière requête exécutée.
--
-- Contrairement au précédent script (verif_tm6_apley_prod_lecture_seule.sql), les
-- requêtes 3 et 4 affichent nom/prénom : nécessaire ici pour distinguer les 6
-- bénéficiaires nommés dans le ticket. Rien d'autre que TM6 n'est sélectionné.
--
-- Ce que l'on cherche :
--   1) confirmer que la variante personnalisée "Stepper" (trouvée lors du diagnostic
--      précédent : type_mesure=distance, créée le 24/07, 1 bilan rattaché) est bien
--      la cause du 4e élément vide dans Endurance, et voir la forme réelle de CE
--      bilan (pour savoir s'il faut le migrer vers le mode natif stepper avant de
--      retirer la variante de l'affichage) ;
--   2) voir dans quelle forme sont stockés les TM6 des 6 bénéficiaires du ticket,
--      à comparer avec la structure d'un cas de référence qui fonctionne
--      (mode='stepper', tm6_nb_pas rempli).
--
-- ⚠️ Noms réels retirés de ce fichier (données de santé) : les requêtes 3 et 4
-- ci-dessous contiennent des placeholders <NOM_BENEFICIAIRE_N> à remplacer par
-- les noms réels avant exécution en SQL Editor. Ne jamais recommiter ce fichier
-- avec des noms réels renseignés.
-- ============================================================================


-- ── REQUÊTE 1 — Toutes les variantes personnalisées TM6 (comptage de bilans) ──
select left(v.id::text, 8)   as variante,
       v.nom,
       v.type_mesure,
       v.created_at::date    as creee_le,
       (select count(*) from bilans b where b.tm6_variante_id = v.id) as nb_bilans
from tm6_variantes v
order by nb_bilans desc;


-- ── REQUÊTE 2 — Forme réelle du/des bilan(s) rattaché(s) à la variante "Stepper" ──
-- (nom exact 'Stepper', insensible à la casse — même variante que le diagnostic précédent)
select left(b.id::text, 8)                         as bilan,
       p.nom, p.prenom,
       b.date, b.type, b.trimestre,
       b.tm6_mode                                  as mode,
       b.tm6_distance_metres                       as dist,
       b.tm6_repetitions                           as repet,
       b.tm6_nb_pas                                as nb_pas,
       b.tm6_nb_tours                               as nb_tours,
       v.nom                                       as variante,
       v.type_mesure                               as variante_type
from bilans b
join participants p on p.id = b.participant_id
join tm6_variantes v on v.id = b.tm6_variante_id
where v.nom ilike 'stepper'
order by b.date;


-- ── REQUÊTE 3 — Les 6 bénéficiaires du ticket : TOUS leurs bilans, forme du TM6 ──
-- ⚠️ Remplacer les 6 placeholders ci-dessous par les noms réels avant exécution.
select p.nom, p.prenom,
       left(b.id::text, 8)                         as bilan,
       b.date, b.type, b.trimestre,
       b.tm6_mode                                  as mode,
       b.tm6_distance_metres                       as dist,
       b.tm6_repetitions                           as repet,
       b.tm6_nb_pas                                as nb_pas,
       b.tm6_nb_tours                               as nb_tours,
       v.nom                                       as variante,
       v.type_mesure                               as variante_type,
       (b.tm6_fc_avant is not null or b.tm6_spo2_avant is not null or b.tm6_borg_rpe is not null)
                                                   as tm6_realise_selon_fc
from bilans b
join participants p on p.id = b.participant_id
left join tm6_variantes v on v.id = b.tm6_variante_id
where p.nom ilike '<NOM_BENEFICIAIRE_1>%'
   or p.nom ilike '<NOM_BENEFICIAIRE_2>%'
   or p.nom ilike '<NOM_BENEFICIAIRE_3>%'
   or p.nom ilike '<NOM_BENEFICIAIRE_4>%'
   or p.nom ilike '<NOM_BENEFICIAIRE_5>%'
   or p.nom ilike '<NOM_BENEFICIAIRE_6>%'
order by p.nom, p.prenom, b.date;


-- ── REQUÊTE 4 — Comparaison : un cas de référence qui fonctionne, forme attendue ──
-- ⚠️ Remplacer les placeholders ci-dessous par le nom réel avant exécution.
select p.nom, p.prenom,
       left(b.id::text, 8)                         as bilan,
       b.date, b.type, b.trimestre,
       b.tm6_mode                                  as mode,
       b.tm6_distance_metres                       as dist,
       b.tm6_repetitions                           as repet,
       b.tm6_nb_pas                                as nb_pas,
       b.tm6_nb_tours                               as nb_tours,
       v.nom                                       as variante,
       v.type_mesure                               as variante_type
from bilans b
join participants p on p.id = b.participant_id
left join tm6_variantes v on v.id = b.tm6_variante_id
where p.nom ilike '<NOM_BENEFICIAIRE_REFERENCE>%' and p.prenom ilike '<INITIALE_PRENOM>%'
order by b.date;
