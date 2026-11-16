/**
 * Days in the viewer's own time zone. The server learns the zone from a cookie the browser sets (`tz`, see
 * `TimezoneSync`); until it has one, days fall back to DEFAULT_TZ. A "day" starts at that zone's midnight. Browser-safe.
 */
export const DEFAULT_TZ = "America/Los_Angeles";
export const TZ_COOKIE = "tz";
const DAY = 86_400_000;

/** A time zone name Intl accepts (for example "America/Chicago"), or null. */
export function validTz(tz: string | null | undefined): string | null {
  if (!tz || tz.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

const cache = new Map<string, { day: Intl.DateTimeFormat; parts: Intl.DateTimeFormat }>();
function fmts(tz: string) {
  let f = cache.get(tz);
  if (!f) {
    f = {
      day: new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }),
      parts: new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }),
    };
    cache.set(tz, f);
  }
  return f;
}

/** The calendar day of a moment in a zone, as YYYY-MM-DD. */
export const zoneDay = (t: number, tz = DEFAULT_TZ): string => fmts(tz).day.format(new Date(t));

/** How far the zone is from UTC at a moment, in milliseconds (negative west of Greenwich). */
function offset(t: number, tz: string): number {
  const p = Object.fromEntries(fmts(tz).parts.formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}

/** The moment (UTC milliseconds) a day (YYYY-MM-DD) begins in a zone. */
export function zoneStartOf(ymd: string, tz = DEFAULT_TZ): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const midnight = Date.UTC(y, m - 1, d);
  // Find the offset in force at that local midnight (two passes, so a clock change on the day itself is handled).
  const first = midnight - offset(midnight, tz);
  return midnight - offset(first, tz);
}

/** The day that began `daysAgo` days before the one `now` is in (0 is today), as YYYY-MM-DD. */
export function zoneDayAgo(now: number, daysAgo: number, tz = DEFAULT_TZ): string {
  // Anchored at local noon so a 23 or 25 hour day can't make a step skip or repeat a date.
  const noon = zoneStartOf(zoneDay(now, tz), tz) + 12 * 3_600_000;
  return zoneDay(noon - daysAgo * DAY, tz);
}
/** When the day `daysAgo` days back began (UTC milliseconds). */
export const zoneStartAgo = (now: number, daysAgo: number, tz = DEFAULT_TZ): number => zoneStartOf(zoneDayAgo(now, daysAgo, tz), tz);

const monthKey = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
/** The first moment of the month a moment is in (in the zone), or `monthsBack` months before it. */
export function zoneMonthStart(now: number, monthsBack = 0, tz = DEFAULT_TZ): number {
  const [y, m] = zoneDay(now, tz).split("-").map(Number);
  return zoneStartOf(monthKey(y * 12 + (m - 1) - monthsBack), tz);
}
/** The first moment of the month after the one that begins at `monthStart`. */
export function nextZoneMonth(monthStart: number, tz = DEFAULT_TZ): number {
  const [y, m] = zoneDay(monthStart + 12 * 3_600_000, tz).split("-").map(Number);
  return zoneStartOf(monthKey(y * 12 + m), tz);
}
