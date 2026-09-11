export default function EmptyState({ title, description, action }) {
  return (
    <div className="journal-sheet flex flex-col items-center justify-center gap-3 border-dashed px-6 py-14 text-center">
      <p className="eyebrow">Blank page</p>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}