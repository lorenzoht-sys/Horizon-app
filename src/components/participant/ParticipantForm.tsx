import { useState } from 'react';
import type { Participant, TagPatient, TestKey, RgpdConsent, DisponibilitesPatient, JourSemaine, CreneauPreference } from '../../types';
import { TAG_CONFIG, TAG_ORDER, ALL_TESTS, TEST_LABELS, buildTestsActifs } from '../../data/profiles';
import { Save, X, ChevronDown, ChevronUp } from 'lucide-react';

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

// ─── Constantes ───────────────────────────────────────────────────────────────

const JOURS: { val: JourSemaine; label: string }[] = [
  { val: 'lun', label: 'Lun' }, { val: 'mar', label: 'Mar' },
  { val: 'mer', label: 'Mer' }, { val: 'jeu', label: 'Jeu' },
  { val: 'ven', label: 'Ven' }, { val: 'sam', label: 'Sam' },
];

const CRENEAUX: { val: CreneauPreference; label: string; desc: string }[] = [
  { val: 'matin',     label: 'Matin',      desc: '8h-12h' },
  { val: 'apres-midi', label: 'Après-midi', desc: '14h-18h' },
  { val: 'soiree',    label: 'Soirée',     desc: '18h-20h' },
];

const MODES_DEPLACEMENT = [
  { id: 'voiture',    label: '🚗 Voiture' },
  { id: 'velo',       label: '🚲 Vélo' },
  { id: 'transports', label: '🚌 Transports' },
  { id: 'marche',     label: '🚶 Marche' },
  { id: 'fauteuil',   label: '♿ Fauteuil' },
  { id: 'autre',      label: '✏️ Autre' },
] as const;

const ACTIVITES_PREDEFINIES = [
  '🚶 Marche / Randonnée',
  '🚴 Cyclisme (vélo, vélo électrique)',
  '🏊 Natation / Aquagym',
  '🎾 Raquettes (tennis, badminton, ping-pong)',
  '⚽ Jeux de ballon (basket, foot, volley)',
  '🎯 Précision (pétanque, golf, sarbacane, tir à l\'arc, fléchettes)',
  '🤸 Gym douce / Stretching / Yoga',
  '💃 Danse / Activités rythmiques',
  '🏋️ Renforcement musculaire',
  '🧠 Activités cognitives',
];

const OBJECTIFS_PREDEFINIS = [
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
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onSubmit: (data: Omit<Participant, 'id' | 'token' | 'bilans'>) => void;
  onCancel: () => void;
  initial?: Partial<Participant>;
}

const CLS_INPUT = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10';
const CLS_LABEL = 'block text-sm font-medium text-gray-700 mb-1.5';

export default function ParticipantForm({ onSubmit, onCancel, initial }: Props) {
  // ── Tags / tests ────────────────────────────────────────────────
  const [tags, setTags] = useState<TagPatient[]>(initial?.tags ?? []);
  const [testsActifs, setTestsActifs] = useState<TestKey[]>(
    initial?.testsActifs ?? (initial?.tags?.length ? buildTestsActifs(initial.tags) : [])
  );
  const [showTestAdjust, setShowTestAdjust] = useState(false);

  // ── Disponibilités ──────────────────────────────────────────────
  const [disponibilites, setDisponibilites] = useState<DisponibilitesPatient>(
    initial?.disponibilites ?? { joursDisponibles: [], creneauxPreference: [], contraintes: '', dureeSeanceMinutes: 45 }
  );

  // ── RGPD ────────────────────────────────────────────────────────
  const [rgpd, setRgpd] = useState<RgpdConsent>({
    consentementObtenu:  initial?.rgpd?.consentementObtenu  ?? false,
    droitAcces:          initial?.rgpd?.droitAcces          ?? false,
    droitRectification:  initial?.rgpd?.droitRectification  ?? false,
    droitEffacement:     initial?.rgpd?.droitEffacement     ?? false,
    methodeConsentement: initial?.rgpd?.methodeConsentement ?? 'oral_note',
    consentementDate:    initial?.rgpd?.consentementDate    ?? new Date().toISOString().slice(0, 10),
  });

  // ── Champs texte (handleChange générique) ───────────────────────
  const [form, setForm] = useState({
    nom:               initial?.nom               ?? '',
    prenom:            initial?.prenom            ?? '',
    dateNaissance:     initial?.dateNaissance     ?? '',
    dateCreation:      initial?.dateCreation      ?? new Date().toISOString().slice(0, 10),
    email:             initial?.email             ?? '',
    telephone:         initial?.telephone         ?? '',
    pathologie:        initial?.pathologie        ?? '',
    contexteClinic:    initial?.contexteClinic    ?? '',
    adresseRue:        initial?.adresseRue        ?? '',
    adresseCodePostal: initial?.adresseCodePostal ?? '',
    adresseVille:      initial?.adresseVille      ?? '',
    taille:            initial?.taille?.toString() ?? '',
    poids:             initial?.poids?.toString()  ?? '',
    iban:              initial?.iban              ?? '',
    bic:               initial?.bic               ?? '',
    modeDeplacementDetail: initial?.modeDeplacementDetail ?? '',
    antecedentsMedicaux:   initial?.antecedentsMedicaux   ?? '',
    antecedentsChirurgicaux: initial?.antecedentsChirurgicaux ?? '',
    allergies:         initial?.allergies         ?? '',
    objectifsPatient:  '',  // champ retiré du form — géré via objectifsSelectionnes
  });

  // ── États spéciaux ──────────────────────────────────────────────
  const [modeDeplacement, setModeDeplacement] = useState<string>(initial?.modeDeplacementHabituel ?? '');
  const [activitesSouhaitees, setActivitesSouhaitees] = useState<string[]>(initial?.activitesSouhaitees ?? []);
  const [nouvelleActivite, setNouvelleActivite] = useState('');
  const [objectifsSelectionnes, setObjectifsSelectionnes] = useState<string[]>(
    Array.isArray(initial?.objectifsPatient) ? initial.objectifsPatient : []
  );
  const [nouvelObjectif, setNouvelObjectif] = useState('');

  // ── Handlers ────────────────────────────────────────────────────

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function toggleTag(tag: TagPatient) {
    const next = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag];
    setTags(next);
    setTestsActifs(next.length > 0 ? buildTestsActifs(next) : []);
    setShowTestAdjust(false);
  }

  function toggleTest(key: TestKey) {
    setTestsActifs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function toggleActivite(a: string) {
    setActivitesSouhaitees(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  }

  function ajouterActiviteLibre() {
    const v = nouvelleActivite.trim();
    if (v && !activitesSouhaitees.includes(v)) {
      setActivitesSouhaitees(prev => [...prev, v]);
    }
    setNouvelleActivite('');
  }

  function toggleObjectif(o: string) {
    setObjectifsSelectionnes(prev => prev.includes(o) ? prev.filter(x => x !== o) : [...prev, o]);
  }

  function ajouterObjectifLibre() {
    const v = nouvelObjectif.trim();
    if (v && !objectifsSelectionnes.includes(v)) {
      setObjectifsSelectionnes(prev => [...prev, v]);
    }
    setNouvelObjectif('');
  }

  function toggleJour(jour: JourSemaine) {
    setDisponibilites(d => ({
      ...d,
      joursDisponibles: d.joursDisponibles.includes(jour)
        ? d.joursDisponibles.filter(j => j !== jour)
        : [...d.joursDisponibles, jour],
    }));
  }

  function toggleCreneau(c: CreneauPreference) {
    setDisponibilites(d => ({
      ...d,
      creneauxPreference: d.creneauxPreference.includes(c)
        ? d.creneauxPreference.filter(x => x !== c)
        : [...d.creneauxPreference, c],
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { objectifsPatient: _ignored, ...formRest } = form;
    onSubmit({
      ...formRest,
      taille: form.taille ? Number(form.taille) : undefined,
      poids:  form.poids  ? Number(form.poids)  : undefined,
      modeDeplacementHabituel: modeDeplacement as Participant['modeDeplacementHabituel'] || undefined,
      activitesSouhaitees,
      objectifsPatient: objectifsSelectionnes.length > 0 ? objectifsSelectionnes : undefined,
      tags, testsActifs, rgpd, disponibilites,
      profil: initial?.profil,
      coordonnees: initial?.coordonnees,
      geocodeFailed: initial?.geocodeFailed,
      programmes: initial?.programmes,
    });
  }

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

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── TAGS ── */}
      <div>
        <p className="text-sm font-semibold text-dark mb-1">Profil(s) du patient</p>
        <p className="text-xs text-gray-400 mb-3">Plusieurs choix possibles</p>
        <div className="grid grid-cols-2 gap-2">
          {TAG_ORDER.map(tag => {
            const cfg = TAG_CONFIG[tag];
            const selected = tags.includes(tag);
            return (
              <button key={tag} type="button" onClick={() => toggleTag(tag)}
                style={selected ? { borderColor: cfg.color, backgroundColor: `${cfg.color}10` } : undefined}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  selected ? 'shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}>
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-base">{cfg.emoji}</span>
                      <span className="text-sm font-semibold text-dark" style={selected ? { color: cfg.color } : undefined}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 pl-6">{cfg.description}</p>
                  </div>
                  {selected && (
                    <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: cfg.color }}>
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 bg-gray-50 rounded-xl p-3">
          <button type="button" onClick={() => setShowTestAdjust(!showTestAdjust)}
            className="w-full flex items-center justify-between text-xs text-gray-600 hover:text-dark transition-colors">
            <span>
              <span className="font-semibold">Tests activés :</span>{' '}
              {testsActifs.length > 0 ? testsActifs.map(k => TEST_LABELS[k]).join(' · ') : 'aucun'}
            </span>
            {showTestAdjust ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showTestAdjust && (
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {ALL_TESTS.map(key => (
                <label key={key} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
                  <input type="checkbox" checked={testsActifs.includes(key)} onChange={() => toggleTest(key)} className="accent-primary rounded" />
                  {TEST_LABELS[key]}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CONTEXTE CLINIQUE ── */}
      <div>
        <label className={CLS_LABEL}>Contexte clinique <span className="text-gray-400 font-normal">(optionnel)</span></label>
        <input name="contexteClinic" value={form.contexteClinic} onChange={handleChange}
          placeholder="ex: PTH droite + diabète type 2 — opéré le 15/01/2025"
          className={CLS_INPUT} />
      </div>

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

      {/* ── PATHOLOGIE ── */}
      <div>
        <label className={CLS_LABEL}>Pathologie / contexte rapide</label>
        <textarea name="pathologie" value={form.pathologie} onChange={handleChange} rows={2}
          placeholder="Ex : Arthrose genou droit, HTA contrôlée..."
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 resize-none" />
      </div>

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

      {/* ── PROFIL DE VIE ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 flex items-center gap-2.5">
          <span className="text-lg">🚶</span>
          <div>
            <div className="font-semibold text-dark text-sm">Profil de vie</div>
            <div className="text-xs text-gray-500">Déplacement · Santé · Antécédents</div>
          </div>
        </div>
        <div className="p-4 space-y-4">

          {/* Mode de déplacement */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Mode de déplacement habituel</label>
            <div className="flex flex-wrap gap-2">
              {MODES_DEPLACEMENT.map(m => (
                <button key={m.id} type="button"
                  onClick={() => setModeDeplacement(d => d === m.id ? '' : m.id)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                    modeDeplacement === m.id
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-primary/50'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
            {modeDeplacement === 'autre' && (
              <input
                name="modeDeplacementDetail"
                value={form.modeDeplacementDetail}
                onChange={handleChange}
                placeholder="Précisez..."
                className={`${CLS_INPUT} mt-2`}
              />
            )}
          </div>

          {/* Antécédents médicaux */}
          <div>
            <label className={CLS_LABEL}>Antécédents médicaux</label>
            <textarea name="antecedentsMedicaux" value={form.antecedentsMedicaux} onChange={handleChange}
              placeholder="AVC 2018, diabète type 2, hypertension..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>

          {/* Antécédents chirurgicaux */}
          <div>
            <label className={CLS_LABEL}>Antécédents chirurgicaux</label>
            <textarea name="antecedentsChirurgicaux" value={form.antecedentsChirurgicaux} onChange={handleChange}
              placeholder="PTH droite 2022, opération genou 2020..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>

          {/* Allergies */}
          <div>
            <label className={CLS_LABEL}>Allergies connues <span className="text-gray-400 font-normal">(optionnel)</span></label>
            <input name="allergies" value={form.allergies} onChange={handleChange}
              placeholder="Aspirine, latex..." className={CLS_INPUT} />
          </div>
        </div>
      </div>

      {/* ── ACTIVITÉS SOUHAITÉES ── */}
      <div className="border border-teal-100 rounded-2xl overflow-hidden">
        <div className="bg-teal-50 px-4 py-3 flex items-center gap-2.5">
          <span className="text-lg">🎯</span>
          <div>
            <div className="font-semibold text-dark text-sm">Activités souhaitées</div>
            <div className="text-xs text-gray-500">Ce que le patient aimerait pratiquer</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {ACTIVITES_PREDEFINIES.map(a => (
              <button key={a} type="button" onClick={() => toggleActivite(a)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  activitesSouhaitees.includes(a)
                    ? 'bg-teal-100 text-teal-800 border-teal-300'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-teal-300'
                }`}>
                {a}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={nouvelleActivite}
              onChange={e => setNouvelleActivite(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterActiviteLibre(); } }}
              placeholder="Autre activité souhaitée..."
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary"
            />
            <button type="button" onClick={ajouterActiviteLibre}
              className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors">
              + Ajouter
            </button>
          </div>

          <div>
            <label className={CLS_LABEL}>Objectifs du patient</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {OBJECTIFS_PREDEFINIS.map(o => (
                <button key={o} type="button" onClick={() => toggleObjectif(o)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    objectifsSelectionnes.includes(o)
                      ? 'bg-teal-100 text-teal-800 border-teal-300'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-teal-300'
                  }`}>
                  {o}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={nouvelObjectif}
                onChange={e => setNouvelObjectif(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterObjectifLibre(); } }}
                placeholder="✏️ Autre objectif..."
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary"
              />
              <button type="button" onClick={ajouterObjectifLibre}
                className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors">
                + Ajouter
              </button>
            </div>
            {objectifsSelectionnes.filter(o => !OBJECTIFS_PREDEFINIS.includes(o)).map((o, i) => (
              <div key={i} className="flex items-center gap-2 mt-2">
                <span className="flex-1 text-sm text-gray-700 bg-teal-50 border border-teal-200 rounded-xl px-3 py-1.5">{o}</span>
                <button type="button" onClick={() => toggleObjectif(o)}
                  className="text-gray-400 hover:text-red-500 text-sm">✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── DISPONIBILITÉS ── */}
      <div className="border border-green-100 rounded-2xl overflow-hidden">
        <div className="bg-green-50 px-4 py-3 flex items-center gap-2.5">
          <span className="text-lg">📅</span>
          <div>
            <div className="font-semibold text-dark text-sm">Disponibilités</div>
            <div className="text-xs text-gray-500">Pour l'optimisation de tournée</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">Jours disponibles</div>
            <div className="flex gap-2 flex-wrap">
              {JOURS.map(({ val, label }) => {
                const sel = disponibilites.joursDisponibles.includes(val);
                return (
                  <button key={val} type="button" onClick={() => toggleJour(val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      sel ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/50'
                    }`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">Préférence horaire</div>
            <div className="space-y-2">
              {CRENEAUX.map(({ val, label, desc }) => {
                const sel = disponibilites.creneauxPreference.includes(val);
                return (
                  <label key={val} className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox" checked={sel} onChange={() => toggleCreneau(val)} className="w-4 h-4 accent-primary" />
                    <span className="text-sm text-gray-700">{label} <span className="text-xs text-gray-400">{desc}</span></span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Durée de séance (minutes)</label>
            <input type="number" min={15} max={120} step={5}
              value={disponibilites.dureeSeanceMinutes}
              onChange={e => setDisponibilites(d => ({ ...d, dureeSeanceMinutes: Number(e.target.value) }))}
              className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Contraintes particulières</label>
            <input value={disponibilites.contraintes ?? ''} onChange={e => setDisponibilites(d => ({ ...d, contraintes: e.target.value }))}
              placeholder="Ex: Jamais avant 9h, préfère les matins..." className={CLS_INPUT} />
          </div>
        </div>
      </div>

      {/* ── RGPD ── */}
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
    </form>
  );
}
