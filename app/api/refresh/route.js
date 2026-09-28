import { revalidatePath } from "next/cache";
import { buildSnapshot } from "../../../lib/zoho";
import * as store from "../../../lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Rigenera lo snapshot. Chiamata ogni notte dal cron di Vercel (vercel.json)
 * e disponibile a mano per un refresh immediato.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const key = new URL(request.url).searchParams.get("k");
  if (secret && auth !== `Bearer ${secret}` && key !== secret) {
    return Response.json({ ok: false, error: "non autorizzato" }, { status: 401 });
  }
  if (!process.env.ZOHO_REFRESH_TOKEN) {
    return Response.json({ ok: false, error: "credenziali Zoho non configurate" }, { status: 503 });
  }

  const t0 = Date.now();
  try {
    const snap = await buildSnapshot({ force: true });
    revalidatePath("/");
    return Response.json({
      ok: true,
      ms: Date.now() - t0,
      clients: snap.totals.clients,
      invoices: snap.totals.invoices,
      revenue: snap.totals.revenue,
      cost: snap.totals.cost,
      cost_status: snap.cost_status,
      // L'esito vero della scrittura, non la presenza del token: un "ok" che
      // non ha scritto niente fa credere che il problema sia altrove per giorni.
      store: {
        ready: store.storeReady(),
        write: store.lastWrite() || (snap.cost_status === "ok" ? null : "skipped — cost was pending"),
        max_age_hours: Math.round(store.maxAgeMs() / 3600000),
      },
      // Quali fonti secondarie sono rimaste fuori da questo giro, e quanto
      // Sprints è arrivato: senza, una scheda che sparisce non ha diagnosi.
      side_errors: snap.side_errors || null,
      sprints_projects: snap.sprints && snap.sprints.projects ? snap.sprints.projects.length : 0,
      cost_by_year: snap.cost_by_year,
      accrual: snap.accrual,
      unmatched: snap.unmatched.length,
    });
  } catch (e) {
    return Response.json({ ok: false, ms: Date.now() - t0, error: e.message }, { status: 500 });
  }
}
