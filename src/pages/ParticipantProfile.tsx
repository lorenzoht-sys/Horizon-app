import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import {
  ArrowLeft, ChevronDown, Pencil, FileText, TrendingUp, Share2,
  Download, Trash2, Dumbbell, NotebookPen, Calendar, MapPin,
  RefreshCw, X, ClipboardList,
} from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import { useContrats } from '../hooks/useContrats';
import { useAgenda } from '../hooks/useAgenda';
import { useJournalSeance } from '../hooks/useJournalSeance';
import { getBrouillon } from '../hooks/useBrouillonBilan';
import PageWrapper from '../components/layout/PageWrapper';
import RadarChart from '../components/charts/RadarChart';
import ProgressCurve from '../components/charts/ProgressCurve';
import BilanTimeline from '../components/bilan/BilanTimeline';
import ContratsTab from '../components/participant/ContratsTab';
import JournalTab from '../components/journal/JournalTab';
import ParticipantForm from '../components/participant/ParticipantForm';
import NoteSeanceModal from '../components/journal/NoteSeanceModal';
import { RESSENTI_CONFIG } from '../components/journal/NoteSeanceModal';
import { exportFichePatientPDF } from '../utils/exportFichePatientPDF';
import { calculerNote, NORMES_SCORING } from '../data/norms';
import { TAG_CONFIG } from '../data/profiles';
import toast from 'react-hot-toast';
import type { Bilan, Participant, RessentiSeance, Contrat, Seance, ProfilHandicap } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const COULEURS_NOTE: Record<number, string> = {
  1: '#EF4444', 2: '#F97316', 3: '#F59E0B', 4: '#22C55E', 5: '#16A34A',
};

const TESTS_TABLEAU = [
  { label: 'Équilibre D', normeKey: 'equilibreUnipodal', unite: 's',     lower: false, getVal: (b: Bilan) => b.equilibre.droite },
  { label: 'Chair Stand', normeKey: 'chairStand30',      unite: ' rép.', lower: false, getVal: (b: Bilan) => b.chairStand30 },
  { label: 'HandGrip D',  normeKey: 'handGrip',          unite: ' kg',   lower: false, getVal: (b: Bilan) => b.handGrip.droite },
  { label: 'TUG 3m',      normeKey: 'tug3m',             unite: 's',     lower: true,  getVal: (b: Bilan) => b.tug3m },
  { label: 'TM6',         normeKey: 'tm6Distance',        unite: ' m',    lower: false, getVal: (b: Bilan) => b.tm6.distanceMetres },
  { label: 'Souplesse',   normeKey: 'souplesse',          unite: ' cm',   lower: false, getVal: (b: Bilan) => b.souplesse.valeur },
  { label: 'Mémoire',     normeKey: 'memoire',            unite: '/5',    lower: false, getVal: (b: Bilan) => b.memoire.scoreImmediat },
];

const METHODE_LABEL: Record<string, string> = {
  oral_note: 'oral noté', ecrit: 'écrit', numerique: 'numérique',
};

const AVATAR_COLORS = ['#1A5F9E', '#2BBFBF', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899'];
function avatarColor(id: string): string {
  return AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];
}

const PROFILS_HANDICAP: { id: ProfilHandicap; label: string; emoji: string }[] = [
  { id: 'fauteuil_roulant', label: 'Fauteuil roulant',    emoji: '♿' },
  { id: 'avc_hemiplegie',   label: 'AVC / Hémiplégie',    emoji: '🧠' },
  { id: 'parkinson',        label: 'Parkinson',            emoji: '🫸' },
  { id: 'sep',              label: 'Sclérose en plaques',  emoji: '🎗️' },
];

function calcAge(dateNaissance: string): number {
  const today = new Date(), birth = new Date(dateNaissance);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDateCourt(date: string): string {
  return new Date(date + 'T12:00').toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function loadSettings() {
  try { return { prenom: '', nom: '', titre: '', email: '', telephone: '', societe: '', logoPraticien: '', ...JSON.parse(localStorage.getItem('settings_praticien') || '{}') }; }
  catch { return { prenom: '', nom: '', titre: '', email: '', telephone: '', societe: '', logoPraticien: '' }; }
}

// ── CarteStats ────────────────────────────────────────────────────────────────

function CarteStats({ participant, contratActif, prochaineSeance }: {
  participant: Participant;
  contratActif: Contrat | null;
  prochaineSeance: Seance | null;
}) {
  const navigate = useNavigate();
  const joursAvantFin = contratActif
    ? differenceInDays(new Date(contratActif.dateFin), new Date()) : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-3">Suivi en cours</div>

      {contratActif ? (
        <>
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>Séances réalisées</span>
            <span className="font-bold text-dark">
              {contratActif.nombreSeancesRealisees} / {contratActif.nombreSeancesTotal}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full mb-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-secondary transition-all"
              style={{ width: `${Math.min(100, Math.round((contratActif.nombreSeancesRealisees / contratActif.nombreSeancesTotal) * 100))}%` }}
            />
          </div>
          <div className="space-y-1 text-xs text-gray-500">
            <div>📅 {contratActif.joursFixe.join(' + ')} · {contratActif.heureDebut} · {contratActif.dureeMinutes} min</div>
            <div>📆 {new Date(contratActif.dateDebut + 'T12:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })} → {new Date(contratActif.dateFin + 'T12:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</div>
          </div>

          {prochaineSeance && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full">
              <Calendar size={10} />
              Prochain RDV : {formatDateCourt(prochaineSeance.date)} · {prochaineSeance.heureDebut}
            </div>
          )}

          {joursAvantFin !== null && joursAvantFin <= 14 && joursAvantFin >= 0 && (
            <div className="mt-3 bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 text-xs text-warning font-semibold">
              ⏰ Contrat se termine dans {joursAvantFin} jour{joursAvantFin > 1 ? 's' : ''}
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-gray-400 italic">
          Aucun contrat actif
          <button
            onClick={() => navigate(`/participant/${participant.id}/contrat/nouveau`)}
            className="block mt-2 text-primary font-bold hover:underline"
          >
            + Créer un contrat →
          </button>
        </div>
      )}
    </div>
  );
}

// ── CarteSante ────────────────────────────────────────────────────────────────

function CarteSante({ participant, bilanInitial }: {
  participant: Participant;
  bilanInitial: Bilan | null;
}) {
  const profil = bilanInitial?.profilEnrichi;
  const lignes = ([
    participant.pathologie && { icon: '🏥', texte: participant.pathologie },
    participant.antecedentsMedicaux && { icon: '📋', texte: participant.antecedentsMedicaux },
    participant.antecedentsChirurgicaux && { icon: '✂️', texte: participant.antecedentsChirurgicaux },
    participant.allergies && { icon: '⚠️', texte: `Allergies : ${participant.allergies}` },
    profil?.douleursNiveau != null && { icon: '🔴', texte: `Douleur habituelle : ${profil.douleursNiveau}/10` },
    profil?.douleursLocalisation && { icon: '📍', texte: profil.douleursLocalisation },
    profil?.chutes12mois != null && { icon: '⚡', texte: `Chutes / 12 mois : ${profil.chutes12mois}` },
    profil?.objectifsPersonnels && { icon: '🎯', texte: profil.objectifsPersonnels },
  ] as ({ icon: string; texte: string } | false)[]).filter((l): l is { icon: string; texte: string } => Boolean(l));

  if (lignes.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-3">Profil de santé</div>
      <div className="space-y-2">
        {lignes.slice(0, 6).map((l, i) => (
          <div key={i} className="flex gap-2 text-xs text-gray-600 leading-relaxed">
            <span className="flex-shrink-0">{l.icon}</span>
            <span>{l.texte}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CarteProfilFonctionnel ────────────────────────────────────────────────────

function CarteProfilFonctionnel({ bilans, participant }: {
  bilans: Bilan[];
  participant: Participant;
}) {
  const sorted = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  const initial = sorted[0] ?? null;
  const current = sorted[sorted.length - 1] ?? null;
  if (!current) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold text-primary uppercase tracking-widest">Profil fonctionnel</div>
        {initial !== current && (
          <span className="text-xs text-gray-400">
            Initial → {new Date(current.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 items-start">
        <div>
          <RadarChart
            initial={initial !== current ? initial : null}
            current={current}
            testsActifs={participant.testsActifs}
          />
        </div>

        <div className="space-y-1">
          {TESTS_TABLEAU.map(test => {
            const val = test.getVal(current);
            const valInit = initial ? test.getVal(initial) : null;
            if (val === null || val === undefined) return null;
            const norme = NORMES_SCORING[test.normeKey];
            const note = norme ? calculerNote(val, norme) : null;
            const delta = valInit !== null && valInit !== undefined ? val - valInit : null;
            const progression = delta !== null ? (test.lower ? -delta : delta) : null;
            return (
              <div key={test.label} className="flex items-center gap-1.5 py-1 border-b border-gray-50 last:border-0">
                <span className="text-[11px] text-gray-400 w-16 flex-shrink-0 truncate">{test.label}</span>
                <span className="text-xs font-bold text-dark flex-1">
                  {test.label === 'Souplesse' && val > 0 ? '+' : ''}{val}{test.unite}
                </span>
                {note !== null && (
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                    style={{ fontSize: 9, background: COULEURS_NOTE[note] }}
                  >
                    {note}
                  </span>
                )}
                {progression !== null && (
                  <span className={`text-[10px] font-bold flex-shrink-0 ${progression > 0 ? 'text-green-600' : progression < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {progression > 0 ? '↑' : progression < 0 ? '↓' : '='}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── CarteJournal ──────────────────────────────────────────────────────────────

function CarteJournal({ notes, onAjouter }: {
  notes: import('../types').NoteSeance[];
  onAjouter: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold text-primary uppercase tracking-widest">Journal récent</div>
        <button
          onClick={onAjouter}
          className="bg-primary/10 text-primary text-[11px] font-bold px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors"
        >
          + Note
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Aucune note de séance.</p>
      ) : (
        <div>
          {notes.map((note, i) => {
            const r = note.ressenti ? RESSENTI_CONFIG[note.ressenti as RessentiSeance] : null;
            const alertes = Object.entries(note.alertes).filter(([, v]) => v);
            const ALERT_EMOJI: Record<string, string> = {
              douleurSignalee: '⚠️', fatiguePlusQueHabitude: '😓',
              progressionNotable: '🎉', pointARevoir: '📌',
            };
            return (
              <div key={note.id} className={`flex gap-2.5 py-2 ${i < notes.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <span className="text-base flex-shrink-0 mt-0.5">{r?.emoji ?? '📝'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-[11px] text-gray-400">{formatDateCourt(note.date)} · {note.heureDebut}</span>
                    {r && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white"
                        style={{ background: r.color }}>{r.label}</span>
                    )}
                    {alertes.map(([key]) => (
                      <span key={key} className="text-[10px]">{ALERT_EMOJI[key]}</span>
                    ))}
                  </div>
                  {note.note && (
                    <p className="text-[11px] text-dark leading-snug truncate">"{note.note}"</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── SectionAccordeon ──────────────────────────────────────────────────────────

function SectionAccordeon({ titre, badge, children }: {
  titre: string;
  badge?: number;
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-3">
      <button
        onClick={() => setOuvert(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50/70 rounded-2xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-heading font-semibold text-dark text-sm">{titre}</span>
          {badge !== undefined && badge > 0 && (
            <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">{badge}</span>
          )}
        </div>
        <ChevronDown size={15} className={`text-gray-400 transition-transform duration-200 ${ouvert ? 'rotate-180' : ''}`} />
      </button>
      {ouvert && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ParticipantProfile() {
  const { id } = useParams<{ id: string }>();
  const { participants, updateParticipant, deleteParticipant, geocodeParticipant } = useParticipants();
  const { contrats } = useContrats();
  const { seances } = useAgenda();
  const { notesParPatient, derniereNote } = useJournalSeance();
  const navigate = useNavigate();
  const settings = loadSettings();

  const [menuOuvert, setMenuOuvert]     = useState(false);
  const [showEdit, setShowEdit]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [geocoding, setGeocoding]       = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [showProfilPicker, setShowProfilPicker] = useState(false);

  const participant = participants.find(p => p.id === id);
  if (!participant) return (
    <PageWrapper>
      <div className="text-center py-20 text-gray-400">Participant introuvable</div>
    </PageWrapper>
  );

  const sortedBilans = [...participant.bilans].sort((a, b) => a.date.localeCompare(b.date));
  const bilanInitial = participant.bilans.find(b => b.type === 'initial') ?? null;
  const contreIndicationsTexte: string | null =
    bilanInitial?.bilanInitialData?.formulaireFlat?.data?.contreIndications === 'oui'
      ? (bilanInitial.bilanInitialData?.formulaireFlat?.data?.contreIndicationsDetail ?? null)
      : null;
  const latestBilan  = sortedBilans[sortedBilans.length - 1] ?? null;
  const contratActif = contrats.find(c => c.participantId === participant.id && c.statut === 'actif') ?? null;
  const notes        = notesParPatient(participant.id);
  const lastNote     = derniereNote(participant.id);
  const color        = avatarColor(participant.id);
  const age          = calcAge(participant.dateNaissance);
  const today        = new Date().toISOString().slice(0, 10);
  const imc = participant.taille && participant.poids
    ? Math.round((participant.poids / ((participant.taille / 100) ** 2)) * 10) / 10 : null;
  const joursDepuisBilan = latestBilan
    ? Math.floor((Date.now() - new Date(latestBilan.date).getTime()) / 86400000) : Infinity;
  const prochaineSeance = seances
    .filter(s => s.participantId === participant.id && s.statut === 'planifiee' && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  const hasAddress = Boolean(participant.adresseRue?.trim() && participant.adresseVille?.trim());

  function handleAction(action: string) {
    setMenuOuvert(false);
    switch (action) {
      case 'modifier':        setShowEdit(true); break;
      case 'evolution':       navigate(`/participant/${id}/comparaison`); break;
      case 'pdf_fiche':       handleExportFiche(); break;
      case 'lien':            copyClientLink(); break;
      case 'export':          handleExport(); break;
      case 'supprimer':       setConfirmDelete(true); break;
      case 'programme':       navigate(`/participant/${id}/programme`); break;
      case 'nouveau_bilan':   navigate(`/participant/${id}/bilan/new`); break;
      case 'note_seance':     setShowNoteModal(true); break;
      case 'nouveau_contrat': navigate(`/participant/${id}/contrat/nouveau`); break;
      case 'rgpd':            setShowEdit(true); break;
    }
  }

  async function handleExportFiche() {
    setExportingPDF(true);
    try {
      await exportFichePatientPDF(
        { participant: participant!, bilanInitial, contratActif, settings },
        `Fiche_${participant!.nom}_${participant!.prenom}_MouvAPA.pdf`
      );
    } finally { setExportingPDF(false); }
  }

  function copyClientLink() {
    navigator.clipboard.writeText(`${window.location.origin}/client/${participant!.token}`);
    toast.success('Lien copié !');
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(participant, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `donnees_${participant!.prenom}_${participant!.nom}_${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export téléchargé');
  }

  function handleGeocode() {
    setGeocoding(true);
    geocodeParticipant(participant!.id);
    setTimeout(() => setGeocoding(false), 4000);
  }

  function handleEditSubmit(data: Omit<Participant, 'id' | 'token' | 'bilans'>) {
    updateParticipant(participant!.id, data);
    setShowEdit(false);
    toast.success('Fiche mise à jour !');
  }

  const MENU_ACTIONS = [
    { Icon: Pencil,    label: 'Modifier le patient',    action: 'modifier' },
    { Icon: FileText,  label: 'Fiche patient PDF',      action: 'pdf_fiche' },
    { Icon: TrendingUp,label: "Rapport d'évolution",    action: 'evolution', disabled: participant.bilans.length < 2 },
    { Icon: Share2,    label: 'Lien client',             action: 'lien' },
    { Icon: Download,  label: 'Mes données (JSON)',      action: 'export' },
    { Icon: Trash2,    label: 'Supprimer',               action: 'supprimer', danger: true },
  ];

  return (
    <PageWrapper>
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-primary mb-4 transition-colors">
        <ArrowLeft size={14} /> Tableau de bord
      </Link>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div className="rounded-2xl mb-4" style={{ background: '#0D2B2B' }}>
        <div className="p-5">

          {/* Ligne 1 : avatar + identité + menu */}
          <div className="flex items-start gap-3">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
              style={{ background: color }}
            >
              {participant.prenom[0]}{participant.nom[0]}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="font-heading font-bold text-white text-xl leading-tight">
                {participant.prenom} {participant.nom}
              </h1>
              <div className="text-white/55 text-xs mt-0.5 space-y-0.5 leading-relaxed">
                <div>
                  {age} ans · né(e) le {new Date(participant.dateNaissance).toLocaleDateString('fr-FR')}
                  {participant.taille && ` · ${participant.taille} cm`}
                  {participant.poids && ` · ${participant.poids} kg`}
                  {imc && ` · IMC ${imc}`}
                </div>
                {(participant.telephone || participant.email) && (
                  <div>
                    {participant.telephone && `📞 ${participant.telephone}`}
                    {participant.telephone && participant.email && ' · '}
                    {participant.email && `✉️ ${participant.email}`}
                  </div>
                )}
                {hasAddress && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span>📍 {participant.adresseRue}, {participant.adresseCodePostal} {participant.adresseVille}</span>
                    {participant.coordonnees
                      ? <MapPin size={10} className="text-green-400" />
                      : !geocoding
                        ? <button onClick={handleGeocode} className="text-secondary underline">Localiser</button>
                        : <RefreshCw size={10} className="animate-spin text-secondary" />
                    }
                  </div>
                )}
              </div>

              {participant.tags && participant.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {participant.tags.map(tag => (
                    <span key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                      style={{ background: TAG_CONFIG[tag].color }}
                    >
                      {TAG_CONFIG[tag].emoji} {TAG_CONFIG[tag].label}
                    </span>
                  ))}
                  {participant.contexteClinic && (
                    <span className="text-xs text-white/45 italic">"{participant.contexteClinic}"</span>
                  )}
                </div>
              )}

              {/* Badge contre-indications */}
              {contreIndicationsTexte && (
                <div className="mt-2 flex items-start gap-2 bg-red-900/30 border border-red-500/50 rounded-xl px-3 py-2">
                  <span className="flex-shrink-0 text-sm">⚠️</span>
                  <div>
                    <span className="text-xs font-bold text-red-300 uppercase tracking-wide">Contre-indications à l'effort</span>
                    <p className="text-xs text-red-200 mt-0.5 leading-relaxed">{contreIndicationsTexte}</p>
                  </div>
                </div>
              )}

              {/* Profil handicap */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {participant.profilHandicap && (() => {
                  const p = PROFILS_HANDICAP.find(x => x.id === participant.profilHandicap);
                  return p ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ background: '#0D5050' }}>
                      {p.emoji} {p.label}
                    </span>
                  ) : null;
                })()}
                <div className="relative">
                  <button
                    onClick={() => setShowProfilPicker(v => !v)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-white/30 text-white/60 hover:text-white hover:border-white/50 transition-colors"
                  >
                    ♿ {participant.profilHandicap ? 'Modifier le profil' : '+ Profil handicap'}
                  </button>
                  {showProfilPicker && (
                    <>
                      <div className="fixed inset-0 z-50" onClick={() => setShowProfilPicker(false)} />
                      <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-xl z-50 py-1 min-w-[210px] border border-gray-100">
                        {participant.profilHandicap && (
                          <button
                            onClick={() => { updateParticipant(id!, { profilHandicap: undefined }); setShowProfilPicker(false); }}
                            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
                          >
                            ✕ Retirer le profil
                          </button>
                        )}
                        {PROFILS_HANDICAP.map(p => (
                          <button
                            key={p.id}
                            onClick={() => { updateParticipant(id!, { profilHandicap: p.id }); setShowProfilPicker(false); }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${participant.profilHandicap === p.id ? 'bg-teal-50 text-teal-800 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                          >
                            {p.emoji} {p.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Menu ··· */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setMenuOuvert(v => !v)}
                className="text-white/60 hover:text-white hover:bg-white/10 px-3 py-2 rounded-lg font-bold text-lg transition-colors"
              >
                ···
              </button>
              {menuOuvert && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOuvert(false)} />
                  <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-xl z-50 py-2 w-52 border border-gray-100">
                    {MENU_ACTIONS.map(item => (
                      <button
                        key={item.action}
                        onClick={() => !item.disabled && handleAction(item.action)}
                        disabled={item.disabled}
                        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors text-left
                          ${item.danger ? 'text-red-500 hover:bg-red-50' : 'text-dark hover:bg-gray-50'}
                          ${item.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <item.Icon size={13} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Ligne 2 : alertes */}
          <div className="flex flex-wrap gap-2 mt-3">
            {/* Brouillon bilan en cours */}
            {(() => {
              const b = getBrouillon(participant.id);
              if (!b) return null;
              return (
                <button
                  onClick={() => handleAction('nouveau_bilan')}
                  className="flex items-center gap-1.5 bg-amber-400/20 text-amber-300 text-xs font-bold px-3 py-1 rounded-full hover:bg-amber-400/30 transition-colors"
                >
                  📋 Bilan en cours — {b.completionPct}% · Reprendre →
                </button>
              );
            })()}
            {joursDepuisBilan > 85 && (
              <span className="bg-warning/20 text-warning text-xs font-bold px-3 py-1 rounded-full">
                ⏰ Bilan à planifier ({joursDepuisBilan}j)
              </span>
            )}
            {!participant.rgpd?.consentementObtenu ? (
              <button
                onClick={() => handleAction('rgpd')}
                className="bg-red-900/40 text-red-300 text-xs font-bold px-3 py-1 rounded-full hover:bg-red-900/60 transition-colors"
              >
                ⚠️ RGPD manquant — Régulariser
              </button>
            ) : (
              <span className="bg-green-900/30 text-green-300 text-xs px-3 py-1 rounded-full">
                ✅ RGPD · {METHODE_LABEL[participant.rgpd.methodeConsentement] ?? participant.rgpd.methodeConsentement}
              </span>
            )}
            {lastNote && (() => {
              const r = lastNote.ressenti ? RESSENTI_CONFIG[lastNote.ressenti as RessentiSeance] : null;
              return (
                <span className="bg-white/10 text-white/60 text-xs px-3 py-1 rounded-full">
                  {r?.emoji ?? '📝'} Séance : {formatDateCourt(lastNote.date)}
                </span>
              );
            })()}
          </div>

          {/* Ligne 3 : boutons d'action */}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => handleAction('nouveau_bilan')}
              className="flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3.5 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Nouveau bilan
            </button>
            <button
              onClick={() => handleAction('programme')}
              className="flex items-center gap-1.5 bg-white/10 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-white/20 transition-colors border border-white/20"
            >
              <Dumbbell size={11} /> Programme
            </button>
            <button
              onClick={() => handleAction('note_seance')}
              className="flex items-center gap-1.5 bg-white/10 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-white/20 transition-colors border border-white/20"
            >
              <NotebookPen size={11} /> Note séance
            </button>
            <button
              onClick={() => handleAction('nouveau_contrat')}
              className="flex items-center gap-1.5 bg-white/10 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-white/20 transition-colors border border-white/20"
            >
              <ClipboardList size={11} /> Contrat
            </button>
            {participant.bilans.length >= 2 && (
              <button
                onClick={() => handleAction('evolution')}
                className="flex items-center gap-1.5 bg-secondary/20 text-secondary text-xs font-bold px-3 py-2 rounded-lg hover:bg-secondary/30 transition-colors border border-secondary/30"
              >
                <TrendingUp size={11} /> Évolution
              </button>
            )}
            <button
              onClick={handleExportFiche}
              disabled={exportingPDF}
              className="flex items-center gap-1.5 bg-white/10 text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-white/20 transition-colors border border-white/20 disabled:opacity-50"
            >
              <FileText size={11} /> {exportingPDF ? 'PDF…' : 'Fiche PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* ── GRILLE PRINCIPALE ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 mb-4">
        <div className="flex flex-col gap-3">
          <CarteStats participant={participant} contratActif={contratActif} prochaineSeance={prochaineSeance} />
          <CarteSante participant={participant} bilanInitial={bilanInitial} />
        </div>
        <div className="flex flex-col gap-3">
          {latestBilan && <CarteProfilFonctionnel bilans={participant.bilans} participant={participant} />}
          <CarteJournal notes={notes.slice(0, 4)} onAjouter={() => handleAction('note_seance')} />
        </div>
      </div>

      {/* ── SECTIONS ACCORDÉON ─────────────────────────────────── */}
      <SectionAccordeon titre="📊 Historique des bilans" badge={participant.bilans.length}>
        <BilanTimeline bilans={participant.bilans} participantId={participant.id} />
        {sortedBilans.length > 1 && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <div className="text-xs font-semibold text-gray-500 mb-3">Courbes de progression</div>
            <ProgressCurve bilans={sortedBilans} />
          </div>
        )}
      </SectionAccordeon>

      <SectionAccordeon titre="📋 Contrats de suivi">
        <ContratsTab participantId={participant.id} />
      </SectionAccordeon>

      <SectionAccordeon titre="📓 Journal des séances" badge={notes.length}>
        <JournalTab participant={participant} />
      </SectionAccordeon>

      {/* ── MODALS ─────────────────────────────────────────────── */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-heading font-bold text-dark text-lg">Modifier la fiche</h2>
                <p className="text-sm text-gray-400 mt-0.5">{participant.prenom} {participant.nom}</p>
              </div>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-dark p-1 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <ParticipantForm initial={participant} onSubmit={handleEditSubmit} onCancel={() => setShowEdit(false)} />
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <h2 className="font-heading font-bold text-dark text-lg">Supprimer ce patient ?</h2>
            </div>
            <p className="text-sm text-gray-600 mb-1">
              Vous allez supprimer <strong>{participant.prenom} {participant.nom}</strong> et toutes ses données.
            </p>
            <ul className="text-xs text-gray-400 mb-4 pl-4 list-disc space-y-0.5">
              <li>{participant.bilans.length} bilan{participant.bilans.length !== 1 ? 's' : ''}</li>
              <li>{participant.programmes?.length ?? 0} programme{(participant.programmes?.length ?? 0) !== 1 ? 's' : ''}</li>
            </ul>
            <p className="text-xs text-red-500 font-semibold mb-4">⚠ Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button
                onClick={() => {
                  deleteParticipant(participant.id);
                  toast.success(`${participant.prenom} ${participant.nom} supprimé(e).`);
                  navigate('/');
                }}
                className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors">
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoteModal && (
        <NoteSeanceModal
          participantId={participant.id}
          participantNom={`${participant.prenom} ${participant.nom}`}
          onClose={() => setShowNoteModal(false)}
        />
      )}

    </PageWrapper>
  );
}
