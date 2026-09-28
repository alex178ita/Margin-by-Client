/**
 * Le ore registrate in Zoho Sprints.
 *
 * Perché esistono e perché nessuno le vedeva. Lo sviluppo lavora a sprint e
 * registra il tempo lì, non in Projects e non in People. Zoho ha un ponte fra
 * Sprints e Projects, ma su questo portale è praticamente spento: sulla finestra
 * 2025-2026 sono 5.942 ore, e di queste ne è arrivata in Projects esattamente
 * una, da 4 ore. Tutto il resto è lavoro fatto e pagato che non compare in
 * nessuna delle due fonti che la dashboard leggeva.
 *
 * Perché non toccano i margini dei clienti. Quelle ore stanno quasi tutte su un
 * progetto solo, `Rainbow`, che è il prodotto: sviluppo interno, non lavoro
 * venduto a qualcuno. Sommarle a un cliente sarebbe sbagliato. Vanno dove
 * devono andare, cioè nella vista dei progetti interni, e lì cambiano il quadro
 * parecchio: sono più del doppio di quanto Projects registri su tutto l'interno.
 *
 * Dove invece contano eccome è il conteggio per persona. Chi sviluppa ha lì la
 * maggior parte del proprio tempo, quindi qualunque vista che sommi le ore di
 * una persona senza Sprints la sottostima, e non di poco.
 */
import { runCostQueryRaw, parseCsv, num, MIN_YEAR } from "./zoho.js";

const S_LOGS = "Timesheets (Zoho Sprints)";
const S_PROJECTS = "Projects (Zoho Sprints)";
const S_USERS = "Users (Zoho Sprints)";

const round = (n) => Math.round(n * 100) / 100;

/**
 * Le ore di Sprints sono in minuti.
 *
 * La colonna "Hours" esiste ma porta una durata formattata ("0.08:00:00"), non
 * un numero: sommarla dà zero senza dire niente. "Log Time in Minutes" è un
 * intero e si divide.
 */
const HOURS = `SUM(T."Log Time in Minutes")/60`;

/**
 * Un progetto Sprints per riga: ore nella finestra, ore da sempre, e l'id del
 * progetto Projects corrispondente quando l'integrazione è attiva — serve a non
 * contare due volte le ore che il ponte ha già copiato di là.
 */
export async function fetchSprintsProjects(opts) {
  const from = Number(opts && opts.from) || MIN_YEAR();
  const sql =
    `SELECT CONCAT(P."Project ID",'') AS sid, ` +
    `REPLACE(REPLACE(P."Project Name",',',';'),'"','') AS name, ` +
    `REPLACE(REPLACE(P."Status",',',';'),'"','') AS status, ` +
    `CONCAT(P."ZPProject ID",'') AS zpid, ` +
    `SUM(CASE WHEN YEAR(T."Log Date") >= ${from} THEN T."Log Time in Minutes" ELSE 0 END)/60 AS ore, ` +
    `${HOURS} AS ore_tot, ` +
    `SUM(CASE WHEN T."ZPLog ID" IS NULL OR TRIM(CONCAT(T."ZPLog ID",'')) = '' THEN 0 ` +
    `ELSE T."Log Time in Minutes" END)/60 AS ore_gia_in_projects, ` +
    `COUNT(*) AS n_log ` +
    `FROM "${S_LOGS}" T JOIN "${S_PROJECTS}" P ` +
    `ON CONCAT(P."Project ID",'') = CONCAT(T."Project ID",'') ` +
    `GROUP BY CONCAT(P."Project ID",''), ` +
    `REPLACE(REPLACE(P."Project Name",',',';'),'"',''), ` +
    `REPLACE(REPLACE(P."Status",',',';'),'"',''), CONCAT(P."ZPProject ID",'')`;

  const rows = [];
  for (const r of parseCsv(await runCostQueryRaw(sql))) {
    const hours = round(num(r.ore));
    const lifetime = round(num(r.ore_tot));
    if (!hours && !lifetime) continue;
    rows.push({
      id: "sprints:" + String(r.sid || "").trim(),
      name: String(r.name || "").trim(),
      status: String(r.status || "").trim() || null,
      // Quando il progetto è agganciato a Projects le sue ore potrebbero già
      // essere di là: chi legge deve poterlo sapere invece di scoprirlo da un
      // totale che non torna.
      zpid: String(r.zpid || "").trim() || null,
      hours,
      lifetime,
      alreadyInProjects: round(num(r.ore_gia_in_projects)),
      logs: Number(r.n_log) || 0,
    });
  }
  rows.sort((a, b) => b.hours - a.hours);
  return rows;
}

/**
 * Ore di Sprints per persona, agganciate all'utente di Projects tramite email —
 * lo stesso ponte usato per People, per lo stesso motivo: è l'unico campo
 * valorizzato su tutti.
 *
 * Serve alle viste che contano il tempo di una persona. Senza, chi sviluppa
 * risulta lavorare molto meno di quanto lavori.
 */
export async function fetchSprintsPeople(opts) {
  const from = Number(opts && opts.from) || MIN_YEAR();
  const sql =
    `SELECT CONCAT(Z."User ID",'') AS uid, ` +
    `REPLACE(REPLACE(U."User Name",',',';'),'"','') AS name, ` +
    `${HOURS} AS ore, COUNT(*) AS n_log ` +
    `FROM "${S_LOGS}" T JOIN "${S_USERS}" U ` +
    `ON CONCAT(U."ZSUser ID",'') = CONCAT(T."Owner ID",'') ` +
    `LEFT JOIN "Users (Zoho Projects)" Z ` +
    `ON LOWER(TRIM(Z."User Email")) = LOWER(TRIM(U."Email ID")) ` +
    `WHERE YEAR(T."Log Date") >= ${from} ` +
    `GROUP BY CONCAT(Z."User ID",''), REPLACE(REPLACE(U."User Name",',',';'),'"','')`;

  const rows = [];
  for (const r of parseCsv(await runCostQueryRaw(sql))) {
    const hours = round(num(r.ore));
    if (!hours) continue;
    rows.push({
      // Senza uid la persona esiste in Sprints e non in Projects: va mostrata
      // lo stesso, perché le sue ore sono reali, ma non si può prezzarla.
      uid: String(r.uid || "").trim() || null,
      name: String(r.name || "").trim(),
      hours,
      logs: Number(r.n_log) || 0,
    });
  }
  rows.sort((a, b) => b.hours - a.hours);
  return rows;
}

/**
 * Chi ha registrato ore su un progetto di Sprints, per persona e per mese.
 *
 * Serve al file scaricabile dalla scheda Sprints, che prima non c'era: quelle
 * ore si vedevano solo come totale di progetto, e alla domanda ovvia — chi le
 * ha fatte — non c'era risposta da nessuna parte nella dashboard.
 *
 * Il mese non è un dettaglio decorativo: è quello che permette di prezzare le
 * ore. Sprints non porta una tariffa, ma chi ci registra è quasi sempre a
 * libro paga, e per chi lo è il costo è lo stesso conto di ogni altra ora —
 * cedolino del mese in cui l'ora è stata registrata. Per gli altri resta
 * scoperto, e il file lo dice riga per riga invece di annacquare il totale.
 */
export async function fetchSprintsProjectPeople(sid) {
  const pid = String(sid || "").replace(/^sprints:/, "").trim();
  if (!pid) throw new Error("no Sprints project id");

  const meta =
    `SELECT REPLACE(REPLACE(P."Project Name",',',';'),'"','') AS name, ` +
    `REPLACE(REPLACE(P."Status",',',';'),'"','') AS status, ` +
    `CONCAT(P."ZPProject ID",'') AS zpid ` +
    `FROM "${S_PROJECTS}" P WHERE CONCAT(P."Project ID",'') = '${pid}'`;

  const sql =
    `SELECT CONCAT(Z."User ID",'') AS uid, ` +
    `REPLACE(REPLACE(U."User Name",',',';'),'"','') AS name, ` +
    `LOWER(TRIM(U."Email ID")) AS email, ` +
    `YEAR(T."Log Date") AS yr, MONTH(T."Log Date") AS mo, ` +
    `${HOURS} AS ore, COUNT(*) AS n_log, ` +
    `MIN(T."Log Date") AS primo, MAX(T."Log Date") AS ultimo, ` +
    // Le ore che il ponte ha già copiato in Zoho Projects: senza questa colonna
    // non si può sapere se sommarle a quelle di Projects o se sono le stesse.
    `SUM(CASE WHEN T."ZPLog ID" IS NULL OR TRIM(CONCAT(T."ZPLog ID",'')) = '' THEN 0 ` +
    `ELSE T."Log Time in Minutes" END)/60 AS ore_gia_in_projects ` +
    `FROM "${S_LOGS}" T JOIN "${S_USERS}" U ` +
    `ON CONCAT(U."ZSUser ID",'') = CONCAT(T."Owner ID",'') ` +
    `LEFT JOIN "Users (Zoho Projects)" Z ` +
    `ON LOWER(TRIM(Z."User Email")) = LOWER(TRIM(U."Email ID")) ` +
    `WHERE CONCAT(T."Project ID",'') = '${pid}' ` +
    `GROUP BY CONCAT(Z."User ID",''), ` +
    `REPLACE(REPLACE(U."User Name",',',';'),'"',''), LOWER(TRIM(U."Email ID")), ` +
    `YEAR(T."Log Date"), MONTH(T."Log Date")`;

  const m = parseCsv(await runCostQueryRaw(meta))[0] || {};
  const rows = [];
  for (const r of parseCsv(await runCostQueryRaw(sql))) {
    const hours = round(num(r.ore));
    if (!hours) continue;
    rows.push({
      uid: String(r.uid || "").trim() || null,
      name: String(r.name || "").trim(),
      email: String(r.email || "").trim() || null,
      yr: String(r.yr || "").trim(),
      mo: Number(r.mo) || null,
      hours,
      logs: Number(r.n_log) || 0,
      first: String(r.primo || "").slice(0, 10) || null,
      last: String(r.ultimo || "").slice(0, 10) || null,
      bridged: round(num(r.ore_gia_in_projects)),
    });
  }
  return {
    id: "sprints:" + pid,
    sid: pid,
    name: String(m.name || "").trim() || ("Sprints project " + pid),
    status: String(m.status || "").trim() || null,
    zpid: String(m.zpid || "").trim() || null,
    rows,
  };
}
