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
  since: "The year of this client's first deal won in the CRM — not of the first invoice. A " +
         "contract signed in December and invoiced in January starts the relationship in December.",
  dealmg: "The CRM Amount of this deal against every hour ever logged on the projects that " +
          "deliver it, whatever year they fall in. It does not follow the year selector: a " +
          "contract is not a calendar year, and comparing the full amount with one year of " +
          "hours would flatter anything that started earlier. While delivery is still running " +
          "the cost is not final, so it is marked “so far”.",
};

/**
 * Un'etichetta con la sua spiegazione dietro un cerchietto.
 *
 * Il sottolineato punteggiato da solo non bastava: chi non lo conosce non sa
 * che c'è qualcosa da leggere, e su uno schermo pieno di numeri nessuno va a
 * caccia di testo nascosto. La "i" si vede, e dice che una spiegazione esiste.
 */
function Gl({ t, children }) {
  const [on, setOn] = useState(false);
  return (
    <span className="cpl gll">
      {children}
      {/* Dentro il Web Tab del CRM la pagina sta in un iframe e il tooltip del
          browser non compariva: la "i" si vedeva e non faceva niente, che è
          peggio di non averla. Ora apre una bolla al clic — che funziona anche
          su un touch, dove un tooltip non esiste proprio. */}
      <button type="button" className="ib" title={t} aria-expanded={on}
              onClick={(e) => { e.stopPropagation(); setOn((v) => !v); }}>
        i
      </button>
      {on && (
        <span className="ibp" role="tooltip" onClick={(e) => e.stopPropagation()}>
          {t}
          <button type="button" className="ibx" onClick={() => setOn(false)}>Close</button>
        </span>
      )}
    </span>
  );
}

const BUILD = "project-cost: più progetti, chiave condivisa · 28/09/2026";
const VERSION = "0.7.7";

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
  { k: "panel", t: "The panel under a client", s: "deals, the projects that deliver them, management" },
  { k: "margins", t: "The three margins", s: "year, all time, and against the contract" },
  { k: "sources", t: "Where the hours come from", s: "Projects, People and Sprints, and why they differ" },
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
    panel: (
      <>
        <p>
          Opening a client shows its <b>deals</b>, and under each one the <b>projects that deliver
          it</b>. That nesting is the answer to the question people actually ask — who is doing the
          work behind this contract — and it is the reason the panel is not a flat list.
        </p>
        <p>
          The link between the two is the <code>CRMid</code> field on the project. Where it is
          filled the project carries a green <b>CRMid</b> badge; where it is empty and a deal of the
          same name was found, an amber <b>deduced</b> badge says so, and anything resting on that
          link is a guess. <b>CRMid · deal not read</b> means the link is certain but that deal was
          not in the list the CRM returned on this run, so its type, owner and dates are missing.
        </p>
        <p>
          <b>Margin on contract</b>, on a deal, is its CRM Amount against every hour ever logged on
          its projects — not against the year selected at the top. A contract does not follow the
          calendar, and holding the full amount against a single year of hours would flatter
          anything that started earlier. While the delivery is still open the cost is not final, so
          it reads <i>so far</i>.
        </p>
        <p>
          <b>Account management</b>, in amber, gathers the projects whose name starts with{" "}
          <code>_</code>: work on the account that nobody invoices. It has no deal and no revenue,
          and it counts in the client&apos;s cost because it is part of serving them. Where it is
          large, a weak margin is a sign of how much was given away rather than of how badly the
          work was sold.
        </p>
        <p>
          <b>Deals with no project</b> at the bottom is normal for licences and one-off items:
          there is nothing to deliver, so no project is expected. A project with hours but no deal
          is the opposite case, and it is worth fixing — it is costed and earns nothing.
        </p>
        <p className="hd-note">
          Projects with no hours in the selected period are left out: on a client of ten years
          standing they would otherwise fill the panel with work that finished long ago. Widen the
          year to <b>All</b> to see them.
        </p>
      </>
    ),
    sources: (
      <>
        <p>
          Hours reach this page from three systems that do not agree with one another, and the
          difference is not a fault in any of them.
        </p>
        <p>
          <b>Zoho Projects</b> is the main one and the only one carrying an hourly cost on each log.
        </p>
        <p>
          <b>Zoho People</b> holds time approved there and pushed across to Projects once a week.
          The push is refused whenever the destination task does not exist, is closed, was moved, or
          has nobody assigned to it — silently. Those hours stay in People, and they are counted
          here. This is why any report run inside Zoho Projects shows the same hours or fewer, never
          more. In the workbooks they are a column of their own beside the Projects hours, and the
          total adds the two.
        </p>
        <p>
          <b>Zoho Sprints</b> is where development logs its time. Zoho&apos;s bridge to Projects is
          all but switched off on this portal, so almost none of it arrives anywhere else. It is
          product development rather than work sold to a client, so it stays out of every client
          margin and has a tab of its own. Sprints records no hourly cost, so those rows carry hours
          and no money.
        </p>
        <p className="hd-note">
          Archived projects are included throughout. Zoho Projects drops them from its own lists,
          but Zoho People remembers them, so the list of projects is the union of the two. The work
          was done; dropping it because the project has since been closed would break every
          comparison between one year and the next.
        </p>
      </>
    ),
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
        <p>
          One case used to read as two errors at once. Where an invoice carries no deal id, the deal
          is known to this page by its name alone, and the project — linked by CRMid — was not
          recognised as the same thing: the deal appeared with its project, and again below among
          the deals with no project. Both keys are now tried, so it appears once.
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
  // Lo stesso indirizzo con "refresh=1": salta ogni cache e rilegge da Zoho.
  const rehref = "?" + new URLSearchParams(
    Object.entries({ k: token || undefined, refresh: "1" }).filter(([, v]) => v)
  ).toString();

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

  /**
   * Si apre sull'anno in corso, non su "All".
   *
   * "All" è la somma di tutta la finestra: utile per giudicare un rapporto, ma
   * non è la domanda che uno si fa aprendo la pagina — che è come sta andando
   * adesso. Aprire sul totale storico significa che chi guarda deve ricordarsi
   * ogni volta di stringere il periodo, e chi non se lo ricorda legge un numero
   * che non voleva.
   */
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  useEffect(() => {
    // L'anno in corso può non esistere ancora nei dati (gennaio senza fatture,
    // o una finestra che finisce prima): in quel caso si ripiega sull'ultimo.
    if (year === "all" || years.includes(year)) return;
    setYear(years.length ? years[years.length - 1] : "all");
  }, [years]); // eslint-disable-line react-hooks/exhaustive-deps
  const [noExecus, setNoExecus] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "rev", dir: "desc" });
  // Quale delle due viste è a schermo. I progetti interni non hanno un margine
  // e non possono stare nella stessa tabella dei clienti: mettere una riga senza
  // ricavo accanto a righe che ne hanno uno inviterebbe a leggere una perdita
  // dove c'è solo costo previsto.
  const [view, setView] = useState("clients");
  // Il pannello delle note su People: chiuso finché non lo si chiede.
  const [notes, setNotes] = useState(false);
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
      e.cost += cost || 0; e.hours += hours || 0;
      // Si contano solo quelli che nel periodo hanno lavorato: il pannello
      // sotto nasconde gli altri, e un conteggio che non torna con l'elenco
      // che porta con sé è un invito a cercare un progetto che non c'è.
      if ((hours || 0) > 0 || (cost || 0) > 0) e.n += 1;
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
      // I "_" senza cliente sono interni a tutti gli effetti.
      // `_Digital Operations`, `_Sales`, `_Marketing`: la regola li classifica
      // come gestione cliente perché iniziano per underscore, ma nessun nome di
      // cliente ci somiglia, quindi non entrano nel margine di nessuno e
      // finivano fuori da entrambe le viste — ore lavorate che la pagina non
      // mostrava da nessuna parte. Quelli agganciati a un cliente restano dove
      // sono, dentro il pannello di quel cliente.
      .filter((p) => p.k === "internal" || p.k === "presale" ||
                     (p.k === "client_mgmt" && !p.c))
      .map((p) => {
        const cy = p.cy && p.cy[year];
        const hours = year === "all" ? (p.hours || 0) : (cy ? cy.hours || 0 : 0);
        const cost = year === "all" ? (p.cost || 0) : (cy ? cy.cost || 0 : 0);
        const ih = year === "all" ? (p.ih || 0) : (cy ? cy.ih || 0 : 0);
        return { ...p, h: hours, cst: cost, ifix: ih, src: "projects" };
      })
      .filter((p) => p.h > 0 || p.ifix > 0);

    out = out.filter((p) => !query || (p.n || "").toLowerCase().includes(query));

    const val = (r) =>
      isort.key === "name" ? (r.n || "").toLowerCase()
      : isort.key === "kind" ? r.k
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

  /**
   * Quanti progetti interni il filtro anno sta tenendo fuori.
   *
   * La tabella mostra solo chi ha lavorato nel periodo scelto, il che è giusto,
   * ma da quando la pagina si apre sull'anno in corso un progetto chiuso l'anno
   * prima sparisce senza dire niente — e chi lo cerca conclude che l'app non lo
   * vede, invece che non lo sta mostrando.
   */
  const iHidden = useMemo(() => {
    if (year === "all") return 0;
    const shown = new Set(internalRows.map((r) => r.id));
    return (snap.projects || []).filter((p) =>
      (p.k === "internal" || p.k === "presale" || (p.k === "client_mgmt" && !p.c)) &&
      !shown.has(p.id) && ((p.hours || 0) > 0 || (p.ih || 0) > 0)).length;
  }, [snap, year, internalRows]);

  const iTot = useMemo(() => ({
    hours: internalRows.reduce((s2, r) => s2 + r.h, 0),
    cost: internalRows.reduce((s2, r) => s2 + (r.cst || 0), 0),
    ifix: internalRows.reduce((s2, r) => s2 + r.ifix, 0),
  }), [internalRows]);

  /**
   * Zoho Sprints, che è una fonte a sé e merita una scheda sua.
   *
   * Stava mescolata ai progetti interni con un'etichetta accanto, e mescolata
   * era illeggibile: due sistemi con regole diverse — Sprints non registra una
   * tariffa oraria e metà di chi ci lavora non è a libro paga — sommati in una
   * colonna sola fanno un totale che non vuol dire niente. Separati, ognuno
   * dice quello che sa dire.
   */
  const sprintRows = useMemo(() => {
    const sp = (snap.sprints && snap.sprints.projects) || [];
    const query = iq.trim().toLowerCase();
    return sp
      .filter((r) => (r.hours || r.lifetime) &&
                     (!query || (r.name || "").toLowerCase().includes(query)))
      .map((r) => ({ ...r, h: r.hours || 0 }))
      .sort((a, b) => b.h - a.h || b.lifetime - a.lifetime);
  }, [snap, iq]);

  const sTot = useMemo(() => ({
    hours: sprintRows.reduce((s2, r) => s2 + r.h, 0),
    lifetime: sprintRows.reduce((s2, r) => s2 + (r.lifetime || 0), 0),
    bridged: sprintRows.reduce((s2, r) => s2 + (r.alreadyInProjects || 0), 0),
  }), [sprintRows]);

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
          mgmtN: (mgmtByClient[c.c] || {}).n || 0,
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
              Le ore non vengono più da una sola fonte, e va detto — ma non
              gridato. La prima versione era un riquadro fisso di quattro righe
              in cima alla pagina: una premessa che si legge una volta e poi
              ingombra per sempre. Ora è una riga sola accanto alla versione, e
              il testo sta in un pannello che si apre solo a chi lo chiede.
            */}
            {snap.people_union && (snap.people_union.hours > 0 || snap.people_union.error) && (
              <div className="pnote">
                <button type="button" className="pnote-i"
                        aria-expanded={notes}
                        aria-controls="people-notes"
                        onClick={() => setNotes((v) => !v)}>
                  <span aria-hidden="true">i</span>
                  <span className="pnote-lbl">Notes on Zoho People logged hours</span>
                </button>
                {notes && (
                  <div className="pnote-pop" id="people-notes" role="region"
                       aria-label="Notes on Zoho People logged hours">
                    {snap.people_union.error && (
                      <p className="err">
                        Zoho People could not be read on this refresh, so these hours are missing
                        from every figure on the page. Zoho said: {snap.people_union.error}
                      </p>
                    )}
                    {snap.people_union.stale && (
                      <p className="err">
                        Zoho People did not answer in time on this refresh, so these hours are the
                        ones read at{" "}
                        {new Date(snap.people_union.stale).toLocaleString("en-GB")}. They are still
                        counted in every figure on the page — the work was done either way, and the
                        total moves very little from one hour to the next. Zoho said:{" "}
                        {snap.people_union.stale_reason}
                      </p>
                    )}
                    <p>
                      <b>{fmtH(snap.people_union.hours)} hours</b> were logged in Zoho People and
                      never reached Zoho Projects. Zoho People pushes approved time logs across once
                      a week, and the push is refused whenever the destination task does not exist,
                      is closed, was moved, or has nobody assigned to it. Those hours are counted
                      here.
                    </p>
                    <p>
                      Any report you run inside Zoho Projects will therefore show the same hours or
                      fewer, never more. That is expected, not an error in either system.
                    </p>
                    <p>
                      Archived projects are included as well: the work was done, and dropping it
                      because the project has since been closed would break every comparison between
                      one year and the next.
                    </p>
                    {snap.people_union.unrated > 0 && (
                      <p>
                        {fmtH(snap.people_union.unrated)} of those hours have no hourly cost on
                        record — neither a payslip nor a rate in Zoho Projects — so they count as
                        hours and cost nothing.
                      </p>
                    )}
                    <button type="button" className="pnote-x" onClick={() => setNotes(false)}>
                      Close
                    </button>
                  </div>
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
              <span className={"badge " + (snap.source === "live" ? "live" : "seed")}
                    title={snap.from_store
                      ? "Served from the saved snapshot built at " +
                        new Date(snap.from_store).toLocaleString("en-GB") +
                        ". Zoho was not queried for this page load."
                      : "Built from Zoho on this page load."}>
                {snap.source === "live" ? "Zoho live" : "snapshot"}
              </span>
              {/* Chi guarda deve poter sapere da dove arriva quello che legge.
                  Prima la riga compariva solo quando la pagina era servita dallo
                  snapshot salvato: così "salvataggio non configurato", "appena
                  costruito" e "configurato male" si presentavano tutti e tre
                  come niente — nessuna riga, nessun errore, niente da capire. */}
              <a className="refnow" href={rehref}
                 title={(snap.from_store
                   ? "Served from the snapshot saved at " +
                     new Date(snap.from_store).toLocaleString("en-GB") + ", without asking Zoho."
                   : snap.store && snap.store.ready
                   ? "Built from Zoho on this page load, and saved for the next one."
                   : "Built from Zoho on this page load. No snapshot store is configured, so every " +
                     "open rebuilds everything.") +
                   " Click to read everything from Zoho again — it takes a minute or two." +
                   (snap.store && snap.store.write && snap.store.write.ok === false
                     ? " The last save failed: " + snap.store.write.error : "")}>
                {snap.from_store
                  ? "saved " + new Date(snap.from_store).toLocaleTimeString("en-GB",
                      { hour: "2-digit", minute: "2-digit" }) + " · refresh"
                  : snap.store && snap.store.ready
                  ? (snap.store.write && snap.store.write.ok === false ? "not saved · refresh" : "built now · refresh")
                  : "not saved · refresh"}
              </a>
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
                  {/* Ricaricare deve rileggere davvero. Il pulsante chiamava
                      window.location.reload(), che l'iframe del Web Tab serve
                      volentieri dalla propria cache: stessa pagina, stesso
                      avviso, e l'impressione che non facesse niente. Con un
                      parametro nuovo nell'indirizzo la richiesta è nuova. */}
                  <button className="xb" onClick={() => {
                    try {
                      const u = new URL(window.location.href);
                      // Non basta ricaricare: senza questo la richiesta può
                      // tornare dalla cache dell'iframe, e soprattutto il
                      // server riservirebbe lo stesso snapshot incompleto.
                      u.searchParams.set("refresh", "1");
                      u.searchParams.set("r", String(Date.now()));
                      window.location.replace(u.toString());
                    } catch (e) { window.location.reload(); }
                  }}>
                    Read from Zoho again
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


        {/* Le fonti secondarie che non ce l'hanno fatta hanno un avviso loro.
            Stavano dentro il riquadro dei costi, che compare solo quando i costi
            mancano: se i costi arrivavano e Sprints no, la scheda spariva dalla
            pagina e la spiegazione non compariva da nessuna parte. */}
        {!warning && snap.side_errors &&
          ["lifetime", "sprints", "archived"].some((k) => snap.side_errors[k]) && (
          <div className="notice">
            <div>
              <strong>Some secondary figures were left out of this refresh</strong>
              <p>
                Zoho Analytics serves its queries through a queue, and the ones the margin needs go
                first. When the time runs out before the rest, these are what stays behind:{" "}
                <b>
                  {["lifetime", "sprints", "archived"].filter((k) => snap.side_errors[k])
                    .map((k) => k === "lifetime" ? "hours since start"
                      : k === "sprints" ? "the Zoho Sprints tab"
                      : "archived projects").join(", ")}
                </b>
                . Revenue, cost and every margin on this page are unaffected.
                {snap.side_errors.sprints_from && (
                  <> The Sprints tab is showing the figures saved at{" "}
                    {new Date(snap.side_errors.sprints_from).toLocaleString("en-GB")}.</>
                )}
              </p>
              <p>
                <button className="xb" onClick={() => {
                  try {
                    const u = new URL(window.location.href);
                    u.searchParams.set("refresh", "1");
                    u.searchParams.set("r", String(Date.now()));
                    window.location.replace(u.toString());
                  } catch (e) { window.location.reload(); }
                }}>
                  Read from Zoho again
                </button>
              </p>
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
          {snap.sprints && snap.sprints.projects && snap.sprints.projects.length > 0 && (
            <button aria-pressed={view === "sprints"} onClick={() => setView("sprints")}>
              Zoho Sprints
            </button>
          )}
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
                        {(() => {
                          /**
                           * Il pannello del cliente.
                           *
                           * Prima erano tre colonne di voci affiancate: contesto,
                           * deal e progetti tutti allo stesso livello, senza dire
                           * quale progetto consegnasse quale deal. La domanda che
                           * la gente fa aprendo una riga è proprio quella, e
                           * l'unico modo di risponderla senza frecce disegnate è
                           * annidare: ogni deal con sotto i suoi progetti.
                           */
                          const pjs = (snap.projects || []).filter((x) => r.pj.includes(x.id));
                          const H = (x) => (year === "all" ? (x.hours || 0)
                            : (x.cy && x.cy[year] ? x.cy[year].hours || 0 : 0));
                          const K = (x) => (year === "all" ? (x.cost || 0)
                            : (x.cy && x.cy[year] ? x.cy[year].cost || 0 : 0));

                          /**
                           * I progetti senza ore nel periodo non si mostrano.
                           *
                           * Aprendo Fendi sul 2026 comparivano progetti del 2022
                           * chiusi da anni, sotto "senza deal": zero ore, zero
                           * costo, e la domanda ovvia — perché me li fai vedere.
                           * Un progetto che nel periodo scelto non ha lavorato
                           * non ha niente da dire qui. Il deal a cui è agganciato
                           * resta comunque a schermo: è la sua intestazione a
                           * portare l'importo, non la riga del progetto.
                           */
                          const alive = (x) => H(x) > 0 || K(x) > 0;

                          const mgmt = pjs.filter((x) => x.k === "client_mgmt" && alive(x));
                          const deliv = pjs.filter((x) => x.k !== "client_mgmt");

                          /**
                           * Lo stesso deal, due volte nella stessa schermata.
                           *
                           * I deal dei progetti sono agganciati per id; i deal
                           * delle fatture sono in elenco per id **quando la
                           * fattura lo porta**, e per nome quando non lo porta.
                           * Le due chiavi non si riconoscevano, così un deal con
                           * il suo progetto sopra ricompariva sotto fra quelli
                           * "senza progetto". Il nome normalizzato è il secondo
                           * ponte, e chiude il caso.
                           */
                          const nrm = (v) => String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
                          const dById = new Map(), dByName = new Map();
                          for (const d of r.d || []) {
                            if (d.id) dById.set(String(d.id), d);
                            if (d.name) dByName.set(nrm(d.name), d);
                          }

                          const byDeal = new Map();
                          for (const x of deliv) {
                            const k = x.dealId || "__none";
                            if (!byDeal.has(k)) byDeal.set(k, { id: x.dealId, deal: x.deal, ps: [] });
                            byDeal.get(k).ps.push(x);
                          }
                          const noDeal = byDeal.get("__none");
                          byDeal.delete("__none");

                          // Ogni gruppo prende la scheda del deal dalle fatture:
                          // per id, o per nome quando la fattura l'id non ce
                          // l'ha. È da lì che vengono tipo, moduli, owner, CSM e
                          // periodo di licenza — e anche il nome, quando il deal
                          // non è nella lista letta dal CRM.
                          const covered = new Set();
                          for (const b of byDeal.values()) {
                            const nm = nrm(b.deal && b.deal.name);
                            b.info = dById.get(String(b.id)) || (nm ? dByName.get(nm) : null) || null;
                            covered.add(String(b.id));
                            if (nm) covered.add("n:" + nm);
                            if (b.info && b.info.name) covered.add("n:" + nrm(b.info.name));
                            b.ps = b.ps.filter(alive);
                          }
                          const bare = (r.d || []).filter(
                            (d) => !covered.has(String(d.id)) && !covered.has("n:" + nrm(d.name)));

                          const mgmtH = mgmt.reduce((a, x) => a + H(x), 0);
                          const mgmtK = mgmt.reduce((a, x) => a + K(x), 0);

                          const badge = (x) => {
                            const ok = x.link === "crmid" || x.link === "deal_name_field";
                            const unlisted = x.link === "crmid_unlisted";
                            return (
                              <i className={"cpb " + (ok || unlisted ? "ok" : "guess")}
                                 title={ok
                                   ? "Linked by the CRMid written on the project. The link is certain."
                                   : unlisted
                                   ? "The project carries a CRMid and the link is certain, but that deal was not in the list the CRM returned, so its type, owner and licence dates are missing here."
                                   : "No CRMid on the project: the deal was matched on its name. Treat anything resting on this link as a guess."}>
                                {ok ? "CRMid" : unlisted ? "CRMid ·  deal not read" : "deduced"}
                              </i>
                            );
                          };

                          /**
                           * Il nome del progetto porta al progetto, non al file.
                           *
                           * Prima il nome scaricava l'Excel, che è la cosa che
                           * uno si aspetta di meno cliccando un nome: chi legge
                           * vuole aprire il progetto. Il file resta, accanto,
                           * come freccia — piccola e riconoscibile.
                           */
                          /**
                           * Che cosa è stato venduto, scritto sul progetto.
                           *
                           * Il tipo sta nell'intestazione del deal, ma chi
                           * scorre le righe guarda i progetti, e a quel punto
                           * l'intestazione è già scorsa via. Una licenza e un
                           * lavoro a progetto si leggono in modo diverso — la
                           * prima ha un margine alto per costruzione — e
                           * confonderli è l'errore più facile da fare qui.
                           */
                          const kindTag = (i) => {
                            if (!i || !i.kind || i.kind === "unset") return null;
                            const lic = i.kind === "licence";
                            return (
                              <i className={"cpt " + (lic ? "licence" : "svc")}
                                 title={lic
                                   ? "A licence deal: the CRM Licence field carries the value. Delivery effort on it is support and set-up, not the thing that was sold, so the margin reads high by its nature."
                                   : "A professional services deal: the CRM Delivery field carries the value. What was sold is the work itself, so hours and margin move together."}>
                                {lic ? "licence" : "professional services"}
                              </i>
                            );
                          };

                          const pname = (x, info) => (
                            <div className="cpn">
                              <span className="cpnm">
                                <a href={PROJECT(x.id)} target="_blank" rel="noreferrer"
                                   title="Open this project in Zoho Projects">{x.n}</a>
                                <a className="cpdl" href={xlsx("project", x.id)}
                                   title="Download the detail: who logged these hours and when"
                                   aria-label={"Download the detail of " + x.n}
                                   onClick={(e) => grabLink(e, xlsx("project", x.id), x.n)}>↓</a>
                              </span>
                              <div className="cptags">
                                {x.k === "client_mgmt" && (
                                  <i className="cpt mg" title="A project whose name starts with &ldquo;_&rdquo;: work on this client that nobody invoices — roadmap, coordination, change requests. It has no deal and no revenue, and it counts in the client's cost because it is part of serving them.">
                                    management
                                  </i>
                                )}
                                {kindTag(info)}
                                {/* Lo stato non si mostra sugli archiviati.
                                    Per un progetto archiviato l'unica fonte che
                                    resta è Zoho People, che tiene una copia sua
                                    dello stato e non viene avvisata quando il
                                    progetto viene archiviato in Projects: la
                                    sua copia è ferma a com'era quel giorno.
                                    Così si leggeva "In progress" accanto ad
                                    "archived", e una delle due era per forza
                                    falsa — quella di People. */}
                                {x.s && !x.arch && <i className="cpt">{x.s}</i>}
                                {x.arch && (
                                  <i className="cpt arch"
                                     title={"Zoho Projects no longer lists this project among the active ones: it has been archived. " +
                                       "The hours still count — the work was done." +
                                       (x.s ? " Zoho People still records it as \u201c" + x.s + "\u201d: People keeps its own copy of the status and is never told when a project is archived, so that value is frozen at the day it was." : "")}>
                                    archived
                                  </i>
                                )}
                                {badge(x)}
                              </div>
                            </div>
                          );

                          const head = (
                            <div className="cphead">
                              <span>Project</span>
                              <span>Hours{year === "all" ? "" : " " + year}</span>
                              <span>from People</span>
                              <span>{viewer ? "—" : "Internal cost"}</span>
                              <span>Budget h</span>
                              <span>Δ h</span>
                              <span />
                            </div>
                          );

                          const prow = (x, info) => {
                            const h = H(x), k = K(x);
                            const d = x.bh ? Math.round((h - x.bh) * 10) / 10 : null;
                            return (
                              <div className="cprow" key={x.id}>
                                {pname(x, info)}
                                <div className="cpnum">{Math.round(h).toLocaleString("en-GB")}</div>
                                <div className="cpnum sub">
                                  {year === "all" && x.ph ? Math.round(x.ph).toLocaleString("en-GB") : "—"}
                                </div>
                                <div className="cpnum">{viewer ? "—" : eur(k)}</div>
                                <div className="cpnum sub">{x.bh ? Math.round(x.bh).toLocaleString("en-GB") : "—"}</div>
                                <div className={"cpnum " + (d == null ? "sub" : d > 0 ? "over" : "under")}>
                                  {d == null ? "—" : (d > 0 ? "+" : "") + d.toLocaleString("en-GB")}
                                </div>
                                <div />
                              </div>
                            );
                          };

                          // I fatti del deal che stavano nella vecchia colonna e
                          // che servono ancora: cosa è stato venduto, chi lo
                          // segue, per quanto tempo vale.
                          const facts = (i) => {
                            if (!i) return null;
                            const f = [];
                            if (i.kind && i.kind !== "unset") {
                              f.push([i.kind === "licence" ? "Licence" : "Professional services",
                                      i.kind === "licence"
                                        ? (i.lic ? eurK(i.lic) : null)
                                        : (i.del ? eurK(i.del) : null)]);
                            }
                            if (i.lic > 0 && i.del > 0) f.push(["Both", eurK(i.lic) + " lic · " + eurK(i.del) + " del"]);
                            if (i.mods && i.mods.length) f.push(["Modules", i.mods.join(", ")]);
                            if (i.ls || i.le) f.push(["Licence period", fmtDate(i.ls) + " – " + fmtDate(i.le)]);
                            if (i.owner) f.push(["Owner", i.owner]);
                            if (i.csm) f.push(["CSM", i.csm + (i.csm_off ? " (disabled)" : "")]);
                            f.push(["Invoiced", eurK(year === "all" ? i.r : (i.ry && i.ry[year]) || 0) +
                                                " · " + i.n + (i.n === 1 ? " invoice" : " invoices")]);
                            if (i.ob > 0) f.push(["Outstanding", eurK(i.ob)]);
                            return (
                              <div className="cpfacts">
                                {f.map(([k2, v], n2) => v == null ? null : (
                                  <span key={n2}><i>{k2}</i>{v}</span>
                                ))}
                              </div>
                            );
                          };

                          return (
                            <div className="cpanel">

                              <div className="cpctx">
                                <div><span className="cpl">Client</span><b>{r.c}</b></div>
                                <div><span className="cpl">Billed through</span>
                                  <b>{r.ba.length ? r.ba.join(", ") : "—"}</b></div>
                                <div><Gl t={GLOSS.since}>Client since</Gl>
                                  <b className="num">{r.since || "—"}</b></div>
                                <div><Gl t={GLOSS.ltv}>Generated all time</Gl>
                                  <b className="num">{r.ltv == null ? "—" : eurK(r.ltv)}</b></div>
                                <div><Gl t={GLOSS.share}>Share of the period</Gl>
                                  <b className="num">{pct(wTot ? r.rev / wTot : 0)}</b></div>
                                <div><Gl t={GLOSS.inv}>Invoices</Gl>
                                  <b className="num">{r.n}{r.ob > 0 && <i className="cpo"> · {eurK(r.ob)} outstanding</i>}</b></div>

                                <div className="cpsep" />

                                <div><Gl t={GLOSS.rev}>
                                  Revenue {year === "all" ? "all time" : year}</Gl>
                                  <b className="num">{eurK(r.rev)}</b></div>
                                <div><Gl t={GLOSS.hrs}>Hours</Gl>
                                  <b className="num">{r.hours == null ? "—" : Math.round(r.hours).toLocaleString("en-GB")}</b></div>
                                {!viewer && (
                                  <div><Gl t={GLOSS.cost}>Real cost</Gl>
                                    <b className="num">{r.cost == null ? "—" : eur(r.cost)}</b></div>
                                )}
                                {!viewer && (
                                  <div className={r.mgmtCost ? "cpmg" : ""}>
                                    <Gl t={GLOSS.mgmt}>of which management</Gl>
                                    <b className="num">
                                      {r.mgmtCost ? eur(r.mgmtCost) : "—"}
                                      {r.mgmtShare != null && r.mgmtCost > 0 &&
                                        <i className="cpo"> · {pct(r.mgmtShare)}</i>}
                                    </b>
                                    {r.mgmtN > 0 && (
                                      <i className="cpo">
                                        {r.mgmtN} project{r.mgmtN > 1 ? "s" : ""}, in amber below
                                      </i>
                                    )}
                                  </div>
                                )}
                                <div><Gl t={GLOSS.pct}>Margin</Gl>
                                  <b className={"num big " + band(r.marginPct)}>
                                    {r.marginPct == null ? "—" : pct(r.marginPct)}</b></div>
                                <div><Gl t={GLOSS.ifix}>Internal fix</Gl>
                                  <b className="num">{r.ihours ? Math.round(r.ihours).toLocaleString("en-GB") + " h" : "—"}</b></div>
                              </div>

              <p className="cpwhat">Deals, and the projects that deliver them</p>

                              {[...byDeal.values()].map((b) => {
                                const i = b.info;
                                const name = (b.deal && b.deal.name) || (i && i.name) || ("deal " + b.id);
                                const amt = (b.deal && b.deal.amount) || (i && i.amount) || 0;
                                /**
                                 * Il margine del deal sta sul contratto intero e
                                 * su tutte le ore mai registrate, non sull'anno
                                 * scelto in alto.
                                 *
                                 * È la domanda che fanno davvero: quel contratto
                                 * da 150k ci ha guadagnato o no. Un contratto non
                                 * si divide per anno solare, e confrontare
                                 * l'importo pieno con le sole ore di quest'anno
                                 * darebbe un margine gonfio su ogni lavoro nato
                                 * l'anno prima. Quando i progetti sono più d'uno
                                 * il conto si fa lo stesso: il costo è la somma
                                 * dei loro, e sommarli non inventa niente —
                                 * inventare sarebbe attribuire il ricavo a uno.
                                 */
                                const all = b.ps.reduce((a, x) => a + (x.cost || 0), 0);
                                const allH = b.ps.reduce((a, x) => a + (x.hours || 0), 0);
                                const mg = amt > 0 && !viewer && b.ps.length ? (amt - all) / amt : null;
                                const open = b.ps.some((x) => (x.s || "").toLowerCase().indexOf("progress") >= 0
                                                           || (x.s || "").toLowerCase() === "active");
                                return (
                                  <div className="cpdeal" key={b.id}>
                                    <div className="cpdh">
                                      <div className="cpn">
                                        <a href={CRM_DEAL(b.id)} target="_blank" rel="noreferrer">{name}</a>
                                      </div>
                                      <div className="cpamt">
                                        <span className="cpl">Amount</span>
                                        <b className="num">{amt ? eurK(amt) : "—"}</b>
                                      </div>
                                      <div className="cpmar">
                                        {mg == null ? null : (
                                          <>
                                            <Gl t={GLOSS.dealmg}>
                                              Margin on contract{open ? " · so far" : ""}
                                            </Gl>
                                            <b className={"num " + band(mg)}>{pct(mg)}</b>
                                            <i className="cpo">
                                              {Math.round(allH).toLocaleString("en-GB")} h · {eurK(all)}
                                            </i>
                                          </>
                                        )}
                                      </div>
                                      {facts(i)}
                                    </div>
                                    {b.ps.length > 0 && head}
                                    {b.ps.map((x) => prow(x, i))}
                                    {!b.ps.length && (
                                      <div className="cprow cpempty">
                                        <div className="cpn">
                                          No hours on this deal&apos;s projects
                                          {year === "all" ? "" : " in " + year}.
                                        </div>
                                        <div /><div /><div /><div /><div /><div />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {mgmt.length > 0 && (
                                <div className="cpdeal mgmtblk">
                                  <div className="cpdh">
                                    <div className="cpn">
                                      <b>Account management — no deal, no revenue</b>
                                      <div className="cptags">
                                        <i className="cpt mg">
                                          {mgmt.length} project{mgmt.length > 1 ? "s" : ""} starting
                                          with &ldquo;_&rdquo; · work nobody invoices
                                        </i>
                                      </div>
                                    </div>
                                    <div className="cpamt">
                                      <span className="cpl">Hours</span>
                                      <b className="num">{Math.round(mgmtH).toLocaleString("en-GB")}</b>
                                    </div>
                                    <div className="cpmar">
                                      {!viewer && (
                                        <>
                                          <Gl t={GLOSS.mgmt}>Cost · share of this client</Gl>
                                          <b className="num">{eur(mgmtK)}</b>
                                          {/* Lo stesso numero della casella gialla in alto: se
                                              non combaciano, uno dei due sta guardando un
                                              periodo diverso, e va saputo subito. */}
                                          <i className="cpo">
                                            {r.cost ? pct(mgmtK / r.cost) + " of the cost" : "—"}
                                          </i>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {head}
                                  {mgmt.map((x) => prow(x, null))}
                                </div>
                              )}

                              {noDeal && noDeal.ps.filter(alive).length > 0 && (
                                <div className="cpdeal">
                                  <div className="cpdh">
                                    <div className="cpn">
                                      <b>Projects with no deal linked</b>
                                      <div className="cptags">
                                        <i className="cpt warn">costed, revenue unknown</i>
                                      </div>
                                    </div>
                                  </div>
                                  {head}
                                  {noDeal.ps.filter(alive).map((x) => prow(x, null))}
                                </div>
                              )}

                              {bare.length > 0 && (
                                <div className="cpbare">
                                  <span className="cpl">Deals with no project</span>
                                  <div>
                                    {bare.map((d, n2) => (
                                      <span key={d.id || "n" + n2}>
                                        {d.id
                                          ? <a href={CRM_DEAL(d.id)} target="_blank" rel="noreferrer">{d.name}</a>
                                          : <span>{d.name}</span>}
                                        <b className="num">{d.amount ? eurK(d.amount) : eurK(d.r)}</b>
                                      </span>
                                    ))}
                                  </div>
                                  <p>Licences and one-off items usually have nothing to deliver, so no project is expected.</p>
                                </div>
                              )}

                            </div>
                          );
                        })()}
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
                {internalRows.length} projects · {year === "all" ? (snap.min_year || 2025) + " on" : year}
                {/* Il filtro anno nasconde i progetti senza ore nel periodo, e
                    un progetto che c'è ma non si vede fa cercare un guasto dove
                    non c'è: il conto di quanti sono lo dice. */}
                {iHidden > 0 && (
                  <> · <button type="button" className="ilink" onClick={() => setYear("all")}>
                    {iHidden} more with no hours in {year}
                  </button></>
                )}
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
            Projects named with a leading <code>_</code> that match no client — <code>_Digital
            Operations</code> and the like — are here too: the underscore marks account work, but
            there is no account to charge it to. There is no revenue to put against any of these
            hours, so there is no margin — only what they cost. Archived projects are included: the
            hours were worked, and dropping them because the project has since been closed would
            break every year-on-year comparison. Zoho Sprints has its own tab.
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
                  {ith("hours", year === "all"
                    ? "Hours " + (snap.min_year || 2025) + " on" : "Hours " + year, true)}
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
                        <a href={PROJECT(p.id)} target="_blank" rel="noreferrer"
                           title="Open this project in Zoho Projects">{p.n}</a>
                        <a className="cpdl" href={xlsx("project", p.id)}
                           title="Download the detail: who logged these hours and when"
                           aria-label={"Download the detail of " + p.n}
                           onClick={(e) => grabLink(e, xlsx("project", p.id), p.n)}>↓</a>
                      </div>
                      {p.s && !p.arch && <div className="via">{p.s}</div>}
                      {p.arch && (
                        <div className="via"
                             title={"Zoho Projects no longer lists this project among the active ones." +
                               (p.s ? " Zoho People still records it as \u201c" + p.s + "\u201d, frozen at the day it was archived." : "")}>
                          archived
                        </div>
                      )}
                    </td>
                    <td>
                      <i className={"tag " + (p.k === "presale" ? "warn" : p.k === "client_mgmt" ? "lic" : "mod")}>
                        {p.k === "presale" ? "pre-sales"
                          : p.k === "client_mgmt" ? "account, no client" : "internal"}
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
            The project name opens the project in Zoho Projects; the arrow beside it downloads who
            logged the hours and when. The file carries no margin and no revenue, because neither
            exists here.
          </p>
        </>
        )}

        {/* ---------------------------------------------------------- Sprints --
            Una scheda sua, non una riga in mezzo agli interni. Sprints non
            registra una tariffa oraria e metà di chi ci lavora non è a libro
            paga: mescolarlo a una tabella che ha una colonna "costo reale"
            produce un totale che non significa niente. */}
        {view === "sprints" && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="k">Hours logged</div>
              <div className="v num">{Math.round(sTot.hours).toLocaleString("en-GB")}</div>
              <div className="s">
                {sprintRows.length} projects · {year === "all" ? (snap.min_year || 2025) + " on" : "whole window"}
              </div>
            </div>
            <div className="kpi">
              <div className="k">Hours since start</div>
              <div className="v num">{Math.round(sTot.lifetime).toLocaleString("en-GB")}</div>
              <div className="s">every log Sprints holds, whatever the year</div>
            </div>
            <div className="kpi">
              <div className="k">Reached Zoho Projects</div>
              <div className="v num">{Math.round(sTot.bridged).toLocaleString("en-GB")}</div>
              <div className="s">
                {sTot.lifetime > 0
                  ? pct(sTot.bridged / sTot.lifetime) + " of them — the bridge is all but off"
                  : "—"}
              </div>
            </div>
          </div>

          <p className="basis">
            <b>Zoho Sprints is a third source, and it is counted here and nowhere else.</b>{" "}
            Development logs its time in Sprints, and Zoho&apos;s bridge to Zoho Projects is all but
            switched off on this portal, so those hours reach neither Zoho Projects nor Zoho People.
            They are product development rather than work sold to a client, so they stay out of every
            client margin. They are still real hours: anyone counting a person&apos;s time without
            them is counting a fraction of it. Sprints records no hourly cost and part of the people
            logging there are not on the payroll, so these rows carry hours and no cost — a cost here
            would be invented.
          </p>

          <div className="controls">
            <input className="search" type="search" placeholder="Filter Sprints projects…"
                   value={iq} onChange={(e) => setIq(e.target.value)}
                   aria-label="Filter Sprints projects" />
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th className="r">
                    {year === "all" ? "Hours " + (snap.min_year || 2025) + " on" : "Hours in window"}
                  </th>
                  <th className="r">Hours since start</th>
                  <th className="r">Also in Zoho Projects</th>
                  <th className="r">Logs</th>
                </tr>
              </thead>
              <tbody>
                {sprintRows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="cli">
                        <span>{p.name}</span>
                        {/* Il nome non è un link: un progetto di Sprints non ha
                            una pagina in Zoho Projects. La freccia sì — scarica
                            chi ha registrato quelle ore, che finora non si
                            poteva sapere da nessuna parte. */}
                        <a className="cpdl" href={xlsx("sprints", p.id)}
                           title="Download who logged these hours, when, and what they cost"
                           aria-label={"Download the detail of " + p.name}
                           onClick={(e) => grabLink(e, xlsx("sprints", p.id), p.name)}>↓</a>
                      </div>
                    </td>
                    <td>{p.status ? <i className="tag mod">{p.status}</i> : "—"}</td>
                    <td className="r num">{Math.round(p.h).toLocaleString("en-GB")}</td>
                    <td className="r num dim">
                      {p.lifetime ? Math.round(p.lifetime).toLocaleString("en-GB") : "—"}
                    </td>
                    <td className="r num dim"
                        title={p.zpid
                          ? "This Sprints project is linked to a Zoho Projects project, so Zoho mirrors its time logs across and you will find these hours on the Projects side too."
                          : "Not linked to any Zoho Projects project, so none of these hours exist on the Projects side."}>
                      {p.alreadyInProjects
                        ? Math.round(p.alreadyInProjects).toLocaleString("en-GB")
                        : "—"}
                    </td>
                    <td className="r num dim">{(p.logs || 0).toLocaleString("en-GB")}</td>
                  </tr>
                ))}
                {!sprintRows.length && (
                  <tr><td colSpan={6} className="na">No Sprints project has hours here.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="tablenote">
            The arrow beside a project name downloads who logged its hours, when, and what they
            cost — priced from the payroll like every other hour on this dashboard, since Sprints
            carries no rate of its own.
          </p>
          <p className="tablenote">
            <b>Also in Zoho Projects</b> answers one question: would you find these hours on the
            Projects side too? Zoho can link a Sprints project to a Projects project and mirror the
            time logs across; on this portal that link is all but switched off — 4 hours out of
            nearly six thousand. Where the column reads a dash, those hours exist nowhere but here,
            so a Projects report will never show them.
          </p>
          <p className="tablenote">
            It is not a correction to anything on this page: no figure here adds Sprints to Projects,
            and no client margin contains Sprints at all. It matters to a person cross-checking with
            a Zoho Projects report, and it would matter a great deal if a Sprints project were ever
            linked to a <i>client</i> project — then its hours would reach a margin, and this column
            is where that would show.
          </p>
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
          {/* Un elenco di nomi in fondo alla pagina è utile finché si legge.
              Oltre una quindicina diventa una riga che nessuno finisce, e su cui
              quindi nessuno lavora: meglio dire quanti sono e mostrarne un
              campione che dà l'idea di cosa siano. */}
          {snap.unmatched && snap.unmatched.length > 0 && (
            <p style={{ marginTop: 10 }}>
              <b>{snap.unmatched.length}</b> project{snap.unmatched.length > 1 ? "s" : ""} named
              like client work matched no client, so their hours sit in no margin:{" "}
              {snap.unmatched.slice(0, 15).join(" · ")}
              {snap.unmatched.length > 15 &&
                <> · <i>and {snap.unmatched.length - 15} more</i></>}
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
  // Le date di licenza arrivano dal CRM come timestamp completo, non come
  // giorno: spezzarle sui trattini produceva "18T17:00:00+02:00/06/2026".
  const [y, m, d] = String(s).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(s);
}
function fmtStamp(s) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
