// Logique pure de l'écran « Profil de facturation » (src/pages/ProfilFacturationPage.tsx) :
// lecture de la ligne `praticiens`, validation de forme, obligations pour pouvoir VALIDER une
// facture, et construction de la mise à jour. Aucune dépendance à Supabase ni à React : tout est
// testé (profilFacturation.test.ts) et rejoué contre une vraie base (tests/db/facturation-profil.spec.ts).
//
// ── Ce qui est obligatoire pour valider une facture ─────────────────────────────────────────
// Liste lue dans valider_facture (migration 20261009100000) et non supposée : SIRET, nom, régime
// de TVA, et une adresse complète (rue, code postal, ville) prise dans l'adresse de facturation
// champ par champ, à défaut dans l'adresse professionnelle. L'IBAN, les pénalités, l'agrément et
// les mentions SAP sont facultatifs pour valider : l'écran les propose sans les exiger.
// Le SIRET, le nom, le n° SAP, le n° TVA et l'adresse professionnelle s'éditent dans Paramètres
// (/settings) : cet écran les affiche en lecture et renvoie vers Paramètres, il ne les réécrit pas.
//
// ── Contraintes de la base reproduites ici (praticiens_*, migrations 20261006100000 et 20261009100000)
// régime ∈ {franchise_293B, assujetti} ; assujetti ⇒ taux 10, ou 5,5 SI agrément SAP ;
// franchise ⇒ pas de taux (NULL ou 0) ; délai de paiement 0 à 60 jours ; IBAN
// ^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$ (normalisé en majuscules sans espaces par un trigger) ;
// mode d'intervention ∈ {prestataire, mandataire}. La base reste seule juge : ces contrôles
// évitent un aller-retour, ils ne le remplacent pas.

import { profilFacturationManquant, type ProfilFacturation } from './facturesAValider';
import { validerSiret } from './siret';

export type RegimeTva = '' | 'franchise_293B' | 'assujetti';
export type ModeIntervention = '' | 'prestataire' | 'mandataire';

/** Colonnes lues par l'écran : le formulaire (facturation) + le rappel d'identité (lecture seule). */
export const SELECT_PROFIL_FACTURATION =
  'nom, siret, numero_sap, numero_tva, adresse_rue, adresse_code_postal, adresse_ville, ' +
  'regime_tva, taux_tva, agrement_sap, date_declaration_sap, mode_intervention, adresse_intervention, ' +
  'facturation_adresse_rue, facturation_code_postal, facturation_ville, iban, delai_paiement_jours, penalites_retard';

/** Rappel d'identité, édité dans Paramètres. */
export interface IdentiteProfil {
  nom: string;
  siret: string;
  numeroSap: string;
  numeroTva: string;
  adresseRue: string;
  adresseCodePostal: string;
  adresseVille: string;
}

/** Valeurs du formulaire : toujours des chaînes (ou un booléen), « vide » = ''. */
export interface FormulaireFacturation {
  regimeTva: RegimeTva;
  /** '' | '5.5' | '10' */
  tauxTva: string;
  agrementSap: boolean;
  /** AAAA-MM-JJ ou ''. */
  dateDeclarationSap: string;
  modeIntervention: ModeIntervention;
  adresseIntervention: string;
  facturationRue: string;
  facturationCodePostal: string;
  facturationVille: string;
  iban: string;
  /** Entier 0 à 60, en texte pour la saisie. */
  delaiPaiementJours: string;
  penalitesRetard: string;
}

export type ChampFormulaire = keyof FormulaireFacturation;
export type ErreursFormulaire = Partial<Record<ChampFormulaire, string>>;

export const FORMULAIRE_VIDE: FormulaireFacturation = {
  regimeTva: '', tauxTva: '', agrementSap: false, dateDeclarationSap: '', modeIntervention: '',
  adresseIntervention: '', facturationRue: '', facturationCodePostal: '', facturationVille: '',
  iban: '', delaiPaiementJours: '30', penalitesRetard: '',
};

type Brut = Record<string, unknown>;
const texte = (v: unknown): string => (typeof v === 'string' ? v : '');

export function lireIdentite(row: Brut | null): IdentiteProfil {
  return {
    nom: texte(row?.nom), siret: texte(row?.siret), numeroSap: texte(row?.numero_sap),
    numeroTva: texte(row?.numero_tva), adresseRue: texte(row?.adresse_rue),
    adresseCodePostal: texte(row?.adresse_code_postal), adresseVille: texte(row?.adresse_ville),
  };
}

/** Taux numérique de la base (numeric(5,2) revient en '5.50' ou 5.5) → valeur du sélecteur. */
function tauxEnTexte(v: unknown): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (n === 5.5) return '5.5';
  if (n === 10) return '10';
  return '';   // 0 (franchise) ou valeur inattendue : aucun taux sélectionné
}

export function lireFormulaire(row: Brut | null): FormulaireFacturation {
  if (!row) return { ...FORMULAIRE_VIDE };
  const regime = row.regime_tva === 'franchise_293B' || row.regime_tva === 'assujetti' ? row.regime_tva : '';
  const mode = row.mode_intervention === 'prestataire' || row.mode_intervention === 'mandataire' ? row.mode_intervention : '';
  return {
    regimeTva: regime,
    tauxTva: tauxEnTexte(row.taux_tva),
    agrementSap: row.agrement_sap === true,
    dateDeclarationSap: texte(row.date_declaration_sap).slice(0, 10),
    modeIntervention: mode,
    adresseIntervention: texte(row.adresse_intervention),
    facturationRue: texte(row.facturation_adresse_rue),
    facturationCodePostal: texte(row.facturation_code_postal),
    facturationVille: texte(row.facturation_ville),
    iban: texte(row.iban),
    delaiPaiementJours: row.delai_paiement_jours == null ? FORMULAIRE_VIDE.delaiPaiementJours : String(row.delai_paiement_jours),
    penalitesRetard: texte(row.penalites_retard),
  };
}

// ── Formats ───────────────────────────────────────────────────────────────────────────────────

/** IBAN tel que la base le range : majuscules, sans espaces (même règle que le trigger). */
export function normaliserIban(saisie: string): string {
  return (saisie ?? '').replace(/\s/g, '').toUpperCase();
}

/** Forme seule (comme la contrainte de la base), pas la clé de contrôle mod 97. */
export function ibanFormeValide(iban: string): boolean {
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(normaliserIban(iban));
}

/** « FR76 3000 6000 … » par groupes de 4, pour l'affichage. */
export function formaterIban(iban: string): string {
  return normaliserIban(iban).replace(/(.{4})/g, '$1 ').trim();
}

// ── Validation de forme ───────────────────────────────────────────────────────────────────────

/**
 * Erreurs qui INTERDISENT l'enregistrement : valeur mal formée ou refusée par une contrainte de
 * la base. Une valeur simplement absente n'est pas une erreur ici (on peut enregistrer un profil
 * en cours de saisie) : elle apparaît dans `champsManquantsPourValider`.
 */
export function validerFormulaire(f: FormulaireFacturation): ErreursFormulaire {
  const e: ErreursFormulaire = {};

  if (f.regimeTva === 'assujetti') {
    if (f.tauxTva !== '5.5' && f.tauxTva !== '10') {
      e.tauxTva = 'Choisissez 5,5 % ou 10 %';
    } else if (f.tauxTva === '5.5' && !f.agrementSap) {
      e.tauxTva = 'Le taux de 5,5 % exige l\'agrément SAP : cochez-le, ou choisissez 10 %';
    }
  }

  if (f.dateDeclarationSap && !/^\d{4}-\d{2}-\d{2}$/.test(f.dateDeclarationSap)) {
    e.dateDeclarationSap = 'Date invalide';
  }

  if (f.iban.trim() && !ibanFormeValide(f.iban)) {
    e.iban = 'IBAN invalide : 2 lettres de pays, 2 chiffres de clé, puis 11 à 30 caractères (ex. FR76 3000 6000 0112 3456 7890 189)';
  }

  const delai = f.delaiPaiementJours.trim();
  if (!/^\d+$/.test(delai) || Number(delai) > 60) {
    e.delaiPaiementJours = 'Nombre entier de jours, de 0 à 60';
  }

  // Adresse de facturation : un champ saisi sans les deux autres donnerait une adresse bancale
  // qui MASQUE l'adresse professionnelle (coalesce champ par champ côté serveur).
  const parties = [f.facturationRue, f.facturationCodePostal, f.facturationVille].map(v => v.trim());
  if (parties.some(Boolean) && !parties.every(Boolean)) {
    const manque = (['rue', 'code postal', 'ville'] as const).filter((_, i) => !parties[i]);
    e.facturationRue = `Adresse de facturation incomplète (${manque.join(', ')}) : complétez-la ou videz les trois champs`;
  }

  return e;
}

// ── Obligations pour valider une facture ──────────────────────────────────────────────────────

export interface ManqueObligatoire {
  /** Libellé affiché. */
  libelle: string;
  /** Où le corriger : ce formulaire (champ) ou Paramètres. */
  ou: 'ici' | 'parametres';
  champ?: ChampFormulaire;
}

/**
 * Profil tel que valider_facture le verra APRÈS enregistrement de ce formulaire : l'identité lue
 * de la base + les valeurs saisies. Sert au bandeau « il manque… » affiché AVANT d'enregistrer.
 */
export function profilApresEnregistrement(identite: IdentiteProfil, f: FormulaireFacturation): ProfilFacturation {
  const vide = (v: string) => v.trim() === '';
  return {
    nom: identite.nom, siret: identite.siret,
    regimeTva: f.regimeTva || null,
    tauxTva: f.tauxTva ? Number(f.tauxTva) : null,
    adresseRue: identite.adresseRue, adresseCodePostal: identite.adresseCodePostal, adresseVille: identite.adresseVille,
    // Ce que le formulaire enregistrera : NULL quand c'est vide (jamais ''), voir formulaireVersMiseAJour.
    facturationAdresseRue: vide(f.facturationRue) ? null : f.facturationRue,
    facturationCodePostal: vide(f.facturationCodePostal) ? null : f.facturationCodePostal,
    facturationVille: vide(f.facturationVille) ? null : f.facturationVille,
  };
}

/**
 * Ce qui manque encore pour valider une facture, avec l'endroit où le corriger. Reprend EXACTEMENT
 * profilFacturationManquant (même règle que valider_facture), enrichi de ce qu'un assujetti doit
 * en plus choisir ici (le taux : sans lui la contrainte de la base refuse l'enregistrement).
 */
export function champsManquantsPourValider(identite: IdentiteProfil, f: FormulaireFacturation): ManqueObligatoire[] {
  const manques: ManqueObligatoire[] = [];
  for (const m of profilFacturationManquant(profilApresEnregistrement(identite, f))) {
    if (m === 'régime de TVA') manques.push({ libelle: 'Régime de TVA', ou: 'ici', champ: 'regimeTva' });
    else if (m === 'SIRET') manques.push({ libelle: 'SIRET (dans Paramètres)', ou: 'parametres' });
    else if (m === 'nom') manques.push({ libelle: 'Nom (dans Paramètres)', ou: 'parametres' });
    else if (m === 'adresse') manques.push({ libelle: 'Adresse de facturation, ou adresse professionnelle dans Paramètres', ou: 'ici', champ: 'facturationRue' });
    else manques.push({ libelle: m, ou: 'parametres' });
  }
  if (f.regimeTva === 'assujetti' && f.tauxTva !== '5.5' && f.tauxTva !== '10') {
    manques.push({ libelle: 'Taux de TVA (assujetti)', ou: 'ici', champ: 'tauxTva' });
  }
  return manques;
}

/** Contrôle de forme du SIRET du profil, pour le rappel d'identité (la saisie se fait dans Paramètres). */
export function siretAAlerter(identite: IdentiteProfil): string | null {
  if (!identite.siret.trim()) return null;   // l'absence est déjà dans les manques
  const r = validerSiret(identite.siret);
  return r.valide ? null : (r.message ?? 'SIRET invalide');
}

// ── Écriture ──────────────────────────────────────────────────────────────────────────────────

const videEnNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());

/**
 * Colonnes à écrire dans `praticiens`, et seulement celles de la facturation : jamais l'identité
 * (Paramètres) ni un `select *` renvoyé tel quel. Toute valeur vide devient NULL, JAMAIS '' :
 * une chaîne vide dans facturation_* masquerait l'adresse professionnelle côté serveur
 * (coalesce sur NULL seulement) et ferait refuser la validation.
 *
 * Cohérence avec les contraintes : un régime franchise n'a pas de taux (NULL), et le 5,5 % ne
 * survit pas sans agrément (validerFormulaire l'a déjà refusé avant d'arriver ici).
 */
export function formulaireVersMiseAJour(f: FormulaireFacturation): Record<string, unknown> {
  const assujetti = f.regimeTva === 'assujetti';
  return {
    regime_tva: f.regimeTva || null,
    taux_tva: assujetti && f.tauxTva ? Number(f.tauxTva) : null,
    agrement_sap: f.agrementSap,
    date_declaration_sap: videEnNull(f.dateDeclarationSap),
    mode_intervention: f.modeIntervention || null,
    adresse_intervention: videEnNull(f.adresseIntervention),
    facturation_adresse_rue: videEnNull(f.facturationRue),
    facturation_code_postal: videEnNull(f.facturationCodePostal),
    facturation_ville: videEnNull(f.facturationVille),
    iban: videEnNull(f.iban) === null ? null : normaliserIban(f.iban),
    delai_paiement_jours: Number(f.delaiPaiementJours.trim()),
    penalites_retard: videEnNull(f.penalitesRetard),
  };
}

/**
 * Message de la base rendu lisible pour l'utilisateur. Les contraintes `praticiens_*` ont des noms
 * techniques ; sans cette traduction l'écran afficherait « violates check constraint ».
 */
export function messageEnregistrementLisible(message: string): string {
  if (/praticiens_taux_tva_coherent/.test(message)) return 'Régime et taux de TVA incohérents (le 5,5 % exige l\'agrément SAP).';
  if (/praticiens_iban_format/.test(message)) return 'IBAN invalide.';
  if (/praticiens_delai_paiement_valide/.test(message)) return 'Délai de paiement : de 0 à 60 jours.';
  if (/praticiens_regime_tva_valide/.test(message)) return 'Régime de TVA invalide.';
  if (/praticiens_mode_intervention_valide/.test(message)) return 'Mode d\'intervention invalide.';
  return message;
}
