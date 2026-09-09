import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TripForm from '../components/trip/TripForm';
import TripGenerationLoader from '../components/trip/TripGenerationLoader';
import * as tripService from '../services/tripService';
import { useTrips } from '../hooks/useTrips';

export default function CreateTripPage() {
  const navigate = useNavigate();
  const { upsertTripInCache } = useTrips();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(payload) {
    setError(null);
    setIsGenerating(true);
    try {
      const trip = await tripService.createAndGenerateTrip(payload);
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

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 font-display text-3xl font-semibold">Create a trip</h1>
      <p className="mb-8 text-ink-500">
        Tell us about your trip and we'll put together pre-trip guidance, transport options, and a full itinerary.
      </p>
      <TripForm onSubmit={handleSubmit} isSubmitting={isGenerating} submitError={error} />
    </div>
  );
}