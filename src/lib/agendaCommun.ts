import type { Seance, StatutSeance, TypeSeance, RaisonAnnulation, EvenementAgenda, TypeEvenementAgenda, CoursCollectif, OrganisationData } from '../types';
import type { OptionPortee } from './planificationManuelle';

// Logique métier pure et types partagés d'AgendaV2Page.tsx, extraits pour
// être réutilisables indépendamment de react-big-calendar (par le futur
// écran mobile natif de l'Agenda) — sans changement de comportement, copie
// exacte de ce qui vivait directement dans AgendaV2Page.tsx.

export const TODAY = new Date().toISOString().slice(0, 10);

export const LABEL_TYPE: Record<TypeSeance, string> = {
  seance: 'Séance',
  bilan: 'Bilan',
  bilan_initial: 'Bilan initial',
};

export const LABEL_STATUT: Record<StatutSeance, string> = {
  planifiee: 'Planifiée', realisee: 'Réalisée', reportee: 'Reportée', annulee: 'Annulée',
};

// Raisons prédéfinies pour une annulation — donnée interne au praticien,
// jamais exposée à l'espace bénéficiaire (voir api/patient/me.ts).
export const OPTIONS_RAISON_ANNULATION: RaisonAnnulation[] = [
  'maladie', 'vacances', 'rdv_medical', 'indisponibilite_personnelle',
  'transport', 'meteo', 'hospitalisation', 'autre',
];

export const LABEL_RAISON_ANNULATION: Record<RaisonAnnulation, string> = {
  maladie: 'Maladie',
  vacances: 'Vacances / congés',
  rdv_medical: 'Rendez-vous médical',
  indisponibilite_personnelle: 'Indisponibilité personnelle',
  transport: 'Problème de transport',
  meteo: 'Météo / conditions extérieures',
  hospitalisation: 'Hospitalisation',
  autre: 'Autre',
};

// Reproduit exactement getCouleurEvenement de AgendaPage.tsx.
export function getCouleurEvenement(seance: Seance): string {
  if (seance.statut === 'annulee') return '#EF4444';
  if (seance.statut === 'reportee') return '#F59E0B';
  if (seance.statut === 'realisee') return '#3B6D11';
  if (seance.type === 'bilan' || seance.type === 'bilan_initial') return '#8B5CF6';
  return seance.date === TODAY ? '#1A5F9E' : '#5B9BD5';
}

// Titre d'une séance dans l'agenda desktop (AgendaV2Page). react-big-calendar
// n'a pas de composant d'événement personnalisé ici (seul eventPropGetter
// existe, et ne gère que le style) : le signalement d'absence patient
// (absence_signalee_par_patient_le, lecture seule) est donc rendu comme un
// simple préfixe textuel plutôt qu'un badge graphique séparé. Ne modifie ni
// statut ni calcul — uniquement l'affichage.
export function titreEvenementSeance(seance: Seance, participant: { prenom: string; nom: string } | undefined): string {
  const titreBase = participant ? `${participant.prenom} ${participant.nom}` : LABEL_TYPE[seance.type];
  return seance.absenceSignaleeLe ? `🚫 ${titreBase}` : titreBase;
}

// Événements d'agenda (bilan, réunion, prospect, lieu particulier, autre) —
// couleur choisie librement par Pierre (voir ModalNouvelEvenement), jamais
// confondue avec une vraie séance patient grâce à la bordure en tirets
// distinctive (voir eventPropGetter, AgendaV2Page.tsx), quelle que soit la
// couleur. indisponibilite/reunion_professionnelle/premier_contact_prospect
// sont les 3 catégories historiques (migration 20260715) : encore valides en
// base pour les événements déjà créés, mais plus proposées à la création —
// voir LABEL_TYPE_EVENEMENT ci-dessous qui couvre les 8 valeurs pour l'affichage.
export const OPTIONS_TYPE_EVENEMENT: TypeEvenementAgenda[] = [
  'bilan', 'reunion', 'prospect', 'lieu_particulier', 'autre',
];

export const LABEL_TYPE_EVENEMENT: Record<TypeEvenementAgenda, string> = {
  indisponibilite: 'Indisponibilité',
  reunion_professionnelle: 'Réunion professionnelle',
  premier_contact_prospect: 'Premier contact (prospect)',
  bilan: 'Bilan',
  reunion: 'Réunion',
  prospect: 'Prospect',
  lieu_particulier: 'Lieu particulier',
  autre: 'Autre',
};

// Couleur par défaut du sélecteur libre — identique au défaut colonne DB
// ('#6B7280'), pour qu'un événement créé sans y toucher garde le même rendu
// que ceux créés avant l'ajout du sélecteur.
export const COULEUR_EVENEMENT_PAR_DEFAUT = '#6B7280';

export function heureToDate(date: string, heure: string): Date {
  const [h, m] = heure.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

export function formatDate(d: string): string {
  return new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Jour de semaine JS (Date.getDay(), 0=dim) → clé attendue par
// genererDatesSeances. Équivalent local de CLE_JOUR_PAR_DOW (PlanningGrilleView.tsx,
// non exporté).
export const CLE_JOUR_PAR_DOW: Record<number, string> = { 0: 'dim', 1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven', 6: 'sam' };

// Même Date.getDay() → clé, mais capitalisée : c'est la casse utilisée par
// OrganisationData.joursDisponibles/creneauxParJour (voir
// OPTIONS_JOURS_DISPONIBLES dans ParticipantForm.tsx et JOURS_ORDRES dans
// PlanningGrilleView.tsx), différente de CLE_JOUR_PAR_DOW ci-dessus qui sert
// un autre appelant (genererDatesSeances). Deux conventions de casse
// préexistantes dans le code, pas une invention de cette étape.
export const CLE_JOUR_CAPITALISE_PAR_DOW: Record<number, string> = { 0: 'Dim', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam' };

// Fenêtres de disponibilité réellement renseignées pour un jour donné — copie
// exacte de la fonction non exportée du même nom dans PlanningGrilleView.tsx.
// Mode strict : un jour n'est disponible que s'il est à la fois coché dans
// joursDisponibles ET pourvu de créneaux dans creneauxParJour — aucune plage
// par défaut n'est inventée quand la donnée est absente (voir commit
// dbd0471, "affichage strict des dispos bénéficiaires").
export function windowsDispoPourJour(
  org: OrganisationData | null,
  cleJour: string,
): { debut: string; fin: string }[] {
  if (!org) return [];
  if (!org.joursDisponibles?.includes(cleJour)) return [];
  return org.creneauxParJour?.[cleJour] ?? [];
}

// kind distingue une vraie séance patient d'un événement d'agenda (réunion,
// indisponibilité ponctuelle, premier contact prospect) — les deux partagent
// le même tableau `events` du calendrier, mais jamais le même style ni le
// même comportement (un événement n'est ni glissable ni éditable comme une
// séance, voir draggableAccessor et onSelectEvent, AgendaV2Page.tsx).
// cours_collectif : troisième kind, jamais glissable ni fusionné avec une
// séance individuelle — ouvre l'écran de prise de présence plutôt que
// ModalEditSeance (voir onSelectEvent, AgendaV2Page.tsx).
export type CalEvent =
  | { id: string; title: string; start: Date; end: Date; kind: 'seance'; resource: Seance }
  | { id: string; title: string; start: Date; end: Date; kind: 'evenement'; resource: EvenementAgenda }
  | { id: string; title: string; start: Date; end: Date; kind: 'cours_collectif'; resource: CoursCollectif };

// ── Types de props partagés entre AgendaV2Page.tsx et les modales extraites ──

export interface DropPendant {
  participant: import('../types').Participant;
  contrat: import('../types').Contrat;
  date: Date; // vraie date déposée
}

// Choix de portée (occurrence seule vs série) — port de ModalChoixSerie
// (PlanningGrilleView.tsx, non exportée) : aucun bouton présélectionné, un
// déplacement/édition/suppression de masse doit rester un choix conscient.
export interface ChoixSerie {
  titre: string;
  futures: Seance[];
  // Id de la séance sur laquelle le praticien a cliqué à l'origine — précochée
  // par défaut dans l'option "Sélectionner les séances concernées".
  seanceRefId: string;
  // Options affichées dans la boîte de choix — TOUTES_OPTIONS_PORTEE par
  // défaut si non précisé (déplacer/éditer/supprimer inchangés).
  optionsDisponibles?: OptionPortee[];
  // Affiché en évidence au-dessus des boutons quand l'action de portée
  // "série" a un impact jugé plus lourd qu'un simple déplacement (ex :
  // annulation de plusieurs mois de séances d'un coup) — voir l'incident
  // Pierre Poindessault (14 séances annulées le 07/07 par un seul clic sur
  // "et les suivantes", scope sous-estimé faute d'avertissement explicite).
  // Sans objet depuis que 'serie' est retiré pour l'annulation — conservé
  // pour déplacer/éditer si un usage futur le justifie.
  avertissementSerie?: string;
  onUnique: () => Promise<void>;
  onSerie: () => Promise<void>;
  // Sous-ensemble choisi à la main (voir planActionSurSelection) — jamais
  // appelé avec un tableau vide, le bouton de confirmation est désactivé tant
  // qu'aucune case n'est cochée.
  onSelection: (idsSelectionnes: string[]) => Promise<void>;
}
