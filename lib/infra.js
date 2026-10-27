/**
 * Il costo dell'infrastruttura, per cliente.
 *
 * Perché sta fuori dal CRM. Server, licenze di piattaforma, banda: sono costi
 * che il cliente genera ma che nessun deal dichiara, e che vivono in un sistema
 * loro. Questa dashboard li legge da un indirizzo che li espone già aggregati
 * per cliente, senza sapere nulla di come vengono calcolati: qui arrivano
 * numeri, non logica.
 *
 * Perché solo sul cliente. Un server non appartiene a un progetto. Dividerlo fra
 * i progetti in proporzione alle ore darebbe numeri più ricchi e più falsi: il
 * costo infrastrutturale pesa sul margine totale del cliente, e lì resta.
 *
 * Che forma deve avere la risposta. JSON, una delle due:
 *
 *   [ { "client": "Fendi", "amount": 1234.56, "period": "2026", "note": "..." }, ... ]
 *   { "Fendi": 1234.56, "Bulgari": 987.0 }
 *
 * Il nome del cliente è quello che si vede in dashboard. Quando non corrisponde
 * a nessun cliente, la riga non viene buttata: finisce fra quelle non abbinate e
 * si vede, perché un costo che sparisce per un nome scritto diverso è il modo
 * più silenzioso di sbagliare un margine.
 *
 * Senza `INFRA_URL` configurato non succede niente: nessuna chiamata, nessuna
 * riga, la dashboard resta quella di prima.
 */

const num = (v) => {
  const n = Number(String(v == null ? "" : v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const round = (n) => Math.round(n * 100) / 100;
const key = (s) => String(s || "").toLowerCase().normalize("NFKD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

let LAST = null;

export function infraConfigured() {
  return !!String(process.env.INFRA_URL || "").trim();
}

/**
 * Legge i costi infrastrutturali. Non lancia mai: se l'indirizzo non risponde la
 * dashboard deve aprirsi lo stesso, con il margine di prima e un avviso.
 */
export async function fetchInfraCosts() {
  const url = String(process.env.INFRA_URL || "").trim();
  if (!url) return { rows: [], configured: false, error: null };

  const headers = { Accept: "application/json" };
  const token = String(process.env.INFRA_TOKEN || "").trim();
  // In un header, mai nell'indirizzo: un URL finisce nei log del proxy.
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    const rows = [];
    if (Array.isArray(json)) {
      for (const r of json) {
        const name = String(r.client || r.name || "").trim();
        if (!name) continue;
        rows.push({
          client: name, key: key(name), amount: round(num(r.amount ?? r.cost)),
          period: String(r.period || "").trim() || null,
          note: String(r.note || "").trim() || null,
        });
      }
    } else if (json && typeof json === "object") {
      for (const [name, v] of Object.entries(json)) {
        if (!name) continue;
        rows.push({ client: name, key: key(name), amount: round(num(v)), period: null, note: null });
      }
    }

    LAST = { at: Date.now(), rows };
    return { rows, configured: true, error: null, at: new Date().toISOString() };
  } catch (e) {
    // Un buco momentaneo non deve far sparire il costo da tutta la pagina.
    if (LAST) {
      return {
        rows: LAST.rows, configured: true, error: null,
        stale: new Date(LAST.at).toISOString(),
      };
    }
    return { rows: [], configured: true, error: String(e.message || e).slice(0, 200) };
  }
}

/**
 * Abbinare i nomi, senza indovinare.
 *
 * Il problema e' reale: di qua il cliente si chiama "Fendi", di la' "FENDI
 * S.R.L."; di qua "Haier / Candy Hoover", di la' "Haier", che e' il nome del
 * sito. Chiedere che i due sistemi scrivano i nomi uguali non funzionera' mai.
 *
 * Ma una somiglianza approssimativa qui e' peggio di un mancato abbinamento. Un
 * costo infrastrutturale appiccicato al cliente sbagliato non si vede piu': due
 * margini sono falsi e nessuno dei due sembra strano. Quindi niente distanza di
 * edit, niente "si assomigliano abbastanza". Si procede per livelli, ognuno dei
 * quali si puo' spiegare a voce:
 *
 *   1. alias dichiarati a mano (INFRA_ALIASES) — l'ultima parola e' di chi sa
 *   2. nome identico, a meno di maiuscole, accenti e punteggiatura
 *   3. uno dei nomi che il cliente ha davvero: le ragioni sociali che fatturano,
 *      i nomi del CRM e quelli usati nei progetti
 *   4. le parole che contano di un nome sono tutte dentro l'altro, tolte le
 *      forme societarie: {fendi} dentro {fendi}, {candy, hoover} dentro
 *      {haier, candy, hoover}
 *
 * Due regole che valgono piu' dei livelli. Se una riga puo' andare su due
 * clienti diversi non va su nessuno: resta non abbinata e dice fra quali era
 * indecisa. E ogni abbinamento porta scritto come e' stato fatto, perche' uno
 * sbagliato si corregge solo se qualcuno riesce a vederlo.
 */
const LEGAL = new Set([
  "srl", "s", "r", "l", "spa", "sp", "sa", "sas", "snc", "sarl", "srls",
  "ltd", "limited", "plc", "inc", "llc", "corp", "co", "company",
  "gmbh", "ag", "bv", "nv", "ab", "oy", "as", "aps", "pte",
  "group", "groupe", "gruppo", "holding", "holdings", "societa", "benefit",
  "italia", "italy", "international", "europe", "eu", "and", "the", "di", "de",
]);

const tokens = (s) => key(s).split(" ").filter((t) => t.length > 1 && !LEGAL.has(t));

const subset = (a, b) => a.length > 0 && a.every((t) => b.includes(t));

/**
 * Gli abbinamenti decisi a mano, in ordine di autorita'.
 *
 * Prima il file `infra-map.js`, che e' la tabella validata e sta nel repo con la
 * sua storia; poi `INFRA_ALIASES` su Vercel, che la sovrascrive e serve a
 * rimediare a una riga sbagliata senza aspettare un deploy.
 *
 * Un valore `null` o vuoto non e' un buco: e' "questa riga non va su nessun
 * cliente", scritto apposta. Chi lo legge deve distinguerlo da un nome mai
 * visto, perche' il primo e' una decisione e il secondo una svista.
 */
function declaredAliases(fileMap) {
  const out = new Map();
  for (const [k, v] of Object.entries(fileMap || {})) {
    out.set(key(k), v == null || v === "" ? null : String(v));
  }
  const raw = String(process.env.INFRA_ALIASES || "").trim();
  if (raw) {
    try {
      for (const [k, v] of Object.entries(JSON.parse(raw))) {
        out.set(key(k), v == null || v === "" ? null : String(v));
      }
    } catch (e) { /* un JSON storto non deve far cadere la pagina */ }
  }
  return out;
}

/**
 * I nomi sotto cui un cliente puo' presentarsi. Oltre a quello in dashboard ci
 * sono le ragioni sociali che gli fatturano — che la dashboard conosce gia' — e
 * le tabelle del modello cliente, dove "CANDY HOOVER GROUP S.R.L." e
 * "Haier / Candy Hoover" sono due facce della stessa riga.
 */
function spellings(client, tables) {
  const out = new Set([client.name, ...(client.aliases || [])]);
  for (const [k, v] of Object.entries(tables.display || {})) if (v === client.name) out.add(k);
  for (const [k, v] of Object.entries(tables.groups || {})) if (v === client.name) out.add(k);
  for (const [k, v] of Object.entries(tables.projectAliases || {})) if (v === client.name) out.add(k);
  return [...out].filter(Boolean);
}

export function matchInfra(rows, clients, tables, fileMap) {
  const t = tables || {};
  const declared = declaredAliases(fileMap);
  const byName = new Map();
  const index = [];
  for (const c of clients || []) {
    const entry = typeof c === "string" ? { name: c, aliases: [] } : c;
    byName.set(entry.name, entry);
    const names = spellings(entry, t);
    index.push({
      name: entry.name,
      keys: new Set(names.map(key)),
      tokenSets: names.map(tokens).filter((x) => x.length),
    });
  }

  const byClient = {};
  const unmatched = [];
  const add = (name, r, how) => {
    const e = byClient[name] || (byClient[name] = { amount: 0, rows: [] });
    e.amount = round(e.amount + r.amount);
    e.rows.push({ amount: r.amount, period: r.period, note: r.note, source: r.client, how });
  };

  for (const r of rows || []) {
    // 1. abbinamento deciso a mano
    if (declared.has(r.key)) {
      const forced = declared.get(r.key);
      if (forced === null) {
        // Deciso di non contarla: si dichiara, non si nasconde.
        unmatched.push({ client: r.client, amount: r.amount,
                         why: "set aside on purpose in the mapping table", decided: true });
        continue;
      }
      if (byName.has(forced)) { add(forced, r, "mapping table"); continue; }
      unmatched.push({ client: r.client, amount: r.amount,
                       why: `the mapping table points at "${forced}", which is not a client here` });
      continue;
    }

    // 2. e 3. nome identico, o uno dei nomi che quel cliente ha davvero
    let hits = index.filter((c) => c.keys.has(r.key));
    let how = hits.length ? "name" : null;

    // 4. parole che contano, in un verso o nell'altro
    if (!hits.length) {
      const rt = tokens(r.client);
      if (rt.length) {
        hits = index.filter((c) => c.tokenSets.some((ts) => subset(rt, ts) || subset(ts, rt)));
        how = "words in the name";
      }
    }

    if (hits.length === 1) { add(hits[0].name, r, how); continue; }
    if (hits.length > 1) {
      // Meglio nessun abbinamento che quello sbagliato: qui serve un alias.
      unmatched.push({
        client: r.client, amount: r.amount,
        why: `could be ${hits.slice(0, 4).map((h) => h.name).join(" or ")} — ` +
             `add it to INFRA_ALIASES to settle it`,
      });
      continue;
    }
    unmatched.push({ client: r.client, amount: r.amount, why: "no client here goes by that name" });
  }

  return {
    byClient,
    unmatched,
    // Quanti abbinamenti sono stati dedotti invece che letti: va guardato.
    fuzzy: Object.values(byClient)
      .flatMap((e) => e.rows).filter((x) => x.how === "words in the name").length,
    /**
     * La tabella di mappatura cosi' come sarebbe oggi: ogni nome della fonte con
     * il cliente su cui finisce, e `null` dove non si abbina. E' la proposta da
     * controllare e incollare in `infra-map.js`, invece di scriverla a mano
     * leggendo due elenchi affiancati.
     */
    proposal: Object.fromEntries([
      ...Object.entries(byClient).flatMap(([name, e]) =>
        e.rows.map((x) => [x.source || name, name])),
      ...unmatched.map((u) => [u.client, null]),
    ]),
  };
}
