const DEFAULT_SCHOOL_TIMEZONE = 'Asia/Jakarta';
const JAKARTA_UTC_OFFSET_HOURS = 7;

export function schoolTimezone() {
  return process.env.SCHOOL_TIMEZONE || DEFAULT_SCHOOL_TIMEZONE;
}

export function businessDateKey(value: Date = new Date(), timeZone = schoolTimezone()) {
  if (Number.isNaN(value.getTime())) throw new Error('Invalid business date value.');
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

export function assertBusinessDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid business date key: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Invalid business date key: ${value}`);
  }
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    throw new Error(`Invalid business date key: ${value}`);
  }
  const reference = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (reference.getUTCFullYear() !== year || reference.getUTCMonth() !== month - 1 || reference.getUTCDate() !== day) {
    throw new Error(`Invalid business date key: ${value}`);
  }
  return { year, month, day };
}

export function localDateTimeToUtc(dateKey: string, time = '00:00') {
  const { year, month, day } = assertBusinessDateKey(dateKey);
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match) throw new Error(`Invalid local time: ${time}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? '0');
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    throw new Error(`Invalid local time: ${time}`);
  }
  // Asia/Jakarta is UTC+07:00 and has no DST. Store DB timestamps in UTC.
  return new Date(Date.UTC(year, month - 1, day, hour - JAKARTA_UTC_OFFSET_HOURS, minute, second, 0));
}

export function businessDayBounds(value: Date | string = new Date()) {
  let key: string;
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      key = value;
    } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) {
      throw new Error(`Invalid business date key: ${value}`);
    } else {
      key = businessDateKey(new Date(value));
    }
  } else {
    key = businessDateKey(value);
  }
  const start = localDateTimeToUtc(key, '00:00');
  const { year, month, day } = assertBusinessDateKey(key);
  const end = new Date(Date.UTC(year, month - 1, day + 1, -JAKARTA_UTC_OFFSET_HOURS, 0, 0, -1));
  return { start, end, date: start, key };
}

export function jakartaBusinessDayBounds(value: Date | string = new Date()) {
  return businessDayBounds(value);
}

export function businessMonthBounds(value: Date | string = new Date()) {
  const monthKey = typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
    ? value
    : businessMonthKey(value instanceof Date ? value : new Date(value));
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid business month key: ${monthKey}`);
  }
  const startKey = `${year}-${String(month).padStart(2, '0')}-01`;
  const start = localDateTimeToUtc(startKey, '00:00');
  const end = new Date(Date.UTC(year, month, 1, -JAKARTA_UTC_OFFSET_HOURS, 0, 0, -1));
  return { start, end, monthKey };
}

export function localMinutesOfDay(value: Date, timeZone = schoolTimezone()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(value).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export function businessWeekday(value: Date | string = new Date(), timeZone = schoolTimezone()) {
  const date = value instanceof Date ? value : new Date(value);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
}

export function addCalendarDays(value: Date | string, days: number) {
  if (!Number.isInteger(days)) throw new Error('Calendar days must be an integer.');
  const key = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : businessDateKey(value instanceof Date ? value : new Date(value));
  const { year, month, day } = assertBusinessDateKey(key);
  const nextNoon = new Date(Date.UTC(year, month - 1, day + days, 12 - JAKARTA_UTC_OFFSET_HOURS, 0, 0, 0));
  return businessDateKey(nextNoon);
}

export function addBusinessDays(value: Date | string, days: number) {
  if (!Number.isInteger(days)) throw new Error('Business days must be an integer.');
  let key = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : businessDateKey(value instanceof Date ? value : new Date(value));
  const step = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    key = addCalendarDays(key, step);
    const weekday = businessWeekday(localDateTimeToUtc(key, '12:00'));
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return key;
}
