import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import POIMarker from './POIMarker';
import HotelMarker from './HotelMarker';
import RestaurantMarker from './RestaurantMarker';
import { createMarkerIcon, INDIA_CENTER, INDIA_DEFAULT_ZOOM } from '../../utils/mapUtils';

/** Recenters the map imperatively when a new search resolves, without remounting the whole MapContainer. */
function RecenterOnSearch({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], zoom);
  }, [center, zoom, map]);
  return null;
}

export default function ExploreMap({ activeType, results, searchedCoordinates, onAddToTrip }) {
  const items = results[activeType === 'poi' ? 'pois' : `${activeType}s`] || [];

  return (
    <MapContainer
      center={[INDIA_CENTER.lat, INDIA_CENTER.lng]}
      zoom={INDIA_DEFAULT_ZOOM}
      style={{ height: '520px', borderRadius: '20px' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterOnSearch center={searchedCoordinates} zoom={12} />

      {searchedCoordinates && (
        <Marker position={[searchedCoordinates.lat, searchedCoordinates.lng]} icon={createMarkerIcon('destination')}>
          <Popup>Searched location</Popup>
        </Marker>
      )}

      {activeType === 'poi' && items.map((poi) => <POIMarker key={poi._id} poi={poi} onAddToTrip={onAddToTrip} />)}
      {activeType === 'hotel' && items.map((hotel) => <HotelMarker key={hotel._id} hotel={hotel} onAddToTrip={onAddToTrip} />)}
      {activeType === 'restaurant' && items.map((r) => <RestaurantMarker key={r._id} restaurant={r} onAddToTrip={onAddToTrip} />)}
    </MapContainer>
  );
}