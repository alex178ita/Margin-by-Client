export const dynamic = "force-dynamic";

/**
 * Scambia il grant code usa-e-getta della console Zoho con un refresh token.
 * Esiste per evitare che l'operazione richieda una chiamata curl a mano.
 * Protetta dallo stesso ACCESS_TOKEN della pagina.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  const gate = process.env.ACCESS_TOKEN;
  if (gate && body.k !== gate) {
    return Response.json({ error: "not authorised" }, { status: 401 });
  }

  const { client_id, client_secret, code } = body;
  if (!client_id || !client_secret || !code) {
    return Response.json({ error: "Client ID, Client Secret and code are all required" }, { status: 400 });
  }

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id, client_secret, code,
  });

  let j;
  try {
    const r = await fetch("https://accounts.zoho.eu/oauth/v2/token", { method: "POST", body: form });
    j = await r.json();
  } catch (e) {
    return Response.json({ error: "Zoho unreachable: " + e.message }, { status: 502 });
  }

  if (j.refresh_token) {
    return Response.json({ refresh_token: j.refresh_token, api_domain: j.api_domain || null });
  }

  // Traduzione degli errori Zoho in qualcosa di azionabile.
  const HINTS = {
    invalid_code:
      "The code is no longer valid. That happens when more than 10 minutes have passed, when it has " +
      "already been used once, or when it was generated on the .com console instead of api-console.zoho.eu. " +
      "Go back to Generate Code, create a fresh one and paste it here straight away.",
    invalid_client:
      "Client ID or Client Secret do not match. Copy them again from the Self Client's Client Secret tab, " +
      "making sure there are no leading or trailing spaces.",
    invalid_client_secret:
      "The Client Secret is wrong. Copy it again from the Self Client's Client Secret tab.",
    redirect_uri_mismatch:
      "The registered client is not a Self Client. Create a new one in the console and choose Self Client.",
    invalid_scope:
      "One of the scopes was not recognised. Regenerate the code using exactly the scope line shown above; " +
      "if Analytics is rejected, try ZohoAnalytics.fullaccess.all instead.",
  };

  return Response.json({
    error: j.error || "unexpected response from Zoho",
    hint: HINTS[j.error] || ("Zoho replied: " + JSON.stringify(j)),
  }, { status: 400 });
}
