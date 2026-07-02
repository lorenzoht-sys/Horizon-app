import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Mail, RefreshCw, Check, Trash2, FileText } from 'lucide-react';
import { useStructures } from '../hooks/useStructures';
import { useParticipants } from '../hooks/useParticipants';
import { useAgenda } from '../hooks/useAgenda';
import { useFactures } from '../hooks/useFactures';
import { supabase } from '../lib/supabase';
import { getAppHost } from '../lib/config';
import { dbToStructure } from '../lib/mappers';
import PageWrapper from '../components/layout/PageWrapper';
import ParticipantCard from '../components/participant/ParticipantCard';
import { toast } from 'sonner';
import type { Participant, Structure } from '../types';
import jsPDF from 'jspdf';
import { cleanTextPdf } from '../utils/pdfText';

const MOIS_LONGS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function nomMois(m: number, y: number) { return `${MOIS_LONGS[m - 1]} ${y}`; }

function premierJour(y: number, m: number) { return `${y}-${String(m).padStart(2, '0')}-01`; }
function dernierJour(y: number, m: number) { const d = new Date(y, m, 0); return d.toISOString().slice(0, 10); }
function moisPrec(y: number, m: number) { return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }; }

// Chargement différé : pdfjs-dist/mammoth/docx sont lourds, à ne charger
// que si Pierre clique réellement sur "Générer un compte rendu".
const GenererCompteRenduModal = lazy(() => import('../components/structures/GenererCompteRenduModal'));

export default function StructureDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { structures, mettreAJour, supprimerStructure, regenererToken } = useStructures();
  const { participants } = useParticipants();
  const { seances } = useAgenda();
  const { factures, creerOuMettreAJourStructure, marquerEnvoyee } = useFactures();

  // Structure depuis le hook ou location.state ou fetch direct
  const [structureFetchee, setStructureFetchee] = useState<Structure | null>(null);
  const hookStructure = structures.find(s => s.id === id);
  const locationStructure = location.state?.structure as Structure | undefined;
  const structure: Structure | undefined = hookStructure ?? locationStructure ?? structureFetchee ?? undefined;

  // Fetch direct si pas encore dans le hook (chargement initial ou navigation directe)
  useEffect(() => {
    if (hookStructure || locationStructure || !id || !supabase) return;
    supabase.from('structures').select('*').eq('id', id).single().then(({ data }) => {
      if (data) setStructureFetchee(dbToStructure(data));
    });
  }, [id, hookStructure, locationStructure]);

  const [confirmSuppr, setConfirmSuppr] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    nom: '', contactNom: '', contactEmail: '', contactTelephone: '', adresse: '',
    tarifSeance: 45, frequenceFacturation: 'mensuelle' as Structure['frequenceFacturation'],
  });
  const [genLoading, setGenLoading] = useState(false);
  const [modalEnvoi, setModalEnvoi] = useState<string | null>(null);
  const [dateEnvoi, setDateEnvoi] = useState(new Date().toISOString().slice(0, 10));
  const [crPatient, setCrPatient] = useState<Participant | null>(null);

  const patientsStr = participants.filter(p => p.structureId === id);

  // Factures de cette structure
  const facturesStr = factures.filter(f => f.structureId === id);
  const factEnRetard = facturesStr.filter(f => f.statut === 'en_retard');
  const factAEnvoyer = facturesStr.filter(f => f.statut === 'a_envoyer');
  const factEnvoyees = facturesStr.filter(f => f.statut === 'envoyee');

  // Auto-génération mois précédent
  const now = new Date();
  const { y: yPrec, m: mPrec } = moisPrec(now.getFullYear(), now.getMonth() + 1);

  async function genererFactureMois(annee: number, mois: number) {
    if (!structure) return;
    setGenLoading(true);
    const debut = premierJour(annee, mois);
    const fin   = dernierJour(annee, mois);
    const echeance = premierJour(now.getFullYear(), now.getMonth() + 1);
    const seancesMois = seances.filter(s =>
      patientsStr.some(p => p.id === s.participantId) &&
      s.statut === 'realisee' && s.date >= debut && s.date <= fin
    );
    if (seancesMois.length === 0) { toast('Aucune séance ce mois pour cette structure'); setGenLoading(false); return; }
    const tarif = structure.tarifSeance;
    const result = await creerOuMettreAJourStructure({
      structureId: structure.id,
      periodeMois: mois, periodeAnnee: annee,
      nbSeances: seancesMois.length,
      montantTotal: seancesMois.length * tarif,
      dateEcheance: echeance,
    });
    if (result) toast.success(`Facture générée : ${seancesMois.length} séances × ${tarif}€`);
    else toast.error('Erreur lors de la génération');
    setGenLoading(false);
  }

  function genererPDFFacture(f: typeof factures[0]) {
    if (!structure) return;
    const doc = new jsPDF('p', 'mm', 'a4');
    let y = 25;
    doc.setFontSize(22); doc.setTextColor(13, 43, 43); doc.text('FACTURE', 20, y); y += 8;
    doc.setFontSize(10); doc.setTextColor(100, 100, 100);
    doc.text(`Émise le : ${new Date().toLocaleDateString('fr-FR')}`, 20, y); y += 16;
    doc.setFontSize(11); doc.setTextColor(13, 43, 43); doc.text('Structure facturée :', 20, y); y += 6;
    doc.setFontSize(10); doc.setTextColor(60, 60, 60);
    doc.text(cleanTextPdf(structure.nom), 20, y); y += 5;
    if (structure.contactEmail) { doc.text(cleanTextPdf(structure.contactEmail), 20, y); y += 5; }
    y += 12;
    doc.setFontSize(12); doc.setTextColor(13, 43, 43);
    doc.text(`Séances APA — ${nomMois(f.periodeMois, f.periodeAnnee)}`, 20, y); y += 10;
    doc.setFontSize(10); doc.setTextColor(60, 60, 60);
    doc.text(`Nombre de séances réalisées : ${f.nbSeances}`, 20, y); y += 7;
    doc.text(`Tarif par séance : ${structure.tarifSeance.toFixed(2)} €`, 20, y); y += 12;
    doc.setDrawColor(200); doc.line(20, y, 190, y); y += 8;
    doc.setFontSize(14); doc.setTextColor(43, 191, 191);
    doc.text(`TOTAL : ${f.montantTotal.toFixed(2)} €`, 20, y);
    doc.save(`Facture_${structure.nom.replace(/\s+/g, '_')}_${nomMois(f.periodeMois, f.periodeAnnee)}.pdf`);
  }

  function envoyerRappelEmail(f: typeof factures[0]) {
    if (!structure?.contactEmail) { toast.error('Aucun email de contact'); return; }
    const periode = nomMois(f.periodeMois, f.periodeAnnee);
    const body = encodeURIComponent(`Bonjour,\n\nVeuillez trouver ci-joint notre facture pour les séances APA du mois de ${periode}.\nMontant : ${f.montantTotal.toFixed(2)} €\n\nCordialement`);
    window.open(`mailto:${structure.contactEmail}?subject=${encodeURIComponent(`Facture APA - ${periode}`)}&body=${body}`);
  }

  if (!structure) return (
    <PageWrapper>
      <div className="text-center py-20 text-gray-400">
        <div className="text-4xl mb-3">🏢</div>
        Structure introuvable
      </div>
    </PageWrapper>
  );

  const portalUrl = `https://${getAppHost()}/structure/${structure.tokenAcces}`;

  return (
    <PageWrapper>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" state={{ activeTab: 'structures' }} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm font-medium">
          <ArrowLeft size={16} />
          Structures
        </Link>
        <div>
          <h1 className="font-heading font-bold text-dark text-xl">{structure.nom}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {patientsStr.length} bénéficiaire{patientsStr.length !== 1 ? 's' : ''} ·
            {structure.contactNom && ` Contact : ${structure.contactNom}`}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        {/* Colonne gauche */}
        <div className="space-y-5">

          {/* Patients */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="text-sm font-bold text-gray-800 mb-4">
              👥 Bénéficiaires ({patientsStr.length})
            </div>
            {patientsStr.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun bénéficiaire rattaché à cette structure.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {patientsStr.map(p => (
                  <div key={p.id} className="flex flex-col gap-2">
                    <ParticipantCard participant={p} />
                    <button type="button" onClick={() => setCrPatient(p)}
                      className="flex items-center justify-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/5 rounded-lg py-1.5 transition-colors">
                      <FileText size={12} /> Générer un compte rendu
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Facturation structure */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-bold text-gray-800">
                💶 Facturation — {structure.nom}
              </div>
              <button
                onClick={() => genererFactureMois(yPrec, mPrec)}
                disabled={genLoading}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw size={12} className={genLoading ? 'animate-spin' : ''} />
                Générer {nomMois(mPrec, yPrec)}
              </button>
            </div>

            {facturesStr.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400">
                Aucune facture générée.
                <br />Cliquez sur "Générer" pour créer la facture du mois précédent.
              </div>
            ) : (
              <div className="space-y-3">
                {[...factEnRetard, ...factAEnvoyer, ...factEnvoyees].map(f => (
                  <div key={f.id} className={`border rounded-xl p-4 ${
                    f.statut === 'en_retard' ? 'border-red-200 bg-red-light' :
                    f.statut === 'envoyee' ? 'border-emerald-200 bg-emerald-50/50' :
                    'border-gray-200 bg-white'
                  }`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {nomMois(f.periodeMois, f.periodeAnnee)}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {f.nbSeances} séance{f.nbSeances !== 1 ? 's' : ''} × {structure.tarifSeance}€
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-gray-900">{f.montantTotal.toFixed(0)} €</div>
                        <div className={`text-xs mt-0.5 font-medium ${
                          f.statut === 'envoyee' ? 'text-emerald-600' :
                          f.statut === 'en_retard' ? 'text-red-600' : 'text-amber-600'
                        }`}>
                          {f.statut === 'envoyee' ? `✅ Facturée le ${f.dateEnvoi ? new Date(f.dateEnvoi + 'T12:00').toLocaleDateString('fr-FR') : '—'}` :
                           f.statut === 'en_retard' ? '⚠️ En retard' : '📅 À envoyer'}
                        </div>
                      </div>
                    </div>
                    {f.statut !== 'envoyee' && (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setModalEnvoi(f.id)}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                        >
                          ✅ Marquer envoyée
                        </button>
                        <button onClick={() => genererPDFFacture(f)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">📄 PDF</button>
                        {f.statut === 'en_retard' && (
                          <button onClick={() => envoyerRappelEmail(f)} className="text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50">📧 Rappel</button>
                        )}
                      </div>
                    )}
                    {f.statut === 'envoyee' && (
                      <button onClick={() => genererPDFFacture(f)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">📄 Télécharger PDF</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Colonne droite */}
        <div className="space-y-5">
          {/* Infos & portail */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-bold text-gray-800">⚙️ Informations</div>
              {!editMode && (
                <button
                  onClick={() => {
                    setEditForm({
                      nom: structure.nom,
                      contactNom: structure.contactNom ?? '',
                      contactEmail: structure.contactEmail,
                      contactTelephone: structure.contactTelephone ?? '',
                      adresse: structure.adresse ?? '',
                      tarifSeance: structure.tarifSeance,
                      frequenceFacturation: structure.frequenceFacturation,
                    });
                    setEditMode(true);
                  }}
                  className="text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 px-2.5 py-1.5 rounded-lg"
                >
                  ✏️ Modifier
                </button>
              )}
            </div>

            {editMode ? (
              <div className="space-y-3 mb-4">
                {[
                  { label: 'Nom', key: 'nom', placeholder: 'EHPAD Les Rosiers' },
                  { label: 'Contact', key: 'contactNom', placeholder: 'Marie Durand' },
                  { label: 'Email', key: 'contactEmail', placeholder: 'contact@structure.fr' },
                  { label: 'Téléphone', key: 'contactTelephone', placeholder: '02 40 XX XX XX' },
                  { label: 'Adresse', key: 'adresse', placeholder: '12 rue des Acacias' },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      value={editForm[key as keyof typeof editForm] as string}
                      onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tarif (€)</label>
                    <input type="number" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      value={editForm.tarifSeance} onChange={e => setEditForm(f => ({ ...f, tarifSeance: Number(e.target.value) }))} min={0} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Fréquence</label>
                    <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      value={editForm.frequenceFacturation} onChange={e => setEditForm(f => ({ ...f, frequenceFacturation: e.target.value as Structure['frequenceFacturation'] }))}>
                      <option value="mensuelle">Mensuelle</option>
                      <option value="bimensuelle">Bimensuelle</option>
                      <option value="a_la_seance">À la séance</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await mettreAJour(structure.id, {
                        nom: editForm.nom,
                        contactNom: editForm.contactNom || undefined,
                        contactEmail: editForm.contactEmail,
                        contactTelephone: editForm.contactTelephone || undefined,
                        adresse: editForm.adresse || undefined,
                        tarifSeance: editForm.tarifSeance,
                        frequenceFacturation: editForm.frequenceFacturation,
                      });
                      toast.success('Structure mise à jour');
                      setEditMode(false);
                    }}
                    className="flex-1 bg-primary text-white rounded-xl py-2 text-sm font-semibold hover:bg-dark"
                  >
                    Enregistrer
                  </button>
                  <button onClick={() => setEditMode(false)} className="px-4 border border-gray-200 rounded-xl text-gray-600 text-sm">Annuler</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm mb-4">
                {structure.contactEmail && <div><span className="text-gray-400">Email : </span><span>{structure.contactEmail}</span></div>}
                {structure.contactTelephone && <div><span className="text-gray-400">Tél : </span><span>{structure.contactTelephone}</span></div>}
                {structure.adresse && <div><span className="text-gray-400">Adresse : </span><span>{structure.adresse}</span></div>}
                <div><span className="text-gray-400">Tarif : </span><span className="font-medium">{structure.tarifSeance}€/séance</span></div>
                <div><span className="text-gray-400">Facturation : </span><span className="font-medium">{structure.frequenceFacturation}</span></div>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Accès portail</div>
              <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-600 break-all mb-3 font-mono">
                {portalUrl}
              </div>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => { navigator.clipboard.writeText(portalUrl); toast('Lien copié !'); }}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-primary text-white hover:bg-dark"
                >
                  <Copy size={12} /> Copier
                </button>
                <button
                  onClick={() => {
                    const body = encodeURIComponent(`Bonjour,\n\nVoici votre accès au portail de suivi APA :\n${portalUrl}\n\nVous y trouverez les progrès, séances et factures de vos patients.\n\nCordialement`);
                    window.open(`mailto:${structure.contactEmail}?subject=${encodeURIComponent('Votre accès portail APA')}&body=${body}`);
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Mail size={12} /> Envoyer
                </button>
                <button
                  onClick={async () => {
                    const t = await regenererToken(structure.id);
                    if (t) toast.success('Token régénéré');
                    else toast.error('Erreur');
                  }}
                  className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50"
                  title="Régénérer le token"
                >
                  <RefreshCw size={12} />
                </button>
              </div>
              <div className="text-xs text-gray-400">⚠️ Accès lecture seule</div>
            </div>
          </div>

          {/* Danger zone */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="text-sm font-bold text-gray-800 mb-3">Zone de danger</div>
            {!confirmSuppr ? (
              <button
                onClick={() => setConfirmSuppr(true)}
                className="text-xs font-medium text-red-500 border border-red-200 hover:bg-red-light px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={12} /> Supprimer cette structure
              </button>
            ) : (
              <div>
                <p className="text-xs text-red-600 mb-3">
                  Les {patientsStr.length} bénéficiaires seront détachés (non supprimés).
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await supprimerStructure(structure.id);
                      toast.success('Structure supprimée');
                      navigate('/');
                    }}
                    className="flex-1 text-xs font-semibold bg-danger text-white rounded-lg py-2 hover:bg-danger"
                  >
                    Confirmer
                  </button>
                  <button onClick={() => setConfirmSuppr(false)} className="text-xs px-3 py-2 border border-gray-200 rounded-lg text-gray-500">Annuler</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal confirmation envoi */}
      {modalEnvoi && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="text-base font-bold text-gray-900 mb-4">Confirmer l'envoi de la facture</div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date d'envoi</label>
            <input type="date" value={dateEnvoi} onChange={e => setDateEnvoi(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:border-primary" />
            <div className="flex gap-3">
              <button
                onClick={async () => { await marquerEnvoyee(modalEnvoi, dateEnvoi); toast.success('Facture marquée envoyée'); setModalEnvoi(null); }}
                className="flex-1 bg-emerald-500 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-emerald-600"
              >
                <Check size={14} /> Confirmer
              </button>
              <button onClick={() => setModalEnvoi(null)} className="px-4 border border-gray-200 rounded-xl text-gray-600 text-sm">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {crPatient && structure && (
        <Suspense fallback={null}>
          <GenererCompteRenduModal patient={crPatient} structure={structure} onClose={() => setCrPatient(null)} />
        </Suspense>
      )}
    </PageWrapper>
  );
}
