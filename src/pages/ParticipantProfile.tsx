import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ParticipantProfileMobile from './ParticipantProfileMobile';
import { differenceInDays } from 'date-fns';
import {
  ArrowLeft, Pencil, FileText, TrendingUp, Share2,
  Download, Trash2, Dumbbell, NotebookPen, Calendar, MapPin,
  RefreshCw, X, ClipboardList, Mic, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import { useContrats } from '../hooks/useContrats';
import { useAgenda } from '../hooks/useAgenda';
import { useJournalSeance } from '../hooks/useJournalSeance';
import { useCompteRenduSeance } from '../hooks/useCompteRenduSeance';
import { getBrouillon } from '../hooks/useBrouillonBilan';
import PageWrapper from '../components/layout/PageWrapper';
import RadarChart from '../components/charts/RadarChart';
import ProgressCurve from '../components/charts/ProgressCurve';
import BilanTimeline from '../components/bilan/BilanTimeline';
import ContratsTab from '../components/participant/ContratsTab';
import DicteePostSeance from '../components/DicteePostSeance';
import ParticipantForm from '../components/participant/ParticipantForm';
import NoteSeanceModal from '../components/journal/NoteSeanceModal';
import { RESSENTI_CONFIG } from '../components/journal/NoteSeanceModal';
import ModalEspacePatient from '../components/participant/ModalEspacePatient';
import { exportFichePatientPDF } from '../utils/exportFichePatientPDF';
import { calculerNote, NORMES_SCORING } from '../data/norms';
import { TAG_CONFIG } from '../data/profiles';
import toast from 'react-hot-toast';
import type { Bilan, Participant, RessentiSeance, Contrat, Seance, ProfilHandicap } from '../types';
import type { CompteRenduSeance } from '../types/seance';

// ── Constants ─────────────────────────────────────────────────────────────────

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

const NORMES_LABEL: Record<string, string> = {
  equilibreUnipodal: '≥ 40s',
  chairStand30:      '≥ 14 rép.',
  handGrip:          '≥ 32 kg',
  tug3m:             '≤ 8s',
  souplesse:         '≥ 10 cm',
  tm6Distance:       '≥ 500 m',
  memoire:           '4-5/5',
};

const DOT_COLORS = {
  vert:   '#4CAF50',
  orange: '#E8951A',
  rouge:  '#E24B4A',
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

const PROGRESSION_CONFIG: Record<string, { emoji: string; color: string }> = {
  'en progrès': { emoji: '📈', color: '#22C55E' },
  'stable':     { emoji: '➡️', color: '#6B7280' },
  'régression': { emoji: '📉', color: '#EF4444' },
};

const HUMEUR_EMOJI: Record<string, string> = {
  'très bien': '😊', 'bien': '🙂', 'moyen': '😐', 'fatigué': '😓',
};

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

function formatDate(date: string): string {
  return new Date(date + 'T12:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function loadSettings() {
  try { return { prenom: '', nom: '', titre: '', email: '', telephone: '', societe: '', logoPraticien: '', ...JSON.parse(localStorage.getItem('settings_praticien') || '{}') }; }
  catch { return { prenom: '', nom: '', titre: '', email: '', telephone: '', societe: '', logoPraticien: '' }; }
}

function noteToDot(note: 1|2|3|4|5): string {
  if (note >= 4) return DOT_COLORS.vert;
  if (note === 3) return DOT_COLORS.orange;
  return DOT_COLORS.rouge;
}

function noteToLabel(note: 1|2|3|4|5): string {
  if (note >= 4) return 'Dans les normes';
  if (note === 3) return 'À surveiller';
  return 'En difficulté';
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">
      {children}
    </div>
  );
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
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <SectionLabel>Suivi en cours</SectionLabel>

      {contratActif ? (
        <>
          <div className="flex justify-between text-[13px] text-gray-500 mb-1.5">
            <span>Séances réalisées</span>
            <span className="font-semibold text-gray-800">
              {contratActif.nombreSeancesRealisees} / {contratActif.nombreSeancesTotal}
            </span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full mb-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.round((contratActif.nombreSeancesRealisees / contratActif.nombreSeancesTotal) * 100))}%`,
                background: '#2BBFBF',
              }}
            />
          </div>
          <div className="space-y-1 text-[13px] text-gray-500">
            <div>📅 {contratActif.joursFixe.join(' + ')} · {contratActif.heureDebut} · {contratActif.dureeMinutes} min</div>
            <div>📆 {new Date(contratActif.dateDebut + 'T12:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })} → {new Date(contratActif.dateFin + 'T12:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</div>
          </div>

          {prochaineSeance && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full" style={{ background: '#E6F8F8', color: '#1A9999' }}>
              <Calendar size={11} />
              Prochain RDV : {formatDateCourt(prochaineSeance.date)} · {prochaineSeance.heureDebut}
            </div>
          )}

          {joursAvantFin !== null && joursAvantFin <= 14 && joursAvantFin >= 0 && (
            <div className="mt-3 rounded-lg px-3 py-2 text-[12px] font-semibold" style={{ background: '#FFF7E6', color: '#B45309' }}>
              ⏰ Contrat se termine dans {joursAvantFin} jour{joursAvantFin > 1 ? 's' : ''}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-5 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <FileText size={18} className="text-gray-400" />
          </div>
          <p className="text-[13px] text-gray-600 font-medium mb-1">Aucun contrat actif</p>
          <p className="text-[12px] text-gray-400 mb-3">Créez un contrat pour commencer le suivi</p>
          <button
            onClick={() => navigate(`/participant/${participant.id}/contrat/nouveau`)}
            className="inline-flex items-center gap-1.5 border text-[13px] font-semibold px-4 py-2 rounded-lg transition-colors hover:bg-teal-50"
            style={{ borderColor: '#2BBFBF', color: '#2BBFBF' }}
          >
            + Créer un contrat
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
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <SectionLabel>Profil de santé</SectionLabel>
      <div className="space-y-2">
        {lignes.slice(0, 6).map((l, i) => (
          <div key={i} className="flex gap-2 text-[13px] text-gray-600 leading-relaxed">
            <span className="flex-shrink-0">{l.icon}</span>
            <span>{l.texte}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CarteProfilFonctionnel ────────────────────────────────────────────────────

function CarteProfilFonctionnel({ bilans }: {
  bilans: Bilan[];
}) {
  const sorted = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  const initial = sorted[0] ?? null;
  const current = sorted[sorted.length - 1] ?? null;
  if (!current) return null;

  const testsAvecValeur = TESTS_TABLEAU.map(test => {
    const val = test.getVal(current);
    if (val === null || val === undefined) return null;
    const valInit = initial ? test.getVal(initial) : null;
    const norme = NORMES_SCORING[test.normeKey];
    const note = norme ? calculerNote(val, norme) : null;
    const delta = valInit !== null && valInit !== undefined ? val - valInit : null;
    const progression = delta !== null ? (test.lower ? -delta : delta) : null;
    return { test, val, note, progression };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  // Pair tests into 2 columns
  const leftTests = testsAvecValeur.filter((_, i) => i % 2 === 0);
  const rightTests = testsAvecValeur.filter((_, i) => i % 2 === 1);

  function TestRow({ test, val, note, progression }: typeof testsAvecValeur[0]) {
    const dotColor = note !== null ? noteToDot(note) : null;
    const dotLabel = note !== null ? noteToLabel(note) : '';
    const normeText = NORMES_LABEL[test.normeKey];
    const valDisplay = `${test.label === 'Souplesse' && val > 0 ? '+' : ''}${val}${test.unite}`;
    return (
      <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
        <span className="text-[12px] text-gray-400 w-[82px] flex-shrink-0 truncate">{test.label}</span>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-semibold text-gray-800">{valDisplay}</span>
          {normeText && (
            <div className="text-[10px] text-gray-400 leading-none mt-0.5">{normeText}</div>
          )}
        </div>
        {dotColor && (
          <span
            title={dotLabel}
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: dotColor }}
          />
        )}
        {progression !== null && (
          <span className={`text-[11px] font-bold flex-shrink-0 ${progression > 0 ? 'text-green-600' : progression < 0 ? 'text-red-500' : 'text-gray-400'}`}>
            {progression > 0 ? '↑' : progression < 0 ? '↓' : '='}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Profil fonctionnel</SectionLabel>
        {initial !== current && (
          <span className="text-[12px] text-gray-400">
            Initial → {new Date(current.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      {/* Test grid 2 colonnes */}
      <div className="grid grid-cols-2 gap-0">
        <div className="pr-4 border-r border-gray-100">
          {leftTests.map((item, i) => <TestRow key={i} {...item} />)}
        </div>
        <div className="pl-4">
          {rightTests.map((item, i) => <TestRow key={i} {...item} />)}
        </div>
      </div>

      {/* Légende */}
      <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
        {([
          { color: DOT_COLORS.vert,   label: 'Dans les normes' },
          { color: DOT_COLORS.orange, label: 'À surveiller' },
          { color: DOT_COLORS.rouge,  label: 'En difficulté' },
        ] as const).map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── CarteJournalFusion ────────────────────────────────────────────────────────

type JournalEntry =
  | { type: 'note';   date: string; data: import('../types').NoteSeance }
  | { type: 'dictee'; date: string; data: CompteRenduSeance };

function CarteJournalFusion({ notes, compteRendus, onAjouterNote, onDicter }: {
  notes: import('../types').NoteSeance[];
  compteRendus: CompteRenduSeance[];
  onAjouterNote: () => void;
  onDicter: () => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const entries: JournalEntry[] = [
    ...notes.map(n  => ({ type: 'note'   as const, date: n.date,      data: n  })),
    ...compteRendus.map(cr => ({ type: 'dictee' as const, date: cr.dateSeance, data: cr })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  function toggle(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Journal des séances</SectionLabel>
        <div className="flex items-center gap-2">
          <button
            onClick={onDicter}
            className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Mic size={11} style={{ color: '#2BBFBF' }} /> Dicter
          </button>
          <button
            onClick={onAjouterNote}
            className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors hover:bg-teal-50"
            style={{ borderColor: '#2BBFBF', color: '#2BBFBF' }}
          >
            + Note
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <NotebookPen size={18} className="text-gray-400" />
          </div>
          <p className="text-[13px] text-gray-500 font-medium mb-1">Aucune note de séance</p>
          <p className="text-[12px] text-gray-400 mb-3">Dictez ou saisissez un compte-rendu après chaque séance</p>
          <div className="flex gap-2">
            <button
              onClick={onDicter}
              className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 text-[12px] font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Mic size={12} style={{ color: '#2BBFBF' }} /> Dicter
            </button>
            <button
              onClick={onAjouterNote}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg border transition-colors hover:bg-teal-50"
              style={{ borderColor: '#2BBFBF', color: '#2BBFBF' }}
            >
              + Ajouter une note
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.slice(0, 5).map((entry) => {
            const expanded = expandedIds.has(entry.data.id);

            if (entry.type === 'note') {
              const n = entry.data;
              const r = n.ressenti ? RESSENTI_CONFIG[n.ressenti as RessentiSeance] : null;
              const alertes = Object.entries(n.alertes).filter(([, v]) => v);
              const ALERT_EMOJI: Record<string, string> = {
                douleurSignalee: '⚠️', fatiguePlusQueHabitude: '😓',
                progressionNotable: '🎉', pointARevoir: '📌',
              };
              return (
                <div key={n.id} className="border border-gray-100 rounded-lg px-3 py-2.5 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-semibold text-gray-700">{formatDateCourt(n.date)}</span>
                      {n.heureDebut && <span className="text-[11px] text-gray-400">{n.heureDebut}</span>}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">✏️ Manuelle</span>
                      {r && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                          style={{ background: r.color }}>{r.label}</span>
                      )}
                      {alertes.map(([key]) => (
                        <span key={key} className="text-[11px]">{ALERT_EMOJI[key]}</span>
                      ))}
                    </div>
                  </div>
                  {n.note && (
                    <p className={`text-[12px] text-gray-600 leading-snug ${expanded ? '' : 'line-clamp-2'}`}>
                      "{n.note}"
                    </p>
                  )}
                  {n.note && n.note.length > 120 && (
                    <button
                      onClick={() => toggle(n.id)}
                      className="mt-1 text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
                    >
                      {expanded ? <><ChevronUp size={10} /> Réduire</> : <><ChevronDown size={10} /> Voir complet</>}
                    </button>
                  )}
                </div>
              );
            }

            const cr = entry.data;
            const prog = cr.progression ? PROGRESSION_CONFIG[cr.progression] : null;
            const humeurEmoji = cr.humeurPatient ? HUMEUR_EMOJI[cr.humeurPatient] : null;
            return (
              <div key={cr.id} className="border border-gray-100 rounded-lg px-3 py-2.5 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-gray-700 capitalize">
                      {new Date(cr.dateSeance + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    {cr.dureeMinutes && <span className="text-[11px] text-gray-400">{cr.dureeMinutes} min</span>}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">🎙️ Dictée</span>
                    {prog && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${prog.color}18`, color: prog.color }}>
                        {prog.emoji} {cr.progression}
                      </span>
                    )}
                    {humeurEmoji && <span className="text-[13px]">{humeurEmoji}</span>}
                  </div>
                </div>
                {cr.exercicesRealises.length > 0 && (
                  <p className="text-[11px] text-gray-500 mb-1">
                    🏋️ {cr.exercicesRealises.map(e => e.nom).filter(Boolean).join(' · ')}
                  </p>
                )}
                {cr.observations && (
                  <p className={`text-[12px] text-gray-600 leading-snug ${expanded ? '' : 'line-clamp-2'}`}>
                    "{cr.observations}"
                  </p>
                )}
                {cr.pointsAttention && (
                  <p className="text-[11px] text-amber-600 mt-1">⚠️ {cr.pointsAttention}</p>
                )}
                {cr.observations && cr.observations.length > 120 && (
                  <button
                    onClick={() => toggle(cr.id)}
                    className="mt-1 text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
                  >
                    {expanded ? <><ChevronUp size={10} /> Réduire</> : <><ChevronDown size={10} /> Voir complet</>}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── TabsSection ───────────────────────────────────────────────────────────────

type TabId = 'bilans' | 'contrats';

function TabsSection({ activeTab, setActiveTab, tabs, children }: {
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
  tabs: { id: TabId; label: string; count?: number }[];
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200/60 px-4">
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-3 py-3.5 text-[13px] font-medium transition-colors ${
                active ? 'text-[#2BBFBF]' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#E1F5EE', color: '#0F6E56' }}>
                  {tab.count}
                </span>
              )}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: '#2BBFBF' }} />
              )}
            </button>
          );
        })}
      </div>
      {/* Tab content */}
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ParticipantProfile() {
  const { id } = useParams<{ id: string }>();
  const { participants, updateParticipant, deleteParticipant, geocodeParticipant } = useParticipants();
  const { contrats } = useContrats();
  const { seances } = useAgenda();
  const { notesParPatient } = useJournalSeance();
  const navigate = useNavigate();
  const settings = loadSettings();

  const [menuOuvert, setMenuOuvert]         = useState(false);
  const [showEdit, setShowEdit]             = useState(false);
  const [confirmDelete, setConfirmDelete]   = useState(false);
  const [showNoteModal, setShowNoteModal]   = useState(false);
  const [showDictee, setShowDictee]         = useState(false);
  const [geocoding, setGeocoding]           = useState(false);
  const [exportingPDF, setExportingPDF]     = useState(false);
  const [showProfilPicker, setShowProfilPicker] = useState(false);
  const [showEspacePatient, setShowEspacePatient] = useState(false);
  const [activeTab, setActiveTab]           = useState<TabId>('bilans');

  const participant = participants.find(p => p.id === id);
  const { compteRendus, ajouterCompteRendu } = useCompteRenduSeance(participant?.id ?? '');

  if (!participant) return (
    <>
      <div className="md:hidden"><ParticipantProfileMobile /></div>
      <div className="hidden md:block">
        <PageWrapper>
          <div className="text-center py-20 text-gray-400">Participant introuvable</div>
        </PageWrapper>
      </div>
    </>
  );

  const sortedBilans   = [...participant.bilans].sort((a, b) => a.date.localeCompare(b.date));
  const bilanInitial   = participant.bilans.find(b => b.type === 'initial') ?? null;
  const contreIndicationsTexte: string | null =
    bilanInitial?.bilanInitialData?.formulaireFlat?.data?.contreIndications === 'oui'
      ? (bilanInitial.bilanInitialData?.formulaireFlat?.data?.contreIndicationsDetail ?? null)
      : null;
  const latestBilan    = sortedBilans[sortedBilans.length - 1] ?? null;
  const contratActif   = contrats.find(c => c.participantId === participant.id && c.statut === 'actif') ?? null;
  const notes          = notesParPatient(participant.id);
  const contratsCount  = contrats.filter(c => c.participantId === participant.id).length;
  const color          = avatarColor(participant.id);
  const age            = calcAge(participant.dateNaissance);
  const today          = new Date().toISOString().slice(0, 10);
  const imc            = participant.taille && participant.poids
    ? Math.round((participant.poids / ((participant.taille / 100) ** 2)) * 10) / 10 : null;
  const joursDepuisBilan = latestBilan
    ? Math.floor((Date.now() - new Date(latestBilan.date).getTime()) / 86400000) : Infinity;
  const prochaineSeance = seances
    .filter(s => s.participantId === participant.id && s.statut === 'planifiee' && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  const hasAddress     = Boolean(participant.adresseRue?.trim() && participant.adresseVille?.trim());
  const brouillon      = getBrouillon(participant.id);

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
    { Icon: Pencil,     label: 'Modifier le patient',    action: 'modifier' },
    { Icon: FileText,   label: 'Fiche patient PDF',      action: 'pdf_fiche' },
    { Icon: TrendingUp, label: "Rapport d'évolution",    action: 'evolution', disabled: participant.bilans.length < 2 },
    { Icon: Share2,     label: 'Lien client',             action: 'lien' },
    { Icon: Download,   label: 'Mes données (JSON)',      action: 'export' },
    { Icon: Trash2,     label: 'Supprimer',               action: 'supprimer', danger: true },
  ];

  const TABS: { id: TabId; label: string; count?: number }[] = [
    { id: 'bilans',   label: 'Historique bilans',   count: participant.bilans.length },
    { id: 'contrats', label: 'Contrats de suivi',   count: contratsCount },
  ];

  return (
    <>
    <div className="md:hidden"><ParticipantProfileMobile /></div>
    <div className="hidden md:block">
    <PageWrapper>
      <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-700 mb-4 transition-colors">
        <ArrowLeft size={14} /> Tableau de bord
      </Link>

      {/* ── HEADER BLANC ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200/50 shadow-sm mb-4">
        <div className="px-5 pt-5 pb-4">

          {/* Ligne 1 : avatar + nom + badges + menu */}
          <div className="flex items-start gap-3.5">
            <div
              className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white font-bold text-[18px] flex-shrink-0"
              style={{ background: color }}
            >
              {participant.prenom[0]}{participant.nom[0]}
            </div>

            <div className="flex-1 min-w-0">
              {/* Nom + badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading font-bold text-gray-900 text-xl leading-tight">
                  {participant.prenom} {participant.nom}
                </h1>
                {/* Badge Sénior */}
                {participant.tags?.includes('senior') && (
                  <span className="text-[12px] font-medium px-2.5 py-0.5 rounded-full" style={{ background: '#E6F1FB', color: '#185FA5' }}>
                    Sénior
                  </span>
                )}
                {/* Badge pathologie */}
                {participant.tags?.includes('chronique') && (
                  <span className="text-[12px] font-medium px-2.5 py-0.5 rounded-full" style={{ background: '#E1F5EE', color: '#0F6E56' }}>
                    Pathologie chronique
                  </span>
                )}
                {/* Autres tags */}
                {participant.tags?.filter(t => t !== 'senior' && t !== 'chronique').map(tag => (
                  <span key={tag}
                    className="text-[12px] font-medium px-2.5 py-0.5 rounded-full text-white"
                    style={{ background: TAG_CONFIG[tag].color }}
                  >
                    {TAG_CONFIG[tag].emoji} {TAG_CONFIG[tag].label}
                  </span>
                ))}
                {/* Badge contre-indications */}
                {contreIndicationsTexte && (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-0.5 rounded-full" style={{ background: '#FCEBEB', color: '#A32D2D' }}>
                    ⚠️ CI active
                  </span>
                )}
                {/* Profil handicap */}
                {participant.profilHandicap && (() => {
                  const ph = PROFILS_HANDICAP.find(x => x.id === participant.profilHandicap);
                  return ph ? (
                    <span className="text-[12px] font-medium px-2.5 py-0.5 rounded-full" style={{ background: '#F0F4F4', color: '#0D5050' }}>
                      {ph.emoji} {ph.label}
                    </span>
                  ) : null;
                })()}
                {/* RGPD manquant */}
                {!participant.rgpd?.consentementObtenu && (
                  <button
                    onClick={() => handleAction('rgpd')}
                    className="inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full border transition-colors hover:bg-red-50"
                    style={{ borderColor: '#E24B4A', color: '#E24B4A' }}
                  >
                    RGPD ⚠
                  </button>
                )}
              </div>

              {/* Ligne secondaire : infos */}
              <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[13px] text-gray-500">
                <span>
                  {age} ans · né(e) le {new Date(participant.dateNaissance).toLocaleDateString('fr-FR')}
                </span>
                {participant.taille && <><span className="text-gray-300">·</span><span>{participant.taille} cm</span></>}
                {participant.poids && <><span className="text-gray-300">·</span><span>{participant.poids} kg</span></>}
                {imc && <><span className="text-gray-300">·</span><span>IMC {imc}</span></>}
                {participant.telephone && (
                  <>
                    <span className="text-gray-300">·</span>
                    <a href={`tel:${participant.telephone}`} className="hover:text-gray-800 transition-colors">
                      📞 {participant.telephone}
                    </a>
                  </>
                )}
                {participant.email && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span>✉️ {participant.email}</span>
                  </>
                )}
                {hasAddress && (
                  <>
                    <span className="text-gray-300">·</span>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(`${participant.adresseRue}, ${participant.adresseCodePostal} ${participant.adresseVille}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-gray-800 transition-colors inline-flex items-center gap-1"
                    >
                      📍 {participant.adresseRue}, {participant.adresseCodePostal} {participant.adresseVille}
                      {participant.coordonnees
                        ? <MapPin size={10} className="text-green-500" />
                        : !geocoding
                          ? <button onClick={e => { e.preventDefault(); handleGeocode(); }} className="text-[#2BBFBF] underline text-[11px]">Localiser</button>
                          : <RefreshCw size={10} className="animate-spin" style={{ color: '#2BBFBF' }} />
                      }
                    </a>
                  </>
                )}
                {participant.rgpd?.consentementObtenu && (
                  <><span className="text-gray-300">·</span>
                  <span className="text-[12px]" style={{ color: '#0F6E56' }}>
                    ✅ RGPD {METHODE_LABEL[participant.rgpd.methodeConsentement] ?? ''}
                  </span></>
                )}
              </div>

              {/* Barre de progression bilan en cours */}
              {brouillon && (
                <button
                  onClick={() => handleAction('nouveau_bilan')}
                  className="mt-2 inline-flex items-center gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <span className="text-[12px] text-gray-500">Bilan en cours</span>
                  <span className="w-[140px] h-1 rounded-full overflow-hidden" style={{ background: '#E6F8F8' }}>
                    <span className="h-full rounded-full block" style={{ width: `${brouillon.completionPct}%`, background: '#2BBFBF' }} />
                  </span>
                  <span className="text-[12px] font-semibold" style={{ color: '#2BBFBF' }}>{brouillon.completionPct}%</span>
                  <span className="text-[12px] text-gray-400">· Reprendre →</span>
                </button>
              )}

              {/* Badge dernier bilan */}
              {joursDepuisBilan > 85 && (
                <div className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: '#FFF7E6', color: '#B45309' }}>
                  ⏰ Bilan à planifier ({joursDepuisBilan}j)
                </div>
              )}
              {latestBilan && joursDepuisBilan <= 85 && (
                <div className="mt-1.5 text-[12px] text-gray-400">
                  Dernier bilan : {formatDate(latestBilan.date)}
                </div>
              )}

              {/* Contexte clinique */}
              {participant.contexteClinic && (
                <p className="mt-1 text-[12px] text-gray-400 italic">"{participant.contexteClinic}"</p>
              )}

              {/* Contre-indications détaillées */}
              {contreIndicationsTexte && (
                <div className="mt-2 flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: '#FCEBEB' }}>
                  <span className="flex-shrink-0 text-sm">⚠️</span>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#A32D2D' }}>Contre-indications à l'effort</span>
                    <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: '#A32D2D' }}>{contreIndicationsTexte}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Menu ··· */}
            <div className="relative flex-shrink-0">
              {/* Profil handicap button (top right) */}
              <div className="flex items-center gap-2 mb-1.5 justify-end">
                <div className="relative">
                  <button
                    onClick={() => setShowProfilPicker(v => !v)}
                    className="text-[12px] font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    ♿ {participant.profilHandicap ? 'Modifier profil' : '+ Profil handicap'}
                  </button>
                  {showProfilPicker && (
                    <>
                      <div className="fixed inset-0 z-50" onClick={() => setShowProfilPicker(false)} />
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl z-50 py-1 min-w-[210px] border border-gray-100">
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
              <div className="flex justify-end">
                <button
                  onClick={() => setMenuOuvert(v => !v)}
                  className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-lg font-bold text-lg transition-colors"
                >
                  ···
                </button>
              </div>
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
                          ${item.danger ? 'text-red-500 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'}
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
        </div>

        {/* Séparateur + boutons d'action */}
        <div className="border-t border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Groupe 1 : primaires */}
            <button
              onClick={() => handleAction('nouveau_bilan')}
              className="flex items-center gap-1.5 text-white text-[13px] font-semibold px-3.5 py-[7px] rounded-lg transition-colors hover:opacity-90"
              style={{ background: '#2BBFBF' }}
            >
              + Nouveau bilan
            </button>
            <button
              onClick={() => setShowDictee(true)}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Mic size={13} style={{ color: '#2BBFBF' }} /> Dicter séance
            </button>

            {/* Groupe 2 : secondaires */}
            <button
              onClick={() => handleAction('note_seance')}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors"
            >
              <NotebookPen size={13} /> Note séance
            </button>
            {participant.bilans.length >= 2 && (
              <button
                onClick={() => handleAction('evolution')}
                className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors"
              >
                <TrendingUp size={13} /> Évolution
              </button>
            )}
            <button
              onClick={handleExportFiche}
              disabled={exportingPDF}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <FileText size={13} /> {exportingPDF ? 'PDF…' : 'Fiche PDF'}
            </button>
            <button
              onClick={() => handleAction('programme')}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Dumbbell size={13} /> Programme
            </button>

            {/* Groupe 3 : ghost, poussé à droite */}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => handleAction('nouveau_contrat')}
                className="flex items-center gap-1.5 text-gray-400 text-[13px] font-medium px-3 py-[7px] rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <ClipboardList size={13} /> Contrat
              </button>
              <button
                onClick={() => setShowEspacePatient(true)}
                className="flex items-center gap-1.5 text-gray-400 text-[13px] font-medium px-3 py-[7px] rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                Espace patient
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── GRILLE 2 COLONNES ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 mb-4">
        {/* Colonne gauche */}
        <div className="flex flex-col gap-3">
          <CarteSante participant={participant} bilanInitial={bilanInitial} />
          <CarteStats participant={participant} contratActif={contratActif} prochaineSeance={prochaineSeance} />
        </div>
        {/* Colonne droite */}
        <div className="flex flex-col gap-3">
          {latestBilan && <CarteProfilFonctionnel bilans={participant.bilans} />}
          <CarteJournalFusion
            notes={notes.slice(0, 5)}
            compteRendus={compteRendus.slice(0, 5)}
            onAjouterNote={() => handleAction('note_seance')}
            onDicter={() => setShowDictee(true)}
          />
        </div>
      </div>

      {/* ── TABS ───────────────────────────────────────────────── */}
      <TabsSection activeTab={activeTab} setActiveTab={setActiveTab} tabs={TABS}>
        {activeTab === 'bilans' && (
          <div>
            <BilanTimeline bilans={participant.bilans} participantId={participant.id} />
            {sortedBilans.length > 1 && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <div className="text-[12px] font-semibold text-gray-500 mb-3">Courbes de progression</div>
                <ProgressCurve bilans={sortedBilans} />
              </div>
            )}
            {latestBilan && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <div className="text-[12px] font-semibold text-gray-500 mb-3">Radar fonctionnel</div>
                <div className="max-w-sm">
                  <RadarChart
                    initial={sortedBilans.length > 1 ? sortedBilans[0] : null}
                    current={latestBilan}
                    testsActifs={participant.testsActifs}
                  />
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'contrats' && (
          <ContratsTab participantId={participant.id} />
        )}
      </TabsSection>

      {/* ── MODALS ─────────────────────────────────────────────── */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-heading font-bold text-gray-900 text-lg">Modifier la fiche</h2>
                <p className="text-sm text-gray-400 mt-0.5">{participant.prenom} {participant.nom}</p>
              </div>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-gray-700 p-1 transition-colors">
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
              <h2 className="font-heading font-bold text-gray-900 text-lg">Supprimer ce patient ?</h2>
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

      {showEspacePatient && (
        <ModalEspacePatient
          participant={participant}
          onClose={() => setShowEspacePatient(false)}
        />
      )}

      {showDictee && (
        <DicteePostSeance
          participant={participant}
          onClose={() => setShowDictee(false)}
          onSave={async (data) => { await ajouterCompteRendu(data); }}
        />
      )}

    </PageWrapper>
    </div>
    </>
  );
}
