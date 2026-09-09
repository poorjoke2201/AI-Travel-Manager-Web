import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ItineraryHeader from '../components/itinerary/ItineraryHeader';
import ItineraryTabs from '../components/itinerary/ItineraryTabs';
import PreTripSection from '../components/itinerary/PreTripSection';
import TransportSection from '../components/itinerary/TransportSection';
import DayItinerary from '../components/itinerary/DayItinerary';
import ItineraryMap from '../components/itinerary/ItineraryMap';
import HotelCard from '../components/itinerary/HotelCard';
import Loader from '../components/common/Loader';
import ErrorMessage from '../components/common/ErrorMessage';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';
import { useTrip } from '../hooks/useTrips';

export default function TripDetailsPage({ initialTab = 'overview' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { trip, isLoading, error, fetchTrip, regenerate, remove } = useTrip(id);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      await regenerate();
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleDelete() {
    await remove();
    navigate('/dashboard');
  }

  if (isLoading && !trip) return <Loader label="Loading trip..." />;
  if (error && !trip) return <ErrorMessage message={error} onRetry={fetchTrip} />;
  if (!trip) return null;

  return (
    <div>
      <ItineraryHeader
        trip={trip}
        onRegenerate={handleRegenerate}
        onDelete={() => setShowDeleteConfirm(true)}
        isRegenerating={isRegenerating}
      />
      <ItineraryTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {trip.recommendedHotel && <HotelCard hotel={trip.recommendedHotel} />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryStat label="Place interests" value={trip.placePreferences.join(', ') || 'None specified'} />
            <SummaryStat label="Food preferences" value={trip.foodPreferences.join(', ') || 'None specified'} />
            <SummaryStat label="Pace" value={trip.pace} />
          </div>
        </div>
      )}

      {activeTab === 'pre-trip' && <PreTripSection preTrip={trip.preTrip} />}
      {activeTab === 'transport' && <TransportSection transport={trip.transport} />}

      {activeTab === 'itinerary' && (
        <div className="space-y-6">
          {trip.itinerary?.length ? (
            trip.itinerary.map((day) => <DayItinerary key={day.day} day={day} />)
          ) : (
            <p className="text-ink-500">No itinerary generated yet.</p>
          )}
        </div>
      )}

      {activeTab === 'map' && <ItineraryMap days={trip.itinerary} />}

      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete this trip?">
        <p className="mb-6 text-sm text-ink-500">
          This will permanently remove "{trip.tripName}" and everything generated for it. This can't be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
            Cancel
          </Button>
          <Button onClick={handleDelete} className="!bg-clay hover:!bg-clay-600">
            Delete trip
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function SummaryStat({ label, value }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-1 font-semibold capitalize text-ink">{value}</p>
    </div>
  );
}