import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Participant, Bilan, Contrat, Programme } from '../../types';
import { PdfHeader, PdfFooter, type PdfPraticienSettings } from './PdfShared';
import type { CompteRenduSeance } from '../../types/seance';
import { getContreIndications } from '../../lib/anamnese';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeanceStat {
  dateSeance: string;
  statut: string;
  nbRealises: number;
  nbTotal: number;
}

export interface FicheCompletePDFData {
  participant: Participant;
  bilans: Bilan[];
  contratActif: Contrat | null;
  programmeActif: Programme | null;
  compteRendus: CompteRenduSeance[];
  seancesStats: SeanceStat[];
  settings: PdfPraticienSettings;
}

// ── Palette ───────────────────────────────────────────────────────────────────

const TEAL   = '#2BBFBF';
const DARK   = '#0D2B2B';
const BLUE   = '#1A5F9E';
const GRAY   = '#6B84A0';
const LIGHT  = '#F0F4F4';
const RED    = '#EF4444';

// ── Utilitaires ───────────────────────────────────────────────────────────────

function fmtDate(d: string | undefined | null): string {
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

function computeEvolution(
  initial: number | null,
  dernier: number | null,
  lower: boolean
): { evolution: string; evolutionPositive: boolean | null } {
  if (initial === null || dernier === null) return { evolution: '—', evolutionPositive: null };
  const diff = dernier - initial;
  if (diff === 0) return { evolution: '= stable', evolutionPositive: null };
  const better = lower ? diff < 0 : diff > 0;
  const sign = diff > 0 ? '+' : '';
  return { evolution: `${sign}${Math.round(diff * 10) / 10}`, evolutionPositive: better };
}

function getStatutTest(key: string, val: number): 'vert' | 'orange' | 'rouge' {
  const normes: Record<string, (v: number) => 'vert' | 'orange' | 'rouge'> = {
    tug:        v => v <= 8  ? 'vert' : v <= 12 ? 'orange' : 'rouge',
    chairStand: v => v >= 14 ? 'vert' : v >= 10 ? 'orange' : 'rouge',
    handGrip:   v => v >= 20 ? 'vert' : v >= 12 ? 'orange' : 'rouge',
    equilibre:  v => v >= 40 ? 'vert' : v >= 10 ? 'orange' : 'rouge',
    souplesse:  v => v >= 10 ? 'vert' : v >= 0  ? 'orange' : 'rouge',
    tm6:        v => v >= 500 ? 'vert' : v >= 350 ? 'orange' : 'rouge',
  };
  return normes[key]?.(val) ?? 'orange';
}

const JOURS_FR: Record<string, string> = {
  lun: 'Lun', mar: 'Mar', mer: 'Mer', jeu: 'Jeu', ven: 'Ven', sam: 'Sam',
};

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page:      { fontFamily: 'Helvetica', fontSize: 10, color: DARK, paddingBottom: 46 },
  body:      { paddingHorizontal: 24, paddingTop: 12 },
  h1:        { fontSize: 18, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 },
  h2:        {
    fontSize: 9, fontFamily: 'Helvetica-Bold', color: BLUE,
    textTransform: 'uppercase', letterSpacing: 0.6,
    borderBottomWidth: 1, borderBottomColor: '#D0E7F9',
    paddingBottom: 2, marginBottom: 6, marginTop: 10,
  },
  row:       { flexDirection: 'row', marginBottom: 3 },
  label:     { color: GRAY, fontSize: 9, width: 120 },
  value:     { color: DARK, fontSize: 9, fontFamily: 'Helvetica-Bold', flex: 1 },
  muted:     { color: GRAY, fontSize: 9 },
  // Table
  thead:     { flexDirection: 'row', backgroundColor: LIGHT, paddingVertical: 3, marginBottom: 1 },
  trow:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EEF2F2', paddingVertical: 3.5 },
  tc1:       { flex: 2.5, fontSize: 9, paddingLeft: 4 },
  tc2:       { flex: 1.2, fontSize: 9, textAlign: 'center' },
  tc3:       { flex: 1.2, fontSize: 9, textAlign: 'center' },
  tc4:       { flex: 1, fontSize: 9, textAlign: 'center' },
  tc5:       { flex: 1.5, fontSize: 9 },
  // Badges statut
  badgeG:    { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC', borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1 },
  badgeO:    { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D', borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1 },
  badgeR:    { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1 },
  // Note card
  noteCard:  { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 4, padding: 8, marginBottom: 7 },
  noteDate:  { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: TEAL, marginBottom: 3 },
  noteBody:  { fontSize: 8.5, color: '#444', lineHeight: 1.5 },
  // Alert
  alertBox:  { backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FCA5A5', borderRadius: 3, padding: 7, marginBottom: 7 },
  alertTitle:{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: RED, marginBottom: 2 },
  alertBody: { fontSize: 8.5, color: '#7F1D1D', lineHeight: 1.5 },
  // Signature
  sigBox:    { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 10, marginTop: 12 },
  mention:   { fontSize: 7.5, color: GRAY, fontStyle: 'italic', lineHeight: 1.5, marginTop: 8 },
});

// ── Sous-composants ───────────────────────────────────────────────────────────

function Section({ title }: { title: string }) {
  return <Text style={S.h2}>{title}</Text>;
}

function LigneInfo({ label, value }: { label: string; value: string }) {
  return (
    <View style={S.row}>
      <Text style={S.label}>{label} :</Text>
      <Text style={S.value}>{value}</Text>
    </View>
  );
}

function BadgeStatut({ statut }: { statut: 'vert' | 'orange' | 'rouge' }) {
  const cfg = {
    vert:   { style: S.badgeG, text: '✓ Normal',        color: '#166534' },
    orange: { style: S.badgeO, text: '~ Surveiller',    color: '#92400E' },
    rouge:  { style: S.badgeR, text: '✗ En difficulté', color: '#7F1D1D' },
  }[statut];
  return (
    <View style={cfg.style}>
      <Text style={{ fontSize: 7.5, color: cfg.color }}>{cfg.text}</Text>
    </View>
  );
}

// ── PAGE 1 — Identité & profil de santé ──────────────────────────────────────

function Page1({ participant, settings }: { participant: Participant; settings: PdfPraticienSettings }) {
  const imc = participant.taille && participant.poids
    ? Math.round((participant.poids / ((participant.taille / 100) ** 2)) * 10) / 10
    : null;

  const adresse = [participant.adresseRue, participant.adresseCodePostal, participant.adresseVille]
    .filter(Boolean).join(', ');

  const traitements = (participant.traitements ?? []).filter(t => !t.date_fin);
  const antecedentsStr = participant.antecedentsMedicaux ?? null;
  const chirurgicauxStr = participant.antecedentsChirurgicaux ?? null;

  const bilanInitial = participant.bilans.find(b => b.type === 'initial');
  const contreIndic = getContreIndications(participant, bilanInitial).detail;

  const objectifsStr = Array.isArray(participant.objectifsPatient)
    ? participant.objectifsPatient.join(' · ')
    : (participant.objectifsPatient ?? null);

  const bioline = [
    `${calcAge(participant.dateNaissance)} ans`,
    `né(e) le ${fmtDate(participant.dateNaissance)}`,
    participant.taille ? `${participant.taille} cm` : null,
    participant.poids ? `${participant.poids} kg` : null,
    imc ? `IMC ${imc}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Page size="A4" style={S.page}>
      <PdfHeader settings={settings} title="Fiche patient complète" />
      <View style={S.body}>

        <Text style={[S.h1, { marginTop: 4 }]}>
          {participant.prenom.toUpperCase()} {participant.nom.toUpperCase()}
        </Text>
        <Text style={[S.muted, { marginBottom: 10 }]}>{bioline}</Text>

        {contreIndic && (
          <View style={S.alertBox}>
            <Text style={S.alertTitle}>⚠ CONTRE-INDICATIONS À L'EFFORT</Text>
            <Text style={S.alertBody}>{contreIndic}</Text>
          </View>
        )}

        <Section title="Coordonnées" />
        {participant.telephone && <LigneInfo label="Téléphone" value={participant.telephone} />}
        {participant.email && <LigneInfo label="Email" value={participant.email} />}
        {adresse ? <LigneInfo label="Adresse" value={adresse} /> : null}
        {participant.medecinTraitant ? <LigneInfo label="Médecin traitant" value={participant.medecinTraitant} /> : null}

        {(antecedentsStr || chirurgicauxStr || participant.allergies) && (
          <>
            <Section title="Profil de santé" />
            {antecedentsStr ? <LigneInfo label="Antécédents médicaux" value={antecedentsStr} /> : null}
            {chirurgicauxStr ? <LigneInfo label="Antécédents chir." value={chirurgicauxStr} /> : null}
            {participant.allergies ? <LigneInfo label="Allergies / intolérances" value={participant.allergies} /> : null}
          </>
        )}

        {traitements.length > 0 && (
          <>
            <Section title="Traitements médicamenteux en cours" />
            <View style={S.thead}>
              <Text style={[S.tc1, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Médicament</Text>
              <Text style={[S.tc3, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Dose</Text>
              <Text style={[S.tc5, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Effet secondaire</Text>
            </View>
            {traitements.map((t, i) => (
              <View key={i} style={S.trow}>
                <Text style={S.tc1}>{t.nom}</Text>
                <Text style={S.tc3}>{t.dose ?? '—'}</Text>
                <Text style={S.tc5}>{t.effetSecondaire ?? '—'}</Text>
              </View>
            ))}
          </>
        )}

        {objectifsStr && (
          <>
            <Section title="Objectifs du suivi APA" />
            <Text style={{ fontSize: 9, color: DARK, lineHeight: 1.6 }}>{objectifsStr}</Text>
          </>
        )}

        <View style={{ marginTop: 8 }}>
          <Text style={[S.muted, { fontSize: 8 }]}>
            Fiche générée le {fmtDate(new Date().toISOString().slice(0, 10))} par {settings.prenom} {settings.nom}
          </Text>
        </View>

      </View>
      <PdfFooter settings={settings} />
    </Page>
  );
}

// ── PAGE 2 — Bilan fonctionnel ────────────────────────────────────────────────

function Page2({ bilans, settings }: { bilans: Bilan[]; settings: PdfPraticienSettings }) {
  const sorted = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  const bilanInitial = sorted.length > 1 ? sorted[0] : null;
  const dernierBilan = sorted[sorted.length - 1] ?? null;
  const hasEvol = bilanInitial !== null && dernierBilan !== null && bilanInitial.id !== dernierBilan.id;

  if (!dernierBilan) {
    return (
      <Page size="A4" style={S.page}>
        <PdfHeader settings={settings} title="Fiche patient complète" />
        <View style={S.body}>
          <Section title="Bilan fonctionnel" />
          <Text style={S.muted}>Aucun bilan réalisé pour ce patient.</Text>
        </View>
        <PdfFooter settings={settings} />
      </Page>
    );
  }

  interface TestRow {
    label: string; norme: string;
    valD: string; valI: string;
    evolution: string; evolutionPositive: boolean | null;
    statut: 'vert' | 'orange' | 'rouge' | null;
  }

  const mkRow = (
    label: string, norme: string, key: string,
    vD: number | null, vI: number | null, lower: boolean
  ): TestRow | null => {
    if (vD === null) return null;
    const { evolution, evolutionPositive } = computeEvolution(hasEvol ? vI : null, vD, lower);
    return {
      label, norme,
      valD: String(vD), valI: hasEvol && vI !== null ? String(vI) : '—',
      evolution, evolutionPositive,
      statut: getStatutTest(key, vD),
    };
  };

  const d = dernierBilan;
  const ini = bilanInitial;

  const rows: TestRow[] = [
    mkRow('TUG 3m (s)',       '≤ 8s',      'tug',        d.tug3m,                   ini?.tug3m ?? null,                   true),
    mkRow('Chair Stand (rép.)','≥ 14 rép.',  'chairStand', d.chairStand30,            ini?.chairStand30 ?? null,            false),
    mkRow('HandGrip D (kg)',  '≥ 20 kg',   'handGrip',   d.handGrip.droite,          ini?.handGrip.droite ?? null,          false),
    mkRow('HandGrip G (kg)',  '≥ 20 kg',   'handGrip',   d.handGrip.gauche,          ini?.handGrip.gauche ?? null,          false),
    mkRow('Équilibre D (s)',  '≥ 40s',     'equilibre',  d.equilibre.droite,         ini?.equilibre.droite ?? null,         false),
    mkRow('Souplesse (cm)',   '≥ 10 cm',   'souplesse',  d.souplesse.valeur,         ini?.souplesse.valeur ?? null,         false),
    mkRow('TM6 (m)',          '≥ 400 m',   'tm6',        d.tm6.distanceMetres,       ini?.tm6.distanceMetres ?? null,       false),
  ].filter((r): r is TestRow => r !== null);

  const interpText = d.interpretationIA?.textePro
    ?? (d.notesProfessionnelles?.trim() ? d.notesProfessionnelles : null);

  return (
    <Page size="A4" style={S.page}>
      <PdfHeader settings={settings} title="Fiche patient complète" />
      <View style={S.body}>
        <Section title="Bilan fonctionnel" />

        <View style={[S.row, { marginBottom: 4 }]}>
          <Text style={S.label}>Dernier bilan :</Text>
          <Text style={S.value}>
            {fmtDate(d.date)} · {d.type === 'initial' ? 'Initial' : 'Trimestriel'}
          </Text>
        </View>
        {hasEvol && bilanInitial && (
          <View style={[S.row, { marginBottom: 8 }]}>
            <Text style={S.label}>Bilan initial :</Text>
            <Text style={S.value}>
              {fmtDate(bilanInitial.date)} · {bilans.length} bilan{bilans.length > 1 ? 's' : ''} au total
            </Text>
          </View>
        )}

        {/* En-tête tableau */}
        <View style={S.thead}>
          <Text style={[S.tc1, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Test</Text>
          <Text style={[S.tc2, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Résultat</Text>
          <Text style={[S.tc3, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Norme</Text>
          {hasEvol && <Text style={[S.tc3, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Évolution</Text>}
          <Text style={[S.tc4, { fontFamily: 'Helvetica-Bold', fontSize: 8 }]}>Statut</Text>
        </View>

        {rows.map((r, i) => (
          <View key={i} style={S.trow}>
            <Text style={S.tc1}>{r.label}</Text>
            <Text style={[S.tc2, { fontFamily: 'Helvetica-Bold' }]}>{r.valD}</Text>
            <Text style={[S.tc3, { color: GRAY }]}>{r.norme}</Text>
            {hasEvol && (
              <Text style={[S.tc3, {
                color: r.evolutionPositive === true ? '#16A34A'
                     : r.evolutionPositive === false ? RED
                     : GRAY,
              }]}>{r.evolution}</Text>
            )}
            <View style={S.tc4}>
              {r.statut ? <BadgeStatut statut={r.statut} /> : null}
            </View>
          </View>
        ))}

        <Text style={[S.muted, { fontSize: 7.5, marginTop: 5, marginBottom: 8 }]}>
          ✓ Normal = dans les normes APA · ~ Surveiller = vigilance recommandée · ✗ En difficulté = axe de travail prioritaire
        </Text>

        {interpText && (
          <>
            <Section title="Interprétation clinique" />
            <View style={{ borderWidth: 1, borderColor: '#D0E7F9', borderRadius: 3, padding: 8, backgroundColor: '#F5FAFF' }}>
              <Text style={{ fontSize: 8.5, color: '#1A3A5C', lineHeight: 1.65, textAlign: 'justify' }}>
                {interpText.replace(/#{1,3} /g, '').replace(/\*\*/g, '').trim()}
              </Text>
            </View>
          </>
        )}

        {d.interpretationIA?.pointsForts && d.interpretationIA.pointsForts.length > 0 && (
          <View style={[S.row, { marginTop: 6 }]}>
            <Text style={[S.label, { color: '#166534', fontFamily: 'Helvetica-Bold' }]}>Points forts :</Text>
            <Text style={{ fontSize: 9, color: '#166534', flex: 1 }}>
              {d.interpretationIA.pointsForts.join(' · ')}
            </Text>
          </View>
        )}

        {d.interpretationIA?.pointsATravail && d.interpretationIA.pointsATravail.length > 0 && (
          <View style={S.row}>
            <Text style={[S.label, { color: '#92400E', fontFamily: 'Helvetica-Bold' }]}>À travailler :</Text>
            <Text style={{ fontSize: 9, color: '#92400E', flex: 1 }}>
              {d.interpretationIA.pointsATravail.join(' · ')}
            </Text>
          </View>
        )}

      </View>
      <PdfFooter settings={settings} />
    </Page>
  );
}

// ── PAGE 3 — Suivi et notes de séances ───────────────────────────────────────

function Page3({ contratActif, compteRendus, seancesStats, settings }: {
  participant: Participant;
  contratActif: Contrat | null;
  compteRendus: CompteRenduSeance[];
  seancesStats: SeanceStat[];
  settings: PdfPraticienSettings;
}) {
  const terminees = seancesStats.filter(s => s.statut === 'terminee' || s.statut === 'realisee').length;
  const tauxAssiduite = seancesStats.length > 0
    ? Math.round((terminees / seancesStats.length) * 100)
    : null;

  const joursContrat = contratActif
    ? contratActif.joursFixe.map(j => JOURS_FR[j] ?? j).join(' + ')
    : null;

  const derniersCR = compteRendus.slice(0, 5);
  const praticienNom = `${settings.prenom} ${settings.nom}`.trim();

  return (
    <Page size="A4" style={S.page}>
      <PdfHeader settings={settings} title="Fiche patient complète" />
      <View style={S.body}>

        <Section title="Suivi APA en cours" />
        {praticienNom && <LigneInfo label="Praticien APA" value={praticienNom} />}
        {settings.titre ? <LigneInfo label="Qualification" value={settings.titre} /> : null}

        {contratActif ? (
          <>
            <LigneInfo label="Début du suivi" value={fmtDate(contratActif.dateDebut)} />
            {joursContrat ? <LigneInfo label="Fréquence" value={`${joursContrat} · ${contratActif.dureeMinutes} min`} /> : null}
            <LigneInfo
              label="Progression"
              value={`${contratActif.nombreSeancesRealisees} / ${contratActif.nombreSeancesTotal} séances réalisées`}
            />
          </>
        ) : (
          <Text style={[S.muted, { marginBottom: 4 }]}>Aucun contrat actif.</Text>
        )}

        {tauxAssiduite !== null && (
          <LigneInfo
            label="Assiduité"
            value={`${tauxAssiduite}% (${terminees} séances sur ${seancesStats.length})`}
          />
        )}

        {/* Notes de séances */}
        <Section title={derniersCR.length > 0
          ? `Notes de séances (${derniersCR.length} dernières sur ${compteRendus.length})`
          : 'Notes de séances'
        } />

        {derniersCR.length === 0 && (
          <Text style={S.muted}>Aucune note de séance disponible.</Text>
        )}

        {derniersCR.map(cr => {
          const meta = [
            cr.dureeMinutes ? `${cr.dureeMinutes} min` : null,
            cr.humeurPatient ?? null,
            cr.progression ?? null,
          ].filter(Boolean).join(' · ');

          return (
            <View key={cr.id} style={S.noteCard}>
              <Text style={S.noteDate}>
                {fmtDate(cr.dateSeance)}{meta ? ` · ${meta}` : ''}
              </Text>
              {cr.observations?.trim() ? (
                <Text style={S.noteBody}>{cr.observations.trim()}</Text>
              ) : null}
              {cr.douleursSignalees?.trim() ? (
                <Text style={[S.noteBody, { color: RED, marginTop: 2 }]}>
                  {'⚠ Douleurs : ' + cr.douleursSignalees.trim()}
                </Text>
              ) : null}
              {cr.prochaineSeanceNotes?.trim() ? (
                <Text style={[S.noteBody, { color: TEAL, marginTop: 2 }]}>
                  {'→ Prochaine : ' + cr.prochaineSeanceNotes.trim()}
                </Text>
              ) : null}
            </View>
          );
        })}

      </View>
      <PdfFooter settings={settings} />
    </Page>
  );
}

// ── PAGE 4 — Programme & recommandations ─────────────────────────────────────

function Page4({ participant, bilans, programmeActif, settings }: {
  participant: Participant;
  bilans: Bilan[];
  programmeActif: Programme | null;
  settings: PdfPraticienSettings;
}) {
  const sorted = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  const dernierBilan = sorted[sorted.length - 1] ?? null;

  const bilanInitial = participant.bilans.find(b => b.type === 'initial');
  const contreIndic = getContreIndications(participant, bilanInitial).detail;

  let prochainBilan: string | null = null;
  if (dernierBilan) {
    const d = new Date(dernierBilan.date);
    d.setMonth(d.getMonth() + 3);
    prochainBilan = fmtDate(d.toISOString().slice(0, 10));
  }

  const praticienNom = `${settings.prenom} ${settings.nom}`.trim();
  const axesTravail = dernierBilan?.interpretationIA?.pointsATravail ?? [];

  return (
    <Page size="A4" style={S.page}>
      <PdfHeader settings={settings} title="Fiche patient complète" />
      <View style={S.body}>

        {/* Programme */}
        {programmeActif ? (
          <>
            <Section title="Programme d'exercices en cours" />
            <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 3 }}>
              {programmeActif.titre}
            </Text>
            {programmeActif.objectif ? (
              <Text style={[S.muted, { marginBottom: 4 }]}>Objectif : {programmeActif.objectif}</Text>
            ) : null}
            {programmeActif.messageMotivation ? (
              <View style={{ backgroundColor: '#E1F5EE', borderLeftWidth: 3, borderLeftColor: TEAL, paddingLeft: 8, paddingTop: 5, paddingBottom: 5, paddingRight: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 8.5, color: '#0F6E56', fontStyle: 'italic' }}>
                  {'"' + programmeActif.messageMotivation + '"'}
                </Text>
              </View>
            ) : null}
            <LigneInfo
              label="Exercices"
              value={`${programmeActif.exercices.length} exercice${programmeActif.exercices.length !== 1 ? 's' : ''} dans le programme`}
            />
            <LigneInfo label="Programme créé le" value={fmtDate(programmeActif.dateCreation)} />
          </>
        ) : (
          <>
            <Section title="Programme d'exercices" />
            <Text style={S.muted}>Aucun programme actif pour ce patient.</Text>
          </>
        )}

        {/* Recommandations */}
        <Section title="Recommandations et points de vigilance" />

        {contreIndic && (
          <View style={[S.alertBox, { marginBottom: 10 }]}>
            <Text style={S.alertTitle}>⚠ Points de vigilance à respecter</Text>
            <Text style={S.alertBody}>{contreIndic}</Text>
          </View>
        )}

        {axesTravail.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 4 }}>
              Axes de travail prioritaires (depuis dernier bilan) :
            </Text>
            {axesTravail.map((p, i) => (
              <Text key={i} style={{ fontSize: 9, color: '#92400E', marginLeft: 8, marginBottom: 2 }}>
                {'→ ' + p}
              </Text>
            ))}
          </View>
        )}

        {prochainBilan && (
          <View style={[S.row, { marginBottom: 10 }]}>
            <Text style={[S.label, { color: TEAL }]}>Prochain bilan conseillé :</Text>
            <Text style={[S.value, { color: TEAL }]}>{prochainBilan}</Text>
          </View>
        )}

        {/* Signature */}
        <View style={S.sigBox}>
          <Text style={{ fontSize: 8.5, color: GRAY, marginBottom: 5 }}>Document établi par :</Text>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK }}>
            {praticienNom || 'Enseignant APA'}
          </Text>
          {settings.titre ? (
            <Text style={{ fontSize: 9, color: GRAY }}>{settings.titre}</Text>
          ) : null}
          {settings.societe ? (
            <Text style={{ fontSize: 9, color: GRAY }}>{settings.societe}</Text>
          ) : null}
          <View style={[S.row, { marginTop: 4 }]}>
            {settings.email ? <Text style={S.muted}>{settings.email}</Text> : null}
            {settings.telephone ? (
              <Text style={[S.muted, { marginLeft: 12 }]}>{settings.telephone}</Text>
            ) : null}
          </View>
          <Text style={[S.muted, { marginTop: 4 }]}>
            Date de génération : {fmtDate(new Date().toISOString().slice(0, 10))}
          </Text>
          <Text style={S.mention}>
            {'Ce document est établi dans le cadre d\'un suivi en Activité Physique Adaptée (APA).\n'}
            {'Il est destiné à un usage médical ou paramédical et ne constitue pas un diagnostic.'}
          </Text>
        </View>

      </View>
      <PdfFooter settings={settings} />
    </Page>
  );
}

// ── Document ──────────────────────────────────────────────────────────────────

export default function FicheCompletePDF({
  participant, bilans, contratActif, programmeActif,
  compteRendus, seancesStats, settings,
}: FicheCompletePDFData) {
  const sortedBilans = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Document>
      <Page1 participant={participant} settings={settings} />
      <Page2 bilans={sortedBilans} settings={settings} />
      <Page3
        participant={participant}
        contratActif={contratActif}
        compteRendus={compteRendus}
        seancesStats={seancesStats}
        settings={settings}
      />
      <Page4
        participant={participant}
        bilans={sortedBilans}
        programmeActif={programmeActif}
        settings={settings}
      />
    </Document>
  );
}
