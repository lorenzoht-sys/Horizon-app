// Variante de FicheBilanPDF.tsx destinée à être remise au bénéficiaire.
//
// Deux différences volontaires avec FicheBilanPDF.tsx (qui reste inchangé,
// c'est le document de travail clinique complet de Pierre) :
//  1. Seuls les résultats explicitement cochés dans bilan.visibleBeneficiaire
//     apparaissent (défaut : tout caché) — les autres sont simplement omis.
//  2. Le vocabulaire est reformulé pour les notes basses (formulationBienveillante.ts),
//     et l'interprétation affichée est bilan.messageClient (déjà relu par le
//     praticien pour le bénéficiaire), jamais textePro/notesProfessionnelles
//     (vocabulaire clinique interne).
//
// Souplesse, Mémoire et Tinetti ne sont pas repris ici : non affichés dans
// l'espace bénéficiaire aujourd'hui (voir EspacePatient.tsx), pas de raison
// de les faire apparaître pour la première fois dans ce PDF.

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Bilan, Participant, NotesBilan } from '../../types';
import { PdfHeader, PdfFooter, type PdfPraticienSettings } from './PdfShared';
import { getContreIndications } from '../../lib/anamnese';
import { libelleNoteBienveillant, libelleCategorieBilan, libelleBorgBeneficiaire } from '../../lib/formulationBienveillante';

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
  barCaption: { width: 130, fontSize: 8, color: '#555555', marginLeft: 6 },
  interpretTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1A5F9E', marginBottom: 5 },
  interpretBox: { borderWidth: 1, borderColor: '#D0D8E8', padding: 9, fontSize: 10, color: '#333333', lineHeight: 1.65, textAlign: 'justify', backgroundColor: 'white' },
  emptyBox: { borderWidth: 1, borderColor: '#D0D8E8', padding: 12, fontSize: 10, color: '#888888', textAlign: 'center', fontStyle: 'italic' },
});

const noteColor = (n: number) => n <= 2 ? '#EF4444' : n === 3 ? '#F59E0B' : '#22C55E';

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

interface Props {
  bilan: Bilan;
  participant: Participant;
  notes: NotesBilan;
  settings: PdfPraticienSettings;
}

export default function FicheBilanBeneficiairePDF({ bilan, participant, notes, settings }: Props) {
  const v = bilan.visibleBeneficiaire ?? {};
  const { equilibre: eq, chairStand30: cs, handGrip: hg, tug3m, tm6 } = bilan;

  const forceVisible = v.force === true;
  const handGripVisible = v.handGrip === true;
  const equilibreVisible = v.equilibre === true;
  const mobiliteVisible = v.mobilite === true;
  const enduranceVisible = v.endurance === true;

  const forceCell = (forceVisible || handGripVisible) ? (
    <Cellule
      titre="Force"
      unite={forceVisible ? `${cs ?? '—'} Reps` : undefined}
      body={handGripVisible ? `Main D : ${hg.droite ?? '—'} Kg  ·  Main G : ${hg.gauche ?? '—'} Kg` : undefined}
    />
  ) : null;

  const enduranceCell = enduranceVisible ? (
    <Cellule
      titre="Endurance"
      unite={`${tm6.distanceMetres ?? '—'} M`}
      body={tm6.borgRPE != null ? `Ressenti effort : ${libelleBorgBeneficiaire(tm6.borgRPE)}` : undefined}
    />
  ) : null;

  const mobiliteCell = mobiliteVisible ? <Cellule titre="Mobilité" unite={`${tug3m ?? '—'} Sec`} /> : null;

  const equilibreCell = equilibreVisible
    ? <Cellule titre="Équilibre" body={`Jambe D : ${eq.droite ?? '—'} Sec  ·  Jambe G : ${eq.gauche ?? '—'} Sec`} />
    : null;

  const aucunResultatPartage = !forceCell && !enduranceCell && !mobiliteCell && !equilibreCell;

  // Barres : uniquement les 4 catégories affichées côté bénéficiaire, et
  // seulement si explicitement partagées.
  const BARRES: { key: keyof NotesBilan; visible: boolean }[] = [
    { key: 'equilibre', visible: equilibreVisible },
    { key: 'force', visible: forceVisible },
    { key: 'mobilite', visible: mobiliteVisible },
    { key: 'endurance', visible: enduranceVisible },
  ];
  const barres = BARRES.filter(b => b.visible && typeof notes[b.key] === 'number' && Number.isFinite(notes[b.key]));

  const bilanInitial = participant.bilans.find(b => b.type === 'initial');
  const contreIndic: string | null = getContreIndications(participant, bilanInitial).detail;

  return (
    <Document>
      <Page size="A4" style={S.page}>
        <PdfHeader settings={settings} title="Fiche bilan" />
        <View style={S.body}>

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

          <Text style={S.sectionLabel}>VOS RÉSULTATS</Text>

          {aucunResultatPartage ? (
            <View style={S.emptyBox}>
              <Text>Aucun résultat partagé pour ce bilan.</Text>
            </View>
          ) : (
            <>
              {(forceCell || enduranceCell) && (
                <View style={S.cellRow}>
                  {forceCell}
                  {forceCell && enduranceCell ? <View style={S.cellSpacer} /> : null}
                  {enduranceCell}
                </View>
              )}
              {(mobiliteCell || equilibreCell) && (
                <View style={S.cellRow}>
                  {mobiliteCell}
                  {mobiliteCell && equilibreCell ? <View style={S.cellSpacer} /> : null}
                  {equilibreCell}
                </View>
              )}
            </>
          )}

          {barres.length > 0 && (
            <View style={S.barSection}>
              <Text style={[S.sectionLabel, { textAlign: 'center' }]}>VOS PROGRÈS</Text>
              {barres.map(({ key }) => {
                const note = notes[key]!;
                return (
                  <View key={key} style={S.barRow}>
                    <Text style={S.barLabel}>{libelleCategorieBilan(key)}</Text>
                    <View style={S.barBg}>
                      <View style={[S.barFill, { width: `${(note / 5) * 100}%`, backgroundColor: noteColor(note) }]} />
                    </View>
                    <Text style={S.barCaption}>{libelleNoteBienveillant(key, note as 1 | 2 | 3 | 4 | 5)}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {contreIndic && (
            <View style={{ marginBottom: 12, borderWidth: 1.5, borderColor: '#EF4444', backgroundColor: '#FEF2F2', borderRadius: 6, padding: 8 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#DC2626', marginBottom: 3 }}>
                ⚠️ CONTRE-INDICATIONS À L'EFFORT
              </Text>
              <Text style={{ fontSize: 10, color: '#7F1D1D', lineHeight: 1.5 }}>{contreIndic}</Text>
            </View>
          )}

          {bilan.messageClient && (
            <>
              <Text style={S.interpretTitle}>MESSAGE DE VOTRE PRATICIEN :</Text>
              <View style={S.interpretBox}>
                <Text>{bilan.messageClient}</Text>
              </View>
            </>
          )}

        </View>
        <PdfFooter settings={settings} />
      </Page>
    </Document>
  );
}
