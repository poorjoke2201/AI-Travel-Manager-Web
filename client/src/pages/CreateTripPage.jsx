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
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 font-display text-3xl font-semibold">Create a trip</h1>
      <p className="mb-8 text-ink-500">
        Tell us about your trip and we'll put together pre-trip guidance, transport options, and a full itinerary.
      </p>
      <TripForm onSubmit={handleSubmit} isSubmitting={isDiscovering} submitError={error} />
    </div>
  );
}