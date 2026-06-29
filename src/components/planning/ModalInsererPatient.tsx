import { useState, useMemo } from 'react';
import { X, Calendar, Clock, Check, Loader } from 'lucide-react';
import { toast } from 'sonner';
import type { Participant, Contrat, Seance, IndisponibilitePierre, JourSemaine } from '../../types';
import { getTrousRecurrents, getCreneauxLibresGlobal, type CreneauLibre } from '../../lib/analyse-tournee';
import { getOrganisation } from '../../lib/anamnese';
import { addMinutes, estSemaineDue } from '../../utils/horaires';
import { MARGE_ENTRE_SEANCES_MIN } from '../../lib/planificateur';

interface Props {
  onClose: () => void;
  participants: Participant[];
  contrats: Contrat[];
  seances: Seance[];
  indispos: IndisponibilitePierre[];
  bulkCreerSeances: (data: Omit<Seance, 'id'>[]) => Promise<Seance[] | void>;
}

export default function ModalInsererPatient({ onClose, participants, contrats, seances, indispos, bulkCreerSeances }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [etape, setEtape] = useState<1 | 2 | 3>(1);
  const [contratChoisi, setContratChoisi] = useState<Contrat | null>(null);
  const [creneauxChoisis, setCreneauxChoisis] = useState<CreneauLibre[]>([]);
  const [applying, setApplying] = useState(false);

  const eligibles = useMemo(() =>
    contrats.filter(c =>
      c.statut === 'actif' &&
      !seances.some(s => s.contratId === c.id && s.statut === 'planifiee' && s.date >= today)
    ),
    [contrats, seances, today]
  );

  const patient = useMemo(() =>
    participants.find(p => p.id === contratChoisi?.participantId),
    [participants, contratChoisi]
  );

  const joursIndispos = useMemo(() =>
    [...new Set(indispos.map(i => i.jour).filter((j): j is JourSemaine => j !== 'dim'))],
    [indispos]
  );

  const { creneauxLibres, estFallbackGlobal } = useMemo(() => {
    if (!patient || !contratChoisi) return { creneauxLibres: [], estFallbackGlobal: false };
    const org = getOrganisation(patient);
    const dispos = { joursDisponibles: org.joursDisponibles, creneauxParJour: org.creneauxParJour };
    const zone = getTrousRecurrents(seances, participants, patient.adresseVille ?? '', patient.coordonnees, dispos, joursIndispos);
    if (zone.length > 0) return { creneauxLibres: zone, estFallbackGlobal: false };
    const global = getCreneauxLibresGlobal(seances, dispos, joursIndispos);
    return { creneauxLibres: global, estFallbackGlobal: true };
  }, [patient, seances, participants, contratChoisi, joursIndispos]);

  function toggleCreneau(c: CreneauLibre) {
    const key = `${c.jourSemaine}-${c.heureDebut}`;
    const sel = creneauxChoisis.some(x => `${x.jourSemaine}-${x.heureDebut}` === key);
    if (sel) {
      setCreneauxChoisis(prev => prev.filter(x => `${x.jourSemaine}-${x.heureDebut}` !== key));
    } else {
      if (!contratChoisi || creneauxChoisis.length >= contratChoisi.nbSeancesSemaine) return;
      setCreneauxChoisis(prev => [...prev, c]);
    }
  }

  function handleNext() {
    if (etape === 1) {
      if (!contratChoisi) { toast.error('Sélectionnez un patient'); return; }
      setCreneauxChoisis([]);
      setEtape(2);
    } else if (etape === 2) {
      if (creneauxChoisis.length === 0) { toast.error('Sélectionnez au moins un créneau'); return; }
      setEtape(3);
    }
  }

  function goBack() {
    if (etape === 3) setEtape(2);
    else if (etape === 2) setEtape(1);
  }

  const seancesTotal = useMemo(() => {
    if (!contratChoisi || creneauxChoisis.length === 0) return 0;
    const startDate = contratChoisi.dateDebut >= today ? contratChoisi.dateDebut : today;
    let count = 0;
    creneauxChoisis.forEach(creneau => {
      const cur = new Date(startDate + 'T12:00');
      const fin = new Date(contratChoisi.dateFin + 'T12:00');
      while (cur <= fin) {
        const dateStr = cur.toISOString().split('T')[0];
        if (cur.getDay() === creneau.jourSemaine &&
            estSemaineDue(contratChoisi.dateDebut, dateStr, contratChoisi.periodicite ?? 'semaine'))
          count++;
        cur.setDate(cur.getDate() + 1);
      }
    });
    return count;
  }, [contratChoisi, creneauxChoisis, today]);

  async function appliquer() {
    if (!contratChoisi || creneauxChoisis.length === 0 || !patient) return;
    setApplying(true);
    try {
      const adressePatient = [patient.adresseRue, patient.adresseCodePostal, patient.adresseVille]
        .filter(Boolean).join(', ');
      const seancesACreer: Omit<Seance, 'id'>[] = [];
      const startDate = contratChoisi.dateDebut >= today ? contratChoisi.dateDebut : today;
      creneauxChoisis.forEach((creneau, idx) => {
        const duree = contratChoisi.dureesSeances[idx] ?? contratChoisi.dureeMinutes;
        const cur = new Date(startDate + 'T12:00');
        const fin = new Date(contratChoisi.dateFin + 'T12:00');
        while (cur <= fin) {
          const dateStr = cur.toISOString().split('T')[0];
          if (cur.getDay() === creneau.jourSemaine &&
              estSemaineDue(contratChoisi.dateDebut, dateStr, contratChoisi.periodicite ?? 'semaine')) {
            const heureDebut = addMinutes(creneau.heureDebut, MARGE_ENTRE_SEANCES_MIN);
            seancesACreer.push({
              participantId: contratChoisi.participantId,
              contratId: contratChoisi.id,
              date: dateStr,
              heureDebut,
              heureFin: addMinutes(heureDebut, duree),
              dureeMinutes: duree,
              type: 'seance',
              statut: 'planifiee',
              adresse: adressePatient,
              coordonnees: patient.coordonnees
                ? { lat: patient.coordonnees.lat, lng: patient.coordonnees.lng }
                : undefined,
            });
          }
          cur.setDate(cur.getDate() + 1);
        }
      });
      await bulkCreerSeances(seancesACreer);
      toast.success(`${seancesACreer.length} séance${seancesACreer.length > 1 ? 's' : ''} créée${seancesACreer.length > 1 ? 's' : ''} pour ${patient.prenom} ✅`);
      onClose();
    } catch {
      toast.error('Erreur lors de la création des séances');
    } finally {
      setApplying(false);
    }
  }

  const nbBesoin = contratChoisi?.nbSeancesSemaine ?? 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1001 }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-dark">Insérer un patient</h2>
            <p className="text-xs text-gray-400 mt-0.5">Étape {etape} / 3</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-dark transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">

          {/* Étape 1 — Choisir le contrat */}
          {etape === 1 && (
            <>
              <p className="text-sm text-gray-500">Sélectionnez le patient à planifier.</p>
              {eligibles.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  Tous les patients actifs ont déjà des séances planifiées.
                </p>
              ) : (
                <div className="space-y-2">
                  {eligibles.map(c => {
                    const p = participants.find(x => x.id === c.participantId);
                    if (!p) return null;
                    const sel = contratChoisi?.id === c.id;
                    return (
                      <button key={c.id} onClick={() => setContratChoisi(c)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${sel ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-dark">{p.prenom} {p.nom}</span>
                          {sel && <Check size={14} className="text-primary flex-shrink-0" />}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {c.nbSeancesSemaine} séance{c.nbSeancesSemaine > 1 ? 's' : ''}/sem · {c.dureeMinutes} min
                          {c.periodicite && c.periodicite !== 'semaine' && ` · 1 sem. sur ${c.periodicite === 'deux_semaines' ? 2 : 3}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Étape 2 — Choisir les créneaux */}
          {etape === 2 && patient && contratChoisi && (
            <>
              <p className="text-sm text-gray-500">
                Choisissez {nbBesoin} créneau{nbBesoin > 1 ? 'x' : ''} pour{' '}
                <span className="font-semibold text-dark">{patient.prenom}</span>.
              </p>
              {creneauxLibres.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                  Aucun créneau libre détecté dans le planning. Planifiez d'abord d'autres séances.
                </div>
              ) : (
                <>
                  {estFallbackGlobal && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700">
                      Aucun patient dans le secteur de {patient.prenom} — créneaux libres du planning général.
                    </div>
                  )}
                </>
              )}
              {creneauxLibres.length > 0 && (
                <div className="space-y-2">
                  {creneauxLibres.map((c, i) => {
                    const key = `${c.jourSemaine}-${c.heureDebut}`;
                    const sel = creneauxChoisis.some(x => `${x.jourSemaine}-${x.heureDebut}` === key);
                    const disabled = !sel && creneauxChoisis.length >= nbBesoin;
                    const dureeAffichee = contratChoisi.dureeMinutes;
                    const heureFin = addMinutes(c.heureDebut, dureeAffichee);
                    return (
                      <button key={i} onClick={() => !disabled && toggleCreneau(c)} disabled={disabled}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${sel ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-semibold text-dark">{c.nomJour}</span>
                            <span className="text-sm text-gray-600 ml-2">{c.heureDebut} → {heureFin}</span>
                            {patient.adresseVille && (
                              <span className="text-xs text-gray-400 ml-2">· {patient.adresseVille}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{dureeAffichee} min</span>
                            {sel && <Check size={14} className="text-primary" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {creneauxChoisis.length > 0 && (
                <p className="text-xs text-primary font-medium">
                  {creneauxChoisis.length} / {nbBesoin} créneau{nbBesoin > 1 ? 'x' : ''} sélectionné{creneauxChoisis.length > 1 ? 's' : ''}
                </p>
              )}
            </>
          )}

          {/* Étape 3 — Résumé */}
          {etape === 3 && patient && contratChoisi && (
            <>
              <p className="text-sm text-gray-500">Vérifiez avant d'appliquer.</p>
              <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 w-16">Patient</span>
                  <span className="font-semibold text-dark">{patient.prenom} {patient.nom}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-gray-400 w-16 flex-shrink-0">Créneaux</span>
                  <div className="space-y-0.5">
                    {creneauxChoisis.map((c, i) => {
                      const duree = contratChoisi.dureesSeances[i] ?? contratChoisi.dureeMinutes;
                      const debut = addMinutes(c.heureDebut, MARGE_ENTRE_SEANCES_MIN);
                      return (
                        <div key={i} className="font-medium text-dark">
                          {c.nomJour} · {debut} – {addMinutes(debut, duree)}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t border-gray-200 pt-2">
                  <Calendar size={13} className="text-gray-400" />
                  <span className="text-gray-500">Fin de contrat :</span>
                  <span className="font-medium text-dark">
                    {new Date(contratChoisi.dateFin + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <Clock size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <span className="font-semibold text-primary">
                    {seancesTotal} séance{seancesTotal > 1 ? 's' : ''} à créer pour {patient.prenom}
                    {creneauxChoisis.length > 0 && (
                      <span className="font-normal text-gray-500">
                        {' · '}{creneauxChoisis.map((c, i) => {
                          const duree = contratChoisi.dureesSeances[i] ?? contratChoisi.dureeMinutes;
                          const debut = addMinutes(c.heureDebut, MARGE_ENTRE_SEANCES_MIN);
                          return `${c.nomJour.slice(0, 3)} ${debut}–${addMinutes(debut, duree)}`;
                        }).join(' · ')}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          {etape > 1 && (
            <button onClick={goBack}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Retour
            </button>
          )}
          {etape < 3 ? (
            <button onClick={handleNext} disabled={etape === 1 && eligibles.length === 0}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-40">
              Suivant
            </button>
          ) : (
            <button onClick={appliquer} disabled={applying}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-40">
              {applying ? <><Loader size={14} className="animate-spin" />Création…</> : 'Appliquer'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
