import { useEffect, useMemo, useState } from 'react';
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
import BudgetSection from '../components/itinerary/BudgetSection';
import { useTrip } from '../hooks/useTrips';
import { FEATURE_FLAGS } from '../config/features';
import { TripViewProvider, useTripView } from '../context/TripViewContext';

export default function TripDetailsPage({ initialTab = 'overview' }) {
  return (
    <TripViewProvider>
      <TripDetailsContent initialTab={initialTab} />
    </TripViewProvider>
  );
}

function TripDetailsContent({ initialTab = 'overview' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { trip, isLoading, error, fetchTrip, regenerate, replaceActivity, remove } = useTrip(id);
  const { selectedDay, setSelectedDay, setSelectedStopId } = useTripView();
  const [activeTab, setActiveTab] = useState(initialTab);
  const showMemberTab = FEATURE_FLAGS.FEATURE_GROUP_TRIPS && Boolean(trip?.isGroupTrip || trip?.groupMembers?.length);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  useEffect(() => {
    function handleAssistantUpdate(event) {
      if (!event.detail?.tripId || event.detail.tripId === id) fetchTrip();
    }

    window.addEventListener('travel-assistant-trip-updated', handleAssistantUpdate);
    return () => window.removeEventListener('travel-assistant-trip-updated', handleAssistantUpdate);
  }, [fetchTrip, id]);

  useEffect(() => {
    if (!trip?.itinerary?.length) return;
    const maxDay = trip.itinerary.at(-1)?.day || 1;
    if (selectedDay > maxDay) setSelectedDay(maxDay);
  }, [trip, selectedDay, setSelectedDay]);

  const itineraryView = useMemo(() => {
    if (!trip?.itinerary?.length) return null;
    return { day: trip.itinerary.find((d) => d.day === selectedDay) || trip.itinerary[0] };
  }, [trip, selectedDay]);

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
      <ItineraryTabs activeTab={activeTab} onChange={setActiveTab} showMemberTab={showMemberTab} />

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {trip.overview && (
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">Trip overview</p>
              <p className="mt-3 text-xl font-semibold text-ink">{trip.overview}</p>
            </div>
          )}

          {trip.recommendedHotel && <HotelCard hotel={trip.recommendedHotel} />}

          {trip.budgetSummary && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryStat label="Accommodation" value={trip.budgetSummary.accommodationInr ? `₹${trip.budgetSummary.accommodationInr.toLocaleString()}` : 'Not estimated'} />
              <SummaryStat label="Intercity travel" value={trip.budgetSummary.intercityInr ? `₹${trip.budgetSummary.intercityInr.toLocaleString()}` : 'Not estimated'} />
              <SummaryStat label="Intracity travel" value={trip.budgetSummary.intracityInr ? `₹${trip.budgetSummary.intracityInr.toLocaleString()}` : 'Not estimated'} />
              <SummaryStat label="Trip total" value={trip.budgetSummary.totalEstimatedInr ? `₹${trip.budgetSummary.totalEstimatedInr.toLocaleString()}` : 'Not estimated'} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryStat label="Place interests" value={trip.placePreferences.join(', ') || 'None specified'} />
            <SummaryStat label="Food preferences" value={trip.foodPreferences.join(', ') || 'None specified'} />
            <SummaryStat label="Pace" value={trip.pace} />
          </div>
        </div>
      )}

      {activeTab === 'pre-trip' && <PreTripSection preTrip={trip.preTrip} />}
      {activeTab === 'transport' && <TransportSection transport={trip.transport} intercityTransport={trip.intercityTransport} intracityTransport={trip.intracityTransport} />}

      {activeTab === 'itinerary' && (
        FEATURE_FLAGS.FEATURE_SPLIT_VIEW ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.45fr)]">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" className="tag-chip tag-chip-active">All days</button>
                {trip.itinerary?.map((day) => (
                  <button
                    key={day.day}
                    type="button"
                    onClick={() => { setSelectedDay(day.day); setSelectedStopId(null); }}
                    className={`tag-chip ${selectedDay === day.day ? 'tag-chip-active' : ''}`}
                  >
                    Day {day.day}
                  </button>
                ))}
              </div>
              {itineraryView ? (
                <DayItinerary day={itineraryView.day} onReplaceActivity={replaceActivity} />
              ) : (
                <p className="text-ink-500">No itinerary generated yet.</p>
              )}
            </div>
            <div className="min-h-[420px] xl:sticky xl:top-4">
              <ItineraryMap days={trip.itinerary || []} selectedDay={selectedDay} onSelectDay={setSelectedDay} accommodation={trip.recommendedHotel} />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {trip.itinerary?.length ? (
              trip.itinerary.map((day) => <DayItinerary key={day.day} day={day} onReplaceActivity={replaceActivity} />)
            ) : (
              <p className="text-ink-500">No itinerary generated yet.</p>
            )}
          </div>
        )
      )}

      {activeTab === 'map' && <ItineraryMap days={trip.itinerary || []} selectedDay={selectedDay} onSelectDay={setSelectedDay} accommodation={trip.recommendedHotel} />}
      {activeTab === 'member' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Trip members</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">Shared travel crew</h2>
            </div>
          </div>
          {trip.groupMembers?.length ? (
            <div className="space-y-3">
              {trip.groupMembers.map((member, index) => (
                <div key={`${member.userId ?? member.phoneNumber ?? index}`} className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 p-3">
                  <div>
                    <p className="font-medium text-ink">{member.name || member.phoneNumber || 'Traveller'}</p>
                    <p className="text-xs text-ink-500">{member.email || member.phoneNumber || 'Pending invite'}</p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium capitalize text-ink ring-1 ring-stone-300">
                    {member.status || 'invited'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-ink-500">No companions added to this trip yet.</p>
          )}
        </div>
      )}
      {activeTab === 'budget' && <BudgetSection tripId={id} />}

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