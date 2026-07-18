import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, Send, Mic, MicOff, Copy, ArrowLeft, RefreshCw, Search, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import { useContrats } from '../hooks/useContrats';
import { useStructures } from '../hooks/useStructures';
import { getContreIndications, getTestsAutonomie, getTraitementsActifs, getTraitementsArretes } from '../lib/anamnese';
import { partagerDocument } from '../lib/partageDocument';
import { supabase, getAuthHeader } from '../lib/supabase';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { toast } from 'sonner';
import { pdfMake, mdToPdfMake } from '../utils/markdownToPdf';
import MarkdownRendu from '../components/ui/MarkdownRendu';
import ModalRelecturePartage from '../components/assistant/ModalRelecturePartage';
import { EXERCICES_BASE, loadExercicesPraticien } from '../data/exercices';
import { genererQuestionsClarification, genererProgrammeStructure } from '../utils/genererProgrammeIA';
import {
  formatContratContexte, formatProgrammeContexte, formatExerciceV1Ligne, formatExerciceV2Ligne,
  formatStructureContexte, calculerPlanningReel, formatPlanningReelContexte,
  formatDicteesContexte, formatNotesManuellesContexte, formatHistoriqueConversation,
  type ProgrammeResume, type PlanningReelResume, type SeanceReelleBrute, type NoteManuelleResume, type DicteeResume,
} from '../utils/assistantContexte';
import { filtrerLogsHistorique, regrouperLogsParBeneficiaire } from '../utils/assistantHistorique';
import type { Participant, Bilan, Contrat, RessentiSeance, StatutSeance, TypeStructure } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionType = 'contre_indications' | 'compte_rendu' | 'compte_rendu_famille' | 'programme' | 'interpretation' | 'libre';
type Phase = 'home' | 'chat';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'patient_select';
  content: string;
  /** Message d'interface statique (accueil, demande de bénéficiaire/objectif) plutôt
   *  que sortie du modèle — jamais une cible valide pour "🔄 Régénérer". */
  synthetic?: boolean;
}

interface AssistantLog {
  id: string;
  question: string;
  reponse: string;
  patient_id: string | null;
  created_at: string;
}

interface PatientExtras {
  compteRendus: DicteeResume[];
  notesManuelles: NoteManuelleResume[];
  /** Programme d'exercices actif, V1 (legacy) ou V2 (séances + planning) — les deux
   *  systèmes partagent la même table `programmes` et le même flag `actif`. */
  programme: ProgrammeResume | null;
  /** Assiduité aux EXERCICES du programme (auto-déclarée côté patient) — distincte de planningReel. */
  adherence?: {
    taux30j: number | null;
    nbSeances30j: number;
    derniereSeance: string | null;
    commentairesRecents: string[];
  };
  /** Présence aux SÉANCES PLANIFIÉES avec le praticien — distincte de adherence. */
  planningReel?: PlanningReelResume;
  loading: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ACTIONS: { id: ActionType; emoji: string; title: string; subtitle: string }[] = [
  { id: 'contre_indications', emoji: '💊',  title: 'Vérifier les contre-indications',  subtitle: 'CI actives + recommandations APA' },
  { id: 'compte_rendu',       emoji: '📋',  title: 'Rédiger un compte-rendu',          subtitle: 'Médecin prescripteur ou famille' },
  { id: 'programme',          emoji: '🏋️', title: "Suggérer un programme d'exercices", subtitle: 'Adapté au profil et aux CI' },
  { id: 'interpretation',     emoji: '📊',  title: 'Interpréter un résultat de test',  subtitle: 'Analyse clinique des derniers scores' },
];

const ACTION_LABELS: Record<ActionType, string> = {
  contre_indications:   'vérifier les contre-indications',
  compte_rendu:         'rédiger un compte-rendu médecin',
  compte_rendu_famille: 'rédiger un compte-rendu famille',
  programme:            "suggérer un programme d'exercices",
  interpretation:       'interpréter les résultats de test',
  libre:                'poser une question',
};

// ── PDF export ────────────────────────────────────────────────────────────────

function downloadPDF(patientNom: string, type: ActionType, markdownContent: string) {
  try {
  const date    = new Date().toISOString().split('T')[0];
  const dateStr = new Date().toLocaleDateString('fr-FR');
  const label   = type === 'compte_rendu' ? 'CR-medecin' : 'CR-famille';
  const filename = `${label}_${patientNom.replace(/ /g, '-')}_${date}.pdf`;

  const docDefinition = {
    // Marges en points (1mm ≈ 2.835pt) : 40pt ≈ 14mm, 55pt ≈ 19mm, 45pt ≈ 16mm
    pageMargins: [40, 55, 40, 45] as [number, number, number, number],

    header: () => ({
      columns: [
        { text: 'Horizon — APA', bold: true, fontSize: 10, color: 'white', margin: [40, 12, 0, 0] },
        { text: `Généré le ${dateStr}`, alignment: 'right', fontSize: 8, color: '#a0d8d8', margin: [0, 14, 40, 0] },
      ],
      fillColor: 'var(--color-ink)',
    }),

    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'Document généré par Horizon — Outil de suivi APA', fontSize: 7, color: '#969696', margin: [40, 8, 0, 0] },
        { text: `Page ${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 7, color: '#969696', margin: [0, 8, 40, 0] },
      ],
    }),

    content: mdToPdfMake(markdownContent),

    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.45, color: '#505050' },

    styles: {
      h1:   { fontSize: 16, bold: true,  color: 'var(--color-ink)', lineHeight: 1.3 },
      h2:   { fontSize: 12, bold: true,  color: 'var(--color-teal)', lineHeight: 1.3 },
      h3:   { fontSize: 10.5, bold: true, color: '#1A1A1A', lineHeight: 1.3 },
      body: { fontSize: 10, color: '#505050', lineHeight: 1.45 },
      bold: { fontSize: 10, bold: true, color: '#1A1A1A', lineHeight: 1.45 },
      th:   { fontSize: 9, bold: true, color: '#505050', fillColor: '#F0F5F5' },
      td:   { fontSize: 9, color: '#1A1A1A' },
    },
  };

  pdfMake.createPdf(docDefinition as any).download(filename);
  } catch (err) {
    console.error('Erreur PDF:', err);
    toast.error('Erreur lors de la génération du PDF. Réessayez.');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _msgId = 0;
function newId() { return String(++_msgId); }

function calcAge(d: string): number {
  const today = new Date(), birth = new Date(d);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

function loadPraticienPrenom(): string {
  try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}').prenom || ''; }
  catch { return ''; }
}

function fmt(d: string): string {
  return new Date(d + (d.includes('T') ? '' : 'T12:00')).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Formate TOUS les scores d'un bilan en texte lisible pour le prompt.
 *  Utilise les vrais noms TypeScript : tug3m, chairStand30, handGrip.droite, etc. */
function buildBilanText(bilan: Bilan): string {
  const lines: string[] = [];
  if (bilan.tug3m != null)                    lines.push(`TUG 3m : ${bilan.tug3m}s`);
  if (bilan.chairStand30 != null)             lines.push(`Chair Stand 30s : ${bilan.chairStand30} rép.`);
  if (bilan.handGrip.droite != null)          lines.push(`HandGrip D : ${bilan.handGrip.droite} kg`);
  if (bilan.handGrip.gauche != null)          lines.push(`HandGrip G : ${bilan.handGrip.gauche} kg`);
  if (bilan.equilibre.droite != null)         lines.push(`Équilibre unipodal D : ${bilan.equilibre.droite}s`);
  if (bilan.equilibre.gauche != null)         lines.push(`Équilibre unipodal G : ${bilan.equilibre.gauche}s`);
  if (bilan.souplesse.valeur != null)         lines.push(`Souplesse : ${bilan.souplesse.valeur}cm`);
  if (bilan.tm6.distanceMetres != null)       lines.push(`Test Marche 6min : ${bilan.tm6.distanceMetres}m`);
  if (bilan.tm6.borgRPE != null)              lines.push(`Borg RPE : ${bilan.tm6.borgRPE}/20`);
  if (bilan.tm6.fcAvant != null)              lines.push(`FC avant effort : ${bilan.tm6.fcAvant} bpm`);
  if (bilan.tm6.fcApres != null)              lines.push(`FC après effort : ${bilan.tm6.fcApres} bpm`);
  if (bilan.memoire.scoreImmediat != null)    lines.push(`Mémoire immédiate : ${bilan.memoire.scoreImmediat}/5`);
  if (bilan.memoire.scoreDiffere != null)     lines.push(`Mémoire différée : ${bilan.memoire.scoreDiffere}/5`);
  if (bilan.memoire.dubois?.scoreMIS != null) lines.push(`Dubois MIS : ${bilan.memoire.dubois.scoreMIS}/10`);
  if (bilan.interpretationIA?.textePro)       lines.push(`\nInterprétation IA :\n${bilan.interpretationIA.textePro}`);
  if (bilan.notesProfessionnelles)            lines.push(`\nNotes pro : ${bilan.notesProfessionnelles}`);
  if (bilan.pointsVigilance)                  lines.push(`Points de vigilance : ${bilan.pointsVigilance}`);
  return lines.join('\n') || 'Aucun score renseigné';
}

/** Calcule et formate l'évolution entre deux bilans. */
function buildEvolution(ancien: Bilan, recent: Bilan): string {
  const lines: string[] = [];
  function cmp(
    label: string,
    a: number | null | undefined,
    b: number | null | undefined,
    lowerIsBetter = false
  ) {
    if (a == null || b == null) return;
    const diff = b - a;
    const improved = lowerIsBetter ? diff < 0 : diff > 0;
    const emoji = diff === 0 ? '➡️' : improved ? '✅' : '⚠️';
    lines.push(`${emoji} ${label} : ${a} → ${b} (${diff > 0 ? '+' : ''}${diff})`);
  }
  cmp('TUG 3m',      ancien.tug3m,              recent.tug3m,              true);
  cmp('Chair Stand', ancien.chairStand30,        recent.chairStand30);
  cmp('HandGrip D',  ancien.handGrip.droite,     recent.handGrip.droite);
  cmp('Équilibre D', ancien.equilibre.droite,    recent.equilibre.droite);
  cmp('Souplesse',   ancien.souplesse.valeur,    recent.souplesse.valeur);
  cmp('TM6',         ancien.tm6.distanceMetres,  recent.tm6.distanceMetres);
  return lines.join('\n') || 'Données insuffisantes pour calculer l\'évolution';
}

/** Charge le programme actif d'un patient directement depuis Supabase (requête
 *  scopée, pas de hook réactif) — un hook keyed sur le patient sélectionné
 *  introduirait un risque de lire les données de l'ancien patient au moment
 *  où runAction() construit le prompt juste après la sélection.
 *  Gère les deux formats qui partagent la table `programmes` (colonne `type`
 *  NULL = V1 legacy avec exercices catalogués ; `type` renseigné = V2 avec
 *  séances + planning dans des tables séparées). */
async function chargerProgrammeActif(patientId: string): Promise<ProgrammeResume | null> {
  if (!supabase) return null;

  const { data: progRows } = await supabase
    .from('programmes')
    .select('*')
    .eq('participant_id', patientId)
    .eq('actif', true)
    .limit(1);
  const row = progRows?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  if (row.type) {
    const { data: seanceRows } = await supabase.from('programme_seances').select('*').eq('programme_id', row.id).order('ordre');
    const seances = (seanceRows ?? []) as { id: string }[];
    const [exRes, planRes] = await Promise.all([
      seances.length > 0
        ? supabase.from('programme_exercices').select('*').in('seance_id', seances.map(s => s.id)).order('ordre')
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      supabase.from('programme_planning').select('*').eq('programme_id', row.id),
    ]);
    const exRows = (exRes.data ?? []) as Record<string, unknown>[];
    const planRows = (planRes.data ?? []) as Record<string, unknown>[];

    const lignes = seances.flatMap(s => {
      const jours = planRows.filter(p => p.seance_id === s.id).map(p => p.jour as string);
      return exRows
        .filter(e => e.seance_id === s.id)
        .map(e => formatExerciceV2Ligne(
          { nom: (e.nom as string) ?? '', series: (e.series as number) ?? undefined, repetitions: (e.repetitions as number) ?? undefined, dureeSecondes: (e.duree_secondes as number) ?? undefined },
          jours,
        ));
    });
    return {
      titre: (row.nom as string) || (row.titre as string) || 'Programme',
      objectif: (row.objectif as string) || null,
      messageMotivation: (row.message_motivation as string) || null,
      lignesExercices: lignes,
    };
  }

  const exercices = (row.exercices ?? []) as { exerciceId: string; niveau?: string; series?: number; repetitions?: number | null; dureeSecondes?: number | null; frequenceParSemaine?: number[] }[];
  const lignes = exercices.map(ex => {
    const nom = EXERCICES_BASE.find(e => e.id === ex.exerciceId)?.nom ?? ex.exerciceId;
    return formatExerciceV1Ligne(nom, ex);
  });
  return {
    titre: (row.titre as string) || 'Programme',
    objectif: (row.objectif as string) || null,
    messageMotivation: (row.message_motivation as string) || null,
    lignesExercices: lignes,
  };
}

/** Construit le prompt système enrichi avec TOUTES les données du patient. */
function buildSystemPrompt(
  patient: Participant | null,
  extras: PatientExtras | null,
  contrat?: Contrat | null,
  structure?: { nom: string; type?: TypeStructure } | null,
): string {
  const base = `Tu es un assistant clinique expert en Activité Physique Adaptée (APA), spécialisé dans l'accompagnement des enseignants APA libéraux en France.
Tu réponds UNIQUEMENT en français. Tu es concis, professionnel et pratique.
Tu ne fais jamais de diagnostic médical. Tu conseilles sur la pratique APA uniquement.
Tu bases TOUJOURS tes recommandations sur les données réelles du patient ci-dessous.
Tu cites les valeurs exactes des tests quand tu en parles.
Tu signales systématiquement l'évolution positive ou négative entre les bilans.
Tu cites les recommandations HAS ou SFP-APA quand pertinent.`;

  if (!patient) return base;

  const age = calcAge(patient.dateNaissance);
  const bilanInitial = patient.bilans.find(b => b.type === 'initial') ?? null;
  const profil = bilanInitial?.profilEnrichi;
  const ciInfo = getContreIndications(patient, bilanInitial);
  const ci = ciInfo.actif ? (ciInfo.detail ?? 'non précisées') : 'aucune contre-indication renseignée';
  const pathologies = [patient.pathologie, patient.antecedentsMedicaux].filter(Boolean).join(' / ') || 'non renseigné';
  const traitementsActifsCtx = getTraitementsActifs(patient.traitements);
  const traitementsArretesCtx = getTraitementsArretes(patient.traitements);
  const imc = patient.taille && patient.poids
    ? (patient.poids / ((patient.taille / 100) ** 2)).toFixed(1) : 'NE';

  const sortedBilans = [...patient.bilans].sort((a, b) => b.date.localeCompare(a.date));
  const dernierBilan   = sortedBilans[0] ?? null;
  const bilanPrecedent = sortedBilans[1] ?? null;

  const { sedentarite, fatigue } = getTestsAutonomie(patient, bilanInitial);
  const sedProfilLabel = sedentarite.profil === 'inactif' ? 'Inactif'
    : sedentarite.profil === 'actif' ? 'Actif'
    : sedentarite.profil === 'tres_actif' ? 'Très actif' : null;
  const fssProfilLabel = fatigue.profil === 'pas_de_fatigue' ? 'Pas de fatigue significative'
    : fatigue.profil === 'fatigue_probable' ? 'Fatigue probable' : null;

  const extra = [
    profil?.douleursNiveau != null ? `- Douleur habituelle : ${profil.douleursNiveau}/10${profil.douleursLocalisation ? ` (${profil.douleursLocalisation})` : ''}` : null,
    profil?.chutes12mois != null ? `- Chutes / 12 mois : ${profil.chutes12mois}` : null,
    profil?.anticoagulants ? '- Anticoagulants : ⚠️ Oui — risque de saignement/chute à signaler systématiquement' : null,
    patient.antecedentsChirurgicaux ? `- ATCD chirurgicaux : ${patient.antecedentsChirurgicaux}` : null,
    patient.allergies ? `- Allergies : ${patient.allergies}` : null,
    traitementsActifsCtx.length > 0
      ? `- Traitements en cours : ${traitementsActifsCtx.map(t => `${t.nom}${t.dose ? ` (${t.dose})` : ''}${t.effetSecondaire ? ` — ${t.effetSecondaire}` : ''}`).join(', ')}`
      : null,
    traitementsArretesCtx.length > 0
      ? `- Traitements arrêtés : ${traitementsArretesCtx.map(t => `${t.nom}${t.dose ? ` (${t.dose})` : ''} (arrêté le ${new Date((t.date_fin ?? '') + 'T12:00').toLocaleDateString('fr-FR')})`).join(', ')}`
      : null,
    profil?.objectifsPersonnels ? `- Objectifs personnels : ${profil.objectifsPersonnels}` : null,
    sedProfilLabel ? `- Niveau d'activité physique : ${sedProfilLabel} (score ${sedentarite.score ?? '?'}/55 — Ricci & Gagnon)` : null,
    fssProfilLabel ? `- Fatigue perçue : ${fssProfilLabel} (FSS ${fatigue.score ?? '?'}/63)` : null,
  ].filter(Boolean).join('\n');

  const dicteesText = formatDicteesContexte(extras?.compteRendus ?? []);
  const notesManuellesText = formatNotesManuellesContexte(extras?.notesManuelles ?? []);
  const planningReelText = formatPlanningReelContexte(extras?.planningReel ?? null);
  const structureText = formatStructureContexte(structure ?? null);

  return `${base}

═══════════════════════════════════════
PROFIL DU PATIENT
═══════════════════════════════════════
Nom : ${patient.prenom} ${patient.nom}
Âge : ${age} ans (né(e) le ${new Date(patient.dateNaissance).toLocaleDateString('fr-FR')})
Taille / Poids / IMC : ${patient.taille ? patient.taille + 'cm' : 'NE'} · ${patient.poids ? patient.poids + 'kg' : 'NE'} · IMC ${imc}
Pathologies : ${pathologies}
Contre-indications à l'effort : ${ci}
${extra ? extra + '\n' : ''}
${dernierBilan ? `
═══════════════════════════════════════
DERNIER BILAN — ${fmt(dernierBilan.date)} (${dernierBilan.type === 'initial' ? 'initial' : `T${dernierBilan.trimestre}`})
═══════════════════════════════════════
${buildBilanText(dernierBilan)}
` : '⚠️ Aucun bilan enregistré pour ce patient.'}
${bilanPrecedent ? `
═══════════════════════════════════════
BILAN PRÉCÉDENT — ${fmt(bilanPrecedent.date)} (${bilanPrecedent.type === 'initial' ? 'initial' : `T${bilanPrecedent.trimestre}`})
═══════════════════════════════════════
${buildBilanText(bilanPrecedent)}

ÉVOLUTION (${fmt(bilanPrecedent.date)} → ${fmt(dernierBilan!.date)}) :
${buildEvolution(bilanPrecedent, dernierBilan!)}
` : ''}
${sortedBilans.length > 2 ? `
═══════════════════════════════════════
BILAN ANTÉRIEUR — ${fmt(sortedBilans[2].date)}
═══════════════════════════════════════
${buildBilanText(sortedBilans[2])}
` : ''}
═══════════════════════════════════════
CONTRAT DE SUIVI
═══════════════════════════════════════
${formatContratContexte(contrat ?? null)}
${contrat ? '⚠️ Respecter impérativement cette durée et cette fréquence dans TOUS les programmes générés.' : 'Adapter le programme à la situation réelle (pas de contrat renseigné).'}

═══════════════════════════════════════
PROGRAMME D'EXERCICES ACTIF
═══════════════════════════════════════
${formatProgrammeContexte(extras?.programme ?? null)}

═══════════════════════════════════════
SÉANCES DICTÉES RÉCENTES
═══════════════════════════════════════
${dicteesText}
${notesManuellesText ? `
═══════════════════════════════════════
NOTES MANUELLES RÉCENTES (saisies rapides, distinctes des séances dictées)
═══════════════════════════════════════
${notesManuellesText}
` : ''}
${extras?.adherence ? `
═══════════════════════════════════════
ASSIDUITÉ AUX EXERCICES DU PROGRAMME (30 derniers jours, auto-déclarée par le patient)
═══════════════════════════════════════
Taux de réalisation des exercices : ${extras.adherence.taux30j !== null ? extras.adherence.taux30j + '%' : 'non calculé (aucun exercice enregistré)'}
Séances enregistrées par le patient : ${extras.adherence.nbSeances30j}
Dernière séance côté patient : ${extras.adherence.derniereSeance ? new Date(extras.adherence.derniereSeance + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : 'inconnue'}
${extras.adherence.commentairesRecents.length > 0 ? 'Commentaires récents du patient :\n' + extras.adherence.commentairesRecents.map(c => `· ${c}`).join('\n') : ''}` : ''}
${planningReelText ? `
═══════════════════════════════════════
PRÉSENCE AUX SÉANCES PLANIFIÉES AVEC LE PRATICIEN (distincte de l'assiduité aux exercices ci-dessus)
═══════════════════════════════════════
${planningReelText}
` : ''}
${structureText ? `
═══════════════════════════════════════
STRUCTURE DE RATTACHEMENT
═══════════════════════════════════════
${structureText}
` : ''}
═══════════════════════════════════════
RÈGLES ABSOLUES
═══════════════════════════════════════
1. Toujours vérifier les CI avant toute suggestion
2. Citer les valeurs exactes des tests dans chaque recommandation
3. Comparer systématiquement avec les bilans précédents si disponibles
4. Si anticoagulants → signaler le risque choc/chute dans CHAQUE proposition
5. Ne jamais faire de diagnostic médical
6. Respecter strictement la durée et la fréquence de séance du contrat en cours — signaler explicitement si ce contrat n'est plus actif (terminé/suspendu)
7. Ne pas confondre l'assiduité aux exercices du programme (auto-déclarée par le patient) et la présence aux séances planifiées avec le praticien — ce sont deux mesures distinctes`;
}

function buildActionPrompt(action: ActionType, patient: Participant, extras: PatientExtras | null, contrat?: Contrat | null, structure?: { nom: string; type?: TypeStructure } | null): string {
  const sys = buildSystemPrompt(patient, extras, contrat, structure);
  switch (action) {
    case 'contre_indications':
      return `${sys}\n\n---\nQUESTION:\nEffectue une analyse complète des contre-indications à l'effort pour ce patient.\nPour chaque contre-indication identifiée :\n1. Décris le risque spécifique en APA\n2. Donne les précautions à respecter\n3. Liste les types d'exercices à éviter absolument\n4. Propose des alternatives adaptées et sécurisées`;
    case 'compte_rendu':
      return `${sys}\n\n---\nQUESTION:\nGénère un compte-rendu médecin professionnel et structuré à envoyer au médecin prescripteur.\nFormat :\n## Compte-rendu APA — ${patient.prenom} ${patient.nom}\n**Date :** ${new Date().toLocaleDateString('fr-FR')}\n### Bilan fonctionnel\n### Évolution constatée\n### Programme réalisé\n### Recommandations pour la suite\n### Points de vigilance\nRédige ce compte-rendu en citant les valeurs exactes des tests.`;
    case 'compte_rendu_famille':
      return `${sys}\n\n---\nQUESTION:\nRédige un compte-rendu destiné à la famille de ${patient.prenom} ${patient.nom}, en langage simple et accessible (sans jargon médical).\nFormat :\n## Bilan pour la famille — ${patient.prenom} ${patient.nom}\n**Date :** ${new Date().toLocaleDateString('fr-FR')}\n### Comment se porte ${patient.prenom} ?\n### Les progrès observés\n### Le programme en cours\n### Ce qu'il faut surveiller à la maison\n### Nos conseils pour accompagner ${patient.prenom} au quotidien\nRédige de façon chaleureuse, positive et concrète. Explique chaque résultat en termes simples (ex : "le test de marche montre que…" plutôt que des chiffres bruts).`;
    case 'interpretation':
      return `${sys}\n\n---\nQUESTION:\nAnalyse et interprète les derniers résultats de bilans de ce patient.\nPour chaque test disponible :\n- Compare aux normes pour l'âge (cite les références HAS / SFP-APA)\n- Indique si le résultat est satisfaisant, à surveiller, ou préoccupant\n- Explique les implications pratiques pour les séances APA\n- Identifie les priorités de travail\nConclude sur le profil fonctionnel global.`;
    // 'programme' n'utilise plus ce prompt texte libre — voir
    // genererProgrammeIA.ts (genererQuestionsClarification / genererProgrammeStructure),
    // déclenché depuis handlePatientSelected() et handleGenererProgrammeStructure().
    default:
      return sys;
  }
}

// ── PatientChips ──────────────────────────────────────────────────────────────

function PatientChips({ participants, onSelect }: { participants: Participant[]; onSelect: (p: Participant) => void }) {
  const [q, setQ] = useState('');
  const filtered = q.trim()
    ? participants.filter(p => `${p.prenom} ${p.nom}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : participants.slice(0, participants.length <= 5 ? participants.length : 6);
  const showSearch = participants.length > 5;
  return (
    <div style={{ maxWidth: 480 }}>
      {showSearch && (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un bénéficiaire…" autoFocus
            style={{ width: '100%', padding: '8px 10px 8px 30px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#F9FAFB' }} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(p => (
          <button key={p.id} onClick={() => onSelect(p)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}
            onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--color-teal)')}
            onMouseOut={e => (e.currentTarget.style.borderColor = '#E5E7EB')}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-teal)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {p.prenom[0]}{p.nom[0]}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{p.prenom} {p.nom}</div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>{calcAge(p.dateNaissance)} ans{p.pathologie ? ` · ${p.pathologie.slice(0, 28)}` : ''}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Indicateur contexte chargé ────────────────────────────────────────────────

function ContextIndicator({ patient, extras }: { patient: Participant; extras: PatientExtras }) {
  const hasBilans = patient.bilans.length > 0;
  const dernierBilan = [...patient.bilans].sort((a, b) => b.date.localeCompare(a.date))[0];
  const hasObjectif = !!(patient.objectifsPatient || patient.bilans[0]?.bilanInitialData?.formulaireFlat?.data);

  const items = [
    { ok: !!(patient.pathologie || patient.antecedentsMedicaux), label: 'Profil médical', detail: '' },
    { ok: hasBilans, label: hasBilans ? `${patient.bilans.length} bilan${patient.bilans.length > 1 ? 's' : ''} chargé${patient.bilans.length > 1 ? 's' : ''}` : 'Aucun bilan', detail: hasBilans && dernierBilan ? `dernier : ${fmt(dernierBilan.date)}` : '' },
    { ok: extras.compteRendus.length > 0, label: extras.compteRendus.length > 0 ? `${extras.compteRendus.length} séance${extras.compteRendus.length > 1 ? 's' : ''} dictée${extras.compteRendus.length > 1 ? 's' : ''}` : 'Aucune séance dictée', detail: '' },
    { ok: hasObjectif, label: 'Objectifs renseignés', detail: '' },
  ];

  if (extras.loading) {
    return <div style={{ fontSize: 11, color: '#9CA3AF', padding: '4px 0' }}>⏳ Chargement des données…</div>;
  }

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: item.ok ? '#059669' : '#D97706' }}>
          <span>{item.ok ? '✅' : '⚠️'}</span>
          <span>{item.label}</span>
          {item.detail && <span style={{ color: '#9CA3AF', marginLeft: 2 }}>({item.detail})</span>}
        </div>
      ))}
    </div>
  );
}

// ── Colonne gauche (partagée home + chat) ─────────────────────────────────────

/** Une ligne d'historique (question restaurable + suppression). Le conteneur est un
 *  `div role="button"` (pas un `<button>`) car il contient lui-même un bouton de
 *  suppression — un bouton dans un bouton serait invalide en HTML. */
function LigneHistorique({
  log, onRestoreLog, onDeleteLog,
}: {
  log: AssistantLog;
  onRestoreLog: (l: AssistantLog) => void;
  onDeleteLog: (id: string) => void;
}) {
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onRestoreLog(log)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRestoreLog(log); } }}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 4, width: '100%', textAlign: 'left', padding: '6px 4px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 5 }}
      onMouseOver={e => (e.currentTarget.style.background = '#F0F9F9')}
      onMouseOut={e => (e.currentTarget.style.background = 'none')}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.4 }}>· "{log.question.length > 44 ? log.question.slice(0, 44) + '…' : log.question}"</div>
        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>
          {new Date(log.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} →
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDeleteLog(log.id); }}
        title="Supprimer cette entrée"
        style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', flexShrink: 0 }}
        onMouseOver={e => (e.currentTarget.style.color = '#DC2626')}
        onMouseOut={e => (e.currentTarget.style.color = '#D1D5DB')}>
        <Trash2 size={11} />
      </button>
    </div>
  );
}

function LeftColumn({
  logs, participants, selectedPatient, extras, logSearch, setLogSearch,
  onRestoreLog, onDeleteLog, onSelectPatient, onRemovePatient, showBackButton, onBack,
}: {
  logs: AssistantLog[];
  participants: Participant[];
  selectedPatient: Participant | null;
  extras: PatientExtras | null;
  logSearch: string;
  setLogSearch: (s: string) => void;
  onRestoreLog: (l: AssistantLog) => void;
  onDeleteLog: (id: string) => void;
  onSelectPatient: (p: Participant) => void;
  onRemovePatient: () => void;
  showBackButton: boolean;
  onBack: () => void;
}) {
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [patientQ, setPatientQ] = useState('');
  const [expandedGroupes, setExpandedGroupes] = useState<Set<string>>(() => new Set());
  const [expandedFils, setExpandedFils] = useState<Set<string>>(() => new Set());

  const nomPatient = (patientId: string | null): string => {
    if (!patientId) return '';
    const p = participants.find(x => x.id === patientId);
    return p ? `${p.prenom} ${p.nom}` : '';
  };

  const groupes = regrouperLogsParBeneficiaire(filtrerLogsHistorique(logs, logSearch, nomPatient));
  const groupeKey = (patientId: string | null) => patientId ?? '__sans_beneficiaire__';

  function toggleGroupe(key: string) {
    setExpandedGroupes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function toggleFil(key: string) {
    setExpandedFils(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const filteredPatients = patientQ.trim()
    ? participants.filter(p => `${p.prenom} ${p.nom}`.toLowerCase().includes(patientQ.toLowerCase())).slice(0, 8)
    : participants.slice(0, 8);

  const ciTexte = selectedPatient ? getContreIndications(selectedPatient).detail : null;

  return (
    <div style={{ width: 280, flexShrink: 0, borderRight: '0.5px solid #E5E7EB', background: 'white', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {showBackButton && (
        <div style={{ padding: '12px 14px 8px', borderBottom: '0.5px solid #F3F4F6' }}>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6B7280', padding: '4px 0' }}>
            <ArrowLeft size={14} /> Retour
          </button>
        </div>
      )}

      {/* Contexte patient */}
      <div style={{ padding: '14px 14px 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Contexte bénéficiaire
        </div>

        {selectedPatient ? (
          <div>
            <div style={{ background: '#F0F9F9', border: '1px solid rgba(43,191,191,0.25)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{selectedPatient.prenom} {selectedPatient.nom}</div>
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                    {calcAge(selectedPatient.dateNaissance)} ans{selectedPatient.pathologie ? ` · ${selectedPatient.pathologie.slice(0, 24)}` : ''}
                  </div>
                  {ciTexte && (
                    <div style={{ marginTop: 6, fontSize: 10, color: '#DC2626', fontWeight: 600, background: '#FEE2E2', borderRadius: 4, padding: '3px 7px' }}>
                      ⚠️ {ciTexte.slice(0, 60)}{ciTexte.length > 60 ? '…' : ''}
                    </div>
                  )}
                </div>
                <button onClick={onRemovePatient} title="Retirer" style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, flexShrink: 0 }}>✕</button>
              </div>
              {extras && <ContextIndicator patient={selectedPatient} extras={extras} />}
            </div>
            <button onClick={() => setShowPatientSearch(v => !v)}
              style={{ marginTop: 8, width: '100%', padding: '6px 10px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
              Changer de bénéficiaire
            </button>
          </div>
        ) : (
          <button onClick={() => setShowPatientSearch(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer' }}>
            <Search size={13} style={{ color: '#9CA3AF' }} />
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>Sélectionner un bénéficiaire…</span>
          </button>
        )}

        {showPatientSearch && (
          <div style={{ marginTop: 8, border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
            <div style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6', position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input type="text" value={patientQ} onChange={e => setPatientQ(e.target.value)} placeholder="Rechercher…" autoFocus
                style={{ width: '100%', padding: '5px 8px 5px 24px', border: 'none', outline: 'none', fontSize: 12, background: 'transparent', boxSizing: 'border-box' }} />
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {filteredPatients.map(p => (
                <button key={p.id} onClick={() => { onSelectPatient(p); setShowPatientSearch(false); setPatientQ(''); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #F9FAFB', textAlign: 'left' }}
                  onMouseOver={e => (e.currentTarget.style.background = '#F0F9F9')}
                  onMouseOut={e => (e.currentTarget.style.background = 'none')}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--color-teal)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                    {p.prenom[0]}{p.nom[0]}
                  </div>
                  <div><div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{p.prenom} {p.nom}</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>{calcAge(p.dateNaissance)} ans</div></div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ height: '0.5px', background: '#E5E7EB' }} />

      {/* Historique */}
      <div style={{ padding: '10px 14px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Questions récentes</div>
        {logs.length > 5 && (
          <div style={{ position: 'relative', marginBottom: 7 }}>
            <Search size={11} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input type="text" value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="Filtrer par question ou bénéficiaire…"
              style={{ width: '100%', padding: '5px 7px 5px 22px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 11, outline: 'none', boxSizing: 'border-box', background: '#F9FAFB' }} />
          </div>
        )}
        {groupes.length === 0 ? (
          <div style={{ fontSize: 11, color: '#D1D5DB', textAlign: 'center', padding: '16px 0' }}>Aucune question récente</div>
        ) : groupes.map(groupe => {
          const key = groupeKey(groupe.patientId);
          const nom = groupe.patientId ? (nomPatient(groupe.patientId) || 'Bénéficiaire') : 'Sans bénéficiaire';
          const isOpen = expandedGroupes.has(key);
          return (
            <div key={key} style={{ marginBottom: 2 }}>
              <div
                role="button" tabIndex={0}
                onClick={() => toggleGroupe(key)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroupe(key); } }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 4px', cursor: 'pointer', borderRadius: 5, fontSize: 11.5, fontWeight: 600, color: '#374151' }}>
                {isOpen ? <ChevronUp size={12} style={{ color: '#9CA3AF', flexShrink: 0 }} /> : <ChevronDown size={12} style={{ color: '#9CA3AF', flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom} ({groupe.fils.length})</span>
              </div>
              {isOpen && (
                <div style={{ paddingLeft: 8 }}>
                  {groupe.fils.map(fil => {
                    const filKey = `${key}::${fil.question}`;
                    const filOpen = expandedFils.has(filKey);
                    const [dernier, ...anciennes] = fil.entries;
                    return (
                      <div key={filKey}>
                        <LigneHistorique log={dernier} onRestoreLog={onRestoreLog} onDeleteLog={onDeleteLog} />
                        {anciennes.length > 0 && (
                          <>
                            <button onClick={() => toggleFil(filKey)}
                              style={{ display: 'block', margin: '0 0 4px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--color-teal)' }}>
                              {filOpen ? 'Masquer' : 'Voir'} {anciennes.length} version{anciennes.length > 1 ? 's' : ''} précédente{anciennes.length > 1 ? 's' : ''}
                            </button>
                            {filOpen && anciennes.map(a => (
                              <LigneHistorique key={a.id} log={a} onRestoreLog={onRestoreLog} onDeleteLog={onDeleteLog} />
                            ))}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Component principal ───────────────────────────────────────────────────────

export default function AssistantPage() {
  const { participants } = useParticipants();
  const { contratsDeParticipant } = useContrats();
  const { structures } = useStructures();
  const location = useLocation();
  const navigate = useNavigate();

  const [phase, setPhase]               = useState<Phase>('home');
  const [actionType, setActionType]     = useState<ActionType | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Participant | null>(null);
  const [patientExtras, setPatientExtras] = useState<PatientExtras | null>(null);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [awaitingPatient, setAwaitingPatient] = useState(false);
  // Action "programme" : questions de clarification posées → affiche le
  // bouton "Générer le programme structuré". Le chat reste libre jusque-là
  // (et après) — jamais de génération automatique sur une réponse.
  const [programmeQuestionsPosees, setProgrammeQuestionsPosees] = useState(false);
  const [genererProgrammeLoading, setGenererProgrammeLoading] = useState(false);
  // Texte libre optionnel, en plus des échanges du chat (déjà transmis comme
  // reponsesClarification) — même mécanisme que ProgrammePage.tsx, voir
  // construirePrompt() dans genererProgrammeIA.ts.
  const [precisionsLibresProgramme, setPrecisionsLibresProgramme] = useState('');
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [logs, setLogs]                 = useState<AssistantLog[]>([]);
  const [logSearch, setLogSearch]       = useState('');
  const [expandedCard, setExpandedCard] = useState<ActionType | null>(null);
  const [modalPartage, setModalPartage] = useState<{
    destinataire: string;
    texteInitial: string;
    onConfirmer: (texteFinal: string) => Promise<void>;
  } | null>(null);

  const praticienPrenom = loadPraticienPrenom();
  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);

  const {
    isRecording, finalTranscript, interimTranscript,
    isSupported, startRecording, stopRecording, reset: resetSpeech,
  } = useSpeechRecognition();

  // Pré-sélectionner patient depuis l'état de navigation
  useEffect(() => {
    const state = location.state as { patientId?: string } | null;
    if (state?.patientId && participants.length > 0) {
      const p = participants.find(x => x.id === state.patientId);
      if (p) { selectPatient(p); handleStartAction('libre', p); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, participants]);

  useEffect(() => {
    const text = finalTranscript + interimTranscript;
    if (text) setInput(text);
  }, [finalTranscript, interimTranscript]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('assistant_logs')
        .select('id, question, reponse, patient_id, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setLogs(data as AssistantLog[]);
    } catch { /* non bloquant */ }
  }

  async function handleDeleteLog(logId: string) {
    if (!supabase) return;
    if (!window.confirm('Supprimer cette question de l’historique ?')) return;
    const precedent = logs;
    setLogs(prev => prev.filter(l => l.id !== logId));
    const { error } = await supabase.from('assistant_logs').delete().eq('id', logId);
    if (error) {
      setLogs(precedent);
      toast.error('Erreur lors de la suppression');
    }
  }

  /** Charge les séances dictées, notes manuelles, présence aux séances planifiées et
   *  assiduité aux exercices depuis Supabase pour le prompt IA. Renvoie la valeur
   *  calculée (en plus de la poser en state) pour les appelants qui en ont besoin
   *  immédiatement, sans dupliquer ces requêtes (cf. handlePatientSelected). */
  async function loadPatientExtras(patientId: string): Promise<PatientExtras> {
    setPatientExtras({ compteRendus: [], notesManuelles: [], programme: null, loading: true });
    try {
      return await loadPatientExtrasUnsafe(patientId);
    } catch (err) {
      // Dégradation gracieuse : une exception ici (réseau, etc.) ne doit ni bloquer
      // indéfiniment l'indicateur "Chargement…", ni empêcher runAction() de répondre
      // (le prompt se construit alors avec un contexte vide plutôt que de rien renvoyer).
      console.error('[AssistantPage] Erreur chargement contexte patient:', err);
      const extras: PatientExtras = { compteRendus: [], notesManuelles: [], programme: null, loading: false };
      setPatientExtras(extras);
      return extras;
    }
  }

  async function loadPatientExtrasUnsafe(patientId: string): Promise<PatientExtras> {
    const fenetrePlanningJours = 90;
    const seuilPlanning = new Date();
    seuilPlanning.setDate(seuilPlanning.getDate() - fenetrePlanningJours);
    const seuilPlanningISO = seuilPlanning.toISOString().slice(0, 10);

    const [crRes, spRes, notesRes, seancesRes, programmeRes] = await Promise.allSettled([
      supabase ? supabase.from('comptes_rendus_seances').select('date_seance, observations, progression, points_attention, douleurs_signalees').eq('participant_id', patientId).order('date_seance', { ascending: false }).limit(5) : Promise.resolve({ data: null }),
      supabase ? supabase.from('seances_patient').select('id, date_seance, commentaire_patient').eq('participant_id', patientId).order('date_seance', { ascending: false }).limit(30) : Promise.resolve({ data: null }),
      supabase ? supabase.from('notes_seances').select('date, ressenti, note, alertes, douleur_eva').eq('participant_id', patientId).order('date', { ascending: false }).limit(5) : Promise.resolve({ data: null }),
      // Colonnes explicites : motif_annulation/motif_annulation_detail sont internes
      // au praticien et ne doivent jamais transiter par le prompt IA (cf. assistantContexte.ts).
      supabase ? supabase.from('seances').select('date, statut').eq('participant_id', patientId).eq('type', 'seance').gte('date', seuilPlanningISO) : Promise.resolve({ data: null }),
      chargerProgrammeActif(patientId),
    ]);
    const programme = programmeRes.status === 'fulfilled' ? programmeRes.value : null;
    const crs: DicteeResume[] = crRes.status === 'fulfilled' && crRes.value.data
      ? (crRes.value.data as { date_seance: string; observations: string; progression: string | null; points_attention: string | null; douleurs_signalees: string | null }[]).map(r => ({
          dateSeance: r.date_seance, observations: r.observations, progression: r.progression,
          pointsAttention: r.points_attention, douleursSignalees: r.douleurs_signalees,
        }))
      : [];

    const notesManuelles: NoteManuelleResume[] = notesRes.status === 'fulfilled' && notesRes.value.data
      ? (notesRes.value.data as { date: string; ressenti: RessentiSeance | null; note: string; alertes: NoteManuelleResume['alertes']; douleur_eva: number | null }[]).map(r => ({
          date: r.date, ressenti: r.ressenti, note: r.note, alertes: r.alertes, douleurEVA: r.douleur_eva,
        }))
      : [];

    const seancesReelles: SeanceReelleBrute[] = seancesRes.status === 'fulfilled' && seancesRes.value.data
      ? (seancesRes.value.data as { date: string; statut: StatutSeance }[]).map(r => ({ date: r.date, statut: r.statut }))
      : [];
    const planningReel = calculerPlanningReel(seancesReelles, new Date(), fenetrePlanningJours);

    let adherence: PatientExtras['adherence'] = undefined;
    const spData = spRes.status === 'fulfilled' ? (spRes.value.data as Record<string, unknown>[] | null) ?? [] : [];
    if (spData.length > 0) {
      const j30 = new Date(); j30.setDate(j30.getDate() - 30);
      const sp30 = spData.filter(s => new Date(s.date_seance as string) >= j30);
      let taux30j: number | null = null;
      if (supabase && sp30.length > 0) {
        const erRes = await supabase.from('exercices_realises')
          .select('seance_patient_id, realise')
          .in('seance_patient_id', sp30.map(s => s.id));
        const erRows = (erRes.data ?? []) as { seance_patient_id: string; realise: boolean }[];
        const total = erRows.length;
        const realises = erRows.filter(e => e.realise).length;
        taux30j = total > 0 ? Math.round((realises / total) * 100) : null;
      }
      adherence = {
        taux30j,
        nbSeances30j: sp30.length,
        derniereSeance: (spData[0]?.date_seance as string | null) ?? null,
        commentairesRecents: spData
          .filter(s => s.commentaire_patient)
          .slice(0, 3)
          .map(s => `${s.date_seance as string} : "${s.commentaire_patient as string}"`),
      };
    }

    const extras: PatientExtras = { compteRendus: crs, notesManuelles, programme, adherence, planningReel, loading: false };
    setPatientExtras(extras);
    return extras;
  }

  function selectPatient(p: Participant) {
    setSelectedPatient(p);
    void loadPatientExtras(p.id);
  }

  function deselectPatient() {
    setSelectedPatient(null);
    setPatientExtras(null);
  }

  function handleStartAction(action: ActionType, prePatient?: Participant) {
    setPhase('chat');
    setActionType(action);
    setProgrammeQuestionsPosees(false);
    setPrecisionsLibresProgramme('');

    if (action === 'libre') {
      const p = prePatient ?? selectedPatient;
      const greeting: Message = {
        id: newId(), role: 'assistant', synthetic: true,
        content: p
          ? `Contexte de ${p.prenom} ${p.nom} chargé avec ${p.bilans.length} bilan(s). Posez votre question.`
          : 'Bonjour ! Je suis votre assistant clinique APA. Posez votre question, ou sélectionnez un bénéficiaire dans la colonne gauche.',
      };
      setMessages([greeting]);
      return;
    }

    const label = ACTION_LABELS[action];
    setMessages([
      { id: newId(), role: 'assistant', synthetic: true, content: `Pour quel bénéficiaire souhaitez-vous ${label} ?` },
      { id: newId(), role: 'patient_select', content: '' },
    ]);
    setAwaitingPatient(true);
  }

  async function handlePatientSelected(patient: Participant) {
    selectPatient(patient);
    setAwaitingPatient(false);

    setMessages(prev => [
      ...prev.filter(m => m.role !== 'patient_select'),
      { id: newId(), role: 'user', content: `${patient.prenom} ${patient.nom}` },
    ]);

    if (!actionType || actionType === 'libre') return;

    if (actionType === 'programme') {
      setLoading(true);
      try {
        const questions = await genererQuestionsClarification(patient);
        setProgrammeQuestionsPosees(true);
        setMessages(prev => [...prev, {
          id: newId(), role: 'assistant', synthetic: true,
          content: `Pour construire le programme de ${patient.prenom}, quelques précisions :\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nRépondez librement (une ou plusieurs questions, ou creusez un point en particulier), puis cliquez sur "Générer le programme structuré" quand vous êtes prêt.`,
        }]);
      } catch {
        // Non bloquant — Pierre peut répondre librement puis générer sans
        // questions ciblées si l'appel de clarification échoue.
        setProgrammeQuestionsPosees(true);
        setMessages(prev => [...prev, {
          id: newId(), role: 'assistant', synthetic: true,
          content: `Pour quel objectif souhaitez-vous un programme pour ${patient.prenom} ? (ex : équilibre, force musculaire, endurance, douleurs…)\n\nRépondez librement, puis cliquez sur "Générer le programme structuré" quand vous êtes prêt.`,
        }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Charger les extras avant de lancer l'action (même chemin que selectPatient,
    // pour ne pas dupliquer ces requêtes avec une deuxième implémentation).
    const extras = supabase ? await loadPatientExtras(patient.id) : { compteRendus: [], notesManuelles: [], programme: null, loading: false };

    await runAction(actionType, patient, extras);
  }

  /** Contrat le plus récent, quel que soit son statut — un contrat terminé/suspendu
   *  doit rester visible (et signalé) plutôt que de disparaître silencieusement. */
  function getContratInfo(patient: Participant): Contrat | null {
    return contratsDeParticipant(patient.id)[0] ?? null;
  }

  function getStructureInfo(patient: Participant): { nom: string; type?: TypeStructure } | null {
    if (!patient.structureId) return null;
    const s = structures.find(st => st.id === patient.structureId);
    return s ? { nom: s.nom, type: s.type } : null;
  }

  /** Point d'appel unique vers /api/claude : centralise la vérification de statut HTTP
   *  et l'extraction du message d'erreur — un appelant qui oublierait `res.ok` afficherait
   *  silencieusement une réponse vide en cas d'échec (rate limit, timeout, clé manquante…). */
  async function callClaudeAPI(prompt: string): Promise<string> {
    const res = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ prompt }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`);
    return data?.text ?? '';
  }

  async function runAction(action: ActionType, patient: Participant, extras: PatientExtras) {
    setLoading(true);
    const prompt = buildActionPrompt(action, patient, extras, getContratInfo(patient), getStructureInfo(patient));
    // console.log('[AssistantPage] prompt:', prompt); // Décommenter pour débugger
    try {
      const text = await callClaudeAPI(prompt);
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: text }]);
      await saveLog(ACTION_LABELS[action], text, patient.id, action);
    } catch (err) {
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: `Erreur : ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setLoading(false);
    }
  }

  function extrasParDefaut(): PatientExtras {
    return patientExtras ?? { compteRendus: [], notesManuelles: [], programme: null, loading: false };
  }

  /** Cœur commun à l'envoi d'un message et à la régénération : construit le prompt
   *  (avec ou sans objectif de programme), appelle l'API et journalise. `historique`
   *  est passé explicitement (plutôt que de lire `messages`) pour que la régénération
   *  puisse l'exclure la paire Q/R qu'elle est en train de refaire. */
  async function genererReponse(questionText: string, historique: Message[]) {
    setLoading(true);
    try {

      const extras = extrasParDefaut();
      const sys = buildSystemPrompt(selectedPatient, extras, selectedPatient ? getContratInfo(selectedPatient) : null, selectedPatient ? getStructureInfo(selectedPatient) : null);
      const history = formatHistoriqueConversation(historique);
      const fullPrompt = history
        ? `${sys}\n\n---\nÉCHANGES PRÉCÉDENTS:\n${history}\n\n---\nQUESTION:\n${questionText}`
        : `${sys}\n\n---\nQUESTION:\n${questionText}`;
      const responseText = await callClaudeAPI(fullPrompt);
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: responseText }]);
      await saveLog(questionText, responseText, selectedPatient?.id ?? null, actionType ?? 'libre');
    } catch (err) {
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: `Erreur : ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setLoading(false);
    }
  }

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput('');
    resetSpeech();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const historiqueAvant = messages;
    setMessages(prev => [...prev, { id: newId(), role: 'user', content: trimmed }]);
    await genererReponse(trimmed, historiqueAvant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, messages, selectedPatient, actionType, patientExtras, resetSpeech, contratsDeParticipant, structures]);

  /** Relance la dernière réponse de l'assistant avec le même contexte. Insère une
   *  NOUVELLE entrée dans l'historique (jamais un update) pour garder une trace de
   *  chaque tentative — comparables entre elles — mais avec le même intitulé de
   *  question que l'original : LeftColumn regroupe alors les régénérations sous
   *  l'entrée d'origine au lieu de les lister à plat (cf. assistantHistorique.ts). */
  function regenerateLastResponse() {
    if (loading) return;
    const lastAssistantIdx = [...messages].map((_, i) => i).reverse().find(i => messages[i].role === 'assistant');
    if (lastAssistantIdx == null || messages[lastAssistantIdx].synthetic) return;
    let userIdx = lastAssistantIdx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const questionText = messages[userIdx].content;

    if (actionType && actionType !== 'libre' && actionType !== 'programme' && selectedPatient) {
      void runAction(actionType, selectedPatient, extrasParDefaut());
      return;
    }
    void genererReponse(questionText, messages.slice(0, userIdx));
  }

  async function saveLog(question: string, reponse: string, patientId: string | null, action: ActionType) {
    if (!supabase) return;
    try {
      await supabase.from('assistant_logs').insert({ patient_id: patientId, question, reponse, action_type: action });
      await loadLogs();
    } catch { /* non bloquant */ }
  }

  function handleToggleMic() {
    if (isRecording) { stopRecording(); }
    else { resetSpeech(); setInput(''); startRecording(); }
  }

  function handleCopyLast() {
    const last = [...messages].reverse().find(m => m.role === 'assistant')?.content;
    if (!last) return;
    navigator.clipboard.writeText(last);
    toast.success('Réponse copiée');
  }

  function handleRestoreLog(log: AssistantLog) {
    setPhase('chat');
    setActionType('libre');
    setMessages([
      { id: newId(), role: 'user',      content: log.question },
      { id: newId(), role: 'assistant', content: log.reponse },
    ]);
    if (log.patient_id) {
      const p = participants.find(x => x.id === log.patient_id);
      if (p) selectPatient(p);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  /** Déclenchement EXPLICITE uniquement (clic du praticien) — jamais sur une
   *  réponse du chat. Même mécanisme de génération que ProgrammePage.tsx
   *  (genererProgrammeIA.ts) : à la réussite, on ouvre l'écran de relecture
   *  déjà existant (PreviewIAModal) via navigation, plutôt que d'en construire
   *  un second dans le chat. */
  async function handleGenererProgrammeStructure() {
    if (!selectedPatient) return;
    setGenererProgrammeLoading(true);
    try {
      const contrat = getContratInfo(selectedPatient);
      const catalogue = await loadExercicesPraticien();
      const dernierBilan = [...selectedPatient.bilans].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
      const reponsesClarification = formatHistoriqueConversation(messages.filter(m => m.role === 'user' || m.role === 'assistant'));

      const programme = await genererProgrammeStructure(
        selectedPatient,
        {
          objectif: 'à déduire des échanges ci-dessous',
          frequence: contrat?.nbSeancesSemaine ?? 3,
          duree: contrat?.dureesSeances?.[0] ?? 45,
          niveau: 2,
        },
        reponsesClarification,
        catalogue,
        dernierBilan,
        [],
        precisionsLibresProgramme,
      );

      await saveLog('Génération de programme structuré', `Programme "${programme.nom}" généré (${programme.seances.length} séance(s))`, selectedPatient.id, 'programme');
      navigate(`/participant/${selectedPatient.id}/programme`, { state: { programmeGenereIA: programme } });
    } catch (err) {
      setMessages(prev => [...prev, {
        id: newId(), role: 'assistant',
        content: `Impossible de générer le programme structuré : ${err instanceof Error ? err.message : String(err)}. Réessayez.`,
      }]);
    } finally {
      setGenererProgrammeLoading(false);
    }
  }

  function resetToHome() {
    setPhase('home'); setActionType(null); setMessages([]); setAwaitingPatient(false); setInput(''); setExpandedCard(null);
    setProgrammeQuestionsPosees(false);
    setPrecisionsLibresProgramme('');
  }

  const sharedLeftColumn = (
    <LeftColumn
      logs={logs} participants={participants} selectedPatient={selectedPatient}
      extras={patientExtras} logSearch={logSearch} setLogSearch={setLogSearch}
      onRestoreLog={handleRestoreLog} onDeleteLog={handleDeleteLog} onSelectPatient={selectPatient} onRemovePatient={deselectPatient}
      showBackButton={phase === 'chat'} onBack={resetToHome}
    />
  );

  // ── HOME ──────────────────────────────────────────────────────────────────

  if (phase === 'home') {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F8FAFA' }}>
        {sharedLeftColumn}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
          <div style={{ maxWidth: 600, width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: 0 }}>Mon assistant</h1>
              <p style={{ fontSize: 15, color: '#6B7280', marginTop: 8 }}>
                {praticienPrenom ? `Bonjour ${praticienPrenom} ! ` : ''}Que souhaitez-vous faire ?
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              {ACTIONS.map(action => {
                if (action.id === 'compte_rendu' && expandedCard === 'compte_rendu') {
                  return (
                    <div key={action.id} style={{ gridColumn: '1 / -1', padding: '20px 18px', background: 'white', border: '1.5px solid #2BBFBF', borderRadius: 14, boxShadow: '0 4px 16px rgba(43,191,191,0.12)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <span style={{ fontSize: 24 }}>{action.emoji}</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{action.title}</div>
                          <div style={{ fontSize: 12, color: '#6B7280' }}>Choisissez le destinataire</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={() => { setExpandedCard(null); handleStartAction('compte_rendu'); }}
                          style={{ flex: 1, padding: '12px 14px', background: '#F0F9F9', border: '1.5px solid #2BBFBF', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}
                          onMouseOver={e => (e.currentTarget.style.background = '#E0F5F5')}
                          onMouseOut={e => (e.currentTarget.style.background = '#F0F9F9')}>
                          <div style={{ fontSize: 18, marginBottom: 4 }}>👨‍⚕️</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Médecin prescripteur</div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Vocabulaire clinique, valeurs exactes</div>
                        </button>
                        <button
                          onClick={() => { setExpandedCard(null); handleStartAction('compte_rendu_famille'); }}
                          style={{ flex: 1, padding: '12px 14px', background: '#F0F9F9', border: '1.5px solid #2BBFBF', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}
                          onMouseOver={e => (e.currentTarget.style.background = '#E0F5F5')}
                          onMouseOut={e => (e.currentTarget.style.background = '#F0F9F9')}>
                          <div style={{ fontSize: 18, marginBottom: 4 }}>👨‍👩‍👧</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Famille</div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Langage accessible, conseils pratiques</div>
                        </button>
                      </div>
                      <button onClick={() => setExpandedCard(null)}
                        style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9CA3AF' }}>
                        ✕ Annuler
                      </button>
                    </div>
                  );
                }
                return (
                  <button key={action.id}
                    onClick={() => action.id === 'compte_rendu' ? setExpandedCard('compte_rendu') : handleStartAction(action.id)}
                    style={{ padding: '20px 18px', background: 'white', border: '1.5px solid #E5E7EB', borderRadius: 14, cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-teal)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(43,191,191,0.12)'; }}
                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E5E7EB'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>{action.emoji}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1.4, marginBottom: 5 }}>{action.title}</div>
                    <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.4 }}>{action.subtitle}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => handleStartAction('libre')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6B7280', padding: '8px 16px', borderRadius: 8 }}
                onMouseOver={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-teal)'}
                onMouseOut={e => (e.currentTarget as HTMLElement).style.color = '#6B7280'}>
                ou ✏️ Poser une question libre…
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── CHAT ──────────────────────────────────────────────────────────────────

  const currentAction = actionType ? ACTIONS.find(a => a.id === actionType) : null;
  const chatTitle = actionType === 'compte_rendu_famille'
    ? '👨‍👩‍👧 Compte-rendu famille'
    : currentAction ? `${currentAction.emoji} ${currentAction.title}` : 'Mon assistant';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F8FAFA' }}>
      {sharedLeftColumn}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: 'white', borderBottom: '0.5px solid #E5E7EB', padding: '13px 22px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <Bot size={18} style={{ color: 'var(--color-teal)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {chatTitle}
              </div>
              {selectedPatient && (
                <div style={{ fontSize: 12, color: 'var(--color-teal)' }}>
                  Contexte : {selectedPatient.prenom} {selectedPatient.nom} · {selectedPatient.bilans.length} bilan(s)
                  {patientExtras && !patientExtras.loading && patientExtras.compteRendus.length > 0 && ` · ${patientExtras.compteRendus.length} dictée(s)`}
                </div>
              )}
            </div>
          </div>
          {messages.some(m => m.role === 'assistant') && !loading && (
            <div style={{ display: 'flex', gap: 8 }}>
              {![...messages].reverse().find(m => m.role === 'assistant')?.synthetic && (
                <button onClick={regenerateLastResponse}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#6B7280' }}>
                  <RefreshCw size={11} /> Régénérer
                </button>
              )}
              <button onClick={handleCopyLast}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#6B7280' }}>
                <Copy size={11} /> Copier
              </button>
              <button onClick={resetToHome}
                style={{ padding: '5px 10px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#9CA3AF' }}>
                Nouvelle action
              </button>
            </div>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.map(msg => {
            if (msg.role === 'patient_select') {
              return <div key={msg.id} style={{ maxWidth: 520 }}><PatientChips participants={participants} onSelect={handlePatientSelected} /></div>;
            }
            const lastAssistantId = messages.filter(m => m.role === 'assistant').at(-1)?.id;
            const isLastAssistant = msg.role === 'assistant' && msg.id === lastAssistantId;
            const showPdfBar = isLastAssistant && !loading &&
              (actionType === 'compte_rendu' || actionType === 'compte_rendu_famille');
            const showPartagerBtn = isLastAssistant && !loading &&
              actionType === 'compte_rendu_famille' && selectedPatient != null;
            return (
              <div key={msg.id}>
                <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={{
                      maxWidth: '74%', padding: '12px 16px', fontSize: 14, lineHeight: 1.7,
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: msg.role === 'user' ? 'var(--color-teal)' : 'white',
                      color: msg.role === 'user' ? 'white' : '#111827',
                      border: msg.role === 'assistant' ? '0.5px solid #E5E7EB' : 'none',
                      whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined,
                    }}>
                    {msg.role === 'user'
                      ? msg.content
                      : <MarkdownRendu>{msg.content}</MarkdownRendu>
                    }
                  </div>
                </div>
                {showPdfBar && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => downloadPDF(selectedPatient ? `${selectedPatient.prenom}-${selectedPatient.nom}` : 'patient', actionType!, msg.content)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--color-teal)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      📄 Télécharger en PDF
                    </button>
                    <button
                      onClick={handleCopyLast}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'white', border: '0.5px solid #E5E7EB', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                      📋 Copier le texte
                    </button>
                    {showPartagerBtn && (
                      <button
                        onClick={() => {
                          if (!selectedPatient) return;
                          const patient = selectedPatient;
                          setModalPartage({
                            destinataire: `${patient.prenom} ${patient.nom} (bénéficiaire)`,
                            texteInitial: msg.content,
                            onConfirmer: async (texteFinal) => {
                              if (!supabase) return;
                              const client = supabase;
                              const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                              const resultat = await partagerDocument(
                                () => client.from('documents_patient').insert({
                                  participant_id: patient.id,
                                  titre: `Compte-rendu du ${date}`,
                                  contenu: texteFinal,
                                  type: 'compte_rendu_famille',
                                }),
                                `Document partagé avec ${patient.prenom} ✅`,
                              );
                              // Ne ferme la modale qu'en cas de succès — sinon le texte relu/édité
                              // serait perdu et il faudrait tout recommencer pour réessayer.
                              if (resultat.succes) { toast.success(resultat.message); setModalPartage(null); }
                              else toast.error(resultat.message);
                            },
                          });
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--color-ink)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        👁️ Partager avec le bénéficiaire
                      </button>
                    )}
                    {showPdfBar && selectedPatient?.structureId && (
                      <button
                        onClick={() => {
                          if (!selectedPatient?.structureId) return;
                          const patient = selectedPatient;
                          const structureId = patient.structureId!;
                          const nomStructure = structures.find(s => s.id === structureId)?.nom ?? 'la structure';
                          setModalPartage({
                            destinataire: `${nomStructure} (structure)`,
                            texteInitial: msg.content,
                            onConfirmer: async (texteFinal) => {
                              if (!supabase) return;
                              const client = supabase;
                              const resultat = await partagerDocument(
                                () => client.from('documents_partages').insert({
                                  participant_id: patient.id,
                                  structure_id: structureId,
                                  type_document: actionType,
                                  contenu: texteFinal,
                                }),
                                'Document partagé avec la structure ✅',
                              );
                              if (resultat.succes) { toast.success(resultat.message); setModalPartage(null); }
                              else toast.error(resultat.message);
                            },
                          });
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'white', border: '0.5px solid #E5E7EB', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--color-ink)' }}>
                        🏢 Partager avec la structure
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: 'white', border: '0.5px solid #E5E7EB', borderRadius: '12px 12px 12px 2px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <RefreshCw size={12} className="animate-spin" style={{ color: 'var(--color-teal)' }} />
                <span style={{ fontSize: 13, color: '#9CA3AF' }}>L'assistant analyse les données du bénéficiaire…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Génération du programme structuré — déclenchement explicite uniquement */}
        {actionType === 'programme' && programmeQuestionsPosees && selectedPatient && !awaitingPatient && (
          <div style={{ padding: '0 22px 12px', flexShrink: 0 }}>
            <textarea
              value={precisionsLibresProgramme}
              onChange={e => setPrecisionsLibresProgramme(e.target.value)}
              placeholder="Autres précisions pour ce programme (facultatif)…"
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box' as const, marginBottom: 8, padding: '8px 10px',
                borderRadius: 10, border: '1px solid #E0EEEE', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
              }}
            />
            <button
              onClick={handleGenererProgrammeStructure}
              disabled={loading || genererProgrammeLoading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '11px 14px', borderRadius: 10, border: 'none',
                background: (loading || genererProgrammeLoading) ? '#E5E7EB' : 'var(--color-ink)',
                color: (loading || genererProgrammeLoading) ? '#9CA3AF' : 'white',
                fontSize: 13, fontWeight: 700, cursor: (loading || genererProgrammeLoading) ? 'not-allowed' : 'pointer',
              }}
            >
              {genererProgrammeLoading ? (
                <><RefreshCw size={14} className="animate-spin" /> Génération du programme…</>
              ) : (
                <>🏋️ Générer le programme structuré</>
              )}
            </button>
          </div>
        )}

        {/* Saisie */}
        {!awaitingPatient && (
          <div style={{ background: 'white', borderTop: '0.5px solid #E5E7EB', padding: '11px 22px 15px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                <textarea ref={textareaRef} value={input} onChange={handleInputChange}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder={isRecording ? '🎙️ Dictée en cours…' : 'Posez votre question… (Entrée pour envoyer)'}
                  rows={1} disabled={loading}
                  style={{ width: '100%', padding: '10px 12px', border: 'none', outline: 'none', fontSize: 14, resize: 'none', background: 'transparent', fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 120, boxSizing: 'border-box', display: 'block' }} />
                {isSupported && (
                  <div style={{ padding: '3px 10px', borderTop: '0.5px solid #F3F4F6', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={handleToggleMic} disabled={loading}
                      style={{ padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: isRecording ? '#FEE2E2' : '#F3F4F6', color: isRecording ? '#DC2626' : '#6B7280', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isRecording ? <MicOff size={11} /> : <Mic size={11} />}
                      {isRecording ? 'Arrêter' : '🎙️ Dicter'}
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
                style={{ width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer', background: input.trim() && !loading ? 'var(--color-teal)' : '#E5E7EB', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {modalPartage && (
        <ModalRelecturePartage
          destinataire={modalPartage.destinataire}
          texteInitial={modalPartage.texteInitial}
          onAnnuler={() => setModalPartage(null)}
          onConfirmer={modalPartage.onConfirmer}
        />
      )}
    </div>
  );
}
