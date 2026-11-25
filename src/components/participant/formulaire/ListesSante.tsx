import { useState } from 'react';
import type { TraitementPatient, AntecedentMedical, TypeAntecedent, MomentPrise } from '../../../types';
import { TYPES_ANTECEDENT_LABELS, MOMENTS_PRISE_LABELS } from '../../../types';
import { CLS_CELL, genId } from './communs';

export const FREQUENCES_TRAITEMENT = ['1x/jour', '2x/jour', '3x/jour', 'À la demande', 'Autre'];
export const MOMENTS_PRISE: MomentPrise[] = ['matin', 'midi', 'soir', 'nuit', 'avant_repas', 'apres_repas'];

export function ListeTraitementsForm({
  value,
  onChange,
}: {
  value: TraitementPatient[];
  onChange: (v: TraitementPatient[]) => void;
}) {
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [stopDate, setStopDate] = useState('');
  const [showArretes, setShowArretes] = useState(false);

  const items = value ?? [];
  const actifs = items.filter(i => !i.date_fin);
  const arretes = items.filter(i => i.date_fin);

  const add = () => onChange([...items, { id: genId(), nom: '' }]);
  const remove = (id: string) => onChange(items.filter(i => i.id !== id));
  const upd = (id: string, patch: Partial<TraitementPatient>) =>
    onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)));

  const confirmerArret = (id: string) => {
    const date = stopDate || new Date().toISOString().split('T')[0];
    upd(id, { date_fin: date });
    setStoppingId(null);
    setStopDate('');
  };

  const reactiver = (id: string) => upd(id, { date_fin: undefined });

  return (
    <div>
      {/* Traitements en cours */}
      {actifs.length > 0 && (
        <div className="mb-2">
          {/* En-têtes masqués sur petit écran : les champs s'empilent et
              gardent leur placeholder (25/11/2026). */}
          <div className="hidden sm:grid gap-1.5 mb-1 grid-cols-[1fr_1fr_1fr_auto]">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Médicament</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Dose</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Effet secondaire notable</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Statut</span>
          </div>
          {actifs.map(item => (
            <div key={item.id} className="mb-2">
              {stoppingId === item.id ? (
                <div className="flex gap-2 items-center bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <span className="text-sm text-amber-700 font-medium flex-1">Date d'arrêt :</span>
                  <input type="date" value={stopDate} onChange={e => setStopDate(e.target.value)}
                    className="border border-amber-300 rounded px-2 py-1 text-sm" />
                  <button type="button" onClick={() => confirmerArret(item.id)}
                    className="text-white text-sm font-semibold px-3 py-1 rounded-lg"
                    style={{ backgroundColor: '#E24B4A', border: 'none' }}>
                    Confirmer
                  </button>
                  <button type="button" onClick={() => { setStoppingId(null); setStopDate(''); }}
                    className="text-gray-500 hover:text-gray-700 text-sm px-2">Annuler</button>
                </div>
              ) : (
                <div className="rounded-lg p-2 bg-white" style={{ border: '1px solid #E2EEEE' }}>
                  <div className="grid gap-1.5 items-center grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <input type="text" value={item.nom} onChange={e => upd(item.id, { nom: e.target.value })}
                      placeholder="Médicament (ex : Metformine)" aria-label="Médicament" className={CLS_CELL} />
                    <input type="text" value={item.dose ?? ''} onChange={e => upd(item.id, { dose: e.target.value })}
                      placeholder="Dose (ex : 500 mg × 2/j)" aria-label="Dose" className={CLS_CELL} />
                    <input type="text" value={item.effetSecondaire ?? ''} onChange={e => upd(item.id, { effetSecondaire: e.target.value })}
                      placeholder="Effet secondaire (ex : troubles digestifs)" aria-label="Effet secondaire notable" className={CLS_CELL} />
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">En cours ✅</span>
                      <button type="button" onClick={() => setStoppingId(item.id)}
                        title="Marquer comme arrêté"
                        className="text-gray-400 hover:text-amber-500 px-1 text-sm flex-shrink-0">⏹</button>
                      <button type="button" onClick={() => remove(item.id)}
                        className="text-red-400 hover:text-red-600 px-1 flex-shrink-0">✕</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                    <select value={item.frequence ?? ''} onChange={e => upd(item.id, { frequence: e.target.value || undefined })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary">
                      <option value="">Fréquence...</option>
                      {FREQUENCES_TRAITEMENT.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {MOMENTS_PRISE.map(m => {
                        const checked = (item.moments ?? []).includes(m);
                        return (
                          <label key={m} className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                            <input type="checkbox" checked={checked} className="accent-primary" onChange={() => {
                              const moments = item.moments ?? [];
                              upd(item.id, { moments: checked ? moments.filter(x => x !== m) : [...moments, m] });
                            }} />
                            {MOMENTS_PRISE_LABELS[m]}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Traitements arrêtés */}
      {arretes.length > 0 && (
        <div className="mb-2">
          <button type="button" onClick={() => setShowArretes(!showArretes)}
            className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 font-medium mb-1.5">
            {showArretes ? '▼' : '▶'} Traitements arrêtés ({arretes.length})
          </button>
          {showArretes && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              {arretes.map(item => (
                <div key={item.id} className="grid gap-1.5 items-center px-3 py-2 bg-gray-50 border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
                  <span className="text-sm text-gray-400">{item.nom || '—'}</span>
                  <span className="text-sm text-gray-400">{item.dose || '—'}</span>
                  <span className="text-[10px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    Arrêté le {new Date(item.date_fin + 'T12:00').toLocaleDateString('fr-FR')} ⬜
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => reactiver(item.id)}
                      title="Réactiver" className="text-[11px] text-primary hover:underline px-1">↩ Réactiver</button>
                    <button type="button" onClick={() => remove(item.id)}
                      className="text-red-400 hover:text-red-600 px-1">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button type="button" onClick={add}
        className="w-full flex items-center justify-center gap-2 text-primary border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
        + Ajouter un traitement
      </button>
    </div>
  );
}

export const TYPES_ANTECEDENT: TypeAntecedent[] = [
  'pathologie_chronique', 'chirurgie', 'fracture', 'prothese', 'hospitalisation', 'accident', 'autre',
];

/** Catégories cochées : la principale (`type`) d'abord, puis les associées. */
function categoriesDe(a: AntecedentMedical): TypeAntecedent[] {
  return [a.type, ...(a.typesAssocies ?? []).filter(t => t !== a.type)];
}

/**
 * Coche ou décoche une catégorie. « Autre » est la valeur par défaut d'un
 * nouvel antécédent : choisir une vraie catégorie la remplace au lieu de
 * s'y ajouter. Décocher la dernière catégorie revient à « Autre ».
 */
function basculerCategorie(a: AntecedentMedical, t: TypeAntecedent): Pick<AntecedentMedical, 'type' | 'typesAssocies'> {
  const actuelles = categoriesDe(a);
  let suivantes: TypeAntecedent[];
  if (actuelles.includes(t)) suivantes = actuelles.filter(x => x !== t);
  else if (actuelles.length === 1 && actuelles[0] === 'autre') suivantes = [t];
  else suivantes = [...actuelles, t];
  if (suivantes.length === 0) suivantes = ['autre'];
  return { type: suivantes[0], typesAssocies: suivantes.length > 1 ? suivantes.slice(1) : undefined };
}

const PLACEHOLDER_PRECISION: Partial<Record<TypeAntecedent, string>> = {
  pathologie_chronique: 'Ex : diabète de type 2, BPCO, arthrose...',
  chirurgie: 'Ex : ligamentoplastie, pontage...',
  fracture: 'Ex : col du fémur, poignet...',
  prothese: 'Ex : prothèse totale de hanche...',
  hospitalisation: 'Ex : pneumopathie, chute...',
  accident: 'Ex : accident de la route...',
};

const AVEC_LOCALISATION: TypeAntecedent[] = ['fracture', 'prothese', 'chirurgie', 'accident'];

// Compte rendu de Pierre (25/11/2026) : on tapait « Fracture » dans le titre
// puis on recliquait « Fracture » dans la catégorie. La catégorie vient donc
// en premier, et le titre devient une précision facultative : la fiche
// affiche déjà le nom de la catégorie quand il est vide (getAntecedentTitre).
// Plusieurs catégories possibles pour un même événement (`typesAssocies`,
// jsonb, sans migration) ; `type` reste la principale pour les lectures
// existantes (icône, PDF, assistant).
export function ListeAntecedentsForm({
  value,
  onChange,
}: {
  value: AntecedentMedical[];
  onChange: (v: AntecedentMedical[]) => void;
}) {
  const items = value ?? [];
  const add = () => onChange([...items, { id: genId(), type: 'autre' }]);
  const remove = (id: string) => onChange(items.filter(i => i.id !== id));
  const upd = (id: string, patch: Partial<AntecedentMedical>) =>
    onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <div>
      {items.map((item, i) => {
        const categories = categoriesDe(item);
        const showLocalisation = categories.some(c => AVEC_LOCALISATION.includes(c));
        const notesPlaceholder = item.type === 'pathologie_chronique'
          ? 'Notes : stade, depuis quand... (ex : stade 2, depuis 2018)'
          : 'Notes complémentaires...';
        // Compat anciennes données : le champ s'appelait "notes_evolution"
        const notesValue = item.notes ?? (item as unknown as { notes_evolution?: string }).notes_evolution ?? '';

        return (
          <div key={item.id} className="rounded-xl p-3.5 mb-3 bg-white" style={{ border: '1px solid #E2EEEE' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold" style={{ color: 'var(--color-ink-2)' }}>Antécédent {i + 1}</span>
              <button type="button" onClick={() => remove(item.id)}
                className="text-xs text-red-500 hover:text-red-700">Supprimer</button>
            </div>

            <label className="text-[11px] font-medium text-gray-500 mb-1 block">
              Catégorie <span className="font-normal">(plusieurs possibles)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {TYPES_ANTECEDENT.map(t => {
                const actif = categories.includes(t);
                return (
                  <button key={t} type="button" aria-pressed={actif} onClick={() => upd(item.id, basculerCategorie(item, t))}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      actif
                        ? 'bg-primary text-white border-primary'
                        : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
                    }`}>
                    {TYPES_ANTECEDENT_LABELS[t]}
                  </button>
                );
              })}
            </div>

            <div className={`grid gap-2 mb-2 ${showLocalisation ? 'sm:grid-cols-2' : ''}`}>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Précision <span className="font-normal">(facultatif)</span></label>
                <input type="text" value={item.titre ?? ''} onChange={e => upd(item.id, { titre: e.target.value })}
                  placeholder={PLACEHOLDER_PRECISION[item.type] ?? 'Ex : opération du genou droit...'} className={`w-full ${CLS_CELL}`} />
              </div>
              {showLocalisation && (
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">Localisation</label>
                  <input type="text" value={item.localisation ?? ''} onChange={e => upd(item.id, { localisation: e.target.value })}
                    placeholder="Genou droit, hanche gauche..." className={`w-full ${CLS_CELL}`} />
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-[120px_1fr] gap-2 mb-2">
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Date / Année</label>
                <input type="text" value={item.date ?? ''} onChange={e => upd(item.id, { date: e.target.value })}
                  placeholder="2019" className={`w-full ${CLS_CELL}`} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Conséquences / séquelles</label>
                <input type="text" value={item.consequence ?? ''} onChange={e => upd(item.id, { consequence: e.target.value })}
                  placeholder="Douleur résiduelle, mobilité réduite..." className={`w-full ${CLS_CELL}`} />
              </div>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-medium text-gray-500">Douleur liée</span>
              {(['oui', 'non'] as const).map(v => {
                const isActive = item.douleur === v;
                return (
                  <button key={v} type="button" aria-pressed={isActive} onClick={() => upd(item.id, { douleur: item.douleur === v ? undefined : v })}
                    className={`px-3.5 py-1 rounded-lg text-xs border transition-colors ${
                      isActive ? 'bg-primary text-white border-primary font-semibold' : 'border-gray-300 text-gray-700 bg-white'
                    }`}>
                    {v === 'oui' ? 'Oui' : 'Non'}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={notesValue}
              onChange={e => upd(item.id, { notes: e.target.value })}
              placeholder={notesPlaceholder}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px] text-gray-600 focus:outline-none focus:border-primary"
            />
          </div>
        );
      })}
      <button type="button" onClick={add}
        className="w-full flex items-center justify-center gap-2 text-primary border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
        + Ajouter un antécédent
      </button>
    </div>
  );
}
