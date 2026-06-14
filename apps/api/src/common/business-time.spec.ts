import {
  addBusinessDays,
  addCalendarDays,
  assertBusinessDateKey,
  businessDateKey,
  businessDayBounds,
  businessMonthBounds,
  businessWeekday,
  localDateTimeToUtc,
  localMinutesOfDay
} from './business-time';

describe('business-time Asia/Jakarta helpers', () => {
  it('uses Jakarta business date independently from UTC day', () => {
    const value = new Date('2026-12-31T17:30:00.000Z');
    expect(businessDateKey(value)).toBe('2027-01-01');
    expect(localMinutesOfDay(value)).toBe(30);
  });

  it('builds Jakarta day and month bounds in UTC storage time', () => {
    expect(businessDayBounds('2026-06-14')).toMatchObject({
      start: new Date('2026-06-13T17:00:00.000Z'),
      end: new Date('2026-06-14T16:59:59.999Z'),
      key: '2026-06-14'
    });
    expect(businessMonthBounds('2026-03')).toMatchObject({
      start: new Date('2026-02-28T17:00:00.000Z'),
      end: new Date('2026-03-31T16:59:59.999Z'),
      monthKey: '2026-03'
    });
  });

  it('converts local class times and weekdays at Jakarta boundaries', () => {
    expect(localDateTimeToUtc('2026-06-14', '07:30')).toEqual(new Date('2026-06-14T00:30:00.000Z'));
    expect(businessWeekday(new Date('2026-06-14T00:30:00.000Z'))).toBe(0);
    expect(addCalendarDays('2026-06-14', 1)).toBe('2026-06-15');
    expect(addBusinessDays('2026-06-12', 1)).toBe('2026-06-15');
  });

  it('rejects JavaScript-normalized invalid calendar dates', () => {
    for (const invalid of ['2026-02-29', '2026-02-30', '2026-02-31', '2026-04-31', '2026-13-01', 'bad', '2026-1-01']) {
      expect(() => assertBusinessDateKey(invalid)).toThrow(/Invalid business date key/);
      expect(() => businessDayBounds(invalid)).toThrow(/Invalid business date key|Invalid business date value|Invalid time value/);
    }

    for (const valid of ['2024-02-29', '2026-01-31', '2026-12-31']) {
      expect(assertBusinessDateKey(valid)).toEqual({
        year: Number(valid.slice(0, 4)),
        month: Number(valid.slice(5, 7)),
        day: Number(valid.slice(8, 10))
      });
    }
  });
});
