import { useEffect, useMemo, useState } from 'react';
import { getActivityPhotoSources } from '../../utils/activityCategory';
import { fetchMapillaryPhotos } from '../../services/mapillaryService';

export default function ActivityPhotoGallery({ activity, initialIndex = 0, onClose }) {
  const basePhotos = useMemo(() => getActivityPhotoSources(activity), [activity]);
  const [mapillaryPhotos, setMapillaryPhotos] = useState([]);
  const [mapillaryStatus, setMapillaryStatus] = useState('idle');
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const photos = useMemo(() => {
    const seen = new Set(basePhotos.map((photo) => photo.url));
    return [
      ...basePhotos,
      ...mapillaryPhotos.filter((photo) => {
        if (seen.has(photo.url)) return false;
        seen.add(photo.url);
        return true;
      }),
    ];
  }, [basePhotos, mapillaryPhotos]);
  const hasMultiple = photos.length > 1;
  const activePhoto = photos[activeIndex] || null;
  const isPoi = activity.type === 'poi';
  const activePhotoDetails = activePhoto?.source === 'mapillary'
    ? [
      activePhoto.capturedAt ? `Captured ${new Date(activePhoto.capturedAt).toLocaleDateString()}` : null,
      Number.isFinite(activePhoto.distanceMeters) ? `${activePhoto.distanceMeters} m from place` : null,
    ].filter(Boolean).join(' · ')
    : '';

  useEffect(() => {
    if (!isPoi) {
      setMapillaryPhotos([]);
      setMapillaryStatus('idle');
      return undefined;
    }

    const controller = new AbortController();
    setMapillaryStatus('loading');
    fetchMapillaryPhotos({
      latitude: activity.location?.lat,
      longitude: activity.location?.lng,
    }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setMapillaryPhotos(result.photos);
        setMapillaryStatus(result.status);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn('Mapillary gallery lookup failed:', error);
        setMapillaryStatus('error');
      });

    return () => controller.abort();
  }, [activity.location?.lat, activity.location?.lng, isPoi]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
      if (!hasMultiple) return;
      if (event.key === 'ArrowLeft') setActiveIndex((index) => (index - 1 + photos.length) % photos.length);
      if (event.key === 'ArrowRight') setActiveIndex((index) => (index + 1) % photos.length);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasMultiple, onClose, photos.length]);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1200]"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${activity.name} photos`}
        className="pointer-events-auto absolute right-3 top-1/2 flex max-h-[85vh] w-[min(25rem,calc(100vw-1.5rem))] -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl sm:right-6"
      >
        <header className="flex items-center justify-between gap-4 border-b border-stone-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-ink">{activity.name}</h2>
            <p className="text-xs text-ink-500">Photos{hasMultiple ? ` · ${activeIndex + 1} / ${photos.length}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close photo gallery" className="rounded-full px-3 py-2 text-ink-500 hover:bg-stone-100">✕</button>
        </header>

        <div className="relative flex h-[min(38vh,340px)] min-h-48 items-center justify-center bg-ink-900 px-10 py-4">
          {activePhoto ? (
            <>
              <img src={activePhoto.url} alt={`${activity.name}, photo ${activeIndex + 1}`} className="max-h-full max-w-full object-contain" />
              {hasMultiple && (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => setActiveIndex((index) => (index - 1 + photos.length) % photos.length)}
                    className="absolute left-3 rounded-full bg-white/90 px-3 py-2 text-xl text-ink shadow hover:bg-white"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={() => setActiveIndex((index) => (index + 1) % photos.length)}
                    className="absolute right-3 rounded-full bg-white/90 px-3 py-2 text-xl text-ink shadow hover:bg-white"
                  >
                    ›
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="text-center text-sm text-white/75">
              {mapillaryStatus === 'loading'
                ? 'Looking for nearby street-level photos…'
                : 'No photos are available for this place yet.'}
            </p>
          )}
        </div>

        {mapillaryStatus === 'unconfigured' && isPoi && (
          <p className="border-t border-stone-200 px-4 pt-2 text-xs text-ink-500">
            Street-level photos require a Mapillary client token in the client environment.
          </p>
        )}
        {mapillaryStatus === 'invalid-location' && (
          <p className="border-t border-stone-200 px-4 pt-2 text-xs text-ink-500">
            Street-level photos are unavailable because this place has no valid mapped coordinates.
          </p>
        )}
        {mapillaryStatus === 'error' && (
          <p role="status" className="border-t border-stone-200 px-4 pt-2 text-xs text-ink-500">
            Nearby street-level photos could not be loaded. Other photos remain available.
          </p>
        )}
        {mapillaryStatus === 'loaded' && mapillaryPhotos.length === 0 && isPoi && (
          <p className="border-t border-stone-200 px-4 pt-2 text-xs text-ink-500">
            No Mapillary views were found within 100 m of this place.
          </p>
        )}
        {photos.length > 0 && (
          <>
          {mapillaryPhotos.length > 0 && (
            <p className="border-t border-stone-200 px-4 pt-2 text-xs text-ink-500">
              Street-level imagery © Mapillary contributors · {mapillaryPhotos.length} nearby views. Verify the scene on Mapillary; image locations can be inaccurate.
            </p>
          )}
          {activePhoto?.source === 'mapillary' ? (
            <p className="border-t border-stone-200 px-4 pt-2 text-xs text-ink-500">
              {activePhotoDetails}
              {activePhotoDetails && activePhoto.pageUrl ? ' · ' : ''}
              {activePhoto.pageUrl && (
                <a href={activePhoto.pageUrl} target="_blank" rel="noreferrer" className="underline">View on Mapillary</a>
              )}
            </p>
          ) : activePhoto?.pageUrl ? (
            <p className="border-t border-stone-200 px-4 pt-2 text-xs text-ink-500">
              Photo: <a href={activePhoto.pageUrl} target="_blank" rel="noreferrer" className="underline">Wikimedia Commons</a>
              {activePhoto.license ? ` · ${activePhoto.license}` : ''}
              {activePhoto.artist ? ` · ${activePhoto.artist}` : ''}
            </p>
          ) : null}
          <div className="flex gap-2 overflow-x-auto border-t border-stone-200 p-3 sm:p-4">
            {photos.map((photo, index) => (
              <button
                key={`${photo}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Show photo ${index + 1}`}
                aria-current={index === activeIndex}
                className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${index === activeIndex ? 'border-ocean' : 'border-transparent opacity-70 hover:opacity-100'}`}
              >
                <img src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          </>
        )}
      </section>
    </div>
  );
}
