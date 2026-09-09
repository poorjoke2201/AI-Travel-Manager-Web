import { Marker, Popup } from 'react-leaflet';
import { createMarkerIcon } from '../../utils/mapUtils';
import LocationPopup from './LocationPopup';

export default function HotelMarker({ hotel }) {
  const coords = hotel.location?.coordinates; // GeoJSON: [lng, lat]
  if (!coords) return null;
  return (
    <Marker position={[coords[1], coords[0]]} icon={createMarkerIcon('hotel')}>
      <Popup>
        <LocationPopup item={hotel} type="hotel" />
      </Popup>
    </Marker>
  );
}