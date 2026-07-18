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
      style={{ width: '100%', height: '100%' }}
    >
      {children}
    </motion.div>
  );
}
