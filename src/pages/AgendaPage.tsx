import { useState, useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useAgenda } from '../hooks/useAgenda';
import { useContrats } from '../hooks/useContrats';
import { useParticipants } from '../hooks/useParticipants';
import PageWrapper from '../components/layout/PageWrapper';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Trash2, MapPin, ExternalLink, RotateCcw, Check, NotebookPen } from 'lucide-react';
import NoteSeanceModal from '../components/journal/NoteSeanceModal';
import { toast } from 'sonner';
import type { Seance, TypeSeance, StatutSeance } from '../types';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { fr },
});

const TODAY = new Date().toISOString().slice(0, 10);

const LABEL_TYPE: Record<TypeSeance, string> = {
  seance:        'Séance',
  bilan:         'Bilan',
  bilan_initial: 'Bilan initial',
};

const LABEL_STATUT: Record<StatutSeance, string> = {
  planifiee: '📅 Planifiée',
  realisee:  '✅ Réalisée',
  annulee:   '❌ Annulée',
  reportee:  '🔄 Reportée',
};

function getCouleurEvenement(seance: Seance): string {
  if (seance.statut === 'annulee') return '#EF4444';
  if (seance.statut === 'reportee') return '#F59E0B';
  if (seance.statut === 'realisee') return '#3B6D11';
  if (seance.type === 'bilan' || seance.type === 'bilan_initial') return '#8B5CF6';
  return seance.date === TODAY ? '#1A5F9E' : '#5B9BD5';
}

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Seance;
}

function heureToDate(date: string, heure: string): Date {
  const [h, m] = heure.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

// ── Modal création séance ─────────────────────────────────────────────────────

interface ModalCreerProps {
  onClose: () => void;
  initial?: { date?: string; heureDebut?: string };
}

function ModalCreerSeance({ onClose, initial }: ModalCreerProps) {
  const { participants } = useParticipants();
  const { creerSeance, detecterConflits } = useAgenda();

  const [form, setForm] = useState({
    participantId: '',
    type: 'seance' as TypeSeance,
    date: initial?.date ?? new Date().toISOString().slice(0, 10),
    heureDebut: initial?.heureDebut ?? '09:00',
    dureeMinutes: 45,
    notes: '',
  });

  const participant = participants.find(p => p.id === form.participantId);

  function heureFinCalc(): string {
    const [h, m] = form.heureDebut.split(':').map(Number);
    const total = h * 60 + m + form.dureeMinutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.participantId) { toast.error('Choisissez un patient'); return; }
    const heureFin = heureFinCalc();
    const conflits = detecterConflits(form.date, form.heureDebut, heureFin);
    if (conflits.length > 0) { toast.error('Conflit horaire avec une autre séance'); return; }
    creerSeance({
      participantId: form.participantId,
      type: form.type,
      date: form.date,
      heureDebut: form.heureDebut,
      heureFin,
      dureeMinutes: form.dureeMinutes,
      statut: 'planifiee',
      notes: form.notes,
      adresse: [participant?.adresseRue, participant?.adresseCodePostal, participant?.adresseVille].filter(Boolean).join(', '),
      coordonnees: participant?.coordonnees ? { lat: participant.coordonnees.lat, lng: participant.coordonnees.lng } : undefined,
    });
    toast.success('Séance créée');
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-heading font-bold text-dark text-lg">Nouvelle séance</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Patient *</label>
            <select value={form.participantId} onChange={e => setForm(f => ({ ...f, participantId: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary">
              <option value="">Choisir un patient...</option>
              {participants.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as TypeSeance }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary">
              <option value="seance">Séance</option>
              <option value="bilan">Bilan</option>
              <option value="bilan_initial">Bilan initial</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Heure *</label>
              <input type="time" value={form.heureDebut} onChange={e => setForm(f => ({ ...f, heureDebut: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Durée : {form.dureeMinutes} min → fin à {heureFinCalc()}
            </label>
            <input type="number" min={15} max={180} step={5} value={form.dureeMinutes}
              onChange={e => setForm(f => ({ ...f, dureeMinutes: Number(e.target.value) }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
          </div>
          {participant && (
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
              <MapPin size={12} />
              {[participant.adresseRue, participant.adresseCodePostal, participant.adresseVille].filter(Boolean).join(', ') || 'Adresse non renseignée'}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Observations rapides..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-dark transition-colors">
              Créer la séance
            </button>
            <button type="button" onClick={onClose} className="px-5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-sm">
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Popup détail séance enrichie ─────────────────────────────────────────────

interface PopupSeanceProps {
  seance: Seance;
  rang: number;
  totalContrat: number;
  onClose: () => void;
  onDelete: () => void;
  onStatut: (s: StatutSeance) => void;
  onNotes: (notes: string) => void;
  onReporter: () => void;
  onNoteSeance: () => void;
}

function PopupSeance({ seance, rang, totalContrat, onClose, onDelete, onStatut, onNotes, onReporter, onNoteSeance }: PopupSeanceProps) {
  const { participants } = useParticipants();
  const navigate = useNavigate();
  const participant = participants.find(p => p.id === seance.participantId);
  const [notes, setNotes] = useState(seance.notes ?? '');
  const progression = totalContrat > 0 ? Math.round((rang / totalContrat) * 100) : 0;

  function ouvrirMaps() {
    if (!seance.adresse) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(seance.adresse)}`, '_blank');
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        {/* Header coloré selon statut */}
        <div className="px-5 py-4 rounded-t-2xl" style={{ backgroundColor: getCouleurEvenement(seance) }}>
          <div className="flex items-start justify-between">
            <div className="text-white">
              <div className="text-xs font-medium opacity-80">{LABEL_TYPE[seance.type]}</div>
              <div className="font-heading font-bold text-lg leading-tight">
                {participant?.prenom} {participant?.nom}
              </div>
              <div className="text-sm opacity-80 mt-0.5">
                {new Date(seance.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                {' · '}{seance.heureDebut} → {seance.heureFin}
              </div>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors mt-0.5">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Progression contrat */}
          {totalContrat > 0 && rang > 0 && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>Progression du contrat</span>
                <span className="font-semibold text-dark">Séance {rang}/{totalContrat}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progression}%`, background: 'var(--color-teal)' }}
                />
              </div>
            </div>
          )}

          {/* Adresse */}
          {seance.adresse && (
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <span>{seance.adresse}</span>
            </div>
          )}

          {/* Statut */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Statut</label>
            <div className="grid grid-cols-2 gap-2">
              {(['planifiee', 'realisee', 'reportee', 'annulee'] as StatutSeance[]).map(s => (
                <button
                  key={s}
                  onClick={() => { onStatut(s); if (s === 'reportee') onReporter(); else onClose(); }}
                  className="py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors text-left"
                  style={seance.statut === s
                    ? { backgroundColor: getCouleurEvenement({ ...seance, statut: s }), color: 'white', borderColor: 'transparent' }
                    : { background: 'white', color: '#4A6080', borderColor: '#E2EEF9' }
                  }
                >
                  {LABEL_STATUT[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Note rapide</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => onNotes(notes)}
              rows={2}
              placeholder="Observations post-séance…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1 flex-wrap">
            <button
              onClick={onNoteSeance}
              className="flex-1 flex items-center justify-center gap-1.5 bg-secondary/10 text-secondary border border-secondary/30 rounded-xl py-2 text-xs font-medium hover:bg-secondary/20 transition-colors"
            >
              <NotebookPen size={12} />
              Note séance
            </button>
            {participant && (
              <button
                onClick={() => navigate(`/participant/${participant.id}`)}
                className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 rounded-xl py-2 text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                Fiche
                <ExternalLink size={11} />
              </button>
            )}
            {seance.adresse && (
              <button
                onClick={ouvrirMaps}
                className="flex items-center justify-center gap-1 bg-primary/10 text-primary rounded-xl px-3 py-2 text-xs font-medium hover:bg-primary/20 transition-colors"
              >
                🗺️
              </button>
            )}
            <button
              onClick={() => { if (confirm('Supprimer cette séance ?')) { onDelete(); onClose(); } }}
              className="flex items-center justify-center border border-red-200 text-red-400 rounded-xl px-3 py-2 hover:bg-red-light transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal "reporter" séance ───────────────────────────────────────────────────

interface ModalReporterProps {
  seance: Seance;
  onConfirm: (nouvelleDate: string) => void;
  onClose: () => void;
}

function ModalReporter({ seance, onConfirm, onClose }: ModalReporterProps) {
  const suggestion = addDays(new Date(seance.date), 7).toISOString().slice(0, 10);
  const [date, setDate] = useState(suggestion);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
            <RotateCcw size={18} className="text-orange-500" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-dark">Séance reportée</h2>
            <p className="text-xs text-gray-400">Recréer à une nouvelle date ?</p>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nouvelle date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
          <p className="text-xs text-gray-400 mt-1">Suggestion : semaine suivante au même créneau ({seance.heureDebut})</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50">
            Non merci
          </button>
          <button
            onClick={() => { onConfirm(date); onClose(); }}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-dark transition-colors"
          >
            <Check size={14} />
            Recréer la séance
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function AgendaPage() {
  const { seances, supprimerSeance, changerStatut, modifierSeance, creerSeance, patientsARelancer } = useAgenda();
  const { contrats } = useContrats();
  const { participants } = useParticipants();
  const navigate = useNavigate();

  const vueParDefaut = typeof window !== 'undefined' && window.innerWidth < 768 ? Views.DAY : Views.WEEK;
  const [view, setView] = useState<(typeof Views)[keyof typeof Views]>(vueParDefaut);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModalCreer, setShowModalCreer] = useState(false);
  const [slotInitial, setSlotInitial] = useState<{ date?: string; heureDebut?: string } | undefined>();
  const [selectedSeance, setSelectedSeance] = useState<Seance | null>(null);
  const [seanceAReporter, setSeanceAReporter] = useState<Seance | null>(null);
  const [noteSeance, setNoteSeance] = useState<Seance | null>(null);

  const aRelancer = patientsARelancer(85);

  // Rang d'une séance dans son contrat
  const getRang = useCallback((seance: Seance): number => {
    if (!seance.contratId) return 0;
    const ss = seances
      .filter(s => s.contratId === seance.contratId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.heureDebut.localeCompare(b.heureDebut));
    return ss.findIndex(s => s.id === seance.id) + 1;
  }, [seances]);

  const getContrat = useCallback((contratId?: string) => {
    if (!contratId) return null;
    return contrats.find(c => c.id === contratId) ?? null;
  }, [contrats]);

  // Masquer les week-ends si aucune séance le samedi
  const joursSamedi = useMemo(() =>
    seances.some(s => new Date(s.date + 'T12:00').getDay() === 6 && s.statut !== 'annulee'),
    [seances]
  );

  const events: CalEvent[] = seances.map(s => ({
    id: s.id,
    title: s.participantId,
    start: heureToDate(s.date, s.heureDebut),
    end: heureToDate(s.date, s.heureFin),
    resource: s,
  }));

  const eventStyleGetter = useCallback((event: CalEvent) => {
    const seance = event.resource;
    const couleur = getCouleurEvenement(seance);
    return {
      style: {
        backgroundColor: couleur,
        opacity: seance.statut === 'annulee' ? 0.5 : 1,
        borderRadius: '6px',
        border: 'none',
        color: 'white',
        fontSize: '12px',
        fontFamily: 'var(--font-sans)',
      },
    };
  }, []);

  function EventComponent({ event }: { event: CalEvent }) {
    const seance = event.resource;
    const p = participants.find(x => x.id === seance.participantId);
    const contrat = getContrat(seance.contratId);
    const rang = getRang(seance);
    return (
      <div className="leading-tight px-0.5">
        <div className="font-semibold truncate text-[11px]">
          {p ? `${p.prenom} ${p.nom}` : LABEL_TYPE[seance.type]}
        </div>
        {contrat && rang > 0 && (
          <div className="opacity-80 text-[9px]">
            Séance {rang}/{contrat.nombreSeancesTotal}
          </div>
        )}
        <div className="opacity-75 text-[9px]">{seance.heureDebut} → {seance.heureFin}</div>
      </div>
    );
  }

  function handleSelectSlot(slotInfo: { start: Date; end: Date }) {
    const date = slotInfo.start.toISOString().slice(0, 10);
    const h = String(slotInfo.start.getHours()).padStart(2, '0');
    const m = String(slotInfo.start.getMinutes()).padStart(2, '0');
    setSlotInitial({ date, heureDebut: `${h}:${m}` });
    setShowModalCreer(true);
  }

  function handleReporter(seance: Seance) {
    setSeanceAReporter(seance);
    setSelectedSeance(null);
  }

  function confirmerReport(seance: Seance, nouvelleDate: string) {
    const participant = participants.find(p => p.id === seance.participantId);
    creerSeance({
      participantId: seance.participantId,
      contratId: seance.contratId,
      type: seance.type,
      date: nouvelleDate,
      heureDebut: seance.heureDebut,
      heureFin: seance.heureFin,
      dureeMinutes: seance.dureeMinutes,
      statut: 'planifiee',
      notes: `Reportée depuis le ${new Date(seance.date + 'T12:00').toLocaleDateString('fr-FR')}`,
      adresse: seance.adresse,
      coordonnees: seance.coordonnees ?? (participant?.coordonnees ? { lat: participant.coordonnees.lat, lng: participant.coordonnees.lng } : undefined),
    });
    toast.success(`Séance recréée le ${new Date(nouvelleDate + 'T12:00').toLocaleDateString('fr-FR')}`);
  }

  const seanceSelectionnee = selectedSeance;
  const rangSelectionne = seanceSelectionnee ? getRang(seanceSelectionnee) : 0;
  const contratSelectionne = seanceSelectionnee ? getContrat(seanceSelectionnee.contratId) : null;

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="font-heading font-bold text-2xl text-dark">Mon Agenda</h1>
          <p className="text-xs text-gray-400 mt-0.5">Calendrier de toutes vos séances planifiées</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate('/tournee')}
            className="flex items-center gap-2 border border-primary text-primary px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/5 transition-colors">
            🚗 Tournée du jour
          </button>
          <button
            onClick={() => { setSlotInitial(undefined); setShowModalCreer(true); }}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-dark transition-colors"
          >
            <Plus size={16} />
            Nouvelle séance
          </button>
        </div>
      </div>

      {aRelancer.length > 0 && (
        <div className="mb-4 bg-warning/10 border border-warning/20 rounded-xl px-4 py-2.5 text-sm text-warning">
          ⚠️ {aRelancer.length} patient{aRelancer.length > 1 ? 's' : ''} sans bilan depuis plus de 85 jours
        </div>
      )}

      {/* Légende couleurs */}
      <div className="flex flex-wrap gap-3 mb-3 text-xs text-gray-500">
        {[
          { couleur: '#1A5F9E', label: "Aujourd'hui" },
          { couleur: '#5B9BD5', label: 'Planifiée' },
          { couleur: '#3B6D11', label: 'Réalisée' },
          { couleur: '#F59E0B', label: 'Reportée' },
          { couleur: '#EF4444', label: 'Annulée' },
          { couleur: '#8B5CF6', label: 'Bilan' },
        ].map(({ couleur, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: couleur }} />
            {label}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm" style={{ height: 660 }}>
        <Calendar
          localizer={localizer}
          events={events}
          view={view}
          onView={(v: (typeof Views)[keyof typeof Views]) => setView(v)}
          date={currentDate}
          onNavigate={(d: Date) => setCurrentDate(d)}
          culture="fr"
          messages={{
            next: 'Suivant', previous: 'Précédent', today: "Aujourd'hui",
            month: 'Mois', week: 'Semaine', day: 'Jour',
            showMore: (n: number) => `+${n} de plus`,
          }}
          eventPropGetter={eventStyleGetter}
          components={{ event: EventComponent as any }}
          onSelectEvent={(event: CalEvent) => setSelectedSeance(event.resource)}
          onSelectSlot={handleSelectSlot}
          selectable
          popup
          step={15}
          timeslots={4}
          min={new Date(0, 0, 0, 7, 0)}
          max={new Date(0, 0, 0, 21, 0)}
          formats={{
            dayHeaderFormat: (date: Date) =>
              date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
          }}
          {...(!joursSamedi ? {} : {})}
        />
      </div>

      {showModalCreer && (
        <ModalCreerSeance onClose={() => setShowModalCreer(false)} initial={slotInitial} />
      )}

      {seanceSelectionnee && (
        <PopupSeance
          seance={seanceSelectionnee}
          rang={rangSelectionne}
          totalContrat={contratSelectionne?.nombreSeancesTotal ?? 0}
          onClose={() => setSelectedSeance(null)}
          onDelete={() => supprimerSeance(seanceSelectionnee.id)}
          onStatut={s => changerStatut(seanceSelectionnee.id, s)}
          onNotes={notes => modifierSeance(seanceSelectionnee.id, { notes })}
          onReporter={() => handleReporter(seanceSelectionnee)}
          onNoteSeance={() => { setNoteSeance(seanceSelectionnee); setSelectedSeance(null); }}
        />
      )}

      {seanceAReporter && (
        <ModalReporter
          seance={seanceAReporter}
          onConfirm={date => confirmerReport(seanceAReporter, date)}
          onClose={() => setSeanceAReporter(null)}
        />
      )}

      {noteSeance && (() => {
        const p = participants.find(x => x.id === noteSeance.participantId);
        return (
          <NoteSeanceModal
            participantId={noteSeance.participantId}
            participantNom={p ? `${p.prenom} ${p.nom}` : ''}
            seance={{ id: noteSeance.id, date: noteSeance.date, heureDebut: noteSeance.heureDebut }}
            onClose={() => setNoteSeance(null)}
            onMarquerRealisee={() => changerStatut(noteSeance.id, 'realisee')}
          />
        );
      })()}
    </PageWrapper>
  );
}
