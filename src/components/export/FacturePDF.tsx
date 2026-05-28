import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import type { Facture } from '../../types';

const DARK   = '#0D2B2B';
const PRIMARY = '#1A5F9E';
const TEAL   = '#2BBFBF';
const LIGHT  = '#F0F7FF';
const GREEN  = '#F0FFF4';

function fm(n: number): string {
  return n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fd(iso: string): string {
  if (!iso) return '—';
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR');
}

function siret(s: string): string {
  const d = s.replace(/\s/g, '');
  return d.length === 14
    ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9, 14)}`
    : s;
}

function moisFR(debut: string, fin: string): string {
  const d = new Date(debut + 'T12:00');
  const f = new Date(fin + 'T12:00');
  const mois = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  if (d.getMonth() === f.getMonth()) return mois;
  return `${fd(debut)} – ${fd(fin)}`;
}

const S = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 9.5, color: DARK, paddingBottom: 80 },
  header:      { backgroundColor: DARK, padding: '14 22 14 22', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logoBox:     { width: 55, height: 26 },
  logo:        { width: '100%', height: '100%', objectFit: 'contain' },
  hRight:      { alignItems: 'flex-end' },
  hTitre:      { color: 'white', fontSize: 16, fontFamily: 'Helvetica-Bold', letterSpacing: 2 },
  hNumero:     { color: TEAL, fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 2 },

  body:        { padding: '16 22 0 22' },

  parties:     { flexDirection: 'row', gap: 10, marginBottom: 14 },
  carteBox:    { flex: 1, border: '1 solid #D0E4F0', borderRadius: 6, padding: '10 12' },
  carteLabel:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: PRIMARY, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5, borderBottom: '1 solid #D0E4F0', paddingBottom: 4 },
  carteNom:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 3 },
  carteTxt:    { fontSize: 9, color: '#444', lineHeight: 1.5 },
  carteSAP:    { fontSize: 8.5, color: PRIMARY, fontFamily: 'Helvetica-Bold', marginTop: 5, backgroundColor: LIGHT, padding: '4 6', borderRadius: 4 },

  datesBox:    { flex: 0.9, gap: 4 },
  dateRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 4, padding: '5 8' },
  dateLabel:   { fontSize: 8, color: '#6B7280', fontFamily: 'Helvetica-Bold' },
  dateVal:     { fontSize: 9, color: DARK, fontFamily: 'Helvetica-Bold' },

  tableHeader: { flexDirection: 'row', backgroundColor: PRIMARY, padding: '6 10', borderRadius: '4 4 0 0' },
  thDesc:      { flex: 3, color: 'white', fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  thQte:       { flex: 0.7, color: 'white', fontSize: 8.5, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  thPU:        { flex: 0.9, color: 'white', fontSize: 8.5, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  thMt:        { flex: 1, color: 'white', fontSize: 8.5, fontFamily: 'Helvetica-Bold', textAlign: 'right' },

  ligneEven:   { flexDirection: 'row', padding: '7 10', backgroundColor: 'white', borderBottom: '0.5 solid #E8F0FE' },
  ligneOdd:    { flexDirection: 'row', padding: '7 10', backgroundColor: '#FAFCFF', borderBottom: '0.5 solid #E8F0FE' },
  ldDesc:      { flex: 3 },
  ldDescTxt:   { fontSize: 9.5, color: DARK, fontFamily: 'Helvetica-Bold' },
  ldDetail:    { fontSize: 8, color: '#888', marginTop: 1.5 },
  ldQte:       { flex: 0.7, fontSize: 9.5, color: DARK, textAlign: 'center', alignSelf: 'center' },
  ldPU:        { flex: 0.9, fontSize: 9.5, color: DARK, textAlign: 'right', alignSelf: 'center' },
  ldMt:        { flex: 1, fontSize: 10, color: DARK, fontFamily: 'Helvetica-Bold', textAlign: 'right', alignSelf: 'center' },

  totalBloc:   { marginTop: 10, alignItems: 'flex-end', padding: '0 22' },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', width: 220, padding: '4 0', borderBottom: '0.5 solid #E8F0FE' },
  totalLabel:  { fontSize: 9, color: '#6B7280' },
  totalVal:    { fontSize: 9, color: DARK },
  totalFinal:  { flexDirection: 'row', justifyContent: 'space-between', width: 220, backgroundColor: PRIMARY, borderRadius: 6, padding: '8 10', marginTop: 4 },
  totalFLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: 'white' },
  totalFVal:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: 'white' },

  creditBloc:  { margin: '12 22 0 22', backgroundColor: GREEN, border: '1 solid #BBF7D0', borderRadius: 6, padding: '10 12' },
  creditTitre: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#166534', marginBottom: 3 },
  creditTxt:   { fontSize: 8.5, color: '#166534', lineHeight: 1.5 },

  paiement:    { margin: '10 22 0 22', backgroundColor: LIGHT, border: '1 solid #BFDBFE', borderRadius: 6, padding: '9 12' },
  paiTitre:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: PRIMARY, marginBottom: 3 },
  paiTxt:      { fontSize: 8.5, color: DARK, lineHeight: 1.5 },

  mentions:    { position: 'absolute', bottom: 16, left: 22, right: 22, borderTop: '0.5 solid #D0E4F0', paddingTop: 6 },
  mentionTxt:  { fontSize: 7.5, color: '#9CA3AF', lineHeight: 1.5 },

  footer:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: DARK, padding: '6 22', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerTxt:   { fontSize: 7.5, color: 'rgba(255,255,255,0.6)' },
});

export default function FacturePDF({ facture }: { facture: Facture }) {
  const { prestataire: p, patient: pa, lignes, periode } = facture;
  const creditImpot = facture.totalTTC / 2;

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={S.header}>
          <View style={S.logoBox}>
            <Image src="/logo-horizon.png.png" style={S.logo} />
          </View>
          <View style={S.hRight}>
            <Text style={S.hTitre}>FACTURE</Text>
            <Text style={S.hNumero}>{facture.numero}</Text>
          </View>
        </View>

        <View style={S.body}>

          {/* ── Parties ── */}
          <View style={S.parties}>

            {/* Prestataire */}
            <View style={S.carteBox}>
              <Text style={S.carteLabel}>Prestataire</Text>
              <Text style={S.carteNom}>{p.prenom} {p.nom}</Text>
              {p.societe ? <Text style={S.carteTxt}>{p.societe}</Text> : null}
              <Text style={S.carteTxt}>{p.adresse}</Text>
              <Text style={S.carteTxt}>{p.codePostal} {p.ville}</Text>
              <Text style={S.carteTxt}>{p.telephone}</Text>
              <Text style={S.carteTxt}>{p.email}</Text>
              <Text style={S.carteTxt}>SIRET : {siret(p.siret)}</Text>
              {p.numeroSAP ? (
                <Text style={S.carteSAP}>
                  Déclaration SAP N° {p.numeroSAP}{'\n'}
                  {p.dateSAP ? `Enregistrée le ${fd(p.dateSAP)}` : ''}
                </Text>
              ) : null}
            </View>

            {/* Dates */}
            <View style={S.datesBox}>
              <View style={S.dateRow}>
                <Text style={S.dateLabel}>Date d'émission</Text>
                <Text style={S.dateVal}>{fd(facture.dateEmission)}</Text>
              </View>
              <View style={S.dateRow}>
                <Text style={S.dateLabel}>Période facturée</Text>
                <Text style={S.dateVal}>{moisFR(periode.debut, periode.fin)}</Text>
              </View>
              <View style={[S.dateRow, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[S.dateLabel, { color: '#92400E' }]}>Date d'échéance</Text>
                <Text style={[S.dateVal, { color: '#92400E' }]}>{fd(facture.dateEcheance)}</Text>
              </View>
              <View style={S.dateRow}>
                <Text style={S.dateLabel}>Nature</Text>
                <Text style={S.dateVal}>Prestation de service</Text>
              </View>
              <View style={S.dateRow}>
                <Text style={S.dateLabel}>Prestation</Text>
                <Text style={S.dateVal}>Activité Physique Adaptée</Text>
              </View>
            </View>

            {/* Patient */}
            <View style={S.carteBox}>
              <Text style={S.carteLabel}>Bénéficiaire</Text>
              <Text style={S.carteNom}>{pa.prenom} {pa.nom}</Text>
              {pa.adresse ? <Text style={S.carteTxt}>{pa.adresse}</Text> : null}
              {pa.codePostal || pa.ville
                ? <Text style={S.carteTxt}>{pa.codePostal} {pa.ville}</Text>
                : null}
            </View>

          </View>

          {/* ── Tableau ── */}
          <View style={S.tableHeader}>
            <Text style={S.thDesc}>Description</Text>
            <Text style={S.thQte}>Qté</Text>
            <Text style={S.thPU}>P.U.</Text>
            <Text style={S.thMt}>Montant</Text>
          </View>

          {lignes.map((l, i) => (
            <View key={l.id} style={i % 2 === 0 ? S.ligneEven : S.ligneOdd}>
              <View style={S.ldDesc}>
                <Text style={S.ldDescTxt}>{l.description}</Text>
                {l.type === 'seance' && (
                  <Text style={S.ldDetail}>
                    {l.quantite} séance{l.quantite > 1 ? 's' : ''} × {fm(l.prixUnitaire)} €/séance
                  </Text>
                )}
                {l.type === 'deplacement' && (
                  <Text style={S.ldDetail}>
                    {l.quantite} km × {fm(l.prixUnitaire)} €/km
                  </Text>
                )}
              </View>
              <Text style={S.ldQte}>{l.quantite} {l.unite}</Text>
              <Text style={S.ldPU}>{fm(l.prixUnitaire)} €</Text>
              <Text style={S.ldMt}>{fm(l.montant)} €</Text>
            </View>
          ))}

        </View>

        {/* ── Total ── */}
        <View style={S.totalBloc}>
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>Total HT</Text>
            <Text style={S.totalVal}>{fm(facture.totalHT)} €</Text>
          </View>
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>TVA</Text>
            <Text style={S.totalVal}>0,00 € (non applicable)</Text>
          </View>
          <View style={S.totalFinal}>
            <Text style={S.totalFLabel}>TOTAL TTC</Text>
            <Text style={S.totalFVal}>{fm(facture.totalTTC)} €</Text>
          </View>
        </View>

        {/* ── Crédit d'impôt ── */}
        {p.numeroSAP ? (
          <View style={S.creditBloc}>
            <Text style={S.creditTitre}>
              Avantage fiscal — Crédit d'impôt Service à la Personne (Art. 199 sexdecies CGI)
            </Text>
            <Text style={S.creditTxt}>
              En tant que prestataire SAP agréé (N° {p.numeroSAP}), {pa.prenom} {pa.nom} peut
              bénéficier d'un crédit d'impôt de 50 % sur les sommes versées, soit{' '}
              {fm(creditImpot)} € déduits directement de ses impôts (plafonds légaux applicables).
              Une attestation fiscale annuelle sera transmise avant le 31 mars de l'année suivante.
            </Text>
          </View>
        ) : null}

        {/* ── Paiement ── */}
        <View style={S.paiement}>
          <Text style={S.paiTitre}>Modalités de règlement</Text>
          <Text style={S.paiTxt}>
            Règlement à réception, au plus tard le {fd(facture.dateEcheance)}.
          </Text>
          {p.iban ? (
            <Text style={S.paiTxt}>
              Virement : IBAN {p.iban}{p.bic ? ` — BIC ${p.bic}` : ''}
            </Text>
          ) : null}
        </View>

        {/* ── Mentions légales ── */}
        <View style={S.mentions}>
          <Text style={S.mentionTxt}>
            TVA non applicable, article 293B du Code Général des Impôts —{' '}
            {p.numeroSAP
              ? `Organisme de Services à la Personne, Déclaration N° ${p.numeroSAP}${p.dateSAP ? `, enregistrée le ${fd(p.dateSAP)}` : ''} — `
              : ''}
            Nature de l'opération : Prestation de service —
            En cas de retard de paiement : pénalités au taux légal en vigueur exigibles sans rappel +
            indemnité forfaitaire de recouvrement de 40 € (Art. L441-10 C.com) —
            Facture à conserver 10 ans (Art. L123-22 C.com, Art. 199 sexdecies CGI)
          </Text>
        </View>

        {/* ── Footer ── */}
        <View style={S.footer} fixed>
          <Text style={S.footerTxt}>
            {p.prenom} {p.nom}{p.societe ? ` — ${p.societe}` : ''} — {p.telephone} — {p.email}
          </Text>
          <Text style={S.footerTxt}>1/1</Text>
        </View>

      </Page>
    </Document>
  );
}
