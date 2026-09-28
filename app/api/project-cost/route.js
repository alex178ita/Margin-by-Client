import { buildSnapshot, RATE_YEARS } from "../../../lib/zoho";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Le ore e il costo di un progetto, per l'app Project Summary.
 *
 * Perché esiste. Project Summary mostra le ore di un progetto prendendole da
 * `budget_info.actual_hours` di Zoho Projects — cioè quello che Projects sa.
 * Da quando le ore registrate in Zoho People entrano nel conto, quel numero è
 * sistematicamente più basso del vero, e di parecchio su alcuni progetti: la
 * spinta da People a Projects viene rifiutata ogni volta che il task non
 * esiste, è chiuso, è stato spostato o non ha un assegnatario, e quelle ore
 * restano di là per sempre.
 *
 * Il totale giusto lo conosce già questa dashboard, perché è la stessa cifra su
 * cui calcola i margini. Invece di rifare in Project Summary la lettura di
 * People — con la sua chiave di deduplicazione, le sue tariffe e la sua coda su
 * Analytics — la si serve da qui. Una fonte sola: se un giorno il conto cambia,
 * cambia in tutti e due i posti nello stesso momento.
 *
 * `loggedMinutes` è il totale completo: Projects più quello che si è recuperato
 * da People. Chi lo legge non deve sapere da dove viene ciascun pezzo, e il
 * campo `peopleMinutes` c'è solo per poterlo verificare quando un numero non
 * torna — non per essere mostrato.
 *
 * Non tocca Zoho: legge lo snapshot, che il cron riempie la mattina.
 */
export async function GET(request) {
  const url = new URL(request.url);

  /**
   * Chiave propria, non quella della dashboard.
   *
   * Questa risposta contiene un costo, quindi non può stare dietro al token
   * della pagina, che gira negli indirizzi dei Web Tab. `PROJECT_SUMMARY_API_KEY`
   * è condivisa solo fra le due app, in un header e mai in un URL.
   */
  const secret = process.env.PROJECT_SUMMARY_API_KEY;
  if (!secret) {
    return Response.json(
      { ok: false, error: "PROJECT_SUMMARY_API_KEY is not set on this deployment" },
      { status: 503 });
  }
  const auth = request.headers.get("authorization") || "";
  const given = auth.replace(/^Bearer\s+/i, "").trim() || url.searchParams.get("k") || "";
  if (given !== secret) {
    return Response.json({ ok: false, error: "not authorised" }, { status: 401 });
  }

  const projectId = String(url.searchParams.get("projectId") || "").trim();
  if (!projectId) {
    return Response.json({ ok: false, error: "projectId is required" }, { status: 400 });
  }

  try {
    const snap = await buildSnapshot();
    const p = (snap.projects || []).find((x) => String(x.id) === projectId);
    if (!p) {
      // 404 e non 200 con zeri: un progetto che la dashboard non conosce è una
      // cosa diversa da un progetto senza ore, e chi chiama deve poterle
      // distinguere — altrimenti mostra "0 ore" su un progetto che ne ha.
      return Response.json({
        ok: false,
        error: "project not in the snapshot",
        projectId,
        asOf: (snap.generated_at || "").slice(0, 10),
      }, { status: 404 });
    }

    const min = (h) => Math.round((Number(h) || 0) * 60);
    const eur = (n) => Math.round((Number(n) || 0) * 100) / 100;

    return Response.json({
      ok: true,
      projectId,
      projectName: p.n,
      // Costo del lavoro sul progetto, al netto del debug interno — la stessa
      // regola con cui la dashboard calcola i margini.
      totalCost: eur(p.cost),
      // Il totale vero: Projects più le ore recuperate da Zoho People.
      loggedMinutes: min(p.hours),
      // Solo per verifica, non per essere mostrato.
      peopleMinutes: min(p.ph),
      // Ore registrate da chi non ha una tariffa oraria: costano zero qui, e il
      // totale è più basso del vero di altrettanto.
      minutesWithoutRate: min(p.unrated),
      // Il debug interno resta fuori dal costo e si dichiara a parte, come sulla
      // dashboard: è un costo nostro, non del cliente.
      debugFixCost: eur(p.ic),
      debugFixMinutes: min(p.ih),
      costByYear: Object.fromEntries(
        Object.entries(p.cy || {}).map(([y, b]) => [y, eur(b.cost)])),
      ratesStatus: (RATE_YEARS[String(new Date().getUTCFullYear())] || {}).label || null,
      // Quando la dashboard ha letto Zoho l'ultima volta. Project Summary può
      // dirlo a chi guarda invece di far credere che sia di adesso.
      asOf: (snap.generated_at || "").slice(0, 10),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
