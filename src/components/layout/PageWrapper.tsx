import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
}

export default function PageWrapper({ children, className = '' }: Props) {
  return (
    <main className={`max-w-7xl mx-auto px-4 py-6 ${className}`}>
      {children}
    </main>
  );
}
