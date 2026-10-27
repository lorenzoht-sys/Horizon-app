// Prompts de l'assistant clinique (AssistantPage.tsx et écran Assistant de
// AppMobile.tsx), extraits des pages pour être testés (lot A
// pseudonymisation, 2026-10-27). Logique et texte inchangés, sauf l'identité :
// ces fonctions reçoivent un ParticipantIA (liste blanche, sans nom, prénom ni
// date de naissance) et l'IA écrit des marqueurs que la page remplace au
// retour (voir pseudonymiserIA.ts).
import type { Bilan, Contrat, TypeStructure } from '../types';
import { getContreIndications, getTestsAutonomie, getTraitementsActifs, getTraitementsArretes } from '../lib/anamnese';
import { etatSedentarite, etatFatigue, SED_TOTAL_MAX, FSS_TOTAL_MAX } from '../lib/scoresAutonomie';
import { distanceTm6, resultatTm6 } from '../lib/tm6';
import {
  formatContratContexte, formatProgrammeContexte, formatStructureContexte, formatPlanningReelContexte,
  formatDicteesContexte, formatNotesManuellesContexte,
  type ProgrammeResume, type PlanningReelResume, type NoteManuelleResume, type DicteeResume,
} from './assistantContexte';
import {
  CONSIGNE_MARQUEURS, LIBELLE_NEUTRE, MARQUEURS, libelleAgeIA, masquerIdentiteConnue,
  type IdentiteBeneficiaire, type ParticipantIA,
} from './pseudonymiserIA';

export type ActionType = 'contre_indications' | 'compte_rendu' | 'compte_rendu_famille' | 'programme' | 'interpretation' | 'libre';

/** Contexte chargé depuis Supabase pour le prompt (PatientExtras de la page,
 *  sans l'indicateur de chargement). */
export interface ContexteExtrasIA {
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
}

/** Titre, objectif et message du programme actif : générés par l'IA avant ce
 *  chantier, ils peuvent porter le prénom (« Programme Équilibre Jeanne »).
 *  Les dictées et notes, saisies par le praticien, ne sont PAS masquées
 *  (décision du 2026-10-27). */
export function masquerExtrasIA<T extends ContexteExtrasIA>(extras: T, identite: IdentiteBeneficiaire | null): T {
  if (!extras.programme || !identite) return extras;
  const p = extras.programme;
  return {
    ...extras,
    programme: {
      ...p,
      titre: masquerIdentiteConnue(p.titre, identite),
      objectif: masquerIdentiteConnue(p.objectif, identite),
      messageMotivation: masquerIdentiteConnue(p.messageMotivation, identite),
    },
  };
}

function fmt(d: string): string {
  return new Date(d + (d.includes('T') ? '' : 'T12:00')).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Formate TOUS les scores d'un bilan en texte lisible pour le prompt.
 *  Utilise les vrais noms TypeScript : tug3m, chairStand30, handGrip.droite, etc. */
export function buildBilanText(bilan: Bilan): string {
  const lines: string[] = [];
  if (bilan.tug3m != null)                    lines.push(`TUG 3m : ${bilan.tug3m}s`);
  if (bilan.chairStand30 != null)             lines.push(`Chair Stand 30s : ${bilan.chairStand30} rép.`);
  if (bilan.handGrip.droite != null)          lines.push(`HandGrip D : ${bilan.handGrip.droite} kg`);
  if (bilan.handGrip.gauche != null)          lines.push(`HandGrip G : ${bilan.handGrip.gauche} kg`);
  if (bilan.equilibre.droite != null)         lines.push(`Équilibre unipodal D : ${bilan.equilibre.droite}s`);
  if (bilan.equilibre.gauche != null)         lines.push(`Équilibre unipodal G : ${bilan.equilibre.gauche}s`);
  if (bilan.souplesse.valeur != null)         lines.push(`Souplesse : ${bilan.souplesse.valeur}cm`);
  if (resultatTm6(bilan.tm6).valeur != null) lines.push(`Test Marche 6min (${resultatTm6(bilan.tm6).modeLabel}) : ${resultatTm6(bilan.tm6).texte}`);
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
export function buildEvolution(ancien: Bilan, recent: Bilan): string {
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
  cmp('TM6',         distanceTm6(ancien.tm6),  distanceTm6(recent.tm6));
  return lines.join('\n') || 'Données insuffisantes pour calculer l\'évolution';
}

/** Construit le prompt système enrichi avec TOUTES les données du patient. */
export function buildSystemPrompt(
  patient: ParticipantIA | null,
  extras: ContexteExtrasIA | null,
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

  const age = libelleAgeIA(patient.age);
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
  const etatSedAssistant = etatSedentarite(sedentarite.reponses);
  const etatFssAssistant = etatFatigue(fatigue.reponses);
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
    // Questionnaire incomplet : on transmet l'absence de score, pas le score
    // stocké. Celui-ci vient de l'ancien calcul, qui comptait les réponses
    // manquantes comme des zéros (Ricci & Gagnon) ou les ignorait (FSS). Un
    // chiffre faux dans le contexte se retrouverait dans l'interprétation
    // générée, sans que rien ne le signale.
    sedProfilLabel && etatSedAssistant.etat === 'complet'
      ? `- Niveau d'activité physique : ${sedProfilLabel} (score ${etatSedAssistant.score}/${SED_TOTAL_MAX} — Ricci & Gagnon)`
      : etatSedAssistant.etat === 'a_regulariser'
        ? `- Niveau d'activité physique : questionnaire Ricci & Gagnon incomplet, aucun score exploitable (manque : ${etatSedAssistant.manquants.join(', ')})`
        : null,
    fssProfilLabel && etatFssAssistant.etat === 'complet'
      ? `- Fatigue perçue : ${fssProfilLabel} (FSS ${etatFssAssistant.score}/${FSS_TOTAL_MAX})`
      : etatFssAssistant.etat === 'a_regulariser'
        ? `- Fatigue perçue : échelle FSS incomplète, aucun score exploitable (${etatFssAssistant.manquants.length} affirmation(s) sans réponse)`
        : null,
  ].filter(Boolean).join('\n');

  const dicteesText = formatDicteesContexte(extras?.compteRendus ?? []);
  const notesManuellesText = formatNotesManuellesContexte(extras?.notesManuelles ?? []);
  const planningReelText = formatPlanningReelContexte(extras?.planningReel ?? null);
  const structureText = formatStructureContexte(structure ?? null);

  return `${base}

═══════════════════════════════════════
PROFIL DU PATIENT
═══════════════════════════════════════
Identité : non transmise (${LIBELLE_NEUTRE})
Âge : ${age}
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
7. Ne pas confondre l'assiduité aux exercices du programme (auto-déclarée par le patient) et la présence aux séances planifiées avec le praticien — ce sont deux mesures distinctes
8. ${CONSIGNE_MARQUEURS}`;
}

export function buildActionPrompt(action: ActionType, patient: ParticipantIA, extras: ContexteExtrasIA | null, contrat?: Contrat | null, structure?: { nom: string; type?: TypeStructure } | null): string {
  const sys = buildSystemPrompt(patient, extras, contrat, structure);
  switch (action) {
    case 'contre_indications':
      return `${sys}\n\n---\nQUESTION:\nEffectue une analyse complète des contre-indications à l'effort pour ce patient.\nPour chaque contre-indication identifiée :\n1. Décris le risque spécifique en APA\n2. Donne les précautions à respecter\n3. Liste les types d'exercices à éviter absolument\n4. Propose des alternatives adaptées et sécurisées`;
    case 'compte_rendu':
      return `${sys}\n\n---\nQUESTION:\nGénère un compte-rendu médecin professionnel et structuré à envoyer au médecin prescripteur.\nFormat :\n## Compte-rendu APA — ${MARQUEURS.beneficiaire}\n**Date :** ${new Date().toLocaleDateString('fr-FR')}\n### Bilan fonctionnel\n### Évolution constatée\n### Programme réalisé\n### Recommandations pour la suite\n### Points de vigilance\nRédige ce compte-rendu en citant les valeurs exactes des tests.`;
    case 'compte_rendu_famille':
      return `${sys}\n\n---\nQUESTION:\nRédige un compte-rendu destiné à la famille de ${MARQUEURS.beneficiaire}, en langage simple et accessible (sans jargon médical).\nFormat :\n## Bilan pour la famille — ${MARQUEURS.beneficiaire}\n**Date :** ${new Date().toLocaleDateString('fr-FR')}\n### Comment se porte ${MARQUEURS.prenom} ?\n### Les progrès observés\n### Le programme en cours\n### Ce qu'il faut surveiller à la maison\n### Nos conseils pour accompagner ${MARQUEURS.prenom} au quotidien\nRédige de façon chaleureuse, positive et concrète. Explique chaque résultat en termes simples (ex : "le test de marche montre que…" plutôt que des chiffres bruts).`;
    case 'interpretation':
      return `${sys}\n\n---\nQUESTION:\nAnalyse et interprète les derniers résultats de bilans de ce patient.\nPour chaque test disponible :\n- Compare aux normes pour l'âge (cite les références HAS / SFP-APA)\n- Indique si le résultat est satisfaisant, à surveiller, ou préoccupant\n- Explique les implications pratiques pour les séances APA\n- Identifie les priorités de travail\nConclude sur le profil fonctionnel global.`;
    // 'programme' n'utilise plus ce prompt texte libre — voir
    // genererProgrammeIA.ts (genererQuestionsClarification / genererProgrammeStructure),
    // déclenché depuis handlePatientSelected() et handleGenererProgrammeStructure().
    default:
      return sys;
  }
}

// ─── Historique de conversation ──────────────────────────────────────────────

export interface MessageHistoriqueIA {
  role: string;
  content: string;
  /** Version envoyable du message, quand elle est connue à sa création :
   *  réponse brute de l'IA (avec ses marqueurs), ou message d'interface déjà
   *  masqué. Sans elle, une réponse affichée — où le nom a été réinséré —
   *  renverrait le nom à l'IA au tour suivant. */
  contenuIA?: string;
}

/** Messages prêts à partir dans « ÉCHANGES PRÉCÉDENTS » : `contenuIA` quand il
 *  existe, sinon le texte affiché ; dans les deux cas le nom connu du
 *  bénéficiaire sélectionné est masqué (cas d'un historique restauré depuis
 *  assistant_logs, qui stocke les réponses avec le nom). */
export function historiquePourIA<T extends MessageHistoriqueIA>(messages: T[], identite: IdentiteBeneficiaire | null): T[] {
  return messages.map(m => ({ ...m, content: masquerIdentiteConnue(m.contenuIA ?? m.content, identite) }));
}

/** Prompt de l'écran Assistant mobile (AppMobile.tsx). `history` et
 *  `question` sont déjà passés par historiquePourIA / masquerIdentiteConnue. */
export function buildAssistantPromptMobile(patient: ParticipantIA | null, history: { role: string; content: string }[], question: string): string {
  const base = `Tu es un assistant clinique expert en Activité Physique Adaptée (APA), spécialisé dans l'accompagnement des enseignants APA libéraux en France.
Tu réponds UNIQUEMENT en français. Tu es concis, professionnel, pratique.
Tu ne fais jamais de diagnostic médical.`;

  const patientCtx = patient
    ? (() => {
        const age = libelleAgeIA(patient.age);
        const bi = patient.bilans.find(b => b.type === 'initial') ?? null;
        const ciInfoExport = getContreIndications(patient, bi);
        const ci = ciInfoExport.actif ? (ciInfoExport.detail ?? 'non précisées') : 'aucune';
        const pathologies = [patient.pathologie, patient.antecedentsMedicaux].filter(Boolean).join(' / ') || 'non renseigné';
        return `\n\nPATIENT : ${LIBELLE_NEUTRE}, ${age}. Pathologies : ${pathologies}. Contre-indications : ${ci}.\n${CONSIGNE_MARQUEURS}`;
      })()
    : '';

  const prior = history.length > 0
    ? '\n\nÉCHANGES PRÉCÉDENTS:\n' + history.map(m => `${m.role === 'user' ? 'Q' : 'R'}: ${m.content}`).join('\n')
    : '';

  return `${base}${patientCtx}${prior}\n\n---\nQUESTION:\n${question}`;
}
