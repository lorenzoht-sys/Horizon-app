import { useState, useRef } from 'react';
import { Save, Upload, Plus, Trash2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import PageWrapper from '../components/layout/PageWrapper';
import type { IndisponibilitePierre, JourSemaine } from '../types';
import { SectionApplication } from '../components/pwa/PWAComponents';

const JOURS_LABELS: Record<JourSemaine | 'dim', string> = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi',
  ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche',
};

function loadIndispos(): IndisponibilitePierre[] {
  try {
    const raw = localStorage.getItem('mouvtrack_indispos_pierre');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveIndispos(indispos: IndisponibilitePierre[]) {
  localStorage.setItem('mouvtrack_indispos_pierre', JSON.stringify(indispos));
}

// ── Section indisponibilités ────────────────────────────────────────────────────

interface ModalIndispoProps {
  onSave: (item: IndisponibilitePierre) => void;
  onClose: () => void;
}

function ModalAjoutIndispo({ onSave, onClose }: ModalIndispoProps) {
  const [form, setForm] = useState<Omit<IndisponibilitePierre, 'id'>>({
    jour: 'lun', heureDebut: '12:00', heureFin: '14:00',
    recurrente: true, label: '',
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-heading font-bold text-dark text-lg">Ajouter une indisponibilité</h3>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Jour</label>
          <select
            value={form.jour}
            onChange={e => setForm(f => ({ ...f, jour: e.target.value as JourSemaine | 'dim' }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          >
            {(Object.entries(JOURS_LABELS) as [JourSemaine | 'dim', string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">De</label>
            <input type="time" value={form.heureDebut}
              onChange={e => setForm(f => ({ ...f, heureDebut: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">À</label>
            <input type="time" value={form.heureFin}
              onChange={e => setForm(f => ({ ...f, heureFin: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={form.recurrente}
            onChange={e => setForm(f => ({ ...f, recurrente: e.target.checked }))}
            className="w-4 h-4 accent-primary" />
          <span className="text-sm text-gray-700">Récurrent chaque semaine</span>
        </label>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Libellé (optionnel)</label>
          <input value={form.label ?? ''}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="Ex: Déjeuner, Formation..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onSave({ ...form, id: uuidv4() })}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-dark transition-colors"
          >
            Enregistrer
          </button>
          <button onClick={onClose}
            className="px-5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-sm">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionIndisponibilites() {
  const [indispos, setIndispos] = useState<IndisponibilitePierre[]>(loadIndispos);
  const [showModal, setShowModal] = useState(false);

  function handleSave(item: IndisponibilitePierre) {
    const next = [...indispos, item];
    setIndispos(next);
    saveIndispos(next);
    setShowModal(false);
    toast.success('Indisponibilité ajoutée');
  }

  function handleDelete(id: string) {
    const next = indispos.filter(i => i.id !== id);
    setIndispos(next);
    saveIndispos(next);
  }

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Mes indisponibilités</h2>
        <div className="h-px bg-gray-100" />
      </div>

      <div className="space-y-2 mb-4">
        {indispos.length === 0 && (
          <p className="text-sm text-gray-400">Aucune indisponibilité enregistrée.</p>
        )}
        {indispos.map(item => (
          <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <div>
              <span className="text-sm font-semibold text-dark">{JOURS_LABELS[item.jour]}</span>
              <span className="text-sm text-gray-500 ml-2">{item.heureDebut} → {item.heureFin}</span>
              {item.recurrente && <span className="ml-2 text-xs text-primary">🔄 hebdo</span>}
              {item.label && <span className="ml-2 text-xs text-gray-400">· {item.label}</span>}
            </div>
            <button
              onClick={() => handleDelete(item.id)}
              className="text-gray-400 hover:text-red-500 transition-colors p-1"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
      >
        <Plus size={16} />
        Ajouter une indisponibilité
      </button>

      {showModal && <ModalAjoutIndispo onSave={handleSave} onClose={() => setShowModal(false)} />}
    </section>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SettingsPraticien {
  prenom: string;
  nom: string;
  titre: string;
  email: string;
  telephone: string;
  adresseRue: string;
  adresseCodePostal: string;
  adresseVille: string;
  siret: string;
  numeroSAP: string;
  numeroTVA: string;
  villeSignature: string;
  logoUrl: string;
  tarifHoraire: string;
  fraisKmDefaut: string;
}

const DEFAULTS: SettingsPraticien = {
  prenom: '', nom: '', titre: 'Enseignant en Activité Physique Adaptée',
  email: '', telephone: '', adresseRue: '', adresseCodePostal: '',
  adresseVille: '', siret: '', numeroSAP: '', numeroTVA: '',
  villeSignature: '', logoUrl: '', tarifHoraire: '45', fraisKmDefaut: '0.50',
};

function loadSettings(): SettingsPraticien {
  try {
    const raw = localStorage.getItem('settings_praticien');
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

// ── Composants UI ──────────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{title}</h2>
      <div className="h-px bg-gray-100" />
    </div>
  );
}

function Field({
  label, required, error, children,
}: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

function inputClass(error?: string) {
  return `w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors font-sans ${
    error
      ? 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-100'
      : 'border-gray-200 bg-white focus:border-primary focus:ring-primary/10'
  }`;
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsPraticien>(loadSettings);
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsPraticien, string>>>({});
  const logoInputRef = useRef<HTMLInputElement>(null);

  function set(field: keyof SettingsPraticien, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: undefined }));
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 600_000) { toast.error('Image trop lourde (max 600 Ko)'); return; }
    const reader = new FileReader();
    reader.onload = ev => set('logoUrl', ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function validate(): boolean {
    const required: (keyof SettingsPraticien)[] = [
      'prenom', 'nom', 'titre', 'email',
      'adresseRue', 'adresseCodePostal', 'adresseVille',
      'siret', 'numeroSAP', 'villeSignature',
    ];
    const next: Partial<Record<keyof SettingsPraticien, string>> = {};

    for (const f of required) {
      if (!form[f].trim()) next[f] = 'Champ obligatoire';
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = 'Email invalide';
    }
    const siretDigits = form.siret.replace(/\s/g, '');
    if (form.siret && !/^\d{14}$/.test(siretDigits)) {
      next.siret = 'Le SIRET doit contenir exactement 14 chiffres';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSave() {
    if (!validate()) { toast.error('Veuillez corriger les erreurs'); return; }
    const toSave = { ...form, siret: form.siret.replace(/\s/g, '') };
    localStorage.setItem('settings_praticien', JSON.stringify(toSave));
    toast.success('Paramètres enregistrés');
  }

  return (
    <PageWrapper>
      <div className="max-w-2xl">

        {/* En-tête */}
        <div className="mb-8">
          <h1 className="font-heading font-bold text-2xl text-dark">Paramètres</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ces informations apparaissent sur tous vos documents générés (PDFs, attestations, comptes-rendus).
          </p>
        </div>

        <div className="space-y-10">

          {/* ── Profil professionnel ── */}
          <section>
            <SectionTitle title="Mon profil professionnel" />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Prénom" required error={errors.prenom}>
                  <input value={form.prenom} onChange={e => set('prenom', e.target.value)}
                    placeholder="Pierre" className={inputClass(errors.prenom)} />
                </Field>
                <Field label="Nom" required error={errors.nom}>
                  <input value={form.nom} onChange={e => set('nom', e.target.value)}
                    placeholder="Clavier" className={inputClass(errors.nom)} />
                </Field>
              </div>
              <Field label="Titre professionnel" required error={errors.titre}>
                <input value={form.titre} onChange={e => set('titre', e.target.value)}
                  placeholder="Enseignant en Activité Physique Adaptée" className={inputClass(errors.titre)} />
              </Field>
              <Field label="Email professionnel" required error={errors.email}>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="pierre@mouvapa.com" className={inputClass(errors.email)} />
              </Field>
              <Field label="Téléphone" error={errors.telephone}>
                <input value={form.telephone} onChange={e => set('telephone', e.target.value)}
                  placeholder="06 12 34 56 78" className={inputClass(errors.telephone)} />
              </Field>
            </div>
          </section>

          {/* ── Adresse professionnelle ── */}
          <section>
            <SectionTitle title="Mon adresse professionnelle" />
            <div className="space-y-4">
              <Field label="Adresse (rue)" required error={errors.adresseRue}>
                <input value={form.adresseRue} onChange={e => set('adresseRue', e.target.value)}
                  placeholder="12 rue des Lilas" className={inputClass(errors.adresseRue)} />
              </Field>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Code postal" required error={errors.adresseCodePostal}>
                  <input value={form.adresseCodePostal} onChange={e => set('adresseCodePostal', e.target.value)}
                    placeholder="75013" className={inputClass(errors.adresseCodePostal)} />
                </Field>
                <div className="col-span-2">
                  <Field label="Ville" required error={errors.adresseVille}>
                    <input value={form.adresseVille} onChange={e => set('adresseVille', e.target.value)}
                      placeholder="Paris" className={inputClass(errors.adresseVille)} />
                  </Field>
                </div>
              </div>
            </div>
          </section>

          {/* ── Informations légales ── */}
          <section>
            <SectionTitle title="Mes informations légales" />
            <div className="space-y-4">
              <Field label="Numéro SIRET" required error={errors.siret}>
                <input value={form.siret} onChange={e => set('siret', e.target.value)}
                  placeholder="XXX XXX XXX XXXXX" className={inputClass(errors.siret)} />
                <p className="text-xs text-gray-400 mt-1">14 chiffres (espaces autorisés)</p>
              </Field>
              <Field label="Numéro de déclaration SAP" required error={errors.numeroSAP}>
                <input value={form.numeroSAP} onChange={e => set('numeroSAP', e.target.value)}
                  placeholder="SAP XXXXXXXXX" className={inputClass(errors.numeroSAP)} />
              </Field>
              <Field label="Numéro TVA intracommunautaire" error={errors.numeroTVA}>
                <input value={form.numeroTVA} onChange={e => set('numeroTVA', e.target.value)}
                  placeholder="FR XX XXXXXXXXX" className={inputClass(errors.numeroTVA)} />
                <p className="text-xs text-gray-400 mt-1">Optionnel — uniquement si assujetti à la TVA</p>
              </Field>
            </div>
          </section>

          {/* ── Logo ── */}
          <section>
            <SectionTitle title="Mon logo" />
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                <img
                  src={form.logoUrl || '/logo.png'}
                  alt="Logo"
                  className="w-full h-full object-contain p-1"
                  onError={e => { (e.target as HTMLImageElement).src = '/logo.png'; }}
                />
              </div>
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                >
                  <Upload size={15} />
                  Changer le logo
                </button>
                <p className="text-xs text-gray-400 mt-1.5">PNG ou JPG, max 600 Ko</p>
              </div>
            </div>
          </section>

          {/* ── Ville de signature ── */}
          <section>
            <SectionTitle title="Ville de signature des documents" />
            <Field label="Ville" required error={errors.villeSignature}>
              <input value={form.villeSignature} onChange={e => set('villeSignature', e.target.value)}
                placeholder="Paris" className={`${inputClass(errors.villeSignature)} max-w-xs`} />
            </Field>
            <p className="text-xs text-gray-400 mt-2">
              Utilisée dans : <span className="italic">«&nbsp;Fait à {form.villeSignature || 'Paris'}, le JJ/MM/AAAA&nbsp;»</span>
            </p>
          </section>

          {/* ── Tarification ── */}
          <section>
            <SectionTitle title="Tarification" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tarif horaire (€)" error={errors.tarifHoraire}>
                <input type="number" min={0} step={0.5} value={form.tarifHoraire}
                  onChange={e => set('tarifHoraire', e.target.value)}
                  placeholder="45" className={inputClass(errors.tarifHoraire)} />
                <p className="text-xs text-gray-400 mt-1">Pré-rempli dans les contrats PDF</p>
              </Field>
              <Field label="Frais km par défaut (€/km)" error={errors.fraisKmDefaut}>
                <input type="number" min={0} step={0.01} value={form.fraisKmDefaut}
                  onChange={e => set('fraisKmDefaut', e.target.value)}
                  placeholder="0.50" className={inputClass(errors.fraisKmDefaut)} />
              </Field>
            </div>
          </section>

          {/* ── Application (PWA) ── */}
          <section>
            <SectionTitle title="📱 Application" />
            <SectionApplication />
          </section>

          {/* ── Indisponibilités ── */}
          <SectionIndisponibilites />

          {/* ── Données demo ── */}
          <section>
            <SectionTitle title="Données de démonstration" />
            <p className="text-sm text-gray-500 mb-4">
              Réinitialise les patients, séances et contrats avec les données de démonstration.
              Utile pour recommencer une démo propre.
            </p>
            <button
              onClick={() => {
                if (!confirm('Réinitialiser toutes les données de démonstration ? Vos modifications seront perdues.')) return;
                localStorage.removeItem('mouvtrack_participants');
                localStorage.removeItem('mouvtrack_seances');
                localStorage.removeItem('mouvtrack_contrats');
                localStorage.removeItem('mouvtrack_indispos_pierre');
                toast.success('Données réinitialisées — rechargement en cours…');
                setTimeout(() => window.location.reload(), 800);
              }}
              className="flex items-center gap-2 border border-orange-200 text-orange-600 hover:bg-orange-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              <RotateCcw size={15} />
              Réinitialiser les données demo
            </button>
          </section>

        </div>

        {/* ── Clé API Claude ── */}
        <div className="mt-8 border border-indigo-100 rounded-2xl overflow-hidden">
          <div className="bg-indigo-50 px-5 py-4">
            <div className="font-semibold text-dark text-sm flex items-center gap-2">
              🧠 Interprétation IA — Clé API Claude
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Nécessaire pour générer les interprétations automatiques des bilans.
              Obtenez votre clé sur <span className="font-medium text-primary">console.anthropic.com</span>.
            </p>
          </div>
          <div className="p-5 space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
              ⚠️ La clé est stockée localement sur votre appareil et n'est jamais envoyée à nos serveurs.
            </div>
            <input
              type="password"
              value={localStorage.getItem('anthropic_api_key') ?? ''}
              onChange={e => {
                if (e.target.value) localStorage.setItem('anthropic_api_key', e.target.value);
                else localStorage.removeItem('anthropic_api_key');
              }}
              placeholder="sk-ant-api03-..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary"
            />
            {localStorage.getItem('anthropic_api_key') && (
              <p className="text-xs text-green-600">✓ Clé API configurée</p>
            )}
          </div>
        </div>

        {/* Bouton sauvegarde */}
        <div className="mt-10 pt-6 border-t border-gray-100">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-dark transition-colors"
          >
            <Save size={16} />
            Enregistrer les paramètres
          </button>
        </div>

      </div>
    </PageWrapper>
  );
}
