import { useState, useMemo } from 'react';
import { X, Calendar, Clock, Check, Loader, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { Participant, Contrat, Seance, IndisponibilitePierre, JourSemaine } from '../../types';
import { getTrousRecurrents, getCreneauxLibresGlobal, type CreneauLibre } from '../../lib/analyse-tournee';
import { getOrganisation } from '../../lib/anamnese';
import { addMinutes, estSemaineDue, heureEnMinutes, minutesEnHeure } from '../../utils/horaires';
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
  const [modeForce, setModeForce] = useState(false);

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

  const participantParId = useMemo(
    () => new Map(participants.map(p => [p.id, p])),
    [participants]
  );

  const WORK_DAYS: { dow: number; jourKey: JourSemaine; nom: string; cleJour: string }[] = [
    { dow: 1, jourKey: 'lun', nom: 'Lundi',    cleJour: 'Lun' },
    { dow: 2, jourKey: 'mar', nom: 'Mardi',    cleJour: 'Mar' },
    { dow: 3, jourKey: 'mer', nom: 'Mercredi', cleJour: 'Mer' },
    { dow: 4, jourKey: 'jeu', nom: 'Jeudi',    cleJour: 'Jeu' },
    { dow: 5, jourKey: 'ven', nom: 'Vendredi', cleJour: 'Ven' },
  ];

  const { creneauxLibres, estFallbackGlobal } = useMemo(() => {
    if (!patient || !contratChoisi) return { creneauxLibres: [], estFallbackGlobal: false };
    const org = getOrganisation(patient);
    const dispos = { joursDisponibles: org.joursDisponibles, creneauxParJour: org.creneauxParJour };
    const zone = getTrousRecurrents(seances, participants, patient.adresseVille ?? '', patient.coordonnees, dispos, joursIndispos);
    if (zone.length > 0) return { creneauxLibres: zone, estFallbackGlobal: false };
    const global = getCreneauxLibresGlobal(seances, participants, patient.coordonnees, dispos, joursIndispos);
    return { creneauxLibres: global, estFallbackGlobal: true };
  }, [patient, seances, participants, contratChoisi, joursIndispos]);

  const creneauxForce = useMemo(() => {
    if (!modeForce || !patient || !contratChoisi) return [];
    const org = getOrganisation(patient);
    const slots: CreneauLibre[] = [];
    for (const { dow, jourKey, nom, cleJour } of WORK_DAYS) {
      if (joursIndispos.includes(jourKey)) continue;
      const joursDispos = org.joursDisponibles ?? [];
      if (joursDispos.length > 0 && !joursDispos.includes(cleJour)) continue;
      const creneauxJour = org.creneauxParJour?.[cleJour];
      const windows: { debut: string; fin: string }[] = creneauxJour?.length
        ? creneauxJour
        : [{ debut: '08:00', fin: '19:00' }];
      for (const win of windows) {
        let t = heureEnMinutes(win.debut);
        const tMax = heureEnMinutes(win.fin) - contratChoisi.dureeMinutes;
        while (t <= tMax) {
          slots.push({
            jourSemaine: dow,
            nomJour: nom,
            heureDebut: minutesEnHeure(t),
            heureFin: minutesEnHeure(t + contratChoisi.dureeMinutes),
            dureeMinutes: contratChoisi.dureeMinutes,
          });
          t += 15;
        }
      }
    }
    return slots;
  }, [modeForce, patient, contratChoisi, joursIndispos]);

  // Pour chaque jour de semaine (DOW), liste des plages horaires des séances existantes
  const seancesParDow = useMemo(() => {
    if (!modeForce) return new Map<number, { debutMin: number; finMin: number; participantId: string }[]>();
    const map = new Map<number, { debutMin: number; finMin: number; participantId: string }[]>();
    for (const s of seances) {
      if (s.statut === 'annulee') continue;
      const dow = new Date(s.date + 'T12:00').getDay();
      const arr = map.get(dow) ?? [];
      arr.push({ debutMin: heureEnMinutes(s.heureDebut), finMin: heureEnMinutes(s.heureFin), participantId: s.participantId });
      map.set(dow, arr);
    }
    return map;
  }, [modeForce, seances]);

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
      setModeForce(false);
      setEtape(2);
    } else if (etape === 2) {
      if (creneauxChoisis.length === 0) { toast.error('Sélectionnez au moins un créneau'); return; }
      setEtape(3);
    }
  }

  function goBack() {
    if (etape === 3) setEtape(2);
    else if (etape === 2) { setModeForce(false); setEtape(1); }
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
            const heureDebut = creneau.heureDebut;
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

              {/* Mode automatique — créneaux trouvés */}
              {creneauxLibres.length > 0 && (
                <>
                  {estFallbackGlobal && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700">
                      Aucun patient dans le secteur de {patient.prenom} — créneaux libres du planning général.
                    </div>
                  )}
                  <div className="space-y-2">
                    {creneauxLibres.map((c, i) => {
                      const key = `${c.jourSemaine}-${c.heureDebut}`;
                      const sel = creneauxChoisis.some(x => `${x.jourSemaine}-${x.heureDebut}` === key);
                      const disabled = !sel && creneauxChoisis.length >= nbBesoin;
                      const heureFin = addMinutes(c.heureDebut, contratChoisi.dureeMinutes);
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
                              <span className="text-xs text-gray-400">{contratChoisi.dureeMinutes} min</span>
                              {sel && <Check size={14} className="text-primary" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Aucun créneau automatique — proposition du mode force */}
              {creneauxLibres.length === 0 && !modeForce && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm text-amber-700">
                    Aucun créneau libre détecté dans le planning pour {patient.prenom}.
                  </p>
                  <button
                    onClick={() => setModeForce(true)}
                    className="w-full py-2 text-sm font-medium text-amber-800 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    Sélectionner manuellement
                  </button>
                </div>
              )}

              {/* Mode force — sélection manuelle */}
              {modeForce && (
                <>
                  <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
                    <AlertTriangle size={14} className="text-orange-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-orange-700">
                      Mode force — créneau potentiellement occupé. Vérifiez le planning après insertion.
                    </p>
                  </div>
                  {creneauxForce.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      Aucun jour disponible en commun avec {patient.prenom}.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {WORK_DAYS.filter(wd => creneauxForce.some(c => c.jourSemaine === wd.dow)).map(wd => {
                        const slotsJour = creneauxForce.filter(c => c.jourSemaine === wd.dow);
                        return (
                          <div key={wd.dow}>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{wd.nom}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {slotsJour.map((c, i) => {
                                const key = `${c.jourSemaine}-${c.heureDebut}`;
                                const sel = creneauxChoisis.some(x => `${x.jourSemaine}-${x.heureDebut}` === key);
                                const disabled = !sel && creneauxChoisis.length >= nbBesoin;
                                const debutMin = heureEnMinutes(c.heureDebut);
                                const collision = (seancesParDow.get(c.jourSemaine) ?? []).find(
                                  s => s.debutMin <= debutMin && debutMin < s.finMin
                                );
                                const occupant = collision ? participantParId.get(collision.participantId) : null;
                                return (
                                  <button
                                    key={i}
                                    onClick={() => !disabled && toggleCreneau(c)}
                                    disabled={disabled}
                                    className={`px-2.5 py-1.5 text-xs rounded-lg border font-medium transition-colors flex flex-col items-center min-w-[52px]
                                      ${sel
                                        ? 'bg-primary border-primary text-white'
                                        : occupant
                                          ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
                                          : 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'}
                                      ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                  >
                                    <span>{c.heureDebut}</span>
                                    {!sel && (
                                      <span className="text-[10px] leading-tight font-normal mt-0.5 opacity-80">
                                        {occupant ? occupant.prenom : 'Libre'}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
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
              {modeForce && (
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                  <AlertTriangle size={13} className="text-orange-500 flex-shrink-0" />
                  <p className="text-xs text-orange-700 font-medium">Créneau forcé — vérifiez le planning pour les conflits.</p>
                </div>
              )}
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
