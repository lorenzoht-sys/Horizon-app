import { useState, lazy, Suspense, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import { useAgenda } from '../hooks/useAgenda';
import { useContrats } from '../hooks/useContrats';
import { useStructures } from '../hooks/useStructures';
import ParticipantCard from '../components/participant/ParticipantCard';
import { contratsDesBeneficiairesActifs, filtrerParNom } from '../lib/archivage';
import { FadeInCard } from '../components/ui/FadeInCard';
import { motion } from 'framer-motion';
import ImportExcelModal from '../components/import/ImportExcelModal';
import PageWrapper from '../components/layout/PageWrapper';
import { Plus, Search, Users, BarChart3, FileSpreadsheet, CalendarDays, MapPin, ChevronRight, NotebookPen, AlertCircle, Building2, Archive } from 'lucide-react';
import { useJournalSeance } from '../hooks/useJournalSeance';
import { RESSENTI_CONFIG } from '../components/journal/NoteSeanceModal';
import { getAllBrouillons } from '../hooks/useBrouillonBilan';
import { toast } from 'sonner';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { supabase } from '../lib/supabase';
import CarteStructure from '../components/structures/CarteStructure';
import ModalCreationStructure from '../components/structures/ModalCreationStructure';

const MiniMap = lazy(() => import('../components/map/MiniMap'));

type DashTab = 'tous' | 'independants' | 'structures';

export default function Dashboard() {
  // participants : liste complète, ne sert plus qu'à construire les vues
  // ci-dessous. participantsActifs (exclut les archivés) est la SEULE vue de
  // cet écran "du quotidien" : compteurs, KPI et grille. Les archivés ont
  // leur propre page (/archives) — ils ne se mélangent jamais aux actifs ici.
  const { participants, participantsActifs, participantsArchives, loading: participantsLoading, addParticipant, archiverParticipant } = useParticipants();
  const { seancesDuJour, patientsARelancer, seances } = useAgenda();
  const { contratsARenouveler: contratsARenouvelerTous, contratsSansJours: contratsSansJoursTous } = useContrats();
  // Alertes du praticien : un bénéficiaire archivé n'est plus suivi, ses contrats n'appellent aucune
  // action (ils ne sont pas modifiés pour autant : ni statut, ni date de fin).
  const contratsARenouveler = contratsDesBeneficiairesActifs(contratsARenouvelerTous, participants);
  const contratsSansJours = contratsDesBeneficiairesActifs(contratsSansJoursTous, participants);
  const { structures, creerStructure } = useStructures();
  const { notes } = useJournalSeance();
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  // Archivage depuis une carte : confirmation avant d'écrire, pour éviter un clic accidentel.
  const [aArchiver, setAArchiver] = useState<{ id: string; nom: string } | null>(null);
  const [archivageEnCours, setArchivageEnCours] = useState(false);

  async function confirmerArchivage() {
    if (!aArchiver || archivageEnCours) return;
    setArchivageEnCours(true);
    try {
      await archiverParticipant(aArchiver.id, true);
      toast.success(`${aArchiver.nom} archivé(e). Retrouvez-le dans « Bénéficiaires archivés » ; son dossier est conservé.`);
      setAArchiver(null);
    } catch (err) {
      console.error('Erreur archivage:', err);
      toast.error("Erreur lors de l'archivage");
    } finally {
      setArchivageEnCours(false);
    }
  }
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
      // Alerte « à surveiller » : bénéficiaires suivis uniquement (un archivé peut encore
      // saisir des retours depuis son espace, ce n'est plus au praticien de le surveiller).
      const ids = participants.filter(p => !p.archive).map(p => p.id);
      if (ids.length === 0) return;
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

  // Grille : actifs uniquement. Plus de bascule « Afficher les archivés » qui
  // mélangeait les deux populations dans la même liste.
  const independants = participantsActifs.filter(p => !p.structureId);

  const filtered = filtrerParNom(independants, search);

  const filteredTous = filtrerParNom(participantsActifs, search);

  const listeFiltered = activeTab === 'tous' ? filteredTous : filtered;

  const needsBilan = participantsActifs.filter(p => {
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
            {participantsActifs.length} bénéficiaire{participantsActifs.length !== 1 ? 's' : ''} actuellement suivi{participantsActifs.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Onglets + accès à la page des archivés */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {([
            ['tous', `👥 Bénéficiaires actifs (${participantsActifs.length})`],
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
        <Link
          to="/archives"
          className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors"
        >
          🗄️ Bénéficiaires archivés ({participantsArchives.length})
        </Link>
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
              <AnimatedNumber value={participantsActifs.length} duration={0.8} />
            </div>
            <div
              className="mt-1 font-semibold uppercase"
              style={{ fontSize: 12, color: 'var(--color-ink-2)', letterSpacing: '0.5px', fontFamily: 'var(--font-sans)' }}
            >
              Bénéficiaires actifs
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

        {/* Contrats sans date de fin bloqués faute de jours de séance
            renseignés : le cron (api/cron/rappels.ts, tâche « renouvellement ») ne les
            renouvelle jamais dans cet état, indéfiniment jusqu'à correction —
            signalé ici plutôt que seulement dans les logs du cron. */}
        {contratsSansJours.length > 0 && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
              ⚠️ {contratsSansJours.length} contrat{contratsSansJours.length > 1 ? 's' : ''} sans date de fin sans jours de séance renseignés
            </div>
            <div className="space-y-1">
              {contratsSansJours.map(c => {
                const p = participants.find(x => x.id === c.participantId);
                return (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-amber-800">
                      <span className="font-medium">{p ? `${p.prenom} ${p.nom}` : '—'}</span>
                      {' '}— ne se renouvellera pas tant que les jours ne sont pas complétés
                    </span>
                    {p && (
                      <Link
                        to={`/participant/${p.id}`}
                        className="text-xs text-amber-700 underline hover:text-amber-900 font-medium"
                      >
                        Compléter →
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
                      nbPatients={patientsStr.filter(p => !p.archive).length}
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
                    <div className="flex flex-col gap-1.5">
                      <ParticipantCard
                        participant={p}
                        structureNom={p.structureId ? structures.find(s => s.id === p.structureId)?.nom : undefined}
                      />
                      <div className="flex justify-end px-1">
                        <button
                          type="button"
                          onClick={() => setAArchiver({ id: p.id, nom: `${p.prenom} ${p.nom}` })}
                          aria-label={`Archiver ${p.prenom} ${p.nom}`}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary border border-gray-200 hover:border-primary/40 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          <Archive size={12} /> Archiver
                        </button>
                      </div>
                    </div>
                  </FadeInCard>
                ))}
              </div>
            )}
          </>
        )}

        {aArchiver && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Confirmer l'archivage">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <h2 className="font-heading font-bold text-dark text-lg">Archiver {aArchiver.nom} ?</h2>
              <p className="text-sm text-gray-600">
                Cette personne quittera la liste des bénéficiaires actifs. Son dossier (bilans, séances, programmes,
                historique, facturation) est entièrement conservé, et vous pourrez la réactiver depuis « Bénéficiaires archivés ».
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={confirmerArchivage}
                  disabled={archivageEnCours}
                  className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-dark transition-colors disabled:opacity-60"
                >
                  {archivageEnCours ? 'Archivage…' : 'Archiver'}
                </button>
                <button
                  type="button"
                  onClick={() => setAArchiver(null)}
                  disabled={archivageEnCours}
                  className="px-5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-sm"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
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
                <Link to="/agenda-v2" className="text-xs text-primary hover:text-dark flex items-center gap-1 transition-colors">
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
