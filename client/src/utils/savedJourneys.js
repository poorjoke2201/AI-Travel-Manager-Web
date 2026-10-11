const FILTERS = ['all', 'upcoming', 'completed', 'draft'];

function dateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function getJourneyStatus(trip, today = new Date().toISOString().slice(0, 10)) {
  if (trip.status === 'draft' || trip.status === 'failed') return 'draft';
  if (trip.status !== 'generated') return null;

  const endDate = dateKey(trip.endDate);
  if (!endDate) return null;
  return endDate < today ? 'completed' : 'upcoming';
}

export function getJourneyDays(startDate, endDate) {
  const start = dateKey(startDate);
  const end = dateKey(endDate);
  if (!start || !end || end < start) return null;
  return Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1;
}

export function formatJourneyDateRange(startDate, endDate) {
  const start = dateKey(startDate);
  const end = dateKey(endDate);
  if (!start || !end) return '';
  const format = (value, options) => new Intl.DateTimeFormat('en-IN', {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
  return `${format(start, { day: 'numeric', month: 'short' })} - ${format(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function filterAndSortJourneys(trips, { query = '', filter = 'all', sort = 'latest', today } = {}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const selectedFilter = FILTERS.includes(filter) ? filter : 'all';
  const filtered = (trips || []).filter((trip) => {
    const status = getJourneyStatus(trip, today);
    const matchesStatus = selectedFilter === 'all' || status === selectedFilter;
    const matchesSearch = !normalizedQuery
      || [trip.tripName, trip.destination].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedQuery));
    return matchesStatus && matchesSearch;
  });

  return filtered.sort((left, right) => {
    if (sort === 'name') return String(left.tripName || '').localeCompare(String(right.tripName || ''), undefined, { sensitivity: 'base' });
    if (sort === 'budget') {
      const leftBudget = Number.isFinite(left.budget) ? left.budget : null;
      const rightBudget = Number.isFinite(right.budget) ? right.budget : null;
      if (leftBudget === null && rightBudget !== null) return 1;
      if (rightBudget === null && leftBudget !== null) return -1;
      return (rightBudget || 0) - (leftBudget || 0);
    }

    const direction = sort === 'oldest' ? 1 : -1;
    const leftCreated = new Date(left.createdAt || 0).getTime() || 0;
    const rightCreated = new Date(right.createdAt || 0).getTime() || 0;
    return (leftCreated - rightCreated) * direction;
  });
}
