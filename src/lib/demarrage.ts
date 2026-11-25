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

import { lirePratique, type Pratique } from './onboarding';

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
  /**
   * Lieux d'exercice et publics déclarés à l'accueil (OnboardingPage, 25/11/2026).
   * Conservé ici à chaque écriture du guide : sans cela, masquer le guide
   * effacerait ce que le praticien a dit de sa pratique.
   */
  pratique?: Pratique;
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
    duree: null,
    action: 'Voir mon profil',
  },
  {
    id: 'beneficiaire',
    titre: 'Ajouter votre premier bénéficiaire',
    duree: '2 min',
    action: 'Ajouter un bénéficiaire',
  },
  {
    id: 'bilan',
    titre: 'Réaliser un premier bilan',
    duree: '5 min',
    action: 'Commencer un bilan',
  },
  {
    id: 'seance',
    titre: 'Planifier une séance',
    duree: '1 min',
    action: 'Ouvrir l’agenda',
  },
  {
    id: 'programme',
    titre: 'Créer un programme d’exercices',
    duree: '3 min',
    action: 'Créer un programme',
  },
  {
    id: 'facturation',
    titre: 'Compléter votre profil de facturation',
    duree: '3 min',
    action: 'Compléter',
  },
  {
    id: 'application',
    titre: 'Installer Horizon sur votre téléphone',
    duree: '1 min',
    action: 'Voir comment',
  },
];

export const NOMBRE_ETAPES = ETAPES.length;

/** Titre et rang d'une étape, sans rien savoir du compte (encart compagnon). */
export function reperesEtape(id: IdEtape): { titre: string; numero: number; total: number } {
  const i = ETAPES.findIndex(e => e.id === id);
  return { titre: ETAPES[i].titre, numero: i + 1, total: ETAPES.length };
}

/**
 * Le guide passe l'étape en cours dans l'état de navigation (navigate(url, { state })),
 * pour que l'encart compagnon accompagne le praticien sur la page d'arrivée.
 * L'état de navigation peut venir d'ailleurs : on ne garde qu'un identifiant connu.
 */
export function etapeDepuisNavigation(etat: unknown): IdEtape | null {
  if (!etat || typeof etat !== 'object') return null;
  const id = (etat as { demarrage?: unknown }).demarrage;
  return typeof id === 'string' && ETAPES.some(e => e.id === id) ? (id as IdEtape) : null;
}

/**
 * Étapes faites depuis le dernier passage, pour féliciter une fois et une seule.
 * Premier passage (rien de mémorisé) : on ne félicite pas ce qui était déjà fait
 * avant que le guide existe.
 */
export function etapesNouvellementFaites(vuesAvant: IdEtape[] | null, faitesMaintenant: IdEtape[]): IdEtape[] {
  if (!vuesAvant) return [];
  return faitesMaintenant.filter(id => !vuesAvant.includes(id));
}

export function messageBravo(nouvelles: IdEtape[], prochaine: Etape | null): { titre: string; description?: string } | null {
  if (nouvelles.length === 0) return null;
  if (!prochaine) return { titre: 'Bravo, tout est prêt !', description: 'Horizon est configuré pour votre activité.' };
  const titre = nouvelles.length === 1
    ? `Étape réussie : ${reperesEtape(nouvelles[0]).titre.charAt(0).toLowerCase()}${reperesEtape(nouvelles[0]).titre.slice(1)}`
    : `${nouvelles.length} étapes réussies`;
  return { titre, description: `Prochaine étape : ${prochaine.titre.charAt(0).toLowerCase()}${prochaine.titre.slice(1)}.` };
}

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
 * Le guide s'adresse à TOUS les praticiens, y compris ceux inscrits avant sa
 * mise en ligne (décision du 19/11/2026 : « que tous les professionnels
 * comprennent »). Seule exception : un compte ancien qui a déjà tout fait
 * n'a rien à apprendre, on ne lui montre pas une carte de félicitations
 * surgie de nulle part.
 */
export const AGE_MAX_COMPTE_JOURS = 45;

/**
 * « Premiers pas » (25/11/2026, demande de Lorenzo : « que la personne ne
 * soit pas perdue ») : tant qu'aucun bilan n'est fait, la phrase d'accueil du
 * tableau de bord renvoie au guide, et le bouton « Voir le guide » de la ligne
 * de prise en main devient le bouton principal et brille. Le premier réflexe
 * doit être d'ouvrir le guide. Essayés et écartés le même jour : un grand
 * bandeau déplié d'office (« trop terne et trop voyant ») et un tableau de
 * bord vidé de ses cartes (page qui paraissait vide).
 */
export function enPremiersPas(params: { visible: boolean; termine: boolean; bilans: number }): boolean {
  return params.visible && !params.termine && params.bilans === 0;
}

/** Phrase sous « Bonjour » en premiers pas, à la place du résumé d'une journée encore vide. */
export const PHRASE_PREMIERS_PAS = 'Votre espace est prêt. Ouvrez le guide juste en dessous : il vous montre chaque étape.';

export function doitAfficherGuide(params: {
  etat: EtatDemarrage;
  termine: boolean;
  compteCreeLe: string | null;
  maintenant: Date;
}): boolean {
  const { etat, termine, compteCreeLe, maintenant } = params;
  if (etat.masque) return false;
  if (etat.reaffiche || !termine) return true;
  if (!compteCreeLe) return true;
  const cree = new Date(compteCreeLe);
  if (Number.isNaN(cree.getTime())) return true;
  const ageJours = (maintenant.getTime() - cree.getTime()) / 86_400_000;
  return ageJours <= AGE_MAX_COMPTE_JOURS;
}

// ── Contenu pédagogique ──────────────────────────────────────────────────
// Écrit pour un praticien qui n'a jamais utilisé de logiciel de ce type :
// des phrases courtes, les libellés EXACTS des boutons entre « », et ce qui
// est obligatoire dit clairement (relevé dans le code des écrans le 19/11/2026 ;
// à mettre à jour si un libellé change). Le mobile a parfois d'autres écrans,
// d'où deux jeux de gestes.

export interface GuideEtape {
  /** Pourquoi c'est utile, en une ou deux phrases. */
  pourquoi: string;
  /** Les gestes à faire, dans l'ordre. */
  gestes: string[];
}

export function guideEtape(id: IdEtape, mobile: boolean): GuideEtape {
  switch (id) {
    case 'compte':
      return {
        pourquoi: 'Votre nom, votre profession et votre SIRET figurent sur les bilans, comptes rendus et factures que vous remettez.',
        gestes: [
          'Ouvrez « Paramètres » pour vérifier votre identité professionnelle.',
          'Ajoutez votre logo : il apparaîtra sur vos documents PDF.',
        ],
      };
    case 'beneficiaire':
      return {
        pourquoi: 'Tout part de la fiche : bilans, séances, programme et factures s’y rattachent. Vous pourrez la compléter plus tard.',
        gestes: mobile
          ? [
              'Saisissez le prénom, le nom et la date de naissance.',
              'Lisez au bénéficiaire le texte d’information, puis indiquez son consentement : il est obligatoire.',
              'Touchez « Créer le bénéficiaire ».',
            ]
          : [
              'Rubrique « Identité & Coordonnées » : le prénom, le nom et la date de naissance suffisent pour commencer.',
              'Rubrique « Objectifs & Organisation » : indiquez le nombre de séances par semaine et leur durée, c’est obligatoire.',
              'Au « Récapitulatif », cochez « Le bénéficiaire a été informé et a consenti », puis cliquez sur « Créer la fiche ».',
            ],
      };
    case 'bilan':
      return {
        pourquoi: 'Le premier bilan sert de point de départ : les suivants s’y comparent et l’évolution se lit d’un coup d’œil.',
        gestes: [
          mobile
            ? 'Choisissez le bénéficiaire, puis touchez « Commencer le bilan ».'
            : 'Choisissez les tests adaptés à la personne, puis cliquez sur « Valider ». Ils seront reproposés aux bilans suivants.',
          'Avancez étape par étape. Les tests chronométrés ont leur chronomètre intégré : « Démarrer ».',
          'Terminez par « Enregistrer le bilan ».',
        ],
      };
    case 'seance':
      return {
        pourquoi: 'L’agenda réunit séances, bilans et cours collectifs. Il peut aussi s’afficher dans votre agenda habituel (Google, iPhone).',
        gestes: [
          mobile
            ? 'Touchez « + Nouvelle séance ».'
            : 'Cliquez sur « + Nouvelle séance », ou directement sur un créneau libre du calendrier.',
          'Choisissez le bénéficiaire, la date et l’heure. Sans contrat, la séance n’est simplement pas facturée.',
          'Validez avec « Créer la séance ».',
        ],
      };
    case 'programme':
      return {
        pourquoi: 'Entre deux séances, votre bénéficiaire retrouve ses exercices dans son espace, et vous voyez ce qu’il a réalisé.',
        gestes: [
          mobile
            ? 'Sur la fiche du bénéficiaire, touchez « Programme » : l’assistant de création s’ouvre.'
            : 'Cliquez sur « Créer un programme ».',
          'Donnez-lui un nom, puis ajoutez des exercices depuis la « Bibliothèque » ou créez les vôtres.',
          'Avancez jusqu’au « Récapitulatif », puis « Sauvegarder et partager ».',
        ],
      };
    case 'facturation':
      return {
        pourquoi: 'Sans ces mentions obligatoires, une facture ne peut pas être validée. Vous ne les saisissez qu’une fois.',
        gestes: [
          'Indiquez votre forme juridique et votre régime de TVA.',
          'Vérifiez l’adresse de facturation : à défaut, celle de votre profil est utilisée.',
          'Cliquez sur « Enregistrer » : le message « Profil complet » confirme que tout est prêt.',
        ],
      };
    case 'application':
      return {
        pourquoi: 'Horizon s’ouvre alors comme une application, en plein écran, sans chercher l’adresse dans le navigateur.',
        gestes: mobile
          ? ['« Voir comment » affiche les trois gestes pour iPhone ou Android.']
          : [
              '« Voir comment » affiche un QR code : scannez-le avec l’appareil photo de votre téléphone.',
              'Suivez ensuite les trois gestes indiqués pour iPhone ou Android.',
            ],
      };
  }
}

/**
 * Ce qui manque au profil de facturation, en phrase. Le SIRET et le nom se
 * saisissent dans Paramètres (identité), pas sur la page de facturation :
 * on le précise pour ne pas laisser le praticien chercher.
 */
export function phraseManquesFacturation(manquants: string[]): string | null {
  if (manquants.length === 0) return null;
  const liste = manquants.join(', ');
  const identite = manquants.some(m => m === 'SIRET' || m === 'nom');
  return `Il manque encore : ${liste}.${identite ? ' Le SIRET et le nom se renseignent dans « Paramètres ».' : ''}`;
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
  const pratique = lirePratique(o.pratique);
  if (pratique) etat.pratique = pratique;
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
    pratique: base.pratique ?? local.pratique,
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
