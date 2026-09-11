import { projectBreakdown } from "../../../lib/zoho";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Dettaglio ore e costo per persona su alcuni progetti, per verificare a mano
 * i numeri della dashboard.
 *   /api/breakdown?k=<token>&q=tiffany,haier,mcm - strategy
 */
export async function GET(request) {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET || process.env.ACCESS_TOKEN;
  if (secret && url.searchParams.get("k") !== secret) {
    return Response.json({ ok: false, error: "non autorizzato" }, { status: 401 });
  }
  const q = (url.searchParams.get("q") || "").split(",");
  try {
    return Response.json({ ok: true, ...(await projectBreakdown(q)) });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
