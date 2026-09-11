import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';

export default function CityAutocomplete({ label, name, placeholder, value, onChange, error, required, className = '' }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleInput(e) {
    const val = e.target.value;
    onChange(val);
    setHighlighted(-1);

    clearTimeout(debounceRef.current);
    if (!val.trim()) { setSuggestions([]); setOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/cities/search?q=${encodeURIComponent(val)}`);
        setSuggestions(data.data || []);
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 200);
  }

  function select(city) {
    onChange(city);
    setSuggestions([]);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && highlighted >= 0) { e.preventDefault(); select(suggestions[highlighted]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && <label className="mb-1 block text-sm font-medium text-ink-700">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>}
      <input
        type="text"
        name={name}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length && setOpen(true)}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-indigo-400 ${
          error ? 'border-red-400' : 'border-stone-300'
        }`}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-stone-200 bg-white shadow-lg">
          {suggestions.map((city, i) => (
            <li
              key={city}
              onMouseDown={() => select(city)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === highlighted ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-stone-50'
              }`}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
