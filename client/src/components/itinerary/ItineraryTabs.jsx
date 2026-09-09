const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'pre-trip', label: 'Pre-Trip' },
  { key: 'transport', label: 'Travel' },
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'map', label: 'Map' },
];

export default function ItineraryTabs({ activeTab, onChange }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-stone-300">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === tab.key
              ? 'border-indigo text-indigo'
              : 'border-transparent text-ink-500 hover:text-ink'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}