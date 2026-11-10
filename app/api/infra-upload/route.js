import { writeInfra, readSnapshot, writeSnapshot, storeReady } from "../../../lib/store";
import { parseInfra } from "../../../lib/infra";
import { roleFromCookies, tokenOk } from "../../../lib/access";
import { invalidateSnapshot, applyInfra } from "../../../lib/zoho";

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

  // Lo snapshot in memoria di QUESTA istanza porta ancora i costi vecchi.
  try { invalidateSnapshot(); } catch (e) { /* al massimo si aspetta il refresh */ }

  /**
   * Lo snapshot salvato va aggiornato subito, qui.
   *
   * Senza questo passaggio il file caricato restava invisibile, ed era il
   * difetto peggiore possibile: svuotare la memoria di un'istanza non serve a
   * niente, perche' la richiesta successiva legge lo snapshot scritto nel Blob —
   * condiviso da tutte le istanze e valido per ore — che i costi non ce li ha.
   * Il risultato era un caricamento che diceva "fatto" e una pagina che
   * continuava a dire "none" fino al cron notturno.
   *
   * Si puo' fare senza toccare Zoho perche' questi costi da Zoho non vengono:
   * l'abbinamento ai clienti e' una passata su una lista di cinquanta nomi. Si
   * rilegge lo snapshot, gli si attaccano i costi e lo si riscrive. Se qualcosa
   * va storto non e' un fallimento del caricamento — il file e' salvato — ma va
   * detto, perche' cambia cosa si vede ricaricando.
   *
   * `generated_at` non si tocca: l'eta' dello snapshot si legge da li', non
   * dalla data di scrittura, quindi riscriverlo non lo fa sembrare piu' fresco e
   * non rimanda il prossimo giro vero su Zoho. Chi un domani pensasse di
   * aggiornarlo "per coerenza" allungherebbe la vita a dati vecchi di ore.
   */
  let applied = null, applyError = null;
  try {
    if (storeReady()) {
      const saved = await readSnapshot();
      if (saved && saved.data && Array.isArray(saved.data.clients)) {
        await applyInfra(saved.data, {
          rows, configured: true, error: null, asOf,
          source: "uploaded", uploadedAt: new Date().toISOString(),
        });
        await writeSnapshot(saved.data);
        const ix = saved.data.extra_costs && saved.data.extra_costs.infra;
        applied = ix ? {
          clients_matched: ix.clients_with_cost,
          unmatched: (ix.unmatched || []).map((u) => u.client),
          inferred: ix.inferred || 0,
        } : null;
      }
    }
  } catch (e) {
    applyError = String(e.message || e).slice(0, 200);
  }

  return Response.json({
    ok: true,
    clients: rows.length,
    monthly_total: monthly,
    annual_total: Math.round(monthly * 12 * 100) / 100,
    costs_as_of: asOf,
    bytes: written.bytes,
    applied,
    apply_error: applyError,
    note: applied
      ? `Saved and applied to ${applied.clients_matched} clients. Press Reload now to see them.`
      : "Saved. Press Reload now to rebuild the page with these costs.",
  });
}
