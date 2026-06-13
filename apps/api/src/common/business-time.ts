const DEFAULT_SCHOOL_TIMEZONE = 'Asia/Jakarta';

export function schoolTimezone() {
  return process.env.SCHOOL_TIMEZONE || DEFAULT_SCHOOL_TIMEZONE;
}

export function businessDateKey(value: Date = new Date(), timeZone = schoolTimezone()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function businessMonthKey(value: Date = new Date(), timeZone = schoolTimezone()) {
  return businessDateKey(value, timeZone).slice(0, 7);
}

export function jakartaBusinessDayBounds(value: Date | string = new Date()) {
  const key = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : businessDateKey(value instanceof Date ? value : new Date(value));
  const [year, month, day] = key.split('-').map(Number);
  // Asia/Jakarta is UTC+07:00 and has no DST. Store DB timestamps in UTC.
  const start = new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, -7, 0, 0, -1));
  return { start, end, date: new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0)), key };
}
