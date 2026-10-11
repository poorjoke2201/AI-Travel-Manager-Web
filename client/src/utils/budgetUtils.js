const INR_FORMATTER = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function parseInrToPaise(value) {
  const match = String(value ?? '').trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const paise = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0');
  if (paise <= 0n || paise > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(paise);
}

export function parseNonNegativeInrToPaise(value) {
  if (String(value ?? '').trim() === '0' || String(value ?? '').trim() === '0.00') return 0;
  return parseInrToPaise(value);
}

export function formatWholePaise(value) {
  const paise = typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value) || 0));
  const rupees = (paise + 50n) / 100n;
  return `₹${INR_FORMATTER.format(Number(rupees))}`;
}

export function formatExactPaise(value) {
  const paise = typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value) || 0));
  const sign = paise < 0n ? '-' : '';
  const absolute = paise < 0n ? -paise : paise;
  const rupees = absolute / 100n;
  const remainder = absolute % 100n;
  return `${sign}₹${INR_FORMATTER.format(Number(rupees))}.${String(remainder).padStart(2, '0')}`;
}

export function todayDateOnly() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toDisplayDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return '';
  const [year, month, day] = date.split('-');
  return `${day}-${month}-${year}`;
}

export function fromDisplayDate(value) {
  const match = String(value || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

export function addDateDays(date, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return '';
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function tripDayForDate(date, startDate, endDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return '';
  if (startDate && date < startDate) return 'before';
  if (endDate && date > endDate) return 'after';
  if (!startDate) return 'custom';
  return Math.floor((Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000) + 1;
}

export function dateForTripDay(day, startDate, endDate) {
  if (day === 'before' && startDate) return addDateDays(startDate, -1);
  if (day === 'after' && endDate) return addDateDays(endDate, 1);
  if (Number.isInteger(Number(day)) && startDate) return addDateDays(startDate, Number(day) - 1);
  return '';
}
