import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { defaultWeek, getWeekReport } from '@/lib/report';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Called by the Vercel cron on Monday at 12:00 UTC (14:00 Europe/Rome in
 * summer, 13:00 in winter), after Zoho has consolidated the timesheet.
 * Drops the cached weeks and warms the one the dashboard opens on.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    const fromQuery = new URL(request.url).searchParams.get('secret');
    if (auth !== `Bearer ${secret}` && fromQuery !== secret) {
      return NextResponse.json({ ok: false, error: 'Unauthorised' }, { status: 401 });
    }
  }

  revalidateTag('weekly-hours', { expire: 0 });

  const week = defaultWeek();
  try {
    const report = await getWeekReport(week);
    return NextResponse.json({
      ok: true,
      week,
      people: report.totals.people,
      below: report.totals.below,
      hours: report.totals.total,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, week, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
