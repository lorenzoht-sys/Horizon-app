import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { Save, Upload, Plus, Trash2, Download, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import PageWrapper from '../components/layout/PageWrapper';
import type { IndisponibilitePierre, JourSemaine, Participant } from '../types';
import { SectionApplication } from '../components/pwa/PWAComponents';
import { supabase } from '../lib/supabase';
import { dbToParticipant, participantToDb, bilanToDb, programmeToDb } from '../lib/mappers';
import { useRappelPreferences, type RappelPreferences } from '../hooks/useRappelPreferences';

const JOURS_LABELS: Record<JourSemaine | 'dim', string> = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi',
  ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche',
};

// ── Section indisponibilités — données Supabase ────────────────────────────────

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
  const [indispos, setIndispos] = useState<IndisponibilitePierre[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('indisponibilites')
      .select('*')
      .order('jour')
      .then(({ data, error }) => {
        if (error) { console.error('Erreur chargement indispos:', error); return; }
        setIndispos((data ?? []).map(row => ({
          id: row.id,
          jour: row.jour as IndisponibilitePierre['jour'],
          heureDebut: row.heure_debut,
          heureFin: row.heure_fin,
          recurrente: row.recurrente,
          label: row.label ?? '',
        })));
      });
  }, []);

  async function handleSave(item: IndisponibilitePierre) {
    if (supabase) {
      const { error } = await supabase.from('indisponibilites').insert({
        id: item.id,
        jour: item.jour,
        heure_debut: item.heureDebut,
        heure_fin: item.heureFin,
        recurrente: item.recurrente,
        label: item.label || null,
      });
      if (error) { toast.error('Erreur lors de la sauvegarde'); return; }
    }
    setIndispos(prev => [...prev, item]);
    setShowModal(false);
    toast.success('Indisponibilité ajoutée');
  }

  async function handleDelete(id: string) {
    if (supabase) {
      await supabase.from('indisponibilites').delete().eq('id', id);
    }
    setIndispos(prev => prev.filter(i => i.id !== id));
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

// ── Section import / export JSON ───────────────────────────────────────────────

interface ImportStats {
  patients: number;
  bilans: number;
  programmes: number;
}

function SectionDonnees() {
  const [exporting, setExporting]     = useState(false);
  const [importing, setImporting]     = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    if (!supabase) { toast.error('Supabase non configuré'); return; }
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from('participants')
        .select('*, bilans(*), programmes(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const mapped = (data ?? []).map(dbToParticipant);
      const blob = new Blob([JSON.stringify(mapped, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `horizon-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Export réussi — ${mapped.length} patients`);
    } catch (err) {
      toast.error('Erreur lors de l\'export');
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input pour permettre re-sélection du même fichier
    e.target.value = '';
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        toast.error('Format invalide — le fichier doit être un tableau JSON Horizon');
        return;
      }
      const bilansCount = data.reduce((sum: number, p: Participant) => sum + (p.bilans?.length ?? 0), 0);
      const progCount   = data.reduce((sum: number, p: Participant) => sum + (p.programmes?.length ?? 0), 0);
      setPendingFile(file);
      setImportStats({ patients: data.length, bilans: bilansCount, programmes: progCount });
    } catch {
      toast.error('Fichier JSON invalide');
    }
  }

  async function handleImportConfirm() {
    if (!pendingFile || !supabase) return;
    setImporting(true);
    try {
      const text = await pendingFile.text();
      const data: Participant[] = JSON.parse(text);
      let inserted = 0;

      for (const p of data) {
        const { bilans: pBilans, programmes: pProgs, ...rest } = p as Participant & { programmes?: unknown[] };
        await supabase.from('participants').upsert(participantToDb(rest));

        for (const b of pBilans ?? []) {
          await supabase.from('bilans').upsert(bilanToDb(p.id, b));
        }
        for (const prog of (pProgs ?? []) as Parameters<typeof programmeToDb>[0][]) {
          await supabase.from('programmes').upsert({
            ...programmeToDb(prog),
            date_creation: (prog as { dateCreation?: string }).dateCreation ?? new Date().toISOString().slice(0, 10),
          });
        }
        inserted++;
      }

      toast.success(`Import réussi — ${inserted} patients ajoutés`);
      setPendingFile(null);
      setImportStats(null);
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      console.error('Erreur import:', err);
      toast.error('Erreur lors de l\'import');
    } finally {
      setImporting(false);
    }
  }

  function handleImportCancel() {
    setPendingFile(null);
    setImportStats(null);
  }

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Mes données</h2>
        <div className="h-px bg-gray-100" />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        {/* Export */}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Download size={15} />
          {exporting ? 'Export en cours…' : '📤 Exporter mes données (JSON)'}
        </button>

        {/* Import */}
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => importRef.current?.click()}
          className="flex items-center gap-2 border border-primary/40 text-primary hover:bg-primary/5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <FileUp size={15} />
          📥 Importer un fichier JSON
        </button>
      </div>

      <p className="text-xs text-gray-400">
        Importez un fichier <span className="font-mono">horizon-backup-*.json</span> pour restaurer vos données depuis une sauvegarde.
      </p>

      {/* Modal confirmation import */}
      {importStats && pendingFile && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FileUp size={18} className="text-primary" />
              </div>
              <h3 className="font-heading font-bold text-dark text-lg">Confirmer l'import</h3>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-1">
              <p className="text-sm text-gray-600">
                Cette action ajoutera à votre compte :
              </p>
              <ul className="mt-2 space-y-1">
                <li className="text-sm font-semibold text-dark">• {importStats.patients} patient{importStats.patients > 1 ? 's' : ''}</li>
                <li className="text-sm font-semibold text-dark">• {importStats.bilans} bilan{importStats.bilans > 1 ? 's' : ''}</li>
                {importStats.programmes > 0 && (
                  <li className="text-sm font-semibold text-dark">• {importStats.programmes} programme{importStats.programmes > 1 ? 's' : ''}</li>
                )}
              </ul>
              <p className="text-xs text-gray-500 mt-2">
                Les patients existants (même identifiant) seront mis à jour.
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleImportCancel}
                disabled={importing}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleImportConfirm}
                disabled={importing}
                className="flex-1 bg-primary text-white hover:bg-dark px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Import en cours…' : 'Continuer'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  societe: string;
  logoPraticien: string;
  tarifHoraire: string;
  fraisKmDefaut: string;
}

const DEFAULTS: SettingsPraticien = {
  prenom: '', nom: '', titre: 'Enseignant en Activité Physique Adaptée',
  email: '', telephone: '', adresseRue: '', adresseCodePostal: '',
  adresseVille: '', siret: '', numeroSAP: '', numeroTVA: '',
  villeSignature: '', societe: '', logoPraticien: '',
  tarifHoraire: '45', fraisKmDefaut: '0.50',
};

function rowToSettings(row: Record<string, unknown>): SettingsPraticien {
  return {
    prenom:            String(row.prenom            ?? ''),
    nom:               String(row.nom               ?? ''),
    titre:             String(row.titre             ?? DEFAULTS.titre),
    email:             String(row.email             ?? ''),
    telephone:         String(row.telephone         ?? ''),
    adresseRue:        String(row.adresse_rue       ?? ''),
    adresseCodePostal: String(row.adresse_code_postal ?? ''),
    adresseVille:      String(row.adresse_ville     ?? ''),
    siret:             String(row.siret             ?? ''),
    numeroSAP:         String(row.numero_sap        ?? ''),
    numeroTVA:         String(row.numero_tva        ?? ''),
    villeSignature:    String(row.ville_signature   ?? ''),
    societe:           String(row.societe           ?? ''),
    logoPraticien:     String(row.logo_praticien    ?? ''),
    tarifHoraire:      String(row.tarif_horaire     ?? '45'),
    fraisKmDefaut:     String(row.frais_km_defaut   ?? '0.50'),
  };
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

// ── Rappels automatiques (réglages globaux) ─────────────────────────────────────

function SectionRappelsGlobal() {
  const { prefs, loading, enregistrer } = useRappelPreferences();
  const [local, setLocal] = useState<RappelPreferences>(prefs);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) setLocal(prefs);
  }, [loading, prefs]);

  async function handleSave() {
    setSaving(true);
    const ok = await enregistrer(local);
    setSaving(false);
    toast[ok ? 'success' : 'error'](ok ? 'Préférences de rappels enregistrées' : "Erreur lors de l'enregistrement");
  }

  if (loading) {
    return (
      <section>
        <SectionTitle title="🔔 Rappels automatiques" />
        <div className="text-sm text-gray-400">Chargement…</div>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle title="🔔 Rappels automatiques" />
      <p className="text-xs text-gray-400 mb-4">
        Réglages par défaut pour tous vos patients (notifications push — gratuites). Personnalisable
        par patient depuis sa fiche, onglet « Rappels ».
      </p>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-dark">Rappel avant la séance</div>
            <p className="text-xs text-gray-400 mt-0.5">Le patient reçoit une notification avant son rendez-vous.</p>
          </div>
          <input type="checkbox" checked={local.rappelSeanceActif}
            onChange={e => setLocal(l => ({ ...l, rappelSeanceActif: e.target.checked }))}
            className="w-4 h-4 accent-primary flex-shrink-0" />
        </div>
        {local.rappelSeanceActif && (
          <Field label="Délai avant la séance (heures)">
            <input type="number" min={1} max={48} value={local.rappelSeanceDelaiHeures}
              onChange={e => setLocal(l => ({ ...l, rappelSeanceDelaiHeures: Number(e.target.value) }))}
              className={`${inputClass()} max-w-[120px]`} />
          </Field>
        )}

        <div className="flex items-center justify-between gap-4 pt-4 border-t border-gray-100">
          <div>
            <div className="text-sm font-medium text-dark">Rappel jour de séance</div>
            <p className="text-xs text-gray-400 mt-0.5">La veille au soir, si le patient a une séance prévue le lendemain.</p>
          </div>
          <input type="checkbox" checked={local.rappelJourSeanceActif}
            onChange={e => setLocal(l => ({ ...l, rappelJourSeanceActif: e.target.checked }))}
            className="w-4 h-4 accent-primary flex-shrink-0" />
        </div>
        {local.rappelJourSeanceActif && (
          <Field label="Heure d'envoi">
            <input type="time" value={local.rappelJourSeanceHeure}
              onChange={e => setLocal(l => ({ ...l, rappelJourSeanceHeure: e.target.value }))}
              className={`${inputClass()} max-w-[120px]`} />
          </Field>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 flex items-center gap-2 border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
      >
        <Save size={15} />
        {saving ? 'Enregistrement…' : 'Enregistrer les rappels'}
      </button>
    </section>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [form, setForm]     = useState<SettingsPraticien>(DEFAULTS);
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsPraticien, string>>>({});
  const [loading, setLoading] = useState(true);
  const logoPraticienRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('praticiens')
        .select('*')
        .eq('id', user.id)
        .single();
      if (data) setForm(rowToSettings(data));
      setLoading(false);
    })();
  }, []);

  function set(field: keyof SettingsPraticien, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: undefined }));
  }

  function handleLogoPraticienChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 600_000) { toast.error('Image trop lourde (max 600 Ko)'); return; }
    const reader = new FileReader();
    reader.onload = ev => set('logoPraticien', ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function validate(): boolean {
    const required: (keyof SettingsPraticien)[] = [
      'prenom', 'nom', 'titre', 'email',
      'adresseRue', 'adresseCodePostal', 'adresseVille',
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

  async function handleSave() {
    if (!validate()) { toast.error('Veuillez corriger les erreurs'); return; }
    const toSave = { ...form, siret: form.siret.replace(/\s/g, '') };

    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Utilisateur non connecté'); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('praticiens')
        .upsert({
          id:                  user.id,
          prenom:              toSave.prenom,
          nom:                 toSave.nom,
          titre:               toSave.titre,
          email:               toSave.email,
          telephone:           toSave.telephone || null,
          adresse_rue:         toSave.adresseRue,
          adresse_code_postal: toSave.adresseCodePostal,
          adresse_ville:       toSave.adresseVille,
          siret:               toSave.siret,
          numero_sap:          toSave.numeroSAP,
          numero_tva:          toSave.numeroTVA || null,
          ville_signature:     toSave.villeSignature,
          societe:             toSave.societe || null,
          logo_praticien:      toSave.logoPraticien || null,
          tarif_horaire:       toSave.tarifHoraire,
          frais_km_defaut:     toSave.fraisKmDefaut,
        });
      if (error) { toast.error(`Erreur : ${error.message}`); return; }
    }

    // Cache local pour les composants PDF qui lisent encore settings_praticien
    localStorage.setItem('settings_praticien', JSON.stringify(toSave));
    window.dispatchEvent(new Event('settings_praticien_updated'));
    toast.success('Paramètres enregistrés');
  }

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-64">
          <div className="text-sm text-gray-400">Chargement des paramètres…</div>
        </div>
      </PageWrapper>
    );
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
              <Field label="Nom de la société" error={errors.societe}>
                <input value={form.societe} onChange={e => set('societe', e.target.value)}
                  placeholder="Horizon APA" className={inputClass(errors.societe)} />
                <p className="text-xs text-gray-400 mt-1">Optionnel — affiché dans l'en-tête de vos PDFs</p>
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

          {/* ── Logo de ma société ── */}
          <section>
            <SectionTitle title="Logo de ma société (PDFs)" />
            <p className="text-xs text-gray-400 mb-4">
              Affiché dans l'en-tête de tous vos PDFs à la place du logo Horizon. Laissez vide pour garder le logo Horizon.
            </p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                {form.logoPraticien ? (
                  <img src={form.logoPraticien} alt="Logo société" className="w-full h-full object-contain p-1" />
                ) : (
                  <span className="text-xs text-gray-300 text-center leading-tight">Aucun logo</span>
                )}
              </div>
              <div>
                <input
                  ref={logoPraticienRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={handleLogoPraticienChange}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => logoPraticienRef.current?.click()}
                    className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                  >
                    <Upload size={15} />
                    {form.logoPraticien ? 'Changer le logo' : 'Ajouter un logo'}
                  </button>
                  {form.logoPraticien && (
                    <button
                      onClick={() => set('logoPraticien', '')}
                      className="flex items-center gap-2 border border-red-200 text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl text-sm transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
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

          {/* ── Rappels automatiques ── */}
          <SectionRappelsGlobal />

          {/* ── Indisponibilités ── */}
          <SectionIndisponibilites />

          {/* ── Import / Export données ── */}
          <SectionDonnees />

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
