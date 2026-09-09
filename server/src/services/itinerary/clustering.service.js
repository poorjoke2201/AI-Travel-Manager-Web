const { haversineDistanceKm, centroid } = require('../../utils/haversine');

/**
 * Groups geographically nearby POIs into `numDays` clusters (spec section
 * 23/25 - don't just pick top-rated places, group nearby ones per day).
 * Uses a simple k-means-style approach: fine for the small candidate sets
 * (<=25-60 POIs) this app ever works with, no need for a heavier library.
 *
 * POIs without coordinates (rare after dataset import, but possible for
 * Gemini-fallback suggestions) are distributed round-robin across clusters
 * at the end so they aren't lost, just not geographically optimized.
 */
function clusterPOIsByDay(pois, numDays, { iterations = 10 } = {}) {
  const withCoords = pois.filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number');
  const withoutCoords = pois.filter((p) => !(typeof p.latitude === 'number' && typeof p.longitude === 'number'));

  if (numDays <= 1 || withCoords.length <= numDays) {
    // Not enough points to meaningfully cluster - one bucket per day, filled evenly.
    return roundRobinDistribute([...withCoords, ...withoutCoords], numDays);
  }

  // Initialize centroids by spreading evenly across the sorted-by-longitude list
  // (a cheap, deterministic seed - avoids the "all centroids start identical" trap
  // of picking the first N points, which can happen when the dataset is sorted by rating).
  const sortedByLng = [...withCoords].sort((a, b) => a.longitude - b.longitude);
  let centroids = Array.from({ length: numDays }, (_, i) => {
    const point = sortedByLng[Math.floor((i * sortedByLng.length) / numDays)];
    return { lat: point.latitude, lng: point.longitude };
  });

  let assignments = [];

  for (let iter = 0; iter < iterations; iter += 1) {
    assignments = withCoords.map((poi) => {
      const distances = centroids.map((c) => haversineDistanceKm(c, { lat: poi.latitude, lng: poi.longitude }));
      const clusterIdx = distances.indexOf(Math.min(...distances));
      return { poi, clusterIdx };
    });

    const newCentroids = centroids.map((old, idx) => {
      const members = assignments.filter((a) => a.clusterIdx === idx).map((a) => a.poi);
      if (!members.length) return old; // keep empty clusters where they are, they may pick up members next iteration
      const c = centroid(members.map((m) => ({ lat: m.latitude, lng: m.longitude })));
      return c || old;
    });
    centroids = newCentroids;
  }

  const clusters = Array.from({ length: numDays }, () => []);
  assignments.forEach(({ poi, clusterIdx }) => clusters[clusterIdx].push(poi));

  // Rebalance: if pace/preferences left some days empty or wildly overloaded,
  // move the farthest-from-centroid POI out of any cluster with >150% the
  // average size into the smallest cluster - keeps days usable, not perfectly optimal.
  rebalanceClusters(clusters, centroids);

  // Distribute coordinate-less extras round robin into the existing clusters.
  withoutCoords.forEach((poi, idx) => clusters[idx % numDays].push(poi));

  return clusters;
}

function rebalanceClusters(clusters, centroids) {
  const avgSize = clusters.reduce((sum, c) => sum + c.length, 0) / clusters.length;
  let movedSomething = true;
  let safety = 0;

  while (movedSomething && safety < 20) {
    movedSomething = false;
    safety += 1;

    const overIdx = clusters.findIndex((c) => c.length > avgSize * 1.5 + 1);
    const underIdx = clusters.findIndex((c) => c.length < avgSize * 0.5);
    if (overIdx === -1 || underIdx === -1 || overIdx === underIdx) break;

    const overCluster = clusters[overIdx];
    const distances = overCluster.map((poi) =>
      haversineDistanceKm(centroids[overIdx], { lat: poi.latitude, lng: poi.longitude })
    );
    const farthestIdx = distances.indexOf(Math.max(...distances));
    const [moved] = overCluster.splice(farthestIdx, 1);
    clusters[underIdx].push(moved);
    movedSomething = true;
  }
}

function roundRobinDistribute(items, numBuckets) {
  const buckets = Array.from({ length: numBuckets }, () => []);
  items.forEach((item, idx) => buckets[idx % numBuckets].push(item));
  return buckets;
}

module.exports = { clusterPOIsByDay };