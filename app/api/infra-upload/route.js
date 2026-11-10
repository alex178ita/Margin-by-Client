import { writeInfra } from "../../../lib/store";
import { parseInfra } from "../../../lib/infra";
import { roleFromCookies, tokenOk } from "../../../lib/access";
import { invalidateSnapshot } from "../../../lib/zoho";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Carica il rendiconto dei costi del cluster.
 *
 * Perché un caricamento a mano. Il file nasce fuori da Zoho e oggi non c'è un
 * indirizzo che lo serva: finché non ci sarà, qualcuno lo porta a mano, e
 * tenerlo nel Blob è meglio che tenerlo nel codice — cambia una volta al mese e
 * non deve costare un deploy.
 *
 * Chi può farlo. Serve il token della pagina e i costi sbloccati: questo file
 * decide i margini di tutti i clienti, quindi non lo carica chi passa di lì.
 *
 * Cosa viene validato. Che sia JSON, che contenga righe riconoscibili e che i
 * clienti siano più di uno: un file vuoto o di forma sbagliata azzererebbe in
 * silenzio il costo infrastrutturale di tutti, che è il guaio peggiore
 * possibile. Meglio rifiutare e dire perché.
 */
export async function POST(request) {
  const url = new URL(request.url);
  if (!tokenOk(url.searchParams.get("k"))) {
    return Response.json({ ok: false, error: "not authorised" }, { status: 401 });
  }
  if (roleFromCookies() !== "full") {
    return Response.json({
      ok: false,
      error: "the internal costs are locked on this browser. Unlock them with the password first: " +
             "this file sets the infrastructure cost of every client.",
    }, { status: 403 });
  }

  let json;
  try {
    json = await request.json();
  } catch (e) {
    return Response.json({ ok: false, error: "that is not valid JSON" }, { status: 400 });
  }

  const { rows, asOf } = parseInfra(json);
  if (!rows.length) {
    return Response.json({
      ok: false,
      error: "no client rows recognised in the file. Expected either the cluster report " +
             "({ meta, clients: [ { client, total } ] }), a list of { client, amount }, " +
             "or a plain { client: amount } map.",
    }, { status: 400 });
  }

  const monthly = Math.round(rows.reduce((s, r) => s + (r.monthly || 0), 0) * 100) / 100;
  if (!monthly) {
    return Response.json({
      ok: false,
      error: `the file has ${rows.length} client rows but they all add up to zero, ` +
             "which would wipe the infrastructure cost of every client",
    }, { status: 400 });
  }

  let written;
  try {
    written = await writeInfra({
      uploaded_at: new Date().toISOString(),
      costs_as_of: asOf,
      data: json,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }

  // Lo snapshot in memoria porta ancora i costi vecchi: senza questo, il file
  // nuovo si vedrebbe solo al prossimo cron o alla prossima istanza.
  try { invalidateSnapshot(); } catch (e) { /* al massimo si aspetta il refresh */ }

  return Response.json({
    ok: true,
    clients: rows.length,
    monthly_total: monthly,
    annual_total: Math.round(monthly * 12 * 100) / 100,
    costs_as_of: asOf,
    bytes: written.bytes,
    note: "Saved. Press Reload now to rebuild the page with these costs.",
  });
}
