

// ── Types ─────────────────────────────────────────────────────────────────────


// ── Composants UI ──────────────────────────────────────────────────────────────

export function SectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{title}</h2>
      <div className="h-px bg-gray-100" />
    </div>
  );
}

export function Field({
  label, required, error, children,
}: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

export function inputClass(error?: string) {
  return `w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors font-sans ${
    error
      ? 'border-red-300 bg-red-light/40 focus:border-red-400 focus:ring-red-100'
      : 'border-gray-200 bg-white focus:border-primary focus:ring-primary/10'
  }`;
}
