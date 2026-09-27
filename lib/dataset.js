/**
 * Il dato grezzo dietro gli Excel di dettaglio: fatture, deal, progetti, costi
 * e ore per persona. Serve una volta sola per richiesta, anche quando la stessa
 * chiamata genera decine di file: le query pesanti sono quattro, non una per file.
 */
import {
  fetchInvoicesAnalytics, fetchInvoicesBooks, fetchDeals, fetchProjects,
  linkProjectsToDeals, fetchProjectLinks, fetchProjectCosts, projectDetail, fetchUserRates, assemble,
  startAnalyticsBudget,
} from "./zoho.js";
import { LAST_PEOPLE_UNION } from "./zoho.js";

/**
 * Le ore che stanno solo in Zoho People entrano nel costo, ma NON qui.
 *
 * Le somma fetchProjectCosts, che è l'unica funzione da cui il costo esce e
 * quindi l'unico posto in cui aggiungerle senza lasciare indietro un chiamante.
 * Questo modulo si limita a riportare cosa è entrato. Aggiungerle una seconda
 * volta qui raddoppierebbe le ore recuperate negli Excel, e sarebbe un errore
 * silenzioso: i totali resterebbero plausibili.
 */

// Cache per istanza lambda: un export che genera molti file non ripaga
// quattro job Analytics ogni volta che si clicca.
let CACHE = null;
const TTL = 10 * 60 * 1000;

export async function loadDataset(opts) {
  const force = opts && opts.force;
  if (!force && CACHE && CACHE.at > Date.now() - TTL) return CACHE.data;

  // Gli Excel girano nella stessa funzione serverless della pagina e hanno lo
  // stesso limite: senza un budget condiviso un Analytics lento fa scadere
  // l'export invece di restituire un file.
  startAnalyticsBudget();

  const errors = {};
  const deals = await fetchDeals().catch((e) => { errors.accrual = e.message; return []; });
  if (deals.error) { errors.deals = deals.error; errors.accrual = deals.error; }

  let invoices, basis = "net";
  try {
    invoices = await fetchInvoicesAnalytics();
  } catch (e) {
    errors.revenue = e.message;
    basis = "gross";
    invoices = await fetchInvoicesBooks();
  }

  const links = await fetchProjectLinks().catch(() => null);
  const projects = linkProjectsToDeals(await fetchProjects(), deals, links);
  const costs = await fetchProjectCosts().catch((e) => { errors.cost = e.message; return null; });

  // fetchProjectCosts ha già incluso le ore recuperate da People, se il flag è
  // acceso. Qui si raccoglie solo l'esito, per poterlo mostrare.
  if (LAST_PEOPLE_UNION && LAST_PEOPLE_UNION.error) errors.people = LAST_PEOPLE_UNION.error;
  if (LAST_PEOPLE_UNION && LAST_PEOPLE_UNION.internalSplit === false) {
    errors.peopleInternal = "ore recuperate non separate fra cliente e debug interno";
  }
  const people = await projectDetail(null).catch(() => ({}));
  const rates = await fetchUserRates().catch(() => new Map());

  const snap = assemble(invoices, projects, costs, deals, errors, { basis });

  const data = {
    year: new Date().getUTCFullYear(),
    invoices,
    deals,
    dealById: new Map(deals.map((d) => [String(d.id), d])),
    projects: snap.projects,
    clients: snap.clients,
    people,
    rates,
    snapshot: snap,
    peopleUnion: LAST_PEOPLE_UNION,
  };
  CACHE = { at: Date.now(), data };
  return data;
}

/** Ogni deal che ha almeno una fattura, e ogni progetto cliente con ore. */
export function exportTargets(ctx) {
  const dealIds = [...new Set(ctx.invoices.map((i) => i.dealId).filter(Boolean))]
    .filter((id) => ctx.dealById.has(id));
  // Anche i progetti interni e le prevendite: non hanno un margine, ma hanno ore
  // e persone, e la vista interna deve poterle esportare come tutte le altre.
  const projectIds = ctx.projects
    .filter((p) => (p.hours || 0) > 0 || (p.ih || 0) > 0)
    .map((p) => p.id);
  return { dealIds, projectIds };
}
