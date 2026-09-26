import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import PageWrapper from '../components/layout/PageWrapper';
import CarteStructure from '../components/structures/CarteStructure';
import ModalCreationStructure from '../components/structures/ModalCreationStructure';
import { useStructures } from '../hooks/useStructures';
import { useParticipants } from '../hooks/useParticipants';
import { useAgenda } from '../hooks/useAgenda';

// Page dédiée aux structures (EHPAD, centres...), sur le modèle
// d'ArchivesPage.tsx : avant ce chantier, la liste n'existait qu'en tant
// qu'onglet de Dashboard.tsx (route « / », jamais fusionnée — l'accueil
// mobile est un tout autre composant, EcranAccueil). Cet onglet reste
// inchangé côté desktop ; cette page lui ajoute un accès direct, atteignable
// depuis le téléphone.

export default function StructuresPage() {
  const { structures, creerStructure } = useStructures();
  const { participants } = useParticipants();
  const { seances } = useAgenda();
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  return (
    <PageWrapper>
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4 transition-colors">
        <ArrowLeft size={14} /> Tableau de bord
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-semibold m-0" style={{ fontSize: 24, color: 'var(--color-ink)', lineHeight: 1.2 }}>
            🏢 Structures
          </h1>
          <p className="mt-1 m-0" style={{ fontSize: 14, color: 'var(--color-ink-2)' }}>
            {structures.length} structure{structures.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2.5 bg-primary rounded-xl hover:bg-dark transition-colors"
        >
          <Plus size={16} /> Créer une structure
        </button>
      </div>

      {structures.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Building2 size={56} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium text-lg">Aucune structure</p>
          <p className="text-sm mt-1">Créez une structure pour regrouper vos bénéficiaires d'EHPAD, centres...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {structures.map(s => {
            const patientsStr = participants.filter(p => p.structureId === s.id);
            const seancesStr = seances.filter(se => patientsStr.some(p => p.id === se.participantId) && se.statut === 'realisee');
            const derniere = seancesStr.sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
            return (
              <CarteStructure
                key={s.id}
                structure={s}
                nbPatients={patientsStr.filter(p => !p.archive).length}
                derniereSeance={derniere}
              />
            );
          })}
        </div>
      )}

      {showCreate && (
        <ModalCreationStructure
          onClose={() => setShowCreate(false)}
          onCreer={async (data) => {
            const s = await creerStructure(data);
            if (s) {
              toast.success(`Structure "${s.nom}" créée !`);
              navigate(`/structures/${s.id}`, { state: { structure: s } });
            } else {
              toast.error('Erreur : vérifiez que la table Supabase "structures" existe (voir console)');
            }
          }}
        />
      )}
    </PageWrapper>
  );
}
