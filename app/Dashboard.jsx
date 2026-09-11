"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function Dashboard({ snap, warning, token, role, canUnlock }) {
  const xlsx = (type, id) =>
    `/api/xlsx?type=${type}&id=${encodeURIComponent(id)}` + (token ? `&k=${encodeURIComponent(token)}` : "");
  const accrual = snap.accrual && snap.accrual.status === "ok";

  const viewer = role === "viewer";

  const years = useMemo(() => {
    const s = new Set();
    const min = String(snap.min_year || "2025");
    for (const c of snap.clients) {
      if (viewer) { for (const y of Object.keys(c.y || {})) if (y !== "all") s.add(y); continue; }
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
  const [open, setOpen] = useState(null);

  const hasCost = snap.cost_status === "ok";
  const costPerYear = !!snap.cost_by_year;
  const costUsable = hasCost && (year === "all" || costPerYear);

  // Ogni riga porta due margini: quello di sempre e quello dell'anno scelto.
  // "All" è da sempre; un anno è la quota di ricavo di competenza di quell'anno
  // contro le ore lavorate in quell'anno, anche su progetti nati prima.
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const out = snap.clients
      .filter((c) => !(noExecus && c.c === "Execus"))
      .map((c) => {
        if (viewer) {
          const ya = (c.y && c.y.all) || {};
          const yy = (c.y && c.y[year]) || null;
          return {
            ...c,
            live: year === "all" ? true : !!yy,
            rev: null, cost: null, margin: null, marginAll: null,
            hours: yy ? yy.h : null,
            marginPct: yy ? yy.m : null,
            marginPctAll: ya.m == null ? null : ya.m,
            rw: yy ? yy.rw : 0, cw: yy ? yy.cw : 0,
          };
        }
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
        const marginAll = c.cost == null ? null : c.rt - c.cost;
        return {
          ...c, rev, cost, hours, margin, marginAll, costAll: c.cost,
          live: rev !== 0 || (cost || 0) !== 0,
          marginPct: cost == null || rev === 0 ? null : margin / rev,
          marginPctAll: c.cost == null || !c.rt ? null : marginAll / c.rt,
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
      : key === "rev" ? (r.rev == null ? r.rw : r.rev)
      : key === "cost" ? (r.cost == null ? -Infinity : r.cost)
      : key === "margin" ? (r.margin == null ? -Infinity : r.margin)
      : key === "pct" ? (r.marginPct == null ? -Infinity : r.marginPct)
      : key === "pctall" ? (r.marginPctAll == null ? -Infinity : r.marginPctAll)
      : key === "hrs" ? (r.hours == null ? -Infinity : r.hours)
      : key === "inv" ? r.n
      : key === "open" ? r.ob
      : r.pj.length;
    out.sort((a, b) => {
      const x = val(a), y2 = val(b);
      const c = typeof x === "string" ? x.localeCompare(y2) : x - y2;
      return sort.dir === "asc" ? c : -c;
    });
    return out;
  }, [snap, year, noExecus, q, sort, hasCost, costPerYear, accrual, viewer]);

  // In vista ridotta gli importi non arrivano nemmeno al browser, quindi il
  // totale non si può sommare: si ricava dai pesi. Con R e C totali dell'anno,
  // il margine di un sottoinsieme è 1 − (C/R)·(Σcw/Σrw), che è esatto.
  const tot = useMemo(() => {
    if (viewer) {
      const cr = snap.ratios && snap.ratios[year] ? snap.ratios[year].cr : null;
      const rw = rows.reduce((s, r) => s + (r.rw || 0), 0);
      const cw = rows.reduce((s, r) => s + (r.cw || 0), 0);
      const hours = rows.reduce((s, r) => s + (r.hours || 0), 0);
      const all = snap.ratios && snap.ratios.all ? snap.ratios.all.cr : null;
      const rwA = rows.reduce((s, r) => s + ((r.y && r.y.all ? r.y.all.rw : 0) || 0), 0);
      const cwA = rows.reduce((s, r) => s + ((r.y && r.y.all ? r.y.all.cw : 0) || 0), 0);
      return {
        revenue: null, cost: null, margin: null, marginAll: null, hours,
        marginPct: cr == null || !rw ? null : 1 - cr * (cw / rw),
        marginPctAll: all == null || !rwA ? null : 1 - all * (cwA / rwA),
      };
    }
    const revenue = rows.reduce((s, r) => s + r.rev, 0);
    const cost = costUsable ? rows.reduce((s, r) => s + (r.cost || 0), 0) : null;
    const hours = costUsable ? rows.reduce((s, r) => s + (r.hours || 0), 0) : null;
    const revAll = rows.reduce((s, r) => s + (r.rt || 0), 0);
    const costAll = hasCost ? rows.reduce((s, r) => s + (r.costAll || 0), 0) : null;
    return {
      revenue, cost, hours, revAll,
      margin: cost == null ? null : revenue - cost,
      marginPct: cost == null || revenue === 0 ? null : (revenue - cost) / revenue,
      marginAll: costAll == null ? null : revAll - costAll,
      marginPctAll: costAll == null || !revAll ? null : (revAll - costAll) / revAll,
    };
  }, [rows, costUsable, viewer, snap, year, hasCost]);

  // La concentrazione è una quota, non un importo: vale anche in vista ridotta.
  const weight = (r) => (viewer ? (r.rw || 0) : r.rev);
  const wTot = rows.reduce((s, r) => s + weight(r), 0);
  const top5 = rows.slice().sort((a, b) => weight(b) - weight(a)).slice(0, 5);
  const top5Share = wTot ? top5.reduce((s, r) => s + weight(r), 0) / wTot : 0;

  const th = (key, label, right) => (
    <th
      className={(right ? "r" : "") + (sort.key === key ? " sorted" : "")}
      title={"Sort by " + label.toLowerCase()}
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
              v.0.1 — Beta for testing
              {viewer && <span className="viewbadge">summary view</span>}
            </div>
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


        <ExportBar token={token} viewer={viewer} canUnlock={canUnlock}
                   missing={(snap.links && snap.links.crmid_missing) || 0}
                   gaps={snap.cost_gaps || null}
                   view={{ year, q, noExecus }} />

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

        {/* Due margini sempre in vista: quello dell'anno scelto e quello di
            sempre. Senza il secondo, un anno debole su un cliente storicamente
            buono si legge come un disastro, e viceversa. */}
        <div className="kpis">
          {viewer ? (
            <>
              <div className={"kpi" + (tot.marginPct == null ? " empty" : "")}>
                <div className="k">Margin % — {year === "all" ? "all time" : year}</div>
                <div className={"v num " + band(tot.marginPct)}>{pct(tot.marginPct)}</div>
                <div className="s">
                  {rows.length} clients ·{" "}
                  {tot.hours ? Math.round(tot.hours).toLocaleString("en-GB") + " hours logged" : "no hours"}
                </div>
              </div>
              <div className={"kpi" + (tot.marginPctAll == null ? " empty" : "")}>
                <div className="k">Margin % — all time</div>
                <div className={"v num " + band(tot.marginPctAll)}>{pct(tot.marginPctAll)}</div>
                <div className="s">the whole relationship, every year together</div>
              </div>
              <div className="kpi">
                <div className="k">Hours logged</div>
                <div className="v num">
                  {tot.hours ? Math.round(tot.hours).toLocaleString("en-GB") : "—"}
                </div>
                <div className="s">{year === "all" ? "whole period" : "in " + year}</div>
              </div>
              <div className="kpi">
                <div className="k">Clients</div>
                <div className="v num">{rows.length}</div>
                <div className="s">≥ 30% green, &lt; 0 red</div>
              </div>
            </>
          ) : (
            <>
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
                <div className="k">Margin — {year === "all" ? "all time" : year}</div>
                <div className={"v num " + band(tot.marginPct)}>{costUsable ? eur(tot.margin) : "—"}</div>
                <div className="s">
                  {costUsable ? pct(tot.marginPct) + " of revenue" : "revenue less cost of delivery"}
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
            </>
          )}
        </div>

        <div className="conc">
          <h3>Concentration — the top 5 clients account for {pct(top5Share)} of revenue</h3>
          <div className="conc-bar">
            {top5.map((r, i) => (
              <span key={r.c}
                    title={r.c + " " + (viewer ? pct(wTot ? weight(r) / wTot : 0) : eur(r.rev))}
                    style={{ width: (wTot ? (weight(r) / wTot) * 100 : 0) + "%",
                             background: SEGMENT_COLORS[i] }} />
            ))}
          </div>
          <div className="conc-key">
            {top5.map((r, i) => (
              <span key={r.c}>
                <i style={{ background: SEGMENT_COLORS[i] }} />
                {r.c} <b className="num">{pct(wTot ? weight(r) / wTot : 0)}</b>
              </span>
            ))}
          </div>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {th("cli", "Client")}
                {!viewer && th("rev", year === "all" ? "Revenue" : "Revenue " + year, true)}
                {!viewer && th("cost", year === "all" ? "Real cost" : "Real cost " + year, true)}
                {!viewer && th("margin", year === "all" ? "Margin" : "Margin " + year, true)}
                {th("pct", year === "all" ? "Margin %" : "Margin % " + year, true)}
                {th("pctall", "Margin % all time", true)}
                {viewer && th("hrs", "Hours", true)}
                {th("inv", "Inv.", true)}
                {!viewer && th("open", "Outstanding", true)}
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
                    {!viewer && <td className="r num">{eur(r.rev)}</td>}
                    {!viewer && (
                      <td className="r num">{r.cost == null ? <span className="na">—</span> : eur(r.cost)}</td>
                    )}
                    {!viewer && (
                      <td className={"r num " + band(r.marginPct)}>
                        {r.margin == null ? <span className="na">—</span> : eur(r.margin)}
                      </td>
                    )}
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
                    <td className={"r num dim " + band(r.marginPctAll)}>
                      {r.marginPctAll == null ? <span className="na">—</span> : pct(r.marginPctAll)}
                    </td>
                    {viewer && (
                      <td className="r num">
                        {r.hours == null ? <span className="na">—</span>
                          : Math.round(r.hours).toLocaleString("en-GB")}
                      </td>
                    )}
                    <td className="r num">{r.n}</td>
                    {!viewer && (
                      <td className="r num">{r.ob > 0 ? <b className="b">{eurK(r.ob)}</b> : "—"}</td>
                    )}
                    <td className="r num">{r.pj.length || "—"}</td>
                  </tr>,
                  isOpen && (
                    <tr key={r.c + "-d"} className="detail">
                      <td colSpan={viewer ? 6 : 9}>
                        <div className="det">
                          <div>
                            <h4>{viewer ? "Margin by year" : "Revenue by year"}</h4>
                            {!viewer && accrual &&
                              <div className="dhead"><span /><i>accrued</i><i>invoiced</i></div>}
                            <ul>
                              {viewer
                                ? Object.keys(r.y || {}).filter((y) => y !== "all").sort().map((y) => (
                                    <li key={y}>
                                      <span>{y}</span>
                                      <b className={"num " + band(r.y[y].m)}>{pct(r.y[y].m)}</b>
                                      <b className="num dim">
                                        {r.y[y].h ? Math.round(r.y[y].h).toLocaleString("en-GB") + " h" : "—"}
                                      </b>
                                    </li>
                                  ))
                                : [...new Set([
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
                                        {d.rev} invoice{d.rev > 1 ? "s" : ""} reversed
                                        {viewer ? "" : " · " + eurK(d.cn) + " out"}</i>}
                                    </em>
                                  </span>
                                  <b className="num">
                                    {viewer
                                      ? (d.id ? (
                                          <a href={xlsx("deal", d.id)} className="xl"
                                             title="Download the detail workbook for this deal"
                                             onClick={(e) => e.stopPropagation()}>
                                            {pct(year === "all" ? d.sh : (d.shy ? d.shy[year] : null))}
                                          </a>
                                        ) : pct(year === "all" ? d.sh : (d.shy ? d.shy[year] : null)))
                                      : d.id ? (
                                        <a href={xlsx("deal", d.id)} className="xl"
                                           title="Download the detail workbook for this deal"
                                           onClick={(e) => e.stopPropagation()}>
                                          {eurK(year === "all" ? d.r : (d.ry ? d.ry[year] || 0 : 0))}
                                        </a>
                                      ) : eurK(year === "all" ? d.r : (d.ry ? d.ry[year] || 0 : 0))}
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
                                  const py = viewer ? (p.y && p.y[year]) || null : null;
                                  const pyA = viewer ? (p.y && p.y.all) || {} : {};
                                  const pc = viewer ? null
                                    : year === "all" ? p.cost
                                    : costPerYear ? (p.cy && p.cy[year] ? p.cy[year].cost : 0) : null;
                                  const ph = viewer ? (py ? py.h : null)
                                    : year === "all" ? p.hours
                                    : costPerYear ? (p.cy && p.cy[year] ? p.cy[year].hours : 0) : null;
                                  const pr = viewer ? null
                                    : year === "all" ? p.drev
                                    : (p.dry ? p.dry[year] || 0 : null);
                                  const pm = pc == null || pr == null ? null : pr - pc;
                                  const pmp = viewer ? (py ? py.m : null)
                                    : pm == null || !pr ? null : pm / pr;
                                  const pmpAll = viewer ? (pyA.m == null ? null : pyA.m)
                                    : p.cost == null || !p.drev || p.dshare !== 1 ? null
                                    : (p.drev - p.cost) / p.drev;
                                  return (
                                  <li key={p.id}
                                      className={p.link === "crmid" || p.link === "deal_name_field" ? "" : "rev"}>
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
                                        {pmp != null && p.dshare === 1 && (
                                          <i className={"tag m " + band(pmp)}>
                                            margin {pm != null ? eurK(pm) + " · " : ""}{pct(pmp)}
                                            {year !== "all" ? " in " + year : ""}
                                          </i>
                                        )}
                                        {pmpAll != null && p.dshare === 1 && year !== "all" && (
                                          <i className={"tag m dim " + band(pmpAll)}>
                                            {pct(pmpAll)} all time
                                          </i>
                                        )}
                                        {!viewer && pc != null && p.drev != null && p.dshare > 1 && (
                                          <i className="tag" title={"This deal is delivered by " + p.dshare +
                                             " projects, so its revenue is not this project's alone"}>
                                            {p.dshare} projects share this deal
                                          </i>
                                        )}
                                        {ph != null && (
                                          <i className="tag">{Math.round(ph).toLocaleString("en-GB")} h</i>
                                        )}
                                      </em>
                                    </span>
                                    <b className="num">
                                      {viewer
                                        ? <a href={xlsx("project", p.id)} className="xl pill"
                                             title="Download the detail workbook for this project"
                                             onClick={(e) => e.stopPropagation()}>
                                            {p.k === "client_mgmt" ? "management" : "delivery"}
                                          </a>
                                        : pc == null
                                        ? <span className="pill">{p.k === "client_mgmt" ? "management" : "delivery"}</span>
                                        : <a href={xlsx("project", p.id)} className="xl"
                                             title="Download the detail workbook for this project"
                                             onClick={(e) => e.stopPropagation()}>{eurK(pc)}</a>}
                                    </b>
                                  </li>
                                  );
                                })}
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
            <b>Cost</b>: hours from <code>Time Logs (Zoho Projects)</code> multiplied by that
            person&apos;s real hourly cost in the year the hour was logged, taken from the Vivian
            S.r.l. payroll — average monthly cost over the months worked, divided by{" "}
            {snap.rate_years ? "21 working days and 8 hours" : "working days and hours"}. The rate
            follows the year, not today: a project delivered in 2025 is costed at 2025 rates,
            because pricing it at today&apos;s would invent a margin that never existed. Someone who
            has left keeps the rate of their last year on the payroll. Zoho&apos;s own{" "}
            <code>Cost Per Hour</code> is used only for people with no payroll record. Unlike the Project
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
            {!viewer && snap.cost_gaps && snap.cost_gaps.hours > 0 && (
              <> Separately, <b>{Math.round(snap.cost_gaps.hours).toLocaleString("en-GB")} hours</b>{" "}
                across {snap.cost_gaps.projects} client projects were logged at a zero hourly cost,
                so they cost nothing here — worth roughly{" "}
                <b>{eur(snap.cost_gaps.estimated_cost)}</b> at the blended rate of{" "}
                €{Math.round(snap.cost_gaps.blended_rate)}/h across everyone else. The{" "}
                <b>Hourly Rates Missing</b> list at the top names every project and person concerned.</>
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
          <p style={{ marginTop: 10 }}>
            <b>The two margins</b>: <b>all time</b> is the whole relationship, every year together,
            from the first invoice to the last. A <b>year</b> is that year alone — the revenue
            earned in it against the hours logged in it, including hours on projects that started
            earlier and are still running. A project begun in 2025 and delivered through 2026 is
            therefore counted in both, each time for the part that falls in that year, and never
            twice. Reading them side by side is the point: a weak year on a client with a strong
            history is a different thing from a client that has never paid for itself.
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
            "Hourly costs and the per-person breakdown are not part of the standard view."}{" "}
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
function ExportBar({ token, missing, gaps, view, viewer, canUnlock }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [ask, setAsk] = useState(null);
  const url = (scope, extra) =>
    `/api/xlsx?type=${scope}` + (extra || "") + (token ? "&k=" + encodeURIComponent(token) : "");

  // Il download va lasciato al browser: tirare giù lo zip con fetch e tenerlo
  // in memoria come blob è proprio ciò che falliva, e l'errore che arrivava
  // ("Load failed") non diceva niente. Un link normale lo scarica in streaming.
  const grab = (scope, extra) => {
    setMsg("Building the workbooks — the download starts on its own, it takes a minute.");
    const a = document.createElement("a");
    a.href = url(scope, extra);
    a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    // Il browser non avvisa quando il download parte, quindi l'avviso si
    // toglie da solo: lasciarlo lì per sempre fa pensare a un blocco.
    window.setTimeout(() => setMsg(null), 90000);
  };

  // Un pulsante bloccato non sparisce e non porta a una pagina di errore:
  // chiede la password lì dove sei.
  const locked = (scope, why, extra) => {
    if (viewer && canUnlock) { setAsk(why); return; }
    grab(scope, extra);
  };

  const lock = async () => {
    await fetch("/api/unlock", { method: "DELETE" }).catch(() => {});
    window.location.reload();
  };

  return (
    <div className="exportbar">
      {canUnlock && (viewer ? (
        <div className="lockbar">
          <span>
            <b>Summary view.</b> Margin as a percentage — for the year and all time — and the hours
            behind it. Revenue, cost and margin in euro, and who logged those hours, are not here.
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
      <div className="xb-in">
        <span className="xb-t">
          {viewer
            ? "Download what you are looking at. The files carry the same figures as the screen: margins as a percentage and hours, no amounts."
            : "Download what you are looking at, or the detail behind it — one workbook per deal, one per project, one per client. Deal and project do not always match one to one, so both cuts exist."}
        </span>
        <button className="xb" disabled={busy}
                onClick={() => grab("dashboard", "&year=" + encodeURIComponent(view.year) +
                  (view.q ? "&q=" + encodeURIComponent(view.q) : "") +
                  (view.noExecus ? "&execus=0" : ""))}>
          This view (.xlsx)
        </button>
        <button className="xb" disabled={busy} onClick={() => grab("deals")}>Deals (.zip)</button>
        <button className="xb" disabled={busy} onClick={() => grab("projects")}>Projects (.zip)</button>
        <button className="xb" disabled={busy} onClick={() => grab("clients")}>Clients (.zip)</button>
        {/* La lista dei progetti da sistemare è una cosa da fare, non un export:
            se non c'è niente da fare, il pulsante non deve nemmeno esistere. */}
        {missing > 0 ? (
          <button className="xb warn" disabled={busy} onClick={() => grab("missing")}>
            CRMid Missing List ({missing})
          </button>
        ) : (
          <span className="xb-ok">All projects with CRMid, none missing</span>
        )}
        <button className={"xb ghost" + (viewer ? " locked" : "")} disabled={busy}
                onClick={() => locked("rateplan",
                  "The rate plan lists every person and the hourly cost to write for them.",
                  "&year=2026")}>
          Rate plan 2026 (preview)
          {viewer && <i className="lk" aria-hidden="true">🔒</i>}
        </button>
        {gaps && gaps.hours > 0 ? (
          <button className={"xb warn" + (viewer ? " locked" : "")} disabled={busy}
                  onClick={() => locked("rates",
                    "The list of hours with no hourly cost names every person concerned.")}>
            Hourly Rates Missing ({Math.round(gaps.hours).toLocaleString("en-GB")} h)
            {viewer && <i className="lk" aria-hidden="true">🔒</i>}
          </button>
        ) : (
          <span className="xb-ok">Every logged hour has an hourly cost</span>
        )}
      </div>
      {msg && <div className="xb-msg">{msg}</div>}
      {ask !== null && <UnlockDialog reason={ask} onClose={() => setAsk(null)} />}
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
