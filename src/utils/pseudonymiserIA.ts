// Pseudonymisation de tout ce qui part vers Anthropic (/api/claude et l'Edge
// Function analyser-seance) — préalable à la migration HDS (lot A, 2026-10-27).
//
// Jusqu'ici, les huit appelants de l'IA recopiaient « prénom nom » (et pour
// l'assistant, la date de naissance complète) dans le prompt. Les données
// cliniques restent envoyées — l'IA en a besoin — mais plus l'identité :
// c'est une PSEUDONYMISATION, pas une anonymisation.
//
// Trois mécanismes, un seul module :
//
//   1. `versParticipantIA` : LISTE BLANCHE des champs du participant qu'un
//      prompt a le droit de lire. Pas une liste noire : un champ ajouté plus
//      tard à `participants` (téléphone d'un proche, numéro de sécu…) ne part
//      pas par défaut. Les fonctions qui construisent les prompts sont typées
//      sur `ParticipantIA` : y écrire `patient.prenom` ne compile plus.
//
//   2. Les MARQUEURS ({{PRENOM}}, {{NOM}}, {{BENEFICIAIRE}},
//      {{DATE_NAISSANCE}}) : quand le résultat doit porter le nom (titre d'un
//      compte rendu, « Bonjour Jeanne, », champ « Nom » d'un formulaire de
//      structure), l'IA écrit le marqueur et `reinsererIdentite` le remplace
//      dans le navigateur, après réception. Le nom ne fait jamais l'aller.
//
//   3. `masquerIdentiteConnue` : remplace le nom CONNU du bénéficiaire
//      sélectionné par ses marqueurs dans du texte produit par l'application
//      (historique de conversation, titres de programmes générés avant ce
//      chantier, interprétations IA déjà enregistrées). Ce n'est pas un filtre
//      de noms : on ne cherche que la valeur exacte qu'on connaît. Décision du
//      2026-10-27 : il n'est PAS appliqué aux dictées ni aux notes saisies par
//      le praticien (texte libre, voir la limite documentée dans la PR).

import type { Participant, Bilan, InterpretationIA } from '../types';
import { calculerAge } from '../lib/age';

// ─── Marqueurs ────────────────────────────────────────────────────────────────

export const MARQUEURS = {
  prenom: '{{PRENOM}}',
  nom: '{{NOM}}',
  beneficiaire: '{{BENEFICIAIRE}}',
  dateNaissance: '{{DATE_NAISSANCE}}',
} as const;

/** Libellé neutre de l'identité dans un prompt. `Participant` n'a pas de
 *  champ civilité : pas de « la bénéficiaire » possible sans deviner. */
export const LIBELLE_NEUTRE = 'le bénéficiaire';

/** Consigne commune, à placer dans tout prompt dont la sortie peut nommer le
 *  bénéficiaire. Le modèle ne connaît pas le nom : sans elle, il inventerait
 *  un prénom pour « personnaliser » le texte. */
export const CONSIGNE_MARQUEURS = `IDENTITÉ : l'identité du bénéficiaire ne t'est pas transmise. Quand tu dois le nommer, écris exactement ${MARQUEURS.prenom} pour son prénom, ${MARQUEURS.nom} pour son nom, ou ${MARQUEURS.beneficiaire} pour « prénom nom » — ils seront remplacés automatiquement. Sinon, écris « ${LIBELLE_NEUTRE} ». N'invente jamais de nom.`;

// ─── Identité (reste dans le navigateur) ─────────────────────────────────────

export interface IdentiteBeneficiaire {
  prenom: string;
  nom: string;
  dateNaissance?: string | null;
}

export function identiteDe(p: Pick<Participant, 'prenom' | 'nom'> & { dateNaissance?: string | null }): IdentiteBeneficiaire {
  return { prenom: p.prenom ?? '', nom: p.nom ?? '', dateNaissance: p.dateNaissance ?? null };
}

// ─── Liste blanche ───────────────────────────────────────────────────────────

/** Seuls champs du participant lisibles par un prompt. Absents volontairement :
 *  id, nom, prénom, date/ville/code postal de naissance, nom de naissance,
 *  adresse, coordonnées, téléphone, e-mail, médecin traitant, personne à
 *  contacter, code_acces, code_portail, token, IBAN/BIC, structureId, RGPD.
 *  Ajouter un champ ici est une décision de sécurité : le justifier en revue. */
export const CHAMPS_PARTICIPANT_IA = [
  'pathologie',
  'profil',
  'tags',
  'contexteClinic',
  'taille',
  'poids',
  'profilHandicap',
  'modeDeplacementHabituel',
  'modeDeplacementDetail',
  'antecedentsMedicaux',
  'antecedentsChirurgicaux',
  'antecedentsMedicauxStructures',
  'allergies',
  'traitements',
  'anamnese',
  'bilans',
  'programmes',
  'objectifsPatient',
  'activitesSouhaitees',
] as const satisfies readonly (keyof Participant)[];

type ChampParticipantIA = typeof CHAMPS_PARTICIPANT_IA[number];

export type ParticipantIA = Pick<Participant, Exclude<ChampParticipantIA, 'bilans'>> & {
  bilans: Bilan[];
  /** Âge en années révolues à la date du jour, à la place de la date de naissance. */
  age: number | null;
};

/** « 76 ans », ou « âge non renseigné » — même libellé que `libelleAge`. */
export function libelleAgeIA(age: number | null): string {
  return age === null ? 'âge non renseigné' : `${age} ans`;
}

/** Copie champ par champ (jamais un spread du participant : c'est ce qui
 *  garantit qu'un champ inconnu ne passe pas). Les textes générés par l'IA
 *  avant ce chantier (interprétations, titres de programmes) peuvent contenir
 *  le nom : ils sont masqués au passage. */
export function versParticipantIA(p: Participant, reference: Date = new Date()): ParticipantIA {
  const identite = identiteDe(p);
  const copie = {} as Record<string, unknown>;
  for (const champ of CHAMPS_PARTICIPANT_IA) {
    if (p[champ] !== undefined) copie[champ] = p[champ];
  }
  const ia = copie as ParticipantIA;
  ia.age = calculerAge(p.dateNaissance, reference);
  ia.bilans = (p.bilans ?? []).map(b => masquerBilan(b, identite));
  if (p.programmes) {
    ia.programmes = p.programmes.map(pr => ({
      ...pr,
      titre: masquerIdentiteConnue(pr.titre, identite),
      objectif: masquerIdentiteConnue(pr.objectif, identite),
      messageMotivation: masquerIdentiteConnue(pr.messageMotivation, identite),
    }));
  }
  return ia;
}

function masquerBilan(b: Bilan, identite: IdentiteBeneficiaire): Bilan {
  if (!b.interpretationIA) return b;
  const i: InterpretationIA = b.interpretationIA;
  return {
    ...b,
    interpretationIA: {
      ...i,
      textePro: masquerIdentiteConnue(i.textePro, identite),
      messageClient: masquerIdentiteConnue(i.messageClient, identite),
    },
  };
}

// ─── Réinsertion (après réception) ───────────────────────────────────────────

// Tolère les espaces qu'un modèle glisse parfois : « {{ PRENOM }} ».
const RE_MARQUEUR = /\{\{\s*(PRENOM|NOM|BENEFICIAIRE|DATE_NAISSANCE)\s*\}\}/g;

/** Date de naissance au format français, lue par composants (pas de
 *  `new Date('AAAA-MM-JJ')`, qui décale d'un jour à l'ouest de Greenwich). */
function dateNaissanceFr(d: string | null | undefined): string {
  const m = d ? /^(\d{4})-(\d{2})-(\d{2})/.exec(d) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'Non renseigné';
}

export function reinsererIdentite(texte: string, identite: IdentiteBeneficiaire | null | undefined): string {
  if (!texte) return texte;
  // Sans identité (aucun bénéficiaire sélectionné), un marqueur qui traînerait
  // devient le libellé neutre plutôt que des accolades à l'écran.
  return texte.replace(RE_MARQUEUR, (_, cle: string) => {
    const complet = identite ? [identite.prenom, identite.nom].filter(Boolean).join(' ') : '';
    switch (cle) {
      case 'PRENOM': return identite?.prenom || complet || LIBELLE_NEUTRE;
      case 'NOM': return identite?.nom || complet || LIBELLE_NEUTRE;
      case 'BENEFICIAIRE': return complet || LIBELLE_NEUTRE;
      default: return identite ? dateNaissanceFr(identite.dateNaissance) : 'Non renseigné';
    }
  });
}

/** Même chose, en profondeur, pour une réponse JSON (programme, champs de
 *  formulaire, interprétation). Les clés ne sont jamais touchées. */
export function reinsererIdentiteDans<T>(valeur: T, identite: IdentiteBeneficiaire | null | undefined): T {
  if (typeof valeur === 'string') return reinsererIdentite(valeur, identite) as T;
  if (Array.isArray(valeur)) return valeur.map(v => reinsererIdentiteDans(v, identite)) as T;
  if (valeur && typeof valeur === 'object') {
    const sortie: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valeur as Record<string, unknown>)) sortie[k] = reinsererIdentiteDans(v, identite);
    return sortie as T;
  }
  return valeur;
}

// ─── Masquage du nom connu (avant l'envoi) ───────────────────────────────────

// Variantes accentuées par lettre de base : « Hélène » doit aussi attraper
// « HELENE » ou « Helene » dans un texte, sans dépendre de la saisie.
const ACCENTUEES = 'àáâãäåæçèéêëìíîïñòóôõöøœùúûüýÿ';
const VARIANTES: Record<string, string> = {};
for (const c of ACCENTUEES) {
  const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (base.length === 1 && base !== c) VARIANTES[base] = (VARIANTES[base] ?? base) + c;
}

function motifNom(nom: string): string {
  let motif = '';
  for (const c of nom.normalize('NFC').toLowerCase()) {
    const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/\s/.test(c)) motif += '\\s+';
    else if (/[-‐‑]/.test(c)) motif += '[-‐‑\\s]';
    else if (/['’]/.test(c)) motif += "['’]";
    else if (VARIANTES[base]) motif += `[${VARIANTES[base]}]`;
    else motif += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return motif;
}

/** Limites de mot Unicode : « Marc » ne doit pas toucher « Marché ». */
function regexMot(nom: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${motifNom(nom)}(?![\\p{L}\\p{N}])`, 'giu');
}

/** Remplace le nom connu par ses marqueurs : « prénom nom » et « nom prénom »
 *  d'abord (→ {{BENEFICIAIRE}}), puis chaque partie isolée. Un nom ou prénom
 *  d'une seule lettre est ignoré : il attraperait des initiales sans rapport. */
export function masquerIdentiteConnue<T extends string | null | undefined>(texte: T, identite: IdentiteBeneficiaire | null | undefined): T {
  if (!texte || !identite) return texte;
  const prenom = identite.prenom.trim();
  const nom = identite.nom.trim();
  let sortie: string = texte;
  if (prenom && nom) {
    sortie = sortie.replace(regexMot(`${prenom} ${nom}`), MARQUEURS.beneficiaire);
    sortie = sortie.replace(regexMot(`${nom} ${prenom}`), MARQUEURS.beneficiaire);
  }
  if (nom.length > 1) sortie = sortie.replace(regexMot(nom), MARQUEURS.nom);
  if (prenom.length > 1) sortie = sortie.replace(regexMot(prenom), MARQUEURS.prenom);
  const dn = identite.dateNaissance ? dateNaissanceFr(identite.dateNaissance) : null;
  if (dn && dn !== 'Non renseigné') sortie = sortie.split(dn).join(MARQUEURS.dateNaissance);
  return sortie as T;
}
