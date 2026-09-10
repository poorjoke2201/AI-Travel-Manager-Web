import { formatInr, formatRating } from '../../utils/formatters';

export default function TripDiscoveryOptions({ options, selectedHotelId, selectedTransportMode, onHotelChange, onTransportChange, onBack, onGenerate, isGenerating }) {
  return (
    <div className="space-y-6">
      <section className="journal-sheet relative overflow-hidden p-6 sm:p-8">
        <img src="/assets/ephemera/passport-stamp.webp" alt="" className="absolute -right-3 -top-5 h-28 w-28 rotate-12 opacity-25" />
        <div className="relative mb-5">
          <p className="eyebrow">Destination search complete</p>
          <h2 className="mt-2 font-display text-3xl font-semibold">Choose the building blocks</h2>
          <p className="mt-1 text-sm text-ink-500">These options were matched to your destination and preferences. Prices and transport availability are estimates.</p>
        </div>
        <div className="relative grid gap-3 sm:grid-cols-3">
          <Metric label="Places found" value={options.places.length} />
          <Metric label="Stays found" value={options.stays.length} />
          <Metric label="Travel options" value={options.transport.length} />
        </div>
      </section>

      <OptionGroup title="Where would you like to stay?" description="The selected accommodation becomes the itinerary base when it has a mapped location.">
        <div className="grid gap-3 md:grid-cols-2">
          {options.stays.map((stay, index) => (
            <label key={stay.id} className={`relative cursor-pointer border p-4 transition-all ${selectedHotelId === stay.id ? 'border-ocean bg-ocean-100 shadow-paper' : 'border-stone-300 bg-stone-50 hover:-translate-y-0.5'}`}>
              <input className="sr-only" type="radio" name="stay" checked={selectedHotelId === stay.id} onChange={() => onHotelChange(stay.id)} />
              <span className="block pr-8 font-display text-lg font-semibold text-ink">{stay.name}</span>
              <span className="mt-1 block text-sm text-ink-500">{stay.pricePerNightInr ? `${formatInr(stay.pricePerNightInr)}/night` : 'Price unavailable'}{stay.googleRating != null ? ` · ${formatRating(stay.googleRating)}` : ''}</span>
              <span className="absolute right-3 top-3 font-display text-xs text-clay">STAY 0{index + 1}</span>
            </label>
          ))}
        </div>
      </OptionGroup>

      <OptionGroup title="How do you want to travel?" description="Transport suggestions are not live bookings.">
        <div className="grid gap-3 md:grid-cols-2">
          {options.transport.map((option, index) => (
            <label key={`${option.mode}-${index}`} className={`relative cursor-pointer border p-4 transition-all ${selectedTransportMode === option.mode ? 'border-ocean bg-ocean-100 shadow-paper' : 'border-stone-300 bg-stone-50 hover:-translate-y-0.5'}`}>
              <input className="sr-only" type="radio" name="transport" checked={selectedTransportMode === option.mode} onChange={() => onTransportChange(option.mode)} />
              <span className="block pr-8 font-display text-lg font-semibold capitalize text-ink">{option.mode}</span>
              <span className="mt-1 block text-sm text-ink-500">{option.summary}</span>
              <span className="mt-2 block text-xs text-ink-400">{option.distanceKm ? `${option.distanceKm.toFixed(1)} km · ` : ''}{option.approxDurationHrs ? `${option.approxDurationHrs.toFixed(1)} hrs` : 'duration unavailable'} · estimated</span>
              <span className="absolute right-3 top-3 font-display text-xs text-clay">TICKET</span>
            </label>
          ))}
        </div>
      </OptionGroup>

      <OptionGroup title="Places discovered for your itinerary" description="The planner will select from these places based on distance, timing, interests, and pace.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {options.places.map((place) => <div key={place.id} className="rounded-xs border border-stone-200 bg-white p-3"><p className="font-semibold text-ink">{place.name}</p><p className="mt-1 text-xs text-ink-500">{place.category || 'Point of interest'}{place.googleRating != null ? ` · ${formatRating(place.googleRating)}` : ''}</p></div>)}
        </div>
      </OptionGroup>

      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" onClick={onBack} className="tag-chip">Edit preferences</button>
        <button type="button" onClick={onGenerate} disabled={isGenerating} className="btn-primary">{isGenerating ? 'Building itinerary...' : 'Build my itinerary'}</button>
      </div>
    </div>
  );
}

function OptionGroup({ title, description, children }) {
  return <section className="journal-sheet p-6 sm:p-8"><p className="eyebrow">Next choice</p><h2 className="mt-2 text-xl font-semibold text-ink">{title}</h2><p className="mb-4 mt-1 text-sm text-ink-500">{description}</p>{children}</section>;
}

function Metric({ label, value }) {
  return <div className="border-l-2 border-clay bg-stone-50 p-3"><p className="text-2xl font-semibold text-ink">{value}</p><p className="text-xs text-ink-500">{label}</p></div>;
}
