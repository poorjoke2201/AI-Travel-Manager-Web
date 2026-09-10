import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);

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

  return (
    <div className="relative hidden min-w-0 flex-1 md:block md:max-w-xs">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search places or trips" className="w-full rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-indigo" />
      {results && (
        <div className="absolute left-0 right-0 top-11 z-[900] max-h-96 overflow-y-auto rounded-md border border-stone-200 bg-white p-2 shadow-xl">
          {!total && <p className="p-2 text-sm text-ink-500">No matches found.</p>}
          {results.cities.map((city) => <button key={`city-${city}`} type="button" onClick={() => { setQuery(''); setResults(null); navigate(`/explore?query=${encodeURIComponent(city)}`); }} className="block w-full rounded p-2 text-left text-sm hover:bg-stone-50"><span className="text-xs text-ink-400">DESTINATION</span><br />{city}</button>)}
          {[...results.pois, ...results.hotels, ...results.restaurants].slice(0, 8).map((item) => <button key={`${item._id}-${item.name}`} type="button" onClick={() => { setQuery(''); setResults(null); navigate(`/explore?query=${encodeURIComponent(item.city || item.name)}`); }} className="block w-full rounded p-2 text-left text-sm hover:bg-stone-50"><span className="text-xs text-ink-400">{item.category || (item.cuisine ? 'RESTAURANT' : item.pricePerNightInr != null ? 'HOTEL' : 'POI')}</span><br />{item.name}</button>)}
          {results.publicTrips.map((trip) => <button key={trip._id} type="button" onClick={() => { setQuery(''); setResults(null); navigate(`/public-trips/${trip._id}`); }} className="block w-full rounded p-2 text-left text-sm hover:bg-stone-50"><span className="text-xs text-ink-400">PUBLIC TRIP</span><br />{trip.tripName}</button>)}
        </div>
      )}
    </div>
  );
}
