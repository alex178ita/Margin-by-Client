import { applyRatePlan } from "../../../lib/zoho";
import { tokenOk, roleFromCookies } from "../../../lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Allinea in Zoho Projects la tariffa oraria delle persone sui progetti di un
 * anno. Non c'è un pulsante: è una scrittura su centinaia di righe e va fatta
 * di proposito, dopo aver guardato l'anteprima in Excel.
 *
 *   /api/rateplan?k=<token>&year=2026              cosa farebbe, senza scrivere
 *   /api/rateplan?k=<token>&year=2026&apply=yes    scrive davvero
 *   ...&projects=<id>,<id>                         limita a certi progetti
 */
export async function GET(request) {
  const url = new URL(request.url);
  if (!tokenOk(url.searchParams.get("k")) || roleFromCookies() !== "full") {
    return Response.json({ ok: false, error: "not authorised" }, { status: 401 });
  }
  const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
  const apply = url.searchParams.get("apply") === "yes";
  const projects = (url.searchParams.get("projects") || "").split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const res = await applyRatePlan(year, { apply, projects: projects.length ? projects : null });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
