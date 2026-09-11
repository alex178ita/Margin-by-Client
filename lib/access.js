/**
 * Chi vede i costi interni.
 *
 * La pagina si apre con ACCESS_TOKEN nell'indirizzo e parte sempre in vista
 * ridotta: margine per cliente e per progetto, ore totali, e nient'altro.
 * Il dettaglio per persona e le tariffe si sbloccano con una password —
 * COST_PASSWORD — che apre un cookie di sessione.
 *
 * La password non viaggia mai nell'indirizzo: un URL finisce nella cronologia,
 * nella configurazione del Web Tab e in qualsiasi schermo condiviso.
 * Se COST_PASSWORD non è configurata, i costi restano sempre visibili come prima.
 */
import { cookies } from "next/headers";
import { createHash } from "crypto";

const ENV = (k) => (process.env[k] || "").trim();
export const COOKIE = "mbc_costs";

export function tokenOk(key) {
  const full = ENV("ACCESS_TOKEN");
  if (!full) return true;
  return (key || "").trim() === full;
}

/**
 * Nel cookie non finisce la password ma la sua impronta.
 *
 * Due motivi. Uno: una password con simboli — spazi, accenti, punteggiatura —
 * verrebbe codificata scrivendo il cookie e riletta diversa, e lo sblocco non
 * funzionerebbe mai senza che si capisca perché. Due: la password in chiaro non
 * ha ragione di stare nel browser di nessuno.
 */
function fingerprint(value) {
  return createHash("sha256").update("mbc:" + String(value)).digest("hex").slice(0, 32);
}

/** "full" quando i costi interni sono sbloccati, "viewer" altrimenti. */
export function roleFromCookies() {
  const pw = ENV("COST_PASSWORD");
  if (!pw) return "full";
  try {
    return cookies().get(COOKIE)?.value === fingerprint(pw) ? "full" : "viewer";
  } catch (e) {
    return "viewer";
  }
}

/** Confronto senza sorprese: si tolgono spazi ai bordi da entrambe le parti. */
export function checkPassword(candidate) {
  const pw = ENV("COST_PASSWORD");
  return !!pw && String(candidate || "").trim() === pw;
}

export function unlockCookieValue() {
  return fingerprint(ENV("COST_PASSWORD"));
}

export function unlockAvailable() {
  return !!ENV("COST_PASSWORD");
}

/**
 * Quello che la vista ridotta non deve vedere viene tolto qui, sul server: non
 * nascosto a schermo, proprio non spedito al browser.
 *
 * Restano le due percentuali di margine — quella di sempre e quella dell'anno —
 * le ore, e i conteggi. Spariscono tutti gli importi: ricavo, costo, margine in
 * euro, insoluto, e il dettaglio per persona.
 *
 * Le percentuali da sole non si sommano, e la pagina ha bisogno di ricalcolare
 * il totale ogni volta che si filtra. Per questo ogni cliente porta anche il
 * proprio peso sul ricavo (rw) e sul costo (cw) dell'anno: da lì il margine di
 * un sottoinsieme si ricava esatto — 1 − (C/R) · (Σcw / Σrw) — senza che un
 * solo euro attraversi la rete.
 */
export function redact(snap) {
  const years = [...new Set(snap.clients.flatMap((c) => [
    ...Object.keys(c.ra || {}), ...Object.keys(c.ry || {}), ...Object.keys(c.cy || {})]))].sort();
  const accrual = snap.accrual && snap.accrual.status === "ok";
  const perYear = !!snap.cost_by_year;
  const keys = ["all", ...years];

  const revOf = (c, y) => y === "all" ? (c.rt || 0)
    : accrual ? ((c.ra && c.ra[y]) || 0) : ((c.ry && c.ry[y]) || 0);
  const costOf = (c, y) => y === "all" ? (c.cost == null ? null : c.cost)
    : perYear ? (c.cy && c.cy[y] ? c.cy[y].cost : 0) : null;
  const hoursOf = (c, y) => y === "all" ? (c.hours == null ? null : c.hours)
    : perYear ? (c.cy && c.cy[y] ? c.cy[y].hours : 0) : null;

  // Totali per anno: servono a trasformare gli importi in pesi.
  const totals = {};
  for (const y of keys) {
    let R = 0, C = 0;
    for (const c of snap.clients) { R += revOf(c, y); C += costOf(c, y) || 0; }
    totals[y] = { R, C, cr: R ? C / R : null };
  }

  const share = (n, d) => (d ? Math.round((n / d) * 1e6) / 1e6 : 0);
  const pctOf = (rev, cost) => (cost == null || !rev ? null : Math.round(((rev - cost) / rev) * 1e4) / 1e4);

  const clients = snap.clients.map((c) => {
    const y = {};
    for (const k of keys) {
      const rev = revOf(c, k), cost = costOf(c, k), hours = hoursOf(c, k);
      if (!rev && !(cost || 0) && k !== "all") continue;
      y[k] = {
        m: pctOf(rev, cost),
        h: hours == null ? null : Math.round(hours * 100) / 100,
        rw: share(rev, totals[k].R),
        cw: share(cost || 0, totals[k].C),
      };
    }
    return {
      c: c.c, p: c.p, ba: c.ba, n: c.n, rev: c.rev, pj: c.pj, y,
      // I deal restano, con tutto quello che dice il CRM: tipo, moduli, owner,
      // CSM. Sparisce solo quanto valgono, sostituito dalla quota sul cliente.
      d: (c.d || []).map((d) => ({
        id: d.id, name: d.name, kind: d.kind, mods: d.mods, owner: d.owner,
        csm: d.csm, csm_off: d.csm_off, n: d.n, rev: d.rev,
        sh: share(d.r, c.rt),
        shy: Object.fromEntries(Object.entries(d.ry || {})
          .map(([k, v]) => [k, share(v, (c.ra && c.ra[k]) || 0)])),
      })),
    };
  });

  const projects = snap.projects.map((p) => {
    const y = {};
    const put = (k, rev, cost, hours) => {
      y[k] = {
        m: p.dshare === 1 ? pctOf(rev, cost) : null,
        h: hours == null ? null : Math.round(hours * 100) / 100,
      };
    };
    put("all", p.drev, p.cost, p.hours);
    for (const k of Object.keys(p.cy || {})) {
      put(k, p.dry ? p.dry[k] || 0 : 0, p.cy[k].cost, p.cy[k].hours);
    }
    for (const k of Object.keys(p.dry || {})) {
      if (!y[k]) put(k, p.dry[k], p.cy && p.cy[k] ? p.cy[k].cost : 0, p.cy && p.cy[k] ? p.cy[k].hours : 0);
    }
    return {
      id: p.id, n: p.n, k: p.k, c: p.c, s: p.s, link: p.link, crmid: p.crmid,
      deal: p.deal ? { id: p.deal.id, name: p.deal.name, kind: p.deal.kind } : null,
      dshare: p.dshare, y,
    };
  });

  return {
    ...snap,
    clients, projects,
    // I pesi si leggono solo con questi: il rapporto costo/ricavo dell'anno.
    ratios: Object.fromEntries(Object.entries(totals)
      .map(([k, t]) => [k, { cr: t.cr, hours: null }])),
    totals: { clients: snap.totals ? snap.totals.clients : clients.length, invoices: snap.totals ? snap.totals.invoices : null },
    revenue: snap.revenue ? { basis: snap.revenue.basis, reversed_invoices: snap.revenue.reversed_invoices } : null,
    cost_gaps: snap.cost_gaps
      ? { projects: snap.cost_gaps.projects, hours: snap.cost_gaps.hours }
      : null,
    rate_people: undefined,
  };
}

/**
 * Gli unici due fogli che non hanno una versione senza persone: sono elenchi
 * di persone. Gli altri si generano lo stesso, con i totali al posto delle
 * righe individuali.
 */
export const FULL_ONLY_EXPORTS = new Set(["rates", "rateplan"]);
