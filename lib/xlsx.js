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
import { CRM_DEAL_URL, PROJECT_URL } from "./zoho.js";

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
    return { first, last, total: r };
  }
  return { first, last, total: null };
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

/* --------------------------------------------------------------- sezioni -- */
function dealBlock(ws, deal) {
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

function invoiceBlock(ws, invoices, year) {
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

function peopleBlock(ws, people, heading) {
  band(ws, heading || "HOURS AND COST PER PERSON (Time Logs, Zoho Projects)");
  const rows = people.map((p) => ({
    warn: p.unrated > 0,
    cells: [p.person, p.role || "—", p.logs, p.hours, p.rate, p.cost,
            day(p.first), day(p.last), p.unrated],
  }));
  const t = table(ws,
    ["Person", "Role", "Logs", "Hours", "Hourly cost (€)", "Cost (€)",
     "First log", "Last log", "Hours with no rate"],
    rows,
    { right: [3, 4, 5, 6, 9], formats: [null, null, INT, HRS, RATE, EUR, dmy, dmy, HRS],
      total: [3, 4, 6, 9] });
  if (t.total) {
    const c = ws.getCell(t.total, 5);
    c.value = { formula: `IF(D${t.total}=0,0,F${t.total}/D${t.total})` };
    c.numFmt = RATE;
  }
  ws.__r++;
  note(ws, "Rows shaded yellow are people whose hours carry no hourly cost in Zoho Projects, " +
           "so those hours cost nothing here and the margin is flattered by that much.");
  return t;
}

function projectListBlock(ws, projects, heading) {
  band(ws, heading);
  const rows = projects.map((p) => ({
    warn: !p.crmid,
    cells: [
      { text: p.n, hyperlink: PROJECT_URL(p.id) },
      p.s || "—",
      p.link === "crmid" ? "CRM id" : p.link === "name_guess" ? "name (guess)"
        : p.link === "name_ambiguous" ? "name (ambiguous)"
        : p.link === "crmid_unknown" ? "CRM id not found" : "not linked",
      p.deal ? p.deal.name : "—",
      p.hours === null ? "" : p.hours,
      p.cost === null ? "" : p.cost,
    ],
  }));
  const t = table(ws,
    ["Project", "Status", "Link to deal", "Deal", "Hours", "Cost (€)"],
    rows,
    { right: [5, 6], formats: [null, null, null, null, HRS, EUR], total: [5, 6] });
  ws.__r++;
  note(ws, "Rows shaded yellow have no CRM id on the project in Zoho Projects, so any deal shown " +
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

export async function dealWorkbook(ctx, dealId) {
  const deal = ctx.dealById.get(String(dealId));
  if (!deal) throw new Error("deal " + dealId + " not found in CRM");
  const invoices = ctx.invoices.filter((i) => i.dealId === String(dealId));
  const projects = ctx.projects.filter((p) => p.dealId === String(dealId));
  const people = mergePeople(ctx, projects.map((p) => p.id));

  const wb = await newBook();
  const ws = sheet(wb, "Deal", deal.name,
    "Revenue is the invoice sub-total, net of VAT and net of any credit note that reversed it.");

  if (projects.some((p) => p.link === "name_guess")) {
    warn(ws, "MISSING CRMid IN PROJECTS — one or more projects matched on name, treat as a guess");
  }

  dealBlock(ws, deal);
  const inv = invoiceBlock(ws, invoices, ctx.year);
  if (inv.total) {
    kv(ws, "Deal amount still to invoice (€)",
       { formula: `${money(deal.amount)}-G${inv.total}` }, EUR);
    note(ws, "Deal amount less the revenue counted. A positive figure is work sold but not yet billed.");
    ws.__r++;
    yearBlock(ws, deal, invoices, inv.total, ctx.year);
  }

  const list = projects.length
    ? projectListBlock(ws, projects, "PROJECTS DELIVERING THIS DEAL (Zoho Projects)")
    : null;
  if (!projects.length) {
    band(ws, "PROJECTS DELIVERING THIS DEAL (Zoho Projects)");
    note(ws, "No project in Zoho Projects carries this deal's CRM id, and no project name matches it, " +
             "so no cost can be attributed to this deal. Revenue is shown without a margin.");
    ws.__r++;
  }

  if (inv.total && list && list.total) {
    marginBlock(ws, `G${inv.total}`, `F${list.total}`);
  }

  if (people.length) {
    const team = sheet(wb, "Team", deal.name + " — team",
      "Every person who logged time on the projects delivering this deal.");
    peopleBlock(team, people);
  }
  return wb;
}

export async function projectWorkbook(ctx, projectId) {
  const p = ctx.projects.find((x) => x.id === String(projectId));
  if (!p) throw new Error("project " + projectId + " not found in Zoho Projects");
  const deal = p.dealId ? ctx.dealById.get(p.dealId) : null;
  const people = mergePeople(ctx, [p.id]);

  const wb = await newBook();
  const ws = sheet(wb, "Project", p.n || p.name,
    "One project. Cost is the team's logged time at each person's own hourly cost in Zoho Projects.");

  if (!p.crmid) {
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
  kv(ws, "CRM id on the project", p.crmid || "empty");
  kv(ws, "Link to deal",
     p.link === "crmid" ? "CRM id — one to one"
     : p.link === "name_guess" ? "name match only — guess"
     : p.link === "name_ambiguous" ? "several deals share this name — no link made"
     : p.link === "crmid_unknown" ? "the CRM id on the project matches no deal"
     : "no deal linked");
  ws.__r++;

  const cost = peopleBlock(ws, people);

  if (deal) {
    dealBlock(ws, deal);
    const invoices = ctx.invoices.filter((i) => i.dealId === deal.id);
    const inv = invoiceBlock(ws, invoices, ctx.year);
    if (inv.total) {
      yearBlock(ws, deal, invoices, inv.total, ctx.year);
      const others = ctx.projects.filter((x) => x.dealId === deal.id && x.id !== p.id);
      marginBlock(ws, `G${inv.total}`, `F${cost.total}`,
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

export async function clientWorkbook(ctx, clientName) {
  const row = ctx.clients.find((c) => c.c === clientName);
  if (!row) throw new Error("client " + clientName + " not in the snapshot");
  const projects = ctx.projects.filter((p) => row.pj.includes(p.id));
  const people = mergePeople(ctx, projects.map((p) => p.id));

  const wb = await newBook();
  const ws = sheet(wb, "Summary", row.c,
    "Everything behind this client's margin: the deals invoiced, the projects costed, and the team.");

  band(ws, "CLIENT");
  kv(ws, "Client", row.c);
  if (row.p.length) kv(ws, "Billed through", row.p.join(", "));
  if (row.ba.length) kv(ws, "Invoiced entities", row.ba.join(", "));
  kv(ws, "Invoices counted", row.n, INT);
  if (row.rev) kv(ws, "Invoices reversed by credit notes", row.rev, INT);
  if (row.cn) kv(ws, "Amount reversed by credit notes (€)", row.cn, EUR);
  ws.__r++;

  band(ws, "REVENUE AND COST BY YEAR");
  const years = [...new Set([...Object.keys(row.ra), ...Object.keys(row.ry), ...Object.keys(row.cy)])].sort();
  const yr = table(ws,
    ["Year", "Accrued revenue (€)", "Invoiced revenue (€)", "Hours", "Cost (€)", "Margin (€)"],
    years.map((y) => ({
      cells: [y, money(row.ra[y]), money(row.ry[y]),
              row.cy[y] ? row.cy[y].hours : 0, row.cy[y] ? row.cy[y].cost : 0,
              money(row.ra[y]) - (row.cy[y] ? row.cy[y].cost : 0)],
    })),
    { right: [2, 3, 4, 5, 6], formats: [null, EUR, EUR, HRS, EUR, EUR], total: [2, 3, 4, 5, 6] });
  ws.__r++;
  note(ws, "Accrued revenue spreads each licence invoice day by day across the licence period. " +
           "Invoiced revenue keeps it on the invoice date, which is what reconciles to Zoho Books.");

  const list = projectListBlock(ws, projects, "COSTED PROJECTS BEHIND THE MARGIN");
  if (list.total) {
    marginBlock(ws, String(money(row.rt)), `F${list.total}`,
      "Revenue here is the whole period, on the invoice date. The year by year split is in the table above.");
  }

  if (row.d && row.d.length) {
    const dws = sheet(wb, "Deals", row.c + " — deals", "The deals invoiced to this client.");
    table(dws,
      ["Deal", "Type", "Modules", "Owner", "CSM", "Invoices", "Revenue (€)", "Reversed (€)", "Outstanding (€)"],
      row.d.map((d) => ({
        warn: d.rev > 0,
        cells: [
          d.id ? { text: d.name, hyperlink: CRM_DEAL_URL(d.id) } : d.name,
          d.kind === "licence" ? "Licence" : d.kind === "services" ? "Professional Services" : "—",
          d.mods && d.mods.length ? d.mods.join(", ") : "—",
          d.owner || "—",
          (d.csm || "—") + (d.csm_off ? " (disabled)" : ""),
          d.n, money(d.r), money(d.cn), money(d.ob),
        ],
      })),
      { right: [6, 7, 8, 9], formats: [null, null, null, null, null, INT, EUR, EUR, EUR],
        total: [6, 7, 8, 9] });
    dws.__r++;
    note(dws, "Rows shaded yellow contain at least one invoice fully reversed by a credit note.");
  }

  if (people.length) {
    const tws = sheet(wb, "Team", row.c + " — team",
      "Every person who logged time on this client's projects.");
    peopleBlock(tws, people);
  }
  return wb;
}

/** Somma le persone su più progetti, così il totale coincide con la dashboard. */
function mergePeople(ctx, projectIds) {
  const m = new Map();
  for (const pid of projectIds) {
    for (const p of ctx.people[pid] || []) {
      const k = p.user_id || p.person;
      const e = m.get(k) || { ...p, hours: 0, cost: 0, logs: 0, unrated: 0, first: null, last: null };
      e.hours += p.hours; e.cost += p.cost; e.logs += p.logs; e.unrated += p.unrated;
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
