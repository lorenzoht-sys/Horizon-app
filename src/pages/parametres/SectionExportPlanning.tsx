import { useState, useEffect } from 'react';
import { Copy, RefreshCw, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { lirePraticien, majTokenPlanning } from '../../lib/acces/praticien';
import { utilisateurCourant } from '../../lib/session';
import { getAppHost } from '../../lib/config';
import { SectionTitle } from './communs';

// ── Export du planning (flux iCalendar / webcal) ────────────────────────────────

export function SectionExportPlanning() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void (async () => {
      const user = await utilisateurCourant();
      if (!user) { setLoading(false); return; }
      const { data } = await lirePraticien(user.id, 'token_planning_ics');
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
    const user = await utilisateurCourant();
    if (!user) { setWorking(false); toast.error('Utilisateur non connecté'); return; }
    const nouveauToken = genToken();
    const { error } = await majTokenPlanning(user.id, nouveauToken);
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
        Abonnez votre calendrier personnel (Google Agenda, Calendrier iPhone…) à votre agenda Horizon : séances, bilans, cours collectifs et événements, passés et à venir (24 mois d'historique, 12 mois à l'avance). Google Agenda actualise un calendrier abonné à son propre rythme, souvent plusieurs heures après une modification.
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
