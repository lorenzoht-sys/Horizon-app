-- LECTURE de la population admin — sans verdict, volontairement.
--
-- Le controle 6 de 20260829_roles_02_trigger.verif.sql comptait les admins et
-- attendait '0' (« aucun a ce stade »). C'etait un INSTANTANE, pas un
-- invariant : il est devenu faux le 2026-08-31, a la creation du premier
-- admin de production, et serait sorti en ECHEC pour une bonne raison.
--
-- Qui est admin est une DECISION, qui change des qu'on nomme quelqu'un.
-- L'asserter sur un compte fige la verification et la fait echouer a la
-- premiere nomination. On la relit donc, a l'oeil, sans la comparer.
--
-- Ce que le controle 6 verifie desormais, lui, reste vrai a jamais : le
-- trigger n'attribue que 'praticien', donc aucun role inconnu ne doit
-- apparaitre. Un admin se nomme a la main.
SELECT u.email, r.app_role, u.created_at
  FROM public.user_roles r
  JOIN auth.users u ON u.id = r.user_id
 WHERE r.app_role = 'admin'
 ORDER BY u.created_at;
