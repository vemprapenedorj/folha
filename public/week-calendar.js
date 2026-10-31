export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function startOfWeek(key) {
  const date = parseDate(key);
  if (Number.isNaN(date.getTime())) return dateKey(new Date());
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return dateKey(date);
}

export function addDays(key, days) {
  const date = parseDate(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function isoWeek(key) {
  const monday = new Date(`${startOfWeek(key)}T12:00:00Z`);
  const thursday = new Date(monday);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstMonday = new Date(Date.UTC(year, 0, 4, 12));
  firstMonday.setUTCDate(firstMonday.getUTCDate() - ((firstMonday.getUTCDay() + 6) % 7));
  return { year, number: 1 + Math.round((monday - firstMonday) / 604800000) };
}

export function isoWeeksInYear(year) {
  return isoWeek(`${year}-12-28`).number;
}

export function isoWeekStart(year, number) {
  const monday = new Date(Date.UTC(year, 0, 4, 12));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + (number - 1) * 7);
  return monday.toISOString().slice(0, 10);
}
