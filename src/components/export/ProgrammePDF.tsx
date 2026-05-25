import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import type { Participant, Programme, Exercice, CategorieExercice } from '../../types';
import { PdfHeader, PdfFooter, type PdfPraticienSettings } from './PdfShared';

export interface ProgrammePDFData {
  participant: Participant;
  programme: Programme;
  exercices: Exercice[];
  settings: PdfPraticienSettings;
  qrCodes?: Record<string, string>; // videoYoutubeId → dataURL
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const CAT_COLOR: Record<CategorieExercice, string> = {
  equilibre: '#185FA5',
  force:     '#3B6D11',
  mobilite:  '#BA7517',
  souplesse: '#993556',
  endurance: '#0F6E56',
  memoire:   '#534AB7',
};
const CAT_LABEL: Record<CategorieExercice, string> = {
  equilibre: 'Équilibre', force: 'Force', mobilite: 'Mobilité',
  souplesse: 'Souplesse', endurance: 'Endurance', memoire: 'Mémoire',
};
const NIVEAUX: Record<string, string> = {
  debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé',
};
const JOURS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Largeurs fixes pour le tableau de suivi (en pt)
const COL_EX = 220;
const COL_DAY = 40;

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    paddingTop: 56,  // espace pour le header fixe
    paddingBottom: 46,
    paddingHorizontal: 26,
  },
  fixedHeader: { position: 'absolute', top: 0, left: 0, right: 0 },

  // Page 1 — exercices
  objectifBox: { borderLeftWidth: 4, borderLeftColor: '#639922', paddingLeft: 12, marginBottom: 10 },
  objectifTitle: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#3B6D11', marginBottom: 2 },
  objectifText: { fontSize: 11, color: '#374151', lineHeight: 1.5 },
  messageBox: { borderLeftWidth: 4, borderLeftColor: '#2BBFBF', paddingLeft: 12, marginBottom: 18 },
  messageText: { fontSize: 11, color: '#085041', fontStyle: 'italic', lineHeight: 1.5 },
  exCard: { borderWidth: 1, borderColor: '#E8F4FD', padding: '12 14', marginBottom: 9 },
  exTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  exTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#0D2B4B', flex: 1 },
  exSeries: { fontSize: 11, color: '#666666', marginLeft: 14 },
  exCat: { fontSize: 11, marginBottom: 8 },
  exDivider: { borderTopWidth: 1, borderTopColor: '#E8F4FD', marginBottom: 8 },
  exDesc: { fontSize: 11, color: '#333333', marginBottom: 3, lineHeight: 1.5 },
  exNiveau: { fontSize: 10, color: '#1A5F9E', fontStyle: 'italic', marginBottom: 6 },
  exAlert: { flexDirection: 'row', marginBottom: 5 },
  exAlertIcon: { fontSize: 11, marginRight: 4 },
  exAlertText: { fontSize: 10, color: '#993C1D', lineHeight: 1.5, flex: 1 },
  exNote: { fontSize: 10, color: '#555555', fontStyle: 'italic', marginBottom: 8 },
  exAdaptation: { backgroundColor: '#FFFBEB', borderLeftWidth: 3, borderLeftColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  exAdaptationText: { fontSize: 10, color: '#78350F', lineHeight: 1.5 },
  joursRow: { flexDirection: 'row', flexWrap: 'wrap' },
  jourActive: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1A5F9E', borderBottomWidth: 2, borderBottomColor: '#1A5F9E', paddingVertical: 1, paddingHorizontal: 3, marginRight: 2 },
  jourInactive: { fontSize: 10, color: '#B4B2A9', paddingVertical: 1, paddingHorizontal: 3, marginRight: 2 },

  // Page 2 — tableau de suivi
  tableTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#1A5F9E', textTransform: 'uppercase', letterSpacing: 1, borderBottomWidth: 2, borderBottomColor: '#1A5F9E', paddingBottom: 8, marginBottom: 18 },
  tableHead: { flexDirection: 'row', backgroundColor: '#0D2B4B' },
  tableHeadEx: { width: COL_EX, paddingVertical: 11, paddingHorizontal: 13 },
  tableHeadDay: { width: COL_DAY, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  tableHeadText: { color: 'white', fontSize: 12, fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row' },
  tableRowEven: { backgroundColor: 'white' },
  tableRowOdd: { backgroundColor: '#FAFCFE' },
  tableCellEx: { width: COL_EX, paddingVertical: 11, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: '#E8F4FD' },
  tableCellDay: { width: COL_DAY, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#E8F4FD' },
  tableExName: { fontFamily: 'Helvetica-Bold', color: '#0D2B4B', fontSize: 12 },
  tableExSub: { color: '#6B7280', fontSize: 10, marginTop: 2 },
  checkBox: { width: 22, height: 22, borderWidth: 2.5, borderColor: '#1A5F9E' },
  tableDash: { fontSize: 16, color: '#C9C7C0' },

  // QR codes
  qrSection: { borderWidth: 1, borderColor: '#E8F4FD', padding: '12 14', marginBottom: 22, marginTop: 8 },
  qrTitle: { fontFamily: 'Helvetica-Bold', color: '#0D2B4B', fontSize: 11, marginBottom: 3 },
  qrSub: { color: '#6B7280', fontSize: 10, lineHeight: 1.5, marginBottom: 10 },
  qrRow: { flexDirection: 'row', flexWrap: 'wrap' },
  qrItem: { alignItems: 'center', marginRight: 14, marginBottom: 6 },
  qrImg: { width: 64, height: 64 },
  qrName: { fontSize: 8, color: '#6B7280', textAlign: 'center', marginTop: 3, maxWidth: 70 },
});

// ─── Page 1 : exercices ───────────────────────────────────────────────────────

function PageExercices({ participant, programme, exercices, settings }: Omit<ProgrammePDFData, 'qrCodes'>) {
  const sorted = [...programme.exercices].sort((a, b) => a.ordre - b.ordre);

  return (
    <Page size="A4" style={S.page}>
      <View style={S.fixedHeader} fixed>
        <PdfHeader settings={settings} title="Programme d'exercices" />
      </View>
      <PdfFooter settings={settings} />

      {/* En-tête participant */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#0D2B4B' }}>
          {participant.prenom} {participant.nom}
        </Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 12, color: '#1A5F9E', fontFamily: 'Helvetica-Bold' }}>{programme.titre}</Text>
          <Text style={{ fontSize: 10, color: '#888888' }}>
            Depuis le {new Date(programme.dateDebut).toLocaleDateString('fr-FR')}
          </Text>
        </View>
      </View>

      {programme.objectif && (
        <View style={S.objectifBox}>
          <Text style={S.objectifTitle}>Objectif</Text>
          <Text style={S.objectifText}>{programme.objectif}</Text>
        </View>
      )}
      {programme.messageMotivation && (
        <View style={S.messageBox}>
          <Text style={S.messageText}>"{programme.messageMotivation}"</Text>
        </View>
      )}

      {sorted.map((ep, idx) => {
        const ex = exercices.find(e => e.id === ep.exerciceId);
        if (!ex) return null;
        const series = `${ep.series} série${ep.series > 1 ? 's' : ''} · ${ep.repetitions ? ep.repetitions + ' rép.' : (ep.dureeSecondes ?? 0) + 's'}`;
        const catColor = CAT_COLOR[ex.categorie];

        return (
          <View key={ep.exerciceId} style={S.exCard}>
            <View style={S.exTitleRow}>
              <Text style={S.exTitle}>{idx + 1}. {ex.nom}</Text>
              <Text style={S.exSeries}>{series}</Text>
            </View>
            <Text style={[S.exCat, { color: catColor }]}>{CAT_LABEL[ex.categorie]}</Text>
            <View style={S.exDivider} />
            <Text style={S.exDesc}>{ex.description}</Text>
            <Text style={S.exNiveau}>{NIVEAUX[ep.niveau]} : {ex.niveaux[ep.niveau]}</Text>
            {ex.consigneSecurite && (
              <View style={S.exAlert}>
                <Text style={S.exAlertIcon}>!</Text>
                <Text style={S.exAlertText}>{ex.consigneSecurite}</Text>
              </View>
            )}
            {ep.notePersonnalisee && (
              <Text style={S.exNote}>"{ep.notePersonnalisee}"</Text>
            )}
            {participant.profilHandicap && ex.adaptations?.[participant.profilHandicap] && (
              <View style={S.exAdaptation}>
                <Text style={S.exAdaptationText}>
                  Adaptation : {ex.adaptations[participant.profilHandicap]}
                </Text>
              </View>
            )}
            <View style={S.joursRow}>
              {[1, 2, 3, 4, 5, 6, 7].map(d => {
                const actif = ep.frequenceParSemaine.includes(d);
                return (
                  <Text key={d} style={actif ? S.jourActive : S.jourInactive}>{JOURS[d]}</Text>
                );
              })}
            </View>
          </View>
        );
      })}
    </Page>
  );
}

// ─── Page 2 : tableau de suivi ────────────────────────────────────────────────

function PageSuivi({ participant, programme, exercices, settings, qrCodes }: ProgrammePDFData) {
  const sorted = [...programme.exercices].sort((a, b) => a.ordre - b.ordre);
  const avecVideo = sorted
    .map(ep => ({ ep, ex: exercices.find(e => e.id === ep.exerciceId) }))
    .filter(({ ex }) => !!ex?.videoYoutubeId && qrCodes?.[ex.videoYoutubeId!]);
  const jours = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  return (
    <Page size="A4" style={S.page}>
      <View style={S.fixedHeader} fixed>
        <PdfHeader settings={settings} title="Programme d'exercices" />
      </View>
      <PdfFooter settings={settings} />

      <Text style={S.tableTitle}>Tableau de suivi — À cocher chaque jour</Text>

      {/* En-tête tableau */}
      <View style={S.tableHead}>
        <View style={S.tableHeadEx}>
          <Text style={S.tableHeadText}>Exercice</Text>
        </View>
        {jours.map(j => (
          <View key={j} style={S.tableHeadDay}>
            <Text style={S.tableHeadText}>{j}</Text>
          </View>
        ))}
      </View>

      {/* Lignes exercices */}
      {sorted.map((ep, i) => {
        const ex = exercices.find(e => e.id === ep.exerciceId);
        return (
          <View key={ep.exerciceId} style={[S.tableRow, i % 2 === 0 ? S.tableRowEven : S.tableRowOdd]}>
            <View style={S.tableCellEx}>
              <Text style={S.tableExName}>{i + 1}. {ex?.nom ?? ep.exerciceId}</Text>
              <Text style={S.tableExSub}>
                {ep.series} série{ep.series > 1 ? 's' : ''}
                {ep.repetitions ? ` · ${ep.repetitions} rép.` : ep.dureeSecondes ? ` · ${ep.dureeSecondes}s` : ''}
              </Text>
            </View>
            {[1, 2, 3, 4, 5, 6, 7].map(d => {
              const actif = ep.frequenceParSemaine.includes(d);
              return (
                <View key={d} style={S.tableCellDay}>
                  {actif
                    ? <View style={S.checkBox} />
                    : <Text style={S.tableDash}>—</Text>
                  }
                </View>
              );
            })}
          </View>
        );
      })}

      {/* QR codes */}
      {avecVideo.length > 0 && (
        <View style={S.qrSection}>
          <Text style={S.qrTitle}>Voir les démonstrations vidéo</Text>
          <Text style={S.qrSub}>Scannez le QR code avec votre téléphone pour regarder la vidéo de l'exercice.</Text>
          <View style={S.qrRow}>
            {avecVideo.map(({ ex }) => {
              const qrSrc = qrCodes?.[ex!.videoYoutubeId!];
              if (!qrSrc) return null;
              return (
                <View key={ex!.id} style={S.qrItem}>
                  <Image src={qrSrc} style={S.qrImg} />
                  <Text style={S.qrName}>{ex!.nom}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Footer participant */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E8F4FD', paddingTop: 10 }}>
        <Text style={{ fontSize: 10, color: '#B4B2A9' }}>
          {settings.prenom} {settings.nom}{settings.societe ? ` — ${settings.societe}` : ''}
        </Text>
        <Text style={{ fontSize: 10, color: '#B4B2A9' }}>
          {participant.prenom} {participant.nom} — {new Date(programme.dateCreation).toLocaleDateString('fr-FR')}
        </Text>
      </View>
    </Page>
  );
}

// ─── Document ─────────────────────────────────────────────────────────────────

export default function ProgrammePDF(data: ProgrammePDFData) {
  return (
    <Document>
      <PageExercices {...data} />
      <PageSuivi {...data} />
    </Document>
  );
}
