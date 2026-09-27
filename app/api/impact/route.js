import { buildSnapshot, lastGoodCosts, LAST_PEOPLE_UNION } from "../../../lib/zoho";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Quanto cambia ogni cliente accendendo la union.
 *
 * Il "dopo" è quello che la dashboard mostra adesso, con PEOPLE_UNION acceso.
 * Il "prima" non viene ricalcolato: mergePeopleHours registra per ogni progetto
 * quanto ha aggiunto People, quindi il prima è una sottrazione. Ricalcolare il
 * costo una seconda volta senza People avrebbe voluto dire rifare tutte le query
 * pesanti, e soprattutto confrontare due letture fatte in momenti diversi — con
 * i log che cambiano sotto, le due colonne non sarebbero comparabili.
 *
 * Richiede il flag acceso: a flag spento non c'è nessun "dopo" da mostrare.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET || process.env.ACCESS_TOKEN;
  const key = new URL(request.url).searchParams.get("k");
  if (secret && key !== secret) {
    return Response.json({ ok: false, error: "non autorizzato" }, { status: 401 });
  }
  if (!LAST_PEOPLE_UNION && (process.env.PEOPLE_UNION || "").trim().toLowerCase() !== "on") {
    return Response.json(
      { ok: false, error: "PEOPLE_UNION non è acceso: senza union non c'è un prima e un dopo da confrontare" },
      { status: 400 });
  }
  try {
    const snap = await buildSnapshot();
    const good = lastGoodCosts();
    const costs = (good && good.map) || {};

    const clients = (snap.clients || []).map((c) => {
      let addCost = 0, addHours = 0;
      for (const pid of c.pj || []) {
        const e = costs[String(pid)];
        if (e && e.people) { addCost += e.people.cost || 0; addHours += e.people.hours || 0; }
      }
      const after = Number(c.cost) || 0;
      const before = after - addCost;
      const rev = Number(c.rt) || 0;
      // Il margine si dichiara solo quando c'è un ricavo: su ricavo zero
      // sarebbe una percentuale di niente, e in un file si legge come un dato.
      const mg = (cost) => (rev > 0 ? r2(((rev - cost) / rev) * 100) : null);
      return {
        cliente: c.c || c.name || null,
        ricavo: r2(rev),
        ore_prima: r2((Number(c.hours) || 0) - addHours),
        ore_dopo: r2(Number(c.hours) || 0),
        ore_agg: r2(addHours),
        costo_prima: r2(before),
        costo_dopo: r2(after),
        costo_agg: r2(addCost),
        margine_prima: mg(before),
        margine_dopo: mg(after),
        punti: rev > 0 ? r2(mg(after) - mg(before)) : null,
      };
    }).filter((x) => x.ore_agg > 0 || x.costo_agg > 0)
      .sort((a, b) => b.costo_agg - a.costo_agg);

    const tot = clients.reduce((s, c) => ({
      ore: s.ore + c.ore_agg, costo: s.costo + c.costo_agg,
    }), { ore: 0, costo: 0 });

    return Response.json({
      ok: true,
      union: LAST_PEOPLE_UNION,
      clienti_toccati: clients.length,
      totale: { ore_aggiunte: r2(tot.ore), costo_aggiunto: r2(tot.costo) },
      clients,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
