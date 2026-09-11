import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TripForm from '../components/trip/TripForm';
import TripGenerationLoader from '../components/trip/TripGenerationLoader';
import TripDiscoveryOptions from '../components/trip/TripDiscoveryOptions';
import * as tripService from '../services/tripService';
import { useTrips } from '../hooks/useTrips';

export default function CreateTripPage() {
  const navigate = useNavigate();
  const { upsertTripInCache } = useTrips();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [selectedHotelId, setSelectedHotelId] = useState(null);
  const [selectedTransportMode, setSelectedTransportMode] = useState(null);
  const [error, setError] = useState(null);
  const [headerParallax, setHeaderParallax] = useState({ x: 0, y: 0 });

  async function handleSubmit(payload) {
    setError(null);
    setIsDiscovering(true);
    try {
      const options = await tripService.discoverTripOptions(payload);
      setPendingPayload(payload);
      setDiscovery(options);
      setSelectedHotelId(options.stays[0]?.id || null);
      setSelectedTransportMode(options.transport[0]?.mode || payload.transportPreference);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDiscovering(false);
    }
  }

  async function handleGenerate() {
    setError(null);
    setIsGenerating(true);
    try {
      const trip = await tripService.createAndGenerateTrip({
        ...pendingPayload,
        selectedHotelId,
        selectedTransportMode,
      });
      upsertTripInCache(trip);
      navigate(`/trip/${trip._id}`);
    } catch (err) {
      setError(err.message);
      setIsGenerating(false);
    }
  }

  function handleHeaderParallax(event) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setHeaderParallax({
      x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
      y: ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
    });
  }

  if (isGenerating) {
    return <TripGenerationLoader />;
  }

  if (discovery) {
    return (
      <div className="mx-auto max-w-5xl">
        {error && <p className="mb-4 text-sm text-clay">{error}</p>}
        <TripDiscoveryOptions
          options={discovery}
          selectedHotelId={selectedHotelId}
          selectedTransportMode={selectedTransportMode}
          onHotelChange={setSelectedHotelId}
          onTransportChange={setSelectedTransportMode}
          onBack={() => setDiscovery(null)}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div
        className="mb-10 flex items-center gap-3 border-b border-stone-300 pb-7 sm:gap-5"
        onMouseMove={handleHeaderParallax}
        onMouseLeave={() => setHeaderParallax({ x: 0, y: 0 })}
      >
        <div className="max-w-2xl">
          <p className="eyebrow">New journal page / 01</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Where are we going?</h1>
          <p className="mt-3 max-w-xl text-ink-500">
            Tell us what sounds good. We&apos;ll shape the first draft of a journey around it.
          </p>
        </div>
        <img
          src="/assets/ephemera/compass.webp"
          alt=""
          className="hidden h-36 w-36 shrink-0 object-contain drop-shadow-md transition-transform duration-300 sm:block"
          style={{ transform: `translate(${headerParallax.x * 9}px, ${headerParallax.y * 7}px) rotate(${headerParallax.x * 4}deg)` }}
        />
      </div>
      <TripForm onSubmit={handleSubmit} isSubmitting={isDiscovering} submitError={error} />
    </div>
  );
}