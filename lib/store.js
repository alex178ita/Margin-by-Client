/**
 * Lo snapshot messo per iscritto.
 *
 * Perché serve. Questa pagina ricostruiva tutto a ogni apertura: una decina di
 * job su Zoho Analytics, che li serve per coda. Misurato in produzione: 161
 * secondi. La cache c'era ma viveva nella memoria dell'istanza, e su Vercel
 * un'istanza nasce e muore di continuo, quindi due aperture di fila finivano
 * quasi sempre su due processi diversi e la cache non era una cache. Il cron
 * costruiva uno snapshot buono che nessuno poi ritrovava.
 *
 * Qui lo snapshot finisce in un Blob store di Vercel, condiviso fra tutte le
 * istanze e che sopravvive ai riavvii. Il cron lo scrive la mattina, la pagina
 * lo legge in mezzo secondo, e Zoho viene interrogato una volta al giorno
 * invece di dieci volte per ogni apertura.
 *
 * Due cose imparate a spese nostre, scritte qui perché non si ripetano.
 *
 * La prima: la versione dell'SDK. Era stata fissata a `^0.27` andando a
 * memoria; l'attuale è la 2.x, nove major più avanti, e la 0.27 conosceva solo
 * `BLOB_READ_WRITE_TOKEN`. Collegando uno store al progetto, Vercel oggi quel
 * token non lo crea più: inietta `BLOB_STORE_ID` e lascia che l'SDK si
 * autentichi con l'identità del progetto (`VERCEL_OIDC_TOKEN`). Risultato:
 * store collegato, codice che pretendeva un token che nessuno avrebbe mai
 * creato, e un "No token found" che sembrava un errore di configurazione.
 *
 * La seconda: l'accesso. La 0.27 sapeva servire solo file pubblici, cioè
 * leggibili da chiunque conosca l'indirizzo — e qui dentro c'è il fatturato per
 * cliente, il costo reale e la tariffa oraria di ogni persona. Si era rimediato
 * con un nome imprevedibile, che è sicurezza per oscurità. La 2.x ha
 * `access: 'private'`: il file non è raggiungibile senza credenziali, il nome
 * può tornare fisso e la copia vecchia si sovrascrive invece di accumularsi.
 *
 * Se lo store non c'è, tutto continua a funzionare come prima: si ricostruisce
 * dal vivo. Un'app che si rompe perché manca una cache non è un'app con una
 * cache, è un'app con una dipendenza in più.
 */

const KEY = "snapshot/margin-by-client.json";

/** Privato: il file non si legge senza credenziali dello store. */
const AUTH = { access: "private" };

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
 * Lo store è raggiungibile?
 *
 * Due strade, e ne basta una: `BLOB_STORE_ID`, che Vercel inietta collegando lo
 * store e che l'SDK usa insieme all'identità del progetto; oppure
 * `BLOB_READ_WRITE_TOKEN`, il token esplicito, per quando si gira fuori da
 * Vercel. Controllarne una sola era il motivo per cui l'app non ci provava
 * nemmeno.
 */
export function storeReady() {
  return !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
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
 * Lo snapshot scritto, se c'è. Torna `null` in ogni caso storto — store
 * assente, file mai scritto, risposta illeggibile — perché chi chiama deve solo
 * sapere se ha qualcosa da mostrare, non perché non ce l'ha.
 *
 * L'ora non viene dai metadati del file ma da `generated_at` dentro lo
 * snapshot: è il momento in cui i dati sono stati letti da Zoho, che è la cosa
 * che conta, e risparmia una chiamata.
 */
export async function readSnapshot() {
  if (!storeReady()) return null;
  try {
    const { get } = await import("@vercel/blob");
    // `useCache: false` perché il CDN serve volentieri una copia di dieci
    // minuti fa: su un dato che vale un giorno non si noterebbe, finché non si
    // preme "rileggi" e non cambia niente.
    const r = await get(KEY, { ...AUTH, useCache: false });
    if (!r || !r.stream) return null;
    const data = await new Response(r.stream).json();
    if (!data || !data.generated_at) return null;
    return { data, at: Date.parse(data.generated_at) || 0 };
  } catch (e) {
    // Il primo giro non trova niente, ed è normale: non è un errore da urlare.
    return null;
  }
}

/**
 * Scrive lo snapshot. Non lancia mai: se lo store rifiuta, la pagina che ha
 * appena costruito i dati li mostra lo stesso — perdere la scrittura è un
 * fastidio, perdere la risposta all'utente no.
 */
export async function writeSnapshot(data) {
  if (!storeReady()) {
    LAST_WRITE = { at: Date.now(), ok: false,
      error: "no Blob store in this deployment: neither BLOB_STORE_ID nor " +
             "BLOB_READ_WRITE_TOKEN is set. Connect a Blob store to the project, then redeploy." };
    return LAST_WRITE;
  }
  try {
    const { put } = await import("@vercel/blob");
    const body = JSON.stringify(data);
    await put(KEY, body, {
      ...AUTH,
      contentType: "application/json",
      // Nome fisso e sovrascrittura: lo snapshot è uno. Con il file privato non
      // serve più renderlo imprevedibile, quindi non serve nemmeno accumulare
      // copie da ripulire.
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    LAST_WRITE = { at: Date.now(), ok: true, bytes: body.length };
    return LAST_WRITE;
  } catch (e) {
    LAST_WRITE = { at: Date.now(), ok: false, error: e.message };
    return LAST_WRITE;
  }
}
