import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    function handlePointerDown(event) {
      if (!searchRef.current?.contains(event.target)) setIsOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) { setResults(null); return undefined; }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/search', { params: { q: clean } });
        setResults(data.data);
      } catch { setResults(null); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const total = results ? results.cities.length + results.pois.length + results.hotels.length + results.restaurants.length + results.publicTrips.length : 0;

  function submitSearch(event) {
    event.preventDefault();
    const clean = query.trim();
    if (clean) navigate(`/explore?query=${encodeURIComponent(clean)}`);
  }

  function closeSearch() {
    setIsOpen(false);
    setResults(null);
  }

  return (
    <div ref={searchRef} className={`global-search ${isOpen ? 'global-search-open' : ''}`}>
      <form onSubmit={submitSearch} className="global-search-form">
        <div className="global-search-input-wrap">
          <span className="global-search-mark" aria-hidden="true" />
          <input
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search places or trips"
            aria-label="Search places or trips"
            autoComplete="off"
            className="global-search-input"
          />
        </div>
        <button type="button" onClick={() => (isOpen ? closeSearch() : setIsOpen(true))} className="global-search-button" aria-label={isOpen ? 'Close search' : 'Open search'}>
          <span className="global-search-icon" aria-hidden="true" />
        </button>
      </form>
      {results && (
        <div className="global-search-results">
          {!total && <p className="p-2 text-sm text-ink-500">No matches found.</p>}
          {results.cities.map((city) => <button key={`city-${city}`} type="button" onClick={() => { setQuery(''); closeSearch(); navigate(`/explore?query=${encodeURIComponent(city)}`); }} className="global-search-result"><span>DESTINATION</span><br />{city}</button>)}
          {[...results.pois, ...results.hotels, ...results.restaurants].slice(0, 8).map((item) => <button key={`${item._id}-${item.name}`} type="button" onClick={() => { setQuery(''); closeSearch(); navigate(`/explore?query=${encodeURIComponent(item.city || item.name)}`); }} className="global-search-result"><span>{item.category || (item.cuisine ? 'RESTAURANT' : item.pricePerNightInr != null ? 'HOTEL' : 'POI')}</span><br />{item.name}</button>)}
          {results.publicTrips.map((trip) => <button key={trip._id} type="button" onClick={() => { setQuery(''); closeSearch(); navigate(`/public-trips/${trip._id}`); }} className="global-search-result"><span>PUBLIC TRIP</span><br />{trip.tripName}</button>)}
        </div>
      )}
    </div>
  );
}
