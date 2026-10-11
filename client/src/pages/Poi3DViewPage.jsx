import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import api from '../services/api';

const PHOTOREALISTIC_ASSET_ID = 2275207;

function parseCoordinate(value, min, max) {
  if (value == null || String(value).trim() === '') return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
}

function getBackPath(value) {
  if (!value) return '/explore';
  return value.startsWith('/') && !value.startsWith('//') ? value : '/explore';
}

export default function Poi3DViewPage() {
  const [searchParams] = useSearchParams();
  const containerRef = useRef(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const latitude = parseCoordinate(searchParams.get('lat'), -90, 90);
  const longitude = parseCoordinate(searchParams.get('lng'), -180, 180);
  const name = searchParams.get('name') || 'This place';
  const geocodeQuery = searchParams.get('q') || `${name}, India`;
  const backPath = getBackPath(searchParams.get('back'));
  const isEmbedded = searchParams.get('embed') === '1';
  const cameraHeight = parseCoordinate(searchParams.get('height'), 80, 20000) || (isEmbedded ? 120 : 8000);
  const cameraPitch = parseCoordinate(searchParams.get('pitch'), 10, 85) || 55;

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    let isCurrent = true;
    let viewer = null;
    let noCoverageTimeout = null;
    let removeVisibleListener = null;
    setError('');
    setIsLoading(true);

    async function initialize() {
      try {
        let targetLatitude = latitude;
        let targetLongitude = longitude;

        if (targetLatitude == null || targetLongitude == null) {
          const response = await api.get('/maps/geocode', {
            params: { address: geocodeQuery },
          });
          targetLatitude = parseCoordinate(String(response.data?.data?.lat ?? ''), -90, 90);
          targetLongitude = parseCoordinate(String(response.data?.data?.lng ?? ''), -180, 180);
        }
        if (!isCurrent) return;

        if (targetLatitude == null || targetLongitude == null) {
          setError("We couldn't find a mapped location for this place.");
          setIsLoading(false);
          return;
        }

        const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim();
        if (!ionToken) {
          setError('3D view is not configured yet. Add a Cesium ion access token to the client environment.');
          setIsLoading(false);
          return;
        }

        // Restrict this browser token to allowed referrer domains in Cesium ion before public deployment.
        Cesium.Ion.defaultAccessToken = ionToken;
        viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          navigationHelpButton: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          baseLayer: false,
        });
        // Cesium's Google helper requires a Google API key; this ion-hosted asset uses only the ion token.
        const resource = await Cesium.IonResource.fromAssetId(PHOTOREALISTIC_ASSET_ID, {
          accessToken: ionToken,
        });
        const tileset = await Cesium.Cesium3DTileset.fromUrl(resource, {
          asynchronouslyLoadImagery: true,
        });
        if (!isCurrent) {
          tileset.destroy();
          return;
        }

        noCoverageTimeout = window.setTimeout(() => {
          if (!isCurrent) return;
          setIsLoading(false);
          setError("3D view isn't available for this location yet.");
        }, 20000);
        removeVisibleListener = tileset.tileVisible.addEventListener(() => {
          if (!isCurrent) return;
          window.clearTimeout(noCoverageTimeout);
          noCoverageTimeout = null;
          removeVisibleListener?.();
          setIsLoading(false);
          setError('');
        });
        tileset.tileFailed.addEventListener((event) => {
          console.warn('A photorealistic 3D tile failed to load:', event.message);
        });

        viewer.scene.primitives.add(tileset);
        // Google Photorealistic tiles provide the ground surface; rendering the
        // Cesium globe as well can occlude the streamed city tiles.
        viewer.scene.globe.show = false;
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(targetLongitude, targetLatitude, cameraHeight),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-cameraPitch),
            roll: 0,
          },
          duration: 1.5,
        });
      } catch (loadError) {
        if (!isCurrent) return;
        console.error('Photorealistic 3D view initialization failed:', loadError);
        setIsLoading(false);
        setError("3D view isn't available for this location yet.");
      }
    }

    initialize();

    return () => {
      isCurrent = false;
      if (noCoverageTimeout != null) window.clearTimeout(noCoverageTimeout);
      removeVisibleListener?.();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [latitude, longitude, geocodeQuery, cameraHeight, cameraPitch]);

  return (
    <main className={`relative w-full overflow-hidden bg-ink ${isEmbedded ? 'h-full min-h-60 rounded-xl' : 'h-screen'}`}>
      <div ref={containerRef} className="absolute inset-0" aria-label={`3D view of ${name}`} />
      {!isEmbedded && (
        <header className="absolute left-4 right-4 top-4 z-10 flex items-center justify-between gap-4 rounded-xl border border-white/20 bg-ink/80 px-4 py-3 text-white shadow-lg backdrop-blur sm:left-6 sm:right-6 sm:top-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Photorealistic 3D</p>
            <h1 className="!text-white truncate text-lg font-semibold">{name}</h1>
          </div>
          <Link to={backPath} className="shrink-0 rounded-full border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10">
            Back
          </Link>
        </header>
      )}
      {(isLoading || error) && (
        <div className="absolute inset-0 z-[5] grid place-items-center bg-ink/75 px-6 text-center text-white backdrop-blur-sm">
          <div className="max-w-md rounded-2xl border border-white/20 bg-ink/90 p-6 shadow-xl">
            <p className="text-lg font-semibold">{error || 'Loading 3D tiles and locating the surface...'}</p>
            {error && <p className="mt-2 text-sm text-white/70">{isEmbedded ? 'Try the full 3D view or choose another mapped place.' : 'Try another mapped place or return to your trip.'}</p>}
            {error && !isEmbedded && <Link to={backPath} className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink">Go back</Link>}
          </div>
        </div>
      )}
    </main>
  );
}