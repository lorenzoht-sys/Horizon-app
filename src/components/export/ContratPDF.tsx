export interface ContratPDFData {
  pierre: {
    nom: string;
    adresse: string;
    siret: string;
    telephone: string;
    email: string;
  };
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

// ── Composants internes ───────────────────────────────────────────────────────

function Article({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5 }}>{titre}</div>
      <div style={{ fontSize: 12, lineHeight: 1.65, textAlign: 'justify' as const }}>{children}</div>
    </div>
  );
}

function FooterPDF({ pierre, page }: { pierre: ContratPDFData['pierre']; page: string }) {
  return (
    <div style={{
      position: 'absolute' as const,
      bottom: 24, left: 60, right: 60,
      borderTop: '2px dashed #ccc',
      paddingTop: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 900 }}>
          {pierre.nom.split(' ').reverse().join(' ')}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1A5F9E', marginTop: 2 }}>Enseignant APA</div>
        <div style={{ fontSize: 11, color: '#555' }}>
          <strong>A</strong>ctivité&nbsp;<strong>P</strong>hysique&nbsp;<strong>A</strong>daptée
        </div>
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.8, color: '#333', textAlign: 'center' as const }}>
        <div>📞 {pierre.telephone}</div>
        <div>✉️ {pierre.email}</div>
        <div>📍 Nantes et sa périphérie</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6 }}>
        <img
          src="/logo.png"
          style={{ width: 52, height: 52, borderRadius: '50%', background: '#1A5F9E', objectFit: 'contain' as const, padding: 3 }}
          alt="Mouv'APA"
        />
        <div style={{ fontSize: 10, color: '#888' }}>{page}</div>
      </div>
    </div>
  );
}

// ── Page 1 ────────────────────────────────────────────────────────────────────

function ContratPDFPage1({ data }: { data: ContratPDFData }) {
  const PAGE: React.CSSProperties = {
    width: 794, height: 1123,
    padding: '56px 60px 90px',
    fontFamily: 'Arial, sans-serif',
    fontSize: 13, color: '#000',
    background: 'white',
    lineHeight: 1.5,
    position: 'relative' as const,
    boxSizing: 'border-box' as const,
  };
  const BOX: React.CSSProperties = {
    border: '1.5px solid #000',
    padding: '11px 13px',
    fontSize: 12, lineHeight: 1.7,
  };

  return (
    <div style={PAGE}>
      {/* Titre */}
      <div style={{ textAlign: 'center' as const, marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.25, margin: 0 }}>
          Contrat de prestation<br />Activité Physique Adaptée
        </h1>
        <hr style={{ border: 'none', borderTop: '2px solid #000', marginTop: 18 }} />
      </div>

      {/* Parties */}
      <div style={{ display: 'flex', gap: 36, marginBottom: 28 }}>
        <div style={{ flex: 1 }}>
          <div style={{ textAlign: 'center' as const, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Prestataire :</div>
          <div style={BOX}>
            <strong>Nom, prénom :</strong> {data.pierre.nom}<br />
            <strong>Adresse :</strong> {data.pierre.adresse}<br />
            <strong>SIRET :</strong> {data.pierre.siret}<br />
            <strong>Téléphone :</strong> {data.pierre.telephone}<br />
            <strong>Email :</strong> {data.pierre.email}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ textAlign: 'center' as const, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Participant :</div>
          <div style={BOX}>
            <strong>Nom, prénom :</strong> {data.patient.nomPrenom}<br />
            <strong>Adresse :</strong> {data.patient.adresse}<br />
            <strong>Téléphone :</strong> {data.patient.telephone || '........................................'}<br />
            <strong>Email :</strong> {data.patient.email || '........................................'}<br />
            <strong>Droit à l'image :</strong> {data.droitImage || '........................................'}
          </div>
        </div>
      </div>

      <Article titre="Article 1 – Objet">
        Le présent contrat a pour objet l'organisation et l'encadrement de séances d'Activité
        Physique Adaptée (APA) réalisées par le Prestataire au bénéfice du <strong>Participant</strong>.
      </Article>

      <Article titre="Article 2 – Durée et période d'essai">
        Le contrat débute le <strong>{data.contrat.dateDebut}</strong>.<br /><br />
        Une période d'essai de deux séances est prévue afin de permettre à chaque partie
        de vérifier si l'accompagnement correspond aux attentes.<br /><br />
        À l'issue de cette période, le contrat se poursuit pour une durée indéterminée par
        tacite reconduction, sauf résiliation par l'une ou l'autre des parties avec un préavis
        d'un mois.
      </Article>

      <Article titre="Article 3 – Organisation des séances">
        Durée : <strong>{data.contrat.duree}</strong><br />
        Fréquence : <strong>{data.contrat.frequence}</strong><br />
        Lieu : <strong>{data.contrat.lieu}</strong><br /><br />
        Les séances sont organisées selon les modalités convenues entre le Prestataire et le{' '}
        <strong>Participant</strong>. Toute modification exceptionnelle pourra être convenue d'un
        commun accord.
      </Article>

      <Article titre="Article 4 – Rémunération et règlement">
        Tarif horaire : <strong>{data.tarif} €</strong> (ce tarif est susceptible d'être révisé par le
        Prestataire, avec un préavis de 30 jours).<br /><br />
        Frais kilométriques : lorsque les séances nécessitent un déplacement au domicile du{' '}
        <strong>Participant</strong>, des frais kilométriques pourront être facturés en sus sur la base de{' '}
        <strong>{data.fraisKm} €/km</strong>.<br /><br />
        Le règlement s'effectue à la fin de chaque mois, sur présentation d'une facture remise par
        le Prestataire.
      </Article>

      <FooterPDF pierre={data.pierre} page="1/2" />
    </div>
  );
}

// ── Page 2 ────────────────────────────────────────────────────────────────────

function ContratPDFPage2({ data }: { data: ContratPDFData }) {
  const PAGE: React.CSSProperties = {
    width: 794, height: 1123,
    padding: '56px 60px 90px',
    fontFamily: 'Arial, sans-serif',
    fontSize: 13, color: '#000',
    background: 'white',
    lineHeight: 1.5,
    position: 'relative' as const,
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={PAGE}>
      <Article titre="Article 5 – Annulation">
        <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
          <li>Toute séance annulée par le <strong>Participant</strong> plus de 24 heures avant
            l'horaire prévu n'est pas facturée.</li>
          <li>Toute séance annulée par le <strong>Participant</strong> moins de 24 heures avant
            l'horaire prévu reste due.</li>
          <li>Toute séance annulée par le Prestataire sera reportée ou, à défaut, non facturée.</li>
        </ul>
      </Article>

      <Article titre="Article 6 – Assurance et responsabilité">
        Le Prestataire déclare être couvert par une assurance responsabilité civile professionnelle.
        Le <strong>Participant</strong> déclare être couvert pour tout dommage dont il pourrait être
        responsable pendant la séance.
      </Article>

      <Article titre="Article 7 – Engagements">
        Le Prestataire s'engage à assurer des séances adaptées, sécurisées et respectueuses du
        niveau et des besoins du <strong>Participant</strong>.<br /><br />
        Le <strong>Participant</strong> s'engage à informer le Prestataire de tout problème de santé,
        contre-indication médicale ou changement de situation pouvant influencer la pratique
        de l'activité.
      </Article>

      <Article titre="Article 8 – Données personnelles et droit à l'image">
        Le Prestataire peut être amené à collecter certaines informations personnelles et/ou médicales
        nécessaires à l'organisation et au bon déroulement des séances. Ces données sont strictement
        confidentielles et traitées conformément à la réglementation en vigueur (RGPD).<br /><br />
        Des photographies ou vidéos peuvent être réalisées à des fins pédagogiques. Aucune image du
        Participant ne pourra être utilisée sans son accord écrit préalable. Le Participant peut
        refuser ou retirer son accord à tout moment (voir page 1).
      </Article>

      {/* Condition particulière */}
      <div style={{
        border: '1.5px solid #000',
        padding: '11px 13px',
        marginTop: 16, marginBottom: 24,
        minHeight: 72,
        fontSize: 12, lineHeight: 1.65,
      }}>
        <strong>Condition particulière :</strong><br />
        {data.conditionParticuliere
          ? data.conditionParticuliere
          : (
            <>
              {'..........................................................................................................'}<br />
              {'..........................................................................................................'}<br />
              {'..........................................................................................................'}
            </>
          )
        }
      </div>

      {/* Fait à */}
      <div style={{ marginBottom: 28, fontSize: 13 }}>
        <strong>Fait à</strong> {data.villeSignature},{' '}
        <strong>le</strong> {data.dateSignature}
      </div>

      {/* Signatures */}
      <div style={{ display: 'flex', gap: 36 }}>
        {[
          { titre: 'Le Participant', mention: '(Date et signature précédée de la mention\n« lu et approuvé »)' },
          { titre: 'Le Prestataire', mention: '(Date et signature précédée de la mention\n« lu et approuvé »)' },
        ].map(({ titre, mention }) => (
          <div key={titre} style={{
            flex: 1,
            border: '1.5px solid #000',
            padding: '12px',
            minHeight: 110,
            fontSize: 12,
            textAlign: 'center' as const,
          }}>
            <strong>{titre}</strong><br />
            <span style={{ fontSize: 11, color: '#555', whiteSpace: 'pre-line' as const }}>{mention}</span>
          </div>
        ))}
      </div>

      <FooterPDF pierre={data.pierre} page="2/2" />
    </div>
  );
}

// ── Composant conteneur (rendu caché dans le DOM) ─────────────────────────────

interface Props {
  data: ContratPDFData | null;
}

export default function ContratPDF({ data }: Props) {
  if (!data) return null;
  return (
    <div style={{ position: 'absolute', top: -9999, left: -9999, visibility: 'hidden', zIndex: -1 }}>
      <div id="contrat-pdf-page-1"><ContratPDFPage1 data={data} /></div>
      <div id="contrat-pdf-page-2"><ContratPDFPage2 data={data} /></div>
    </div>
  );
}
