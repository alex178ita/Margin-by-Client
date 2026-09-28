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
   * della pagina, che gira negli indirizzi dei Web Tab: è una chiave a parte,
   * in un header e mai in un URL.
   *
   * Due nomi, e ne basta uno. `PROJECT_SUMMARY_API_KEY` è il nome storico, di
   * quando a chiamare era una sola app; `MARGIN_API_KEY` è il nome che le app
   * che chiamano usano già dalla loro parte, quindi è quello che permette di
   * tenere un'unica variabile condivisa a livello di team invece di una copia
   * per progetto — e un segreto in tre copie è un segreto che prima o poi si
   * ruota solo in due.
   *
   * Valgono entrambe insieme: durante un cambio di chiave si aggiunge la nuova
   * qui, si aggiornano le app una alla volta, e solo alla fine si toglie la
   * vecchia. Senza questo, fra il primo e l'ultimo aggiornamento le app che non
   * sono ancora passate rispondono 401.
   */
  const secrets = [process.env.MARGIN_API_KEY, process.env.PROJECT_SUMMARY_API_KEY]
    .map((s) => String(s || "").trim()).filter(Boolean);
  if (!secrets.length) {
    return Response.json(
      { ok: false, error: "neither MARGIN_API_KEY nor PROJECT_SUMMARY_API_KEY is set on this deployment" },
      { status: 503 });
  }
  const auth = request.headers.get("authorization") || "";
  const given = auth.replace(/^Bearer\s+/i, "").trim() || url.searchParams.get("k") || "";
  if (!given || !secrets.includes(given)) {
    return Response.json({ ok: false, error: "not authorised" }, { status: 401 });
  }

  const projectId = String(url.searchParams.get("projectId") || "").trim();
  /**
   * Più progetti in una volta.
   *
   * Project Task Estimates Tracking mostra un elenco di progetti e a ognuno
   * affianca le ore: chiedendole una per una sarebbe una chiamata per riga, e
   * ogni chiamata è un'invocazione serverless che rilegge lo stesso snapshot.
   * Lo snapshot è uno, quindi la lettura è una: `projectIds=a,b,c` (o `all=1`)
   * risponde con una mappa e il costo resta quello di una sola richiesta.
   *
   * Qui un id sconosciuto non è un errore — in un elenco ce ne sono sempre —
   * quindi semplicemente non compare nella mappa, e chi chiama capisce da sé
   * quali non c'erano.
   */
  const idsParam = String(url.searchParams.get("projectIds") || "").trim();
  const wantAll = url.searchParams.get("all") === "1";
  if (!projectId && !idsParam && !wantAll) {
    return Response.json(
      { ok: false, error: "projectId, projectIds or all=1 is required" }, { status: 400 });
  }

  try {
    const snap = await buildSnapshot();

    if (!projectId) {
      const wanted = wantAll
        ? null
        : new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500));
      const out = {};
      for (const p of snap.projects || []) {
        const id = String(p.id);
        if (wanted && !wanted.has(id)) continue;
        out[id] = shape(p, id);
      }
      return Response.json({
        ok: true,
        projects: out,
        ratesStatus: (RATE_YEARS[String(new Date().getUTCFullYear())] || {}).label || null,
        asOf: (snap.generated_at || "").slice(0, 10),
      }, { headers: { "Cache-Control": "no-store" } });
    }

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

    return Response.json({
      ok: true,
      ...shape(p, projectId),
      ratesStatus: (RATE_YEARS[String(new Date().getUTCFullYear())] || {}).label || null,
      // Quando la dashboard ha letto Zoho l'ultima volta. Project Summary può
      // dirlo a chi guarda invece di far credere che sia di adesso.
      asOf: (snap.generated_at || "").slice(0, 10),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

const min = (h) => Math.round((Number(h) || 0) * 60);
const eur = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Le cifre di un progetto, identiche per la richiesta singola e per la mappa. */
function shape(p, projectId) {
  return {
    projectId,
    projectName: p.n,
    // Costo del lavoro sul progetto, al netto del debug interno — la stessa
    // regola con cui la dashboard calcola i margini.
    totalCost: eur(p.cost),
    // Il totale vero: Projects più le ore recuperate da Zoho People.
    loggedMinutes: min(p.hours),
    // La parte che sta solo in People: chi mostra il dettaglio task per task non
    // può mostrarla riga per riga, e con questo numero può almeno dichiararla.
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
  };
}
