/**
 * Le ore che esistono in Zoho People e non sono mai arrivate in Zoho Projects.
 *
 * Perché serve un modulo a parte. Il costo del team lo abbiamo sempre letto dai
 * time log di Projects, ma Projects non è la fonte: è la destinazione di un push
 * che parte da People ogni lunedì e che fallisce in silenzio ogni volta che il
 * task di destinazione non esiste, è chiuso, è stato spostato o non ha un
 * assegnatario. Sulla finestra 2025-2026 sono 10.815 ore mai arrivate: il 39% in
 * più di quelle che la dashboard vede oggi. Un margine calcolato senza quelle ore
 * non è prudenziale, è sbagliato per difetto, e lo è di più sui progetti seguiti
 * peggio — cioè proprio quelli su cui la domanda conta.
 *
 * Perché non si legge semplicemente People e basta. Perché 1.369 ore esistono solo
 * in Projects: chi registra direttamente lì non passa da People. Servono entrambe
 * le fonti, unite senza contare due volte quello che sta in tutte due.
 *
 * Il modulo è pensato per essere usato identico dalle tre app che leggono le ore.
 * L'unica dipendenza è il runner di Analytics dell'app che lo importa.
 */
import { runCostQueryRaw, parseCsv, num, rateFor, MIN_YEAR, INTERNAL_TASKLIST } from "./zoho.js";

const P_LOGS = "Time Logs (Zoho People)";
const P_PROJECTS = "Projects (Zoho People)";
const P_JOBS = "Jobs (Zoho People)";
const P_EMPLOYEES = "Employee (Zoho People)";
const Z_LOGS = "Time Logs (Zoho Projects)";
const Z_USERS = "Users (Zoho Projects)";
const Z_TASKS = "Tasks (Zoho Projects)";

const round = (n) => Math.round(n * 100) / 100;

/**
 * Il ponte fra le persone dei due sistemi è l'email, non l'EmployeeID.
 *
 * Projects ha un campo "Zpeople Employee ID" che sembra fatto esattamente per
 * questo, ed è la prima cosa che abbiamo provato: risolve il 75% delle righe e
 * lascia fuori 6.587 log per 9.308 ore, perché su molti utenti quel campo è
 * vuoto. L'email invece risolve 23.033 righe su 23.033, e senza duplicare nulla
 * — il totale dopo il join è identico al totale prima. Quindi si usa l'email, e
 * il campo che sembrava fatto per questo resta inutilizzato.
 */
const PERSON_BRIDGE =
  `LOWER(TRIM(U."User Email")) = LOWER(TRIM(E."Email ID"))`;

/**
 * La chiave con cui si riconosce lo stesso log nei due sistemi.
 *
 * Non esiste un riferimento incrociato: il log di Projects non porta l'id del
 * log di People che l'ha generato, e viceversa. Quindi il confronto è per
 * contenuto: progetto, task, persona, giorno e durata. Il progetto e il task si
 * confrontano sugli id di Projects, che People conserva nel campo "Reference ID"
 * delle sue tabelle Projects e Jobs — non sul nome, che su decine di progetti è
 * stato ricopiato a mano.
 *
 * La durata entra nella chiave arrotondata al centesimo: i due sistemi la
 * memorizzano in formati diversi e senza arrotondamento due log identici
 * risultano diversi per un errore di virgola mobile.
 *
 * L'ora di registrazione NON entra nella chiave perché People la lascia vuota
 * (From Time e To Time sono vuoti su tutte le righe). Questo ha una conseguenza
 * che va detta: due log della stessa persona, lo stesso giorno, sullo stesso
 * task e della stessa durata sono indistinguibili. Per questo il confronto non è
 * riga per riga ma per conteggio — vedi sotto.
 */
const DAY_KEY = (col) => `CONCAT(YEAR(${col}),'-',MONTH(${col}),'-',DAY(${col}))`;

/** Le righe di People, raggruppate per chiave e contate. */
const PEOPLE_KEYED = (from) =>
  `SELECT CONCAT(PP."Reference ID",'') AS "pid", CONCAT(J."Reference ID",'') AS "tid", ` +
  `CONCAT(U."User ID",'') AS "uid", YEAR(L2."Date") AS "yr", MONTH(L2."Date") AS "mo", ` +
  `${DAY_KEY('L2."Date"')} AS "dk", ROUND(L2."Hours",2) AS "h", COUNT(*) AS "n" ` +
  `FROM "${P_LOGS}" L2 ` +
  // JOIN e non LEFT JOIN sul progetto: una riga di People che non si aggancia a
  // un progetto di Projects non ha un posto dove andare nella dashboard. Sono 35
  // righe per 155 ore sulla finestra intera, e peopleDiagnostics() le conta.
  `JOIN "${P_PROJECTS}" PP ON PP."ID" = L2."Project" ` +
  // LEFT sul job: un log senza job è possibile e vale comunque come ora lavorata.
  `LEFT JOIN "${P_JOBS}" J ON J."ID" = L2."Job Name" ` +
  `JOIN "${P_EMPLOYEES}" E ON E."ID" = L2."User Name" ` +
  `JOIN "${Z_USERS}" U ON ${PERSON_BRIDGE} ` +
  `WHERE YEAR(L2."Date") >= ${from} ` +
  `GROUP BY CONCAT(PP."Reference ID",''), CONCAT(J."Reference ID",''), ` +
  `CONCAT(U."User ID",''), YEAR(L2."Date"), MONTH(L2."Date"), ` +
  `${DAY_KEY('L2."Date"')}, ROUND(L2."Hours",2)`;

/** Le righe di Projects, raggruppate per la stessa chiave e contate. */
const PROJECTS_KEYED = (from) =>
  `SELECT CONCAT(L."Project ID",'') AS "pid", CONCAT(L."Task ID",'') AS "tid", ` +
  `CONCAT(L."User ID",'') AS "uid", ${DAY_KEY('L."Date"')} AS "dk", ` +
  `ROUND(L."Hours",2) AS "h", COUNT(*) AS "n" ` +
  `FROM "${Z_LOGS}" L WHERE YEAR(L."Date") >= ${from} ` +
  `GROUP BY CONCAT(L."Project ID",''), CONCAT(L."Task ID",''), CONCAT(L."User ID",''), ` +
  `${DAY_KEY('L."Date"')}, ROUND(L."Hours",2)`;

/**
 * I task della tasklist del debug interno.
 *
 * Le ore interne vanno tenute fuori dal margine cliente esattamente come fa già
 * il calcolo su Projects, altrimenti le ore recuperate da People rientrerebbero
 * dalla finestra come costo del cliente. Si leggono gli id una volta e si passano
 * come lista: il join diretto sulla tabella dei task dentro la query principale
 * la farebbe girare su ogni riga invece che su qualche decina, ed è già costato
 * un timeout in passato.
 */
let INTERNAL_IDS = null;

export async function internalTaskIds() {
  if (INTERNAL_IDS) return INTERNAL_IDS;
  const wanted = INTERNAL_TASKLIST()
    .trim().replace(/^[_\s]+/, "").replace(/\s+/g, " ").toUpperCase().replace(/'/g, "''");
  const clean = (col) => `UPPER(TRIM(REPLACE(${col}, '_', '')))`;
  const sql =
    `SELECT CONCAT("Task ID",'') AS tid FROM "${Z_TASKS}" ` +
    `WHERE ${clean('"Tasklist Name"')} = '${wanted}' OR ${clean('"Task Name"')} = '${wanted}'`;
  try {
    const ids = parseCsv(await runCostQueryRaw(sql))
      .map((r) => String(r.tid || "").trim()).filter(Boolean);
    INTERNAL_IDS = ids;
  } catch (e) {
    // Senza la lista il recupero resta valido: le ore ci sono, solo non sono
    // separate fra cliente e debug interno. Meglio un'attribuzione imprecisa che
    // nessun costo, ma chi legge deve saperlo.
    INTERNAL_IDS = null;
    throw new Error("Tasklist interna non leggibile: " + e.message);
  }
  return INTERNAL_IDS;
}

/**
 * Le ore presenti in People e assenti in Projects, per progetto, persona, anno,
 * mese e natura (cliente o debug interno).
 *
 * Il confronto è per conteggio, non riga per riga: per ogni chiave si guarda
 * quante righe ha People e quante ne ha Projects, e si recupera la differenza
 * quando People ne ha di più. Due log identici che stanno in entrambi i sistemi
 * si annullano; il terzo log identico che sta solo in People viene recuperato.
 * È la scelta che Alex ha approvato: due registrazioni uguali nello stesso giorno
 * valgono due, perché se la persona ha sbagliato non c'è modo di saperlo.
 *
 * Una chiave assente in Projects (P."n" IS NULL) vale per intero: è il caso dei
 * progetti archiviati, che Analytics non espone affatto, e dei job che il push ha
 * rifiutato.
 */
export function peopleOnlySql(from, internalIds) {
  const internal = internalIds || [];
  // La lista degli id interni entra come predicato. Oltre qualche centinaio di
  // id la query diventa illeggibile per Analytics: in quel caso si rinuncia alla
  // separazione e lo si dichiara nel risultato, invece di far fallire tutto.
  const tooMany = internal.length > 400;
  const flag = internal.length && !tooMany
    ? `CASE WHEN H."tid" IN (${internal.map((i) => `'${i}'`).join(",")}) THEN 1 ELSE 0 END`
    : `0`;

  const sql =
    `SELECT H."pid" AS pid, H."uid" AS uid, H."yr" AS yr, H."mo" AS mo, ` +
    `${flag} AS internal, ` +
    // Quanto recuperiamo, e quanto ne aveva People in tutto: il secondo numero
    // non serve al calcolo ma permette di verificare la riconciliazione senza
    // rifare la query dall'altro lato.
    `SUM(H."h" * (CASE WHEN P."n" IS NULL THEN H."n" ` +
    `WHEN H."n" > P."n" THEN H."n" - P."n" ELSE 0 END)) AS hours, ` +
    `SUM(H."h" * H."n") AS people_hours ` +
    `FROM (${PEOPLE_KEYED(from)}) H ` +
    `LEFT JOIN (${PROJECTS_KEYED(from)}) P ` +
    `ON P."pid" = H."pid" AND P."tid" = H."tid" AND P."uid" = H."uid" ` +
    `AND P."dk" = H."dk" AND P."h" = H."h" ` +
    `GROUP BY H."pid", H."uid", H."yr", H."mo", ${flag}`;

  return { sql, internalSplit: !tooMany };
}

export async function fetchPeopleOnlyHours(opts) {
  const o = opts || {};
  const from = Number(o.from) || MIN_YEAR();
  const { sql, internalSplit } = peopleOnlySql(from, await internalTaskIds());

  const rows = [];
  for (const r of parseCsv(await runCostQueryRaw(sql))) {
    const hours = num(r.hours);
    if (!hours) continue;
    rows.push({
      pid: String(r.pid || "").trim(),
      uid: String(r.uid || "").trim(),
      yr: String(r.yr || "").trim().slice(0, 4),
      mo: String(r.mo || "").trim(),
      internal: String(r.internal || "").trim() === "1",
      hours,
      peopleHours: num(r.people_hours),
    });
  }
  return { rows, internalSplit, from };
}

/**
 * Somma le ore recuperate dentro la mappa dei costi prodotta da fetchProjectCosts,
 * mantenendone la forma esatta: chi legge la mappa non deve sapere che esiste una
 * seconda fonte.
 *
 * Il prezzo si fa qui e con la stessa regola delle ore di Projects — la tariffa
 * del cedolino del mese in cui l'ora è stata registrata, mai una tariffa piatta,
 * mai la tariffa di oggi su un progetto di due anni fa. Sulle ore recuperate non
 * esiste il ripiego "tariffa impressa sul log": People non ne ha una. Quando il
 * cedolino manca l'ora entra comunque nel conteggio ore e resta a costo zero,
 * segnata fra le non tariffate, perché nascondere l'ora sarebbe peggio che
 * ammettere di non saperla prezzare.
 */
export function mergePeopleHours(costMap, result) {
  const map = costMap || {};
  const added = { hours: 0, cost: 0, ihours: 0, icost: 0, unrated: 0, projects: 0 };
  if (!result || !result.rows) return { map, added };

  for (const r of result.rows) {
    if (!r.pid || !r.hours) continue;
    const { rate: hourly } = rateFor(r.uid, r.yr, r.mo);
    const cost = hourly > 0 ? r.hours * hourly : 0;

    const e = map[r.pid] || (map[r.pid] = {
      hours: 0, cost: 0, unrated: 0, ihours: 0, icost: 0, byYear: {}, basis: {},
    });
    if (!e.people) { e.people = { hours: 0, cost: 0, ihours: 0, icost: 0 }; added.projects += 1; }

    if (r.internal) {
      e.ihours += r.hours; e.icost += cost;
      e.people.ihours += r.hours; e.people.icost += cost;
      added.ihours += r.hours; added.icost += cost;
    } else {
      e.hours += r.hours; e.cost += cost;
      e.people.hours += r.hours; e.people.cost += cost;
      added.hours += r.hours; added.cost += cost;
      if (hourly <= 0) { e.unrated += r.hours; added.unrated += r.hours; }
    }
    e.basis[hourly > 0 ? "payroll_people" : "none_people"] =
      round((e.basis[hourly > 0 ? "payroll_people" : "none_people"] || 0) + r.hours);

    if (r.yr) {
      const b = e.byYear[r.yr] ||
        (e.byYear[r.yr] = { hours: 0, cost: 0, unrated: 0, ihours: 0, icost: 0 });
      if (r.internal) { b.ihours += r.hours; b.icost += cost; }
      else {
        b.hours += r.hours; b.cost += cost;
        if (hourly <= 0) b.unrated += r.hours;
      }
    }
  }

  for (const k of ["hours", "cost", "ihours", "icost", "unrated"]) added[k] = round(added[k]);
  return { map, added };
}

/**
 * I numeri con cui si controlla che la union non stia né perdendo né contando
 * due volte. La verifica è una sottrazione che deve chiudere:
 *
 *   ore Projects + recuperate da People  ==  ore People + presenti solo in Projects
 *
 * Sulla finestra 2025-2026, al 27 settembre 2026, entrambi i lati valgono
 * 38.812,69 ore. Se un giorno non chiudono più, la chiave di confronto ha smesso
 * di riconoscere gli stessi log e il recupero va rimisurato prima di fidarsene.
 */
export async function peopleDiagnostics(opts) {
  const from = Number(opts && opts.from) || MIN_YEAR();

  const one = async (sql) => parseCsv(await runCostQueryRaw(sql))[0] || {};

  const tot = await one(
    `SELECT COUNT(*) AS righe, SUM("Hours") AS ore FROM "${P_LOGS}" WHERE YEAR("Date") >= ${from}`);
  const ztot = await one(
    `SELECT COUNT(*) AS righe, SUM("Hours") AS ore FROM "${Z_LOGS}" WHERE YEAR("Date") >= ${from}`);

  // Le righe di People che non si agganciano a un progetto di Projects: restano
  // fuori dal recupero e vanno dette, non nascoste.
  const orphan = await one(
    `SELECT COUNT(*) AS righe, SUM(L2."Hours") AS ore FROM "${P_LOGS}" L2 ` +
    `LEFT JOIN "${P_PROJECTS}" PP ON PP."ID" = L2."Project" ` +
    `WHERE YEAR(L2."Date") >= ${from} AND PP."Reference ID" IS NULL`);

  const onlyProjects = await one(
    `SELECT SUM(P."h" * (CASE WHEN H."n" IS NULL THEN P."n" ` +
    `WHEN P."n" > H."n" THEN P."n" - H."n" ELSE 0 END)) AS ore ` +
    `FROM (${PROJECTS_KEYED(from)}) P LEFT JOIN (${PEOPLE_KEYED(from)}) H ` +
    `ON P."pid" = H."pid" AND P."tid" = H."tid" AND P."uid" = H."uid" ` +
    `AND P."dk" = H."dk" AND P."h" = H."h"`);

  const rec = await fetchPeopleOnlyHours({ from });
  const recovered = round(rec.rows.reduce((s, r) => s + r.hours, 0));
  const peopleUsable = round(rec.rows.reduce((s, r) => s + r.peopleHours, 0));

  const left = round(num(ztot.ore) + recovered);
  const right = round(peopleUsable + num(onlyProjects.ore));

  return {
    from,
    people: { rows: Number(tot.righe) || 0, hours: round(num(tot.ore)) },
    projects: { rows: Number(ztot.righe) || 0, hours: round(num(ztot.ore)) },
    peopleWithoutProject: { rows: Number(orphan.righe) || 0, hours: round(num(orphan.ore)) },
    recovered,
    onlyInProjects: round(num(onlyProjects.ore)),
    union: left,
    // true quando la riconciliazione chiude. Un centesimo di scarto è
    // arrotondamento; qualunque cosa di più è un difetto della chiave.
    reconciles: Math.abs(left - right) <= 0.02,
    check: { left, right },
    internalSplit: rec.internalSplit,
  };
}
