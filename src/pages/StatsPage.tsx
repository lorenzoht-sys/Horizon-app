import { useState, useEffect, Component, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip, Legend, Filler, ArcElement,
  BarController, LineController, DoughnutController,
} from 'chart.js';
import { Chart, Line, Doughnut } from 'react-chartjs-2';
import { TrendingUp, TrendingDown, Edit3, ChevronDown, ChevronUp, CheckCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageWrapper from '../components/layout/PageWrapper';
import { useParticipants } from '../hooks/useParticipants';
import { useAgenda } from '../hooks/useAgenda';
import { useContrats } from '../hooks/useContrats';
import { useStatsPro, type StatsPro } from '../hooks/useStatsPro';
import { useFactures } from '../hooks/useFactures';
import type { Participant, Contrat } from '../types';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { cleanTextPdf } from '../utils/pdfText';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Tooltip, Legend, Filler, ArcElement,
  BarController, LineController, DoughnutController,
);

// ─── ErrorBoundary ────────────────────────────────────────────────────────────

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-40 rounded-xl bg-red-light text-red-500 text-sm p-4">
          <span className="font-medium">Erreur de chargement</span>
          <span className="text-xs text-red-400 mt-1">{(this.state.error as Error | null)?.message}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

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

// ─── Helpers supplémentaires ─────────────────────────────────────────────────

function loadSettingsPro() {
  try {
    return {
      prenom: '', nom: '', telephone: '', email: '',
      // Aucune societe par defaut : la valeur en dur ici etait celle du
      // premier utilisateur, et servait a tout praticien sans reglage.
      tarifHoraire: '45', societe: '',
      ...JSON.parse(localStorage.getItem('settings_praticien') ?? '{}')
    };
  } catch {
    return { prenom: '', nom: '', telephone: '', email: '', tarifHoraire: '45', societe: '' };
  }
}

function premierJourMois(annee: number, mois: number): string {
  return `${annee}-${String(mois).padStart(2, '0')}-01`;
}

function dernierJourMois(annee: number, mois: number): string {
  const date = new Date(annee, mois, 0); // dernier jour du mois
  return date.toISOString().slice(0, 10);
}

function nomMoisAnnee(mois: number, annee: number): string {
  return `${MOIS_LONGS[mois - 1]} ${annee}`;
}

function moisPrecedent(annee: number, mois: number): { annee: number; mois: number } {
  return mois === 1 ? { annee: annee - 1, mois: 12 } : { annee, mois: mois - 1 };
}

function exportFacturePDF(data: {
  nomPatient: string;
  periode: string;
  nbSeances: number;
  tarifSeance: number;
  montantTotal: number;
  praticien: { nom: string; societe: string; email: string; telephone: string };
}) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const now = new Date().toLocaleDateString('fr-FR');
  let y = 25;

  doc.setFontSize(22);
  doc.setTextColor(13, 43, 43);
  doc.text('FACTURE', 20, y);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  y += 8;
  doc.text(`Émise le : ${now}`, 20, y);

  y += 16;
  doc.setFontSize(11);
  doc.setTextColor(13, 43, 43);
  doc.text('Prestataire :', 20, y);
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  y += 6;
  doc.text(cleanTextPdf(data.praticien.nom || data.praticien.societe), 20, y);
  if (data.praticien.email) { y += 5; doc.text(cleanTextPdf(data.praticien.email), 20, y); }
  if (data.praticien.telephone) { y += 5; doc.text(cleanTextPdf(data.praticien.telephone), 20, y); }

  y += 16;
  doc.setFontSize(11);
  doc.setTextColor(13, 43, 43);
  doc.text('Bénéficiaire :', 20, y);
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  y += 6;
  doc.text(cleanTextPdf(data.nomPatient), 20, y);

  y += 16;
  doc.setDrawColor(200, 200, 200);
  doc.line(20, y, 190, y);
  y += 8;

  doc.setFontSize(12);
  doc.setTextColor(13, 43, 43);
  doc.text(`Séances APA — ${data.periode}`, 20, y);

  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(`Nombre de séances : ${data.nbSeances}`, 20, y);
  y += 7;
  doc.text(`Tarif par séance : ${data.tarifSeance.toFixed(2)} €`, 20, y);
  y += 12;

  doc.setDrawColor(200, 200, 200);
  doc.line(20, y, 190, y);
  y += 8;

  doc.setFontSize(14);
  doc.setTextColor(43, 191, 191);
  doc.text(`TOTAL : ${data.montantTotal.toFixed(2)} €`, 20, y);

  y += 20;
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text('Règlement à réception. Service à la Personne — Attestation disponible sur demande.', 20, y);

  doc.save(`Facture_${data.nomPatient.replace(/\s+/g, '_')}_${data.periode.replace(/\s+/g, '_')}.pdf`);
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
  const [valeurs, setValeurs] = useState<Record<string, number>>({ ...(statsPro.caParMois ?? {}) });
  const [objMensuel, setObjMensuel] = useState(statsPro.objectifMensuel ?? 0);
  const [objAnnuel, setObjAnnuel] = useState(statsPro.objectifAnnuel ?? 0);

  useEffect(() => {
    setValeurs({ ...(statsPro.caParMois ?? {}) });
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

  let caData: (number | null)[] = Array(12).fill(null);
  try {
    caData = Array.from({ length: 12 }, (_, i) => {
      const v = (statsPro.caParMois ?? {})[moisKey(annee, i)];
      return v !== undefined ? v : null;
    });
  } catch {
    caData = Array(12).fill(null);
  }

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
        data: Array(12).fill(statsPro.objectifMensuel ?? 0),
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
  let seancesData: number[] = Array(12).fill(0);
  try {
    seancesData = semaines.map(s =>
      (seances ?? []).filter(seance =>
        seance.statut === 'realisee' &&
        new Date(seance.date) >= s.debut &&
        new Date(seance.date) <= s.fin
      ).length
    );
  } catch {
    seancesData = Array(12).fill(0);
  }

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

// ─── Section Alertes ─────────────────────────────────────────────────────────

interface Alerte {
  type: 'rouge' | 'orange' | 'bleu';
  emoji: string;
  texte: string;
  action: string;
  href: string;
}

function SectionAlertes({
  participants, seances, contrats, contratActif,
}: {
  participants: Participant[];
  seances: any[];
  contrats: any[];
  contratActif: (id: string) => any;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const dans30j = new Date(now); dans30j.setDate(now.getDate() + 30);
  const il90j = new Date(now);   il90j.setDate(now.getDate() - 90);
  const il14j = new Date(now);   il14j.setDate(now.getDate() - 14);
  // Comparaisons en chaînes ISO (YYYY-MM-DD) plutôt qu'en objets Date :
  // évite les décalages d'un jour selon le fuseau horaire de l'utilisateur.
  const dans30jStr = dans30j.toISOString().slice(0, 10);
  const il90jStr = il90j.toISOString().slice(0, 10);
  const il14jStr = il14j.toISOString().slice(0, 10);

  const alertes: Alerte[] = [];

  // 🔴 Factures en retard → géré via useFactures dans SectionFactures (ici on recalcule sommairement)
  // (nb calculé depuis la liste des factures n'est pas accessible ici — on skip pour ne pas dupliquer le hook)

  // 🟡 Bilans > 3 mois (90 jours)
  const bilansEnRetard = participants.filter(p => {
    const last = p.bilans.at(-1);
    if (!last) return true; // aucun bilan
    return last.date < il90jStr;
  });
  if (bilansEnRetard.length > 0) {
    alertes.push({
      type: 'orange',
      emoji: '🟡',
      texte: `${bilansEnRetard.length} bilan${bilansEnRetard.length > 1 ? 's' : ''} à faire (> 3 mois)`,
      action: 'Voir les bénéficiaires',
      href: '/',
    });
  }

  // 🟡 Contrats expirant dans 30 jours
  const contratsExpirants = contrats.filter(c => {
    if (c.statut !== 'actif' || c.dureeIndeterminee) return false;
    const fin = c.dateFin;
    return fin >= today && fin <= dans30jStr;
  });
  if (contratsExpirants.length > 0) {
    alertes.push({
      type: 'orange',
      emoji: '🟡',
      texte: `${contratsExpirants.length} contrat${contratsExpirants.length > 1 ? 's' : ''} expirant${contratsExpirants.length > 1 ? '' : ''} ce mois`,
      action: 'Voir les contrats',
      href: '/',
    });
  }

  // 🔵 Patients sans séance depuis > 14 jours
  const patientsInactifs = participants.filter(p => {
    if (!contratActif(p.id)) return false;
    const derniereSeance = seances
      .filter(s => s.participantId === p.id && s.statut === 'realisee')
      .sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
    if (!derniereSeance) return true;
    return derniereSeance.date < il14jStr;
  });
  if (patientsInactifs.length > 0) {
    alertes.push({
      type: 'bleu',
      emoji: '🔵',
      texte: `${patientsInactifs.length} bénéficiaire${patientsInactifs.length > 1 ? 's' : ''} sans séance depuis > 2 semaines`,
      action: 'Voir les bénéficiaires',
      href: '/',
    });
  }

  if (alertes.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-4 flex items-center gap-3">
        <div className="text-2xl">✅</div>
        <div className="text-sm font-medium text-emerald-800">Tout est à jour — aucune alerte active !</div>
      </div>
    );
  }

  const nbRouges  = alertes.filter(a => a.type === 'rouge').length;
  const COLOR: Record<Alerte['type'], string> = {
    rouge:  'border-red-200 bg-red-light',
    orange: 'border-amber-200 bg-amber-50',
    bleu:   'border-blue-100 bg-blue-50',
  };
  const TEXT: Record<Alerte['type'], string> = {
    rouge: 'text-red-700', orange: 'text-amber-700', bleu: 'text-blue-700',
  };
  const LINK: Record<Alerte['type'], string> = {
    rouge: 'text-red-500 hover:text-red-700', orange: 'text-amber-600 hover:text-amber-800', bleu: 'text-blue-500 hover:text-blue-700',
  };

  return (
    <div className={`rounded-2xl border p-4 mb-4 ${nbRouges > 0 ? 'border-red-200 bg-red-light' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">⚠️</span>
        <div className="text-sm font-bold text-gray-900">
          {alertes.length} alerte{alertes.length > 1 ? 's' : ''} à traiter
        </div>
        {nbRouges > 0 && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-light text-red-700">
            {nbRouges} urgente{nbRouges > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {alertes.map((a, i) => (
          <div key={i} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 border ${COLOR[a.type]}`}>
            <div className={`text-sm font-medium ${TEXT[a.type]}`}>
              {a.emoji} {a.texte}
            </div>
            <a href={a.href} className={`text-xs font-semibold flex-shrink-0 underline ${LINK[a.type]}`}>
              {a.action} →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section Santé du portefeuille ──────────────────────────────────────────

function SectionSantePortefeuille({
  participants, seances, contrats, contratActif,
}: {
  participants: Participant[];
  seances: any[];
  contrats: any[];
  contratActif: (id: string) => any;
}) {
  const navigate = useNavigate();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const il90j = new Date(now);   il90j.setDate(now.getDate() - 90);
  const il14j = new Date(now);   il14j.setDate(now.getDate() - 14);
  const dans30j = new Date(now); dans30j.setDate(now.getDate() + 30);
  // Comparaisons en chaînes ISO (YYYY-MM-DD) plutôt qu'en objets Date :
  // évite les décalages d'un jour selon le fuseau horaire de l'utilisateur.
  const il90jStr = il90j.toISOString().slice(0, 10);
  const il14jStr = il14j.toISOString().slice(0, 10);
  const dans30jStr = dans30j.toISOString().slice(0, 10);

  const bilansEnRetard = participants
    .map(p => {
      const last = [...p.bilans].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
      const enRetard = !last || last.date < il90jStr;
      return enRetard ? { p, dernierBilan: last?.date ?? null } : null;
    })
    .filter(Boolean) as { p: Participant; dernierBilan: string | null }[];

  const contratsExpirants = contrats
    .filter(c => c.statut === 'actif' && !c.dureeIndeterminee && c.dateFin >= today && c.dateFin <= dans30jStr)
    .map(c => ({
      contrat: c,
      patient: participants.find(p => p.id === c.participantId),
    }))
    .filter(x => x.patient);

  const patientsInactifs = participants
    .filter(p => !!contratActif(p.id))
    .map(p => {
      const derniere = seances
        .filter(s => s.participantId === p.id && s.statut === 'realisee')
        .sort((a: any, b: any) => b.date.localeCompare(a.date))[0] ?? null;
      const inactif = !derniere || derniere.date < il14jStr;
      return inactif ? { p, derniereSeance: derniere?.date ?? null } : null;
    })
    .filter(Boolean) as { p: Participant; derniereSeance: string | null }[];

  const patientsActifs = participants.filter(p => !!contratActif(p.id)).length;

  const rowCls = 'flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0 group cursor-pointer hover:bg-gray-50/50 rounded-lg px-1 -mx-1 transition-colors';
  const btnCls = 'text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0';

  if (bilansEnRetard.length + contratsExpirants.length + patientsInactifs.length === 0) {
    return null; // Tout va bien, on n'affiche pas la section
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">🏥</span>
        <div className="text-sm font-bold text-gray-900">Santé du portefeuille</div>
        <div className="text-xs text-gray-400">{patientsActifs} bénéficiaire{patientsActifs !== 1 ? 's' : ''} actif{patientsActifs !== 1 ? 's' : ''}</div>
      </div>

      {bilansEnRetard.length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-2">
            🟡 Bilans en retard (&gt; 3 mois) — {bilansEnRetard.length}
          </div>
          {bilansEnRetard.map(({ p, dernierBilan }) => (
            <div key={p.id} className={rowCls} onClick={() => navigate(`/participant/${p.id}`)}>
              <div>
                <span className="text-sm font-medium text-gray-800">{p.prenom} {p.nom}</span>
                <span className="text-xs text-gray-400 ml-2">
                  {dernierBilan
                    ? `Dernier bilan : ${new Date(dernierBilan + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                    : 'Aucun bilan'}
                </span>
              </div>
              <span className={btnCls}>Faire bilan →</span>
            </div>
          ))}
        </div>
      )}

      {contratsExpirants.length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">
            🟡 Contrats expirant ce mois — {contratsExpirants.length}
          </div>
          {contratsExpirants.map(({ contrat, patient }) => (
            <div key={contrat.id} className={rowCls} onClick={() => navigate(`/participant/${patient!.id}`)}>
              <div>
                <span className="text-sm font-medium text-gray-800">{patient!.prenom} {patient!.nom}</span>
                <span className="text-xs text-gray-400 ml-2">
                  Expire le {new Date(contrat.dateFin + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <span className={btnCls}>Renouveler →</span>
            </div>
          ))}
        </div>
      )}

      {patientsInactifs.length > 0 && (
        <div>
          <div className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">
            🔵 Bénéficiaires inactifs (&gt; 2 semaines) — {patientsInactifs.length}
          </div>
          {patientsInactifs.map(({ p, derniereSeance }) => (
            <div key={p.id} className={rowCls} onClick={() => navigate(`/participant/${p.id}`)}>
              <div>
                <span className="text-sm font-medium text-gray-800">{p.prenom} {p.nom}</span>
                <span className="text-xs text-gray-400 ml-2">
                  {derniereSeance
                    ? `Dernière séance : ${new Date(derniereSeance + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                    : 'Aucune séance'}
                </span>
              </div>
              <span className={btnCls}>Contacter →</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section Factures ────────────────────────────────────────────────────────

function SectionFactures({
  participants, seances, contratActif,
}: {
  participants: Participant[];
  seances: any[];
  contrats?: Contrat[];
  contratActif: (id: string) => Contrat | undefined;
}) {
  const { factures, enRetard, aEnvoyer, envoyees, creerOuMettreAJour, marquerEnvoyee, loading, praticienId } = useFactures();
  const settings = loadSettingsPro();
  const tarifDefaut = parseFloat(settings.tarifHoraire) || 45;
  const now = new Date();
  const { annee: anneePrec, mois: moisPrec } = moisPrecedent(now.getFullYear(), now.getMonth() + 1);

  const [genLoading, setGenLoading] = useState(false);
  const [modalEnvoi, setModalEnvoi] = useState<{ id: string; nom: string } | null>(null);
  const [dateEnvoiInput, setDateEnvoiInput] = useState(now.toISOString().slice(0, 10));
  const [showEnvoyees, setShowEnvoyees] = useState(false);
  const [dejaGenere, setDejaGenere] = useState(false);

  // Auto-génération au chargement (une seule fois, mois précédent)
  const genererMois = useCallback(async (annee: number, mois: number) => {
    if (!praticienId || genLoading) return;
    setGenLoading(true);
    const debut = premierJourMois(annee, mois);
    const fin = dernierJourMois(annee, mois);
    const echeance = premierJourMois(now.getFullYear(), now.getMonth() + 1); // 1er du mois courant

    for (const p of participants) {
      const c = contratActif(p.id);
      if (!c) continue;
      const seancesPatient = seances.filter(s =>
        s.participantId === p.id &&
        s.statut === 'realisee' &&
        s.date >= debut && s.date <= fin
      );
      if (seancesPatient.length === 0) continue;
      // Vérifie si une facture existe déjà
      const existe = factures.some(
        f => f.participantId === p.id && f.periodeMois === mois && f.periodeAnnee === annee
      );
      if (existe) continue;
      const tarif = c.tarifSeance ?? tarifDefaut;
      await creerOuMettreAJour({
        participantId: p.id,
        periodeMois: mois,
        periodeAnnee: annee,
        nbSeances: seancesPatient.length,
        montantTotal: seancesPatient.length * tarif,
        dateEcheance: echeance,
      });
    }
    setGenLoading(false);
  }, [praticienId, participants, seances, contratActif, factures, creerOuMettreAJour, tarifDefaut, genLoading]);

  useEffect(() => {
    if (!loading && !dejaGenere && praticienId && participants.length > 0) {
      setDejaGenere(true);
      void genererMois(anneePrec, moisPrec);
    }
  }, [loading, dejaGenere, praticienId, participants.length, genererMois, anneePrec, moisPrec]);

  function nomPatient(participantId: string): string {
    const p = participants.find(x => x.id === participantId);
    return p ? `${p.prenom} ${p.nom}` : '—';
  }

  function envoyerRappelEmail(_factureId: string, participantId: string, periodeMois: number, periodeAnnee: number) {
    const p = participants.find(x => x.id === participantId);
    if (!p?.email) { toast.error('Aucun email renseigné pour ce bénéficiaire'); return; }
    const periode = nomMoisAnnee(periodeMois, periodeAnnee);
    const subject = encodeURIComponent(`Facture APA — ${periode}`);
    const body = encodeURIComponent(
      `Bonjour ${p.prenom},\n\nVeuillez trouver ci-joint ma facture pour les séances du mois de ${periode}.\n\nCordialement,\n${settings.prenom} ${settings.nom}`
    );
    window.open(`mailto:${p.email}?subject=${subject}&body=${body}`);
  }

  function genererPDF(f: typeof factures[0]) {
    const p = f.participantId ? participants.find(x => x.id === f.participantId) : undefined;
    const c = f.participantId ? contratActif(f.participantId) : undefined;
    const tarif = c?.tarifSeance ?? tarifDefaut;
    exportFacturePDF({
      nomPatient: p ? `${p.prenom} ${p.nom}` : '—',
      periode: nomMoisAnnee(f.periodeMois, f.periodeAnnee),
      nbSeances: f.nbSeances,
      tarifSeance: tarif,
      montantTotal: f.montantTotal,
      praticien: {
        nom: `${settings.prenom} ${settings.nom}`.trim() || settings.societe,
        societe: settings.societe,
        email: settings.email,
        telephone: settings.telephone,
      },
    });
  }

  const CARD_CLS = 'border rounded-xl p-4 mb-3';

  function CartFacture({ f, showRappel }: { f: typeof factures[0]; showRappel?: boolean }) {
    const nom = f.participantId ? nomPatient(f.participantId) : 'Facture structure';
    const periode = nomMoisAnnee(f.periodeMois, f.periodeAnnee);
    const c = f.participantId ? contratActif(f.participantId) : undefined;
    const tarif = c?.tarifSeance ?? tarifDefaut;
    return (
      <div className={`${CARD_CLS} ${showRappel ? 'border-red-200 bg-red-light' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="font-semibold text-gray-900 text-sm">{nom}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {periode} · {f.nbSeances} séance{f.nbSeances > 1 ? 's' : ''} × {tarif}€
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-bold text-base text-gray-900">{f.montantTotal.toFixed(0)} €</div>
            {f.dateEcheance && (
              <div className={`text-xs mt-0.5 ${showRappel ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                {showRappel ? `⚠️ Due le ${new Date(f.dateEcheance + 'T12:00').toLocaleDateString('fr-FR')}` : `Échéance : ${new Date(f.dateEcheance + 'T12:00').toLocaleDateString('fr-FR')}`}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setModalEnvoi({ id: f.id, nom }); setDateEnvoiInput(now.toISOString().slice(0, 10)); }}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
          >
            ✅ Marquer envoyée
          </button>
          <button
            onClick={() => genererPDF(f)}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            📄 PDF
          </button>
          {showRappel && (
            <button
              onClick={() => f.participantId && envoyerRappelEmail(f.id, f.participantId, f.periodeMois, f.periodeAnnee)}
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
            >
              📧 Rappel
            </button>
          )}
        </div>
      </div>
    );
  }

  const totalEnAttente = enRetard.reduce((s, f) => s + f.montantTotal, 0) +
                         aEnvoyer.reduce((s, f) => s + f.montantTotal, 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
            💶 Factures à envoyer
            {(enRetard.length + aEnvoyer.length) > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-light text-red-700">
                {enRetard.length + aEnvoyer.length} en attente
              </span>
            )}
          </div>
          {totalEnAttente > 0 && (
            <div className="text-xs text-gray-400 mt-0.5">{totalEnAttente.toFixed(0)} € à encaisser</div>
          )}
        </div>
        <button
          onClick={() => { setDejaGenere(false); }}
          disabled={genLoading || loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={genLoading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {loading || genLoading ? (
        <div className="text-center py-6 text-sm text-gray-400">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
          Chargement des factures…
        </div>
      ) : (enRetard.length + aEnvoyer.length + envoyees.length) === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">
          <div className="text-3xl mb-2">✅</div>
          Aucune facture en attente — tout est à jour !
        </div>
      ) : (
        <>
          {/* En retard */}
          {enRetard.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-danger" />
                <div className="text-xs font-bold text-red-700 uppercase tracking-wide">
                  En retard ({enRetard.length})
                </div>
              </div>
              {enRetard.map(f => <CartFacture key={f.id} f={f} showRappel />)}
            </div>
          )}

          {/* À envoyer */}
          {aEnvoyer.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <div className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                  À envoyer ce mois ({aEnvoyer.length})
                </div>
              </div>
              {aEnvoyer.map(f => <CartFacture key={f.id} f={f} />)}
            </div>
          )}

          {/* Envoyées (collapsable) */}
          {envoyees.length > 0 && (
            <div>
              <button
                onClick={() => setShowEnvoyees(v => !v)}
                className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                <CheckCircle size={13} className="text-emerald-500" />
                Envoyées ce mois ({envoyees.length})
                {showEnvoyees ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showEnvoyees && (
                <div className="mt-2">
                  {envoyees.map(f => (
                    <div key={f.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 text-xs text-gray-500">
                      <span>{f.participantId ? nomPatient(f.participantId) : 'Structure'} — {nomMoisAnnee(f.periodeMois, f.periodeAnnee)}</span>
                      <span className="font-medium text-emerald-600">{f.montantTotal.toFixed(0)} € ✅</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal confirmation envoi */}
      {modalEnvoi && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="text-base font-bold text-gray-900 mb-1">Facture envoyée ?</div>
            <div className="text-sm text-gray-500 mb-4">Confirmer l'envoi à {modalEnvoi.nom}</div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date d'envoi</label>
            <input
              type="date"
              value={dateEnvoiInput}
              onChange={e => setDateEnvoiInput(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:border-primary"
            />
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  await marquerEnvoyee(modalEnvoi.id, dateEnvoiInput);
                  toast.success('Facture marquée comme envoyée');
                  setModalEnvoi(null);
                }}
                className="flex-1 bg-emerald-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-600 transition-colors"
              >
                Confirmer
              </button>
              <button onClick={() => setModalEnvoi(null)} className="px-4 border border-gray-200 rounded-xl text-gray-600 text-sm hover:bg-gray-50">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section Kilométrage ──────────────────────────────────────────────────────

function SectionKilometrage({ seances }: {
  seances: any[];
  participants?: Participant[];
}) {
  const BAREME_KM = 0.41; // barème 2026
  const now = new Date();
  const moisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Calcul simplifié : on groupe par ville du participant (approximation)
  // Dans une implémentation complète, on utiliserait les zones géographiques
  const seancesMois = seances.filter(s => s.date.startsWith(moisKey) && s.statut === 'realisee');

  // Estimation distance si pas de coordonnées : 10 km aller-retour par défaut
  const DISTANCE_DEFAUT_KM = 10;
  const kmTotal = seancesMois.length * DISTANCE_DEFAUT_KM;
  const indemnite = kmTotal * BAREME_KM;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
        🚗 Kilométrage — {MOIS_LONGS[now.getMonth()]} {now.getFullYear()}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-gray-800">{seancesMois.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">séances à domicile</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-primary">{kmTotal} km</div>
          <div className="text-xs text-gray-500 mt-0.5">estimés ce mois</div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-emerald-700">{indemnite.toFixed(0)} €</div>
          <div className="text-xs text-emerald-600 mt-0.5">déduction estimée</div>
        </div>
      </div>

      <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
        <span className="font-medium">Barème 2026 :</span> {BAREME_KM}€/km · Basé sur {DISTANCE_DEFAUT_KM} km moyen par séance
        <br />
        ⚠️ Estimation indicative — à valider avec votre comptable
      </div>
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
  let rows: { key: string; label: string; moy: number | null; n: number }[] = [];
  try {
    const progressions: Record<string, number[]> = {
      equilibre: [], force: [], handGrip: [], mobilite: [], souplesse: [], endurance: [], memoire: [],
    };

    (participants ?? []).forEach(p => {
      try {
        const bilans = [...(p.bilans ?? [])].sort((a, b) => a.date.localeCompare(b.date));
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
      } catch {
        // patient ignoré si ses données sont corrompues
      }
    });

    rows = Object.entries(progressions)
      .map(([key, vals]) => ({
        key,
        label: LABELS_TESTS[key],
        moy: vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
        n: vals.length,
      }))
      .filter(r => r.moy !== null);
  } catch {
    rows = [];
  }

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
                {pct > 0 ? '+' : ''}{pct}% <span className="text-gray-400 font-normal">({r.n} bénéficiaire{r.n > 1 ? 's' : ''})</span>
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
  let tops: { p: Participant; realisees: number; planifiees: number; taux: number }[] = [];
  try {
    tops = (participants ?? [])
      .map(p => {
        try {
          const contrat = contratActif(p.id);
          const seancesPt = (seances ?? []).filter(s => s.participantId === p.id);
          const planifiees = contrat
            ? seancesPt.filter(s => s.contratId === contrat.id).length
            : seancesPt.length;
          const realisees = contrat
            ? seancesPt.filter(s => s.contratId === contrat.id && s.statut === 'realisee').length
            : seancesPt.filter(s => s.statut === 'realisee').length;
          if (planifiees === 0) return null;
          const taux = Math.round((realisees / planifiees) * 100);
          return { p, realisees, planifiees, taux };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b!.taux - a!.taux)
      .slice(0, 5) as { p: Participant; realisees: number; planifiees: number; taux: number }[];
  } catch {
    tops = [];
  }

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
  let filteredLabels: string[] = [];
  let filteredData: number[] = [];
  const counts: Record<string, number> = {
    'Sénior': 0, 'Post-op': 0, 'Chronique': 0, 'Adulte blessé': 0, 'Autre': 0,
  };

  try {
    (participants ?? []).forEach(p => {
      try {
        const tags = p.tags ?? [];
        if (tags.includes('post_op'))              counts['Post-op']++;
        else if (tags.includes('senior'))          counts['Sénior']++;
        else if (tags.includes('chronique'))       counts['Chronique']++;
        else if (tags.includes('adulte_blessure')) counts['Adulte blessé']++;
        else {
          const age = calculerAge(p.dateNaissance);
          const ctx = (p.contexteClinic ?? '').toLowerCase();
          if (ctx.includes('pth') || ctx.includes('opér') || ctx.includes('post-op')) counts['Post-op']++;
          else if (age >= 65) counts['Sénior']++;
          else counts['Autre']++;
        }
      } catch {
        counts['Autre']++;
      }
    });
  } catch {
    // counts reste à zéro
  }

  filteredLabels = Object.keys(counts).filter(k => counts[k] > 0);
  filteredData   = filteredLabels.map(k => counts[k]);
  const COLORS = ['#1A5F9E','var(--color-teal)','#F59E0B','#1D9E75','#888780'];

  if (filteredData.length === 0) {
    return <p className="text-xs text-gray-400 italic py-4">Aucun bénéficiaire enregistré.</p>;
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
          label: (ctx: any) => `${ctx.label} : ${ctx.parsed} bénéficiaire${ctx.parsed > 1 ? 's' : ''}`,
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
  const { participants: rawParticipants } = useParticipants();
  const { seances: rawSeances } = useAgenda();
  const { contratActifDeParticipant, contrats: rawContrats } = useContrats();
  const { statsPro, sauvegarder } = useStatsPro();

  const participants = rawParticipants ?? [];
  const seances = rawSeances ?? [];
  const contrats = rawContrats ?? [];
  const caParMois = statsPro?.caParMois ?? {};

  const now = new Date();
  const moisActuelKey = todayKey();
  const moisPrecKey   = moisPrecedentKey(moisActuelKey);

  const caMois      = caParMois[moisActuelKey] ?? 0;
  const caPrecedent = caParMois[moisPrecKey] ?? 0;
  const deltaCaPct  = caPrecedent > 0 ? Math.round(((caMois - caPrecedent) / caPrecedent) * 100) : null;
  const caAnnuel    = Object.entries(caParMois)
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
            {formatMoisAnnee(now)} · {patientsActifs} bénéficiaire{patientsActifs > 1 ? 's' : ''} actif{patientsActifs > 1 ? 's' : ''}
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

      {/* ── Alertes ────────────────────────────────────────────────── */}
      <SectionAlertes
        participants={participants}
        seances={seances}
        contrats={contrats}
        contratActif={contratActifDeParticipant}
      />

      {/* ── Factures à envoyer ─────────────────────────────────────── */}
      <SectionFactures
        participants={participants}
        seances={seances}
        contrats={contrats}
        contratActif={contratActifDeParticipant}
      />

      {/* ── Santé du portefeuille ──────────────────────────────────── */}
      <SectionSantePortefeuille
        participants={participants}
        seances={seances}
        contrats={contrats}
        contratActif={contratActifDeParticipant}
      />

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
              <div className="text-sm font-semibold text-gray-700">{(statsPro.objectifMensuel ?? 0).toLocaleString('fr-FR')} €</div>
            </div>
          </div>
          <ErrorBoundary>
            <GraphiqueCA statsPro={statsPro} />
          </ErrorBoundary>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-800 mb-1">Séances hebdomadaires</div>
          <div className="text-xs text-gray-400 mb-3">12 dernières semaines — séances réalisées</div>
          <ErrorBoundary>
            <GraphiqueSeances seances={seances} />
          </ErrorBoundary>
        </div>
      </div>

      {/* ── Progression + Assiduité + Répartition ──────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-800 mb-3">Progression moyenne par test</div>
          <ErrorBoundary>
            <SectionProgression participants={participants} />
          </ErrorBoundary>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-800 mb-3">Top assiduité</div>
          <ErrorBoundary>
            <SectionAssiduite
              participants={participants}
              seances={seances}
              contratActif={contratActifDeParticipant}
            />
          </ErrorBoundary>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-800 mb-3">Répartition bénéficiaires</div>
          <ErrorBoundary>
            <SectionRepartition participants={participants} />
          </ErrorBoundary>
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
            Total : <span className="font-semibold text-gray-700">{participants.length} bénéficiaire{participants.length > 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* ── Projection + Objectif + Kilométrage ────────────────────── */}
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* Objectif + projection */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-800 mb-3">📊 Objectif mensuel</div>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#1D9E75' : pct >= 80 ? 'var(--color-teal)' : '#F59E0B' }}
                className="h-full rounded-full transition-all"
              />
            </div>
            <span className="text-sm font-bold text-gray-700">{pct}%</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="text-center">
              <div className="text-lg font-bold text-gray-900">{caMois.toLocaleString('fr-FR')} €</div>
              <div className="text-xs text-gray-400">CA ce mois</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-500">{(statsPro.objectifMensuel ?? 0).toLocaleString('fr-FR')} €</div>
              <div className="text-xs text-gray-400">Objectif</div>
            </div>
          </div>
          {/* Projection mois suivant */}
          {patientsActifs > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <div className="text-xs font-semibold text-blue-700 mb-0.5">
                Projection {MOIS_COURTS[(now.getMonth() + 1) % 12]}
              </div>
              <div className="text-sm font-bold text-blue-800">
                ~{(patientsActifs * (parseFloat(loadSettingsPro().tarifHoraire) || 45) * 4).toLocaleString('fr-FR')} €
              </div>
              <div className="text-xs text-blue-500 mt-0.5">
                Basé sur {patientsActifs} bénéficiaires actifs × ~4 séances/mois
              </div>
            </div>
          )}
        </div>

        {/* Kilométrage */}
        <SectionKilometrage seances={seances} participants={participants} />
      </div>
    </PageWrapper>
  );
}
