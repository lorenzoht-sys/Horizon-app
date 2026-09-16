import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import type { Participant, CategorieExercice } from '../../types';
import type { ProgrammePourPDF, ExercicePourPDF } from '../../lib/programmePDF';
import { PdfHeader, PdfFooter, type PdfPraticienSettings } from './PdfShared';

export interface ProgrammePDFData {
  participant: Participant;
  /** Déjà normalisé (V1 → une séance implicite, ou V2 filtré aux séances
   *  voulues) — voir src/lib/programmePDF.ts. Ce composant ne connaît plus
   *  la distinction V1/V2, une seule forme à rendre. */
  programme: ProgrammePourPDF;
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
  seanceTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1A5F9E', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6, marginBottom: 8 },
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
  tableSeanceTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#0D2B4B', marginTop: 14, marginBottom: 6 },
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

function libelleSeries(ex: ExercicePourPDF): string {
  return [
    ex.series ? `${ex.series} série${ex.series > 1 ? 's' : ''}` : null,
    ex.repetitions ? `${ex.repetitions} rép.` : (ex.dureeSecondes ? `${ex.dureeSecondes}s` : null),
  ].filter(Boolean).join(' · ');
}

// ─── Page 1 : exercices ───────────────────────────────────────────────────────

function PageExercices({ participant, programme, settings }: Omit<ProgrammePDFData, 'qrCodes'>) {
  const plusieursSeances = programme.seances.length > 1;

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
          {programme.dateDebut && (
            <Text style={{ fontSize: 10, color: '#888888' }}>
              Depuis le {new Date(programme.dateDebut).toLocaleDateString('fr-FR')}
            </Text>
          )}
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

      {programme.seances.map(seance => (
        <View key={seance.id}>
          {plusieursSeances && <Text style={S.seanceTitle}>{seance.nom}</Text>}
          {seance.exercices.map((ex, idx) => {
            const catColor = ex.categorie ? CAT_COLOR[ex.categorie] : '#666666';
            const catLabel = ex.categorie ? (CAT_LABEL[ex.categorie] ?? ex.categorie) : undefined;
            const series = libelleSeries(ex);

            return (
              <View key={ex.id} style={S.exCard}>
                <View style={S.exTitleRow}>
                  <Text style={S.exTitle}>{idx + 1}. {ex.nom}</Text>
                  {series && <Text style={S.exSeries}>{series}</Text>}
                </View>
                {catLabel && <Text style={[S.exCat, { color: catColor }]}>{catLabel}</Text>}
                <View style={S.exDivider} />
                {ex.description && <Text style={S.exDesc}>{ex.description}</Text>}
                {ex.niveauLabel && <Text style={S.exNiveau}>{ex.niveauLabel}</Text>}
                {ex.consigneSecurite && (
                  <View style={S.exAlert}>
                    <Text style={S.exAlertIcon}>!</Text>
                    <Text style={S.exAlertText}>{ex.consigneSecurite}</Text>
                  </View>
                )}
                {ex.notePersonnalisee && (
                  <Text style={S.exNote}>"{ex.notePersonnalisee}"</Text>
                )}
                {ex.adaptationTexte && (
                  <View style={S.exAdaptation}>
                    <Text style={S.exAdaptationText}>Adaptation : {ex.adaptationTexte}</Text>
                  </View>
                )}
                {ex.joursActifs.length > 0 && (
                  <View style={S.joursRow}>
                    {[1, 2, 3, 4, 5, 6, 7].map(d => (
                      <Text key={d} style={ex.joursActifs.includes(d) ? S.jourActive : S.jourInactive}>{JOURS[d]}</Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </Page>
  );
}

// ─── Page 2 : tableau de suivi ────────────────────────────────────────────────

function PageSuivi({ participant, programme, settings, qrCodes }: ProgrammePDFData) {
  const plusieursSeances = programme.seances.length > 1;
  const tousExercices = programme.seances.flatMap(s => s.exercices);
  const avecVideo = tousExercices.filter(ex => ex.videoYoutubeId && qrCodes?.[ex.videoYoutubeId]);
  const jours = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  return (
    <Page size="A4" style={S.page}>
      <View style={S.fixedHeader} fixed>
        <PdfHeader settings={settings} title="Programme d'exercices" />
      </View>
      <PdfFooter settings={settings} />

      <Text style={S.tableTitle}>Tableau de suivi — À cocher chaque jour</Text>

      {programme.seances.map(seance => (
        <View key={seance.id}>
          {plusieursSeances && <Text style={S.tableSeanceTitle}>{seance.nom}</Text>}

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
          {seance.exercices.map((ex, i) => (
            <View key={ex.id} style={[S.tableRow, i % 2 === 0 ? S.tableRowEven : S.tableRowOdd]}>
              <View style={S.tableCellEx}>
                <Text style={S.tableExName}>{i + 1}. {ex.nom}</Text>
                <Text style={S.tableExSub}>{libelleSeries(ex)}</Text>
              </View>
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <View key={d} style={S.tableCellDay}>
                  {ex.joursActifs.includes(d)
                    ? <View style={S.checkBox} />
                    : <Text style={S.tableDash}>—</Text>
                  }
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}

      {/* QR codes */}
      {avecVideo.length > 0 && (
        <View style={S.qrSection}>
          <Text style={S.qrTitle}>Voir les démonstrations vidéo</Text>
          <Text style={S.qrSub}>Scannez le QR code avec votre téléphone pour regarder la vidéo de l'exercice.</Text>
          <View style={S.qrRow}>
            {avecVideo.map(ex => {
              const qrSrc = qrCodes?.[ex.videoYoutubeId!];
              if (!qrSrc) return null;
              return (
                <View key={ex.id} style={S.qrItem}>
                  <Image src={qrSrc} style={S.qrImg} />
                  <Text style={S.qrName}>{ex.nom}</Text>
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
          {participant.prenom} {participant.nom} — {new Date(programme.dateReference).toLocaleDateString('fr-FR')}
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
