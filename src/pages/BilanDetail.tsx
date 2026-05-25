import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import PageWrapper from '../components/layout/PageWrapper';
import RadarChart from '../components/charts/RadarChart';
import ComparisonTable from '../components/charts/ComparisonTable';
import PrintableReport from '../components/export/PrintableReport';
import ExportButton from '../components/export/ExportButton';
import { calculerNotesAuto } from '../components/export/FicheBilanPDF';
import { exportFicheBilanPDF } from '../utils/exportPDF';
import { ArrowLeft, Calendar, MessageSquare, StickyNote, Target, AlertTriangle, FileText } from 'lucide-react';

function loadSettings() {
  try { return { prenom: '', nom: '', email: '', telephone: '', societe: '', logoPraticien: '', ...JSON.parse(localStorage.getItem('settings_praticien') || '{}') }; }
  catch { return { prenom: '', nom: '', email: '', telephone: '', societe: '', logoPraticien: '' }; }
}

export default function BilanDetail() {
  const { id, bilanId } = useParams<{ id: string; bilanId: string }>();
  const { participants } = useParticipants();
  const [exporting, setExporting] = useState(false);

  const participant = participants.find(p => p.id === id);
  const bilan = participant?.bilans.find(b => b.id === bilanId);

  if (!participant || !bilan) return (
    <PageWrapper>
      <div className="text-center py-20 text-gray-400">Bilan introuvable</div>
    </PageWrapper>
  );

  const sorted = [...participant.bilans].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const bilanIndex = sorted.findIndex(b => b.id === bilanId);
  const previous = bilanIndex > 0 ? sorted[bilanIndex - 1] : null;
  const initial = sorted[0] ?? null;

  return (
    <PageWrapper>
      <PrintableReport participant={participant} bilan={bilan} initial={initial !== bilan ? initial : null} />

      <Link to={`/participant/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
        <ArrowLeft size={15} />
        Retour au profil
      </Link>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-dark text-2xl">
            {bilan.type === 'initial' ? 'Bilan initial' : `Bilan T${bilan.trimestre}`}
          </h1>
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <Calendar size={14} />
            {new Date(bilan.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            <span>·</span>
            <span>{participant.prenom} {participant.nom}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setExporting(true);
              try {
                await exportFicheBilanPDF(
                  { bilan, participant, notes: bilan.notesBilan ?? calculerNotesAuto(bilan), settings: loadSettings() },
                  `FicheBilan_${participant.nom}_${participant.prenom}_${bilan.date}_MouvAPA.pdf`
                );
              } finally { setExporting(false); }
            }}
            disabled={exporting}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-60"
          >
            <FileText size={15} />
            {exporting ? 'Génération…' : 'Fiche bilan PDF'}
          </button>
          <ExportButton participant={participant} bilan={bilan} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-heading font-semibold text-dark mb-3">Profil radar</h2>
          <RadarChart initial={initial !== bilan ? initial : null} current={bilan} />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-heading font-semibold text-dark mb-3">Résultats comparatifs</h2>
          <ComparisonTable current={bilan} previous={previous} />
        </div>
      </div>

      {/* Notes pro */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {bilan.notesProfessionnelles && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-3 text-primary">
              <StickyNote size={16} />
              <h3 className="font-semibold text-sm">Notes professionnelles</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{bilan.notesProfessionnelles}</p>
          </div>
        )}
        {bilan.objectifsSuivants && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-3 text-success">
              <Target size={16} />
              <h3 className="font-semibold text-sm">Objectifs suivants</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{bilan.objectifsSuivants}</p>
          </div>
        )}
        {bilan.pointsVigilance && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-3 text-warning">
              <AlertTriangle size={16} />
              <h3 className="font-semibold text-sm">Points de vigilance</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{bilan.pointsVigilance}</p>
          </div>
        )}
      </div>

      {/* Message client */}
      {bilan.messageClient && (
        <div className="bg-gradient-to-br from-secondary/15 to-secondary/5 rounded-2xl border border-secondary/20 p-5">
          <div className="flex items-center gap-2 mb-3 text-secondary">
            <MessageSquare size={16} />
            <h3 className="font-semibold text-sm">Message pour le patient</h3>
          </div>
          <p className="text-dark text-sm leading-relaxed">{bilan.messageClient}</p>
        </div>
      )}

    </PageWrapper>
  );
}
