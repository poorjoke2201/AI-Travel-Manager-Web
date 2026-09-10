import { useCallback, useContext, useState } from 'react';
import { TripContext } from '../context/TripContext';
import * as tripService from '../services/tripService';

export function useTrips() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrips must be used within a TripProvider');
  return ctx;
}

/** Fetch/mutate a single trip by id - used by TripDetailsPage, kept separate from the list cache. */
export function useTrip(tripId) {
  const { upsertTripInCache, removeTripFromCache } = useTrips();
  const [trip, setTrip] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTrip = useCallback(async () => {
    if (!tripId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await tripService.getTrip(tripId);
      setTrip(data);
      upsertTripInCache(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [tripId, upsertTripInCache]);

  const regenerate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await tripService.regenerateTrip(tripId);
      setTrip(data);
      upsertTripInCache(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [tripId, upsertTripInCache]);

  const update = useCallback(
    async (updates) => {
      const data = await tripService.updateTrip(tripId, updates);
      setTrip(data);
      upsertTripInCache(data);
      return data;
    },
    [tripId, upsertTripInCache]
  );

  const remove = useCallback(async () => {
    await tripService.deleteTrip(tripId);
    removeTripFromCache(tripId);
  }, [tripId, removeTripFromCache]);

  const replaceActivity = useCallback(async (day, activityIndex, strategy) => {
    const data = await tripService.replaceItineraryActivity(tripId, day, activityIndex, strategy);
    setTrip(data);
    upsertTripInCache(data);
    return data;
  }, [tripId, upsertTripInCache]);

  return { trip, isLoading, error, fetchTrip, regenerate, update, replaceActivity, remove };
}