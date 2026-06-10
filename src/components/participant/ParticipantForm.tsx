import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Participant, TagPatient, TestKey, RgpdConsent, TraitementPatient, AntecedentMedical, TypeAntecedent, AnamneseData, ChutesData, PeriodeChutes, FourchetteChutes } from '../../types';
import { TYPES_ANTECEDENT_LABELS, PERIODES_CHUTES_LABELS } from '../../types';
import { useStructures } from '../../hooks/useStructures';
import { getBrouillonParticipant, sauvegarderBrouillonParticipant } from '../../hooks/useBrouillonParticipant';
import { Save, X } from 'lucide-react';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const CLS_CELL = 'border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-primary w-full';

function ListeTraitementsForm({
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
          <div className="grid gap-1.5 mb-1" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
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
                <div className="grid gap-1.5 items-center" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
                  <input type="text" value={item.nom} onChange={e => upd(item.id, { nom: e.target.value })}
                    placeholder="Metformine" className={CLS_CELL} />
                  <input type="text" value={item.dose ?? ''} onChange={e => upd(item.id, { dose: e.target.value })}
                    placeholder="500mg × 2/j" className={CLS_CELL} />
                  <input type="text" value={item.effetSecondaire ?? ''} onChange={e => upd(item.id, { effetSecondaire: e.target.value })}
                    placeholder="Troubles digestifs" className={CLS_CELL} />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">En cours ✅</span>
                    <button type="button" onClick={() => setStoppingId(item.id)}
                      title="Marquer comme arrêté"
                      className="text-gray-400 hover:text-amber-500 px-1 text-sm flex-shrink-0">⏹</button>
                    <button type="button" onClick={() => remove(item.id)}
                      className="text-red-400 hover:text-red-600 px-1 flex-shrink-0">✕</button>
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

const TYPES_ANTECEDENT: TypeAntecedent[] = [
  'pathologie_chronique', 'chirurgie', 'fracture', 'prothese', 'hospitalisation', 'accident', 'autre',
];

function ListeAntecedentsForm({
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
        const showLocalisation = item.type === 'fracture' || item.type === 'prothese';
        const notesPlaceholder = item.type === 'pathologie_chronique'
          ? 'Stade, depuis quand... (ex : stade 2, depuis 2018)'
          : 'Détails, séquelles...';
        // Compat anciennes données : le champ s'appelait "notes_evolution"
        const notesValue = item.notes ?? (item as unknown as { notes_evolution?: string }).notes_evolution ?? '';

        return (
          <div key={item.id} className="border border-gray-100 rounded-xl p-3.5 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400">Antécédent {i + 1}</span>
              <button type="button" onClick={() => remove(item.id)}
                className="text-xs text-red-400 hover:text-red-600">🗑️ Supprimer</button>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {TYPES_ANTECEDENT.map(t => (
                <button key={t} type="button" onClick={() => upd(item.id, { type: t })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    item.type === t
                      ? 'bg-primary text-white border-primary'
                      : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-white'
                  }`}>
                  {TYPES_ANTECEDENT_LABELS[t]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Date / Année</label>
                <input type="text" value={item.date ?? ''} onChange={e => upd(item.id, { date: e.target.value })}
                  placeholder="2019" className={`w-full ${CLS_CELL}`} />
              </div>
              {showLocalisation && (
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">Localisation</label>
                  <input type="text" value={item.localisation ?? ''} onChange={e => upd(item.id, { localisation: e.target.value })}
                    placeholder="Genou droit, hanche gauche..." className={`w-full ${CLS_CELL}`} />
                </div>
              )}
            </div>

            <div className="mb-2">
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">Conséquences / séquelles</label>
              <input type="text" value={item.consequence ?? ''} onChange={e => upd(item.id, { consequence: e.target.value })}
                placeholder="Douleur résiduelle, mobilité réduite..." className={`w-full ${CLS_CELL}`} />
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-medium text-gray-500">Douleur liée</span>
              {(['oui', 'non'] as const).map(v => {
                const isActive = item.douleur === v;
                return (
                  <button key={v} type="button" onClick={() => upd(item.id, { douleur: item.douleur === v ? undefined : v })}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: '1.5px solid',
                      borderColor: isActive ? '#2BBFBF' : '#D1D5DB',
                      background: isActive ? '#2BBFBF' : '#FFFFFF',
                      color: isActive ? '#FFFFFF' : '#374151',
                      fontWeight: isActive ? '600' : '400',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}>
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
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px] text-gray-500 focus:outline-none focus:border-primary"
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

// ─── ÉCHELLE 0-10 (douleur / fatigue) ──────────────────────────────────────────

function Echelle10({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number) => void;
}) {
  const v = value ?? null;
  const getColor = (n: number) =>
    n === 0 ? '#3B6D11' : n <= 3 ? '#F59E0B' : n <= 6 ? '#EF8C00' : n <= 8 ? '#EF4444' : '#991B1B';
  const getLibelle = (n: number) =>
    n === 0 ? '😊 Aucune' : n <= 2 ? '🙂 Légère' : n <= 4 ? '😐 Modérée'
    : n <= 6 ? '😟 Importante' : n <= 8 ? '😣 Sévère' : '😭 Insupportable';

  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      <div className="flex gap-1">
        {[0,1,2,3,4,5,6,7,8,9,10].map(n => {
          const active = v === n;
          const color = getColor(n);
          return (
            <button key={n} type="button"
              onClick={() => onChange(n)}
              style={{ borderColor: active ? color : undefined, background: active ? color : undefined }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition-all ${
                active ? 'text-white shadow-sm' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1.5">
        <span>0 — Aucune</span>
        <span>5 — Modérée</span>
        <span>10 — Insupportable</span>
      </div>
      {v !== null && (
        <p className="text-xs font-semibold mt-1" style={{ color: getColor(v) }}>
          {getLibelle(v)}
        </p>
      )}
    </div>
  );
}

// ─── TOGGLE OUI/NON ─────────────────────────────────────────────────────────────

function ToggleOuiNon({
  value,
  onChange,
}: {
  value: 'oui' | 'non' | null | undefined;
  onChange: (v: 'oui' | 'non') => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {(['oui', 'non'] as const).map(v => {
        const isActive = value === v;
        return (
          <button key={v} type="button" onClick={() => onChange(v)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1.5px solid',
              borderColor: isActive ? '#2BBFBF' : '#D1D5DB',
              background: isActive ? '#2BBFBF' : '#FFFFFF',
              color: isActive ? '#FFFFFF' : '#374151',
              fontWeight: isActive ? '600' : '400',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}>
            {v === 'oui' ? 'Oui' : 'Non'}
          </button>
        );
      })}
    </div>
  );
}

// ─── ÉCHELLE 1-5 ──────────────────────────────────────────────────────────────

function Echelle5({
  label,
  aide,
  value,
  onChange,
}: {
  label: string;
  aide?: string;
  value: number | null | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(n => {
          const active = value === n;
          return (
            <button key={n} type="button" onClick={() => onChange(n)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${
                active ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {n}
            </button>
          );
        })}
      </div>
      {aide && <p className="text-xs text-gray-400 mt-1">{aide}</p>}
    </div>
  );
}

// ─── ANTÉCÉDENTS DE CHUTES (MOD3) ───────────────────────────────────────────────

function ChutesForm({
  value,
  onChange,
}: {
  value: ChutesData;
  onChange: (v: ChutesData) => void;
}) {
  const upd = (patch: Partial<ChutesData>) => onChange({ ...value, ...patch });
  const FOURCHETTES: FourchetteChutes[] = ['1', '2', '3-5', '6+'];
  const PERIODES: PeriodeChutes[] = ['<1mois', '1-3mois', '3-6mois', '6-12mois', '+12mois'];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700">A-t-il fait des chutes au cours des 12 derniers mois ?</span>
        <ToggleOuiNon value={value.aChutes} onChange={v => upd({ aChutes: v })} />
      </div>

      {value.aChutes === 'oui' && (
        <div className="space-y-3 border-t border-gray-100 pt-3">
          <div>
            <label className={CLS_LABEL}>Nombre de chutes</label>
            <div className="flex gap-2">
              {FOURCHETTES.map(f => (
                <button key={f} type="button" onClick={() => upd({ nombreChutes: value.nombreChutes === f ? null : f })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    value.nombreChutes === f ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={CLS_LABEL}>Période de la dernière chute</label>
            <div className="flex flex-wrap gap-2">
              {PERIODES.map(p => (
                <button key={p} type="button" onClick={() => upd({ periode: value.periode === p ? null : p })}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                    value.periode === p ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {PERIODES_CHUTES_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={CLS_LABEL}>Date de la dernière chute (optionnel)</label>
            <input type="date" value={value.dateDerniereChute ?? ''} onChange={e => upd({ dateDerniereChute: e.target.value })} className={CLS_INPUT} />
          </div>

          <div>
            <label className={CLS_LABEL}>Circonstances</label>
            <textarea value={value.circonstances ?? ''} onChange={e => upd({ circonstances: e.target.value })}
              placeholder="Bain, escaliers, sol glissant, vertige, nuit..." rows={2} className={CLS_INPUT} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-700">Blessure occasionnée ?</span>
            <ToggleOuiNon value={value.blessureOccasionnee} onChange={v => upd({ blessureOccasionnee: v })} />
          </div>
          {value.blessureOccasionnee === 'oui' && (
            <input type="text" value={value.blessureDetail ?? ''} onChange={e => upd({ blessureDetail: e.target.value })}
              placeholder="Fracture poignet, contusion, point de suture..." className={CLS_INPUT} />
          )}

          <Echelle5
            label="Confiance lors des déplacements (1-5)"
            aide="1 = Très peu confiant · 5 = Totalement confiant"
            value={value.confianceDeplacements}
            onChange={n => upd({ confianceDeplacements: n })}
          />

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-700">Aménagement du domicile réalisé ?</span>
            <ToggleOuiNon value={value.amenagementDomicile} onChange={v => upd({ amenagementDomicile: v })} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── IBAN ─────────────────────────────────────────────────────────────────────

function validerIBAN(iban: string): boolean {
  const clean = iban.replace(/\s/g, '').toUpperCase();
  if (clean.length < 14 || clean.length > 34) return false;
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(clean)) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const numeric = rearranged.split('').map(c =>
    isNaN(Number(c)) ? (c.charCodeAt(0) - 55).toString() : c
  ).join('');
  let rem = 0;
  for (const d of numeric) rem = (rem * 10 + parseInt(d)) % 97;
  return rem === 1;
}

function formatIBAN(raw: string): string {
  return raw.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

// ─── IMC ──────────────────────────────────────────────────────────────────────

function getCategorieIMC(imc: number): { label: string; couleur: string } {
  if (imc < 18.5) return { label: 'Insuffisance pondérale', couleur: '#F59E0B' };
  if (imc < 25)   return { label: 'Poids normal',           couleur: '#3B6D11' };
  if (imc < 30)   return { label: 'Surpoids',               couleur: '#F59E0B' };
  if (imc < 35)   return { label: 'Obésité modérée',        couleur: '#EF8C00' };
  if (imc < 40)   return { label: 'Obésité sévère',         couleur: '#EF4444' };
  return           { label: 'Obésité morbide',              couleur: '#991B1B' };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onSubmit: (data: Omit<Participant, 'id' | 'token' | 'bilans'>) => void;
  onCancel: () => void;
  initial?: Partial<Participant>;
  /** Étape affichée (1 à 5). Si non fourni, le formulaire complet est affiché (usage modale). */
  step?: 1 | 2 | 3 | 4 | 5;
  /** Clé de brouillon localStorage (ex : "nouveau" ou l'id du participant). */
  draftKey?: string;
  /** Appelé à chaque changement, avec le nombre de champs remplis / total. */
  onCompletionChange?: (filled: number, total: number) => void;
}

export interface ParticipantFormHandle {
  /** Tente la soumission. Retourne false si le prénom ou le nom est manquant. */
  submit: () => boolean;
}

const CLS_INPUT = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10';
const CLS_LABEL = 'block text-sm font-medium text-gray-700 mb-1.5';

function computeCompletion(
  form: Record<string, string>,
  anamnese: AnamneseData,
  traitements: TraitementPatient[],
  antecedents: AntecedentMedical[],
  rgpd: RgpdConsent,
): { filled: number; total: number } {
  const champsTexte = [
    form.prenom, form.nom, form.dateNaissance, form.dateCreation,
    form.email, form.telephone,
    form.villeNaissance, form.codePostalNaissance,
    form.adresseRue, form.adresseCodePostal, form.adresseVille,
    form.taille, form.poids,
    form.iban, form.bic, form.allergies,
  ];
  let filled = champsTexte.filter(v => v !== '' && v != null).length;
  let total = champsTexte.length;

  total += 6;
  if (anamnese.douleurQuotidienne != null) filled++;
  if (anamnese.fatigueQuotidienne != null) filled++;
  if (anamnese.contreIndications != null) filled++;
  if (anamnese.chutes?.aChutes != null) filled++;
  if (traitements.length > 0) filled++;
  if (antecedents.length > 0) filled++;

  total += 1;
  if (rgpd.consentementObtenu) filled++;

  return { filled, total };
}

const ParticipantForm = forwardRef<ParticipantFormHandle, Props>(function ParticipantForm(
  { onSubmit, onCancel, initial, step, draftKey, onCompletionChange }, ref
) {
  const { structures } = useStructures();

  // ── Brouillon localStorage (page Nouveau participant / Modifier) ─
  const brouillon = draftKey ? getBrouillonParticipant(draftKey) : null;
  const seed: Partial<Participant> = brouillon?.data ? { ...initial, ...brouillon.data } : (initial ?? {});

  // ── Rattachement structure ──────────────────────────────────────
  const [structureId, setStructureId] = useState<string | undefined>(seed.structureId);

  // ── Traitements & antécédents structurés ───────────────────────
  const [traitements, setTraitements] = useState<TraitementPatient[]>(seed.traitements ?? []);
  const [antecedents, setAntecedents] = useState<AntecedentMedical[]>(seed.antecedentsMedicauxStructures ?? []);

  // ── Anamnèse (état de santé général) ────────────────────────────
  const [anamnese, setAnamnese] = useState<AnamneseData>({
    douleurQuotidienne: seed.anamnese?.douleurQuotidienne ?? null,
    fatigueQuotidienne: seed.anamnese?.fatigueQuotidienne ?? null,
    chutes: seed.anamnese?.chutes ?? {},
    contreIndications: seed.anamnese?.contreIndications ?? null,
    contreIndicationsDetail: seed.anamnese?.contreIndicationsDetail ?? '',
  });

  // ── Tags / tests ────────────────────────────────────────────────
  const [tags] = useState<TagPatient[]>(seed.tags ?? []);
  const [testsActifs] = useState<TestKey[]>(seed.testsActifs ?? []);

  // ── RGPD + droit à l'image ──────────────────────────────────────
  const [rgpd, setRgpd] = useState<RgpdConsent>({
    consentementObtenu:  seed.rgpd?.consentementObtenu  ?? false,
    droitAcces:          seed.rgpd?.droitAcces          ?? false,
    droitRectification:  seed.rgpd?.droitRectification  ?? false,
    droitEffacement:     seed.rgpd?.droitEffacement     ?? false,
    methodeConsentement: seed.rgpd?.methodeConsentement ?? 'oral_note',
    consentementDate:    seed.rgpd?.consentementDate    ?? new Date().toISOString().slice(0, 10),
  });
  const [droitImage, setDroitImage] = useState<boolean>(seed.droitImage ?? false);

  // ── Champs texte ────────────────────────────────────────────────
  const [form, setForm] = useState({
    nom:               seed.nom               ?? '',
    prenom:            seed.prenom            ?? '',
    dateNaissance:     seed.dateNaissance     ?? '',
    dateCreation:      seed.dateCreation      ?? new Date().toISOString().slice(0, 10),
    email:             seed.email             ?? '',
    telephone:         seed.telephone         ?? '',
    contexteClinic:    seed.contexteClinic    ?? '',
    adresseRue:        seed.adresseRue        ?? '',
    adresseCodePostal: seed.adresseCodePostal ?? '',
    adresseVille:      seed.adresseVille      ?? '',
    taille:               seed.taille?.toString() ?? '',
    poids:                seed.poids?.toString()  ?? '',
    villeNaissance:       seed.villeNaissance       ?? '',
    codePostalNaissance:  seed.codePostalNaissance  ?? '',
    iban:                 seed.iban              ?? '',
    bic:                  seed.bic               ?? '',
    allergies:            seed.allergies         ?? '',
  });

  // ── Handlers ────────────────────────────────────────────────────

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function buildPayload(): Omit<Participant, 'id' | 'token' | 'bilans'> {
    return {
      ...form,
      taille: form.taille ? Number(form.taille) : undefined,
      poids:  form.poids  ? Number(form.poids)  : undefined,
      // Préserver les données cliniques existantes (issues du bilan initial)
      pathologie:              initial?.pathologie,
      antecedentsMedicaux:     initial?.antecedentsMedicaux,
      antecedentsChirurgicaux: initial?.antecedentsChirurgicaux,
      modeDeplacementHabituel: initial?.modeDeplacementHabituel,
      modeDeplacementDetail:   initial?.modeDeplacementDetail,
      activitesSouhaitees:     initial?.activitesSouhaitees,
      objectifsPatient:        initial?.objectifsPatient,
      disponibilites:          initial?.disponibilites,
      droitImage,
      tags, testsActifs, rgpd,
      traitements: traitements.length > 0 ? traitements : undefined,
      antecedentsMedicauxStructures: antecedents.length > 0 ? antecedents : undefined,
      anamnese,
      structureId: structureId || undefined,
      profil:         initial?.profil,
      coordonnees:    initial?.coordonnees,
      geocodeFailed:  initial?.geocodeFailed,
      programmes:     initial?.programmes,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(buildPayload());
  }

  useImperativeHandle(ref, () => ({
    submit: () => {
      if (!form.prenom.trim() || !form.nom.trim()) return false;
      onSubmit(buildPayload());
      return true;
    },
  }));

  // ── Brouillon : sauvegarde auto (debounce 800ms) ─────────────────
  useEffect(() => {
    if (!draftKey) return;
    const t = setTimeout(() => {
      sauvegarderBrouillonParticipant(draftKey, step ?? 0, {
        ...form,
        taille: form.taille ? Number(form.taille) : undefined,
        poids:  form.poids  ? Number(form.poids)  : undefined,
        anamnese, traitements, antecedentsMedicauxStructures: antecedents,
        rgpd, droitImage, structureId,
      });
    }, 800);
    return () => clearTimeout(t);
  }, [draftKey, step, form, anamnese, traitements, antecedents, rgpd, droitImage, structureId]);

  // ── Indicateur de complétion ─────────────────────────────────────
  useEffect(() => {
    if (!onCompletionChange) return;
    const { filled, total } = computeCompletion(form, anamnese, traitements, antecedents, rgpd);
    onCompletionChange(filled, total);
  }, [form, anamnese, traitements, antecedents, rgpd, onCompletionChange]);

  // ── Calcul IMC ──────────────────────────────────────────────────
  const t = Number(form.taille), p = Number(form.poids);
  const imc = t > 0 && p > 0 ? Math.round((p / ((t / 100) ** 2)) * 10) / 10 : null;
  const imcCat = imc ? getCategorieIMC(imc) : null;

  // ── IBAN validation ──────────────────────────────────────────────
  const ibanClean = form.iban.replace(/\s/g, '');
  const ibanValide = ibanClean.length === 0 || validerIBAN(ibanClean);

  const emailPraticien = (() => {
    try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}').email || 'votre email professionnel'; }
    catch { return 'votre email professionnel'; }
  })();

  const showAll = step === undefined;
  const Wrapper = showAll ? 'form' : 'div';
  const wrapperProps = showAll ? { onSubmit: handleSubmit } : {};

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <Wrapper {...wrapperProps} className="space-y-6">

      {(showAll || step === 1) && <>
      {/* ── IDENTITÉ ── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={CLS_LABEL}>Prénom *</label>
          <input name="prenom" value={form.prenom} onChange={handleChange} required placeholder="Jean" className={CLS_INPUT} />
        </div>
        <div>
          <label className={CLS_LABEL}>Nom *</label>
          <input name="nom" value={form.nom} onChange={handleChange} required placeholder="Dupont" className={CLS_INPUT} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={CLS_LABEL}>Date de naissance *</label>
          <input type="date" name="dateNaissance" value={form.dateNaissance} onChange={handleChange} required className={CLS_INPUT} />
        </div>
        <div>
          <label className={CLS_LABEL}>Date d'entrée *</label>
          <input type="date" name="dateCreation" value={form.dateCreation} onChange={handleChange} required className={CLS_INPUT} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={CLS_LABEL}>Ville de naissance <span className="text-gray-400 font-normal">(optionnel)</span></label>
          <input name="villeNaissance" value={form.villeNaissance} onChange={handleChange}
            placeholder="Nantes" className={CLS_INPUT} />
        </div>
        <div>
          <label className={CLS_LABEL}>Code postal de naissance <span className="text-gray-400 font-normal">(optionnel)</span></label>
          <input name="codePostalNaissance" value={form.codePostalNaissance} onChange={handleChange}
            placeholder="44000" className={CLS_INPUT} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={CLS_LABEL}>Email</label>
          <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="jean@email.com" className={CLS_INPUT} />
        </div>
        <div>
          <label className={CLS_LABEL}>Téléphone</label>
          <input name="telephone" value={form.telephone} onChange={handleChange} placeholder="06 12 34 56 78" className={CLS_INPUT} />
        </div>
      </div>

      {/* ── MORPHOLOGIE + IMC ── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={CLS_LABEL}>Taille (cm)</label>
          <input type="number" name="taille" value={form.taille} onChange={handleChange}
            placeholder="165" min={100} max={220} className={CLS_INPUT} />
        </div>
        <div>
          <label className={CLS_LABEL}>Poids (kg)</label>
          <input type="number" name="poids" value={form.poids} onChange={handleChange}
            placeholder="70" min={30} max={250} className={CLS_INPUT} />
        </div>
      </div>
      {imc !== null && imcCat && (
        <div className="flex items-center gap-2.5 -mt-2">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: `${imcCat.couleur}18`, color: imcCat.couleur, border: `1px solid ${imcCat.couleur}30` }}
          >
            IMC {imc} — {imcCat.label}
          </span>
        </div>
      )}

      {/* ── ADRESSE ── */}
      <div>
        <label className={CLS_LABEL}>Adresse domicile <span className="text-gray-400 font-normal">(pour la carte patients)</span></label>
        <input name="adresseRue" value={form.adresseRue} onChange={handleChange}
          placeholder="12 rue des Lilas" className={`${CLS_INPUT} mb-2`} />
        <div className="grid grid-cols-3 gap-2">
          <input name="adresseCodePostal" value={form.adresseCodePostal} onChange={handleChange}
            placeholder="75013"
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
          <input name="adresseVille" value={form.adresseVille} onChange={handleChange}
            placeholder="Paris"
            className="col-span-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
        </div>
      </div>
      </>}

      {(showAll || step === 4) && <>
      {/* ── SAP — COORDONNÉES BANCAIRES ── */}
      <div className="border border-yellow-200 rounded-2xl overflow-hidden">
        <div className="bg-yellow-50 px-4 py-3 flex items-center gap-2.5">
          <span className="text-lg">🏦</span>
          <div>
            <div className="font-semibold text-dark text-sm">Coordonnées bancaires — Service à la Personne</div>
            <div className="text-xs text-gray-500">Pour les attestations fiscales SAP</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            ⚠️ Ces informations sont nécessaires pour établir les attestations fiscales SAP. Elles sont stockées uniquement sur votre appareil.
          </div>

          <div>
            <label className={CLS_LABEL}>IBAN</label>
            <input
              name="iban"
              value={formatIBAN(form.iban)}
              onChange={e => setForm(f => ({ ...f, iban: e.target.value.replace(/\s/g, '').toUpperCase() }))}
              placeholder="FR76 3000 6000 0112 3456 7890 189"
              maxLength={42}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 font-mono tracking-wide ${
                ibanClean && !ibanValide
                  ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                  : 'border-gray-200 focus:border-primary focus:ring-primary/10'
              }`}
            />
            {ibanClean && !ibanValide && (
              <p className="text-xs text-red-500 mt-1">Format IBAN invalide</p>
            )}
            {ibanClean && ibanValide && (
              <p className="text-xs text-green-600 mt-1">✓ IBAN valide</p>
            )}
          </div>

          <div>
            <label className={CLS_LABEL}>BIC / SWIFT</label>
            <input
              name="bic"
              value={form.bic}
              onChange={e => setForm(f => ({ ...f, bic: e.target.value.toUpperCase() }))}
              placeholder="BNPAFRPPXXX"
              maxLength={11}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-wide"
            />
          </div>
        </div>
      </div>

      {/* ── RATTACHEMENT STRUCTURE ── */}
      {structures.length > 0 && (
        <div className="border border-gray-100 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
            <span className="text-lg">🏢</span>
            <div>
              <div className="font-semibold text-dark text-sm">Rattachement</div>
              <div className="text-xs text-gray-500">Patient indépendant ou rattaché à une structure</div>
            </div>
          </div>
          <div className="p-4">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="rattachement" checked={!structureId} onChange={() => setStructureId(undefined)} className="accent-primary" />
                <span className="text-sm text-gray-700">Patient indépendant</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="rattachement" checked={!!structureId} onChange={() => setStructureId(structures[0]?.id)} className="accent-primary" />
                <span className="text-sm text-gray-700">Rattaché à une structure</span>
              </label>
              {structureId && (
                <select
                  value={structureId}
                  onChange={e => setStructureId(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
                >
                  {structures.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>
      )}

      {!showAll && (
        <div className="border border-dashed border-gray-200 rounded-2xl p-4 text-sm text-gray-400">
          🎯 Objectifs, activités souhaitées et disponibilités : ces champs seront ajoutés ici lors d'une prochaine mise à jour.
        </div>
      )}
      </>}

      {(showAll || step === 2) && <>
      {/* ── ÉTAT DE SANTÉ GÉNÉRAL ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-rose-50 to-orange-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">🩺</span>
          <div>
            <div className="font-semibold text-dark text-sm">État de santé général</div>
            <div className="text-xs text-gray-500">Ressenti au quotidien du patient</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <Echelle10
            label="Douleur quotidienne (0-10)"
            value={anamnese.douleurQuotidienne}
            onChange={n => setAnamnese(a => ({ ...a, douleurQuotidienne: n }))}
          />
          <Echelle10
            label="Fatigue quotidienne (0-10)"
            value={anamnese.fatigueQuotidienne}
            onChange={n => setAnamnese(a => ({ ...a, fatigueQuotidienne: n }))}
          />
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Contre-indications à l'effort physique ?</span>
              <ToggleOuiNon
                value={anamnese.contreIndications}
                onChange={v => setAnamnese(a => ({ ...a, contreIndications: v }))}
              />
            </div>
            {anamnese.contreIndications === 'oui' && (
              <textarea
                value={anamnese.contreIndicationsDetail ?? ''}
                onChange={e => setAnamnese(a => ({ ...a, contreIndicationsDetail: e.target.value }))}
                placeholder="FC max 130 bpm, éviter les impacts, pas de port de charges > 5 kg..."
                rows={2}
                className={`mt-2 ${CLS_INPUT}`}
              />
            )}
            <p className="text-xs text-gray-400 mt-1.5">Ces contre-indications seront affichées en alerte dans la fiche patient et tous les PDFs.</p>
          </div>
        </div>
      </div>

      {/* ── TRAITEMENTS ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">💊</span>
          <div>
            <div className="font-semibold text-dark text-sm">Traitements médicamenteux</div>
            <div className="text-xs text-gray-500">Nom · Dose · Effet secondaire notable</div>
          </div>
        </div>
        <div className="p-4">
          <ListeTraitementsForm value={traitements} onChange={setTraitements} />
        </div>
      </div>

      {/* ── ANTÉCÉDENTS MÉDICAUX ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-slate-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">🏥</span>
          <div>
            <div className="font-semibold text-dark text-sm">Antécédents médicaux</div>
            <div className="text-xs text-gray-500">Pathologies, chirurgies, fractures, prothèses, hospitalisations, accidents...</div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className={CLS_LABEL}>Allergies connues</label>
            <input name="allergies" value={form.allergies} onChange={handleChange}
              placeholder="Aspirine, latex..." className={CLS_INPUT} />
          </div>
          <ListeAntecedentsForm value={antecedents} onChange={setAntecedents} />
        </div>
      </div>

      {/* ── ANTÉCÉDENTS DE CHUTES ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-red-50 to-orange-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">⚠️</span>
          <div>
            <div className="font-semibold text-dark text-sm">Antécédents de chutes</div>
            <div className="text-xs text-gray-500">Nombre, période, circonstances...</div>
          </div>
        </div>
        <div className="p-4">
          <ChutesForm
            value={anamnese.chutes ?? {}}
            onChange={chutes => setAnamnese(a => ({ ...a, chutes }))}
          />
        </div>
      </div>
      </>}

      {!showAll && step === 3 && (
        <div className="border border-dashed border-gray-200 rounded-2xl p-4 text-sm text-gray-400">
          🏃 Autonomie, hygiène de vie et activité physique : ces champs seront ajoutés ici lors d'une prochaine mise à jour.
        </div>
      )}

      {(showAll || step === 5) && <>
      {!showAll && (
        <div className="border border-gray-100 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-teal-50 to-cyan-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
            <span className="text-lg">📋</span>
            <div>
              <div className="font-semibold text-dark text-sm">Récapitulatif</div>
              <div className="text-xs text-gray-500">Vérifiez les informations avant de créer la fiche</div>
            </div>
          </div>
          <div className="p-4 space-y-3 text-sm text-gray-600">
            <p><span className="font-medium text-gray-700">Identité :</span> {form.prenom || '—'} {form.nom || '—'}{form.dateNaissance ? ` · né(e) le ${new Date(form.dateNaissance).toLocaleDateString('fr-FR')}` : ''}</p>
            {(form.email || form.telephone) && (
              <p><span className="font-medium text-gray-700">Contact :</span> {[form.email, form.telephone].filter(Boolean).join(' · ')}</p>
            )}
            {(form.adresseRue || form.adresseVille) && (
              <p><span className="font-medium text-gray-700">Adresse :</span> {[form.adresseRue, form.adresseCodePostal, form.adresseVille].filter(Boolean).join(' ')}</p>
            )}
            {imc !== null && imcCat && (
              <p><span className="font-medium text-gray-700">IMC :</span> {imc} — {imcCat.label}</p>
            )}
            <p><span className="font-medium text-gray-700">Traitements :</span> {traitements.length > 0 ? `${traitements.length} renseigné(s)` : 'aucun'}</p>
            <p><span className="font-medium text-gray-700">Antécédents médicaux :</span> {antecedents.length > 0 ? `${antecedents.length} renseigné(s)` : 'aucun'}</p>
            {anamnese.contreIndications === 'oui' && (
              <p className="text-red-600"><span className="font-medium">⚠️ Contre-indications :</span> {anamnese.contreIndicationsDetail || 'oui (détail non précisé)'}</p>
            )}
            {anamnese.chutes?.aChutes === 'oui' && (
              <p><span className="font-medium text-gray-700">Chutes :</span> oui — {anamnese.chutes.nombreChutes ?? '?'} chute(s)</p>
            )}
            {structureId && (
              <p><span className="font-medium text-gray-700">Structure :</span> {structures.find(s => s.id === structureId)?.nom ?? '—'}</p>
            )}
          </div>
        </div>
      )}

      {/* ── RGPD + DROIT À L'IMAGE ── */}
      <div className="border border-blue-100 rounded-2xl overflow-hidden">
        <div className="bg-blue-50 px-4 py-3 flex items-center gap-2.5">
          <span className="text-lg">🔒</span>
          <div>
            <div className="font-semibold text-dark text-sm">Consentement &amp; protection des données</div>
            <div className="text-xs text-gray-500">Conformément au RGPD</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600 leading-relaxed">
            <div className="font-semibold text-gray-700 mb-1.5">📋 À lire au patient</div>
            <p>"Dans le cadre de votre suivi en APA, je collecte vos données personnelles et de santé. Utilisées uniquement pour votre suivi. Droits d'accès, rectification, effacement : <strong>{emailPraticien}</strong>"</p>
          </div>
          <div className="space-y-2.5">
            {([
              { key: 'consentementObtenu', label: 'Le patient a été informé et a consenti' },
              { key: 'droitAcces',         label: "Droit d'accès expliqué" },
              { key: 'droitRectification', label: 'Droit de rectification expliqué' },
              { key: 'droitEffacement',    label: "Droit à l'effacement expliqué" },
            ] as const).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700 select-none">
                <input type="checkbox" checked={rgpd[key]} className="w-4 h-4 accent-primary"
                  onChange={e => setRgpd(r => ({ ...r, [key]: e.target.checked }))} />
                {label}
              </label>
            ))}
            {/* Droit à l'image */}
            <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700 select-none">
              <input type="checkbox" checked={droitImage} className="w-4 h-4 accent-primary"
                onChange={e => setDroitImage(e.target.checked)} />
              Droit à l'image accordé (photos/vidéos en séance)
            </label>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-2">Mode de recueil</div>
            <div className="flex gap-2">
              {(['oral_note', 'ecrit', 'numerique'] as const).map(m => (
                <button key={m} type="button" onClick={() => setRgpd(r => ({ ...r, methodeConsentement: m }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    rgpd.methodeConsentement === m ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {m === 'oral_note' ? 'Oral noté' : m === 'ecrit' ? 'Écrit' : 'Numérique'}
                </button>
              ))}
            </div>
          </div>
          {!rgpd.consentementObtenu && (
            <p className="text-xs text-warning font-medium">⚠️ Sans consentement, les données de santé ne peuvent pas être collectées légalement.</p>
          )}
        </div>
      </div>

      </>}

      {showAll && (
        <div className="flex gap-3 pt-2">
          <button type="submit"
            className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2 hover:bg-dark transition-colors">
            <Save size={16} />
            Enregistrer
          </button>
          <button type="button" onClick={onCancel}
            className="px-5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2">
            <X size={16} />
            Annuler
          </button>
        </div>
      )}
    </Wrapper>
  );
});

export default ParticipantForm;
