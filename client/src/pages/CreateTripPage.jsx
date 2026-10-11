import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TripForm from '../components/trip/TripForm';
import TripGenerationLoader from '../components/trip/TripGenerationLoader';
import TripDiscoveryOptions from '../components/trip/TripDiscoveryOptions';
import Loader from '../components/common/Loader';
import ErrorMessage from '../components/common/ErrorMessage';
import * as tripService from '../services/tripService';
import * as profileService from '../services/profileService';
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
  const [selectedPlaces, setSelectedPlaces] = useState([]);
  const [error, setError] = useState(null);
  const [headerParallax, setHeaderParallax] = useState({ x: 0, y: 0 });
  const [savedPreferences, setSavedPreferences] = useState(null);
  const [preferencesError, setPreferencesError] = useState('');

  useEffect(() => {
    let active = true;
    profileService.getProfile()
      .then((profile) => {
        if (active) setSavedPreferences(profile.preferences || {});
      })
      .catch((loadError) => {
        if (active) {
          setPreferencesError(loadError.message || 'Saved preferences could not be loaded.');
          setSavedPreferences({});
        }
      });
    return () => { active = false; };
  }, []);

  function normalizeSelectedPlaces(places = []) {
    return places.map((place) => ({
      refId: String(place.id),
      type: 'poi',
      name: place.name,
      source: place.source || 'dataset',
    }));
  }

  async function handleSubmit(payload) {
    setError(null);
    setIsDiscovering(true);
    try {
      const options = await tripService.discoverTripOptions(payload);
      const defaultSelected = normalizeSelectedPlaces((options.places || []).slice(0, 6));
      setPendingPayload(payload);
      setDiscovery(options);
      setSelectedHotelId(options.stays[0]?.id || null);
      setSelectedTransportMode(options.transport[0]?.mode || payload.transportPreference);
      setSelectedPlaces(defaultSelected);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDiscovering(false);
    }
  }

  async function handleGenerate() {
    setError(null);
    setIsGenerating(true);
    setDiscovery(null);

    try {
      const trip = await tripService.createAndGenerateTrip({
        ...pendingPayload,
        selectedHotelId,
        selectedTransportMode,
        selectedPlaces: selectedPlaces.length ? selectedPlaces : normalizeSelectedPlaces(discovery?.places || []),
        discoveredCandidates: {
          places: discovery?.places || [],
          stays: discovery?.stays || [],
          restaurants: discovery?.restaurants || [],
        },
      });

      if (!trip?._id) {
        throw new Error('Trip generation did not return a valid trip id.');
      }

      upsertTripInCache(trip);
      const nextPath = `/trip/${trip._id}/itinerary`;
      navigate(nextPath, { replace: true });

      if (window.location.pathname !== nextPath) {
        window.location.assign(nextPath);
      }
    } catch (err) {
      setError(err.message || 'Could not build the itinerary. Please try again.');
      setDiscovery((current) => current ?? discovery);
      setIsGenerating(false);
    }
  }

  function handleHeaderParallax(event) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setHeaderParallax({
      x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 2,
      y: ((event.clientY - bounds.top) / bounds.height - 0.5) * 2,
    });
  }

  if (isGenerating) {
    return <TripGenerationLoader />;
  }

  if (savedPreferences === null) {
    return <Loader label="Loading saved travel preferences..." />;
  }

  if (discovery) {
    return (
      <div className="mx-auto max-w-5xl">
        {error && <p className="mb-4 text-sm text-clay">{error}</p>}
        <TripDiscoveryOptions
          options={discovery}
          selectedHotelId={selectedHotelId}
          selectedTransportMode={selectedTransportMode}
          selectedPlaceIds={selectedPlaces.map((place) => place.refId)}
          onHotelChange={setSelectedHotelId}
          onTransportChange={setSelectedTransportMode}
          onPlaceToggle={(place) => {
            const refId = String(place.id);
            setSelectedPlaces((current) => {
              const exists = current.some((item) => item.refId === refId);
              return exists
                ? current.filter((item) => item.refId !== refId)
                : [...current, { refId, type: 'poi', name: place.name, source: place.source || 'dataset' }];
            });
          }}
          onBack={() => setDiscovery(null)}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      {preferencesError ? <ErrorMessage message={`Saved travel preferences were not loaded: ${preferencesError}`} /> : null}
      <div
        className="mb-10 flex items-center gap-3 border-b border-stone-300 pb-7 sm:gap-5"
        onMouseMove={handleHeaderParallax}
        onMouseLeave={() => setHeaderParallax({ x: 0, y: 0 })}
      >
        <div className="max-w-2xl">
          <p className="eyebrow">New journal page / 01</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Where are we going?</h1>
          <p className="mt-3 max-w-xl text-ink-500">
            Tell us what sounds good. We&apos;ll shape the first draft of a journey around it.
          </p>
        </div>
        <img
          src="/assets/ephemera/compass.webp"
          alt=""
          className="hidden h-36 w-36 shrink-0 object-contain drop-shadow-md transition-transform duration-300 sm:block"
          style={{ transform: `translate(${headerParallax.x * 9}px, ${headerParallax.y * 7}px) rotate(${headerParallax.x * 4}deg)` }}
        />
      </div>
      <TripForm
        initialValues={savedPreferences}
        onSubmit={handleSubmit}
        isSubmitting={isDiscovering}
        submitError={error}
      />
    </div>
  );
}