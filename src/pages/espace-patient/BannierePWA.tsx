import { useState, useEffect } from 'react';
import { C } from './communs';

// ── Bannière PWA ──────────────────────────────────────────────────────────────

export function BannierePWA() {
  const [visible, setVisible] = useState(() => {
    return !sessionStorage.getItem('pwa_dismissed');
  });
  const [prompt, setPrompt] = useState<{ prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  const isAndroid = /Android/.test(navigator.userAgent);

  useEffect(() => {
    const onP = (e: Event) => {
      e.preventDefault();
      setPrompt(e as unknown as { prompt: () => void; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener('beforeinstallprompt', onP);
    return () => window.removeEventListener('beforeinstallprompt', onP);
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      margin: '12px 16px',
      background: 'white',
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '14px 16px',
      position: 'relative',
    }}>
      <button onClick={() => { setVisible(false); sessionStorage.setItem('pwa_dismissed', '1'); }}
        style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', fontSize: 20, color: C.muted, cursor: 'pointer' }}>×</button>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
        📱 Installer l'app sur votre téléphone
      </div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
        Accédez à votre espace en 1 clic depuis l'écran d'accueil.
      </div>
      {isIOS && (
        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7, background: C.bg, borderRadius: 8, padding: '10px 12px' }}>
          Sur iPhone → <strong>□↑</strong> puis <strong>"Sur l'écran d'accueil"</strong>
        </div>
      )}
      {isAndroid && prompt && (
        <button onClick={async () => {
          prompt.prompt();
          const r = await prompt.userChoice;
          if (r.outcome === 'accepted') { setVisible(false); sessionStorage.setItem('pwa_dismissed', '1'); }
          setPrompt(null);
        }} style={{ width: '100%', padding: '11px', background: C.teal, color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Installer l'app
        </button>
      )}
    </div>
  );
}
