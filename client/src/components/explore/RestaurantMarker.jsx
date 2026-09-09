import { Marker, Popup } from 'react-leaflet';
import { createMarkerIcon } from '../../utils/mapUtils';
import LocationPopup from './LocationPopup';

export default function RestaurantMarker({ restaurant }) {
  const coords = restaurant.location?.coordinates; // GeoJSON: [lng, lat]
  if (!coords) return null;
  return (
    <Marker position={[coords[1], coords[0]]} icon={createMarkerIcon('restaurant')}>
      <Popup>
        <LocationPopup item={restaurant} type="restaurant" />
      </Popup>
    </Marker>
  );
}