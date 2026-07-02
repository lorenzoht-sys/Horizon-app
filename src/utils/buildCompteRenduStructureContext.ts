import type { Bilan, Contrat, Participant, Programme, Structure } from '../types';
import { EXERCICES_BASE } from '../data/exercices';
import { computeTinettiScores, tinettiRisque } from '../data/tinetti';
import type { ChampFormulaire } from './detecterTypeTemplate';

function calcAge(dateNaissance: string): number {
  const today = new Date(), birth = new Date(dateNaissance);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

function fmtDate(d: string): string {
  return new Date(d + (d.includes('T') ? '' : 'T12:00')).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function buildBilanText(bilan: Bilan): string {
  const lines: string[] = [];
  if (bilan.tug3m != null)              lines.push(`TUG 3m : ${bilan.tug3m}s`);
  if (bilan.chairStand30 != null)       lines.push(`Chair Stand 30s : ${bilan.chairStand30} rép.`);
  if (bilan.handGrip.droite != null)    lines.push(`HandGrip D : ${bilan.handGrip.droite} kg`);
  if (bilan.handGrip.gauche != null)    lines.push(`HandGrip G : ${bilan.handGrip.gauche} kg`);
  if (bilan.equilibre.droite != null)   lines.push(`Équilibre unipodal D : ${bilan.equilibre.droite}s`);
  if (bilan.equilibre.gauche != null)   lines.push(`Équilibre unipodal G : ${bilan.equilibre.gauche}s`);
  if (bilan.souplesse.valeur != null)   lines.push(`Souplesse : ${bilan.souplesse.valeur}cm`);
  if (bilan.tm6.distanceMetres != null) lines.push(`Test de marche 6 minutes : ${bilan.tm6.distanceMetres}m`);
  const tinetti = computeTinettiScores(bilan.tinetti);
  if (tinetti?.complet) lines.push(`Tinetti POMA : ${tinetti.scoreTotal}/28 — ${tinettiRisque(tinetti.scoreTotal).label}`);
  if (bilan.memoire.scoreImmediat != null) lines.push(`Mémoire immédiate : ${bilan.memoire.scoreImmediat}/5`);
  if (bilan.memoire.scoreDiffere != null)  lines.push(`Mémoire différée : ${bilan.memoire.scoreDiffere}/5`);
  if (bilan.interpretationIA?.textePro)    lines.push(`Interprétation : ${bilan.interpretationIA.textePro}`);
  return lines.join('\n') || 'Aucun score renseigné';
}

function buildEvolution(ancien: Bilan, recent: Bilan): string {
  const lines: string[] = [];
  function cmp(label: string, a: number | null, b: number | null, lowerIsBetter = false) {
    if (a == null || b == null) return;
    const diff = b - a;
    const improved = lowerIsBetter ? diff < 0 : diff > 0;
    lines.push(`${label} : ${a} → ${b} (${diff > 0 ? '+' : ''}${diff}, ${improved ? 'favorable' : diff === 0 ? 'stable' : 'à surveiller'})`);
  }
  cmp('TUG 3m', ancien.tug3m, recent.tug3m, true);
  cmp('Chair Stand', ancien.chairStand30, recent.chairStand30);
  cmp('HandGrip D', ancien.handGrip.droite, recent.handGrip.droite);
  cmp('Équilibre D', ancien.equilibre.droite, recent.equilibre.droite);
  cmp('Souplesse', ancien.souplesse.valeur, recent.souplesse.valeur);
  cmp('TM6', ancien.tm6.distanceMetres, recent.tm6.distanceMetres);
  return lines.join('\n') || 'Données insuffisantes pour calculer une évolution';
}

function buildProgrammeText(programme: Programme | null): string {
  if (!programme) return 'Aucun programme actif';
  const exercices = programme.exercices
    .map(e => EXERCICES_BASE.find(ex => ex.id === e.exerciceId)?.nom)
    .filter((nom): nom is string => !!nom);
  return [
    `Titre : ${programme.titre}`,
    `Objectif : ${programme.objectif || 'non renseigné'}`,
    exercices.length ? `Exercices principaux : ${exercices.join(', ')}` : null,
  ].filter(Boolean).join('\n');
}

export interface ApercuDonneesPatient {
  nbBilans: number;
  dernierBilanDate: string | null;
  aProgression: boolean;
  nbSeancesRealisees: number | null;
  nbSeancesTotal: number | null;
  aObjectifs: boolean;
  aProgrammeActif: boolean;
  avertissements: string[];
}

export function analyserDonneesDisponibles(
  patient: Participant,
  contratActif: Contrat | null,
  programmeActif: Programme | null,
): ApercuDonneesPatient {
  const sortedBilans = [...patient.bilans].sort((a, b) => b.date.localeCompare(a.date));
  const dernierBilan = sortedBilans[0] ?? null;
  const aObjectifs = !!(patient.objectifsPatient && (Array.isArray(patient.objectifsPatient) ? patient.objectifsPatient.length > 0 : patient.objectifsPatient.trim().length > 0))
    || !!dernierBilan?.objectifsSuivants?.trim();

  const avertissements: string[] = [];
  if (sortedBilans.length === 0) avertissements.push('Aucun bilan enregistré — le compte rendu sera incomplet.');
  if (!contratActif) avertissements.push('Aucun contrat de suivi actif — assiduité et organisation des séances non disponibles.');
  if (!programmeActif) avertissements.push('Aucun programme d\'exercices actif.');
  if (!aObjectifs) avertissements.push('Aucun objectif renseigné pour ce bénéficiaire.');

  return {
    nbBilans: sortedBilans.length,
    dernierBilanDate: dernierBilan?.date ?? null,
    aProgression: sortedBilans.length >= 2,
    nbSeancesRealisees: contratActif?.nombreSeancesRealisees ?? null,
    nbSeancesTotal: contratActif?.nombreSeancesTotal ?? null,
    aObjectifs,
    aProgrammeActif: !!programmeActif,
    avertissements,
  };
}

function buildDonneesPatientText(
  patient: Participant,
  contratActif: Contrat | null,
  programmeActif: Programme | null,
): string {
  const sortedBilans = [...patient.bilans].sort((a, b) => b.date.localeCompare(a.date));
  const dernierBilan = sortedBilans[0] ?? null;
  const bilanInitial = sortedBilans.length > 1 ? sortedBilans[sortedBilans.length - 1] : null;

  const objectifs = [
    patient.objectifsPatient
      ? `Objectifs patient : ${Array.isArray(patient.objectifsPatient) ? patient.objectifsPatient.join(', ') : patient.objectifsPatient}`
      : null,
    dernierBilan?.objectifsSuivants ? `Objectifs suivants (dernier bilan) : ${dernierBilan.objectifsSuivants}` : null,
  ].filter(Boolean).join('\n') || 'Non renseigné';

  return `Identité : ${patient.prenom} ${patient.nom}, ${calcAge(patient.dateNaissance)} ans
Pathologie principale : ${patient.pathologie || 'non renseignée'}

${dernierBilan ? `DERNIER BILAN — ${fmtDate(dernierBilan.date)} (${dernierBilan.type === 'initial' ? 'initial' : `T${dernierBilan.trimestre}`})
${buildBilanText(dernierBilan)}` : 'Aucun bilan enregistré.'}

${bilanInitial && dernierBilan ? `PROGRESSION (${fmtDate(bilanInitial.date)} → ${fmtDate(dernierBilan.date)})
${buildEvolution(bilanInitial, dernierBilan)}` : 'Progression non disponible (un seul bilan ou moins).'}

SÉANCES
${contratActif
  ? `Séances réalisées : ${contratActif.nombreSeancesRealisees} / ${contratActif.dureeIndeterminee ? 'durée indéterminée' : contratActif.nombreSeancesTotal}
Période : du ${fmtDate(contratActif.dateDebut)}${contratActif.dureeIndeterminee ? '' : ` au ${fmtDate(contratActif.dateFin)}`}
Fréquence : ${contratActif.nbSeancesSemaine} séance${contratActif.nbSeancesSemaine > 1 ? 's' : ''}/semaine · ${contratActif.dureeMinutes} minutes par séance`
  : 'Non renseigné — aucun contrat de suivi actif.'}

OBJECTIFS
${objectifs}

PROGRAMME EN COURS
${buildProgrammeText(programmeActif)}`;
}

const REGLES_STRICTES = `RÈGLES STRICTES :
- N'invente AUCUNE donnée. Si une information attendue n'est pas disponible dans les données patient, écris "Non renseigné" à cet endroit plutôt que de la déduire ou de l'inventer.
- Ne pose aucun diagnostic médical. Ne mentionne pas de pathologie au-delà de ce qui est explicitement indiqué dans les données patient.
- N'extrapole pas de conclusion clinique non étayée par les chiffres fournis.
- Ton sobre et professionnel, adapté à un document médico-social. Pas d'emojis.
- Cite les valeurs exactes des tests quand tu en parles.`;

function libelleTypeChamp(champ: ChampFormulaire): string {
  if (champ.type === 'checkbox') return 'case à cocher — réponds "Oui" ou "Non"';
  if (champ.type === 'radio') return `bouton radio${champ.options?.length ? ` — options possibles : ${champ.options.join(', ')}` : ''}`;
  if (champ.type === 'dropdown') return `liste déroulante${champ.options?.length ? ` — options possibles : ${champ.options.join(', ')}` : ''}`;
  if (champ.type === 'text') return 'champ texte';
  return 'champ';
}

/** Prompt pour le remplissage d'un PDF AcroForm : Claude renvoie un JSON { nomChamp: valeur }. */
export function buildChampsAcroFormPrompt(opts: {
  champs: ChampFormulaire[];
  patient: Participant;
  structure: Structure;
  contratActif: Contrat | null;
  programmeActif: Programme | null;
}): string {
  const { champs, patient, structure, contratActif, programmeActif } = opts;
  const listeChamps = champs.map(c => `- "${c.nom}" (${libelleTypeChamp(c)})`).join('\n');

  return `Tu es l'assistant d'un enseignant en Activité Physique Adaptée (APA) qui exerce en libéral et intervient auprès de structures (EHPAD, centres, associations).

On te donne la liste des champs d'un formulaire PDF utilisé par une structure, et les données réelles disponibles pour un patient suivi par cet enseignant.

Ta tâche : pour chaque champ listé ci-dessous, indiquer la valeur à y inscrire à partir des données du patient.

${REGLES_STRICTES}
- Si une donnée manque pour un champ, utilise la valeur "Non renseigné" (ou "Non" pour une case à cocher).
- Réponds UNIQUEMENT avec un objet JSON de la forme { "nomDuChamp": "valeur" }, une entrée pour chaque champ listé ci-dessous, rien d'autre avant ou après.

═══════════════════════════════════════
CHAMPS DU FORMULAIRE — ${structure.nom}
═══════════════════════════════════════
${listeChamps}

═══════════════════════════════════════
DONNÉES DU PATIENT
═══════════════════════════════════════
${buildDonneesPatientText(patient, contratActif, programmeActif)}`;
}
