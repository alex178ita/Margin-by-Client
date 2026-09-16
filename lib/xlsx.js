/**
 * Fogli di dettaglio in formato Excel, in inglese britannico.
 *
 * Tre tagli, perché deal e progetto non sono in corrispondenza uno a uno:
 *   dealWorkbook     — un deal: quanto è stato venduto, fatturato e incassato,
 *                      più i progetti agganciati a quel deal;
 *   projectWorkbook  — un singolo progetto: ore e costo, e il ricavo solo se il
 *                      progetto è legato a un deal in modo attendibile;
 *   clientWorkbook   — tutto il cliente: i costed project che compongono il
 *                      margine globale e il dettaglio per persona.
 */
import ExcelJS from "exceljs";
import { LOGO_B64, LOGO_W, LOGO_H } from "./logo.js";
import { CRM_DEAL_URL, PROJECT_URL, RATE_YEARS, RATE_PEOPLE } from "./zoho.js";

const NAVY = "FF0D1B2A", TEAL = "FF0F7173", SOFT = "FFE9EEF0", WARN = "FFFFF4CE";
const GREY = "FF74868D", INK = "FF16212B", AMBER = "FF8A5300";
const EUR = '#,##0.00;(#,##0.00);-';
const HRS = '#,##0.00;(#,##0.00);-';
const RATE = '#,##0.000;(#,##0.000);-';
const PCT = '0.0%';
const INT = '#,##0';
const VERSION = "v.0.1 — Beta for testing";

const font = (size = 10, bold = false, color = INK, italic = false) =>
  ({ name: "Arial", size, bold, italic, color: { argb: color } });
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin", color: { argb: "FFD9E1E4" } };
const box = { top: thin, left: thin, right: thin, bottom: thin };

const money = (n) => (typeof n === "number" && isFinite(n) ? n : 0);
const day = (s) => {
  if (!s) return null;
  const d = new Date(String(s).slice(0, 10) + "T00:00:00Z");
  return isFinite(d.getTime()) ? d : null;
};
const dmy = "dd/mm/yyyy";

/* ------------------------------------------------------------- primitive -- */
function sheet(wb, name, title, subtitle) {
  // I nomi foglio in Excel non ammettono : \ / ? * [ ] e stanno in 31 caratteri.
  const safe = String(name).replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet";
  const ws = wb.addWorksheet(safe, { views: [{ showGridLines: false }] });
  ws.columns = [
    { width: 40 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 22 },
    { width: 16 }, { width: 16 }, { width: 15 }, { width: 18 },
  ];

  ws.mergeCells("A1:I1");
  const bar = ws.getCell("A1");
  bar.value = VERSION;
  bar.font = font(10, false, "FF9FB3C8", true);
  bar.fill = fill(NAVY);
  bar.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  ws.getRow(1).height = 32;
  ws.addImage(wb.__logo, {
    tl: { col: 0.25, row: 0.28 },
    ext: { width: 118, height: Math.round((118 * LOGO_H) / LOGO_W) },
  });

  ws.mergeCells("A2:I2");
  const t = ws.getCell("A2");
  t.value = title;
  t.font = font(14, true, "FFFFFFFF");
  t.fill = fill(NAVY);
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 28;

  ws.__r = 4;
  if (subtitle) note(ws, subtitle);
  return ws;
}

function band(ws, text) {
  const r = ws.__r++;
  ws.mergeCells(r, 1, r, 9);
  const c = ws.getCell(r, 1);
  c.value = text;
  c.font = font(9, true, "FFFFFFFF");
  c.fill = fill(TEAL);
  c.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(r).height = 19;
}

function warn(ws, text) {
  const r = ws.__r++;
  ws.mergeCells(r, 1, r, 9);
  const c = ws.getCell(r, 1);
  c.value = text;
  c.font = font(10, true, AMBER);
  c.fill = fill(WARN);
  c.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(r).height = 21;
  ws.__r++;
}

function note(ws, text) {
  const r = ws.__r++;
  ws.mergeCells(r, 1, r, 9);
  const c = ws.getCell(r, 1);
  c.value = text;
  c.font = font(9, false, GREY, true);
  c.alignment = { vertical: "top", wrapText: true };
  ws.getRow(r).height = text.length > 130 ? 30 : 16;
}

function kv(ws, label, value, fmt, link, bold) {
  const r = ws.__r++;
  const a = ws.getCell(r, 1);
  a.value = label; a.font = font(10, true);
  const b = ws.getCell(r, 2);
  if (link) {
    b.value = { text: String(value), hyperlink: link };
    b.font = font(10, false, "FF0000FF", false);
  } else {
    b.value = value === null || value === undefined ? "—" : value;
    b.font = font(bold ? 11 : 10, !!bold);
  }
  if (fmt) b.numFmt = fmt;
  if (fmt === dmy) b.alignment = { horizontal: "left" };
  return r;
}

function table(ws, headers, rows, opts) {
  const o = opts || {};
  const right = new Set(o.right || []);
  const hr = ws.__r++;
  headers.forEach((h, i) => {
    const c = ws.getCell(hr, i + 1);
    c.value = h;
    c.font = font(9, true);
    c.fill = fill(SOFT);
    c.border = box;
    c.alignment = { horizontal: right.has(i + 1) ? "right" : "left", wrapText: true, vertical: "middle" };
  });
  ws.getRow(hr).height = 26;

  const first = ws.__r;
  for (const row of rows) {
    const r = ws.__r++;
    row.cells.forEach((v, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = v === null || v === undefined ? "" : v;
      c.font = v && v.hyperlink ? font(10, false, "FF0000FF") : font(10);
      c.border = box;
      if (o.formats && o.formats[i]) c.numFmt = o.formats[i];
      if (row.warn) c.fill = fill(WARN);
    });
  }
  const last = ws.__r - 1;

  if (o.total && rows.length) {
    const r = ws.__r++;
    ws.getCell(r, 1).value = "Total";
    for (let i = 1; i <= headers.length; i++) {
      const c = ws.getCell(r, i);
      c.font = font(10, true);
      c.border = box;
      c.fill = fill(SOFT);
      if (o.total.includes(i)) {
        c.value = { formula: `SUM(${col(i)}${first}:${col(i)}${last})` };
        if (o.formats && o.formats[i - 1]) c.numFmt = o.formats[i - 1];
      }
    }
    return { first, last, total: r, costCol: "F" };
  }
  return { first, last, total: null, costCol: "F" };
}

const col = (i) => {
  let s = "";
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; }
  return s;
};

function marginBlock(ws, revenueRef, costRef, extraNote) {
  band(ws, "MARGIN (before server and infrastructure costs)");
  const rr = kv(ws, "Revenue counted (€, net of VAT and of credit notes)", { formula: revenueRef }, EUR);
  const cr = kv(ws, "Real cost of the team (€)", { formula: costRef }, EUR);
  const mr = ws.__r;
  kv(ws, "Contribution margin (€)", { formula: `B${rr}-B${cr}` }, EUR, null, true);
  kv(ws, "Margin %", { formula: `IF(B${rr}=0,0,B${mr}/B${rr})` }, PCT, null, true);
  ws.__r++;
  note(ws, "This margin is before server and infrastructure costs, which are not recorded in Zoho " +
           "and do not appear in anyone's time. The only cost taken off here is the team's time.");
  if (extraNote) note(ws, extraNote);
}

/**
 * Il margine per chi non ha sbloccato i costi: ricavo, ore, margine e
 * percentuale. Manca la riga del costo del team, che è quanto sta dietro la
 * password insieme al dettaglio per persona.
 */
function marginPctBlock(ws, revenue, cost, hours, extraNote) {
  band(ws, "MARGIN (before server and infrastructure costs)");
  const rr = kv(ws, "Revenue counted (€, net of VAT and of credit notes)",
                Math.round((revenue || 0) * 100) / 100, EUR);
  kv(ws, "Hours logged", Math.round((hours || 0) * 100) / 100, HRS);
  const mr = ws.__r;
  kv(ws, "Contribution margin (€)", Math.round(((revenue || 0) - (cost || 0)) * 100) / 100, EUR, null, true);
  kv(ws, "Margin %", revenue ? (revenue - cost) / revenue : null, PCT, null, true);
  ws.__r++;
  note(ws, "This margin is before server and infrastructure costs, which are not recorded in Zoho. " +
           "The only cost taken off is the team's time.");
  note(ws, "The cost of the team and the per-person breakdown behind it are part of the internal " +
           "costs view and are not in this file.");
  if (extraNote) note(ws, extraNote);
}

/* --------------------------------------------------------------- sezioni -- */
function dealBlock(ws, deal, viewer) {
  band(ws, "DEAL IN CRM");
  kv(ws, "Deal name", deal.name);
  kv(ws, "Open in Zoho CRM", "crm.zoho.eu", null, CRM_DEAL_URL(deal.id));
  kv(ws, "Stage", deal.stage);
  kv(ws, "Deal amount (€)", money(deal.amount), EUR);
  kv(ws, "Closing date", day(deal.closing), dmy);
  if (deal.ls && deal.le) {
    const r = kv(ws, "Licence period", day(deal.ls), dmy);
    const c = ws.getCell(r, 3);
    c.value = day(deal.le); c.numFmt = dmy; c.font = font(10);
  } else {
    kv(ws, "Licence period", "not set in CRM");
  }
  ws.__r++;

  band(ws, "WHAT WAS SOLD, AND WHO OWNS IT");
  kv(ws, "Deal type", deal.kind === "licence" ? "Licence"
      : deal.kind === "services" ? "Professional Services" : "not classified in CRM");
  note(ws, "Licence where the CRM Licence field is above zero, Professional Services where Delivery is.");
  kv(ws, "Licence value (€)", money(deal.licence), EUR);
  kv(ws, "Delivery value (€)", money(deal.delivery), EUR);
  if (deal.both) note(ws, "This deal carries both a Licence and a Delivery value; the type above is the larger of the two.");
  if (deal.kind === "licence") {
    kv(ws, "Licence modules", deal.modules && deal.modules.length ? deal.modules.join(", ") : "none recorded in CRM");
    kv(ws, "Licence duration", deal.months ? deal.months + " months" : "not set in CRM");
    kv(ws, "Auto-renew", deal.renew || "not set in CRM");
  }
  kv(ws, "Payment terms", deal.terms || "not set in CRM");
  kv(ws, "Deal owner", (deal.owner && deal.owner.name) || "not set in CRM");
  kv(ws, "Customer Success Manager",
     deal.csm && deal.csm.name
       ? deal.csm.name + (deal.csm.active === false ? " (user disabled in CRM)" : "")
       : "not set in CRM");
  ws.__r++;
}

function invoiceBlock(ws, invoices, year, viewer) {
  band(ws, "INVOICES RAISED AGAINST THE DEAL (Zoho Books)");

  const rows = invoices.map((i) => ({
    warn: i.credited > 0,
    cells: [
      i.num, day(i.date), money(i.gross), money(i.net),
      i.cnotes.length ? i.cnotes.map((c) => `${c.num} (${c.date})`).join(", ") : "—",
      money(i.credited), money(i.counted), money(i.balance),
      i.balance > 0 ? (i.status || "Open") : (i.status || "Paid"),
    ],
  }));
  const t = table(ws,
    ["Invoice", "Date", "Invoice total (€)", "Net of VAT (€)", "Credit note",
     "Reversed (€)", "Revenue counted (€)", "Outstanding (€)", "Payment status"],
    rows,
    { right: [3, 4, 6, 7, 8], formats: [null, dmy, EUR, EUR, null, EUR, EUR, EUR, null],
      total: [3, 4, 6, 7, 8] });
  ws.__r++;
  note(ws, "Rows shaded yellow were reversed by a credit note, so they leave the calculation. " +
           "Zoho Books still shows them as Closed and paid, which is why a status check alone does not catch them.");
  return t;
}

/** Quota di ricavo che non è di competenza dell'anno selezionato. */
function yearBlock(ws, deal, invoices, totalRow, year) {
  band(ws, `WHICH YEAR THE REVENUE BELONGS TO — SELECTED YEAR ${year}`);
  const counted = invoices.reduce((s, i) => s + i.counted, 0);
  const rev = kv(ws, "Revenue counted (€, net of VAT)", { formula: `G${totalRow}` }, EUR);

  const ls = day(deal && deal.ls), le = day(deal && deal.le);
  if (ls && le) {
    const pr = kv(ws, "Licence period runs", ls, dmy);
    const c = ws.getCell(pr, 3); c.value = le; c.numFmt = dmy; c.font = font(10);
    const dt = kv(ws, "Days in the licence period", { formula: `C${pr}-B${pr}+1` }, INT);
    const ds = kv(ws, `Days falling in ${year}`,
      { formula: `MAX(0,MIN(C${pr},DATE(${year},12,31))-MAX(B${pr},DATE(${year},1,1))+1)` }, INT);
    const iy = kv(ws, `Revenue belonging to ${year} (€)`,
      { formula: `B${rev}*B${ds}/B${dt}` }, EUR);
    const oy = kv(ws, "Revenue belonging to another year (€)", { formula: `B${rev}-B${iy}` }, EUR);
    kv(ws, "Share outside the selected year", { formula: `IF(B${rev}=0,0,B${oy}/B${rev})` }, PCT);
    const other = le.getUTCFullYear() > year ? le.getUTCFullYear() : ls.getUTCFullYear();
    note(ws, `The licence is spread day by day across the period, so part of this revenue sits in ${other}. ` +
             "The margin below is still worked out on the whole amount, because the cost of the team is not split the same way.");
  } else {
    kv(ws, "Licence period", "not set in CRM");
    const inY = invoices.filter((i) => String(i.date).slice(0, 4) === String(year))
      .reduce((s, i) => s + i.counted, 0);
    const iy = kv(ws, `Revenue dated ${year} (€)`, Math.round(inY * 100) / 100, EUR);
    const oy = kv(ws, "Revenue dated another year (€)", { formula: `B${rev}-B${iy}` }, EUR);
    kv(ws, "Share outside the selected year", { formula: `IF(B${rev}=0,0,B${oy}/B${rev})` }, PCT);
    note(ws, "No licence period is set on the deal, so the whole amount stays on the invoice date. " +
             "Setting the licence dates in CRM would let the revenue be spread across the years it actually covers.");
  }
  ws.__r++;
  return counted;
}

/**
 * Il costo senza le persone: ore totali e costo totale, e nient'altro.
 * È la versione che vede chi non ha sbloccato i costi interni — i nomi e le
 * tariffe individuali non entrano nemmeno nel file.
 */
function teamHoursBlock(ws, people, heading) {
  band(ws, heading || "HOURS LOGGED (Time Logs, Zoho Projects)");
  const hours = people.reduce((s, p) => s + p.hours, 0);
  const unrated = people.reduce((s, p) => s + p.unrated, 0);
  const hr = kv(ws, "Hours logged", Math.round(hours * 100) / 100, HRS);
  const cr = hr;
  kv(ws, "People who logged time", people.length, INT);
  if (unrated > 0) kv(ws, "Of which hours with no hourly cost", Math.round(unrated * 100) / 100, HRS);
  ws.__r++;
  note(ws, "The per-person breakdown is part of the internal costs view and is not in this file.");
  ws.__r++;
  // Qui il costo sta in colonna B, non in F come nella tabella per persona:
  // chi costruisce il margine deve sapere dove guardare.
  return { hoursRow: hr, total: cr, costCol: "B" };
}

function peopleBlock(ws, people, heading) {
  band(ws, heading || "HOURS AND COST PER PERSON (Time Logs, Zoho Projects)");
  // Da dove viene il prezzo di quelle ore. Una tariffa che sorprende si spiega
  // quasi sempre qui: cedolino mancante, e allora resta quella impressa da Zoho.
  const source = (p) => {
    const b = p.priced || {};
    const parts = [];
    if (b.payroll) parts.push("payroll");
    if (b.zoho) parts.push("Zoho log rate");
    if (b.none) parts.push("no rate");
    return parts.join(" + ") || "—";
  };
  const rows = people.map((p) => ({
    warn: p.unrated > 0 || (p.priced && p.priced.zoho > 0),
    cells: [p.person, p.role || "—", p.logs, p.hours, p.rate, p.cost,
            source(p), day(p.first), day(p.last), p.unrated],
  }));
  const t = table(ws,
    ["Person", "Role", "Logs", "Hours", "Hourly cost (€)", "Cost (€)",
     "Rate from", "First log", "Last log", "Hours with no rate"],
    rows,
    { right: [3, 4, 5, 6, 10], formats: [null, null, INT, HRS, RATE, EUR, null, dmy, dmy, HRS],
      total: [3, 4, 6, 10] });
  if (t.total) {
    const c = ws.getCell(t.total, 5);
    c.value = { formula: `IF(D${t.total}=0,0,F${t.total}/D${t.total})` };
    c.numFmt = RATE;
  }
  ws.__r++;
  note(ws, "The hourly cost is each person's real cost from the Vivian payroll, for the year the " +
           "hour was logged. Where someone has no payroll record the rate Zoho stamped on the log " +
           "is used instead, and \"Rate from\" says which — those rows are shaded.");
  note(ws, "Rows shaded yellow are people whose hours carry no rate at all, or are priced from " +
           "Zoho rather than from the payroll. Hours with no rate cost nothing here, and the " +
           "margin is flattered by that much.");
  return t;
}

function projectListBlock(ws, projects, heading, opts) {
  const o = opts || {};
  band(ws, heading);
  ws.columns = [
    { width: 38 }, { width: 11 }, { width: 20 }, { width: 30 }, { width: 11 },
    { width: 14 }, { width: 16 }, { width: 14 }, { width: 10 },
  ];

  // Il costo è l'unica colonna che sta dietro la password: tutto il resto —
  // ore, ricavo del deal, margine — vale in entrambe le viste.
  const rows = projects.map((p) => ({
    warn: p.link !== "crmid" && p.link !== "deal_name_field",
    cells: [
      { text: p.n, hyperlink: PROJECT_URL(p.id) },
      p.s || "—",
      p.link === "crmid" ? "CRMid" : p.link === "deal_name_field" ? "Deal Name field"
        : p.link === "name_guess" ? "name (guess)"
        : p.link === "name_ambiguous" ? "name (ambiguous)"
        : p.link === "crmid_unknown" ? "CRMid not found" : "not linked",
      p.deal ? p.deal.name : "—",
      p.hours === null ? "" : p.hours,
      p.ih || "",
      ...(o.viewer ? [] : [p.cost === null ? "" : p.cost]),
      // Il margine per progetto solo quando quel deal è servito da un progetto
      // solo: altrimenti il ricavo è di tutti insieme.
      p.dshare === 1 && p.drev != null ? p.drev : "",
      p.dshare === 1 && p.drev != null && p.cost != null ? p.drev - p.cost : "",
      p.dshare === 1 && p.drev ? (p.drev - p.cost) / p.drev : "",
      p.dshare === 1 && p.drev && p.ic ? (p.drev - p.cost - p.ic) / p.drev : "",
    ],
  }));
  const t = o.viewer
    ? table(ws,
        ["Project", "Status", "Link to deal", "Deal", "Hours", "Internal fix hours",
         "Deal revenue (€)", "Margin (€)", "Margin %", "Margin % with internal fix"],
        rows,
        { right: [5, 6, 7, 8, 9, 10],
          formats: [null, null, null, null, HRS, HRS, EUR, EUR, PCT, PCT],
          total: [5, 6] })
    : table(ws,
        ["Project", "Status", "Link to deal", "Deal", "Hours", "Internal fix hours", "Cost (€)",
         "Deal revenue (€)", "Margin (€)", "Margin %", "Margin % with internal fix"],
        rows,
        { right: [5, 6, 7, 8, 9, 10, 11],
          formats: [null, null, null, null, HRS, HRS, EUR, EUR, EUR, PCT, PCT],
          total: [5, 6, 7] });
  ws.__r++;
  note(ws, "Internal fix hours are time logged on the internal debug and fix list: the company paid " +
           "for them but the client did not buy them, so they are out of the cost and out of the " +
           "margin. The last column is what the margin would be if they were charged to the client.");
  note(ws, "Revenue and margin appear only where a single project delivers the whole deal. Where a " +
           "deal is delivered by several projects the revenue belongs to all of them together, and " +
           "attributing it to one would be an invention.");
  note(ws, "Rows shaded yellow have no CRMid on the project in Zoho Projects, so any deal shown " +
           "beside them is a guess made on the name.");
  return t;
}

/* ------------------------------------------------------------- workbooks -- */
async function newBook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kleecks — Margin by Clients";
  wb.created = new Date();
  wb.__logo = wb.addImage({ base64: LOGO_B64, extension: "png" });
  return wb;
}

export async function dealWorkbook(ctx, dealId, role) {
  const deal = ctx.dealById.get(String(dealId));
  if (!deal) throw new Error("deal " + dealId + " not found in CRM");
  const invoices = ctx.invoices.filter((i) => i.dealId === String(dealId));
  const projects = ctx.projects.filter((p) => p.dealId === String(dealId));
  const people = mergePeople(ctx, projects.map((p) => p.id));

  const viewer = role === "viewer";
  const wb = await newBook();
  const ws = sheet(wb, "Deal", deal.name,
    "Revenue is the invoice sub-total, net of VAT and net of any credit note that reversed it." +
    (viewer ? " The cost of the team is part of the internal costs view." : ""));

  if (projects.some((p) => p.link === "name_guess")) {
    warn(ws, "MISSING CRMid IN PROJECTS — one or more projects matched on name, treat as a guess");
  }

  dealBlock(ws, deal, viewer);
  const inv = invoiceBlock(ws, invoices, ctx.year, viewer);
  if (inv.total) {
    kv(ws, "Deal amount still to invoice (€)",
       { formula: `${money(deal.amount)}-G${inv.total}` }, EUR);
    note(ws, "Deal amount less the revenue counted. A positive figure is work sold but not yet billed.");
    ws.__r++;
    yearBlock(ws, deal, invoices, inv.total, ctx.year);
  }

  const list = projects.length
    ? projectListBlock(ws, projects, "PROJECTS DELIVERING THIS DEAL (Zoho Projects)", { viewer })
    : null;
  if (!projects.length) {
    band(ws, "PROJECTS DELIVERING THIS DEAL (Zoho Projects)");
    note(ws, "No project in Zoho Projects carries this deal's CRM id, and no project name matches it, " +
             "so no cost can be attributed to this deal. Revenue is shown without a margin.");
    ws.__r++;
  }

  if (viewer) {
    const rev = invoices.reduce((s, i) => s + i.counted, 0);
    const cost = projects.reduce((s, p) => s + (p.cost || 0), 0);
    const hours = projects.reduce((s, p) => s + (p.hours || 0), 0);
    if (projects.length) marginPctBlock(ws, rev, cost, hours);
  } else if (inv.total && list && list.total) {
    marginBlock(ws, `G${inv.total}`, `F${list.total}`);
  }

  if (people.length && role !== "viewer") {
    const team = sheet(wb, "Team", deal.name + " — team",
      "Every person who logged time on the projects delivering this deal.");
    peopleBlock(team, people);
  }
  return wb;
}

export async function projectWorkbook(ctx, projectId, role) {
  const p = ctx.projects.find((x) => x.id === String(projectId));
  if (!p) throw new Error("project " + projectId + " not found in Zoho Projects");
  const deal = p.dealId ? ctx.dealById.get(p.dealId) : null;
  const people = mergePeople(ctx, [p.id]);

  const wb = await newBook();
  const ws = sheet(wb, "Project", p.n || p.name,
    "One project. Cost is the team's logged time at each person's own hourly cost in Zoho Projects.");

  if (p.link !== "crmid" && p.link !== "deal_name_field") {
    warn(ws, deal
      ? "MISSING CRMid IN PROJECTS — deal matched on name, treat as a guess"
      : "MISSING CRMid IN PROJECTS — no deal could be matched, so this is a cost-only sheet");
  }

  band(ws, "PROJECT");
  kv(ws, "Project name", p.n || p.name);
  kv(ws, "Open in Zoho Projects", "projects.zoho.eu", null, PROJECT_URL(p.id));
  kv(ws, "Project id", p.id);
  kv(ws, "Status", p.s || p.status || "—");
  kv(ws, "Client", p.c || "not matched to a client");
  kv(ws, "CRMid on the project", p.crmid || "empty");
  kv(ws, "Link to deal",
     p.link === "crmid" ? "CRMid — one to one"
     : p.link === "deal_name_field" ? "Deal Name field on the project — one to one"
     : p.link === "name_guess" ? "name match only — guess"
     : p.link === "name_ambiguous" ? "several deals share this name — no link made"
     : p.link === "crmid_unknown" ? "the CRMid on the project matches no deal"
     : "no deal linked");
  ws.__r++;

  const viewer = role === "viewer";
  const cost = viewer ? teamHoursBlock(ws, people) : peopleBlock(ws, people);

  if (deal) {
    dealBlock(ws, deal, viewer);
    const invoices = ctx.invoices.filter((i) => i.dealId === deal.id);
    const inv = invoiceBlock(ws, invoices, ctx.year, viewer);
    if (viewer) {
      const others = ctx.projects.filter((x) => x.dealId === deal.id && x.id !== p.id);
      marginPctBlock(ws,
        invoices.reduce((s, i) => s + i.counted, 0),
        p.cost || 0, p.hours || 0,
        others.length
          ? "Careful: " + others.length + " other project" + (others.length > 1 ? "s are" : " is") +
            " linked to the same deal, so the revenue behind this margin is not earned by this " +
            "project alone. For the deal as a whole, use the deal sheet instead."
          : null);
      return wb;
    }
    if (inv.total) {
      yearBlock(ws, deal, invoices, inv.total, ctx.year);
      const others = ctx.projects.filter((x) => x.dealId === deal.id && x.id !== p.id);
      marginBlock(ws, `G${inv.total}`, `${cost.costCol || "F"}${cost.total}`,
        others.length
          ? "Careful: " + others.length + " other project" + (others.length > 1 ? "s are" : " is") +
            " linked to the same deal, so the revenue above is not earned by this project alone. " +
            "For the deal as a whole, use the deal sheet instead."
          : (p.link === "name_guess"
              ? "The revenue above belongs to a deal matched only on the project name. Treat the margin as indicative until the CRM id is filled in."
              : null));
    }
  } else {
    band(ws, "REVENUE");
    note(ws, "This project is not linked to a deal, so no revenue can be attributed to it and no " +
             "margin is shown. The sheet stands as a cost sheet.");
  }
  return wb;
}

export async function clientWorkbook(ctx, clientName, role) {
  const row = ctx.clients.find((c) => c.c === clientName);
  if (!row) throw new Error("client " + clientName + " not in the snapshot");
  const projects = ctx.projects.filter((p) => row.pj.includes(p.id));
  const people = mergePeople(ctx, projects.map((p) => p.id));

  const viewer = role === "viewer";
  const wb = await newBook();
  const ws = sheet(wb, "Summary", row.c,
    "Everything behind this client's margin: the deals invoiced and the projects costed." +
    (viewer ? "" : " The team is on its own sheet."));

  band(ws, "CLIENT");
  kv(ws, "Client", row.c);
  if (row.p.length) kv(ws, "Billed through", row.p.join(", "));
  if (row.ba.length) kv(ws, "Invoiced entities", row.ba.join(", "));
  kv(ws, "Invoices counted", row.n, INT);
  if (row.rev) kv(ws, "Invoices reversed by credit notes", row.rev, INT);
  if (row.cn) kv(ws, "Amount reversed by credit notes (€)", row.cn, EUR);
  // Quanto pesa il cliente per l'azienda: tutti i suoi deal vinti in CRM.
  // Non è il fatturato e non ci torna: conta anche i vinti mai fatturati.
  if (row.ltv != null) {
    kv(ws, "Lifetime value — CRM Won deals (€)", money(row.ltv), EUR);
    kv(ws, "Won deals in CRM", row.ltvn, INT);
    note(ws, "Lifetime value is the full Amount of every deal of this client in a Won stage in CRM, " +
             "all time. It is a different measure from invoiced revenue — it includes deals won and " +
             "never invoiced, and excludes invoicing of deals won outside this window — so the two " +
             "will never reconcile, and are not meant to.");
  }
  ws.__r++;

  const minY = String((ctx.snapshot && ctx.snapshot.min_year) || "2025");
  const years = [...new Set([...Object.keys(row.ra), ...Object.keys(row.ry), ...Object.keys(row.cy)])]
    .filter((y) => y >= minY).sort();

  band(ws, viewer ? "REVENUE AND MARGIN BY YEAR" : "REVENUE AND COST BY YEAR");
  table(ws,
    viewer
      ? ["Year", "Accrued revenue (€)", "Invoiced revenue (€)", "Hours", "Margin (€)", "Margin %"]
      : ["Year", "Accrued revenue (€)", "Invoiced revenue (€)", "Hours", "Cost (€)", "Margin (€)", "Margin %"],
    years.map((y) => {
      const rev = money(row.ra[y]);
      const cost = row.cy[y] ? row.cy[y].cost : 0;
      const hrs = row.cy[y] ? row.cy[y].hours : 0;
      return {
        cells: viewer
          ? [y, rev, money(row.ry[y]), hrs, rev - cost, rev ? (rev - cost) / rev : ""]
          : [y, rev, money(row.ry[y]), hrs, cost, rev - cost, rev ? (rev - cost) / rev : ""],
      };
    }),
    viewer
      ? { right: [2, 3, 4, 5, 6], formats: [null, EUR, EUR, HRS, EUR, PCT], total: [2, 3, 4, 5] }
      : { right: [2, 3, 4, 5, 6, 7], formats: [null, EUR, EUR, HRS, EUR, EUR, PCT],
          total: [2, 3, 4, 5, 6] });
  ws.__r++;
  note(ws, "Accrued revenue spreads each licence invoice day by day across the licence period. " +
           "Invoiced revenue keeps it on the invoice date, which is what reconciles to Zoho Books.");

  const list = projectListBlock(ws, projects, "COSTED PROJECTS BEHIND THE MARGIN", { viewer });
  if (viewer) {
    marginPctBlock(ws, row.rt, row.cost, row.hours,
      "Revenue here is the whole period, on the invoice date. The year by year split is above.");
  } else if (list.total) {
    marginBlock(ws, String(money(row.rt)), `F${list.total}`,
      "Revenue here is the whole period, on the invoice date. The year by year split, margin " +
      "included, is in the table above.");
  }

  if (row.d && row.d.length) {
    const dws = sheet(wb, "Deals", row.c + " — deals", "The deals invoiced to this client.");
    const meta = (d) => [
      d.id ? { text: d.name, hyperlink: CRM_DEAL_URL(d.id) } : d.name,
      d.kind === "licence" ? "Licence" : d.kind === "services" ? "Professional Services" : "—",
      d.mods && d.mods.length ? d.mods.join(", ") : "—",
      d.owner || "—",
      (d.csm || "—") + (d.csm_off ? " (disabled)" : ""),
      d.n,
    ];
    // Valore del deal e quanto pesa sul cliente: entrambi, in entrambe le viste.
    table(dws,
      ["Deal", "Type", "Modules", "Owner", "CSM", "Invoices", "Revenue (€)",
       "Share of the client", "Reversed (€)", "Outstanding (€)"],
      row.d.map((d) => ({
        warn: d.rev > 0,
        cells: [...meta(d), money(d.r), row.rt ? d.r / row.rt : "", money(d.cn), money(d.ob)],
      })),
      { right: [6, 7, 8, 9, 10],
        formats: [null, null, null, null, null, INT, EUR, PCT, EUR, EUR],
        total: [6, 7, 9, 10] });
    dws.__r++;
    note(dws, "Rows shaded yellow contain at least one invoice fully reversed by a credit note.");
  }

  if (people.length && role !== "viewer") {
    const tws = sheet(wb, "Team", row.c + " — team",
      "Every person who logged time on this client's projects.");
    peopleBlock(tws, people);
  }
  return wb;
}

/**
 * Elenco dei progetti cliente senza CRMid in Zoho Projects: è una lista di
 * lavoro, fatta per essere corretta a mano. Ogni riga porta il link al progetto
 * e, dove esiste, il deal che il nome suggerisce, da incollare nel campo CRMid.
 */
export async function missingLinkWorkbook(ctx) {
  const rows = ctx.projects.filter(
    (p) => (p.k === "client" || p.k === "client_mgmt") &&
           p.link !== "crmid" && p.link !== "deal_name_field");

  const wb = await newBook();
  const ws = sheet(wb, "Missing CRMid", "Projects with no CRMid in Zoho Projects",
    "The CRMid field on a project is what ties it to a CRM deal. Without it the project is " +
    "costed but earns no revenue of its own, and any deal shown beside it is only a guess.");

  if (!rows.length) {
    band(ws, "NOTHING TO FIX");
    note(ws, "Every client project carries a CRMid. Nothing on this list.");
    return wb;
  }

  warn(ws, `${rows.length} client project${rows.length > 1 ? "s" : ""} need the CRMid filling in`);

  band(ws, "HOW TO FIX A ROW");
  note(ws, "Open the project with the link in the first column, edit the project, and paste the " +
           "deal id from the last column into the CRMid field. Where the suggested deal is empty, " +
           "the deal has to be identified by hand: no deal name matches the project name.");
  ws.__r++;

  band(ws, "PROJECTS TO FIX");
  table(ws,
    ["Project", "Status", "Client", "Hours", "Cost (€)", "Why it is not linked",
     "Suggested deal", "Deal id to paste into CRMid"],
    rows.map((p) => ({
      warn: !p.deal,
      cells: [
        { text: p.n, hyperlink: PROJECT_URL(p.id) },
        p.s || "—",
        p.c || "not matched to a client",
        p.hours === null ? "" : p.hours,
        p.cost === null ? "" : p.cost,
        p.link === "name_guess" ? "no CRMid; a deal of the same name was found"
          : p.link === "name_ambiguous" ? "no CRMid; several deals share this name"
          : p.link === "crmid_unknown" ? "the CRMid on the project matches no deal in CRM"
          : "no CRMid and no deal of the same name",
        p.deal ? { text: p.deal.name, hyperlink: CRM_DEAL_URL(p.deal.id) } : "— identify by hand",
        p.deal ? p.deal.id : "",
      ],
    })),
    { right: [4, 5], formats: [null, null, null, HRS, EUR, null, null, null], total: [4, 5] });
  ws.__r++;
  note(ws, "Rows shaded yellow have no candidate at all: those need someone who knows the account. " +
           "The others already have a plausible deal, but it stays a guess until the CRMid is saved.");

  ws.columns = [
    { width: 44 }, { width: 12 }, { width: 24 }, { width: 10 }, { width: 12 },
    { width: 42 }, { width: 40 }, { width: 24 }, { width: 10 },
  ];
  return wb;
}

/**
 * Progetti in cui qualcuno ha registrato ore a tariffa zero.
 *
 * In Zoho la tariffa oraria viene impressa sul singolo time log quando lo si
 * salva: cambiarla sul progetto, o a livello di utente, vale da lì in avanti e
 * non risana i log già scritti. Questo elenco serve quindi a due cose diverse:
 * mettere a posto la tariffa perché le ore future costino, e sapere di quanto
 * il margine di oggi è gonfiato dalle ore passate rimaste a zero.
 */
export async function missingRatesWorkbook(ctx) {
  const rates = ctx.rates || new Map();
  const rows = [];
  for (const p of ctx.projects) {
    if (p.k !== "client" && p.k !== "client_mgmt") continue;
    for (const person of ctx.people[p.id] || []) {
      if (!(person.unrated > 0)) continue;
      const r = rates.get(person.user_id) || {};
      rows.push({ p, person, prevailing: r.rate || 0 });
    }
  }
  rows.sort((a, b) => b.person.unrated - a.person.unrated);

  const wb = await newBook();
  const ws = sheet(wb, "Missing rates", "Hours logged with no hourly cost",
    "Zoho stamps the hourly cost onto each time log as it is saved. Setting the rate on the " +
    "project, or on the user, applies from then on — it does not go back and price the hours " +
    "already logged. So this list is both a thing to fix and a measure of how flattered the margin is.");

  if (!rows.length) {
    band(ws, "NOTHING TO FIX");
    note(ws, "Every hour logged on a client project carries an hourly cost.");
    return wb;
  }

  const hours = rows.reduce((s, r) => s + r.person.unrated, 0);
  const value = rows.reduce((s, r) => s + r.person.unrated * r.prevailing, 0);
  warn(ws, `${Math.round(hours).toLocaleString("en-GB")} hours across ${new Set(rows.map((r) => r.p.id)).size} ` +
           `client projects cost nothing — about €${Math.round(value).toLocaleString("en-GB")} of real cost missing`);

  band(ws, "WHAT THIS COSTS");
  kv(ws, "Hours with no hourly cost", Math.round(hours * 100) / 100, HRS);
  kv(ws, "Estimated cost of those hours (€)", Math.round(value * 100) / 100, EUR);
  note(ws, "Estimated at each person's own prevailing rate — the average of the hours they logged " +
           "that did carry a rate, weighted by hours. Where a person has never had a rate at all, " +
           "nothing can be estimated and the row is shaded yellow.");
  ws.__r++;

  band(ws, "WHERE THE HOURS ARE");
  table(ws,
    ["Project", "Client", "Person", "Hours with no rate", "Their prevailing rate (€)",
     "Estimated missing cost (€)", "Hours already priced", "First log", "Last log"],
    rows.map((r) => ({
      warn: !r.prevailing,
      cells: [
        { text: r.p.n, hyperlink: PROJECT_URL(r.p.id) },
        r.p.c || "—",
        r.person.person,
        r.person.unrated,
        r.prevailing || "never had a rate",
        Math.round(r.person.unrated * r.prevailing * 100) / 100,
        Math.round((r.person.hours - r.person.unrated) * 100) / 100,
        day(r.person.first), day(r.person.last),
      ],
    })),
    { right: [4, 5, 6, 7], formats: [null, null, null, HRS, RATE, EUR, HRS, dmy, dmy],
      total: [4, 6, 7] });
  ws.__r++;
  note(ws, "Yellow rows are people who have never carried an hourly cost anywhere, often leavers. " +
           "Their hours cannot even be estimated until someone decides what they should have cost.");

  ws.columns = [
    { width: 40 }, { width: 22 }, { width: 24 }, { width: 14 }, { width: 18 },
    { width: 18 }, { width: 14 }, { width: 13 }, { width: 13 },
  ];
  return wb;
}

/**
 * Anteprima dell'allineamento delle tariffe in Zoho Projects per un anno.
 * Si guarda prima di scrivere: una riga per coppia progetto-persona, con la
 * tariffa che i log portano oggi e quella dei cedolini. Nessuna scrittura.
 */
export async function ratePlanWorkbook(rows, year) {
  const wb = await newBook();
  const ws = sheet(wb, `Rate plan ${year}`, `Hourly cost alignment for ${year} — preview`,
    "What would be written to the Cost Per Hour of each person on each project with time logged in " +
    `${year}. Nothing has been changed in Zoho: this sheet exists to be checked first.`);

  const changing = rows.filter((r) => r.change);
  const noRate = rows.filter((r) => !r.target);

  band(ws, "WHAT THIS WOULD DO");
  kv(ws, "Year", year);
  kv(ws, "Project and person pairs with hours", rows.length, INT);
  kv(ws, "Pairs whose rate would change", changing.length, INT);
  kv(ws, "Pairs left alone (already right, or no payroll rate)", rows.length - changing.length, INT);
  kv(ws, "Projects affected", new Set(changing.map((r) => r.project_id)).size, INT);
  kv(ws, "People affected", new Set(changing.map((r) => r.user_id)).size, INT);
  ws.__r++;
  note(ws, "Zoho stamps the hourly cost onto each time log as it is saved, so writing these rates " +
           `prices the hours logged from then on. The ${year} hours already logged keep the rate they ` +
           "were saved with — which is why the dashboard costs them from the payroll instead.");
  ws.__r++;

  band(ws, "ROWS THAT WOULD CHANGE");
  if (!changing.length) {
    note(ws, "Nothing to change: every person already carries their payroll rate on every project.");
  } else {
    table(ws,
      ["Project", "Status", "Person", `Hours in ${year}`, "Rate on the logs today (€)",
       "Rate to write (€)", "Difference on those hours (€)", "Hours at zero", "Last log"],
      changing.map((r) => ({
        warn: !r.current,
        cells: [
          { text: r.project, hyperlink: PROJECT_URL(r.project_id) },
          r.status || "—", r.person, r.hours, r.current || 0, r.target, r.delta, r.unrated,
          day(r.last_log),
        ],
      })),
      { right: [4, 5, 6, 7, 8], formats: [null, null, null, HRS, RATE, RATE, EUR, HRS, dmy],
        total: [4, 7, 8] });
    ws.__r++;
    note(ws, "Yellow rows are pairs where the logs carry no rate at all today. The difference column " +
             "is what those hours would have cost had the rate been there — it is not a change to the " +
             "past, only a measure of the gap.");
  }
  ws.__r++;

  if (noRate.length) {
    band(ws, "LEFT ALONE — NO PAYROLL RATE");
    table(ws,
      ["Project", "Person", `Hours in ${year}`, "Rate on the logs today (€)", "Why"],
      noRate.map((r) => ({
        warn: true,
        cells: [
          { text: r.project, hyperlink: PROJECT_URL(r.project_id) },
          r.person, r.hours, r.current || 0,
          "not on the payroll — a contractor, or a name that did not match",
        ],
      })),
      { right: [3, 4], formats: [null, null, HRS, RATE, null], total: [3] });
    ws.__r++;
  }

  const pws = sheet(wb, "Rates by person", "Hourly cost by person and year",
    "From the Vivian S.r.l. payroll: median monthly cost over the months on the payroll, divided by " +
    "21 working days and 8 hours. The median is deliberate — it steps over the " + +
    "leaving month, which carries the settlement, and over parental leave months, which are reimbursed.");
  const years = Object.keys(RATE_YEARS);
  table(pws,
    ["Person", "Payroll name", "Department", "Status", ...years.map((y) => `${y} (€/h)`), "Notes"],
    Object.values(RATE_PEOPLE).map((p) => ({
      warn: !!(p.flags && p.flags.length) || !Object.keys(p.rates || {}).length,
      cells: [p.name, p.payroll || "not on the payroll", p.dept || "—", p.status || "—",
              ...years.map((y) => (p.rates && p.rates[y]) || (RATE_YEARS[y].inherits
                ? (p.rates && p.rates[RATE_YEARS[y].inherits]) || "" : "")),
              (p.flags || []).join(" · ") || ""],
    })),
    { right: years.map((_, i) => 5 + i),
      formats: [null, null, null, null, ...years.map(() => RATE), null] });
  pws.__r++;
  note(pws, "Yellow rows carry a note: a year discarded and the earlier rate kept, or nobody on the " +
            "payroll to match. A year that inherits from another shows the inherited figure.");
  pws.columns = [
    { width: 24 }, { width: 28 }, { width: 18 }, { width: 10 },
    ...years.map(() => ({ width: 13 })), { width: 70 },
  ];
  return wb;
}

/**
 * La dashboard così com'è a schermo, in un foglio.
 * Rispetta anno, ricerca ed esclusione Execus, così quello che scarichi è
 * quello che stai guardando e non una vista diversa con gli stessi nomi.
 */
export async function dashboardWorkbook(ctx, view, role) {
  const v = view || {};
  const viewer = role === "viewer";
  const year = v.year && v.year !== "all" ? String(v.year) : null;
  const snap = ctx.snapshot;
  const accrual = snap.accrual && snap.accrual.status === "ok";
  const perYear = !!snap.cost_by_year;
  const q = (v.q || "").trim().toLowerCase();

  const rows = ctx.clients
    .filter((c) => !(v.noExecus && c.c === "Execus"))
    .map((c) => {
      const rev = !year ? c.rt : accrual ? (c.ra && c.ra[year]) || 0 : (c.ry && c.ry[year]) || 0;
      const cy = c.cy && c.cy[year];
      const cost = !year ? c.cost : perYear ? (cy ? cy.cost : 0) : null;
      const hours = !year ? c.hours : perYear ? (cy ? cy.hours : 0) : null;
      const margin = cost == null ? null : rev - cost;
      return {
        ...c, rev, cost, hours, margin,
        // Il margine contro il valore a contratto dei deal in CRM: stessa
        // spesa, domanda diversa — il venduto regge i costi?
        marginAmt: c.cost == null || !c.amt ? null : c.amt - c.cost,
        mpAmt: c.cost == null || !c.amt ? null : (c.amt - c.cost) / c.amt,
        mpAmtIn: c.cost == null || !c.amt || !c.icost
          ? null : (c.amt - c.cost - c.icost) / c.amt,
        mp: margin == null || !rev ? null : margin / rev,
        // Il margine di sempre accanto a quello dell'anno: la stessa coppia che
        // sta a schermo, così il file e la pagina raccontano la stessa cosa.
        marginAll: c.cost == null ? null : c.rt - c.cost,
        mpAll: c.cost == null || !c.rt ? null : (c.rt - c.cost) / c.rt,
        // Le ore su difetti nostri restano fuori dal margine; la colonna
        // accanto dice cosa sarebbe il margine se le pagasse il cliente.
        ihours: !year ? (c.ihours || 0) : (cy ? cy.ih || 0 : 0),
        icost: !year ? (c.icost || 0) : (cy ? cy.ic || 0 : 0),
        // Il margine sul contratto guarda tutto il periodo, quindi il suo
        // debug interno è quello di sempre, non quello dell'anno scelto.
        icost_all: c.icost || 0,
        mpIn: (() => {
          const ic = !year ? (c.icost || 0) : (cy ? cy.ic || 0 : 0);
          return cost == null || !rev || !ic ? null : (rev - cost - ic) / rev;
        })(),
      };
    })
    .filter((c) => c.rev !== 0 || (c.cost || 0) !== 0)
    .filter((c) => !q || c.c.toLowerCase().includes(q) ||
      c.p.join(" ").toLowerCase().includes(q) || c.ba.join(" ").toLowerCase().includes(q))
    .sort((a, b) => b.rev - a.rev);

  const wb = await newBook();
  const ws = sheet(wb, "Margin by client",
    "Margin by Clients" + (year ? ` — ${year}` : " — all years"),
    year && accrual
      ? `Revenue for ${year} is each licence invoice spread day by day across its licence period, ` +
        `and cost is the time logged in ${year}: both sides on the same basis.`
      : "Revenue as invoiced, net of VAT and of credit notes, so the total reconciles to Zoho Books.");

  band(ws, "WHAT THIS COVERS");
  kv(ws, "Period", `${snap.period && snap.period.from || "—"} to ${snap.period && snap.period.to || "—"}`);
  kv(ws, "Year shown", year || "all years");
  if (q) kv(ws, "Search applied", v.q);
  if (v.noExecus) kv(ws, "Execus", "excluded as a pass-through");
  kv(ws, "Clients", rows.length, INT);
  kv(ws, "Generated", new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC");
  ws.__r++;

  band(ws, "CLIENTS");
  const yl = year || "all time";
  const revTot = rows.reduce((s, r) => s + (r.rev || 0), 0);
  // Una tabella sola: chi non ha sbloccato i costi perde la colonna del costo
  // reale e nient'altro. Tutto il resto — ricavo, peso, margine, lifetime
  // value — è la stessa cosa per tutti.
  const head = ["Client", "Billed through", `Revenue — ${yl} (€)`, `Share of ${yl}`];
  const fmts = [null, null, EUR, PCT];
  if (!viewer) { head.push(`Real cost — ${yl} (€)`); fmts.push(EUR); }
  head.push("Hours", "Internal fix hours", `Margin — ${yl} (€)`, `Margin % — ${yl}`,
            `Margin % — ${yl} with internal fix`);
  fmts.push(HRS, HRS, EUR, PCT, PCT);
  // Con "all years" selezionato i due margini sarebbero la stessa colonna
  // scritta due volte: la seconda compare solo quando c'è un anno da affiancare.
  if (year) { head.push("Margin all time (€)", "Margin % all time"); fmts.push(EUR, PCT); }
  head.push("Contract value — CRM (€)", "Margin on contract (€)", "Margin % on contract",
            "Margin % on contract with internal fix",
            "Deals closed before the window",
            "Lifetime value (€)", "Won deals", "Invoices", "Outstanding (€)", "Projects");
  fmts.push(EUR, EUR, PCT, PCT, INT, EUR, INT, INT, EUR, INT);

  const t = table(ws, head,
    rows.map((r) => ({
      cells: [
        r.c, r.p.filter((x) => x !== r.c).join(", ") || "—",
        money(r.rev), revTot ? r.rev / revTot : "",
        ...(viewer ? [] : [r.cost == null ? "" : money(r.cost)]),
        r.hours == null ? "" : r.hours,
        r.ihours || "",
        r.margin == null ? "" : money(r.margin),
        r.mp == null ? "" : r.mp,
        r.mpIn == null ? "" : r.mpIn,
        ...(year ? [r.marginAll == null ? "" : money(r.marginAll),
                    r.mpAll == null ? "" : r.mpAll] : []),
        r.amt == null ? "" : money(r.amt),
        r.marginAmt == null ? "" : money(r.marginAmt),
        r.mpAmt == null ? "" : r.mpAmt,
        r.mpAmtIn == null ? "" : r.mpAmtIn,
        r.amt_early || "",
        r.ltv == null ? "" : money(r.ltv),
        r.ltvn || "",
        r.n, money(r.ob), r.pj.length,
      ],
    })),
    { right: head.map((_, i) => i + 1).filter((i) => i > 2),
      formats: fmts,
      // Le percentuali non si sommano: quelle due colonne restano vuote nel
      // totale e vengono riempite qui sotto con il margine vero dell'insieme.
      total: head.map((h, i) => (/%|Share of /.test(h) || i < 2 ? null : i + 1)).filter(Boolean) });

  if (t.total) {
    const at = (label) => head.indexOf(label) + 1;
    const put = (i, val) => {
      const c = ws.getCell(t.total, i);
      c.value = val == null ? "" : val;
      c.numFmt = PCT;
    };
    const R = rows.reduce((s, r) => s + (r.rev || 0), 0);
    const M = rows.reduce((s, r) => s + (r.margin || 0), 0);
    const RA = rows.reduce((s, r) => s + (r.rt || 0), 0);
    const MA = rows.reduce((s, r) => s + (r.marginAll || 0), 0);
    put(at(`Share of ${yl}`), R ? 1 : null);
    put(at(`Margin % — ${yl}`), R ? M / R : null);
    if (year) put(at("Margin % all time"), RA ? MA / RA : null);
    // Anche questa è una percentuale: il totale è il margine vero dell'insieme
    // sul valore a contratto, non la somma delle percentuali di riga.
    const AM = rows.reduce((s, r) => s + (r.amt || 0), 0);
    const AMm = rows.reduce((s, r) => s + (r.marginAmt || 0), 0);
    put(at("Margin % on contract"), AM ? AMm / AM : null);
    // Anche le due varianti "con il debug interno" sono percentuali: si
    // ricalcolano sull'insieme, non si sommano.
    const IC = rows.reduce((s, r) => s + (r.icost || 0), 0);
    put(at(`Margin % — ${yl} with internal fix`), R && IC ? (M - IC) / R : null);
    const ICall = rows.reduce((s, r) => s + (r.icost_all || 0), 0);
    put(at("Margin % on contract with internal fix"), AM && ICall ? (AMm - ICall) / AM : null);
  }
  ws.__r++;
  note(ws, "Margin is before server and infrastructure costs, which Zoho does not record." +
           (viewer
             ? " The cost of the team and the per-person detail behind it are part of the internal costs view."
             : " Cost is each person's real hourly cost from the payroll in the year the hour was logged."));
  note(ws, year
    ? `The first margin covers ${year} alone: revenue of that year against the hours logged in ` +
      `that year, including on projects that started earlier. The second is the whole relationship, ` +
      `every year together.`
    : "All years together. Pick a year on the dashboard to see that year's margin beside this one.");
  note(ws, "Margin on contract measures the same cost against the Amount of the deals in CRM rather " +
           "than against what has been invoiced: it answers whether what was sold covers what it costs " +
           "to deliver. Where a deal was won before this window opened, part of its delivery cost sits " +
           "outside — the column beside it counts those deals, and that margin reads better than it was.");
  note(ws, "Internal fix hours are time logged on the internal debug and fix list: our own defects. " +
           "The company paid for them but the client did not buy them, so they are out of every " +
           "margin here. The columns marked \"with internal fix\" are what those margins would be " +
           "if that time were charged to the client, and the gap between the two is what our defects " +
           "cost that account.");
  note(ws, "Lifetime value is the full Amount of every deal of that client in a Won stage in CRM, all " +
           "time. It is a different measure from invoiced revenue and the two will never reconcile: " +
           "it counts deals won and never invoiced, and leaves out invoicing of deals won outside " +
           "this window.");
  ws.columns = [
    { width: 28 }, { width: 24 }, { width: 16 }, { width: 12 },
    ...(viewer ? [] : [{ width: 16 }]),
    { width: 11 }, { width: 13 }, { width: 16 }, { width: 13 }, { width: 15 },
    ...(year ? [{ width: 17 }, { width: 15 }] : []),
    { width: 18 }, { width: 18 }, { width: 15 }, { width: 16 }, { width: 14 },
    { width: 16 }, { width: 11 }, { width: 10 }, { width: 15 }, { width: 10 },
  ];

  // Secondo foglio: la stessa storia spezzata per anno, che a schermo si vede
  // solo aprendo un cliente alla volta.
  const minY = String(snap.min_year || "2025");
  const yrs = [...new Set(ctx.clients.flatMap((c) => [
    ...Object.keys(c.ra || {}), ...Object.keys(c.ry || {}), ...Object.keys(c.cy || {})]))]
    .filter((y) => y >= minY).sort();
  const yws = sheet(wb, "By year", "Revenue, cost and margin by year",
    "Accrued revenue spreads each licence invoice across its licence period. Invoiced revenue keeps " +
    "it on the invoice date, which is what reconciles to Zoho Books.");
  table(yws,
    viewer
      ? ["Client", "Year", "Accrued revenue (€)", "Invoiced revenue (€)", "Hours", "Margin (€)", "Margin %"]
      : ["Client", "Year", "Accrued revenue (€)", "Invoiced revenue (€)", "Hours", "Cost (€)", "Margin (€)", "Margin %"],
    ctx.clients.flatMap((c) => yrs
      .filter((y) => (c.ra && c.ra[y]) || (c.ry && c.ry[y]) || (c.cy && c.cy[y]))
      .map((y) => {
        const rev = money(c.ra && c.ra[y]);
        const cost = c.cy && c.cy[y] ? c.cy[y].cost : 0;
        const hrs = c.cy && c.cy[y] ? c.cy[y].hours : 0;
        const head = [c.c, y, rev, money(c.ry && c.ry[y]), hrs];
        return {
          cells: viewer
            ? [...head, rev - cost, rev ? (rev - cost) / rev : ""]
            : [...head, cost, rev - cost, rev ? (rev - cost) / rev : ""],
        };
      })),
    viewer
      ? { right: [3, 4, 5, 6, 7], formats: [null, null, EUR, EUR, HRS, EUR, PCT], total: [3, 4, 5, 6] }
      : { right: [3, 4, 5, 6, 7, 8], formats: [null, null, EUR, EUR, HRS, EUR, EUR, PCT],
          total: [3, 4, 5, 6, 7] });
  yws.columns = [{ width: 28 }, { width: 9 }, { width: 19 }, { width: 19 },
                 { width: 12 }, { width: 15 }, { width: 15 }, { width: 12 }];
  return wb;
}

/** Somma le persone su più progetti, così il totale coincide con la dashboard. */
function mergePeople(ctx, projectIds) {
  const m = new Map();
  for (const pid of projectIds) {
    for (const p of ctx.people[pid] || []) {
      const k = p.user_id || p.person;
      const e = m.get(k) || { ...p, hours: 0, cost: 0, logs: 0, unrated: 0,
                              first: null, last: null, priced: {} };
      e.hours += p.hours; e.cost += p.cost; e.logs += p.logs; e.unrated += p.unrated;
      for (const [b, h] of Object.entries(p.priced || {})) e.priced[b] = (e.priced[b] || 0) + h;
      if (p.first && (!e.first || p.first < e.first)) e.first = p.first;
      if (p.last && (!e.last || p.last > e.last)) e.last = p.last;
      m.set(k, e);
    }
  }
  return [...m.values()].map((e) => ({
    ...e,
    hours: Math.round(e.hours * 100) / 100,
    cost: Math.round(e.cost * 100) / 100,
    unrated: Math.round(e.unrated * 100) / 100,
    rate: e.hours ? Math.round((e.cost / e.hours) * 1000) / 1000 : 0,
  })).sort((a, b) => b.hours - a.hours);
}

export const fileName = (kind, label) =>
  `${kind}_${String(label).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60)}.xlsx`;
