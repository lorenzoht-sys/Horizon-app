import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Participant } from '../../types';
import { useAgenda } from '../../hooks/useAgenda';
import { useBilansAuto } from '../../hooks/useBilansAuto';
import { useCategoriesSeance } from '../../hooks/useCategoriesSeance';
import { ChevauchementError } from '../../utils/horaires';
import {
  FREQUENCES_BILAN_MOIS, referenceBilan, datesBilansAPrevoir, placerBilans, bilansAutoARetirer,
} from '../../lib/bilansAuto';
import { formatDate } from '../../lib/agendaCommun';

// « Bilans automatiques » sur la fiche du bénéficiaire (chantier 15) : ON/OFF et fréquence. Optionnel,
// désactivé par défaut. Activé, Horizon pose dans l'agenda un bilan tous les N mois (12 mois à venir),
// dans la catégorie « Bilan » du praticien. Chaque bilan prévu reste modifiable à la main (date,
// catégorie) ou supprimable ; un bilan déplacé à la main n'est plus jamais retiré automatiquement.

export default function SectionBilansAuto({ participant }: { participant: Participant }) {
  const { seances, bulkCreerSeances, supprimerSeance, modifierSeance } = useAgenda();
  const { reglage, charge, enregistrer } = useBilansAuto(participant.id);
  const { categories, categorieBilan } = useCategoriesSeance();
  const [enCours, setEnCours] = useState(false);

  const actif = reglage?.actif ?? false;
  const frequence = reglage?.frequenceMois ?? 3;
  const aujourdhui = format(new Date(), 'yyyy-MM-dd');

  const bilansPrevus = seances
    .filter(s => s.participantId === participant.id && s.type !== 'seance' && s.statut === 'planifiee' && s.date >= aujourdhui)
    .sort((a, b) => a.date.localeCompare(b.date) || a.heureDebut.localeCompare(b.heureDebut));

  // Retire si besoin les bilans auto à venir (par identifiant explicite), puis, si `actif`, pose ceux qui manquent.
  async function appliquer(actifVoulu: boolean, frequenceVoulue: number) {
    setEnCours(true);
    try {
      if (!(await enregistrer(actifVoulu, frequenceVoulue))) return;

      // On ne retire les bilans automatiques à venir que s'il y a une raison : désactivation, ou
      // fréquence changée (les dates ne seraient plus les bonnes). « Mettre à jour le planning » à
      // fréquence inchangée ne fait qu'AJOUTER ce qui manque — sinon l'agenda serait vide le temps de
      // tout recréer, et un échec de la recréation ferait perdre les bilans.
      const frequenceChangee = reglage?.actif === true && reglage.frequenceMois !== frequenceVoulue;
      const aRetirer = !actifVoulu || frequenceChangee ? bilansAutoARetirer(seances, participant.id, aujourdhui) : [];
      for (const s of aRetirer) await supprimerSeance(s.id);
      const retires = new Set(aRetirer.map(s => s.id));

      if (!actifVoulu) {
        if (aRetirer.length > 0) toast.success(`${aRetirer.length} bilan${aRetirer.length > 1 ? 's' : ''} prévu${aRetirer.length > 1 ? 's' : ''} retiré${aRetirer.length > 1 ? 's' : ''} de l’agenda`);
        return;
      }

      const restantes = seances.filter(s => !retires.has(s.id));
      const ref = referenceBilan(restantes, participant.id, participant.bilans.map(b => b.date));
      if (!ref) {
        toast.info('Option activée. Planifiez un premier bilan dans l’agenda : les suivants se placeront automatiquement.');
        return;
      }
      const dates = datesBilansAPrevoir({
        reference: ref.date,
        frequenceMois: frequenceVoulue,
        aujourdhui,
        datesExistantes: restantes
          .filter(s => s.participantId === participant.id && s.type !== 'seance' && s.statut !== 'annulee')
          .map(s => s.date),
      });
      const { aPoser, nonPlacees } = placerBilans(dates, restantes, ref.heureDebut, ref.dureeMinutes);
      const categorie = await categorieBilan();
      const adresse = [participant.adresseRue, participant.adresseCodePostal, participant.adresseVille].filter(Boolean).join(', ');
      if (aPoser.length > 0) {
        const creees = await bulkCreerSeances(aPoser.map(b => ({
          participantId: participant.id,
          type: 'bilan' as const,
          date: b.date,
          heureDebut: b.heureDebut,
          heureFin: b.heureFin,
          dureeMinutes: b.dureeMinutes,
          statut: 'planifiee' as const,
          adresse,
          coordonnees: participant.coordonnees ? { lat: participant.coordonnees.lat, lng: participant.coordonnees.lng } : undefined,
          categorieId: categorie?.id,
          bilanAuto: true,
        })));
        toast.success(`${creees.length} bilan${creees.length > 1 ? 's' : ''} prévu${creees.length > 1 ? 's' : ''} dans l’agenda`);
      } else if (nonPlacees.length === 0) {
        toast.info('Les prochains bilans sont déjà prévus.');
      }
      if (nonPlacees.length > 0) {
        toast.warning(`Créneau occupé, bilan non placé le ${nonPlacees.map(formatDate).join(', ')}. Ajoutez-le à la main.`);
      }
    } catch (e) {
      if (!(e instanceof ChevauchementError)) console.error('Bilans automatiques:', e);
    } finally {
      setEnCours(false);
    }
  }

  if (!charge) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm" data-testid="section-bilans-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Bilans automatiques</p>
          <p className="text-xs text-gray-500 mt-0.5">Prévoir les prochains bilans dans l’agenda.</p>
        </div>
        <button
          role="switch" aria-checked={actif} aria-label="Bilans automatiques" disabled={enCours}
          onClick={() => void appliquer(!actif, frequence)}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${actif ? 'bg-primary' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${actif ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      {actif && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <label htmlFor="freq-bilan" className="text-xs text-gray-500">Fréquence : tous les</label>
            <select id="freq-bilan" value={frequence} disabled={enCours}
              onChange={e => void appliquer(true, Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-primary">
              {FREQUENCES_BILAN_MOIS.map(m => <option key={m} value={m}>{m} mois</option>)}
            </select>
          </div>
          <p className="text-[11px] text-gray-400">
            Changer la fréquence replace les bilans automatiques à venir ; ceux que vous avez déplacés à la main sont conservés.
          </p>
          <button onClick={() => void appliquer(true, frequence)} disabled={enCours}
            className="text-xs font-semibold text-primary hover:underline disabled:opacity-50">
            Mettre à jour le planning
          </button>
        </div>
      )}

      {bilansPrevus.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500">Bilans prévus</p>
          {bilansPrevus.map(b => (
            <div key={b.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full flex-shrink-0" aria-hidden="true"
                style={{ background: categories.find(c => c.id === b.categorieId)?.couleur ?? '#8B5CF6' }} />
              <input type="date" value={b.date} aria-label={`Date du bilan du ${formatDate(b.date)}`}
                onChange={e => { if (e.target.value) void modifierSeance(b.id, { date: e.target.value }); }}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-primary" />
              {categories.length > 0 && (
                <select value={categories.some(c => c.id === b.categorieId) ? b.categorieId : ''}
                  aria-label="Type de bilan"
                  onChange={e => void modifierSeance(b.id, { categorieId: e.target.value || undefined })}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-primary max-w-[9rem]">
                  <option value="">Sans catégorie</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              )}
              {b.bilanAuto && <span className="text-[10px] text-gray-400">🔄 auto</span>}
              <button onClick={() => void supprimerSeance(b.id)} aria-label={`Supprimer le bilan du ${formatDate(b.date)}`}
                className="ml-auto text-xs text-red hover:underline">Supprimer</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
