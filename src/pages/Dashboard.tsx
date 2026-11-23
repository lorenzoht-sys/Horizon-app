import { useState, lazy, Suspense, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import { useAgenda } from '../hooks/useAgenda';
import { useContrats } from '../hooks/useContrats';
import { useStructures } from '../hooks/useStructures';
import { useFacturesAValider, useFacturesValidees } from '../hooks/useFacturesAValider';
import { useJournalSeance } from '../hooks/useJournalSeance';
import ParticipantCard from '../components/participant/ParticipantCard';
import { contratsDesBeneficiairesActifs, filtrerParNom } from '../lib/archivage';
import PageWrapper from '../components/layout/PageWrapper';
import { Plus, Search, Users, FileSpreadsheet, Building2, ClipboardList, Mic, CalendarPlus } from 'lucide-react';
import { getAllBrouillons } from '../hooks/useBrouillonBilan';
import { toast } from 'sonner';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
import { chargerRetoursParBeneficiaire, ressentisPreoccupants } from '../lib/suiviBeneficiaire';
import { dateCivileParis, separerBrouillons } from '../lib/facturesAValider';
import { utilisateurCourant } from '../lib/session';
import { lirePraticien } from '../lib/acces/praticien';
import CarteStructure from '../components/structures/CarteStructure';
import ModalCreationStructure from '../components/structures/ModalCreationStructure';
import { GuideDemarrage } from '../components/demarrage/GuideDemarrage';
import { CarteProchainRendezVous } from '../components/tableau-de-bord/CarteProchainRendezVous';
import { CarteJournee } from '../components/tableau-de-bord/CarteJournee';
import { CarteAConfirmer } from '../components/tableau-de-bord/CarteAConfirmer';
import { CarteProchainsBilans } from '../components/tableau-de-bord/CarteProchainsBilans';
import { CarteFactures } from '../components/tableau-de-bord/CarteFactures';
import { CarteProgres } from '../components/tableau-de-bord/CarteProgres';
import { CarteAstuce } from '../components/tableau-de-bord/CarteAstuce';
import { LigneASurveiller } from '../components/tableau-de-bord/LigneASurveiller';
import { ChoixBeneficiaire } from '../components/tableau-de-bord/ChoixBeneficiaire';
import type { Participant, Seance } from '../types';
import {
  astuceDuJour, contexteBeneficiaire, delaiRendezVous, elementsATraiter, libelleRendezVous, phraseDuJour,
  prochainRendezVous, prochaineSeance, prochainsBilans, progresDepuisInitial, resumeFactures, seancesNonConfirmees,
  type Progres,
} from '../lib/tableauDeBord';

// Tableau de bord V1 (maquette validée par Lorenzo le 23/11/2026, canevas « dashboard
// professionnel : analyse, direction graphique, V1 »). Consigne : un outil métier du quotidien,
// humain, qui donne envie et qui explique. Ordre de la page : la journée (prochain rendez-vous,
// rendez-vous du jour), ce qui attend un geste (séances à confirmer, bilans, factures), ce qui
// avance (progrès, astuce), ce qui est à surveiller, puis les bénéficiaires.
// Remplace la refonte du matin même (PR #217), écartée par Lorenzo au profit de cette version.

const MiniMap = lazy(() => import('../components/map/MiniMap'));
// Import Excel chargé à l'ouverture de la fenêtre : la bibliothèque xlsx
// (≈ 410 Ko) sortait sinon dans le paquet initial (nettoyage, lot 1).
const ImportExcelModal = lazy(() => import('../components/import/ImportExcelModal'));

type DashTab = 'tous' | 'independants' | 'structures';
type ActionRapide = 'bilan' | 'dictee';

// Astuces écartées (« Plus tard ») : propres à ce navigateur, sans écriture en base avant la
// migration HDS. Le stockage peut être indisponible (navigation privée) : on retombe sur rien.
const CLE_ASTUCES = 'horizon.astucesEcartees';
function lireAstucesEcartees(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CLE_ASTUCES) ?? '[]') as string[]); } catch { return new Set(); }
}
function ecrireAstucesEcartees(cles: Set<string>) {
  try { localStorage.setItem(CLE_ASTUCES, JSON.stringify([...cles])); } catch { /* stockage indisponible */ }
}

function heureLocale(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const BOUTON_SECONDAIRE = 'flex items-center gap-2 h-[42px] px-3.5 rounded-[11px] bg-white text-[13px] font-bold hover:bg-gray-50 transition-colors';
const STYLE_SECONDAIRE = { border: '1.5px solid #D5E4E6', color: 'var(--color-ink)' };

export default function Dashboard() {
  // participantsActifs (exclut les archivés) est la seule population de cet écran du quotidien :
  // les archivés ont leur page (/archives).
  const { participants, participantsActifs, participantsArchives, loading: participantsLoading, addParticipant, archiverParticipant } = useParticipants();
  const { seancesDuJour, seances, modifierSeance, patientsARelancer } = useAgenda();
  const { notes } = useJournalSeance();
  const { contratsARenouveler: contratsARenouvelerTous, contratsSansJours: contratsSansJoursTous } = useContrats();
  // Un bénéficiaire archivé n'est plus suivi : ses contrats n'appellent aucune action.
  const contratsARenouveler = contratsDesBeneficiairesActifs(contratsARenouvelerTous, participants);
  const contratsSansJours = contratsDesBeneficiairesActifs(contratsSansJoursTous, participants);
  const { structures, creerStructure } = useStructures();
  // Factures : lecture seule, pour les compteurs du bloc « Factures en attente ».
  const { brouillons: brouillonsFactures, chargement: chargementBrouillons } = useFacturesAValider();
  const { factures, chargement: chargementFactures } = useFacturesValidees();
  const [prenomPraticien, setPrenomPraticien] = useState('');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [aArchiver, setAArchiver] = useState<{ id: string; nom: string } | null>(null);
  const [archivageEnCours, setArchivageEnCours] = useState(false);
  const [showCreateStructure, setShowCreateStructure] = useState(false);
  const [activeTab, setActiveTab] = useState<DashTab>('tous');
  const [minLoadDone, setMinLoadDone] = useState(false);
  const [retours, setRetours] = useState<Record<string, { borgRpe: number; bienEtre: number }[]>>({});
  const retoursCharges = useRef(false);
  const [confirmationEnCours, setConfirmationEnCours] = useState<string | null>(null);
  const [actionRapide, setActionRapide] = useState<ActionRapide | null>(null);
  const [astucesEcartees, setAstucesEcartees] = useState<Set<string>>(lireAstucesEcartees);
  // Heure courante, rafraîchie chaque minute : « dans 2 h 10 » et l'état des séances avancent seuls.
  const [maintenant, setMaintenant] = useState(() => new Date());
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const t = setTimeout(() => setMinLoadDone(true), 900);
    const minute = setInterval(() => setMaintenant(new Date()), 60_000);
    return () => { clearTimeout(t); clearInterval(minute); };
  }, []);

  useEffect(() => {
    // « Bonjour Pierre » : même lecture que le menu (Sidebar). Sans prénom, « Bonjour » seul.
    let annule = false;
    void (async () => {
      const user = await utilisateurCourant();
      if (!user || annule) return;
      const { data } = await lirePraticien(user.id, 'prenom');
      const prenom = (data as { prenom?: string | null } | null)?.prenom?.trim() ?? '';
      if (!annule) setPrenomPraticien(prenom);
    })();
    return () => { annule = true; };
  }, []);

  useEffect(() => {
    if (participantsLoading || participants.length === 0 || retoursCharges.current) return;
    retoursCharges.current = true;
    // Ressentis récents : alerte « à surveiller » et « la dernière fois » du prochain rendez-vous.
    // Bénéficiaires suivis uniquement (un archivé peut encore saisir des retours depuis son espace).
    const ids = participants.filter(p => !p.archive).map(p => p.id);
    if (ids.length > 0) void chargerRetoursParBeneficiaire(ids).then(setRetours);
  }, [participants, participantsLoading]);

  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab as DashTab);
      navigate('/', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

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

  async function marquerRealisee(s: Seance) {
    setConfirmationEnCours(s.id);
    const ok = await modifierSeance(s.id, { statut: 'realisee' });
    setConfirmationEnCours(null);
    if (ok) toast.success('Séance marquée comme réalisée : elle entrera dans la facture du mois.');
    else toast.error('La séance n’a pas pu être enregistrée. Réessayez dans un instant.');
  }

  function ecarterAstuce(cle: string) {
    const suivantes = new Set(astucesEcartees).add(cle);
    setAstucesEcartees(suivantes);
    ecrireAstucesEcartees(suivantes);
  }

  function choisirPour(p: Participant) {
    const action = actionRapide;
    setActionRapide(null);
    if (action === 'bilan') navigate(`/participant/${p.id}/bilan/new`);
    // La fiche ouvre la dictée d'elle-même (ParticipantProfile lit state.ouvrir).
    if (action === 'dictee') navigate(`/participant/${p.id}`, { state: { ouvrir: 'dictee' } });
  }

  if (participantsLoading || !minLoadDone) {
    return <PageWrapper><DashboardSkeleton /></PageWrapper>;
  }

  // ── Données de la page ────────────────────────────────────────────────────
  const aujourdhui = dateCivileParis(maintenant);
  const heure = heureLocale(maintenant);
  const nomDe = (id: string) => {
    const p = participants.find(x => x.id === id);
    return p ? `${p.prenom} ${p.nom}` : 'Bénéficiaire';
  };
  const actifs = new Set(participantsActifs.map(p => p.id));

  const journee = seancesDuJour(aujourdhui).filter(s => s.statut !== 'annulee');
  const prochain = prochainRendezVous(seances.filter(s => actifs.has(s.participantId)), aujourdhui, heure);
  const participantProchain = prochain ? participants.find(p => p.id === prochain.participantId) ?? null : null;
  const prochainAujourdhui = prochain && prochain.date === aujourdhui ? prochain : null;
  const aConfirmer = seancesNonConfirmees(seances, aujourdhui, heure).filter(s => actifs.has(s.participantId));
  const nbBilansAujourdhui = journee.filter(s => s.type !== 'seance' && s.statut === 'planifiee' && s.heureDebut.slice(0, 5) > heure).length;

  const bilansAPrevoir = prochainsBilans(participantsActifs, aujourdhui);
  const resume = resumeFactures(separerBrouillons(brouillonsFactures, aujourdhui).validables.length, factures);
  const progres = participantsActifs
    .map(p => ({ participant: p, progres: progresDepuisInitial(p.bilans) }))
    .filter((x): x is { participant: Participant; progres: Progres } => x.progres !== null)
    .slice(0, 3);
  const astuce = astuceDuJour(aujourdhui, astucesEcartees);

  const brouillonsBilan = getAllBrouillons().filter(b => actifs.has(b.participantId));
  const aSurveiller = elementsATraiter({
    // Les séances à confirmer ont leur propre bloc.
    nbSeancesNonConfirmees: 0,
    ressentis: participantsActifs.filter(p => ressentisPreoccupants(retours[p.id] ?? [])).map(p => ({ id: p.id, nom: `${p.prenom} ${p.nom}` })),
    brouillons: brouillonsBilan.map(b => ({ participantId: b.participantId, nom: nomDe(b.participantId), etape: b.etapeActuelle })),
    contratsARenouveler: contratsARenouveler.map(c => ({
      participantId: c.participantId, nom: nomDe(c.participantId),
      joursRestants: Math.max(0, Math.ceil((new Date(c.dateFin).getTime() - maintenant.getTime()) / 86400000)),
    })),
    contratsSansJours: contratsSansJours.map(c => ({ participantId: c.participantId, nom: nomDe(c.participantId) })),
  });
  // Repris de l'ancien tableau de bord (widget « Dernières notes » et ligne « sans séance depuis
  // plus de 3 semaines ») : deux signaux utiles, ramenés à une pastille chacun.
  for (const n of notes.filter(x => x.date === aujourdhui && x.alertes.douleurSignalee && actifs.has(x.participantId))) {
    aSurveiller.unshift({
      cle: `douleur-${n.id}`, type: 'douleur', gravite: 'haute',
      titre: 'Douleur signalée aujourd’hui', detail: nomDe(n.participantId), action: 'Voir', lien: `/participant/${n.participantId}`,
    });
  }
  const aRelancer = patientsARelancer(21).filter(p => actifs.has(p.id));
  if (aRelancer.length > 0) {
    aSurveiller.push({
      cle: 'relancer', type: 'relancer', gravite: 'normale',
      titre: aRelancer.length === 1 ? 'Sans séance depuis 3 semaines' : `${aRelancer.length} bénéficiaires sans séance depuis 3 semaines`,
      detail: aRelancer.slice(0, 2).map(p => `${p.prenom} ${p.nom}`).join(', ') + (aRelancer.length > 2 ? '…' : ''),
      action: 'Planifier', lien: '/agenda-v2',
    });
  }

  const independants = participantsActifs.filter(p => !p.structureId);
  const listeFiltered = filtrerParNom(activeTab === 'tous' ? participantsActifs : independants, search);

  return (
    <>
      <PageWrapper>
        <div className="flex flex-col gap-5">
          {/* En-tête : la journée racontée en une phrase, et les actions rapides. */}
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-[640px]">
              <p className="m-0 text-[13px] font-bold" style={{ color: '#147A64' }}>
                {(d => d.charAt(0).toUpperCase() + d.slice(1))(maintenant.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}
              </p>
              <h1 className="font-heading font-extrabold m-0 mt-0.5" style={{ fontSize: 28, color: 'var(--color-ink)', letterSpacing: '-0.3px' }}>
                {prenomPraticien ? `Bonjour ${prenomPraticien}` : 'Bonjour'}
              </h1>
              <p className="m-0 mt-1.5 text-[15px] leading-relaxed" style={{ color: '#3D4C5A' }}>
                {phraseDuJour({
                  nbRendezVous: journee.length,
                  prochainDans: prochainAujourdhui ? delaiRendezVous(prochainAujourdhui, aujourdhui, heure) : null,
                  nbAConfirmer: aConfirmer.length,
                  nbBilansAujourdhui,
                })}
              </p>
            </div>
            <div role="group" aria-label="Actions rapides" className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setActionRapide('bilan')} className={BOUTON_SECONDAIRE} style={STYLE_SECONDAIRE}>
                <ClipboardList size={16} style={{ color: '#1A9A7F' }} aria-hidden="true" /> Nouveau bilan
              </button>
              <button type="button" onClick={() => setActionRapide('dictee')} className={BOUTON_SECONDAIRE} style={STYLE_SECONDAIRE}>
                <Mic size={16} style={{ color: '#1A9A7F' }} aria-hidden="true" /> Dicter une séance
              </button>
              <Link to="/agenda-v2" className={BOUTON_SECONDAIRE} style={STYLE_SECONDAIRE}>
                <CalendarPlus size={16} style={{ color: '#1A9A7F' }} aria-hidden="true" /> Planifier
              </Link>
              <button type="button" onClick={() => setShowImport(true)} className={BOUTON_SECONDAIRE} style={STYLE_SECONDAIRE}>
                <FileSpreadsheet size={16} style={{ color: '#1A9A7F' }} aria-hidden="true" /> Import Excel
              </button>
              <button type="button" onClick={() => navigate('/participants/nouveau')}
                className="flex items-center gap-2 h-[42px] px-4 rounded-[11px] text-white text-[13px] font-bold hover:opacity-90"
                style={{ background: '#1A9A7F', boxShadow: '0 4px 14px rgba(26,154,127,0.28)' }}>
                <Plus size={16} aria-hidden="true" /> Nouveau bénéficiaire
              </button>
            </div>
          </header>

          {/* Guide de prise en main, replié en une ligne : il ne s'affiche que s'il reste une étape. */}
          <div className="empty:hidden">
            <GuideDemarrage replie />
          </div>

          {/* La journée */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-[18px]">
            <div className="lg:col-span-5 flex flex-col [&>section]:flex-1">
              <CarteProchainRendezVous
                seance={prochain}
                participant={participantProchain}
                contexte={contexteBeneficiaire(participantProchain?.bilans ?? [])}
                dernierRessenti={participantProchain ? retours[participantProchain.id]?.[0] ?? null : null}
                delai={prochain ? delaiRendezVous(prochain, aujourdhui, heure) : ''}
                quand={prochain ? libelleRendezVous(prochain, aujourdhui) : ''}
              />
            </div>
            <div className="lg:col-span-7 flex flex-col [&>section]:flex-1">
              <CarteJournee seances={journee} participants={participants} maintenant={heure} prochaineId={prochainAujourdhui?.id ?? null} />
            </div>
          </div>

          {/* Ce qui attend un geste */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[18px] items-start">
            <CarteAConfirmer seances={aConfirmer} participants={participants} aujourdhui={aujourdhui}
              enCours={confirmationEnCours} onMarquerRealisee={s => void marquerRealisee(s)} />
            <CarteProchainsBilans bilans={bilansAPrevoir} participants={participants} />
            <CarteFactures resume={resume} chargement={chargementBrouillons || chargementFactures} />
          </div>

          {/* Ce qui avance : les progrès, et une astuce pour apprendre en faisant */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-[18px]">
            <div className={`${astuce ? 'lg:col-span-8' : 'lg:col-span-12'} flex flex-col [&>section]:flex-1`}>
              <CarteProgres progres={progres} />
            </div>
            {astuce && (
              <div className="lg:col-span-4 flex flex-col [&>aside]:flex-1">
                <CarteAstuce astuce={astuce} onEcarter={() => ecarterAstuce(astuce.cle)} onAction={a => { if (a === 'dictee') setActionRapide('dictee'); }} />
              </div>
            )}
          </div>

          <LigneASurveiller elements={aSurveiller} />

          {/* Bénéficiaires suivis */}
          <section id="beneficiaires" aria-labelledby="titre-beneficiaires" className="flex flex-col gap-3.5 scroll-mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 flex-wrap">
                <h2 id="titre-beneficiaires" className="m-0 font-heading font-extrabold text-[19px]" style={{ color: 'var(--color-ink)' }}>
                  Bénéficiaires suivis <span className="font-semibold" style={{ color: 'var(--color-ink-2)' }}>({participantsActifs.length})</span>
                </h2>
                <div role="group" aria-label="Filtrer les bénéficiaires" className="flex gap-1 rounded-xl p-1 w-fit" style={{ background: '#E3ECEF' }}>
                  {([
                    ['tous', 'Tous'],
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
                      className={`px-3 h-[34px] rounded-[9px] text-[13px] transition-colors ${activeTab === tab ? 'bg-white text-primary-dark font-bold shadow-sm' : 'font-semibold hover:text-dark'}`}
                      style={activeTab === tab ? undefined : { color: 'var(--color-ink-2)' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {activeTab !== 'structures' && (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-ink-2)' }} aria-hidden="true" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Rechercher un bénéficiaire…"
                      aria-label="Rechercher un bénéficiaire"
                      className="w-64 bg-white focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all"
                      style={{ height: 40, paddingLeft: 40, paddingRight: 14, border: '1.5px solid #E2EEEE', borderRadius: 10, fontSize: 14, color: 'var(--color-ink)' }}
                    />
                  </div>
                  <Link to="/archives" className="text-[13px] font-bold text-primary-dark hover:underline">
                    Archivés ({participantsArchives.length})
                  </Link>
                </div>
              )}
            </div>

            {activeTab === 'structures' ? (
              <>
                <div className="flex justify-between items-center gap-3 flex-wrap">
                  <p className="m-0 text-sm" style={{ color: 'var(--color-ink-2)' }}>
                    {structures.length} structure{structures.length !== 1 ? 's' : ''} partenaire{structures.length !== 1 ? 's' : ''} (EHPAD, associations…)
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCreateStructure(true)}
                    className="flex items-center gap-2 text-white text-sm font-bold h-[42px] px-4 rounded-[11px] hover:opacity-90"
                    style={{ background: '#1A9A7F' }}
                  >
                    <Plus size={16} aria-hidden="true" /> Créer une structure
                  </button>
                </div>
                {structures.length === 0 ? (
                  <div className="text-center py-16 rounded-[20px]" style={{ border: '1.5px dashed #D5E4E6' }}>
                    <Building2 size={40} className="mx-auto mb-3" style={{ color: '#9DAFC0' }} aria-hidden="true" />
                    <p className="m-0 font-bold text-base" style={{ color: 'var(--color-ink)' }}>Aucune structure pour l’instant</p>
                    <p className="m-0 mt-1 text-sm" style={{ color: '#3D4C5A' }}>Créez une structure pour regrouper les bénéficiaires d’un EHPAD, d’un centre ou d’une association.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {structures.map(s => {
                      const patientsStr = participants.filter(p => p.structureId === s.id);
                      const seancesStr = seances.filter(se => patientsStr.some(p => p.id === se.participantId) && se.statut === 'realisee');
                      const derniere = seancesStr.sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
                      return (
                        <CarteStructure key={s.id} structure={s} nbPatients={patientsStr.filter(p => !p.archive).length} derniereSeance={derniere} />
                      );
                    })}
                  </div>
                )}
              </>
            ) : listeFiltered.length === 0 ? (
              <div className="text-center py-16 rounded-[20px]" style={{ border: '1.5px dashed #D5E4E6' }}>
                <Users size={40} className="mx-auto mb-3" style={{ color: '#9DAFC0' }} aria-hidden="true" />
                <p className="m-0 font-bold text-base" style={{ color: 'var(--color-ink)' }}>{search ? 'Aucun bénéficiaire trouvé' : 'Aucun bénéficiaire pour l’instant'}</p>
                <p className="m-0 mt-1 text-sm" style={{ color: '#3D4C5A' }}>{search ? 'Essayez un autre nom.' : 'Ajoutez votre premier bénéficiaire : son bilan initial apparaîtra dans « Prochains bilans ».'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {listeFiltered.map(p => {
                  const rdv = prochaineSeance(seances, p.id, aujourdhui, heure);
                  return (
                    <ParticipantCard
                      key={p.id}
                      participant={p}
                      structureNom={p.structureId ? structures.find(s => s.id === p.structureId)?.nom : undefined}
                      objectif={contexteBeneficiaire(p.bilans).objectif}
                      prochainRendezVous={rdv ? libelleRendezVous(rdv, aujourdhui) : null}
                      onArchiver={() => setAArchiver({ id: p.id, nom: `${p.prenom} ${p.nom}` })}
                    />
                  );
                })}
              </div>
            )}
          </section>

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

      {aArchiver && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Confirmer l'archivage">
          <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-heading font-extrabold text-lg m-0" style={{ color: 'var(--color-ink)' }}>Archiver {aArchiver.nom} ?</h2>
            <p className="text-sm m-0" style={{ color: '#3D4C5A' }}>
              Cette personne quittera la liste des bénéficiaires suivis. Son dossier (bilans, séances, programmes,
              historique, facturation) est entièrement conservé, et vous pourrez la réactiver depuis « Archivés ».
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={confirmerArchivage} disabled={archivageEnCours}
                className="flex-1 text-white rounded-[11px] h-[42px] font-bold text-sm hover:opacity-90 disabled:opacity-60" style={{ background: '#1A9A7F' }}>
                {archivageEnCours ? 'Archivage…' : 'Archiver'}
              </button>
              <button type="button" onClick={() => setAArchiver(null)} disabled={archivageEnCours}
                className="px-5 rounded-[11px] text-sm font-bold hover:bg-gray-50" style={{ border: '1.5px solid #D5E4E6', color: '#3D4C5A' }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {actionRapide && (
        <ChoixBeneficiaire
          titre={actionRapide === 'bilan' ? 'Nouveau bilan : pour qui ?' : 'Dicter une séance : pour qui ?'}
          participants={participantsActifs}
          suggeres={[...new Set(journee.map(s => s.participantId))]}
          onChoisir={choisirPour}
          onFermer={() => setActionRapide(null)}
        />
      )}

      {showImport && (
        <Suspense fallback={null}>
          <ImportExcelModal onClose={() => setShowImport(false)} participants={participants} addParticipant={addParticipant} />
        </Suspense>
      )}

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
