// Fonctions pures de formatage du contexte envoyé à "Mon assistant"
// (src/pages/AssistantPage.tsx). Extraites pour être testables sans monter
// le composant React (pas de jsdom/RTL dans ce projet — voir vitest.config.ts).

import type {
  Contrat, StatutContrat, RessentiSeance, StatutSeance, RaisonAnnulation, TypeStructure,
} from '../types';

function formatDateLongue(date: string): string {
  return new Date(date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Contrat de suivi ─────────────────────────────────────────────────────────

const LABEL_STATUT_CONTRAT: Record<StatutContrat, string> = {
  actif: 'Actif', termine: 'Terminé', suspendu: 'Suspendu', a_venir: 'À venir',
};

/** Toujours un texte informatif, jamais un stub du type "contrat: aucun". */
export function formatContratContexte(contrat: Contrat | null): string {
  if (!contrat) return 'Aucun contrat de suivi enregistré pour ce patient.';

  const statutLabel = LABEL_STATUT_CONTRAT[contrat.statut] ?? contrat.statut;
  const alerte = contrat.statut !== 'actif'
    ? `\n⚠️ CONTRAT ${statutLabel.toUpperCase()} — à prendre en compte dans toute réponse (ne pas présenter le suivi comme en cours).`
    : '';

  return `Statut : ${statutLabel}${alerte}
Fréquence : ${contrat.dureeMinutes} min, ${contrat.nbSeancesSemaine} séance${contrat.nbSeancesSemaine > 1 ? 's' : ''}/semaine
Période : du ${formatDateLongue(contrat.dateDebut)} au ${formatDateLongue(contrat.dateFin)}
Progression : ${contrat.nombreSeancesRealisees}/${contrat.nombreSeancesTotal} séances réalisées`;
}

// ── Programme d'exercices actif ─────────────────────────────────────────────

const LABEL_NIVEAU: Record<string, string> = {
  debutant: 'débutant', intermediaire: 'intermédiaire', avance: 'avancé',
};

export interface ProgrammeResume {
  titre: string;
  objectif: string | null;
  messageMotivation: string | null;
  lignesExercices: string[];
}

export function formatExerciceV1Ligne(
  nom: string,
  ex: { niveau?: string; series?: number; repetitions?: number | null; dureeSecondes?: number | null; frequenceParSemaine?: number[] },
): string {
  const detail: string[] = [];
  if (ex.niveau) detail.push(LABEL_NIVEAU[ex.niveau] ?? ex.niveau);
  if (ex.series) detail.push(`${ex.series} séries`);
  if (ex.repetitions != null) detail.push(`${ex.repetitions} rép.`);
  if (ex.dureeSecondes != null) detail.push(`${ex.dureeSecondes}s`);
  if (ex.frequenceParSemaine && ex.frequenceParSemaine.length > 0) detail.push(`${ex.frequenceParSemaine.length}x/semaine`);
  return detail.length > 0 ? `${nom} — ${detail.join(', ')}` : nom;
}

export function formatExerciceV2Ligne(
  ex: { nom: string; series?: number; repetitions?: number; dureeSecondes?: number },
  joursSeance: string[],
): string {
  const detail: string[] = [];
  if (ex.series != null) detail.push(`${ex.series} séries`);
  if (ex.repetitions != null) detail.push(`${ex.repetitions} rép.`);
  if (ex.dureeSecondes != null) detail.push(`${ex.dureeSecondes}s`);
  if (joursSeance.length > 0) detail.push(joursSeance.join('/'));
  return detail.length > 0 ? `${ex.nom} — ${detail.join(', ')}` : ex.nom;
}

/** Toujours un texte informatif, jamais un stub du type "programme: aucun". */
export function formatProgrammeContexte(programme: ProgrammeResume | null): string {
  if (!programme) return 'Aucun programme actif enregistré pour ce patient.';

  const lignes = [
    `Titre : ${programme.titre}`,
    programme.objectif ? `Objectif : ${programme.objectif}` : null,
    programme.messageMotivation ? `Message de motivation : ${programme.messageMotivation}` : null,
    programme.lignesExercices.length > 0
      ? `Exercices :\n${programme.lignesExercices.map(l => `  - ${l}`).join('\n')}`
      : 'Aucun exercice renseigné dans ce programme.',
  ].filter(Boolean);
  return lignes.join('\n');
}

// ── Structure de rattachement ────────────────────────────────────────────────

const LABEL_TYPE_STRUCTURE: Record<TypeStructure, string> = {
  ehpad: 'EHPAD', centre: 'Centre de soins', association: 'Association', entreprise: 'Entreprise', autre: 'Autre',
};

/** Section optionnelle : chaîne vide si le patient n'est rattaché à aucune structure. */
export function formatStructureContexte(structure: { nom: string; type?: TypeStructure } | null): string {
  if (!structure) return '';
  const typeLabel = structure.type ? LABEL_TYPE_STRUCTURE[structure.type] : null;
  return `Rattaché à la structure : ${structure.nom}${typeLabel ? ` (${typeLabel})` : ''}`;
}

// ── Présence aux séances planifiées (distinct de l'assiduité aux exercices) ──

export interface SeanceReelleBrute {
  date: string;
  statut: StatutSeance;
  motifAnnulation?: RaisonAnnulation | null;
  motifAnnulationDetail?: string | null;
}

export interface PlanningReelResume {
  fenetreJours: number;
  total: number;
  realisees: number;
  annulees: number;
  tauxPresence: number | null;
  dernieresAnnulations: { date: string; motif: string }[];
}

const LABEL_RAISON_ANNULATION: Record<RaisonAnnulation, string> = {
  maladie: 'maladie', vacances: 'vacances', rdv_medical: 'rendez-vous médical',
  indisponibilite_personnelle: 'indisponibilité personnelle', transport: 'transport',
  meteo: 'météo', hospitalisation: 'hospitalisation', autre: 'autre',
};

export function calculerPlanningReel(
  seances: SeanceReelleBrute[],
  aujourdHui: Date = new Date(),
  fenetreJours = 90,
): PlanningReelResume {
  const seuil = new Date(aujourdHui);
  seuil.setDate(seuil.getDate() - fenetreJours);
  const seuilISO = seuil.toISOString().slice(0, 10);
  const nowISO = aujourdHui.toISOString().slice(0, 10);

  const fenetre = seances.filter(s => s.date >= seuilISO && s.date <= nowISO);
  const realisees = fenetre.filter(s => s.statut === 'realisee');
  const annulees = fenetre.filter(s => s.statut === 'annulee');
  const passees = realisees.length + annulees.length;

  const dernieresAnnulations = [...annulees]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(s => ({
      date: s.date,
      motif: s.motifAnnulation ? LABEL_RAISON_ANNULATION[s.motifAnnulation] : (s.motifAnnulationDetail || 'non précisé'),
    }));

  return {
    fenetreJours,
    total: fenetre.length,
    realisees: realisees.length,
    annulees: annulees.length,
    tauxPresence: passees > 0 ? Math.round((realisees.length / passees) * 100) : null,
    dernieresAnnulations,
  };
}

/** Section optionnelle : chaîne vide si aucune séance planifiée dans la fenêtre. */
export function formatPlanningReelContexte(resume: PlanningReelResume | null): string {
  if (!resume || resume.total === 0) return '';
  const motifs = resume.dernieresAnnulations.length > 0
    ? ` (${resume.dernieresAnnulations.map(a => a.motif).join(', ')})`
    : '';
  const ligne1 = `Séances planifiées (${resume.fenetreJours} derniers jours) : ${resume.realisees} réalisée${resume.realisees > 1 ? 's' : ''} / ${resume.annulees} annulée${resume.annulees > 1 ? 's' : ''}${motifs} / ${resume.total} total`;
  const ligne2 = resume.tauxPresence !== null ? `Taux de présence aux séances planifiées : ${resume.tauxPresence}%` : null;
  return [ligne1, ligne2].filter(Boolean).join('\n');
}

// ── Journal des séances : dictées ────────────────────────────────────────────

export interface DicteeResume {
  dateSeance: string;
  observations: string;
  progression: string | null;
  pointsAttention?: string | null;
  douleursSignalees?: string | null;
}

export function formatDicteesContexte(comptesRendus: DicteeResume[]): string {
  if (comptesRendus.length === 0) return 'Aucune séance dictée';
  return comptesRendus.map(cr => {
    const tag = cr.progression ? ` [${cr.progression}]` : '';
    const alertes = [
      cr.douleursSignalees ? `douleur signalée : ${cr.douleursSignalees}` : null,
      cr.pointsAttention ? `point d'attention : ${cr.pointsAttention}` : null,
    ].filter(Boolean);
    const suffixe = alertes.length > 0 ? ` — ⚠️ ${alertes.join(' ; ')}` : '';
    return `· ${cr.dateSeance}${tag} : ${cr.observations}${suffixe}`;
  }).join('\n');
}

// ── Journal des séances : notes manuelles ───────────────────────────────────

export interface AlertesNoteManuelle {
  douleurSignalee: boolean;
  fatiguePlusQueHabitude: boolean;
  progressionNotable: boolean;
  pointARevoir: boolean;
}

export interface NoteManuelleResume {
  date: string;
  ressenti: RessentiSeance | null;
  note: string;
  alertes: AlertesNoteManuelle;
  douleurEVA?: number | null;
}

const LABEL_ALERTE_NOTE: Record<keyof AlertesNoteManuelle, string> = {
  douleurSignalee: 'douleur signalée',
  fatiguePlusQueHabitude: "fatigue plus que d'habitude",
  progressionNotable: 'progression notable',
  pointARevoir: 'point à revoir',
};

/** Section optionnelle : chaîne vide si aucune note manuelle. */
export function formatNotesManuellesContexte(notes: NoteManuelleResume[]): string {
  if (notes.length === 0) return '';
  return notes.map(n => {
    const alertesActives = (Object.keys(n.alertes) as (keyof AlertesNoteManuelle)[])
      .filter(k => n.alertes[k])
      .map(k => LABEL_ALERTE_NOTE[k]);
    const detail = [
      n.ressenti ? `ressenti : ${n.ressenti}` : null,
      n.douleurEVA != null ? `douleur EVA ${n.douleurEVA}/10` : null,
      alertesActives.length > 0 ? `alertes : ${alertesActives.join(', ')}` : null,
    ].filter(Boolean).join(' — ');
    return `· ${n.date}${detail ? ` (${detail})` : ''} : ${n.note}`;
  }).join('\n');
}
