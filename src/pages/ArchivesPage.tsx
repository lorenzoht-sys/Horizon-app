import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArchiveRestore, Search, Archive } from 'lucide-react';
import { toast } from 'sonner';
import PageWrapper from '../components/layout/PageWrapper';
import ParticipantCard from '../components/participant/ParticipantCard';
import { FadeInCard } from '../components/ui/FadeInCard';
import { useParticipants } from '../hooks/useParticipants';
import { useStructures } from '../hooks/useStructures';
import { filtrerParNom } from '../lib/archivage';

// Page dédiée aux anciens bénéficiaires (participants.archive = true). Elle n'est pas un
// filtre du tableau de bord : c'est une vraie page, avec son propre compteur. Archiver ne
// supprime rien — la fiche reste ouverte depuis la carte (bilans, tests, séances,
// programmes, historique, facturation) ; « Désarchiver / Réactiver » remet la personne
// parmi les bénéficiaires actifs.

function formaterDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function ArchivesPage() {
  const { participantsActifs, participantsArchives, loading, archiverParticipant } = useParticipants();
  const { structures } = useStructures();
  const [recherche, setRecherche] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);

  const liste = filtrerParNom(participantsArchives, recherche);

  async function reactiver(id: string, nomComplet: string) {
    if (enCours) return;
    setEnCours(id);
    try {
      await archiverParticipant(id, false);
      toast.success(`${nomComplet} est de nouveau parmi les bénéficiaires actifs.`);
    } catch (err) {
      console.error('Erreur désarchivage:', err);
      toast.error('Impossible de réactiver ce bénéficiaire. Réessayez.');
    } finally {
      setEnCours(null);
    }
  }

  return (
    <PageWrapper>
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4 transition-colors">
        <ArrowLeft size={14} /> Tableau de bord
      </Link>

      <div className="mb-6">
        <h1 className="font-heading font-semibold m-0" style={{ fontSize: 24, color: 'var(--color-ink)', lineHeight: 1.2 }}>
          🗄️ Bénéficiaires archivés
        </h1>
        <p className="mt-1 m-0" style={{ fontSize: 14, color: 'var(--color-ink-2)' }} data-testid="compteur-archives">
          {participantsArchives.length} bénéficiaire{participantsArchives.length !== 1 ? 's' : ''} archivé{participantsArchives.length !== 1 ? 's' : ''}
          {' · '}
          <Link to="/" className="text-primary hover:underline" data-testid="lien-actifs">
            {participantsActifs.length} actif{participantsActifs.length !== 1 ? 's' : ''}
          </Link>
        </p>
        <p className="mt-1 text-xs text-gray-400 m-0">
          Anciens bénéficiaires : leur dossier est entièrement conservé (bilans, séances, programmes, historique, facturation).
        </p>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ink-3)' }} />
        <input
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          placeholder="Rechercher un bénéficiaire archivé..."
          aria-label="Rechercher un bénéficiaire archivé"
          className="w-full focus:outline-none"
          style={{
            paddingLeft: 40, paddingRight: 16, paddingTop: 11, paddingBottom: 11,
            background: 'var(--color-bg)', border: '1.5px solid #E2EEEE', borderRadius: 10,
            fontSize: 14, fontFamily: 'var(--font-sans)', color: 'var(--color-ink)',
          }}
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Chargement…</p>
      ) : liste.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Archive size={56} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium text-lg">
            {recherche ? 'Aucun bénéficiaire archivé trouvé' : 'Aucun bénéficiaire archivé'}
          </p>
          <p className="text-sm mt-1">
            {recherche
              ? 'Essayez un autre nom'
              : 'Quand un accompagnement se termine, archivez le bénéficiaire depuis sa fiche : il apparaîtra ici.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {liste.map((p, i) => {
            const nomComplet = `${p.prenom} ${p.nom}`;
            const date = formaterDate(p.dateArchivage);
            return (
              <FadeInCard key={p.id} delay={0.05 + i * 0.03}>
                <div className="flex flex-col gap-2">
                  <ParticipantCard
                    participant={p}
                    structureNom={p.structureId ? structures.find(s => s.id === p.structureId)?.nom : undefined}
                  />
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="text-xs text-gray-400 truncate">{date ? `Archivé le ${date}` : 'Archivé'}</span>
                    <button
                      type="button"
                      onClick={() => reactiver(p.id, nomComplet)}
                      disabled={enCours === p.id}
                      aria-label={`Désarchiver / Réactiver ${nomComplet}`}
                      className="flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      <ArchiveRestore size={13} />
                      {enCours === p.id ? 'Réactivation…' : 'Désarchiver / Réactiver'}
                    </button>
                  </div>
                </div>
              </FadeInCard>
            );
          })}
        </div>
      )}
    </PageWrapper>
  );
}
