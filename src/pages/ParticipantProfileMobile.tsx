import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import {
  ArrowLeft, Pencil, Phone, Navigation, ClipboardList, Mic,
  TrendingUp, FileText, NotebookPen, ChevronDown, ChevronUp, X, Trash2,
} from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import { useContrats } from '../hooks/useContrats';
import { useAgenda } from '../hooks/useAgenda';
import { useJournalSeance } from '../hooks/useJournalSeance';
import { useCompteRenduSeance } from '../hooks/useCompteRenduSeance';
import { getBrouillon } from '../hooks/useBrouillonBilan';
import DicteePostSeance from '../components/DicteePostSeance';
import ParticipantForm from '../components/participant/ParticipantForm';
import ModalEspacePatient from '../components/participant/ModalEspacePatient';
import NoteSeanceModal from '../components/journal/NoteSeanceModal';
import { RESSENTI_CONFIG } from '../components/journal/NoteSeanceModal';
import { exportFichePatientPDF } from '../utils/exportFichePatientPDF';
import { TAG_CONFIG } from '../data/profiles';
import { toast } from 'sonner';
import type { Bilan, Participant, RessentiSeance } from '../types';
import { TYPES_ANTECEDENT_LABELS } from '../types';
import { getContreIndications } from '../lib/anamnese';
import type { CompteRenduSeance } from '../types/seance';

// ── Constants & helpers ───────────────────────────────────────────────────────

type MobileTab = 'infos' | 'sante' | 'bilans' | 'journal';
type DotColor  = 'vert' | 'orange' | 'rouge';

const DOT_STYLE: Record<DotColor, { bg: string; label: string }> = {
  vert:   { bg: '#4CAF50', label: 'Ok' },
  orange: { bg: '#E8951A', label: 'Surveiller' },
  rouge:  { bg: '#E24B4A', label: 'Difficile' },
};

const MOBILE_TESTS: { label: string; unite: string; getVal: (b: Bilan) => number | null | undefined; getColor: (v: number) => DotColor }[] = [
  { label: 'TUG 3m',     unite: 's',     getVal: b => b.tug3m,                  getColor: v => v < 12 ? 'vert' : v <= 20 ? 'orange' : 'rouge' },
  { label: 'Chair Stand', unite: ' rép.', getVal: b => b.chairStand30,           getColor: v => v >= 10 ? 'vert' : v >= 6 ? 'orange' : 'rouge' },
  { label: 'HandGrip D', unite: ' kg',   getVal: b => b.handGrip.droite,        getColor: v => v >= 16 ? 'vert' : v >= 8 ? 'orange' : 'rouge' },
  { label: 'Équilibre D', unite: 's',    getVal: b => b.equilibre.droite,       getColor: v => v > 10 ? 'vert' : v >= 5 ? 'orange' : 'rouge' },
  { label: 'Souplesse',  unite: ' cm',   getVal: b => b.souplesse.valeur,       getColor: v => v > 5 ? 'vert' : v >= -5 ? 'orange' : 'rouge' },
  { label: 'Borg RPE',   unite: '',      getVal: b => b.tm6.borgRPE,            getColor: v => (v >= 9 && v <= 13) ? 'vert' : v <= 16 ? 'orange' : 'rouge' },
  { label: 'TM6',        unite: ' m',    getVal: b => b.tm6.distanceMetres,     getColor: v => v >= 500 ? 'vert' : v >= 300 ? 'orange' : 'rouge' },
  { label: 'Mémoire',    unite: '/5',    getVal: b => b.memoire.scoreImmediat,  getColor: v => v >= 4 ? 'vert' : v >= 3 ? 'orange' : 'rouge' },
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

function imcLabel(imc: number): { label: string; bg: string; color: string } {
  if (imc < 18.5) return { label: 'Insuffisance', bg: '#FEE2E2', color: '#DC2626' };
  if (imc < 25)   return { label: 'Normal',        bg: '#DCFCE7', color: '#16A34A' };
  if (imc < 30)   return { label: 'Surpoids',      bg: '#FEF3C7', color: '#D97706' };
  return               { label: 'Obésité',         bg: '#FEE2E2', color: '#DC2626' };
}

function formatDateCourt(date: string): string {
  return new Date(date + 'T12:00').toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function formatDateShort(date: string): string {
  return new Date(date + 'T12:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function loadSettings() {
  try { return { prenom: '', nom: '', titre: '', email: '', telephone: '', societe: '', logoPraticien: '', ...JSON.parse(localStorage.getItem('settings_praticien') || '{}') }; }
  catch { return { prenom: '', nom: '', titre: '', email: '', telephone: '', societe: '', logoPraticien: '' }; }
}

// ── InfoRow (onglet Infos) ────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline py-2 border-b border-gray-100 last:border-0">
      <span className="text-[12px] text-gray-400 w-[110px] flex-shrink-0">{label}</span>
      <span className="text-[13px] text-gray-800 flex-1">{value}</span>
    </div>
  );
}

// ── MobileCard ────────────────────────────────────────────────────────────────

function MobileCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/60 mb-3 overflow-hidden">
      {title && (
        <div className="px-4 pt-3 pb-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{title}</span>
        </div>
      )}
      <div className="px-4 pb-3">
        {children}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ParticipantProfileMobile() {
  const { id } = useParams<{ id: string }>();
  const { participants, updateParticipant, deleteParticipant } = useParticipants();
  const { contrats } = useContrats();
  const { seances } = useAgenda();
  const { notesParPatient } = useJournalSeance();
  const navigate = useNavigate();
  const settings = loadSettings();

  const [activeTab, setActiveTab]           = useState<MobileTab>('infos');
  const [showEdit, setShowEdit]             = useState(false);
  const [confirmDelete, setConfirmDelete]   = useState(false);
  const [showNoteModal, setShowNoteModal]   = useState(false);
  const [showDictee, setShowDictee]         = useState(false);
  const [showEspacePatient, setShowEspacePatient] = useState(false);
  const [exportingPDF, setExportingPDF]     = useState(false);
  const [expandedIds, setExpandedIds]       = useState<Set<string>>(new Set());

  const participant = participants.find(p => p.id === id);
  const { compteRendus, ajouterCompteRendu } = useCompteRenduSeance(participant?.id ?? '');

  if (!participant) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">
      Participant introuvable
    </div>
  );

  const sortedBilans   = [...participant.bilans].sort((a, b) => a.date.localeCompare(b.date));
  const bilanInitial   = participant.bilans.find(b => b.type === 'initial') ?? null;
  const contreIndicationsTexte: string | null = getContreIndications(participant, bilanInitial).detail;
  const latestBilan    = sortedBilans[sortedBilans.length - 1] ?? null;
  const contratActif   = contrats.find(c => c.participantId === participant.id && c.statut === 'actif') ?? null;
  const notes          = notesParPatient(participant.id);
  const age            = calcAge(participant.dateNaissance);
  const today          = new Date().toISOString().slice(0, 10);
  const imc            = participant.taille && participant.poids
    ? Math.round((participant.poids / ((participant.taille / 100) ** 2)) * 10) / 10 : null;
  const prochaineSeance = seances
    .filter(s => s.participantId === participant.id && s.statut === 'planifiee' && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  const hasAddress     = Boolean(participant.adresseRue?.trim() && participant.adresseVille?.trim());
  const adresseComplete = hasAddress
    ? `${participant.adresseRue}, ${participant.adresseCodePostal} ${participant.adresseVille}`
    : '';
  const brouillon      = getBrouillon(participant.id);
  const joursDepuisBilan = latestBilan
    ? Math.floor((Date.now() - new Date(latestBilan.date).getTime()) / 86400000) : Infinity;

  function toggleExpanded(entryId: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(entryId) ? next.delete(entryId) : next.add(entryId);
      return next;
    });
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

  function handleEditSubmit(data: Omit<Participant, 'id' | 'token' | 'bilans'>) {
    updateParticipant(participant!.id, data);
    setShowEdit(false);
    toast.success('Fiche mise à jour !');
  }

  // Fused journal entries sorted by date desc
  type JournalEntry =
    | { type: 'note';   date: string; data: import('../types').NoteSeance }
    | { type: 'dictee'; date: string; data: CompteRenduSeance };

  const journalEntries: JournalEntry[] = [
    ...notes.map(n  => ({ type: 'note'   as const, date: n.date,       data: n  })),
    ...compteRendus.map(cr => ({ type: 'dictee' as const, date: cr.dateSeance, data: cr })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const TABS: { id: MobileTab; label: string }[] = [
    { id: 'infos',   label: 'Infos'   },
    { id: 'sante',   label: 'Santé'   },
    { id: 'bilans',  label: 'Bilans'  },
    { id: 'journal', label: 'Journal' },
  ];

  // ── TAB CONTENT ──────────────────────────────────────────────────────────────

  function TabInfos() {
    if (!participant) return null;
    return (
      <div className="pb-8">
        {(participant.telephone || participant.email || hasAddress) && (
          <MobileCard title="Coordonnées">
            <div className="space-y-0">
              {participant.telephone && (
                <a
                  href={`tel:${participant.telephone}`}
                  className="flex items-center gap-3 py-2.5 border-b border-gray-100"
                >
                  <Phone size={14} style={{ color: 'var(--color-teal)', flexShrink: 0 }} />
                  <span className="text-[13px] text-gray-800 flex-1 min-w-0 break-all">{participant.telephone}</span>
                </a>
              )}
              {hasAddress && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(adresseComplete)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0"
                >
                  <Navigation size={14} style={{ color: 'var(--color-teal)', flexShrink: 0 }} />
                  <span className="text-[13px] text-gray-800">{adresseComplete}</span>
                </a>
              )}
              {participant.email && (
                <a
                  href={`mailto:${participant.email}`}
                  className="flex items-center gap-3 py-2.5 last:border-0"
                >
                  <span style={{ color: 'var(--color-teal)', fontSize: 14, flexShrink: 0 }}>✉️</span>
                  <span className="text-[13px] text-gray-800">{participant.email}</span>
                </a>
              )}
            </div>
          </MobileCard>
        )}

        <MobileCard title="Informations">
          <InfoRow label="Date naissance" value={new Date(participant.dateNaissance).toLocaleDateString('fr-FR')} />
          <InfoRow label="Âge calculé" value={`${age} ans`} />
          {participant.taille && <InfoRow label="Taille" value={`${participant.taille} cm`} />}
          {participant.poids && <InfoRow label="Poids" value={`${participant.poids} kg`} />}
          {imc && (
            <div className="flex items-baseline py-2 border-b border-gray-100">
              <span className="text-[12px] text-gray-400 w-[110px] flex-shrink-0">IMC</span>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-gray-800">{imc}</span>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: imcLabel(imc).bg, color: imcLabel(imc).color }}
                >
                  {imcLabel(imc).label}
                </span>
              </div>
            </div>
          )}
          {participant.medecinTraitant && <InfoRow label="Médecin traitant" value={participant.medecinTraitant} />}
          {!participant.rgpd?.consentementObtenu && (
            <button
              onClick={() => setShowEdit(true)}
              className="mt-2 w-full flex items-center justify-center gap-1.5 border rounded-lg py-2 text-[13px] font-medium"
              style={{ borderColor: '#E24B4A', color: '#E24B4A' }}
            >
              ⚠️ RGPD manquant — Régulariser
            </button>
          )}
        </MobileCard>

        {/* Contrat actif */}
        {!contratActif && (
          <MobileCard title="Suivi en cours">
            <div className="flex flex-col items-center py-4 text-center gap-2">
              <p className="text-[13px] text-gray-500">Aucun contrat actif</p>
              <p className="text-[12px] text-gray-400">Créez un contrat pour définir les jours d'intervention</p>
              <button
                onClick={() => navigate(`/participant/${id}/contrat/nouveau`)}
                className="mt-1 text-[13px] font-semibold px-4 py-2 rounded-lg border"
                style={{ borderColor: 'var(--color-teal)', color: 'var(--color-teal)' }}
              >
                + Créer un contrat
              </button>
            </div>
          </MobileCard>
        )}
        {contratActif && (
          <MobileCard title="Suivi en cours">
            <div className="text-[13px] text-gray-600 space-y-1 pt-1">
              <div>📅 {contratActif.joursFixe.join(' + ')} · {contratActif.heureDebut} · {contratActif.dureeMinutes} min</div>
              <div>
                Séances : <strong className="text-gray-800">{contratActif.nombreSeancesRealisees}/{contratActif.nombreSeancesTotal}</strong>
              </div>
              <div className="h-1 bg-gray-100 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.round(contratActif.nombreSeancesRealisees / contratActif.nombreSeancesTotal * 100))}%`,
                    background: 'var(--color-teal)',
                  }}
                />
              </div>
              {prochaineSeance && (
                <div className="mt-2 text-[12px]" style={{ color: 'var(--color-teal)' }}>
                  📆 Prochain RDV : {formatDateCourt(prochaineSeance.date)} · {prochaineSeance.heureDebut}
                </div>
              )}
              {(() => {
                const j = differenceInDays(new Date(contratActif.dateFin), new Date());
                if (j <= 14 && j >= 0) return (
                  <div className="mt-1 text-[12px] font-semibold text-amber-600">
                    ⏰ Contrat se termine dans {j} jour{j > 1 ? 's' : ''}
                  </div>
                );
                return null;
              })()}
            </div>
          </MobileCard>
        )}
      </div>
    );
  }

  function TabSante() {
    if (!participant) return null;
    const lignes = [
      participant.pathologie && { icon: '🏥', label: 'Pathologie', texte: participant.pathologie },
      participant.antecedentsMedicaux && { icon: '📋', label: 'Antécédents médicaux', texte: participant.antecedentsMedicaux },
      participant.antecedentsChirurgicaux && { icon: '✂️', label: 'Antécédents chirurgicaux', texte: participant.antecedentsChirurgicaux },
      participant.allergies && { icon: '⚠️', label: 'Allergies', texte: participant.allergies },
    ].filter(Boolean) as { icon: string; label: string; texte: string }[];

    const traitementsActifs = (participant.traitements ?? []).filter(t => !t.date_fin);
    const traitementsArretes = (participant.traitements ?? []).filter(t => t.date_fin);
    const antecedents = participant.antecedentsMedicauxStructures ?? [];

    const profil = bilanInitial?.profilEnrichi;
    const profilLignes = [
      profil?.douleursNiveau != null && { label: 'Douleur habituelle', texte: `${profil.douleursNiveau}/10` },
      profil?.douleursLocalisation && { label: 'Localisation douleur', texte: profil.douleursLocalisation },
      profil?.chutes12mois != null && { label: 'Chutes / 12 mois', texte: String(profil.chutes12mois) },
      profil?.objectifsPersonnels && { label: 'Objectifs', texte: profil.objectifsPersonnels },
    ].filter(Boolean) as { label: string; texte: string }[];

    return (
      <div className="pb-8">
        <MobileCard title="Pathologies & traitements">
          {lignes.length > 0 ? (
            <div className="space-y-2 pt-1">
              {lignes.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <span className="flex-shrink-0">{l.icon}</span>
                  <div>
                    <div className="text-[11px] text-gray-400 uppercase tracking-wide">{l.label}</div>
                    <div className="text-[13px] text-gray-700 leading-relaxed">{l.texte}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-gray-400 italic pt-1">Aucune pathologie renseignée</p>
          )}

          {/* Traitements structurés */}
          {(traitementsActifs.length > 0 || traitementsArretes.length > 0) && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Traitements en cours</div>
              {traitementsActifs.length > 0 ? (
                <div className="space-y-2">
                  {traitementsActifs.map(t => (
                    <div key={t.id} className="flex items-start gap-2 text-[13px]">
                      <span>💊</span>
                      <div className="flex-1">
                        <span className="font-medium text-gray-700">{t.nom}</span>
                        {t.dose && <span className="text-gray-400"> · {t.dose}</span>}
                        {t.effetSecondaire && <div className="text-[12px] text-gray-400">{t.effetSecondaire}</div>}
                      </div>
                      <span className="text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">En cours ✅</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-gray-400 italic">Aucun traitement en cours</p>
              )}
              {traitementsArretes.length > 0 && (
                <details className="mt-2">
                  <summary className="text-[12px] text-gray-400 font-medium cursor-pointer list-none flex items-center gap-1">
                    ▶ Traitements arrêtés ({traitementsArretes.length})
                  </summary>
                  <div className="mt-1.5 space-y-1">
                    {traitementsArretes.map(t => (
                      <div key={t.id} className="flex items-center gap-2 text-[12px] text-gray-400">
                        <span>💊</span>
                        <span className="line-through">{t.nom}</span>
                        <span className="ml-auto text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          Arrêté le {new Date((t.date_fin ?? '') + 'T12:00').toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Antécédents structurés */}
          {antecedents.length > 0 && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Antécédents</div>
              <div className="space-y-2">
                {antecedents.map(a => (
                  <div key={a.id}>
                    <div className="flex items-center gap-2 text-[13px]">
                      <span>🩺</span>
                      <span className="font-medium text-gray-700">{TYPES_ANTECEDENT_LABELS[a.type] ?? a.type}</span>
                      {a.date && <span className="text-gray-400 text-[12px]">· {a.date}</span>}
                      {a.douleur === 'oui' && <span className="text-[10px] text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">Douleur liée</span>}
                    </div>
                    {a.notes && <p className="text-[12px] text-gray-400 ml-5 mt-0.5 italic">{a.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </MobileCard>

        <MobileCard title="Contre-indications à l'effort">
          {contreIndicationsTexte ? (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2 mt-1" style={{ background: '#FCEBEB' }}>
              <span className="flex-shrink-0">⚠️</span>
              <p className="text-[13px] leading-relaxed" style={{ color: '#A32D2D' }}>{contreIndicationsTexte}</p>
            </div>
          ) : (
            <p className="text-[13px] text-gray-400 italic pt-1">Aucune contre-indication renseignée</p>
          )}
        </MobileCard>

        {profilLignes.length > 0 && (
          <MobileCard title="Profil de vie">
            {profilLignes.map((l, i) => (
              <InfoRow key={i} label={l.label} value={l.texte} />
            ))}
          </MobileCard>
        )}
      </div>
    );
  }

  function TabBilans() {
    if (!participant) return null;
    return (
      <div className="pb-8">
        {/* Profil fonctionnel - dernier bilan */}
        {latestBilan && (
          <MobileCard title={`Profil fonctionnel · ${formatDateShort(latestBilan.date)}`}>
            <div className="space-y-0 pt-1">
              {MOBILE_TESTS.map(test => {
                const val = test.getVal(latestBilan);
                if (val === null || val === undefined) return null;
                const dot = test.getColor(val);
                const valDisplay = `${test.label === 'Souplesse' && val > 0 ? '+' : ''}${val}${test.unite}`;
                return (
                  <div key={test.label} className="flex items-center py-2 border-b border-gray-100 last:border-0">
                    <span className="text-[13px] text-gray-500 w-[96px] flex-shrink-0">{test.label}</span>
                    <span className="text-[13px] font-semibold text-gray-800 flex-1">{valDisplay}</span>
                    <span
                      className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                      style={{ background: DOT_STYLE[dot].bg }}
                      title={DOT_STYLE[dot].label}
                    />
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex gap-4 pt-3 mt-1 border-t border-gray-100">
              {(['vert', 'orange', 'rouge'] as DotColor[]).map(d => (
                <span key={d} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  <span className="w-[6px] h-[6px] rounded-full" style={{ background: DOT_STYLE[d].bg }} />
                  {DOT_STYLE[d].label}
                </span>
              ))}
            </div>
          </MobileCard>
        )}

        {/* Historique bilans */}
        <div className="mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-2 px-1">
            Historique bilans
          </div>
          {sortedBilans.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200/60 p-6 text-center text-[13px] text-gray-400">
              Aucun bilan enregistré
            </div>
          ) : (
            <div className="space-y-2">
              {[...sortedBilans].reverse().map((bilan, i) => {
                const scores: string[] = [];
                if (bilan.tug3m != null)              scores.push(`TUG ${bilan.tug3m}s`);
                if (bilan.handGrip.droite != null)    scores.push(`Grip ${bilan.handGrip.droite}kg`);
                if (bilan.chairStand30 != null)       scores.push(`CS ${bilan.chairStand30}`);
                if (bilan.tm6.borgRPE != null)        scores.push(`Borg ${bilan.tm6.borgRPE}`);
                return (
                  <div key={bilan.id} className="bg-white rounded-xl border border-gray-200/60 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] font-medium text-gray-800">{formatDateShort(bilan.date)}</span>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: bilan.type === 'initial' ? '#E1F5EE' : '#F3F4F6',
                          color: bilan.type === 'initial' ? '#0F6E56' : '#6B7280',
                        }}
                      >
                        {bilan.type === 'initial' ? 'Initial' : `T${bilan.trimestre}`}
                        {i === 0 && bilan.interpretationIA && ' · IA'}
                      </span>
                    </div>
                    {scores.length > 0 && (
                      <p className="text-[12px] text-gray-500 mb-1.5">
                        {scores.join(' · ')}
                      </p>
                    )}
                    <button
                      onClick={() => navigate(`/participant/${id}/bilan/${bilan.id}`)}
                      className="text-[12px] font-medium"
                      style={{ color: 'var(--color-teal)' }}
                    >
                      Voir le détail →
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {brouillon && (
          <button
            onClick={() => navigate(`/participant/${id}/bilan/new`)}
            className="w-full flex items-center justify-center gap-1.5 border rounded-xl py-2.5 text-[13px] font-semibold mb-3"
            style={{ borderColor: 'var(--color-teal)', color: 'var(--color-teal)' }}
          >
            📋 Reprendre le bilan en cours ({brouillon.completionPct}%)
          </button>
        )}

        <button
          onClick={() => navigate(`/participant/${id}/bilan/new`)}
          className="w-full flex items-center justify-center gap-1.5 border rounded-xl py-3 text-[13px] font-semibold"
          style={{ borderColor: 'var(--color-teal)', color: 'var(--color-teal)', minHeight: 44 }}
        >
          ➕ Nouveau bilan
        </button>
      </div>
    );
  }

  function TabJournal() {
    if (!participant) return null;
    return (
      <div className="pb-8">
        {/* Grand bouton dictée */}
        <button
          onClick={() => setShowDictee(true)}
          className="w-full flex flex-col items-center justify-center gap-1 rounded-xl mb-2 text-white"
          style={{ background: 'var(--color-teal)', minHeight: 64, borderRadius: 12 }}
        >
          <div className="flex items-center gap-2">
            <Mic size={20} />
            <span className="text-[14px] font-bold">DICTER UNE SÉANCE</span>
          </div>
          <span className="text-[12px] opacity-90">Claude structure automatiquement</span>
        </button>

        {/* Lien saisie manuelle */}
        <div className="text-center mb-4">
          <button
            onClick={() => setShowNoteModal(true)}
            className="text-[13px] font-medium"
            style={{ color: 'var(--color-teal)' }}
          >
            ou ✏️ Saisir manuellement
          </button>
        </div>

        {/* Liste journal fusionné */}
        {journalEntries.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200/60 py-8 text-center">
            <div className="text-3xl mb-2">🎙️</div>
            <p className="text-[13px] font-medium text-gray-600 mb-1">Aucune note</p>
            <p className="text-[12px] text-gray-400">Dictez votre première séance</p>
          </div>
        ) : (
          <div className="space-y-2">
            {journalEntries.map(entry => {
              const expanded = expandedIds.has(entry.data.id);

              if (entry.type === 'note') {
                const n = entry.data;
                const r = n.ressenti ? RESSENTI_CONFIG[n.ressenti as RessentiSeance] : null;
                return (
                  <div key={n.id} className="bg-white rounded-xl border border-gray-200/60 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold text-gray-700">{formatDateCourt(n.date)}</span>
                      <div className="flex items-center gap-2">
                        {r && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                            style={{ background: r.color }}>{r.label}</span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">✏️ Manuelle</span>
                      </div>
                    </div>
                    {n.note && (
                      <p className={`text-[13px] text-gray-600 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                        {n.note}
                      </p>
                    )}
                    {n.note && n.note.length > 100 && (
                      <button
                        onClick={() => toggleExpanded(n.id)}
                        className="mt-1.5 flex items-center gap-0.5 text-[12px] text-gray-400"
                      >
                        {expanded ? <><ChevronUp size={12} /> Réduire</> : <><ChevronDown size={12} /> Voir complet</>}
                      </button>
                    )}
                  </div>
                );
              }

              const cr = entry.data;
              const prog = cr.progression ? PROGRESSION_CONFIG[cr.progression] : null;
              const humeurEmoji = cr.humeurPatient ? HUMEUR_EMOJI[cr.humeurPatient] : null;
              return (
                <div key={cr.id} className="bg-white rounded-xl border border-gray-200/60 px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-gray-700">
                        {new Date(cr.dateSeance + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </span>
                      {cr.dureeMinutes && <span className="text-[11px] text-gray-400">{cr.dureeMinutes} min</span>}
                      {humeurEmoji && <span className="text-[14px]">{humeurEmoji}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {prog && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: `${prog.color}18`, color: prog.color }}>
                          {prog.emoji}
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">🎙️ Dictée</span>
                    </div>
                  </div>
                  {cr.exercicesRealises.length > 0 && (
                    <p className="text-[12px] text-gray-500 mb-1">
                      🏋️ {cr.exercicesRealises.map(e => e.nom).filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {cr.observations && (
                    <p className={`text-[13px] text-gray-600 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                      {cr.observations}
                    </p>
                  )}
                  {cr.pointsAttention && (
                    <p className="text-[12px] text-amber-600 mt-1">⚠️ {cr.pointsAttention}</p>
                  )}
                  {cr.observations && cr.observations.length > 100 && (
                    <button
                      onClick={() => toggleExpanded(cr.id)}
                      className="mt-1.5 flex items-center gap-0.5 text-[12px] text-gray-400"
                    >
                      {expanded ? <><ChevronUp size={12} /> Réduire</> : <><ChevronDown size={12} /> Voir complet</>}
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

  // ── RENDER ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#F0F4F4', minHeight: '100vh' }}>

      {/* ── HEADER #0D2B2B ──────────────────────────────────── */}
      <div style={{ background: 'var(--color-ink)', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>

        {/* Retour */}
        <div className="px-4 pb-2">
          <Link to="/" className="inline-flex items-center gap-1" style={{ color: '#9FE1CB', fontSize: 12 }}>
            <ArrowLeft size={14} /> Mes patients
          </Link>
        </div>

        {/* Identité */}
        <div className="px-4 pb-3 flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
            style={{ background: 'var(--color-teal)', fontSize: 15 }}
          >
            {participant.prenom[0]}{participant.nom[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-white font-medium" style={{ fontSize: 16 }}>
                {participant.prenom} {participant.nom}
              </h1>
              <button
                onClick={() => setShowEdit(true)}
                className="p-1.5 rounded-lg flex-shrink-0 transition-colors hover:bg-white/10"
                style={{ color: '#9FE1CB' }}
              >
                <Pencil size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-x-2 mt-0.5" style={{ color: '#9FE1CB', fontSize: 12 }}>
              <span>{age} ans</span>
              {participant.taille && <span>· {participant.taille} cm</span>}
              {participant.poids && <span>· {participant.poids} kg</span>}
              {imc && <span>· IMC {imc}</span>}
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {contreIndicationsTexte && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#FCEBEB', color: '#A32D2D' }}>
              ⚠️ Contre-ind.
            </span>
          )}
          {(participant.tags?.includes('chronique') || participant.pathologie) && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#E1F5EE', color: '#0F6E56' }}>
              {participant.pathologie ? participant.pathologie.slice(0, 24) + (participant.pathologie.length > 24 ? '…' : '') : 'Pathologie chronique'}
            </span>
          )}
          {latestBilan && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#1D4040', color: '#9FE1CB' }}>
              Bilan : {new Date(latestBilan.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {joursDepuisBilan > 85 && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#1D4040', color: '#F59E0B' }}>
              ⏰ {joursDepuisBilan}j sans bilan
            </span>
          )}
          {brouillon && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#1D4040', color: '#9FE1CB' }}>
              📋 Bilan {brouillon.completionPct}%
            </span>
          )}
          {participant.tags?.filter(t => t !== 'chronique').map(tag => (
            <span key={tag} className="text-[11px] font-medium px-2 py-0.5 rounded-full text-white"
              style={{ background: TAG_CONFIG[tag].color }}>
              {TAG_CONFIG[tag].emoji} {TAG_CONFIG[tag].label}
            </span>
          ))}
        </div>

        {/* 3 boutons terrain */}
        <div className="px-4 pb-4 flex gap-2">
          {participant.telephone ? (
            <a
              href={`tel:${participant.telephone}`}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium"
              style={{ background: '#1D4040', color: '#9FE1CB', height: 36 }}
            >
              <Phone size={13} style={{ color: 'var(--color-teal)' }} /> Appeler
            </a>
          ) : (
            <div className="flex-1 flex items-center justify-center gap-1.5 rounded-lg text-[12px] opacity-40"
              style={{ background: '#1D4040', color: '#9FE1CB', height: 36 }}>
              <Phone size={13} style={{ color: 'var(--color-teal)' }} /> Appeler
            </div>
          )}
          {hasAddress ? (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(adresseComplete)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium"
              style={{ background: '#1D4040', color: '#9FE1CB', height: 36 }}
            >
              <Navigation size={13} style={{ color: 'var(--color-teal)' }} /> Itinéraire
            </a>
          ) : (
            <div className="flex-1 flex items-center justify-center gap-1.5 rounded-lg text-[12px] opacity-40"
              style={{ background: '#1D4040', color: '#9FE1CB', height: 36 }}>
              <Navigation size={13} style={{ color: 'var(--color-teal)' }} /> Itinéraire
            </div>
          )}
          <button
            onClick={() => setShowEspacePatient(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg text-[12px] font-bold"
            style={{ background: 'var(--color-teal)', color: 'white', height: 36 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h7v7"/></svg>
            QR
          </button>
        </div>
      </div>

      {/* ── BARRE ACTIONS SECONDAIRES ───────────────────────── */}
      <div className="bg-white border-b overflow-x-auto" style={{ borderColor: '#E5E7EB' }}>
        <div className="flex gap-2 px-3 py-2" style={{ width: 'max-content' }}>
          {[
            { icon: <Mic size={13} style={{ color: 'var(--color-teal)' }} />,    label: 'Dicter',    action: () => setShowDictee(true) },
            { icon: <TrendingUp size={13} className="text-gray-500" />, label: 'Évolution', action: () => { if (participant.bilans.length >= 2) navigate(`/participant/${id}/comparaison`); else toast('Nécessite 2 bilans'); } },
            { icon: <FileText size={13} className="text-gray-500" />,   label: exportingPDF ? 'PDF…' : 'PDF', action: handleExportFiche },
            { icon: <NotebookPen size={13} className="text-gray-500" />,label: 'Note',      action: () => setShowNoteModal(true) },
            { icon: <ClipboardList size={13} className="text-gray-500" />, label: 'Contrat', action: () => navigate(`/participant/${id}/contrat/nouveau`) },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.action}
              disabled={exportingPDF && btn.label.startsWith('PDF')}
              className="flex items-center gap-1 border border-gray-200 rounded-lg text-[12px] text-gray-600 flex-shrink-0 disabled:opacity-50"
              style={{ height: 34, padding: '0 12px' }}
            >
              {btn.icon} {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── ONGLETS ─────────────────────────────────────────── */}
      <div className="bg-white border-b overflow-x-auto sticky top-0 z-20" style={{ borderColor: '#E5E7EB' }}>
        <div className="flex" style={{ width: 'max-content' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-[14px] py-[10px] text-[13px] flex-shrink-0 relative transition-colors"
              style={{
                color: activeTab === tab.id ? 'var(--color-teal)' : '#6B7280',
                fontWeight: activeTab === tab.id ? 500 : 400,
                borderBottom: activeTab === tab.id ? '2px solid #2BBFBF' : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENU ONGLET ──────────────────────────────────── */}
      <div className="px-3 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        {activeTab === 'infos'   && <TabInfos />}
        {activeTab === 'sante'   && <TabSante />}
        {activeTab === 'bilans'  && <TabBilans />}
        {activeTab === 'journal' && <TabJournal />}
      </div>

      {/* ── MODALS ──────────────────────────────────────────── */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 z-[1100] flex flex-col justify-end">
          <div className="bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="font-bold text-gray-900">Modifier la fiche</h2>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-4">
              <ParticipantForm initial={participant} onSubmit={handleEditSubmit} onCancel={() => setShowEdit(false)} />
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-[1100] flex items-end">
          <div className="bg-white rounded-t-2xl w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <Trash2 size={20} className="text-red-500 flex-shrink-0" />
              <h2 className="font-bold text-gray-900">Supprimer ce patient ?</h2>
            </div>
            <p className="text-[13px] text-gray-600 mb-4">
              Supprimer <strong>{participant.prenom} {participant.nom}</strong> et toutes ses données ? Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-[13px] font-medium">
                Annuler
              </button>
              <button
                onClick={() => {
                  deleteParticipant(participant.id);
                  toast.success('Patient supprimé.');
                  navigate('/');
                }}
                style={{ backgroundColor: '#E24B4A', color: 'white', border: 'none' }}
                className="flex-1 py-3 rounded-xl text-[13px] font-semibold hover:opacity-90 transition-opacity">
                Supprimer
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

      {showDictee && (
        <DicteePostSeance
          participant={participant}
          onClose={() => setShowDictee(false)}
          onSave={async (data) => { await ajouterCompteRendu(data); }}
        />
      )}

      {showEspacePatient && (
        <ModalEspacePatient
          participant={participant}
          onClose={() => setShowEspacePatient(false)}
        />
      )}

    </div>
  );
}
