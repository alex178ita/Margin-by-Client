import { checkPassword, unlockCookieValue, COOKIE } from "../../../lib/access";
import { cookies } from "next/headers";

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

  // cookies().set invece di comporre l'intestazione a mano: la scrittura del
  // cookie la fa Next, e non si perde per strada.
  cookies().set({
    name: COOKIE,
    value: unlockCookieValue(),
    httpOnly: true,
    secure: true,
    sameSite: "none",   // la dashboard vive dentro l'iframe del Web Tab del CRM
    path: "/",
    maxAge: 28800,
  });
  return Response.json({ ok: true });
}

/** Richiude: utile su un computer condiviso. */
export async function DELETE() {
  cookies().set({ name: COOKIE, value: "", httpOnly: true, secure: true,
                  sameSite: "none", path: "/", maxAge: 0 });
  return Response.json({ ok: true });
}
