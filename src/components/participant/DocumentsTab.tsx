import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Download, Eye, EyeOff } from 'lucide-react';
import { useDocumentsBeneficiaire } from '../../hooks/useDocumentsBeneficiaire';
import { telechargerPdfFacture } from '../../hooks/useFacturesAValider';
import { formaterDate, formaterEuro, libellePeriode } from '../../lib/facturesAValider';
import { libelleStatut, visibleParBeneficiaire } from '../../lib/documentsBeneficiaire';

// Onglet « Documents » de la fiche bénéficiaire (point D, D1) : l'espace documentaire du bénéficiaire
// vu par le praticien. Factures et avoirs émis (avec leur PDF), et comptes rendus partagés
// (documents_patient, écrits depuis l'assistant). Pour chaque facture, ce que le bénéficiaire en voit
// dans son espace (règle de documents_du_beneficiaire ; l'affichage côté patient arrive avec D2).
//
// Couleurs : comme CoursCollectifsTab, uniquement des couleurs inline ou plates du thème.

function Pastille({ fond, texte, children }: { fond: string; texte: string; children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: fond, color: texte }}>
      {children}
    </span>
  );
}

function dateCompteRendu(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function DocumentsTab({ participantId }: { participantId: string }) {
  const { factures, comptesRendus, facturesProcheVisibles, chargement, erreur } = useDocumentsBeneficiaire(participantId);
  const [telechargement, setTelechargement] = useState<string | null>(null);
  const [deplies, setDeplies] = useState<Set<string>>(new Set());

  async function telecharger(id: string, pdfPath: string, numero: string) {
    setTelechargement(id);
    const r = await telechargerPdfFacture(pdfPath, numero);
    setTelechargement(null);
    if ('erreur' in r) toast.error(r.erreur);
  }

  if (chargement) return <p className="text-sm text-gray-400 py-6 text-center">Chargement des documents…</p>;
  if (erreur) return <p role="alert" className="text-sm text-red py-6 text-center">Impossible de charger les documents : {erreur}</p>;

  return (
    <div className="space-y-6" data-testid="onglet-documents">
      <section>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Factures et avoirs ({factures.length})</h3>
        <p className="text-xs text-gray-500 mb-3">
          {facturesProcheVisibles
            ? 'Le bénéficiaire voit ses factures, y compris celles payées par un proche.'
            : 'Le bénéficiaire ne voit pas les factures payées par un proche.'}{' '}
          <Link to="/settings/facturation" className="text-primary underline">Modifier dans le profil de facturation</Link>
        </p>
        {factures.length === 0 ? (
          <p className="text-sm text-gray-400" data-testid="aucune-facture">Aucune facture émise pour ce bénéficiaire.</p>
        ) : (
          <ul className="space-y-2">
            {factures.map(f => {
              const visible = visibleParBeneficiaire(f, facturesProcheVisibles);
              return (
                <li key={f.id} className="border border-gray-100 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2" data-testid="document-facture">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 m-0">
                      {f.type === 'avoir' ? 'Avoir' : 'Facture'} n° {f.numero}
                      <span className="font-normal text-gray-500"> · {libellePeriode(f.periode)}</span>
                    </p>
                    <p className="text-[12px] text-gray-500 m-0 mt-0.5">
                      Émise le {formaterDate(f.dateEmission)} · {formaterEuro(f.total)}{f.payeurProche ? ' · payée par un proche' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pastille fond="#F3F4F6" texte="#4B5563">{libelleStatut(f)}</Pastille>
                    {visible
                      ? <Pastille fond="#E6F5F1" texte="#1A9A7F"><Eye size={11} className="inline -mt-0.5 mr-1" />Visible par le bénéficiaire</Pastille>
                      : <Pastille fond="#FEF5E7" texte="#92400E"><EyeOff size={11} className="inline -mt-0.5 mr-1" />Non visible</Pastille>}
                    {f.pdfPath ? (
                      <button type="button" data-testid="document-pdf" disabled={telechargement === f.id}
                        onClick={() => void telecharger(f.id, f.pdfPath as string, f.numero)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary border border-primary/40 hover:bg-primary/5 disabled:opacity-50 px-2.5 py-1 rounded-lg">
                        <Download size={12} /> {telechargement === f.id ? '…' : 'PDF'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">PDF en préparation</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Comptes rendus partagés ({comptesRendus.length})</h3>
        <p className="text-xs text-gray-500 mb-3">Partagés depuis l'assistant ; le bénéficiaire les voit dans son espace.</p>
        {comptesRendus.length === 0 ? (
          <p className="text-sm text-gray-400" data-testid="aucun-compte-rendu">Aucun compte rendu partagé.</p>
        ) : (
          <ul className="space-y-2">
            {comptesRendus.map(d => {
              const deplie = deplies.has(d.id);
              return (
                <li key={d.id} className="border border-gray-100 rounded-xl p-3" data-testid="document-compte-rendu">
                  <button type="button" className="w-full flex items-start justify-between gap-2 text-left"
                    aria-expanded={deplie}
                    onClick={() => setDeplies(prev => { const s = new Set(prev); if (s.has(d.id)) s.delete(d.id); else s.add(d.id); return s; })}>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-gray-800">{d.titre}</span>
                      <span className="block text-[12px] text-gray-500 mt-0.5">Partagé le {dateCompteRendu(d.dateCreation)}</span>
                    </span>
                    {deplie ? <ChevronUp size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
                  </button>
                  {deplie && <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2 mb-0">{d.contenu}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
