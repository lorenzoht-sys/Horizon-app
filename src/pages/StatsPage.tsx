import { useState, useEffect, Component, useCallback } from 'react';
import { chargerSettingsPraticien } from '../lib/settingsPraticien';
import type { ReactNode } from 'react';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Cell, Line, LineChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import {
  Edit3, ChevronDown, ChevronUp, CheckCircle, RefreshCw, ClipboardList, FileClock,
  CalendarX2, UserRoundX, Target, AlertTriangle, Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PageWrapper from '../components/layout/PageWrapper';
import { useParticipants } from '../hooks/useParticipants';
import { contratsDesBeneficiairesActifs, separerParArchivage } from '../lib/archivage';
import { useAgenda } from '../hooks/useAgenda';
import { useContrats } from '../hooks/useContrats';
import { useStatsPro, type StatsPro } from '../hooks/useStatsPro';
import { useCaDouzeMois } from '../hooks/useChiffreAffaires';
import { useFacturesAValider, useFacturesValidees } from '../hooks/useFacturesAValider';
import { useStructures } from '../hooks/useStructures';
import { useFactures } from '../hooks/useFactures';
import { EBAUCHE_FACTURATION_VISIBLE } from '../lib/featuresFacturation';
import type { Participant, Contrat } from '../types';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { cleanTextPdf } from '../utils/pdfText';
import { chargerTarifsContrat, useTarifsDesContrats } from '../hooks/useTarifsContrat';
import { trouverTarifApplicable, totalFactureSeance, dateCivileParis } from '../lib/tarifsContrats';
import { useCoursCollectifs } from '../hooks/useCoursCollectifs';
import { datesCoursCollectifsIndividuelFacturables } from '../lib/coursCollectifs';
import { bilanAFaire, echeanceBilan, progresDepuisInitial, type Progres } from '../lib/tableauDeBord';
import {
  presenceRecente, activiteMoisADate, semaines as calculerSemaines, assiduiteParBeneficiaire, resultatsParTest,
  caParMois as calculerCaParMois, encaissements, valeurSeances, annulations as calculerAnnulations, sourcesCA,
  partPremierBeneficiaire, portefeuille as calculerPortefeuille, parStructure, derniersMois, moisDecale,
  minutesRealisees, formaterHeures, ajouterJours, phrasesDuMois,
} from '../lib/statistiques';

// Page « Mes stats » refondue le 2026-11-24 pour l'enseignant APA indépendant qui travaille aussi
// pour des structures : ce qui rentre (le mois en cours vit dans les brouillons), ce qui reste dû, le
// temps passé, ce que rapporte une heure, ce que coûtent les annulations, d'où vient le CA, et un
// tableau par structure. Chiffres de l'ancienne page corrigés (présence, progrès), kilométrage et
// projection inventés retirés, alertes fusionnées en « À faire » aux règles de l'accueil.
// Calculs : lib/statistiques.ts. Aucune table ni migration : seulement des lectures existantes.

const MOIS_COURTS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
const MOIS_LONGS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// Couleurs de la charte (src/styles/tokens.css), en dur pour Recharts qui ne lit pas les variables CSS.
const VERT = '#2BB89A';
const VERT_PALE = '#BFE8DD';
const VERT_FONCE = '#1A9A7F';
const ENCRE_2 = '#5A6B7A';
const ENCRE_3 = '#9DAFC0';
const AMBRE = '#F0A429';
const ROUGE = '#E8544A';
const ROUGE_PALE = '#F6C3BF';
const GRIS = '#E5EAEF';

// ─── ErrorBoundary ────────────────────────────────────────────────────────────

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

// ─── Ancienne ébauche de facturation (masquée, voir EBAUCHE_FACTURATION_VISIBLE) ─

// ─── Helpers supplémentaires ─────────────────────────────────────────────────


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
  const { coursCollectifs, participations: participationsCoursCollectifs } = useCoursCollectifs();
  const settings = chargerSettingsPraticien();
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
      // Cours collectifs en mode individuel où ce participant était présent
      // : chaque présence compte comme une séance facturée à ce
      // participant, même fonction de résolution de tarif que ses séances
      // classiques — voir Checkpoint A/B (nouvelle fonctionnalité cours
      // collectifs). datesCoursCollectifsIndividuelFacturables filtre déjà
      // statut === 'realise' (jamais planifié ni annulé).
      const datesCoursCollectifs = datesCoursCollectifsIndividuelFacturables(
        coursCollectifs, participationsCoursCollectifs, p.id, debut, fin,
      );
      const toutesLesDates = [...seancesPatient.map(s => s.date), ...datesCoursCollectifs];
      if (toutesLesDates.length === 0) continue;
      // Vérifie si une facture existe déjà
      const existe = factures.some(
        f => f.participantId === p.id && f.periodeMois === mois && f.periodeAnnee === annee
      );
      if (existe) continue;
      // Somme par séance via le tarif verrouillé applicable à sa date
      // (bug 07) — jamais un tarif unique multiplié par le nombre de
      // séances : un changement de tarif en cours de mois doit se
      // répercuter séance par séance, pas rétroactivement sur tout le mois.
      // Repli sur le tarif par défaut du praticien pour toute séance
      // antérieure à la première version connue (contrat jamais tarifé).
      const versions = await chargerTarifsContrat(c.id);
      const montantTotal = toutesLesDates.reduce((somme, date) => {
        const applicable = trouverTarifApplicable(versions, date);
        return somme + (applicable ? totalFactureSeance(applicable) : tarifDefaut);
      }, 0);
      await creerOuMettreAJour({
        participantId: p.id,
        periodeMois: mois,
        periodeAnnee: annee,
        nbSeances: toutesLesDates.length,
        montantTotal,
        dateEcheance: echeance,
      });
    }
    setGenLoading(false);
  }, [praticienId, participants, seances, contratActif, factures, creerOuMettreAJour, tarifDefaut, genLoading, coursCollectifs, participationsCoursCollectifs]);

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
    // Tarif affiché = montant réellement facturé / nombre de séances : reste
    // exact même si le tarif a changé en cours de période (bug 07), sans
    // recharger l'historique juste pour l'affichage — le montant total, lui,
    // vient déjà de la somme par séance calculée à la génération.
    const tarif = f.nbSeances > 0 ? f.montantTotal / f.nbSeances : tarifDefaut;
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
    // Même calcul que genererPDF : montant réel / nb de séances, correct
    // même après un changement de tarif en cours de période.
    const tarif = f.nbSeances > 0 ? f.montantTotal / f.nbSeances : tarifDefaut;
    return (
      <div className={`${CARD_CLS} ${showRappel ? 'border-red-200 bg-red-light' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="font-semibold text-gray-900 text-sm">{nom}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {periode} · {f.nbSeances} séance{f.nbSeances > 1 ? 's' : ''} × {tarif.toFixed(2)}€
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

// ─── Briques ─────────────────────────────────────────────────────────────────

function Carte({ titre, sousTitre, droite, children, className = '' }: {
  titre: string;
  sousTitre?: ReactNode;
  droite?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 min-w-0 flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900 m-0">{titre}</h2>
          {sousTitre && <div className="text-xs text-gray-500 mt-0.5">{sousTitre}</div>}
        </div>
        {droite}
      </div>
      {children}
    </section>
  );
}

function Legende({ elements }: { elements: { libelle: string; couleur: string; pointille?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
      {elements.map(e => (
        <span key={e.libelle} className="inline-flex items-center gap-1.5">
          {e.pointille
            ? <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: e.couleur }} />
            : <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: e.couleur }} />}
          {e.libelle}
        </span>
      ))}
    </div>
  );
}

/** Petite courbe sans axes sous un chiffre clé : la tendance, pas le détail. */
function Tendance({ valeurs }: { valeurs: (number | null)[] }) {
  if (valeurs.filter(v => v !== null).length < 2) return <div style={{ height: 36 }} />;
  const data = valeurs.map((v, i) => ({ i, v }));
  return (
    <div style={{ height: 36 }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line dataKey="v" type="monotone" stroke={VERT} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChiffreCle({ libelle, valeur, detail, valeurs, children }: {
  libelle: string;
  valeur: string;
  detail?: ReactNode;
  valeurs?: (number | null)[];
  children?: ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col min-w-0">
      <div className="text-xs font-medium text-gray-500">{libelle}</div>
      <div className="font-heading font-extrabold text-gray-900 leading-none mt-2" style={{ fontSize: 30, letterSpacing: '-0.5px' }}>
        {valeur}
      </div>
      {detail && <div className="text-xs mt-2 text-gray-500">{detail}</div>}
      {children}
      {valeurs && <div className="mt-auto pt-3"><Tendance valeurs={valeurs} /></div>}
    </div>
  );
}

const euros = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`;

function TitreSection({ children, detail }: { children: ReactNode; detail?: string }) {
  return (
    <div className="flex items-baseline gap-3 mt-8 mb-3">
      <h2 className="m-0 text-xs font-bold uppercase tracking-wider" style={{ color: ENCRE_2 }}>{children}</h2>
      {detail && <span className="text-xs text-gray-400">{detail}</span>}
    </div>
  );
}

function Mini({ libelle, valeur, detail, ton }: { libelle: string; valeur: string; detail?: string; ton?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-gray-500">{libelle}</div>
      <div className="font-heading font-extrabold text-xl leading-tight mt-1" style={{ color: ton ?? '#1A2332' }}>{valeur}</div>
      {detail && <div className="text-xs text-gray-400 mt-0.5">{detail}</div>}
    </div>
  );
}

// ─── Objectifs ────────────────────────────────────────────────────────────────
//
// Le CA n'est plus saisi ici (champ « Saisir mon CA » supprimé le 2026-10-09 : c'était une saisie locale,
// dans le navigateur, sans lien avec les bénéficiaires ni les factures). Il vient de la facturation (factures
// validées, HT) et des saisies de CA externe de la page /factures/ca. Ne reste ici que les objectifs.

function FormulaireObjectifs({ statsPro, onSave, ouvert, setOuvert }: {
  statsPro: StatsPro;
  onSave: (s: StatsPro) => void;
  ouvert: boolean;
  setOuvert: (o: boolean) => void;
}) {
  const [objMensuel, setObjMensuel] = useState(statsPro.objectifMensuel ?? 0);
  const [objAnnuel, setObjAnnuel] = useState(statsPro.objectifAnnuel ?? 0);

  useEffect(() => {
    setObjMensuel(statsPro.objectifMensuel);
    setObjAnnuel(statsPro.objectifAnnuel);
  }, [statsPro]);

  return (
    <div className="relative">
      <button
        onClick={() => setOuvert(!ouvert)}
        className="flex items-center gap-2 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 px-3 py-2 rounded-xl transition-colors"
      >
        <Edit3 size={14} />
        Mes objectifs
        {ouvert ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {ouvert && (
        <div className="absolute right-0 top-full mt-2 z-20 w-80 bg-white border border-gray-200 shadow-lg rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider m-0">Objectifs de chiffre d'affaires (HT)</p>
          {[
            { label: 'Par mois', val: objMensuel, set: setObjMensuel },
            { label: 'Par an',   val: objAnnuel,  set: setObjAnnuel  },
          ].map(({ label, val, set }) => (
            <label key={label} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-20 flex-shrink-0">{label}</span>
              <input
                type="number" value={val} min={0}
                onChange={e => set(parseInt(e.target.value) || 0)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
              <span className="text-xs text-gray-400">€</span>
            </label>
          ))}
          <p className="text-xs text-gray-500 m-0">
            Le CA affiché vient de vos factures validées et de votre CA externe :{' '}
            <Link to="/factures/ca" className="text-primary font-medium hover:underline">suivre mon chiffre d'affaires</Link>.
          </p>
          <button
            onClick={() => {
              onSave({ objectifMensuel: objMensuel, objectifAnnuel: objAnnuel });
              setOuvert(false);
            }}
            className="w-full py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}

function JaugeObjectif({ realise, objectif, libelle }: { realise: number; objectif: number; libelle: string }) {
  const pct = Math.round((realise / objectif) * 100);
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{libelle} : {euros(objectif)}</span>
        <span className="font-semibold" style={{ color: pct >= 100 ? VERT_FONCE : ENCRE_2 }}>{pct} %</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: GRIS }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: VERT }} />
      </div>
    </div>
  );
}

// ─── À faire ─────────────────────────────────────────────────────────────────

interface LigneAFaire { id: string; nom: string; detail: string }

function GroupeAFaire({ icone, titre, lignes, couleur }: {
  icone: ReactNode;
  titre: string;
  lignes: LigneAFaire[];
  couleur: string;
}) {
  const [tout, setTout] = useState(false);
  const visibles = tout ? lignes : lignes.slice(0, 4);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: `${couleur}1A`, color: couleur }}>{icone}</span>
        <span className="text-sm font-semibold text-gray-800">{titre}</span>
        <span className="text-xs font-bold px-1.5 py-0.5 rounded-md" style={{ background: `${couleur}1A`, color: couleur }}>{lignes.length}</span>
      </div>
      <ul className="m-0 p-0 list-none">
        {visibles.map(l => (
          <li key={l.id}>
            <Link to={`/participant/${l.id}`} className="flex items-baseline justify-between gap-2 py-1.5 px-2 -mx-2 rounded-lg hover:bg-gray-50 no-underline">
              <span className="text-sm text-gray-800 truncate">{l.nom}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">{l.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
      {lignes.length > 4 && (
        <button onClick={() => setTout(t => !t)} className="text-xs font-medium text-primary mt-1 hover:underline">
          {tout ? 'Réduire' : `Voir les ${lignes.length - 4} autres`}
        </button>
      )}
    </div>
  );
}

function SectionAFaire({ groupes }: {
  groupes: { cle: string; icone: ReactNode; titre: string; lignes: LigneAFaire[]; couleur: string }[];
}) {
  const nonVides = groupes.filter(g => g.lignes.length > 0);
  if (nonVides.length === 0) {
    return (
      <div className="rounded-2xl border px-5 py-3.5 mb-5 flex items-center gap-3 text-sm font-medium"
        style={{ background: '#E6F5F1', borderColor: VERT_PALE, color: VERT_FONCE }}>
        <CheckCircle size={18} />
        Rien à rattraper : bilans, contrats et séances sont à jour. Bien joué !
      </div>
    );
  }
  return (
    <Carte titre="À faire" sousTitre="Bénéficiaires suivis, mêmes règles que l'accueil" className="mb-5">
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
        {nonVides.map(g => <GroupeAFaire key={g.cle} icone={g.icone} titre={g.titre} lignes={g.lignes} couleur={g.couleur} />)}
      </div>
    </Carte>
  );
}

// ─── Résultats des bilans ────────────────────────────────────────────────────

function SectionResultats({ participants }: { participants: Participant[] }) {
  const resultats = resultatsParTest(participants);
  if (resultats.length === 0) {
    return <p className="text-sm text-gray-400 m-0 py-4">Les résultats apparaîtront dès le deuxième bilan d'un bénéficiaire : Horizon compare chaque test au premier.</p>;
  }
  return (
    <div className="space-y-3.5">
      {resultats.map(r => (
        <div key={r.cle} title={`Stable : ${r.seuilTexte} entre le premier et le dernier bilan`}>
          <div className="flex justify-between items-baseline gap-2 text-xs mb-1.5">
            <span className="text-gray-700 font-medium truncate">{r.libelle}</span>
            <span className="text-gray-500 flex-shrink-0">
              <span className="font-semibold" style={{ color: VERT_FONCE }}>{r.progressent}</span> sur {r.total} progresse{r.progressent > 1 ? 'nt' : ''}
            </span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden gap-px" style={{ background: GRIS }}>
            {r.progressent > 0 && <div style={{ width: `${(r.progressent / r.total) * 100}%`, background: VERT }} />}
            {r.stables > 0 && <div style={{ width: `${(r.stables / r.total) * 100}%`, background: '#CBD5DE' }} />}
            {r.reculent > 0 && <div style={{ width: `${(r.reculent / r.total) * 100}%`, background: ROUGE }} />}
          </div>
        </div>
      ))}
      <div className="pt-1"><Legende elements={[
        { libelle: 'Progresse', couleur: VERT }, { libelle: 'Stable', couleur: '#CBD5DE' }, { libelle: 'Recule', couleur: ROUGE },
      ]} /></div>
    </div>
  );
}

// ─── Assiduité à surveiller ──────────────────────────────────────────────────

const SEUIL_ASSIDUITE = 80;

function SectionAssiduite({ lignes, nomDe }: {
  lignes: { participantId: string; realisees: number; annulees: number; taux: number }[];
  nomDe: (id: string) => { prenom: string; nom: string } | null;
}) {
  const aSurveiller = lignes.filter(l => l.taux < SEUIL_ASSIDUITE).slice(0, 6);
  if (lignes.length === 0) {
    return <p className="text-sm text-gray-400 m-0 py-4">L'assiduité se mesurera après quelques séances passées.</p>;
  }
  if (aSurveiller.length === 0) {
    return (
      <p className="text-sm m-0 py-4" style={{ color: VERT_FONCE }}>
        Tout le monde est fidèle au rendez-vous : chacun vient à au moins {SEUIL_ASSIDUITE} % de ses séances.
      </p>
    );
  }
  return (
    <ul className="m-0 p-0 list-none">
      {aSurveiller.map(l => {
        const p = nomDe(l.participantId);
        if (!p) return null;
        const total = l.realisees + l.annulees;
        return (
          <li key={l.participantId}>
            <Link to={`/participant/${l.participantId}`} className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-gray-50 no-underline">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: '#E6F5F1', color: VERT_FONCE }}>
                {(p.prenom?.[0] ?? '?').toUpperCase()}{(p.nom?.[0] ?? '?').toUpperCase()}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-gray-800 truncate">{p.prenom} {p.nom}</span>
                <span className="block text-xs text-gray-400">{l.annulees} annulée{l.annulees > 1 ? 's' : ''} sur {total}</span>
              </span>
              <span className="text-sm font-semibold flex-shrink-0" style={{ color: l.taux < 60 ? ROUGE : AMBRE }}>{l.taux} %</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}


// ─── Argent : graphique et origine du CA ─────────────────────────────────────

function GraphiqueCA({ mois, objectif, moisCourant }: {
  mois: { mois: string; facture: number; enPreparation: number }[];
  objectif: number;
  moisCourant: string;
}) {
  const data = mois.map(m => ({
    ...m,
    libelle: MOIS_COURTS[Number(m.mois.slice(5, 7)) - 1] + (m.mois.slice(5, 7) === '01' ? ` ${m.mois.slice(2, 4)}` : ''),
    objectif: objectif > 0 ? objectif : null,
  }));
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
          <XAxis dataKey="libelle" tick={{ fontSize: 11, fill: ENCRE_2 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: ENCRE_3 }} tickFormatter={v => `${Number(v).toLocaleString('fr-FR')}`} tickLine={false} axisLine={false} width={48} />
          <Tooltip cursor={{ fill: 'rgba(43,184,154,0.06)' }} formatter={(value, name) => [euros(Number(value ?? 0)), name]} />
          <Bar dataKey="facture" name="Facturé" stackId="ca" fill={VERT} maxBarSize={34} isAnimationActive={false}>
            {data.map(d => <Cell key={d.mois} fill={d.mois === moisCourant ? VERT_FONCE : VERT} />)}
          </Bar>
          <Bar dataKey="enPreparation" name="En préparation (brouillons)" stackId="ca" fill={VERT_PALE} radius={[6, 6, 0, 0]} maxBarSize={34} isAnimationActive={false} />
          {objectif > 0 && (
            <Line dataKey="objectif" name="Objectif mensuel" type="linear" stroke={AMBRE} strokeDasharray="5 4"
              strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function SectionSourcesCA({ sources, partPremier }: {
  sources: { cle: string; libelle: string; montant: number; part: number; beneficiaires: number }[];
  partPremier: number | null;
}) {
  if (sources.length === 0) {
    return <p className="text-sm text-gray-400 m-0 py-4">Vos premières factures émises montreront ici d'où vient votre chiffre d'affaires.</p>;
  }
  const dominante = sources.find(s => s.part >= 50 && s.cle !== 'particuliers');
  return (
    <div className="flex flex-col gap-3 flex-1">
      {sources.slice(0, 6).map(s => (
        <div key={s.cle}>
          <div className="flex justify-between items-baseline gap-2 text-xs mb-1.5">
            <span className="text-gray-700 font-medium truncate">{s.libelle}
              <span className="text-gray-400 font-normal"> · {s.beneficiaires} bénéf.</span>
            </span>
            <span className="flex-shrink-0"><span className="font-semibold text-gray-800">{euros(s.montant)}</span>
              <span className="text-gray-400"> · {s.part} %</span></span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: GRIS }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, s.part)}%`, background: s.cle === 'particuliers' ? ENCRE_2 : VERT }} />
          </div>
        </div>
      ))}
      <div className="mt-auto pt-2 space-y-1.5">
        {dominante && (
          <p className="m-0 text-xs flex items-start gap-1.5" style={{ color: '#B7791F' }}>
            <AlertTriangle size={13} className="flex-shrink-0 mt-px" />
            {dominante.libelle} pèse {dominante.part} % de votre chiffre d'affaires : une dépendance à surveiller.
          </p>
        )}
        {partPremier !== null && (
          <p className="m-0 text-xs text-gray-500">Votre premier bénéficiaire représente {partPremier} % du CA.</p>
        )}
      </div>
    </div>
  );
}

// ─── Temps ───────────────────────────────────────────────────────────────────

function GraphiqueTemps({ semaines }: { semaines: { libelle: string; heures: number; heuresAnnulees: number }[] }) {
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={semaines} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
          <XAxis dataKey="libelle" tick={{ fontSize: 10, fill: ENCRE_2 }} tickLine={false} axisLine={false} interval={1} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: ENCRE_3 }} tickLine={false} axisLine={false} width={28} unit=" h" />
          <Tooltip cursor={{ fill: 'rgba(43,184,154,0.06)' }} labelFormatter={l => `Semaine du ${l}`}
            formatter={(value, name) => [formaterHeures(Number(value ?? 0) * 60), name]} />
          <Bar dataKey="heures" name="Heures réalisées" stackId="h" fill={VERT} maxBarSize={22} isAnimationActive={false}>
            {semaines.map((_, i) => <Cell key={i} fill={i === semaines.length - 1 ? VERT_PALE : VERT} />)}
          </Bar>
          <Bar dataKey="heuresAnnulees" name="Heures annulées" stackId="h" fill={ROUGE_PALE} radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SectionAnnulations({ a, manqueAGagner }: {
  a: { annulees: number; total: number; minutesPerdues: number; motifs: { motif: string; libelle: string; n: number }[] };
  manqueAGagner: { montant: number; sansTarif: number };
}) {
  if (a.total === 0) return <p className="text-sm text-gray-400 m-0 py-4">Pas encore de séance passée sur la période.</p>;
  const tauxAnnulation = Math.round((a.annulees / a.total) * 100);
  const max = Math.max(1, ...a.motifs.map(m => m.n));
  return (
    <div className="flex flex-col gap-4 flex-1">
      <div className="grid grid-cols-3 gap-3">
        <Mini libelle="Annulées" valeur={`${tauxAnnulation} %`} detail={`${a.annulees} sur ${a.total}`} ton={tauxAnnulation >= 15 ? ROUGE : undefined} />
        <Mini libelle="Heures perdues" valeur={formaterHeures(a.minutesPerdues)} />
        <Mini libelle="Non facturé" valeur={euros(manqueAGagner.montant)}
          detail={manqueAGagner.sansTarif > 0 ? `${manqueAGagner.sansTarif} sans tarif` : 'au tarif du contrat'} />
      </div>
      {a.motifs.length > 0 && (
        <div className="space-y-2">
          {a.motifs.slice(0, 5).map(m => (
            <div key={m.motif} className="flex items-center gap-2 text-xs">
              <span className="w-40 flex-shrink-0 truncate text-gray-600">{m.libelle}</span>
              <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: GRIS }}>
                <span className="block h-full rounded-full" style={{ width: `${(m.n / max) * 100}%`, background: m.motif === 'non_renseigne' ? ENCRE_3 : ROUGE_PALE }} />
              </span>
              <span className="w-6 text-right font-semibold text-gray-700">{m.n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Par structure ───────────────────────────────────────────────────────────

function TableauStructures({ lignes }: {
  lignes: { cle: string; libelle: string; beneficiaires: number; minutesMois: number; coursMois: number; presence: number | null; ca12Mois: number }[];
}) {
  const th = 'text-left text-xs font-medium text-gray-500 py-2 px-3 whitespace-nowrap';
  const td = 'py-2.5 px-3 text-sm text-gray-800 whitespace-nowrap';
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-100">
            <th className={th}>Origine</th>
            <th className={`${th} text-right`}>Bénéficiaires suivis</th>
            <th className={`${th} text-right`}>Heures ce mois</th>
            <th className={`${th} text-right`}>Cours collectifs ce mois</th>
            <th className={`${th} text-right`}>Présence 90 j</th>
            <th className={`${th} text-right`}>CA 12 mois (HT)</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map(l => (
            <tr key={l.cle} className="border-b border-gray-50 last:border-0">
              <td className={`${td} font-medium`}>
                {l.cle === 'particuliers'
                  ? l.libelle
                  : <Link to={`/structures/${l.cle}`} className="text-gray-800 hover:text-primary no-underline">{l.libelle}</Link>}
              </td>
              <td className={`${td} text-right`}>{l.beneficiaires}</td>
              <td className={`${td} text-right`}>{l.minutesMois > 0 ? formaterHeures(l.minutesMois) : '—'}</td>
              <td className={`${td} text-right`}>{l.cle === 'particuliers' ? '' : l.coursMois || '—'}</td>
              <td className={`${td} text-right`} style={{ color: l.presence !== null && l.presence < SEUIL_ASSIDUITE ? AMBRE : undefined }}>
                {l.presence === null ? '—' : `${l.presence} %`}
              </td>
              <td className={`${td} text-right font-semibold`}>{l.ca12Mois > 0 ? euros(l.ca12Mois) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Le mois en quelques mots ────────────────────────────────────────────────

function BandeauDuMois({ prenom, phrases, progres }: {
  prenom: string;
  phrases: string[];
  progres: { participant: Participant; progres: Progres }[];
}) {
  return (
    <section className="rounded-3xl p-6 mt-5 grid gap-5 lg:grid-cols-5 items-center"
      style={{ background: 'linear-gradient(135deg, #E6F5F1 0%, #F3FAF8 60%, #FFFFFF 100%)', border: `1px solid ${VERT_PALE}` }}>
      <div className="lg:col-span-3">
        <div className="flex items-center gap-2 text-sm font-bold" style={{ color: '#147A64' }}>
          <Sparkles size={16} />
          {prenom ? `Bonjour ${prenom}, voici votre mois` : 'Votre mois en quelques mots'}
        </div>
        <div className="mt-2 space-y-1.5">
          {phrases.map((p, i) => (
            <p key={i} className={`m-0 leading-relaxed ${i === 0 ? 'text-[17px] font-semibold text-gray-900' : 'text-[15px]'}`} style={i === 0 ? undefined : { color: '#3D4C5A' }}>{p}</p>
          ))}
        </div>
      </div>
      {progres.length > 0 && (
        <div className="lg:col-span-2">
          <div className="text-xs font-semibold mb-2" style={{ color: ENCRE_2 }}>Ils ont progressé ces 3 derniers mois</div>
          <ul className="list-none m-0 p-0 grid gap-2">
            {progres.map(({ participant: p, progres: g }) => (
              <li key={p.id}>
                <Link to={`/participant/${p.id}/comparaison`} className="flex items-center gap-3 bg-white rounded-2xl px-3.5 py-2.5 no-underline shadow-sm hover:shadow transition-shadow">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: '#E6F5F1', color: VERT_FONCE }}>
                    {(p.prenom?.[0] ?? '?').toUpperCase()}{(p.nom?.[0] ?? '?').toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-800 truncate">
                      <span className="font-semibold">{p.prenom}</span> : <span className="font-extrabold" style={{ color: '#147A64' }}>{g.delta}</span> {g.test}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">{g.sens}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

function dateCourte(jour: string): string {
  return new Date(`${jour}T12:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function moisLong(cle: string): string {
  return MOIS_LONGS[Number(cle.slice(5, 7)) - 1].toLowerCase();
}

export default function StatsPage() {
  const { participants: rawParticipants } = useParticipants();
  const { seances: rawSeances, patientsARelancer } = useAgenda();
  const {
    contratActifDeParticipant, contrats: rawContrats,
    contratsARenouveler: contratsARenouvelerTous, contratsSansJours: contratsSansJoursTous,
  } = useContrats();
  const { statsPro, sauvegarder } = useStatsPro();
  const { lignes: lignesCA } = useCaDouzeMois();
  const { brouillons } = useFacturesAValider();
  const { factures } = useFacturesValidees();
  const { structures } = useStructures();
  const { coursCollectifs } = useCoursCollectifs();
  const [objectifsOuverts, setObjectifsOuverts] = useState(false);

  const participants = rawParticipants ?? [];
  const seances = rawSeances ?? [];
  const contrats = rawContrats ?? [];
  const cours = coursCollectifs ?? [];

  const aujourdhui = dateCivileParis();
  const annee = Number(aujourdhui.slice(0, 4));
  const cleMois = aujourdhui.slice(0, 7);
  const moisIndex = Number(aujourdhui.slice(5, 7)) - 1;
  const clePrec = moisDecale(cleMois, -1);

  // Bénéficiaires suivis (non archivés) pour l'action et le suivi ; le CA et les résultats des
  // bilans gardent tout l'historique.
  const suivis = separerParArchivage(participants).actifs;
  const idsSuivis = new Set(suivis.map(p => p.id));
  const seancesSuivies = seances.filter(s => idsSuivis.has(s.participantId));
  const parId = new Map(participants.map(p => [p.id, p]));
  const nomDe = (id: string) => parId.get(id) ?? null;
  const nomComplet = (id: string) => { const p = parId.get(id); return p ? `${p.prenom} ${p.nom}` : '—'; };

  // ── Argent
  const douzeMois = derniersMois(aujourdhui, 12);
  const ca = calculerCaParMois(lignesCA, brouillons, douzeMois);
  const caCourant = ca[ca.length - 1];
  const caMoisPrec = ca[ca.length - 2];
  const prevues = seances.filter(s => s.statut === 'planifiee' && s.date > aujourdhui && s.date.startsWith(cleMois));
  const debut90 = ajouterJours(aujourdhui, -90);
  const annulees90 = seances.filter(s => s.statut === 'annulee' && s.date >= debut90 && s.date < aujourdhui);
  const tarifs = useTarifsDesContrats([...prevues, ...annulees90].map(s => s.contratId).filter((x): x is string => !!x));
  const valeurPrevue = valeurSeances(prevues, tarifs);
  const finDeMoisEstimee = caCourant.total + valeurPrevue.montant;
  const enc = encaissements(factures, aujourdhui);
  const brouillonsAValider = brouillons.filter(b => b.periode.slice(0, 7) < cleMois);
  const montantAValider = brouillonsAValider.reduce((t, b) => t + b.totalHt, 0);

  // Ce que rapporte une heure : sur les mois terminés (le mois en cours n'est ni fini ni facturé).
  const revenuHoraire = (m: string) => {
    const min = minutesRealisees(seances, cours, `${m}-01`, `${m}-31`);
    const total = ca.find(x => x.mois === m)?.total ?? 0;
    return min > 0 && total > 0 ? total / (min / 60) : null;
  };
  const minutesMoisPrec = minutesRealisees(seances, cours, `${clePrec}-01`, `${clePrec}-31`);
  const horairePrec = revenuHoraire(clePrec);
  const horaireTendance = douzeMois.slice(-7, -1).map(revenuHoraire);

  const sources = sourcesCA(lignesCA, participants, structures);
  const partPremier = partPremierBeneficiaire(lignesCA);

  // ── Temps
  const activite = activiteMoisADate(seances, cours, aujourdhui);
  const ecartMinutes = activite.minutes - activite.minutesMoisPrecedent;
  const sem = calculerSemaines(seances, cours, aujourdhui);
  const presence = presenceRecente(seances, aujourdhui);
  const annul = calculerAnnulations(seances, aujourdhui);
  const manqueAGagner = valeurSeances(annulees90, tarifs);

  // ── Bénéficiaires
  const pf = calculerPortefeuille(contrats, aujourdhui);
  const avecContrat = suivis.filter(p => contratActifDeParticipant(p.id));
  const bilansAJour = avecContrat.filter(p => !bilanAFaire(p.bilans, aujourdhui)).length;

  // Le mois en quelques mots : les progrès RÉCENTS (dernier bilan de moins de 90 jours), pour ne pas
  // répéter l'accueil, qui montre les progrès depuis le bilan initial sans condition de date.
  const progresRecents = suivis
    .filter(p => p.bilans.some(b => b.date.slice(0, 10) >= debut90))
    .map(p => ({ participant: p, progres: progresDepuisInitial(p.bilans) }))
    .filter((x): x is { participant: Participant; progres: Progres } => x.progres !== null);
  const phrases = phrasesDuMois({
    mois: moisLong(cleMois), minutes: activite.minutes, minutesMoisPrecedent: activite.minutesMoisPrecedent,
    realise: caCourant.total, objectif: statsPro.objectifMensuel ?? 0, presence: presence.taux,
    progressent: progresRecents.length, arrivees: pf.arrivees,
  });
  const prenomPraticien = (chargerSettingsPraticien().prenom ?? '').trim();

  // ── À faire : mêmes règles que l'accueil (Dashboard.tsx)
  const contratsARenouveler = contratsDesBeneficiairesActifs(contratsARenouvelerTous, participants);
  const contratsSansJours = contratsDesBeneficiairesActifs(contratsSansJoursTous, participants);
  const groupesAFaire = [
    {
      cle: 'bilans', titre: 'Bilans à faire', couleur: AMBRE, icone: <ClipboardList size={15} />,
      lignes: suivis.filter(p => bilanAFaire(p.bilans, aujourdhui))
        .map(p => ({ id: p.id, nom: `${p.prenom} ${p.nom}`, detail: echeanceBilan(p.bilans, aujourdhui).libelle })),
    },
    {
      cle: 'renouveler', titre: 'Contrats à renouveler', couleur: AMBRE, icone: <FileClock size={15} />,
      lignes: contratsARenouveler.map(c => ({ id: c.participantId, nom: nomComplet(c.participantId), detail: `Fin le ${dateCourte(c.dateFin)}` })),
    },
    {
      cle: 'sansJours', titre: 'Contrats sans jours de séance', couleur: ROUGE, icone: <CalendarX2 size={15} />,
      lignes: contratsSansJours.map(c => ({ id: c.participantId, nom: nomComplet(c.participantId), detail: 'Ne se renouvelle pas' })),
    },
    {
      cle: 'relancer', titre: 'Sans séance depuis 3 semaines', couleur: ENCRE_2, icone: <UserRoundX size={15} />,
      lignes: patientsARelancer(21).filter(p => idsSuivis.has(p.id)).map(p => {
        const derniere = seances.filter(s => s.participantId === p.id && s.statut === 'realisee').map(s => s.date).sort().at(-1);
        return { id: p.id, nom: `${p.prenom} ${p.nom}`, detail: derniere ? `Dernière le ${dateCourte(derniere)}` : 'Aucune séance' };
      }),
    },
  ];

  const lignesStructures = structures.length > 0
    ? parStructure({ structures, suivis, seances, cours, lignes: lignesCA, participants, aujourdhui })
    : [];

  return (
    <PageWrapper>
      {/* ── En-tête ────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-4 mb-2">
        <div>
          <p className="m-0 text-[13px] font-bold" style={{ color: '#147A64' }}>{MOIS_LONGS[moisIndex]} {annee}</p>
          <h1 className="font-heading font-extrabold m-0 mt-0.5 text-gray-900" style={{ fontSize: 28, letterSpacing: '-0.3px' }}>
            Mes statistiques
          </h1>
          <p className="m-0 mt-1 text-sm text-gray-500">
            {pf.actifs} bénéficiaire{pf.actifs > 1 ? 's' : ''} avec un contrat actif
            {structures.length > 0 && <> · {structures.length} structure{structures.length > 1 ? 's' : ''}</>}
          </p>
        </div>
        <FormulaireObjectifs statsPro={statsPro} onSave={sauvegarder} ouvert={objectifsOuverts} setOuvert={setObjectifsOuverts} />
      </header>

      <BandeauDuMois prenom={prenomPraticien} phrases={phrases} progres={progresRecents.slice(0, 3)} />

      {/* ── Chiffres clés ──────────────────────────────────────────── */}
      <TitreSection detail="Montants HT sauf « À encaisser » (TTC)">Ce mois-ci</TitreSection>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ChiffreCle
          libelle={`Réalisé en ${moisLong(cleMois)}`}
          valeur={euros(caCourant.total)}
          detail={
            <>
              Fin de mois estimée : <span className="font-semibold text-gray-700">{euros(finDeMoisEstimee)}</span>
              {valeurPrevue.valorisees > 0 && <> avec {valeurPrevue.valorisees} séance{valeurPrevue.valorisees > 1 ? 's' : ''} prévue{valeurPrevue.valorisees > 1 ? 's' : ''}</>}
              {valeurPrevue.sansTarif > 0 && <span style={{ color: '#B7791F' }}> · {valeurPrevue.sansTarif} sans tarif, non comptée{valeurPrevue.sansTarif > 1 ? 's' : ''}</span>}
            </>
          }
          valeurs={ca.slice(0, -1).map(m => m.total)}
        >
          {statsPro.objectifMensuel > 0
            ? <JaugeObjectif realise={caCourant.total} objectif={statsPro.objectifMensuel} libelle="Objectif du mois" />
            : (
              <button onClick={() => setObjectifsOuverts(true)}
                className="mt-3 self-start inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                <Target size={13} /> Fixer un objectif
              </button>
            )}
        </ChiffreCle>

        <ChiffreCle
          libelle="À encaisser"
          valeur={euros(enc.resteDu)}
          detail={enc.nbAttente > 0
            ? `${enc.nbAttente} facture${enc.nbAttente > 1 ? 's' : ''} émise${enc.nbAttente > 1 ? 's' : ''} non réglée${enc.nbAttente > 1 ? 's' : ''}`
            : 'Toutes vos factures émises sont réglées'}
        >
          <div className="mt-2 space-y-1 text-xs">
            {enc.nbEnRetard > 0 && (
              <Link to="/factures" className="block font-medium hover:underline" style={{ color: ROUGE }}>
                dont {euros(enc.enRetard)} en retard ({enc.nbEnRetard} facture{enc.nbEnRetard > 1 ? 's' : ''})
              </Link>
            )}
            {brouillonsAValider.length > 0 && (
              <Link to="/factures/a-valider" className="block font-medium hover:underline" style={{ color: '#B7791F' }}>
                + {euros(montantAValider)} à valider ({brouillonsAValider.length} brouillon{brouillonsAValider.length > 1 ? 's' : ''})
              </Link>
            )}
            {enc.delaiMoyen !== null && <div className="text-gray-500">Payé en {enc.delaiMoyen} jours en moyenne</div>}
          </div>
        </ChiffreCle>

        <ChiffreCle
          libelle={`Heures de séance en ${moisLong(cleMois)}`}
          valeur={formaterHeures(activite.minutes)}
          detail={
            <>
              {ecartMinutes === 0
                ? 'Autant que le mois dernier à la même date'
                : (
                  <>
                    <span className="font-semibold" style={{ color: ecartMinutes > 0 ? VERT_FONCE : undefined }}>
                      {ecartMinutes > 0 ? '+' : '−'}{formaterHeures(Math.abs(ecartMinutes))}
                    </span>{' '}par rapport au mois dernier à la même date
                  </>
                )}
              {activite.minutesPrevues > 0 && <> · {formaterHeures(activite.minutesPrevues)} encore prévues</>}
            </>
          }
          valeurs={sem.slice(0, -1).map(s => s.heures)}
        />

        <ChiffreCle
          libelle="Ce que rapporte une heure de séance"
          valeur={horairePrec === null ? '—' : `${Math.round(horairePrec)} €/h`}
          detail={horairePrec === null
            ? `Pas assez de données pour ${moisLong(clePrec)}`
            : `En ${moisLong(clePrec)} : ${euros(caMoisPrec.total)} pour ${formaterHeures(minutesMoisPrec)} de séance, trajets non comptés`}
          valeurs={horaireTendance}
        />
      </div>

      <div className="mt-5">
        <SectionAFaire groupes={groupesAFaire} />
      </div>

      {/* ── Factures à envoyer (ancienne ébauche) ──────────────────── */}
      {/* Ancienne ébauche masquée le 2026-10-05 (voir lib/featuresFacturation.ts). Ne pas
          monter SectionFactures suffit à couper aussi sa génération automatique, qui
          écrivait dans factures_suivi à chaque ouverture de cette page. */}
      {EBAUCHE_FACTURATION_VISIBLE && (
        <SectionFactures
          participants={participants}
          seances={seances}
          contrats={contrats}
          contratActif={contratActifDeParticipant}
        />
      )}

      {/* ── Chiffre d'affaires ─────────────────────────────────────── */}
      <TitreSection detail="12 derniers mois, HT">Chiffre d'affaires</TitreSection>
      <div className="grid gap-4 lg:grid-cols-5">
        <Carte
          className="lg:col-span-3"
          titre="Par mois"
          sousTitre={<Legende elements={[
            { libelle: 'Facturé', couleur: VERT },
            { libelle: 'En préparation', couleur: VERT_PALE },
            ...(statsPro.objectifMensuel > 0 ? [{ libelle: 'Objectif mensuel', couleur: AMBRE, pointille: true }] : []),
          ]} />}
          droite={
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-gray-400">Sur 12 mois</div>
              <div className="text-sm font-bold text-gray-900">{euros(ca.reduce((t, m) => t + m.total, 0))}</div>
              {statsPro.objectifAnnuel > 0 && (() => {
                const depuisJanvier = ca.filter(m => m.mois.startsWith(`${annee}-`)).reduce((t, m) => t + m.total, 0);
                return <div className="text-xs text-gray-400">{annee} : {euros(depuisJanvier)} sur {euros(statsPro.objectifAnnuel)} ({Math.round((depuisJanvier / statsPro.objectifAnnuel) * 100)} %)</div>;
              })()}
            </div>
          }
        >
          <ErrorBoundary>
            <GraphiqueCA mois={ca} objectif={statsPro.objectifMensuel ?? 0} moisCourant={cleMois} />
          </ErrorBoundary>
        </Carte>

        <Carte className="lg:col-span-2" titre="D'où il vient" sousTitre="Factures émises, par origine des bénéficiaires">
          <SectionSourcesCA sources={sources} partPremier={partPremier} />
        </Carte>
      </div>

      {/* ── Temps ──────────────────────────────────────────────────── */}
      <TitreSection detail="Séances individuelles et cours collectifs">Votre temps</TitreSection>
      <div className="grid gap-4 lg:grid-cols-5">
        <Carte
          className="lg:col-span-3"
          titre="Heures de séance par semaine"
          sousTitre={<Legende elements={[
            { libelle: 'Réalisées', couleur: VERT }, { libelle: 'Annulées', couleur: ROUGE_PALE }, { libelle: 'Semaine en cours', couleur: VERT_PALE },
          ]} />}
          droite={
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-gray-400">Présence sur 30 jours</div>
              <div className="text-sm font-bold text-gray-900">{presence.taux === null ? '—' : `${presence.taux} %`}</div>
              {presence.nonPointees > 0 && (
                <Link to="/agenda" className="text-xs font-medium hover:underline" style={{ color: '#B7791F' }}>
                  {presence.nonPointees} séance{presence.nonPointees > 1 ? 's' : ''} à pointer
                </Link>
              )}
            </div>
          }
        >
          <ErrorBoundary>
            <GraphiqueTemps semaines={sem} />
          </ErrorBoundary>
        </Carte>

        <Carte className="lg:col-span-2" titre="Annulations" sousTitre="Séances individuelles des 90 derniers jours">
          <SectionAnnulations a={annul} manqueAGagner={manqueAGagner} />
        </Carte>
      </div>

      {/* ── Bénéficiaires ──────────────────────────────────────────── */}
      <TitreSection detail="Bénéficiaires suivis">Vos bénéficiaires</TitreSection>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Carte titre="Portefeuille" sousTitre="Sur les 90 derniers jours">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Mini libelle="Contrat actif" valeur={String(pf.actifs)} />
            <Mini libelle="Ancienneté moyenne" valeur={pf.ancienneteMois === null ? '—' : `${pf.ancienneteMois} mois`} />
            <Mini libelle="Arrivées" valeur={`+${pf.arrivees}`} ton={pf.arrivees > 0 ? VERT_FONCE : undefined} detail="premier contrat" />
            <Mini libelle="Fins de suivi" valeur={String(pf.departs)} detail="dernier contrat terminé" />
          </div>
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-gray-600">Bilans à jour (moins de 85 jours)</span>
              <span className="font-semibold text-gray-800">{bilansAJour} sur {avecContrat.length}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: GRIS }}>
              <div className="h-full rounded-full" style={{ width: `${avecContrat.length > 0 ? (bilansAJour / avecContrat.length) * 100 : 0}%`, background: VERT }} />
            </div>
          </div>
        </Carte>

        <Carte titre="Assiduité à surveiller" sousTitre={`Moins de ${SEUIL_ASSIDUITE} % de présence sur 90 jours`}>
          <ErrorBoundary>
            <SectionAssiduite lignes={assiduiteParBeneficiaire(seancesSuivies, aujourdhui)} nomDe={nomDe} />
          </ErrorBoundary>
        </Carte>

        <Carte titre="Résultats des bilans" sousTitre="Entre le premier et le dernier bilan de chaque bénéficiaire">
          <ErrorBoundary>
            <SectionResultats participants={participants} />
          </ErrorBoundary>
        </Carte>
      </div>

      {/* ── Structures ─────────────────────────────────────────────── */}
      {lignesStructures.length > 0 && (
        <>
          <TitreSection detail="Pour rendre compte à chaque structure">Par structure</TitreSection>
          <Carte titre="Activité par origine" sousTitre="Heures et cours du mois en cours, présence sur 90 jours, CA facturé sur 12 mois" className="mb-5">
            <TableauStructures lignes={lignesStructures} />
          </Carte>
        </>
      )}
    </PageWrapper>
  );
}
