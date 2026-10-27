import { buildSnapshot } from "../../../lib/zoho";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * La tabella di mappatura dei clienti infrastrutturali, già compilata.
 *
 * Perché esiste. Abbinare i nomi a mano vuol dire mettere due elenchi uno
 * accanto all'altro e sperare di non saltare una riga. Qui l'elenco lo scrive
 * l'app: ogni nome che la fonte espone, il cliente su cui finisce oggi e come
 * ci è arrivato. Si controlla, si corregge quello che è sbagliato, si incolla
 * in `lib/infra-map.js`.
 *
 * `null` a destra vuol dire che quella riga oggi non si abbina a nessuno. Se è
 * giusto così, lasciandolo `null` nel file quella decisione diventa esplicita e
 * smette di comparire come problema.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const secret = (process.env.ACCESS_TOKEN || "").trim();
  if (secret && (url.searchParams.get("k") || "").trim() !== secret) {
    return Response.json({ ok: false, error: "not authorised" }, { status: 401 });
  }

  const snap = await buildSnapshot();
  const inf = (snap.extra_costs && snap.extra_costs.infra) || null;
  if (!inf || !inf.configured) {
    return Response.json({
      ok: false,
      error: "no infrastructure source is configured on this deployment (INFRA_URL is not set), " +
             "so there is nothing to map yet",
    }, { status: 503 });
  }

  return Response.json({
    ok: true,
    asOf: (snap.generated_at || "").slice(0, 10),
    clients_with_cost: inf.clients_with_cost,
    matched_on_words: inf.inferred || 0,
    unmatched: inf.unmatched || [],
    how_to: "Check the table below, correct what is wrong, and paste it into lib/infra-map.js. " +
            "A name mapped to null is left out of every margin on purpose.",
    mapping: inf.proposal || {},
  }, { headers: { "Cache-Control": "no-store" } });
}
