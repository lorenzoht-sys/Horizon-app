import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Plus, Bot, Trash2, ChevronRight, ChevronLeft, X, Activity, Search } from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import { useProgramme } from '../hooks/useProgramme';
import { useProgrammeV2 } from '../hooks/useProgrammeV2';
import PageWrapper from '../components/layout/PageWrapper';
import { toast } from 'sonner';
import type { TypeProgramme, JourProgramme, ProgrammeV2, Participant } from '../types';
import { TYPE_PROGRAMME_LABELS as TPL, JOURS_PROGRAMME as JP, CATEGORIE_EXERCICE_LABELS as CEL } from '../types';
import { loadExercices, saveCustomExercice } from '../data/exercices';
import type { Exercice } from '../types';

// ── Types wizard ─────────────────────────────────────────────────────────────

interface FormExercice {
  tempId: string;
  nom: string;
  categorie: string;
  description: string;
  conseilSecurite: string;
  mode: 'reps' | 'duree' | 'total';
  series: number;
  repetitions: number;
  dureeSecondes: number;
  exerciceId?: string;
  niveau?: '1' | '2' | '3';
}

interface FormSeance {
  tempId: string;
  nom: string;
  exercices: FormExercice[];
}

interface WizardData {
  nom: string;
  type: TypeProgramme;
  objectif: string;
  messageMotivation: string;
  seances: FormSeance[];
  planning: Partial<Record<JourProgramme, string | null>>;
}

const EMPTY_WIZARD: WizardData = {
  nom: '',
  type: 'domicile',
  objectif: '',
  messageMotivation: '',
  seances: [],
  planning: {},
};

function progV2ToWizard(prog: ProgrammeV2): WizardData {
  const seances: FormSeance[] = prog.seances
    .sort((a, b) => a.ordre - b.ordre)
    .map(s => ({
      tempId: s.id,
      nom: s.nom,
      exercices: s.exercices
        .sort((a, b) => a.ordre - b.ordre)
        .map(ex => ({
          tempId: ex.id,
          nom: ex.nom,
          categorie: ex.categorie ?? 'Équilibre',
          description: ex.description ?? '',
          conseilSecurite: ex.conseilSecurite ?? '',
          mode: (ex.dureeSecondes != null && (ex.series == null || ex.series === undefined))
            ? 'total'
            : ex.dureeSecondes != null
            ? 'duree'
            : 'reps',
          series: ex.series ?? 3,
          repetitions: ex.repetitions ?? 10,
          dureeSecondes: ex.dureeSecondes ?? 30,
          exerciceId: ex.exerciceId,
          niveau: ex.niveau,
        })),
    }));

  const planning: Partial<Record<JourProgramme, string | null>> = {};
  for (const p of prog.planning) {
    planning[p.jour] = p.seanceId;
  }

  return {
    nom: prog.nom,
    type: prog.type,
    objectif: prog.objectif ?? '',
    messageMotivation: prog.messageMotivation ?? '',
    seances,
    planning,
  };
}

function newExercice(): FormExercice {
  return {
    tempId: uuidv4(),
    nom: '',
    categorie: 'Équilibre',
    description: '',
    conseilSecurite: '',
    mode: 'reps',
    series: 3,
    repetitions: 10,
    dureeSecondes: 30,
  };
}

function newSeance(label: string): FormSeance {
  return { tempId: uuidv4(), nom: label, exercices: [] };
}

// ── Bibliothèque : helpers ────────────────────────────────────────────────────

const CAT_DB_TO_LABEL: Record<string, string> = {
  equilibre: 'Équilibre', force: 'Force', mobilite: 'Souplesse',
  souplesse: 'Souplesse', endurance: 'Endurance', memoire: 'Coordination',
};

function defaultsFromLibrary(ex: Exercice, niveau: '1' | '2' | '3' = '2'): Omit<FormExercice, 'tempId'> {
  const c = ex.categorie;
  const cfg = ex.niveau_config?.[niveau];
  if (cfg) {
    const mode: 'reps' | 'duree' | 'total' =
      cfg.repetitions != null ? 'reps' :
      cfg.series > 1 ? 'duree' : 'total';
    return {
      nom: ex.nom,
      categorie: CAT_DB_TO_LABEL[c] ?? 'Équilibre',
      description: ex.description ?? '',
      conseilSecurite: ex.consigneSecurite ?? '',
      mode,
      series: cfg.series,
      repetitions: cfg.repetitions ?? 10,
      dureeSecondes: cfg.duree_secondes ?? 30,
      exerciceId: ex.id,
      niveau,
    };
  }
  const isTotal = c === 'endurance' || c === 'memoire';
  const isDuree = c === 'equilibre' || c === 'souplesse' || c === 'mobilite';
  return {
    nom: ex.nom,
    categorie: CAT_DB_TO_LABEL[c] ?? 'Équilibre',
    description: ex.description ?? '',
    conseilSecurite: ex.consigneSecurite ?? '',
    mode: isTotal ? 'total' : isDuree ? 'duree' : 'reps',
    series: isTotal ? 1 : 3,
    repetitions: 10,
    dureeSecondes: isDuree ? 30 : 60,
    exerciceId: ex.id,
    niveau,
  };
}

function defaultNiveauForPatient(participant?: Participant): '1' | '2' | '3' {
  if (!participant) return '2';
  const bilansSorted = [...(participant.bilans ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const latestTug = bilansSorted.find(b => b.tug3m != null)?.tug3m;
  if (latestTug != null && latestTug > 20) return '1';
  if (participant.profilHandicap === 'fauteuil_roulant' || participant.profilHandicap === 'avc_hemiplegie') return '1';
  return '2';
}

const PROFILE_CHIPS = [
  { value: 'tous',            label: 'Tous' },
  { value: 'fauteuil_roulant', label: '♿ Fauteuil' },
  { value: 'avc_hemiplegie',  label: 'AVC' },
  { value: 'parkinson',       label: 'Parkinson' },
  { value: 'sep',             label: 'SEP' },
];

const CAT_CHIPS = ['Tous', 'Équilibre', 'Force', 'Endurance', 'Souplesse', 'Coordination'];

const CAT_TO_DB: Record<string, string[]> = {
  'Équilibre':    ['equilibre'],
  'Force':        ['force'],
  'Endurance':    ['endurance'],
  'Souplesse':    ['souplesse', 'mobilite'],
  'Coordination': ['memoire'],
};

// ── Modale de sélection d'exercice ────────────────────────────────────────────

function ExercicePickerModal({
  onAdd,
  onAddManual,
  onClose,
  participant,
}: {
  onAdd: (ex: FormExercice) => void;
  onAddManual: (ex: FormExercice, saveToLib: boolean) => void;
  onClose: () => void;
  participant?: Participant;
}) {
  const [tab, setTab] = useState<'biblio' | 'manual'>('biblio');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('Tous');
  const [profileFilter, setProfileFilter] = useState(
    participant?.profilHandicap ?? 'tous'
  );
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [manualEx, setManualEx] = useState<FormExercice>(newExercice());
  const [saveToLib, setSaveToLib] = useState(false);

  const allExercices = useMemo(() => loadExercices(), []);

  const patientAge = participant?.dateNaissance
    ? Math.floor((Date.now() - new Date(participant.dateNaissance).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;
  const isSenior = patientAge != null && patientAge >= 65;
  const suggestLabel =
    participant && (participant.profilHandicap || isSenior)
      ? `Filtré pour ${participant.prenom} ${participant.nom}${patientAge ? ` (${patientAge} ans)` : ''}`
      : null;

  const filtered = useMemo(() => allExercices.filter(ex => {
    if (search) {
      const q = search.toLowerCase();
      if (!ex.nom.toLowerCase().includes(q) && !(ex.description ?? '').toLowerCase().includes(q)) return false;
    }
    if (catFilter !== 'Tous') {
      const allowed = CAT_TO_DB[catFilter] ?? [];
      if (!allowed.includes(ex.categorie)) return false;
    }
    if (profileFilter !== 'tous') {
      if (ex.profilsCompatibles && ex.profilsCompatibles.length > 0) {
        if (!ex.profilsCompatibles.includes(profileFilter as 'fauteuil_roulant' | 'avc_hemiplegie' | 'parkinson' | 'sep')) return false;
      }
    }
    return true;
  }), [allExercices, search, catFilter, profileFilter]);

  const chipBtn = (active: boolean, dark?: boolean): CSSProperties => ({
    padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 20,
    cursor: 'pointer', border: 'none',
    background: active ? (dark ? '#0D2B2B' : 'var(--color-teal)') : '#F1F5F9',
    color: active ? 'white' : '#374151',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 560, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E0EEEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0D2B2B' }}>Ajouter un exercice</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} color="#94A3B8" />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E0EEEE', flexShrink: 0 }}>
          {(['biblio', 'manual'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '11px', fontSize: 13, fontWeight: 600, background: 'none', border: 'none',
              cursor: 'pointer',
              color: tab === t ? 'var(--color-teal)' : '#94A3B8',
              borderBottom: tab === t ? '2px solid var(--color-teal)' : '2px solid transparent',
            }}>
              {t === 'biblio' ? '📚 Bibliothèque' : '✏️ Créer manuellement'}
            </button>
          ))}
        </div>

        {tab === 'biblio' ? (
          <>
            {/* Filtres */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #E0EEEE', flexShrink: 0 }}>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un exercice..."
                  style={{ ...inputStyle, paddingLeft: 32 }}
                />
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Catégorie</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
                  {CAT_CHIPS.map(c => (
                    <button key={c} onClick={() => setCatFilter(c)} style={chipBtn(catFilter === c)}>{c}</button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Profil patient</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
                  {PROFILE_CHIPS.map(p => (
                    <button key={p.value} onClick={() => setProfileFilter(p.value)} style={chipBtn(profileFilter === p.value, true)}>{p.label}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Suggestion */}
            {suggestLabel && (
              <div style={{ padding: '7px 18px', background: '#F0F9F9', borderBottom: '1px solid #E0EEEE', fontSize: 12, color: 'var(--color-teal)', fontWeight: 600, flexShrink: 0 }}>
                ⭐ {suggestLabel} — {filtered.length} exercice{filtered.length > 1 ? 's' : ''}
              </div>
            )}

            {/* Liste */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '10px 18px' }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8', fontSize: 14 }}>
                  Aucun exercice correspondant
                </div>
              ) : filtered.map(ex => {
                const wasAdded = addedIds.has(ex.id);
                return (
                  <div key={ex.id} style={{
                    background: wasAdded ? '#F0F9F9' : 'white',
                    border: `1px solid ${wasAdded ? 'rgba(43,191,191,0.3)' : '#E0EEEE'}`,
                    borderRadius: 12, padding: '11px 14px', marginBottom: 8,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0D2B2B', marginBottom: 2 }}>{ex.nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-teal)', fontWeight: 600, marginBottom: ex.niveaux?.intermediaire ? 3 : 0 }}>
                        {CAT_DB_TO_LABEL[ex.categorie] ?? ex.categorie}
                        {ex.profilsCompatibles && ex.profilsCompatibles.length > 0 && (
                          <span style={{ color: '#94A3B8', fontWeight: 400, marginLeft: 6 }}>
                            · {ex.profilsCompatibles.slice(0, 2).join(', ')}
                          </span>
                        )}
                      </div>
                      {ex.niveaux?.intermediaire && (
                        <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.4 }}>{ex.niveaux.intermediaire}</div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        const defaultNiveau = defaultNiveauForPatient(participant);
                        const formEx: FormExercice = { tempId: uuidv4(), ...defaultsFromLibrary(ex, defaultNiveau) };
                        onAdd(formEx);
                        setAddedIds(prev => new Set(prev).add(ex.id));
                      }}
                      style={{
                        flexShrink: 0, padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8,
                        cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' as const,
                        background: wasAdded ? '#DCFCE7' : 'var(--color-teal)',
                        color: wasAdded ? '#166534' : 'white',
                      }}
                    >
                      {wasAdded ? '✓ Ajouté' : '+ Ajouter'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 18px', borderTop: '1px solid #E0EEEE', flexShrink: 0 }}>
              <button onClick={onClose} style={{ ...btnSecondary, width: '100%', justifyContent: 'center' }}>
                Fermer {addedIds.size > 0 ? `(${addedIds.size} ajouté${addedIds.size > 1 ? 's' : ''})` : ''}
              </button>
            </div>
          </>
        ) : (
          /* Onglet manuel */
          <div style={{ padding: '18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ExerciceForm
              ex={manualEx}
              onChange={patch => setManualEx(prev => ({ ...prev, ...patch }))}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
              <input
                type="checkbox"
                checked={saveToLib}
                onChange={e => setSaveToLib(e.target.checked)}
                style={{ accentColor: 'var(--color-teal)', width: 16, height: 16 }}
              />
              Sauvegarder aussi dans ma bibliothèque
            </label>
            <button
              onClick={() => {
                if (!manualEx.nom.trim()) { toast.error("Donnez un nom à l'exercice"); return; }
                onAddManual(manualEx, saveToLib);
              }}
              style={{ ...btnPrimary, justifyContent: 'center' }}
            >
              <Plus size={14} /> Ajouter au bloc
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Affichage des jours ───────────────────────────────────────────────────────

const JOUR_COURT: Record<JourProgramme, string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu',
  vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
};

// ── Étape 1 — Infos générales ─────────────────────────────────────────────────

function Step1({ data, onChange }: {
  data: WizardData;
  onChange: (d: Partial<WizardData>) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <label style={labelStyle}>Nom du programme *</label>
        <input
          value={data.nom}
          onChange={e => onChange({ nom: e.target.value })}
          placeholder="ex: Programme Équilibre"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Type</label>
        <select value={data.type} onChange={e => onChange({ type: e.target.value as TypeProgramme })} style={inputStyle}>
          {(Object.entries(TPL) as [TypeProgramme, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Objectif</label>
        <input
          value={data.objectif}
          onChange={e => onChange({ objectif: e.target.value })}
          placeholder="ex: Améliorer l'équilibre et réduire le risque de chute"
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Message de motivation <span style={{ color: '#94A3B8', fontWeight: 400 }}>(visible par le patient)</span></label>
        <textarea
          value={data.messageMotivation}
          onChange={e => onChange({ messageMotivation: e.target.value })}
          rows={2}
          placeholder="ex: Un programme qui va vous mettre en confiance !"
          style={{ ...inputStyle, resize: 'none' }}
        />
      </div>
    </div>
  );
}

// ── Étape 2 — Blocs de séance + exercices ─────────────────────────────────────

const NIVEAU_STYLE: Record<'1' | '2' | '3', { bg: string; color: string; label: string; emoji: string }> = {
  '1': { bg: '#E1F5EE', color: '#0F6E56', label: 'Facile',  emoji: '🟢' },
  '2': { bg: '#FAEEDA', color: '#BA7517', label: 'Modéré', emoji: '🟡' },
  '3': { bg: '#FCEBEB', color: '#A32D2D', label: 'Intense', emoji: '🔴' },
};

function ExerciceForm({ ex, onChange, onDelete, libExercice }: {
  ex: FormExercice;
  onChange: (d: Partial<FormExercice>) => void;
  onDelete?: () => void;
  libExercice?: Exercice;
}) {
  const [flash, setFlash] = useState(false);

  function handleNiveauChange(n: '1' | '2' | '3') {
    const cfg = libExercice?.niveau_config?.[n];
    if (cfg) {
      const mode: 'reps' | 'duree' | 'total' =
        cfg.repetitions != null ? 'reps' :
        cfg.series > 1 ? 'duree' : 'total';
      onChange({
        niveau: n,
        series: cfg.series,
        mode,
        repetitions: cfg.repetitions ?? ex.repetitions,
        dureeSecondes: cfg.duree_secondes ?? ex.dureeSecondes,
      });
      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
    } else {
      onChange({ niveau: n });
    }
  }

  const niv = ex.niveau ?? '2';
  const nivStyle = NIVEAU_STYLE[niv as '1' | '2' | '3'];

  return (
    <div style={{ background: '#F8FAFA', border: '1px solid #E0EEEE', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
        <input
          value={ex.nom}
          onChange={e => onChange({ nom: e.target.value })}
          placeholder="Nom de l'exercice *"
          style={{ ...inputStyle, flex: 2 }}
        />
        <select value={ex.categorie} onChange={e => onChange({ categorie: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
          {CEL.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {libExercice?.niveau_config && (
          <select
            value={niv}
            onChange={e => handleNiveauChange(e.target.value as '1' | '2' | '3')}
            style={{
              fontSize: 11, fontWeight: 700, padding: '5px 6px', borderRadius: 8,
              border: 'none', cursor: 'pointer', flexShrink: 0,
              background: nivStyle.bg, color: nivStyle.color,
            }}
            title="Niveau de difficulté"
          >
            <option value="1" style={{ background: '#E1F5EE', color: '#0F6E56' }}>🟢 Facile</option>
            <option value="2" style={{ background: '#FAEEDA', color: '#BA7517' }}>🟡 Modéré</option>
            <option value="3" style={{ background: '#FCEBEB', color: '#A32D2D' }}>🔴 Intense</option>
          </select>
        )}
        {onDelete && (
          <button onClick={onDelete} style={btnDeleteSmall} title="Supprimer">
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {flash && (
        <div style={{ fontSize: 11, color: '#0F6E56', marginBottom: 6, fontWeight: 600 }}>
          ✓ Valeurs mises à jour
        </div>
      )}
      <input
        value={ex.description}
        onChange={e => onChange({ description: e.target.value })}
        placeholder="Description (comment faire)"
        style={{ ...inputStyle, marginBottom: 6 }}
      />
      <input
        value={ex.conseilSecurite}
        onChange={e => onChange({ conseilSecurite: e.target.value })}
        placeholder="💡 Conseil sécurité (optionnel)"
        style={{ ...inputStyle, marginBottom: 8 }}
      />
      {/* Mode quantité */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        {(['reps', 'duree', 'total'] as const).map(m => (
          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', color: ex.mode === m ? 'var(--color-teal)' : '#6B7280' }}>
            <input type="radio" checked={ex.mode === m} onChange={() => onChange({ mode: m })} style={{ accentColor: 'var(--color-teal)' }} />
            {m === 'reps' ? 'Séries × Rép.' : m === 'duree' ? 'Séries × Durée' : 'Durée totale'}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {ex.mode !== 'total' && (
          <label style={qtyLabelStyle}>
            <span style={qtySpanStyle}>Séries</span>
            <input type="number" min={1} value={ex.series} onChange={e => onChange({ series: +e.target.value })} style={qtyInputStyle} />
          </label>
        )}
        {ex.mode === 'reps' && (
          <label style={qtyLabelStyle}>
            <span style={qtySpanStyle}>Répétitions</span>
            <input type="number" min={1} value={ex.repetitions} onChange={e => onChange({ repetitions: +e.target.value })} style={qtyInputStyle} />
          </label>
        )}
        {(ex.mode === 'duree' || ex.mode === 'total') && (
          <label style={qtyLabelStyle}>
            <span style={qtySpanStyle}>Durée (sec)</span>
            <input type="number" min={1} value={ex.dureeSecondes} onChange={e => onChange({ dureeSecondes: +e.target.value })} style={qtyInputStyle} />
          </label>
        )}
      </div>
    </div>
  );
}

function Step2({ data, onChange, participant }: {
  data: WizardData;
  onChange: (d: Partial<WizardData>) => void;
  participant?: Participant;
}) {
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const allExercices = useMemo(() => loadExercices(), []);

  function updateSeance(idx: number, patch: Partial<FormSeance>) {
    const seances = data.seances.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange({ seances });
  }

  function addSeance() {
    const label = `Séance ${String.fromCharCode(65 + data.seances.length)}`;
    onChange({ seances: [...data.seances, newSeance(label)] });
  }

  function deleteSeance(idx: number) {
    const seances = data.seances.filter((_, i) => i !== idx);
    // Remove planning entries for this seance
    const removedTempId = data.seances[idx].tempId;
    const planning = { ...data.planning };
    for (const jour of JP) {
      if (planning[jour] === removedTempId) planning[jour] = null;
    }
    onChange({ seances, planning });
  }

  function addExerciceToSeance(seanceIdx: number, ex: FormExercice) {
    const seances = data.seances.map((s, i) =>
      i === seanceIdx ? { ...s, exercices: [...s.exercices, ex] } : s
    );
    onChange({ seances });
  }

  function updateExercice(seanceIdx: number, exIdx: number, patch: Partial<FormExercice>) {
    const seances = data.seances.map((s, i) => {
      if (i !== seanceIdx) return s;
      return { ...s, exercices: s.exercices.map((e, j) => j === exIdx ? { ...e, ...patch } : e) };
    });
    onChange({ seances });
  }

  function deleteExercice(seanceIdx: number, exIdx: number) {
    const seances = data.seances.map((s, i) => {
      if (i !== seanceIdx) return s;
      return { ...s, exercices: s.exercices.filter((_, j) => j !== exIdx) };
    });
    onChange({ seances });
  }

  return (
    <div>
      {data.seances.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
          <Activity size={36} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>Ajoutez un bloc de séance pour commencer</p>
        </div>
      )}
      {data.seances.map((seance, sIdx) => (
        <div key={seance.tempId} style={{ background: 'white', border: '1px solid #E0EEEE', borderRadius: 14, padding: '16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <input
              value={seance.nom}
              onChange={e => updateSeance(sIdx, { nom: e.target.value })}
              placeholder="Nom du bloc (ex: Séance A)"
              style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
            />
            <button onClick={() => deleteSeance(sIdx)} style={btnDeleteSmall} title="Supprimer ce bloc">
              <Trash2 size={13} />
            </button>
          </div>
          {seance.exercices.map((ex, exIdx) => (
            <ExerciceForm
              key={ex.tempId}
              ex={ex}
              onChange={patch => updateExercice(sIdx, exIdx, patch)}
              onDelete={() => deleteExercice(sIdx, exIdx)}
              libExercice={ex.exerciceId ? allExercices.find(e => e.id === ex.exerciceId) : undefined}
            />
          ))}
          <button onClick={() => setPickerFor(sIdx)} style={btnSecondary}>
            <Plus size={13} /> Ajouter un exercice
          </button>
        </div>
      ))}
      <button onClick={addSeance} style={btnPrimary}>
        <Plus size={15} /> Ajouter un bloc de séance
      </button>

      {pickerFor !== null && (
        <ExercicePickerModal
          participant={participant}
          onAdd={ex => addExerciceToSeance(pickerFor, ex)}
          onAddManual={(ex, toLib) => {
            if (toLib) {
              saveCustomExercice({
                id: uuidv4(),
                nom: ex.nom,
                categorie: (Object.keys(CAT_DB_TO_LABEL).find(k => CAT_DB_TO_LABEL[k] === ex.categorie) ?? 'equilibre') as 'equilibre' | 'force' | 'mobilite' | 'souplesse' | 'endurance' | 'memoire',
                description: ex.description,
                consigneSecurite: ex.conseilSecurite || undefined,
                niveaux: { debutant: '', intermediaire: ex.description, avance: '' },
                dureeEstimeeMinutes: 5,
              });
              toast.success('Exercice sauvegardé dans la bibliothèque !');
            }
            addExerciceToSeance(pickerFor, { ...ex, tempId: uuidv4() });
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}

// ── Étape 3 — Planning hebdomadaire ───────────────────────────────────────────

function Step3({ data, onChange }: {
  data: WizardData;
  onChange: (d: Partial<WizardData>) => void;
}) {
  const jourActifs = JP.filter(j => data.planning[j]);
  const totalSeances = jourActifs.length;

  return (
    <div>
      {data.seances.length === 0 && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#92400E' }}>
          ⚠️ Créez au moins un bloc de séance à l'étape 2 pour planifier votre semaine.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {JP.map(jour => (
          <div key={jour} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 80, fontSize: 14, fontWeight: 600, color: '#0D2B2B', textTransform: 'capitalize' }}>{jour}</span>
            <select
              value={data.planning[jour] ?? ''}
              onChange={e => onChange({ planning: { ...data.planning, [jour]: e.target.value || null } })}
              style={{ ...inputStyle, flex: 1 }}
              disabled={data.seances.length === 0}
            >
              <option value="">Repos</option>
              {data.seances.map(s => (
                <option key={s.tempId} value={s.tempId}>{s.nom || '(Sans nom)'}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {totalSeances > 0 && (
        <div style={{ background: '#F0F9F9', border: '1px solid rgba(43,191,191,0.25)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--color-ink)' }}>
          ✅ <strong>{totalSeances} séance{totalSeances > 1 ? 's' : ''}/semaine</strong>
          {' · '}
          {JP.filter(j => data.planning[j]).map(j => JOUR_COURT[j]).join(' · ')}
        </div>
      )}
    </div>
  );
}

// ── Étape 4 — Récapitulatif ───────────────────────────────────────────────────

function Step4({ data }: { data: WizardData }) {
  const jourActifs = JP.filter(j => data.planning[j]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Infos */}
      <div style={{ background: 'var(--color-ink)', borderRadius: 14, padding: '16px 18px', color: 'white' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{data.nom || '(Sans titre)'}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>{TPL[data.type]}</div>
        {data.objectif && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 6 }}>🎯 {data.objectif}</div>}
        {data.messageMotivation && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>💬 "{data.messageMotivation}"</div>}
      </div>
      {/* Planning */}
      {jourActifs.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #E0EEEE', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Planning</div>
          {jourActifs.map(jour => {
            const seanceId = data.planning[jour];
            const seance = data.seances.find(s => s.tempId === seanceId);
            return (
              <div key={jour} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                <span style={{ textTransform: 'capitalize', color: '#0D2B2B' }}>{jour}</span>
                <span style={{ fontWeight: 600, color: 'var(--color-teal)' }}>{seance?.nom || ''}</span>
              </div>
            );
          })}
        </div>
      )}
      {/* Seances */}
      {data.seances.map(s => (
        <div key={s.tempId} style={{ background: 'white', border: '1px solid #E0EEEE', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0D2B2B', marginBottom: 8 }}>{s.nom}</div>
          {s.exercices.length === 0 ? (
            <span style={{ fontSize: 12, color: '#94A3B8' }}>Aucun exercice</span>
          ) : s.exercices.map((ex, i) => (
            <div key={ex.tempId} style={{ fontSize: 13, color: '#4A6080', marginBottom: 4 }}>
              {i + 1}. {ex.nom || '(Sans nom)'}
              {' · '}
              {ex.mode === 'reps' ? `${ex.series} × ${ex.repetitions} rép.` :
               ex.mode === 'duree' ? `${ex.series} × ${ex.dureeSecondes}s` :
               `${ex.dureeSecondes}s`}
              {ex.categorie && <span style={{ marginLeft: 6, color: 'var(--color-teal)', fontSize: 11 }}>{ex.categorie}</span>}
              {ex.niveau && <span style={{ marginLeft: 6, fontSize: 10 }}>{NIVEAU_STYLE[ex.niveau as '1'|'2'|'3'].emoji}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Carte programme V2 ───────────────────────────────────────────────────────

function ProgrammeCard({ prog, onToggle, onDelete, onEdit }: {
  prog: ProgrammeV2;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const jourActifs = JP.filter(j => prog.planning.some(p => p.jour === j));
  const totalEx = prog.seances.reduce((sum, s) => sum + s.exercices.length, 0);
  const date = new Date(prog.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{
      background: 'white',
      border: `1px solid ${prog.actif ? 'rgba(43,191,191,0.25)' : '#E5E7EB'}`,
      borderRadius: 16,
      padding: '16px 18px',
      marginBottom: 12,
      opacity: prog.actif ? 1 : 0.7,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0D2B2B' }}>🏋️ {prog.nom}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: prog.actif ? '#DCFCE7' : '#F1F5F9',
              color: prog.actif ? '#16A34A' : '#6B7280',
            }}>
              {prog.actif ? '✅ Actif' : 'Inactif'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 6 }}>
            {jourActifs.length > 0
              ? jourActifs.map(j => JOUR_COURT[j]).join(' · ')
              : 'Pas de planning'
            }
            {totalEx > 0 && ` · ${totalEx} exercice${totalEx > 1 ? 's' : ''}`}
          </div>
          <div style={{ fontSize: 11, color: '#CBD5E1' }}>Mis à jour le {date}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
        <button onClick={onEdit} style={{ ...btnSmall, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
          ✏️ Modifier
        </button>
        <button onClick={onToggle} style={{
          ...btnSmall,
          background: prog.actif ? '#FEF3C7' : '#DCFCE7',
          color: prog.actif ? '#92400E' : '#166534',
          border: prog.actif ? '1px solid #FDE68A' : '1px solid #BBF7D0',
        }}>
          {prog.actif ? 'Désactiver' : 'Activer'}
        </button>
        {confirmDelete ? (
          <>
            <button onClick={onDelete} style={{ ...btnSmall, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }}>
              Confirmer la suppression
            </button>
            <button onClick={() => setConfirmDelete(false)} style={{ ...btnSmall }}>Annuler</button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ ...btnSmall }}>
            <Trash2 size={11} /> Supprimer
          </button>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #E0EEEE',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  background: 'white',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: '#0D2B2B',
  marginBottom: 6,
};

const btnPrimary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'var(--color-teal)',
  color: 'white',
  border: 'none',
  borderRadius: 10,
  padding: '9px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'white',
  color: '#0D2B2B',
  border: '1px solid #E0EEEE',
  borderRadius: 10,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const btnDeleteSmall: CSSProperties = {
  background: '#FEE2E2',
  color: '#DC2626',
  border: 'none',
  borderRadius: 8,
  padding: '6px 8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

const btnSmall: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: '#F1F5F9',
  color: '#374151',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

const qtyLabelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  fontSize: 12,
};

const qtySpanStyle: CSSProperties = {
  color: '#6B7280',
  fontSize: 11,
};

const qtyInputStyle: CSSProperties = {
  width: 70,
  border: '1px solid #E0EEEE',
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  textAlign: 'center',
};

// ── Page principale ───────────────────────────────────────────────────────────

const STEP_LABELS = ['Informations', 'Séances', 'Planning', 'Récapitulatif'];

export default function ProgrammePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { participants } = useParticipants();
  const { programmes: progsV2, loading, createProgramme, updateProgramme, toggleActif, deleteProgrammeV2 } = useProgrammeV2(id!);
  const { programmes: progsV1, programmeActif: progV1Actif } = useProgramme(id!);

  const participant = participants.find(p => p.id === id);

  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [wizardData, setWizardData] = useState<WizardData>(EMPTY_WIZARD);
  const [saving, setSaving] = useState(false);
  const [editingProgId, setEditingProgId] = useState<string | null>(null);

  function updateWizard(patch: Partial<WizardData>) {
    setWizardData(prev => ({ ...prev, ...patch }));
  }

  function openWizard() {
    setWizardData(EMPTY_WIZARD);
    setEditingProgId(null);
    setStep(1);
    setShowWizard(true);
  }

  function openEditWizard(prog: ProgrammeV2) {
    setWizardData(progV2ToWizard(prog));
    setEditingProgId(prog.id);
    setStep(1);
    setShowWizard(true);
  }

  function closeWizard() {
    setShowWizard(false);
    setEditingProgId(null);
    setStep(1);
  }

  function nextStep() {
    if (step === 1 && !wizardData.nom.trim()) {
      toast.error('Donnez un nom au programme');
      return;
    }
    if (step === 2 && wizardData.seances.some(s => !s.nom.trim())) {
      toast.error('Donnez un nom à chaque bloc de séance');
      return;
    }
    if (step < 4) setStep(s => s + 1);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        nom: wizardData.nom,
        objectif: wizardData.objectif || undefined,
        messageMotivation: wizardData.messageMotivation || undefined,
        type: wizardData.type,
        seances: wizardData.seances.map(s => ({
          tempId: s.tempId,
          nom: s.nom,
          exercices: s.exercices.map(ex => ({
            nom: ex.nom,
            categorie: ex.categorie || undefined,
            description: ex.description || undefined,
            conseilSecurite: ex.conseilSecurite || undefined,
            series: ex.mode !== 'total' ? ex.series : undefined,
            repetitions: ex.mode === 'reps' ? ex.repetitions : undefined,
            dureeSecondes: (ex.mode === 'duree' || ex.mode === 'total') ? ex.dureeSecondes : undefined,
            exerciceId: ex.exerciceId || undefined,
            niveau: ex.niveau || undefined,
          })),
        })),
        planning: wizardData.planning,
      };

      if (editingProgId) {
        const ok = await updateProgramme(editingProgId, payload);
        if (ok) {
          toast.success('Programme mis à jour !');
          closeWizard();
        } else {
          toast.error('Erreur lors de la mise à jour');
        }
      } else {
        const ok = await createProgramme(payload);
        if (ok) {
          toast.success('Programme créé et partagé avec le patient !');
          closeWizard();
        } else {
          toast.error('Erreur lors de la création du programme');
        }
      }
    } finally {
      setSaving(false);
    }
  }

  if (!participant) {
    return <PageWrapper><div className="text-center py-20 text-gray-400">Participant introuvable</div></PageWrapper>;
  }

  // V1 programmes without a type (old flat structure)
  const progsV1Only = progsV1.filter(p => !progsV2.some(p2 => p2.id === p.id));

  return (
    <PageWrapper>
      <Link to={`/participant/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
        <ArrowLeft size={15} />
        {participant.prenom} {participant.nom}
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0D2B2B', marginBottom: 2 }}>
            Programmes de {participant.prenom} {participant.nom}
          </h1>
          <p style={{ fontSize: 13, color: '#94A3B8' }}>
            {progsV2.filter(p => p.actif).length + (progV1Actif ? 1 : 0)} programme{progsV2.filter(p => p.actif).length > 1 ? 's' : ''} actif{progsV2.filter(p => p.actif).length > 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => navigate('/assistant', { state: { patientId: id } })}
            style={{ ...btnSecondary, gap: 6 }}
          >
            <Bot size={14} /> Générer avec l'IA
          </button>
          <button onClick={openWizard} style={btnPrimary}>
            <Plus size={14} /> Créer un programme
          </button>
        </div>
      </div>

      {/* Programmes V2 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: 14 }}>Chargement…</div>
      ) : progsV2.length === 0 && progsV1Only.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', border: '1px dashed #E0EEEE', borderRadius: 18 }}>
          <Activity size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0D2B2B', marginBottom: 8 }}>Aucun programme</div>
          <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 20, lineHeight: 1.6 }}>
            Créez un premier programme d'exercices<br />pour {participant.prenom}.
          </div>
          <button onClick={openWizard} style={btnPrimary}><Plus size={14} /> Créer un programme</button>
        </div>
      ) : (
        <>
          {progsV2.filter(p => p.actif).length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                Programmes actifs ({progsV2.filter(p => p.actif).length})
              </h2>
              {progsV2.filter(p => p.actif).map(prog => (
                <ProgrammeCard
                  key={prog.id}
                  prog={prog}
                  onToggle={() => toggleActif(prog.id, false)}
                  onDelete={() => deleteProgrammeV2(prog.id).then(() => toast.success('Programme supprimé'))}
                  onEdit={() => openEditWizard(prog)}
                />
              ))}
            </section>
          )}

          {progsV2.filter(p => !p.actif).length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                Programmes inactifs
              </h2>
              {progsV2.filter(p => !p.actif).map(prog => (
                <ProgrammeCard
                  key={prog.id}
                  prog={prog}
                  onToggle={() => toggleActif(prog.id, true)}
                  onDelete={() => deleteProgrammeV2(prog.id).then(() => toast.success('Programme supprimé'))}
                  onEdit={() => openEditWizard(prog)}
                />
              ))}
            </section>
          )}

          {/* Anciens programmes V1 (sans planning) */}
          {progsV1Only.length > 0 && (
            <section>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                Anciens programmes
              </h2>
              {progsV1Only.map(p => (
                <div key={p.id} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0D2B2B' }}>{p.titre}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>{p.exercices.length} exercice{p.exercices.length > 1 ? 's' : ''}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#CBD5E1' }}>Ancien format</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {/* ── Wizard overlay ─────────────────────────────────────────────────── */}
      {showWizard && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)',
          zIndex: 1100,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '24px 16px',
          overflowY: 'auto',
        }}>
          <div style={{
            background: 'white',
            borderRadius: 20,
            width: '100%',
            maxWidth: 640,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            overflow: 'hidden',
          }}>
            {/* Header wizard */}
            <div style={{ background: 'var(--color-ink)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>
                  {editingProgId ? 'Modifier le programme' : 'Nouveau programme'} — Étape {step}/{STEP_LABELS.length}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                  {STEP_LABELS[step - 1]}
                </div>
              </div>
              <button onClick={closeWizard} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: 'white' }}>
                <X size={16} />
              </button>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: '#E0EEEE' }}>
              <div style={{ height: '100%', background: 'var(--color-teal)', width: `${(step / STEP_LABELS.length) * 100}%`, transition: 'width 0.3s ease' }} />
            </div>

            {/* Contenu de l'étape */}
            <div style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto' }}>
              {step === 1 && <Step1 data={wizardData} onChange={updateWizard} />}
              {step === 2 && <Step2 data={wizardData} onChange={updateWizard} participant={participant} />}
              {step === 3 && <Step3 data={wizardData} onChange={updateWizard} />}
              {step === 4 && <Step4 data={wizardData} />}
            </div>

            {/* Navigation */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <button
                onClick={() => step > 1 ? setStep(s => s - 1) : closeWizard()}
                style={btnSecondary}
              >
                <ChevronLeft size={14} />
                {step > 1 ? 'Retour' : 'Annuler'}
              </button>

              {step < 4 ? (
                <button onClick={nextStep} style={btnPrimary}>
                  Suivant <ChevronRight size={14} />
                </button>
              ) : (
                <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Sauvegarde…' : editingProgId ? '✅ Enregistrer les modifications' : '✅ Sauvegarder et partager'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
