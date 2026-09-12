import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import { useContrats } from '../hooks/useContrats';
import { useAgenda } from '../hooks/useAgenda';
import PageWrapper from '../components/layout/PageWrapper';
import { ArrowLeft, Check, Calendar, Hash, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { calculerNbSeancesEstime, calculerDateFinParFrequence, CYCLE_SEMAINES } from '../utils/horaires';
import { validerNouveauContrat } from '../utils/contratValidation';
import { getOrganisation, OPTIONS_FREQUENCE, trouverOptionFrequence, type OptionFrequence } from '../lib/anamnese';
import { getTrousRecurrents } from '../lib/analyse-tournee';
import type { JourSemaine } from '../types';

const JOURS_DISPO_LIST = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;
const FREQUENCE_DEFAUT = OPTIONS_FREQUENCE[1]; // 2 séances/semaine

const HEURE_DEBUT_DEFAUT = '08:00';

// Jours de séance : clé persistée (contrats.jours_fixe) + libellé affiché.
const JOURS_SEANCE_OPTIONS: { key: JourSemaine | 'dim'; label: string }[] = [
  { key: 'lun', label: 'Lun' }, { key: 'mar', label: 'Mar' }, { key: 'mer', label: 'Mer' },
  { key: 'jeu', label: 'Jeu' }, { key: 'ven', label: 'Ven' }, { key: 'sam', label: 'Sam' },
  { key: 'dim', label: 'Dim' },
];

type ModePeriode = 'duree' | 'seances';

export default function ContratNouveauPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { participants } = useParticipants();
  const { creerContrat } = useContrats();

  const { seances } = useAgenda();
  const participant = participants.find(p => p.id === id);
  const bilanInitial = participant?.bilans.find(b => b.type === 'initial');

  // Disponibilités : fiche patient (organisation des séances), avec repli sur l'ancien bilan initial.
  const organisation = participant ? getOrganisation(participant, bilanInitial) : null;
  const creneauxParJour: Record<string, { debut: string; fin: string }[]> = organisation?.creneauxParJour ?? {};
  const joursDispoLabels = JOURS_DISPO_LIST.filter(j => (organisation?.joursDisponibles ?? []).includes(j));

  const [mode, setMode] = useState<ModePeriode>('duree');
  const [frequence, setFrequence] = useState<OptionFrequence>(FREQUENCE_DEFAUT);
  const nbSeancesSemaine = frequence.nbSeancesSemaine;
  const periodicite = frequence.periodicite;
  // Taux hebdomadaire effectif — dilué pour un cycle de 2/3 semaines (1 séance
  // toutes les 2 semaines = 0.5/semaine) ; utilisé pour les estimations de
  // durée/nombre de séances, qui raisonnent en taux par semaine.
  const tauxHebdo = nbSeancesSemaine / CYCLE_SEMAINES[periodicite];
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
  // Jours de séance — obligatoire, même longueur que nbSeancesSemaine (voir
  // validerNouveauContrat). Persisté sur contrats.jours_fixe : source
  // exclusive du motif hebdomadaire pour le renouvellement automatique
  // (api/_lib/renouvellementContrats.ts), jamais déduit des séances générées.
  const [joursSelectionnes, setJoursSelectionnes] = useState<(JourSemaine | 'dim')[]>([]);

  function toggleJour(jour: JourSemaine | 'dim') {
    setJoursSelectionnes(prev => prev.includes(jour) ? prev.filter(j => j !== jour) : [...prev, jour]);
  }

  // Préremplit la fréquence et les durées depuis les préférences saisies sur la fiche patient.
  useEffect(() => {
    if (!organisation) return;
    const n = organisation.nbSeancesSemaine ?? nbSeancesSemaine;
    const match = trouverOptionFrequence(organisation.nbSeancesSemaine, organisation.periodicite);
    if (match) setFrequence(match);

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

  // Pour "durée indéterminée", générer 1 an de séances par défaut — cohérent
  // avec le cycle de renouvellement automatique (api/cron/renouveler-contrats.ts,
  // MARGE_RENOUVELLEMENT_JOURS) qui prolonge date_fin d'un an à chaque passage.
  const dateFinPourGeneration = (() => {
    if (mode !== 'duree' || !dureeIndeterminee) return dateFin;
    const d = new Date(dateDebut);
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  })();

  const nbSeances = mode === 'duree'
    ? (dateDebut && dateFinPourGeneration ? calculerNbSeancesEstime(dateDebut, dateFinPourGeneration, tauxHebdo) : 0)
    : nbSeancesPrescrites;

  const dateFinEffective = mode === 'seances'
    ? calculerDateFinParFrequence(dateDebut, tauxHebdo, nbSeancesPrescrites)
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

    const erreurValidation = validerNouveauContrat({
      modeDuree: mode,
      dureeIndeterminee,
      dateFin,
      joursFixe: joursSelectionnes,
      nbSeancesSemaine,
    });
    if (erreurValidation) {
      toast.error(erreurValidation);
      return;
    }

    try {
      await creerContrat({
        participantId: participant.id,
        dateDebut,
        dateFin: dateFinEffective,
        joursFixe: joursSelectionnes,
        nbSeancesSemaine,
        periodicite,
        heureDebut: HEURE_DEBUT_DEFAUT,
        dureesSeances,
        statut: 'actif',
        notes: notes || undefined,
        dureeIndeterminee: dureeIndeterminee || undefined,
        exclureTournee,
      });

      toast.success('Contrat créé. Allez sur Tournée → Planifier pour générer votre planning.');
      navigate(`/participant/${participant.id}`);
    } catch (err) {
      console.error('Erreur création contrat:', err);
      toast.error('Erreur lors de la création du contrat. Vérifie la console pour le détail.');
    }
  }

  // Créneaux libres récurrents dans la zone du nouveau patient (rayon 5 km, repli ville)
  const creneauxSuggeres = useMemo(() =>
    getTrousRecurrents(
      seances,
      participants,
      participant?.adresseVille ?? '',
      participant?.coordonnees ?? undefined,
    ),
    [seances, participants, participant?.adresseVille, participant?.coordonnees]
  );

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
              Disponibilités du bénéficiaire
            </div>
            <div className="text-sm text-blue-800">
              Ce bénéficiaire est disponible :{' '}
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
              Renseignez d'abord les disponibilités de ce bénéficiaire pour que le planificateur
              puisse générer les séances. Le contrat peut être créé sans, mais aucune séance
              ne sera placée automatiquement.{' '}
              <Link to={`/participants/${id}/modifier`} className="font-semibold underline">
                Aller à la fiche bénéficiaire
              </Link>
            </div>
          </div>
        )}

        {/* Suggestion de créneaux — uniquement si des trous récurrents existent dans la même ville */}
        {creneauxSuggeres.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 mb-6">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1.5">
              💡 Créneaux disponibles dans votre planning
            </div>
            <p className="text-sm text-blue-800 mb-2">
              Ce bénéficiaire habite <span className="font-semibold">{participant.adresseVille}</span>. Dans votre planning actuel, vous avez des trous récurrents dans cette zone :
            </p>
            <ul className="space-y-0.5">
              {creneauxSuggeres.map((c, i) => (
                <li key={i} className="text-sm text-blue-700">
                  · <span className="font-medium">{c.nomJour} {c.heureDebut}–{c.heureFin}</span>
                  <span className="text-blue-500"> ({c.dureeMinutes} min libres)</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-blue-500 mt-2">Ces créneaux pourraient correspondre aux disponibilités du bénéficiaire.</p>
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

              {mode === 'seances' && (
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

          {/* Durée du suivi — deux choix mutuellement exclusifs (jamais une
              case à cocher à côté d'un champ toujours visible) : aucun état
              ambigu n'est représentable. */}
          {mode === 'duree' && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Durée du suivi *</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDureeIndeterminee(true)}
                  className="text-left px-4 py-2.5 rounded-xl border-2 transition-colors"
                  style={{
                    borderColor: dureeIndeterminee ? '#1A5F9E' : '#E2EEF9',
                    background: dureeIndeterminee ? '#E6F1FB' : 'white',
                  }}
                >
                  <div className="text-sm font-semibold" style={{ color: dureeIndeterminee ? '#1A5F9E' : '#374151' }}>
                    Sans date de fin
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Les séances continuent tant que le suivi n'est pas arrêté
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setDureeIndeterminee(false)}
                  className="text-left px-4 py-2.5 rounded-xl border-2 transition-colors"
                  style={{
                    borderColor: !dureeIndeterminee ? '#1A5F9E' : '#E2EEF9',
                    background: !dureeIndeterminee ? '#E6F1FB' : 'white',
                  }}
                >
                  <div className="text-sm font-semibold" style={{ color: !dureeIndeterminee ? '#1A5F9E' : '#374151' }}>
                    Jusqu'à une date précise
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Les séances s'arrêtent à la date choisie
                  </div>
                </button>
              </div>

              {dureeIndeterminee ? (
                <div className="text-xs text-gray-400 mt-2">
                  1 an de séances générées initialement — renouvelé automatiquement ensuite
                </div>
              ) : (
                <input
                  type="date"
                  value={dateFin}
                  onChange={e => setDateFin(e.target.value)}
                  required
                  className="mt-2 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
                />
              )}
            </div>
          )}

          {/* Fréquence */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Fréquence *
            </div>
            <div className="grid grid-cols-2 gap-2">
              {OPTIONS_FREQUENCE.map(opt => {
                const selected = frequence.key === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFrequence(opt)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors text-left"
                    style={{
                      borderColor: selected ? '#2BBFBF' : '#D1D5DB',
                      background: selected ? '#2BBFBF' : 'white',
                      color: selected ? 'white' : '#374151',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              L'heure exacte de chaque séance reste ajustable via le planificateur de
              tournée (disponibilités du bénéficiaire, optimisation des trajets) ; les
              jours choisis ci-dessous pilotent le renouvellement automatique du contrat.
            </p>
          </div>

          {/* Jours de séance — obligatoire, même longueur que la fréquence
              choisie (voir validerNouveauContrat). Persisté sur
              contrats.jours_fixe : seule source du motif hebdomadaire pour
              le renouvellement automatique (api/_lib/renouvellementContrats.ts). */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Jours de séance *
            </div>
            <div className="flex flex-wrap gap-2">
              {JOURS_SEANCE_OPTIONS.map(j => {
                const selected = joursSelectionnes.includes(j.key);
                return (
                  <button
                    key={j.key}
                    type="button"
                    onClick={() => toggleJour(j.key)}
                    className="px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition-colors"
                    style={{
                      borderColor: selected ? '#2BBFBF' : '#D1D5DB',
                      background: selected ? '#2BBFBF' : 'white',
                      color: selected ? 'white' : '#374151',
                    }}
                  >
                    {j.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-2" style={{ color: joursSelectionnes.length === nbSeancesSemaine ? '#9CA3AF' : '#B45309' }}>
              {joursSelectionnes.length} / {nbSeancesSemaine} jour{nbSeancesSemaine > 1 ? 's' : ''} sélectionné{joursSelectionnes.length > 1 ? 's' : ''}
              {joursSelectionnes.length !== nbSeancesSemaine && ` — sélectionnez exactement ${nbSeancesSemaine} jour${nbSeancesSemaine > 1 ? 's' : ''} (fréquence choisie)`}
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
              Ce bénéficiaire reste visible partout ailleurs dans l'app, mais le planificateur
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
              📅 <strong>{frequence.label}</strong>
              {nbSeances > 0 && ` — ~${nbSeances} séances sur la période`}
            </div>
            <div className="text-gray-600">
              📆 {mode === 'duree' && dureeIndeterminee
                ? `Depuis le ${new Date(dateDebut + 'T12:00').toLocaleDateString('fr-FR')} · sans date de fin`
                : `Du ${new Date(dateDebut + 'T12:00').toLocaleDateString('fr-FR')} au ${new Date(dateFinEffective + 'T12:00').toLocaleDateString('fr-FR')}`}
            </div>
            <div className="text-gray-600">
              🗓 {joursSelectionnes.length > 0
                ? JOURS_SEANCE_OPTIONS.filter(j => joursSelectionnes.includes(j.key)).map(j => j.label).join(', ')
                : 'Aucun jour sélectionné'}
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
