import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { Save, Upload, Plus, Trash2, Download, FileUp, Copy, RefreshCw, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import PageWrapper from '../components/layout/PageWrapper';
import type { Indisponibilite, JourSemaine, Participant } from '../types';
import { SectionApplication } from '../components/pwa/PWAComponents';
import { supabase } from '../lib/supabase';
import {
  type SettingsPraticien,
  DEFAULTS_SETTINGS as DEFAULTS,
  rowToSettings,
  enregistrerSettingsPraticien,
} from '../lib/settingsPraticien';
import { validerSiret, normaliserSiret } from '../lib/siret';
import { getAppHost } from '../lib/config';
import { dbToParticipant, participantToDb, bilanToDb, programmeToDb } from '../lib/mappers';
import { useRappelPreferences, type RappelPreferences } from '../hooks/useRappelPreferences';

const JOURS_LABELS: Record<JourSemaine | 'dim', string> = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi',
  ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche',
};

// ── Section indisponibilités — données Supabase ────────────────────────────────

interface ModalIndispoProps {
  onSave: (item: Indisponibilite) => void;
  onClose: () => void;
}

function ModalAjoutIndispo({ onSave, onClose }: ModalIndispoProps) {
  const [form, setForm] = useState<Omit<Indisponibilite, 'id'>>({
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
  const [indispos, setIndispos] = useState<Indisponibilite[]>([]);
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
          jour: row.jour as Indisponibilite['jour'],
          heureDebut: row.heure_debut,
          heureFin: row.heure_fin,
          recurrente: row.recurrente,
          label: row.label ?? '',
        })));
      });
  }, []);

  async function handleSave(item: Indisponibilite) {
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
      toast.success(`Export réussi — ${mapped.length} bénéficiaires`);
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

      toast.success(`Import réussi — ${inserted} bénéficiaires ajoutés`);
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
                <li className="text-sm font-semibold text-dark">• {importStats.patients} bénéficiaire{importStats.patients > 1 ? 's' : ''}</li>
                <li className="text-sm font-semibold text-dark">• {importStats.bilans} bilan{importStats.bilans > 1 ? 's' : ''}</li>
                {importStats.programmes > 0 && (
                  <li className="text-sm font-semibold text-dark">• {importStats.programmes} programme{importStats.programmes > 1 ? 's' : ''}</li>
                )}
              </ul>
              <p className="text-xs text-gray-500 mt-2">
                Les bénéficiaires existants (même identifiant) seront mis à jour.
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

// Ordre d'apparition des champs a l'ecran. Sert a designer le PREMIER champ
// en erreur, pas n'importe lequel : `Object.keys` suit l'ordre d'insertion
// dans `validate()`, qui n'est pas l'ordre du formulaire.
const ORDRE_CHAMPS: (keyof SettingsPraticien)[] = [
  'prenom', 'nom', 'titre', 'email', 'telephone', 'societe',
  'adresseRue', 'adresseCodePostal', 'adresseVille',
  'siret', 'numeroSAP', 'numeroTVA',
];

/** Attribut `name` du champ, seul lien entre la validation et le DOM. */
function nomChamp(champ: keyof SettingsPraticien): string {
  return `settings-${champ}`;
}

/**
 * Amene le premier champ en erreur sous les yeux, et lui donne le focus.
 *
 * Le toast rouge seul ne suffisait pas : ce formulaire fait plusieurs
 * ecrans de haut, et l'erreur pouvait se trouver tres au-dessus ou tres en
 * dessous de la zone visible. On voyait « Veuillez corriger les erreurs »
 * sans jamais voir quoi corriger — au point de croire que l'enregistrement
 * avait fonctionne. C'est ce malentendu qui a lance l'audit d'identite.
 */
function focaliserPremierChampEnErreur(
  erreurs: Partial<Record<keyof SettingsPraticien, string>>,
): void {
  const champ = ORDRE_CHAMPS.find(c => erreurs[c]);
  if (!champ) return;
  const el = document.querySelector<HTMLInputElement>(`[name="${nomChamp(champ)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // `preventScroll` : sans lui, le focus saute instantanement a la position
  // finale et annule le defilement doux qu'on vient de lancer.
  el.focus({ preventScroll: true });
}

function inputClass(error?: string) {
  return `w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors font-sans ${
    error
      ? 'border-red-300 bg-red-light/40 focus:border-red-400 focus:ring-red-100'
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
        Réglages par défaut pour tous vos bénéficiaires (notifications push — gratuites). Personnalisable
        par bénéficiaire depuis sa fiche, onglet « Rappels ».
      </p>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-dark">Rappel avant la séance</div>
            <p className="text-xs text-gray-400 mt-0.5">Le bénéficiaire reçoit une notification avant son rendez-vous.</p>
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
            <p className="text-xs text-gray-400 mt-0.5">La veille au soir, si le bénéficiaire a une séance prévue le lendemain.</p>
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

// ── Export du planning (flux iCalendar / webcal) ────────────────────────────────

function SectionExportPlanning() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('praticiens')
        .select('token_planning_ics')
        .eq('id', user.id)
        .single();
      setToken(data?.token_planning_ics ?? null);
      setLoading(false);
    })();
  }, []);

  function genToken(): string {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function activerOuRegenerer(regeneration: boolean) {
    if (!supabase) return;
    if (regeneration && !window.confirm(
      "Régénérer le lien invalidera immédiatement l'ancien : il faudra reconfigurer l'abonnement dans Google Agenda ou Calendrier iPhone. Continuer ?"
    )) {
      return;
    }
    setWorking(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setWorking(false); toast.error('Utilisateur non connecté'); return; }
    const nouveauToken = genToken();
    const { error } = await supabase.from('praticiens').update({ token_planning_ics: nouveauToken }).eq('id', user.id);
    setWorking(false);
    if (error) { toast.error(`Erreur : ${error.message}`); return; }
    setToken(nouveauToken);
    toast.success(regeneration ? 'Lien régénéré' : 'Export du planning activé');
  }

  const urlHttps = token ? `https://${getAppHost()}/api/planning/ics?token=${token}` : '';
  const urlWebcal = token ? `webcal://${getAppHost()}/api/planning/ics?token=${token}` : '';

  if (loading) {
    return (
      <section>
        <SectionTitle title="📅 Export du planning" />
        <div className="text-sm text-gray-400">Chargement…</div>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle title="📅 Export du planning" />
      <p className="text-xs text-gray-400 mb-4">
        Abonnez votre calendrier personnel (Google Agenda, Calendrier iPhone…) à vos séances à venir (6 mois glissants).
        Lecture seule et à sens unique : rien de ce que vous modifiez dans votre calendrier externe n'est répercuté dans Horizon.
      </p>

      {!token ? (
        <button
          onClick={() => activerOuRegenerer(false)}
          disabled={working}
          className="flex items-center gap-2 border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
        >
          <CalendarDays size={15} />
          {working ? 'Activation…' : "Activer l'export du planning"}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-600 break-all font-mono">
            {urlHttps}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(urlHttps); toast('Lien copié !'); }}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-primary text-white hover:bg-dark"
            >
              <Copy size={12} /> Copier le lien
            </button>
            <a
              href={urlWebcal}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <CalendarDays size={12} /> Ouvrir dans l'app calendrier
            </a>
            <button
              onClick={() => activerOuRegenerer(true)}
              disabled={working}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw size={12} /> Régénérer le lien
            </button>
          </div>

          <details className="text-xs text-gray-500 mt-2">
            <summary className="cursor-pointer font-medium text-gray-600">Comment ajouter ce lien à mon calendrier ?</summary>
            <div className="mt-2 space-y-2 pl-1">
              <p><strong>Google Agenda (web ou Android)</strong> : sur agenda.google.com, à côté de « Autres agendas », cliquez sur « + » puis « À partir de l'URL », et collez le lien copié ci-dessus.</p>
              <p><strong>iPhone (Calendrier)</strong> : Réglages → Calendrier → Comptes → Ajouter un compte → Autre → « Ajouter un abonnement au calendrier », puis collez le lien.</p>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [form, setForm]     = useState<SettingsPraticien>(DEFAULTS);
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsPraticien, string>>>({});
  const [loading, setLoading] = useState(true);
  const logoPraticienRef = useRef<HTMLInputElement>(null);
  // Le SIRET tel qu'il etait en base a l'ouverture de la page. Sert a
  // distinguer un numero HERITE d'un numero SAISI ici — voir `validate()`.
  const siretInitial = useRef('');

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
      if (data) {
        const charge = rowToSettings(data);
        setForm(charge);
        siretInitial.current = charge.siret;
        // Erreur affichee des l'ouverture, sans attendre une tentative
        // d'enregistrement : un SIRET herite invalide doit se voir, meme
        // s'il n'empeche plus de sauvegarder le reste.
        const controle = validerSiret(charge.siret);
        if (charge.siret.trim() && !controle.valide) {
          setErrors({ siret: controle.message });
        }
      }
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

  /**
   * Valide le formulaire.
   *
   * Renseigne `errors` avec TOUT ce qui est fautif — c'est l'affichage — et
   * rend seulement ce qui INTERDIT d'enregistrer. Les deux ensembles ne
   * coincident pas, a cause du SIRET : voir plus bas.
   *
   * Rend les erreurs plutot qu'un booleen parce que l'appelant a besoin de
   * savoir QUEL champ a echoue pour l'amener a l'ecran.
   */
  function validate(): Partial<Record<keyof SettingsPraticien, string>> {
    const required: (keyof SettingsPraticien)[] = [
      'prenom', 'nom', 'titre', 'email',
      'adresseRue', 'adresseCodePostal', 'adresseVille',
    ];
    // `next` : ce qui s'affiche. `bloquants` : ce qui refuse l'enregistrement.
    const next: Partial<Record<keyof SettingsPraticien, string>> = {};
    const bloquants: Partial<Record<keyof SettingsPraticien, string>> = {};

    for (const f of required) {
      if (!form[f].trim()) { next[f] = 'Champ obligatoire'; bloquants[f] = next[f]; }
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = 'Email invalide';
      bloquants.email = next.email;
    }
    // ── SIRET : affiche toujours, bloquant seulement s'il vient d'ici ────
    // Le SIRET reste facultatif dans ce formulaire — un salarie de structure
    // n'en a pas — et c'est la generation du contrat qui exige sa validite.
    // La contrainte mord la ou l'exigence legale s'applique, pas sur un ecran
    // qui sert a dix autres choses. C'est deja ce qui avait decide de placer
    // le blocage au contrat plutot qu'a l'onboarding.
    //
    // D'ou la distinction. Un numero SAISI ICI et faux bloque : on ne laisse
    // pas quelqu'un enregistrer une faute de frappe qu'il vient de commettre.
    // Un numero HERITE et faux — entre par l'onboarding ou l'ecran mobile, a
    // l'epoque ou aucun des deux ne validait quoi que ce soit — s'affiche en
    // erreur mais n'interdit rien d'autre. Bloquer la totalite du formulaire
    // sur une valeur qu'un autre ecran a laissee passer dresserait un mur au
    // premier enregistrement d'un praticien invite, pour un champ sans
    // rapport avec ce qu'il essaie de modifier.
    const controleSiret = validerSiret(form.siret);
    const siretHerite = normaliserSiret(form.siret) === normaliserSiret(siretInitial.current);
    if (form.siret.trim() && !controleSiret.valide) {
      next.siret = controleSiret.message;
      if (!siretHerite) bloquants.siret = next.siret;
    }

    setErrors(next);
    return bloquants;
  }

  async function handleSave() {
    const erreurs = validate();
    if (Object.keys(erreurs).length > 0) {
      toast.error('Veuillez corriger les erreurs');
      focaliserPremierChampEnErreur(erreurs);
      return;
    }
    const toSave = { ...form, siret: validerSiret(form.siret).siret };

    let userId = '';
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Utilisateur non connecté'); return; }
      userId = user.id;
    }

    // La construction de la ligne et l'ordre base-puis-cache vivent dans
    // `settingsPraticien` : cet ecran et l'ecran mobile en avaient chacun
    // leur copie, avec des jeux de colonnes differents.
    try {
      await enregistrerSettingsPraticien(toSave, userId);
    } catch (err) {
      toast.error(`Erreur : ${err instanceof Error ? err.message : 'enregistrement impossible'}`);
      return;
    }
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
                  <input name={nomChamp('prenom')} value={form.prenom} onChange={e => set('prenom', e.target.value)}
                    placeholder="Marie" className={inputClass(errors.prenom)} />
                </Field>
                <Field label="Nom" required error={errors.nom}>
                  <input name={nomChamp('nom')} value={form.nom} onChange={e => set('nom', e.target.value)}
                    placeholder="Durand" className={inputClass(errors.nom)} />
                </Field>
              </div>
              <Field label="Titre professionnel" required error={errors.titre}>
                <input name={nomChamp('titre')} value={form.titre} onChange={e => set('titre', e.target.value)}
                  placeholder="Enseignant en Activité Physique Adaptée" className={inputClass(errors.titre)} />
              </Field>
              <Field label="Email professionnel" required error={errors.email}>
                <input type="email" name={nomChamp('email')} value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="marie.durand@exemple.fr" className={inputClass(errors.email)} />
              </Field>
              <Field label="Téléphone" error={errors.telephone}>
                <input name={nomChamp('telephone')} value={form.telephone} onChange={e => set('telephone', e.target.value)}
                  placeholder="06 12 34 56 78" className={inputClass(errors.telephone)} />
              </Field>
              <Field label="Nom de la société" error={errors.societe}>
                <input name={nomChamp('societe')} value={form.societe} onChange={e => set('societe', e.target.value)}
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
                <input name={nomChamp('adresseRue')} value={form.adresseRue} onChange={e => set('adresseRue', e.target.value)}
                  placeholder="12 rue des Lilas" className={inputClass(errors.adresseRue)} />
              </Field>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Code postal" required error={errors.adresseCodePostal}>
                  <input name={nomChamp('adresseCodePostal')} value={form.adresseCodePostal} onChange={e => set('adresseCodePostal', e.target.value)}
                    placeholder="75013" className={inputClass(errors.adresseCodePostal)} />
                </Field>
                <div className="col-span-2">
                  <Field label="Ville" required error={errors.adresseVille}>
                    <input name={nomChamp('adresseVille')} value={form.adresseVille} onChange={e => set('adresseVille', e.target.value)}
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
              {/* PAS `required` : la validation ne l'a jamais impose, et
                  l'asterisque mentait. Un salarie de structure n'a pas de
                  SIRET personnel et doit pouvoir enregistrer ses reglages.
                  La contrainte vit la ou elle mord : la generation de contrat
                  est bloquee sans SIRET (ModalGenerationContrat). */}
              <Field label="Numéro SIRET" error={errors.siret}>
                <input name={nomChamp('siret')} value={form.siret} onChange={e => set('siret', e.target.value)}
                  placeholder="XXX XXX XXX XXXXX" className={inputClass(errors.siret)} />
                {form.siret.trim()
                  ? <p className="text-xs text-gray-400 mt-1">14 chiffres (espaces autorisés)</p>
                  : <p className="text-xs text-amber-600 mt-1">
                      Sans SIRET, vous ne pourrez pas générer de contrat de prestation.
                    </p>}
              </Field>
              {/* Meme correction : `required` n'etait pas non plus dans la
                  liste de validation. */}
              <Field label="Numéro de déclaration SAP" error={errors.numeroSAP}>
                <input name={nomChamp('numeroSAP')} value={form.numeroSAP} onChange={e => set('numeroSAP', e.target.value)}
                  placeholder="SAP XXXXXXXXX" className={inputClass(errors.numeroSAP)} />
              </Field>
              <Field label="Numéro TVA intracommunautaire" error={errors.numeroTVA}>
                <input name={nomChamp('numeroTVA')} value={form.numeroTVA} onChange={e => set('numeroTVA', e.target.value)}
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
                      className="flex items-center gap-2 border border-red-200 text-red-500 hover:bg-red-light px-3 py-2 rounded-xl text-sm transition-colors"
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

          {/* ── Export du planning (iCalendar) ── */}
          <SectionExportPlanning />

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
