import { useMemo, useState } from 'react';
import { Search, X, Eye, Loader } from 'lucide-react';
import type { FamilleExercice, MaterielExercice } from '../../types';
import { EXERCICES_BASE } from '../../data/exercices';
import {
  MODELES_MOUVAPA, LIBELLE_POSITION_MODELE, LIBELLE_NIVEAU_MODELE,
  resoudreExercices, materielsDuModele, dureeIndicative,
  type ModeleMouvApa, type PositionModele, type NiveauModele,
} from '../../data/modelesMouvApa';
import { LIBELLE_FAMILLE, LIBELLE_MATERIEL_COURT } from '../../lib/libellesBibliotheque';

// Catalogue des modèles Mouv'APA, partagé par « Modèles de programme » (action : ajouter à mes
// modèles) et par « Utiliser un modèle » sur la fiche d'un bénéficiaire (action : utiliser). Lecture
// seule : l'action crée toujours une copie indépendante chez l'enseignant.

const FAMILLES_FILTRE: FamilleExercice[] = [
  'renforcement', 'pilates', 'mobilite', 'souplesse', 'cardio', 'equilibre', 'coordination', 'cognitif', 'recuperation',
];
const POSITIONS_FILTRE: PositionModele[] = ['assis', 'debout', 'mixte', 'sol'];
type FiltreMateriel = 'elastique' | 'ballon' | 'petits_poids' | 'sans';

const puce = (actif: boolean) =>
  `px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
    actif ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/50'
  }`;

interface InfosModele {
  modele: ModeleMouvApa;
  materiels: MaterielExercice[];
  duree: number;
}

export default function CatalogueModelesMouvApa({ libelleAction, onAction }: {
  libelleAction: string;
  onAction: (modele: ModeleMouvApa) => Promise<void>;
}) {
  const [recherche, setRecherche] = useState('');
  const [famille, setFamille] = useState<FamilleExercice | null>(null);
  const [position, setPosition] = useState<PositionModele | null>(null);
  const [materiel, setMateriel] = useState<FiltreMateriel | null>(null);
  const [niveau, setNiveau] = useState<NiveauModele | null>(null);
  const [apercu, setApercu] = useState<ModeleMouvApa | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const infos = useMemo<InfosModele[]>(() => MODELES_MOUVAPA.map(modele => ({
    modele,
    materiels: materielsDuModele(modele, EXERCICES_BASE),
    duree: dureeIndicative(modele, EXERCICES_BASE),
  })), []);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return infos.filter(({ modele, materiels }) => {
      if (famille && modele.famille !== famille) return false;
      if (position && modele.position !== position) return false;
      if (niveau && modele.niveau !== niveau) return false;
      if (materiel === 'sans' && materiels.some(x => x !== 'chaise')) return false;
      if (materiel && materiel !== 'sans' && !materiels.includes(materiel)) return false;
      if (q && !`${modele.nom} ${modele.objectif}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [infos, recherche, famille, position, materiel, niveau]);

  async function lancer(modele: ModeleMouvApa) {
    setEnCours(modele.id);
    try { await onAction(modele); } finally { setEnCours(null); }
  }

  const filtreActif = !!(famille || position || materiel || niveau || recherche.trim());

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        {MODELES_MOUVAPA.length} modèles prêts à l'emploi. Ce sont des bases : vous choisissez et adaptez les exercices
        selon chaque bénéficiaire. « {libelleAction} » crée une copie que vous pouvez modifier librement.
      </p>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un modèle…"
          aria-label="Rechercher un modèle"
          className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-primary" />
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filtrer par position">
          {POSITIONS_FILTRE.map(p => (
            <button key={p} onClick={() => setPosition(position === p ? null : p)} className={puce(position === p)} aria-pressed={position === p}>
              {LIBELLE_POSITION_MODELE[p]}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filtrer par type">
          {FAMILLES_FILTRE.map(f => (
            <button key={f} onClick={() => setFamille(famille === f ? null : f)} className={puce(famille === f)} aria-pressed={famille === f}>
              {LIBELLE_FAMILLE[f]}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap items-center" role="group" aria-label="Filtrer par matériel et niveau">
          {([['elastique', 'Avec élastique'], ['ballon', 'Avec ballon'], ['petits_poids', 'Avec poids'], ['sans', 'Sans matériel']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setMateriel(materiel === v ? null : v)} className={puce(materiel === v)} aria-pressed={materiel === v}>{l}</button>
          ))}
          <select value={niveau ?? ''} onChange={e => setNiveau((e.target.value || null) as NiveauModele | null)} aria-label="Niveau"
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none focus:border-primary">
            <option value="">Tous niveaux</option>
            {(Object.keys(LIBELLE_NIVEAU_MODELE) as NiveauModele[]).map(n => <option key={n} value={n}>{LIBELLE_NIVEAU_MODELE[n]}</option>)}
          </select>
          {filtreActif && (
            <button onClick={() => { setFamille(null); setPosition(null); setMateriel(null); setNiveau(null); setRecherche(''); }}
              className="text-xs text-primary font-semibold hover:underline ml-1">
              Effacer les filtres
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3">{filtres.length} modèle{filtres.length > 1 ? 's' : ''}</p>

      {filtres.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">Aucun modèle ne correspond à ces filtres.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtres.map(({ modele, materiels, duree }) => (
            <div key={modele.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col">
              <div className="text-[15px] font-bold text-dark leading-snug">{modele.nom}</div>
              <div className="text-xs text-primary font-semibold mt-1">
                {LIBELLE_FAMILLE[modele.famille]} • {LIBELLE_POSITION_MODELE[modele.position]} • {LIBELLE_NIVEAU_MODELE[modele.niveau]}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {modele.exercices.length} exercices • ~{duree} min
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Matériel : {materiels.length === 0 ? 'aucun' : materiels.map(x => LIBELLE_MATERIEL_COURT[x]).join(', ')}
              </div>
              <p className="text-xs text-gray-600 mt-2 flex-1">{modele.objectif}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setApercu(modele)}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 rounded-lg py-2 text-xs font-semibold text-dark hover:bg-gray-50">
                  <Eye size={13} /> Prévisualiser
                </button>
                <button onClick={() => void lancer(modele)} disabled={enCours !== null}
                  className="flex-1 rounded-lg py-2 text-xs font-semibold text-white bg-primary hover:bg-dark disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {enCours === modele.id ? <><Loader size={13} className="animate-spin" /> En cours…</> : libelleAction}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {apercu && (
        <ApercuModele modele={apercu} libelleAction={libelleAction} enCours={enCours === apercu.id}
          onAction={async () => { await lancer(apercu); setApercu(null); }} onClose={() => setApercu(null)} />
      )}
    </div>
  );
}

function ApercuModele({ modele, libelleAction, enCours, onAction, onClose }: {
  modele: ModeleMouvApa;
  libelleAction: string;
  enCours: boolean;
  onAction: () => Promise<void>;
  onClose: () => void;
}) {
  const exercices = resoudreExercices(modele, EXERCICES_BASE);
  const volume = (r: (typeof exercices)[number]) =>
    r.repetitions != null ? `${r.series} × ${r.repetitions} rép.` : `${r.series} × ${r.dureeSecondes} s`;

  return (
    // z-[1300] : au-dessus de « Utiliser un modèle » (z-[1200]) et de la barre de navigation mobile.
    <div className="fixed inset-0 bg-black/50 z-[1300] flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg my-auto max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <div className="font-bold text-[16px] text-dark">{modele.nom}</div>
            <div className="text-xs text-gray-500 mt-0.5">{LIBELLE_POSITION_MODELE[modele.position]} • {LIBELLE_NIVEAU_MODELE[modele.niveau]} • {modele.objectif}</div>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="text-gray-400 p-1"><X size={18} /></button>
        </div>
        <ol className="flex-1 overflow-y-auto p-4 space-y-3">
          {exercices.map((r, i) => (
            <li key={`${r.exercice.id}-${i}`} className="border border-gray-100 rounded-xl p-3">
              <div className="flex justify-between gap-2">
                <span className="text-sm font-semibold text-dark">{i + 1}. {r.exercice.nom}</span>
                <span className="text-xs font-semibold text-primary whitespace-nowrap">{volume(r)}</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{r.exercice.description}</p>
              {r.exercice.respiration && <p className="text-xs text-teal-700 mt-1">🌬️ {r.exercice.respiration}</p>}
              {r.remarque && <p className="text-xs text-gray-700 mt-1">📝 {r.remarque}</p>}
              {r.exercice.consigneSecurite && <p className="text-xs text-red-700 mt-1">⚠️ {r.exercice.consigneSecurite}</p>}
            </li>
          ))}
        </ol>
        <div className="p-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 border border-gray-200 rounded-xl py-2 text-sm text-gray-600">Fermer</button>
          <button onClick={() => void onAction()} disabled={enCours}
            className="flex-1 rounded-xl py-2 text-sm font-semibold text-white bg-primary hover:bg-dark disabled:opacity-50">
            {enCours ? 'En cours…' : libelleAction}
          </button>
        </div>
      </div>
    </div>
  );
}
