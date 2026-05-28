import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { pdf } from '@react-pdf/renderer';
import { addDays, getDaysInMonth } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import {
  Receipt, FileDown, Check, Trash2, ChevronLeft, ChevronRight,
  AlertTriangle, Users, CalendarDays, Euro, FileText, Download,
} from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import { useAgenda } from '../hooks/useAgenda';
import { useFactures } from '../hooks/useFactures';
import PageWrapper from '../components/layout/PageWrapper';
import FacturePDF from '../components/export/FacturePDF';
import toast from 'react-hot-toast';
import type { Facture, LigneFacture, Participant } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadSettings(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}'); }
  catch { return {}; }
}

function saveNextNumero(n: number) {
  try {
    const s = JSON.parse(localStorage.getItem('settings_praticien') || '{}');
    s.prochainNumeroFacture = String(n);
    localStorage.setItem('settings_praticien', JSON.stringify(s));
    window.dispatchEvent(new Event('settings_praticien_updated'));
  } catch { /* ignore */ }
}

function fm(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

function fd(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR');
}

function moisLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric',
  });
}

function getMoisActuel(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function periodeFromMois(ym: string): { debut: string; fin: string } {
  const [y, m] = ym.split('-').map(Number);
  const debut = `${ym}-01`;
  const fin = `${ym}-${String(getDaysInMonth(new Date(y, m - 1))).padStart(2, '0')}`;
  return { debut, fin };
}

function checkSettings(s: Record<string, string>): string[] {
  const manquants: string[] = [];
  if (!s.siret) manquants.push('SIRET');
  if (!s.numeroSAP) manquants.push('Numéro SAP');
  if (!s.nom || !s.prenom) manquants.push('Nom / Prénom');
  if (!s.tarifHoraire) manquants.push('Tarif horaire');
  return manquants;
}

function BadgeStatut({ statut }: { statut: Facture['statut'] }) {
  const cfg = {
    brouillon: { bg: '#F3F4F6', color: '#6B7280', label: 'Brouillon' },
    emise:     { bg: '#DBEAFE', color: '#1D4ED8', label: 'Émise' },
    payee:     { bg: '#D1FAE5', color: '#065F46', label: 'Payée' },
  }[statut];
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
    }}>
      {cfg.label}
    </span>
  );
}

// ── Export PDF d'une facture ──────────────────────────────────────────────────

async function exporterFacturePDF(facture: Facture): Promise<void> {
  const element = React.createElement(FacturePDF, { facture });
  const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${facture.numero}_${facture.patient.nom}_${facture.patient.prenom}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Export CSV récap ──────────────────────────────────────────────────────────

function exporterCSV(factures: Facture[], mois: string) {
  const header = 'Patient;Numéro;Séances;Montant séances (€);Frais km (€);Total TTC (€);Statut;Date émission';
  const lignes = factures.map(f => {
    const seances = f.lignes.filter(l => l.type === 'seance').reduce((s, l) => s + l.montant, 0);
    const km = f.lignes.filter(l => l.type === 'deplacement').reduce((s, l) => s + l.montant, 0);
    return `${f.patient.prenom} ${f.patient.nom};${f.numero};${f.totalSeances};${seances.toFixed(2)};${km.toFixed(2)};${f.totalTTC.toFixed(2)};${f.statut};${fd(f.dateEmission)}`;
  });
  const total = factures.reduce((s, f) => s + f.totalTTC, 0);
  const totalSeances = factures.reduce((s, f) => s + f.totalSeances, 0);
  const pied = `;TOTAL;${totalSeances};;;${total.toFixed(2)};;`;
  const csv = '﻿' + [header, ...lignes, pied].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Recap_compta_${mois}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── OngletGenerer ─────────────────────────────────────────────────────────────

function OngletGenerer({
  onGenere,
}: {
  onGenere: () => void;
}) {
  const { participants } = useParticipants();
  const { seances } = useAgenda();
  const [mois, setMois] = useState(getMoisActuel());
  const [generating, setGenerating] = useState(false);
  const { ajouterFactures } = useFactures();

  const settings = loadSettings();
  const manquants = checkSettings(settings);

  const periode = periodeFromMois(mois);

  const seancesDuMois = useMemo(() =>
    seances.filter(s =>
      s.statut === 'realisee' &&
      s.date >= periode.debut &&
      s.date <= periode.fin
    ), [seances, periode]);

  const resume = useMemo(() => {
    const byPatient = new Map<string, { participant: Participant; count: number }>();
    seancesDuMois.forEach(s => {
      const p = participants.find(p => p.id === s.participantId);
      if (!p) return;
      const existing = byPatient.get(s.participantId);
      if (existing) existing.count++;
      else byPatient.set(s.participantId, { participant: p, count: 1 });
    });
    return Array.from(byPatient.values());
  }, [seancesDuMois, participants]);

  const tarif = parseFloat(settings.tarifHoraire || '45');
  const montantEstime = resume.reduce((s, r) => s + r.count * tarif, 0);

  function naviguerMois(delta: number) {
    const [y, m] = mois.split('-').map(Number);
    const date = new Date(y, m - 1 + delta, 1);
    setMois(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }

  async function handleGenerer() {
    if (resume.length === 0) { toast.error('Aucune séance réalisée sur cette période'); return; }
    if (manquants.length > 0) {
      toast.error(`Paramètres manquants : ${manquants.join(', ')}`);
      return;
    }

    setGenerating(true);
    try {
      let seq = parseInt(settings.prochainNumeroFacture || '1', 10);
      const dateEmission = new Date().toISOString().split('T')[0];
      const delai = parseInt(settings.delaiPaiement || '30', 10);
      const dateEcheance = addDays(new Date(dateEmission), delai).toISOString().split('T')[0];
      const prefixe = settings.prefixeFacture || 'FACT';

      const factures: Facture[] = resume.map(({ participant, count }) => {
        const prixUnit = tarif;
        const seancesPatient = seancesDuMois.filter(s => s.participantId === participant.id);
        const ligne: LigneFacture = {
          id: uuidv4(),
          description: `Séances d'Activité Physique Adaptée à domicile — ${moisLabel(mois)}`,
          type: 'seance',
          quantite: count,
          unite: 'séance(s)',
          prixUnitaire: prixUnit,
          montant: count * prixUnit,
          seancesIds: seancesPatient.map(s => s.id),
        };
        const totalHT = ligne.montant;
        const numero = `${prefixe}-${mois.replace('-', '.')}-${String(seq).padStart(3, '0')}`;
        seq++;

        return {
          id: uuidv4(),
          numero,
          dateEmission,
          dateEcheance,
          periode,
          prestataire: {
            nom: settings.nom || '',
            prenom: settings.prenom || '',
            societe: settings.societe || '',
            adresse: settings.adresseRue || '',
            codePostal: settings.adresseCodePostal || '',
            ville: settings.adresseVille || '',
            telephone: settings.telephone || '',
            email: settings.email || '',
            siret: settings.siret || '',
            numeroSAP: settings.numeroSAP || '',
            dateSAP: settings.dateSAP || '',
            iban: settings.ibanPraticien || '',
            bic: settings.bicPraticien || '',
          },
          patient: {
            id: participant.id,
            nom: participant.nom,
            prenom: participant.prenom,
            adresse: participant.adresseRue || '',
            codePostal: participant.adresseCodePostal || '',
            ville: participant.adresseVille || '',
          },
          lignes: [ligne],
          totalHT,
          totalTTC: totalHT,
          totalSeances: count,
          totalKm: 0,
          statut: 'brouillon',
          mode: 'mensuelle',
        };
      });

      ajouterFactures(factures);
      saveNextNumero(seq);
      toast.success(`${factures.length} facture${factures.length > 1 ? 's' : ''} générée${factures.length > 1 ? 's' : ''} !`);
      onGenere();
    } catch {
      toast.error('Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  }

  const isFutur = mois > getMoisActuel();

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Alerte paramètres manquants */}
      {manquants.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <strong>Paramètres manquants pour la facturation :</strong>{' '}
            {manquants.join(', ')}.{' '}
            <Link to="/settings" className="underline font-semibold hover:text-amber-900">
              Compléter dans Paramètres →
            </Link>
          </div>
        </div>
      )}

      {/* Sélecteur de mois */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5 shadow-sm">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Période à facturer</div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => naviguerMois(-1)}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex-1 text-center">
            <div className="font-heading font-bold text-xl text-dark capitalize">
              {moisLabel(mois)}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {fd(periodeFromMois(mois).debut)} → {fd(periodeFromMois(mois).fin)}
            </div>
          </div>
          <button
            onClick={() => naviguerMois(1)}
            disabled={isFutur}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { icon: Users, label: 'Patients', value: resume.length },
          { icon: CalendarDays, label: 'Séances', value: seancesDuMois.length },
          { icon: Euro, label: 'Montant estimé', value: `${fm(montantEstime)} €` },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-center">
            <Icon size={20} className="mx-auto mb-2 text-primary" />
            <div className="font-bold text-xl text-dark">{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Liste patients */}
      {resume.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 text-xs font-bold text-gray-400 uppercase tracking-widest">
            Détail par patient
          </div>
          {resume.map(({ participant, count }) => (
            <div key={participant.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
              <div>
                <div className="font-semibold text-dark text-sm">
                  {participant.prenom} {participant.nom}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {count} séance{count > 1 ? 's' : ''} × {fm(tarif)} € = {fm(count * tarif)} €
                </div>
              </div>
              <div className="font-bold text-dark">{fm(count * tarif)} €</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-10 text-center mb-5">
          <CalendarDays size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">Aucune séance réalisée en {moisLabel(mois)}</p>
          <p className="text-xs text-gray-300 mt-1">
            Saisissez des séances comme "Réalisées" dans l'agenda pour les facturer.
          </p>
        </div>
      )}

      {/* Bouton générer */}
      <button
        onClick={handleGenerer}
        disabled={generating || resume.length === 0 || manquants.length > 0}
        className="w-full flex items-center justify-center gap-2 bg-primary text-white py-4 rounded-xl font-semibold text-base hover:bg-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Receipt size={18} />
        {generating
          ? 'Génération en cours…'
          : `Générer ${resume.length} facture${resume.length > 1 ? 's' : ''} — ${fm(montantEstime)} €`}
      </button>

      <p className="text-xs text-gray-400 text-center mt-3">
        Les factures sont créées en statut "Brouillon". Vous pouvez les télécharger avant de les envoyer.
      </p>

    </div>
  );
}

// ── OngletHistorique ──────────────────────────────────────────────────────────

function OngletHistorique() {
  const { factures, marquerEmise, marquerPayee, supprimerFacture } = useFactures();
  const [exportingId, setExportingId] = useState<string | null>(null);

  async function handleExport(facture: Facture) {
    setExportingId(facture.id);
    try {
      await exporterFacturePDF(facture);
    } catch {
      toast.error('Erreur lors de la génération du PDF');
    } finally {
      setExportingId(null);
    }
  }

  function handleMarquerEmise(facture: Facture) {
    marquerEmise(facture.id);
    toast.success('Facture marquée comme émise');
  }

  function handleMarquerPayee(facture: Facture) {
    marquerPayee(facture.id);
    toast.success('Facture marquée comme payée');
  }

  function handleSupprimer(facture: Facture) {
    if (facture.statut !== 'brouillon') {
      toast.error('Seuls les brouillons peuvent être supprimés');
      return;
    }
    supprimerFacture(facture.id);
    toast.success('Facture supprimée');
  }

  if (factures.length === 0) {
    return (
      <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-12 text-center">
        <FileText size={40} className="mx-auto mb-4 text-gray-300" />
        <p className="text-gray-400 font-medium">Aucune facture générée</p>
        <p className="text-xs text-gray-300 mt-1">Utilisez l'onglet "Générer" pour créer vos premières factures.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {factures.map(f => (
        <div
          key={f.id}
          className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
        >
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <span className="font-bold text-dark text-sm">{f.patient.prenom} {f.patient.nom}</span>
                <BadgeStatut statut={f.statut} />
              </div>
              <div className="text-xs text-gray-400">
                {f.numero} · {fd(f.dateEmission)} · {f.totalSeances} séance{f.totalSeances > 1 ? 's' : ''}
                {f.statut === 'payee' && f.datePaiement && ` · Payée le ${fd(f.datePaiement)}`}
              </div>
            </div>
            <div className="font-bold text-lg text-dark flex-shrink-0">
              {fm(f.totalTTC)} €
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* PDF */}
              <button
                onClick={() => handleExport(f)}
                disabled={exportingId === f.id}
                title="Télécharger la facture PDF"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-semibold transition-colors disabled:opacity-60"
              >
                <FileDown size={13} />
                {exportingId === f.id ? 'PDF…' : 'PDF'}
              </button>
              {/* Marquer émise */}
              {f.statut === 'brouillon' && (
                <button
                  onClick={() => handleMarquerEmise(f)}
                  title="Marquer comme émise"
                  className="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-semibold transition-colors"
                >
                  Émettre
                </button>
              )}
              {/* Marquer payée */}
              {f.statut === 'emise' && (
                <button
                  onClick={() => handleMarquerPayee(f)}
                  title="Marquer comme payée"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 text-xs font-semibold transition-colors"
                >
                  <Check size={12} /> Payée
                </button>
              )}
              {/* Supprimer brouillon */}
              {f.statut === 'brouillon' && (
                <button
                  onClick={() => handleSupprimer(f)}
                  title="Supprimer ce brouillon"
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── OngletRecap ───────────────────────────────────────────────────────────────

function OngletRecap() {
  const { factures } = useFactures();
  const [mois, setMois] = useState(getMoisActuel());

  function naviguerMois(delta: number) {
    const [y, m] = mois.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMois(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const facturesMois = factures.filter(f => f.dateEmission.startsWith(mois) && f.statut !== 'brouillon');
  const totalMois = facturesMois.reduce((s, f) => s + f.totalTTC, 0);
  const seancesMois = facturesMois.reduce((s, f) => s + f.totalSeances, 0);
  const payeesMois = facturesMois.filter(f => f.statut === 'payee').reduce((s, f) => s + f.totalTTC, 0);
  const enAttente = totalMois - payeesMois;

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Sélecteur mois */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => naviguerMois(-1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ChevronLeft size={16} />
        </button>
        <div className="font-heading font-bold text-xl text-dark capitalize flex-1 text-center">
          {moisLabel(mois)}
        </div>
        <button
          onClick={() => naviguerMois(1)}
          disabled={mois >= getMoisActuel()}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Factures', value: facturesMois.length, color: '#1A5F9E' },
          { label: 'Séances', value: seancesMois, color: '#2BBFBF' },
          { label: 'Total', value: `${fm(totalMois)} €`, color: '#3B6D11' },
          { label: 'En attente', value: `${fm(enAttente)} €`, color: '#F59E0B' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
            <div className="font-bold text-xl" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Tableau */}
      {facturesMois.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
          Aucune facture émise en {moisLabel(mois)}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide">N° Facture</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wide">Séances</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wide">Total TTC</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wide">Statut</th>
                </tr>
              </thead>
              <tbody>
                {facturesMois.map(f => (
                  <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-dark">
                      {f.patient.prenom} {f.patient.nom}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{f.numero}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{f.totalSeances}</td>
                    <td className="px-4 py-3 text-right font-bold text-dark">{fm(f.totalTTC)} €</td>
                    <td className="px-4 py-3 text-center"><BadgeStatut statut={f.statut} /></td>
                  </tr>
                ))}
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-4 py-3 font-bold text-dark" colSpan={2}>TOTAL</td>
                  <td className="px-4 py-3 text-center font-bold text-dark">{seancesMois}</td>
                  <td className="px-4 py-3 text-right font-bold text-primary text-base">{fm(totalMois)} €</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <button
            onClick={() => exporterCSV(facturesMois, mois)}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Download size={15} />
            Exporter CSV (comptable)
          </button>
        </>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

const ONGLETS = [
  { id: 'generer',    label: 'Générer',          icon: Receipt },
  { id: 'historique', label: 'Historique',        icon: FileText },
  { id: 'recap',      label: 'Récap comptable',   icon: Download },
] as const;

type OngletId = typeof ONGLETS[number]['id'];

export default function FacturationPage() {
  const [onglet, setOnglet] = useState<OngletId>('generer');

  return (
    <PageWrapper>
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="font-heading font-bold text-2xl text-dark flex items-center gap-2">
          <Receipt size={22} className="text-primary" />
          Facturation SAP
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Génération de factures conformes — TVA non applicable Art. 293B CGI
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {ONGLETS.map(o => {
          const Icon = o.icon;
          return (
            <button
              key={o.id}
              onClick={() => setOnglet(o.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                onglet === o.id
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} />
              {o.label}
            </button>
          );
        })}
      </div>

      {/* Contenu */}
      {onglet === 'generer'    && <OngletGenerer onGenere={() => setOnglet('historique')} />}
      {onglet === 'historique' && <OngletHistorique />}
      {onglet === 'recap'      && <OngletRecap />}
    </PageWrapper>
  );
}
