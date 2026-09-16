import { checkPassword, unlockCookieValue, COOKIE } from "../../../lib/access";

export const dynamic = "force-dynamic";

/**
 * Sblocca i costi interni per questo browser. La password arriva nel corpo
 * della richiesta, mai nell'indirizzo, e torna indietro come cookie httpOnly:
 * il codice della pagina non può rileggerla, e non finisce in cronologia.
 * SameSite=None perché la dashboard vive dentro l'iframe del Web Tab del CRM.
 */
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch (e) { /* corpo vuoto */ }

  if (!process.env.COST_PASSWORD) {
    return Response.json({
      ok: false,
      error: "There is no password set on this deployment, so there is nothing to unlock. " +
             "Add COST_PASSWORD in the Vercel project and redeploy.",
    }, { status: 501 });
  }

  if (!checkPassword(body.password)) {
    // Una pausa breve: rende noioso provare le password a raffica.
    await new Promise((r) => setTimeout(r, 700));
    return Response.json({ ok: false, error: "That password does not open the internal costs." },
                         { status: 401 });
  }

  // Dentro il Web Tab la dashboard è un iframe su vercel.app dentro una pagina
  // zoho.eu: per il browser questo cookie è di terza parte, e Safari li blocca
  // da anni mentre Chrome li sta dismettendo. `Partitioned` (CHIPS) è la
  // risposta prevista per questo caso: il cookie esiste, ma in un cassetto
  // riservato alla coppia zoho.eu + vercel.app, e non serve a tracciare nessuno.
  // Si scrive a mano perché l'API dei cookie di Next non conosce ancora
  // quell'attributo. Ne mettiamo due: il secondo per i browser che ignorano
  // Partitioned e userebbero comunque quello normale.
  const value = unlockCookieValue();
  const base = `Path=/; HttpOnly; Secure; SameSite=None; Max-Age=28800`;
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${COOKIE}=${value}; ${base}; Partitioned`);
  res.headers.append("Set-Cookie", `${COOKIE}=${value}; ${base}`);
  return res;
}

/** Richiude: utile su un computer condiviso. */
export async function DELETE() {
  const base = "Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0";
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${COOKIE}=; ${base}; Partitioned`);
  res.headers.append("Set-Cookie", `${COOKIE}=; ${base}`);
  return res;
}
