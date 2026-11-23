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
import PageWrapper from '../components/layout/PageWrapper';
import { Plus, Search, Users, BarChart3, FileSpreadsheet, CalendarDays, ChevronRight, NotebookPen, AlertCircle, Building2 } from 'lucide-react';
import { useJournalSeance } from '../hooks/useJournalSeance';
import { RESSENTI_CONFIG } from '../components/journal/NoteSeanceModal';
import { getAllBrouillons } from '../hooks/useBrouillonBilan';
import { toast } from 'sonner';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
import { chargerAssiduite7Jours, chargerRetoursParBeneficiaire, ressentisPreoccupants } from '../lib/suiviBeneficiaire';
import CarteStructure from '../components/structures/CarteStructure';
import ModalCreationStructure from '../components/structures/ModalCreationStructure';
import { GuideDemarrage } from '../components/demarrage/GuideDemarrage';
import { TuileChiffre } from '../components/tableau-de-bord/TuileChiffre';
import { CarteAujourdhui } from '../components/tableau-de-bord/CarteAujourdhui';
import { CarteATraiter } from '../components/tableau-de-bord/CarteATraiter';
import { bilanAFaire, bornesSemaine, elementsATraiter, libelleRendezVous, prochaineSeance, seancesNonConfirmees } from '../lib/tableauDeBord';

const MiniMap = lazy(() => import('../components/map/MiniMap'));
// Import Excel chargé à l'ouverture de la fenêtre : la bibliothèque xlsx
// (≈ 410 Ko) sortait sinon dans le paquet initial (nettoyage, lot 1).
const ImportExcelModal = lazy(() => import('../components/import/ImportExcelModal'));

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
    if (assiduiteLoaded.current) return;
    assiduiteLoaded.current = true;
    void chargerAssiduite7Jours().then(setAssiduite);
  }, []);

  useEffect(() => {
    if (participantsLoading || participants.length === 0 || retoursSurvLoaded.current) return;
    retoursSurvLoaded.current = true;
    async function loadRetoursSurveillance() {
      // Alerte « à surveiller » : bénéficiaires suivis uniquement (un archivé peut encore
      // saisir des retours depuis son espace, ce n'est plus au praticien de le surveiller).
      const ids = participants.filter(p => !p.archive).map(p => p.id);
      if (ids.length === 0) return;
      const parBeneficiaire = await chargerRetoursParBeneficiaire(ids);
      const alertes: { id: string; prenom: string; nom: string }[] = [];
      for (const [pid, retours] of Object.entries(parBeneficiaire)) {
        if (!ressentisPreoccupants(retours)) continue;
        const p = participants.find(x => x.id === pid);
        if (p) alertes.push({ id: p.id, prenom: p.prenom, nom: p.nom });
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

  // Même règle que l'échéance affichée sur chaque carte (src/lib/tableauDeBord.ts).
  const needsBilan = participantsActifs.filter(p => bilanAFaire(p.bilans, new Date().toISOString().slice(0, 10))).length;

  // Bénéficiaires actifs seulement, comme les autres chiffres de l'écran (avant le 23/11/2026,
  // les bilans des archivés étaient comptés aussi).
  const moisCourant = new Date().toISOString().slice(0, 7);
  const thisMonthBilans = participantsActifs.reduce((acc, p) => acc + p.bilans.filter(b => b.date.slice(0, 7) === moisCourant).length, 0);

  if (participantsLoading || !minLoadDone) {
    return <PageWrapper><DashboardSkeleton /></PageWrapper>;
  }

  // ── Données de la mise en page (refonte du 23/11/2026, maquette validée par Lorenzo) ──
  const maintenant = new Date();
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  const heure = `${String(maintenant.getHours()).padStart(2, '0')}:${String(maintenant.getMinutes()).padStart(2, '0')}`;
  const { lundi, dimanche } = bornesSemaine(aujourdhui);
  const seancesSemaine = seances.filter(s => s.date >= lundi && s.date <= dimanche && s.statut !== 'annulee').length;
  const nomDe = (id: string) => {
    const p = participants.find(x => x.id === id);
    return p ? `${p.prenom} ${p.nom}` : 'Bénéficiaire';
  };
  const brouillons = getAllBrouillons().filter(b => participantsActifs.some(p => p.id === b.participantId));
  const elements = elementsATraiter({
    nbSeancesNonConfirmees: seancesNonConfirmees(seances, aujourdhui, heure).length,
    ressentis: patientsASurveiller.map(p => ({ id: p.id, nom: `${p.prenom} ${p.nom}` })),
    brouillons: brouillons.map(b => ({ participantId: b.participantId, nom: nomDe(b.participantId), etape: b.etapeActuelle })),
    contratsARenouveler: contratsARenouveler.map(c => ({
      participantId: c.participantId, nom: nomDe(c.participantId),
      joursRestants: Math.max(0, Math.ceil((new Date(c.dateFin).getTime() - maintenant.getTime()) / 86400000)),
    })),
    contratsSansJours: contratsSansJours.map(c => ({ participantId: c.participantId, nom: nomDe(c.participantId) })),
  });

  return (
    <>
      <PageWrapper>
        <div className="flex flex-col gap-[22px]">
        {/* En-tête de page */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading font-bold m-0" style={{ fontSize: 26, color: 'var(--color-ink)', lineHeight: 1.2 }}>
              Tableau de bord
            </h1>
            <p className="mt-1 m-0" style={{ fontSize: 14, color: 'var(--color-ink-2)' }}>
              <span className="capitalize">{maintenant.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              {' · '}{participantsActifs.length} bénéficiaire{participantsActifs.length !== 1 ? 's' : ''} actuellement suivi{participantsActifs.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            <motion.button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 text-sm font-semibold"
              style={{ height: 44, padding: '0 18px', background: '#FFFFFF', border: '1.5px solid var(--color-teal)', borderRadius: 10, color: 'var(--color-teal-dark)', cursor: 'pointer' }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.1 }}
            >
              <FileSpreadsheet size={16} aria-hidden="true" /> Import Excel
            </motion.button>
            <motion.button
              onClick={() => navigate('/participants/nouveau')}
              className="flex items-center gap-2 text-white text-sm font-bold"
              style={{ height: 44, padding: '0 18px', background: 'var(--color-teal)', border: 'none', borderRadius: 10, cursor: 'pointer', boxShadow: 'var(--shadow-primary, 0 4px 14px rgba(43,184,154,0.28))' }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.1 }}
            >
              <Plus size={16} aria-hidden="true" /> Nouveau bénéficiaire
            </motion.button>
          </div>
        </div>

        {/* Guide de prise en main, replié en une ligne : il ne s'affiche que s'il reste une étape. */}
        <div className="empty:hidden">
          <GuideDemarrage replie />
        </div>

        {/* Chiffres clés, chacun avec sa définition (glossaire : claude/onboarding.md) */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <FadeInCard delay={0}>
            <TuileChiffre icone={Users} valeur={participantsActifs.length} libelle="Bénéficiaires actifs" aide="suivis en ce moment (non archivés)" />
          </FadeInCard>
          <FadeInCard delay={0.04}>
            <TuileChiffre icone={CalendarDays} valeur={seancesSemaine} libelle="Séances cette semaine" aide="du lundi au dimanche, hors annulées" />
          </FadeInCard>
          <FadeInCard delay={0.08}>
            <TuileChiffre icone={BarChart3} valeur={thisMonthBilans} libelle="Bilans ce mois" aide={`bilans réalisés en ${maintenant.toLocaleDateString('fr-FR', { month: 'long' })}`} />
          </FadeInCard>
          <FadeInCard delay={0.12}>
            <TuileChiffre icone={AlertCircle} valeur={needsBilan} libelle="Bilans à faire" aide="aucun bilan depuis 3 mois" alerte={needsBilan > 0} />
          </FadeInCard>
        </div>

        {/* Journée et points à traiter, côte à côte en haut de page */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-stretch">
          <div className="lg:col-span-3">
            <CarteAujourdhui seances={seancesDuJour(aujourdhui)} participants={participants} maintenant={heure} nbARelancer={patientsARelancer(21).length} />
          </div>
          <div className="lg:col-span-2">
            <CarteATraiter elements={elements} />
          </div>
        </div>

        {/* Filtres + recherche */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Filtrer les bénéficiaires" className="flex gap-1 rounded-xl p-1 w-fit" style={{ background: '#E3ECEF' }}>
            {([
              ['tous', `Tous les actifs (${participantsActifs.length})`],
              ['independants', `Sans structure (${independants.length})`],
              // Ce filtre affiche les structures elles-mêmes (cartes EHPAD, associations), pas des
              // bénéficiaires : il garde donc le nom « Structures » et leur nombre (e2e 17).
              ['structures', `Structures (${structures.length})`],
            ] as [DashTab, string][]).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                aria-pressed={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-2 rounded-[9px] text-[13px] transition-colors ${
                  activeTab === tab ? 'bg-white text-primary-dark font-bold shadow-sm' : 'font-semibold hover:text-dark'
                }`}
                style={activeTab === tab ? undefined : { color: 'var(--color-ink-2)' }}
              >
                {label}
              </button>
            ))}
          </div>
          {activeTab !== 'structures' && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ink-3)' }} aria-hidden="true" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un bénéficiaire…"
                  aria-label="Rechercher un bénéficiaire"
                  className="w-72 bg-white focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all"
                  style={{ height: 42, paddingLeft: 40, paddingRight: 14, border: '1.5px solid #E2EEEE', borderRadius: 10, fontSize: 14, color: 'var(--color-ink)' }}
                />
              </div>
              <Link to="/archives" className="text-[13px] font-bold text-primary-dark hover:underline">
                Archivés ({participantsArchives.length})
              </Link>
            </div>
          )}
        </div>

        {/* Contenu selon le filtre */}
        {activeTab === 'structures' ? (
          <>
            <div className="flex justify-between items-center gap-3 flex-wrap">
              <p className="m-0 text-sm" style={{ color: 'var(--color-ink-2)' }}>
                {structures.length} structure{structures.length !== 1 ? 's' : ''} partenaire{structures.length !== 1 ? 's' : ''} (EHPAD, associations…)
              </p>
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
          </>
        ) : listeFiltered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Users size={56} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium text-lg">Aucun bénéficiaire trouvé</p>
            <p className="text-sm mt-1">{search ? 'Essayez un autre nom' : 'Commencez par ajouter un bénéficiaire'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {listeFiltered.map((p, i) => {
              const rdv = prochaineSeance(seances, p.id, aujourdhui, heure);
              return (
                <FadeInCard key={p.id} delay={0.1 + Math.min(i, 8) * 0.04}>
                  <ParticipantCard
                    participant={p}
                    structureNom={p.structureId ? structures.find(s => s.id === p.structureId)?.nom : undefined}
                    assiduite={assiduite[p.id]?.taux ?? null}
                    prochainRendezVous={rdv ? libelleRendezVous(rdv, aujourdhui) : null}
                    onArchiver={() => setAArchiver({ id: p.id, nom: `${p.prenom} ${p.nom}` })}
                  />
                </FadeInCard>
              );
            })}
          </div>
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
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
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

        {/* Carte — en bas de page */}
        {participants.some(p => p.coordonnees) && (
          <div>
            <Suspense fallback={<div className="h-[260px] bg-gray-100 rounded-2xl animate-pulse" />}>
              <MiniMap participants={participants} />
            </Suspense>
          </div>
        )}
        </div>
      </PageWrapper>


      {/* Modal import Excel */}
      {showImport && (
        <Suspense fallback={null}>
          <ImportExcelModal onClose={() => setShowImport(false)} participants={participants} addParticipant={addParticipant} />
        </Suspense>
      )}

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
