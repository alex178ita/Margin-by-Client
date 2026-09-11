/**
 * Pipeline Margine per Cliente — sorgenti Zoho via REST (datacenter EU).
 *
 * Variabili d'ambiente:
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN   (obbligatorie)
 *   ZOHO_BOOKS_ORG_ID         default 20069840369        Vivian Srl
 *   ZOHO_ANALYTICS_ORG_ID     default 20070118906
 *   ZOHO_ANALYTICS_WORKSPACE  default 86612000000004001  Global Reports
 *   ZOHO_PROJECTS_PORTAL_ID   default 20070118907
 *   REVENUE_FROM              default 2024-01-01   primo anno mostrato
 *   INVOICE_FROM              default 2023-01-01   lookback: serve solo per far
 *                                                  maturare in 2024 la coda delle
 *                                                  licenze fatturate prima
 *
 * Il ricavo è l'imponibile (Sub Total), al netto delle note di credito a storno.
 * Senza le credenziali l'app serve lo snapshot di seed in data/snapshot.json.
 */
import { finalClient, projectClass, PROJECT_ALIASES } from "./clients.js";

const ACC = "https://accounts.zoho.eu";
const API = "https://www.zohoapis.eu";
const ANA = "https://analyticsapi.zoho.eu";

export const CRM_ORG = "org20069412455";
export const PROJECTS_PORTAL = "kleecksprojects";
export const CRM_DEAL_URL = (id) => `https://crm.zoho.eu/crm/${CRM_ORG}/tab/Potentials/${id}`;
export const PROJECT_URL = (id) =>
  `https://projects.zoho.eu/portal/${PROJECTS_PORTAL}#dashboard/${id}`;

// I valori incollati a mano portano spesso spazi o a-capo invisibili.
const ENV = (k, d) => (process.env[k] || d || "").trim();
const round = (n) => Math.round(n * 100) / 100;

let cached = null;
async function accessToken() {
  if (cached && cached.exp > Date.now() + 60000) return cached.value;
  const body = new URLSearchParams({
    refresh_token: ENV("ZOHO_REFRESH_TOKEN"),
    client_id: ENV("ZOHO_CLIENT_ID"),
    client_secret: ENV("ZOHO_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const j = await (await fetch(ACC + "/oauth/v2/token", { method: "POST", body })).json();
  if (!j.access_token) {
    const why = j.error === "invalid_code"
      ? "the value stored in ZOHO_REFRESH_TOKEN is not a valid refresh token (often it is the single-use code): reconnect from /setup"
      : j.error === "invalid_client"
      ? "Client ID or Client Secret do not match the client that issued the key"
      : JSON.stringify(j).slice(0, 200);
    throw new Error("OAuth failed — " + why);
  }
  cached = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.value;
}

async function zoho(url, init) {
  const tok = await accessToken();
  const r = await fetch(url, {
    ...(init || {}),
    headers: { Authorization: "Zoho-oauthtoken " + tok, ...((init && init.headers) || {}) },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(r.status + " " + url.slice(0, 80) + " — " + (await r.text()).slice(0, 250));
  return r;
}

/* ---------------------------------------------------------------- fatture -- */
/**
 * Fatture dall'ANAGRAFICA Analytics anziché da Books REST, per tre motivi:
 *  - "Sub Total (BCY)" è l'imponibile, che nella risposta REST di Books non c'è;
 *  - il join con Credit Notes fa emergere le fatture stornate, che restano
 *    "Closed"/"paid" e quindi sono invisibili guardando lo stato;
 *  - una query sola al posto di quaranta pagine.
 */
export async function fetchInvoicesAnalytics() {
  const fromYear = ENV("INVOICE_FROM", "2023-01-01").slice(0, 4);
  const sql =
    `SELECT CONCAT(I."Invoice ID",'') AS iid, I."Invoice Number" AS inum, ` +
    `DATE_FORMAT(I."Invoice Date",'%Y-%m-%d') AS idate, I."Invoice Status" AS istatus, ` +
    `I."Sub Total (BCY)"*1 AS net, I."Total (BCY)"*1 AS gross, I."Balance (BCY)"*1 AS bal, ` +
    `CONCAT(I."CRM Potential ID",'') AS dealid, CU."Customer Name" AS cust, ` +
    `C."Credit Note Number" AS cnum, C."Sub Total (BCY)"*1 AS cnet, ` +
    `DATE_FORMAT(C."Credit Note Date",'%Y-%m-%d') AS cdate ` +
    `FROM "Invoices (Zoho Books)" I ` +
    `LEFT JOIN "Customers (Zoho Books)" CU ON CU."Customer ID" = I."Customer ID" ` +
    `LEFT JOIN "Credit Notes (Zoho Books)" C ON C."Invoice ID" = I."Invoice ID" ` +
    `WHERE YEAR(I."Invoice Date") >= ${Number(fromYear) || 2023}`;

  const rows = parseCsv(await runCostQueryRaw(sql));
  return foldInvoices(rows);
}

/** Una riga per coppia fattura/nota di credito: qui tornano una riga per fattura. */
export function foldInvoices(rows) {
  const m = new Map();
  for (const r of rows || []) {
    const id = String(r.iid || "").trim();
    if (!id) continue;
    const status = String(r.istatus || "").trim();
    if (/^draft$/i.test(status)) continue;
    let e = m.get(id);
    if (!e) {
      e = {
        id,
        num: String(r.inum || "").trim(),
        date: String(r.idate || "").trim(),
        status,
        cust: String(r.cust || "").trim() || "(customer not named)",
        dealId: String(r.dealid || "").trim() || null,
        net: num(r.net),
        gross: num(r.gross),
        balance: num(r.bal),
        credited: 0,
        cnotes: [],
      };
      m.set(id, e);
    }
    const cn = String(r.cnum || "").trim();
    if (cn && !e.cnotes.some((x) => x.num === cn)) {
      const v = num(r.cnet);
      e.cnotes.push({ num: cn, net: round(v), date: String(r.cdate || "").trim() });
      e.credited += v;
    }
  }
  for (const e of m.values()) {
    e.credited = round(e.credited);
    // Il ricavo che conta: imponibile meno gli storni. Mai sotto zero.
    e.counted = round(Math.max(0, e.net - e.credited));
    e.reversed = e.credited > 0 && e.counted === 0;
  }
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Percorso di ripiego: Books REST. Il totale è IVA inclusa e gli storni non si vedono. */
export async function fetchInvoicesBooks() {
  const org = ENV("ZOHO_BOOKS_ORG_ID", "20069840369");
  const from = ENV("INVOICE_FROM", "2023-01-01");
  const out = [];
  for (let page = 1; page <= 40; page++) {
    const u = `${API}/books/v3/invoices?organization_id=${org}&per_page=200&page=${page}` +
              `&date_start=${from}&sort_column=date`;
    const j = await (await zoho(u)).json();
    for (const i of j.invoices || []) {
      if (i.status === "draft") continue;
      out.push({
        id: String(i.invoice_id), num: i.invoice_number, cust: i.customer_name, date: i.date,
        status: i.status, dealId: null, dealName: i.zcrm_potential_name || null,
        net: i.total || 0, gross: i.total || 0, balance: i.balance || 0,
        credited: 0, counted: i.total || 0, reversed: false, cnotes: [],
      });
    }
    if (!j.page_context || !j.page_context.has_more_page) break;
  }
  return out;
}

/* ------------------------------------------------------------------- CRM -- */
const DEAL_FIELDS = [
  "id", "Deal_Name", "Amount", "Stage", "Closing_Date",
  "Licence", "Delivery", "Licence_Modules", "Licence_Duration_months",
  "Auto_renew", "Payment_Terms", "Licence_Start_Date", "Licence_End_Date",
  "Owner", "Customer_Success_Manager", "Account_Name",
];

/** Anagrafica utenti CRM: in COQL il lookup restituisce solo il cognome. */
export async function fetchUsers() {
  const map = {};
  try {
    const j = await (await zoho(`${API}/crm/v7/users?type=AllUsers&per_page=200`)).json();
    for (const u of (j && j.users) || []) {
      map[String(u.id)] = { name: u.full_name || u.last_name || null, active: u.status === "active" };
    }
  } catch (e) { /* senza nomi si mostra il cognome che arriva dal lookup */ }
  return map;
}

/**
 * Tutti i deal con i campi che servono alla dashboard. Il legame con le fatture
 * passa per l'ID (CRM Potential ID su Books), non per il nome.
 */
export async function fetchDeals() {
  const users = await fetchUsers();
  const out = [];
  for (let page = 0; page < 25; page++) {
    const q =
      `select ${DEAL_FIELDS.join(", ")} from Deals ` +
      `where Modified_Time >= '2015-01-01T00:00:00+01:00' ` +
      `limit ${page * 200}, 200`;
    const r = await zoho(`${API}/crm/v7/coql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ select_query: q }),
    });
    if (r.status === 204) break;
    const j = await r.json();
    const batch = (j && j.data) || [];
    for (const d of batch) out.push(dealRecord(d, users));
    if (batch.length < 200 || !j.info || !j.info.more_records) break;
  }
  return out;
}

const user = (v, users) => {
  if (!v) return null;
  const u = users[String(v.id)] || {};
  return { id: String(v.id), name: u.name || v.name || null, active: u.active !== false };
};

/** Riga CRM grezza -> record deal normalizzato. */
export function dealRecord(d, users) {
  const lic = Number(d.Licence || 0);
  const del = Number(d.Delivery || 0);
  const mods = Array.isArray(d.Licence_Modules)
    ? d.Licence_Modules.filter(Boolean)
    : d.Licence_Modules ? [String(d.Licence_Modules)] : [];
  return {
    id: String(d.id),
    name: String(d.Deal_Name || "").trim(),
    amount: Number(d.Amount || 0),
    stage: d.Stage || null,
    closing: d.Closing_Date || null,
    // Licenza se il campo Licence è valorizzato, professional services se lo è
    // Delivery. Qualche deal ha entrambi: allora vince il più grande, ma la
    // dashboard mostra comunque i due importi.
    kind: lic > 0 && del > 0 ? (lic >= del ? "licence" : "services")
        : lic > 0 ? "licence" : del > 0 ? "services" : "unset",
    licence: lic, delivery: del, both: lic > 0 && del > 0,
    modules: mods,
    months: d.Licence_Duration_months || null,
    renew: d.Auto_renew || null,
    terms: d.Payment_Terms || null,
    ls: d.Licence_Start_Date || null,
    le: d.Licence_End_Date || null,
    owner: user(d.Owner, users || {}),
    csm: user(d.Customer_Success_Manager, users || {}),
    account: d.Account_Name ? String(d.Account_Name.name || "") : null,
  };
}

/** Da elenco deal a mappa nome deal -> elenco di periodi di licenza validi. */
export function dealSpans(deals) {
  const m = new Map();
  for (const d of deals || []) {
    const name = String(d.name || d.Deal_Name || "").trim();
    if (!name) continue;
    const s = Date.parse(d.ls || d.Licence_Start_Date);
    const e = Date.parse(d.le || d.Licence_End_Date);
    if (!isFinite(s) || !isFinite(e) || e <= s) continue;
    const days = (e - s) / 86400000;
    // Fuori da questa finestra il dato è quasi sempre un errore di data.
    if (days < 20 || days > 1900) continue;
    if (!m.has(name)) m.set(name, []);
    m.get(name).push({ s, e });
  }
  return m;
}

/** Stessi periodi, ma indicizzati per ID deal: chiave esatta, senza omonimie. */
export function spansById(deals) {
  const m = new Map();
  for (const d of deals || []) {
    const s = Date.parse(d.ls), e = Date.parse(d.le);
    if (!isFinite(s) || !isFinite(e) || e <= s) continue;
    const days = (e - s) / 86400000;
    if (days < 20 || days > 1900) continue;
    m.set(String(d.id), [{ s, e }]);
  }
  return m;
}

const GRACE = 120 * 86400000; // tolleranza fra data fattura e periodo di licenza

/**
 * Ripartisce l'importo di una fattura sugli anni solari coperti dalla licenza,
 * pro quota sui giorni. Senza un periodo utilizzabile ricade sull'anno della
 * data fattura, che è il comportamento precedente.
 */
export function spread(amount, date, spans) {
  const invoiceYear = String(date).slice(0, 4);
  const fallback = () => ({ years: { [invoiceYear]: round(amount) }, accrued: false });
  if (!spans || !spans.length) return fallback();

  const t = Date.parse(String(date) + "T12:00:00Z");
  if (!isFinite(t)) return fallback();

  let best = null, bestD = Infinity;
  for (const sp of spans) {
    const d = t < sp.s ? sp.s - t : t > sp.e ? t - sp.e : 0;
    if (d < bestD) { bestD = d; best = sp; }
  }
  // Fattura troppo lontana dal periodo: quasi sempre una voce extra-licenza.
  if (!best || bestD > GRACE) return fallback();

  const total = best.e - best.s;
  const years = {};
  const y0 = new Date(best.s).getUTCFullYear();
  const y1 = new Date(best.e).getUTCFullYear();
  for (let y = y0; y <= y1; y++) {
    const a = Math.max(best.s, Date.UTC(y, 0, 1));
    const b = Math.min(best.e, Date.UTC(y + 1, 0, 1));
    if (b > a) years[String(y)] = round(amount * ((b - a) / total));
  }
  return { years, accrued: true };
}

/* --------------------------------------------------------------- Projects -- */
/**
 * Zoho Projects non sta su zohoapis: ha il suo host projectsapi.zoho.eu.
 * Si prova prima l'API v3, poi la REST v1 che ha percorso, paginazione e
 * chiave di risposta diversi. Il primo host che risponde vince.
 */
const PROJECT_ENDPOINTS = [
  {
    url: (portal, page) =>
      `https://projectsapi.zoho.eu/api/v3/portal/${portal}/projects?per_page=200&page=${page}`,
    rows: (j) => j.result || j.projects || [],
  },
  {
    url: (portal, page) =>
      `https://projectsapi.zoho.eu/restapi/portal/${portal}/projects/?range=200&index=${(page - 1) * 200 + 1}`,
    rows: (j) => j.projects || j.result || [],
  },
  {
    url: (portal, page) =>
      `${API}/projects/v3/portal/${portal}/projects?per_page=200&page=${page}`,
    rows: (j) => j.result || j.projects || [],
  },
];

export async function fetchProjects() {
  const portal = ENV("ZOHO_PROJECTS_PORTAL_ID", "20070118907");
  let lastErr = null;

  for (const ep of PROJECT_ENDPOINTS) {
    try {
      const out = [];
      for (let page = 1; page <= 10; page++) {
        const j = await (await zoho(ep.url(portal, page))).json();
        const rows = ep.rows(j);
        for (const p of rows) {
          out.push({
            // id_string PRIMA di id: gli ID Zoho hanno 17 cifre e superano il
            // limite degli interi JavaScript, quindi p.id arriva arrotondato
            // (…9506078 diventa …9506080) e non combacia più con Analytics.
            id: String(p.id_string || p.id_str || p.id),
            name: p.name,
            crmid: p.crmid ? String(p.crmid) : null,
            status: (p.status && p.status.name) || p.status || null,
          });
        }
        if (rows.length < 200) break;
      }
      if (out.length) return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("Zoho Projects unreachable — " + (lastErr ? lastErr.message : "no projects returned"));
}

/**
 * Il CRMid dei progetti si legge da Analytics, non dall'API REST di Projects:
 * è un campo personalizzato e la REST non lo espone con quel nome, così i
 * progetti risultavano tutti senza collegamento anche quando il campo è pieno.
 * La tabella Analytics porta anche Deal Name e Amount, utili come riscontro.
 */
export async function fetchProjectLinks() {
  const sql =
    `SELECT CONCAT("Project ID",'') AS pid, CONCAT("CRMid",'') AS crmid, ` +
    `"Deal Name" AS dealname, "Amount"*1 AS amount ` +
    `FROM "Projects (Zoho Projects)"`;
  const map = new Map();
  for (const r of parseCsv(await runCostQueryRaw(sql))) {
    const pid = String(r.pid || "").trim();
    if (!pid) continue;
    const crmid = String(r.crmid || "").trim();
    map.set(pid, {
      crmid: crmid && /^\d{6,}$/.test(crmid) ? crmid : null,
      dealName: String(r.dealname || "").trim() || null,
      amount: num(r.amount),
    });
  }
  return map;
}

/**
 * Aggancia ogni progetto al suo deal. Il campo CRMid del progetto è il legame
 * buono; quando manca si tenta il nome, ma il risultato resta dichiarato come
 * ipotesi, perché deal e progetto non sono sempre in corrispondenza uno a uno.
 * `links` è la mappa da fetchProjectLinks: se c'è, vince sul campo REST.
 */
export function linkProjectsToDeals(projects, deals, links) {
  projects = projects.map((p) => {
    const extra = links && links.get(p.id);
    if (!extra) return p;
    return {
      ...p,
      crmid: extra.crmid || p.crmid || null,
      // Il nome del deal scritto sul progetto è un secondo aggancio possibile.
      dealNameOnProject: extra.dealName || null,
    };
  });
  return linkProjects(projects, deals);
}

function linkProjects(projects, deals) {
  const byId = new Map(deals.map((d) => [String(d.id), d]));
  const byName = new Map();
  for (const d of deals) {
    const k = norm(d.name);
    if (!k) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(d);
  }
  return projects.map((p) => {
    if (p.crmid && byId.has(p.crmid)) {
      return { ...p, dealId: p.crmid, link: "crmid" };
    }
    if (p.crmid) return { ...p, dealId: null, link: "crmid_unknown" };
    // Secondo tentativo: il campo Deal Name scritto sul progetto. Non è l'id,
    // ma è comunque un dato inserito a mano da qualcuno, non una somiglianza.
    const onProject = p.dealNameOnProject ? byName.get(norm(p.dealNameOnProject)) || [] : [];
    if (onProject.length === 1) return { ...p, dealId: onProject[0].id, link: "deal_name_field" };
    const hits = byName.get(norm(p.name)) || [];
    // Un solo deal con quel nome: ipotesi ragionevole. Più d'uno: nessuna.
    if (hits.length === 1) return { ...p, dealId: hits[0].id, link: "name_guess" };
    return { ...p, dealId: null, link: hits.length ? "name_ambiguous" : "none" };
  });
}

/* -------------------------------------------------------------- Analytics -- */
/**
 * Ore e costo reale per progetto. La tariffa è quella configurata per persona
 * in Zoho Projects (Cost Per Hour): mai una tariffa piatta.
 */
const TIME_LOGS = "Time Logs (Zoho Projects)";

let COLS = null;

/**
 * I nomi di colonna della tabella Time Logs non sono documentati e cambiano
 * fra portali: "Log Date" per esempio non esiste. Invece di tirare a indovinare
 * si legge una riga e si riconoscono le colonne dal loro nome reale.
 */
export async function timeLogColumns() {
  if (COLS) return COLS;
  const csv = await runCostQueryRaw(`SELECT * FROM "${TIME_LOGS}" LIMIT 1`);
  const header = splitCsv(String(csv).trim().split(/\r?\n/)[0]).map((h) => h.trim());
  const low = header.map((h) => h.toLowerCase());
  const find = (...tests) => {
    for (const t of tests) {
      const i = low.findIndex(t);
      if (i >= 0) return header[i];
    }
    return null;
  };
  COLS = {
    all: header,
    project: find((h) => h === "project id", (h) => h.includes("project") && h.includes("id"),
                  (h) => h === "project", (h) => h.includes("project")),
    hours: find((h) => h === "hours", (h) => h === "log hours", (h) => h === "total hours",
                (h) => h.includes("hour") && !h.includes("cost") && !h.includes("rate"),
                (h) => h.includes("duration")),
    rate: find((h) => h === "cost per hour", (h) => h.includes("cost") && h.includes("hour"),
               (h) => h.includes("hourly"), (h) => h.includes("rate")),
    cost: find((h) => h === "cost", (h) => h === "log cost", (h) => h === "total cost",
               (h) => h.includes("cost") && !h.includes("hour") && !h.includes("rate")),
    date: find((h) => h === "log date", (h) => h === "date", (h) => h === "work date",
               (h) => h.includes("log") && h.includes("date"), (h) => h.includes("date")),
  };
  return COLS;
}

export async function fetchProjectCosts() {
  const c = await timeLogColumns();
  if (!c.project || !c.hours) {
    throw new Error("Time Logs: colonne non riconosciute — disponibili: " + c.all.join(" | "));
  }
  // Tariffa per persona se c'è; altrimenti un costo già calcolato sulla riga.
  const costExpr = c.rate ? `SUM("${c.hours}" * "${c.rate}")`
    : c.cost ? `SUM("${c.cost}")`
    : null;
  if (!costExpr) {
    throw new Error("Time Logs: nessuna colonna di costo o tariffa — disponibili: " + c.all.join(" | "));
  }

  const q = (byYear) =>
    `SELECT "${c.project}" AS project_id, ` +
    (byYear ? `YEAR("${c.date}") AS year, ` : "") +
    `SUM("${c.hours}") AS total_hours, ${costExpr} AS total_cost ` +
    `FROM "${TIME_LOGS}" GROUP BY "${c.project}"` + (byYear ? `, YEAR("${c.date}")` : "");

  if (c.date) {
    try { return await runCostQuery(q(true)); }
    catch (e) { /* data non aggregabile per anno: si resta sul totale di periodo */ }
  }
  return runCostQuery(q(false));
}

async function runCostQuery(sql) {
  return parseCostCsv(await runCostQueryRaw(sql));
}

/** CSV di Analytics come elenco di oggetti, con le intestazioni originali. */
export function parseCsv(csv) {
  const lines = String(csv).trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = splitCsv(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const c = splitCsv(l), o = {};
    head.forEach((h, i) => { o[h] = c[i]; });
    return o;
  });
}

/** Nomi utente: la tabella non ha un nome fisso, quindi si sonda. */
const USER_TABLES = ["Users (Zoho Projects)", "User (Zoho Projects)",
                     "Portal Users (Zoho Projects)", "Zoho Projects Users"];

let USERS = null;
export async function userNames() {
  if (USERS) return USERS;
  for (const t of USER_TABLES) {
    try {
      const probe = parseCsv(await runCostQueryRaw(`SELECT * FROM "${t}" LIMIT 1`));
      const cols = probe.length ? Object.keys(probe[0]) : [];
      const low = cols.map((c) => c.toLowerCase());
      const pick = (...tests) => {
        for (const f of tests) { const i = low.findIndex(f); if (i >= 0) return cols[i]; }
        return null;
      };
      const idCol = pick((h) => h === "user id", (h) => h.includes("user") && h.includes("id"),
                         (h) => h.endsWith(" id"));
      const nameCol = pick((h) => h === "name", (h) => h === "full name", (h) => h === "display name",
                           (h) => h.includes("name"), (h) => h.includes("email"));
      const roleCol = pick((h) => h === "role", (h) => h.includes("role"), (h) => h.includes("profile"));
      if (!idCol || !nameCol) continue;
      const sel = `SELECT CONCAT("${idCol}",'') AS uid, "${nameCol}" AS uname` +
                  (roleCol ? `, "${roleCol}" AS urole` : "") + ` FROM "${t}"`;
      const rows = parseCsv(await runCostQueryRaw(sel));
      const map = {};
      for (const r of rows) if (r.uid) map[String(r.uid).trim()] = { name: r.uname, role: r.urole || null };
      if (Object.keys(map).length) { USERS = { table: t, map }; return USERS; }
    } catch (e) { /* tabella assente: si prova la successiva */ }
  }
  USERS = { table: null, map: {} };
  return USERS;
}

/**
 * Dettaglio per persona di uno o più progetti: le stesse ore e gli stessi costi
 * che alimentano la dashboard, ma senza aggregazione, per poterli verificare.
 */
export async function projectDetail(projectIds) {
  const c = await timeLogColumns();
  const ids = projectIds ? [...new Set(projectIds.map(String))].filter(Boolean) : null;
  if (ids && !ids.length) return {};
  const rate = c.rate || "Cost Per Hour";
  // Aggregato in SQL, non riga per riga: una sola chiamata copre tutti i
  // progetti e restituisce già quello che serve all'Excel di dettaglio.
  const sql =
    `SELECT CONCAT("${c.project}",'') AS pid, CONCAT("User ID",'') AS uid, ` +
    `SUM("${c.hours}")*1 AS hours, SUM("${c.hours}"*"${rate}")*1 AS cost, ` +
    `COUNT(*)*1 AS logs, DATE_FORMAT(MIN("${c.date}"),'%Y-%m-%d') AS first_log, ` +
    `DATE_FORMAT(MAX("${c.date}"),'%Y-%m-%d') AS last_log, ` +
    `SUM(CASE WHEN "${rate}" > 0 THEN 0 ELSE "${c.hours}" END)*1 AS unrated ` +
    `FROM "${TIME_LOGS}" ` +
    (ids ? `WHERE CONCAT("${c.project}",'') IN (${ids.map((i) => `'${i}'`).join(",")}) ` : "") +
    `GROUP BY "${c.project}", "User ID"`;
  const raw = parseCsv(await runCostQueryRaw(sql));
  const users = await userNames();

  const out = {};
  for (const r of raw) {
    const pid = String(r.pid || "").trim();
    if (!pid) continue;
    const uid = String(r.uid || "").trim();
    const u = users.map[uid] || {};
    const hours = num(r.hours), cost = num(r.cost);
    (out[pid] || (out[pid] = [])).push({
      user_id: uid,
      person: u.name || uid || "(unknown)",
      role: u.role || null,
      logs: Math.round(num(r.logs)),
      hours: round(hours), cost: round(cost),
      rate: hours ? round(cost / hours) : 0,
      unrated: round(num(r.unrated)),
      first: r.first_log || null, last: r.last_log || null,
    });
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.hours - a.hours);
  return out;
}

/** Compatibilità con /api/breakdown: ricerca per pezzo di nome. */
export async function projectBreakdown(terms) {
  const projects = await fetchProjects();
  const want = terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
  const picked = [];
  for (const t of want) {
    for (const h of projects.filter((p) => (p.name || "").toLowerCase().includes(t))) {
      if (!picked.some((x) => x.id === h.id)) picked.push(h);
    }
  }
  if (!picked.length) return { matched: [], rows: [], searched: want };
  const detail = await projectDetail(picked.map((p) => p.id));
  return {
    searched: want,
    matched: picked.map((p) => ({ id: p.id, name: p.name, status: p.status, crmid: p.crmid })),
    rows: picked.flatMap((p) => (detail[p.id] || []).map((r) => ({ project: p.name, ...r }))),
  };
}

/** Diagnostica: schema reale, dati grezzi e confronto degli ID progetto. */
export async function costDiagnostics() {
  const cols = await timeLogColumns();
  let parsed = null, perr = null;
  try { parsed = await fetchProjectCosts(); } catch (e) { perr = e.message; }
  const projects = await fetchProjects();
  const ids = Object.keys(parsed || {});
  const projIds = projects.map((p) => p.id);
  return {
    columns_all: cols.all,
    columns_used: { project: cols.project, hours: cols.hours, rate: cols.rate,
                    cost: cols.cost, date: cols.date },
    query_error: perr,
    analytics_projects: ids.length,
    analytics_with_hours: ids.filter((k) => (parsed[k].hours || 0) !== 0).length,
    analytics_with_cost: ids.filter((k) => (parsed[k].cost || 0) !== 0).length,
    zoho_projects: projIds.length,
    projects_with_crmid: projects.filter((p) => p.crmid).length,
    overlap: ids.filter((k) => projIds.includes(k)).length,
  };
}

/**
 * Zoho Analytics accetta il parametro CONFIG in forme diverse a seconda
 * dell'endpoint e del metodo. Delle cinque provate, solo questa viene accettata
 * dal datacenter EU: export asincrono, GET, CONFIG nella query string.
 */
function jobAttempts(ws, cfg, head) {
  return [
    { name: "GET bulk ?CONFIG",
      url: `${ANA}/restapi/v2/bulk/workspaces/${ws}/data?CONFIG=${encodeURIComponent(cfg)}`,
      init: { headers: head } },
  ];
}

/** Ultimo esito per attempt, letto dalla diagnostica. */
export let LAST_JOB_ATTEMPTS = [];

async function createExportJob(ws, cfg, head) {
  const log = [];
  for (const a of jobAttempts(ws, cfg, head)) {
    try {
      const j = await (await zoho(a.url, a.init)).json();
      const id = j && j.data && j.data.jobId;
      log.push({ attempt: a.name, ok: !!id, reply: id ? "jobId " + id : JSON.stringify(j).slice(0, 180) });
      if (id) { LAST_JOB_ATTEMPTS = log; return id; }
    } catch (e) {
      log.push({ attempt: a.name, ok: false, reply: e.message.slice(0, 220) });
    }
  }
  LAST_JOB_ATTEMPTS = log;
  throw new Error("Analytics: no jobId — " + log.map((l) => l.attempt + ": " + l.reply).join("  ||  "));
}

async function runCostQueryRaw(sql) {
  const org = ENV("ZOHO_ANALYTICS_ORG_ID", "20070118906");
  const ws = ENV("ZOHO_ANALYTICS_WORKSPACE", "86612000000004001");
  const cfg = JSON.stringify({ responseFormat: "csv", sqlQuery: sql });
  const head = { "ZANALYTICS-ORGID": org };

  const jobId = await createExportJob(ws, cfg, head);

  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const d = await (await zoho(
      `${ANA}/restapi/v2/bulk/workspaces/${ws}/exportjobs/${jobId}`, { headers: head })).json();
    const code = String((d && d.data && d.data.jobCode) || "");
    if (code === "1004") ready = true;
    else if (code.startsWith("7")) throw new Error("Analytics: job failed " + code);
  }
  if (!ready) throw new Error("Analytics: job did not complete within 80s");

  // Il download sta sotto /bulk/ come la creazione del job: senza, risponde 404.
  return (await zoho(
    `${ANA}/restapi/v2/bulk/workspaces/${ws}/exportjobs/${jobId}/data`, { headers: head })).text();
}

export function parseCostCsv(csv) {
  const lines = String(csv).trim().split(/\r?\n/);
  const head = splitCsv(lines[0]).map((h) => h.trim().toLowerCase());
  const iId = head.indexOf("project_id");
  const iY = head.indexOf("year");
  const iH = head.indexOf("total_hours");
  const iC = head.indexOf("total_cost");
  if (iId < 0 || iH < 0 || iC < 0) throw new Error("Cost CSV: unexpected columns — " + head.join("|"));
  const map = {};
  for (const line of lines.slice(1)) {
    const c = splitCsv(line);
    const id = String(c[iId] || "").trim();
    if (!id) continue;
    const e = map[id] || (map[id] = { hours: 0, cost: 0, byYear: {} });
    const h = num(c[iH]), k = num(c[iC]);
    e.hours += h; e.cost += k;
    if (iY >= 0 && c[iY]) {
      const y = String(c[iY]).trim().slice(0, 4);
      const b = e.byYear[y] || (e.byYear[y] = { hours: 0, cost: 0 });
      b.hours += h; b.cost += k;
    }
  }
  return map;
}

/**
 * Analytics esporta le ore a volte come numero, a volte come durata "1:30",
 * e i decimali possono arrivare con la virgola. Qui diventano tutti numeri.
 */
export function num(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return 0;
  const hm = s.match(/^(-?\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (hm) {
    const sign = hm[1].startsWith("-") ? -1 : 1;
    return sign * (Math.abs(Number(hm[1])) + Number(hm[2]) / 60 + (Number(hm[3]) || 0) / 3600);
  }
  let t = s.replace(/[^\d,.\-]/g, "");
  const lastC = t.lastIndexOf(","), lastD = t.lastIndexOf(".");
  if (lastC > lastD) t = t.replace(/\./g, "").replace(",", ".");   // 1.234,56
  else t = t.replace(/,/g, "");                                    // 1,234.56
  const n = Number(t);
  return isFinite(n) ? n : 0;
}

function splitCsv(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/* ----------------------------------------------------------- aggregazione -- */
export function norm(s) {
  return (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchClient(projectName, clientNames) {
  const n = norm(projectName);
  const aliases = Object.entries(PROJECT_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [key, cli] of aliases) if (n.includes(key)) return cli;
  const keys = clientNames.map((k) => [norm(k), k]).sort((a, b) => b[0].length - a[0].length);
  for (const [k, cli] of keys) if (k.length >= 4 && n.includes(k)) return cli;
  return null;
}

export function assemble(invoices, projects, costs, deals, errors, opts) {
  const revFrom = ENV("REVENUE_FROM", "2024-01-01");
  const minYear = revFrom.slice(0, 4);
  const basis = (opts && opts.basis) || "net";

  const dealById = new Map((deals || []).map((d) => [String(d.id), d]));
  const spansName = dealSpans(deals);
  const spansId = spansById(deals);

  const clients = new Map();
  const slot = (name) => {
    if (!clients.has(name)) {
      clients.set(name, { c: name, p: new Set(), ba: new Set(), ry: {}, ra: {}, rt: 0, n: 0,
                          ob: 0, cn: 0, rev: 0, deals: new Map(), pj: [], hours: 0, cost: 0, cy: {} });
    }
    return clients.get(name);
  };

  let matched = 0, considered = 0;
  const inWindow = [];

  for (const i of invoices) {
    const deal = i.dealId ? dealById.get(i.dealId) : null;
    const dealName = (deal && deal.name) || i.dealName || null;
    const [name, partner] = finalClient(i.cust, dealName || "");
    const c = slot(name);
    const amount = i.counted;

    // Competenza: la quota di ogni fattura che ricade in ciascun anno solare.
    const sp = (i.dealId && spansId.get(i.dealId)) || (dealName ? spansName.get(dealName) : null);
    const alloc = spread(amount, i.date, sp);
    for (const [y, v] of Object.entries(alloc.years)) {
      if (y < minYear) continue;                 // 2023 è incompleto per costruzione
      c.ra[y] = (c.ra[y] || 0) + v;
    }

    // Il resto (totale, insoluto, conteggi) resta sul criterio per data fattura.
    if (String(i.date) < revFrom) continue;
    inWindow.push(i);
    considered += 1;
    if (alloc.accrued) matched += 1;
    if (partner) c.p.add(partner);
    c.ba.add(i.cust);
    const y = String(i.date).slice(0, 4);
    c.ry[y] = (c.ry[y] || 0) + amount;
    c.rt += amount; c.n += 1; c.ob += i.balance;
    c.cn += i.credited;
    if (i.reversed) c.rev += 1;

    if (dealName || i.dealId) {
      const key = i.dealId || dealName;
      const e = c.deals.get(key) || {
        id: i.dealId || null, name: dealName || "(deal not named)",
        revenue: 0, credited: 0, invoices: 0, reversed: 0, open: 0,
        d: deal || null,
      };
      e.revenue += amount; e.credited += i.credited; e.invoices += 1;
      e.open += i.balance;
      if (i.reversed) e.reversed += 1;
      c.deals.set(key, e);
    }
  }

  const names = [...clients.keys()];
  const projRows = [], unmatched = [];
  for (const p of projects) {
    const k = projectClass(p.name);
    const cli = k === "client" || k === "client_mgmt" ? matchClient(p.name, names) : null;
    const cst = (costs && costs[p.id]) || null;
    const deal = p.dealId ? dealById.get(p.dealId) : null;
    projRows.push({
      id: p.id, n: p.name, k, c: cli, s: p.status,
      crmid: p.crmid || null, link: p.link || "none", dealId: p.dealId || null,
      deal: deal ? { id: deal.id, name: deal.name, kind: deal.kind, amount: deal.amount } : null,
      hours: cst ? round(cst.hours) : null, cost: cst ? round(cst.cost) : null,
      cy: cst ? Object.fromEntries(Object.entries(cst.byYear || {}).sort()
        .map(([y, b]) => [y, { hours: round(b.hours), cost: round(b.cost) }])) : {},
    });
    if (k === "client" || k === "client_mgmt") {
      if (cli) {
        const c = slot(cli);
        c.pj.push(p.id);
        if (cst) {
          c.hours += cst.hours; c.cost += cst.cost;
          for (const [y, b] of Object.entries(cst.byYear || {})) {
            const t = c.cy[y] || (c.cy[y] = { hours: 0, cost: 0 });
            t.hours += b.hours; t.cost += b.cost;
          }
        }
      } else unmatched.push(p.name);
    }
  }

  const hasCost = !!costs && Object.keys(costs).length > 0;
  const rows = [...clients.values()].map((c) => ({
    c: c.c, p: [...c.p].sort(), ba: [...c.ba].sort(),
    ry: Object.fromEntries(Object.entries(c.ry).sort().map(([k, v]) => [k, round(v)])),
    ra: Object.fromEntries(Object.entries(c.ra).sort().map(([k, v]) => [k, round(v)])),
    rt: round(c.rt), n: c.n, ob: round(c.ob), cn: round(c.cn), rev: c.rev,
    d: [...c.deals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8).map((e) => ({
      id: e.id, name: e.name, r: round(e.revenue), cn: round(e.credited),
      n: e.invoices, rev: e.reversed, ob: round(e.open),
      kind: e.d ? e.d.kind : null,
      lic: e.d ? e.d.licence : null, del: e.d ? e.d.delivery : null,
      mods: e.d ? e.d.modules : [],
      owner: e.d && e.d.owner ? e.d.owner.name : null,
      csm: e.d && e.d.csm ? e.d.csm.name : null,
      csm_off: !!(e.d && e.d.csm && e.d.csm.active === false),
      ls: e.d ? e.d.ls : null, le: e.d ? e.d.le : null,
      amount: e.d ? e.d.amount : null,
    })),
    pj: c.pj,
    hours: hasCost ? round(c.hours) : null,
    cost: hasCost ? round(c.cost) : null,
    cy: Object.fromEntries(Object.entries(c.cy).sort()
      .map(([y, b]) => [y, { hours: round(b.hours), cost: round(b.cost) }])),
  }))
    // Il lookback può creare clienti la cui competenza cade tutta prima
    // dell'anno iniziale: senza ricavi né progetti non sono una riga.
    .filter((r) => r.rt !== 0 || Object.keys(r.ra).length > 0 || r.pj.length > 0)
    .sort((a, b) => b.rt - a.rt);

  const costByYear = hasCost && rows.some((r) => Object.keys(r.cy).length > 0);
  const dates = inWindow.map((i) => i.date).sort();
  const clientProjects = projRows.filter((p) => p.k === "client" || p.k === "client_mgmt");
  const missingCrmid = clientProjects.filter((p) => p.link !== "crmid" && p.link !== "deal_name_field");
  return {
    generated_at: new Date().toISOString().slice(0, 19) + "+00:00",
    source: "live",
    version: "0.1",
    period: { from: dates[0] || null, to: dates[dates.length - 1] || null },
    revenue: {
      // "net" = imponibile al netto degli storni. "gross" = ripiego su Books.
      basis,
      credited: round(inWindow.reduce((s, i) => s + i.credited, 0)),
      reversed_invoices: inWindow.filter((i) => i.reversed).length,
      error: (errors && errors.revenue) || null,
    },
    cost_status: hasCost ? "ok" : "pending_analytics",
    cost_by_year: costByYear,
    cost_error: hasCost ? null : (errors && errors.cost) || null,
    // Ore registrate su persone senza tariffa oraria: costo sottostimato.
    cost_gaps: (() => {
      const g = projRows.filter((p) => p.c && (p.hours || 0) > 0 && (p.cost || 0) === 0);
      return { projects: g.length, hours: round(g.reduce((s, p) => s + p.hours, 0)) };
    })(),
    links: {
      linked: clientProjects.filter((p) => p.link === "crmid" || p.link === "deal_name_field").length,
      crmid_missing: missingCrmid.length,
      crmid_missing_guessed: missingCrmid.filter((p) => p.link === "name_guess").length,
      error: (errors && errors.links) || null,
    },
    accrual: {
      status: spansId.size ? "ok" : "unavailable",
      error: (errors && errors.accrual) || null,
      deals: spansId.size,
      matched, considered,
      coverage: considered ? round(matched / considered) : null,
    },
    currency: "EUR",
    totals: {
      revenue: round(rows.reduce((s, r) => s + r.rt, 0)),
      open_balance: round(rows.reduce((s, r) => s + r.ob, 0)),
      cost: hasCost ? round(rows.reduce((s, r) => s + (r.cost || 0), 0)) : null,
      invoices: inWindow.length, clients: rows.length,
    },
    clients: rows, projects: projRows,
    unmatched: [...new Set(unmatched)].sort(),
  };
}

export async function buildSnapshot() {
  const errors = {};

  let deals = [];
  try {
    deals = await fetchDeals();
  } catch (e) {
    errors.accrual = e.message;
  }

  // L'imponibile e le note di credito stanno solo in Analytics. Se non risponde
  // si ripiega su Books, dove il totale è IVA inclusa: la dashboard lo dichiara.
  let invoices = null, basis = "net";
  try {
    invoices = await fetchInvoicesAnalytics();
  } catch (e) {
    errors.revenue = e.message;
    basis = "gross";
    invoices = await fetchInvoicesBooks();
  }

  let projects = await fetchProjects();
  const links = await fetchProjectLinks().catch((e) => { errors.links = e.message; return null; });
  projects = linkProjectsToDeals(projects, deals, links);

  let costs = null;
  try {
    costs = await fetchProjectCosts();
  } catch (e) {
    errors.cost = e.message;
  }

  return assemble(invoices, projects, costs, deals, errors, { basis });
}
