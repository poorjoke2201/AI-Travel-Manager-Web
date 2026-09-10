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
      <div className="mb-10 flex items-end justify-between gap-6 border-b border-stone-300 pb-7">
        <div>
          <p className="eyebrow">New journal page / 01</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Where are we going?</h1>
          <p className="mt-3 max-w-xl text-ink-500">
            Tell us what sounds good. We&apos;ll shape the first draft of a journey around it.
          </p>
        </div>
        <img src="/assets/illustrations/compass.svg" alt="" className="hidden h-20 w-20 opacity-70 sm:block" />
      </div>
      <TripForm onSubmit={handleSubmit} isSubmitting={isDiscovering} submitError={error} />
    </div>
  );
}