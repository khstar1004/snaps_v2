/**
 * Wall-clock helpers for posting slots. Slot times such as "Monday 09:00" are
 * meant in the workspace timezone, not in whatever timezone the server
 * process runs in (Docker images default to UTC).
 */
export const snapsDefaultTimezone = () =>
  normalizeSnapsTimezone(process.env.SNAPS_TIMEZONE) || 'Asia/Seoul';

export const normalizeSnapsTimezone = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }
  const timeZone = value.trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return '';
  }
};

export type SnapsZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const weekdays: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string) => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
};

export const getSnapsZonedParts = (
  date: Date,
  timeZone = snapsDefaultTimezone()
): SnapsZonedParts => {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdays[parts.weekday] ?? 0,
  };
};

/** Converts a wall-clock time in `timeZone` to the matching instant. Day overflow is allowed. */
export const snapsZonedTimeToDate = (
  input: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone = snapsDefaultTimezone()
) => {
  const wallClock = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute);
  let instant = wallClock;
  // Two passes settle the offset even when the guess lands across a DST change.
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = getSnapsZonedParts(new Date(instant), timeZone);
    const seen = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    instant += wallClock - seen;
  }
  return new Date(instant);
};

export const setSnapsZonedTime = (
  date: Date,
  hour: number,
  minute: number,
  timeZone = snapsDefaultTimezone()
) => {
  const parts = getSnapsZonedParts(date, timeZone);
  return snapsZonedTimeToDate(
    { year: parts.year, month: parts.month, day: parts.day, hour, minute },
    timeZone
  );
};

export const addSnapsZonedDays = (
  date: Date,
  days: number,
  timeZone = snapsDefaultTimezone()
) => {
  const parts = getSnapsZonedParts(date, timeZone);
  return snapsZonedTimeToDate(
    { ...parts, day: parts.day + days },
    timeZone
  );
};

export const formatSnapsZonedTime = (date: Date, timeZone = snapsDefaultTimezone()) => {
  const parts = getSnapsZonedParts(date, timeZone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
};

/** Next instant after `now` that falls on `dayOfWeek` at `localTime` (HH:mm) in `timeZone`. */
export const nextSnapsZonedOccurrence = (
  now: Date,
  dayOfWeek: number,
  localTime: string,
  timeZone = snapsDefaultTimezone()
) => {
  const [hour, minute] = localTime.split(':').map((part) => Number(part));
  const parts = getSnapsZonedParts(now, timeZone);
  const normalizedDay = ((dayOfWeek % 7) + 7) % 7;
  const daysUntil = (normalizedDay - parts.weekday + 7) % 7;
  let next = snapsZonedTimeToDate(
    { year: parts.year, month: parts.month, day: parts.day + daysUntil, hour, minute },
    timeZone
  );
  if (next.getTime() <= now.getTime()) {
    next = addSnapsZonedDays(next, 7, timeZone);
  }
  return next;
};

/**
 * `Date#getTimezoneOffset` convention (minutes, UTC minus local; Asia/Seoul is -540)
 * for the workspace timezone at `date`, independent of the server's own zone.
 */
export const snapsTimezoneOffsetMinutes = (
  date = new Date(),
  timeZone = snapsDefaultTimezone()
) => {
  const parts = getSnapsZonedParts(date, timeZone);
  const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return -Math.round((wallClock - Math.floor(date.getTime() / 1000) * 1000) / 60000);
};
