import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip, Legend, Filler, ArcElement,
} from 'chart.js';
import { Chart, Line, Doughnut } from 'react-chartjs-2';
import { TrendingUp, TrendingDown, Edit3, ChevronDown, ChevronUp } from 'lucide-react';
import PageWrapper from '../components/layout/PageWrapper';
import { useParticipants } from '../hooks/useParticipants';
import { useAgenda } from '../hooks/useAgenda';
import { useContrats } from '../hooks/useContrats';
import { useStatsPro, type StatsPro } from '../hooks/useStatsPro';
import type { Participant } from '../types';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip, Legend, Filler, ArcElement,
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MOIS_COURTS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
const MOIS_LONGS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function moisKey(annee: number, mois: number) {
  return `${annee}-${String(mois + 1).padStart(2, '0')}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 7);
}

function moisPrecedentKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function calculerAge(dateNaissance?: string): number {
  if (!dateNaissance) return 0;
  const now = new Date();
  const birth = new Date(dateNaissance);
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function getLast12Weeks(): { label: string; debut: Date; fin: Date }[] {
  const result: { label: string; debut: Date; fin: Date }[] = [];
  const today = new Date();
  for (let i = 11; i >= 0; i--) {
    const fin = new Date(today);
    fin.setDate(today.getDate() - i * 7);
    fin.setHours(23, 59, 59, 999);
    const debut = new Date(fin);
    debut.setDate(fin.getDate() - 6);
    debut.setHours(0, 0, 0, 0);
    const jan1 = new Date(debut.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((debut.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    result.push({ label: `S${weekNum}`, debut, fin });
  }
  return result;
}

function formatMoisAnnee(d: Date) {
  return `${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({ label, valeur, delta, deltaPositif }: {
  label: string;
  valeur: string;
  delta?: string | null;
  deltaPositif?: boolean | null;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="text-xs text-gray-500 font-medium mb-1.5">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 leading-none">{valeur}</div>
      {delta && (
        <div className="text-xs mt-2 font-medium"
          style={{
            color: deltaPositif === null || deltaPositif === undefined
              ? '#6B7280'
              : deltaPositif ? '#1D9E75' : '#E85050',
          }}>
          {delta}
        </div>
      )}
    </div>
  );
}

// ─── Formulaire saisie CA ─────────────────────────────────────────────────────

function FormulaireSaisieCA({ statsPro, onSave }: {
  statsPro: StatsPro;
  onSave: (s: StatsPro) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const annee = new Date().getFullYear();
  const [valeurs, setValeurs] = useState<Record<string, number>>({ ...statsPro.caParMois });
  const [objMensuel, setObjMensuel] = useState(statsPro.objectifMensuel);
  const [objAnnuel, setObjAnnuel] = useState(statsPro.objectifAnnuel);

  useEffect(() => {
    setValeurs({ ...statsPro.caParMois });
    setObjMensuel(statsPro.objectifMensuel);
    setObjAnnuel(statsPro.objectifAnnuel);
  }, [statsPro]);

  return (
    <div>
      <button
        onClick={() => setOuvert(o => !o)}
        className="flex items-center gap-2 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 px-3 py-2 rounded-xl transition-colors"
      >
        <Edit3 size={14} />
        Saisir mon CA
        {ouvert ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {ouvert && (
        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">CA mensuel {annee}</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {Array.from({ length: 12 }, (_, i) => {
              const key = moisKey(annee, i);
              return (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 w-20 flex-shrink-0">{MOIS_LONGS[i]}</label>
                  <input
                    type="number"
                    value={valeurs[key] ?? ''}
                    placeholder="0"
                    min={0}
                    onChange={e => setValeurs(v => ({
                      ...v,
                      [key]: parseInt(e.target.value) || 0,
                    }))}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-gray-400">€</span>
                </div>
              );
            })}
          </div>

          <div className="border-t border-gray-200 pt-3 space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Objectifs</p>
            {[
              { label: 'Objectif mensuel', val: objMensuel, set: setObjMensuel },
              { label: 'Objectif annuel',  val: objAnnuel,  set: setObjAnnuel  },
            ].map(({ label, val, set }) => (
              <div key={label} className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-32 flex-shrink-0">{label}</label>
                <input
                  type="number" value={val} min={0}
                  onChange={e => set(parseInt(e.target.value) || 0)}
                  className="w-32 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-primary"
                />
                <span className="text-xs text-gray-400">€</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              onSave({ caParMois: valeurs, objectifMensuel: objMensuel, objectifAnnuel: objAnnuel });
              setOuvert(false);
            }}
            className="w-full py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors mt-1"
          >
            Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Graphique CA mensuel ─────────────────────────────────────────────────────

function GraphiqueCA({ statsPro }: { statsPro: StatsPro }) {
  const annee = new Date().getFullYear();
  const moisActuel = new Date().getMonth();

  const caData = Array.from({ length: 12 }, (_, i) => {
    const v = statsPro.caParMois[moisKey(annee, i)];
    return v !== undefined ? v : null;
  });

  const data: any = {
    labels: MOIS_COURTS,
    datasets: [
      {
        type: 'bar' as const,
        label: 'CA (€)',
        data: caData,
        backgroundColor: caData.map((_, i) => i === moisActuel ? '#1A5F9E' : '#B5D4F4'),
        borderRadius: 5,
        borderSkipped: false,
        order: 2,
      },
      {
        type: 'line' as const,
        label: 'Objectif mensuel',
        data: Array(12).fill(statsPro.objectifMensuel),
        borderColor: '#F59E0B',
        borderDash: [5, 4] as any,
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 1,
      },
    ],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) =>
            ctx.parsed.y !== null
              ? `${ctx.dataset.label} : ${Number(ctx.parsed.y).toLocaleString('fr-FR')} €`
              : 'Non renseigné',
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: {
          font: { size: 11 },
          callback: (v: any) => `${Number(v).toLocaleString('fr-FR')}€`,
        },
      },
    },
  };

  return (
    <div style={{ height: 220 }}>
      <Chart type="bar" data={data} options={options} />
    </div>
  );
}

// ─── Graphique séances hebdomadaires ─────────────────────────────────────────

function GraphiqueSeances({ seances }: { seances: any[] }) {
  const semaines = getLast12Weeks();
  const seancesData = semaines.map(s =>
    seances.filter(seance =>
      seance.statut === 'realisee' &&
      new Date(seance.date) >= s.debut &&
      new Date(seance.date) <= s.fin
    ).length
  );

  const data = {
    labels: semaines.map(s => s.label),
    datasets: [{
      label: 'Séances réalisées',
      data: seancesData,
      borderColor: '#1A5F9E',
      backgroundColor: 'rgba(26,95,158,0.08)',
      tension: 0.3,
      fill: true,
      pointRadius: 3,
      pointBackgroundColor: '#1A5F9E',
    }],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: {
        min: 0,
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: { font: { size: 11 }, stepSize: 2 },
      },
    },
  };

  return (
    <div style={{ height: 220 }}>
      <Line data={data} options={options} />
    </div>
  );
}

// ─── Progression par test ─────────────────────────────────────────────────────

const LABELS_TESTS: Record<string, string> = {
  equilibre:  'Équilibre',
  force:      'Force (CS30)',
  handGrip:   'Force grip',
  mobilite:   'Mobilité (TUG)',
  souplesse:  'Souplesse',
  endurance:  'Endurance',
  memoire:    'Mémoire',
};

function calcDeltaPct(vi: number | null, va: number | null, lowerIsBetter = false): number | null {
  if (!vi || !va || vi === 0) return null;
  const d = lowerIsBetter ? ((vi - va) / vi) * 100 : ((va - vi) / vi) * 100;
  return Math.round(d);
}

function SectionProgression({ participants }: { participants: Participant[] }) {
  const progressions: Record<string, number[]> = {
    equilibre: [], force: [], handGrip: [], mobilite: [], souplesse: [], endurance: [], memoire: [],
  };

  participants.forEach(p => {
    const bilans = [...p.bilans].sort((a, b) => a.date.localeCompare(b.date));
    if (bilans.length < 2) return;
    const ini = bilans[0];
    const act = bilans[bilans.length - 1];

    const pushIf = (key: string, v: number | null) => { if (v !== null) progressions[key].push(v); };

    const eqI = ((ini.equilibre?.droite ?? 0) + (ini.equilibre?.gauche ?? 0)) / 2;
    const eqA = ((act.equilibre?.droite ?? 0) + (act.equilibre?.gauche ?? 0)) / 2;
    pushIf('equilibre', calcDeltaPct(eqI, eqA));
    pushIf('force',     calcDeltaPct(ini.chairStand30, act.chairStand30));
    const hgI = ((ini.handGrip?.droite ?? 0) + (ini.handGrip?.gauche ?? 0)) / 2;
    const hgA = ((act.handGrip?.droite ?? 0) + (act.handGrip?.gauche ?? 0)) / 2;
    pushIf('handGrip',  calcDeltaPct(hgI, hgA));
    pushIf('mobilite',  calcDeltaPct(ini.tug3m, act.tug3m, true));
    pushIf('souplesse', calcDeltaPct(ini.souplesse?.valeur, act.souplesse?.valeur));
    pushIf('endurance', calcDeltaPct(ini.tm6?.distanceMetres, act.tm6?.distanceMetres));
    const memI = ini.memoire?.dubois?.scoreMIS ?? ((ini.memoire?.scoreImmediat ?? 0) + (ini.memoire?.scoreDiffere ?? 0));
    const memA = act.memoire?.dubois?.scoreMIS ?? ((act.memoire?.scoreImmediat ?? 0) + (act.memoire?.scoreDiffere ?? 0));
    pushIf('memoire', calcDeltaPct(memI, memA));
  });

  const rows = Object.entries(progressions)
    .map(([key, vals]) => ({
      key,
      label: LABELS_TESTS[key],
      moy: vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
      n: vals.length,
    }))
    .filter(r => r.moy !== null);

  if (rows.length === 0) {
    return <p className="text-xs text-gray-400 italic py-4">Pas encore assez de bilans pour calculer les progressions.</p>;
  }

  return (
    <div className="space-y-2.5">
      {rows.sort((a, b) => (b.moy ?? 0) - (a.moy ?? 0)).map(r => {
        const pct = r.moy!;
        const color = pct >= 10 ? '#1D9E75' : pct >= 0 ? '#F59E0B' : '#E85050';
        const barW = Math.min(100, Math.abs(pct));
        return (
          <div key={r.key}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-700 font-medium">{r.label}</span>
              <span className="font-semibold" style={{ color }}>
                {pct > 0 ? '+' : ''}{pct}% <span className="text-gray-400 font-normal">({r.n} patient{r.n > 1 ? 's' : ''})</span>
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div style={{ width: `${barW}%`, background: color }} className="h-full rounded-full transition-all" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Top assiduité ────────────────────────────────────────────────────────────

function SectionAssiduite({ participants, seances, contratActif }: {
  participants: Participant[];
  seances: any[];
  contratActif: (id: string) => any;
}) {
  const tops = participants
    .map(p => {
      const contrat = contratActif(p.id);
      const seancesPt = seances.filter(s => s.participantId === p.id);
      const planifiees = contrat
        ? seancesPt.filter(s => s.contratId === contrat.id).length
        : seancesPt.length;
      const realisees = contrat
        ? seancesPt.filter(s => s.contratId === contrat.id && s.statut === 'realisee').length
        : seancesPt.filter(s => s.statut === 'realisee').length;
      if (planifiees === 0) return null;
      const taux = Math.round((realisees / planifiees) * 100);
      return { p, realisees, planifiees, taux };
    })
    .filter(Boolean)
    .sort((a, b) => b!.taux - a!.taux)
    .slice(0, 5) as { p: Participant; realisees: number; planifiees: number; taux: number }[];

  if (tops.length === 0) {
    return <p className="text-xs text-gray-400 italic py-4">Aucune séance enregistrée.</p>;
  }

  return (
    <div className="space-y-1">
      {tops.map(({ p, realisees, planifiees, taux }) => (
        <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ background: '#1A5F9E', fontSize: 10 }}>
            {(p.prenom?.[0] ?? '?').toUpperCase()}{(p.nom?.[0] ?? '?').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-800 truncate">{p.prenom} {p.nom}</div>
            <div className="text-xs text-gray-400">{realisees}/{planifiees} séances</div>
          </div>
          <span className="text-sm font-semibold flex-shrink-0"
            style={{ color: taux >= 80 ? '#1D9E75' : '#F59E0B' }}>
            {taux}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Répartition patients ─────────────────────────────────────────────────────

function SectionRepartition({ participants }: { participants: Participant[] }) {
  const counts: Record<string, number> = {
    'Sénior': 0, 'Post-op': 0, 'Chronique': 0, 'Adulte blessé': 0, 'Autre': 0,
  };

  participants.forEach(p => {
    const tags = p.tags ?? [];
    if (tags.includes('post_op'))          counts['Post-op']++;
    else if (tags.includes('senior'))      counts['Sénior']++;
    else if (tags.includes('chronique'))   counts['Chronique']++;
    else if (tags.includes('adulte_blessure')) counts['Adulte blessé']++;
    else {
      const age = calculerAge(p.dateNaissance);
      const ctx = (p.contexteClinic ?? '').toLowerCase();
      if (ctx.includes('pth') || ctx.includes('opér') || ctx.includes('post-op')) counts['Post-op']++;
      else if (age >= 65) counts['Sénior']++;
      else counts['Autre']++;
    }
  });

  const filteredLabels = Object.keys(counts).filter(k => counts[k] > 0);
  const filteredData   = filteredLabels.map(k => counts[k]);
  const COLORS = ['#1A5F9E','#2BBFBF','#F59E0B','#1D9E75','#888780'];

  if (filteredData.length === 0) {
    return <p className="text-xs text-gray-400 italic py-4">Aucun patient enregistré.</p>;
  }

  const total = filteredData.reduce((a, b) => a + b, 0);

  const data = {
    labels: filteredLabels,
    datasets: [{
      data: filteredData,
      backgroundColor: COLORS.slice(0, filteredLabels.length),
      borderWidth: 0,
      hoverOffset: 4,
    }],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.label} : ${ctx.parsed} patient${ctx.parsed > 1 ? 's' : ''}`,
        },
      },
    },
    cutout: '65%',
  };

  return (
    <div className="flex items-center gap-4">
      <div style={{ width: 110, height: 110, flexShrink: 0 }}>
        <Doughnut data={data} options={options} />
      </div>
      <div className="flex-1 space-y-1.5">
        {filteredLabels.map((l, i) => (
          <div key={l} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i] }} />
            <span className="text-gray-600 flex-1">{l}</span>
            <span className="font-semibold text-gray-800">{counts[l]}</span>
            <span className="text-gray-400">({Math.round((counts[l] / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function StatsPage() {
  const { participants } = useParticipants();
  const { seances } = useAgenda();
  const { contratActifDeParticipant } = useContrats();
  const { statsPro, sauvegarder } = useStatsPro();

  const now = new Date();
  const moisActuelKey = todayKey();
  const moisPrecKey   = moisPrecedentKey(moisActuelKey);

  const caMois     = statsPro.caParMois[moisActuelKey] ?? 0;
  const caPrecedent= statsPro.caParMois[moisPrecKey] ?? 0;
  const deltaCaPct = caPrecedent > 0 ? Math.round(((caMois - caPrecedent) / caPrecedent) * 100) : null;
  const caAnnuel   = Object.entries(statsPro.caParMois)
    .filter(([k]) => k.startsWith(now.getFullYear().toString()))
    .reduce((s, [, v]) => s + v, 0);

  const seancesMois = seances.filter(s =>
    s.date.startsWith(moisActuelKey) && s.statut === 'realisee'
  ).length;
  const seancesTotal = seances.filter(s => s.date.startsWith(moisActuelKey)).length;
  const annulations  = seancesTotal - seancesMois;
  const tauxPresence = seancesTotal > 0 ? Math.round((seancesMois / seancesTotal) * 100) : 0;

  const patientsActifs = participants.filter(p => contratActifDeParticipant(p.id)).length;

  const pct = statsPro.objectifMensuel > 0
    ? Math.round((caMois / statsPro.objectifMensuel) * 100) : 0;
  const badgeLabel  = pct >= 100 ? 'Objectif atteint ✓' : pct >= 80 ? 'Bonne dynamique' : pct >= 50 ? 'En cours' : 'À accélérer';
  const badgeColor  = pct >= 80 ? { bg: '#E8F7F1', text: '#1D9E75' } : pct >= 50 ? { bg: '#FEF3C7', text: '#92400E' } : { bg: '#FEE2E2', text: '#B91C1C' };

  return (
    <PageWrapper>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Mon tableau de bord</h1>
          <div className="text-sm text-gray-500 mt-0.5">
            {formatMoisAnnee(now)} · {patientsActifs} patient{patientsActifs > 1 ? 's' : ''} actif{patientsActifs > 1 ? 's' : ''}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <FormulaireSaisieCA statsPro={statsPro} onSave={sauvegarder} />
          <div className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
            style={{ background: badgeColor.bg, color: badgeColor.text }}>
            {pct >= 50
              ? <TrendingUp size={13} />
              : <TrendingDown size={13} />}
            {badgeLabel}
          </div>
        </div>
      </div>

      {/* ── 4 Metric cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <MetricCard
          label="CA ce mois"
          valeur={`${caMois.toLocaleString('fr-FR')} €`}
          delta={deltaCaPct !== null ? `${deltaCaPct > 0 ? '+' : ''}${deltaCaPct}% vs mois dernier` : 'Premier mois'}
          deltaPositif={deltaCaPct !== null ? deltaCaPct >= 0 : null}
        />
        <MetricCard
          label="CA annuel"
          valeur={`${caAnnuel.toLocaleString('fr-FR')} €`}
          delta={`Objectif : ${statsPro.objectifAnnuel.toLocaleString('fr-FR')} €`}
          deltaPositif={caAnnuel >= statsPro.objectifAnnuel}
        />
        <MetricCard
          label="Séances ce mois"
          valeur={seancesMois.toString()}
          delta={`${seancesTotal} planifiée${seancesTotal > 1 ? 's' : ''}`}
          deltaPositif={null}
        />
        <MetricCard
          label="Taux de présence"
          valeur={`${tauxPresence}%`}
          delta={`${annulations} annulation${annulations > 1 ? 's' : ''}`}
          deltaPositif={tauxPresence >= 85}
        />
      </div>

      {/* ── Graphiques CA + Séances ─────────────────────────────────── */}
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: '3fr 2fr' }}>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-gray-800">CA mensuel {now.getFullYear()}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                <span className="inline-block w-2 h-2 rounded-full bg-primary mr-1" />Réalisé
                <span className="inline-block w-4 border-t-2 border-dashed border-amber-400 mx-2 -mb-px" />Objectif
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Objectif mensuel</div>
              <div className="text-sm font-semibold text-gray-700">{statsPro.objectifMensuel.toLocaleString('fr-FR')} €</div>
            </div>
          </div>
          <GraphiqueCA statsPro={statsPro} />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-800 mb-1">Séances hebdomadaires</div>
          <div className="text-xs text-gray-400 mb-3">12 dernières semaines — séances réalisées</div>
          <GraphiqueSeances seances={seances} />
        </div>
      </div>

      {/* ── Progression + Assiduité + Répartition ──────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-800 mb-3">Progression moyenne par test</div>
          <SectionProgression participants={participants} />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-800 mb-3">Top assiduité</div>
          <SectionAssiduite
            participants={participants}
            seances={seances}
            contratActif={contratActifDeParticipant}
          />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-800 mb-3">Répartition patients</div>
          <SectionRepartition participants={participants} />
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
            Total : <span className="font-semibold text-gray-700">{participants.length} patient{participants.length > 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
