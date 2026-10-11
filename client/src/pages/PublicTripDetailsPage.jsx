import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DayItinerary from '../components/itinerary/DayItinerary';
import ItineraryMap from '../components/itinerary/ItineraryMap';
import ActivityPhotoGallery from '../components/itinerary/ActivityPhotoGallery';
import Loader from '../components/common/Loader';
import ErrorMessage from '../components/common/ErrorMessage';
import * as publicTripService from '../services/publicTripService';
import { formatDateRange } from '../utils/dateUtils';
import { formatInr, pluralize } from '../utils/formatters';

export default function PublicTripDetailsPage() {
  const { id } = useParams();
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [photoGallery, setPhotoGallery] = useState(null);

  useEffect(() => {
    let active = true;
    publicTripService.getPublicTrip(id)
      .then((data) => { if (active) setTrip(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id]);

  if (error) return <ErrorMessage message={error} />;
  if (!trip) return <Loader label="Loading shared trip..." />;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link to="/public-trips" className="text-sm font-semibold text-ocean-700 hover:underline">Back to the community wall</Link>
      <header className="journal-sheet relative mt-5 overflow-hidden p-6 sm:p-10">
        <img src="/assets/ephemera/tickets.webp" alt="" className="pointer-events-none absolute -right-8 -top-8 h-44 w-64 rotate-6 object-contain opacity-20" />
        <div className="relative">
          <p className="eyebrow">A shared page / postcard story</p>
          <p className="mt-3 text-sm text-ink-500">Shared by {trip.userId?.username || 'a traveller'}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-ink sm:text-5xl">{trip.tripName}</h1>
          <p className="mt-3 text-ocean-700">{trip.origin} to {trip.destination}</p>
        </div>
        <div className="relative mt-7 grid grid-cols-2 gap-4 border-t border-stone-200 pt-5 text-sm text-ink-500 sm:grid-cols-3">
          <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
          <span>{pluralize(trip.numberOfDays, 'day')}</span>
          <span>{trip.budget ? formatInr(trip.budget) : 'No budget set'}</span>
        </div>
      </header>

      <div className="mt-8 space-y-6">
        {trip.itinerary?.length ? (
          <>
            <ItineraryMap
              days={trip.itinerary}
              selectedDay={selectedDay}
              onSelectDay={(day) => {
                setSelectedDay(day);
                setSelectedStopId(null);
              }}
              accommodation={trip.recommendedHotel}
              selectedStopId={selectedStopId}
              onSelectStop={setSelectedStopId}
              onOpenPhotos={(activity, initialIndex = 0) => setPhotoGallery({ activity, initialIndex })}
              destination={trip.destination}
              backTo={`/public-trips/${trip._id}`}
            />
            {trip.itinerary.map((day) => (
              <DayItinerary
                key={day.day}
                day={day}
                onSelectActivity={(stopId, activityDay) => {
                  setSelectedDay(activityDay);
                  setSelectedStopId(stopId);
                }}
                onOpenPhotos={(activity, initialIndex = 0) => setPhotoGallery({ activity, initialIndex })}
                backTo={`/public-trips/${trip._id}`}
                destination={trip.destination}
              />
            ))}
          </>
        ) : (
          <p className="text-ink-500">This shared trip has no itinerary yet.</p>
        )}
      </div>
      {photoGallery && (
        <ActivityPhotoGallery
          key={`${photoGallery.activity.refId || photoGallery.activity.name}-${photoGallery.initialIndex}`}
          activity={photoGallery.activity}
          initialIndex={photoGallery.initialIndex}
          onClose={() => setPhotoGallery(null)}
        />
      )}
    </div>
  );
}
