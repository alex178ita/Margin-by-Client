// Date helpers. Every date in this app is handled as a plain calendar day
// (UTC midnight) so that the Europe/Rome offset can never shift a log into the
// neighbouring week.

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const DAY_MS = 86_400_000;

/** Build a UTC-midnight Date from y/m/d. */
export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** Parse 'YYYY-MM-DD' (optionally followed by a time) into a UTC-midnight Date. */
export function parseISODay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) throw new Error(`Unrecognised date: ${value}`);
  return utcDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 'YYYY-MM-DD' */
export function toISODay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Zoho People date literal: 'DD-Mon-YYYY' (Time Logs and Leave tables). */
export function toPeopleDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/** Zoho Sprints datetime literal: 'YYYY-MM-DD HH:MM:SS' (Timesheets table). */
export function toSprintsDateTime(d: Date, endOfDay = false): string {
  return `${toISODay(d)} ${endOfDay ? '23:59:59' : '00:00:00'}`;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Monday of the ISO week that contains `d`. */
export function weekStart(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sunday
  const back = day === 0 ? 6 : day - 1;
  return addDays(utcDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), -back);
}

/** Monday of the most recent week that has already finished. */
export function lastClosedWeekStart(now: Date = new Date()): Date {
  return addDays(weekStart(now), -7);
}

/** ISO week number and ISO week-numbering year. */
export function isoWeek(d: Date): { week: number; year: number } {
  const target = new Date(d.getTime());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const isoYear = target.getUTCFullYear();
  const firstThursday = utcDate(isoYear, 0, 4);
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  const week1Monday = addDays(firstThursday, -firstDayNr);
  const week = 1 + Math.round((target.getTime() - week1Monday.getTime()) / (7 * DAY_MS));
  return { week, year: isoYear };
}

/** Easter Sunday (Gregorian, anonymous algorithm). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month - 1, day);
}

const holidayCache = new Map<number, Map<string, string>>();

/** Italian national public holidays plus Milan's patron saint (7 December). */
export function publicHolidays(year: number): Map<string, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const map = new Map<string, string>();
  const add = (d: Date, name: string) => map.set(toISODay(d), name);

  add(utcDate(year, 0, 1), "New Year's Day");
  add(utcDate(year, 0, 6), 'Epiphany');
  add(addDays(easterSunday(year), 1), 'Easter Monday');
  add(utcDate(year, 3, 25), 'Liberation Day');
  add(utcDate(year, 4, 1), 'Labour Day');
  add(utcDate(year, 5, 2), 'Republic Day');
  add(utcDate(year, 7, 15), 'Ferragosto');
  add(utcDate(year, 10, 1), "All Saints' Day");
  add(utcDate(year, 11, 7), "St Ambrose (Milan)");
  add(utcDate(year, 11, 8), 'Immaculate Conception');
  add(utcDate(year, 11, 25), 'Christmas Day');
  add(utcDate(year, 11, 26), "St Stephen's Day");

  holidayCache.set(year, map);
  return map;
}

export function holidayName(d: Date): string | null {
  return publicHolidays(d.getUTCFullYear()).get(toISODay(d)) ?? null;
}

/** Monday to Friday, excluding public holidays. */
export function isWorkingDay(d: Date): boolean {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !holidayName(d);
}

export function eachDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) {
    out.push(d);
    if (out.length > 800) break; // guard against malformed ranges
  }
  return out;
}

const DATE_LABEL = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
});
const DATE_LABEL_SHORT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', timeZone: 'UTC',
});

export function formatRange(start: Date, end: Date): string {
  return `${DATE_LABEL_SHORT.format(start)} – ${DATE_LABEL.format(end)}`;
}

export function formatDay(d: Date): string {
  return DATE_LABEL.format(d);
}
