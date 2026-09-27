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
import { fetchPeopleOnlyHours, mergePeopleHours } from "./people.js";

/**
 * Le ore che stanno solo in Zoho People entrano nel costo.
 *
 * Sono 10.815 sulla finestra 2025-2026: il 39% in più di quelle che leggiamo da
 * Projects, e cadono su clienti veri — Loro Piana, Fendi, Jakala, LVMH, Execus.
 * Includerle è la cosa corretta, ma cambia ogni margine che questa pagina ha
 * mostrato finora, quindi non si accende da sola: serve PEOPLE_UNION=on. Con il
 * flag spento il comportamento è identico a prima, riga per riga.
 */
const UNION_ON = () => (process.env.PEOPLE_UNION || "").trim().toLowerCase() === "on";

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

  // Il recupero da People non deve poter far cadere la pagina: se fallisce si
  // resta col costo di Projects, dichiarando che manca la parte recuperata —
  // che è esattamente lo stato in cui la dashboard ha vissuto fino a oggi.
  let peopleAdded = null;
  if (costs && UNION_ON()) {
    try {
      const rec = await fetchPeopleOnlyHours({});
      peopleAdded = mergePeopleHours(costs, rec).added;
      if (!rec.internalSplit) errors.peopleInternal = "ore recuperate non separate fra cliente e debug interno";
    } catch (e) {
      errors.people = e.message;
    }
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
    peopleUnion: { on: UNION_ON(), added: peopleAdded },
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
