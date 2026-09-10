import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DayItinerary from '../components/itinerary/DayItinerary';
import ItineraryMap from '../components/itinerary/ItineraryMap';
import Loader from '../components/common/Loader';
import ErrorMessage from '../components/common/ErrorMessage';
import * as publicTripService from '../services/publicTripService';
import { formatDateRange } from '../utils/dateUtils';
import { formatInr, pluralize } from '../utils/formatters';

export default function PublicTripDetailsPage() {
  const { id } = useParams();
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');

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
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link to="/public-trips" className="text-sm font-semibold text-indigo hover:underline">Back to public trips</Link>
      <header className="mt-5 border-b border-stone-300 pb-6">
        <p className="text-sm text-ink-500">Shared by {trip.userId?.username || 'a traveller'}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink">{trip.tripName}</h1>
        <p className="mt-2 text-ink-500">{trip.origin} → {trip.destination}</p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-ink-500">
          <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
          <span>{pluralize(trip.numberOfDays, 'day')}</span>
          <span>{trip.budget ? formatInr(trip.budget) : 'No budget set'}</span>
        </div>
      </header>

      <div className="mt-6 space-y-6">
        {trip.itinerary?.length ? (
          <>
            <ItineraryMap days={trip.itinerary} />
            {trip.itinerary.map((day) => <DayItinerary key={day.day} day={day} />)}
          </>
        ) : (
          <p className="text-ink-500">This shared trip has no itinerary yet.</p>
        )}
      </div>
    </div>
  );
}
