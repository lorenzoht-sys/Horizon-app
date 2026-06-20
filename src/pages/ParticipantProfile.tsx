import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ParticipantProfileMobile from './ParticipantProfileMobile';
import { differenceInDays } from 'date-fns';
import {
  ArrowLeft, Pencil, FileText, TrendingUp, Share2,
  Download, Trash2, Dumbbell, NotebookPen, Calendar, MapPin,
  RefreshCw, ClipboardList, Mic, ChevronDown, ChevronUp, Save,
} from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import { useProgramme } from '../hooks/useProgramme';
import { useProgrammeV2 } from '../hooks/useProgrammeV2';
import { useContrats } from '../hooks/useContrats';
import { useStructures } from '../hooks/useStructures';
import { useAgenda } from '../hooks/useAgenda';
import { useJournalSeance } from '../hooks/useJournalSeance';
import { useCompteRenduSeance } from '../hooks/useCompteRenduSeance';
import { getBrouillon } from '../hooks/useBrouillonBilan';
import PageWrapper from '../components/layout/PageWrapper';
import RadarChart from '../components/charts/RadarChart';
import BilanEvolutionCharts from '../components/charts/BilanEvolutionCharts';
import BilanTimeline from '../components/bilan/BilanTimeline';
import ContratsTab from '../components/participant/ContratsTab';
import DicteePostSeance from '../components/DicteePostSeance';
import ModalEspacePatient from '../components/participant/ModalEspacePatient';
import { exportDossierPraticien } from '../utils/exportDossierPDF';
import { calculerNote, NORMES_SCORING } from '../data/norms';
import { computeTinettiScores, tinettiRisque } from '../data/tinetti';
import { TAG_CONFIG } from '../data/profiles';
import { getSedProfil, getFSSProfil } from '../components/bilan/TestsAutonomie';
import { useRappelPreferences, type RappelPreferences } from '../hooks/useRappelPreferences';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import type { Bilan, Participant, Contrat, Seance, ProfilHandicap } from '../types';
import { getContreIndications, getTestsAutonomie, formatMomentsTraitement, getAntecedentIcon, getAntecedentTitre, getAntecedentSousLigne, getTraitementsActifs, getTraitementsArretes } from '../lib/anamnese';
import type { CompteRenduSeance } from '../types/seance';

// ── Constants ─────────────────────────────────────────────────────────────────

function tm6Extra(b: Bilan): string | null {
  const parts: string[] = [];
  if (b.tm6.nbPauses) parts.push(`${b.tm6.nbPauses} pause(s), ${b.tm6.dureePausesSecondes ?? 0}s d'arrêt`);
  const duree = b.tm6.dureeReelleSecondes;
  if (duree != null && duree !== 360) parts.push(`test ${Math.round(duree / 6) / 10} min`);
  return parts.length ? parts.join(' · ') : null;
}

function tinettiVal(b: Bilan): number | null {
  const s = computeTinettiScores(b.tinetti);
  return s?.complet ? s.scoreTotal : null;
}

function tinettiExtra(b: Bilan): string | null {
  const val = tinettiVal(b);
  return val !== null ? tinettiRisque(val).label : null;
}

const TESTS_TABLEAU: {
  label: string; normeKey: string; unite: string; lower: boolean;
  getVal: (b: Bilan) => number | null; getExtra?: (b: Bilan) => string | null;
}[] = [
  { label: 'Équilibre D', normeKey: 'equilibreUnipodal', unite: 's',     lower: false, getVal: (b: Bilan) => b.equilibre.droite },
  { label: 'Chair Stand', normeKey: 'chairStand30',      unite: ' rép.', lower: false, getVal: (b: Bilan) => b.chairStand30 },
  { label: 'HandGrip D',  normeKey: 'handGrip',          unite: ' kg',   lower: false, getVal: (b: Bilan) => b.handGrip.droite },
  { label: 'TUG 3m',      normeKey: 'tug3m',             unite: 's',     lower: true,  getVal: (b: Bilan) => b.tug3m },
  { label: 'TM6',         normeKey: 'tm6Distance',        unite: ' m',    lower: false, getVal: (b: Bilan) => b.tm6.distanceMetres, getExtra: tm6Extra },
  { label: 'Souplesse',   normeKey: 'souplesse',          unite: ' cm',   lower: false, getVal: (b: Bilan) => b.souplesse.valeur },
  { label: 'Mémoire',     normeKey: 'memoire',            unite: '/5',    lower: false, getVal: (b: Bilan) => b.memoire.scoreImmediat },
  { label: 'Apley Scratch', normeKey: 'apley',           unite: '/4',    lower: false, getVal: (b: Bilan) => b.apley?.score ?? null },
  { label: 'Tinetti POMA', normeKey: 'tinetti',          unite: '/28',   lower: false, getVal: tinettiVal, getExtra: tinettiExtra },
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
  apley:             '≥ 3.5/4',
  tinetti:           '≥ 24/28',
};

const DOT_COLORS = {
  vert:   '#4CAF50',
  orange: '#E8951A',
  rouge:  '#E24B4A',
};

const AVATAR_COLORS = ['#1A5F9E', 'var(--color-teal)', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899'];
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
                background: 'var(--color-teal)',
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
            style={{ borderColor: 'var(--color-teal)', color: 'var(--color-teal)' }}
          >
            + Créer un contrat
          </button>
        </div>
      )}
    </div>
  );
}

// ── CarteSante ────────────────────────────────────────────────────────────────

function CarteSante({ participant, bilanInitial, onModifier }: {
  participant: Participant;
  bilanInitial: Bilan | null;
  onModifier: () => void;
}) {
  const [showArretes, setShowArretes] = useState(false);
  const profil = bilanInitial?.profilEnrichi;

  const traitementsActifs = getTraitementsActifs(participant.traitements);
  const traitementsArretes = getTraitementsArretes(participant.traitements);
  const antecedents = participant.antecedentsMedicauxStructures ?? [];

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

  const hasContent = lignes.length > 0 || traitementsActifs.length > 0 || traitementsArretes.length > 0 || antecedents.length > 0;
  if (!hasContent) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Profil de santé</div>
        <button
          onClick={onModifier}
          className="text-[12px] text-gray-400 hover:text-primary flex items-center gap-1 transition-colors"
        >
          ✏️ Modifier
        </button>
      </div>

      {/* Infos textuelles */}
      {lignes.length > 0 && (
        <div className="space-y-2 mb-4">
          {lignes.slice(0, 6).map((l, i) => (
            <div key={i} className="flex gap-2 text-[13px] text-gray-600 leading-relaxed">
              <span className="flex-shrink-0">{l.icon}</span>
              <span>{l.texte}</span>
            </div>
          ))}
        </div>
      )}

      {/* Traitements structurés */}
      {(traitementsActifs.length > 0 || traitementsArretes.length > 0) && (
        <div className="mt-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 mb-2">Traitements en cours</div>
          {traitementsActifs.length > 0 ? (
            <div className="space-y-1.5 mb-2">
              {traitementsActifs.map(t => (
                <div key={t.id} className="flex items-center gap-2 text-[13px] flex-wrap">
                  <span className="flex-shrink-0">💊</span>
                  <span className="font-medium text-gray-700">{t.nom || '—'}</span>
                  {t.dose && <span className="text-gray-400">· {t.dose}</span>}
                  {t.frequence && <span className="text-gray-400">· {t.frequence}</span>}
                  {(t.moments?.length ?? 0) > 0 && <span className="text-gray-400">· {formatMomentsTraitement(t.moments)}</span>}
                  {t.effetSecondaire && <span className="text-gray-400 text-[12px]">— {t.effetSecondaire}</span>}
                  <span className="ml-auto text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">En cours ✅</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-gray-400 italic mb-2">Aucun traitement en cours</p>
          )}

          {traitementsArretes.length > 0 && (
            <div>
              <button
                onClick={() => setShowArretes(!showArretes)}
                className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 font-medium mb-1.5"
              >
                {showArretes ? '▼' : '▶'} Traitements arrêtés ({traitementsArretes.length})
              </button>
              {showArretes && (
                <div className="space-y-1 border border-gray-100 rounded-lg p-2">
                  {traitementsArretes.map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-[12px] text-gray-400">
                      <span>💊</span>
                      <span className="line-through">{t.nom}</span>
                      {t.dose && <span>· {t.dose}</span>}
                      <span className="ml-auto text-[10px] bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        Arrêté le {new Date((t.date_fin ?? '') + 'T12:00').toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Antécédents structurés */}
      {antecedents.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 mb-2">Antécédents</div>
          <div className="space-y-2">
            {antecedents.map(a => (
              <div key={a.id}>
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="flex-shrink-0">{getAntecedentIcon(a)}</span>
                  <span className="font-medium text-gray-700">{getAntecedentTitre(a)}</span>
                  {a.douleur === 'oui' && (
                    <span className="text-[10px] text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">Douleur liée</span>
                  )}
                </div>
                {getAntecedentSousLigne(a) && (
                  <p className="text-[12px] text-gray-400 ml-5 mt-0.5">{getAntecedentSousLigne(a)}</p>
                )}
                {a.notes && (
                  <p className="text-[12px] text-gray-400 ml-5 mt-0.5 italic">{a.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CarteProfilFonctionnel ────────────────────────────────────────────────────

function CarteProfilFonctionnel({ participant, bilans }: {
  participant: Participant;
  bilans: Bilan[];
}) {
  const sorted = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  const initial = sorted[0] ?? null;
  const current = sorted[sorted.length - 1] ?? null;
  if (!current) return null;

  const { sedentarite, fatigue } = getTestsAutonomie(participant, initial);
  const sedInfo = sedentarite.score !== null ? getSedProfil(sedentarite.score) : null;
  const fssInfo = fatigue.score !== null ? getFSSProfil(fatigue.score) : null;

  const testsAvecValeur = TESTS_TABLEAU.map(test => {
    const val = test.getVal(current);
    if (val === null || val === undefined) return null;
    const valInit = initial ? test.getVal(initial) : null;
    const norme = NORMES_SCORING[test.normeKey];
    const note = norme ? calculerNote(val, norme) : null;
    const delta = valInit !== null && valInit !== undefined ? val - valInit : null;
    const progression = delta !== null ? (test.lower ? -delta : delta) : null;
    const extra = test.getExtra?.(current) ?? null;
    return { test, val, note, progression, extra };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  // Pair tests into 2 columns
  const leftTests = testsAvecValeur.filter((_, i) => i % 2 === 0);
  const rightTests = testsAvecValeur.filter((_, i) => i % 2 === 1);

  function TestRow({ test, val, note, progression, extra }: typeof testsAvecValeur[0]) {
    const dotColor = note !== null ? noteToDot(note) : null;
    const dotLabel = note !== null ? noteToLabel(note) : '';
    const normeText = NORMES_LABEL[test.normeKey];
    const valDisplay = `${test.label === 'Souplesse' && val > 0 ? '+' : ''}${val}${test.unite}`;
    return (
      <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
        <span className="text-[12px] text-gray-400 w-[82px] flex-shrink-0 truncate">{test.label}</span>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-semibold text-gray-800">{valDisplay}</span>
          {extra && (
            <div className="text-[10px] text-orange-600 leading-none mt-0.5 truncate" title={extra}>{extra}</div>
          )}
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

      {/* Activité physique & Fatigue du bilan initial */}
      {(sedInfo || fssInfo) && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-1.5">
          {sedInfo && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-gray-500">Activité physique</span>
              <span style={{ color: sedInfo.color, fontWeight: 600 }}>
                {sedInfo.label}{sedentarite.score !== null ? ` (${sedentarite.score}/55)` : ''}
              </span>
            </div>
          )}
          {fssInfo && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-gray-500">Fatigue perçue</span>
              <span style={{ color: fssInfo.color, fontWeight: 600 }}>
                {fssInfo.label}{fatigue.score !== null ? ` (FSS ${fatigue.score}/63)` : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CarteJournalFusion ────────────────────────────────────────────────────────

type JournalEntry = { type: 'dictee'; date: string; data: CompteRenduSeance };

function CarteJournalFusion({ compteRendus, onDicter }: {
  compteRendus: CompteRenduSeance[];
  onDicter: () => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const entries: JournalEntry[] = compteRendus
    .map(cr => ({ type: 'dictee' as const, date: cr.dateSeance, data: cr }))
    .sort((a, b) => b.date.localeCompare(a.date));

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
        <button
          onClick={onDicter}
          className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Mic size={11} style={{ color: 'var(--color-teal)' }} /> Dicter
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <NotebookPen size={18} className="text-gray-400" />
          </div>
          <p className="text-[13px] text-gray-500 font-medium mb-1">Aucune séance dictée</p>
          <p className="text-[12px] text-gray-400 mb-3">Dictez un compte-rendu après chaque séance</p>
          <button
            onClick={onDicter}
            className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 text-[12px] font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Mic size={12} style={{ color: 'var(--color-teal)' }} /> Dicter une séance
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.slice(0, 5).map((entry) => {
            const expanded = expandedIds.has(entry.data.id);
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

// ── CarteDisponibilites ───────────────────────────────────────────────────────

const JOURS_DISPO_LIST = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] as const;

const HEURES_DISPO = (() => {
  const h: string[] = [];
  for (let m = 7 * 60; m <= 20 * 60; m += 30)
    h.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return h;
})();

function CarteDisponibilites({
  participant,
  onSave,
}: {
  participant: Participant;
  onSave: (data: Partial<Participant>) => Promise<void>;
}) {
  const org = participant.anamnese?.organisation ?? {};
  const jours: string[] = org.joursDisponibles ?? [];
  const creneauxParJour: Record<string, { debut: string; fin: string }[]> = org.creneauxParJour ?? {};

  const [editing, setEditing] = useState(false);
  const [editJours, setEditJours] = useState<string[]>([]);
  const [editCreneaux, setEditCreneaux] = useState<Record<string, { debut: string; fin: string }[]>>({});

  function handleStartEdit() {
    setEditJours([...jours]);
    setEditCreneaux(JSON.parse(JSON.stringify(creneauxParJour)));
    setEditing(true);
  }

  function toggleJour(jour: string) {
    setEditJours(prev => {
      if (prev.includes(jour)) return prev.filter(j => j !== jour);
      return [...prev, jour];
    });
    setEditCreneaux(prev => {
      if (!prev[jour]) return { ...prev, [jour]: [{ debut: '09:00', fin: '12:00' }] };
      return prev;
    });
  }

  async function handleSave() {
    const newOrg = { ...org, joursDisponibles: editJours, creneauxParJour: editCreneaux };
    try {
      await onSave({ anamnese: { ...participant.anamnese, organisation: newOrg } });
      setEditing(false);
    } catch (err) {
      console.error('Erreur sauvegarde disponibilités:', err);
      toast.error('Erreur lors de la sauvegarde, réessayez');
    }
  }

  if (!editing) {
    const hasData = jours.length > 0;
    return (
      <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Disponibilités · Tournée</div>
          <button onClick={handleStartEdit}
            className="text-[12px] text-primary hover:underline font-medium flex items-center gap-0.5">
            <Pencil size={10} className="mr-0.5" />{hasData ? 'Modifier' : 'Saisir'}
          </button>
        </div>
        {hasData ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {JOURS_DISPO_LIST.filter(j => jours.includes(j)).map(j => (
                <span key={j} className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md">{j}</span>
              ))}
            </div>
            {jours.some(j => (creneauxParJour[j]?.length ?? 0) > 0) && (
              <div className="text-[12px] text-gray-400 leading-relaxed">
                {jours.filter(j => (creneauxParJour[j]?.length ?? 0) > 0).map(j =>
                  `${j} : ${creneauxParJour[j].map((c: { debut: string; fin: string }) => `${c.debut}–${c.fin}`).join(', ')}`
                ).join(' · ')}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-gray-400 italic">Aucune disponibilité — cliquez "Saisir" pour renseigner les jours et créneaux utilisés dans la tournée.</p>
        )}
      </div>
    );
  }

  // ── Mode édition ───────────────────────────────────────────────────────────
  const joursOrdres = [...editJours].sort(
    (a, b) => JOURS_DISPO_LIST.indexOf(a as typeof JOURS_DISPO_LIST[number]) - JOURS_DISPO_LIST.indexOf(b as typeof JOURS_DISPO_LIST[number])
  );

  return (
    <div className="bg-white rounded-xl border border-primary/40 p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Disponibilités · Tournée</div>

      {/* Jours */}
      <div className="mb-3">
        <div className="text-[12px] font-medium text-gray-600 mb-1.5">Jours disponibles</div>
        <div className="flex gap-1.5 flex-wrap">
          {JOURS_DISPO_LIST.map(j => {
            const actif = editJours.includes(j);
            return (
              <button key={j} type="button" onClick={() => toggleJour(j)}
                className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                  actif ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {j}
              </button>
            );
          })}
        </div>
      </div>

      {/* Créneaux par jour */}
      {joursOrdres.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="text-[12px] font-medium text-gray-600">Créneaux horaires</div>
          {joursOrdres.map(jour => {
            const slots = editCreneaux[jour] ?? [{ debut: '09:00', fin: '12:00' }];
            return (
              <div key={jour} className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-gray-500 w-7 flex-shrink-0">{jour}</span>
                {slots.map((slot: { debut: string; fin: string }, i: number) => (
                  <div key={i} className="flex items-center gap-1">
                    <select value={slot.debut}
                      onChange={e => {
                        const next = slots.map((s: { debut: string; fin: string }, si: number) => si === i ? { ...s, debut: e.target.value } : s);
                        setEditCreneaux(prev => ({ ...prev, [jour]: next }));
                      }}
                      className="border border-gray-200 rounded-lg px-1.5 py-1 text-[12px] focus:outline-none focus:border-primary">
                      {HEURES_DISPO.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <span className="text-[11px] text-gray-400">→</span>
                    <select value={slot.fin}
                      onChange={e => {
                        const next = slots.map((s: { debut: string; fin: string }, si: number) => si === i ? { ...s, fin: e.target.value } : s);
                        setEditCreneaux(prev => ({ ...prev, [jour]: next }));
                      }}
                      className="border border-gray-200 rounded-lg px-1.5 py-1 text-[12px] focus:outline-none focus:border-primary">
                      {HEURES_DISPO.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleSave}
          className="flex-1 bg-primary text-white text-[12px] font-semibold py-1.5 rounded-lg hover:bg-dark transition-colors">
          Enregistrer
        </button>
        <button onClick={() => setEditing(false)}
          className="px-3 border border-gray-200 text-gray-500 text-[12px] rounded-lg hover:bg-gray-50 transition-colors">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Types ressentis ───────────────────────────────────────────────────────────

interface RetourSeance {
  id: string;
  date: string;
  borgRpe: number;
  bienEtre: number;
}

// Libellés Borg RPE simplifié (valeurs utilisées : 2/4/6/8/10)
const BORG_LABEL: Record<number, string> = {
  2: 'Très facile', 4: 'Facile', 6: 'Modéré', 8: 'Difficile', 10: 'Très difficile',
};
const BIEN_ETRE_LABEL: Record<number, string> = {
  1: 'Très bien', 2: 'Bien', 3: 'Correct', 4: 'Fatigué', 5: 'Épuisé',
};

function labelBorg(v: number): string { return BORG_LABEL[v] ?? `${v}`; }
function labelBienEtre(v: number): string { return BIEN_ETRE_LABEL[v] ?? `${v}`; }

// Normalise une date Supabase ("YYYY-MM-DD" pour une colonne DATE, mais
// potentiellement "YYYY-MM-DDTHH:mm:ss+00:00" pour une colonne TIMESTAMP) en
// "YYYY-MM-DD" — seances_patient ayant été créée hors migration (Studio), son
// type de colonne réel n'est pas garanti identique à celui de retours_seance.
function dateOnly(s: string): string { return s.slice(0, 10); }

// ── TabsSection ───────────────────────────────────────────────────────────────

type TabId = 'bilans' | 'contrats' | 'assiduite' | 'rappels';

// ── Types assiduité ───────────────────────────────────────────────────────────

interface SeancePatientStat {
  id: string;
  seanceId: string;
  programmeId: string;
  dateSeance: string;
  statut: string;
  commentairePatient: string | null;
  dureeMinutes: number | null;
  nbRealises: number;
  nbTotal: number;
}

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
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--color-teal)' }} />
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

// ── Rappels (par patient) ───────────────────────────────────────────────────────

function SectionRappelsPatient({ participantId }: { participantId: string }) {
  const { prefs, herite, loading, enregistrer, reinitialiser } = useRappelPreferences(participantId);
  const [local, setLocal] = useState<RappelPreferences>(prefs);
  const [saving, setSaving] = useState(false);
  const [nbAppareils, setNbAppareils] = useState<number | null>(null);

  useEffect(() => {
    if (!loading) setLocal(prefs);
  }, [loading, prefs]);

  useEffect(() => {
    if (!supabase) return;
    let annule = false;
    async function charger() {
      const { count } = await supabase!
        .from('push_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('participant_id', participantId);
      if (!annule) setNbAppareils(count ?? 0);
    }
    void charger();
    return () => { annule = true; };
  }, [participantId]);

  async function handleSave() {
    setSaving(true);
    const ok = await enregistrer(local);
    setSaving(false);
    toast[ok ? 'success' : 'error'](ok ? 'Préférences de rappels enregistrées' : "Erreur lors de l'enregistrement");
  }

  async function handleReset() {
    setSaving(true);
    const ok = await reinitialiser();
    setSaving(false);
    toast[ok ? 'success' : 'error'](ok ? 'Réglages globaux rétablis pour ce patient' : 'Erreur');
  }

  if (loading) return <div className="text-sm text-gray-400">Chargement…</div>;

  return (
    <div className="space-y-5">
      {/* Abonnement push */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Notifications push</div>
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium"
          style={nbAppareils !== null && nbAppareils > 0
            ? { background: '#DCFCE7', color: '#16A34A' }
            : { background: '#F3F4F6', color: '#6B7280' }}>
          {nbAppareils === null
            ? 'Chargement…'
            : nbAppareils > 0
              ? `🔔 ${nbAppareils} appareil${nbAppareils > 1 ? 's' : ''} abonné${nbAppareils > 1 ? 's' : ''} aux rappels`
              : '🔕 Aucun appareil abonné aux rappels'}
        </div>
        {nbAppareils === 0 && (
          <p className="text-[12px] text-gray-400 mt-1.5">
            Le patient peut les activer depuis son espace patient (bouton « Activer les rappels »).
          </p>
        )}
      </div>

      {/* Réglages */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Réglages</div>
        {herite && (
          <div className="rounded-lg px-3 py-2.5 text-[12px] mb-3" style={{ background: '#F3F4F6', color: '#6B7280' }}>
            Ce patient suit les réglages globaux (Paramètres → Rappels automatiques). Modifiez-les ci-dessous pour les personnaliser uniquement pour lui.
          </div>
        )}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200/70 p-3">
            <div>
              <div className="text-sm font-medium text-gray-800">Rappel avant la séance</div>
              <p className="text-[12px] text-gray-400 mt-0.5">Notification envoyée avant le rendez-vous.</p>
            </div>
            <input type="checkbox" checked={local.rappelSeanceActif}
              onChange={e => setLocal(l => ({ ...l, rappelSeanceActif: e.target.checked }))}
              className="w-4 h-4 accent-primary flex-shrink-0" />
          </div>
          {local.rappelSeanceActif && (
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Délai avant la séance (heures)</span>
              <input type="number" min={1} max={48} value={local.rappelSeanceDelaiHeures}
                onChange={e => setLocal(l => ({ ...l, rappelSeanceDelaiHeures: Number(e.target.value) }))}
                className="w-full max-w-[120px] px-4 py-2.5 border border-gray-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/10 transition-colors font-sans" />
            </label>
          )}

          <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200/70 p-3">
            <div>
              <div className="text-sm font-medium text-gray-800">Rappel jour de séance</div>
              <p className="text-[12px] text-gray-400 mt-0.5">Le matin, si le patient a une séance prévue ce jour-là.</p>
            </div>
            <input type="checkbox" checked={local.rappelJourSeanceActif}
              onChange={e => setLocal(l => ({ ...l, rappelJourSeanceActif: e.target.checked }))}
              className="w-4 h-4 accent-primary flex-shrink-0" />
          </div>
          {local.rappelJourSeanceActif && (
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Heure d'envoi</span>
              <input type="time" value={local.rappelJourSeanceHeure}
                onChange={e => setLocal(l => ({ ...l, rappelJourSeanceHeure: e.target.value }))}
                className="w-full max-w-[120px] px-4 py-2.5 border border-gray-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/10 transition-colors font-sans" />
            </label>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Save size={13} />
          {saving ? 'Enregistrement…' : herite ? 'Personnaliser pour ce patient' : 'Enregistrer'}
        </button>
        {!herite && (
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex items-center gap-1.5 text-gray-400 text-[13px] font-medium px-3 py-[7px] rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            Revenir aux réglages globaux
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ParticipantProfile() {
  const { id } = useParams<{ id: string }>();
  const { participants, updateParticipant, deleteParticipant, deleteBilan, geocodeParticipant } = useParticipants();
  const { programmeActif, deleteProgramme } = useProgramme(id ?? '');
  const { programmes: programmesV2, seancesAutonomesStats } = useProgrammeV2(id ?? '');
  const { contrats } = useContrats();
  const { structures } = useStructures();
  const { seances } = useAgenda();
  useJournalSeance(); // conservé pour ne pas casser le hook
  const navigate = useNavigate();
  const settings = loadSettings();

  const [menuOuvert, setMenuOuvert]         = useState(false);
  const [confirmDelete, setConfirmDelete]   = useState(false);
  const [confirmDeleteProg, setConfirmDeleteProg] = useState(false);
  const [showDictee, setShowDictee]         = useState(false);
  const [geocoding, setGeocoding]           = useState(false);
  const [exportingDossier, setExportingDossier] = useState(false);
  const [showProfilPicker, setShowProfilPicker] = useState(false);
  const [showEspacePatient, setShowEspacePatient] = useState(false);
  const [activeTab, setActiveTab]           = useState<TabId>('bilans');
  const [seancesStats, setSeancesStats]     = useState<SeancePatientStat[]>([]);
  const [retours, setRetours]               = useState<RetourSeance[]>([]);

  useEffect(() => {
    if (!id || !supabase) return;
    async function loadRetours() {
      const { data } = await supabase!
        .from('retours_seance')
        .select('id, date, borg_rpe, bien_etre')
        .eq('participant_id', id)
        .order('date', { ascending: false })
        .limit(30);
      if (data) {
        setRetours(data.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          date: r.date as string,
          borgRpe: r.borg_rpe as number,
          bienEtre: r.bien_etre as number,
        })));
      }
    }
    void loadRetours();
  }, [id]);

  useEffect(() => {
    if (!id || !supabase) return;
    async function loadAssiduite() {
      const spRes = await supabase!.from('seances_patient')
        .select('id, seance_id, programme_id, date_seance, statut, commentaire_patient, duree_minutes')
        .eq('participant_id', id)
        .order('date_seance', { ascending: false })
        .limit(30);
      if (!spRes.data || spRes.data.length === 0) return;
      const erRes = await supabase!.from('exercices_realises')
        .select('seance_patient_id, realise')
        .in('seance_patient_id', spRes.data.map((s: Record<string, unknown>) => s.id));
      const erRows = (erRes.data ?? []) as { seance_patient_id: string; realise: boolean }[];
      setSeancesStats(spRes.data.map((sp: Record<string, unknown>) => {
        const items = erRows.filter(e => e.seance_patient_id === sp.id);
        return {
          id: sp.id as string,
          seanceId: sp.seance_id as string,
          programmeId: sp.programme_id as string,
          dateSeance: sp.date_seance as string,
          statut: sp.statut as string,
          commentairePatient: (sp.commentaire_patient as string | null) ?? null,
          dureeMinutes: (sp.duree_minutes as number | null) ?? null,
          nbRealises: items.filter(e => e.realise).length,
          nbTotal: items.length,
        };
      }));
    }
    void loadAssiduite();
  }, [id]);

  const alerteRessentis = useMemo(() => {
    if (retours.length < 3) return false;
    const last3 = retours.slice(0, 3);
    return last3.every(r => r.borgRpe >= 8) || last3.every(r => r.bienEtre >= 4);
  }, [retours]);

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
  const contreIndicationsTexte: string | null = getContreIndications(participant, bilanInitial).detail;
  const latestBilan    = sortedBilans[sortedBilans.length - 1] ?? null;
  const contratActif   = contrats.find(c => c.participantId === participant.id && c.statut === 'actif') ?? null;
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
      case 'modifier':        navigate(`/participants/${id}/modifier`); break;
      case 'evolution':       navigate(`/participant/${id}/comparaison`); break;
      case 'lien':            copyClientLink(); break;
      case 'export':          handleExport(); break;
      case 'supprimer':       setConfirmDelete(true); break;
      case 'programme':       navigate(`/participant/${id}/programme`); break;
      case 'nouveau_bilan':   navigate(`/participant/${id}/bilan/new`); break;
      case 'nouveau_contrat': navigate(`/participant/${id}/contrat/nouveau`); break;
      case 'rgpd':            navigate(`/participants/${id}/modifier`); break;
    }
  }

  async function handleExportDossier() {
    setExportingDossier(true);
    try {
      await exportDossierPraticien(
        {
          participant: participant!,
          bilans: sortedBilans,
          contratActif,
          programmeActif,
          compteRendus,
          settings,
        },
        `Dossier_${participant!.nom}_${participant!.prenom}.pdf`
      );
    } finally { setExportingDossier(false); }
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

  const MENU_ACTIONS = [
    { Icon: Pencil,     label: 'Modifier le patient',    action: 'modifier' },
    { Icon: TrendingUp, label: "Rapport d'évolution",    action: 'evolution', disabled: participant.bilans.length < 2 },
    { Icon: Share2,     label: 'Lien client',             action: 'lien' },
    { Icon: Download,   label: 'Mes données (JSON)',      action: 'export' },
    { Icon: Trash2,     label: 'Supprimer',               action: 'supprimer', danger: true },
  ];

  const TABS: { id: TabId; label: string; count?: number }[] = [
    { id: 'bilans',    label: 'Historique bilans',   count: participant.bilans.length },
    { id: 'contrats',  label: 'Contrats de suivi',   count: contratsCount },
    { id: 'assiduite', label: alerteRessentis ? '📊 Assiduité ⚠' : '📊 Assiduité', count: seancesStats.length > 0 ? seancesStats.length : undefined },
    { id: 'rappels',   label: '🔔 Rappels' },
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
                {participant.tags?.filter(t => t in TAG_CONFIG && t !== 'senior' && t !== 'chronique').map(tag => (
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
                    <a
                      href={`tel:${participant.telephone}`}
                      className="hover:text-gray-800 transition-colors"
                      style={{ whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '100%' }}
                    >
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
                          : <RefreshCw size={10} className="animate-spin" style={{ color: 'var(--color-teal)' }} />
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
                    <span className="h-full rounded-full block" style={{ width: `${brouillon.completionPct}%`, background: 'var(--color-teal)' }} />
                  </span>
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--color-teal)' }}>{brouillon.completionPct}%</span>
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

              {/* Structure de rattachement */}
              {participant.structureId && (() => {
                const str = structures.find(s => s.id === participant.structureId);
                return str ? (
                  <div className="mt-1.5">
                    <Link
                      to={`/structures/${str.id}`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity"
                      style={{ background: '#EEF2FF', color: '#4F46E5' }}
                    >
                      🏢 {str.nom}
                    </Link>
                  </div>
                ) : null;
              })()}

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
                            onClick={() => { updateParticipant(id!, { profilHandicap: undefined }).catch(err => { console.error('Erreur retrait profil:', err); toast.error('Erreur lors de la sauvegarde, réessayez'); }); setShowProfilPicker(false); }}
                            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
                          >
                            ✕ Retirer le profil
                          </button>
                        )}
                        {PROFILS_HANDICAP.map(p => (
                          <button
                            key={p.id}
                            onClick={() => { updateParticipant(id!, { profilHandicap: p.id }).catch(err => { console.error('Erreur changement profil:', err); toast.error('Erreur lors de la sauvegarde, réessayez'); }); setShowProfilPicker(false); }}
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
              style={{ background: 'var(--color-teal)' }}
            >
              + Nouveau bilan
            </button>
            <button
              onClick={() => setShowDictee(true)}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Mic size={13} style={{ color: 'var(--color-teal)' }} /> Dicter séance
            </button>

            {/* Groupe 2 : secondaires */}
            {participant.bilans.length >= 2 && (
              <button
                onClick={() => handleAction('evolution')}
                className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors"
              >
                <TrendingUp size={13} /> Évolution
              </button>
            )}
            <button
              onClick={handleExportDossier}
              disabled={exportingDossier}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <FileText size={13} />
              {exportingDossier ? 'PDF…' : 'Dossier'}
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
          <CarteSante participant={participant} bilanInitial={bilanInitial} onModifier={() => navigate(`/participants/${id}/modifier`)} />
          <CarteDisponibilites
            participant={participant}
            onSave={data => updateParticipant(id!, data)}
          />
          <CarteStats participant={participant} contratActif={contratActif} prochaineSeance={prochaineSeance} />
        </div>
        {/* Colonne droite */}
        <div className="flex flex-col gap-3">
          {latestBilan && <CarteProfilFonctionnel participant={participant} bilans={participant.bilans} />}
          <CarteJournalFusion
            compteRendus={compteRendus.slice(0, 5)}
            onDicter={() => setShowDictee(true)}
          />
        </div>
      </div>

      {/* ── PROGRAMME EN COURS ─────────────────────────────────── */}
      {programmeActif && (
        <div className="bg-white rounded-xl border border-gray-200/50 shadow-sm mb-4 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">Programme en cours</div>
              <div className="font-heading font-semibold text-dark text-[15px]">{programmeActif.titre}</div>
              <div className="text-[12px] text-gray-400 mt-0.5">
                Généré le {new Date(programmeActif.dateCreation).toLocaleDateString('fr-FR')}
                {programmeActif.exercices.length > 0 && ` · ${programmeActif.exercices.length} exercice${programmeActif.exercices.length > 1 ? 's' : ''}`}
              </div>
              {(() => {
                const progV2Actif = programmesV2.find(p => p.id === programmeActif.id);
                const objectif = progV2Actif?.objectifSeancesAutonomes;
                if (!objectif) return null;
                const nb = seancesAutonomesStats[progV2Actif!.id]?.count ?? 0;
                const pct = Math.min(100, Math.round((nb / objectif) * 100));
                return (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap">🏃 Séances autonomes : {nb}/{objectif}</span>
                    <div className="h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/participant/${id}/programme`)}
                className="text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-colors"
              >
                Voir complet →
              </button>
              <button
                onClick={() => setConfirmDeleteProg(true)}
                className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                <Trash2 size={12} /> Supprimer
              </button>
            </div>
          </div>
          {programmeActif.exercices.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {programmeActif.exercices.slice(0, 4).map(ep => (
                <div key={ep.exerciceId} className="flex items-center gap-2 text-[13px] text-gray-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
                  <span>{ep.exerciceId.replace(/-/g, ' ')}</span>
                </div>
              ))}
              {programmeActif.exercices.length > 4 && (
                <div className="text-[12px] text-gray-400 pl-3.5">+ {programmeActif.exercices.length - 4} autre(s)</div>
              )}
            </div>
          )}
          {programmeActif.objectif && (
            <div className="mt-2 text-[12px] text-gray-500 italic">🎯 {programmeActif.objectif}</div>
          )}
        </div>
      )}

      {/* ── TABS ───────────────────────────────────────────────── */}
      <TabsSection activeTab={activeTab} setActiveTab={setActiveTab} tabs={TABS}>
        {activeTab === 'bilans' && (
          <div>
            <BilanTimeline
              bilans={participant.bilans}
              participantId={participant.id}
              onDelete={(bilanId) => deleteBilan(participant.id, bilanId)}
            />
            {sortedBilans.length >= 1 && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <BilanEvolutionCharts bilans={sortedBilans} />
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
        {activeTab === 'assiduite' && (() => {
          if (seancesStats.length === 0) return (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">📊</div>
              <p className="font-medium">Aucune séance enregistrée</p>
              <p className="text-sm mt-1">Les séances faites par le patient via l'espace patient apparaîtront ici.</p>
            </div>
          );

          const now = new Date();
          const j30 = new Date(now); j30.setDate(j30.getDate() - 30);
          const j14 = new Date(now); j14.setDate(j14.getDate() - 14);
          const j7  = new Date(now); j7.setDate(j7.getDate() - 7);

          const s30 = seancesStats.filter(s => new Date(s.dateSeance) >= j30);
          const s14 = seancesStats.filter(s => new Date(s.dateSeance) >= j14);

          const totalRealises30 = s30.reduce((a, s) => a + s.nbRealises, 0);
          const totalEx30       = s30.reduce((a, s) => a + s.nbTotal, 0);
          const taux30          = totalEx30 > 0 ? Math.round((totalRealises30 / totalEx30) * 100) : null;

          const totalRealises14 = s14.reduce((a, s) => a + s.nbRealises, 0);
          const totalEx14       = s14.reduce((a, s) => a + s.nbTotal, 0);
          const taux14          = totalEx14 > 0 ? Math.round((totalRealises14 / totalEx14) * 100) : null;

          const derniereSeance  = seancesStats[0];
          const joursInactivite = derniereSeance
            ? Math.floor((now.getTime() - new Date(derniereSeance.dateSeance).getTime()) / 86400000)
            : null;

          const alerteDouleur = seancesStats.slice(0, 5).find(s =>
            s.commentairePatient?.toLowerCase().match(/douleur|mal|fait mal|douloureux/)
          );

          // Ressentis post-séance (Borg RPE + bien-être) : alerte si 3 dernières séances dégradées
          const last3 = retours.slice(0, 3);
          const alerteEffort = retours.length >= 3 && last3.every(r => r.borgRpe >= 8);
          const alerteBienEtre = retours.length >= 3 && last3.every(r => r.bienEtre >= 4);

          // Données graphique (chronologique, anciens→récents)
          const chartData = [...retours].reverse().slice(-20).map(r => ({
            date: new Date(r.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
            Effort: r.borgRpe,
            'Bien-être': r.bienEtre,
          }));

          return (
            <div className="space-y-5">
              {/* Alertes */}
              {(joursInactivite !== null && joursInactivite >= 5 || alerteDouleur || (taux14 !== null && taux14 < 50) || alerteEffort || alerteBienEtre) && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">À surveiller</div>
                  {joursInactivite !== null && joursInactivite >= 5 && (
                    <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium" style={{ background: '#FFF7E6', color: '#B45309' }}>
                      ⏰ Inactivité : {joursInactivite} jours sans séance
                    </div>
                  )}
                  {alerteDouleur && (
                    <div className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm" style={{ background: '#FCEBEB', color: '#A32D2D' }}>
                      <span className="font-bold flex-shrink-0">⚠️</span>
                      <div>
                        <div className="font-semibold">Douleur signalée</div>
                        <div className="text-[12px] mt-0.5 opacity-80">
                          Le {new Date(alerteDouleur.dateSeance + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} : "{alerteDouleur.commentairePatient}"
                        </div>
                      </div>
                    </div>
                  )}
                  {taux14 !== null && taux14 < 50 && (
                    <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium" style={{ background: '#FCEBEB', color: '#A32D2D' }}>
                      📉 Taux de réalisation faible sur 14 jours : {taux14}%
                    </div>
                  )}
                  {alerteEffort && (
                    <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: '#FEF3C7', color: '#92400E' }}>
                      <span className="font-semibold">Effort élevé répété</span>
                      {' '}— Borg ≥ 8 sur les 3 dernières séances.
                      Envisager d'adapter la charge lors de la prochaine séance.
                    </div>
                  )}
                  {alerteBienEtre && (
                    <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: '#FEE2E2', color: '#991B1B' }}>
                      <span className="font-semibold">Bien-être dégradé répété</span>
                      {' '}— Fatigué ou épuisé sur les 3 dernières séances.
                      Vérifier la récupération et la charge globale.
                    </div>
                  )}
                </div>
              )}

              {/* Statistiques */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Statistiques</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-gray-200/70 p-3 text-center">
                    <div className="text-2xl font-bold" style={{ color: taux30 !== null && taux30 >= 70 ? '#16A34A' : taux30 !== null && taux30 >= 50 ? '#EA580C' : '#DC2626' }}>
                      {taux30 !== null ? `${taux30}%` : '—'}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Taux 30j</div>
                  </div>
                  <div className="rounded-xl border border-gray-200/70 p-3 text-center">
                    <div className="text-2xl font-bold text-gray-800">{s30.length}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Séances 30j</div>
                  </div>
                  <div className="rounded-xl border border-gray-200/70 p-3 text-center">
                    <div className="text-2xl font-bold text-gray-800">{seancesStats.length}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Total</div>
                  </div>
                </div>
                {taux30 !== null && (
                  <div className="mt-3">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${taux30}%`,
                          background: taux30 >= 70 ? '#16A34A' : taux30 >= 50 ? '#EA580C' : '#DC2626',
                        }}
                      />
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1 text-right">{totalRealises30}/{totalEx30} exercices réalisés sur 30j</div>
                  </div>
                )}
              </div>

              {/* Courbe d'évolution des ressentis — double axe Y */}
              {chartData.length >= 2 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">
                    Évolution ressentis ({chartData.length} retours)
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} />
                      {/* Axe gauche : Effort (Borg 1-10) */}
                      <YAxis
                        yAxisId="left"
                        domain={[0, 10]}
                        ticks={[2, 4, 6, 8, 10]}
                        tick={{ fontSize: 11, fill: '#1A5F9E' }}
                        tickLine={false}
                        axisLine={false}
                        label={{ value: 'Effort', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#1A5F9E' }}
                      />
                      {/* Axe droit : Bien-être (1-5, 1=Très bien 5=Épuisé) */}
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[0, 5]}
                        ticks={[1, 2, 3, 4, 5]}
                        tick={{ fontSize: 11, fill: '#EA580C' }}
                        tickLine={false}
                        axisLine={false}
                        label={{ value: 'Bien-être', angle: 90, position: 'insideRight', offset: 10, fontSize: 11, fill: '#EA580C' }}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                        formatter={(value, name) => {
                          const v = Number(value);
                          if (name === 'Effort') return [`${v} — ${labelBorg(v)}`, 'Effort'];
                          return [`${v} — ${labelBienEtre(v)}`, 'Bien-être'];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="Effort"
                        stroke="#1A5F9E"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#1A5F9E' }}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="Bien-être"
                        stroke="#EA580C"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#EA580C' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="text-[10px] text-gray-400 mt-1 text-right">
                    Effort (axe gauche, 2=très facile 10=très difficile) ·
                    Bien-être (axe droit, 1=très bien 5=épuisé)
                  </div>
                </div>
              )}

              {/* Historique */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Détail des séances</div>
                <div className="space-y-2">
                  {seancesStats.slice(0, 15).map(sp => {
                    const emoji = sp.statut === 'terminee' ? '✅' : sp.statut === 'partielle' ? '⚠️' : '🔄';
                    const dateLabel = new Date(sp.dateSeance + 'T12:00').toLocaleDateString('fr-FR', {
                      weekday: 'short', day: 'numeric', month: 'short',
                    });
                    const retour = retours.find(r => dateOnly(r.date) === dateOnly(sp.dateSeance));
                    return (
                      <div key={sp.id} className="flex items-start gap-2.5 rounded-lg border border-gray-100 px-3 py-2.5">
                        <span className="text-sm flex-shrink-0 mt-0.5">{emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-semibold text-gray-800">{dateLabel}</span>
                            {sp.nbTotal > 0 && (
                              <span className="text-[12px] font-medium px-1.5 py-0.5 rounded-full"
                                style={{
                                  background: sp.nbRealises === sp.nbTotal ? '#DCFCE7' : '#FEF3C7',
                                  color: sp.nbRealises === sp.nbTotal ? '#16A34A' : '#B45309',
                                }}>
                                {sp.nbRealises}/{sp.nbTotal} ex.
                              </span>
                            )}
                            {sp.dureeMinutes && (
                              <span className="text-[11px] text-gray-400">{sp.dureeMinutes} min</span>
                            )}
                          </div>
                          {sp.commentairePatient && (
                            <div className="text-[12px] text-gray-400 italic mt-0.5 truncate">"{sp.commentairePatient}"</div>
                          )}
                          {retour && (
                            <div className="text-[12px] mt-0.5" style={{ color: retour.borgRpe >= 8 || retour.bienEtre >= 4 ? '#B45309' : '#6B7280' }}>
                              Effort : {labelBorg(retour.borgRpe)} · Ressenti : {labelBienEtre(retour.bienEtre)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
        {activeTab === 'rappels' && (
          <SectionRappelsPatient participantId={participant.id} />
        )}
      </TabsSection>

      {/* ── MODALS ─────────────────────────────────────────────── */}

      {/* Confirmation suppression programme */}
      {confirmDeleteProg && programmeActif && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <h2 className="font-heading font-bold text-gray-900 text-lg">Supprimer le programme ?</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Le programme <strong>"{programmeActif.titre}"</strong> sera définitivement supprimé.
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try {
                    await deleteProgramme(programmeActif.id);
                    setConfirmDeleteProg(false);
                    toast.success('Programme supprimé');
                  } catch (err) {
                    console.error('Erreur suppression programme:', err);
                    toast.error('Erreur lors de la suppression, réessayez');
                  }
                }}
                className="flex-1 bg-red-500 text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> Supprimer
              </button>
              <button onClick={() => setConfirmDeleteProg(false)} className="px-4 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 text-sm">Annuler</button>
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
                style={{ backgroundColor: '#E24B4A', color: 'white', border: 'none' }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
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
