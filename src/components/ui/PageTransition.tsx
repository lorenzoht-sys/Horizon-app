import { motion } from 'framer-motion';

// Opacité seule, volontairement sans `y` (translateY) : un ancêtre avec
// `transform` — même une transform identité posée en continu par
// framer-motion — casse silencieusement le drag-and-drop HTML5 natif sous
// Chromium (dragstart ne se déclenche jamais sur les descendants
// draggable). Toutes les routes passent par ce composant, donc le bug
// touchait potentiellement toute page utilisant draggable, pas seulement
// la bibliothèque d'exercices.
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
};

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      // `minHeight` et non `height` : un `height: 100%` fixe empêchait le
      // conteneur défilant partagé (App.tsx, DesktopContent) de compter son
      // propre `padding-bottom` (barre de navigation mobile) dans son
      // scrollHeight — bug de recouvrement en bas des pages fusionnées sous
      // 768px (chantier « barre de navigation mobile qui recouvre le bas des
      // pages fusionnées »). Repro isolée : un enfant `height:100%` dans un
      // parent `overflow-y:auto` fait ignorer le padding-bottom du parent
      // dans son scrollHeight ; `min-height:100%` ne reproduit pas le bug,
      // tout en gardant le même comportement « remplit la hauteur dispo »
      // pour les pages qui s'appuient dessus (h-full : ParticipantProfile,
      // SettingsPage, TourneePage, StatsPage, Dashboard).
      style={{ width: '100%', minHeight: '100%' }}
    >
      {children}
    </motion.div>
  );
}
