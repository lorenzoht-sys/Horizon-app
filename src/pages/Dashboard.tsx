import { useState, lazy, Suspense, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import { useAgenda } from '../hooks/useAgenda';
import { useContrats } from '../hooks/useContrats';
import { useStructures } from '../hooks/useStructures';
import ParticipantCard from '../components/participant/ParticipantCard';
import { FadeInCard } from '../components/ui/FadeInCard';
import { motion } from 'framer-motion';
import ImportExcelModal from '../components/import/ImportExcelModal';
import PageWrapper from '../components/layout/PageWrapper';
import { Plus, Search, Users, BarChart3, FileSpreadsheet, X, CalendarDays, MapPin, ChevronRight, NotebookPen, AlertCircle, Building2, Settings } from 'lucide-react';
import { useJournalSeance } from '../hooks/useJournalSeance';
import { RESSENTI_CONFIG } from '../components/journal/NoteSeanceModal';
import { getAllBrouillons } from '../hooks/useBrouillonBilan';
import { toast } from 'sonner';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { supabase } from '../lib/supabase';
import type { Structure } from '../types';

const TYPE_LABELS: Record<string, string> = {
  ehpad: 'EHPAD', centre: 'Centre de soins', association: 'Association',
  entreprise: 'Entreprise', autre: 'Autre',
};

// ── Modal création structure ──────────────────────────────────────────────────

function ModalCreationStructure({ onClose, onCreer }: {
  onClose: () => void;
  onCreer: (data: Omit<Structure, 'id' | 'praticienId' | 'tokenAcces' | 'actif' | 'createdAt'>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    nom: '', type: '' as Structure['type'] | '',
    adresse: '', contactNom: '', contactEmail: '', contactTelephone: '',
    tarifSeance: 45, frequenceFacturation: 'mensuelle' as Structure['frequenceFacturation'],
  });
  const [loading, setLoading] = useState(false);
  const CLS = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nom.trim() || !form.contactEmail.trim()) { toast.error('Nom et email contact requis'); return; }
    setLoading(true);
    try {
      await onCreer({
        nom: form.nom.trim(),
        type: form.type || undefined,
        adresse: form.adresse || undefined,
        contactNom: form.contactNom || undefined,
        contactEmail: form.contactEmail.trim(),
        contactTelephone: form.contactTelephone || undefined,
        tarifSeance: form.tarifSeance,
        frequenceFacturation: form.frequenceFacturation,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-heading font-bold text-dark text-lg">Créer une structure</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-dark"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom de la structure *</label>
              <input className={CLS} value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="EHPAD Les Rosiers" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
              <select className={CLS} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Structure['type'] }))}>
                <option value="">— Choisir —</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse</label>
              <input className={CLS} value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="12 rue des Acacias, Nantes" />
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Contact</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom du contact</label>
                <input className={CLS} value={form.contactNom} onChange={e => setForm(f => ({ ...f, contactNom: e.target.value }))} placeholder="Marie Durand" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
                <input type="email" className={CLS} value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="m.durand@ehpad.fr" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Téléphone</label>
                <input className={CLS} value={form.contactTelephone} onChange={e => setForm(f => ({ ...f, contactTelephone: e.target.value }))} placeholder="02 40 XX XX XX" />
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Facturation</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tarif séance (€) *</label>
                <input type="number" className={CLS} value={form.tarifSeance} min={0} onChange={e => setForm(f => ({ ...f, tarifSeance: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Fréquence</label>
                <select className={CLS} value={form.frequenceFacturation} onChange={e => setForm(f => ({ ...f, frequenceFacturation: e.target.value as Structure['frequenceFacturation'] }))}>
                  <option value="mensuelle">Mensuelle</option>
                  <option value="bimensuelle">Bimensuelle</option>
                  <option value="a_la_seance">À la séance</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-dark transition-colors disabled:opacity-50">
              {loading ? 'Création…' : 'Créer la structure'}
            </button>
            <button type="button" onClick={onClose} className="px-5 border border-gray-200 rounded-xl text-gray-600 text-sm hover:bg-gray-50">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Carte structure ───────────────────────────────────────────────────────────

function CarteStructure({ structure, nbPatients, derniereSeance }: {
  structure: Structure;
  nbPatients: number;
  derniereSeance?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 size={18} style={{ color: 'var(--color-teal)' }} />
          </div>
          <div>
            <div className="font-heading font-semibold text-dark text-sm">{structure.nom}</div>
            {structure.type && <div className="text-xs text-gray-400">{TYPE_LABELS[structure.type] ?? structure.type}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-primary">{nbPatients}</div>
          <div className="text-xs text-gray-400">bénéficiaire{nbPatients !== 1 ? 's' : ''}</div>
        </div>
      </div>
      {structure.contactNom && (
        <div className="text-xs text-gray-500 mb-1">Contact : {structure.contactNom}</div>
      )}
      {derniereSeance && (
        <div className="text-xs text-gray-400 mb-3">
          Dernière séance : {new Date(derniereSeance + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => navigate(`/structures/${structure.id}`, { state: { structure } })}
          className="flex-1 text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/5 px-3 py-2 rounded-lg transition-colors text-center"
        >
          Voir les bénéficiaires →
        </button>
        <button
          onClick={() => navigate(`/structures/${structure.id}`, { state: { structure } })}
          className="text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 px-2.5 py-2 rounded-lg transition-colors"
          title="Gérer la structure"
        >
          <Settings size={13} />
        </button>
      </div>
    </div>
  );
}

const MiniMap = lazy(() => import('../components/map/MiniMap'));

type DashTab = 'tous' | 'independants' | 'structures';

export default function Dashboard() {
  const { participants, loading: participantsLoading, addParticipant } = useParticipants();
  const { seancesDuJour, patientsARelancer, seances } = useAgenda();
  const { contratsARenouveler } = useContrats();
  const { structures, creerStructure } = useStructures();
  const { notes } = useJournalSeance();
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showCreateStructure, setShowCreateStructure] = useState(false);
  const [activeTab, setActiveTab] = useState<DashTab>('tous');
  const [minLoadDone, setMinLoadDone] = useState(false);
  const [assiduite, setAssiduite] = useState<Record<string, { nb: number; taux: number | null; derniere: string | null }>>({});
  const assiduiteLoaded = useRef(false);
  const [patientsASurveiller, setPatientsASurveiller] = useState<{ id: string; prenom: string; nom: string }[]>([]);
  const retoursSurvLoaded = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const t = setTimeout(() => setMinLoadDone(true), 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!supabase || assiduiteLoaded.current) return;
    assiduiteLoaded.current = true;
    async function loadAssiduite() {
      const j7 = new Date(); j7.setDate(j7.getDate() - 7);
      const isoJ7 = j7.toISOString().split('T')[0];
      const spRes = await supabase!.from('seances_patient')
        .select('id, participant_id, date_seance')
        .gte('date_seance', isoJ7)
        .order('date_seance', { ascending: false });
      if (!spRes.data || spRes.data.length === 0) return;
      const erRes = await supabase!.from('exercices_realises')
        .select('seance_patient_id, realise')
        .in('seance_patient_id', spRes.data.map((s: Record<string, unknown>) => s.id));
      const erRows = (erRes.data ?? []) as { seance_patient_id: string; realise: boolean }[];
      const byPatient: Record<string, { nb: number; taux: number | null; derniere: string | null }> = {};
      const grouped: Record<string, { spId: string; date: string }[]> = {};
      for (const sp of spRes.data as Record<string, unknown>[]) {
        const pid = sp.participant_id as string;
        if (!grouped[pid]) grouped[pid] = [];
        grouped[pid].push({ spId: sp.id as string, date: sp.date_seance as string });
      }
      for (const [pid, sessions] of Object.entries(grouped)) {
        const allItems = erRows.filter(e => sessions.some(s => s.spId === e.seance_patient_id));
        const realises = allItems.filter(e => e.realise).length;
        const total = allItems.length;
        const derniere = sessions.sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null;
        byPatient[pid] = {
          nb: sessions.length,
          taux: total > 0 ? Math.round((realises / total) * 100) : null,
          derniere,
        };
      }
      setAssiduite(byPatient);
    }
    void loadAssiduite();
  }, []);

  useEffect(() => {
    if (participantsLoading || participants.length === 0 || retoursSurvLoaded.current) return;
    retoursSurvLoaded.current = true;
    async function loadRetoursSurveillance() {
      const ids = participants.map(p => p.id);
      const { data } = await supabase!
        .from('retours_seance')
        .select('participant_id, borg_rpe, bien_etre')
        .in('participant_id', ids)
        .order('date', { ascending: false });
      if (!data || data.length === 0) return;
      const byParticipant: Record<string, { borgRpe: number; bienEtre: number }[]> = {};
      for (const r of data as { participant_id: string; borg_rpe: number; bien_etre: number }[]) {
        if (!byParticipant[r.participant_id]) byParticipant[r.participant_id] = [];
        byParticipant[r.participant_id].push({ borgRpe: r.borg_rpe, bienEtre: r.bien_etre });
      }
      const alertes: { id: string; prenom: string; nom: string }[] = [];
      for (const [pid, retours] of Object.entries(byParticipant)) {
        if (retours.length < 3) continue;
        const last3 = retours.slice(0, 3);
        if (last3.every(r => r.borgRpe >= 8) || last3.every(r => r.bienEtre >= 4)) {
          const p = participants.find(x => x.id === pid);
          if (p) alertes.push({ id: p.id, prenom: p.prenom, nom: p.nom });
        }
      }
      setPatientsASurveiller(alertes);
    }
    void loadRetoursSurveillance();
  }, [participants, participantsLoading]);

  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab as DashTab);
      navigate('/', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const independants = participants.filter(p => !p.structureId);

  const filtered = independants
    .filter(p => `${p.prenom} ${p.nom}`.toLowerCase().includes(search.toLowerCase()));

  const filteredTous = participants
    .filter(p => `${p.prenom} ${p.nom}`.toLowerCase().includes(search.toLowerCase()));

  const listeFiltered = activeTab === 'tous' ? filteredTous : filtered;

  const needsBilan = participants.filter(p => {
    const last = p.bilans.at(-1);
    if (!last) return true;
    // Comparaison en chaînes ISO (YYYY-MM-DD) pour éviter les décalages
    // d'un jour selon le fuseau horaire de l'utilisateur.
    const il85j = new Date(); il85j.setDate(il85j.getDate() - 85);
    return last.date < il85j.toISOString().slice(0, 10);
  }).length;

  const thisMonthBilans = participants.reduce((acc, p) => {
    return acc + p.bilans.filter(b => {
      const d = new Date(b.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, 0);

  if (participantsLoading || !minLoadDone) {
    return <PageWrapper><DashboardSkeleton /></PageWrapper>;
  }

  return (
    <>
      <PageWrapper>
        {/* En-tête de page */}
        <div className="mb-8">
          <h1
            className="font-heading font-semibold m-0"
            style={{ fontSize: 24, color: 'var(--color-ink)', lineHeight: 1.2 }}
          >
            Tableau de bord
          </h1>
          <p
            className="mt-1 m-0"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--color-ink-2)' }}
          >
            {participants.length} bénéficiaire{participants.length !== 1 ? 's' : ''} suivi{participants.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Onglets */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          {([
            ['tous', `👥 Tous (${participants.length})`],
            ['independants', `🏠 Indépendants (${independants.length})`],
            ['structures', `🏢 Structures (${structures.length})`],
          ] as [DashTab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <FadeInCard delay={0}>
          <div
            className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-all"
            style={{ border: '1px solid #E2EEEE', padding: 24 }}
          >
            <div
              className="inline-flex p-2.5 rounded-xl mb-4"
              style={{ background: 'var(--color-teal-light)' }}
            >
              <Users size={18} style={{ color: 'var(--color-teal)' }} />
            </div>
            <div
              className="font-heading font-bold"
              style={{ fontSize: 28, color: 'var(--color-ink)', lineHeight: 1.2 }}
            >
              <AnimatedNumber value={participants.length} duration={0.8} />
            </div>
            <div
              className="mt-1 font-semibold uppercase"
              style={{ fontSize: 12, color: 'var(--color-ink-2)', letterSpacing: '0.5px', fontFamily: 'var(--font-sans)' }}
            >
              Participants
            </div>
          </div>
          </FadeInCard>

          <FadeInCard delay={0.05}>
          <div
            className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-all"
            style={{ border: '1px solid #E2EEEE', padding: 24 }}
          >
            <div
              className="inline-flex p-2.5 rounded-xl mb-4"
              style={{ background: 'var(--color-teal-light)' }}
            >
              <BarChart3 size={18} style={{ color: 'var(--color-teal)' }} />
            </div>
            <div
              className="font-heading font-bold"
              style={{ fontSize: 28, color: 'var(--color-ink)', lineHeight: 1.2 }}
            >
              <AnimatedNumber value={thisMonthBilans} duration={1.0} />
            </div>
            <div
              className="mt-1 font-semibold uppercase"
              style={{ fontSize: 12, color: 'var(--color-ink-2)', letterSpacing: '0.5px', fontFamily: 'var(--font-sans)' }}
            >
              Bilans ce mois
            </div>
          </div>
          </FadeInCard>

          <FadeInCard delay={0.10}>
          <div
            className="rounded-2xl shadow-sm hover:shadow-md transition-all"
            style={{
              border: `1px solid ${needsBilan > 0 ? 'rgba(243,156,18,0.30)' : 'var(--color-border)'}`,
              background: needsBilan > 0 ? 'rgba(243,156,18,0.05)' : '#FFFFFF',
              padding: 24,
            }}
          >
            <div
              className="inline-flex p-2.5 rounded-xl mb-4"
              style={{ background: needsBilan > 0 ? 'rgba(243,156,18,0.12)' : 'var(--color-teal-light)' }}
            >
              <AlertCircle size={18} style={{ color: needsBilan > 0 ? '#F39C12' : 'var(--color-teal)' }} />
            </div>
            <div
              className="font-heading font-bold"
              style={{ fontSize: 28, color: needsBilan > 0 ? '#F39C12' : 'var(--color-ink)', lineHeight: 1.2 }}
            >
              <AnimatedNumber value={needsBilan} duration={0.6} />
            </div>
            <div
              className="mt-1 font-semibold uppercase"
              style={{ fontSize: 12, color: 'var(--color-ink-2)', letterSpacing: '0.5px', fontFamily: 'var(--font-sans)' }}
            >
              Bilans à faire
            </div>
          </div>
          </FadeInCard>
        </div>

        {/* Alertes contrats à renouveler */}
        {contratsARenouveler.length > 0 && (
          <div className="mb-6 bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4">
            <div className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">
              ⚠️ {contratsARenouveler.length} contrat{contratsARenouveler.length > 1 ? 's' : ''} se termine{contratsARenouveler.length > 1 ? 'nt' : ''} bientôt
            </div>
            <div className="space-y-1">
              {contratsARenouveler.map(c => {
                const p = participants.find(x => x.id === c.participantId);
                const joursRestants = Math.ceil((new Date(c.dateFin).getTime() - Date.now()) / 86400000);
                return (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-orange-800">
                      <span className="font-medium">{p ? `${p.prenom} ${p.nom}` : '—'}</span>
                      {' '}— dans {joursRestants} jour{joursRestants > 1 ? 's' : ''}
                    </span>
                    {p && (
                      <Link
                        to={`/participant/${p.id}/contrat/nouveau`}
                        className="text-xs text-orange-700 underline hover:text-orange-900 font-medium"
                      >
                        Renouveler →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Alertes ressentis — À surveiller */}
        {patientsASurveiller.length > 0 && (
          <div className="mb-6 bg-red-light border border-red-200 rounded-2xl px-5 py-4">
            <div className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">
              ⚠️ {patientsASurveiller.length} bénéficiaire{patientsASurveiller.length > 1 ? 's' : ''} à surveiller — ressentis dégradés
            </div>
            <div className="space-y-1">
              {patientsASurveiller.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-red-800 font-medium">{p.prenom} {p.nom}</span>
                  <Link
                    to={`/participant/${p.id}`}
                    className="text-xs text-red-700 underline hover:text-red-900 font-medium"
                  >
                    Voir les Ressentis →
                  </Link>
                </div>
              ))}
            </div>
            <p className="text-xs text-red-600 mt-2">
              3 séances consécutives avec effort ≥ 8/10 ou bien-être ≥ 4/5 (Fatigué / Épuisé)
            </p>
          </div>
        )}

        {/* Contenu selon onglet actif */}
        {activeTab === 'structures' ? (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowCreateStructure(true)}
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
                  const derniere = seancesStr.sort((a: any, b: any) => b.date.localeCompare(a.date))[0]?.date;
                  return (
                    <CarteStructure
                      key={s.id}
                      structure={s}
                      nbPatients={patientsStr.length}
                      derniereSeance={derniere}
                    />
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Toolbar participants */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ink-3)' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un participant..."
                  className="w-full transition-all focus:outline-none"
                  style={{
                    paddingLeft: 40, paddingRight: 16, paddingTop: 11, paddingBottom: 11,
                    background: 'var(--color-bg)', border: '1.5px solid #E2EEEE',
                    borderRadius: 10, fontSize: 14, fontFamily: 'var(--font-sans)', color: 'var(--color-ink)',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--color-teal)'; e.target.style.boxShadow = '0 0 0 3px rgba(43,191,191,0.12)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
              <motion.button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-2 text-sm font-medium"
                style={{ padding: '10px 20px', background: 'transparent', border: '1.5px solid var(--color-teal)', borderRadius: 10, color: 'var(--color-teal)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.1 }}
              >
                <FileSpreadsheet size={16} />
                <span className="hidden sm:inline">Import Excel</span>
              </motion.button>
              <motion.button
                onClick={() => navigate('/participants/nouveau')}
                className="flex items-center gap-2 text-white text-sm font-semibold"
                style={{ padding: '10px 20px', background: 'var(--color-teal)', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.1 }}
              >
                <Plus size={16} /> Nouveau participant
              </motion.button>
            </div>

            {/* Grid participants */}
            {listeFiltered.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Users size={56} className="mx-auto mb-4 opacity-20" />
                <p className="font-medium text-lg">Aucun participant trouvé</p>
                <p className="text-sm mt-1">{search ? 'Essayez un autre nom' : 'Commencez par ajouter un participant'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {listeFiltered.map((p, i) => (
                  <FadeInCard key={p.id} delay={0.15 + i * 0.05}>
                    <ParticipantCard
                      participant={p}
                      structureNom={p.structureId ? structures.find(s => s.id === p.structureId)?.nom : undefined}
                    />
                  </FadeInCard>
                ))}
              </div>
            )}
          </>
        )}

        {/* Widget agenda */}
        {(() => {
          const today = new Date().toISOString().slice(0, 10);
          const seancesAujourdhui = seancesDuJour(today);
          const aRelancer = patientsARelancer(21);
          if (seancesAujourdhui.length === 0 && aRelancer.length === 0) return null;
          return (
            <FadeInCard delay={0.25}>
            <div className="mt-8 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarDays size={18} className="text-primary" />
                  <h2 className="font-heading font-semibold text-dark">Prochaines séances</h2>
                </div>
                <Link to="/agenda" className="text-xs text-primary hover:text-dark flex items-center gap-1 transition-colors">
                  Voir l'agenda <ChevronRight size={14} />
                </Link>
              </div>

              {seancesAujourdhui.length > 0 ? (
                <div className="space-y-2 mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Aujourd'hui — {seancesAujourdhui.length} séance{seancesAujourdhui.length > 1 ? 's' : ''}
                  </p>
                  {seancesAujourdhui.slice(0, 4).map(s => {
                    const p = participants.find(x => x.id === s.participantId);
                    return (
                      <div key={s.id} className="flex items-center gap-3 py-1">
                        <span className="text-sm font-semibold text-primary w-14 flex-shrink-0">{s.heureDebut}</span>
                        <span className="text-sm font-medium text-dark">{p ? `${p.prenom} ${p.nom}` : '—'}</span>
                        {p?.adresseVille && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <MapPin size={11} />{p.adresseVille}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-3">Aucune séance planifiée aujourd'hui.</p>
              )}

              {aRelancer.length > 0 && (
                <p className="text-xs text-warning font-medium">
                  ⚠️ {aRelancer.length} bénéficiaire{aRelancer.length > 1 ? 's' : ''} sans séance depuis plus de 3 semaines
                </p>
              )}
            </div>
            </FadeInCard>
          );
        })()}

        {/* Widget bilans en cours (brouillons) */}
        {(() => {
          const brouillons = getAllBrouillons();
          if (brouillons.length === 0) return null;
          return (
            <FadeInCard delay={0.30}>
            <div className="mt-6 bg-white rounded-2xl border border-amber-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">📋</span>
                <h2 className="font-heading font-semibold text-dark">
                  Bilans en cours
                  <span className="ml-2 bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{brouillons.length}</span>
                </h2>
              </div>
              <div className="space-y-2">
                {brouillons.map(b => {
                  const p = participants.find(x => x.id === b.participantId);
                  const mins = Math.floor((Date.now() - new Date(b.dateDerniereModif).getTime()) / 60000);
                  const modifLabel = mins < 60 ? `il y a ${mins} min` : mins < 1440 ? `il y a ${Math.floor(mins / 60)}h` : `il y a ${Math.floor(mins / 1440)}j`;
                  return (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-dark truncate">
                          {p ? `${p.prenom} ${p.nom}` : 'Bénéficiaire inconnu'}
                        </div>
                        <div className="text-xs text-gray-400">
                          {b.completionPct}% complété · Étape {b.etapeActuelle + 1} · {modifLabel}
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full mt-1.5 w-24 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-amber-400"
                            initial={{ width: 0 }}
                            animate={{ width: `${b.completionPct}%` }}
                            transition={{ duration: 0.8, delay: 0.4, ease: [0.25, 0.1, 0.25, 1] as const }}
                          />
                        </div>
                      </div>
                      {p && (
                        <Link
                          to={`/participant/${p.id}/bilan/new`}
                          className="ml-3 flex-shrink-0 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
                        >
                          Reprendre →
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            </FadeInCard>
          );
        })()}

        {/* Widget assiduité programmes */}
        {Object.keys(assiduite).length > 0 && (() => {
          const lignes = Object.entries(assiduite)
            .map(([pid, stats]) => {
              const p = participants.find(x => x.id === pid);
              return p ? { p, ...stats } : null;
            })
            .filter(Boolean)
            .sort((a, b) => (b!.nb ?? 0) - (a!.nb ?? 0))
            .slice(0, 6) as { p: (typeof participants)[0]; nb: number; taux: number | null; derniere: string | null }[];
          if (lignes.length === 0) return null;
          const alertes = lignes.filter(l => l.taux !== null && l.taux < 50);
          return (
            <FadeInCard delay={0.32}>
            <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-base">📊</span>
                  <h2 className="font-heading font-semibold text-dark">Assiduité programmes</h2>
                </div>
                <span className="text-xs text-gray-400">Cette semaine</span>
              </div>
              <div className="space-y-2">
                {lignes.map(({ p, nb, taux, derniere }) => {
                  const couleur = taux === null ? '#94A3B8' : taux >= 70 ? '#16A34A' : taux >= 50 ? '#EA580C' : '#DC2626';
                  const dateLabel = derniere
                    ? new Date(derniere + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                    : null;
                  return (
                    <Link key={p.id} to={`/participant/${p.id}`} className="flex items-center gap-3 py-1.5 hover:bg-gray-50 rounded-lg px-1 -mx-1 transition-colors">
                      <span className="text-sm font-semibold text-dark w-36 truncate flex-shrink-0">{p.prenom} {p.nom}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${taux ?? 0}%`, background: couleur, transition: 'width 0.6s ease' }} />
                      </div>
                      <span className="text-xs font-bold w-9 text-right flex-shrink-0" style={{ color: couleur }}>
                        {taux !== null ? `${taux}%` : '—'}
                      </span>
                      <span className="text-[11px] text-gray-400 w-20 text-right flex-shrink-0">
                        {nb} séance{nb > 1 ? 's' : ''}{dateLabel ? ` · ${dateLabel}` : ''}
                      </span>
                    </Link>
                  );
                })}
              </div>
              {alertes.length > 0 && (
                <div className="mt-3 rounded-xl bg-red-light border border-red-200 px-3 py-2 text-xs text-red-700 font-medium">
                  📉 {alertes.length} bénéficiaire{alertes.length > 1 ? 's' : ''} avec un taux de réalisation &lt; 50% cette semaine
                </div>
              )}
            </div>
            </FadeInCard>
          );
        })()}

        {/* Widget journal — dernières notes */}
        {(() => {
          const today = new Date().toISOString().slice(0, 10);
          const notesAujourdhui = notes
            .filter(n => n.date === today)
            .sort((a, b) => b.heureDebut.localeCompare(a.heureDebut));
          if (notesAujourdhui.length === 0) return null;
          const alertesDouleur = notesAujourdhui.filter(n => n.alertes.douleurSignalee);
          return (
            <FadeInCard delay={0.35}>
            <div className="mt-8 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <NotebookPen size={18} className="text-secondary" />
                  <h2 className="font-heading font-semibold text-dark">Dernières notes</h2>
                </div>
                <span className="text-xs text-gray-400">
                  Aujourd'hui — {notesAujourdhui.length} note{notesAujourdhui.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2 mb-3">
                {notesAujourdhui.slice(0, 5).map(note => {
                  const p = participants.find(x => x.id === note.participantId);
                  const r = note.ressenti ? RESSENTI_CONFIG[note.ressenti] : null;
                  return (
                    <div key={note.id} className="flex items-center gap-3 py-1">
                      <span className="text-sm font-medium text-dark flex-shrink-0 w-28 truncate">
                        {p ? `${p.prenom} ${p.nom[0]}.` : '—'}
                      </span>
                      {r && <span className="text-xs flex-shrink-0">{r.emoji} {r.label}</span>}
                      {note.note && (
                        <span className="text-xs text-gray-400 truncate flex-1">
                          "{note.note.length > 45 ? note.note.slice(0, 45) + '…' : note.note}"
                        </span>
                      )}
                      {p && (
                        <Link to={`/participant/${p.id}`} className="text-xs text-primary hover:text-dark flex-shrink-0 flex items-center gap-1 transition-colors">
                          Fiche <ChevronRight size={11} />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
              {alertesDouleur.length > 0 && (
                <div className="bg-red-light border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 font-medium">
                  ⚠️ {alertesDouleur.length} alerte{alertesDouleur.length > 1 ? 's' : ''} douleur signalée{alertesDouleur.length > 1 ? 's' : ''} aujourd'hui
                </div>
              )}
            </div>
            </FadeInCard>
          );
        })()}

        {/* Widget carte — en bas de page */}
        {participants.some(p => p.coordonnees) && (
          <div className="mt-8">
            <Suspense fallback={<div className="h-[260px] bg-gray-100 rounded-2xl animate-pulse" />}>
              <MiniMap participants={participants} />
            </Suspense>
          </div>
        )}
      </PageWrapper>


      {/* Modal import Excel */}
      {showImport && <ImportExcelModal onClose={() => setShowImport(false)} participants={participants} addParticipant={addParticipant} />}

      {/* Modal création structure */}
      {showCreateStructure && (
        <ModalCreationStructure
          onClose={() => setShowCreateStructure(false)}
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
    </>
  );
}
