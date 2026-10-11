import { formatInr, formatRating } from '../../utils/formatters';
import { getPlaceTypeLabel } from '../../mapIcons/getPlaceTypeLabel';
import { Link } from 'react-router-dom';
import { buildPoi3DViewUrl } from '../../utils/poi3dView';

export default function LocationPopup({ item, type, onAddToTrip }) {
  const readableType = getPlaceTypeLabel(item);
  const name = item?.name || 'Unnamed place';
  const view3DUrl = type === 'poi'
    ? buildPoi3DViewUrl({
      latitude: item.latitude,
      longitude: item.longitude,
      name,
      city: item.city,
      backTo: '/explore',
    })
    : null;

  return (
    <div className="min-w-[200px] max-w-[240px] font-sans">
      <h4 className="mb-1 font-semibold text-ink">{name}</h4>
      {readableType && <p className="mb-1 text-xs text-ink-500">{readableType}</p>}
      {(item.googleRating != null || item.rating != null) && (
        <p className="mb-1 text-xs text-ink-500">{formatRating(item.googleRating ?? item.rating)}</p>
      )}
      {item.pricePerNightInr != null && <p className="mb-1 text-xs text-ink-500">{formatInr(item.pricePerNightInr)}/night</p>}
      {item.avgPriceForTwo != null && <p className="mb-1 text-xs text-ink-500">{formatInr(item.avgPriceForTwo)} for two</p>}
      {item.description && <p className="mb-2 text-xs text-ink-500 line-clamp-3">{item.description}</p>}
      <p className="mb-2 text-xs text-ink-300">Source: {item.source || 'dataset'}</p>
      {view3DUrl && (
        <Link
          to={view3DUrl}
          className="mb-2 block text-xs font-semibold text-indigo hover:underline"
        >
          View in 3D
        </Link>
      )}
      {onAddToTrip && (
        <button
          type="button"
          onClick={() => onAddToTrip(item, type)}
          className="text-xs font-semibold text-indigo hover:underline"
        >
          Add to trip
        </button>
      )}
    </div>
  );
}