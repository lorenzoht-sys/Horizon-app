import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { useRappelPreferences, type RappelPreferences } from '../../hooks/useRappelPreferences';
import { Field, SectionTitle, inputClass } from './communs';

// ── Rappels automatiques (réglages globaux) ─────────────────────────────────────

export function SectionRappelsGlobal() {
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
