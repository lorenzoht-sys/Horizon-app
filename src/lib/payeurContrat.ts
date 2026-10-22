// Payeur d'un contrat (point E, étape E1) : le bénéficiaire lui-même, ou un proche dont les coordonnées
// figurent sur la facture et reçoivent l'e-mail d'envoi. Logique pure, testée (payeurContrat.test.ts).
//
// Colonnes et contraintes déjà en base (migration 20261006100000) : payeur_type ∈ {beneficiaire, proche} ;
// un proche exige nom, adresse et e-mail ; e-mail au format ^[^@\s]+@[^@\s]+\.[^@\s]+$. Ces contrôles
// évitent un aller-retour ; la base reste seule juge.
//
// Le payeur est FIGÉ dans la facture à sa validation (snapshot_destinataire) : le changer ne modifie ni
// les factures émises ni leur visibilité côté bénéficiaire ; il vaut pour les prochaines validations,
// brouillon du mois compris.

export type TypePayeur = 'beneficiaire' | 'proche';

export const SELECT_PAYEUR = 'payeur_type, payeur_nom, payeur_adresse, payeur_email';

export interface FormulairePayeur {
  type: TypePayeur;
  nom: string;
  /** Adresse postale complète, sur plusieurs lignes (le PDF garde les retours à la ligne). */
  adresse: string;
  email: string;
}

export type ErreursPayeur = Partial<Record<'nom' | 'adresse' | 'email', string>>;

const texte = (v: unknown): string => (typeof v === 'string' ? v : '');

export function lirePayeur(row: Record<string, unknown> | null): FormulairePayeur {
  return {
    type: row?.payeur_type === 'proche' ? 'proche' : 'beneficiaire',
    nom: texte(row?.payeur_nom),
    adresse: texte(row?.payeur_adresse),
    email: texte(row?.payeur_email),
  };
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validerPayeur(f: FormulairePayeur): ErreursPayeur {
  if (f.type !== 'proche') return {};
  const e: ErreursPayeur = {};
  if (!f.nom.trim()) e.nom = 'Nom du proche requis';
  if (!f.adresse.trim()) e.adresse = 'Adresse du proche requise : elle figure sur la facture';
  if (!f.email.trim()) e.email = 'E-mail du proche requis : la facture lui est envoyée';
  else if (!EMAIL.test(f.email.trim())) e.email = 'Adresse e-mail invalide';
  return e;
}

/**
 * Colonnes à écrire, et seulement celles du payeur (jamais via contratToDb, qui réécrit tout le contrat).
 * Revenir au bénéficiaire efface les coordonnées du proche : on ne garde pas de données personnelles
 * inutiles, et l'e-mail d'un ancien payeur ne peut plus servir par erreur.
 */
export function payeurVersMiseAJour(f: FormulairePayeur): Record<string, string | null> {
  if (f.type !== 'proche') return { payeur_type: 'beneficiaire', payeur_nom: null, payeur_adresse: null, payeur_email: null };
  const adresse = f.adresse.split(/\r?\n/).map(l => l.trim()).filter(Boolean).join('\n');
  return { payeur_type: 'proche', payeur_nom: f.nom.trim(), payeur_adresse: adresse, payeur_email: f.email.trim() };
}

/** Message de la base rendu lisible (noms de contraintes de 20261006100000). */
export function messagePayeurLisible(message: string): string {
  if (/contrats_proche_requiert_coordonnees/.test(message)) return 'Un proche payeur exige un nom, une adresse et un e-mail.';
  if (/contrats_payeur_email_format/.test(message)) return 'Adresse e-mail invalide.';
  if (/contrats_payeur_type_valide/.test(message)) return 'Type de payeur invalide.';
  return message;
}

/** Résumé d'une ligne pour l'affichage replié. */
export function resumePayeur(f: FormulairePayeur): string {
  return f.type === 'proche' ? `${f.nom.trim() || 'Proche'} (proche) · ${f.email.trim()}` : 'Le bénéficiaire';
}
