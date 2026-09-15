import type { RgpdConsent } from '../types';

// Consentement RGPD — règles partagées par TOUS les chemins de création d'un
// bénéficiaire : formulaire complet, formulaire mobile, import Excel.
//
// Le consentement est BLOQUANT À LA CRÉATION, et seulement là. Une fiche
// existante sans consentement reste modifiable : le badge « RGPD ⚠ » de la
// fiche invite à régulariser, sans empêcher de corriger un téléphone.
//
// Pourquoi ce module existe (2026-09-13) : 7 fiches de production avaient
// toutes les cases RGPD à false, `methodeConsentement: 'oral_note'` et une
// `consentementDate` égale au jour de création — exactement l'état initial du
// formulaire complet, enregistré sans que rien ne soit coché. Le formulaire
// affichait un avertissement mais ne bloquait rien ; le formulaire mobile et
// l'import Excel n'écrivaient même pas l'objet `rgpd`.
//
// Le même contrôle existe en base (trigger BEFORE INSERT, voir
// supabase/migrations/20260913_rgpd_consentement_creation.sql). Celui-ci dit
// au praticien quoi faire ; celui-là garantit la règle quel que soit le chemin.

export const MESSAGE_CONSENTEMENT_REQUIS =
  'Le consentement RGPD du bénéficiaire est obligatoire pour créer sa fiche : ' +
  'cochez « Le bénéficiaire a été informé et a consenti ».';

export function rgpdParDefaut(): RgpdConsent {
  return {
    consentementObtenu: false,
    droitAcces: false,
    droitRectification: false,
    droitEffacement: false,
    methodeConsentement: 'oral_note',
    consentementDate: '',
  };
}

/**
 * Complète un consentement partiel ou absent (brouillon mobile, fiche
 * ancienne, `rgpd = null`). Seul un `true` explicite vaut consentement.
 *
 * Aucune date de recueil pour un consentement non recueilli : c'est la date
 * « du jour » écrite par défaut qui faisait croire, sur les 7 fiches, à un
 * recueil qui n'avait jamais eu lieu.
 */
export function normaliserRgpd(rgpd: Partial<RgpdConsent> | null | undefined): RgpdConsent {
  const base = rgpdParDefaut();
  if (!rgpd) return base;
  const obtenu = rgpd.consentementObtenu === true;
  return {
    consentementObtenu: obtenu,
    droitAcces: rgpd.droitAcces === true,
    droitRectification: rgpd.droitRectification === true,
    droitEffacement: rgpd.droitEffacement === true,
    methodeConsentement: rgpd.methodeConsentement ?? base.methodeConsentement,
    consentementDate: obtenu ? (rgpd.consentementDate ?? '') : '',
  };
}

/** Coche ou décoche le consentement : la date de recueil suit la case. */
export function avecConsentement(rgpd: RgpdConsent, obtenu: boolean, aujourdhui: string): RgpdConsent {
  if (!obtenu) return { ...rgpd, consentementObtenu: false, consentementDate: '' };
  return { ...rgpd, consentementObtenu: true, consentementDate: rgpd.consentementDate || aujourdhui };
}

/** `null` si la création est autorisée, sinon le message à afficher. */
export function erreurConsentementCreation(rgpd: Partial<RgpdConsent> | null | undefined): string | null {
  return rgpd?.consentementObtenu === true ? null : MESSAGE_CONSENTEMENT_REQUIS;
}

/**
 * Cellule « Consentement RGPD » de l'import Excel. Seul un « Oui » explicite
 * (casse et espaces ignorés) vaut consentement : une case vide, « Non »,
 * « x » ou un booléen Excel sont refusés. Mieux vaut une ligne refusée et
 * listée qu'un consentement présumé.
 */
export function consentementDepuisCellule(valeur: unknown): boolean {
  if (typeof valeur !== 'string') return false;
  return valeur.trim().toLowerCase() === 'oui';
}

/**
 * Consentement d'une ligne importée avec « Oui ». Le praticien DÉCLARE le
 * recueil ; le mode réel (oral, écrit…) et l'explication des droits ne sont
 * pas connus — ils ne sont donc pas inventés.
 */
export function rgpdDeclareAImport(dateImport: string): RgpdConsent {
  return {
    consentementObtenu: true,
    droitAcces: false,
    droitRectification: false,
    droitEffacement: false,
    methodeConsentement: 'declare_import',
    consentementDate: dateImport,
  };
}
