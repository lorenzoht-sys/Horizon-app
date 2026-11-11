import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { utilisateurCourant } from '../../../lib/session';
import { EVENT_SETTINGS_PRATICIEN, chargerSettingsPraticien, enregistrerSettingsPraticien, hydraterSettingsPraticien, type SettingsPraticien } from '../../../lib/settingsPraticien';

export function formatDateLong(d: Date) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatDateCourt(d: string) {
  return new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export const C = { // colors
  dark:    'var(--color-ink)',
  primary: 'var(--color-teal)',
  green:   '#1ca48c',
  bg:      'var(--color-bg)',
  border:  '#E0EEEE',
  text:    '#032c28',
  muted:   '#8FA8A8',
};

export const card: React.CSSProperties = {
  background: 'white', borderRadius: 12,
  border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 8,
};

// ── Hook paramètres praticien (Supabase) ─────────────────────────────────────

// Cet ecran avait ses propres valeurs par defaut, sa propre requete et ses
// propres ecritures du cache — un dixieme lecteur de reglages, reste en
// dehors de la consolidation. Il portait treize champs sur seize : ni
// `numeroTVA`, ni `fraisKmDefaut`, ni `logoPraticien`. Tout passe desormais
// par `settingsPraticien`, comme les ecrans desktop.
export function usePraticienSettings() {
  const [settings, setSettings] = useState<SettingsPraticien>(chargerSettingsPraticien);
  const [loading, setLoading] = useState(true);
  // Renseigne uniquement si la BASE est injoignable — pas si la fiche
  // n'existe pas encore. Voir `EchecHydratation`. L'ecran de reglages s'en
  // sert pour interdire l'enregistrement : sauvegarder un formulaire qu'on
  // n'a pas pu pre-remplir ecraserait la fiche avec des champs vides.
  const [echecChargement, setEchecChargement] = useState(false);

  useEffect(() => {
    void (async () => {
      const resultat = await hydraterSettingsPraticien();
      if (!resultat.ok && resultat.echec === 'erreur') {
        console.error('[Mobile] Hydratation des reglages en echec :', resultat.message);
        setEchecChargement(true);
      }
      setSettings(chargerSettingsPraticien());
      setLoading(false);
    })();
  }, []);

  // Rester synchrone avec les autres ecrans : `ecrireCacheSettingsPraticien`
  // emet cet evenement a chaque ecriture du cache.
  useEffect(() => {
    const handler = () => setSettings(chargerSettingsPraticien());
    window.addEventListener(EVENT_SETTINGS_PRATICIEN, handler);
    return () => window.removeEventListener(EVENT_SETTINGS_PRATICIEN, handler);
  }, []);

  async function sauvegarderSettings(form: SettingsPraticien) {
    if (!supabase) throw new Error('Supabase non configuré');
    const user = await utilisateurCourant();
    if (!user) throw new Error('Non connecté');
    // Base d'abord, cache ensuite — l'ordre est garanti par le module.
    await enregistrerSettingsPraticien(form, user.id);
    setSettings(form);
  }

  return { settings, loading, echecChargement, sauvegarderSettings };
}

// ── Écrans de routage ─────────────────────────────────────────────────────────

export function EcranChargement({ loading, texteIntrouvable, onBack }: { loading: boolean; texteIntrouvable: string; onBack: () => void }) {
  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 48px)', paddingLeft: 24, paddingRight: 24, textAlign: 'center', color: C.muted, fontSize: 14 }}>
      <div style={{ marginBottom: 16 }}>{loading ? 'Chargement…' : texteIntrouvable}</div>
      {!loading && (
        <button onClick={onBack} style={{ padding: '10px 18px', background: 'white', border: `1.5px solid ${C.primary}`, color: C.primary, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          ← Retour
        </button>
      )}
    </div>
  );
}
