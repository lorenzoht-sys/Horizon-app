import { useState, useMemo } from 'react';
import { X, Calendar, Clock, Check, Loader } from 'lucide-react';
import { toast } from 'sonner';
import type { Participant, Contrat, Seance, IndisponibilitePierre, JourSemaine } from '../../types';
import { getTrousRecurrents, getCreneauxLibresGlobal, type CreneauLibre } from '../../lib/analyse-tournee';
import { getOrganisation } from '../../lib/anamnese';
import { addMinutes, genererDatesSeances, trouveChevauchements } from '../../utils/horaires';
import { MARGE_ENTRE_SEANCES_MIN } from '../../lib/planificateur';
import FrisePlanningJour from './FrisePlanningJour';

interface Props {
  onClose: () => void;
  participants: Participant[];
  contrats: Contrat[];
  seances: Seance[];
  indispos: IndisponibilitePierre[];
  bulkCreerSeances: (data: Omit<Seance, 'id'>[], options?: { ignorerChevauchements?: boolean }) => Promise<Seance[] | void>;
}

// Conversion jour numérique (Date.getDay()) → clé utilisée par
// genererDatesSeances (utils/horaires), pour partager la même logique de
// génération de dates récurrentes que PlanningGrilleView.
const DOW_KEY: Record<number, JourSemaine | 'dim'> = {
  0: 'dim', 1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven', 6: 'sam',
};

const ALL_WORK_DAYS: { cleJour: string; dow: number; nom: string; jourKey: JourSemaine }[] = [
  { cleJour: 'Lun', dow: 1, nom: 'Lundi',    jourKey: 'lun' },
  { cleJour: 'Mar', dow: 2, nom: 'Mardi',    jourKey: 'mar' },
  { cleJour: 'Mer', dow: 3, nom: 'Mercredi', jourKey: 'mer' },
  { cleJour: 'Jeu', dow: 4, nom: 'Jeudi',    jourKey: 'jeu' },
  { cleJour: 'Ven', dow: 5, nom: 'Vendredi', jourKey: 'ven' },
];

export default function ModalInsererPatient({ onClose, participants, contrats, seances, indispos, bulkCreerSeances }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [etape, setEtape] = useState<1 | 2 | 3>(1);
  const [contratChoisi, setContratChoisi] = useState<Contrat | null>(null);
  const [creneauxChoisis, setCreneauxChoisis] = useState<CreneauLibre[]>([]);
  const [applying, setApplying] = useState(false);
  const [jourForceIdx, setJourForceIdx] = useState(0);

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
    const global = getCreneauxLibresGlobal(seances, participants, patient.coordonnees, dispos, joursIndispos);
    return { creneauxLibres: global, estFallbackGlobal: true };
  }, [patient, seances, participants, contratChoisi, joursIndispos]);

  // Jours disponibles du patient filtrés selon les indispos Pierre — uniquement en mode force
  const joursDisposForce = useMemo(() => {
    if (!patient || !contratChoisi || creneauxLibres.length > 0) return [];
    const org = getOrganisation(patient);
    const joursDispos = org.joursDisponibles ?? [];
    return ALL_WORK_DAYS.filter(wd =>
      !joursIndispos.includes(wd.jourKey) &&
      (joursDispos.length === 0 || joursDispos.includes(wd.cleJour))
    );
  }, [patient, contratChoisi, creneauxLibres, joursIndispos]);

  // Fenêtres horaires du patient par jour (pour la zone verte de la frise)
  const windowsParJour = useMemo(() => {
    if (!patient || creneauxLibres.length > 0) return new Map<string, { debut: string; fin: string }[]>();
    const org = getOrganisation(patient);
    const map = new Map<string, { debut: string; fin: string }[]>();
    for (const wd of ALL_WORK_DAYS) {
      const creneauxJour = org.creneauxParJour?.[wd.cleJour];
      map.set(wd.cleJour, creneauxJour?.length ? creneauxJour : [{ debut: '08:00', fin: '19:00' }]);
    }
    return map;
  }, [patient, creneauxLibres]);

  // Séances existantes groupées par DOW (pour la frise)
  const seancesParDow = useMemo(() => {
    if (creneauxLibres.length > 0) return new Map<number, Seance[]>();
    const map = new Map<number, Seance[]>();
    for (const s of seances) {
      if (s.statut === 'annulee') continue;
      const dow = new Date(s.date + 'T12:00').getDay();
      const arr = map.get(dow) ?? [];
      arr.push(s);
      map.set(dow, arr);
    }
    return map;
  }, [creneauxLibres, seances]);

  const participantMap = useMemo(
    () => new Map(participants.map(p => [p.id, p])),
    [participants]
  );

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

  function selecterCreneauForce(dow: number, nomJour: string, heure: string | null) {
    if (!contratChoisi) return;
    if (heure === null) {
      setCreneauxChoisis(prev => prev.filter(c => c.jourSemaine !== dow));
      return;
    }
    const heureFin = addMinutes(heure, contratChoisi.dureeMinutes);
    setCreneauxChoisis(prev => {
      const filtered = prev.filter(c => c.jourSemaine !== dow);
      return [...filtered, { jourSemaine: dow, nomJour, heureDebut: heure, heureFin, dureeMinutes: contratChoisi.dureeMinutes }];
    });
  }

  function handleNext() {
    if (etape === 1) {
      if (!contratChoisi) { toast.error('Sélectionnez un bénéficiaire'); return; }
      setCreneauxChoisis([]);
      setJourForceIdx(0);
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

  // Liste des séances à créer, partagée entre le comptage (étape 3), la
  // détection de chevauchement et la création effective (appliquer) — évite
  // de recalculer/dupliquer la génération de dates récurrentes trois fois.
  const seancesACreer = useMemo((): Omit<Seance, 'id'>[] => {
    if (!contratChoisi || creneauxChoisis.length === 0 || !patient) return [];
    const adressePatient = [patient.adresseRue, patient.adresseCodePostal, patient.adresseVille]
      .filter(Boolean).join(', ');
    const startDate = contratChoisi.dateDebut >= today ? contratChoisi.dateDebut : today;
    const result: Omit<Seance, 'id'>[] = [];
    creneauxChoisis.forEach((creneau, idx) => {
      const duree = contratChoisi.dureesSeances[idx] ?? contratChoisi.dureeMinutes;
      const heureDebut = creneau.heureDebut;
      const dates = genererDatesSeances(
        startDate, contratChoisi.dateFin, DOW_KEY[creneau.jourSemaine],
        contratChoisi.periodicite ?? 'semaine', contratChoisi.dateDebut,
      );
      dates.forEach(dateStr => {
        result.push({
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
      });
    });
    return result;
  }, [contratChoisi, creneauxChoisis, patient, today]);

  const seancesTotal = seancesACreer.length;

  const conflits = useMemo(
    () => trouveChevauchements(seances, seancesACreer),
    [seances, seancesACreer],
  );

  async function appliquer(ignorerChevauchements = false) {
    if (!contratChoisi || seancesACreer.length === 0 || !patient) return;
    setApplying(true);
    try {
      await bulkCreerSeances(seancesACreer, { ignorerChevauchements });
      toast.success(`${seancesACreer.length} séance${seancesACreer.length > 1 ? 's' : ''} créée${seancesACreer.length > 1 ? 's' : ''} pour ${patient.prenom} ✅`);
      onClose();
    } catch {
      toast.error('Erreur lors de la création des séances');
    } finally {
      setApplying(false);
    }
  }

  const nbBesoin = contratChoisi?.nbSeancesSemaine ?? 1;
  const enModeForce = etape === 2 && joursDisposForce.length > 0;
  const vraimentAucun = etape === 2 && creneauxLibres.length === 0 && joursDisposForce.length === 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1001 }}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${enModeForce ? 'max-w-lg' : 'max-w-md'} max-h-[90vh] flex flex-col`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-dark">Insérer un bénéficiaire</h2>
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
              <p className="text-sm text-gray-500">Sélectionnez le bénéficiaire à planifier.</p>
              {eligibles.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  Tous les bénéficiaires actifs ont déjà des séances planifiées.
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
              {/* Mode normal : créneaux auto trouvés */}
              {creneauxLibres.length > 0 && (
                <>
                  <p className="text-sm text-gray-500">
                    Choisissez {nbBesoin} créneau{nbBesoin > 1 ? 'x' : ''} pour{' '}
                    <span className="font-semibold text-dark">{patient.prenom}</span>.
                  </p>
                  {estFallbackGlobal && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700">
                      Aucun bénéficiaire dans le secteur de {patient.prenom} — créneaux libres du planning général.
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
                  {creneauxChoisis.length > 0 && (
                    <p className="text-xs text-primary font-medium">
                      {creneauxChoisis.length} / {nbBesoin} créneau{nbBesoin > 1 ? 'x' : ''} sélectionné{creneauxChoisis.length > 1 ? 's' : ''}
                    </p>
                  )}
                </>
              )}

              {/* Mode force : frises journalières */}
              {enModeForce && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      Aucun créneau libre détecté — sélectionnez{' '}
                      <span className="font-medium text-dark">manuellement</span> sur la frise.
                    </p>
                  </div>
                  <p className="text-xs text-gray-400">
                    {creneauxChoisis.length} / {nbBesoin} créneau{nbBesoin > 1 ? 'x' : ''} sélectionné{creneauxChoisis.length > 1 ? 's' : ''}
                    {' · '}Zones vertes = disponibilités de {patient.prenom}
                  </p>

                  {/* Onglets jours */}
                  <div className="flex gap-1 border-b border-gray-200 -mx-1 px-1">
                    {joursDisposForce.map((wd, idx) => {
                      const hasSel = creneauxChoisis.some(c => c.jourSemaine === wd.dow);
                      return (
                        <button
                          key={wd.dow}
                          onClick={() => setJourForceIdx(idx)}
                          className={`relative px-3 py-2 text-xs font-medium transition-colors rounded-t ${
                            idx === jourForceIdx
                              ? 'bg-white border-x border-t border-gray-200 text-dark -mb-px z-10'
                              : 'text-gray-500 hover:text-dark'
                          }`}
                        >
                          {wd.nom.slice(0, 3)}
                          {hasSel && (
                            <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-primary align-middle" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Frise du jour actif */}
                  {(() => {
                    const wd = joursDisposForce[jourForceIdx];
                    if (!wd) return null;
                    const selCreneau = creneauxChoisis.find(c => c.jourSemaine === wd.dow);
                    const hasThisDow = !!selCreneau;
                    const canSelectHere = creneauxChoisis.length < nbBesoin || hasThisDow;
                    return (
                      <FrisePlanningJour
                        seancesDuJour={seancesParDow.get(wd.dow) ?? []}
                        participantMap={participantMap}
                        dureeNouveau={contratChoisi.dureeMinutes}
                        windowsPatient={windowsParJour.get(wd.cleJour) ?? [{ debut: '08:00', fin: '19:00' }]}
                        selectedHeure={selCreneau?.heureDebut ?? null}
                        onSelect={(heure) => selecterCreneauForce(wd.dow, wd.nom, heure)}
                        canSelect={canSelectHere}
                      />
                    );
                  })()}
                </>
              )}

              {/* Vraiment aucun créneau possible (aucun jour dispo en commun) */}
              {vraimentAucun && (
                <div className="py-4">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Aucun créneau disponible pour ce bénéficiaire. Ses disponibilités sont incompatibles avec le planning actuel. Contactez le bénéficiaire pour élargir ses créneaux.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Étape 3 — Résumé */}
          {etape === 3 && patient && contratChoisi && (
            <>
              <p className="text-sm text-gray-500">Vérifiez avant d'appliquer.</p>
              <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 w-16">Bénéficiaire</span>
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

              {conflits.length > 0 && (() => {
                const premier = conflits[0];
                const nomExistant = participants.find(p => p.id === premier.existante.participantId);
                return (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-red-700">
                      Ce créneau chevauche une séance existante avec{' '}
                      {nomExistant ? `${nomExistant.prenom} ${nomExistant.nom[0]}.` : 'un autre bénéficiaire'}
                      {' '}le {new Date(premier.creneau.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' '}({premier.existante.heureDebut}–{premier.existante.heureFin})
                      — continuer quand même ?
                    </p>
                    {conflits.length > 1 && (
                      <p className="text-xs text-red-500 mt-1">
                        {conflits.length} des {seancesTotal} séances générées sont concernées.
                      </p>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          {vraimentAucun ? (
            <button onClick={onClose}
              className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-dark transition-colors">
              Fermer
            </button>
          ) : (
            <>
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
                <button onClick={() => appliquer(conflits.length > 0)} disabled={applying}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 ${
                    conflits.length > 0
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-primary text-white hover:bg-dark'
                  }`}>
                  {applying
                    ? <><Loader size={14} className="animate-spin" />Création…</>
                    : conflits.length > 0 ? 'Appliquer quand même' : 'Appliquer'}
                </button>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
