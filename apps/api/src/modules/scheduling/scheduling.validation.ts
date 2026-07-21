import { assertBusinessDateKey } from '../../common/business-time';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnlyAtUtcMidnight(value: string) {
  if (!DATE_ONLY_PATTERN.test(value)) throw new Error('Invalid date-only value.');
  const { year, month, day } = assertBusinessDateKey(value);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export function isValidTimeRange(startTime: string, endTime: string) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  return startMinutes !== null && endMinutes !== null && endMinutes > startMinutes;
}

export function isValidInclusiveDateRange(effectiveFrom: Date, effectiveTo: Date | null) {
  return !effectiveTo || effectiveTo >= effectiveFrom;
}

export function isDateWithinInclusiveRange(value: Date, effectiveFrom: Date, effectiveTo: Date | null) {
  return value >= effectiveFrom && (!effectiveTo || value <= effectiveTo);
}

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
