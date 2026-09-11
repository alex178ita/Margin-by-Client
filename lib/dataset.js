/**
 * Il dato grezzo dietro gli Excel di dettaglio: fatture, deal, progetti, costi
 * e ore per persona. Serve una volta sola per richiesta, anche quando la stessa
 * chiamata genera decine di file: le query pesanti sono quattro, non una per file.
 */
import {
  fetchInvoicesAnalytics, fetchInvoicesBooks, fetchDeals, fetchProjects,
  linkProjectsToDeals, fetchProjectLinks, fetchProjectCosts, projectDetail, fetchUserRates, assemble,
} from "./zoho.js";

// Cache per istanza lambda: un export che genera molti file non ripaga
// quattro job Analytics ogni volta che si clicca.
let CACHE = null;
const TTL = 10 * 60 * 1000;

export async function loadDataset(opts) {
  const force = opts && opts.force;
  if (!force && CACHE && CACHE.at > Date.now() - TTL) return CACHE.data;

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
  };
  CACHE = { at: Date.now(), data };
  return data;
}

/** Ogni deal che ha almeno una fattura, e ogni progetto cliente con ore. */
export function exportTargets(ctx) {
  const dealIds = [...new Set(ctx.invoices.map((i) => i.dealId).filter(Boolean))]
    .filter((id) => ctx.dealById.has(id));
  const projectIds = ctx.projects
    .filter((p) => (p.k === "client" || p.k === "client_mgmt") && (p.hours || 0) > 0)
    .map((p) => p.id);
  return { dealIds, projectIds };
}
