import type { StatutPresenceCours } from '../../types';
import { etatCours, presenceConstatee, type EntreeCours, type EtatCours } from '../../lib/coursCollectifs';
import { niveauEffort, niveauBienEtre } from '../../lib/ressentiCours';
import PastilleAnnonce from '../agenda/PastilleAnnonce';

// Cours collectifs d'UN bénéficiaire, vus par le praticien : à venir, réalisés
// (avec la présence constatée, l'effort perçu, le bien-être et SA note), annulés.
//
// Couleurs : uniquement des couleurs inline ou des couleurs plates du thème
// (bg-amber-light, text-red…), jamais une échelle numérique de rouge/ambre
// (voir tailwind.config.js) — le composant s'affiche pareil avant et après le
// correctif de cette échelle.

const ETAT: Record<EtatCours, { label: string; fond: string; texte: string }> = {
  a_venir:    { label: 'À venir',                fond: '#DBEAFE', texte: '#1D4ED8' },
  a_cloturer: { label: 'Passé, non clôturé',     fond: '#FEF5E7', texte: '#92400E' },
  realise:    { label: 'Réalisé',                fond: '#DCFCE7', texte: '#166534' },
  annule:     { label: 'Annulé',                 fond: '#F3F4F6', texte: '#6B7280' },
};

const PRESENCE: Record<StatutPresenceCours, { label: string; fond: string; texte: string }> = {
  present: { label: 'Présent', fond: '#DCFCE7', texte: '#166534' },
  absent:  { label: 'Absent',  fond: '#FEF0EF', texte: '#B42318' },
  excuse:  { label: 'Excusé',  fond: '#FEF5E7', texte: '#92400E' },
};

function formaterDate(iso: string): string {
  const d = new Date(`${iso}T12:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function Pastille({ fond, texte, children }: { fond: string; texte: string; children: React.ReactNode }) {
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: fond, color: texte }}
    >
      {children}
    </span>
  );
}

function CarteCours({ entree, aujourdhui }: { entree: EntreeCours; aujourdhui: string }) {
  const { cours, participation } = entree;
  const etat = ETAT[etatCours(cours, aujourdhui)];
  const presence = presenceConstatee(entree);
  const effort = niveauEffort(participation.ressentiBorg);
  const bienEtre = niveauBienEtre(participation.ressentiBienetre);

  return (
    <div className="border border-gray-100 rounded-xl p-3" data-testid="carte-cours-collectif">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-800 m-0 truncate">{cours.titre}</p>
          <p className="text-[12px] text-gray-500 m-0 mt-0.5">
            {formaterDate(cours.date)} · {cours.heureDebut} · {cours.dureeMinutes} min
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Pastille fond={etat.fond} texte={etat.texte}>{etat.label}</Pastille>
          {presence && (
            <Pastille fond={PRESENCE[presence].fond} texte={PRESENCE[presence].texte}>
              {PRESENCE[presence].label}
            </Pastille>
          )}
          {/* Ce que le bénéficiaire avait ANNONCÉ. Un cours dont la date est passée sans avoir été
              clôturé est traité comme un cours passé : « sans réponse » n'y dirait plus rien. */}
          <PastilleAnnonce
            presenceAnnoncee={participation.presenceAnnoncee}
            statutCours={etatCours(cours, aujourdhui) === 'a_venir' ? 'planifie' : cours.statut === 'annule' ? 'annule' : 'realise'}
          />
        </div>
      </div>

      {(effort || bienEtre) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {effort && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full text-white" style={{ background: effort.couleur }}>
              Effort : {effort.label}
            </span>
          )}
          {bienEtre && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full text-white" style={{ background: bienEtre.couleur }}>
              Bien-être : {bienEtre.label}
            </span>
          )}
        </div>
      )}

      {participation.notes && (
        <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap m-0 mt-2">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Note · </span>
          {participation.notes}
        </p>
      )}
    </div>
  );
}

interface Props {
  entrees: EntreeCours[];
  /** AAAA-MM-JJ, jour local : sert à distinguer « à venir » de « passé, non clôturé ». */
  aujourdhui: string;
}

export default function CoursCollectifsTab({ entrees, aujourdhui }: Props) {
  if (entrees.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-4xl mb-3">👥</div>
        <p className="font-medium">Aucun cours collectif</p>
        <p className="text-sm mt-1">Les cours auxquels ce bénéficiaire est inscrit apparaîtront ici.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entrees.map(e => (
        <CarteCours key={e.participation.id} entree={e} aujourdhui={aujourdhui} />
      ))}
    </div>
  );
}
