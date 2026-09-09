const SECTIONS = [
  { key: 'essentials', label: 'Essentials' },
  { key: 'clothing', label: 'Clothing' },
  { key: 'destinationSpecific', label: 'Destination-specific' },
];

export default function PackingChecklist({ checklist }) {
  if (!checklist) return null;
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      {SECTIONS.map(({ key, label }) => (
        <div key={key}>
          <h3 className="mb-2 font-semibold text-ink">{label}</h3>
          <ul className="space-y-1.5 text-sm text-ink-500">
            {(checklist[key] || []).map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-marigold" />
                {item}
              </li>
            ))}
            {!checklist[key]?.length && <li className="text-ink-300">Nothing listed.</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}