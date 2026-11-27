// Accueil du praticien à sa première connexion (OnboardingPage).
//
// ── Pourquoi plus que prénom / nom / SIRET (25/11/2026) ──────────────────
// L'ancien écran demandait cinq champs, puis laissait le praticien découvrir
// dans le guide qu'il lui restait un « profil de facturation » à compléter :
// adresse, forme juridique, régime de TVA (profilFacturationManquant). Tant
// que ce profil est incomplet, la première facture est refusée par la base.
// On pose donc ces questions ici, au moment où le praticien a la tête à se
// présenter, avec des choix d'un clic plutôt que des listes déroulantes.
// Résultat attendu : l'étape « facturation » du guide est déjà faite.
//
// On demande aussi comment il exerce (lieux, publics). C'est la base du
// « parcours selon le mode d'exercice » prévu en V2 du guide. Rangé dans
// praticiens.demarrage (clé `pratique`) pour ne pas créer de colonne : ce
// n'est pas une donnée de santé et le guide la relit déjà de façon défensive.
//
// Module pur : aucun import Supabase, testé dans onboarding.test.ts.

import { validerSiret } from './siret';

export const METIERS = [
  'Enseignant APA',
  'Kinésithérapeute',
  'Éducateur sportif',
  'Coach sportif',
  'Autre',
] as const;

export const LIEUX = [
  { id: 'domicile',  libelle: 'À domicile',          aide: 'chez vos bénéficiaires' },
  { id: 'cabinet',   libelle: 'En cabinet ou salle', aide: 'vos propres locaux' },
  { id: 'structure', libelle: 'En structure',        aide: 'EHPAD, association, hôpital…' },
  { id: 'collectif', libelle: 'En cours collectifs', aide: 'groupes, extérieur' },
] as const;

export const PUBLICS = [
  { id: 'seniors',     libelle: 'Seniors, prévention des chutes' },
  { id: 'chroniques',  libelle: 'Maladies chroniques' },
  { id: 'cancer',      libelle: 'Cancer' },
  { id: 'cardio',      libelle: 'Cardio-respiratoire' },
  { id: 'surpoids',    libelle: 'Surpoids, obésité' },
  { id: 'mentale',     libelle: 'Santé mentale' },
  { id: 'handicap',    libelle: 'Handicap' },
  { id: 'jeunes',      libelle: 'Enfants, adolescents' },
] as const;

export type IdLieu = typeof LIEUX[number]['id'];
export type IdPublic = typeof PUBLICS[number]['id'];

/** `salarie` : salarié d'une structure, sans SIRET personnel ni facture. */
export type Statut = 'ei' | 'societe' | 'salarie';
/** `a_voir` : facture la TVA ; le taux (10 % ou 5,5 % avec agrément SAP) se choisit dans le profil de facturation. */
export type ChoixTva = 'franchise_293B' | 'a_voir';

export interface Pratique {
  lieux: IdLieu[];
  publics: IdPublic[];
}

export interface ReponsesOnboarding {
  prenom: string;
  nom: string;
  titre: string;
  lieux: IdLieu[];
  publics: IdPublic[];
  telephone: string;
  adresseRue: string;
  adresseCodePostal: string;
  adresseVille: string;
  statut: Statut | '';
  societe: string;
  siret: string;
  tva: ChoixTva;
  tarifHoraire: string;
  fraisKm: string;
}

export const REPONSES_VIDES: ReponsesOnboarding = {
  prenom: '', nom: '', titre: '',
  lieux: [], publics: [],
  telephone: '', adresseRue: '', adresseCodePostal: '', adresseVille: '',
  statut: '', societe: '', siret: '', tva: 'franchise_293B',
  tarifHoraire: '45', fraisKm: '0.50',
};

export const ETAPES = ['vous', 'pratique', 'coordonnees', 'activite'] as const;
export type Etape = typeof ETAPES[number];

const vide = (s: string) => s.trim() === '';

/** Montant saisi à la française (« 0,50 ») → nombre, ou null. */
export function lireMontant(saisie: string): number | null {
  const s = saisie.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

/**
 * Premier problème bloquant de l'étape, en phrase, ou null.
 * Seule l'identité est exigée avant de continuer ; les coordonnées sont
 * facultatives mais, si elles sont saisies, doivent être exploitables.
 */
export function erreurEtape(etape: Etape, r: ReponsesOnboarding): string | null {
  switch (etape) {
    case 'vous':
      // Prénom et nom figurent sur les contrats de prestation (garde-fou repris de l'ancien écran).
      if (vide(r.prenom) || vide(r.nom)) return 'Indiquez votre prénom et votre nom : ils figurent sur vos documents.';
      if (vide(r.titre)) return 'Choisissez votre métier.';
      return null;
    case 'pratique':
      return null;
    case 'coordonnees':
      if (!vide(r.adresseCodePostal) && !/^\d{5}$/.test(r.adresseCodePostal.trim())) {
        return 'Le code postal compte 5 chiffres.';
      }
      if (!vide(r.telephone) && r.telephone.replace(/\D/g, '').length < 10) {
        return 'Le numéro de téléphone paraît incomplet.';
      }
      return null;
    case 'activite': {
      if (r.statut === '') return 'Dites-nous comment vous exercez : à votre compte, en société ou salarié·e.';
      if (r.statut !== 'salarie') {
        const s = validerSiret(r.siret);
        if (!s.valide) {
          return s.echec === 'absent'
            ? 'Renseignez votre numéro SIRET : il figure obligatoirement sur vos contrats et factures.'
            : s.message!;
        }
        if (lireMontant(r.tarifHoraire) === null || lireMontant(r.tarifHoraire) === 0) {
          return 'Indiquez le tarif d’une séance d’une heure, par exemple 45.';
        }
        if (r.lieux.includes('domicile') && lireMontant(r.fraisKm) === null) {
          return 'Indiquez vos frais kilométriques, par exemple 0,50 (ou 0 si vous n’en facturez pas).';
        }
      }
      return null;
    }
  }
}

/** Adresse complète (les trois morceaux), condition du profil de facturation. */
function adresseComplete(r: ReponsesOnboarding): boolean {
  return !vide(r.adresseRue) && /^\d{5}$/.test(r.adresseCodePostal.trim()) && !vide(r.adresseVille);
}

/**
 * Ce que l'accueil a permis de remplir, pour l'écran de fin. Même logique que
 * profilFacturationManquant : SIRET, nom, adresse, forme juridique, régime de TVA.
 */
export function bilanOnboarding(r: ReponsesOnboarding): { facturationPrete: boolean; reste: string[] } {
  if (r.statut === 'salarie') return { facturationPrete: false, reste: [] };
  const reste: string[] = [];
  if (!adresseComplete(r)) reste.push('votre adresse professionnelle');
  if (r.tva === 'a_voir') reste.push('votre taux de TVA');
  return { facturationPrete: reste.length === 0, reste };
}

const nulSiVide = (s: string) => (vide(s) ? null : s.trim());

/**
 * Colonnes de `praticiens` à enregistrer. N'écrase JAMAIS une valeur existante
 * par du vide : un praticien invité peut arriver avec une fiche déjà remplie
 * (adresse, téléphone saisis par l'administrateur), d'où `existant`.
 */
export function ligneOnboarding(
  r: ReponsesOnboarding,
  ctx: { id: string; email: string | null; existant: Record<string, unknown> | null },
): Record<string, unknown> {
  const ex = ctx.existant ?? {};
  const garder = (saisie: string, colonne: string) => nulSiVide(saisie) ?? (ex[colonne] as string | null | undefined) ?? null;
  const salarie = r.statut === 'salarie';
  const ligne: Record<string, unknown> = {
    id: ctx.id,
    email: ctx.email,
    prenom: r.prenom.trim(),
    nom: r.nom.trim(),
    titre: r.titre.trim(),
    telephone: garder(r.telephone, 'telephone'),
    adresse_rue: garder(r.adresseRue, 'adresse_rue'),
    adresse_code_postal: garder(r.adresseCodePostal, 'adresse_code_postal'),
    adresse_ville: garder(r.adresseVille, 'adresse_ville'),
    // La ville de signature des contrats est presque toujours celle du cabinet.
    ville_signature: (ex.ville_signature as string | null | undefined) || nulSiVide(r.adresseVille),
    societe: salarie ? (ex.societe as string | null | undefined) ?? null : garder(r.societe, 'societe'),
    siret: salarie ? (ex.siret as string | null | undefined) ?? null : validerSiret(r.siret).siret || null,
  };
  if (!salarie) {
    ligne.forme_juridique = r.statut;
    if (r.tva === 'franchise_293B') {
      // Contrainte praticiens_taux_tva_coherent : franchise ⇒ taux nul.
      ligne.regime_tva = 'franchise_293B';
      ligne.taux_tva = null;
    }
    ligne.tarif_horaire = String(lireMontant(r.tarifHoraire) ?? 45);
    if (r.lieux.includes('domicile')) ligne.frais_km_defaut = String(lireMontant(r.fraisKm) ?? 0.5);
  }
  return ligne;
}

/** Relecture défensive de `demarrage.pratique` : ids connus seulement, sans doublon. */
export function lirePratique(brut: unknown): Pratique | undefined {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return undefined;
  const o = brut as Record<string, unknown>;
  const filtrer = <T extends string>(v: unknown, connus: readonly { id: T }[]): T[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is T => connus.some(c => c.id === x)))] : [];
  const lieux = filtrer(o.lieux, LIEUX);
  const publics = filtrer(o.publics, PUBLICS);
  if (lieux.length === 0 && publics.length === 0) return undefined;
  return { lieux, publics };
}

/** Préremplissage depuis une fiche existante (praticien invité). */
export function reponsesDepuisFiche(ligne: Record<string, unknown> | null, pratique?: Pratique): ReponsesOnboarding {
  const r = { ...REPONSES_VIDES };
  if (pratique) { r.lieux = pratique.lieux; r.publics = pratique.publics; }
  if (!ligne) return r;
  const s = (k: string) => (typeof ligne[k] === 'string' ? (ligne[k] as string) : '');
  r.prenom = s('prenom');
  r.nom = s('nom');
  r.titre = s('titre');
  r.telephone = s('telephone');
  r.adresseRue = s('adresse_rue');
  r.adresseCodePostal = s('adresse_code_postal');
  r.adresseVille = s('adresse_ville');
  r.societe = s('societe');
  r.siret = s('siret');
  if (ligne.forme_juridique === 'ei' || ligne.forme_juridique === 'societe') r.statut = ligne.forme_juridique;
  if (ligne.regime_tva === 'assujetti') r.tva = 'a_voir';
  if (s('tarif_horaire')) r.tarifHoraire = s('tarif_horaire');
  if (s('frais_km_defaut')) r.fraisKm = s('frais_km_defaut');
  return r;
}
