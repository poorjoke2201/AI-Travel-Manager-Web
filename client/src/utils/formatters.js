export function formatInr(amount) {
  if (amount === null || amount === undefined) return 'N/A';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatRating(rating) {
  if (rating === null || rating === undefined) return 'Unrated';
  return `${Number(rating).toFixed(1)} / 5`;
}

/** "north_indian" | "North Indian" -> "North Indian" - tolerant of either casing style from API data. */
export function toTitleCase(str) {
  if (!str) return '';
  return str
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}