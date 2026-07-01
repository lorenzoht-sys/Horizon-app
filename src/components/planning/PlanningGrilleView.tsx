import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Loader, X } from 'lucide-react';
import type { Contrat, IndisponibilitePierre, JourSemaine, Participant, Seance } from '../../types';
import { getOrganisation } from '../../lib/anamnese';
import { heureEnMinutes } from '../../utils/horaires';
import { addMinutes } from '../../hooks/useAgenda';
import FrisePlanningJour, {
  FRISE_H_DEBUT, FRISE_H_FIN, FRISE_TOTAL_H, friseToY,
} from './FrisePlanningJour';

// ── Jours disponibles (Lun → Ven) ────────────────────────────────────────────

const JOURS_ORDRES = [
  { key: 'lun' as JourSemaine, label: 'Lundi',    cleJour: 'Lun', dow: 1 },
  { key: 'mar' as JourSemaine, label: 'Mardi',    cleJour: 'Mar', dow: 2 },
  { key: 'mer' as JourSemaine, label: 'Mercredi', cleJour: 'Mer', dow: 3 },
  { key: 'jeu' as JourSemaine, label: 'Jeudi',    cleJour: 'Jeu', dow: 4 },
  { key: 'ven' as JourSemaine, label: 'Vendredi', cleJour: 'Ven', dow: 5 },
];

// ── Calcul des dates récurrentes d'un jour de la semaine ──────────────────────

function creerDatesRecurrentes(dow: number, dateDebutContrat: string, dateFinContrat: string): string[] {
  const today = new Date().toISOString().split('T')[0];
  const start = dateDebutContrat > today ? dateDebutContrat : today;
  const cursor = new Date(start + 'T12:00');
  while (cursor.getDay() !== dow) cursor.setDate(cursor.getDate() + 1);
  const end = new Date(dateFinContrat + 'T12:00');
  const dates: string[] = [];
  while (cursor <= end) {
    dates.push(cursor.toISOString().split('T')[0]);
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
}

function formatDate(d: string) {
  return new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DropPendant {
  participantId: string;
  jour: typeof JOURS_ORDRES[number];
  heure: string;
  contrat: Contrat;
}

interface Props {
  participants: Participant[];
  seances: Seance[];
  contrats: Contrat[];
  indispos: IndisponibilitePierre[];
  bulkCreerSeances: (data: Omit<Seance, 'id'>[]) => Promise<unknown>;
}

// ── Modal confirmation drop ───────────────────────────────────────────────────

function ModalConfirmDrop({ info, patient, onConfirm, onCancel }: {
  info: DropPendant;
  patient: Participant | undefined;
  onConfirm: (duree: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [duree, setDuree] = useState(info.contrat.dureeMinutes);
  const [loading, setLoading] = useState(false);

  const dates = useMemo(
    () => creerDatesRecurrentes(info.jour.dow, info.contrat.dateDebut, info.contrat.dateFin),
    [info.jour.dow, info.contrat.dateDebut, info.contrat.dateFin],
  );

  const heureFin = addMinutes(info.heure, duree);

  async function handleConfirmer() {
    setLoading(true);
    try { await onConfirm(duree); } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1010 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-dark">Planifier la séance</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Patient */}
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Patient</p>
            <p className="text-sm font-semibold text-dark">
              {patient ? `${patient.prenom} ${patient.nom}` : '—'}
            </p>
            {patient?.adresseVille && <p className="text-xs text-gray-400">{patient.adresseVille}</p>}
          </div>

          {/* Créneau */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Jour (chaque semaine)</p>
              <p className="text-sm font-semibold text-dark">{info.jour.label}</p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Heure</p>
              <p className="text-sm font-semibold text-dark">{info.heure} → {heureFin}</p>
            </div>
          </div>

          {/* Durée (selector si plusieurs options) */}
          {info.contrat.dureesSeances.length > 1 ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Durée de la séance</label>
              <select value={duree} onChange={e => setDuree(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
                {info.contrat.dureesSeances.map(d => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Durée : <span className="font-medium text-dark">{duree} min</span></p>
          )}

          {/* Récurrence */}
          {dates.length > 0 ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-600">
                <span className="font-semibold text-primary">{dates.length} séance{dates.length > 1 ? 's' : ''}</span>
                {' '}sur la durée du contrat
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(dates[0])} → {formatDate(dates[dates.length - 1])}
              </p>
            </div>
          ) : (
            <p className="text-xs text-orange-700 bg-orange-50 rounded-xl px-4 py-3">
              Aucune date disponible dans ce contrat.
            </p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onCancel}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleConfirmer} disabled={loading || dates.length === 0}
            className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><Loader size={14} className="animate-spin" />En cours…</> : `Confirmer ${dates.length > 0 ? `(${dates.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function PlanningGrilleView({ participants, seances, contrats, indispos, bulkCreerSeances }: Props) {
  const [search, setSearch] = useState('');
  const [patientSelectionneId, setPatientSelectionneId] = useState<string | null>(null);
  const [dragPatientId, setDragPatientId] = useState<string | null>(null);
  const [dropPendant, setDropPendant] = useState<DropPendant | null>(null);

  // Jours actifs : exclure les jours où Pierre est indisponible toute la journée
  const joursActifs = useMemo(() => {
    return JOURS_ORDRES.filter(j => {
      return !indispos.filter(i => i.jour === j.key).some(i =>
        heureEnMinutes(i.heureDebut) <= FRISE_H_DEBUT && heureEnMinutes(i.heureFin) >= FRISE_H_FIN,
      );
    });
  }, [indispos]);

  // Séances groupées par jour de la semaine
  const seancesParDow = useMemo(() => {
    const map = new Map<number, Seance[]>();
    for (const s of seances) {
      if (s.statut === 'annulee') continue;
      const dow = new Date(s.date + 'T12:00').getDay();
      const arr = map.get(dow) ?? [];
      arr.push(s);
      map.set(dow, arr);
    }
    return map;
  }, [seances]);

  const participantMap = useMemo(
    () => new Map(participants.map(p => [p.id, p])),
    [participants],
  );

  const patientSelectionne = patientSelectionneId ? participantMap.get(patientSelectionneId) ?? null : null;

  // Organisation du patient sélectionné
  const orgPatient = useMemo(
    () => patientSelectionne ? getOrganisation(patientSelectionne) : null,
    [patientSelectionne],
  );

  // Fenêtres dispo du patient pour un jour donné
  function windowsForJour(cleJour: string): { debut: string; fin: string }[] {
    if (!orgPatient) return [];
    const crenJour = orgPatient.creneauxParJour?.[cleJour];
    return crenJour?.length ? crenJour : [{ debut: '08:00', fin: '19:00' }];
  }

  // Indispos de Pierre pour un jour donné
  function indisposForJour(jourKey: JourSemaine): { debut: string; fin: string }[] {
    return indispos.filter(i => i.jour === jourKey).map(i => ({ debut: i.heureDebut, fin: i.heureFin }));
  }

  // Patients filtrés + triés
  const patientsFiltres = useMemo(() => {
    const q = search.toLowerCase().trim();
    return [...participants]
      .filter(p => !q || `${p.prenom} ${p.nom}`.toLowerCase().includes(q))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [participants, search]);

  // Durée pour la frise (contrat actif du patient sélectionné, ou 45min par défaut)
  const dureeNouveau = useMemo(() => {
    if (!patientSelectionneId) return 45;
    const c = contrats.find(c => c.participantId === patientSelectionneId && c.statut === 'actif');
    return c?.dureeMinutes ?? 45;
  }, [patientSelectionneId, contrats]);

  // Gestion du drop sur la grille
  function handleDrop(jour: typeof JOURS_ORDRES[number], heure: string) {
    const pid = dragPatientId ?? patientSelectionneId;
    if (!pid) return;
    const contrat = contrats.find(c => c.participantId === pid && c.statut === 'actif');
    if (!contrat) {
      toast.error("Ce patient n'a pas de contrat actif. Créez d'abord un contrat.");
      return;
    }
    setDropPendant({ participantId: pid, jour, heure, contrat });
  }

  async function handleConfirmerDrop(duree: number) {
    if (!dropPendant) return;
    const { participantId, jour, heure, contrat } = dropPendant;
    const patient = participantMap.get(participantId);
    const dates = creerDatesRecurrentes(jour.dow, contrat.dateDebut, contrat.dateFin);
    if (!dates.length) { toast.error('Aucune date disponible dans ce contrat.'); setDropPendant(null); return; }

    const heureFin = addMinutes(heure, duree);
    const adresse = patient
      ? [patient.adresseRue, patient.adresseCodePostal, patient.adresseVille].filter(Boolean).join(', ')
      : '';

    const data: Omit<Seance, 'id'>[] = dates.map(date => ({
      participantId,
      contratId: contrat.id,
      date,
      heureDebut: heure,
      heureFin,
      dureeMinutes: duree,
      type: 'seance' as const,
      statut: 'planifiee' as const,
      adresse,
      coordonnees: patient?.coordonnees ? { lat: patient.coordonnees.lat, lng: patient.coordonnees.lng } : undefined,
    }));

    await bulkCreerSeances(data);
    toast.success(`${dates.length} séance${dates.length > 1 ? 's' : ''} planifiée${dates.length > 1 ? 's' : ''} chaque ${jour.label.toLowerCase()}`);
    setDropPendant(null);
  }

  // Repères horaires (partagés entre colonnes)
  const heureMarks: number[] = [];
  for (let m = FRISE_H_DEBUT; m <= FRISE_H_FIN; m += 60) heureMarks.push(m);

  return (
    <div className="flex gap-4 min-h-0">

      {/* ── Colonne gauche : patients ─────────────────────────────── */}
      <div className="w-60 flex-shrink-0 flex flex-col gap-3">
        <input
          type="text" placeholder="Rechercher un patient…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />

        <p className="text-[11px] text-gray-400 px-1">
          Glissez un patient sur la grille pour placer une séance.
        </p>

        <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: FRISE_TOTAL_H }}>
          {patientsFiltres.map(p => {
            const aContrat = contrats.some(c => c.participantId === p.id && c.statut === 'actif');
            const selected = patientSelectionneId === p.id;
            return (
              <div key={p.id}
                draggable={aContrat}
                onDragStart={() => { setDragPatientId(p.id); setPatientSelectionneId(p.id); }}
                onDragEnd={() => setDragPatientId(null)}
                onClick={() => setPatientSelectionneId(selected ? null : p.id)}
                className={`rounded-xl px-3 py-2.5 border transition-colors select-none ${
                  aContrat ? 'cursor-grab active:cursor-grabbing' : 'cursor-default opacity-60'
                } ${
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 bg-white hover:border-primary/40 hover:bg-gray-50'
                }`}>
                <p className="text-sm font-medium text-dark truncate">{p.prenom} {p.nom}</p>
                <p className={`text-xs mt-0.5 ${aContrat ? 'text-green-600' : 'text-gray-400'}`}>
                  {aContrat ? 'Contrat actif' : 'Sans contrat'}
                </p>
              </div>
            );
          })}
          {patientsFiltres.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">Aucun patient trouvé</p>
          )}
        </div>
      </div>

      {/* ── Grille principale ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-x-auto">
        {/* En-têtes jours */}
        <div className="flex mb-1" style={{ paddingLeft: 36 + 8 }}>
          {joursActifs.map(j => (
            <div key={j.key} className="flex-1 min-w-[120px] text-center text-xs font-semibold text-gray-600 pb-1">
              {j.label}
            </div>
          ))}
        </div>

        {/* Corps grille */}
        <div className="flex gap-2">
          {/* Colonne heures partagée */}
          <div className="relative flex-shrink-0" style={{ width: 36, height: FRISE_TOTAL_H }}>
            {heureMarks.map(m => (
              <div key={m} className="absolute right-1.5 text-[10px] text-gray-400 leading-none"
                style={{ top: friseToY(m) - 4 }}>
                {m / 60}h
              </div>
            ))}
          </div>

          {/* Une frise par jour actif */}
          {joursActifs.map(j => (
            <div key={j.key} className="flex-1 min-w-[120px]">
              <FrisePlanningJour
                seancesDuJour={seancesParDow.get(j.dow) ?? []}
                participantMap={participantMap}
                dureeNouveau={dureeNouveau}
                windowsPatient={patientSelectionne ? windowsForJour(j.cleJour) : []}
                selectedHeure={null}
                onSelect={() => {}}
                canSelect={false}
                showHours={false}
                onDrop={heure => handleDrop(j, heure)}
                indisposPierre={indisposForJour(j.key)}
              />
            </div>
          ))}
        </div>

        {/* Légende */}
        <div className="flex items-center gap-4 mt-3 px-1">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-100 border border-green-200" />
            <span className="text-[11px] text-gray-500">Disponibilités patient</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-slate-200 border border-slate-300" />
            <span className="text-[11px] text-gray-500">Séances planifiées</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm"
              style={{ background: 'repeating-linear-gradient(45deg,#fee2e2,#fee2e2 2px,#fef2f2 2px,#fef2f2 6px)' }} />
            <span className="text-[11px] text-gray-500">Indisponibilités Pierre</span>
          </div>
          {!patientSelectionne && (
            <span className="text-[11px] text-gray-400 ml-auto">← Sélectionnez un patient pour voir ses disponibilités</span>
          )}
        </div>
      </div>

      {/* ── Modal confirmation drop ────────────────────────────────── */}
      {dropPendant && (
        <ModalConfirmDrop
          info={dropPendant}
          patient={participantMap.get(dropPendant.participantId)}
          onConfirm={handleConfirmerDrop}
          onCancel={() => setDropPendant(null)}
        />
      )}
    </div>
  );
}
