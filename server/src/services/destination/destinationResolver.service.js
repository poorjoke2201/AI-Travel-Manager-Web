const CITY_ALIASES = {
  bangalore: 'Bengaluru',
  bengaluru: 'Bengaluru',
  bangaluru: 'Bengaluru',
  bengalore: 'Bengaluru',
  mysore: 'Mysore',
  mysuru: 'Mysore',
  'mysuru district': 'Mysore',
  'mysuru sub-district': 'Mysore',
  'mysuru taluk': 'Mysore',
  mumbai: 'Mumbai',
  bombay: 'Mumbai',
  chennai: 'Chennai',
  madras: 'Chennai',
  kolkata: 'Kolkata',
  calcutta: 'Kolkata',
  kochi: 'Kochi',
  cochin: 'Kochi',
  mangalore: 'Mangalore',
  mangaluru: 'Mangalore',
  gurgaon: 'Gurugram',
  gurugram: 'Gurugram',
  pondicherry: 'Puducherry',
  puducherry: 'Puducherry',
  thiruvananthapuram: 'Thiruvananthapuram',
  trivandrum: 'Thiruvananthapuram',
  visakhapatnam: 'Visakhapatnam',
  vizag: 'Visakhapatnam',
  dehradun: 'Dehradun',
  goa: 'Goa',
};

function normalizeCityKey(city) {
  if (city == null) return '';
  return String(city).trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
}

function canonicalizeCityName(city) {
  const key = normalizeCityKey(city);
  if (!key) return '';
  return CITY_ALIASES[key] || key.split(' ').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function cityMatchPatterns(city) {
  const canonical = canonicalizeCityName(city);
  const base = String(city || '').trim();
  const variants = new Set([
    canonical,
    base,
    canonical.toLowerCase(),
    base.toLowerCase(),
    normalizeCityKey(canonical),
    normalizeCityKey(base),
  ]);

  if (canonical === 'Mysore') {
    ['Mysore', 'Mysuru', 'Mysuru District', 'Mysuru Sub-district', 'Mysuru Taluk'].forEach((name) => variants.add(name));
  }
  if (canonical === 'Bengaluru') {
    ['Bengaluru', 'Bangalore'].forEach((name) => variants.add(name));
  }

  [...variants].forEach((name) => {
    variants.add(String(name).toLowerCase());
    variants.add(normalizeCityKey(name));
  });

  return [...variants].filter(Boolean);
}

function resolveDestination(city) {
  const canonicalName = canonicalizeCityName(city);
  return {
    inputName: String(city || '').trim(),
    canonicalName,
    aliases: cityMatchPatterns(canonicalName),
  };
}

module.exports = {
  CITY_ALIASES,
  normalizeCityKey,
  canonicalizeCityName,
  cityMatchPatterns,
  resolveDestination,
};