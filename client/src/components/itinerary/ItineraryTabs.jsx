export default function ItineraryTabs({ activeTab, onChange, showMemberTab = false }) {
  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'pre-trip', label: 'Pre-Trip' },
    { key: 'transport', label: 'Travel' },
    { key: 'itinerary', label: 'Itinerary' },
    { key: 'map', label: 'Map' },
    ...(showMemberTab ? [{ key: 'member', label: 'Member' }] : []),
    { key: 'budget', label: 'Budget' },
  ];

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-stone-300" aria-label="Trip journal sections">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === tab.key
              ? 'border-clay text-clay-600'
              : 'border-transparent text-ink-500 hover:border-stone-300 hover:text-ink'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}