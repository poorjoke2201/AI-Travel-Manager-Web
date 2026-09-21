import { createContext, useContext, useMemo, useState } from 'react';

const TripViewContext = createContext(null);

export function TripViewProvider({ children }) {
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [hoveredStopId, setHoveredStopId] = useState(null);
  const [showOtherDays, setShowOtherDays] = useState(true);
  const [mobileView, setMobileView] = useState('list');

  const value = useMemo(
    () => ({
      selectedDay,
      setSelectedDay,
      selectedStopId,
      setSelectedStopId,
      hoveredStopId,
      setHoveredStopId,
      showOtherDays,
      setShowOtherDays,
      mobileView,
      setMobileView,
    }),
    [selectedDay, selectedStopId, hoveredStopId, showOtherDays, mobileView]
  );

  return <TripViewContext.Provider value={value}>{children}</TripViewContext.Provider>;
}

export function useTripView() {
  const ctx = useContext(TripViewContext);
  if (!ctx) throw new Error('useTripView must be used within TripViewProvider');
  return ctx;
}
