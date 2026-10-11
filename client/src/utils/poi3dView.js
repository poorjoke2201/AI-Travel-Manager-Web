export function isValidCoordinatePair(latitude, longitude) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

export function buildPoi3DViewUrl({ latitude, longitude, name, city, destination, backTo = '/explore' }) {
  const placeName = String(name || '').trim();
  if (!placeName) return null;

  const params = new URLSearchParams({ name: placeName, back: backTo });
  if (isValidCoordinatePair(latitude, longitude)) {
    params.set('lat', String(latitude));
    params.set('lng', String(longitude));
  } else {
    const queryParts = [placeName, city, destination, 'India']
      .map((part) => String(part || '').trim())
      .filter((part, index, parts) => part && parts.findIndex((value) => value.toLowerCase() === part.toLowerCase()) === index);
    params.set('q', queryParts.join(', '));
  }

  return `/view-3d?${params.toString()}`;
}
