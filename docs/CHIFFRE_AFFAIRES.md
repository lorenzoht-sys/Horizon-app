# Suivi du chiffre d'affaires mensuel

Migration `20261012100000_chiffre_affaires.sql`, tests `tests/db/ca-mensuel.spec.ts`, page `/factures/ca`
(`src/pages/ChiffreAffairesPage.tsx`), logique pure `src/lib/chiffreAffaires.ts`.

Un tableau de bord du CA par mois, pour chaque praticien et pour son seul historique. **Pas de comptabilité** :
aucune charge, aucun résultat, aucun bilan. Un total et son détail par bénéficiaire.

## Décisions (Pierre, 2026-10-09)

- **Montants en HT** (la TVA n'est pas du chiffre d'affaires).
- **CA = facturé** (factures validées), pas encaissé. La table `paiements` permettrait de l'ajouter plus tard.
- **Mois de rattachement = mois de la prestation** (`factures.periode`), pas la date d'émission : une facture de
  septembre validée le 7 octobre compte en septembre.
- **Pas de lecture admin** sur `ca_externe` : donnée personnelle du praticien.
- L'ancien champ « Saisir mon CA » de « Mes stats » (localStorage, clé `stats_pro`) est **supprimé**, sans
  migration : c'était une saisie locale, non synchronisée.

## Données

`ca_externe` : `id, praticien_id, participant_id` (obligatoire)`, mois` (1er du mois)`, libelle, montant` (> 0)`,
created_at, updated_at`.

- Ce ne sont **pas des pièces comptables** : librement modifiables et supprimables à tout moment, aucun trigger
  d'immuabilité, aucune facture générée depuis une saisie. Elles n'alimentent que le total affiché.
- `ON DELETE CASCADE` depuis le bénéficiaire et depuis le praticien : leur suppression emporte les saisies.
- **RLS** : une seule policy (`authenticated`, `praticien_id = auth.uid()`), dont le `WITH CHECK` exige aussi que le
  bénéficiaire appartienne au praticien, à l'insertion comme à la modification (impossible de détourner une saisie
  vers le bénéficiaire d'un autre). Aucune policy pour `anon`, aucune policy fondée sur le rôle (contrôlé par la
  migration).
- Privilèges : règle du 2026-08-29 (`REVOKE` explicite puis `GRANT` ciblé).
- Contraintes : libellé non vide de 120 caractères au plus, montant strictement positif, jour du mois égal à 1.

## Agrégation : `chiffre_affaires_mensuel(debut, fin)`

`SECURITY INVOKER` (sous la RLS de l'appelant), filtrée en plus sur `auth.uid()` : l'admin lit toutes les factures par
la RLS (lecture seule voulue) et ne doit pas obtenir un CA agrégé de tous les praticiens. Elle porte à **un seul
endroit** la règle « quelles factures comptent » :

- type `facture`, statuts `validee`, `envoyee`, `payee`, `en_retard`, total HT, au mois de `periode` ;
- **jamais un brouillon**, jamais une facture annulée ;
- un **avoir** se déduit du mois de la facture qu'il corrige, tant que cette facture n'est pas annulée. Un avoir total
  annule sa facture d'origine (statut `annulee`, donc déjà exclue) : il ne faut pas la déduire une seconde fois ;
- les saisies externes du praticien s'ajoutent, par bénéficiaire et par mois.

Elle renvoie une ligne par mois et par bénéficiaire (`ca_horizon`, `ca_externe`). Les bornes sont ramenées au 1er du
mois, et inclusives.

## Écrans

- **`/factures/ca`** : navigation mois par mois (jamais au-delà du mois en cours), CA total et sa part Horizon / externe,
  détail par bénéficiaire, saisie, modification et suppression du CA externe du mois, historique des 12 derniers mois
  (un clic ouvre le mois). Lien depuis « Factures validées ». Une colonne, aucune barre fixe en bas : servi tel quel sur
  mobile (`routesMobile.ts`).
- **« Mes stats »** : les cartes « CA ce mois » / « CA annuel » et le graphique « CA mensuel » lisent maintenant le CA
  réel (`useCaAnneeEnCours`). Le bouton « Saisir mon CA » devient **« Mes objectifs »** : il ne règle plus que les
  objectifs mensuel et annuel (toujours dans le navigateur) et renvoie vers `/factures/ca`.

Aucune route `/api` : fonction SQL via `supabase.rpc`, table lue et écrite sous RLS (plafond de 12 fonctions Vercel
inchangé).
