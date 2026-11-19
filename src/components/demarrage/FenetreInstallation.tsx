import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Download, EllipsisVertical, Share, SquarePlus, X } from 'lucide-react';
import {
  abonnerInstallation,
  inviteNativeDisponible,
  lancerInstallation,
  plateformeCourante,
  type Plateforme,
} from '../../lib/installationPwa';
import { getAppOrigin } from '../../lib/config';

// Installer Horizon sur l'écran d'accueil. Trois cas :
// - Chrome / Edge ont une invite native : un bouton suffit ;
// - Safari n'en a pas : on montre les trois gestes, avec les icônes qu'il affiche ;
// - sur ordinateur, ce qui compte est le téléphone : un QR code ouvre Horizon dessus.

interface Props {
  ouverte: boolean;
  onFermer: () => void;
  onInstallee: () => void;
  /** Forcé pour les aperçus ; sinon détecté. */
  plateformeInitiale?: Plateforme;
}

const ONGLETS: { id: Plateforme; libelle: string }[] = [
  { id: 'ios', libelle: 'iPhone' },
  { id: 'android', libelle: 'Android' },
  { id: 'bureau', libelle: 'Ordinateur' },
];

export function FenetreInstallation({ ouverte, onFermer, onInstallee, plateformeInitiale }: Props) {
  const reduit = useReducedMotion();
  const [plateforme, setPlateforme] = useState<Plateforme>(() => plateformeInitiale ?? plateformeCourante());
  const native = useSyncExternalStore(abonnerInstallation, inviteNativeDisponible, () => false);
  const fenetre = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouverte) return;
    // Focus sur la fenêtre elle-même : le lecteur d'écran annonce son titre, sans
    // anneau de focus sur un onglet que personne n'a encore choisi.
    fenetre.current?.focus();
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [ouverte, onFermer]);

  async function installer() {
    if (await lancerInstallation()) onInstallee();
  }

  // Domaine canonique, comme tous les QR codes d'Horizon (src/lib/config.ts) : jamais l'URL d'un Preview.
  const urlApp = getAppOrigin();

  return (
    <AnimatePresence>
      {ouverte && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
          style={{ background: 'rgba(26,35,50,0.45)', backdropFilter: 'blur(2px)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: reduit ? 0 : 0.2 }}
          onClick={e => { if (e.target === e.currentTarget) onFermer(); }}
        >
          <motion.div
            ref={fenetre}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titre-installation"
            className="w-full bg-white outline-none sm:max-w-[460px]"
            style={{
              borderRadius: 24,
              boxShadow: 'var(--shadow-lg)',
              padding: 24,
              paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
              maxHeight: '92vh',
              overflowY: 'auto',
            }}
            initial={reduit ? false : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduit ? undefined : { y: 24, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="titre-installation" className="m-0 font-heading font-bold" style={{ fontSize: 19, color: 'var(--color-ink)' }}>
                  Horizon sur votre téléphone
                </h2>
                <p className="m-0" style={{ fontSize: 13.5, color: 'var(--color-ink-2)', marginTop: 4, lineHeight: 1.5 }}>
                  Une icône sur l’écran d’accueil, en plein écran, sans passer par le navigateur.
                </p>
              </div>
              <button
                type="button"
                onClick={onFermer}
                aria-label="Fermer"
                className="flex-shrink-0 rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {native && (
              <button
                type="button"
                onClick={installer}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-[12px] bg-teal text-white transition-colors hover:bg-teal-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2"
                style={{ padding: '13px 18px', fontSize: 15, fontWeight: 700, boxShadow: 'var(--shadow-teal)' }}
              >
                <Download size={18} aria-hidden="true" /> Installer Horizon
              </button>
            )}

            <div role="tablist" aria-label="Appareil" className="mt-5 flex rounded-xl bg-surface-2 p-1" style={{ gap: 2 }}>
              {ONGLETS.map(o => (
                <button
                  key={o.id}
                  type="button"
                  role="tab"
                  aria-selected={plateforme === o.id}
                  onClick={() => setPlateforme(o.id)}
                  className={`flex-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 ${
                    plateforme === o.id ? 'bg-white text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                  }`}
                  style={{ padding: '8px 6px', fontSize: 12.5, fontWeight: 600 }}
                >
                  {o.libelle}
                </button>
              ))}
            </div>

            <div role="tabpanel" className="mt-5">
              {plateforme === 'ios' && (
                <Gestes gestes={[
                  { icone: <Share size={16} />, texte: <>Dans Safari, touchez <b>Partager</b>, en bas de l’écran.</> },
                  { icone: <SquarePlus size={16} />, texte: <>Choisissez <b>Sur l’écran d’accueil</b>.</> },
                  { icone: <span style={{ fontSize: 12, fontWeight: 800 }}>OK</span>, texte: <>Touchez <b>Ajouter</b> : l’icône Horizon apparaît.</> },
                ]} />
              )}
              {plateforme === 'android' && (
                <Gestes gestes={[
                  { icone: <EllipsisVertical size={16} />, texte: <>Dans Chrome, ouvrez le menu <b>⋮</b>, en haut à droite.</> },
                  { icone: <Download size={16} />, texte: <>Touchez <b>Installer l’application</b> ou <b>Ajouter à l’écran d’accueil</b>.</> },
                  { icone: <span style={{ fontSize: 12, fontWeight: 800 }}>OK</span>, texte: <>Confirmez : l’icône Horizon apparaît.</> },
                ]} />
              )}
              {plateforme === 'bureau' && (
                <div className="flex items-center gap-5 rounded-2xl border border-[#E2EEEE] p-4">
                  <div className="flex-shrink-0 rounded-xl bg-white p-2" style={{ boxShadow: 'var(--shadow-sm)' }}>
                    <QRCodeSVG value={urlApp} size={112} fgColor="#1A2332" level="M" aria-label="QR code d’Horizon" />
                  </div>
                  <p className="m-0" style={{ fontSize: 13.5, color: 'var(--color-ink-2)', lineHeight: 1.55 }}>
                    Scannez ce code avec l’appareil photo de votre téléphone pour ouvrir Horizon,
                    puis suivez les gestes de l’onglet <b className="text-ink">iPhone</b> ou <b className="text-ink">Android</b>.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onFermer}
                className="rounded-[10px] text-ink-2 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
                style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600 }}
              >
                Plus tard
              </button>
              <button
                type="button"
                onClick={onInstallee}
                className="rounded-[10px] border-[1.5px] border-teal text-teal-dark transition-colors hover:bg-teal-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
                style={{ padding: '9px 16px', fontSize: 14, fontWeight: 700 }}
              >
                C’est fait, l’application est installée
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Gestes({ gestes }: { gestes: { icone: React.ReactNode; texte: React.ReactNode }[] }) {
  return (
    <ol className="m-0 list-none space-y-3 p-0">
      {gestes.map((g, i) => (
        <li key={i} className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className="relative flex flex-shrink-0 items-center justify-center rounded-xl text-teal-dark"
            style={{ width: 40, height: 40, background: 'var(--color-teal-light)' }}
          >
            {g.icone}
            <span
              className="absolute flex items-center justify-center rounded-full bg-ink text-white"
              style={{ width: 17, height: 17, fontSize: 10, fontWeight: 800, top: -5, left: -5, border: '2px solid white' }}
            >
              {i + 1}
            </span>
          </span>
          <span style={{ fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.45 }}>{g.texte}</span>
        </li>
      ))}
    </ol>
  );
}
