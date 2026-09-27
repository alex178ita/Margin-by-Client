import { peopleDiagnostics } from "../../../lib/people";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Quanto costo manca alla dashboard perché le ore non sono mai arrivate da
 * People a Projects, e la prova che il conto non le sta contando due volte.
 *
 * Serve a decidere se accendere PEOPLE_UNION guardando i numeri invece che
 * fidandosi: "reconciles" deve essere true. Quando è false la chiave che
 * riconosce lo stesso log nei due sistemi ha smesso di funzionare e le ore
 * recuperate non sono affidabili — meglio lasciare il flag spento.
 *
 * Non espone né tariffe né importi: solo ore e conteggi.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET || process.env.ACCESS_TOKEN;
  const key = new URL(request.url).searchParams.get("k");
  if (secret && key !== secret) {
    return Response.json({ ok: false, error: "non autorizzato" }, { status: 401 });
  }
  try {
    const d = await peopleDiagnostics({ from: new URL(request.url).searchParams.get("from") });
    return Response.json({
      ok: true,
      union_attivo: (process.env.PEOPLE_UNION || "").trim().toLowerCase() === "on",
      ...d,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
