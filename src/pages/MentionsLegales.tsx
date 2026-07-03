import LegalPageLayout, { Section, Placeholder } from '../components/legal/LegalPageLayout';

// Page publique — accessible sans authentification.
// Contenu juridique en placeholder : à compléter avant mise en ligne.
export default function MentionsLegales() {
  return (
    <LegalPageLayout title="Mentions légales">
      <Section title="Éditeur du site">
        <p>
          Raison sociale : <Placeholder>[À COMPLÉTER]</Placeholder>
          <br />
          Forme juridique : <Placeholder>[À COMPLÉTER]</Placeholder>
          <br />
          SIRET : <Placeholder>[À COMPLÉTER]</Placeholder>
          <br />
          Adresse du siège : <Placeholder>[À COMPLÉTER]</Placeholder>
          <br />
          Email de contact : <Placeholder>[À COMPLÉTER]</Placeholder>
        </p>
      </Section>

      <Section title="Directeur de la publication">
        <p>
          <Placeholder>[À COMPLÉTER — nom et qualité]</Placeholder>
        </p>
      </Section>

      <Section title="Hébergeur">
        <p>
          Application (Vercel) :
          <br />
          Vercel Inc. — 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis
          <br />
          <br />
          Base de données et authentification (Supabase) :
          <br />
          Supabase Inc. — <Placeholder>[À COMPLÉTER — adresse actuelle du prestataire]</Placeholder>
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Pour toute question relative au site ou à l'application : <Placeholder>[À COMPLÉTER]</Placeholder>
        </p>
      </Section>
    </LegalPageLayout>
  );
}
