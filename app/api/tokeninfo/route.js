import { tokenInfo } from "../../../lib/zoho";

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
    return Response.json(await tokenInfo());
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
