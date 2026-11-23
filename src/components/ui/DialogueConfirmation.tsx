import { useEffect, useRef } from 'react';

// Petite fenêtre « Confirmer / Annuler » avant un geste qui change une séance (retour de Pierre
// du 23/11/2026 : « Confirmer que cette séance a bien été réalisée ? »). Partagée par l'accueil
// mobile et le tableau de bord.

export function DialogueConfirmation({ titre, message, libelleConfirmer = 'Confirmer', enCours = false, onConfirmer, onAnnuler }: {
  titre: string;
  message?: string;
  libelleConfirmer?: string;
  enCours?: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  const confirmer = useRef<HTMLButtonElement>(null);
  useEffect(() => { confirmer.current?.focus(); }, []);
  return (
    // z-index au-dessus de la barre de navigation mobile (zIndex 100, BarreNavigationMobile.tsx) :
    // à 60, la barre recouvrait les boutons de la fenêtre sur téléphone (vu en e2e le 23/11/2026).
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-black/40" onClick={onAnnuler}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="dialogue-confirmation-titre"
        className="w-full max-w-sm bg-white rounded-[20px] shadow-2xl p-5 flex flex-col gap-3"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') onAnnuler(); }}>
        <h2 id="dialogue-confirmation-titre" className="m-0 text-base font-extrabold" style={{ color: 'var(--color-ink)' }}>{titre}</h2>
        {message && <p className="m-0 text-sm" style={{ color: '#3D4C5A' }}>{message}</p>}
        <div className="flex gap-2 mt-1">
          <button type="button" onClick={onAnnuler} disabled={enCours}
            className="flex-1 h-12 rounded-[12px] bg-white text-sm font-bold disabled:opacity-60" style={{ border: '1.5px solid #D5E4E6', color: '#3D4C5A' }}>
            Annuler
          </button>
          <button ref={confirmer} type="button" onClick={onConfirmer} disabled={enCours}
            className="flex-1 h-12 rounded-[12px] text-white text-sm font-bold disabled:opacity-60" style={{ background: '#1A9A7F' }}>
            {enCours ? 'Enregistrement…' : libelleConfirmer}
          </button>
        </div>
      </div>
    </div>
  );
}
