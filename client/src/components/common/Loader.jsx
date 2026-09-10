export default function Loader({ label = 'Loading...', size = 'md' }) {
  const dimension = size === 'sm' ? 'h-4 w-4 border-2' : 'h-8 w-8 border-[3px]';
  return (
    <div className="journal-sheet flex flex-col items-center justify-center gap-3 px-6 py-12 text-ink-500">
      <span
        className={`${dimension} animate-spin rounded-full border-stone-300 border-t-ocean`}
        aria-hidden="true"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}