// Installation de l'application (PWA) : capture de l'invite native du navigateur.
//
// ── Pourquoi un module et pas un écouteur dans le composant ─────────────────
// Chrome et Edge n'émettent `beforeinstallprompt` qu'UNE fois, au chargement.
// Un composant monté plus tard (la fenêtre d'installation du guide de
// démarrage) l'aurait manqué. On l'écoute donc dès l'import de ce module
// (src/main.tsx) et on garde l'invite pour plus tard.
//
// Safari (iPhone, iPad, Mac) n'a pas d'invite : on y affiche la marche à suivre.
import { estInstalleeSurEcranAccueil, estIOS } from './push';

interface InviteInstallation extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let invite: InviteInstallation | null = null;
let installee = false;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach(f => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    // Pas de preventDefault : on laisse le navigateur proposer sa propre
    // bannière s'il le souhaite, on garde seulement la possibilité de l'appeler.
    invite = e as InviteInstallation;
    prevenir();
  });
  window.addEventListener('appinstalled', () => {
    installee = true;
    invite = null;
    prevenir();
  });
}

export function abonnerInstallation(f: () => void): () => void {
  abonnes.add(f);
  return () => { abonnes.delete(f); };
}

export function inviteNativeDisponible(): boolean {
  return invite !== null;
}

export function applicationInstalleeIci(): boolean {
  return installee || (typeof window !== 'undefined' && estInstalleeSurEcranAccueil());
}

/** Ouvre l'invite native. Renvoie true si le praticien a accepté. */
export async function lancerInstallation(): Promise<boolean> {
  if (!invite) return false;
  const courante = invite;
  invite = null;
  await courante.prompt();
  const { outcome } = await courante.userChoice;
  if (outcome === 'accepted') installee = true;
  prevenir();
  return outcome === 'accepted';
}

export type Plateforme = 'ios' | 'android' | 'bureau';

export function plateformeCourante(): Plateforme {
  if (typeof navigator === 'undefined') return 'bureau';
  if (estIOS()) return 'ios';
  if (/Android/i.test(navigator.userAgent)) return 'android';
  return 'bureau';
}
