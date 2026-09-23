/**
 * Pipeline Margine per Cliente — sorgenti Zoho via REST (datacenter EU).
 *
 * Variabili d'ambiente:
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN   (obbligatorie)
 *   ZOHO_BOOKS_ORG_ID         default 20069840369        Vivian Srl
 *   ZOHO_ANALYTICS_ORG_ID     default 20070118906
 *   ZOHO_ANALYTICS_WORKSPACE  default 86612000000004001  Global Reports
 *   ZOHO_PROJECTS_PORTAL_ID   default 20070118907
 *   REVENUE_FROM              default 2025-01-01   primo anno mostrato
 *   INVOICE_FROM              default 2024-01-01   lookback: serve solo per far
 *                                                  maturare in 2025 la coda delle
 *                                                  licenze fatturate prima
 *
 * Il ricavo è l'imponibile (Sub Total), al netto delle note di credito a storno.
 * Senza le credenziali l'app serve lo snapshot di seed in data/snapshot.json.
 */
import { finalClient, projectClass, PROJECT_ALIASES } from "./clients.js";
import RATES from "./rates.js";

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

/**
 * Il primo anno che la dashboard mostra. Vale per i ricavi e per le ore
 * insieme: se i due lati partissero da anni diversi il margine "all time"
 * sarebbe la sottrazione di due periodi che non coincidono.
 */
export const MIN_YEAR = () => Number(ENV("REVENUE_FROM", "2025-01-01").slice(0, 4)) || 2025;

/**
 * La tasklist che raccoglie il lavoro su difetti nostri.
 *
 * Quelle ore sono costo dell'azienda ma non del cliente: nascono da problemi
 * del prodotto, non da quello che il cliente ha comprato. Restano fuori dal
 * margine e vengono contate a parte, così si vede quanto pesano senza che
 * sporchino la redditività di chi le ha subite.
 *
 * Il confronto è sul nome normalizzato — maiuscole, spazi ai bordi e trattini
 * bassi iniziali non contano — perché su decine di progetti il nome viene
 * ricopiato a mano e una maiuscola diversa non deve far sparire il conteggio.
 */
export const INTERNAL_TASKLIST = () => ENV("INTERNAL_TASKLIST", "_INTERNAL DEBUG & FIX");
const normTask = (s) => String(s || "").trim().replace(/^[_\s]+/, "").replace(/\s+/g, " ").toUpperCase();
export const isInternalName = (name) => normTask(name) === normTask(INTERNAL_TASKLIST());
const round = (n) => Math.round(n * 100) / 100;

let cached = null;
async function accessToken(force) {
  if (!force && cached && cached.exp > Date.now() + 60000) return cached.value;
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

/**
 * Cosa dice Zoho del token, senza mai mostrarlo.
 *
 * Nella risposta allo scambio del refresh token c'è il campo `scope` con le
 * deleghe davvero concesse: è l'unico modo di sapere cosa ha in mano l'app,
 * invece di dedurlo dagli errori delle singole API.
 */
export async function tokenInfo() {
  const body = new URLSearchParams({
    refresh_token: ENV("ZOHO_REFRESH_TOKEN"),
    client_id: ENV("ZOHO_CLIENT_ID"),
    client_secret: ENV("ZOHO_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const j = await (await fetch(ACC + "/oauth/v2/token", { method: "POST", body })).json();
  const granted = String(j.scope || "").split(/[\s,]+/).filter(Boolean);
  const needed = [
    "ZohoBooks.invoices.READ", "ZohoProjects.portals.READ", "ZohoProjects.projects.READ",
    "ZohoAnalytics.data.read", "ZohoCRM.coql.READ", "ZohoCRM.modules.deals.READ",
    "ZohoCRM.users.READ",
  ];
  const has = (want) => granted.some((g) => g.toLowerCase() === want.toLowerCase() ||
    // Zoho accetta anche le forme larghe: data.all copre data.read, ALL copre READ.
    g.toLowerCase().replace(/\.(all|read|update|create)$/, "") === want.toLowerCase().replace(/\.(all|read|update|create)$/, "") &&
    /\.all$/i.test(g));
  return {
    ok: !!j.access_token,
    oauth_error: j.error || null,
    // Nessun token, nessun segreto: solo metadati.
    api_domain: j.api_domain || null,
    expires_in: j.expires_in || null,
    granted_scopes: granted,
    missing: needed.filter((n) => !has(n)),
    can_write_project_rates: has("ZohoProjects.users.UPDATE"),
    client_id_tail: ENV("ZOHO_CLIENT_ID").slice(-6) || null,
    refresh_token_tail: ENV("ZOHO_REFRESH_TOKEN").slice(-6) || null,
    books_org: ENV("ZOHO_BOOKS_ORG_ID", "20069840369"),
    analytics_org: ENV("ZOHO_ANALYTICS_ORG_ID", "20070118906"),
    analytics_workspace: ENV("ZOHO_ANALYTICS_WORKSPACE", "86612000000004001"),
    projects_portal: ENV("ZOHO_PROJECTS_PORTAL_ID", "20070118907"),
    // Una interrogazione vera al CRM, non solo le deleghe dichiarate: se i deal
    // non arrivano, tipo, moduli, owner e CSM spariscono dalla dashboard senza
    // che nulla lo dica. Qui l'errore di Zoho si legge per esteso.
    crm_probe: await probeDeals(),
  };
}

/** Prova a leggere un deal solo, e riporta com'è andata parola per parola. */
async function probeDeals() {
  const q =
    `select ${DEAL_FIELDS.join(", ")} from Deals ` +
    `where Modified_Time >= '2015-01-01T00:00:00+01:00' limit 0, 1`;
  try {
    const r = await zoho(`${API}/crm/v7/coql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ select_query: q }),
    });
    if (r.status === 204) return { ok: true, rows: 0, note: "the query answered, but with no deal" };
    const j = await r.json();
    const d = (j && j.data && j.data[0]) || null;
    return {
      ok: !!d,
      rows: (j && j.data && j.data.length) || 0,
      fields_returned: d ? Object.keys(d).sort() : [],
      sample: d ? {
        name: d.Deal_Name || null,
        licence: d.Licence ?? null,
        delivery: d.Delivery ?? null,
        modules: d.Licence_Modules ?? null,
        owner: (d.Owner && (d.Owner.name || d.Owner.id)) || null,
        csm: (d.Customer_Success_Manager &&
              (d.Customer_Success_Manager.name || d.Customer_Success_Manager.id)) || null,
      } : null,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Chiamata a Zoho con un solo secondo tentativo, e solo su 401.
 *
 * L'access token vive un'ora e lo teniamo in memoria per non rifare lo scambio
 * a ogni richiesta. Ma Zoho tiene in vita un numero limitato di access token
 * per client: ogni funzione che ne chiede uno nuovo — un'altra istanza appena
 * avviata, /api/tokeninfo, una pagina aperta in parallelo — può invalidare
 * quello che una funzione più vecchia si è tenuta da parte. Da lì il rifiuto
 * con "Invalid Oauthtoken" pur avendo un refresh token sanissimo, e da lì il
 * fatto che dopo un po' si risolvesse da solo: bastava che il token scadesse.
 *
 * Quindi su 401 si butta quello in memoria, se ne chiede uno nuovo e si riprova
 * una volta sola. Se il rifiuto è vero — scope mancanti, permessi — arriva
 * comunque, solo un istante dopo.
 */
async function zoho(url, init, retried) {
  const tok = await accessToken(!!retried);
  const r = await fetch(url, {
    ...(init || {}),
    headers: { Authorization: "Zoho-oauthtoken " + tok, ...((init && init.headers) || {}) },
    cache: "no-store",
  });
  if (r.status === 401 && !retried) {
    cached = null;
    return zoho(url, init, true);
  }
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
  const fromYear = ENV("INVOICE_FROM", "2024-01-01").slice(0, 4);
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
  const from = ENV("INVOICE_FROM", "2024-01-01");
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
/**
 * L'ultima lista di deal andata a buon fine, tenuta nell'istanza.
 *
 * Serve perché il CRM ogni tanto rifiuta una pagina — un token invalidato
 * altrove, un limite di chiamate — e finora un solo rifiuto buttava via tutto:
 * la dashboard restava con i ricavi e senza niente che venga dal CRM, e
 * scriveva "type not set" su ogni deal senza spiegare perché. Un dato di
 * mezz'ora fa è incomparabilmente meglio di nessun dato.
 */
let DEALS_OK = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dealPage(page) {
  const q =
    `select ${DEAL_FIELDS.join(", ")} from Deals ` +
    `where Modified_Time >= '2015-01-01T00:00:00+01:00' ` +
    `limit ${page * 200}, 200`;
  return zoho(`${API}/crm/v7/coql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ select_query: q }),
  });
}

export async function fetchDeals() {
  const users = await fetchUsers();
  const out = [];
  let failure = null;

  for (let page = 0; page < 25; page++) {
    let r;
    try {
      r = await dealPage(page);
    } catch (e) {
      // Un secondo tentativo dopo una pausa: quasi sempre basta.
      await sleep(1500);
      try { r = await dealPage(page); }
      catch (e2) { failure = `page ${page + 1}: ${e2.message}`; break; }
    }
    if (r.status === 204) break;
    let j;
    try { j = await r.json(); } catch (e) { failure = `page ${page + 1}: malformed answer`; break; }
    // COQL sa rispondere 200 con dentro un errore: va letto, non ignorato.
    if (j && j.status === "error") {
      failure = `page ${page + 1}: ${j.code || "error"} — ${j.message || ""}`.trim();
      break;
    }
    const batch = (j && j.data) || [];
    for (const d of batch) out.push(dealRecord(d, users));
    if (batch.length < 200 || !j.info || !j.info.more_records) break;
  }

  if (!out.length) {
    // Niente di niente: meglio l'ultima lista buona che una pagina svuotata.
    if (DEALS_OK) {
      const stale = DEALS_OK.deals.slice();
      stale.error = (failure || "the CRM returned no deals") +
        " — showing the last list that came through, from " +
        new Date(DEALS_OK.at).toISOString().slice(0, 16).replace("T", " ") + " UTC";
      stale.stale = true;
      return stale;
    }
    const empty = [];
    empty.error = failure || "the CRM returned no deals";
    return empty;
  }

  if (failure) {
    // Lista parziale: si tiene, ma lo si dice.
    out.error = failure + ` — kept the ${out.length} deals read before the refusal`;
    out.partial = true;
    if (!DEALS_OK || out.length > DEALS_OK.deals.length) DEALS_OK = { at: Date.now(), deals: out.slice() };
    return out;
  }

  DEALS_OK = { at: Date.now(), deals: out.slice() };
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
const TASKS = "Tasks (Zoho Projects)";

/**
 * Riconoscere in SQL la tasklist del debug interno.
 *
 * Il confronto va fatto sul nome ripulito, non sul nome così com'è: su decine
 * di progetti la tasklist viene ricreata a mano e basta una maiuscola o uno
 * spazio di troppo perché quelle ore tornino a pesare sul cliente in silenzio.
 * Il trattino basso iniziale, che è una convenzione di Kleecks per marcare le
 * cose interne, viene tolto da entrambe le parti.
 */
const INTERNAL_SQL = (() => {
  const wanted = ENV("INTERNAL_TASKLIST", "_INTERNAL DEBUG & FIX")
    .trim().replace(/^[_\s]+/, "").replace(/\s+/g, " ").toUpperCase().replace(/'/g, "''");
  const clean = (col) => `UPPER(TRIM(REPLACE(${col}, '_', '')))`;
  // Predicato, non espressione: sta in una WHERE sulla sola tabella dei task,
  // così il confronto pesante gira su qualche decina di righe invece che su
  // ogni riga del join.
  return `${clean('"Tasklist Name"')} = '${wanted}' OR ${clean('"Task Name"')} = '${wanted}'`;
})();

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

/**
 * Tariffa prevalente per persona: media delle ore che una tariffa ce l'hanno,
 * pesata sulle ore. Serve a stimare quanto costerebbero le ore registrate a
 * tariffa zero, senza toccare il dato in Zoho.
 */
export async function fetchUserRates() {
  const c = await timeLogColumns();
  const rate = c.rate || "Cost Per Hour";
  const sql =
    `SELECT CONCAT("User ID",'') AS uid, ` +
    `SUM(CASE WHEN "${rate}" > 0 THEN "${c.hours}"*"${rate}" ELSE 0 END)/` +
    `NULLIF(SUM(CASE WHEN "${rate}" > 0 THEN "${c.hours}" ELSE 0 END),0)*1 AS avg_rate, ` +
    `SUM(CASE WHEN "${rate}" > 0 THEN "${c.hours}" ELSE 0 END)*1 AS rated, ` +
    `SUM(CASE WHEN "${rate}" > 0 THEN 0 ELSE "${c.hours}" END)*1 AS unrated ` +
    `FROM "${TIME_LOGS}" GROUP BY "User ID"`;
  const map = new Map();
  for (const r of parseCsv(await runCostQueryRaw(sql))) {
    const uid = String(r.uid || "").trim();
    if (!uid) continue;
    map.set(uid, { rate: round(num(r.avg_rate)), rated: round(num(r.rated)), unrated: round(num(r.unrated)) });
  }
  return map;
}

/**
 * Tariffa oraria di una persona in un dato anno, secondo i cedolini.
 *
 * Un progetto del passato ha prodotto il margine del passato con le tariffe di
 * allora: applicargli quelle di oggi darebbe un numero falso. Quindi la
 * tariffa segue l'anno del time log. Chi è uscito dall'azienda tiene la
 * tariffa dell'ultimo anno in cui era a libro paga. Un anno che eredita da un
 * altro (il 2027 dal 2026, finché non arrivano i dati veri) lo dichiara.
 */
export function rateFor(userId, year, month) {
  const p = RATES.people[String(userId)];
  if (!p || !p.rates) return { rate: 0, basis: "none" };
  const y = String(year);

  /**
   * Prima il mese, poi l'anno.
   *
   * La mediana dell'anno serviva a non farsi sballare dal mese di uscita, che
   * porta il TFR. Ma appiattisce anche un cambiamento vero: uno stagista assunto
   * a giugno passa da 600 a 2.780 euro al mese, e la mediana dell'anno lo tiene
   * a 600 fino a dicembre — cioè costa un terzo del vero su metà anno, e ogni
   * margine che tocca risulta migliore di quello che è. Con la tariffa del mese
   * il passaggio si vede quando avviene, e il mese di uscita resta smussato
   * perché viene corretto già nel file delle tariffe.
   */
  if (month && p.monthly) {
    const ym = y + "-" + String(month).padStart(2, "0");
    if (p.monthly[ym]) return { rate: p.monthly[ym], basis: "payroll", year: y, month: ym };
    // Mese scoperto dentro un anno coperto: vale il mese più vicino all'indietro,
    // che è il contratto in vigore in quel momento.
    const keys = Object.keys(p.monthly).sort().filter((k) => k <= ym);
    if (keys.length && keys[keys.length - 1].slice(0, 4) === y) {
      return { rate: p.monthly[keys[keys.length - 1]], basis: "payroll", year: y, month: keys[keys.length - 1] };
    }
  }

  if (p.rates[y]) return { rate: p.rates[y], basis: "payroll", year: y };

  // Quando si eredita da un altro anno vale l'ultimo mese di quell'anno, non la
  // sua mediana: chi ha cambiato contratto a metà anno deve portarsi dietro il
  // contratto nuovo, non la media fra il vecchio e il nuovo.
  const lastMonthOf = (yy) => {
    if (!p.monthly) return null;
    const k = Object.keys(p.monthly).filter((m) => m.slice(0, 4) === String(yy)).sort();
    return k.length ? { rate: p.monthly[k[k.length - 1]], month: k[k.length - 1] } : null;
  };

  const cfg = RATES.years[y];
  if (cfg && cfg.inherits && p.rates[cfg.inherits]) {
    const lm = lastMonthOf(cfg.inherits);
    return { rate: lm ? lm.rate : p.rates[cfg.inherits], basis: "inherited",
             year: cfg.inherits, month: lm ? lm.month : undefined };
  }
  // Anno non coperto: si prende l'ultimo anno disponibile che non sia futuro.
  const years = Object.keys(p.rates).sort();
  const past = years.filter((k) => k <= y);
  if (past.length) {
    const k = past[past.length - 1];
    const lm = lastMonthOf(k);
    return { rate: lm ? lm.rate : p.rates[k], basis: "carried", year: k,
             month: lm ? lm.month : undefined };
  }
  // Solo anni successivi: è qualcuno assunto dopo. Meglio il primo che c'è.
  if (years.length) return { rate: p.rates[years[0]], basis: "later", year: years[0] };
  return { rate: 0, basis: "none" };
}

export const RATE_YEARS = RATES.years;
export const RATE_PEOPLE = RATES.people;

export async function fetchProjectCosts() {
  const c = await timeLogColumns();
  if (!c.project || !c.hours) {
    throw new Error("Time Logs: colonne non riconosciute — disponibili: " + c.all.join(" | "));
  }
  const rate = c.rate || "Cost Per Hour";
  // Le ore partono dallo stesso anno dei ricavi. Senza questo taglio il costo
  // arrivava dal primo time log mai registrato mentre il ricavo partiva dal
  // 2025: il margine "all time" sottraeva anni di lavoro che nessuna fattura
  // di questa dashboard copre, e nel selettore comparivano anni morti.
  const from = MIN_YEAR();
  // Ore per progetto, persona e anno. Il costo non si fa più in SQL con la
  // tariffa impressa sul log — che per migliaia di ore è zero — ma qui, con la
  // tariffa dei cedolini dell'anno in cui l'ora è stata registrata.
  // Le ore di debug interno si riconoscono dalla tasklist del task su cui sono
  // registrate, quindi serve il join con i task: i log senza task (generici o
  // su bug) non possono esserlo e restano lavoro cliente.
  // Il join si fa contro i soli task della tasklist interna, non contro tutti.
  // La versione precedente univa le due tabelle per intero e confrontava le
  // chiavi con CONCAT su entrambi i lati: nessun indice regge un confronto così,
  // e il job finiva in coda oltre il tempo massimo. Filtrando prima si passa da
  // diecimila task a qualche decina, e il CASE pesante gira solo su quelli.
  const flag = `CASE WHEN T."Task ID" IS NULL THEN 0 ELSE 1 END`;
  const sql =
    `SELECT CONCAT(L."${c.project}",'') AS pid, CONCAT(L."User ID",'') AS uid, ` +
    `YEAR(L."${c.date}") AS yr, MONTH(L."${c.date}") AS mo, ${flag} AS internal, ` +
    `SUM(L."${c.hours}")*1 AS hours, ` +
    `SUM(L."${c.hours}"*L."${rate}")*1 AS zoho_cost, ` +
    `SUM(CASE WHEN L."${rate}" > 0 THEN 0 ELSE L."${c.hours}" END)*1 AS unrated ` +
    `FROM "${TIME_LOGS}" L ` +
    `LEFT JOIN (SELECT "Task ID" FROM "${TASKS}" WHERE ${INTERNAL_SQL}) T ` +
    `ON T."Task ID" = L."Task ID" ` +
    `WHERE YEAR(L."${c.date}") >= ${from} ` +
    `GROUP BY L."${c.project}", L."User ID", YEAR(L."${c.date}"), MONTH(L."${c.date}"), ${flag}`;

  const map = {};
  for (const r of parseCsv(await runCostQueryRaw(sql))) {
    const pid = String(r.pid || "").trim();
    if (!pid) continue;
    const uid = String(r.uid || "").trim();
    const y = String(r.yr || "").trim().slice(0, 4);
    const mo = String(r.mo || "").trim();
    const hours = num(r.hours);
    if (!hours) continue;

    const { rate: hourly, basis } = rateFor(uid, y, mo);
    // Senza cedolino resta quanto Zoho aveva impresso sul log: meglio di zero.
    const zohoCost = num(r.zoho_cost);
    const cost = hourly > 0 ? hours * hourly : zohoCost;
    const priced = hourly > 0 ? "payroll" : zohoCost > 0 ? "zoho" : "none";

    const internal = String(r.internal || "").trim() === "1";

    const e = map[pid] || (map[pid] = {
      hours: 0, cost: 0, unrated: 0, ihours: 0, icost: 0, byYear: {}, basis: {},
    });
    // Le ore interne stanno in due campi loro: il margine si fa senza, e chi
    // vuole vedere il margine "tutto compreso" somma i due.
    if (internal) { e.ihours += hours; e.icost += cost; }
    else { e.hours += hours; e.cost += cost; if (priced === "none") e.unrated += hours; }
    e.basis[priced] = round((e.basis[priced] || 0) + hours);
    if (basis && hourly > 0 && basis !== "payroll") e.basis[basis] = round((e.basis[basis] || 0) + hours);
    if (y) {
      const b = e.byYear[y] ||
        (e.byYear[y] = { hours: 0, cost: 0, unrated: 0, ihours: 0, icost: 0 });
      if (internal) { b.ihours += hours; b.icost += cost; }
      else { b.hours += hours; b.cost += cost; if (priced === "none") b.unrated += hours; }
    }
  }
  COSTS_OK = { at: Date.now(), map };
  return map;
}

/**
 * L'ultimo costo buono, tenuto da parte.
 *
 * Analytics serve i job in coda: quando il workspace è carico il job scade e
 * finora questo azzerava tutta la metà dei costi, lasciando la pagina con i soli
 * ricavi. Un rallentamento di qualche minuto non è una buona ragione per far
 * sparire il margine, quindi l'ultimo risultato riuscito resta disponibile e
 * viene ripresentato marcato come non fresco, con l'ora a cui risale.
 */
let COSTS_OK = null;

export function lastGoodCosts() {
  return COSTS_OK;
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
  const from = MIN_YEAR();
  /**
   * Anche qui si raggruppa per anno, e per lo stesso motivo del costo di
   * progetto: la tariffa da applicare è quella dei cedolini dell'anno in cui
   * l'ora è stata registrata.
   *
   * Prima questa query valorizzava con il Cost Per Hour impresso sul log da
   * Zoho, mentre la dashboard usava i cedolini — e le due cose non coincidono
   * mai. Il risultato era un foglio per persona che smentiva la dashboard, con
   * tariffe vecchie o a zero, e un margine di progetto diverso da quello a
   * schermo per lo stesso progetto.
   */
  const sql =
    `SELECT CONCAT("${c.project}",'') AS pid, CONCAT("User ID",'') AS uid, ` +
    `YEAR("${c.date}") AS yr, MONTH("${c.date}") AS mo, ` +
    `SUM("${c.hours}")*1 AS hours, SUM("${c.hours}"*"${rate}")*1 AS zoho_cost, ` +
    `COUNT(*)*1 AS logs, DATE_FORMAT(MIN("${c.date}"),'%Y-%m-%d') AS first_log, ` +
    `DATE_FORMAT(MAX("${c.date}"),'%Y-%m-%d') AS last_log ` +
    `FROM "${TIME_LOGS}" ` +
    `WHERE YEAR("${c.date}") >= ${from} ` +
    (ids ? `AND CONCAT("${c.project}",'') IN (${ids.map((i) => `'${i}'`).join(",")}) ` : "") +
    `GROUP BY "${c.project}", "User ID", YEAR("${c.date}"), MONTH("${c.date}")`;
  const raw = parseCsv(await runCostQueryRaw(sql));
  const users = await userNames();

  const acc = new Map();
  for (const r of raw) {
    const pid = String(r.pid || "").trim();
    if (!pid) continue;
    const uid = String(r.uid || "").trim();
    const y = String(r.yr || "").trim().slice(0, 4);
    const mo = String(r.mo || "").trim();
    const hours = num(r.hours);
    if (!hours) continue;

    const { rate: hourly, basis } = rateFor(uid, y, mo);
    const zohoCost = num(r.zoho_cost);
    const cost = hourly > 0 ? hours * hourly : zohoCost;
    const priced = hourly > 0 ? "payroll" : zohoCost > 0 ? "zoho" : "none";

    const key = pid + "|" + uid;
    const e = acc.get(key) || {
      pid, uid, hours: 0, cost: 0, logs: 0, unrated: 0,
      first: null, last: null, basis: {}, years: {},
    };
    e.hours += hours; e.cost += cost; e.logs += Math.round(num(r.logs));
    if (priced === "none") e.unrated += hours;
    e.basis[priced] = round((e.basis[priced] || 0) + hours);
    if (basis && hourly > 0 && basis !== "payroll") e.basis[basis] = round((e.basis[basis] || 0) + hours);
    if (y) {
      const ye = e.years[y] || (e.years[y] = { hours: 0, cost: 0 });
      ye.hours = round(ye.hours + hours); ye.cost = round(ye.cost + cost);
      ye.rate = ye.hours ? round(ye.cost / ye.hours) : 0;
    }
    if (r.first_log && (!e.first || r.first_log < e.first)) e.first = r.first_log;
    if (r.last_log && (!e.last || r.last_log > e.last)) e.last = r.last_log;
    acc.set(key, e);
  }

  const out = {};
  for (const e of acc.values()) {
    const u = users.map[e.uid] || {};
    (out[e.pid] || (out[e.pid] = [])).push({
      user_id: e.uid,
      person: u.name || e.uid || "(unknown)",
      role: u.role || null,
      logs: e.logs,
      hours: round(e.hours), cost: round(e.cost),
      // La tariffa mostrata è quella effettiva: se una persona ha lavorato su
      // due anni con due tariffe, è la media pesata sulle ore, non una delle due.
      rate: e.hours ? round(e.cost / e.hours) : 0,
      unrated: round(e.unrated),
      // Da dove viene il prezzo di quelle ore: cedolino, tariffa impressa da
      // Zoho, o niente. Senza questo una tariffa strana non si spiega.
      priced: e.basis,
      years: e.years,
      first: e.first, last: e.last,
    });
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.hours - a.hours);
  return out;
}

/**
 * Cosa scriveremmo in Zoho Projects se allineassimo le tariffe di un anno.
 * Una riga per coppia progetto-persona con ore in quell'anno: tariffa che i
 * log portano oggi, tariffa dai cedolini, e differenza di costo. Serve a
 * guardare prima di scrivere, non a scrivere.
 */
export async function fetchRatePlan(year) {
  const c = await timeLogColumns();
  const rate = c.rate || "Cost Per Hour";
  const sql =
    `SELECT CONCAT(T."${c.project}",'') AS pid, P."Project Name" AS pname, P."Status" AS pstatus, ` +
    `CONCAT(T."User ID",'') AS uid, U."User Name" AS person, SUM(T."${c.hours}")*1 AS hours, ` +
    `MAX(T."${rate}")*1 AS cur_rate, ` +
    `SUM(CASE WHEN T."${rate}" > 0 THEN 0 ELSE T."${c.hours}" END)*1 AS unrated, ` +
    `DATE_FORMAT(MAX(T."${c.date}"),'%Y-%m-%d') AS last_log ` +
    `FROM "${TIME_LOGS}" T ` +
    `LEFT JOIN "Users (Zoho Projects)" U ON U."User ID" = T."User ID" ` +
    `LEFT JOIN "Projects (Zoho Projects)" P ON P."Project ID" = T."${c.project}" ` +
    `WHERE YEAR(T."${c.date}") = ${Number(year)} ` +
    `GROUP BY T."${c.project}", P."Project Name", P."Status", T."User ID", U."User Name"`;

  const rows = [];
  for (const r of parseCsv(await runCostQueryRaw(sql))) {
    const uid = String(r.uid || "").trim();
    const hours = num(r.hours);
    if (!hours) continue;
    const cur = num(r.cur_rate);
    const { rate: target, basis } = rateFor(uid, String(year));
    rows.push({
      project_id: String(r.pid || "").trim(),
      project: String(r.pname || "").trim() || "(project not named)",
      status: String(r.pstatus || "").trim(),
      user_id: uid,
      person: String(r.person || "").trim() || uid,
      hours: round(hours),
      current: round(cur),
      target: round(target),
      basis,
      unrated: round(num(r.unrated)),
      last_log: r.last_log || null,
      delta: round(hours * (target - cur)),
      change: target > 0 && Math.abs(target - cur) >= 0.01,
    });
  }
  return rows.sort((a, b) => b.hours - a.hours);
}

/**
 * Scrive in Zoho Projects la tariffa oraria di ogni persona su ogni progetto
 * con ore nell'anno indicato.
 *
 * Si scrive solo quando `apply` è vero: senza, si limita a dire cosa farebbe.
 * Vale per le ore future, non per quelle già registrate — la tariffa è impressa
 * sul singolo time log quando viene salvato. Serve lo scope
 * ZohoProjects.users.UPDATE, che gli altri percorsi dell'app non usano.
 */
export async function applyRatePlan(year, opts) {
  const o = opts || {};
  const portal = ENV("ZOHO_PROJECTS_PORTAL_ID", "20070118907");
  const plan = (await fetchRatePlan(year)).filter((r) => r.change);
  const only = o.projects ? new Set(o.projects.map(String)) : null;
  const rows = only ? plan.filter((r) => only.has(r.project_id)) : plan;

  const out = { year, apply: !!o.apply, planned: rows.length, written: 0, failed: 0, log: [] };
  if (!o.apply) {
    out.log = rows.map((r) => ({
      project: r.project, project_id: r.project_id, person: r.person,
      from: r.current, to: r.target, hours: r.hours, status: "not written — dry run",
    }));
    return out;
  }

  for (const r of rows) {
    const url = `https://projectsapi.zoho.eu/restapi/portal/${portal}/projects/${r.project_id}` +
                `/users/${r.user_id}/`;
    try {
      const body = new URLSearchParams({ cost_per_hour: String(r.target) });
      await zoho(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      out.written += 1;
      out.log.push({ project: r.project, person: r.person, from: r.current, to: r.target, status: "written" });
    } catch (e) {
      out.failed += 1;
      out.log.push({ project: r.project, person: r.person, from: r.current, to: r.target,
                     status: "failed — " + e.message.slice(0, 180) });
      // Lo scope mancante fallisce su ogni riga: inutile insistere per centinaia.
      if (out.failed >= 5 && out.written === 0) {
        out.log.push({ status: "stopped after five failures in a row — check that the refresh token " +
                               "carries ZohoProjects.users.UPDATE" });
        break;
      }
    }
  }
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
      let j = await (await zoho(a.url, a.init)).json();
      // Analytics non sempre usa il codice di stato: un token invalido può
      // arrivare dentro un 200. Se lo dice nel corpo, si rifà con un token nuovo.
      if (j && j.data && String(j.data.errorCode) === "8535") {
        cached = null;
        j = await (await zoho(a.url, a.init)).json();
      }
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

/**
 * Il tempo che tutti i job Analytics di una richiesta hanno in tutto.
 *
 * Alzare il tetto del singolo job non basta: una pagina ne lancia tre o quattro
 * di fila, e se ognuno aspetta il suo massimo la somma supera i 300 secondi che
 * Vercel concede alla funzione — a quel punto non scade il job, scade la pagina,
 * e non si vede più niente. Il budget è condiviso: l'ultimo job eredita quello
 * che resta, e se non resta abbastanza rinuncia subito, lasciando spazio alla
 * cache dei costi invece che a un errore.
 */
let BUDGET_UNTIL = 0;

export function startAnalyticsBudget(seconds) {
  const s = Number(seconds) || Number(ENV("ANALYTICS_BUDGET", "200")) || 200;
  BUDGET_UNTIL = Date.now() + s * 1000;
}

async function runCostQueryRaw(sql) {
  const org = ENV("ZOHO_ANALYTICS_ORG_ID", "20070118906");
  const ws = ENV("ZOHO_ANALYTICS_WORKSPACE", "86612000000004001");
  const cfg = JSON.stringify({ responseFormat: "csv", sqlQuery: sql });
  const head = { "ZANALYTICS-ORGID": org };

  const jobId = await createExportJob(ws, cfg, head);

  // Attesa a passo crescente. I job che Analytics serve subito tornano in un
  // paio di secondi e non ha senso aspettarne due a vuoto; quelli che finiscono
  // in coda quando il workspace è carico hanno bisogno di ben più di 80 secondi,
  // che era il tetto precedente e cadeva proprio nei momenti di traffico.
  let ready = false;
  let waited = 0;
  const perJob = Number(ENV("ANALYTICS_JOB_TIMEOUT", "150")) * 1000;
  const left = BUDGET_UNTIL ? BUDGET_UNTIL - Date.now() : perJob;
  if (BUDGET_UNTIL && left < 15000) {
    throw new Error("Analytics: out of time for this refresh — the earlier queries used the budget");
  }
  const CEILING = Math.min(perJob, BUDGET_UNTIL ? left : perJob);
  while (!ready && waited < CEILING) {
    const step = waited < 6000 ? 1000 : waited < 30000 ? 2000 : 4000;
    await new Promise((r) => setTimeout(r, step));
    waited += step;
    const d = await (await zoho(
      `${ANA}/restapi/v2/bulk/workspaces/${ws}/exportjobs/${jobId}`, { headers: head })).json();
    const code = String((d && d.data && d.data.jobCode) || "");
    if (code === "1004") ready = true;
    else if (code.startsWith("7")) throw new Error("Analytics: job failed " + code);
  }
  if (!ready) {
    throw new Error("Analytics: job still queued after " + Math.round(CEILING / 1000) +
                    "s — the workspace is busy, not a configuration problem");
  }

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
  const iU = head.indexOf("unrated_hours");
  if (iId < 0 || iH < 0 || iC < 0) throw new Error("Cost CSV: unexpected columns — " + head.join("|"));
  const map = {};
  for (const line of lines.slice(1)) {
    const c = splitCsv(line);
    const id = String(c[iId] || "").trim();
    if (!id) continue;
    const e = map[id] || (map[id] = { hours: 0, cost: 0, unrated: 0, byYear: {} });
    const h = num(c[iH]), k = num(c[iC]), u = iU >= 0 ? num(c[iU]) : 0;
    e.hours += h; e.cost += k; e.unrated += u;
    if (iY >= 0 && c[iY]) {
      const y = String(c[iY]).trim().slice(0, 4);
      const b = e.byYear[y] || (e.byYear[y] = { hours: 0, cost: 0, unrated: 0 });
      b.hours += h; b.cost += k; b.unrated += u;
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
  const revFrom = ENV("REVENUE_FROM", "2025-01-01");
  const minYear = revFrom.slice(0, 4);
  const basis = (opts && opts.basis) || "net";

  const dealById = new Map((deals || []).map((d) => [String(d.id), d]));

  // Ripiego sul nome quando l'id non trova nulla: un solo deal con quel nome
  // vale come collegamento, due no. Serve perché la fattura può portare un id
  // che la lista dei deal non copre — e senza questo il deal resterebbe muto
  // su tipo, moduli, owner e CSM pur essendo in CRM con tutto compilato.
  const dealByName = new Map();
  for (const d of deals || []) {
    const k = norm(d.name);
    if (!k) continue;
    dealByName.set(k, dealByName.has(k) ? null : d);
  }
  const findDeal = (id, name) => {
    const hit = id ? dealById.get(String(id)) : null;
    if (hit) return hit;
    return (name && dealByName.get(norm(name))) || null;
  };
  const spansName = dealSpans(deals);
  const spansId = spansById(deals);

  const clients = new Map();
  const slot = (name) => {
    if (!clients.has(name)) {
      clients.set(name, { c: name, p: new Set(), ba: new Set(), ry: {}, ra: {}, rt: 0, n: 0,
                          ob: 0, cn: 0, rev: 0, deals: new Map(), pj: [], hours: 0, cost: 0,
                          ihours: 0, icost: 0, cy: {} });
    }
    return clients.get(name);
  };

  let matched = 0, considered = 0;
  // Quante fatture portano un deal id e quante di quelle trovano davvero il
  // deal in CRM: se la seconda è zero mentre la prima non lo è, i deal non sono
  // arrivati e ogni campo che viene dal CRM resta vuoto.
  let withDealId = 0, resolvedDeal = 0, resolvedByName = 0;
  const inWindow = [];
  // Da quale cliente è passato ogni deal: serve al lifetime value, che conta
  // anche i deal vinti e mai fatturati e quindi non può ricavarlo dalle fatture.
  const dealClient = new Map();

  for (const i of invoices) {
    const byId = i.dealId ? dealById.get(String(i.dealId)) : null;
    const deal = byId || findDeal(null, i.dealName);
    if (i.dealId) { withDealId += 1; if (byId) resolvedDeal += 1; }
    if (!byId && deal) resolvedByName += 1;
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

    if (i.dealId) dealClient.set(String(i.dealId), name);

    if (dealName || i.dealId) {
      const key = i.dealId || dealName;
      const e = c.deals.get(key) || {
        id: i.dealId || null, name: dealName || "(deal not named)",
        revenue: 0, credited: 0, invoices: 0, reversed: 0, open: 0,
        ra: {}, d: deal || null,
      };
      e.revenue += amount; e.credited += i.credited; e.invoices += 1;
      e.open += i.balance;
      // Competenza per anno anche a livello di deal: senza, il margine di un
      // progetto resterebbe quello di sempre mentre sopra si guarda un anno solo.
      for (const [y, v] of Object.entries(alloc.years)) {
        if (y < minYear) continue;
        e.ra[y] = round((e.ra[y] || 0) + v);
      }
      if (i.reversed) e.reversed += 1;
      c.deals.set(key, e);
    }
  }

  // Quanto ha incassato ogni deal, a prescindere dal cliente: serve a dare un
  // margine ai progetti che a quel deal sono agganciati.
  const dealRevenue = new Map();
  const dealRevenueByYear = new Map();
  for (const c of clients.values()) {
    for (const [key, e] of c.deals) if (e.id) {
      dealRevenue.set(e.id, round((dealRevenue.get(e.id) || 0) + e.revenue));
      const by = dealRevenueByYear.get(e.id) || {};
      for (const [y, v] of Object.entries(e.ra || {})) by[y] = round((by[y] || 0) + v);
      dealRevenueByYear.set(e.id, by);
    }
  }
  const perDeal = new Map();
  for (const p of projects) {
    if (!p.dealId) continue;
    perDeal.set(p.dealId, (perDeal.get(p.dealId) || 0) + 1);
  }

  /**
   * Lifetime value: tutti i deal vinti di quel cliente in CRM, importo pieno.
   *
   * Non è il fatturato e non ci somiglia: conta anche i deal vinti che non sono
   * mai stati fatturati, e ignora il fatturato di deal vinti fuori periodo.
   * È una misura di quanto pesa il cliente per l'azienda, e va letta come tale
   * — chi prova a farla quadrare con i ricavi non ci riuscirà mai.
   *
   * In CRM convivono due generazioni di stage ("Won" e "8. Client Won"):
   * contarne una sola perderebbe silenziosamente un decimo dei deal vinti.
   */
  const isWon = (s) => /won$/i.test(String(s || "").trim());
  const ltv = new Map();
  let ltvOutside = 0, ltvOutsideAmount = 0;
  for (const d of deals || []) {
    if (!isWon(d.stage)) continue;
    // Prima da dove è passato davvero il denaro, poi dal nome del deal come
    // per le fatture: un deal mai fatturato non ha altra strada.
    const cli = dealClient.get(String(d.id)) || finalClient(d.account || "", d.name || "")[0];
    if (!cli || !clients.has(cli)) {
      ltvOutside += 1; ltvOutsideAmount += Number(d.amount) || 0;
      continue;
    }
    const e = ltv.get(cli) || { amount: 0, deals: 0 };
    e.amount += Number(d.amount) || 0; e.deals += 1;
    ltv.set(cli, e);
  }

  const names = [...clients.keys()];
  const projRows = [], unmatched = [];
  for (const p of projects) {
    const k = projectClass(p.name);
    const cli = k === "client" || k === "client_mgmt" ? matchClient(p.name, names) : null;
    const cst = (costs && costs[p.id]) || null;
    const deal = p.dealId ? dealById.get(p.dealId) : null;
    // Il totale del progetto è la somma degli anni tenuti, non il totale di
    // sempre: ricavo e costo devono coprire lo stesso periodo, altrimenti il
    // margine "all time" sottrae anni che nessuna fattura qui dentro copre.
    const kept = cst ? Object.entries(cst.byYear || {}).filter(([y]) => y >= minYear) : [];
    const keptHours = kept.reduce((s, [, b]) => s + b.hours, 0);
    const keptCost = kept.reduce((s, [, b]) => s + b.cost, 0);
    const keptUnrated = kept.reduce((s, [, b]) => s + (b.unrated || 0), 0);
    // Debug interno: fuori dal costo cliente, ma contato, perché è il prezzo
    // dei nostri difetti e va saputo.
    const keptIH = kept.reduce((s, [, b]) => s + (b.ihours || 0), 0);
    const keptIC = kept.reduce((s, [, b]) => s + (b.icost || 0), 0);
    projRows.push({
      id: p.id, n: p.name, k, c: cli, s: p.status,
      crmid: p.crmid || null, link: p.link || "none", dealId: p.dealId || null,
      deal: deal ? { id: deal.id, name: deal.name, kind: deal.kind, amount: deal.amount } : null,
      hours: cst ? round(keptHours) : null, cost: cst ? round(keptCost) : null,
      unrated: cst ? round(keptUnrated) : null,
      ih: cst ? round(keptIH) : null, ic: cst ? round(keptIC) : null,
      // Il margine del progetto ha senso solo quando quel deal è servito da un
      // progetto solo: se sono due o più, il ricavo è di tutti insieme e
      // attribuirlo a uno sarebbe inventare.
      drev: p.dealId ? (dealRevenue.get(p.dealId) ?? null) : null,
      dry: p.dealId ? (dealRevenueByYear.get(p.dealId) || {}) : null,
      dshare: p.dealId ? (perDeal.get(p.dealId) || 1) : null,
      // Anche qui il pavimento sull'anno: una cache vecchia o un log fuori
      // periodo non deve rientrare dalla finestra.
      cy: cst ? Object.fromEntries(kept.sort()
        .map(([y, b]) => [y, {
          hours: round(b.hours), cost: round(b.cost),
          ih: round(b.ihours || 0), ic: round(b.icost || 0),
        }])) : {},
    });
    if (k === "client" || k === "client_mgmt") {
      if (cli) {
        const c = slot(cli);
        c.pj.push(p.id);
        if (cst) {
          c.hours += keptHours; c.cost += keptCost;
          c.ihours += keptIH; c.icost += keptIC;
          for (const [y, b] of kept) {
            const t = c.cy[y] || (c.cy[y] = { hours: 0, cost: 0, ih: 0, ic: 0 });
            t.hours += b.hours; t.cost += b.cost;
            t.ih += b.ihours || 0; t.ic += b.icost || 0;
          }
        }
      } else unmatched.push(p.name);
    }
  }

  const hasCost = !!costs && Object.keys(costs).length > 0;
  /**
   * Quanto è stato venduto a quel cliente secondo il CRM, contro quanto è stato
   * fatturato. Sono due misure diverse dello stesso rapporto: l'Amount dice il
   * valore del contratto, la fattura dice cosa è entrato finora. Il margine
   * sull'Amount risponde a "il venduto regge i costi?", quello sul fatturato a
   * "quest'anno abbiamo guadagnato?".
   */
  const amountOf = (c) => {
    let amt = 0, n = 0, early = 0;
    for (const e of c.deals.values()) {
      if (!e.d || !(Number(e.d.amount) > 0)) continue;
      amt += Number(e.d.amount); n += 1;
      // Deal chiuso prima della finestra: il suo costo non è nei nostri conti,
      // quindi il margine sull'Amount risulterebbe migliore del vero.
      if (e.d.closing && String(e.d.closing).slice(0, 4) < minYear) early += 1;
    }
    return { amt: round(amt), n, early };
  };

  const rows = [...clients.values()].map((c) => {
  const sold = amountOf(c);
  return ({
    c: c.c, p: [...c.p].sort(), ba: [...c.ba].sort(),
    ry: Object.fromEntries(Object.entries(c.ry).sort().map(([k, v]) => [k, round(v)])),
    ra: Object.fromEntries(Object.entries(c.ra).sort().map(([k, v]) => [k, round(v)])),
    rt: round(c.rt), n: c.n, ob: round(c.ob), cn: round(c.cn), rev: c.rev,
    d: [...c.deals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8).map((e) => ({
      id: e.id, name: e.name, r: round(e.revenue), cn: round(e.credited),
      // Ricavo di competenza anno per anno: senza, aprendo un cliente su un
      // anno solo i deal continuerebbero a mostrare il totale di sempre.
      ry: Object.fromEntries(Object.entries(e.ra || {}).sort()),
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
    // Lifetime value dal CRM, e quanti deal lo compongono.
    ltv: ltv.has(c.c) ? round(ltv.get(c.c).amount) : null,
    ltvn: ltv.has(c.c) ? ltv.get(c.c).deals : 0,
    // Valore a contratto dei deal che questo cliente porta in dashboard.
    amt: sold.amt || null,
    amtn: sold.n,
    amt_early: sold.early,
    hours: hasCost ? round(c.hours) : null,
    cost: hasCost ? round(c.cost) : null,
    // Ore e costo del debug interno, tenuti a parte dal costo cliente.
    ihours: hasCost ? round(c.ihours) : null,
    icost: hasCost ? round(c.icost) : null,
    cy: Object.fromEntries(Object.entries(c.cy).sort()
      .map(([y, b]) => [y, {
        hours: round(b.hours), cost: round(b.cost),
        ih: round(b.ih || 0), ic: round(b.ic || 0),
      }])),
  }); })
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
    // Il primo anno mostrato, ricavi e ore insieme. Chi costruisce un elenco di
    // anni si ferma qui, altrimenti ricompaiono anni che la dashboard non copre.
    min_year: minYear,
    revenue: {
      // "net" = imponibile al netto degli storni. "gross" = ripiego su Books.
      basis,
      credited: round(inWindow.reduce((s, i) => s + i.credited, 0)),
      reversed_invoices: inWindow.filter((i) => i.reversed).length,
      error: (errors && errors.revenue) || null,
    },
    // Stato del lato CRM, in chiaro: tipo deal, moduli, owner, CSM e periodi di
    // licenza vengono tutti da qui, quindi quando questo tace la pagina si
    // svuota in silenzio e non c'è modo di capirlo dai numeri.
    deals: {
      count: (deals || []).length,
      // Quante fatture portano un id di deal e quante lo ritrovano in CRM:
      // separano "il CRM non ha risposto" da "le fatture non portano l'id",
      // che a schermo si somigliano ma si riparano in posti diversi.
      invoices_with_deal: withDealId,
      invoices_deal_found: resolvedDeal,
      invoices_deal_found_by_name: resolvedByName,
      partial: !!(deals && deals.partial),
      stale: !!(deals && deals.stale),
      error: (errors && errors.deals) || null,
    },
    // Quanto pesa il lavoro su difetti nostri, in totale.
    internal_fix: {
      tasklist: INTERNAL_TASKLIST(),
      hours: round(projRows.reduce((s, p) => s + (p.ih || 0), 0)),
      cost: round(projRows.reduce((s, p) => s + (p.ic || 0), 0)),
      projects: projRows.filter((p) => (p.ih || 0) > 0).length,
    },
    cost_status: hasCost ? "ok" : "pending_analytics",
    // Su che tariffe poggia ogni anno, da dire in chiaro in cima alla pagina.
    rate_years: Object.fromEntries(Object.entries(RATE_YEARS).map(([y, c]) => [y, {
      label: c.label, status: c.status, months: c.months || null, inherits: c.inherits || null,
    }])),
    rate_people: Object.keys(RATE_PEOPLE).length,
    /**
     * Tariffe da cedolino troppo basse per essere il costo pieno di una
     * persona a tempo pieno: sotto i 12 €/h il costo mensile non arriva a
     * 2.000 €, che è da tirocinio o da riga di cedolino parziale. Non si
     * corregge nulla in automatico — si mette in evidenza, perché una tariffa
     * così sottostima il costo e gonfia il margine in silenzio.
     */
    rate_suspect: Object.entries(RATE_PEOPLE).flatMap(([id, p]) => {
      // Si guarda l'ultimo mese a libro paga, non la storia: uno stage finito e
      // poi assunto non è un problema, è una persona che oggi costa il giusto.
      const ms = Object.keys(p.monthly || {}).sort();
      if (!ms.length) return [];
      const last = ms[ms.length - 1];
      const v = p.monthly[last];
      if (!(v > 0 && v < 12)) return [];
      return [{
        id, name: p.name, year: last.slice(0, 4), month: last, rate: round(v),
        monthly: round(v * (RATES.working_days_per_month || 21) * (RATES.hours_per_day || 8)),
      }];
    }),
    cost_by_year: costByYear,
    cost_error: hasCost ? null : (errors && errors.cost) || null,
    // Costo servito dalla cache perché il job Analytics non è rientrato in tempo:
    // i numeri ci sono, ma sono quelli dell'ultimo giro riuscito.
    cost_stale: (opts && opts.costStale) || null,
    cost_stale_reason: (errors && errors.cost_stale) || null,
    // Ore registrate a tariffa zero: il costo è sottostimato di altrettanto.
    // La tariffa in Zoho è impressa sul singolo time log nel momento in cui
    // viene salvato: metterla sul progetto oggi non risana i log di ieri.
    cost_gaps: (() => {
      const g = projRows.filter((p) => p.c && (p.unrated || 0) > 0);
      const unrated = g.reduce((s, p) => s + p.unrated, 0);
      const ratedHours = projRows.reduce((s, p) => s + Math.max(0, (p.hours || 0) - (p.unrated || 0)), 0);
      const totalCost = projRows.reduce((s, p) => s + (p.cost || 0), 0);
      const blended = ratedHours ? totalCost / ratedHours : 0;
      return {
        projects: g.length,
        hours: round(unrated),
        blended_rate: round(blended),
        // Stima, non un dato: le ore mancanti valutate alla tariffa media reale.
        estimated_cost: round(unrated * blended),
      };
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
    // Il lifetime value viene dai deal vinti in CRM, non dalle fatture: qui si
    // dice quanto ne resta fuori, così nessuno lo scambia per un buco.
    ltv: {
      basis: "CRM deals in a Won stage, full Amount, all time",
      clients_with_ltv: ltv.size,
      deals_outside_the_dashboard: ltvOutside,
      amount_outside_the_dashboard: round(ltvOutsideAmount),
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

// Lo snapshot viene tenuto per qualche minuto nell'istanza che l'ha costruito.
// Ogni ricarica della pagina lancia tre job di export su Analytics più la
// paginazione dei deal su CRM: dieci ricariche di fila sono trenta job, e Zoho
// a un certo punto smette di rispondere. Il dato cambia una volta al giorno.
let SNAP = null;
const SNAP_TTL = 5 * 60 * 1000;

export async function buildSnapshot(opts) {
  startAnalyticsBudget();
  if (!(opts && opts.force) && SNAP && SNAP.at > Date.now() - SNAP_TTL) return SNAP.data;
  const data = await buildSnapshotUncached();
  SNAP = { at: Date.now(), data };
  return data;
}

async function buildSnapshotUncached() {
  const errors = {};

  let deals = [];
  try {
    deals = await fetchDeals();
    // fetchDeals non lancia più quando il CRM rifiuta una pagina: tiene quello
    // che ha letto e appende il motivo. Va raccolto qui, o resta invisibile.
    if (deals.error) { errors.deals = deals.error; errors.accrual = deals.error; }
  } catch (e) {
    // Senza i deal cade tutto il lato CRM: tipo, moduli, owner, CSM, periodi di
    // licenza. Prima questo errore finiva solo in "accrual" e non si vedeva da
    // nessuna parte se i costi funzionavano: la pagina si limitava a scrivere
    // "type not set" ovunque, che è il sintomo, non la causa.
    errors.deals = e.message;
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
    try {
      invoices = await fetchInvoicesBooks();
    } catch (e2) {
      // Se cade anche il ripiego, il messaggio deve dire tutte e due le cose:
      // altrimenti si legge solo l'errore di Books e si cerca dalla parte
      // sbagliata, mentre il guasto vero è quasi sempre a monte.
      throw new Error(
        "Neither source of invoices answered.\n" +
        "Zoho Analytics said: " + e.message + "\n" +
        "Zoho Books said: " + e2.message + "\n" +
        "Two refusals together almost always mean the refresh token lost some scopes: " +
        "it needs ZohoAnalytics.data.read and ZohoBooks.invoices.READ. Reconnect from /setup.");
    }
  }

  let projects = await fetchProjects();
  const links = await fetchProjectLinks().catch((e) => { errors.links = e.message; return null; });
  projects = linkProjectsToDeals(projects, deals, links);

  let costs = null;
  let costStale = null;
  try {
    costs = await fetchProjectCosts();
  } catch (e) {
    errors.cost = e.message;
    // Meglio il costo di mezz'ora fa che nessun costo: la pagina resta leggibile
    // e dice apertamente a quando risale.
    const keep = lastGoodCosts();
    if (keep) {
      costs = keep.map;
      costStale = new Date(keep.at).toISOString();
      errors.cost_stale = e.message;
      delete errors.cost;
    }
  }

  return assemble(invoices, projects, costs, deals, errors, { basis, costStale });
}
