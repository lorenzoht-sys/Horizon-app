import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import { useContrats } from '../hooks/useContrats';
import { useAgenda } from '../hooks/useAgenda';
import PageWrapper from '../components/layout/PageWrapper';
import { ArrowLeft, Check, Calendar, Hash, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { calculerNbSeancesEstime, calculerDateFinParFrequence } from '../utils/horaires';
import { getOrganisation, getJoursDisponiblesCourts } from '../lib/anamnese';

const JOURS_DISPO_LIST = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] as const;
const FREQUENCES = [1, 2, 3, 4] as const;
// Heure de départ utilisée pour générer les séances initiales — sans incidence
// réelle, le planificateur de tournée détermine les heures réelles de passage.
const HEURE_DEBUT_DEFAUT = '08:00';

type ModePeriode = 'duree' | 'seances';

export default function ContratNouveauPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { participants } = useParticipants();
  const { creerContrat } = useContrats();
  const { bulkCreerSeances } = useAgenda();

  const participant = participants.find(p => p.id === id);
  const bilanInitial = participant?.bilans.find(b => b.type === 'initial');

  // Disponibilités : fiche patient (organisation des séances), avec repli sur l'ancien bilan initial.
  const organisation = participant ? getOrganisation(participant, bilanInitial) : null;
  const joursDisponibles = participant ? getJoursDisponiblesCourts(participant, bilanInitial) : [];
  const creneauxParJour: Record<string, { debut: string; fin: string }[]> = organisation?.creneauxParJour ?? {};
  const joursDispoLabels = JOURS_DISPO_LIST.filter(j => (organisation?.joursDisponibles ?? []).includes(j));

  const [mode, setMode] = useState<ModePeriode>('duree');
  const [nbSeancesSemaine, setNbSeancesSemaine] = useState(2);
  // Durée de chaque séance de la semaine, dans l'ordre chronologique (séance 1, séance 2...).
  const [dureesSeances, setDureesSeances] = useState<number[]>([45, 45]);
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().split('T')[0]);
  const [dateFin, setDateFin] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0];
  });
  const [dureeIndeterminee, setDureeIndeterminee] = useState(false);
  const [nbSeancesPrescrites, setNbSeancesPrescrites] = useState(12);
  const [notes, setNotes] = useState('');
  const [exclureTournee, setExclureTournee] = useState(false);

  // Préremplit la fréquence et les durées depuis les préférences saisies sur la fiche patient.
  useEffect(() => {
    if (!organisation) return;
    const n = organisation.nbSeancesSemaine ?? nbSeancesSemaine;
    if (organisation.nbSeancesSemaine) setNbSeancesSemaine(organisation.nbSeancesSemaine);

    if (organisation.dureesSeances && organisation.dureesSeances.length > 0) {
      setDureesSeances(Array.from({ length: n }, (_, i) => organisation.dureesSeances![i] ?? 45));
    } else {
      const duree = parseInt(String(organisation.dureeSeance ?? '')) || null;
      if (duree) setDureesSeances(Array.from({ length: n }, () => duree));
    }
  }, [organisation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redimensionne le tableau de durées quand la fréquence change — conserve
  // les valeurs déjà saisies, complète à 45 min pour les nouvelles séances.
  useEffect(() => {
    setDureesSeances(prev => Array.from({ length: nbSeancesSemaine }, (_, i) => prev[i] ?? 45));
  }, [nbSeancesSemaine]);

  // Pour "durée indéterminée", générer 6 mois de séances par défaut
  const dateFinPourGeneration = (() => {
    if (mode !== 'duree' || !dureeIndeterminee) return dateFin;
    const d = new Date(dateDebut);
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().split('T')[0];
  })();

  const nbSeances = mode === 'duree'
    ? (dateDebut && dateFinPourGeneration ? calculerNbSeancesEstime(dateDebut, dateFinPourGeneration, nbSeancesSemaine) : 0)
    : nbSeancesPrescrites;

  const dateFinEffective = mode === 'seances'
    ? calculerDateFinParFrequence(dateDebut, nbSeancesSemaine, nbSeancesPrescrites)
    : dateFinPourGeneration;

  function heureFinCalc(dureeMinutes: number): string {
    const [h, m] = HEURE_DEBUT_DEFAUT.split(':').map(Number);
    const total = h * 60 + m + dureeMinutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function setDureeSeance(i: number, valeur: number) {
    setDureesSeances(prev => prev.map((d, j) => j === i ? valeur : d));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!participant) return;
    if (!dateDebut) {
      toast.error('Remplissez tous les champs obligatoires');
      return;
    }

    const adresse = [participant.adresseRue, participant.adresseCodePostal, participant.adresseVille]
      .filter(Boolean).join(', ');
    const coordonnees = participant.coordonnees
      ? { lat: participant.coordonnees.lat, lng: participant.coordonnees.lng }
      : undefined;

    // Placement initial simple (premiers jours disponibles) — affiné ensuite
    // par le planificateur de tournée, qui optimise les trajets.
    const joursPourGeneration = joursDisponibles.slice(0, nbSeancesSemaine);

    try {
      const result = await creerContrat(
        {
          participantId: participant.id,
          dateDebut,
          dateFin: dateFinEffective,
          nbSeancesSemaine,
          joursPourGeneration,
          heureDebut: HEURE_DEBUT_DEFAUT,
          dureesSeances,
          statut: 'actif',
          notes: notes || undefined,
          dureeIndeterminee: dureeIndeterminee || undefined,
          exclureTournee,
        },
        adresse,
        coordonnees
      );

      await bulkCreerSeances(result.seancesData);
      toast.success(
        result.seancesData.length > 0
          ? `Contrat créé — ${result.seancesData.length} séances générées automatiquement`
          : 'Contrat créé — renseignez les disponibilités du patient pour générer les séances'
      );
      navigate(`/participant/${participant.id}`);
    } catch (err) {
      console.error('Erreur création contrat:', err);
      toast.error('Erreur lors de la création du contrat. Vérifie la console pour le détail.');
    }
  }

  if (!participant) {
    return (
      <PageWrapper>
        <div className="text-center py-20 text-gray-400">Participant introuvable</div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Link
        to={`/participant/${id}`}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-6 transition-colors"
      >
        <ArrowLeft size={15} />
        Retour au profil
      </Link>

      <div className="mb-6">
        <h1 className="font-heading font-bold text-dark text-2xl">Nouveau contrat de suivi</h1>
        <p className="text-gray-500 text-sm mt-1">{participant.prenom} {participant.nom}</p>
      </div>

      <div className="max-w-xl">
        {/* Disponibilités du patient — lecture seule, les jours réels de passage
            sont décidés par le planificateur de tournée. */}
        {joursDispoLabels.length > 0 ? (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 mb-6">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
              Disponibilités du patient
            </div>
            <div className="text-sm text-blue-800">
              Ce patient est disponible :{' '}
              {joursDispoLabels.map(j =>
                (creneauxParJour[j]?.length ?? 0) > 0
                  ? `${j.toLowerCase()} ${creneauxParJour[j].map(c => `${c.debut}-${c.fin}`).join(', ')}`
                  : j.toLowerCase()
              ).join(', ')}
            </div>
            {organisation?.contraintes && (
              <div className="text-xs text-blue-600 mt-1 italic">"{organisation.contraintes}"</div>
            )}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-6 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              Renseignez d'abord les disponibilités de ce patient pour que le planificateur
              puisse générer les séances. Le contrat peut être créé sans, mais aucune séance
              ne sera placée automatiquement.{' '}
              <Link to={`/participants/${id}/modifier`} className="font-semibold underline">
                Aller à la fiche patient
              </Link>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">

          {/* Mode durée vs nombre de séances */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Définir la durée par
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('duree')}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 text-sm font-semibold transition-colors"
                style={{
                  borderColor: mode === 'duree' ? '#1A5F9E' : '#E2EEF9',
                  background: mode === 'duree' ? '#E6F1FB' : 'white',
                  color: mode === 'duree' ? '#1A5F9E' : '#4A6080',
                }}
              >
                <Calendar size={15} />
                Date de fin
              </button>
              <button
                type="button"
                onClick={() => setMode('seances')}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 text-sm font-semibold transition-colors"
                style={{
                  borderColor: mode === 'seances' ? '#1A5F9E' : '#E2EEF9',
                  background: mode === 'seances' ? '#E6F1FB' : 'white',
                  color: mode === 'seances' ? '#1A5F9E' : '#4A6080',
                }}
              >
                <Hash size={15} />
                Nombre de séances
              </button>
            </div>
          </div>

          {/* Période */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Période</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Date de début *</label>
                <input
                  type="date"
                  value={dateDebut}
                  onChange={e => setDateDebut(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
                />
              </div>

              {mode === 'duree' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-500">Date de fin</label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                      <input type="checkbox" checked={dureeIndeterminee} onChange={e => setDureeIndeterminee(e.target.checked)}
                        className="accent-primary rounded" />
                      Durée indéterminée
                    </label>
                  </div>
                  {dureeIndeterminee ? (
                    <div className="w-full border border-dashed border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-400 bg-gray-50 text-center">
                      Sans terme défini
                    </div>
                  ) : (
                    <input
                      type="date"
                      value={dateFin}
                      onChange={e => setDateFin(e.target.value)}
                      required={!dureeIndeterminee}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
                    />
                  )}
                  {dureeIndeterminee && (
                    <div className="text-xs text-gray-400 mt-1">
                      6 mois de séances générées initialement
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Séances prescrites *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={nbSeancesPrescrites}
                    onChange={e => setNbSeancesPrescrites(Math.max(1, Number(e.target.value)))}
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
                  />
                  <div className="text-xs text-gray-400 mt-1">
                    Fin : {dateFinEffective
                      ? new Date(dateFinEffective + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                      : '—'}
                  </div>
                </div>
              )}
            </div>

            {mode === 'duree' && nbSeances > 0 && (
              <div className="mt-2 text-xs text-primary font-medium">
                → {nbSeances} séances sur cette période
              </div>
            )}
          </div>

          {/* Fréquence */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Séances par semaine *
            </div>
            <div className="flex gap-2 flex-wrap">
              {FREQUENCES.map(n => {
                const selected = nbSeancesSemaine === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNbSeancesSemaine(n)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors"
                    style={{
                      borderColor: selected ? '#1A5F9E' : '#E2EEF9',
                      background: selected ? '#1A5F9E' : 'white',
                      color: selected ? 'white' : '#4A6080',
                    }}
                  >
                    {n}×
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Les jours réels de passage sont décidés par le planificateur de tournée,
              selon les disponibilités du patient et l'optimisation des trajets.
            </p>
          </div>

          {/* Durée par séance — une séance peut durer plus ou moins longtemps qu'une autre */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Durée de chaque séance
            </div>
            <div className="grid grid-cols-2 gap-4">
              {dureesSeances.map((duree, i) => (
                <div key={i}>
                  <label className="block text-xs text-gray-500 mb-1.5">Séance {i + 1}</label>
                  <select
                    value={duree}
                    onChange={e => setDureeSeance(i, Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
                  >
                    {[30, 45, 60, 90, 120].map(d => (
                      <option key={d} value={d}>{d} min</option>
                    ))}
                  </select>
                  <div className="text-xs text-gray-400 mt-1">Fin à {heureFinCalc(duree)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Exclusion de la tournée */}
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={exclureTournee}
                onChange={e => setExclureTournee(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-gray-700">Ne pas inclure dans l'optimisation de tournée</span>
            </label>
            <p className="text-xs text-gray-400 mt-1.5 ml-6">
              Ce patient reste visible partout ailleurs dans l'app, mais le planificateur
              (semaine ponctuelle et planning récurrent) ne lui proposera jamais de séance.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Ex : 24 séances prescrites par le Dr Martin (2×/semaine)…"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Récapitulatif */}
          <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-1 text-sm">
            <div className="font-semibold text-dark mb-2">Récapitulatif</div>
            <div className="text-gray-700">
              📅 <strong>{nbSeancesSemaine} séance{nbSeancesSemaine > 1 ? 's' : ''}/semaine</strong>
              {nbSeances > 0 && ` — ~${nbSeances} séances sur la période`}
            </div>
            <div className="text-gray-600">
              📆 Du {new Date(dateDebut + 'T12:00').toLocaleDateString('fr-FR')} au{' '}
              {new Date(dateFinEffective + 'T12:00').toLocaleDateString('fr-FR')}
            </div>
            <div className="text-gray-600">⏱ {dureesSeances.map(d => `${d} min`).join(', ')}</div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-3 font-semibold text-sm hover:bg-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check size={16} />
              Créer le contrat et générer les séances
            </button>
            <Link
              to={`/participant/${id}`}
              className="px-5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-sm flex items-center"
            >
              Annuler
            </Link>
          </div>
        </form>
      </div>
    </PageWrapper>
  );
}
