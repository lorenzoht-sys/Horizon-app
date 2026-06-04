import { useState, useEffect } from 'react';
import { useConnexion } from '../../hooks/useConnexion';

function formatHeure(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ── Bandeau hors ligne (en haut de page) ──────────────────────────────────────

export function BandeauHorsLigne() {
  const { enLigne, dernierEnLigne } = useConnexion();

  if (enLigne) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      zIndex: 9999,
      background: '#F59E0B',
      color: 'white',
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      fontSize: 13,
      fontWeight: 600,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      <span>📵</span>
      <span>Mode hors ligne — Toutes vos données sont sauvegardées localement</span>
      {dernierEnLigne && (
        <span style={{ fontSize: 11, opacity: 0.8 }}>
          · Dernière connexion : {formatHeure(dernierEnLigne)}
        </span>
      )}
    </div>
  );
}

// ── Indicateur discret (dans la sidebar) ─────────────────────────────────────

export function IndicateurConnexion() {
  const { enLigne } = useConnexion();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '4px 10px',
      borderRadius: 20,
      background: enLigne ? 'rgba(43,191,191,0.15)' : 'rgba(245,158,11,0.15)',
      border: `1px solid ${enLigne ? 'rgba(43,191,191,0.4)' : 'rgba(245,158,11,0.4)'}`,
    }}>
      <div style={{
        width: 7, height: 7,
        borderRadius: '50%',
        background: enLigne ? 'var(--color-teal)' : '#F59E0B',
        animation: enLigne ? 'none' : 'pulse 2s infinite',
      }} />
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: enLigne ? 'var(--color-teal)' : '#F59E0B',
      }}>
        {enLigne ? 'En ligne' : 'Hors ligne'}
      </span>
    </div>
  );
}

// ── Notification mise à jour ──────────────────────────────────────────────────

export function NotificationMiseAJour() {
  const [miseAJourDispo, setMiseAJourDispo] = useState(false);

  useEffect(() => {
    const handler = () => setMiseAJourDispo(true);
    document.addEventListener('sw-updated', handler);
    return () => document.removeEventListener('sw-updated', handler);
  }, []);

  if (!miseAJourDispo) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20, right: 20,
      zIndex: 9999,
      background: '#032c28',
      color: 'white',
      padding: '14px 18px',
      borderRadius: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      maxWidth: 300,
    }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>
        🔄 Mise à jour disponible
      </div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        Une nouvelle version de Mouv'APA est prête.
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: 'var(--color-teal)',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          padding: '8px 14px',
          fontWeight: 700,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Mettre à jour maintenant
      </button>
    </div>
  );
}

// ── Bouton installer l'app ────────────────────────────────────────────────────

export function BoutonInstallerApp({ compact = false }: { compact?: boolean }) {
  const [promptInstall, setPromptInstall] = useState<any>(null);
  const [installe, setInstalle] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptInstall(e);
    };
    const onInstalled = () => {
      setInstalle(true);
      setPromptInstall(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!promptInstall || installe) return null;

  return (
    <button
      onClick={async () => {
        promptInstall.prompt();
        const { outcome } = await promptInstall.userChoice;
        if (outcome === 'accepted') setInstalle(true);
        setPromptInstall(null);
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: compact ? '6px 12px' : '10px 16px',
        background: 'var(--color-teal)',
        color: 'white', border: 'none',
        borderRadius: 10,
        fontSize: compact ? 11 : 13,
        fontWeight: 700, cursor: 'pointer',
        width: compact ? '100%' : undefined,
        justifyContent: compact ? 'center' : undefined,
      }}
    >
      📱 {compact ? 'Installer' : "Installer l'app"}
    </button>
  );
}

// ── Section Application (pour SettingsPage) ───────────────────────────────────

export function SectionApplication() {
  const { enLigne } = useConnexion();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', padding: '12px 16px',
        background: '#F0FAF9', borderRadius: 10,
        border: '1px solid #C5EAE9',
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0D2B4B' }}>
            Mode hors ligne
          </div>
          <div style={{ fontSize: 12, color: '#8B9BB4', marginTop: 2 }}>
            L'app fonctionne sans connexion internet
          </div>
        </div>
        <div style={{
          background: '#E1F5EE', color: '#0F6E56',
          padding: '4px 12px', borderRadius: 20,
          fontSize: 12, fontWeight: 700,
        }}>
          ✅ Actif
        </div>
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', padding: '12px 16px',
        background: enLigne ? '#F0FAF9' : '#FFFBEB', borderRadius: 10,
        border: `1px solid ${enLigne ? '#C5EAE9' : '#FCD34D'}`,
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0D2B4B' }}>
            Connexion internet
          </div>
          <div style={{ fontSize: 12, color: '#8B9BB4', marginTop: 2 }}>
            {enLigne ? 'Vous êtes connecté' : 'Vous êtes hors ligne — données sauvegardées localement'}
          </div>
        </div>
        <IndicateurConnexion />
      </div>

      <BoutonInstallerApp />

      <p style={{ fontSize: 12, color: '#8B9BB4' }}>
        💡 Installez l'app sur votre téléphone pour un accès rapide depuis l'écran d'accueil, même sans connexion.
      </p>
    </div>
  );
}
