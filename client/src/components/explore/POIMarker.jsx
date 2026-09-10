import { Marker, Popup } from 'react-leaflet';
import { createMarkerIcon } from '../../utils/mapUtils';
import LocationPopup from './LocationPopup';

export default function POIMarker({ poi, onAddToTrip }) {
  if (typeof poi.latitude !== 'number' || typeof poi.longitude !== 'number') return null;
  return (
    <Marker position={[poi.latitude, poi.longitude]} icon={createMarkerIcon('poi')}>
      <Popup>
        <LocationPopup item={poi} type="poi" onAddToTrip={onAddToTrip} />
      </Popup>
    </Marker>
  );
}