import { useState, useMemo } from 'react';
import { X, Loader, AlertCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Participant, Contrat, Seance, IndisponibilitePierre } from '../../types';
import { getAuthHeader } from '../../lib/supabase';
import {
  planifierSemaine,
  planifierRecurrent,
  coordKey,
  prochainLundi,
  type ResultatPlanification,
  type JourPlanifie,
  type EtapePlanifiee,
} from '../../lib/planificateur';

interface Props {
  onClose: () => void;
  participants: Participant[];
  contrats: Contrat[];
  seances: Seance[];
  indispos: IndisponibilitePierre[];
  depart: { lat: number; lng: number };
  departAdresse: string;
  heureDebutJournee: string;
  bulkCreerSeances: (data: Omit<Seance, 'id'>[]) => Promise<void>;
  modifierSeance: (id: string, updates: Partial<Seance>) => Promise<void>;
}

type Mode = 'A' | 'B';

function formatHeure(h: string): string { return h.slice(0, 5); }

function lundiDe(dateStr: string): string {
  // Lundi de la semaine contenant dateStr
  const d = new Date(dateStr + 'T12:00');
  const dow = d.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - back);
  return d.toISOString().split('T')[0];
}

export default function ModalPlanificateur({
  onClose, participants, contrats, seances, indispos,
  depart, departAdresse, heureDebutJournee,
  bulkCreerSeances, modifierSeance,
}: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [mode, setMode]         = useState<Mode>('A');
  const [lundiDate, setLundiDate] = useState<string>(prochainLundi(today));
  const [loading, setLoading]   = useState(false);
  const [orsWarn, setOrsWarn]   = useState(false);
  const [resultat, setResultat] = useState<ResultatPlanification | null>(null);
  const [localJours, setLocalJours] = useState<JourPlanifie[]>([]);
  const [applying, setApplying] = useState(false);

  // Patients candidats (avec coordonnées, contrat actif)
  const patientsActifs = useMemo(() =>
    participants.filter(p => {
      if (!p.coordonnees) return false;
      return contrats.some(c => c.participantId === p.id && c.statut === 'actif');
    }),
    [participants, contrats]
  );

  async function handleGenerer() {
    setLoading(true);
    setResultat(null);
    setOrsWarn(false);

    try {
      // Un seul appel ORS pour tous les patients actifs
      const points = [depart, ...patientsActifs.map(p => p.coordonnees!)];
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/tournee/matrice-trajets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ coordonnees: points }),
      });

      let matrix = { durees: [] as number[][], distances: [] as number[][], fallback: true };
      if (res.ok) {
        matrix = await res.json();
      }
      if (matrix.fallback) setOrsWarn(true);

      const indexMap = new Map(points.map((p, i) => [coordKey(p), i]));

      const params = {
        participants, contrats, seances, indispos,
        depart, matrix, indexMap, heureDebutJournee,
      };

      const r = mode === 'A'
        ? planifierSemaine(params, lundiDate)
        : planifierRecurrent(params, today);

      setResultat(r);
      setLocalJours(r.jours.map(j => ({ ...j, etapes: j.etapes.map(e => ({ ...e })) })));

      if (r.jours.length === 0 && r.impossibles.length === 0) {
        toast('Aucune séance à planifier pour cette période.');
      }
    } catch (err) {
      toast.error('Erreur lors de la génération du planning');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function retirerEtape(jourIdx: number, etapeIdx: number) {
    setLocalJours(prev => prev.map((j, ji) => {
      if (ji !== jourIdx) return j;
      return { ...j, etapes: j.etapes.filter((_, ei) => ei !== etapeIdx) };
    }));
  }

  const etapesAcceptees: EtapePlanifiee[] = localJours.flatMap(j => j.etapes.filter(e => e.accepted));

  async function handleAppliquer() {
    if (etapesAcceptees.length === 0) { toast('Aucune séance acceptée.'); return; }
    setApplying(true);
    try {
      if (!resultat?.modeB) {
        // Mode A : créer des séances
        const data: Omit<Seance, 'id'>[] = etapesAcceptees.map(e => ({
          participantId: e.patient.id,
          contratId: e.contrat.id,
          date: e.date,
          heureDebut: e.heureDebut,
          heureFin: e.heureFin,
          dureeMinutes: e.contrat.dureeMinutes,
          type: 'seance' as const,
          statut: 'planifiee' as const,
          adresse: [e.patient.adresseRue, e.patient.adresseCodePostal, e.patient.adresseVille]
            .filter(Boolean).join(', '),
          coordonnees: e.patient.coordonnees
            ? { lat: e.patient.coordonnees.lat, lng: e.patient.coordonnees.lng }
            : undefined,
        }));
        await bulkCreerSeances(data);
      } else {
        // Mode B : mettre à jour les heures des séances existantes
        for (const e of etapesAcceptees) {
          if (e.seanceExistanteId) {
            await modifierSeance(e.seanceExistanteId, {
              heureDebut: e.heureDebut,
              heureFin: e.heureFin,
            });
          }
        }
      }
      toast.success(`${etapesAcceptees.length} séance${etapesAcceptees.length > 1 ? 's' : ''} ${resultat?.modeB ? 'mise(s) à jour' : 'créée(s)'}`);
      onClose();
    } catch {
      toast.error('Erreur lors de l\'application du planning');
    } finally {
      setApplying(false);
    }
  }

  const totalEtapes = localJours.reduce((acc, j) => acc + j.etapes.length, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Planification de la semaine</h2>
            {departAdresse && (
              <p className="text-xs text-gray-400 mt-0.5">Départ : {departAdresse}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Tabs + options */}
        <div className="px-6 pt-4 pb-3 border-b border-gray-100 space-y-3">
          <div className="flex gap-2">
            {(['A', 'B'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setResultat(null); setLocalJours([]); }}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {m === 'A' ? 'Semaine ponctuelle' : 'Planning récurrent'}
              </button>
            ))}
          </div>

          {mode === 'A' && (
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-600">Semaine du lundi</label>
              <input
                type="date"
                value={lundiDate}
                onChange={e => {
                  setLundiDate(lundiDe(e.target.value));
                  setResultat(null);
                  setLocalJours([]);
                }}
                className="border border-gray-200 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          )}

          {mode === 'B' && (
            <p className="text-xs text-gray-500">
              Optimise les horaires des séances planifiées sur les 4 prochaines semaines en fonction des temps de trajet réels.
            </p>
          )}

          <button
            onClick={handleGenerer}
            disabled={loading}
            className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-dark transition-colors disabled:opacity-50"
          >
            {loading ? <><Loader size={14} className="animate-spin" />Calcul en cours…</> : 'Générer le planning'}
          </button>
        </div>

        {/* Warnings */}
        {orsWarn && (
          <div className="mx-6 mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
            <span>Temps de trajet estimés (vol d'oiseau) — ORS indisponible</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!resultat && !loading && (
            <p className="text-sm text-gray-400 text-center py-8">
              Cliquez sur "Générer le planning" pour calculer une proposition.
            </p>
          )}

          {/* Jours planifiés */}
          {localJours.map((jour, ji) => (
            <div key={jour.date}>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
                {jour.label}
              </div>
              {jour.etapes.length === 0 ? (
                <p className="text-xs text-gray-400 italic pl-2">Toutes les suggestions ont été retirées.</p>
              ) : (
                <div className="space-y-1">
                  {jour.etapes.map((etape, ei) => (
                    <div key={`${etape.patient.id}-${ei}`}
                      className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-mono text-primary font-semibold">
                            {formatHeure(etape.heureDebut)}
                          </span>
                          <span className="text-[13px] font-semibold text-gray-800 truncate">
                            {etape.patient.prenom} {etape.patient.nom}
                          </span>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {etape.contrat.dureeMinutes} min
                          </span>
                        </div>
                        {ei > 0 && etape.dureeTrajetMinutes > 0 && (
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {etape.dureeTrajetMinutes} min de trajet
                            {etape.distanceKm > 0 && ` · ${etape.distanceKm.toFixed(1)} km`}
                          </div>
                        )}
                        {resultat?.modeB && (
                          <div className="text-[11px] text-blue-500 mt-0.5">
                            Heure actuelle : {/* we don't have the original time here; just show it's an update */}
                            mise à jour proposée
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => retirerEtape(ji, ei)}
                        className="text-gray-300 hover:text-red-400 transition-colors p-1 flex-shrink-0"
                        title="Retirer cette suggestion"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Non planifiables */}
          {resultat && resultat.impossibles.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
                A planifier manuellement
              </div>
              <div className="space-y-1">
                {resultat.impossibles.map((imp, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-[13px] font-semibold text-gray-600 flex-shrink-0">
                      {imp.patient.prenom} {imp.patient.nom}
                    </span>
                    <span className="text-xs text-gray-400">— {imp.raison}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resultat && localJours.length === 0 && resultat.impossibles.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              {resultat.modeB
                ? 'Aucune séance planifiée trouvée sur les 4 prochaines semaines.'
                : 'Tous les patients sont déjà planifiés pour cette semaine.'}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <button onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          {resultat && totalEtapes > 0 && (
            <button
              onClick={handleAppliquer}
              disabled={applying || etapesAcceptees.length === 0}
              className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-dark transition-colors disabled:opacity-50"
            >
              {applying
                ? <><Loader size={14} className="animate-spin" />Application…</>
                : `Appliquer ${etapesAcceptees.length} séance${etapesAcceptees.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
