// Guide de démarrage du praticien : logique pure (aucune requête, aucun DOM).
//
// ── Pourquoi (2026-11-19) ────────────────────────────────────────────────
// Un nouveau praticien arrivait sur un tableau de bord vide, sans savoir par
// où commencer. Le concurrent principal guide par des pastilles sur les menus à
// configurer ; on a fait l'inverse : les étapes sont rangées par ce qu'elles
// apportent (un bénéficiaire, un bilan, une séance…), pas par réglage, et AUCUNE
// n'est à cocher à la main. Chaque étape se valide toute seule à partir des
// vraies données du compte : une case cochée à la main finit toujours par mentir.
//
// Seule exception : l'installation de l'application, que le navigateur ne
// permet pas de détecter d'un autre appareil (installée sur le téléphone, le
// poste de bureau n'en sait rien). Le praticien peut donc la déclarer faite.

export type IdEtape =
  | 'compte'
  | 'beneficiaire'
  | 'bilan'
  | 'seance'
  | 'programme'
  | 'facturation'
  | 'application';

/** Ce que le compte contient déjà, compté en base (src/lib/acces/demarrage.ts). */
export interface CompteursDemarrage {
  beneficiaires: number;
  bilans: number;
  /** Séances individuelles posées à la main et cours collectifs : les bilans auto n'y sont pas. */
  seances: number;
  programmes: number;
}

/** Préférences du guide, stockées dans praticiens.demarrage (jsonb). */
export interface EtatDemarrage {
  /** Le praticien a fermé le guide. */
  masque?: boolean;
  /** Le praticien l'a rouvert depuis Paramètres : on l'affiche même sur un compte ancien. */
  reaffiche?: boolean;
  /** Déclaré par le praticien, ou constaté (application lancée depuis l'écran d'accueil). */
  applicationInstallee?: boolean;
}

export interface EntreesDemarrage {
  compteurs: CompteursDemarrage;
  /** Profil de facturation : aucun manque selon profilFacturationManquant (factures valides). */
  profilFacturationComplet: boolean;
  applicationInstallee: boolean;
}

export interface Etape {
  id: IdEtape;
  titre: string;
  /** Ce que l'étape apporte, en une phrase : c'est elle qui donne envie de cliquer. */
  apport: string;
  /** Durée indicative, affichée tant que l'étape reste à faire. */
  duree: string | null;
  /** Libellé du bouton d'action. */
  action: string;
  faite: boolean;
  /** Raison pour laquelle l'étape ne peut pas encore être faite (null = possible). */
  bloqueePar: string | null;
}

const ETAPES: Omit<Etape, 'faite' | 'bloqueePar'>[] = [
  {
    id: 'compte',
    titre: 'Créer votre compte',
    apport: 'Votre identité et votre SIRET figurent sur les documents que vous générez.',
    duree: null,
    action: 'Voir mon profil',
  },
  {
    id: 'beneficiaire',
    titre: 'Ajouter votre premier bénéficiaire',
    apport: 'Sa fiche réunit coordonnées, santé, bilans, séances et documents.',
    duree: '2 min',
    action: 'Ajouter un bénéficiaire',
  },
  {
    id: 'bilan',
    titre: 'Réaliser un premier bilan',
    apport: 'Des tests normés, comparés aux valeurs de référence, pour suivre l’évolution.',
    duree: '5 min',
    action: 'Commencer un bilan',
  },
  {
    id: 'seance',
    titre: 'Planifier une séance',
    apport: 'Votre semaine et vos tournées au même endroit, synchronisables avec votre agenda.',
    duree: '1 min',
    action: 'Ouvrir l’agenda',
  },
  {
    id: 'programme',
    titre: 'Créer un programme d’exercices',
    apport: 'Votre bénéficiaire le suit chez lui depuis son espace, et vous voyez ce qu’il a fait.',
    duree: '3 min',
    action: 'Créer un programme',
  },
  {
    id: 'facturation',
    titre: 'Compléter votre profil de facturation',
    apport: 'Les mentions obligatoires de vos factures, saisies une seule fois.',
    duree: '3 min',
    action: 'Compléter',
  },
  {
    id: 'application',
    titre: 'Installer Horizon sur votre téléphone',
    apport: 'Un accès en un geste depuis l’écran d’accueil, même en tournée.',
    duree: '1 min',
    action: 'Voir comment',
  },
];

export const NOMBRE_ETAPES = ETAPES.length;

const BLOCAGE_SANS_BENEFICIAIRE = 'Ajoutez d’abord un bénéficiaire.';

export function calculerEtapes(e: EntreesDemarrage): Etape[] {
  const aUnBeneficiaire = e.compteurs.beneficiaires > 0;
  const faite: Record<IdEtape, boolean> = {
    // On n'arrive au tableau de bord qu'une fois l'écran d'accueil rempli
    // (App.tsx, needsOnboarding) : la première étape est donc toujours faite,
    // et le praticien démarre à 1/7 plutôt qu'à zéro.
    compte: true,
    beneficiaire: aUnBeneficiaire,
    bilan: e.compteurs.bilans > 0,
    seance: e.compteurs.seances > 0,
    programme: e.compteurs.programmes > 0,
    facturation: e.profilFacturationComplet,
    application: e.applicationInstallee,
  };
  return ETAPES.map(etape => {
    const estFaite = faite[etape.id];
    const dependDuBeneficiaire = etape.id === 'bilan' || etape.id === 'programme';
    return {
      ...etape,
      faite: estFaite,
      bloqueePar: !estFaite && dependDuBeneficiaire && !aUnBeneficiaire ? BLOCAGE_SANS_BENEFICIAIRE : null,
    };
  });
}

export interface Progression {
  faites: number;
  total: number;
  /** Entier de 0 à 100. */
  pourcentage: number;
  /** Première étape à faire et réalisable ; à défaut, la première à faire. Null si tout est fait. */
  prochaine: Etape | null;
  termine: boolean;
}

export function progression(etapes: Etape[]): Progression {
  const faites = etapes.filter(e => e.faite).length;
  const total = etapes.length;
  const aFaire = etapes.filter(e => !e.faite);
  return {
    faites,
    total,
    pourcentage: total === 0 ? 100 : Math.round((faites / total) * 100),
    prochaine: aFaire.find(e => !e.bloqueePar) ?? aFaire[0] ?? null,
    termine: aFaire.length === 0,
  };
}

/**
 * Au-delà de cet âge, un compte n'est plus « nouveau » : le guide ne s'impose
 * pas aux praticiens déjà installés le jour de sa mise en ligne. Ils peuvent
 * toujours le rouvrir depuis Paramètres.
 */
export const AGE_MAX_COMPTE_JOURS = 45;

export function doitAfficherGuide(params: {
  etat: EtatDemarrage;
  compteCreeLe: string | null;
  maintenant: Date;
}): boolean {
  const { etat, compteCreeLe, maintenant } = params;
  if (etat.masque) return false;
  if (etat.reaffiche) return true;
  if (!compteCreeLe) return true;
  const cree = new Date(compteCreeLe);
  if (Number.isNaN(cree.getTime())) return true;
  const ageJours = (maintenant.getTime() - cree.getTime()) / 86_400_000;
  return ageJours <= AGE_MAX_COMPTE_JOURS;
}

export type Destination =
  | { type: 'route'; url: string }
  | { type: 'installation' };

/**
 * Où mène le bouton d'une étape. Le mobile n'a pas toutes les pages du bureau :
 * l'agenda y est /agenda, et le programme s'ouvre depuis la fiche (la page
 * programme seule y est réservée au paysage, voir src/lib/routesMobile.ts).
 */
export function destinationEtape(
  id: IdEtape,
  contexte: { mobile: boolean; dernierBeneficiaireId: string | null },
): Destination {
  const { mobile, dernierBeneficiaireId: idB } = contexte;
  const enc = (v: string) => encodeURIComponent(v);
  switch (id) {
    case 'compte':
      return { type: 'route', url: '/settings' };
    case 'beneficiaire':
      return { type: 'route', url: '/participants/nouveau' };
    case 'bilan':
      if (mobile) return { type: 'route', url: '/?onglet=saisie&mode=bilan' };
      return { type: 'route', url: idB ? `/participant/${enc(idB)}/bilan/new` : '/participants/nouveau' };
    case 'seance':
      return { type: 'route', url: mobile ? '/agenda' : '/agenda-v2' };
    case 'programme':
      if (!idB) return { type: 'route', url: '/participants/nouveau' };
      return { type: 'route', url: mobile ? `/participant/${enc(idB)}` : `/participant/${enc(idB)}/programme` };
    case 'facturation':
      return { type: 'route', url: '/settings/facturation' };
    case 'application':
      return { type: 'installation' };
  }
}

/**
 * Lecture défensive de praticiens.demarrage : la colonne est modifiable par le
 * praticien lui-même (RLS praticiens_update), elle peut donc contenir n'importe
 * quoi. On ne garde que des booléens connus.
 */
export function lireEtatDemarrage(brut: unknown): EtatDemarrage {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return {};
  const o = brut as Record<string, unknown>;
  const etat: EtatDemarrage = {};
  if (o.masque === true) etat.masque = true;
  if (o.reaffiche === true) etat.reaffiche = true;
  if (o.applicationInstallee === true) etat.applicationInstallee = true;
  return etat;
}

/**
 * Fusion de l'état en base et de la copie locale. La copie locale sert tant
 * que la migration n'est pas appliquée (colonne absente) ou hors ligne ; la
 * base l'emporte pour masque/reaffiche dès qu'elle a répondu, l'installation
 * est vraie si l'une des deux le dit.
 */
export function fusionnerEtats(base: EtatDemarrage | null, local: EtatDemarrage): EtatDemarrage {
  if (!base) return local;
  return lireEtatDemarrage({
    masque: base.masque,
    reaffiche: base.reaffiche,
    applicationInstallee: base.applicationInstallee || local.applicationInstallee,
  });
}

/** Phrase d'en-tête du guide selon l'avancement. */
export function messageProgression(p: Progression, prenom: string | null): string {
  if (p.termine) return prenom ? `Bravo ${prenom}, tout est prêt.` : 'Bravo, tout est prêt.';
  const restantes = p.total - p.faites;
  if (p.faites <= 1) return 'Quelques minutes pour prendre Horizon en main.';
  if (restantes === 1) return 'Plus qu’une étape.';
  if (p.pourcentage >= 50) return `Plus que ${restantes} étapes, vous y êtes presque.`;
  return `Encore ${restantes} étapes pour être opérationnel.`;
}
