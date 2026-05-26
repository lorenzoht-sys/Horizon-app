import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Participant, Bilan, Contrat, NotesBilan } from '../../types';
import { PdfHeader, PdfFooter, type PdfPraticienSettings } from './PdfShared';

export interface FichePatientPDFData {
  participant: Participant;
  bilanInitial: Bilan | null;
  contratActif: Contrat | null;
  settings: PdfPraticienSettings;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function formatDateFR(d: string | Date): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function calcAge(dn: string): number {
  const today = new Date(), birth = new Date(dn);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth()) age--;
  return age;
}
function getCategorieIMC(imc: number): string {
  if (imc < 18.5) return 'Insuffisance pondérale';
  if (imc < 25)   return 'Poids normal';
  if (imc < 30)   return 'Surpoids';
  if (imc < 35)   return 'Obésité modérée';
  return 'Obésité sévère';
}

const MODE_LABEL: Record<string, string> = {
  voiture: 'Voiture', velo: 'Vélo', transports: 'Transports',
  marche: 'Marche', fauteuil: 'Fauteuil roulant', autre: 'Autre',
};
const JOURS_FR: Record<string, string> = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi',
  ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche',
};
const NOTE_COLOR: Record<number, string> = {
  1: '#EF4444', 2: '#F59E0B', 3: '#F59E0B', 4: '#3B6D11', 5: '#2BBFBF',
};
const NOTE_LABEL: Record<number, string> = {
  1: 'Très insuf.', 2: 'Insuffisant', 3: 'Moyen', 4: 'Bien', 5: 'Excellent',
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const BLUE = '#1A5F9E';

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 11, color: '#0D2B4B', paddingBottom: 46 },
  body: { paddingHorizontal: 28, paddingTop: 14 },
  name: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subtitle: { fontSize: 11, color: '#4A6080', lineHeight: 1.7, marginBottom: 12 },
  sectionHeader: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BLUE, textTransform: 'uppercase', letterSpacing: 0.8, borderBottomWidth: 1, borderBottomColor: '#D0E7F9', paddingBottom: 3, marginBottom: 7, marginTop: 12 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { color: '#6B84A0', fontSize: 10, minWidth: 150 },
  value: { color: '#0D2B4B', fontSize: 10, fontFamily: 'Helvetica-Bold', flex: 1 },
  quoteBox: { marginTop: 6, padding: '7 10', backgroundColor: '#E1F5EE', borderLeftWidth: 3, borderLeftColor: '#2BBFBF' },
  quoteText: { fontSize: 10, color: '#0F6E56', fontStyle: 'italic', lineHeight: 1.6 },
  // Page 2
  p2Title: { fontSize: 14, fontFamily: 'Helvetica-Bold', borderBottomWidth: 2.5, borderBottomColor: BLUE, paddingBottom: 10, marginBottom: 12 },
  p2Sub: { fontSize: 10, color: '#8B9BB4' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F0F7FF', paddingVertical: 4 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E8F0F8', paddingVertical: 4 },
  thTest: { flex: 2, fontSize: 9, fontFamily: 'Helvetica-Bold', paddingLeft: 5 },
  thResult: { flex: 1, fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  thNote: { width: 32, fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  thInterp: { flex: 1.5, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  miniBar: { height: 8, backgroundColor: '#E8EDF5', marginTop: 2 },
  miniBarFill: { height: '100%' },
  interpretSection: { marginTop: 12 },
  interpretText: { fontSize: 10, lineHeight: 1.7, color: '#333333', textAlign: 'justify' },
  pointsRow: { flexDirection: 'row', marginTop: 5 },
  pointLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginRight: 4 },
  pointValue: { fontSize: 9, flex: 1 },
  messageBox: { marginTop: 8, padding: '8 12', backgroundColor: '#E1F5EE', borderLeftWidth: 4, borderLeftColor: '#2BBFBF' },
  messageTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0F6E56', marginBottom: 3 },
  messageText: { fontSize: 10, color: '#0F6E56', fontStyle: 'italic', lineHeight: 1.6 },
});

// ─── Composants ───────────────────────────────────────────────────────────────

function Section({ titre }: { titre: string }) {
  return <Text style={S.sectionHeader}>{titre}</Text>;
}

function Ligne({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View style={S.row}>
      <Text style={S.label}>{label} :</Text>
      <Text style={S.value}>{valeur}</Text>
    </View>
  );
}

function MiniBar({ valeur, max, color }: { valeur: number; max: number; color: string }) {
  return (
    <View style={S.miniBar}>
      <View style={[S.miniBarFill, { width: `${(valeur / max) * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

// ─── Page 1 ───────────────────────────────────────────────────────────────────

function Page1({ participant, settings }: { participant: Participant; settings: PdfPraticienSettings }) {
  const imc = participant.taille && participant.poids
    ? Math.round((participant.poids / ((participant.taille / 100) ** 2)) * 10) / 10
    : null;

  const infosLigne = [
    `${calcAge(participant.dateNaissance)} ans`,
    `né(e) le ${formatDateFR(participant.dateNaissance)}`,
    participant.taille && `${participant.taille} cm`,
    participant.poids && `${participant.poids} kg`,
    imc && `IMC ${imc} — ${getCategorieIMC(imc)}`,
  ].filter(Boolean).join(' · ');

  return (
    <Page size="A4" style={S.page}>
      <PdfHeader settings={settings} title="Fiche participant" />
      <View style={S.body}>
        <Text style={S.name}>{participant.prenom.toUpperCase()} {participant.nom.toUpperCase()}</Text>
        <Text style={S.subtitle}>{infosLigne}</Text>

        {(participant.telephone || participant.email || participant.adresseRue) && (
          <>
            <Section titre="Coordonnées" />
            {participant.telephone && <Ligne label="Téléphone" valeur={participant.telephone} />}
            {participant.email && <Ligne label="Email" valeur={participant.email} />}
            {participant.adresseRue && (
              <Ligne label="Adresse" valeur={`${participant.adresseRue}, ${participant.adresseCodePostal} ${participant.adresseVille}`} />
            )}
          </>
        )}

        {(participant.antecedentsMedicaux || participant.antecedentsChirurgicaux || participant.allergies || participant.modeDeplacementHabituel) && (
          <>
            <Section titre="Profil de santé" />
            {participant.antecedentsMedicaux && <Ligne label="Antécédents médicaux" valeur={participant.antecedentsMedicaux} />}
            {participant.antecedentsChirurgicaux && <Ligne label="Antécédents chirurgicaux" valeur={participant.antecedentsChirurgicaux} />}
            {participant.allergies && <Ligne label="Allergies" valeur={participant.allergies} />}
            {participant.modeDeplacementHabituel && (
              <Ligne label="Déplacement habituel" valeur={MODE_LABEL[participant.modeDeplacementHabituel] ?? participant.modeDeplacementHabituel} />
            )}
          </>
        )}

        {(participant.disponibilites?.joursDisponibles?.length ?? 0) > 0 && (
          <>
            <Section titre="Disponibilités" />
            <Ligne label="Jours" valeur={participant.disponibilites!.joursDisponibles.map(j => JOURS_FR[j] ?? j).join(', ')} />
            {participant.disponibilites!.dureeSeanceMinutes && (
              <Ligne label="Durée séance" valeur={`${participant.disponibilites!.dureeSeanceMinutes} min`} />
            )}
            {participant.disponibilites!.contraintes && (
              <Ligne label="Contraintes" valeur={participant.disponibilites!.contraintes} />
            )}
          </>
        )}

        {((participant.activitesSouhaitees?.length ?? 0) > 0 || participant.objectifsPatient) && (
          <>
            <Section titre="Objectifs & activités souhaitées" />
            {participant.objectifsPatient && (Array.isArray(participant.objectifsPatient) ? participant.objectifsPatient.length > 0 : true) && (
              <Ligne label="Objectifs" valeur={Array.isArray(participant.objectifsPatient) ? participant.objectifsPatient.join(' · ') : participant.objectifsPatient} />
            )}
            {(participant.activitesSouhaitees?.length ?? 0) > 0 && (
              <Ligne label="Activités souhaitées" valeur={participant.activitesSouhaitees!.join(' · ')} />
            )}
          </>
        )}
      </View>
      <PdfFooter settings={settings} />
    </Page>
  );
}

// ─── Page 2 ───────────────────────────────────────────────────────────────────

function Page2({ bilan, contrat, settings }: { bilan: Bilan; contrat: Contrat | null; settings: PdfPraticienSettings }) {
  const notes: NotesBilan = bilan.notesBilan ?? {};
  const interp = bilan.interpretationIA;
  const flat = bilan.bilanInitialData?.formulaireFlat?.data ?? {};

  const tests: { label: string; valeur: string; note?: number }[] = [
    { label: 'Équilibre D', valeur: bilan.equilibre.droite !== null ? `${bilan.equilibre.droite} s` : '—', note: notes.equilibre },
    { label: 'Équilibre G', valeur: bilan.equilibre.gauche !== null ? `${bilan.equilibre.gauche} s` : '—' },
    { label: 'Chair Stand 30s', valeur: bilan.chairStand30 !== null ? `${bilan.chairStand30} rép.` : '—', note: notes.force },
    { label: 'HandGrip D', valeur: bilan.handGrip.droite !== null ? `${bilan.handGrip.droite} kg` : '—', note: notes.handGrip },
    { label: 'HandGrip G', valeur: bilan.handGrip.gauche !== null ? `${bilan.handGrip.gauche} kg` : '—' },
    { label: 'TUG 3m', valeur: bilan.tug3m !== null ? `${bilan.tug3m} s` : '—', note: notes.mobilite },
    { label: 'Souplesse', valeur: bilan.souplesse.valeur !== null ? `${bilan.souplesse.valeur > 0 ? '+' : ''}${bilan.souplesse.valeur} cm` : '—', note: notes.souplesse },
    { label: 'TM6 distance', valeur: bilan.tm6.distanceMetres !== null ? `${bilan.tm6.distanceMetres} m` : '—', note: notes.endurance },
    { label: 'Mémoire immédiate', valeur: bilan.memoire.scoreImmediat !== null ? `${bilan.memoire.scoreImmediat}/5` : '—' },
    { label: 'Mémoire différée', valeur: bilan.memoire.scoreDiffere !== null ? `${bilan.memoire.scoreDiffere}/5` : '—', note: notes.memoire },
  ].filter(t => t.valeur !== '—');

  return (
    <Page size="A4" style={S.page}>
      <PdfHeader settings={settings} title="Fiche participant" />
      <View style={S.body}>
        <View style={S.p2Title}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 14 }}>Bilan fonctionnel initial</Text>
          <Text style={S.p2Sub}>Réalisé le {formatDateFR(bilan.date)}</Text>
        </View>

        {tests.length > 0 && (
          <>
            <View style={S.tableHeader}>
              <Text style={S.thTest}>Test</Text>
              <Text style={S.thResult}>Résultat</Text>
              <Text style={S.thNote}>Note</Text>
              <Text style={S.thInterp}>Interprétation</Text>
            </View>
            {tests.map((t, i) => (
              <View key={i} style={S.tableRow}>
                <Text style={[S.thTest, { fontFamily: 'Helvetica' }]}>{t.label}</Text>
                <Text style={[S.thResult, { fontFamily: 'Helvetica-Bold' }]}>{t.valeur}</Text>
                <Text style={[S.thNote, { fontFamily: 'Helvetica', color: t.note ? NOTE_COLOR[t.note] : '#8B9BB4' }]}>
                  {t.note ? `${t.note}/5` : '—'}
                </Text>
                <Text style={[S.thInterp, { fontSize: 9, color: t.note ? NOTE_COLOR[t.note] : '#8B9BB4' }]}>
                  {t.note ? NOTE_LABEL[t.note] : '—'}
                </Text>
              </View>
            ))}
          </>
        )}

        {(flat.douleur !== undefined || flat.fatigue !== undefined) && (
          <>
            <Text style={[S.sectionHeader, { marginTop: 10 }]}>Ressenti global</Text>
            {flat.douleur !== undefined && (
              <View style={S.row}>
                <Text style={S.label}>Douleur quotidienne :</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[S.value, { fontSize: 9 }]}>{flat.douleur as number} / 10</Text>
                  <MiniBar valeur={flat.douleur as number} max={10} color="#EF4444" />
                </View>
              </View>
            )}
            {flat.fatigue !== undefined && (
              <View style={S.row}>
                <Text style={S.label}>Fatigue quotidienne :</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[S.value, { fontSize: 9 }]}>{flat.fatigue as number} / 10</Text>
                  <MiniBar valeur={flat.fatigue as number} max={10} color="#F59E0B" />
                </View>
              </View>
            )}
            {flat.qualiteSommeil !== undefined && (
              <View style={S.row}>
                <Text style={S.label}>Qualité du sommeil :</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[S.value, { fontSize: 9 }]}>{flat.qualiteSommeil as number} / 5</Text>
                  <MiniBar valeur={flat.qualiteSommeil as number} max={5} color="#22C55E" />
                </View>
              </View>
            )}
          </>
        )}

        {interp && (
          <View style={S.interpretSection}>
            <Text style={S.sectionHeader}>Interprétation professionnelle</Text>
            <Text style={S.interpretText}>{interp.textePro}</Text>
            {interp.pointsForts?.length > 0 && (
              <View style={S.pointsRow}>
                <Text style={[S.pointLabel, { color: '#3B6D11' }]}>Points forts :</Text>
                <Text style={[S.pointValue, { color: '#3B6D11' }]}>{interp.pointsForts.join(' · ')}</Text>
              </View>
            )}
            {interp.pointsATravail?.length > 0 && (
              <View style={S.pointsRow}>
                <Text style={[S.pointLabel, { color: '#92400E' }]}>À travailler :</Text>
                <Text style={[S.pointValue, { color: '#92400E' }]}>{interp.pointsATravail.join(' · ')}</Text>
              </View>
            )}
            {interp.messageClient && (
              <View style={S.messageBox}>
                <Text style={S.messageTitle}>Message pour le patient</Text>
                <Text style={S.messageText}>{interp.messageClient}</Text>
              </View>
            )}
          </View>
        )}

        {bilan.notesProfessionnelles && !interp && (
          <>
            <Text style={S.sectionHeader}>Notes professionnelles</Text>
            <Text style={{ fontSize: 10, color: '#555555', lineHeight: 1.6 }}>{bilan.notesProfessionnelles}</Text>
          </>
        )}

        {contrat && (
          <>
            <Text style={S.sectionHeader}>Suivi en cours</Text>
            <Ligne label="Planning" valeur={`${contrat.joursFixe.map(j => JOURS_FR[j] ?? j).join(', ')} à ${contrat.heureDebut} · ${contrat.dureeMinutes} min`} />
            <Ligne label="Depuis" valeur={formatDateFR(contrat.dateDebut)} />
            <Ligne label="Progression" valeur={`${contrat.nombreSeancesRealisees} / ${contrat.nombreSeancesTotal} séances réalisées`} />
          </>
        )}
      </View>
      <PdfFooter settings={settings} />
    </Page>
  );
}

// ─── Document ─────────────────────────────────────────────────────────────────

export default function FichePatientPDF({ participant, bilanInitial, contratActif, settings }: FichePatientPDFData) {
  return (
    <Document>
      <Page1 participant={participant} settings={settings} />
      {bilanInitial && <Page2 bilan={bilanInitial} contrat={contratActif} settings={settings} />}
    </Document>
  );
}
