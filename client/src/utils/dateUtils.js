/** Number of days inclusive of both start and end (matches the backend's computeNumberOfDays). */
export function computeNumberOfDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

export function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return '';
  const opts = { day: 'numeric', month: 'short' };
  const start = new Date(startDate).toLocaleDateString('en-IN', opts);
  const end = new Date(endDate).toLocaleDateString('en-IN', { ...opts, year: 'numeric' });
  return `${start} - ${end}`;
}

export function formatDate(date, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', opts);
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}