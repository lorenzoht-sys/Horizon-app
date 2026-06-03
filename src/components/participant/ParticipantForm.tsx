import { useState } from 'react';
import type { Participant, TagPatient, TestKey, RgpdConsent, TraitementPatient, AntecedentMedical } from '../../types';
import { TAG_CONFIG, TAG_ORDER, ALL_TESTS, TEST_LABELS, buildTestsActifs } from '../../data/profiles';
import { Save, X, ChevronDown, ChevronUp } from 'lucide-react';

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
  const items = value ?? [];
  const add = () => onChange([...items, { id: genId(), nom: '' }]);
  const remove = (id: string) => onChange(items.filter(i => i.id !== id));
  const upd = (id: string, patch: Partial<TraitementPatient>) =>
    onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-2">
          <div className="grid grid-cols-3 gap-1.5 mb-1">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Médicament</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Dose</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Effet secondaire notable</span>
          </div>
          {items.map(item => (
            <div key={item.id} className="grid grid-cols-3 gap-1.5 mb-1.5 items-center">
              <input type="text" value={item.nom} onChange={e => upd(item.id, { nom: e.target.value })}
                placeholder="Metformine" className={CLS_CELL} />
              <input type="text" value={item.dose ?? ''} onChange={e => upd(item.id, { dose: e.target.value })}
                placeholder="500mg × 2/j" className={CLS_CELL} />
              <div className="flex gap-1">
                <input type="text" value={item.effetSecondaire ?? ''} onChange={e => upd(item.id, { effetSecondaire: e.target.value })}
                  placeholder="Troubles digestifs" className={`${CLS_CELL} flex-1`} />
                <button type="button" onClick={() => remove(item.id)}
                  className="text-red-400 hover:text-red-600 px-1 flex-shrink-0">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={add}
        className="w-full flex items-center justify-center gap-2 text-primary border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
        + Ajouter un traitement
      </button>
    </div>
  );
}

function ListeAntecedentsForm({
  value,
  onChange,
}: {
  value: AntecedentMedical[];
  onChange: (v: AntecedentMedical[]) => void;
}) {
  const items = value ?? [];
  const add = () => onChange([...items, { id: genId(), type: '' }]);
  const remove = (id: string) => onChange(items.filter(i => i.id !== id));
  const upd = (id: string, patch: Partial<AntecedentMedical>) =>
    onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-2">
          <div className="grid grid-cols-3 gap-1.5 mb-1">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Type d'antécédent</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Date / Année</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Douleur liée</span>
          </div>
          {items.map(item => (
            <div key={item.id} className="grid grid-cols-3 gap-1.5 mb-1.5 items-center">
              <input type="text" value={item.type} onChange={e => upd(item.id, { type: e.target.value })}
                placeholder="Op. jambe droite" className={CLS_CELL} />
              <input type="text" value={item.date ?? ''} onChange={e => upd(item.id, { date: e.target.value })}
                placeholder="2019" className={CLS_CELL} />
              <div className="flex gap-1 items-center">
                {(['oui', 'non'] as const).map(v => (
                  <button key={v} type="button" onClick={() => upd(item.id, { douleur: item.douleur === v ? undefined : v })}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      item.douleur === v
                        ? v === 'oui' ? 'bg-red-400 text-white border-red-400' : 'bg-emerald-500 text-white border-emerald-500'
                        : 'border-gray-200 text-gray-600 bg-white'
                    }`}>
                    {v === 'oui' ? 'Oui' : 'Non'}
                  </button>
                ))}
                <button type="button" onClick={() => remove(item.id)}
                  className="text-red-400 hover:text-red-600 px-1 flex-shrink-0 ml-0.5">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={add}
        className="w-full flex items-center justify-center gap-2 text-primary border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
        + Ajouter un antécédent
      </button>
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
}

const CLS_INPUT = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10';
const CLS_LABEL = 'block text-sm font-medium text-gray-700 mb-1.5';

export default function ParticipantForm({ onSubmit, onCancel, initial }: Props) {
  // ── Traitements & antécédents structurés ───────────────────────
  const [traitements, setTraitements] = useState<TraitementPatient[]>(initial?.traitements ?? []);
  const [antecedents, setAntecedents] = useState<AntecedentMedical[]>(initial?.antecedentsMedicauxStructures ?? []);

  // ── Tags / tests ────────────────────────────────────────────────
  const [tags, setTags] = useState<TagPatient[]>(initial?.tags ?? []);
  const [testsActifs, setTestsActifs] = useState<TestKey[]>(
    initial?.testsActifs ?? (initial?.tags?.length ? buildTestsActifs(initial.tags) : [])
  );
  const [showTestAdjust, setShowTestAdjust] = useState(false);

  // ── RGPD + droit à l'image ──────────────────────────────────────
  const [rgpd, setRgpd] = useState<RgpdConsent>({
    consentementObtenu:  initial?.rgpd?.consentementObtenu  ?? false,
    droitAcces:          initial?.rgpd?.droitAcces          ?? false,
    droitRectification:  initial?.rgpd?.droitRectification  ?? false,
    droitEffacement:     initial?.rgpd?.droitEffacement     ?? false,
    methodeConsentement: initial?.rgpd?.methodeConsentement ?? 'oral_note',
    consentementDate:    initial?.rgpd?.consentementDate    ?? new Date().toISOString().slice(0, 10),
  });
  const [droitImage, setDroitImage] = useState<boolean>(initial?.droitImage ?? false);

  // ── Champs texte ────────────────────────────────────────────────
  const [form, setForm] = useState({
    nom:               initial?.nom               ?? '',
    prenom:            initial?.prenom            ?? '',
    dateNaissance:     initial?.dateNaissance     ?? '',
    dateCreation:      initial?.dateCreation      ?? new Date().toISOString().slice(0, 10),
    email:             initial?.email             ?? '',
    telephone:         initial?.telephone         ?? '',
    contexteClinic:    initial?.contexteClinic    ?? '',
    adresseRue:        initial?.adresseRue        ?? '',
    adresseCodePostal: initial?.adresseCodePostal ?? '',
    adresseVille:      initial?.adresseVille      ?? '',
    taille:               initial?.taille?.toString() ?? '',
    poids:                initial?.poids?.toString()  ?? '',
    villeNaissance:       initial?.villeNaissance       ?? '',
    codePostalNaissance:  initial?.codePostalNaissance  ?? '',
    iban:                 initial?.iban              ?? '',
    bic:                  initial?.bic               ?? '',
  });

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      ...form,
      taille: form.taille ? Number(form.taille) : undefined,
      poids:  form.poids  ? Number(form.poids)  : undefined,
      // Préserver les données cliniques existantes (issues du bilan initial)
      pathologie:              initial?.pathologie,
      antecedentsMedicaux:     initial?.antecedentsMedicaux,
      antecedentsChirurgicaux: initial?.antecedentsChirurgicaux,
      allergies:               initial?.allergies,
      modeDeplacementHabituel: initial?.modeDeplacementHabituel,
      modeDeplacementDetail:   initial?.modeDeplacementDetail,
      activitesSouhaitees:     initial?.activitesSouhaitees,
      objectifsPatient:        initial?.objectifsPatient,
      disponibilites:          initial?.disponibilites,
      droitImage,
      tags, testsActifs, rgpd,
      traitements: traitements.length > 0 ? traitements : undefined,
      antecedentsMedicauxStructures: antecedents.length > 0 ? antecedents : undefined,
      profil:         initial?.profil,
      coordonnees:    initial?.coordonnees,
      geocodeFailed:  initial?.geocodeFailed,
      programmes:     initial?.programmes,
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
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-[11px] font-bold"
                      style={{ backgroundColor: cfg.color }}>
                      ✕
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
        <label className={CLS_LABEL}>Contexte clinique <span className="text-gray-400 font-normal">(optionnel — 1 ligne)</span></label>
        <input name="contexteClinic" value={form.contexteClinic} onChange={handleChange}
          placeholder="ex: PTH droite + diabète type 2 — opéré le 15/01/2025"
          className={CLS_INPUT} />
        <p className="text-xs text-gray-400 mt-1">Résumé rapide. Les détails cliniques sont saisis dans le bilan initial.</p>
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
            <div className="text-xs text-gray-500">Type · Date / Année · Douleur liée</div>
          </div>
        </div>
        <div className="p-4">
          <ListeAntecedentsForm value={antecedents} onChange={setAntecedents} />
        </div>
      </div>

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
