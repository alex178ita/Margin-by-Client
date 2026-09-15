import Dashboard from '@/components/Dashboard';
import Logo from '@/components/Logo';
import { defaultWeek, getWeekReport, selectableWeeks, type WeekReport } from '@/lib/report';
import { addDays, formatRange, isoWeek, parseISODay, weekStart, toISODay } from '@/lib/dates';

export const maxDuration = 60;

function weekLabel(iso: string, now: Date): string {
  const start = parseISODay(iso);
  const { week, year } = isoWeek(start);
  const current = toISODay(weekStart(now)) === iso;
  return `Week ${String(week).padStart(2, '0')} / ${year} · ${formatRange(start, addDays(start, 6))}${
    current ? ' · in progress' : ''
  }`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const now = new Date();
  const weekValues = selectableWeeks(26, now);

  const requested = typeof params.week === 'string' ? params.week : '';
  const week = weekValues.includes(requested) ? requested : defaultWeek(now);
  const weeks = weekValues.map((value) => ({ value, label: weekLabel(value, now) }));

  let report: WeekReport | null = null;
  let error: string | null = null;
  try {
    report = await getWeekReport(week);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <Logo className="masthead-logo" height={24} />
          <h1>Weekly Hours Logged</h1>
          <p className="version">v.0.1 – Beta for testing</p>
        </div>
      </header>

      <main className="wrap">
        {error ? (
          <p className="notice error" style={{ marginTop: 24 }}>
            <strong>Could not read Zoho Analytics.</strong>
            <br />
            {error}
          </p>
        ) : (
          <Dashboard report={report!} weeks={weeks} currentWeek={week} />
        )}

        <footer className="page">
          Projects, internal projects and service projects come from the Zoho People timesheet,
          which mirrors every Zoho Projects log and also holds the People-only service projects, so
          nothing is counted twice. Projects starting with <code>_</code> or <code>::</code> count as
          internal; those starting with a dash count as service; everything else, presales
          (<code>=</code>) included, counts as a client project. Absence is approved leave spread
          over the working days it covers, at 8h per day. Sprints shows only logs native to Zoho
          Sprints — logs pushed there from Zoho Projects are dropped so they are not double counted.
          {report && (
            <>
              <br />
              Data read {new Date(report.generatedAt).toLocaleString('en-GB', { timeZone: 'Europe/Rome' })} (Europe/Rome).
            </>
          )}
        </footer>
      </main>
    </>
  );
}
