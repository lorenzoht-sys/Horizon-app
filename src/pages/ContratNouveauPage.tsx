import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import { useContrats } from '../hooks/useContrats';
import { useAgenda } from '../hooks/useAgenda';
import PageWrapper from '../components/layout/PageWrapper';
import { ArrowLeft, Check, Calendar, Hash } from 'lucide-react';
import { toast } from 'sonner';
import type { JourSemaine } from '../types';
import { calculerNombreSeances, calculerDateFin, LABELS_JOURS_LONG } from '../utils/horaires';
import { getOrganisation } from '../lib/anamnese';

const JOURS: { value: JourSemaine; label: string }[] = [
  { value: 'lun', label: 'Lun' },
  { value: 'mar', label: 'Mar' },
  { value: 'mer', label: 'Mer' },
  { value: 'jeu', label: 'Jeu' },
  { value: 'ven', label: 'Ven' },
  { value: 'sam', label: 'Sam' },
];

type ModePeriode = 'duree' | 'seances';

export default function ContratNouveauPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { participants } = useParticipants();
  const { creerContrat } = useContrats();
  const { bulkCreerSeances } = useAgenda();

  const participant = participants.find(p => p.id === id);
  const bilanInitial = participant?.bilans.find(b => b.type === 'initial');

  // Disponibilités : fiche patient (organisation des séances), avec repli sur l'ancien bilan initial
  const JOUR_MAP: Record<string, JourSemaine> = {
    'Lun': 'lun', 'Mar': 'mar', 'Mer': 'mer', 'Jeu': 'jeu', 'Ven': 'ven', 'Sam': 'sam',
  };
  const organisation = participant ? getOrganisation(participant, bilanInitial) : null;
  const orgFlat = organisation ? {
    jours: (organisation.joursDisponibles ?? [])
      .map(l => JOUR_MAP[l]).filter((j): j is JourSemaine => Boolean(j)),
    heureSouhaitee: organisation.heureSouhaitee || undefined,
    dureeMinutes: parseInt(String(organisation.dureeSeance ?? '')) || null,
    creneau: organisation.creneau ?? '',
    contraintes: organisation.contraintes || undefined,
  } : null;

  const [mode, setMode] = useState<ModePeriode>('duree');
  const [joursFixe, setJoursFixe] = useState<JourSemaine[]>(['lun']);
  const [heureDebut, setHeureDebut] = useState('09:00');
  const [dureeMinutes, setDureeMinutes] = useState(45);
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().split('T')[0]);
  const [dateFin, setDateFin] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0];
  });
  const [dureeIndeterminee, setDureeIndeterminee] = useState(false);
  const [nbSeancesPrescrites, setNbSeancesPrescrites] = useState(12);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!orgFlat) return;
    if (orgFlat.jours.length > 0) setJoursFixe(orgFlat.jours);
    if (orgFlat.heureSouhaitee) setHeureDebut(orgFlat.heureSouhaitee);
    if (orgFlat.dureeMinutes) setDureeMinutes(orgFlat.dureeMinutes);
  }, [organisation]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleJour(jour: JourSemaine) {
    setJoursFixe(prev =>
      prev.includes(jour)
        ? prev.length > 1 ? prev.filter(j => j !== jour) : prev  // garder au moins 1 jour
        : [...prev, jour].sort((a, b) =>
            ['lun','mar','mer','jeu','ven','sam'].indexOf(a) - ['lun','mar','mer','jeu','ven','sam'].indexOf(b)
          )
    );
  }

  const seancesParSemaine = joursFixe.length;

  // Pour "durée indéterminée", générer 6 mois de séances par défaut
  const dateFinPourGeneration = (() => {
    if (mode !== 'duree' || !dureeIndeterminee) return dateFin;
    const d = new Date(dateDebut);
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().split('T')[0];
  })();

  const nbSeances = mode === 'duree'
    ? (dateDebut && dateFinPourGeneration ? calculerNombreSeances(dateDebut, dateFinPourGeneration, joursFixe) : 0)
    : nbSeancesPrescrites;

  const dateFinEffective = mode === 'seances'
    ? calculerDateFin(dateDebut, joursFixe, nbSeancesPrescrites)
    : dateFinPourGeneration;

  function heureFinCalc(): string {
    const [h, m] = heureDebut.split(':').map(Number);
    const total = h * 60 + m + dureeMinutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function labelJours(): string {
    return joursFixe.map(j => LABELS_JOURS_LONG[j]).join(' + ');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!participant) return;
    if (!dateDebut || joursFixe.length === 0) {
      toast.error('Remplissez tous les champs obligatoires');
      return;
    }
    if (nbSeances === 0) {
      toast.error('Nombre de séances invalide');
      return;
    }

    const adresse = [participant.adresseRue, participant.adresseCodePostal, participant.adresseVille]
      .filter(Boolean).join(', ');
    const coordonnees = participant.coordonnees
      ? { lat: participant.coordonnees.lat, lng: participant.coordonnees.lng }
      : undefined;

    try {
      const result = await creerContrat(
        {
          participantId: participant.id,
          dateDebut,
          dateFin: dateFinEffective,
          joursFixe,
          heureDebut,
          dureeMinutes,
          statut: 'actif',
          notes: notes || undefined,
          dureeIndeterminee: dureeIndeterminee || undefined,
        },
        adresse,
        coordonnees
      );

      await bulkCreerSeances(result.seancesData);
      toast.success(`Contrat créé — ${nbSeances} séances générées automatiquement`);
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
        {/* Rappel disponibilités bilan initial */}
        {orgFlat && (orgFlat.jours.length > 0 || orgFlat.heureSouhaitee) && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 mb-6">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
              Disponibilités renseignées
            </div>
            <div className="text-sm text-blue-800">
              {orgFlat.jours.map((j: JourSemaine) => LABELS_JOURS_LONG[j]).join(', ')}
              {orgFlat.creneau && ` · ${orgFlat.creneau}`}
              {orgFlat.heureSouhaitee && ` · ${orgFlat.heureSouhaitee}`}
              {orgFlat.dureeMinutes && ` · ${orgFlat.dureeMinutes} min`}
            </div>
            {orgFlat.contraintes && (
              <div className="text-xs text-blue-600 mt-1 italic">"{orgFlat.contraintes}"</div>
            )}
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

          {/* Jours fixes — sélection multiple */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Jour(s) fixe(s) *
              </div>
              {seancesParSemaine > 1 && (
                <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                  {seancesParSemaine}× par semaine
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {JOURS.map(j => {
                const selected = joursFixe.includes(j.value);
                return (
                  <button
                    key={j.value}
                    type="button"
                    onClick={() => toggleJour(j.value)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors"
                    style={{
                      borderColor: selected ? '#1A5F9E' : '#E2EEF9',
                      background: selected ? '#1A5F9E' : 'white',
                      color: selected ? 'white' : '#4A6080',
                    }}
                  >
                    {j.label}
                  </button>
                );
              })}
            </div>
            {seancesParSemaine > 1 && (
              <p className="text-xs text-gray-400 mt-2">
                Les séances seront générées le {labelJours()} chaque semaine à la même heure.
              </p>
            )}
          </div>

          {/* Heure et durée séance */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Heure de début *</label>
              <input
                type="time"
                value={heureDebut}
                onChange={e => setHeureDebut(e.target.value)}
                min="07:00" max="20:00"
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
              />
              <div className="text-xs text-gray-400 mt-1">Fin à {heureFinCalc()}</div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Durée par séance</label>
              <select
                value={dureeMinutes}
                onChange={e => setDureeMinutes(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                {[30, 45, 60, 90, 120].map(d => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
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
          {nbSeances > 0 && (
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-1 text-sm">
              <div className="font-semibold text-dark mb-2">Récapitulatif</div>
              <div className="text-gray-700">
                📅 <strong>{nbSeances} séances</strong>
                {seancesParSemaine > 1
                  ? ` — ${seancesParSemaine}× par semaine (${labelJours()})`
                  : ` × ${labelJours()}`}
                {' à '}{heureDebut}
              </div>
              <div className="text-gray-600">
                📆 Du {new Date(dateDebut + 'T12:00').toLocaleDateString('fr-FR')} au{' '}
                {new Date(dateFinEffective + 'T12:00').toLocaleDateString('fr-FR')}
              </div>
              <div className="text-gray-600">⏱ {dureeMinutes} min par séance</div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={nbSeances === 0}
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
