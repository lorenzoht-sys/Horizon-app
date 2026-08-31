import { useState } from 'react';
import { chargerSettingsPraticien } from '../lib/settingsPraticien';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useParticipants } from '../hooks/useParticipants';
import PageWrapper from '../components/layout/PageWrapper';
import RadarChart from '../components/charts/RadarChart';
import ComparisonTable from '../components/charts/ComparisonTable';
import { calculerNotesAuto } from '../components/export/FicheBilanPDF';
import { exportFicheBilanPDF, exportFicheBilanBeneficiairePDF } from '../utils/exportPDF';
import { ArrowLeft, Calendar, MessageSquare, StickyNote, Target, AlertTriangle, FileText, TrendingUp, Share2 } from 'lucide-react';
type CleResultatPartageable = 'equilibre' | 'force' | 'handGrip' | 'mobilite' | 'endurance';
const PARTAGE_ITEMS: { key: CleResultatPartageable; label: string }[] = [
  { key: 'equilibre', label: 'Équilibre' },
  { key: 'force', label: 'Force jambes' },
  { key: 'handGrip', label: 'Force mains' },
  { key: 'mobilite', label: 'Mobilité' },
  { key: 'endurance', label: 'Endurance' },
];


export default function BilanDetail() {
  const { id, bilanId } = useParams<{ id: string; bilanId: string }>();
  const { participants, updateBilan } = useParticipants();
  const [exporting, setExporting] = useState(false);
  const [exportingBeneficiaire, setExportingBeneficiaire] = useState(false);
  const navigate = useNavigate();

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
        <div className="flex gap-2 flex-wrap">
          {participant.bilans.length >= 2 && (
            <button
              onClick={() => navigate(`/participant/${id}/comparaison`)}
              className="flex items-center gap-2 bg-secondary/20 text-secondary px-4 py-2 rounded-xl text-sm font-semibold hover:bg-secondary/30 transition-colors border border-secondary/30"
            >
              <TrendingUp size={15} />
              Rapport d'évolution
            </button>
          )}
          <button
            onClick={async () => {
              setExporting(true);
              try {
                await exportFicheBilanPDF(
                  { bilan, participant, notes: bilan.notesBilan ?? calculerNotesAuto(bilan), settings: chargerSettingsPraticien() },
                  `FicheBilan_${participant.nom}_${participant.prenom}_${bilan.date}.pdf`
                );
              } finally { setExporting(false); }
            }}
            disabled={exporting}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-60"
          >
            <FileText size={15} />
            {exporting ? 'Génération…' : 'Fiche bilan PDF'}
          </button>
          <button
            onClick={async () => {
              setExportingBeneficiaire(true);
              try {
                await exportFicheBilanBeneficiairePDF(
                  { bilan, participant, notes: bilan.notesBilan ?? calculerNotesAuto(bilan), settings: chargerSettingsPraticien() },
                  `FicheBilan_Beneficiaire_${participant.nom}_${participant.prenom}_${bilan.date}.pdf`
                );
              } finally { setExportingBeneficiaire(false); }
            }}
            disabled={exportingBeneficiaire}
            title="Uniquement les résultats cochés ci-dessous comme partagés, avec un vocabulaire adouci"
            className="flex items-center gap-2 bg-secondary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <Share2 size={15} />
            {exportingBeneficiaire ? 'Génération…' : 'Fiche bilan bénéficiaire'}
          </button>
        </div>
      </div>

      {/* Partage avec le bénéficiaire — modifiable après coup */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center gap-2 mb-1 text-secondary">
          <Share2 size={16} />
          <h3 className="font-semibold text-sm text-dark">Partager avec le bénéficiaire</h3>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Décoché par défaut. Contrôle ce qui apparaît dans l'espace bénéficiaire et dans la
          Fiche bilan bénéficiaire — n'affecte pas ce que vous voyez ici.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PARTAGE_ITEMS
            .filter(item => (bilan.notesBilan ?? calculerNotesAuto(bilan))[item.key] !== undefined)
            .map(item => (
              <label key={item.key}
                className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 cursor-pointer">
                <span className="text-sm font-medium text-gray-600">{item.label}</span>
                <input
                  type="checkbox"
                  checked={bilan.visibleBeneficiaire?.[item.key] === true}
                  onChange={e => updateBilan(participant.id, bilan.id, {
                    visibleBeneficiaire: { ...bilan.visibleBeneficiaire, [item.key]: e.target.checked },
                  })}
                  className="w-4 h-4 accent-secondary"
                />
              </label>
            ))}
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
            <h3 className="font-semibold text-sm">Message pour le bénéficiaire</h3>
          </div>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({children}: any) => <p style={{fontSize:'14px', lineHeight:'1.7', color:'#111827', marginBottom:'8px'}}>{children}</p>,
              strong: ({children}: any) => <strong style={{fontWeight:'600', color:'#111827'}}>{children}</strong>,
              ul: ({children}: any) => <ul style={{paddingLeft:'18px', marginBottom:'8px'}}>{children}</ul>,
              li: ({children}: any) => <li style={{fontSize:'14px', lineHeight:'1.7', color:'#111827', marginBottom:'4px'}}>{children}</li>,
              table: ({children}: any) => (
                <div style={{overflowX:'auto', marginBottom:'16px', marginTop:'8px'}}>
                  <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px', border:'0.5px solid #E5E7EB', borderRadius:'8px', overflow:'hidden'}}>{children}</table>
                </div>
              ),
              thead: ({children}: any) => <thead style={{background:'#F9FAFB'}}>{children}</thead>,
              tbody: ({children}: any) => <tbody>{children}</tbody>,
              tr: ({children}: any) => <tr style={{borderBottom:'0.5px solid #E5E7EB'}}>{children}</tr>,
              th: ({children}: any) => <th style={{padding:'8px 12px', fontWeight:'500', color:'#6B7280', textAlign:'left', fontSize:'12px', letterSpacing:'0.03em'}}>{children}</th>,
              td: ({children}: any) => <td style={{padding:'8px 12px', color:'#111827', fontSize:'13px', verticalAlign:'top'}}>{children}</td>,
            }}
          >{bilan.messageClient}</ReactMarkdown>
        </div>
      )}

    </PageWrapper>
  );
}
