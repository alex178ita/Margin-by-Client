import { checkPassword, COOKIE } from "../../../lib/access";

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

  if (!checkPassword(body.password)) {
    // Una pausa breve: rende noioso provare le password a raffica.
    await new Promise((r) => setTimeout(r, 700));
    return Response.json({ ok: false, error: "That password does not open the internal costs." },
                         { status: 401 });
  }

  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie",
    `${COOKIE}=${encodeURIComponent(String(body.password).trim())}; Path=/; HttpOnly; Secure; ` +
    "SameSite=None; Max-Age=28800");
  return res;
}

/** Richiude: utile su un computer condiviso. */
export async function DELETE() {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`);
  return res;
}
