import { Marker, Popup } from 'react-leaflet';
import { createMarkerIcon } from '../../utils/mapUtils';
import LocationPopup from './LocationPopup';

export default function HotelMarker({ hotel, onAddToTrip }) {
  const coords = hotel.location?.coordinates; // GeoJSON: [lng, lat]
  const position = coords?.length >= 2 ? [coords[1], coords[0]] : typeof hotel.latitude === 'number' && typeof hotel.longitude === 'number' ? [hotel.latitude, hotel.longitude] : null;
  if (!position) return null;
  return (
    <Marker position={position} icon={createMarkerIcon('hotel')}>
      <Popup>
        <LocationPopup item={hotel} type="hotel" onAddToTrip={onAddToTrip} />
      </Popup>
    </Marker>
  );
}