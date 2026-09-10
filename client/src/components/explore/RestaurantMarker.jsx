import { Marker, Popup } from 'react-leaflet';
import { createMarkerIcon } from '../../utils/mapUtils';
import LocationPopup from './LocationPopup';

export default function RestaurantMarker({ restaurant, onAddToTrip }) {
  const coords = restaurant.location?.coordinates; // GeoJSON: [lng, lat]
  const position = coords?.length >= 2 ? [coords[1], coords[0]] : typeof restaurant.latitude === 'number' && typeof restaurant.longitude === 'number' ? [restaurant.latitude, restaurant.longitude] : null;
  if (!position) return null;
  return (
    <Marker position={position} icon={createMarkerIcon('restaurant')}>
      <Popup>
        <LocationPopup item={restaurant} type="restaurant" onAddToTrip={onAddToTrip} />
      </Popup>
    </Marker>
  );
}