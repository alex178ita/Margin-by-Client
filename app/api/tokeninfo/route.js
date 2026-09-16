import { tokenInfo } from "../../../lib/zoho";
import { roleFromCookies, unlockAvailable } from "../../../lib/access";

export const dynamic = "force-dynamic";

/**
 * Che deleghe ha davvero il token, secondo Zoho. Nessun segreto nella risposta:
 * del client id e del refresh token escono solo le ultime sei cifre, utili a
 * capire se su Vercel c'è il valore che pensiamo.
 *   /api/tokeninfo?k=<token>
 */
export async function GET(request) {
  const gate = process.env.ACCESS_TOKEN;
  const key = new URL(request.url).searchParams.get("k");
  if (gate && key !== gate) {
    return Response.json({ ok: false, error: "not authorised" }, { status: 401 });
  }
  try {
    const pw = (process.env.COST_PASSWORD || "");
    return Response.json({
      ...(await tokenInfo()),
      // Stato del lucchetto sui costi, senza rivelare la password: se lo
      // sblocco non funziona, qui si vede da che parte sta il problema.
      cost_lock: {
        password_configured: unlockAvailable(),
        password_length: pw ? pw.trim().length : 0,
        password_has_spaces_at_the_ends: pw !== pw.trim(),
        this_browser: roleFromCookies() === "full" ? "unlocked" : "locked",
      },
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
