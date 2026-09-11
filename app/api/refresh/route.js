import { revalidatePath } from "next/cache";
import { buildSnapshot } from "../../../lib/zoho";

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
    const snap = await buildSnapshot();
    revalidatePath("/");
    return Response.json({
      ok: true,
      ms: Date.now() - t0,
      clients: snap.totals.clients,
      invoices: snap.totals.invoices,
      revenue: snap.totals.revenue,
      cost: snap.totals.cost,
      cost_status: snap.cost_status,
      cost_by_year: snap.cost_by_year,
      accrual: snap.accrual,
      unmatched: snap.unmatched.length,
    });
  } catch (e) {
    return Response.json({ ok: false, ms: Date.now() - t0, error: e.message }, { status: 500 });
  }
}
