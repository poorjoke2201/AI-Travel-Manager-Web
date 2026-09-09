import { createContext, useCallback, useState } from 'react';
import * as tripService from '../services/tripService';

export const TripContext = createContext(null);

export function TripProvider({ children }) {
  const [trips, setTrips] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshTrips = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await tripService.listTrips();
      setTrips(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Optimistically merges a single trip (e.g. after generate/update) into the cached list. */
  const upsertTripInCache = useCallback((trip) => {
    setTrips((prev) => {
      const idx = prev.findIndex((t) => t._id === trip._id);
      if (idx === -1) return [trip, ...prev];
      const next = [...prev];
      next[idx] = trip;
      return next;
    });
  }, []);

  const removeTripFromCache = useCallback((tripId) => {
    setTrips((prev) => prev.filter((t) => t._id !== tripId));
  }, []);

  const value = { trips, isLoading, error, refreshTrips, upsertTripInCache, removeTripFromCache };

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}