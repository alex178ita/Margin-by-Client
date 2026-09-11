"use client";

import { useMemo, useState } from "react";
import { LOGO_DATA_URI } from "../lib/logo";

const CRM_DEAL = (id) => `https://crm.zoho.eu/crm/org20069412455/tab/Potentials/${id}`;
const PROJECT = (id) => `https://projects.zoho.eu/portal/kleecksprojects#dashboard/${id}`;

// Formattazione en-GB, coerente con gli altri report Kleecks.
const eur = (n) => (n == null ? "—" : "€" + Math.round(n).toLocaleString("en-GB"));
const eurK = (n) =>
  n == null ? "—" : Math.abs(n) >= 1000
    ? "€" + Math.round(n / 1000).toLocaleString("en-GB") + "k"
    : "€" + Math.round(n).toLocaleString("en-GB");
const pct = (n) => (n == null ? "—" : (n * 100).toFixed(1) + "%");

// Soglie coerenti con il Project Portfolio report: >=30% verde, 0-30% ambra, <0 rosso.
const band = (m) => (m == null ? "" : m >= 0.3 ? "g" : m >= 0 ? "a" : "b");

const SEGMENT_COLORS = ["#0f7173", "#14a19a", "#4bbfae", "#8ad3c4", "#e8c547"];

export default function Dashboard({ snap, warning, token }) {
  const xlsx = (type, id) =>
    `/api/xlsx?type=${type}&id=${encodeURIComponent(id)}` + (token ? `&k=${encodeURIComponent(token)}` : "");
  const accrual = snap.accrual && snap.accrual.status === "ok";

  const years = useMemo(() => {
    const s = new Set();
    for (const c of snap.clients) {
      for (const y of Object.keys(c.ry || {})) s.add(y);
      if (accrual) for (const y of Object.keys(c.ra || {})) s.add(y);
    }
    return [...s].sort();
  }, [snap, accrual]);

  const [year, setYear] = useState("all");
  const [noExecus, setNoExecus] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "rev", dir: "desc" });
  const [open, setOpen] = useState(null);

  const hasCost = snap.cost_status === "ok";
  const costPerYear = !!snap.cost_by_year;
  const costUsable = hasCost && (year === "all" || costPerYear);

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
        const margin = cost == null ? null : rev - cost;
        const marginPct = cost == null || rev === 0 ? null : margin / rev;
        return { ...c, rev, cost, hours, margin, marginPct };
      })
      .filter((c) => c.rev !== 0 || (c.cost || 0) !== 0)
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
      : key === "inv" ? r.n
      : key === "open" ? r.ob
      : r.pj.length;
    out.sort((a, b) => {
      const x = val(a), y2 = val(b);
      const c = typeof x === "string" ? x.localeCompare(y2) : x - y2;
      return sort.dir === "asc" ? c : -c;
    });
    return out;
  }, [snap, year, noExecus, q, sort, hasCost, costPerYear, accrual]);

  const tot = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + r.rev, 0);
    const cost = costUsable ? rows.reduce((s, r) => s + (r.cost || 0), 0) : null;
    const hours = costUsable ? rows.reduce((s, r) => s + (r.hours || 0), 0) : null;
    return {
      revenue, cost, hours,
      margin: cost == null ? null : revenue - cost,
      marginPct: cost == null || revenue === 0 ? null : (revenue - cost) / revenue,
    };
  }, [rows, costUsable]);

  const top5 = rows.slice().sort((a, b) => b.rev - a.rev).slice(0, 5);
  const top5Share = tot.revenue ? top5.reduce((s, r) => s + r.rev, 0) / tot.revenue : 0;

  const th = (key, label, right) => (
    <th
      className={right ? "r" : ""}
      aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
      onClick={() =>
        setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
    >
      {label}
      {sort.key === key && <span className="arw">{sort.dir === "asc" ? "▲" : "▼"}</span>}
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
            <div className="beta">v.0.1 — Beta for testing</div>
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
        {(warning || !hasCost) && (
          <div className="notice">
            <div>
              <strong>{hasCost ? "Note" : "Costs not connected yet"}</strong>
              <p>
                {warning ||
                  "Real costs come from Zoho Analytics (Time Logs × Cost Per Hour, per-person rate). " +
                  "Until that connection works the page shows the revenue side only."}
              </p>
              {!warning && snap.cost_error && (
                <p className="err">Zoho Analytics said: {snap.cost_error}</p>
              )}
              {!warning && !accrual && snap.accrual && snap.accrual.error && (
                <p className="err">Licence periods: {snap.accrual.error}</p>
              )}
            </div>
          </div>
        )}

        <ExportBar token={token} />

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

        <div className="kpis">
          <div className="kpi">
            <div className="k">
              {year === "all" || !accrual ? "Invoiced revenue" : "Accrued revenue"}
            </div>
            <div className="v num">{eur(tot.revenue)}</div>
            <div className="s">{rows.length} clients · {year === "all" ? "whole period" : year}</div>
          </div>
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
          <div className={"kpi" + (costUsable ? "" : " empty")}>
            <div className="k">Margin</div>
            <div className={"v num " + band(tot.marginPct)}>{costUsable ? eur(tot.margin) : "—"}</div>
            <div className="s">revenue less cost of delivery</div>
          </div>
          <div className={"kpi" + (costUsable ? "" : " empty")}>
            <div className="k">Margin %</div>
            <div className={"v num " + band(tot.marginPct)}>{costUsable ? pct(tot.marginPct) : "—"}</div>
            <div className="s">≥ 30% green, &lt; 0 red</div>
          </div>
        </div>

        <div className="conc">
          <h3>Concentration — the top 5 clients account for {pct(top5Share)} of revenue</h3>
          <div className="conc-bar">
            {top5.map((r, i) => (
              <span key={r.c} title={r.c + " " + eur(r.rev)}
                    style={{ width: (tot.revenue ? (r.rev / tot.revenue) * 100 : 0) + "%",
                             background: SEGMENT_COLORS[i] }} />
            ))}
          </div>
          <div className="conc-key">
            {top5.map((r, i) => (
              <span key={r.c}>
                <i style={{ background: SEGMENT_COLORS[i] }} />
                {r.c} <b className="num">{pct(tot.revenue ? r.rev / tot.revenue : 0)}</b>
              </span>
            ))}
          </div>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {th("cli", "Client")}
                {th("rev", "Revenue", true)}
                {th("cost", "Real cost", true)}
                {th("margin", "Margin", true)}
                {th("pct", "Margin %", true)}
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
                      onClick={() => setOpen(isOpen ? null : r.c)}>
                    <td>
                      <div className="cli">
                        <a href={xlsx("client", r.c)} className="clidl"
                           title="Download every costed project behind this client's margin"
                           onClick={(e) => e.stopPropagation()}>{r.c}</a>
                      </div>
                      {via.length > 0 && <div className="via">via {via.join(", ")}</div>}
                    </td>
                    <td className="r num">{eur(r.rev)}</td>
                    <td className="r num">{r.cost == null ? <span className="na">—</span> : eur(r.cost)}</td>
                    <td className={"r num " + band(r.marginPct)}>
                      {r.margin == null ? <span className="na">—</span> : eur(r.margin)}
                    </td>
                    <td className="r">
                      {r.marginPct == null ? <span className="na">—</span> : (
                        <span className="mbar">
                          <span className={"num " + band(r.marginPct)}>{pct(r.marginPct)}</span>
                          <span className="track">
                            <span className={"fill bg-" + band(r.marginPct)}
                                  style={{ width: Math.min(100, Math.max(0, r.marginPct * 100)) + "%" }} />
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="r num">{r.n}</td>
                    <td className="r num">{r.ob > 0 ? <b className="b">{eurK(r.ob)}</b> : "—"}</td>
                    <td className="r num">{r.pj.length || "—"}</td>
                  </tr>,
                  isOpen && (
                    <tr key={r.c + "-d"} className="detail">
                      <td colSpan={8}>
                        <div className="det">
                          <div>
                            <h4>Revenue by year</h4>
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
                                    {d.id ? (
                                      <a href={xlsx("deal", d.id)} className="xl"
                                         title="Download the detail workbook for this deal"
                                         onClick={(e) => e.stopPropagation()}>{eurK(d.r)}</a>
                                    ) : eurK(d.r)}
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
                                .map((p) => (
                                  <li key={p.id} className={!p.crmid ? "rev" : ""}>
                                    <span className="dl">
                                      <a href={PROJECT(p.id)} target="_blank" rel="noopener noreferrer"
                                         title={"Open " + p.n + " in Zoho Projects"}
                                         onClick={(e) => e.stopPropagation()}>{p.n}</a>
                                      <em className="tags">
                                        {p.link === "crmid" && p.deal &&
                                          <i className="tag ok">linked to {p.deal.name}</i>}
                                        {p.link === "name_guess" && p.deal &&
                                          <i className="tag warn">Missing CRMid — guessed {p.deal.name}</i>}
                                        {p.link === "name_ambiguous" &&
                                          <i className="tag warn">Missing CRMid — several deals share this name</i>}
                                        {p.link === "crmid_unknown" &&
                                          <i className="tag warn">CRMid on the project matches no deal</i>}
                                        {p.link === "none" &&
                                          <i className="tag warn">Missing CRMid in Projects</i>}
                                        {p.k === "client_mgmt" && <i className="tag mod">management</i>}
                                      </em>
                                    </span>
                                    <b className="num">
                                      {p.cost == null
                                        ? <span className="pill">{p.k === "client_mgmt" ? "management" : "delivery"}</span>
                                        : <a href={xlsx("project", p.id)} className="xl"
                                             title="Download the detail workbook for this project"
                                             onClick={(e) => e.stopPropagation()}>{eurK(p.cost)}</a>}
                                    </b>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>

        <footer className="note">
          <p>
            <b>Revenue</b>: invoices issued in Zoho Books (Vivian Srl), drafts excluded, taken at the{" "}
            <b>sub-total</b> so it is net of VAT and comparable with the CRM deal amount, and{" "}
            <b>net of any credit note</b> raised against the invoice. A reversed invoice still reads
            Closed and paid in Books, so status alone never catches it; only the credit note does.
            Revenue is attributed to the end client through the CRM deal recorded on each invoice —
            which is why Prada, MSC and ITA Airways appear as clients in their own right rather than
            as lines under Jakala.{" "}
            {snap.revenue && snap.revenue.basis === "gross" && (
              <b className="err">
                {" "}Analytics could not be reached, so revenue on this run is the invoice total
                including VAT and does not exclude credit notes.{" "}
              </b>
            )}
            {snap.revenue && snap.revenue.credited > 0 && (
              <>
                {" "}In this period <b>{eur(snap.revenue.credited)}</b> was reversed by credit notes
                across <b>{snap.revenue.reversed_invoices}</b> invoices, and has been taken out.{" "}
              </>
            )}
            <b>Cost</b>: hours from <code>Time Logs (Zoho Projects)</code> multiplied by each
            person&apos;s own <code>Cost Per Hour</code>, never a blended rate. Unlike the Project
            Portfolio report, projects prefixed <code>_</code> (management and CSM) are counted as
            client cost: that time is spent on the client. Internal projects (<code>---</code>,{" "}
            <code>::</code>) and pre-sales (<code>=</code>) stay out.
          </p>
          <p style={{ marginTop: 10 }}>
            <b>What this margin is not</b>: the only cost subtracted here is people&apos;s time.
            Servers, infrastructure, third-party licences and the rest of the cost of running the
            platform are not recorded anywhere in Zoho, so they cannot enter this calculation. Read
            these figures as a contribution margin on delivery effort, not as net margin: the real
            profitability of every client sits below the number shown here, by an amount this page
            has no way to measure.
            {snap.cost_gaps && snap.cost_gaps.projects > 0 && (
              <> Separately, <b>{Math.round(snap.cost_gaps.hours).toLocaleString("en-GB")} hours</b>{" "}
                across {snap.cost_gaps.projects} client projects were logged by people with no{" "}
                <code>Cost Per Hour</code> set in Zoho Projects, so they cost nothing here. Those
                clients look better than they are until the rates are filled in.</>
            )}
          </p>
          <p style={{ marginTop: 10 }}>
            <b>Year attribution</b>: many licences are invoiced once for a period that straddles two
            calendar years, so booking the whole amount to the year of issue would measure the
            invoicing rhythm rather than the business. Selecting a year therefore spreads each
            invoice pro rata, day by day, across the <code>Licence Start Date</code> –{" "}
            <code>Licence End Date</code> window of the CRM deal recorded on it; cost is the time
            logged in that same year. Invoices with no usable licence period — one-off consultancy,
            extra work billed against a licence deal more than four months outside its window — stay
            on the invoice date.
            {snap.accrual && snap.accrual.coverage != null && (
              <> Licence periods were found for{" "}
                <b>{pct(snap.accrual.coverage)}</b> of invoices ({snap.accrual.matched} of{" "}
                {snap.accrual.considered}).</>
            )}{" "}
            The <b>All</b> view stays on the invoice date, so it reconciles to Zoho Books; per-year
            figures will not add up to it exactly, and that difference is the licence value earned
            outside the window.
          </p>
          {snap.links && snap.links.crmid_missing > 0 && (
            <p style={{ marginTop: 10 }}>
              <b>Deal and project are not always one to one</b>: the link is the{" "}
              <code>CRMid</code> field on the project in Zoho Projects.{" "}
              <b>{snap.links.crmid_missing}</b> client projects have it empty; for{" "}
              {snap.links.crmid_missing_guessed} of them a deal with an identical name was found and
              is shown as a guess, marked as such wherever it appears. A project with no link is
              costed but earns no revenue of its own, so its workbook is a cost sheet. That is also
              why the detail workbooks come in two cuts: one per deal, covering the whole deal, and
              one per project, covering that project alone.
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
 * Scarica tutti i fogli di dettaglio in uno zip, o li spedisce per email.
 * Un file per deal e uno per progetto: i due tagli non coincidono, perché deal
 * e progetto non sono sempre in corrispondenza uno a uno.
 */
function ExportBar({ token }) {
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(null);
  const base = "/api/xlsx?type=all" + (token ? "&k=" + encodeURIComponent(token) : "");

  const download = async () => {
    setBusy(true); setMsg("Building the workbooks — this takes a minute…");
    try {
      const r = await fetch(base);
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).error) || "failed");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "margin_detail_" + new Date().toISOString().slice(0, 10) + ".zip";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      setMsg(null);
    } catch (e) { setMsg("Could not build the zip — " + e.message); }
    setBusy(false);
  };

  const send = async () => {
    setBusy(true); setMsg("Building and sending…");
    try {
      const r = await fetch(base + "&email=" + encodeURIComponent(email));
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "failed");
      setMsg("Sent to " + j.sent + " — " + j.files + " workbooks."); setAsk(false);
    } catch (e) { setMsg("Not sent — " + e.message); }
    setBusy(false);
  };

  return (
    <div className="exportbar">
      <div className="xb-in">
        <span className="xb-t">Detail workbooks — one per deal, one per project, one per client</span>
        <button className="xb" disabled={busy} onClick={download}>Download all (.zip)</button>
        <button className="xb ghost" disabled={busy} onClick={() => setAsk((v) => !v)}>
          Email them instead
        </button>
        {ask && (
          <span className="xb-mail">
            <input type="email" value={email} placeholder="name@kleecks.com"
                   aria-label="Email address" onChange={(e) => setEmail(e.target.value)} />
            <button className="xb" disabled={busy || !email} onClick={send}>Send</button>
          </span>
        )}
      </div>
      {msg && <div className="xb-msg">{msg}</div>}
    </div>
  );
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
