import { Marker, Popup } from 'react-leaflet';
import { createMarkerIcon } from '../../utils/mapUtils';
import { isValidCoordinatePair } from '../../utils/poi3dView';
import LocationPopup from './LocationPopup';

export default function POIMarker({ poi, onAddToTrip }) {
  if (!isValidCoordinatePair(poi.latitude, poi.longitude)) return null;
  return (
    <Marker position={[poi.latitude, poi.longitude]} icon={createMarkerIcon('poi', null, { poi })}>
      <Popup>
        <LocationPopup item={poi} type="poi" onAddToTrip={onAddToTrip} />
      </Popup>
    </Marker>
  );
}