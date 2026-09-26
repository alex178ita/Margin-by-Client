import { applyBillingFix } from "../../../lib/zoho";
import { tokenOk } from "../../../lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Rimette il flag billable dei time log in linea con la regola.
 *
 *   /api/billing-fix?k=<token>                 prova: dice cosa cambierebbe
 *   /api/billing-fix?k=<token>&apply=1         esegue, a lotti
 *   /api/billing-fix?k=<token>&apply=1&limit=800&from=2025&to=2026
 *
 * Senza apply non tocca niente: è la modalità predefinita apposta, perché il
 * contrario — eseguire per difetto e provare su richiesta — è il modo in cui si
 * riscrivono seimila righe per sbaglio.
 *
 * L'esecuzione è a lotti perché la funzione ha 300 secondi e ogni log è una
 * chiamata a Zoho: il report dice sempre quanti ne restano, e si richiama
 * finché quel numero non è zero.
 */
export async function GET(request) {
  const url = new URL(request.url);
  if (!tokenOk(url.searchParams.get("k"))) {
    return Response.json({ ok: false, error: "not authorised" }, { status: 401 });
  }

  const apply = url.searchParams.get("apply") === "1";
  try {
    const out = await applyBillingFix({
      apply,
      limit: url.searchParams.get("limit"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      seconds: 200,
    });
    return Response.json({ ok: true, ...out });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
