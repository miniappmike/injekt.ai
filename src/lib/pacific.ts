/**
 * Pacific time (Los Angeles, with daylight saving) for every "day" the site counts on the server: the free plan's daily
 * limits, "this month", and the admin charts. A day starts at midnight Pacific. Browser-safe.
 */
export const PACIFIC = "America/Los_Angeles";
const DAY = 86_400_000;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });

/** The Pacific calendar day of a moment, as YYYY-MM-DD. */
export const pacificDay = (t: number): string => dayFmt.format(new Date(t));

/** How far Pacific is from UTC at a moment, in milliseconds (negative: -8h in winter, -7h in summer). */
function offset(t: number): number {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}

/** The moment (UTC milliseconds) a Pacific day (YYYY-MM-DD) begins. */
export function pacificStartOf(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const midnight = Date.UTC(y, m - 1, d);
  // Daylight saving changes at 2am, so the offset 8 hours into the UTC day is the one in force at local midnight.
  return midnight - offset(midnight + 8 * 3_600_000);
}

/** The Pacific day that began `daysAgo` days before the one `now` is in (0 is today), as YYYY-MM-DD. */
export function pacificDayAgo(now: number, daysAgo: number): string {
  // Anchored at local noon so a 23 or 25 hour day can't make a step skip or repeat a date.
  const noon = pacificStartOf(pacificDay(now)) + 12 * 3_600_000;
  return pacificDay(noon - daysAgo * DAY);
}
/** When the Pacific day `daysAgo` days back began (UTC milliseconds). */
export const pacificStartAgo = (now: number, daysAgo: number): number => pacificStartOf(pacificDayAgo(now, daysAgo));

/** The first moment of the Pacific month a moment is in, or `monthsBack` months before it. */
export function pacificMonthStart(now: number, monthsBack = 0): number {
  const [y, m] = pacificDay(now).split("-").map(Number);
  const idx = y * 12 + (m - 1) - monthsBack;
  return pacificStartOf(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`);
}
/** The first moment of the Pacific month after the one that begins at `monthStart`. */
export function nextPacificMonth(monthStart: number): number {
  const [y, m] = pacificDay(monthStart + 12 * 3_600_000).split("-").map(Number);
  const idx = y * 12 + m;
  return pacificStartOf(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`);
}
