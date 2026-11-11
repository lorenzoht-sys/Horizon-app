import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { useRappelPreferences, type RappelPreferences } from '../../hooks/useRappelPreferences';
import { toast } from 'sonner';
import { compterAppareilsRappels } from '../../lib/suiviBeneficiaire';

// ── Rappels (par patient) ───────────────────────────────────────────────────────

export function SectionRappelsPatient({ participantId }: { participantId: string }) {
  const { prefs, herite, loading, enregistrer, reinitialiser } = useRappelPreferences(participantId);
  const [local, setLocal] = useState<RappelPreferences>(prefs);
  const [saving, setSaving] = useState(false);
  const [nbAppareils, setNbAppareils] = useState<number | null>(null);

  useEffect(() => {
    if (!loading) setLocal(prefs);
  }, [loading, prefs]);

  useEffect(() => {
    let annule = false;
    void compterAppareilsRappels(participantId).then(nb => {
      if (!annule && nb !== null) setNbAppareils(nb);
    });
    return () => { annule = true; };
  }, [participantId]);

  async function handleSave() {
    setSaving(true);
    const ok = await enregistrer(local);
    setSaving(false);
    toast[ok ? 'success' : 'error'](ok ? 'Préférences de rappels enregistrées' : "Erreur lors de l'enregistrement");
  }

  async function handleReset() {
    setSaving(true);
    const ok = await reinitialiser();
    setSaving(false);
    toast[ok ? 'success' : 'error'](ok ? 'Réglages globaux rétablis pour ce bénéficiaire' : 'Erreur');
  }

  if (loading) return <div className="text-sm text-gray-400">Chargement…</div>;

  return (
    <div className="space-y-5">
      {/* Abonnement push */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Notifications push</div>
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium"
          style={nbAppareils !== null && nbAppareils > 0
            ? { background: '#DCFCE7', color: '#16A34A' }
            : { background: '#F3F4F6', color: '#6B7280' }}>
          {nbAppareils === null
            ? 'Chargement…'
            : nbAppareils > 0
              ? `🔔 ${nbAppareils} appareil${nbAppareils > 1 ? 's' : ''} abonné${nbAppareils > 1 ? 's' : ''} aux rappels`
              : '🔕 Aucun appareil abonné aux rappels'}
        </div>
        {nbAppareils === 0 && (
          <p className="text-[12px] text-gray-400 mt-1.5">
            Le bénéficiaire peut les activer depuis son espace bénéficiaire (bouton « Activer les rappels »).
          </p>
        )}
      </div>

      {/* Réglages */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Réglages</div>
        {herite && (
          <div className="rounded-lg px-3 py-2.5 text-[12px] mb-3" style={{ background: '#F3F4F6', color: '#6B7280' }}>
            Ce bénéficiaire suit les réglages globaux (Paramètres → Rappels automatiques). Modifiez-les ci-dessous pour les personnaliser uniquement pour lui.
          </div>
        )}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200/70 p-3">
            <div>
              <div className="text-sm font-medium text-gray-800">Rappel avant la séance</div>
              <p className="text-[12px] text-gray-400 mt-0.5">Notification envoyée avant le rendez-vous.</p>
            </div>
            <input type="checkbox" checked={local.rappelSeanceActif}
              onChange={e => setLocal(l => ({ ...l, rappelSeanceActif: e.target.checked }))}
              className="w-4 h-4 accent-primary flex-shrink-0" />
          </div>
          {local.rappelSeanceActif && (
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Délai avant la séance (heures)</span>
              <input type="number" min={1} max={48} value={local.rappelSeanceDelaiHeures}
                onChange={e => setLocal(l => ({ ...l, rappelSeanceDelaiHeures: Number(e.target.value) }))}
                className="w-full max-w-[120px] px-4 py-2.5 border border-gray-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/10 transition-colors font-sans" />
            </label>
          )}

          <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200/70 p-3">
            <div>
              <div className="text-sm font-medium text-gray-800">Rappel jour de séance</div>
              <p className="text-[12px] text-gray-400 mt-0.5">La veille au soir, si le bénéficiaire a une séance prévue le lendemain.</p>
            </div>
            <input type="checkbox" checked={local.rappelJourSeanceActif}
              onChange={e => setLocal(l => ({ ...l, rappelJourSeanceActif: e.target.checked }))}
              className="w-4 h-4 accent-primary flex-shrink-0" />
          </div>
          {local.rappelJourSeanceActif && (
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Heure d'envoi</span>
              <input type="time" value={local.rappelJourSeanceHeure}
                onChange={e => setLocal(l => ({ ...l, rappelJourSeanceHeure: e.target.value }))}
                className="w-full max-w-[120px] px-4 py-2.5 border border-gray-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/10 transition-colors font-sans" />
            </label>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Save size={13} />
          {saving ? 'Enregistrement…' : herite ? 'Personnaliser pour ce bénéficiaire' : 'Enregistrer'}
        </button>
        {!herite && (
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex items-center gap-1.5 text-gray-400 text-[13px] font-medium px-3 py-[7px] rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            Revenir aux réglages globaux
          </button>
        )}
      </div>
    </div>
  );
}
