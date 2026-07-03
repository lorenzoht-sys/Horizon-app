import LegalPageLayout, { Section, Placeholder } from '../components/legal/LegalPageLayout';

// Page publique — accessible sans authentification (praticien ou bénéficiaire).
// Contenu juridique en placeholder : à faire relire/compléter par un avocat
// ou un DPO avant mise en ligne (traitement de données de santé).
export default function PolitiqueConfidentialite() {
  return (
    <LegalPageLayout title="Politique de confidentialité">
      <Section title="1. Responsable du traitement">
        <p>
          Le traitement des données réalisé via l'application Horizon est placé sous la
          responsabilité de :
        </p>
        <p>
          <Placeholder>[À COMPLÉTER — raison sociale / nom de l'exploitant]</Placeholder>
          <br />
          <Placeholder>[À COMPLÉTER — adresse]</Placeholder>
          <br />
          Contact : <Placeholder>[À COMPLÉTER — email de contact RGPD]</Placeholder>
        </p>
      </Section>

      <Section title="2. Données collectées">
        <p>
          Horizon traite deux grandes catégories de données, qu'il convient de distinguer
          clairement :
        </p>

        <p style={{ fontWeight: 700, marginTop: 16, marginBottom: 6 }}>
          a) Données de l'utilisateur professionnel (enseignant APA, salarié de structure)
        </p>
        <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
          <li>Identité : nom, prénom, email professionnel</li>
          <li>Informations professionnelles : titre, SIRET, numéro SAP, structure de rattachement</li>
          <li>Données de connexion et d'utilisation du service</li>
        </ul>

        <p style={{ fontWeight: 700, marginBottom: 6 }}>
          b) Données de santé des bénéficiaires (personnes suivies en APA)
        </p>
        <ul style={{ paddingLeft: 20 }}>
          <li>Identité et coordonnées du bénéficiaire</li>
          <li>
            Bilans fonctionnels et données médicales associées (tests, mesures, observations
            cliniques, contre-indications, comptes-rendus destinés au médecin prescripteur)
          </li>
          <li>Programme d'exercices et compte-rendu de séances</li>
        </ul>
        <p style={{ marginTop: 8 }}>
          Ces données de santé constituent une <strong>catégorie particulière de données</strong>{' '}
          au sens de l'article 9 du RGPD et font l'objet d'un niveau de protection renforcé.
        </p>
      </Section>

      <Section title="3. Base légale de chaque traitement">
        <ul style={{ paddingLeft: 20 }}>
          <li>
            Gestion du compte professionnel : exécution du contrat liant l'utilisateur à
            l'éditeur d'Horizon
          </li>
          <li>
            Suivi des bilans et données de santé des bénéficiaires :{' '}
            <Placeholder>
              [À COMPLÉTER — base légale précise : intérêt public lié à la santé, mission de
              soin/accompagnement confiée par la structure, ou consentement explicite du
              bénéficiaire — art. 9.2 RGPD]
            </Placeholder>
          </li>
          <li>Sécurité et prévention de la fraude : intérêt légitime</li>
        </ul>
      </Section>

      <Section title="4. Durées de conservation">
        <ul style={{ paddingLeft: 20 }}>
          <li>
            Compte professionnel : <Placeholder>[À COMPLÉTER]</Placeholder> après la dernière
            activité / résiliation
          </li>
          <li>
            Données de santé des bénéficiaires :{' '}
            <Placeholder>[À COMPLÉTER — durée légale applicable aux données de santé]</Placeholder>
          </li>
          <li>
            Journaux techniques (logs, erreurs) : <Placeholder>[À COMPLÉTER]</Placeholder>
          </li>
        </ul>
      </Section>

      <Section title="5. Sous-traitants et hébergeurs">
        <p>Les prestataires suivants interviennent dans le traitement des données :</p>
        <ul style={{ paddingLeft: 20 }}>
          <li>
            <strong>Supabase</strong> — base de données, authentification et stockage
            (hébergement des données, y compris de santé)
          </li>
          <li>
            <strong>Vercel</strong> — hébergement de l'application et des fonctions serveur
          </li>
          <li>
            <strong>Sentry</strong> — suivi technique des erreurs applicatives (données
            techniques uniquement : les données de santé et identifiants de session ne sont pas
            transmis)
          </li>
          <li>
            <Placeholder>
              [À COMPLÉTER — autres sous-traitants éventuels : emailing, SMS, IA, etc.]
            </Placeholder>
          </li>
        </ul>
        <p style={{ marginTop: 8 }}>
          Localisation des données et garanties de transfert (le cas échéant hors UE) :{' '}
          <Placeholder>[À COMPLÉTER]</Placeholder>
        </p>
      </Section>

      <Section id="rgpd" title="6. Vos droits (conformité RGPD)">
        <p>
          Conformément au RGPD, toute personne concernée (utilisateur professionnel ou
          bénéficiaire) dispose des droits suivants sur ses données :
        </p>
        <ul style={{ paddingLeft: 20 }}>
          <li>Droit d'accès</li>
          <li>Droit de rectification</li>
          <li>Droit à l'effacement</li>
          <li>Droit à la portabilité</li>
          <li>Droit d'opposition</li>
          <li>Droit à la limitation du traitement</li>
        </ul>
      </Section>

      <Section title="7. Contact — exercice des droits / DPO">
        <p>
          Pour exercer l'un de ces droits, ou pour toute question relative au traitement de vos
          données :
        </p>
        <p>
          Email : <Placeholder>[À COMPLÉTER]</Placeholder>
          <br />
          Délégué à la protection des données (DPO), le cas échéant :{' '}
          <Placeholder>[À COMPLÉTER]</Placeholder>
        </p>
        <p style={{ marginTop: 8 }}>
          Vous disposez également du droit d'introduire une réclamation auprès de la CNIL
          (www.cnil.fr).
        </p>
      </Section>

      <Section title="8. Cookies et traceurs">
        <p>
          Horizon n'utilise aucun cookie de mesure d'audience, de publicité ou de traçage
          marketing. Seuls des mécanismes strictement nécessaires au fonctionnement du service
          sont utilisés (stockage local du navigateur pour la session de connexion, les
          préférences et les brouillons en cours ; cache technique de l'application pour son
          fonctionnement hors-ligne). Conformément à la réglementation applicable, ces éléments
          strictement nécessaires ne requièrent pas de consentement préalable.
        </p>
      </Section>

      <Section id="securite" title="9. Sécurité des données">
        <p>
          Des mesures techniques et organisationnelles sont mises en œuvre pour protéger les
          données traitées : chiffrement des données en transit (HTTPS/TLS), authentification
          des utilisateurs, cloisonnement des données par praticien et par structure.
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>Précision sur l'hébergement des données de santé :</strong> Horizon est
          actuellement en phase bêta et n'est <strong>pas hébergé auprès d'un hébergeur certifié
          Hébergeur de Données de Santé (HDS)</strong> au sens de l'article L.1111-8 du code de
          la santé publique.{' '}
          <Placeholder>
            [À COMPLÉTER — trajectoire vers un hébergement certifié HDS, ou justification de la
            base légale actuelle en l'absence de certification]
          </Placeholder>
        </p>
      </Section>
    </LegalPageLayout>
  );
}
