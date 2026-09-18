import { fetchProjectCosts, RATE_YEARS, MIN_YEAR, timeLogColumns, parseCsv, num, runCostQueryRaw } from "../../../lib/zoho";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Costo di un singolo progetto per l'app Project Summary (pulsante nei deal CRM).
 *   GET /api/project-cost?projectId=<id progetto Zoho Projects>
 *   Authorization: Bearer <PROJECT_SUMMARY_API_KEY>
 *
 * Stesse regole della dashboard: tariffa dei cedolini del MESE del time log,
 * ore della tasklist "_INTERNAL DEBUG & FIX" fuori dal costo e riportate a parte,
 * ore senza tariffa escluse e segnalate. I costi di tutti i progetti vengono
 * letti con una sola query Analytics e tenuti in memoria dieci minuti.
 */
let CACHE = null;
const TTL = 10 * 60 * 1000;

async function costs() {
  if (CACHE && CACHE.at > Date.now() - TTL) return CACHE;
  const [map, hours] = await Promise.all([fetchProjectCosts(), hoursByBillable()]);
  CACHE = { at: Date.now(), map, hours };
  return CACHE;
}

/**
 * Ore per progetto divise fra fatturabili e non fatturabili. Il campo actual_hours del
 * budget di Zoho Projects conta solo le ore Billable: qui serve il totale, con il dettaglio.
 */
async function hoursByBillable() {
  const c = await timeLogColumns();
  const sql =
    `SELECT CONCAT("${c.project}",'') AS pid, "Status" AS st, SUM("${c.hours}")*1 AS hrs ` +
    `FROM "Time Logs (Zoho Projects)" WHERE YEAR("${c.date}") >= ${MIN_YEAR()} ` +
    `GROUP BY "${c.project}", "Status"`;
  const out = {};
  for (const r of parseCsv(await runCostQueryRaw(sql))) {
    const pid = String(r.pid || "").trim();
    if (!pid) continue;
    const billable = !/non/i.test(String(r.st || ""));
    const e = out[pid] || (out[pid] = { billable: 0, nonBillable: 0 });
    if (billable) e.billable += num(r.hrs);
    else e.nonBillable += num(r.hrs);
  }
  return out;
}

const round = (n) => Math.round((n || 0) * 100) / 100;

export async function GET(request) {
  const key = (process.env.PROJECT_SUMMARY_API_KEY || "").trim();
  const auth = request.headers.get("authorization") || "";
  if (!key || auth !== `Bearer ${key}`) {
    return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }
  const projectId = (new URL(request.url).searchParams.get("projectId") || "").replace(/\D/g, "");
  if (!projectId) return Response.json({ ok: false, error: "projectId missing" }, { status: 400 });

  try {
    const { at, map, hours } = await costs();
    const e = map[projectId];
    if (!e) return Response.json({ ok: false, error: "no time logs for this project" }, { status: 404 });

    const year = String(new Date().getUTCFullYear());
    return Response.json({
      ok: true,
      projectId,
      totalCost: round(e.cost),
      loggedMinutes: Math.round((e.hours || 0) * 60),
      billableMinutes: Math.round(((hours[projectId] || {}).billable || 0) * 60),
      nonBillableMinutes: Math.round(((hours[projectId] || {}).nonBillable || 0) * 60),
      minutesWithoutRate: Math.round((e.unrated || 0) * 60),
      debugFixCost: round(e.icost),
      debugFixMinutes: Math.round((e.ihours || 0) * 60),
      costByYear: Object.fromEntries(Object.entries(e.byYear || {}).map(([y, b]) => [y, round(b.cost)])),
      ratesStatus: (RATE_YEARS[year] && RATE_YEARS[year].label) || null,
      asOf: new Date(at).toISOString(),
    });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
