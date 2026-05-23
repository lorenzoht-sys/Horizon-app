import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { differenceInDays, differenceInMonths } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ArrowLeft, FileDown, Sparkles, Loader, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import PageWrapper from '../components/layout/PageWrapper';
import { NORMS } from '../data/norms';
import { exportRapportEvolutionPDF } from '../utils/exportRapportEvolutionPDF';
import type { Bilan, Participant } from '../types';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

type PeriodeBilan = 'initial' | '3mois' | '6mois' | '9mois' | '1an' | 'autre';

const LABELS_PERIODE: Record<PeriodeBilan, string> = {
  initial: 'Bilan Initial',
  '3mois': '3 Mois',
  '6mois': '6 Mois',
  '9mois': '9 Mois',
  '1an':   '1 An',
  'autre': 'Suivi',
};

function getPeriodeBilan(bilanInitialDate: string, bilanDate: string): PeriodeBilan {
  const jours = differenceInDays(new Date(bilanDate), new Date(bilanInitialDate));
  if (jours <= 14)  return 'initial';
  if (jours <= 105) return '3mois';
  if (jours <= 195) return '6mois';
  if (jours <= 285) return '9mois';
  if (jours <= 380) return '1an';
  return 'autre';
}

function formatDateFR(date: string): string {
  return new Date(date + 'T12:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

function moyenne(...vals: (number | null | undefined)[]): number | null {
  const ok = vals.filter((v): v is number => v !== null && v !== undefined);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
}

function normaliser(key: keyof typeof NORMS, valeur: number | null | undefined): number | null {
  if (valeur === null || valeur === undefined) return null;
  const n = NORMS[key];
  if (key === 'tug3m') {
    return Math.round(Math.max(0, Math.min(100, ((n.min - valeur) / (n.min - n.max)) * 100)));
  }
  return Math.round(Math.max(0, Math.min(100, ((valeur - n.min) / (n.max - n.min)) * 100)));
}

// ── Tests à afficher dans le tableau ─────────────────────────────────────────

const TESTS = [
  { key: 'equilibreD',  label: 'Équilibre D',    getVal: (b: Bilan) => b.equilibre.droite,       unite: 's',    lower: false },
  { key: 'equilibreG',  label: 'Équilibre G',    getVal: (b: Bilan) => b.equilibre.gauche,       unite: 's',    lower: false },
  { key: 'chairStand',  label: 'Chair Stand',    getVal: (b: Bilan) => b.chairStand30,           unite: ' rép.', lower: false },
  { key: 'handGripD',   label: 'HandGrip D',     getVal: (b: Bilan) => b.handGrip.droite,        unite: ' kg',  lower: false },
  { key: 'handGripG',   label: 'HandGrip G',     getVal: (b: Bilan) => b.handGrip.gauche,        unite: ' kg',  lower: false },
  { key: 'tug',         label: 'TUG 3m',         getVal: (b: Bilan) => b.tug3m,                  unite: 's',    lower: true  },
  { key: 'souplesse',   label: 'Souplesse',      getVal: (b: Bilan) => b.souplesse.valeur,       unite: ' cm',  lower: false },
  { key: 'tm6',         label: 'TM6',            getVal: (b: Bilan) => b.tm6.distanceMetres,     unite: ' m',   lower: false },
  { key: 'memoireImm',  label: 'Mémoire imm.',   getVal: (b: Bilan) => b.memoire.scoreImmediat,  unite: '/5',   lower: false },
  { key: 'memoireDif',  label: 'Mémoire dif.',   getVal: (b: Bilan) => b.memoire.scoreDiffere,   unite: '/5',   lower: false },
];

// ── TableauComparaison ────────────────────────────────────────────────────────

function TableauComparaison({ bilans }: { bilans: Bilan[] }) {
  const initial = bilans[0];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="px-3 py-3 text-left text-xs font-bold text-dark uppercase tracking-wide bg-light/60 rounded-tl-lg" style={{ minWidth: 110 }}>
              Test
            </th>
            {bilans.map((b, i) => {
              const periode = getPeriodeBilan(initial.date, b.date);
              return (
                <th
                  key={b.id}
                  className="px-3 py-3 text-center font-bold text-dark"
                  style={{
                    minWidth: 120,
                    background: i === 0 ? '#E6F1FB' : i === bilans.length - 1 ? '#F0FFF4' : '#F8FAFC',
                  }}
                >
                  <div className="text-xs uppercase tracking-wide">{LABELS_PERIODE[periode]}</div>
                  <div className="text-xs font-normal text-gray-400 mt-0.5">{formatDateFR(b.date)}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {TESTS.map(test => {
            const valeurs = bilans.map(b => test.getVal(b));
            if (valeurs.every(v => v === null || v === undefined)) return null;

            return (
              <tr key={test.key} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                <td className="px-3 py-2.5 text-xs font-semibold text-gray-500">{test.label}</td>
                {bilans.map((b, i) => {
                  const val = test.getVal(b);
                  const prev = i > 0 ? test.getVal(bilans[i - 1]) : null;
                  const delta = val !== null && val !== undefined && prev !== null && prev !== undefined
                    ? val - prev : null;
                  const progression = delta !== null ? (test.lower ? -delta : delta) : null;

                  const couleur = progression === null ? '' : progression > 0 ? 'text-green-600' : progression < 0 ? 'text-red-500' : 'text-gray-400';
                  const DeltaIcon = progression === null ? null : progression > 0 ? TrendingUp : progression < 0 ? TrendingDown : Minus;

                  return (
                    <td key={b.id} className="px-3 py-2.5 text-center"
                      style={{ background: i === bilans.length - 1 ? '#F0FFF4' : 'white' }}>
                      {val !== null && val !== undefined ? (
                        <div>
                          <div className="font-bold text-dark text-sm">
                            {test.key === 'souplesse' && val > 0 ? '+' : ''}
                            {val}{test.unite}
                          </div>
                          {delta !== null && DeltaIcon && (
                            <div className={`flex items-center justify-center gap-0.5 text-xs font-semibold mt-0.5 ${couleur}`}>
                              <DeltaIcon size={11} />
                              {progression! > 0 ? '+' : ''}{Math.abs(delta).toFixed(delta % 1 === 0 ? 0 : 1)}{test.unite}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── GraphiqueEvolution ────────────────────────────────────────────────────────

const LIGNES_CHART = [
  { key: 'Équilibre', couleur: '#1A5F9E' },
  { key: 'Force',     couleur: '#2BBFBF' },
  { key: 'Mobilité',  couleur: '#F59E0B' },
  { key: 'Souplesse', couleur: '#8B5CF6' },
  { key: 'Endurance', couleur: '#3B6D11' },
  { key: 'Mémoire',   couleur: '#EF4444' },
];

function GraphiqueEvolution({ bilans }: { bilans: Bilan[] }) {
  const initial = bilans[0];

  const data = bilans.map(b => {
    const periode = getPeriodeBilan(initial.date, b.date);
    const eqMoy  = moyenne(b.equilibre.droite, b.equilibre.gauche);
    const memMoy = moyenne(b.memoire.scoreImmediat, b.memoire.scoreDiffere);
    return {
      name: LABELS_PERIODE[periode],
      Équilibre: normaliser('equilibre', eqMoy),
      Force:     normaliser('chairStand30', b.chairStand30),
      Mobilité:  normaliser('tug3m', b.tug3m),
      Souplesse: normaliser('souplesse', b.souplesse.valeur),
      Endurance: normaliser('tm6', b.tm6.distanceMetres),
      Mémoire:   normaliser('memoire', memMoy),
    };
  });

  const hasData = LIGNES_CHART.some(l => data.some(d => d[l.key as keyof typeof d] !== null));
  if (!hasData) return null;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6B7280' }} unit="%" width={36} />
        <Tooltip formatter={(v) => typeof v === 'number' ? `${Math.round(v)}%` : ''} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {LIGNES_CHART.map(l => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            stroke={l.couleur}
            strokeWidth={2.5}
            dot={{ r: 5, fill: l.couleur }}
            activeDot={{ r: 7 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── ResumeIA ──────────────────────────────────────────────────────────────────

interface ResumeIAResult { resumePro: string; messagePatient: string }

function ResumeIA({ participant, bilans }: { participant: Participant; bilans: Bilan[] }) {
  const [loading, setLoading] = useState(false);
  const [resume, setResume] = useState<ResumeIAResult | null>(null);

  async function generer() {
    const settings = (() => { try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}'); } catch { return {}; } })();
    const apiKey: string = settings.anthropicApiKey ?? '';
    if (!apiKey) { toast.error("Clé API Claude manquante — configurez-la dans Paramètres"); return; }

    setLoading(true);
    try {
      const premier = bilans[0];
      const dernier = bilans[bilans.length - 1];
      const nbMois = differenceInMonths(new Date(dernier.date), new Date(premier.date));

      const deltasTexte = TESTS
        .map(t => {
          const v0 = t.getVal(premier);
          const vN = t.getVal(dernier);
          if (v0 === null || v0 === undefined || vN === null || vN === undefined) return null;
          const d = vN - v0;
          return `${t.label} : ${v0}${t.unite} → ${vN}${t.unite} (${d >= 0 ? '+' : ''}${d.toFixed(d % 1 === 0 ? 0 : 1)}${t.unite})`;
        })
        .filter(Boolean)
        .join('\n');

      const age = Math.floor((Date.now() - new Date(participant.dateNaissance).getTime()) / (365.25 * 24 * 3600 * 1000));

      const prompt = `Tu es expert en Activité Physique Adaptée (APA). Génère un résumé d'évolution positif et motivant.

Patient : ${participant.prenom} ${participant.nom}, ${age} ans
Durée de suivi : ${nbMois} mois (${bilans.length} bilans)

Évolution des tests :
${deltasTexte}

Génère :
1. Un résumé professionnel en 3-4 phrases (ton APA, factuel, mentionner les progressions clés)
2. Un message motivant court pour le patient (2 phrases, positif, commencer par "Bravo ${participant.prenom},")

Réponds UNIQUEMENT en JSON valide :
{"resumePro":"...","messagePatient":"..."}`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const texte: string = data.content?.[0]?.text ?? '';
      const parsed = JSON.parse(texte.replace(/```json|```/g, '').trim());
      setResume({ resumePro: parsed.resumePro ?? '', messagePatient: parsed.messagePatient ?? '' });
    } catch (e) {
      toast.error("Erreur lors de la génération IA");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-semibold text-dark">✨ Résumé IA d'évolution</h2>
        {!resume && (
          <button
            onClick={generer}
            disabled={loading}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-60"
          >
            {loading ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'Génération…' : 'Générer le résumé'}
          </button>
        )}
      </div>

      {!resume && !loading && (
        <div className="text-center py-8 text-gray-400">
          <Sparkles size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Cliquez sur "Générer le résumé" pour obtenir une analyse IA de l'évolution du patient.</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-gray-400 py-6">
          <Loader size={16} className="animate-spin" />
          <span className="text-sm">Analyse de l'évolution en cours…</span>
        </div>
      )}

      {resume && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Analyse professionnelle</div>
            <p className="text-sm text-dark leading-relaxed">{resume.resumePro}</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Message pour le patient</div>
            <p className="text-sm text-dark leading-relaxed italic">{resume.messagePatient}</p>
          </div>
          <button
            onClick={() => setResume(null)}
            className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
          >
            Regénérer
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function ComparaisonPage() {
  const { id } = useParams<{ id: string }>();
  const { participants } = useParticipants();
  const [exportingPDF, setExportingPDF] = useState(false);

  const participant = participants.find(p => p.id === id);
  if (!participant) return (
    <PageWrapper>
      <div className="text-center py-20 text-gray-400">Participant introuvable</div>
    </PageWrapper>
  );

  const bilans = [...participant.bilans].sort((a, b) => a.date.localeCompare(b.date));
  if (bilans.length < 2) return (
    <PageWrapper>
      <Link to={`/participant/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
        <ArrowLeft size={15} /> Retour à la fiche
      </Link>
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
        <TrendingUp size={48} className="mx-auto mb-4 opacity-20" />
        <p className="font-medium text-lg">Pas encore assez de bilans</p>
        <p className="text-sm mt-1">Il faut au moins 2 bilans pour afficher la comparaison d'évolution.</p>
        <Link to={`/participant/${id}/bilan/new`} className="inline-flex items-center gap-2 mt-4 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-dark transition-colors">
          + Nouveau bilan
        </Link>
      </div>
    </PageWrapper>
  );

  const initial = bilans[0];
  const dernier = bilans[bilans.length - 1];
  const nbMois = differenceInMonths(new Date(dernier.date), new Date(initial.date));

  const settings = (() => { try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}'); } catch { return {}; } })();

  async function handleExportPDF() {
    setExportingPDF(true);
    try {
      await exportRapportEvolutionPDF(
        participant!,
        bilans,
        settings,
        `Rapport_Evolution_${participant!.nom}_${participant!.prenom}_MouvAPA.pdf`
      );
    } catch {
      toast.error("Erreur lors de la génération du PDF");
    } finally {
      setExportingPDF(false);
    }
  }

  return (
    <PageWrapper>
      {/* En-tête */}
      <Link to={`/participant/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
        <ArrowLeft size={15} /> Retour à la fiche
      </Link>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-dark">
            📊 Évolution de {participant.prenom} {participant.nom}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {bilans.length} bilans · {nbMois} mois de suivi ·{' '}
            {formatDateFR(initial.date)} → {formatDateFR(dernier.date)}
          </p>
        </div>
        <button
          onClick={handleExportPDF}
          disabled={exportingPDF}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-60"
        >
          <FileDown size={15} />
          {exportingPDF ? 'Génération…' : 'Rapport PDF'}
        </button>
      </div>

      {/* Tableau comparatif */}
      <div id="rapport-tableau" className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-6">
        <h2 className="font-heading font-semibold text-dark mb-4">Tableau comparatif</h2>
        <TableauComparaison bilans={bilans} />
      </div>

      {/* Graphique */}
      <div id="rapport-graphique" className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-6">
        <h2 className="font-heading font-semibold text-dark mb-1">Courbes d'évolution</h2>
        <p className="text-xs text-gray-400 mb-4">Scores normalisés 0-100% par rapport aux normes de référence</p>
        <GraphiqueEvolution bilans={bilans} />
      </div>

      {/* Résumé IA */}
      <div id="rapport-ia" className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <ResumeIA participant={participant} bilans={bilans} />
      </div>

      {/* Template caché pour l'export PDF */}
      <div id="rapport-evolution-printable" style={{ display: 'none', position: 'fixed', left: '-9999px', top: 0, width: 794, background: 'white', fontFamily: 'Arial, sans-serif' }}>
        <PrintableRapportEvolution participant={participant} bilans={bilans} settings={settings} />
      </div>
    </PageWrapper>
  );
}

// ── Template PDF caché ─────────────────────────────────────────────────────────

function PrintableRapportEvolution({ participant, bilans, settings }: {
  participant: Participant;
  bilans: Bilan[];
  settings: Record<string, string>;
}) {
  const initial = bilans[0];
  const dernier = bilans[bilans.length - 1];
  const nbMois = differenceInMonths(new Date(dernier.date), new Date(initial.date));
  const age = Math.floor((Date.now() - new Date(participant.dateNaissance).getTime()) / (365.25 * 24 * 3600 * 1000));

  const s: Record<string, React.CSSProperties> = {
    page: { width: 794, minHeight: 1123, padding: '28px 36px', boxSizing: 'border-box', background: 'white' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 14, borderBottom: '2px solid #1A5F9E' },
    logo: { fontSize: 18, fontWeight: 800, color: '#1A5F9E' },
    title: { fontSize: 13, fontWeight: 700, color: '#0D2B4B', textTransform: 'uppercase' as const, letterSpacing: 1 },
    patientBox: { background: '#F0F7FF', borderRadius: 8, padding: '10px 16px', marginBottom: 18 },
    th: { padding: '8px 10px', textAlign: 'center' as const, background: '#E6F1FB', color: '#0D2B4B', fontWeight: 700, fontSize: 11, borderBottom: '2px solid #1A5F9E' },
    thFirst: { padding: '8px 10px', textAlign: 'left' as const, background: '#E6F1FB', color: '#0D2B4B', fontWeight: 700, fontSize: 11, borderBottom: '2px solid #1A5F9E', width: 100 },
    td: { padding: '6px 10px', textAlign: 'center' as const, fontSize: 12, borderBottom: '1px solid #E8F0FE', background: 'white' },
    tdFirst: { padding: '6px 10px', textAlign: 'left' as const, fontSize: 11, fontWeight: 600, color: '#4A6080', borderBottom: '1px solid #E8F0FE' },
    tdLast: { padding: '6px 10px', textAlign: 'center' as const, fontSize: 12, borderBottom: '1px solid #E8F0FE', background: '#F0FFF4' },
    section: { fontSize: 11, fontWeight: 700, color: '#1A5F9E', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8 },
    footer: { marginTop: 20, paddingTop: 12, borderTop: '1px solid #E8F0FE', fontSize: 10, color: '#8B9BB4', display: 'flex', justifyContent: 'space-between' },
  };

  const praticien = settings.prenom && settings.nom ? `${settings.prenom} ${settings.nom}` : 'Praticien APA';

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.logo}>Mouv'APA</div>
          <div style={{ fontSize: 10, color: '#8B9BB4', marginTop: 2 }}>{praticien}</div>
        </div>
        <div style={{ textAlign: 'right' as const }}>
          <div style={s.title}>Rapport d'évolution</div>
          <div style={{ fontSize: 10, color: '#8B9BB4', marginTop: 2 }}>
            {bilans.length} bilans · {nbMois} mois de suivi
          </div>
        </div>
      </div>

      {/* Patient */}
      <div style={s.patientBox}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#0D2B4B' }}>
          {participant.prenom} {participant.nom}
        </div>
        <div style={{ fontSize: 11, color: '#4A6080', marginTop: 3 }}>
          {age} ans · Suivi du {formatDateFR(initial.date)} au {formatDateFR(dernier.date)}
        </div>
      </div>

      {/* Tableau */}
      <div style={s.section}>Comparaison des bilans</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr>
            <th style={s.thFirst}>Test</th>
            {bilans.map((b, i) => (
              <th key={b.id} style={{ ...s.th, background: i === bilans.length - 1 ? '#F0FFF4' : '#E6F1FB' }}>
                <div>{LABELS_PERIODE[getPeriodeBilan(initial.date, b.date)]}</div>
                <div style={{ fontWeight: 400, fontSize: 9, color: '#8B9BB4' }}>{formatDateFR(b.date)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TESTS.map(test => {
            const valeurs = bilans.map(b => test.getVal(b));
            if (valeurs.every(v => v === null || v === undefined)) return null;
            return (
              <tr key={test.key}>
                <td style={s.tdFirst}>{test.label}</td>
                {bilans.map((b, i) => {
                  const val = test.getVal(b);
                  const prev = i > 0 ? test.getVal(bilans[i - 1]) : null;
                  const delta = val !== null && val !== undefined && prev !== null && prev !== undefined ? val - prev : null;
                  const progression = delta !== null ? (test.lower ? -delta : delta) : null;
                  const couleur = progression === null ? '#8B9BB4' : progression > 0 ? '#3B6D11' : progression < 0 ? '#EF4444' : '#8B9BB4';
                  const tdStyle = i === bilans.length - 1 ? s.tdLast : s.td;
                  return (
                    <td key={b.id} style={tdStyle}>
                      {val !== null && val !== undefined ? (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#0D2B4B' }}>
                            {test.key === 'souplesse' && val > 0 ? '+' : ''}{val}{test.unite}
                          </div>
                          {delta !== null && (
                            <div style={{ fontSize: 10, fontWeight: 700, color: couleur }}>
                              {progression! > 0 ? '↑ +' : progression! < 0 ? '↓ ' : '= '}{Math.abs(delta).toFixed(delta % 1 === 0 ? 0 : 1)}{test.unite}
                            </div>
                          )}
                        </div>
                      ) : <span style={{ color: '#D0D8E8' }}>—</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer */}
      <div style={s.footer}>
        <span>Mouv'APA — {praticien}</span>
        <span>Généré le {new Date().toLocaleDateString('fr-FR')}</span>
      </div>
    </div>
  );
}
