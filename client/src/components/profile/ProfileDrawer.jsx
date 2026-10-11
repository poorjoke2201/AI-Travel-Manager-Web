import { useEffect } from 'react';

export default function ProfileDrawer({ isOpen, onClose, title, children }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close drawer" className="absolute inset-0 h-full w-full bg-ink/40" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={title} className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-stone-300 bg-stone-50 p-5 shadow-elevated sm:p-8">
        <div className="mb-6 flex items-center justify-between border-b border-stone-200 pb-4">
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <button type="button" aria-label="Close drawer" onClick={onClose} className="rounded-full border border-stone-300 px-3 py-1 text-ink-500 hover:bg-stone-100">Close</button>
        </div>
        {children}
      </aside>
    </div>
  );
}
