"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LOGO_DATA_URI } from "../lib/logo";

// Marcatore di build. Serve a una cosa sola: guardare la pagina e sapere quale
// versione sta girando davvero, senza doverlo dedurre dal comportamento.
/**
 * Cosa vuol dire ogni etichetta, in un posto solo.
 *
 * Nasce da una domanda a cui non si sapeva rispondere guardando lo schermo:
 * "Margin all time" di quale periodo parla? Di tutta la finestra della
 * dashboard, non dell'anno scelto e nemmeno di sempre. Se chi ha commissionato
 * la pagina deve chiederlo, la pagina non lo sta dicendo.
 *
 * Stanno qui e non accanto a ogni colonna perché le stesse definizioni servono
 * alla tabella, al pannello di dettaglio e ai file: tre copie dello stesso testo
 * divergono al primo ritocco, e una dashboard che si contraddice è peggio di una
 * che tace.
 */
const GLOSS = {
  rev: "Invoiced in Zoho Books, net of VAT and of credit notes. Follows the year " +
       "selector: with a year chosen it is the revenue earned over that year.",
  pct: "Revenue minus real cost, over revenue. Both sides on the year you have selected.",
  amt: "The CRM Amount of the deals this client brings into the dashboard — what was sold, " +
       "not what was invoiced. Not the same as Lifetime value, which counts every won deal.",
  pctamt: "Contract value minus cost, over contract value. Neither side follows the year " +
          "selector: it is the full contract against the cost recorded since " +
          "the dashboard's first year. A deal still being delivered therefore reads better " +
          "than it will end up.",
  cost: "Hours logged, each at that person's own hourly cost from the payroll, in the month " +
        "the hour was logged. Never a flat rate. Before server and infrastructure costs.",
  mgmt: "How much of the cost above comes from this client's management projects — the ones " +
        "whose name starts with \"_\". Work on the account that nobody invoices. It belongs " +
        "in the cost because it is part of serving this client.",
  hrs: "Hours logged on this client's projects in the selected period.",
  margin: "Revenue minus real cost, in euros, for the selected period.",
  pctall: "Not all time: the whole period this dashboard covers, from its first year to today. " +
          "Shown beside the selected year so a weak year on a solid client is not read as a " +
          "collapse, or the reverse.",
  ifix: "Hours logged on the internal fix tasklist. They are a cost of ours, not of the " +
        "client's, so they stay out of this client's margin and are counted here instead.",
  ltv: "Every deal won for this client in the CRM, whatever the year and whether or not it " +
       "appears in this dashboard. There is no cost against it, so it is not a margin.",
  inv: "How many invoices make up the revenue.",
  open: "Invoiced and not yet paid.",
  prj: "How many Zoho Projects projects carry this client's cost.",
  share: "This client's revenue over the revenue of the rows currently on screen. The search " +
         "box and the Execus toggle change the denominator.",
};

const BUILD = "archived + sprints · 28/09/2026";
const VERSION = "0.3";

// Oltre questo, la richiesta si interrompe e il file passa dal link diretto.
const WAIT_MAX = 180000;

const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};

const CRM_DEAL = (id) => `https://crm.zoho.eu/crm/org20069412455/tab/Potentials/${id}`;
const PROJECT = (id) => `https://projects.zoho.eu/portal/kleecksprojects#dashboard/${id}`;

// Formattazione en-GB, coerente con gli altri report Kleecks.
const eur = (n) => (n == null ? "—" : "€" + Math.round(n).toLocaleString("en-GB"));
const fmtH = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-GB"));
const eurK = (n) =>
  n == null ? "—" : Math.abs(n) >= 1000
    ? "€" + Math.round(n / 1000).toLocaleString("en-GB") + "k"
    : "€" + Math.round(n).toLocaleString("en-GB");
const pct = (n) => (n == null ? "—" : (n * 100).toFixed(1) + "%");

// Soglie coerenti con il Project Portfolio report: >=30% verde, 0-30% ambra, <0 rosso.
const band = (m) => (m == null ? "" : m >= 0.3 ? "g" : m >= 0 ? "a" : "b");

/**
 * Le regole di lettura, in un posto solo.
 *
 * Stavano tutte in fondo alla pagina, in sei paragrafi che nessuno finiva di
 * leggere e che comunque non si trovavano quando servivano — cioè guardando un
 * numero che non torna. Qui sono voci di menù: si apre quella che riguarda il
 * numero che si ha davanti.
 */
const HELP = [
  { k: "margins", t: "The three margins", s: "year, all time, and against the contract" },
  { k: "year", t: "Which year a revenue belongs to", s: "licences spread over the period they cover" },
  { k: "cost", t: "How an hour is costed", s: "payroll by month, leavers, placements" },
  { k: "internal", t: "Internal fix hours", s: "our own defects, kept out of the client's margin" },
  { k: "link", t: "Deals and projects", s: "CRMid, guesses, deals served by several projects" },
  { k: "revenue", t: "What counts as revenue", s: "net of VAT, net of credit notes" },
  { k: "limits", t: "What this margin is not", s: "no servers, no infrastructure, no licences bought" },
];

function HelpDialog({ topic, snap, onClose }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const body = {
    margins: (
      <>
        <p>
          <b>Margin — selected year.</b> The revenue earned in that year against the hours logged in
          that year, including hours on projects that started earlier. A project running from 2025
          into 2026 appears in both, each time for the part that falls in that year, and never twice.
        </p>
        <p>
          <b>Margin — all time.</b> The whole relationship, every year together, from the first
          invoice counted here to the last. Read next to the year: a weak year on a client with a
          strong history is a different thing from a client that has never paid for itself.
        </p>
        <p>
          <b>Margin on the contract.</b> The same cost, but measured against the <b>Amount</b> of the
          deals in Zoho CRM rather than against what has been invoiced. It answers a different
          question — <i>does what we sold cover what it costs to deliver?</i> — and it moves before
          the invoices do, because a deal is worth its full amount from the day it is won. Where a
          deal was won before {snap.min_year || "2025"} its earlier delivery cost is outside this
          window, so that margin reads better than it was; those clients are marked.
        </p>
        <p className="hd-note">
          All three are before server and infrastructure costs. None of them is net margin.
        </p>
      </>
    ),
    year: (
      <>
        <p>
          Many licences are invoiced once for a period straddling two calendar years. Booking the
          whole amount to the year of issue would measure the invoicing rhythm rather than the
          business, so selecting a year spreads each invoice pro rata, day by day, across the{" "}
          <code>Licence Start Date</code> – <code>Licence End Date</code> window of the CRM deal
          recorded on it. Cost is the time logged in that same year, so both sides sit on the same
          basis.
        </p>
        <p>
          Invoices with no usable licence period — one-off consultancy, extra work billed against a
          licence deal well outside its window — stay on the invoice date.
        </p>
        {snap.accrual && snap.accrual.coverage != null && (
          <p>
            Licence periods were found for <b>{pct(snap.accrual.coverage)}</b> of invoices
            ({snap.accrual.matched} of {snap.accrual.considered}).
          </p>
        )}
        <p className="hd-note">
          <b>All</b> stays on the invoice date, so it reconciles to Zoho Books. Per-year figures will
          not add up to it exactly: the difference is licence value earned outside the window.
        </p>
      </>
    ),
    cost: (
      <>
        <p>
          Hours come from <code>Time Logs</code> in Zoho Projects. Each hour is priced at what that
          person cost the company <b>in the month it was logged</b>, from the Vivian S.r.l. payroll:
          that month&apos;s total cost divided by 21 working days and 8 hours.
        </p>
        <p>
          By the month, not by the year, because a yearly average carries the old figure for months
          after it stopped being true — someone taken on as an employee part-way through a placement
          would keep costing the placement allowance until December.
        </p>
        <p>
          Two months are the exception. The month someone <b>leaves</b> carries their settlement, and
          the month after often carries a small residual line; neither describes the cost of the work
          done in it, and severance is already accrued month by month in the payroll, so both use
          that person&apos;s usual monthly cost instead.
        </p>
        <p>
          The rate follows the past, not today: an hour logged in March 2025 is costed at March 2025.
          Pricing it at today&apos;s rate would invent a margin that never existed. Zoho&apos;s own{" "}
          <code>Cost Per Hour</code> is used only for people with no payroll record — and Zoho stamps
          its rate on each log when it is saved, which is why changing a rate there never re-prices
          the past.
        </p>
        <p className="hd-note">
          Projects prefixed <code>_</code> (management and CSM) count as client cost: that time is
          spent on the client. Internal projects (<code>---</code>, <code>::</code>) and pre-sales
          (<code>=</code>) stay out.
        </p>
      </>
    ),
    internal: (
      <>
        <p>
          Every project carries a task list called{" "}
          <code>{snap.internal_fix ? snap.internal_fix.tasklist : "_INTERNAL DEBUG & FIX"}</code>.
          Hours logged there are work on our own defects: the company pays for them, but the client
          did not buy them, so they are <b>kept out of every margin on this page</b> and counted on
          their own.
        </p>
        <p>
          Beside each margin, in brackets and smaller, is what that margin would be if those hours
          were charged to the client like any other. The gap between the two numbers is what our
          defects cost that client&apos;s account — which is the figure worth watching, and the
          reason for keeping them separate rather than simply deleting them.
        </p>
        <p>
          The match is on the task list name, ignoring case, surrounding spaces and leading
          underscores, so a list recreated by hand on a new project still counts. A log with no task
          at all — a general entry, or time on a bug — cannot be internal and stays as client work.
        </p>
        {snap.internal_fix && (
          <p className="hd-note">
            {snap.internal_fix.hours > 0
              ? <>Right now <b>{Math.round(snap.internal_fix.hours).toLocaleString("en-GB")} hours</b>{" "}
                  across {snap.internal_fix.projects} projects are counted this way.</>
              : <>No hours are on that list yet, so every margin on this page currently reads the same
                  with or without it. Once time starts being logged there the brackets will appear.</>}
          </p>
        )}
      </>
    ),
    link: (
      <>
        <p>
          A project earns revenue only through the deal it delivers, and the link is the{" "}
          <code>CRMid</code> field on the project in Zoho Projects. Where it is empty, a deal with an
          identical name is offered as a <b>guess</b> and marked as such everywhere it appears.
        </p>
        <p>
          A project with no link is still costed, but earns nothing of its own — its workbook is a
          cost sheet. Where <b>several projects deliver one deal</b>, the revenue belongs to all of
          them together, so no margin is attributed to any single one.
        </p>
        <p>
          This is also why the detail workbooks come in two cuts: one per deal, covering the whole
          deal, and one per project, covering that project alone. Deal and project are not always one
          to one.
        </p>
        {snap.links && snap.links.crmid_missing > 0 && (
          <p className="hd-note">
            <b>{snap.links.crmid_missing}</b> client projects have no CRMid right now, of which{" "}
            {snap.links.crmid_missing_guessed} matched a deal by name. The list is under{" "}
            <b>Data to fix</b>.
          </p>
        )}
      </>
    ),
    revenue: (
      <>
        <p>
          Revenue is invoices issued in Zoho Books (Vivian Srl), drafts excluded, taken at the{" "}
          <b>sub-total</b> so it is net of VAT and comparable with the CRM deal amount, and{" "}
          <b>net of any credit note</b> raised against the invoice.
        </p>
        <p>
          That last point matters more than it sounds: a reversed invoice still reads Closed and paid
          in Books, so checking the status never catches it — only the credit note does.
          {snap.revenue && snap.revenue.credited > 0 && (
            <> In this period <b>{eur(snap.revenue.credited)}</b> was reversed across{" "}
              <b>{snap.revenue.reversed_invoices}</b> invoices and has been taken out.</>
          )}
        </p>
        <p>
          Revenue reaches the end client through the CRM deal recorded on each invoice, which is why
          Prada, MSC and ITA Airways appear as clients in their own right rather than as lines under
          Jakala.
        </p>
        <p className="hd-note">
          <b>Lifetime value</b> is a different measure again: the full Amount of every deal of that
          client in a Won stage in CRM, all time. It counts deals won and never invoiced and leaves
          out invoicing of deals won long ago, so it will never reconcile with revenue.
        </p>
      </>
    ),
    limits: (
      <>
        <p>
          The only cost subtracted here is people&apos;s time. Servers, infrastructure, third-party
          licences and the rest of the cost of running the platform are not recorded anywhere in
          Zoho, so they cannot enter this calculation.
        </p>
        <p>
          Read these figures as a contribution margin on delivery effort, not as net margin: the real
          profitability of every client sits below the number shown here, by an amount this page has
          no way to measure.
        </p>
        {snap.cost_gaps && snap.cost_gaps.hours > 0 && (
          <p className="hd-note">
            Separately, <b>{Math.round(snap.cost_gaps.hours).toLocaleString("en-GB")} hours</b> across{" "}
            {snap.cost_gaps.projects} client projects carry no hourly cost, so they cost nothing here
            and every margin they touch is flattered by that much.
          </p>
        )}
      </>
    ),
  }[topic];

  const meta = HELP.find((h) => h.k === topic) || {};
  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-label={meta.t}
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal help">
        <h3>{meta.t}</h3>
        <div className="hd-body">{body}</div>
        <div className="modal-row">
          <button className="xb" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Lo stato di un download, in un punto solo.
 *
 * Serviva sia alla barra dei menu sia ai link dentro la tabella — nome del
 * cliente, del deal, del progetto — che scaricano anche loro un Excel e che
 * fino a ieri non dicevano niente: si cliccava e per un minuto non succedeva
 * nulla di visibile. Tenerlo qui significa un solo messaggio alla volta e lo
 * stesso comportamento ovunque, invece di due copie che divergono.
 */
function useDownload(token) {
  const [msg, setMsg] = useState(null);
  const [tick, setTick] = useState(0);
  const timer = useRef(null);

  // Il contatore che sale distingue "ci sta lavorando" da "è piantato":
  // una rotellina che gira dice la stessa cosa in entrambi i casi.
  useEffect(() => {
    if (!msg || msg.state === "done") return undefined;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [msg]);

  const dismiss = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setMsg(null);
  };

  const start = async (href, label) => {
    if (timer.current) window.clearTimeout(timer.current);
    const what = label || "the workbook";
    setMsg({ state: "working", what, at: Date.now() });

    // Un limite ci vuole: senza, se la richiesta non torna la scritta "sto
    // preparando" resta accesa per sempre, che è peggio di non averla affatto.
    const ac = new AbortController();
    const cut = window.setTimeout(() => ac.abort(), WAIT_MAX);

    try {
      const r = await fetch(href, { signal: ac.signal });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "the server answered " + r.status);
      }
      const cd = r.headers.get("content-disposition") || "";
      const m = /filename="?([^"]+)"?/i.exec(cd);
      const name = (m && m[1]) || "margin_export.xlsx";
      const blob = await r.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(obj);
      setMsg({ state: "done", what, name, size: blob.size });
      timer.current = window.setTimeout(() => setMsg(null), 20000);
    } catch (e) {
      // Troppo grande per la memoria, o più lento del limite: il link diretto
      // lo prende comunque, ma da lì in poi la fine non è più osservabile.
      const why = e.name === "AbortError"
        ? "it went past " + Math.round(WAIT_MAX / 1000) + "s"
        : e.message;
      setMsg({ state: "fallback", what, why, at: Date.now() });
      const a = document.createElement("a");
      a.href = href; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
      timer.current = window.setTimeout(() => setMsg(null), 120000);
    } finally {
      window.clearTimeout(cut);
    }
  };

  return { msg, tick, start, dismiss };
}

const SEGMENT_COLORS = ["#0f7173", "#14a19a", "#4bbfae", "#8ad3c4", "#e8c547"];

export default function Dashboard({ snap, warning, token, role, canUnlock }) {
  const xlsx = (type, id) =>
    `/api/xlsx?type=${type}&id=${encodeURIComponent(id)}` + (token ? `&k=${encodeURIComponent(token)}` : "");
  const dl = useDownload(token);
  // I link della tabella restano link veri — indirizzo copiabile, apri in una
  // scheda nuova — ma il clic normale passa di qui, così anche loro mostrano
  // lo stato invece di lasciare la pagina muta.
  const grabLink = (e, href, label) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dl.start(href, label);
  };
  const accrual = snap.accrual && snap.accrual.status === "ok";

  const viewer = role === "viewer";

  const years = useMemo(() => {
    const s = new Set();
    const min = String(snap.min_year || "2025");
    for (const c of snap.clients) {
      for (const y of Object.keys(c.ry || {})) s.add(y);
      if (accrual) for (const y of Object.keys(c.ra || {})) s.add(y);
    }
    // Il selettore parte dall'anno da cui la dashboard conta: prima di quello
    // non c'è né ricavo né costo, e un pulsante che apre una vista vuota è solo
    // un modo per far dubitare del resto.
    return [...s].filter((y) => y >= min).sort();
  }, [snap, accrual, viewer]);

  const [year, setYear] = useState("all");
  const [noExecus, setNoExecus] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "rev", dir: "desc" });
  // Quale delle due viste è a schermo. I progetti interni non hanno un margine
  // e non possono stare nella stessa tabella dei clienti: mettere una riga senza
  // ricavo accanto a righe che ne hanno uno inviterebbe a leggere una perdita
  // dove c'è solo costo previsto.
  const [view, setView] = useState("clients");
  const [iq, setIq] = useState("");
  const [isort, setIsort] = useState({ key: "hours", dir: "desc" });
  const [open, setOpen] = useState(null);

  const hasCost = snap.cost_status === "ok";
  const costPerYear = !!snap.cost_by_year;
  const costUsable = hasCost && (year === "all" || costPerYear);

  // Ogni riga porta due margini: quello di sempre e quello dell'anno scelto.
  // "All" è da sempre; un anno è la quota di ricavo di competenza di quell'anno
  // contro le ore lavorate in quell'anno, anche su progetti nati prima.
  /**
   * Quanto del costo di ogni cliente è gestione invece che delivery.
   *
   * I progetti che iniziano per "_" sono lavoro sull'account che nessuno
   * fattura: roadmap, coordinamento, richieste di modifica. Contano nel margine
   * del cliente, ed è giusto — è il costo di servirlo. Ma senza questa colonna
   * un margine basso non dice se abbiamo venduto male o se abbiamo regalato
   * molto, e sono due problemi con due rimedi diversi.
   */
  const mgmtByClient = useMemo(() => {
    const m = {};
    for (const p of snap.projects || []) {
      if (p.k !== "client_mgmt" || !p.c) continue;
      const cost = year === "all" ? (p.cost || 0)
        : (p.cy && p.cy[year] ? p.cy[year].cost : 0);
      const hours = year === "all" ? (p.hours || 0)
        : (p.cy && p.cy[year] ? p.cy[year].hours : 0);
      const e = m[p.c] || (m[p.c] = { cost: 0, hours: 0, n: 0 });
      e.cost += cost || 0; e.hours += hours || 0; e.n += 1;
    }
    return m;
  }, [snap, year]);

  /**
   * I progetti che non hanno un cliente: lavoro interno e prevendite.
   *
   * Qui non c'è margine e non ce ne sarà: non esiste un ricavo da mettere di
   * fronte a queste ore. C'è quanto costano, che è una domanda legittima e
   * finora non aveva una risposta a schermo. Gli archiviati restano dentro —
   * sono ore lavorate come le altre, e toglierle dal conto solo perché il
   * progetto è chiuso falserebbe ogni confronto fra un anno e il precedente.
   */
  const internalRows = useMemo(() => {
    const query = iq.trim().toLowerCase();
    let out = (snap.projects || [])
      .filter((p) => p.k === "internal" || p.k === "presale")
      .map((p) => {
        const cy = p.cy && p.cy[year];
        const hours = year === "all" ? (p.hours || 0) : (cy ? cy.hours || 0 : 0);
        const cost = year === "all" ? (p.cost || 0) : (cy ? cy.cost || 0 : 0);
        const ih = year === "all" ? (p.ih || 0) : (cy ? cy.ih || 0 : 0);
        return { ...p, h: hours, cst: cost, ifix: ih, src: "projects" };
      })
      .filter((p) => p.h > 0 || p.ifix > 0);

    /**
     * Zoho Sprints è la terza fonte, e per la vista interna è la più pesante:
     * lo sviluppo registra lì, e quelle ore non passano né da Projects né da
     * People. Entrano solo qui, mai nei margini dei clienti, perché sono
     * sviluppo di prodotto e non lavoro venduto a qualcuno.
     */
    const sp = (snap.sprints && snap.sprints.projects) || [];
    for (const r of sp) {
      if (!r.hours && !r.lifetime) continue;
      out.push({
        id: r.id, n: r.name, k: "internal", s: r.status,
        h: r.hours || 0, hall: r.lifetime || null,
        // Sprints non porta una tariffa per persona, e parte di chi ci registra
        // non è a libro paga: un costo qui sarebbe inventato.
        cst: null, ifix: 0, src: "sprints",
        zpid: r.zpid || null,
      });
    }

    out = out.filter((p) => !query || (p.n || "").toLowerCase().includes(query));

    const val = (r) =>
      isort.key === "name" ? (r.n || "").toLowerCase()
      : isort.key === "kind" ? r.src
      : isort.key === "cost" ? (r.cst == null ? -Infinity : r.cst)
      : isort.key === "hall" ? (r.hall || 0)
      : isort.key === "ifix" ? r.ifix
      : r.h;
    out.sort((a, b) => {
      const x = val(a), y2 = val(b);
      const c = typeof x === "string" ? x.localeCompare(y2) : x - y2;
      return isort.dir === "asc" ? c : -c;
    });
    return out;
  }, [snap, year, iq, isort]);

  const iTot = useMemo(() => ({
    hours: internalRows.reduce((s2, r) => s2 + r.h, 0),
    cost: internalRows.reduce((s2, r) => s2 + (r.cst || 0), 0),
    ifix: internalRows.reduce((s2, r) => s2 + r.ifix, 0),
  }), [internalRows]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const out = snap.clients
      .filter((c) => !(noExecus && c.c === "Execus"))
      .map((c) => {
        const rev = year === "all" ? c.rt
          : accrual ? (c.ra && c.ra[year]) || 0
          : c.ry[year] || 0;
        const cost = !hasCost ? null
          : year === "all" ? c.cost
          : costPerYear ? (c.cy && c.cy[year] ? c.cy[year].cost : 0)
          : null;
        const hours = !hasCost ? null
          : year === "all" ? c.hours
          : costPerYear ? (c.cy && c.cy[year] ? c.cy[year].hours : 0)
          : null;
        // Il debug interno resta fuori dal margine, ma si porta dietro il
        // proprio costo: serve a mostrare fra parentesi quanto sarebbe il
        // margine se quelle ore le pagasse il cliente.
        const icost = !hasCost ? 0
          : year === "all" ? (c.icost || 0)
          : costPerYear ? (c.cy && c.cy[year] ? c.cy[year].ic || 0 : 0)
          : 0;
        const ihours = !hasCost ? 0
          : year === "all" ? (c.ihours || 0)
          : costPerYear ? (c.cy && c.cy[year] ? c.cy[year].ih || 0 : 0)
          : 0;
        const margin = cost == null ? null : rev - cost;
        const marginAll = c.cost == null ? null : c.rt - c.cost;
        return {
          ...c, rev, cost, hours, margin, marginAll, costAll: c.cost,
          live: rev !== 0 || (cost || 0) !== 0,
          marginPct: cost == null || rev === 0 ? null : margin / rev,
          marginPctAll: c.cost == null || !c.rt ? null : marginAll / c.rt,
          // Contro il valore a contratto invece che contro il fatturato: dice
          // se il venduto regge i costi, e si muove prima delle fatture.
          marginAmt: c.cost == null || !c.amt ? null : c.amt - c.cost,
          marginPctAmt: c.cost == null || !c.amt ? null : (c.amt - c.cost) / c.amt,
          icost, ihours,
          mgmtCost: (mgmtByClient[c.c] || {}).cost || 0,
          mgmtHours: (mgmtByClient[c.c] || {}).hours || 0,
          // Che fetta del costo di questo cliente è lavoro non venduto.
          mgmtShare: cost ? ((mgmtByClient[c.c] || {}).cost || 0) / cost : null,
          // Le stesse due percentuali con dentro anche il debug interno.
          marginPctIn: cost == null || rev === 0 || !icost ? null : (rev - cost - icost) / rev,
          marginPctAmtIn: c.cost == null || !c.amt || !c.icost
            ? null : (c.amt - c.cost - c.icost) / c.amt,
        };
      })
      .filter((c) => c.live)
      .filter((c) =>
        !query ||
        c.c.toLowerCase().includes(query) ||
        c.p.join(" ").toLowerCase().includes(query) ||
        c.ba.join(" ").toLowerCase().includes(query));

    const key = sort.key;
    const val = (r) =>
      key === "cli" ? r.c.toLowerCase()
      : key === "rev" ? r.rev
      : key === "cost" ? (r.cost == null ? -Infinity : r.cost)
      : key === "margin" ? (r.margin == null ? -Infinity : r.margin)
      : key === "pct" ? (r.marginPct == null ? -Infinity : r.marginPct)
      : key === "pctall" ? (r.marginPctAll == null ? -Infinity : r.marginPctAll)
      : key === "hrs" ? (r.hours == null ? -Infinity : r.hours)
      : key === "ifix" ? (r.ihours || 0)
      : key === "mgmt" ? (r.mgmtCost || 0)
      : key === "ltv" ? (r.ltv == null ? -Infinity : r.ltv)
      : key === "amt" ? (r.amt == null ? -Infinity : r.amt)
      : key === "pctamt" ? (r.marginPctAmt == null ? -Infinity : r.marginPctAmt)
      : key === "inv" ? r.n
      : key === "open" ? r.ob
      : r.pj.length;
    out.sort((a, b) => {
      const x = val(a), y2 = val(b);
      const c = typeof x === "string" ? x.localeCompare(y2) : x - y2;
      return sort.dir === "asc" ? c : -c;
    });
    return out;
  }, [snap, year, noExecus, q, sort, hasCost, costPerYear, accrual, viewer, mgmtByClient]);

  const tot = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + r.rev, 0);
    const cost = costUsable ? rows.reduce((s, r) => s + (r.cost || 0), 0) : null;
    const hours = costUsable ? rows.reduce((s, r) => s + (r.hours || 0), 0) : null;
    const icost = costUsable ? rows.reduce((s, r) => s + (r.icost || 0), 0) : 0;
    const ihours = costUsable ? rows.reduce((s, r) => s + (r.ihours || 0), 0) : 0;
    const revAll = rows.reduce((s, r) => s + (r.rt || 0), 0);
    const costAll = hasCost ? rows.reduce((s, r) => s + (r.costAll || 0), 0) : null;
    return {
      revenue, cost, hours, revAll, icost, ihours,
      marginPctIn: cost == null || !revenue || !icost ? null : (revenue - cost - icost) / revenue,
      margin: cost == null ? null : revenue - cost,
      marginPct: cost == null || revenue === 0 ? null : (revenue - cost) / revenue,
      marginAll: costAll == null ? null : revAll - costAll,
      marginPctAll: costAll == null || !revAll ? null : (revAll - costAll) / revAll,
    };
  }, [rows, costUsable, viewer, snap, year, hasCost]);

  const wTot = rows.reduce((s, r) => s + r.rev, 0);
  const top5 = rows.slice().sort((a, b) => b.rev - a.rev).slice(0, 5);
  const top5Share = wTot ? top5.reduce((s, r) => s + r.rev, 0) / wTot : 0;

  // Stessa intestazione ordinabile della tabella clienti, con il suo stato:
  // due tabelle che si ordinano in modo diverso sarebbero due tabelle da
  // imparare invece di una.
  const ith = (key, label, right) => (
    <th
      className={(right ? "r" : "") + (isort.key === key ? " sorted" : "")}
      title={"Sort by " + label.toLowerCase()}
      scope="col"
      aria-sort={isort.key === key ? (isort.dir === "asc" ? "ascending" : "descending") : undefined}
      onClick={() =>
        setIsort((s2) => ({ key, dir: s2.key === key && s2.dir === "desc" ? "asc" : "desc" }))}
    >
      {label}
      <span className="arw" aria-hidden="true">
        {isort.key === key ? (isort.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );

  const th = (key, label, right, tint) => (
    <th
      className={(right ? "r" : "") + (tint ? " " + tint : "") +
                 (GLOSS[key] ? " has-gl" : "") +
                 (sort.key === key ? " sorted" : "")}
      title={(GLOSS[key] ? GLOSS[key] + "\n\n" : "") + "Click to sort by " + label.toLowerCase()}
      scope="col"
      aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
      onClick={() =>
        setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
    >
      {label}
      <span className="arw" aria-hidden="true">
        {sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src={LOGO_DATA_URI} alt="Kleecks" />
            <h1>Margin by Clients <span className="qual">(before infrastructure costs)</span></h1>
            <div className="beta">
              v.{VERSION} — Beta for testing · build {BUILD}
              {viewer && <span className="viewbadge">summary view</span>}
            </div>
            {/*
              Le ore non vengono più da una sola fonte, e questo va detto sulla
              pagina, non in un endpoint: chi confronta questi numeri con un
              report di Zoho Projects trova di meno e deve sapere perché, o
              penserà che uno dei due sia rotto.
            */}
            {snap.people_union && snap.people_union.hours > 0 && (
              <div className="punion">
                <strong>Hours include Zoho People.</strong>{" "}
                {fmtH(snap.people_union.hours)} h were logged in Zoho People and never reached
                Zoho Projects, and they are counted here.{" "}
                Any report you run inside Zoho Projects will therefore show the same hours or fewer,
                never more — that is expected, not an error. Archived projects are included too: the
                work was done, and dropping it because the project has since been closed would break
                every comparison between one year and the next.
                {snap.people_union.unrated > 0 && (
                  <> {fmtH(snap.people_union.unrated)} h of them have no hourly cost on record and
                  are priced at zero.</>
                )}
              </div>
            )}
            {snap.rate_years && (
              <ul className="rateyears">
                {Object.entries(snap.rate_years).map(([y, c]) => (
                  <li key={y} className={c.status}>{c.label}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="meta">
            <div>Period<br /><b>{fmtDate(snap.period?.from)} – {fmtDate(snap.period?.to)}</b></div>
            <div>Updated<br /><b>{fmtStamp(snap.generated_at)}</b></div>
            <div>
              Source<br />
              <span className={"badge " + (snap.source === "live" ? "live" : "seed")}>
                {snap.source === "live" ? "Zoho live" : "snapshot"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="shell">
        {/* Quando il CRM non risponde la pagina non si rompe: si svuota. Tipo
            deal, moduli, owner, CSM e periodi di licenza vengono tutti da lì, e
            senza un avviso l'unico sintomo è "type not set" scritto ovunque. */}
        {snap.deals && (snap.deals.error || snap.deals.count === 0) && (
          <div className="notice">
            <div>
              <strong>
                {snap.deals.count === 0 ? "Deals not loaded from CRM"
                  : snap.deals.stale ? "CRM deals are from an earlier read"
                  : "CRM deals came back incomplete"}
              </strong>
              <p>
                Deal type, licence modules, owner, CSM and licence periods all come from Zoho CRM.
                This run holds <b>{snap.deals.count}</b> deals, and of the{" "}
                <b>{snap.deals.invoices_with_deal}</b> invoices carrying a deal id,{" "}
                <b>{snap.deals.invoices_deal_found}</b> found their deal.
                {snap.deals.count === 0 &&
                  " That is why every deal reads “type not set”."}{" "}
                Revenue and cost are unaffected.
              </p>
              {snap.deals.error && <p className="err">Zoho CRM said: {snap.deals.error}</p>}
              <p className="err">
                Open <code>/api/tokeninfo?k=…</code> — the <code>crm_probe</code> section there runs
                the same query on its own and reports back what Zoho answers.
              </p>
            </div>
          </div>
        )}

        {(warning || !hasCost || snap.cost_stale) && (
          <div className="notice">
            <div>
              <strong>
                {warning ? "Zoho could not be reached"
                 : !hasCost ? "Zoho did not answer in time — reload the page"
                 : snap.cost_stale ? "Costs are from the last good refresh"
                 : "Note"}
              </strong>
              <p>
                {warning ||
                  (snap.cost_stale
                    ? "Zoho Analytics serves these figures through a job queue. That queue did not " +
                      "answer in time on this refresh, so the page is showing the costs it already had."
                    : "The cost side comes from Zoho Analytics, which serves it through a job queue. " +
                      "When the queue is busy the answer does not arrive before the page has to be " +
                      "rendered, and the cost tiles read \u201cpending\u201d. It is a wait, not a broken " +
                      "connection: reloading almost always brings the numbers back.")}
              </p>
              {/* Il rimedio è una ricarica, quindi tanto vale metterla qui invece
                  di lasciare che se la cerchi ogni volta nella barra del browser —
                  che dentro il Web Tab del CRM per giunta non ricarica l'iframe. */}
              {!hasCost && !warning && (
                <p>
                  <button className="xb" onClick={() => window.location.reload()}>
                    Reload now
                  </button>
                </p>
              )}
              {!warning && snap.cost_error && (
                <p className="err">Zoho Analytics said: {snap.cost_error}</p>
              )}
              {!warning && snap.cost_stale && (
                <p className="err">
                  Zoho Analytics said: {snap.cost_stale_reason}. The costs on this page are the
                  last ones that came through, from{" "}
                  {new Date(snap.cost_stale).toLocaleString("en-GB")}. Refresh again in a few
                  minutes to bring them up to date.
                </p>
              )}
              {!warning && !accrual && snap.accrual && snap.accrual.error && (
                <p className="err">Licence periods: {snap.accrual.error}</p>
              )}
            </div>
          </div>
        )}


        <MenuBar token={token} viewer={viewer} canUnlock={canUnlock} snap={snap} dl={dl}
                 missing={(snap.links && snap.links.crmid_missing) || 0}
                 gaps={snap.cost_gaps || null}
                 view={{ year, q, noExecus }} />

        <div className="seg views" role="group" aria-label="View">
          <button aria-pressed={view === "clients"} onClick={() => setView("clients")}>
            Clients
          </button>
          <button aria-pressed={view === "internal"} onClick={() => setView("internal")}>
            Internal &amp; pre-sales
          </button>
        </div>

        <div className="controls">
          <div className="seg" role="group" aria-label="Year">
            <button aria-pressed={year === "all"} onClick={() => setYear("all")}>All</button>
            {years.map((y) => (
              <button key={y} aria-pressed={year === y} onClick={() => setYear(y)}>{y}</button>
            ))}
          </div>
          <label className="toggle">
            <input type="checkbox" id="noexecus" checked={noExecus}
                   onChange={(e) => setNoExecus(e.target.checked)} />
            Exclude Execus (pass-through)
          </label>
          <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search client, partner or legal entity…" aria-label="Search" />
        </div>

        {view === "clients" && (
        <>
        <p className="basis">
          {year === "all" ? (
            <>
              <b>All years</b> — revenue as invoiced in Zoho Books, so the total reconciles to the
              ledger. Pick a single year to see revenue earned over the licence period instead.
            </>
          ) : accrual ? (
            <>
              <b>{year}</b> — revenue is spread pro rata over each licence period, so a licence
              invoiced up front is split across the years it actually covers. Cost is the time
              logged in {year}. Both sides therefore sit on the same basis.
            </>
          ) : (
            <>
              <b>{year}</b> — revenue is booked to the year of the invoice date; licence periods are
              unavailable, so a licence invoiced up front sits wholly in the year it was issued.
            </>
          )}
        </p>

        {/* Due margini sempre in vista: quello dell'anno scelto e quello di
            sempre. Senza il secondo, un anno debole su un cliente storicamente
            buono si legge come un disastro, e viceversa. */}
        {/* Due margini sempre in vista: quello dell'anno scelto e quello di
            sempre. Senza il secondo, un anno debole su un cliente storicamente
            buono si legge come un disastro, e viceversa. */}
        <div className="kpis">
          <div className="kpi">
            <div className="k">
              {year === "all" || !accrual ? "Invoiced revenue" : "Accrued revenue"}
            </div>
            <div className="v num">{eur(tot.revenue)}</div>
            <div className="s">{rows.length} clients · {year === "all" ? "whole period" : year}</div>
          </div>
          {viewer ? (
            <div className={"kpi" + (costUsable ? "" : " empty")}>
              <div className="k">Hours logged</div>
              <div className="v num">
                {costUsable ? Math.round(tot.hours).toLocaleString("en-GB") : "pending"}
              </div>
              <div className="s">{year === "all" ? "whole period" : "in " + year}</div>
            </div>
          ) : (
            <div className={"kpi" + (costUsable ? "" : " empty")}>
              <div className="k">Real team cost</div>
              <div className="v num">{costUsable ? eur(tot.cost) : "pending"}</div>
              <div className="s">
                {costUsable
                  ? Math.round(tot.hours).toLocaleString("en-GB") + " hours · €" +
                    (tot.hours ? (tot.cost / tot.hours).toFixed(0) : 0) + "/h blended"
                  : hasCost ? "per-year breakdown unavailable" : "Zoho Analytics · Time Logs"}
              </div>
            </div>
          )}
          <div className={"kpi" + (costUsable ? "" : " empty")}>
            <div className="k">Margin — {year === "all" ? "all time" : year}</div>
            <div className={"v num " + band(tot.marginPct)}>{costUsable ? eur(tot.margin) : "—"}</div>
            <div className="s">
              {costUsable ? pct(tot.marginPct) + " of revenue" : "revenue less cost of delivery"}
              {costUsable && tot.marginPctIn != null &&
                " · " + pct(tot.marginPctIn) + " with internal fix"}
            </div>
          </div>
          <div className={"kpi" + (hasCost ? "" : " empty")}>
            <div className="k">Margin — all time</div>
            <div className={"v num " + band(tot.marginPctAll)}>
              {hasCost ? eur(tot.marginAll) : "—"}
            </div>
            <div className="s">
              {hasCost ? pct(tot.marginPctAll) + " of revenue, every year together" : "≥ 30% green, < 0 red"}
            </div>
          </div>
        </div>

        <div className="conc">
          <h3>Concentration — the top 5 clients account for {pct(top5Share)} of revenue</h3>
          <div className="conc-bar">
            {top5.map((r, i) => (
              <span key={r.c}
                    title={r.c + " " + eur(r.rev)}
                    style={{ width: (wTot ? (r.rev / wTot) * 100 : 0) + "%",
                             background: SEGMENT_COLORS[i] }} />
            ))}
          </div>
          <div className="conc-key">
            {top5.map((r, i) => (
              <span key={r.c}>
                <i style={{ background: SEGMENT_COLORS[i] }} />
                {r.c} <b className="num">{pct(wTot ? r.rev / wTot : 0)}</b>
              </span>
            ))}
          </div>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {th("cli", "Client")}
                {/* Due coppie affiancate, ognuna un valore e il margine che ne
                    esce. La prima guarda quello che è entrato, la seconda quello
                    che è stato venduto: tenerle vicine è l'unico modo perché il
                    confronto si faccia con l'occhio e non a memoria. */}
                {th("rev", year === "all" ? "Invoiced value" : "Accrued value " + year, true, "acc")}
                {th("pct", year === "all" ? "Margin %" : "Margin % " + year, true, "acc")}
                {th("amt", "Contract value", true, "crm")}
                {th("pctamt", "Margin % on contract", true, "crm")}
                {!viewer && th("cost", year === "all" ? "Real cost" : "Real cost " + year, true)}
                {/* Di quel costo, quanto è gestione non venduta. Sta attaccata
                    al costo perché è una sua scomposizione, non un dato a sé. */}
                {!viewer && th("mgmt", "of which management", true)}
                {viewer && th("hrs", "Hours", true)}
                {th("margin", year === "all" ? "Margin" : "Margin " + year, true)}
                {/* Con "All" selezionato i due margini coincidono: la seconda
                    colonna compare solo quando c'è un anno da affiancare. */}
                {year !== "all" && th("pctall", "Margin % all time", true)}
                {/* Ore su difetti nostri: fuori dal margine, ma non nascoste. */}
                {th("ifix", "Internal fix h", true)}
                {th("ltv", "Lifetime value", true)}
                {th("inv", "Inv.", true)}
                {th("open", "Outstanding", true)}
                {th("prj", "Proj.", true)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open === r.c;
                const via = r.p.filter((x) => x !== r.c);
                return [
                  <tr key={r.c} className={isOpen ? "open" : ""}
                      aria-expanded={isOpen}
                      tabIndex={0}
                      title={isOpen ? "Close the detail" : "Open the detail for " + r.c}
                      onKeyDown={(e) => {
                        // Una riga che si apre col clic deve aprirsi anche da
                        // tastiera, altrimenti il dettaglio è raggiungibile solo
                        // col mouse.
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpen(isOpen ? null : r.c);
                        }
                      }}
                      onClick={() => setOpen(isOpen ? null : r.c)}>
                    <td>
                      <div className="cli">
                        {/* Che la riga si apra non si capiva: il clic funzionava
                            ma niente lo diceva. La freccia lo annuncia e ruota
                            quando è aperta, e resta fuori dal link del nome —
                            che continua a scaricare l'Excel del cliente. */}
                        <span className="exp" aria-hidden="true">▸</span>
                        <a href={xlsx("client", r.c)} className="clidl"
                           title="Download every costed project behind this client's margin"
                           onClick={(e) => grabLink(e, xlsx("client", r.c), r.c)}>{r.c}</a>
                      </div>
                      {via.length > 0 && <div className="via">via {via.join(", ")}</div>}
                    </td>
                    {/* Prima coppia: quello che è entrato e il margine che ne
                        esce. La barra si riempie in ambra. */}
                    <td className="r num acc">{eur(r.rev)}</td>
                    <td className="r acc">
                      {r.marginPct == null ? <span className="na">—</span> : (
                        <span className="mbar">
                          <span className={"num " + band(r.marginPct)}>
                            {pct(r.marginPct)}
                            {/* Fra parentesi il margine se anche le ore di
                                debug interno le pagasse il cliente. */}
                            {r.marginPctIn != null && (
                              <i className="alt" title={"With the " +
                                Math.round(r.ihours).toLocaleString("en-GB") +
                                " hours of internal fix counted as client cost"}>
                                ({pct(r.marginPctIn)})
                              </i>
                            )}
                          </span>
                          <span className="track">
                            <span className="fill fill-acc"
                                  style={{ width: Math.min(100, Math.max(0, r.marginPct * 100)) + "%" }} />
                          </span>
                        </span>
                      )}
                    </td>
                    {/* Seconda coppia: quello che è stato venduto secondo il CRM
                        e il margine su quello. Barra verde, così le due misure
                        non si confondono anche guardandole di sfuggita. */}
                    <td className="r num crm">
                      {r.amt == null ? <span className="na">—</span> : eurK(r.amt)}
                    </td>
                    <td className="r crm"
                        title={r.amt == null ? "no CRM amount on this client's deals"
                          : r.amtn + " deal" + (r.amtn === 1 ? "" : "s") + " worth " + eur(r.amt) +
                            " against " + eur(r.costAll || 0) + " of cost" +
                            (r.amt_early ? " — " + r.amt_early + " of them closed before " +
                              (snap.min_year || "2025") + ", so part of their cost is outside this window" : "")}>
                      {r.marginPctAmt == null ? <span className="na">—</span> : (
                        <span className="mbar">
                          <span className={"num " + band(r.marginPctAmt)}>
                            {pct(r.marginPctAmt)}
                            {r.amt_early > 0 && <i className="part">*</i>}
                            {r.marginPctAmtIn != null && (
                              <i className="alt" title={"With the " +
                                Math.round(r.ihours).toLocaleString("en-GB") +
                                " hours of internal fix counted as client cost"}>
                                ({pct(r.marginPctAmtIn)})
                              </i>
                            )}
                          </span>
                          <span className="track">
                            <span className="fill fill-con"
                                  style={{ width: Math.min(100, Math.max(0, r.marginPctAmt * 100)) + "%" }} />
                          </span>
                        </span>
                      )}
                    </td>
                    {!viewer && (
                      <td className="r num">{r.cost == null ? <span className="na">—</span> : eur(r.cost)}</td>
                    )}
                    {!viewer && (
                      <td className="r num dim"
                          title={r.mgmtCost
                            ? Math.round(r.mgmtHours).toLocaleString("en-GB") +
                              " hours on this client's management projects (the ones whose name starts " +
                              "with \"_\"): work on the account that nobody invoices. It counts in the " +
                              "cost above because it is the cost of serving this client."
                            : "no management project on this client"}>
                        {r.mgmtCost
                          ? <>{eur(r.mgmtCost)}
                              {r.mgmtShare != null && <i className="alt"> ({pct(r.mgmtShare)})</i>}</>
                          : "—"}
                      </td>
                    )}
                    {viewer && (
                      <td className="r num">
                        {r.hours == null ? <span className="na">—</span>
                          : Math.round(r.hours).toLocaleString("en-GB")}
                      </td>
                    )}
                    <td className={"r num " + band(r.marginPct)}>
                      {r.margin == null ? <span className="na">—</span> : eur(r.margin)}
                    </td>
                    {year !== "all" && (
                      <td className={"r num dim " + band(r.marginPctAll)}>
                        {r.marginPctAll == null ? <span className="na">—</span> : pct(r.marginPctAll)}
                      </td>
                    )}
                    <td className="r num ifix"
                        title={r.ihours ? "Hours on " + (snap.internal_fix ? snap.internal_fix.tasklist : "the internal fix list") +
                          ", kept out of this client's cost" : "no internal fix hours on this client"}>
                      {r.ihours ? Math.round(r.ihours).toLocaleString("en-GB") : "—"}
                    </td>
                    {/* Quanto pesa il cliente per l'azienda: tutti i suoi deal
                        vinti in CRM, non il fatturato. Sono misure diverse e non
                        torneranno mai uguali — il titolo lo dice. */}
                    <td className="r num dim"
                        title={r.ltv == null ? "no Won deal in CRM maps to this client"
                          : r.ltvn + " Won deal" + (r.ltvn > 1 ? "s" : "") + " in CRM, all time"}>
                      {r.ltv == null ? <span className="na">—</span> : eurK(r.ltv)}
                    </td>
                    <td className="r num">{r.n}</td>
                    <td className="r num">{r.ob > 0 ? <b className="b">{eurK(r.ob)}</b> : "—"}</td>
                    <td className="r num">{r.pj.length || "—"}</td>
                  </tr>,
                  isOpen && (
                    <tr key={r.c + "-d"} className="detail">
                      {/* La riga di dettaglio deve coprire tutte le colonne, e
                          "of which management" ne aggiunge una, ma solo per chi
                          vede i costi: con la vista ridotta la colonna non c'è. */}
                      <td colSpan={(year === "all" ? 12 : 13) + (viewer ? 0 : 1)}>
                        <div className="det">
                          <div>
                            <h4>Client</h4>
                            <ul>
                              <li>
                                <span className="gl" title={GLOSS.rev}>
                                  Revenue {year === "all" ? "all time" : "in " + year}
                                </span>
                                <b className="num">{eurK(r.rev)}</b>
                              </li>
                              <li>
                                <span className="gl" title={GLOSS.share}>
                                  Share of the {year === "all" ? "period" : year}
                                </span>
                                <b className="num">{pct(wTot ? r.rev / wTot : 0)}</b>
                              </li>
                              {r.ihours > 0 && (
                                <li className="ifix">
                                  <span>Internal fix hours (not in the margin)</span>
                                  <b className="num">{Math.round(r.ihours).toLocaleString("en-GB")}</b>
                                </li>
                              )}
                              <li className="crm">
                                <span className="gl" title={GLOSS.amt}>Contract value (CRM amount)</span>
                                <b className="num">{r.amt == null ? "—" : eurK(r.amt)}</b>
                              </li>
                              <li className="crm">
                                <span className="gl" title={GLOSS.pctamt}>Margin on contract</span>
                                <b className={"num " + band(r.marginPctAmt)}>
                                  {r.marginAmt == null ? "—" : eurK(r.marginAmt)}
                                  {r.marginPctAmt == null ? "" : " · " + pct(r.marginPctAmt)}
                                </b>
                              </li>
                              <li title={r.ltvn + " Won deal" + (r.ltvn === 1 ? "" : "s") +
                                         " in CRM, all time — a different measure from invoiced revenue"}>
                                <span className="gl" title={GLOSS.ltv}>Lifetime value (CRM Won deals)</span>
                                <b className="num">{r.ltv == null ? "—" : eurK(r.ltv)}</b>
                              </li>
                            </ul>
                            <h4 style={{ marginTop: 14 }}>Revenue by year</h4>
                            {accrual && <div className="dhead"><span /><i>accrued</i><i>invoiced</i></div>}
                            <ul>
                              {[...new Set([
                                ...Object.keys(r.ra || {}),
                                ...Object.keys(r.ry || {}),
                              ])].sort().map((y) => (
                                <li key={y}>
                                  <span>{y}</span>
                                  {accrual && (
                                    <b className="num">{(r.ra && r.ra[y]) ? eurK(r.ra[y]) : "—"}</b>
                                  )}
                                  <b className="num dim">{r.ry[y] ? eurK(r.ry[y]) : "—"}</b>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="wide">
                            <h4>Deals</h4>
                            <ul className="deals">
                              {r.d.length === 0 && <li><span className="na">no deal linked</span></li>}
                              {r.d.map((d) => (
                                <li key={d.id || d.name} className={d.rev ? "rev" : ""}>
                                  <span className="dl">
                                    {d.id ? (
                                      <a href={CRM_DEAL(d.id)} target="_blank" rel="noopener noreferrer"
                                         title={"Open " + d.name + " in Zoho CRM"}
                                         onClick={(e) => e.stopPropagation()}>{d.name}</a>
                                    ) : <span title={d.name}>{d.name}</span>}
                                    <em className="tags">
                                      <i className={"tag " + (d.kind === "licence" ? "lic" : d.kind === "services" ? "svc" : "unk")}>
                                        {d.kind === "licence" ? "Licence"
                                          : d.kind === "services" ? "Prof. services" : "type not set"}
                                      </i>
                                      {d.kind === "licence" && d.mods && d.mods.length > 0 &&
                                        <i className="tag mod">{d.mods.join(" · ")}</i>}
                                      {d.owner && <i className="tag who">Owner {d.owner}</i>}
                                      {d.csm && <i className={"tag who" + (d.csm_off ? " off" : "")}>
                                        CSM {d.csm}{d.csm_off ? " (disabled)" : ""}</i>}
                                      {d.rev > 0 && <i className="tag warn">
                                        {d.rev} invoice{d.rev > 1 ? "s" : ""} reversed · {eurK(d.cn)} out</i>}
                                    </em>
                                  </span>
                                  <b className="num">
                                    {(() => {
                                      // Valore del deal e quanto pesa sul
                                      // cliente nel periodo che si sta
                                      // guardando: due numeri, una riga.
                                      const dv = year === "all" ? d.r : (d.ry ? d.ry[year] || 0 : 0);
                                      const sh = r.rev ? dv / r.rev : null;
                                      const label = eurK(dv) + (sh == null ? "" : " · " + pct(sh));
                                      const tip = "Deal revenue " +
                                        (year === "all" ? "over the whole period" : "accrued in " + year) +
                                        (sh == null ? "" : " — " + pct(sh) + " of " + r.c + " in the same period");
                                      return d.id ? (
                                        <a href={xlsx("deal", d.id)} className="xl" title={tip}
                                           onClick={(e) => grabLink(e, xlsx("deal", d.id), d.name || "this deal")}>{label}</a>
                                      ) : <span title={tip}>{label}</span>;
                                    })()}
                                  </b>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4>Billed through</h4>
                            <ul>
                              {r.ba.map((b) => <li key={b}><span title={b}>{b}</span></li>)}
                            </ul>
                          </div>
                          <div className="wide">
                            <h4>Costed projects ({r.pj.length})</h4>
                            <ul>
                              {r.pj.length === 0 && (
                                <li><span className="na">no project attributed</span></li>
                              )}
                              {snap.projects
                                .filter((p) => r.pj.includes(p.id))
                                .map((p) => {
                                  // Il progetto segue l'anno come il cliente:
                                  // ore e costo dell'anno contro il ricavo di
                                  // competenza dell'anno del deal che serve.
                                  const pc = year === "all" ? p.cost
                                    : costPerYear ? (p.cy && p.cy[year] ? p.cy[year].cost : 0) : null;
                                  const ph = year === "all" ? p.hours
                                    : costPerYear ? (p.cy && p.cy[year] ? p.cy[year].hours : 0) : null;
                                  const pr = year === "all" ? p.drev
                                    : (p.dry ? p.dry[year] || 0 : null);
                                  const pm = pc == null || pr == null ? null : pr - pc;
                                  const pmp = pm == null || !pr ? null : pm / pr;
                                  const pmpAll = p.cost == null || !p.drev || p.dshare !== 1 ? null
                                    : (p.drev - p.cost) / p.drev;
                                  // Ore di debug interno del progetto, e il
                                  // margine che si avrebbe contandole.
                                  const pih = year === "all" ? (p.ih || 0)
                                    : (p.cy && p.cy[year] ? p.cy[year].ih || 0 : 0);
                                  const pic = year === "all" ? (p.ic || 0)
                                    : (p.cy && p.cy[year] ? p.cy[year].ic || 0 : 0);
                                  const pmpIn = pmp == null || !pic || !pr ? null : (pr - pc - pic) / pr;
                                  // Quanto pesa il deal servito da questo
                                  // progetto sul cliente, nello stesso periodo.
                                  const psh = pr != null && r.rev ? pr / r.rev : null;
                                  return (
                                  <li key={p.id}
                                      className={p.link === "crmid" || p.link === "deal_name_field" ? "" : "link"}>
                                    <span className="dl">
                                      <a href={PROJECT(p.id)} target="_blank" rel="noopener noreferrer"
                                         title={"Open " + p.n + " in Zoho Projects"}
                                         onClick={(e) => e.stopPropagation()}>{p.n}</a>
                                      <em className="tags">
                                        {p.link === "crmid" && p.deal &&
                                          <i className="tag ok">linked to {p.deal.name}</i>}
                                        {p.link === "deal_name_field" && p.deal &&
                                          <i className="tag ok">Deal Name field — {p.deal.name}</i>}
                                        {p.link === "name_guess" && p.deal &&
                                          <i className="tag warn">Missing CRMid — guessed {p.deal.name}</i>}
                                        {p.link === "name_ambiguous" &&
                                          <i className="tag warn">Missing CRMid — several deals share this name</i>}
                                        {p.link === "crmid_unknown" &&
                                          <i className="tag warn">CRMid on the project matches no deal</i>}
                                        {p.link === "none" &&
                                          <i className="tag warn">Missing CRMid in Projects</i>}
                                        {p.k === "client_mgmt" && <i className="tag mod">management</i>}
                                        {p.arch && (
                                          <i className="tag" title="Archived in Zoho Projects. Its hours still count: the work was done.">
                                            archived
                                          </i>
                                        )}
                                        {/* Il valore del deal e il suo peso sul
                                            cliente: la riga dice da sola perché
                                            questo progetto conta. */}
                                        {pr != null && p.dshare === 1 && (
                                          <i className="tag"
                                             title={"Revenue of the deal this project delivers, " +
                                               (year === "all" ? "over the whole period" : "accrued in " + year) +
                                               (psh == null ? "" : " — " + pct(psh) + " of " + r.c)}>
                                            deal {eurK(pr)}{psh == null ? "" : " · " + pct(psh) + " of client"}
                                          </i>
                                        )}
                                        {pmp != null && p.dshare === 1 && (
                                          <i className={"tag m " + band(pmp)}>
                                            margin {eurK(pm)} · {pct(pmp)}
                                            {pmpIn != null && <em className="alt"> ({pct(pmpIn)})</em>}
                                            {year !== "all" ? " in " + year : ""}
                                          </i>
                                        )}
                                        {pmpAll != null && p.dshare === 1 && year !== "all" && (
                                          <i className={"tag m dim " + band(pmpAll)}>
                                            {pct(pmpAll)} all time
                                          </i>
                                        )}
                                        {p.drev != null && p.dshare > 1 && (
                                          <i className="tag warn" title={"This deal is delivered by " + p.dshare +
                                             " projects, so its revenue belongs to all of them together and " +
                                             "no margin can be attributed to this one alone"}>
                                            {p.dshare} projects share this deal — no margin
                                          </i>
                                        )}
                                        {ph != null && (
                                          <i className="tag">{Math.round(ph).toLocaleString("en-GB")} h</i>
                                        )}
                                        {pih > 0 && (
                                          <i className="tag ifix"
                                             title="Hours on the internal fix list, kept out of this project's cost">
                                            {Math.round(pih).toLocaleString("en-GB")} h internal fix
                                          </i>
                                        )}
                                      </em>
                                    </span>
                                    <b className="num">
                                      {(() => {
                                        // Il costo del progetto è l'unico numero
                                        // che resta dietro la password: chi non
                                        // l'ha vede le ore al suo posto.
                                        const v = viewer
                                          ? (ph == null ? null : Math.round(ph).toLocaleString("en-GB") + " h")
                                          : (pc == null ? null : eurK(pc));
                                        if (v == null) {
                                          return <span className="pill">
                                            {p.k === "client_mgmt" ? "management" : "delivery"}
                                          </span>;
                                        }
                                        return <a href={xlsx("project", p.id)} className="xl"
                                                  title="Download the detail workbook for this project"
                                                  onClick={(e) => grabLink(e, xlsx("project", p.id), p.n || "this project")}>{v}</a>;
                                      })()}
                                    </b>
                                  </li>
                                  );
                                })}
                            </ul>
                          </div>
                          {(() => {
                            // La legenda compare solo per le segnalazioni che
                            // questo cliente ha davvero: una legenda che spiega
                            // colori assenti è rumore.
                            const anyRev = r.d.some((d) => d.rev > 0);
                            const anyLink = snap.projects.some((p) => r.pj.includes(p.id) &&
                              p.link !== "crmid" && p.link !== "deal_name_field");
                            if (!anyRev && !anyLink) return null;
                            return (
                              <div className="legend">
                                {anyRev && (
                                  <span>
                                    <i className="sw-rev" />
                                    invoice reversed by a credit note — out of the revenue
                                  </span>
                                )}
                                {anyLink && (
                                  <span>
                                    <i className="sw-link" />
                                    link to the deal not from CRMid — costed, revenue uncertain
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
        </>
        )}

        {view === "internal" && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="k">Hours logged</div>
              <div className="v num">{Math.round(iTot.hours).toLocaleString("en-GB")}</div>
              <div className="s">
                {internalRows.length} projects · {year === "all" ? "2025 on" : year}
                {snap.sprints && snap.sprints.projects && snap.sprints.projects.length > 0 &&
                  " · incl. Zoho Sprints"}
              </div>
            </div>
            {!viewer && (
              <div className="kpi">
                <div className="k">Real team cost</div>
                <div className="v num">{eur(iTot.cost)}</div>
                <div className="s">
                  {iTot.hours ? "€" + (iTot.cost / iTot.hours).toFixed(0) + "/h blended" : "—"}
                </div>
              </div>
            )}
            <div className="kpi">
              <div className="k">No margin here</div>
              <div className="v num" style={{ fontSize: "17px", lineHeight: 1.35 }}>
                by design
              </div>
              <div className="s">nothing was sold against these hours</div>
            </div>
          </div>

          <p className="basis">
            <b>Internal work and pre-sales.</b> Projects with no client behind them: internal
            operations, development, admin, and the pre-sales effort spent before a deal exists.
            There is no revenue to put against these hours, so there is no margin — only what they
            cost. Archived projects are included: the hours were worked, and dropping them because
            the project has since been closed would break every year-on-year comparison.
          </p>

          <div className="controls">
            <input className="search" type="search" placeholder="Filter projects…"
                   value={iq} onChange={(e) => setIq(e.target.value)}
                   aria-label="Filter internal projects" />
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  {ith("name", "Project")}
                  {ith("kind", "Source")}
                  {ith("hours", year === "all" ? "Hours 2025 on" : "Hours " + year, true)}
                  {ith("hall", "Hours since start", true)}
                  {!viewer && ith("cost", "Real cost", true)}
                  {ith("ifix", "Internal fix h", true)}
                </tr>
              </thead>
              <tbody>
                {internalRows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="cli">
                        <a href={xlsx("project", p.id)} className="clidl"
                           title="Download who logged these hours and when"
                           onClick={(e) => grabLink(e, xlsx("project", p.id), p.n)}>{p.n}</a>
                      </div>
                      {p.s && <div className="via">{p.s}</div>}
                    </td>
                    <td>
                      <i className={"tag " + (p.src === "sprints" ? "lic" : p.k === "presale" ? "warn" : "mod")}>
                        {p.src === "sprints" ? "Sprints" : p.k === "presale" ? "pre-sales" : "Projects"}
                      </i>
                    </td>
                    <td className="r num">{Math.round(p.h).toLocaleString("en-GB")}</td>
                    <td className="r num dim"
                        title={p.hall ? "Every hour logged on this project since it started, outside this dashboard's window too"
                                      : "not read for this project"}>
                      {p.hall ? Math.round(p.hall).toLocaleString("en-GB") : "—"}
                    </td>
                    {!viewer && (
                      <td className="r num"
                          title={p.cst == null
                            ? "Zoho Sprints carries no hourly cost, and some of the people logging there are not on the payroll. A cost here would be invented."
                            : undefined}>
                        {p.cst == null ? <span className="na">—</span> : eur(p.cst)}
                      </td>
                    )}
                    <td className="r num ifix">
                      {p.ifix ? Math.round(p.ifix).toLocaleString("en-GB") : "—"}
                    </td>
                  </tr>
                ))}
                {!internalRows.length && (
                  <tr>
                    <td colSpan={viewer ? 5 : 6} className="na">
                      No internal project has hours in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="tablenote">
            Click a project name to download who logged the hours and when. The file carries no
            margin and no revenue, because neither exists here.
          </p>
          {snap.sprints && snap.sprints.projects && snap.sprints.projects.length > 0 && (
            <p className="tablenote">
              <b>Zoho Sprints is counted here and nowhere else.</b> Development logs its time in
              Sprints, and Zoho&apos;s bridge to Projects is all but switched off on this portal, so
              those hours reach neither Zoho Projects nor Zoho People. They are product development
              rather than work sold to a client, so they stay out of every client margin — but they
              are real hours, and the people who logged them show far fewer hours anywhere else.
              Sprints records no hourly cost, so these rows carry hours only.
            </p>
          )}
        </>
        )}

        {view === "clients" && rows.some((r) => r.amt_early > 0) && (
          <p className="tablenote">
            <i className="part">*</i> Part of this client&apos;s delivery cost falls before{" "}
            {snap.min_year || "2025"}, where this dashboard does not count hours: some of their deals
            were won earlier. The margin on contract therefore reads better than it was.
          </p>
        )}

        <footer className="note">
          <p>
            <b>Revenue</b> is invoiced in Zoho Books, net of VAT and of credit notes.{" "}
            <b>Cost</b> is each person&apos;s real hourly cost from the payroll, in the month the
            hour was logged. <b>Margin</b> is one less the other, before server and infrastructure
            costs — which Zoho does not record, so the real profitability of every client sits below
            what is shown here. The rules behind each figure, and the cases where they bend, are
            under <b>How to read this</b> at the top.
            {snap.revenue && snap.revenue.basis === "gross" && (
              <b className="err">
                {" "}Analytics could not be reached, so revenue on this run is the invoice total
                including VAT and does not exclude credit notes.{" "}
              </b>
            )}
          </p>
          {!viewer && snap.rate_suspect && snap.rate_suspect.length > 0 && (
            <p style={{ marginTop: 10 }}>
              <b className="err">Hourly costs that look too low to be a full cost</b>: the payroll
              gives{" "}
              {snap.rate_suspect.map((r, i) => (
                <span key={r.id + r.year}>
                  {i > 0 ? ", " : ""}<b>{r.name}</b> €{r.rate.toFixed(2)}/h at {r.month}
                  {r.monthly ? " (about €" + Math.round(r.monthly).toLocaleString("en-GB") + " a month)" : ""}
                </span>
              ))}
              — that is their most recent month on the payroll. A figure like that is a placement or
              an internship allowance, or a payroll line holding only part of the cost. Either way
              their hours are costed below what they really cost, and every margin they touch is
              flattered by the difference.
            </p>
          )}
          {snap.unmatched && snap.unmatched.length > 0 && (
            <p style={{ marginTop: 10 }}>
              Client projects not attributed ({snap.unmatched.length}): {snap.unmatched.join(" · ")}
            </p>
          )}
        </footer>
      </div>
    </>
  );
}

/**
 * Dentro il Web Tab del CRM la dashboard è un iframe, e qualche browser rifiuta
 * comunque di ricordare lo sblocco. Aprirla in una scheda sua toglie di mezzo
 * il problema: compare solo quando serve, cioè solo dentro un iframe.
 */
function NewTabLink() {
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    try { setFramed(window.self !== window.top); } catch (e) { setFramed(true); }
  }, []);
  if (!framed) return null;
  return (
    <a className="xb-link" href={typeof window === "undefined" ? "#" : window.location.href}
       target="_blank" rel="noopener noreferrer">
      Does not stay unlocked here? Open in its own tab
    </a>
  );
}

/**
 * Sblocco dei costi interni.
 *
 * Di suo la pagina mostra margini, costi per progetto e ore; i nomi delle
 * persone e quanto costa ciascuna stanno dietro una password. Il permesso vive
 * in un cookie che dura otto ore: la giornata di lavoro, non di più.
 *
 * Il dialogo si apre sia dal pulsante in alto sia cliccando uno scarico
 * bloccato: chiedere la password dove serve è meno faticoso che mandare
 * qualcuno a cercarla da un'altra parte.
 */
function UnlockDialog({ onClose, reason }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/unlock", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "could not unlock");
      // reload() può ripescare la pagina dalla cache del browser, cookie nuovo
      // o no: un indirizzo leggermente diverso costringe a rifare la richiesta.
      const u = new URL(window.location.href);
      u.searchParams.set("u", String(Date.now()));
      window.location.replace(u.toString());
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-label="Unlock internal costs"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h3>Unlock internal costs</h3>
        <p>
          {reason ||
            "Hourly costs and what the team costs are not part of the standard view."}{" "}
          Enter the password to see them on this browser for the next eight hours.
        </p>
        <input type="password" value={pw} autoFocus placeholder="Password"
               aria-label="Password for internal costs"
               onChange={(e) => setPw(e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === "Enter" && pw) send();
                 if (e.key === "Escape") onClose();
               }} />
        {err && <div className="modal-err">{err}</div>}
        <div className="modal-row">
          <button className="xb" disabled={busy || !pw} onClick={send}>
            {busy ? "Checking…" : "Unlock"}
          </button>
          <button className="xb ghost" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/**
 * La barra degli scarichi: la vista corrente, i fogli di dettaglio, e le due
 * liste di cose da sistemare. Un file per deal e uno per progetto, perché i due
 * tagli non coincidono: deal e progetto non stanno sempre uno a uno.
 */
/**
 * La barra dei menù.
 *
 * Prima era una fila di otto pulsanti, e cresceva a ogni aggiunta: un export
 * nuovo o una lista da correggere finivano accanto a quelli vecchi finché la
 * riga non si leggeva più. Tre tendine — cosa porto via, cosa c'è da sistemare,
 * come si leggono i numeri — tengono la stessa roba in un terzo dello spazio e
 * dicono a che categoria appartiene ogni voce.
 */
function MenuBar({ token, missing, gaps, view, viewer, canUnlock, snap, dl }) {
  const { msg, tick } = dl;
  const [open, setOpen] = useState(null);
  const [ask, setAsk] = useState(null);
  const [help, setHelp] = useState(null);

  // Una tendina aperta si chiude con Esc e cliccando fuori: darle solo il clic
  // sul titolo la lascia aperta addosso ai dati mentre si prova a leggerli.
  useEffect(() => {
    if (open === null) return undefined;
    const away = (e) => { if (!e.target.closest(".mb-item")) setOpen(null); };
    const esc = (e) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("click", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const url = (scope, extra) =>
    `/api/xlsx?type=${scope}` + (extra || "") + (token ? "&k=" + encodeURIComponent(token) : "");

  // Le voci del menu passano dallo stesso posto dei link nella tabella.
  const grab = (scope, extra, label) => {
    setOpen(null);
    dl.start(url(scope, extra), label);
  };

  // Una voce bloccata non sparisce e non porta a una pagina di errore: chiede
  // la password lì dove sei.
  const locked = (scope, why, extra, label) => {
    setOpen(null);
    if (viewer && canUnlock) { setAsk(why); return; }
    grab(scope, extra, label);
  };

  const lock = async () => {
    await fetch("/api/unlock", { method: "DELETE" }).catch(() => {});
    window.location.reload();
  };

  const menu = (id, label, children, badge) => (
    <div className={"mb-item" + (open === id ? " on" : "")}>
      <button className="mb-top" aria-expanded={open === id} aria-haspopup="true"
              onClick={(e) => { e.stopPropagation(); setOpen(open === id ? null : id); }}>
        {label}
        {badge != null && <i className="mb-badge">{badge}</i>}
        <span className="mb-caret" aria-hidden="true">▾</span>
      </button>
      {open === id && <div className="mb-drop" role="menu">{children}</div>}
    </div>
  );

  const item = (label, onClick, opts) => {
    const o = opts || {};
    return (
      <button className={"mb-opt" + (o.warn ? " warn" : "") + (o.lock ? " locked" : "")}
              role="menuitem" onClick={onClick}>
        <span className="mb-l">{label}{o.lock && <i className="lk" aria-hidden="true">🔒</i>}</span>
        {o.hint && <span className="mb-h">{o.hint}</span>}
      </button>
    );
  };

  const fixes = (missing > 0 ? 1 : 0) + (gaps && gaps.hours > 0 ? 1 : 0);

  return (
    <div className="exportbar">
      {canUnlock && (viewer ? (
        <div className="lockbar">
          <span>
            <b>Summary view.</b> Revenue, margin and lifetime value are all here. What is not here
            is the cost of the team: who logged the hours and what each person costs.
          </span>
          <button className="xb" onClick={() => setAsk("")}>Unlock internal costs</button>
          <NewTabLink />
        </div>
      ) : (
        <div className="lockbar open">
          <span>Internal costs are unlocked on this browser for the next few hours.</span>
          <button className="xb ghost" onClick={lock}>Lock again</button>
        </div>
      ))}

      <div className="mb">
        {menu("export", "Export to Excel", (
          <>
            {item("This view", () => grab("dashboard",
              "&year=" + encodeURIComponent(view.year) +
              (view.q ? "&q=" + encodeURIComponent(view.q) : "") +
              (view.noExecus ? "&execus=0" : ""), "this view"),
              { hint: "the table as you have it now, plus a sheet by year" })}
            <div className="mb-sep">One workbook each</div>
            {item("Every deal", () => grab("deals", null, "one workbook per deal"), { hint: "zip · the whole deal, invoices included" })}
            {item("Every project", () => grab("projects", null, "one workbook per project"), { hint: "zip · that project alone" })}
            {item("Every client", () => grab("clients", null, "one workbook per client"), { hint: "zip · every costed project behind the margin" })}
            {viewer && (
              <div className="mb-note">
                These carry the same figures as the screen, hours person by person included.
                What is not in them is the money behind those hours: hourly costs and the
                cost of the team.
              </div>
            )}
          </>
        ))}

        {menu("fix", "Data to fix", (
          <>
            {missing > 0
              ? item("Projects with no CRMid (" + missing + ")", () => grab("missing", null, "the projects with no CRMid"),
                  { warn: true, hint: "the link to the deal is missing — fill CRMid in Zoho Projects" })
              : <div className="mb-note ok">Every project carries a CRMid. Nothing to fix here.</div>}
            {gaps && gaps.hours > 0
              ? item("Hours with no hourly cost (" +
                     Math.round(gaps.hours).toLocaleString("en-GB") + " h)",
                  () => locked("rates", "The list of hours with no hourly cost names every person concerned.",
                       null, "the hours with no hourly cost"),
                  { warn: true, lock: viewer, hint: "those hours cost nothing here, so the margin is flattered" })
              : <div className="mb-note ok">Every logged hour has an hourly cost.</div>}
            <div className="mb-sep">Zoho Projects</div>
            {item("Rate plan 2026 (preview)",
              () => locked("rateplan",
                "The rate plan lists every person and the hourly cost to write for them.", "&year=2026",
                "the 2026 rate plan"),
              { lock: viewer, hint: "what we would write on each user, before writing it" })}
          </>
        ), fixes || null)}

        {menu("help", "How to read this", (
          <>
            {HELP.map((h) => item(h.t, () => { setOpen(null); setHelp(h.k); }, { hint: h.s }))}
          </>
        ))}

        {msg && (
          <span className={"mb-work " + msg.state} data-tick={tick}
                role="status" aria-live="polite">
            {msg.state === "done"
              ? <><i className="tick" aria-hidden="true">✓</i> Downloaded {msg.name}</>
              : <><i className="spin" aria-hidden="true" /> Preparing {msg.what}…{" "}
                  <b className="el">{mmss(Date.now() - msg.at)}</b></>}
          </span>
        )}

        <span className="mb-spacer" />
        <span className="mb-stamp">
          {snap.source === "live" ? "Zoho live" : "snapshot"} · {fmtStamp(snap.generated_at)}
        </span>
      </div>

      {/* Il riquadro è a posizione fissa, non in colonna sotto i menu: dentro il
          Web Tab del CRM la pagina sta in un iframe e un avviso in mezzo al
          flusso può finire fuori dalla parte visibile senza che nessuno lo veda
          mai. Così sta sempre in basso a destra, sopra tutto il resto. */}
      {msg && (
        <div className={"xb-toast " + msg.state} role="status" aria-live="polite">
          {msg.state === "done"
            ? <i className="tick" aria-hidden="true">✓</i>
            : <i className="spin" aria-hidden="true" />}
          <span>
            {msg.state === "working" && (
              <><b>Preparing {msg.what}… {mmss(Date.now() - msg.at)}</b> It is built on the server —
                a full zip takes a minute or two. If it goes past {Math.round(WAIT_MAX / 1000)}s the
                browser takes over and finishes it by itself.</>
            )}
            {msg.state === "done" && (
              <><b>Downloaded {msg.name}</b> — {fmtSize(msg.size)}. Look in your Downloads folder.</>
            )}
            {msg.state === "fallback" && (
              <><b>Preparing {msg.what}…</b> The browser is taking it directly ({msg.why}), so this
                message cannot tell you when it lands — check your Downloads folder in a minute.</>
            )}
          </span>
          <button className="xb-x" onClick={dl.dismiss}
                  aria-label="Hide this message">×</button>
        </div>
      )}
      {ask !== null && <UnlockDialog reason={ask} onClose={() => setAsk(null)} />}
      {help && <HelpDialog topic={help} snap={snap} onClose={() => setHelp(null)} />}
    </div>
  );
}

function fmtSize(n) {
  if (!n && n !== 0) return "";
  return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
}

function fmtDate(s) {
  if (!s) return "—";
  const [y, m, d] = String(s).split("-");
  return `${d}/${m}/${y}`;
}
function fmtStamp(s) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
