const DEFAULT_PRIOR = {
  heritage: { heritage: 0.18, cafe: 0.14, restaurant: 0.12, museum: 0.16 },
  cafe: { cafe: 0.12, restaurant: 0.14, heritage: 0.08, park: 0.09 },
  restaurant: { restaurant: 0.08, cafe: 0.16, heritage: 0.08, nightlife: 0.08 },
  nature_viewpoint: { nature_viewpoint: 0.18, beach: 0.16, cafe: 0.12, restaurant: 0.1 },
  beach: { beach: 0.18, nature_viewpoint: 0.15, restaurant: 0.12, cafe: 0.12 },
  park: { park: 0.15, cafe: 0.12, nature_viewpoint: 0.14 },
  nightlife: { nightlife: 0.12, restaurant: 0.16, cafe: 0.12 },
};

function computeTransitionScore(fromCategory, toCategory) {
  if (!fromCategory || !toCategory || String(fromCategory).toLowerCase() === String(toCategory).toLowerCase()) return 0;
  const fromKey = String(fromCategory).toLowerCase();
  const toKey = String(toCategory).toLowerCase();
  const row = DEFAULT_PRIOR[fromKey] || {};
  return Number(row[toKey] || 0.04);
}

module.exports = { computeTransitionScore };
