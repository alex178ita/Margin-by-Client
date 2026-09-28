/**
 * Lo snapshot messo per iscritto.
 *
 * Perché serve. Questa pagina ricostruiva tutto a ogni apertura: una decina di
 * job su Zoho Analytics, che li serve per coda e quando il workspace è carico
 * ci mette minuti. La cache c'era ma viveva nella memoria dell'istanza, e su
 * Vercel un'istanza nasce e muore di continuo: due aperture di fila finivano
 * quasi sempre su due processi diversi, quindi la cache non era una cache. Il
 * cron notturno costruiva uno snapshot buono che nessuno poi ritrovava, e chi
 * apriva alle nove di mattina rifaceva tutto il giro da capo — a volte senza
 * riuscirci, e allora leggeva "Zoho did not answer in time" e ricaricava, e la
 * fila ripartiva identica.
 *
 * Qui lo snapshot finisce in un Blob store di Vercel, che è condiviso fra tutte
 * le istanze e sopravvive ai riavvii. Il cron lo scrive una volta a notte, la
 * pagina lo legge in mezzo secondo, e Zoho viene interrogato una volta al
 * giorno invece di dieci volte per ogni apertura.
 *
 * Se il token del Blob non c'è, tutto continua a funzionare come prima: si
 * ricostruisce dal vivo. Un'app che si rompe perché manca una cache non è
 * un'app con una cache, è un'app con una dipendenza in più.
 */

const PREFIX = "snapshot/margin-by-client";
const KEY = PREFIX + ".json";

/** Il Blob è configurato? Senza token non si tenta nemmeno. */
export function storeReady() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Quanto può essere vecchio uno snapshot prima che valga la pena rifarlo.
 *
 * Quattordici ore, non dodici, perché il cron parte alle 06:00: dodici
 * coprirebbero fino alle 18:00 e chi apre la pagina alle sei e mezza di sera si
 * troverebbe la ricostruzione lenta addosso senza averla chiesta. Quattordici
 * arrivano alle 20:00 e la giornata è coperta tutta.
 */
export function maxAgeMs() {
  const h = Number(process.env.SNAPSHOT_MAX_AGE_HOURS || 14);
  return (h > 0 ? h : 14) * 3600 * 1000;
}

/**
 * Lo snapshot scritto, se c'è. Torna `null` in ogni caso storto — token
 * assente, file mai scritto, risposta illeggibile — perché chi chiama deve solo
 * sapere se ha qualcosa da mostrare, non perché non ce l'ha.
 */
export async function readSnapshot() {
  if (!storeReady()) return null;
  try {
    const { list } = await import("@vercel/blob");
    // Il nome porta un suffisso casuale, quindi si cerca per prefisso e si
    // tiene il più recente: se una pulizia è saltata ce n'è più di uno, e
    // servire il vecchio sarebbe peggio che non servire niente.
    const { blobs } = await list({ prefix: PREFIX });
    const b = (blobs || []).slice()
      .sort((x, y) => Date.parse(y.uploadedAt) - Date.parse(x.uploadedAt))[0];
    if (!b) return null;
    // `cache: "no-store"` perché il CDN di Vercel serve volentieri una copia di
    // dieci minuti fa, e su un dato che vale un giorno intero non si nota —
    // finché non si preme "aggiorna ora" e non cambia niente.
    const r = await fetch(b.url, { cache: "no-store" });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || !data.generated_at) return null;
    return { data, at: Date.parse(b.uploadedAt) || Date.parse(data.generated_at) || 0 };
  } catch (e) {
    return null;
  }
}

/**
 * Scrive lo snapshot. Non lancia mai: se il Blob rifiuta, la pagina che ha
 * appena costruito i dati li mostra lo stesso — perdere la scrittura è un
 * fastidio, perdere la risposta all'utente no.
 *
 * Torna il motivo del rifiuto quando c'è, così il refresh notturno può dirlo
 * invece di rispondere "ok" senza aver scritto niente.
 */
export async function writeSnapshot(data) {
  if (!storeReady()) return { ok: false, error: "no BLOB_READ_WRITE_TOKEN" };
  try {
    const { put, list, del } = await import("@vercel/blob");

    /**
     * Il suffisso casuale resta acceso, ed è una scelta di riservatezza.
     *
     * Il Blob di Vercel serve i file su URL pubblici: chi conosce l'indirizzo
     * legge, senza token e senza login. Qui dentro c'è il fatturato per
     * cliente, il costo reale e la tariffa oraria di ogni persona. Con un nome
     * fisso l'indirizzo sarebbe `…/snapshot/margin-by-client.json` e basterebbe
     * indovinare l'id dello store — che è l'unica parte difficile — per avere
     * tutto. Con il suffisso casuale l'indirizzo non si indovina, e l'unico
     * modo per scoprirlo è `list()`, che il token ce lo chiede.
     *
     * Il prezzo è che ogni scrittura crea un file nuovo, quindi subito dopo si
     * cancellano i precedenti: senza, in un mese sarebbero trenta copie dei
     * costi del personale sparse per lo store.
     */
    const r = await put(KEY, JSON.stringify(data), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: true,
    });

    try {
      const { blobs } = await list({ prefix: PREFIX });
      const old = (blobs || []).filter((b) => b.url !== r.url).map((b) => b.url);
      if (old.length) await del(old);
    } catch (e) {
      // Una pulizia mancata non è un motivo per dire che la scrittura è fallita:
      // il dato nuovo c'è, e readSnapshot prende comunque il più recente.
    }
    return { ok: true, url: r.url };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
