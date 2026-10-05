# Facturation — fondations des données (étape 1)

Migrations `20261006100000` à `20261006100400`, tests `tests/db/facturation.spec.ts`.
Aucune route `/api`, aucune interface : uniquement la base et ses garanties.

## Décisions de cadrage

- Le payeur est le bénéficiaire ou un proche, jamais une structure.
- Seules les séances au statut `realisee` **et de type soin (`seance`)** sont facturées.
  Annulées, reportées, planifiées : jamais. Pas de statut « absent », pas de règle
  d'annulation.
- **Bilans exclus pour l'instant** : `bilan` et `bilan_initial` ne sont pas facturés, en
  attente de la confirmation du praticien référent sur leur éligibilité SAP. Réversible :
  retirer le filtre `s.type = 'seance'` de `generer_brouillon_facture()`.
- Chaque praticien émet en son nom, avec sa propre numérotation.
- Une facture émise ne se corrige que par un avoir.

## Modèle

```mermaid
erDiagram
    PRATICIENS ||--o{ FACTURES : "émet (RESTRICT)"
    PRATICIENS ||--o{ COMPTEURS_FACTURE : "un compteur par année"
    PARTICIPANTS ||--o{ CONTRATS : ""
    CONTRATS ||--o{ TARIFS_CONTRATS : "versions datées"
    CONTRATS ||--o{ FACTURES : "contrat_id (RESTRICT)"
    PARTICIPANTS ||--o{ FACTURES : "participant_id (RESTRICT)"
    FACTURES ||--o{ LIGNES_FACTURE : "CASCADE (brouillon seulement)"
    FACTURES ||--o{ PAIEMENTS : "RESTRICT"
    FACTURES |o--o{ FACTURES : "facture_origine_id (avoir)"
    SEANCES |o--o{ LIGNES_FACTURE : "seance_id (SET NULL)"
    TARIFS_CONTRATS |o--o{ LIGNES_FACTURE : "tarif_contrat_id (SET NULL)"

    PRATICIENS {
        text facturation_adresse_rue
        text regime_tva "franchise_293B | assujetti"
        numeric taux_tva
        int delai_paiement_jours "défaut 30, 0 à 60"
        text penalites_retard
        text iban "normalisé"
    }
    CONTRATS {
        text mode_facturation "seance | forfait"
        numeric montant_forfait "requis si forfait"
        text payeur_type "beneficiaire | proche"
        text payeur_nom "requis si proche"
        text payeur_adresse "requis si proche"
        text payeur_email "requis si proche"
    }
    FACTURES {
        uuid id PK
        text numero "NULL tant que brouillon, AAAA-NNNN"
        uuid praticien_id FK
        uuid contrat_id FK
        uuid participant_id FK
        date periode "1er du mois"
        text type "facture | avoir"
        uuid facture_origine_id FK
        text statut "brouillon|validee|envoyee|payee|en_retard|annulee"
        text circuit "classique | urssaf"
        numeric total_ht "somme des lignes (HT)"
        numeric montant_tva "TVA ajoutée sur le total HT"
        numeric taux_tva "figé à la validation"
        numeric total "TTC = total_ht + montant_tva"
        numeric part_client
        numeric part_urssaf
        date date_emission
        date echeance
        jsonb snapshot_emetteur
        jsonb snapshot_destinataire
        text pdf_path
    }
    LIGNES_FACTURE {
        uuid id PK
        uuid facture_id FK
        uuid seance_id FK
        uuid tarif_contrat_id FK "ajout : version de tarif utilisée"
        text libelle
        numeric quantite
        numeric prix_unitaire "HT"
        numeric montant "HT"
    }
    PAIEMENTS {
        uuid id PK
        uuid facture_id FK
        date date
        numeric montant "non nul ; négatif = correction"
        text moyen "virement|cheque|especes|carte|prelevement|autre"
        text source "manuel | urssaf"
    }
    COMPTEURS_FACTURE {
        uuid praticien_id PK
        int annee PK
        int dernier_numero
    }
```

## Cycle de vie d'une facture

1. `generer_brouillon_facture(contrat, mois)` crée ou recalcule le brouillon.
2. `valider_facture(id)` : seul chemin hors du brouillon. Vérifie le profil du
   praticien (SIRET, nom, régime de TVA, adresse) **et l'adresse du bénéficiaire** (rue, code
   postal, ville : mention légale, exigée même quand un proche paie ; IBAN et pénalités
   restent facultatifs), fige émetteur et destinataire
   (snapshots), recalcule le total, attribue le numéro, pose date d'émission et
   échéance, statut `validee`.
3. Ensuite, seuls `statut` et `pdf_path` changent, et des paiements s'ajoutent. Un
   paiement est **immuable** : une correction est une nouvelle ligne de montant négatif.
4. Correction : un avoir (`type = 'avoir'`, montants positifs, le signe est porté par
   le type). S'il annule le total, la facture d'origine passe à `annulee` et libère
   ses séances et le mois.

## Garanties (toutes testées)

| Garantie | Mécanisme |
|---|---|
| Numéro `AAAA-NNNN`, par praticien, remis à 1 chaque année, sans trou, sûr en concurrence | Ligne de `compteurs_facture` incrémentée par `INSERT … ON CONFLICT DO UPDATE` (verrou de ligne tenu jusqu'au commit). Pas de séquence Postgres : non transactionnelle, elle laisserait des trous. |
| Un brouillon, supprimé ou non, ne consomme aucun numéro | Le numéro n'est attribué qu'à la validation. |
| Une seule facture vivante par contrat et par mois | Index unique partiel `factures_une_vivante_par_contrat_periode` (hors `annulee`). |
| Facture validée immuable, non supprimable, sans retour au brouillon | Trigger `factures_inalterables` |
| Paiement immuable, correction par ligne négative sans dépasser l'encaissé | Triggers `paiements_immuables` et `paiements_controle` ; droits UPDATE/DELETE retirés ; policies SELECT + INSERT |
| Pas de facture créée directement validée, pas de faux numéro | Trigger `factures_controle_insertion` + variable locale posée par `valider_facture` |
| Annulation uniquement par avoir total | Variable locale `horizon.annulation_facture` |
| Lignes figées après validation | Trigger `lignes_facture_inalterables` |
| Séance facturée verrouillée (suppression et colonnes de facturation) | Trigger `seances_facturees_inalterables` |
| Version de tarif utilisée verrouillée, sauf clôture | Trigger `tarifs_utilises_inalterables` |
| Un praticien ne voit que ses factures, l'admin lit tout (lecture seule) | RLS |
| Contrat ou bénéficiaire avec factures non supprimable | `ON DELETE RESTRICT` |
| Aucun privilège par défaut sur les nouvelles tables et fonctions | `REVOKE` explicite, puis `GRANT` ciblé |

## Calcul du brouillon

- **Mode séance** : une ligne par séance de soin (`type = 'seance'`) `realisee` du mois et du contrat, au tarif
  applicable **à la date de la séance**, montant = `tarif_seance + frais_deplacement`.
  Même règle que `trouverTarifApplicable()` / `totalFactureSeance()`
  (`src/lib/tarifsContrats.ts`) ; un test compare les deux. Aucun repli silencieux : une
  séance sans tarif applicable fait échouer la génération en nommant la date.
- **Mode forfait** : une ligne, `montant_forfait`, sans séance. Pas de prorata.
- **Idempotent** : relancée, elle recalcule le même brouillon (jamais un second) ; si la
  facture du mois est déjà émise, elle la renvoie intacte ; s'il n'y a plus rien à
  facturer, le brouillon disparaît et elle renvoie `NULL`.
- Circuit `classique` : `part_client = total` (TTC), `part_urssaf = 0`.

## TVA — hypothèse à confirmer avec l'expert-comptable

**À valider avant la première facture en régime `assujetti`.** Hypothèse retenue : le prix du
contrat (tarif de séance, frais de déplacement, forfait) est **HT**, et la TVA s'ajoute dessus.

- Les lignes sont en HT. `total_ht` = somme des lignes ; `montant_tva` = `total_ht × taux / 100` ;
  `total` = TTC = `total_ht + montant_tva` ; `part_client + part_urssaf = total` (TTC).
- La TVA est calculée **une fois sur le total HT**, arrondie au centime (pas ligne par ligne :
  3 × 33,33 € HT à 20 % donnent 20,00 € de TVA, contre 20,01 € ligne par ligne).
- `franchise_293B` : taux 0, `total = total_ht`.
- Le taux est figé à la validation (`taux_tva`, et dans le snapshot de l'émetteur). Un brouillon
  annonce le TTC selon le régime du moment ; la validation recalcule avec le régime d'alors.
- Un avoir reprend le taux de sa facture d'origine, même si le régime a changé depuis.
- À faire valider : l'arrondi sur le total, le taux unique par facture, et le cas des services à la
  personne exonérés (art. 261-7-1° du CGI), qui n'a pas de régime propre dans le modèle (seuls
  `franchise_293B` et `assujetti` existent).

## Lancer les tests

```bash
supabase start && supabase db reset
npm run test:db
```

Base **locale uniquement** (le fichier refuse tout autre hôte), hors CI. Les tests
commitent des factures validées pour vérifier la concurrence ; elles sont
inaltérables, donc elles restent jusqu'au prochain `supabase db reset`.

## Visible côté praticien (à traiter à l'étape suivante)

Une séance déjà facturée ne peut plus changer de date, d'heure, de durée, de
contrat ni de statut, ni être supprimée. L'agenda affichera une erreur tant que
l'interface n'explique pas ce verrou. Les autres colonnes (notes, adresse…) restent
modifiables.
