import { motion } from 'framer-motion';

interface FadeInCardProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function FadeInCard({ children, delay = 0, className }: FadeInCardProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.25, 0.1, 0.25, 1] as const }}
    >
      {children}
    </motion.div>
  );
}
