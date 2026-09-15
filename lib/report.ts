import { unstable_cache } from 'next/cache';
import { runQuery, toNumber } from './zoho';
import {
  addDays, eachDay, formatRange, holidayName, isWorkingDay, isoWeek,
  lastClosedWeekStart, parseISODay, toISODay, toPeopleDate, toSprintsDateTime, weekStart,
} from './dates';

/** Hours everyone is expected to reach in a full week. */
export const WEEKLY_TARGET = 40;

/** Accounts that exist in Zoho People but are not people. */
const EXCLUDED_EMAILS = new Set(['admin@kleecks.com', 'digitalop@kleecks.com']);

export type Category = 'projects' | 'internal' | 'service' | 'absence' | 'sprints';

export const CATEGORY_LABELS: Record<Category, string> = {
  projects: 'Projects',
  internal: 'Internal projects',
  service: 'Service projects',
  absence: 'Absence',
  sprints: 'Sprints',
};

export interface DetailLine {
  label: string;
  category: Category;
  hours: number;
}

export interface PersonRow {
  email: string;
  name: string;
  department: string;
  projects: number;
  internal: number;
  service: number;
  absence: number;
  sprints: number;
  total: number;
  meetsTarget: boolean;
  detail: DetailLine[];
}

export interface WeekReport {
  weekStart: string;
  weekEnd: string;
  rangeLabel: string;
  isoLabel: string;
  target: number;
  inProgress: boolean;
  generatedAt: string;
  holidays: { date: string; name: string }[];
  departments: string[];
  rows: PersonRow[];
  totals: {
    people: number;
    below: number;
    projects: number;
    internal: number;
    service: number;
    absence: number;
    sprints: number;
    total: number;
  };
}

/**
 * A project's prefix decides the column it lands in:
 *   "-", "--", "---", en/em dash  -> service projects (People house-keeping projects)
 *   "_"                           -> internal projects
 *   "::"                          -> internal projects (IT infrastructure & ops)
 *   anything else, "=" included   -> client projects (presales counts as client work)
 */
export function classifyProject(rawName: string): Exclude<Category, 'absence' | 'sprints'> {
  const name = (rawName || '').trim();
  if (!name) return 'projects';
  if (name.startsWith('::')) return 'internal';
  const first = name[0];
  if (first === '-' || first === '–' || first === '—') return 'service';
  if (first === '_') return 'internal';
  return 'projects';
}

function sqlEmployees(): string {
  return `
    select cast(E."ID" as varchar) as emp_id,
           cast(E."Employee Name" as varchar) as emp_name,
           cast(E."Email ID" as varchar) as emp_email,
           cast(D."Department Name" as varchar) as department
    from "Employee (Zoho People)" E
    left join "Department (Zoho People)" D on E."Department" = D."ID"
    where E."Employee status" = 'Active'
  `;
}

function sqlTimeLogs(from: Date, to: Date): string {
  return `
    select cast(E."Email ID" as varchar) as emp_email,
           cast(E."Employee Name" as varchar) as emp_name,
           cast(P."Project Name" as varchar) as project_name,
           sum(T."Hours") as hours
    from "Time Logs (Zoho People)" T
    left join "Employee (Zoho People)" E on T."User Name" = E."ID"
    left join "Projects (Zoho People)" P on T."Project" = P."ID"
    where T."Date" >= '${toPeopleDate(from)}' and T."Date" <= '${toPeopleDate(to)}'
    group by 1, 2, 3
  `;
}

function sqlLeave(from: Date, to: Date): string {
  return `
    select cast(E."Email ID" as varchar) as emp_email,
           cast(E."Employee Name" as varchar) as emp_name,
           cast(LT."Leave type" as varchar) as leave_type,
           cast(L."Unit" as varchar) as unit,
           L."Leave taken" as taken,
           cast(L."From" as varchar) as date_from,
           cast(L."To" as varchar) as date_to
    from "Leave (Zoho People)" L
    left join "Employee (Zoho People)" E on L."Employee ID" = E."ID"
    left join "Leave Type (Zoho People)" LT on L."Leave type" = LT."ID"
    where L."Approval Status" = 'Approved'
      and L."From" <= '${toPeopleDate(to)}'
      and L."To" >= '${toPeopleDate(from)}'
  `;
}

function sqlSprints(from: Date, to: Date): string {
  // ZPLog ID is filled in when the log originated in Zoho Projects; those are
  // already counted through Zoho People, so only Sprints-native logs are kept.
  return `
    select cast(U."Email ID" as varchar) as emp_email,
           cast(U."User Name" as varchar) as user_name,
           sum(T."Log Time in Minutes") as minutes
    from "Timesheets (Zoho Sprints)" T
    left join "Users (Zoho Sprints)" U on T."Owner ID" = U."ZSUser ID"
    where T."Log Date" >= '${toSprintsDateTime(from)}'
      and T."Log Date" <= '${toSprintsDateTime(to, true)}'
      and (T."ZPLog ID" is null or cast(T."ZPLog ID" as varchar) = '')
    group by 1, 2
  `;
}

/**
 * Spread one leave record over the working days it covers and return the share
 * that falls inside the requested week. A record in days is converted at 8h/day.
 */
export function leaveHoursInWeek(
  from: Date, to: Date, unit: string, taken: number, wkStart: Date, wkEnd: Date,
): number {
  if (taken <= 0) return 0;
  const totalHours = unit.toLowerCase().startsWith('day') ? taken * 8 : taken;

  const days = eachDay(from, to);
  if (days.length === 0) return 0;
  let basis = days.filter(isWorkingDay);
  if (basis.length === 0) basis = days; // leave booked on a weekend/holiday

  const perDay = totalHours / basis.length;
  const inWeek = basis.filter(
    (d) => d.getTime() >= wkStart.getTime() && d.getTime() <= wkEnd.getTime(),
  );
  return perDay * inWeek.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type QueryFn = (sql: string) => Promise<Record<string, string>[]>;

/** Exported with an injectable query function so the pipeline can be tested against fixtures. */
export async function buildReport(weekStartISO: string, query: QueryFn = runQuery): Promise<WeekReport> {
  const wkStart = parseISODay(weekStartISO);
  const wkEnd = addDays(wkStart, 6);

  const [employees, timeLogs, leave, sprints] = await Promise.all([
    query(sqlEmployees()),
    query(sqlTimeLogs(wkStart, wkEnd)),
    query(sqlLeave(wkStart, wkEnd)),
    query(sqlSprints(wkStart, wkEnd)),
  ]);

  const people = new Map<string, PersonRow>();

  const blank = (email: string, name: string): PersonRow => ({
    email,
    name: name || email,
    department: '',
    projects: 0, internal: 0, service: 0, absence: 0, sprints: 0, total: 0,
    meetsTarget: false,
    detail: [],
  });

  const upsert = (rawEmail: string, name: string, department?: string): PersonRow | null => {
    const email = (rawEmail || '').trim().toLowerCase();
    if (!email || !email.endsWith('@kleecks.com') || EXCLUDED_EMAILS.has(email)) return null;
    let row = people.get(email);
    if (!row) { row = blank(email, name); people.set(email, row); }
    else if (!row.name && name) { row.name = name; }
    if (department && !row.department) row.department = department.trim();
    return row;
  };

  // 1. Everyone active, so people with nothing logged still show up.
  for (const e of employees) upsert(e.emp_email, e.emp_name, e.department);

  // 2. Time logs from Zoho People. People mirrors every Zoho Projects log and
  //    additionally holds the People-only service projects, so it is the single
  //    source for all three project columns - no double counting.
  for (const r of timeLogs) {
    const row = upsert(r.emp_email, r.emp_name);
    if (!row) continue;
    const hours = toNumber(r.hours);
    if (hours === 0) continue;
    const label = (r.project_name || '').trim() || '(no project)';
    const category = classifyProject(label);
    row[category] += hours;
    row.detail.push({ label, category, hours });
  }

  // 3. Approved leave, spread across the working days it covers.
  for (const r of leave) {
    const row = upsert(r.emp_email, r.emp_name);
    if (!row) continue;
    let from: Date; let to: Date;
    try {
      from = parseISODay(r.date_from);
      to = parseISODay(r.date_to);
    } catch { continue; }
    const hours = leaveHoursInWeek(from, to, r.unit || '', toNumber(r.taken), wkStart, wkEnd);
    if (hours <= 0) continue;
    row.absence += hours;
    row.detail.push({ label: (r.leave_type || 'Leave').trim(), category: 'absence', hours });
  }

  // 4. Zoho Sprints (development team), Sprints-native logs only.
  for (const r of sprints) {
    const row = upsert(r.emp_email, r.user_name);
    if (!row) continue;
    const hours = toNumber(r.minutes) / 60;
    if (hours === 0) continue;
    row.sprints += hours;
    row.detail.push({ label: 'Zoho Sprints', category: 'sprints', hours });
  }

  const rows = [...people.values()].map((row) => {
    const merged = new Map<string, DetailLine>();
    for (const d of row.detail) {
      const key = `${d.category}::${d.label}`;
      const existing = merged.get(key);
      if (existing) existing.hours += d.hours;
      else merged.set(key, { ...d });
    }
    const total = row.projects + row.internal + row.service + row.absence + row.sprints;
    return {
      ...row,
      department: row.department || 'Unassigned',
      projects: round2(row.projects),
      internal: round2(row.internal),
      service: round2(row.service),
      absence: round2(row.absence),
      sprints: round2(row.sprints),
      total: round2(total),
      meetsTarget: round2(total) >= WEEKLY_TARGET,
      detail: [...merged.values()]
        .map((d) => ({ ...d, hours: round2(d.hours) }))
        .sort((a, b) => b.hours - a.hours),
    };
  });

  rows.sort((a, b) => a.total - b.total || a.name.localeCompare(b.name, 'en-GB'));

  const totals = rows.reduce(
    (acc, r) => ({
      people: acc.people + 1,
      below: acc.below + (r.meetsTarget ? 0 : 1),
      projects: round2(acc.projects + r.projects),
      internal: round2(acc.internal + r.internal),
      service: round2(acc.service + r.service),
      absence: round2(acc.absence + r.absence),
      sprints: round2(acc.sprints + r.sprints),
      total: round2(acc.total + r.total),
    }),
    { people: 0, below: 0, projects: 0, internal: 0, service: 0, absence: 0, sprints: 0, total: 0 },
  );

  const holidays = eachDay(wkStart, wkEnd)
    .map((d) => ({ date: toISODay(d), name: holidayName(d) }))
    .filter((h): h is { date: string; name: string } => Boolean(h.name));

  const { week, year } = isoWeek(wkStart);

  return {
    weekStart: toISODay(wkStart),
    weekEnd: toISODay(wkEnd),
    rangeLabel: formatRange(wkStart, wkEnd),
    isoLabel: `Week ${String(week).padStart(2, '0')} / ${year}`,
    target: WEEKLY_TARGET,
    inProgress: wkStart.getTime() >= weekStart(new Date()).getTime(),
    generatedAt: new Date().toISOString(),
    holidays,
    departments: [...new Set(rows.map((r) => r.department))].sort((a, b) =>
      a.localeCompare(b, 'en-GB'),
    ),
    rows,
    totals,
  };
}

/**
 * Cached per week. The Monday cron drops the tag so the freshly consolidated
 * timesheet is picked up; otherwise a week is re-read at most every six hours.
 */
export function getWeekReport(weekStartISO: string): Promise<WeekReport> {
  return unstable_cache(
    () => buildReport(weekStartISO),
    // The version segment is part of the cache key: bump it whenever the shape
    // of WeekReport changes, so entries written by an older deployment are not
    // served to a newer page that expects new fields.
    ['weekly-hours', 'v2', weekStartISO],
    { revalidate: 21_600, tags: ['weekly-hours'] },
  )();
}

/** Selectable weeks: the last `count` closed weeks, newest first. */
export function selectableWeeks(count = 26, now: Date = new Date()): string[] {
  const latest = lastClosedWeekStart(now);
  const out: string[] = [toISODay(weekStart(now))]; // current, still in progress
  for (let i = 0; i < count; i++) out.push(toISODay(addDays(latest, -7 * i)));
  return out;
}

export function defaultWeek(now: Date = new Date()): string {
  return toISODay(lastClosedWeekStart(now));
}
