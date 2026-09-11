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
 * Quello che la vista ridotta non deve vedere viene tolto qui, sul server.
 * Restano il margine per cliente, il costo per progetto e le ore totali: sparisce
 * il dettaglio per persona, che è l'unico punto in cui una tariffa individuale
 * si legge in chiaro.
 */
export function redact(snap) {
  return {
    ...snap,
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
