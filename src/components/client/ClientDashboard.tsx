import { useState } from 'react';
import type { Participant, Ressenti, Bilan } from '../../types';
import RadarChart from '../charts/RadarChart';
import ProgressCurve from '../charts/ProgressCurve';
import ClientProgramme from './ClientProgramme';
import { Activity, TrendingUp, Calendar, Award } from 'lucide-react';
import { useProgramme } from '../../hooks/useProgramme';
import { calculerNote, NORMES_SCORING } from '../../data/norms';
import MarkdownRendu from '../ui/MarkdownRendu';

interface Props { participant: Participant }

function calcAge(dateNaissance: string): number {
  const today = new Date(), birth = new Date(dateNaissance);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth()) age--;
  return age;
}

const TESTS_PROGRES = [
  { label: 'Équilibre',  normeKey: 'equilibreUnipodal', unite: 's',     lower: false, getVal: (b: Bilan) => b.equilibre.droite },
  { label: 'Force',      normeKey: 'chairStand30',      unite: ' rép.', lower: false, getVal: (b: Bilan) => b.chairStand30 },
  { label: 'Mobilité',   normeKey: 'tug3m',             unite: 's',     lower: true,  getVal: (b: Bilan) => b.tug3m },
  { label: 'Endurance',  normeKey: 'tm6Distance',        unite: ' m',    lower: false, getVal: (b: Bilan) => b.tm6.distanceMetres },
  { label: 'Souplesse',  normeKey: 'souplesse',          unite: ' cm',   lower: false, getVal: (b: Bilan) => b.souplesse.valeur },
  { label: 'Mémoire',    normeKey: 'memoire',            unite: '/5',    lower: false, getVal: (b: Bilan) => b.memoire.scoreImmediat },
];

const COULEURS_NOTE: Record<number, string> = {
  1: '#EF4444', 2: '#F97316', 3: '#F59E0B', 4: '#22C55E', 5: '#16A34A',
};

function getMeilleuresProgressions(initial: Bilan | null, actuel: Bilan | null) {
  if (!initial || !actuel) return [];
  return TESTS_PROGRES
    .map(t => {
      const v0 = t.getVal(initial), vN = t.getVal(actuel);
      if (v0 == null || vN == null) return null;
      const progression = t.lower ? -(vN - v0) : vN - v0;
      if (progression <= 0) return null;
      return { label: t.label, valeur: Math.abs(vN - v0), progression, unite: t.unite };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => b.progression - a.progression)
    .slice(0, 4);
}

// ── Onglet Progrès ────────────────────────────────────────────────────────────

function OngletProgres({ participant, bilans }: { participant: Participant; bilans: Bilan[] }) {
  const initial = bilans[0] ?? null;
  const actuel  = bilans[bilans.length - 1] ?? null;
  const progressions = getMeilleuresProgressions(initial, actuel);

  if (!actuel) return null;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      {/* Bienvenue */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-4">
          <div className="bg-primary w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {participant.prenom[0]}{participant.nom[0]}
          </div>
          <div>
            <h1 className="font-heading font-bold text-dark text-lg">Bonjour, {participant.prenom} ! 👋</h1>
            <p className="text-gray-400 text-sm">
              {calcAge(participant.dateNaissance)} ans · {bilans.length} bilan{bilans.length > 1 ? 's' : ''} réalisé{bilans.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Message coach */}
      {actuel.messageClient && (
        <div className="bg-gradient-to-br from-secondary/20 to-secondary/5 rounded-2xl p-5 border border-secondary/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={15} className="text-secondary" />
            <span className="font-semibold text-dark text-sm">Message de votre coach</span>
          </div>
          <div className="text-dark text-sm leading-relaxed italic"><MarkdownRendu>{actuel.messageClient}</MarkdownRendu></div>
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
            <Calendar size={10} />
            {new Date(actuel.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      )}

      {/* Objectifs */}
      {bilans[0]?.profilEnrichi?.objectifsPersonnels && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-2">
            <span>🎯</span>
            <span className="font-semibold text-dark text-sm">Vos objectifs</span>
          </div>
          <p className="text-dark text-sm leading-relaxed">{bilans[0].profilEnrichi!.objectifsPersonnels}</p>
        </div>
      )}

      {/* Meilleures progressions */}
      {progressions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Award size={14} className="text-secondary" />
            <span className="font-semibold text-dark text-sm">Vos meilleures progressions</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {progressions.map((p, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                <div className="text-2xl font-bold text-secondary">
                  +{p.valeur % 1 === 0 ? p.valeur : p.valeur.toFixed(1)}{p.unite}
                </div>
                <div className="text-xs text-gray-400 mt-1">{p.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Radar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-heading font-semibold text-dark mb-1 text-base">Votre profil de forme</h2>
        <p className="text-xs text-gray-400 mb-3">Score 0–100% par rapport aux références</p>
        <RadarChart initial={initial !== actuel ? initial : null} current={actuel} />
      </div>

      {/* Barres de niveau */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-heading font-semibold text-dark mb-3 text-base">📊 Votre niveau actuel</h2>
        <div className="space-y-3">
          {TESTS_PROGRES.map(test => {
            const val = test.getVal(actuel);
            if (val == null) return null;
            const note = NORMES_SCORING[test.normeKey] ? calculerNote(val, NORMES_SCORING[test.normeKey]) : null;
            if (!note) return null;
            return (
              <div key={test.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">{test.label}</span>
                  <span className="font-bold" style={{ color: COULEURS_NOTE[note] }}>{note}/5</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(note / 5) * 100}%`, background: COULEURS_NOTE[note] }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Courbes si 2+ bilans */}
      {bilans.length > 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-heading font-semibold text-dark mb-1 text-base">Votre progression</h2>
          <p className="text-xs text-gray-400 mb-3">Évolution sur tous vos bilans</p>
          <ProgressCurve bilans={bilans} />
        </div>
      )}

      <p className="text-center text-xs text-gray-400 py-2">Suivi réalisé par votre praticien</p>
    </div>
  );
}

// ── Onglet Historique ─────────────────────────────────────────────────────────

function OngletHistorique({ bilans }: { bilans: Bilan[] }) {
  const sorted = [...bilans].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h2 className="font-heading font-semibold text-dark mb-4">Vos bilans</h2>
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Activity size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Aucun bilan disponible.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((b, i) => (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0 ${b.type === 'initial' ? 'bg-primary' : 'bg-secondary'}`}>
                  {b.type === 'initial' ? 'I' : `T${b.trimestre}`}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-dark text-sm">
                    {b.type === 'initial' ? 'Bilan initial' : `Bilan T${b.trimestre}`}
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(b.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
                {i === 0 && <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-medium">Dernier</span>}
              </div>

              <div className="flex flex-wrap gap-4 text-center">
                {b.equilibre.droite != null && (
                  <div><div className="text-xs text-gray-400">Équilibre D</div><div className="font-bold text-dark text-sm">{b.equilibre.droite}s</div></div>
                )}
                {b.chairStand30 != null && (
                  <div><div className="text-xs text-gray-400">Chair Stand</div><div className="font-bold text-dark text-sm">{b.chairStand30} rép.</div></div>
                )}
                {b.tug3m != null && (
                  <div><div className="text-xs text-gray-400">TUG 3m</div><div className="font-bold text-dark text-sm">{b.tug3m}s</div></div>
                )}
                {b.tm6.distanceMetres != null && (
                  <div><div className="text-xs text-gray-400">TM6</div><div className="font-bold text-dark text-sm">{b.tm6.distanceMetres}m</div></div>
                )}
              </div>

              {b.messageClient && (
                <div className="mt-3 pt-3 border-t border-gray-50 text-xs text-secondary italic">
                  <MarkdownRendu>{b.messageClient}</MarkdownRendu>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ClientDashboard({ participant }: Props) {
  const sorted = [...participant.bilans].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const latest = sorted[sorted.length - 1] ?? null;
  const [tab, setTab] = useState<'progres' | 'programme' | 'historique'>('progres');
  const { programmeActif, toggleSuivi } = useProgramme(participant.id);

  async function handleToggleSuivi(dateISO: string, exerciceId: string, fait: boolean, ressenti?: Ressenti) {
    if (!programmeActif) return;
    try {
      await toggleSuivi(programmeActif.id, dateISO, { exerciceId, fait, ressenti });
    } catch (err) {
      console.error('Erreur mise à jour suivi exercice:', err);
    }
  }

  if (!latest) return (
    <div className="min-h-screen bg-gradient-to-br from-light to-white flex items-center justify-center p-6">
      <div className="text-center text-gray-500">
        <Activity size={48} className="mx-auto mb-4 opacity-30" />
        <p>Aucun bilan disponible pour le moment.</p>
      </div>
    </div>
  );

  const ONGLETS = [
    { id: 'progres'    as const, label: '📈 Mes progrès' },
    { id: 'programme'  as const, label: '🏋️ Programme' },
    { id: 'historique' as const, label: '📋 Historique' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-light to-white">
      {/* Header */}
      <div className="bg-dark text-white px-6 pt-5 pb-0">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <img src="/logo.png" alt="" style={{ height: 34, width: 'auto' }} />
            <span className="text-white/40 text-xs">Votre espace progression</span>
          </div>
          <div className="font-heading font-bold text-white text-xl mb-4">
            Bonjour {participant.prenom} 👋
          </div>
          <div className="flex border-t border-white/10">
            {ONGLETS.map(o => (
              <button
                key={o.id}
                onClick={() => setTab(o.id)}
                className={`flex-1 py-3 text-xs font-semibold transition-colors border-b-2 ${
                  tab === o.id ? 'text-secondary border-secondary' : 'text-white/55 border-transparent hover:text-white'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'progres'    && <OngletProgres participant={participant} bilans={sorted} />}
      {tab === 'historique' && <OngletHistorique bilans={sorted} />}
      {tab === 'programme'  && (
        programmeActif ? (
          <ClientProgramme
            programme={programmeActif}
            participantPrenom={participant.prenom}
            onToggleSuivi={handleToggleSuivi}
          />
        ) : (
          <div className="max-w-lg mx-auto px-4 py-16 text-center text-gray-400">
            <div className="text-5xl mb-4">📋</div>
            <p className="font-medium text-dark text-lg">Pas de programme actif</p>
            <p className="text-sm mt-2">Votre coach va bientôt créer un programme pour vous !</p>
          </div>
        )
      )}
    </div>
  );
}
