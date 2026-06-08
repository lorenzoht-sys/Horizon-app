import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Bilan, Participant, NotesBilan } from '../../types';
import { NORMES_SCORING, calculerNote } from '../../data/norms';
import { PdfHeader, PdfFooter, type PdfPraticienSettings } from './PdfShared';

// ─── Calcul notes ─────────────────────────────────────────────────────────────

export function calculerNotesAuto(bilan: Bilan): NotesBilan {
  const n: NotesBilan = {};
  const { equilibre: eq, chairStand30: cs, handGrip: hg, tug3m, souplesse, tm6, memoire } = bilan;
  const eqVals = [eq.droite, eq.gauche].filter((v): v is number => v !== null);
  if (eqVals.length) n.equilibre = calculerNote(eqVals.reduce((s, v) => s + v, 0) / eqVals.length, NORMES_SCORING.equilibreUnipodal);
  if (cs !== null) n.force = calculerNote(cs, NORMES_SCORING.chairStand30);
  const hgVals = [hg.droite, hg.gauche].filter((v): v is number => v !== null);
  if (hgVals.length) n.handGrip = calculerNote(hgVals.reduce((s, v) => s + v, 0) / hgVals.length, NORMES_SCORING.handGrip);
  if (tug3m !== null) n.mobilite = calculerNote(tug3m, NORMES_SCORING.tug3m);
  if (souplesse.valeur !== null) n.souplesse = calculerNote(souplesse.valeur, NORMES_SCORING.souplesse);
  if (tm6.distanceMetres !== null) n.endurance = calculerNote(tm6.distanceMetres, NORMES_SCORING.tm6Distance);
  const mi = memoire.scoreImmediat, md = memoire.scoreDiffere;
  if (mi !== null || md !== null) n.memoire = calculerNote((mi ?? 0) + (md ?? 0), NORMES_SCORING.memoire);
  return n;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const noteColor = (n: number) => n <= 2 ? '#EF4444' : n === 3 ? '#F59E0B' : '#22C55E';

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 11, color: '#0D2B4B', paddingBottom: 46 },
  body: { paddingHorizontal: 26, paddingTop: 14 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 5 },
  mainTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#1A5F9E', lineHeight: 1.1 },
  subtitle: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#1A5F9E' },
  appName: { fontSize: 9, color: '#888888', fontStyle: 'italic' },
  infoRight: { alignItems: 'flex-end' },
  dateTxt: { fontSize: 11, color: '#333333' },
  participantTxt: { fontSize: 10, color: '#555555' },
  divider: { height: 2, backgroundColor: '#1A5F9E', marginBottom: 12 },
  sectionLabel: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#1A5F9E', textAlign: 'right', marginBottom: 6 },
  cellRow: { flexDirection: 'row', marginBottom: 6 },
  cellSpacer: { width: 7 },
  cell: { flex: 1, borderWidth: 1.5, borderColor: '#D0D8E8' },
  cellHeader: { backgroundColor: '#E8EDF5', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8 },
  cellTitle: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: '#1A5F9E' },
  cellValue: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: '#0D2B4B' },
  cellBody: { paddingVertical: 4, paddingHorizontal: 8, fontSize: 10, color: '#333333', backgroundColor: 'white' },
  barSection: { marginBottom: 12 },
  barLegend: { textAlign: 'right', fontSize: 8, color: '#555555', fontStyle: 'italic', marginTop: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  barLabel: { width: 62, fontSize: 10, color: '#333333', fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  barBg: { flex: 1, height: 16, backgroundColor: '#E8EDF5', marginLeft: 7 },
  barFill: { height: '100%' },
  barNum: { width: 18, fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#333333', marginLeft: 4, textAlign: 'center' },
  interpretTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1A5F9E', marginBottom: 5 },
  interpretBox: { borderWidth: 1, borderColor: '#D0D8E8', padding: 9, fontSize: 10, color: '#333333', lineHeight: 1.65, textAlign: 'justify', backgroundColor: 'white' },
});

function borgRPEInterp(v: number): string {
  if (v <= 11) return 'Effort faible';
  if (v <= 14) return 'Effort modéré — zone cible APA';
  if (v <= 17) return 'Effort élevé';
  return 'Effort maximal';
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function calcAge(dn: string) {
  const t = new Date(), b = new Date(dn);
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth()) a--;
  return a;
}

function Cellule({ titre, unite, body }: { titre: string; unite?: string; body?: string }) {
  return (
    <View style={S.cell}>
      <View style={S.cellHeader}>
        <Text style={S.cellTitle}>{titre}</Text>
        {unite ? <Text style={S.cellValue}>{unite}</Text> : null}
      </View>
      {body ? <View style={S.cellBody}><Text>{body}</Text></View> : null}
    </View>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface Props {
  bilan: Bilan;
  participant: Participant;
  notes: NotesBilan;
  settings: PdfPraticienSettings;
}

export default function FicheBilanPDF({ bilan, participant, notes, settings }: Props) {
  const { equilibre: eq, chairStand30: cs, handGrip: hg, tug3m, souplesse, tm6, memoire } = bilan;
  const sVal = souplesse.valeur !== null ? (souplesse.valeur >= 0 ? '+' : '') + souplesse.valeur : '—';

  const BARRES: { label: string; key: keyof NotesBilan }[] = [
    { label: 'Souplesse', key: 'souplesse' },
    { label: 'Mémoire',   key: 'memoire'   },
    { label: 'Mobilité',  key: 'mobilite'  },
    { label: 'Équilibre', key: 'equilibre' },
    { label: 'Endurance', key: 'endurance' },
    { label: 'Force',     key: 'force'     },
  ];
  const barres = BARRES.filter(b => typeof notes[b.key] === 'number' && Number.isFinite(notes[b.key]));
  const interp = bilan.interpretationIA?.textePro || bilan.notesProfessionnelles || '—';

  const bilanInitial = participant.bilans.find(b => b.type === 'initial');
  const contreIndic: string | null =
    bilanInitial?.bilanInitialData?.formulaireFlat?.data?.contreIndications === 'oui'
      ? (bilanInitial.bilanInitialData?.formulaireFlat?.data?.contreIndicationsDetail ?? null)
      : null;

  return (
    <Document>
      <Page size="A4" style={S.page}>
        <PdfHeader settings={settings} title="Fiche bilan" />
        <View style={S.body}>

          {/* Titre + infos participant */}
          <View style={S.titleRow}>
            <View>
              <Text style={S.mainTitle}>FICHE BILAN</Text>
              <Text style={S.subtitle}>{bilan.type === 'initial' ? 'PREMIER RENDEZ-VOUS' : 'BILAN TRIMESTRIEL'}</Text>
              <Text style={S.appName}>Horizon – Activité Physique Adaptée</Text>
            </View>
            <View style={S.infoRight}>
              <Text style={S.dateTxt}>Date : {fmt(bilan.date)}</Text>
              <Text style={S.participantTxt}>{participant.prenom} {participant.nom} · {calcAge(participant.dateNaissance)} ans</Text>
            </View>
          </View>
          <View style={S.divider} />

          {/* Résultats tests */}
          <Text style={S.sectionLabel}>RÉSULTATS DES TESTS</Text>

          <View style={S.cellRow}>
            <Cellule titre="Force" unite={`${cs ?? '—'} Reps`} body={`Main D : ${hg.droite ?? '—'} Kg  ·  Main G : ${hg.gauche ?? '—'} Kg`} />
            <View style={S.cellSpacer} />
            <Cellule titre="Endurance" unite={`${tm6.distanceMetres ?? '—'} M`} body={`O2 : ${tm6.spo2Avant ?? '—'} / ${tm6.spo2Apres ?? '—'} / ${tm6.spo22min ?? '—'}  ·  FC : ${tm6.fcAvant ?? '—'} / ${tm6.fcApres ?? '—'} Bpm${tm6.borgRPE != null ? `\nRessenti effort (Borg) : ${tm6.borgRPE}/20 — ${borgRPEInterp(tm6.borgRPE)}` : ''}`} />
          </View>
          <View style={S.cellRow}>
            <Cellule titre="Souplesse" unite={`${sVal} Cm`} />
            <View style={S.cellSpacer} />
            <Cellule titre="Mobilité" unite={`${tug3m ?? '—'} Sec`} />
          </View>
          <View style={S.cellRow}>
            <Cellule titre="Équilibre" body={`Jambe D : ${eq.droite ?? '—'} Sec  ·  Jambe G : ${eq.gauche ?? '—'} Sec`} />
            <View style={S.cellSpacer} />
            <Cellule titre="Mémoire" body={
              memoire.dubois?.scoreMIS != null
                ? `MIS : ${memoire.dubois.scoreMIS}/10  ·  Immédiat : ${memoire.dubois.scoreImmediat ?? '—'}/5  ·  Différé : ${memoire.dubois.scoreDiffere ?? '—'}/5`
                : `Immédiat : ${memoire.scoreImmediat ?? '—'}/5  ·  Différé : ${memoire.scoreDiffere ?? '—'}/5`
            } />
          </View>

          {/* Graphiques */}
          {barres.length > 0 && (
            <View style={S.barSection}>
              <Text style={[S.sectionLabel, { textAlign: 'center' }]}>GRAPHIQUES</Text>
              {barres.map(({ label, key }) => {
                const note = notes[key]!;
                return (
                  <View key={key} style={S.barRow}>
                    <Text style={S.barLabel}>{label}</Text>
                    <View style={S.barBg}>
                      <View style={[S.barFill, { width: `${(note / 5) * 100}%`, backgroundColor: noteColor(note) }]} />
                    </View>
                    <Text style={S.barNum}>{note}</Text>
                  </View>
                );
              })}
              <Text style={S.barLegend}>1/5 = Faible — 5/5 = Très Bon</Text>
            </View>
          )}

          {/* Contre-indications */}
          {contreIndic && (
            <View style={{ marginBottom: 12, borderWidth: 1.5, borderColor: '#EF4444', backgroundColor: '#FEF2F2', borderRadius: 6, padding: 8 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#DC2626', marginBottom: 3 }}>
                ⚠️ CONTRE-INDICATIONS À L'EFFORT
              </Text>
              <Text style={{ fontSize: 10, color: '#7F1D1D', lineHeight: 1.5 }}>{contreIndic}</Text>
            </View>
          )}

          {/* Interprétation */}
          <Text style={S.interpretTitle}>INTERPRÉTATION :</Text>
          <View style={S.interpretBox}>
            <Text>{interp}</Text>
          </View>

        </View>
        <PdfFooter settings={settings} />
      </Page>
    </Document>
  );
}
