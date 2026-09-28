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

/**
 * L'esito dell'ultima scrittura, tenuto da parte.
 *
 * Serve perché non c'era modo di sapere se il salvataggio funzionasse: la
 * pagina mostra l'ora del dato salvato solo quando lo serve, quindi "non
 * configurato", "configurato male" e "appena costruito" si presentavano tutti e
 * tre allo stesso modo — nessuna riga, nessun errore, niente da capire.
 */
let LAST_WRITE = null;
export function lastWrite() { return LAST_WRITE; }

/**
 * Il Blob è raggiungibile?
 *
 * Non si guarda più una variabile sola. Collegando uno store al progetto,
 * Vercel ha scritto `BLOB_STORE_ID` e `BLOB_WEBHOOK_PUBLIC_KEY` ma non
 * `BLOB_READ_WRITE_TOKEN`, che è quella che questo codice pretendeva: lo store
 * era collegato, e l'app non ci provava nemmeno — senza dirlo a nessuno.
 *
 * Indovinare quale variabile guardare è il modo sbagliato di porre la domanda.
 * Se ce n'è una qualsiasi che indica uno store, si prova: l'SDK si autentica
 * come sa, con il token esplicito o con l'identità del progetto, e se non ci
 * riesce lo dice lui — con un errore che finisce in `lastWrite()` e a schermo.
 * Meglio un tentativo che fallisce a voce alta di un silenzio che sembra una
 * scelta.
 */
export function storeReady() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
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
  if (!storeReady()) {
    LAST_WRITE = { at: Date.now(), ok: false,
      error: "no Blob store in this deployment: neither BLOB_READ_WRITE_TOKEN nor BLOB_STORE_ID " +
             "is set. Connect a Blob store to the project, then redeploy." };
    return LAST_WRITE;
  }
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
    // L'URL non si registra: è pubblico, e un indirizzo che dà accesso ai costi
    // del personale non va lasciato in giro per diagnostica.
    LAST_WRITE = { at: Date.now(), ok: true, bytes: JSON.stringify(data).length };
    return { ok: true, url: r.url };
  } catch (e) {
    LAST_WRITE = { at: Date.now(), ok: false, error: e.message };
    return LAST_WRITE;
  }
}
