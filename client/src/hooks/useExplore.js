import { useCallback, useState } from 'react';
import * as exploreService from '../services/exploreService';

export function useExplore() {
  const [results, setResults] = useState({ coordinates: null, pois: [], hotels: [], restaurants: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = useCallback(async (query, radius) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await exploreService.searchDestination(query, radius);
      setResults(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadNearby = useCallback(async ({ lat, lng, radius, type }) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await exploreService.nearby({ lat, lng, radius, type });
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { results, isLoading, error, search, loadNearby };
}