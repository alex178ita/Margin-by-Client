import { applyBillingFix } from "../../../lib/zoho";
import { tokenOk } from "../../../lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Rimette il flag billable dei time log in linea con la regola.
 *
 *   /api/billing-fix?k=<token>                 prova: dice cosa cambierebbe
 *   /api/billing-fix?k=<token>&apply=1         esegue, a lotti
 * /api/billing-fix?k=<token>&apply=1&offset=100   lotto successivo (max 90 per volta)
 *
 * L'offset non è un dettaglio: Analytics si aggiorna ogni due o tre ore, quindi
 * i log appena scritti continuano a comparire nell'elenco. Ripetere la stessa
 * chiamata senza avanzare riscriverebbe sempre i primi, all'infinito.
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
      offset: url.searchParams.get("offset"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      seconds: 200,
    });
    return Response.json({ ok: true, ...out });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
