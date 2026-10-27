/**
 * Il costo dei fornitori esterni, dalla sezione Providers del deal in CRM.
 *
 * Perché serve. Il margine di questa dashboard confronta il fatturato con il
 * costo del team. Su alcuni lavori però una parte del venduto esce subito verso
 * un fornitore — una traduzione, una licenza di terzi, una giornata di
 * consulenza comprata fuori — e quella parte non è mai stata nel conto. Un
 * margine che ignora un costo diretto non è prudenziale: è sbagliato per
 * eccesso, e lo è di più proprio sui lavori dove il fornitore pesa.
 *
 * Dove sta il dato. Nel CRM il deal ha una subform `Providers` con tre colonne —
 * fornitore, importo e descrizione — e, sul deal stesso, due campi di totale
 * (`Total Providers Cost` e la formula `Total External Costs`). La subform è la
 * fonte buona, perché porta il dettaglio che finisce negli export; i campi di
 * totale sono il ripiego per quando qualcuno compila il totale senza le righe.
 * Se entrambi ci sono vince la subform, e la differenza viene dichiarata invece
 * di essere appianata: due numeri che non tornano sono una domanda per chi
 * compila il CRM, non un dettaglio da nascondere.
 *
 * Quello che il dato NON ha è una data. Una riga provider è un importo e basta,
 * quindi non si può dire a quale anno appartiene. Per questo entra nei totali di
 * periodo e nel margine complessivo, ma resta fuori dalla scomposizione per
 * anno, che continua a essere fatta di sole cifre con una data vera sopra.
 * L'alternativa — spalmarlo sulla durata del deal — avrebbe inventato una
 * distribuzione che il CRM non dichiara.
 *
 * Oggi la sezione è quasi sempre vuota, ed è normale: questo modulo esiste per
 * essere pronto quando verrà compilata. Finché è vuota non cambia un numero.
 */
const num = (v) => {
  const n = Number(String(v == null ? "" : v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const round = (n) => Math.round(n * 100) / 100;

/** Ultima lettura buona: un buco momentaneo non deve azzerare i costi esterni. */
let LAST = null;

/**
 * Le righe della subform, per deal.
 *
 * La subform è un modulo a sé in CRM (`Providers`), legato al deal da
 * `Parent_Id`. Si legge in COQL come qualsiasi altro modulo. Può rispondere
 * errore quando lo scope OAuth copre solo i Deals: in quel caso non è un guasto
 * da propagare, è semplicemente il ripiego sui totali del deal — ma va detto,
 * perché un costo che manca in silenzio è esattamente il problema che questo
 * modulo nasce per risolvere.
 */
async function fetchSubform(coql) {
  const rows = [];
  for (let page = 0; page < 20; page++) {
    const q =
      `select Parent_Id, Provider, Amount, Description from Providers ` +
      `limit ${page * 200}, 200`;
    const j = await coql(q);
    if (j === null) break; // 204: finite le righe
    if (j && j.status === "error") {
      throw new Error(`${j.code || "error"} — ${j.message || ""}`.trim());
    }
    const batch = (j && j.data) || [];
    for (const row of batch) {
      const parent = row.Parent_Id && (row.Parent_Id.id || row.Parent_Id);
      if (!parent) continue;
      rows.push({
        dealId: String(parent),
        provider: (row.Provider && (row.Provider.name || row.Provider.id)) || null,
        amount: round(num(row.Amount)),
        note: String(row.Description || "").trim() || null,
      });
    }
    if (batch.length < 200 || !j.info || !j.info.more_records) break;
  }
  return rows;
}

/**
 * Il costo esterno per deal.
 *
 * `deals` serve solo per i totali di ripiego: sono campi che arrivano già con la
 * lista dei deal, quindi non costano una chiamata in più. `coql` è il runner di
 * query del modulo chiamante: passarlo invece di importarlo evita una
 * dipendenza circolare fra questo file e quello che lo usa.
 */
export async function fetchProviderCosts(deals, coql) {
  const byDeal = {};
  let error = null;

  let subRows = [];
  try {
    subRows = await fetchSubform(coql);
    LAST = { at: Date.now(), rows: subRows };
  } catch (e) {
    if (LAST) subRows = LAST.rows;
    error = String(e.message || e).slice(0, 200);
  }

  for (const r of subRows) {
    const e = byDeal[r.dealId] || (byDeal[r.dealId] = { total: 0, rows: [], source: "subform" });
    e.total = round(e.total + r.amount);
    e.rows.push({ provider: r.provider, amount: r.amount, note: r.note });
  }

  // Ripiego: il totale scritto sul deal, quando la subform per quel deal è vuota.
  let fallbacks = 0, mismatches = 0;
  for (const d of deals || []) {
    const declared = round(num(d.providerTotal));
    if (!declared) continue;
    const id = String(d.id);
    const e = byDeal[id];
    if (!e) {
      byDeal[id] = { total: declared, rows: [], source: "deal_total" };
      fallbacks += 1;
    } else if (Math.abs(e.total - declared) >= 1) {
      // Non si corregge né si sceglie: si tiene il dettaglio e si segnala.
      e.declared = declared;
      mismatches += 1;
    }
  }

  return {
    byDeal,
    deals_with_cost: Object.keys(byDeal).length,
    from_subform: Object.values(byDeal).filter((e) => e.source === "subform").length,
    from_deal_total: fallbacks,
    // Deal in cui la somma delle righe non corrisponde al totale scritto a mano.
    mismatched: mismatches,
    stale: error && LAST ? new Date(LAST.at).toISOString() : null,
    error,
  };
}
