import { useState, useEffect, useCallback } from 'react';
import { getBilanEnCoursKey } from '../../hooks/useBrouillonBilan';
import GIRWidget from './GIRWidget';

// ─── Types ──────────────────────────────────────────────────────────────────

type OuiNon = 'oui' | 'non';

type QuestionType =
  | 'text' | 'date' | 'number' | 'tel' | 'email' | 'oui-non'
  | 'echelle-10' | 'echelle-5' | 'choix-unique' | 'choix-multiple'
  | 'textarea' | 'time'
  | 'operations-list'
  | 'gir';

interface Question {
  id: string;
  label: string;
  type: QuestionType;
  obligatoire?: boolean;
  options?: string[];
  placeholder?: string;
  avecChampLibre?: boolean;
  conditionnelSi?: string;   // 'field_valeur'
  aide?: string;             // texte d'aide affiché sous la question
  alerteSi?: string[];       // valeurs qui déclenchent une alerte
  alerteMessage?: string;
}

interface BlocConditionnel {
  id: string;
  titre: string;
  questionCle?: { label: string; field: string };
  afficherSi?: OuiNon;
  questions: Question[];
}

export interface FormulaireFlat {
  data: Record<string, any>;
  reponsesClés: Record<string, OuiNon | null>;
}

// ─── Interfaces listes dynamiques ────────────────────────────────────────────

export interface OperationMedicale {
  id: string;
  type: string;
  date?: string;
  coteOpere?: 'droit' | 'gauche' | 'bilateral' | null;
  complication?: boolean;
  complicationDetail?: string;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── BLOCS ──────────────────────────────────────────────────────────────────

const BLOCS: BlocConditionnel[] = [
  {
    id: 'modeDeplacement',
    titre: '🚶 Mode de déplacement',
    questions: [
      {
        id: 'deplacement',
        label: 'Mode de déplacement habituel',
        type: 'choix-unique',
        options: ['🚗 Voiture', '🚲 Vélo', '🚌 Transports', '🚶 Marche', '♿ Fauteuil', '✏️ Autre'],
      },
    ],
  },

  {
    id: 'douleurFatigue',
    titre: '💊 Douleur & Fatigue',
    questions: [
      { id: 'douleur', label: 'Douleur quotidienne (0-10)', type: 'echelle-10' },
      { id: 'fatigue', label: 'Fatigue quotidienne (0-10)', type: 'echelle-10' },
    ],
  },

  // ─── CONDITIONNELS ───────────────────────────────────────────────────────

  {
    id: 'chutes',
    titre: '⚠️ Antécédents de chutes',
    questionCle: { label: 'A-t-il fait des chutes dans les 12 derniers mois ?', field: 'aChutes' },
    afficherSi: 'oui',
    questions: [
      { id: 'nombreChutes', label: 'Nombre de chutes', type: 'number' },
      { id: 'circonstances', label: 'Circonstances', type: 'textarea', placeholder: 'Bain, escaliers, sol glissant, vertige, nuit...' },
      {
        id: 'derniereChute',
        label: 'La dernière chute remonte à quand ?',
        type: 'choix-unique',
        options: [
          "Il y a moins d'une semaine",
          "Il y a moins d'un mois",
          'Il y a 1 à 3 mois',
          'Il y a 3 à 6 mois',
          'Il y a 6 à 12 mois',
        ],
        aide: "Une chute récente est un signal d'alerte prioritaire",
        alerteSi: ["Il y a moins d'une semaine", "Il y a moins d'un mois"],
        alerteMessage: "Adapter les exercices d'équilibre en priorité. Travailler près d'un appui lors des premières séances.",
      },
      { id: 'blessureOccasionnee', label: 'Blessure occasionnée ?', type: 'oui-non' },
      { id: 'blessureDetail', label: 'Laquelle ?', type: 'text', placeholder: 'Fracture poignet, contusion, point de suture...', conditionnelSi: 'blessureOccasionnee_oui' },
      {
        id: 'confianceDeplacements',
        label: 'Confiance lors des déplacements (1-5)',
        type: 'echelle-5',
        aide: '1 = Très peu confiant · 5 = Totalement confiant',
      },
      { id: 'amenagementDomicile', label: 'Aménagement du domicile réalisé ?', type: 'oui-non' },
    ],
  },

  {
    id: 'postOp',
    titre: '🏥 Opération(s) récente(s)',
    questionCle: { label: 'A-t-il été opéré récemment (< 12 mois) ?', field: 'aOperationRecente' },
    afficherSi: 'oui',
    questions: [
      { id: 'operations',    label: 'Opération(s)',              type: 'operations-list' },
      { id: 'autorisationAPA', label: 'Autorisation médicale APA ?', type: 'oui-non' },
      { id: 'kineEnCours',     label: 'Kiné en parallèle ?',        type: 'oui-non' },
      { id: 'douleurPostOp',   label: 'Douleur actuelle (EVA 0-10)', type: 'echelle-10' },
      {
        id: 'appareillage',
        label: 'Appareillage en cours',
        type: 'choix-unique',
        options: ['Aucun', 'Attelle', 'Béquilles', 'Autre'],
      },
    ],
  },

  {
    id: 'blessure',
    titre: '🤕 Blessure en cours',
    questionCle: { label: 'A-t-il une blessure ou douleur chronique en cours ?', field: 'aBlessure' },
    afficherSi: 'oui',
    questions: [
      { id: 'typeBlessure',         label: 'Type de blessure',          type: 'text',       placeholder: 'Entorse, tendinite, hernie discale...' },
      { id: 'localisationBlessure', label: 'Localisation',              type: 'text',       placeholder: 'Genou droit, épaule gauche...' },
      { id: 'mecanismeBlessure',    label: 'Mécanisme',                 type: 'choix-unique', options: ['Traumatique (choc)', 'Surmenage (progressif)', 'Autre'] },
      { id: 'douleurBlessure',      label: 'Douleur au repos (0-10)',   type: 'echelle-10' },
      { id: 'douleurEffort',        label: "Douleur à l'effort (0-10)", type: 'echelle-10' },
    ],
  },

  {
    id: 'pathologieChronique',
    titre: '💊 Pathologie chronique',
    questionCle: { label: 'A-t-il une pathologie chronique (cardiaque, diabète, BPCO...) ?', field: 'aPathologieChronique' },
    afficherSi: 'oui',
    questions: [
      {
        id: 'naturePathologie',
        label: 'Nature de la pathologie principale',
        type: 'text',
        placeholder: 'Insuffisance cardiaque, diabète T2, BPCO...',
      },
      { id: 'fcMax',       label: 'FC max autorisée (si prescrite)', type: 'number', placeholder: '130' },
      {
        id: 'dyspneeEffort',
        label: "Dyspnée à l'effort ?",
        type: 'oui-non',
        aide: "Si le patient ne sait pas, laissez vide — à observer lors des premières séances",
      },
      {
        id: 'dyspneeRepos',
        label: 'Dyspnée au repos ?',
        type: 'oui-non',
        aide: "Si le patient ne sait pas, laissez vide",
      },
      { id: 'spo2Repos',         label: 'SpO₂ au repos (%)',        type: 'number' },
      { id: 'tensionArterielle', label: 'Tension artérielle connue', type: 'text', placeholder: '130/80' },
    ],
  },

  // ─── CONTRE-INDICATIONS (toujours affiché) ──────────────────────────────

  {
    id: 'contreIndicationsEffort',
    titre: "⚠️ Contre-indications à l'effort",
    questions: [
      {
        id: 'contreIndications',
        label: "Y a-t-il des contre-indications à l'effort physique ?",
        type: 'oui-non',
      },
      {
        id: 'contreIndicationsDetail',
        label: 'Lesquelles ?',
        type: 'textarea',
        conditionnelSi: 'contreIndications_oui',
        placeholder: 'FC max 130 bpm, éviter les impacts, pas de port de charges > 5 kg...',
        aide: 'Ces contre-indications seront affichées en alerte dans la fiche patient et tous les PDFs.',
      },
    ],
  },

  // ─── TOUJOURS AFFICHÉS ───────────────────────────────────────────────────

  {
    id: 'autonomie',
    titre: '🏠 Autonomie & mode de vie',
    questions: [
      {
        id: 'situationVie',
        label: 'Situation de vie',
        type: 'choix-unique',
        options: ['Seul(e)', 'En famille', 'EHPAD / résidence', 'Autre'],
      },
      { id: 'aideADomicile',       label: 'Aide à domicile ?',      type: 'oui-non' },
      { id: 'aideADomicileHeures', label: "Nombre d'heures/semaine", type: 'number', conditionnelSi: 'aideADomicile_oui' },
      {
        id: 'aideMarche',
        label: 'Aide à la marche',
        type: 'choix-unique',
        options: ['Aucune', 'Canne', 'Déambulateur', 'Autre'],
      },
      { id: 'gir', label: 'Évaluation GIR (Grille AGGIR)', type: 'gir' },
    ],
  },

  {
    id: 'habitudesVie',
    titre: '🍽️ Habitudes de vie',
    questions: [
      { id: 'nombreRepas',      label: 'Nombre de repas par jour',         type: 'choix-unique', options: ['1', '2', '3', 'Plus de 3'] },
      { id: 'hydratation',      label: 'Hydratation estimée',              type: 'choix-unique', options: ['< 1L', '1 à 1,5L', '> 1,5L'] },
      { id: 'qualiteSommeil',   label: 'Qualité du sommeil (1-5)',          type: 'echelle-5' },
      { id: 'heuresSommeil',    label: 'Heures de sommeil/nuit',            type: 'number' },
      { id: 'energieMatin',     label: 'Énergie le matin (1-5)',            type: 'echelle-5' },
      { id: 'energieSoir',      label: 'Énergie le soir (1-5)',             type: 'echelle-5' },
      { id: 'niveauAppetit',    label: "Niveau d'appétit (1-5)",            type: 'echelle-5' },
      { id: 'variationPoids',   label: 'Variation de poids involontaire ?', type: 'oui-non' },
      { id: 'variationPoidsKg', label: 'Combien de kg ?',                   type: 'number', conditionnelSi: 'variationPoids_oui' },
      { id: 'tabagisme',        label: 'Tabagisme ?',                       type: 'oui-non', aide: "Aide à comprendre l'essoufflement à l'effort" },
    ],
  },

  {
    id: 'activitePhysique',
    titre: '🏃 Activité physique actuelle',
    questions: [
      {
        id: 'niveauActivite',
        label: "Niveau d'activité actuel",
        type: 'choix-unique',
        options: ['Sédentaire', 'Légèrement actif', 'Modérément actif', 'Actif'],
      },
      { id: 'activitesActuelles',   label: 'Activités pratiquées actuellement', type: 'textarea', placeholder: 'Marche, jardinage, natation...' },
      { id: 'activitesPrecedentes', label: 'Activités pratiquées avant',        type: 'textarea', placeholder: 'Sport pratiqué avant la blessure/maladie...' },
      { id: 'derniereActivite',     label: 'Dernière activité régulière',       type: 'text',     placeholder: 'Il y a 2 ans / Jamais' },
    ],
  },

  {
    id: 'objectifs',
    titre: '🎯 Objectifs & activités souhaitées',
    questions: [
      {
        id: 'objectifsPatient',
        label: 'Objectifs du patient',
        type: 'choix-multiple',
        options: [
          '💪 Renforcement musculaire',
          '⚖️ Améliorer l\'équilibre',
          '🦵 Améliorer la mobilité',
          '🫀 Endurance à l\'effort',
          '🛡️ Prévention des chutes',
          '🏠 Maintien de l\'autonomie',
          '😌 Réduire les douleurs',
          '🎯 Améliorer la coordination',
          '🧘 Travailler la souplesse',
          '🔄 Reprendre une activité physique',
          '💙 Regagner confiance en ses capacités',
        ],
        avecChampLibre: true,
      },
      {
        id: 'activitesSouhaitees',
        label: 'Activités que le patient aimerait pratiquer',
        type: 'choix-multiple',
        options: [
          '🚶 Marche / Randonnée',
          '🚴 Cyclisme (vélo, vélo électrique)',
          '🏊 Natation / Aquagym',
          '🎾 Raquettes (tennis, badminton, ping-pong)',
          '⚽ Jeux de ballon (basket, foot, volley)',
          '🎯 Précision (pétanque, golf, sarbacane, tir à l\'arc, fléchettes)',
          '🤸 Gym douce / Stretching / Yoga',
          '💃 Danse / Activités rythmiques',
          '🏋️ Renforcement musculaire',
          '🧠 Activités cognitives (mémoire, jeux de société)',
        ],
        avecChampLibre: true,
      },
    ],
  },

  {
    id: 'cognition',
    titre: '🧠 Cognition & humeur',
    questions: [
      { id: 'plaintesMemoire', label: 'Plaintes mémoire ?',    type: 'oui-non' },
      { id: 'suiviPsy',        label: 'Suivi psychologique ?', type: 'oui-non' },
      {
        id: 'origineDemarche',
        label: "Pourquoi le patient est-il là aujourd'hui ?",
        type: 'choix-unique',
        options: [
          '💪 De sa propre initiative',
          '👨‍⚕️ Recommandation médicale',
          '👨‍👩‍👦 Poussé par un proche',
          '✏️ Autre',
        ],
        aide: "La motivation intrinsèque influence l'implication dans le suivi",
      },
    ],
  },

  {
    id: 'organisation',
    titre: '📅 Organisation des séances',
    questions: [
      {
        id: 'joursDisponibles',
        label: 'Jour(s) disponible(s)',
        type: 'choix-multiple',
        options: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
      },
      {
        id: 'creneau',
        label: 'Créneau préféré',
        type: 'choix-unique',
        options: ['🌅 Matin (8h-12h)', '☀️ Après-midi (13h30-18h)', '🔄 Flexible'],
      },
      { id: 'heureSouhaitee', label: 'Heure souhaitée',      type: 'time' },
      {
        id: 'dureeSeance',
        label: 'Durée habituelle',
        type: 'choix-unique',
        options: ['30 min', '45 min', '60 min', '90 min'],
      },
      { id: 'contraintes', label: 'Contraintes particulières', type: 'textarea', placeholder: "Jamais avant 9h, accompagné le lundi..." },
    ],
  },
];

// ─── Listes dynamiques ────────────────────────────────────────────────────────

const INPUT_CLS = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary';

function ListeOperations({
  value,
  onChange,
}: {
  value: OperationMedicale[];
  onChange: (v: OperationMedicale[]) => void;
}) {
  const ops = value ?? [];

  const add = () =>
    onChange([...ops, { id: genId(), type: '', date: '', coteOpere: null, complication: false }]);
  const remove = (id: string) => onChange(ops.filter(o => o.id !== id));
  const upd = (id: string, patch: Partial<OperationMedicale>) =>
    onChange(ops.map(o => (o.id === id ? { ...o, ...patch } : o)));

  return (
    <div>
      {ops.map((op, i) => (
        <div key={op.id} className="border border-gray-100 rounded-xl p-4 mb-3 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Opération {i + 1}
            </span>
            <button
              type="button"
              onClick={() => remove(op.id)}
              className="text-xs text-red-400 hover:text-red-600"
            >
              🗑️ Supprimer
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Type d'opération</label>
              <input
                type="text"
                value={op.type}
                onChange={e => upd(op.id, { type: e.target.value })}
                placeholder="PTH droite, Ligaments croisés genou gauche..."
                className={`w-full ${INPUT_CLS}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Date (optionnel)</label>
                <input
                  type="date"
                  value={op.date ?? ''}
                  onChange={e => upd(op.id, { date: e.target.value })}
                  className={`w-full ${INPUT_CLS}`}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Côté opéré</label>
                <div className="flex gap-1.5">
                  {(['droit', 'gauche', 'bilateral'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => upd(op.id, { coteOpere: op.coteOpere === v ? null : v })}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        op.coteOpere === v
                          ? 'bg-primary text-white border-primary'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {v === 'droit' ? 'D' : v === 'gauche' ? 'G' : 'Bil.'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Complication ou anomalie post-op ?
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => upd(op.id, { complication: true })}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid',
                    borderColor: op.complication === true ? '#2BBFBF' : '#D1D5DB',
                    background: op.complication === true ? '#2BBFBF' : '#FFFFFF',
                    color: op.complication === true ? '#FFFFFF' : '#374151',
                    fontWeight: op.complication === true ? '600' : '400',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Oui
                </button>
                <button
                  type="button"
                  onClick={() => upd(op.id, { complication: false, complicationDetail: '' })}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid',
                    borderColor: op.complication === false ? '#2BBFBF' : '#D1D5DB',
                    background: op.complication === false ? '#2BBFBF' : '#FFFFFF',
                    color: op.complication === false ? '#FFFFFF' : '#374151',
                    fontWeight: op.complication === false ? '600' : '400',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Non
                </button>
              </div>
              {op.complication === true && (
                <input
                  type="text"
                  value={op.complicationDetail ?? ''}
                  onChange={e => upd(op.id, { complicationDetail: e.target.value })}
                  placeholder="Précisez..."
                  className={`w-full ${INPUT_CLS}`}
                />
              )}
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="w-full flex items-center justify-center gap-2 text-primary border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
      >
        + Ajouter une opération
      </button>
    </div>
  );
}

// ─── Composants UI de base ────────────────────────────────────────────────────

const SCALE5_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#16A34A'];

function BoutonOuiNon({
  value,
  onChange,
}: {
  value: OuiNon | boolean | null | undefined;
  onChange: (v: OuiNon) => void;
}) {
  // Normalise boolean/string legacy values : true → 'oui', false → 'non'
  const normalized: OuiNon | null =
    value === 'oui' || value === true  ? 'oui' :
    value === 'non' || value === false ? 'non' :
    null;

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {(['oui', 'non'] as OuiNon[]).map(v => {
        const isActive = normalized === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            style={{
              padding: '6px 16px',
              borderRadius: '12px',
              border: '1.5px solid',
              borderColor: isActive ? '#2BBFBF' : '#D1D5DB',
              background: isActive ? '#2BBFBF' : '#FFFFFF',
              color: isActive ? '#FFFFFF' : '#374151',
              fontWeight: isActive ? '600' : '400',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {v === 'oui' ? 'Oui' : 'Non'}
          </button>
        );
      })}
    </div>
  );
}

function ChoixMultiple({
  label,
  options,
  value,
  onChange,
  avecChampLibre,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  avecChampLibre?: boolean;
}) {
  const selected = value ?? [];
  const predefined = selected.filter(s => options.includes(s));
  const customs = selected.filter(s => !options.includes(s));

  const toggle = (opt: string) =>
    onChange(
      predefined.includes(opt)
        ? [...predefined.filter(s => s !== opt), ...customs]
        : [...predefined, opt, ...customs]
    );

  const updateCustom = (idx: number, text: string) => {
    const next = customs.map((c, i) => (i === idx ? text : c));
    onChange([...predefined, ...next]);
  };

  const removeCustom = (idx: number) => {
    onChange([...predefined, ...customs.filter((_, i) => i !== idx)]);
  };

  const addCustom = () => {
    onChange([...predefined, ...customs, '']);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2 mb-3">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              predefined.includes(opt)
                ? 'bg-primary text-white border-primary'
                : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
            }`}
          >
            {opt}
            {predefined.includes(opt) && (
              <span className="text-white/80 text-xs leading-none">✕</span>
            )}
          </button>
        ))}
      </div>

      {avecChampLibre && (
        <div className="mt-1">
          {customs.map((custom, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={custom}
                onChange={e => updateCustom(idx, e.target.value)}
                placeholder="Activité personnalisée..."
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => removeCustom(idx)}
                aria-label="Supprimer"
                className="text-gray-400 hover:text-red-500 p-1 text-base leading-none flex-shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addCustom}
            className="flex items-center gap-1.5 text-primary text-sm font-medium border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl transition-colors"
          >
            + Autre
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Rendu d'une question ─────────────────────────────────────────────────────

function RenduInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: any;
  onChange: (v: any) => void;
}) {
  const fieldCls =
    'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary';

  const lbl = (
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {question.label}
      {question.obligatoire && <span className="text-red-400 ml-1">*</span>}
    </label>
  );

  switch (question.type) {
    case 'text':
    case 'tel':
    case 'email':
      return (
        <div>
          {lbl}
          <input
            type={question.type}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder={question.placeholder}
            className={fieldCls}
          />
        </div>
      );

    case 'date':
    case 'time':
      return (
        <div>
          {lbl}
          <input
            type={question.type}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            className={fieldCls}
          />
        </div>
      );

    case 'number':
      return (
        <div>
          {lbl}
          <input
            type="number"
            value={value ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
            placeholder={question.placeholder ?? '—'}
            className="w-36 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          />
        </div>
      );

    case 'textarea':
      return (
        <div>
          {lbl}
          <textarea
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder={question.placeholder}
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
          />
        </div>
      );

    case 'oui-non':
      return (
        <div>
          {lbl}
          <BoutonOuiNon value={value ?? null} onChange={onChange} />
        </div>
      );

    case 'echelle-5':
      return (
        <div>
          {lbl}
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                style={value === n ? { backgroundColor: SCALE5_COLORS[n - 1], color: 'white' } : undefined}
                className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                  value === n ? 'shadow-md scale-105' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      );

    case 'echelle-10': {
      const v = value ?? null;
      const getColor = (n: number) =>
        n === 0 ? '#3B6D11' : n <= 3 ? '#F59E0B' : n <= 6 ? '#EF8C00' : n <= 8 ? '#EF4444' : '#991B1B';
      const getLibelle = (n: number) =>
        n === 0 ? '😊 Aucune' : n <= 2 ? '🙂 Légère' : n <= 4 ? '😐 Modérée'
        : n <= 6 ? '😟 Importante' : n <= 8 ? '😣 Sévère' : '😭 Insupportable';
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{question.label}</label>
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

    case 'choix-unique':
      return (
        <div>
          {lbl}
          <div className="flex flex-wrap gap-2">
            {(question.options ?? []).map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(value === opt ? null : opt)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                  value === opt
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
                }`}
              >
                {opt}
                {value === opt && (
                  <span className="text-white/80 text-xs leading-none">✕</span>
                )}
              </button>
            ))}
          </div>
        </div>
      );

    case 'choix-multiple':
      return (
        <ChoixMultiple
          label={question.label}
          options={question.options ?? []}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          avecChampLibre={question.avecChampLibre}
        />
      );

    case 'operations-list':
      return (
        <div>
          {lbl}
          <ListeOperations
            value={Array.isArray(value) ? value : []}
            onChange={onChange}
          />
        </div>
      );

    case 'gir':
      return (
        <GIRWidget value={value ?? null} onChange={onChange} />
      );

    default:
      return null;
  }
}

function RenduQuestion({
  question,
  value,
  data,
  onChange,
}: {
  question: Question;
  value: any;
  data: Record<string, any>;
  onChange: (v: any) => void;
}) {
  // Masquer si condition interne non remplie
  if (question.conditionnelSi) {
    const [field, valeur] = question.conditionnelSi.split('_');
    if (data[field] !== valeur) return null;
  }

  const showAlerte =
    !!(question.alerteSi && value && question.alerteSi.includes(value as string));

  return (
    <div>
      <RenduInput question={question} value={value} onChange={onChange} />
      {question.aide && (
        <p className="text-xs text-gray-400 italic mt-1.5">{question.aide}</p>
      )}
      {showAlerte && question.alerteMessage && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 flex gap-2.5 items-start">
          <span className="flex-shrink-0 text-base">⚠️</span>
          <div>
            <div className="text-xs font-bold text-red-700">Chute très récente signalée</div>
            <div className="text-xs text-red-600 mt-0.5">{question.alerteMessage}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function BlocQuestions({
  bloc,
  data,
  onChange,
  gateValue,
  onGateChange,
}: {
  bloc: BlocConditionnel;
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  gateValue?: OuiNon | null;
  onGateChange?: (v: OuiNon) => void;
}) {
  const showContent = !bloc.questionCle || gateValue === 'oui';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-3.5 border-b border-gray-100">
        <h3 className="font-heading font-semibold text-dark text-[15px]">{bloc.titre}</h3>
      </div>
      <div className="p-5 flex flex-col gap-4">
        {bloc.questionCle && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="text-sm text-gray-700 flex-1">{bloc.questionCle.label}</span>
            <div className="flex-shrink-0">
              <BoutonOuiNon value={gateValue ?? null} onChange={onGateChange!} />
            </div>
          </div>
        )}
        {showContent && bloc.questions.map(q => (
          <RenduQuestion
            key={q.id}
            question={q}
            value={data[q.id]}
            data={data}
            onChange={v => onChange(q.id, v)}
          />
        ))}
      </div>
    </div>
  );
}

function IndicateurCompletion({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-400 mb-1.5">
        <span>Complétion du bilan</span>
        <span>
          {pct}% — {filled} / {total} champs remplis
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          style={{
            width: `${pct}%`,
            backgroundColor: pct >= 70 ? 'var(--color-teal)' : '#1A5F9E',
            transition: 'width 0.3s',
          }}
          className="h-full rounded-full"
        />
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        Tous les champs sont facultatifs — remplissez ce qui est pertinent.
      </p>
    </div>
  );
}

// ─── Sédentarité & Fatigue — types & helpers ─────────────────────────────────

type SedentariteReponses = {
  a_sedentarite: number | null;
  b_pratique: 'oui' | 'non' | null;
  b_freq: number | null;
  b_duree: number | null;
  b_effort: number | null;
  c_intensite: number | null;
  c_travaux: number | null;
  c_marche: number | null;
  c_etages: number | null;
};

const EMPTY_SED: SedentariteReponses = {
  a_sedentarite: null, b_pratique: null, b_freq: null, b_duree: null, b_effort: null,
  c_intensite: null, c_travaux: null, c_marche: null, c_etages: null,
};

function computeSedScore(r: SedentariteReponses) {
  const scoreA = r.a_sedentarite ?? 0;
  const scoreB =
    r.b_pratique === 'non' ? 1
    : r.b_pratique === 'oui' ? 5 + (r.b_freq ?? 0) + (r.b_duree ?? 0) + (r.b_effort ?? 0)
    : 0;
  const scoreC = (r.c_intensite ?? 0) + (r.c_travaux ?? 0) + (r.c_marche ?? 0) + (r.c_etages ?? 0);
  const total = scoreA + scoreB + scoreC;
  if (total === 0) return null;
  return { scoreA, scoreB, scoreC, total };
}

export function getSedProfil(score: number) {
  if (score < 18) return {
    profil: 'inactif' as const,
    label: 'Inactif',
    color: '#E24B4A',
    bg: '#FCEBEB',
    description: "Niveau d'activité insuffisant — priorité à la mise en mouvement progressive",
  };
  if (score <= 35) return {
    profil: 'actif' as const,
    label: 'Actif',
    color: '#BA7517',
    bg: '#FAEEDA',
    description: "Niveau d'activité modéré — maintenir et progresser",
  };
  return {
    profil: 'tres_actif' as const,
    label: 'Très actif',
    color: '#0F6E56',
    bg: '#E1F5EE',
    description: "Excellent niveau d'activité — adapter l'intensité au profil pathologique",
  };
}

export function getFSSProfil(score: number) {
  if (score < 36) return {
    profil: 'pas_de_fatigue' as const,
    label: 'Pas de fatigue significative',
    color: '#0F6E56',
    bg: '#E1F5EE',
    description: "Score FSS < 36 — la fatigue n'est probablement pas un facteur limitant majeur",
  };
  return {
    profil: 'fatigue_probable' as const,
    label: 'Fatigue probable',
    color: '#A32D2D',
    bg: '#FCEBEB',
    description: "Score FSS ≥ 36 — adapter l'intensité des séances, surveiller la récupération. Informer le médecin.",
  };
}

// ─── RadioScore ───────────────────────────────────────────────────────────────

function RadioScore({
  label, options, value, onChange,
}: {
  label: string;
  options: { label: string; score: number }[];
  value: number | null;
  onChange: (score: number) => void;
}) {
  return (
    <div>
      <p className="text-sm text-gray-700 mb-2">{label}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(opt => (
          <button
            key={opt.score}
            type="button"
            onClick={() => onChange(opt.score)}
            style={{
              padding: '6px 10px', borderRadius: 10, border: '1.5px solid',
              borderColor: value === opt.score ? '#2BBFBF' : '#D1D5DB',
              background: value === opt.score ? '#2BBFBF' : '#FFFFFF',
              color: value === opt.score ? '#FFFFFF' : '#374151',
              fontWeight: value === opt.score ? 600 : 400,
              fontSize: 12, cursor: 'pointer',
              transition: 'all 0.15s ease', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── ScoreCard ────────────────────────────────────────────────────────────────

function ScoreCard({ score, max, label, color, bg, description }: {
  score: number; max: number; label: string; color: string; bg: string; description: string;
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}40`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ color, fontWeight: 700, fontSize: 16 }}>Score : {score} / {max}</span>
        <span style={{
          marginLeft: 'auto', background: color, color: 'white',
          borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600,
        }}>{label}</span>
      </div>
      <p style={{ color: '#374151', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{description}</p>
    </div>
  );
}

// ─── SectionSedentarite ───────────────────────────────────────────────────────

const SED_ASSIS    = [{ label: '+ de 5h', score: 1 }, { label: '4 à 5h', score: 2 }, { label: '3 à 4h', score: 3 }, { label: '2 à 3h', score: 4 }, { label: 'Moins de 2h', score: 5 }];
const SED_FREQ     = [{ label: '1-2x/mois', score: 1 }, { label: '1x/sem', score: 2 }, { label: '2x/sem', score: 3 }, { label: '3x/sem', score: 4 }, { label: '4x/sem+', score: 5 }];
const SED_DUREE    = [{ label: '< 15 min', score: 1 }, { label: '16-30 min', score: 2 }, { label: '31-45 min', score: 3 }, { label: '46-60 min', score: 4 }, { label: '+ 60 min', score: 5 }];
const SED_EFFORT   = [{ label: 'Très facile', score: 1 }, { label: 'Facile', score: 2 }, { label: 'Modéré', score: 3 }, { label: 'Difficile', score: 4 }, { label: 'Très difficile', score: 5 }];
const SED_INTENSITE = [{ label: 'Légère', score: 1 }, { label: 'Modérée', score: 2 }, { label: 'Moyenne', score: 3 }, { label: 'Intense', score: 4 }, { label: 'Très intense', score: 5 }];
const SED_TRAVAUX  = [{ label: '< 2h', score: 1 }, { label: '3-4h', score: 2 }, { label: '5-6h', score: 3 }, { label: '7-9h', score: 4 }, { label: '10h+', score: 5 }];
const SED_ETAGES   = [{ label: '< 2', score: 1 }, { label: '3-5', score: 2 }, { label: '6-10', score: 3 }, { label: '11-15', score: 4 }, { label: '16+', score: 5 }];

function SectionSedentarite({ value, onChange }: { value: SedentariteReponses; onChange: (v: SedentariteReponses) => void }) {
  const sc = computeSedScore(value);
  const profil = sc ? getSedProfil(sc.total) : null;

  function set(patch: Partial<SedentariteReponses>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-3.5 border-b border-gray-100">
        <h3 className="font-heading font-semibold text-dark text-[15px]">📊 Niveau d'activité physique</h3>
        <p className="text-xs text-gray-400 mt-0.5">Test d'auto-évaluation (d'après Ricci & Gagnon)</p>
      </div>
      <div className="p-5 flex flex-col gap-5">

        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Comportements sédentaires</p>
          <RadioScore label="Combien de temps passez-vous en position assise par jour ?" options={SED_ASSIS} value={value.a_sedentarite} onChange={v => set({ a_sedentarite: v })} />
        </div>

        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Activités physiques de loisir</p>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-gray-700 mb-2">Pratiquez-vous régulièrement une activité physique ?</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['non', 'oui'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set({ b_pratique: v })}
                    style={{
                      padding: '6px 20px', borderRadius: 10, border: '1.5px solid',
                      borderColor: value.b_pratique === v ? '#2BBFBF' : '#D1D5DB',
                      background: value.b_pratique === v ? '#2BBFBF' : '#FFFFFF',
                      color: value.b_pratique === v ? '#FFFFFF' : '#374151',
                      fontWeight: value.b_pratique === v ? 600 : 400,
                      fontSize: 13, cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                  >
                    {v === 'non' ? 'Non · 1' : 'Oui · 5'}
                  </button>
                ))}
              </div>
            </div>
            {value.b_pratique === 'oui' && (
              <>
                <RadioScore label="À quelle fréquence pratiquez-vous ces activités ?" options={SED_FREQ} value={value.b_freq} onChange={v => set({ b_freq: v })} />
                <RadioScore label="Durée moyenne de chaque séance ?" options={SED_DUREE} value={value.b_duree} onChange={v => set({ b_duree: v })} />
                <RadioScore label="Comment percevez-vous votre effort ?" options={SED_EFFORT} value={value.b_effort} onChange={v => set({ b_effort: v })} />
              </>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Activités physiques quotidiennes</p>
          <div className="flex flex-col gap-4">
            <RadioScore label="Intensité physique de votre travail ?" options={SED_INTENSITE} value={value.c_intensite} onChange={v => set({ c_intensite: v })} />
            <RadioScore label="Heures par semaine pour travaux légers (jardinage, ménage...) ?" options={SED_TRAVAUX} value={value.c_travaux} onChange={v => set({ c_travaux: v })} />
            <RadioScore label="Minutes par jour de marche ?" options={SED_DUREE} value={value.c_marche} onChange={v => set({ c_marche: v })} />
            <RadioScore label="Étages montés à pied par jour ?" options={SED_ETAGES} value={value.c_etages} onChange={v => set({ c_etages: v })} />
          </div>
        </div>

        {sc && profil && (
          <ScoreCard score={sc.total} max={55} label={profil.label} color={profil.color} bg={profil.bg} description={profil.description} />
        )}
      </div>
    </div>
  );
}

// ─── SectionFatigue ───────────────────────────────────────────────────────────

const FSS_QUESTIONS = [
  "Je suis moins motivé(e) quand je suis fatigué(e)",
  "L'exercice physique me rend fatigué(e)",
  "Je suis facilement fatigué(e)",
  "La fatigue gêne mon fonctionnement physique",
  "La fatigue me cause fréquemment des problèmes",
  "La fatigue m'empêche d'avoir une activité physique soutenue",
  "La fatigue m'empêche d'accomplir mes responsabilités",
  "La fatigue est parmi mes 3 symptômes les plus invalidants",
  "La fatigue interfère avec ma vie professionnelle/familiale/sociale",
];

function SectionFatigue({ value, onChange }: { value: (number | null)[]; onChange: (v: (number | null)[]) => void }) {
  const reponses: (number | null)[] = value.length === 9 ? value : Array(9).fill(null);

  function setReponse(index: number, val: number) {
    const next = [...reponses];
    next[index] = val;
    onChange(next);
  }

  const answered = reponses.filter(v => v !== null);
  const score = answered.length > 0 ? answered.reduce((sum, v) => sum + (v ?? 0), 0) : null;
  const profil = score !== null ? getFSSProfil(score) : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-3.5 border-b border-gray-100">
        <h3 className="font-heading font-semibold text-dark text-[15px]">😴 Fatigue perçue</h3>
        <p className="text-xs text-gray-400 mt-0.5">Échelle de sévérité de la fatigue (FSS)</p>
      </div>
      <div className="p-5 flex flex-col gap-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          Pour chaque affirmation, indiquez votre accord sur une échelle de 1 (pas du tout d'accord)
          à 7 (tout à fait d'accord) — sur la semaine passée.
        </p>

        {FSS_QUESTIONS.map((question, idx) => {
          const val = reponses[idx];
          return (
            <div key={idx}>
              <p className="text-sm text-gray-700 mb-2">{question}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5, 6, 7].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setReponse(idx, n)}
                    style={{
                      width: 36, height: 36, borderRadius: 8, border: '1.5px solid',
                      borderColor: val === n ? '#2BBFBF' : '#D1D5DB',
                      background: val === n ? '#2BBFBF' : '#FFFFFF',
                      color: val === n ? '#FFFFFF' : '#374151',
                      fontWeight: val === n ? 600 : 400,
                      cursor: 'pointer', fontSize: 14,
                      transition: 'all 0.15s ease', flexShrink: 0,
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {idx === FSS_QUESTIONS.length - 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>Pas du tout d'accord</span>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>Tout à fait d'accord</span>
                </div>
              )}
            </div>
          );
        })}

        {score !== null && profil && (
          <ScoreCard score={score} max={63} label={profil.label} color={profil.color} bg={profil.bg} description={profil.description} />
        )}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface Props {
  participantId: string;
  onFlat: (flat: FormulaireFlat) => void;
  initialFlat?: FormulaireFlat;
}

const CLÉS_INITIALES: Record<string, OuiNon | null> = {
  aChutes:              null,
  aOperationRecente:    null,
  aBlessure:            null,
  aPathologieChronique: null,
};

const TYPES_SIMPLES: QuestionType[] = [
  'text', 'tel', 'email', 'date', 'time', 'number', 'textarea',
  'oui-non', 'echelle-5', 'echelle-10', 'choix-unique', 'choix-multiple',
  // 'gir' exclu du compteur de complétion (objet complexe)
];

export default function FormulaireBilanInitial({ participantId, onFlat, initialFlat }: Props) {
  const [reponsesClés, setReponsesClés] = useState<Record<string, OuiNon | null>>(
    initialFlat?.reponsesClés ?? CLÉS_INITIALES
  );
  const [data, setData] = useState<Record<string, any>>(initialFlat?.data ?? {});
  const [restored, setRestored] = useState(false);

  // Restaurer depuis localStorage (< 24h)
  useEffect(() => {
    if (initialFlat || restored) return;
    try {
      const saved = localStorage.getItem(getBilanEnCoursKey(participantId));
      if (saved) {
        const parsed = JSON.parse(saved) as {
          data: Record<string, any>;
          reponsesClés: Record<string, OuiNon | null>;
          timestamp: number;
        };
        if (Date.now() - parsed.timestamp < 86_400_000) {
          setData(parsed.data);
          setReponsesClés({ ...CLÉS_INITIALES, ...parsed.reponsesClés });
        }
      }
    } catch {
      // ignore
    }
    setRestored(true);
  }, [participantId, initialFlat, restored]);

  const notify = useCallback(
    (d: Record<string, any>, r: Record<string, OuiNon | null>) => {
      try {
        localStorage.setItem(
          getBilanEnCoursKey(participantId),
          JSON.stringify({ data: d, reponsesClés: r, timestamp: Date.now() })
        );
      } catch {
        // quota exceeded
      }
      onFlat({ data: d, reponsesClés: r });
    },
    [participantId, onFlat]
  );

  useEffect(() => {
    notify(data, reponsesClés);
  }, [data, reponsesClés, notify]);

  function setClé(field: string, value: OuiNon) {
    setReponsesClés(prev => ({ ...prev, [field]: prev[field] === value ? null : value }));
  }

  function setField(field: string, value: any) {
    setData(prev => ({ ...prev, [field]: value }));
  }

  function setSedData(reponses: SedentariteReponses) {
    const sc = computeSedScore(reponses);
    setData(prev => ({
      ...prev,
      sedentariteReponses: reponses,
      sedentariteScore: sc?.total ?? null,
      sedentariteProfil: sc ? getSedProfil(sc.total).profil : null,
    }));
  }

  function setFSSData(reponses: (number | null)[]) {
    const answered = reponses.filter(v => v !== null);
    const score = answered.length > 0 ? answered.reduce((sum, v) => sum + (v ?? 0), 0) : null;
    setData(prev => ({
      ...prev,
      fatigueReponses: reponses,
      fatigueScore: score,
      fatigueProfil: score !== null ? getFSSProfil(score).profil : null,
    }));
  }

  // Complétion : inclut les blocs conditionnels dont le gate est "oui"
  const questionsVisibles = BLOCS.flatMap(b => {
    const gateOk = !b.questionCle || reponsesClés[b.questionCle.field] === 'oui';
    if (!gateOk) return [];
    return b.questions.filter(q => {
      if (!TYPES_SIMPLES.includes(q.type)) return false;
      if (!q.conditionnelSi) return true;
      const [field, valeur] = q.conditionnelSi.split('_');
      return data[field] === valeur;
    });
  });
  const filled = questionsVisibles.filter(q => {
    const v = data[q.id];
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;

  return (
    <div className="flex flex-col gap-5">
      <IndicateurCompletion filled={filled} total={questionsVisibles.length} />

      {/* Blocs de questions — les blocs conditionnels affichent leur gate inline */}
      {BLOCS.flatMap(bloc => {
        const el = (
          <BlocQuestions
            key={bloc.id}
            bloc={bloc}
            data={data}
            onChange={setField}
            gateValue={bloc.questionCle ? reponsesClés[bloc.questionCle.field] : undefined}
            onGateChange={bloc.questionCle ? v => setClé(bloc.questionCle!.field, v) : undefined}
          />
        );
        if (bloc.id !== 'autonomie') return [el];
        return [
          el,
          <SectionSedentarite
            key="sed-section"
            value={(data.sedentariteReponses as SedentariteReponses) ?? EMPTY_SED}
            onChange={setSedData}
          />,
          <SectionFatigue
            key="fss-section"
            value={Array.isArray(data.fatigueReponses) ? data.fatigueReponses : []}
            onChange={setFSSData}
          />,
        ];
      })}
    </div>
  );
}
