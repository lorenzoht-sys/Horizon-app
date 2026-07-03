import LegalPageLayout, { Section, Placeholder } from '../components/legal/LegalPageLayout';

// Page publique — accessible sans authentification (route /cgu).
// BROUILLON JURIDIQUE : rédigé comme point de départ, à faire relire et
// compléter par un avocat spécialisé avant toute mise en ligne définitive
// (notamment les clauses de responsabilité et le statut « non-dispositif
// médical »).
export default function CGU() {
  return (
    <LegalPageLayout title="Conditions générales d'utilisation">
      <div
        style={{
          background: '#FEF2F2',
          border: '1px solid #FCA5A5',
          color: '#991B1B',
          borderRadius: 10,
          padding: '14px 18px',
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 28,
          lineHeight: 1.5,
        }}
      >
        [BROUILLON — à faire relire par un avocat spécialisé avant mise en ligne]
      </div>

      <Section title="1. Objet">
        <p>
          Les présentes conditions générales d'utilisation (ci-après les « CGU ») ont pour objet
          de définir les modalités et conditions dans lesquelles <Placeholder>[À COMPLÉTER — raison sociale de l'éditeur]</Placeholder>{' '}
          (ci-après « Horizon » ou « l'Éditeur ») met à disposition l'application Horizon
          (ci-après le « Service »), ainsi que les droits et obligations des parties dans ce
          cadre. Le Service est destiné aux enseignants en Activité Physique Adaptée (APA)
          exerçant à titre individuel (libéral) ou au sein d'une structure (EHPAD, centre,
          association), ainsi qu'aux bénéficiaires suivis via l'application.
        </p>
        <p style={{ marginTop: 8 }}>
          Toute utilisation du Service implique l'acceptation pleine et entière des présentes
          CGU par l'utilisateur.
        </p>
      </Section>

      <Section title="2. Définitions">
        <ul style={{ paddingLeft: 20 }}>
          <li>
            <strong>« Utilisateur professionnel »</strong> : enseignant APA disposant d'un compte
            sur l'application, qu'il exerce à titre individuel (« Utilisateur individuel ») ou en
            tant que personne rattachée à une structure (« Utilisateur de structure »).
          </li>
          <li>
            <strong>« Structure »</strong> : personne morale (EHPAD, centre de soins,
            association…) disposant d'un espace dédié sur le Service et à laquelle un ou
            plusieurs Utilisateurs professionnels peuvent être rattachés.
          </li>
          <li>
            <strong>« Bénéficiaire »</strong> : personne physique suivie en APA par un Utilisateur
            professionnel via le Service (également désigné « résident » en contexte EHPAD).
          </li>
          <li>
            <strong>« Compte »</strong> : espace personnel permettant à l'Utilisateur professionnel
            d'accéder au Service après authentification.
          </li>
          <li>
            <strong>« Contenus »</strong> : ensemble des données saisies ou générées via le
            Service (bilans, programmes, comptes-rendus, échanges avec l'assistant IA, etc.).
          </li>
        </ul>
      </Section>

      <Section title="3. Description du service">
        <p>Le Service permet notamment à l'Utilisateur professionnel de :</p>
        <ul style={{ paddingLeft: 20 }}>
          <li>gérer une liste de bénéficiaires et leurs informations de suivi ;</li>
          <li>réaliser et consigner des bilans fonctionnels APA ;</li>
          <li>construire et suivre des programmes d'exercices personnalisés ;</li>
          <li>générer des comptes-rendus de séances ;</li>
          <li>organiser un planning et des tournées de déplacement ;</li>
          <li>recourir à un assistant IA d'aide à la rédaction et à l'analyse ;</li>
          <li>
            donner accès à un espace bénéficiaire permettant au bénéficiaire (ou à son entourage,
            le cas échéant) de consulter certains éléments de son suivi.
          </li>
        </ul>
        <p style={{ marginTop: 8 }}>
          <strong>Statut bêta :</strong> le Service est actuellement proposé en{' '}
          <strong>version bêta et à titre gratuit</strong>. L'Éditeur se réserve la possibilité
          d'introduire ultérieurement une offre payante ou des paliers tarifaires selon les
          fonctionnalités et le volume d'utilisation. Toute évolution vers une offre payante fera
          l'objet d'une <strong>information préalable des Utilisateurs</strong>, avec un délai de
          préavis raisonnable, et ne s'appliquera pas rétroactivement sans accord. Pendant la
          phase bêta, le Service est fourni « en l'état », et peut faire l'objet d'évolutions,
          d'interruptions ou de modifications sans préavis, ainsi qu'il est précisé à l'article 8.
        </p>
      </Section>

      <Section title="4. Conditions d'accès et inscription">
        <p>
          L'accès professionnel au Service nécessite la création d'un Compte, soit à titre
          individuel (enseignant APA libéral), soit en tant qu'Utilisateur rattaché à une
          Structure disposant elle-même d'un espace dédié. L'inscription requiert la fourniture
          d'informations exactes et à jour (identité, coordonnées professionnelles,{' '}
          <Placeholder>[À COMPLÉTER — pièces justificatives ou qualifications requises, le cas échéant]</Placeholder>).
        </p>
        <p style={{ marginTop: 8 }}>
          L'accès Bénéficiaire à l'espace qui lui est dédié se fait via un code d'accès personnel
          remis par l'Utilisateur professionnel qui le suit, sans création de compte autonome par
          le Bénéficiaire.
        </p>
        <p style={{ marginTop: 8 }}>
          L'Éditeur se réserve le droit de refuser ou de suspendre une inscription en cas
          d'informations manifestement inexactes ou frauduleuses.
        </p>
      </Section>

      <Section title="5. Obligations de l'utilisateur">
        <p>L'Utilisateur professionnel s'engage à :</p>
        <ul style={{ paddingLeft: 20 }}>
          <li>utiliser le Service conformément à sa destination et à la réglementation applicable à sa profession ;</li>
          <li>garantir l'exactitude des informations qu'il renseigne ;</li>
          <li>préserver la confidentialité de ses identifiants de connexion et du code d'accès remis à chaque Bénéficiaire ;</li>
          <li>
            <strong>
              recueillir, préalablement à toute saisie, le consentement du Bénéficiaire (ou de son
              représentant légal, le cas échéant) au traitement de ses données via le Service
            </strong>
            , et informer celui-ci conformément à la Politique de confidentialité ;
          </li>
          <li>
            <strong>
              s'assurer de la licéité, de l'exactitude et de la pertinence des données qu'il
              saisit
            </strong>{' '}
            concernant chaque Bénéficiaire, l'Éditeur n'exerçant aucun contrôle sur le contenu
            renseigné par l'Utilisateur professionnel ;
          </li>
          <li>
            respecter le secret professionnel et, le cas échéant, les obligations propres à la
            Structure à laquelle il est rattaché.
          </li>
        </ul>
        <p style={{ marginTop: 8 }}>
          En cas d'usage au sein d'une Structure, cette dernière demeure responsable de
          l'organisation du recueil de consentement et de l'information de ses résidents ou
          bénéficiaires, selon ses propres procédures internes.
        </p>
      </Section>

      <Section title="6. Propriété intellectuelle">
        <p>
          L'application Horizon, sa marque, son logo, son interface, sa structure, ainsi que
          l'ensemble des éléments graphiques, textuels et logiciels qui la composent sont la
          propriété exclusive de l'Éditeur ou de ses concédants, et sont protégés par le droit de
          la propriété intellectuelle. <Placeholder>[À COMPLÉTER — étendue de la licence d'usage concédée à l'utilisateur, dépôts de marque le cas échéant]</Placeholder>
        </p>
        <p style={{ marginTop: 8 }}>
          Les Contenus saisis par l'Utilisateur professionnel (bilans, programmes, comptes-rendus)
          restent la propriété de celui-ci ou, le cas échéant, de la Structure, sous réserve du
          droit d'usage nécessaire à l'Éditeur pour fournir et faire fonctionner le Service.
        </p>
      </Section>

      <Section title="7. Responsabilité et limitations">
        <p>
          <strong>
            Horizon est un outil d'aide à la pratique et au suivi de l'Activité Physique Adaptée.
            Il ne constitue pas un dispositif médical et ne se substitue en aucun cas au jugement
            professionnel, à l'évaluation clinique ou aux décisions de l'enseignant APA, ni à
            l'avis d'un professionnel de santé.
          </strong>{' '}
          Les bilans, recommandations, programmes générés ou suggestions de l'assistant IA sont
          fournis à titre d'aide et doivent systématiquement être vérifiés, adaptés et validés par
          l'Utilisateur professionnel avant toute application au Bénéficiaire.
        </p>
        <p style={{ marginTop: 8 }}>
          L'Éditeur ne saurait être tenu responsable des conséquences d'une décision prise par
          l'Utilisateur professionnel sur la seule base des éléments produits par le Service, ni
          des dommages résultant d'une utilisation non conforme à sa destination.
        </p>
        <p style={{ marginTop: 8 }}>
          <Placeholder>
            [À COMPLÉTER — plafond et exclusions de responsabilité, cas de force majeure, régime
            spécifique applicable en phase bêta]
          </Placeholder>
        </p>
      </Section>

      <Section title="8. Disponibilité et maintenance">
        <p>
          L'Éditeur s'efforce d'assurer un accès continu au Service, sans garantie de
          disponibilité absolue. Le Service peut faire l'objet d'interruptions programmées (mises
          à jour, maintenance) ou non programmées (incidents techniques, cas de force majeure),
          notamment pendant la phase bêta au cours de laquelle des évolutions fréquentes peuvent
          survenir.
        </p>
        <p style={{ marginTop: 8 }}>
          Dans la mesure du possible, les interruptions programmées significatives seront
          annoncées préalablement aux Utilisateurs. <Placeholder>[À COMPLÉTER — niveau de service (SLA) le cas échéant, canal d'information des incidents]</Placeholder>
        </p>
      </Section>

      <Section title="9. Résiliation / suspension">
        <p>
          L'Utilisateur professionnel peut, à tout moment, cesser d'utiliser le Service et
          demander la clôture de son Compte <Placeholder>[À COMPLÉTER — modalités de la demande]</Placeholder>.
        </p>
        <p style={{ marginTop: 8 }}>
          L'Éditeur peut suspendre ou résilier l'accès d'un Utilisateur, après information
          préalable sauf urgence, en cas de manquement aux présentes CGU, d'usage frauduleux ou
          de non-respect de la réglementation applicable aux données de santé.
        </p>
        <p style={{ marginTop: 8 }}>
          <Placeholder>
            [À COMPLÉTER — sort des données du Compte et des Bénéficiaires associés à la clôture,
            délai de récupération/export avant suppression]
          </Placeholder>
        </p>
      </Section>

      <Section title="10. Données personnelles">
        <p>
          Le Service traite des données à caractère personnel, y compris des données de santé
          relatives aux Bénéficiaires. Les modalités de collecte, de traitement, de conservation
          et les droits des personnes concernées sont détaillés dans la{' '}
          <a href="/politique-confidentialite" style={{ color: '#0d9488', fontWeight: 600 }}>
            Politique de confidentialité
          </a>
          , qui fait partie intégrante des présentes CGU.
        </p>
      </Section>

      <Section title="11. Droit applicable et juridiction compétente">
        <p>
          Les présentes CGU sont soumises au droit français. En cas de litige relatif à leur
          interprétation ou à leur exécution, et à défaut de résolution amiable, compétence est
          attribuée <Placeholder>[À COMPLÉTER — juridiction compétente : tribunaux du ressort du siège de l'Éditeur ou autre]</Placeholder>.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Pour toute question relative aux présentes CGU : <Placeholder>[À COMPLÉTER — email de contact]</Placeholder>
        </p>
      </Section>
    </LegalPageLayout>
  );
}
