export function localDateTimeToIso(value: string): string {
  const text = value.trim();
  const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text);
  if (!matched) {
    throw new Error("예약 시간이 올바르지 않습니다.");
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const hour = Number(matched[4]);
  const minute = Number(matched[5]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    throw new Error("예약 시간이 올바르지 않습니다.");
  }

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("예약 시간이 올바르지 않습니다.");
  }

  return date.toISOString();
}
