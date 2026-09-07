import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { PdfHeader, PdfFooter } from './PdfShared';

export interface ContratPDFData {
  /** Identite du prestataire, prise dans les reglages du praticien connecte.
   *  JAMAIS de valeur par defaut ici : un contrat engage la personne qu'il
   *  nomme, et un repli sur une identite en dur ferait signer au patient un
   *  document au nom d'un confrere. */
  praticien: {
    nom: string;
    adresse: string;
    siret: string;
    telephone: string;
    email: string;
  };
  societe?: string;
  logoPraticien?: string;
  patient: {
    nomPrenom: string;
    adresse: string;
    telephone?: string;
    email?: string;
  };
  contrat: {
    dateDebut: string;
    duree: string;
    frequence: string;
    lieu: string;
  };
  tarif: number;
  fraisKm: number;
  droitImage: string;
  conditionParticuliere: string;
  villeSignature: string;
  dateSignature: string;
}

const DARK = '#0D2B2B';

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#000000',
    paddingBottom: 74,
  },
  header: {
    backgroundColor: DARK,
    paddingVertical: 16,
    paddingHorizontal: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
  },
  logo: {
    height: 34,
    width: 70,
  },
  body: {
    paddingHorizontal: 40,
    paddingTop: 18,
  },
  pageTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  pageTitleSub: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 14,
  },
  divider: {
    borderTopWidth: 2,
    borderTopColor: '#000000',
    marginBottom: 18,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 5,
  },
  box: {
    borderWidth: 1.5,
    borderColor: '#000000',
    padding: 9,
    fontSize: 10,
    lineHeight: 1.7,
  },
  articleTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    marginBottom: 3,
  },
  articleBody: {
    fontSize: 10,
    lineHeight: 1.65,
    textAlign: 'justify',
    marginBottom: 13,
  },
  conditionBox: {
    borderWidth: 1.5,
    borderColor: '#000000',
    padding: 10,
    marginTop: 10,
    marginBottom: 20,
    minHeight: 58,
  },
  signRow: {
    flexDirection: 'row',
  },
  signBox: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#000000',
    padding: 12,
    minHeight: 90,
    alignItems: 'center',
  },
});

const B = ({ children }: { children: string }) => (
  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{children}</Text>
);


export default function ContratPDF({ data }: { data: ContratPDFData }) {
  const dots = '.......................................';
  const pdfSettings = {
    prenom: data.praticien.nom,
    nom: '',
    email: data.praticien.email,
    telephone: data.praticien.telephone,
    societe: data.societe,
    logoPraticien: data.logoPraticien,
  };
  return (
    <Document>
      {/* ── Page 1 ── */}
      <Page size="A4" style={S.page}>
        <PdfHeader settings={pdfSettings} title="Contrat de prestation" />
        <View style={S.body}>
          <Text style={S.pageTitle}>Contrat de prestation</Text>
          <Text style={S.pageTitleSub}>Activité Physique Adaptée</Text>
          <View style={S.divider} />

          {/* Parties */}
          <View style={S.row}>
            <View style={{ flex: 1 }}>
              <Text style={S.sectionTitle}>Prestataire :</Text>
              <View style={S.box}>
                <Text><B>Nom, prénom : </B>{data.praticien.nom}</Text>
                <Text><B>Adresse : </B>{data.praticien.adresse}</Text>
                <Text><B>SIRET : </B>{data.praticien.siret}</Text>
                <Text><B>Téléphone : </B>{data.praticien.telephone}</Text>
                <Text><B>Email : </B>{data.praticien.email}</Text>
              </View>
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={S.sectionTitle}>Participant :</Text>
              <View style={S.box}>
                <Text><B>Nom, prénom : </B>{data.patient.nomPrenom}</Text>
                <Text><B>Adresse : </B>{data.patient.adresse}</Text>
                <Text><B>Téléphone : </B>{data.patient.telephone || dots}</Text>
                <Text><B>Email : </B>{data.patient.email || dots}</Text>
                <Text><B>Droit à l'image : </B>{data.droitImage || dots}</Text>
              </View>
            </View>
          </View>

          <View style={S.articleTitle}><Text>Article 1 – Objet</Text></View>
          <Text style={S.articleBody}>
            Le présent contrat a pour objet l'organisation et l'encadrement de séances d'Activité Physique Adaptée (APA) réalisées par le Prestataire au bénéfice du Participant.
          </Text>

          <View style={S.articleTitle}><Text>Article 2 – Durée et période d'essai</Text></View>
          <Text style={S.articleBody}>
            Le contrat débute le {data.contrat.dateDebut}.{'\n\n'}
            Une période d'essai de deux séances est prévue afin de permettre à chaque partie de vérifier si l'accompagnement correspond aux attentes.{'\n\n'}
            À l'issue de cette période, le contrat se poursuit pour une durée indéterminée par tacite reconduction, sauf résiliation par l'une ou l'autre des parties avec un préavis d'un mois.
          </Text>

          <View style={S.articleTitle}><Text>Article 3 – Organisation des séances</Text></View>
          <Text style={S.articleBody}>
            Durée : {data.contrat.duree}{'\n'}
            Fréquence : {data.contrat.frequence}{'\n'}
            Lieu : {data.contrat.lieu}{'\n\n'}
            Les séances sont organisées selon les modalités convenues entre le Prestataire et le Participant. Toute modification exceptionnelle pourra être convenue d'un commun accord.
          </Text>

          <View style={S.articleTitle}><Text>Article 4 – Rémunération et règlement</Text></View>
          <Text style={S.articleBody}>
            Tarif horaire : {data.tarif} € (ce tarif est susceptible d'être révisé par le Prestataire, avec un préavis de 30 jours).{'\n\n'}
            Frais kilométriques : lorsque les séances nécessitent un déplacement au domicile du Participant, des frais kilométriques pourront être facturés en sus sur la base de {data.fraisKm} €/km.{'\n\n'}
            Le règlement s'effectue à la fin de chaque mois, sur présentation d'une facture remise par le Prestataire.
          </Text>
        </View>
        <PdfFooter settings={pdfSettings} />
      </Page>

      {/* ── Page 2 ── */}
      <Page size="A4" style={S.page}>
        <PdfHeader settings={pdfSettings} title="Contrat de prestation" />
        <View style={S.body}>
          <View style={S.articleTitle}><Text>Article 5 – Annulation</Text></View>
          <Text style={S.articleBody}>
            - Toute séance annulée par le Participant plus de 24 heures avant l'horaire prévu n'est pas facturée.{'\n'}
            - Toute séance annulée par le Participant moins de 24 heures avant l'horaire prévu reste due.{'\n'}
            - Toute séance annulée par le Prestataire sera reportée ou, à défaut, non facturée.
          </Text>

          <View style={S.articleTitle}><Text>Article 6 – Assurance et responsabilité</Text></View>
          <Text style={S.articleBody}>
            Le Prestataire déclare être couvert par une assurance responsabilité civile professionnelle. Le Participant déclare être couvert pour tout dommage dont il pourrait être responsable pendant la séance.
          </Text>

          <View style={S.articleTitle}><Text>Article 7 – Engagements</Text></View>
          <Text style={S.articleBody}>
            Le Prestataire s'engage à assurer des séances adaptées, sécurisées et respectueuses du niveau et des besoins du Participant.{'\n\n'}
            Le Participant s'engage à informer le Prestataire de tout problème de santé, contre-indication médicale ou changement de situation pouvant influencer la pratique de l'activité.
          </Text>

          <View style={S.articleTitle}><Text>Article 8 – Données personnelles et droit à l'image</Text></View>
          <Text style={S.articleBody}>
            Le Prestataire peut être amené à collecter certaines informations personnelles et/ou médicales nécessaires à l'organisation et au bon déroulement des séances. Ces données sont strictement confidentielles et traitées conformément à la réglementation en vigueur (RGPD).{'\n\n'}
            Des photographies ou vidéos peuvent être réalisées à des fins pédagogiques. Aucune image du Participant ne pourra être utilisée sans son accord écrit préalable. Le Participant peut refuser ou retirer son accord à tout moment (voir page 1).
          </Text>

          {/* Condition particulière */}
          <View style={S.conditionBox}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 4 }}>Condition particulière :</Text>
            <Text style={{ fontSize: 10, lineHeight: 1.65 }}>
              {data.conditionParticuliere ||
                `${dots}${dots}${dots}\n${dots}${dots}${dots}\n${dots}${dots}${dots}`}
            </Text>
          </View>

          {/* Fait à */}
          <Text style={{ fontSize: 11, marginBottom: 22 }}>
            <B>Fait à </B>{data.villeSignature}, <B>le </B>{data.dateSignature}
          </Text>

          {/* Signatures */}
          <View style={S.signRow}>
            {[
              { titre: 'Le Participant' },
              { titre: 'Le Prestataire' },
            ].map(({ titre }, i) => (
              <View key={titre} style={[S.signBox, i === 1 ? { marginLeft: 16 } : {}]}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 11, marginBottom: 5 }}>{titre}</Text>
                <Text style={{ fontSize: 9, color: '#555555', textAlign: 'center' }}>
                  {'(Date et signature précédée de la mention\n« lu et approuvé »)'}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <PdfFooter settings={pdfSettings} />
      </Page>
    </Document>
  );
}
