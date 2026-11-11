import { type TabId } from './communs';

// ── Types assiduité ───────────────────────────────────────────────────────────

// SeancePatientStat : voir src/lib/suiviBeneficiaire.ts

export function TabsSection({ activeTab, setActiveTab, tabs, children }: {
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
  tabs: { id: TabId; label: string; count?: number }[];
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm">
      {/* Tab bar */}
      {/* Défilement horizontal sur téléphone : les quatre onglets n'y tiennent pas. */}
      <div className="flex border-b border-gray-200/60 px-2 sm:px-4 overflow-x-auto scrollbar-hide">
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-shrink-0 items-center gap-2 px-3 py-3.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
                active ? 'text-[#2BBFBF]' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#E1F5EE', color: '#0F6E56' }}>
                  {tab.count}
                </span>
              )}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--color-teal)' }} />
              )}
            </button>
          );
        })}
      </div>
      {/* Tab content */}
      <div className="p-3 sm:p-5">
        {children}
      </div>
    </div>
  );
}
