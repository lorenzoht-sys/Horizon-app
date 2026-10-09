// Logique pure de l'écran « Factures à valider » (src/pages/FacturesAValiderPage.tsx) : types lus
// depuis la base, formats, contrôle du profil, tri des lignes et validation en série. Aucune
// dépendance à Supabase ni à React : tout est testable (src/lib/facturesAValider.test.ts).

export interface LigneBrouillon {
  id: string;
  libelle: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
  /** Date et heure de la séance liée, absentes pour une ligne de forfait. */
  seanceDate: string | null;
  seanceHeure: string | null;
}

export interface BeneficiaireBrouillon {
  prenom: string;
  nom: string;
  adresseRue: string | null;
  adresseCodePostal: string | null;
  adresseVille: string | null;
}

export interface FactureBrouillon {
  id: string;
  /** Premier jour du mois facturé, AAAA-MM-01. */
  periode: string;
  circuit: 'classique' | 'urssaf';
  totalHt: number;
  montantTva: number;
  total: number;
  beneficiaire: BeneficiaireBrouillon;
  lignes: LigneBrouillon[];
}

export interface FactureValidee {
  id: string;
  numero: string;
  periode: string;
  dateEmission: string;
  statut: string;
  total: number;
  beneficiaire: { prenom: string; nom: string };
  /** Chemin du PDF dans le bucket privé `factures`, NULL tant qu'il n'est pas généré (étape 5). */
  pdfPath: string | null;
}

/** Champs du profil du praticien qui conditionnent la validation (valider_facture, étape 1). */
export interface ProfilFacturation {
  nom: string | null;
  siret: string | null;
  regimeTva: string | null;
  tauxTva: number | null;
  adresseRue: string | null;
  adresseCodePostal: string | null;
  adresseVille: string | null;
  facturationAdresseRue: string | null;
  facturationCodePostal: string | null;
  facturationVille: string | null;
}

/**
 * Requêtes de l'écran, en UN seul endroit : le hook les utilise, et le test d'intégration
 * (tests/db/facturation-cron.spec.ts) les rejoue telles quelles contre un vrai PostgREST avec le
 * jeton d'un praticien. Aucun filtre sur le praticien : c'est la RLS qui cloisonne.
 */
export const SELECT_BROUILLON =
  'id, periode, circuit, total_ht, montant_tva, total, ' +
  'participants(prenom, nom, adresse_rue, adresse_code_postal, adresse_ville), ' +
  'lignes_facture(id, libelle, quantite, prix_unitaire, montant, seances(date, heure_debut))';

export const SELECT_PROFIL =
  'nom, siret, regime_tva, taux_tva, adresse_rue, adresse_code_postal, adresse_ville, ' +
  'facturation_adresse_rue, facturation_code_postal, facturation_ville';

export const SELECT_FACTURE_VALIDEE = 'id, numero, periode, date_emission, statut, total, pdf_path, participants(prenom, nom)';

/** Date civile Paris (AAAA-MM-JJ) : la règle de validation de la base se règle sur Paris, pas sur le poste. */
export function dateCivileParis(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Premier jour du mois suivant `periode` (AAAA-MM-01) : le jour où une facture de ce mois devient validable. */
export function premierJourMoisSuivant(periode: string): string {
  const [annee, mois] = periode.split('-').map(Number);
  const [a, m] = mois === 12 ? [annee + 1, 1] : [annee, mois + 1];
  return `${a}-${String(m).padStart(2, '0')}-01`;
}

/**
 * Un brouillon se valide à partir du 1er du mois SUIVANT son mois de prestation (facture progressive,
 * 2026-10-09) : il n'existe qu'une facture par contrat et par mois, valider avant la fin du mois
 * ferait perdre les séances suivantes. Même règle que le trigger de base
 * factures_validation_apres_le_mois, qui reste seul juge ; ici on évite de proposer un bouton voué
 * au refus.
 */
export function estValidable(periode: string, aujourdhui: string): boolean {
  return aujourdhui >= premierJourMoisSuivant(periode);
}

/** « 01/11/2026 » pour un brouillon d'octobre : le jour où il pourra être validé. */
export function dateOuvertureValidation(periode: string): string {
  const [a, m, j] = premierJourMoisSuivant(periode).split('-');
  return `${j}/${m}/${a}`;
}

/** Sépare les brouillons validables des brouillons « en cours » (mois pas encore terminé). */
export function separerBrouillons(brouillons: FactureBrouillon[], aujourdhui: string): { validables: FactureBrouillon[]; enCours: FactureBrouillon[] } {
  return {
    validables: brouillons.filter(f => estValidable(f.periode, aujourdhui)),
    enCours: brouillons.filter(f => !estValidable(f.periode, aujourdhui)),
  };
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « septembre 2026 » pour 2026-09-01. */
export function libellePeriode(periode: string): string {
  const [annee, mois] = periode.split('-').map(Number);
  return `${MOIS[mois - 1] ?? '?'} ${annee}`;
}

const formatEuro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export function formaterEuro(montant: number): string {
  return formatEuro.format(montant);
}

/** « 05/03/2026 » pour 2026-03-05. */
export function formaterDate(date: string): string {
  const [a, m, j] = date.split('-');
  return `${j}/${m}/${a}`;
}

const vide = (valeur: string | null | undefined) => !valeur || valeur.trim() === '';

/**
 * Éléments du profil qui feront REFUSER la validation (même règle que valider_facture,
 * migration 20261006100200 : SIRET, nom, régime de TVA, adresse de facturation ou, à défaut,
 * adresse du profil). Sert à prévenir AVANT le clic ; le serveur reste seul juge.
 */
export function profilFacturationManquant(profil: ProfilFacturation | null): string[] {
  if (!profil) return ['profil introuvable'];
  const manquants: string[] = [];
  if (vide(profil.siret)) manquants.push('SIRET');
  if (vide(profil.nom)) manquants.push('nom');
  if (vide(profil.regimeTva)) manquants.push('régime de TVA');
  // Même sémantique que le SQL : coalesce(facturation_x, adresse_x) ne retombe sur l'adresse du
  // profil que si la valeur de facturation est NULL, PAS si elle est vide. Une chaîne vide dans
  // facturation_* masque donc l'adresse du profil et fait refuser la validation (étape 4 : le
  // formulaire enregistre NULL, jamais ''). Un test de base réelle verrouille cette parité.
  const rue = profil.facturationAdresseRue ?? profil.adresseRue;
  const cp = profil.facturationCodePostal ?? profil.adresseCodePostal;
  const ville = profil.facturationVille ?? profil.adresseVille;
  if (vide(rue) || vide(cp) || vide(ville)) manquants.push('adresse');
  return manquants;
}

/** Éléments manquants de l'adresse du bénéficiaire (mention obligatoire de la facture). */
export function adresseBeneficiaireManquante(b: BeneficiaireBrouillon): string[] {
  const manquants: string[] = [];
  if (vide(b.adresseRue)) manquants.push('rue');
  if (vide(b.adresseCodePostal)) manquants.push('code postal');
  if (vide(b.adresseVille)) manquants.push('ville');
  return manquants;
}

const CHAMPS_ADRESSE: Record<string, string> = { rue: 'la rue', 'code postal': 'le code postal', ville: 'la ville' };

/**
 * Phrase précise pour un bénéficiaire dont l'adresse est incomplète : seuls les champs qui manquent réellement,
 * avec leur article. « il manque le code postal. », « il manque la rue et le code postal. »,
 * « il manque la rue, le code postal et la ville. ». Ne change PAS ce qui est obligatoire (voir
 * adresseBeneficiaireManquante et valider_facture) : uniquement ce qui s'affiche.
 */
export function messageAdresseIncomplete(manquants: string[]): string {
  const champs = manquants.map(c => CHAMPS_ADRESSE[c] ?? c);
  if (champs.length === 0) return 'Adresse du bénéficiaire incomplète.';
  const liste = champs.length === 1 ? champs[0] : `${champs.slice(0, -1).join(', ')} et ${champs[champs.length - 1]}`;
  return `Adresse du bénéficiaire incomplète : il manque ${liste}.`;
}

const LIBELLES_PROFIL: Record<string, string> = {
  siret: 'SIRET',
  nom: 'nom',
  regime_tva: 'régime de TVA',
  adresse: 'adresse',
};

/**
 * Message du serveur rendu lisible. valider_facture énumère les éléments manquants du profil par
 * leur nom technique (« Profil de facturation incomplet : siret, regime_tva ») ; les autres
 * messages sont déjà en français et passent tels quels.
 */
export function messageValidationLisible(message: string): string {
  // Refus du serveur pour l'adresse du bénéficiaire : même phrase précise que le bandeau de l'écran.
  const adresse = /^Adresse du bénéficiaire incomplète \(mention obligatoire\) : (.+)$/.exec(message);
  if (adresse) return messageAdresseIncomplete(adresse[1].split(',').map(c => c.trim()).filter(Boolean));
  const m = /^(Profil de facturation incomplet) : (.+)$/.exec(message);
  if (!m) return message;
  const elements = m[2].split(',').map(e => LIBELLES_PROFIL[e.trim()] ?? e.trim());
  return `${m[1]} : ${elements.join(', ')}`;
}

/** Libellé du taux de TVA affiché sur un brouillon, d'après le régime du praticien. */
export function libelleTva(profil: ProfilFacturation | null, montantTva: number): string {
  if (profil?.regimeTva === 'assujetti' && profil.tauxTva != null) {
    return `TVA (${String(profil.tauxTva).replace('.', ',')} %)`;
  }
  if (profil?.regimeTva === 'franchise_293B' || montantTva === 0) return 'TVA non applicable';
  return 'TVA';
}

/**
 * Lignes dans l'ordre de lecture d'une facture : séances par date puis heure, lignes sans séance
 * (forfait) à la fin. Les lignes d'un brouillon sont créées dans la même transaction (même
 * created_at) : on ne peut pas s'appuyer sur leur ordre d'insertion pour l'affichage.
 */
export function trierLignes(lignes: LigneBrouillon[]): LigneBrouillon[] {
  const cle = (l: LigneBrouillon) => (l.seanceDate ? `0${l.seanceDate}${l.seanceHeure ?? ''}` : `1${l.libelle}`);
  return [...lignes].sort((a, b) => cle(a).localeCompare(cle(b)));
}

// ── Lecture des lignes brutes de PostgREST ────────────────────────────────────────────────────

type Brut = Record<string, any>;
const nombre = (v: unknown) => Number(v ?? 0);
const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export function lireBrouillon(row: Brut): FactureBrouillon {
  const p = un<Brut>(row.participants) ?? {};
  return {
    id: row.id,
    periode: row.periode,
    circuit: row.circuit === 'urssaf' ? 'urssaf' : 'classique',
    totalHt: nombre(row.total_ht),
    montantTva: nombre(row.montant_tva),
    total: nombre(row.total),
    beneficiaire: {
      prenom: p.prenom ?? '',
      nom: p.nom ?? '',
      adresseRue: p.adresse_rue ?? null,
      adresseCodePostal: p.adresse_code_postal ?? null,
      adresseVille: p.adresse_ville ?? null,
    },
    lignes: trierLignes(
      ((row.lignes_facture ?? []) as Brut[]).map(l => {
        const s = un<Brut>(l.seances);
        return {
          id: l.id,
          libelle: l.libelle,
          quantite: nombre(l.quantite),
          prixUnitaire: nombre(l.prix_unitaire),
          montant: nombre(l.montant),
          seanceDate: s?.date ?? null,
          seanceHeure: s?.heure_debut ?? null,
        };
      }),
    ),
  };
}

export function lireFactureValidee(row: Brut): FactureValidee {
  const p = un<Brut>(row.participants) ?? {};
  return {
    id: row.id,
    numero: row.numero,
    periode: row.periode,
    dateEmission: row.date_emission,
    statut: row.statut,
    total: nombre(row.total),
    beneficiaire: { prenom: p.prenom ?? '', nom: p.nom ?? '' },
    pdfPath: row.pdf_path ?? null,
  };
}

/** Nom proposé au téléchargement : le numéro de facture, sans rien de nominatif. */
export function nomFichierFacture(numero: string): string {
  return `facture-${numero.replace(/[^0-9A-Za-z-]/g, '')}.pdf`;
}

export function lireProfil(row: Brut | null): ProfilFacturation | null {
  if (!row) return null;
  return {
    nom: row.nom ?? null,
    siret: row.siret ?? null,
    regimeTva: row.regime_tva ?? null,
    tauxTva: row.taux_tva == null ? null : Number(row.taux_tva),
    adresseRue: row.adresse_rue ?? null,
    adresseCodePostal: row.adresse_code_postal ?? null,
    adresseVille: row.adresse_ville ?? null,
    facturationAdresseRue: row.facturation_adresse_rue ?? null,
    facturationCodePostal: row.facturation_code_postal ?? null,
    facturationVille: row.facturation_ville ?? null,
  };
}

// ── Validation en série ───────────────────────────────────────────────────────────────────────

export interface BilanValidation {
  validees: { id: string; numero: string }[];
  erreurs: { id: string; message: string }[];
  /** Vrai si on s'est arrêté avant la fin : l'erreur n'est pas propre à une facture. */
  interrompue: boolean;
  /** Identifiants jamais tentés à cause de l'interruption. */
  nonTraitees: string[];
}

/**
 * Erreurs qui frapperaient TOUTES les factures du lot : profil de facturation incomplet ou accès
 * refusé. Les retenter une à une ne ferait que répéter la même erreur ; on s'arrête au premier.
 */
export function erreurSystemique(message: string): boolean {
  return /^Profil de facturation incomplet/i.test(message) || /Accès refusé/i.test(message);
}

/**
 * Valide les factures UNE PAR UNE, dans l'ordre (jamais en parallèle : chaque validation prend le
 * numéro suivant du praticien et verrouille son compteur, les enchaîner évite toute attente).
 * Une erreur propre à une facture (par exemple l'adresse d'un bénéficiaire) n'arrête pas les
 * autres ; une erreur systémique arrête le lot.
 */
export async function validerEnSerie(
  ids: string[],
  valider: (id: string) => Promise<{ numero: string } | { erreur: string }>,
): Promise<BilanValidation> {
  const bilan: BilanValidation = { validees: [], erreurs: [], interrompue: false, nonTraitees: [] };
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    let r: { numero: string } | { erreur: string };
    try {
      r = await valider(id);
    } catch (err) {
      r = { erreur: err instanceof Error ? err.message : String(err) };
    }
    if ('numero' in r) {
      bilan.validees.push({ id, numero: r.numero });
    } else {
      bilan.erreurs.push({ id, message: r.erreur });
      if (erreurSystemique(r.erreur)) {
        bilan.interrompue = true;
        bilan.nonTraitees = ids.slice(i + 1);
        break;
      }
    }
  }
  return bilan;
}
