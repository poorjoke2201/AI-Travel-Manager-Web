export default function Input({ label, id, error, hint, className = '', ...rest }) {
  const inputId = id || rest.name;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink-700">
          {label}
        </label>
      )}
      <input id={inputId} className="input-field" {...rest} />
      {hint && !error && <p className="mt-1 text-sm text-ink-500">{hint}</p>}
      {error && <p className="mt-1 text-sm text-clay">{error}</p>}
    </div>
  );
}