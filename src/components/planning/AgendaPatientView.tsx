import { useMemo, useState } from 'react';
import type { Participant, Seance, JourSemaine } from '../../types';
import { getOrganisation } from '../../lib/anamnese';
import MapView from '../map/MapView';
import FrisePlanningJour from './FrisePlanningJour';

const ALL_WORK_DAYS: { cleJour: string; dow: number; nom: string; jourKey: JourSemaine }[] = [
  { cleJour: 'Lun', dow: 1, nom: 'Lundi',    jourKey: 'lun' },
  { cleJour: 'Mar', dow: 2, nom: 'Mardi',    jourKey: 'mar' },
  { cleJour: 'Mer', dow: 3, nom: 'Mercredi', jourKey: 'mer' },
  { cleJour: 'Jeu', dow: 4, nom: 'Jeudi',    jourKey: 'jeu' },
  { cleJour: 'Ven', dow: 5, nom: 'Vendredi', jourKey: 'ven' },
];

interface Props {
  participants: Participant[];
  seances: Seance[];
}

export default function AgendaPatientView({ participants, seances }: Props) {
  const [patientId, setPatientId] = useState('');
  const [jourActifIdx, setJourActifIdx] = useState(0);

  const patient = useMemo(
    () => participants.find(p => p.id === patientId) ?? null,
    [participants, patientId]
  );

  const org = useMemo(
    () => patient ? getOrganisation(patient) : null,
    [patient]
  );

  const joursDispos = useMemo(() => {
    if (!org) return [];
    const joursPatient = org.joursDisponibles ?? [];
    return ALL_WORK_DAYS.filter(wd =>
      joursPatient.length === 0 || joursPatient.includes(wd.cleJour)
    );
  }, [org]);

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
    [participants]
  );

  const activeJour = joursDispos[Math.min(jourActifIdx, joursDispos.length - 1)];

  return (
    <div className="space-y-4">
      {/* Sélecteur patient */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <label className="block text-xs font-medium text-gray-600 mb-2">Sélectionner un patient</label>
        <select
          value={patientId}
          onChange={e => { setPatientId(e.target.value); setJourActifIdx(0); }}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
        >
          <option value="">— Choisir un patient —</option>
          {[...participants]
            .sort((a, b) => a.nom.localeCompare(b.nom))
            .map(p => (
              <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
            ))}
        </select>
      </div>

      {patient && (
        <>
          {/* Carte localisation */}
          {patient.coordonnees ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-dark">
                  📍 {patient.prenom} {patient.nom}
                </p>
                {patient.adresseVille && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[patient.adresseRue, patient.adresseVille].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              <MapView participants={[patient]} height="220px" />
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm text-gray-500 text-center">
              Pas de coordonnées GPS pour {patient.prenom}. Renseignez son adresse pour afficher la carte.
            </div>
          )}

          {/* Créneaux hebdomadaires */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-dark">Semaine type — créneaux</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Zones vertes = disponibilités de {patient.prenom} · Gris = séances des autres patients
              </p>
            </div>

            {joursDispos.length === 0 ? (
              <div className="p-6 text-sm text-gray-400 text-center">
                Aucune disponibilité renseignée pour ce patient.
              </div>
            ) : (
              <div className="p-4">
                {/* Onglets jours */}
                <div className="flex gap-1 border-b border-gray-200 mb-4">
                  {joursDispos.map((wd, idx) => (
                    <button
                      key={wd.dow}
                      onClick={() => setJourActifIdx(idx)}
                      className={`relative px-3 py-2 text-xs font-medium transition-colors rounded-t ${
                        idx === jourActifIdx
                          ? 'bg-white border-x border-t border-gray-200 text-dark -mb-px z-10'
                          : 'text-gray-500 hover:text-dark'
                      }`}
                    >
                      {wd.nom}
                    </button>
                  ))}
                </div>

                {/* Frise du jour actif (lecture seule) */}
                {activeJour && (
                  <FrisePlanningJour
                    seancesDuJour={seancesParDow.get(activeJour.dow) ?? []}
                    participantMap={participantMap}
                    dureeNouveau={45}
                    windowsPatient={
                      org?.creneauxParJour?.[activeJour.cleJour]?.length
                        ? org.creneauxParJour![activeJour.cleJour]
                        : [{ debut: '08:00', fin: '19:00' }]
                    }
                    selectedHeure={null}
                    onSelect={() => {}}
                    canSelect={false}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
