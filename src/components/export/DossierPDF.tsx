import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import type { Participant, Bilan, Contrat, Programme } from '../../types';
import type { CompteRenduSeance } from '../../types/seance';
import {
  getContreIndications,
  getObjectifsActivites,
  getModeDeplacement,
  getOrganisation,
  formatMomentsTraitement,
  getAntecedentTitre,
  getAntecedentSousLigne,
  getTraitementsActifs,
} from '../../lib/anamnese';
import { TYPES_ANTECEDENT_LABELS } from '../../types';
import { PdfFooter, LOGO_H } from './PdfShared';

// ── Palette « Horizon » ────────────────────────────────────────────────────────

const DARK   = '#0D2B2B';
const TEAL   = '#2BBFBF';
const TEAL_BG = '#EAFBFB';
const GRAY   = '#6B7280';
const BORDER = '#E5ECEC';
const RED    = '#DC2626';
const RED_BG = '#FEF2F2';
const GREEN  = '#15803D';
const GREEN_BG = '#F0FDF4';
const ORANGE = '#B45309';
const ORANGE_BG = '#FFFBEB';

const JOURS_FR: Record<string, string> = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi',
  ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche',
};

const MODE_DEPLACEMENT_LABEL: Record<string, string> = {
  voiture: 'Voiture', velo: 'Vélo', transports: 'Transports',
  marche: 'Marche', fauteuil: 'Fauteuil roulant', autre: 'Autre',
};

// ── Types ───────────────────────────────────────────────────────────────────────

export interface DossierPraticienSettings {
  prenom: string;
  nom: string;
  titre?: string;
  email: string;
  telephone: string;
  societe?: string;
}

export interface DossierPDFData {
  participant: Participant;
  bilans: Bilan[];
  contratActif: Contrat | null;
  programmeActif: Programme | null;
  compteRendus: CompteRenduSeance[];
  settings: DossierPraticienSettings;
}

export interface DossierPDFProps extends DossierPDFData {
  mode: 'praticien' | 'patient';
}

// ── Utilitaires ───────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return String(d); }
}

function calcAge(dn: string): number {
  const t = new Date(), b = new Date(dn);
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}

function getCategorieIMC(imc: number): string {
  if (imc < 18.5) return 'Insuffisance pondérale';
  if (imc < 25)   return 'Poids normal';
  if (imc < 30)   return 'Surpoids';
  if (imc < 35)   return 'Obésité modérée';
  return 'Obésité sévère';
}

function computeEvolution(initial: number | null, dernier: number | null, lower: boolean): string {
  if (initial === null || dernier === null) return '—';
  const diff = dernier - initial;
  if (diff === 0) return 'stable';
  const better = lower ? diff < 0 : diff > 0;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${Math.round(diff * 10) / 10} (${better ? 'favorable' : 'à surveiller'})`;
}

type Statut = 'ok' | 'attention' | 'travail';

function getStatutTest(key: string, val: number): Statut {
  const normes: Record<string, (v: number) => Statut> = {
    tug:        v => v <= 8  ? 'ok' : v <= 12 ? 'attention' : 'travail',
    chairStand: v => v >= 14 ? 'ok' : v >= 10 ? 'attention' : 'travail',
    handGrip:   v => v >= 20 ? 'ok' : v >= 12 ? 'attention' : 'travail',
    equilibre:  v => v >= 40 ? 'ok' : v >= 10 ? 'attention' : 'travail',
    souplesse:  v => v >= 10 ? 'ok' : v >= 0  ? 'attention' : 'travail',
    tm6:        v => v >= 500 ? 'ok' : v >= 350 ? 'attention' : 'travail',
  };
  return normes[key]?.(val) ?? 'attention';
}

const STATUT_LABEL: Record<Statut, string> = {
  ok: 'Normal', attention: 'À surveiller', travail: 'À travailler',
};
const STATUT_COLOR: Record<Statut, { bg: string; fg: string }> = {
  ok:        { bg: GREEN_BG,  fg: GREEN  },
  attention: { bg: ORANGE_BG, fg: ORANGE },
  travail:   { bg: RED_BG,    fg: RED    },
};

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: DARK,
    backgroundColor: '#F4F8F8',
    paddingTop: 64,
    paddingBottom: 38,
    paddingHorizontal: 26,
  },

  // Header fixe
  fixedHeader: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: {
    backgroundColor: DARK,
    paddingVertical: 14,
    paddingHorizontal: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hLogoBox: { width: 50, height: 26 },
  hLogo: { width: '100%', height: '100%', objectFit: 'contain' },
  hCenter: { flex: 1, paddingHorizontal: 14 },
  hBrand: { color: 'white', fontSize: 11, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5 },
  hSubtitle: { color: '#9FD6D6', fontSize: 7.5, marginTop: 2 },
  hRight: { alignItems: 'flex-end' },
  hName: { color: 'white', fontSize: 14, fontFamily: 'Helvetica-Bold' },
  hMeta: { color: '#9FD6D6', fontSize: 7.5, marginTop: 2 },

  // Cartes
  card: { backgroundColor: 'white', borderRadius: 6, borderWidth: 1, borderColor: BORDER, padding: 12, marginBottom: 9 },
  cardTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: TEAL, textTransform: 'uppercase', letterSpacing: 1, paddingBottom: 5, marginBottom: 7, borderBottomWidth: 1, borderBottomColor: TEAL_BG },

  identiteName: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  identiteBio: { fontSize: 9, color: GRAY, marginBottom: 6 },

  // Lignes label / valeur
  row: { flexDirection: 'row', marginBottom: 3 },
  rowLabel: { width: 150, color: GRAY, fontSize: 9 },
  rowValue: { flex: 1, fontFamily: 'Helvetica-Bold', color: DARK, fontSize: 9 },

  // Alerte contre-indications
  alertBox: { backgroundColor: RED_BG, borderWidth: 1, borderColor: '#FCA5A5', borderLeftWidth: 3, borderLeftColor: RED, borderRadius: 4, padding: 8, marginBottom: 8 },
  alertTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: RED, marginBottom: 2 },
  alertText: { fontSize: 9, color: '#7F1D1D', lineHeight: 1.4 },

  subTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 7, marginBottom: 3 },

  // Tableaux
  tHead: { flexDirection: 'row', backgroundColor: '#F0F7F7' },
  tHeadCell: { padding: 4, borderBottomWidth: 1, borderBottomColor: BORDER },
  tHeadText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: DARK },
  tRow: { flexDirection: 'row' },
  tCell: { padding: 4, borderBottomWidth: 1, borderBottomColor: BORDER },
  tCellText: { fontSize: 8.5, color: DARK },

  // Badge de statut
  badge: { alignSelf: 'flex-start', borderRadius: 3, paddingVertical: 1, paddingHorizontal: 5 },
  badgeText: { fontSize: 8, fontFamily: 'Helvetica-Bold' },

  // Interprétation
  interpBox: { backgroundColor: '#F5FAFF', borderWidth: 1, borderColor: '#D0E7F9', borderRadius: 4, padding: 8, marginTop: 5 },
  interpText: { fontSize: 9, color: '#1A3A5C', lineHeight: 1.5, textAlign: 'justify' },

  objectifsText: { fontSize: 9.5, lineHeight: 1.5 },

  // Notes de séances
  crItem: { borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 5 },
  crDate: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: TEAL, marginBottom: 2 },
  crText: { fontSize: 8.5, color: '#444444', lineHeight: 1.4 },
  crAlert: { fontSize: 8.5, color: RED, marginTop: 2 },
  crNext: { fontSize: 8.5, color: TEAL, marginTop: 2 },
});

// ── Sous-composants ───────────────────────────────────────────────────────────

function Card({ title, children, wrap = true }: { title?: string; children: ReactNode; wrap?: boolean }) {
  return (
    <View style={S.card} wrap={wrap}>
      {title && <Text style={S.cardTitle}>{title}</Text>}
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View style={S.row}>
      <Text style={S.rowLabel}>{label}</Text>
      <Text style={S.rowValue}>{value}</Text>
    </View>
  );
}

function AlertBox({ titre, texte }: { titre: string; texte: string }) {
  return (
    <View style={S.alertBox}>
      <Text style={S.alertTitle}>{titre}</Text>
      <Text style={S.alertText}>{texte}</Text>
    </View>
  );
}

function StatusBadge({ statut }: { statut: Statut }) {
  const c = STATUT_COLOR[statut];
  return (
    <View style={[S.badge, { backgroundColor: c.bg }]}>
      <Text style={[S.badgeText, { color: c.fg }]}>{STATUT_LABEL[statut]}</Text>
    </View>
  );
}

function Table({ head, rows, widths }: { head: string[]; rows: ReactNode[][]; widths: number[] }) {
  return (
    <View style={{ marginTop: 4, marginBottom: 4 }}>
      <View style={S.tHead}>
        {head.map((h, i) => (
          <View key={i} style={[S.tHeadCell, { flex: widths[i] }]}>
            <Text style={S.tHeadText}>{h}</Text>
          </View>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={S.tRow} wrap={false}>
          {r.map((c, j) => (
            <View key={j} style={[S.tCell, { flex: widths[j] }]}>
              {typeof c === 'string' || typeof c === 'number'
                ? <Text style={S.tCellText}>{c}</Text>
                : c}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function DossierHeader({
  participant, isPraticien, dateGeneration, praticienNom,
}: { participant: Participant; isPraticien: boolean; dateGeneration: string; praticienNom: string }) {
  return (
    <View style={S.fixedHeader} fixed>
      <View style={S.header}>
        <View style={S.hLogoBox}>
          <Image src={LOGO_H} style={S.hLogo} />
        </View>
        <View style={S.hCenter}>
          <Text style={S.hBrand}>HORIZON — APA</Text>
          <Text style={S.hSubtitle}>
            {isPraticien ? 'Dossier praticien — usage interne' : 'Carte de santé — document à partager'}
          </Text>
        </View>
        <View style={S.hRight}>
          <Text style={S.hName}>{participant.prenom.toUpperCase()} {participant.nom.toUpperCase()}</Text>
          <Text style={S.hMeta}>Généré le {dateGeneration} par {praticienNom}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function DossierPDF({
  participant, bilans, contratActif, programmeActif, compteRendus, settings, mode,
}: DossierPDFProps) {
  const isPraticien = mode === 'praticien';
  const sortedBilans = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  const bilanInitial = participant.bilans.find(b => b.type === 'initial') ?? null;
  const dernierBilan = sortedBilans[sortedBilans.length - 1] ?? null;
  const hasEvol = bilanInitial !== null && dernierBilan !== null && bilanInitial.id !== dernierBilan.id;

  const imc = participant.taille && participant.poids
    ? Math.round((participant.poids / ((participant.taille / 100) ** 2)) * 10) / 10
    : null;

  const lieuNaissance = [participant.villeNaissance, participant.codePostalNaissance].filter(Boolean).join(' ');
  const adresse = [participant.adresseRue, participant.adresseCodePostal, participant.adresseVille].filter(Boolean).join(', ');

  const contreIndic = getContreIndications(participant, bilanInitial).detail;
  const { objectifsPatient } = getObjectifsActivites(participant, bilanInitial);
  const modeDeplacement = getModeDeplacement(participant, bilanInitial);
  const organisation = getOrganisation(participant, bilanInitial);

  const traitementsActifs = getTraitementsActifs(participant.traitements);
  const antecedentsStructures = participant.antecedentsMedicauxStructures ?? [];
  const autonomie = participant.anamnese?.autonomie;

  const praticienNom = `${settings.prenom} ${settings.nom}`.trim() || settings.societe || 'Horizon';
  const dateGeneration = fmtDate(new Date().toISOString().slice(0, 10));

  const bioline = [
    `${calcAge(participant.dateNaissance)} ans`,
    `né(e) le ${fmtDate(participant.dateNaissance)}${lieuNaissance ? ` à ${lieuNaissance}` : ''}`,
    participant.taille ? `${participant.taille} cm` : null,
    participant.poids ? `${participant.poids} kg` : null,
    imc ? `IMC ${imc} (${getCategorieIMC(imc)})` : null,
  ].filter(Boolean).join(' · ');

  // Tableau des tests du dernier bilan
  type TestRow = { label: string; norme: string; valD: string; evolution: string; statut: Statut };
  const mkRow = (label: string, norme: string, key: string, vD: number | null, vI: number | null, lower: boolean): TestRow | null => {
    if (vD === null || !dernierBilan) return null;
    return {
      label, norme,
      valD: String(vD),
      evolution: hasEvol ? computeEvolution(vI, vD, lower) : '—',
      statut: getStatutTest(key, vD),
    };
  };

  const testRows: TestRow[] = dernierBilan ? [
    mkRow('TUG 3 mètres (s)',     '<= 8 s',     'tug',        dernierBilan.tug3m,                  bilanInitial?.tug3m ?? null,                  true),
    mkRow('Chair Stand 30s (rép.)', '>= 14 rép.', 'chairStand', dernierBilan.chairStand30,           bilanInitial?.chairStand30 ?? null,           false),
    mkRow('Force de préhension D (kg)', '>= 20 kg', 'handGrip', dernierBilan.handGrip.droite,        bilanInitial?.handGrip.droite ?? null,        false),
    mkRow('Force de préhension G (kg)', '>= 20 kg', 'handGrip', dernierBilan.handGrip.gauche,        bilanInitial?.handGrip.gauche ?? null,        false),
    mkRow('Équilibre unipodal D (s)', '>= 40 s',  'equilibre',  dernierBilan.equilibre.droite,       bilanInitial?.equilibre.droite ?? null,       false),
    mkRow('Équilibre unipodal G (s)', '>= 40 s',  'equilibre',  dernierBilan.equilibre.gauche,       bilanInitial?.equilibre.gauche ?? null,       false),
    mkRow('Souplesse (cm)',       '>= 10 cm',   'souplesse',  dernierBilan.souplesse.valeur,       bilanInitial?.souplesse.valeur ?? null,       false),
    mkRow('Test 6 minutes (m)',   '>= 400 m',   'tm6',        dernierBilan.tm6.distanceMetres,     bilanInitial?.tm6.distanceMetres ?? null,     false),
  ].filter((r): r is TestRow => r !== null) : [];

  const interpTextRaw = dernierBilan?.interpretationIA?.textePro
    ?? (dernierBilan?.notesProfessionnelles?.trim() ? dernierBilan.notesProfessionnelles : null);
  const interpText = interpTextRaw ? interpTextRaw.replace(/#{1,3} /g, '').replace(/\*\*/g, '').trim() : null;

  const derniersCR = compteRendus.slice(0, 5);

  const testWidths = hasEvol ? [2.4, 0.9, 0.9, 1.3, 1.1] : [2.8, 0.9, 0.9, 1.2];

  return (
    <Document>
      <Page size="A4" style={S.page}>
        <DossierHeader participant={participant} isPraticien={isPraticien} dateGeneration={dateGeneration} praticienNom={praticienNom} />
        <PdfFooter settings={settings} />

        {/* ── IDENTITÉ ── */}
        <Card title="Identité" wrap={false}>
          <Text style={S.identiteName}>{participant.prenom} {participant.nom}</Text>
          <Text style={S.identiteBio}>{bioline}</Text>
          <Row label="Nom de naissance" value={participant.nomNaissance} />
          <Row label="Téléphone" value={participant.telephone} />
          <Row label="Email" value={participant.email} />
          <Row label="Adresse" value={adresse} />
          <Row label="Médecin traitant" value={participant.medecinTraitant} />
        </Card>

        {/* ── INFOS ADMINISTRATIVES (praticien uniquement) ── */}
        {isPraticien && (participant.iban || participant.bic || participant.droitImage !== undefined) && (
          <Card title="Informations administratives" wrap={false}>
            <Row label="IBAN" value={participant.iban} />
            <Row label="BIC" value={participant.bic} />
            {participant.droitImage !== undefined && (
              <Row label="Droit à l'image" value={participant.droitImage ? 'Accordé' : 'Non accordé'} />
            )}
          </Card>
        )}

        {/* ── PROFIL DE SANTÉ ── */}
        <Card title="Profil de santé">
          {contreIndic && <AlertBox titre="Contre-indications à l'effort" texte={contreIndic} />}
          <Row label="Antécédents médicaux" value={participant.antecedentsMedicaux} />
          <Row label="Antécédents chirurgicaux" value={participant.antecedentsChirurgicaux} />
          <Row label="Allergies" value={participant.allergies} />
          {modeDeplacement.value && (
            <Row label="Déplacement habituel" value={
              [MODE_DEPLACEMENT_LABEL[modeDeplacement.value] ?? modeDeplacement.value, modeDeplacement.detail].filter(Boolean).join(' — ')
            } />
          )}

          {antecedentsStructures.length > 0 && (
            <Table
              widths={[2.4, 1.3, 0.9, 2.4]}
              head={['Antécédent', 'Type', 'Date', 'Détails']}
              rows={antecedentsStructures.map(a => [
                getAntecedentTitre(a) + (a.douleur === 'oui' ? ' (douleur associée)' : ''),
                (TYPES_ANTECEDENT_LABELS[a.type] ?? a.type).replace(/^\S+\s/, ''),
                a.date ?? '—',
                [getAntecedentSousLigne(a), a.notes].filter(Boolean).join(' · ') || '—',
              ])}
            />
          )}

          {traitementsActifs.length > 0 && (
            <>
              <Text style={S.subTitle}>Traitements en cours</Text>
              <Table
                widths={[1.6, 0.8, 1.0, 1.0, 2.4]}
                head={['Médicament', 'Dose', 'Fréquence', 'Moment', 'Effet secondaire']}
                rows={traitementsActifs.map(t => [
                  t.nom, t.dose ?? '—', t.frequence ?? '—', formatMomentsTraitement(t.moments), t.effetSecondaire ?? '—',
                ])}
              />
            </>
          )}
        </Card>

        {/* ── AUTONOMIE & VIE QUOTIDIENNE ── */}
        {(autonomie?.aideADomicile === 'oui' || autonomie?.situationVie || autonomie?.aideMarche) && (
          <Card title="Autonomie & vie quotidienne" wrap={false}>
            <Row label="Situation de vie" value={autonomie?.situationVie} />
            <Row label="Aide à la marche" value={autonomie?.aideMarche} />
            {autonomie?.aideADomicile === 'oui' && (
              <>
                <Row label="Aide à domicile" value={
                  (autonomie.aideADomicileTypes?.length ?? 0) > 0
                    ? autonomie.aideADomicileTypes!.join(', ')
                    : 'Oui'
                } />
                <Row label="Fréquence de l'aide" value={autonomie.aideADomicileFrequence} />
                {autonomie.aideADomicileHeures != null && <Row label="Heures / semaine" value={`${autonomie.aideADomicileHeures} h`} />}
              </>
            )}
          </Card>
        )}

        {/* ── OBJECTIFS DU SUIVI ── */}
        {objectifsPatient.length > 0 && (
          <Card title="Objectifs du suivi APA" wrap={false}>
            <Text style={S.objectifsText}>{objectifsPatient.join(' · ')}</Text>
          </Card>
        )}

        {/* ── ORGANISATION DES SÉANCES (praticien uniquement) ── */}
        {isPraticien && ((organisation.joursDisponibles?.length ?? 0) > 0 || organisation.dureeSeance || organisation.contraintes) && (
          <Card title="Organisation des séances" wrap={false}>
            {(organisation.joursDisponibles?.length ?? 0) > 0 && (
              <Row label="Jours disponibles" value={organisation.joursDisponibles!.map(j => JOURS_FR[j] ?? j).join(', ')} />
            )}
            <Row label="Créneau préféré" value={organisation.creneau} />
            <Row label="Durée de séance" value={organisation.dureeSeance} />
            <Row label="Contraintes" value={organisation.contraintes} />
          </Card>
        )}

        {/* ── BILAN FONCTIONNEL ── */}
        {dernierBilan && (
          <Card title="Bilan fonctionnel">
            <Row label="Dernier bilan" value={`${fmtDate(dernierBilan.date)} — ${dernierBilan.type === 'initial' ? 'Bilan initial' : `Bilan T${dernierBilan.trimestre}`}`} />
            {hasEvol && bilanInitial && (
              <Row label="Bilan initial" value={`${fmtDate(bilanInitial.date)} — ${sortedBilans.length} bilan(s) au total`} />
            )}

            {testRows.length > 0 && (
              <Table
                widths={testWidths}
                head={hasEvol ? ['Test', 'Résultat', 'Norme', 'Évolution', 'Statut'] : ['Test', 'Résultat', 'Norme', 'Statut']}
                rows={testRows.map(r => {
                  const statut = <StatusBadge statut={r.statut} />;
                  return hasEvol
                    ? [r.label, r.valD, r.norme, r.evolution, statut]
                    : [r.label, r.valD, r.norme, statut];
                })}
              />
            )}

            {interpText && (
              <View style={S.interpBox}>
                <Text style={S.interpText}>{interpText}</Text>
              </View>
            )}

            <Row label="Points forts" value={dernierBilan.interpretationIA?.pointsForts?.join(' · ')} />
            <Row label="Axes de travail" value={dernierBilan.interpretationIA?.pointsATravail?.join(' · ')} />
          </Card>
        )}

        {/* ── SUIVI & CONTRAT (praticien uniquement) ── */}
        {isPraticien && (contratActif || programmeActif) && (
          <Card title="Suivi APA en cours" wrap={false}>
            <Row label="Praticien APA" value={praticienNom} />
            <Row label="Qualification" value={settings.titre} />
            {contratActif && (
              <>
                <Row label="Début du suivi" value={fmtDate(contratActif.dateDebut)} />
                <Row label="Fréquence" value={`${contratActif.joursFixe.map(j => JOURS_FR[j] ?? j).join(' + ')} · ${contratActif.dureeMinutes} min`} />
                <Row label="Progression" value={`${contratActif.nombreSeancesRealisees} / ${contratActif.nombreSeancesTotal} séances réalisées`} />
              </>
            )}
            {programmeActif && (
              <>
                <Row label="Programme actif" value={programmeActif.titre} />
                <Row label="Objectif programme" value={programmeActif.objectif} />
                <Row label="Exercices" value={`${programmeActif.exercices.length} exercice(s)`} />
              </>
            )}
          </Card>
        )}

        {/* ── NOTES DE SÉANCES (praticien uniquement) ── */}
        {isPraticien && derniersCR.length > 0 && (
          <Card title={`Notes de séances (${derniersCR.length} dernières sur ${compteRendus.length})`}>
            {derniersCR.map(cr => {
              const meta = [
                cr.dureeMinutes ? `${cr.dureeMinutes} min` : null,
                cr.humeurPatient ?? null,
                cr.progression ?? null,
              ].filter(Boolean).join(' · ');
              return (
                <View key={cr.id} style={S.crItem} wrap={false}>
                  <Text style={S.crDate}>
                    {fmtDate(cr.dateSeance)}{meta ? ` — ${meta}` : ''}
                  </Text>
                  {cr.observations.trim() && <Text style={S.crText}>{cr.observations.trim()}</Text>}
                  {cr.douleursSignalees?.trim() && (
                    <Text style={S.crAlert}>Douleurs signalées : {cr.douleursSignalees.trim()}</Text>
                  )}
                  {cr.prochaineSeanceNotes?.trim() && (
                    <Text style={S.crNext}>Prochaine séance : {cr.prochaineSeanceNotes.trim()}</Text>
                  )}
                </View>
              );
            })}
          </Card>
        )}

      </Page>
    </Document>
  );
}
