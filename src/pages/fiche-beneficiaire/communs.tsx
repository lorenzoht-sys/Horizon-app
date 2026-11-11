

// ── Section label ─────────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">
      {children}
    </div>
  );
}

// ── TabsSection ───────────────────────────────────────────────────────────────

export type TabId = 'bilans' | 'contrats' | 'cours' | 'assiduite' | 'documents' | 'rappels';
