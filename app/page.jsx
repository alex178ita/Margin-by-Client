import Dashboard from "./Dashboard";
import seed from "../data/snapshot.json";
import { buildSnapshot } from "../lib/zoho";
import { tokenOk, roleFromCookies, redact, unlockAvailable } from "../lib/access";

export const dynamic = "force-dynamic";
/**
 * Cinque minuti, come ogni endpoint di questa app.
 *
 * Era l'unica funzione senza: tutte le route sotto /api dichiarano 300, la
 * pagina no, e girava con il limite predefinito della piattaforma mentre il
 * codice dietro si dà un budget di 260 secondi per interrogare Analytics. Due
 * numeri che non si parlano, e chi si ferma per primo decide il risultato.
 */
export const maxDuration = 300;
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default async function Page({ searchParams }) {
  if (!tokenOk(searchParams?.k)) {
    return (
      <div className="gate">
        <h2>Not authorised</h2>
        <p>
          This page only opens with the access token in the address. If you came from the
          CRM, the Web Tab needs to be updated with the full link.
        </p>
      </div>
    );
  }

  let snap = seed;
  let warning = null;

  if (process.env.ZOHO_REFRESH_TOKEN) {
    try {
      snap = await buildSnapshot();
    } catch (e) {
      warning = "Zoho could not be reached, so there is nothing to show.\n" + e.message +
        "\nFor the raw answer from Analytics on its own, open /api/costdebug?k=<token>.";
    }
  } else {
    warning =
      "Zoho credentials are not configured, so there is nothing to show. " +
      "Connect Zoho from /setup?k=<token>.";
  }

  // Il token serve anche ai link di export: stessa porta, stesso lucchetto.
  // La vista ridotta viene tagliata qui, sul server: al browser non arriva.
  const role = roleFromCookies();
  return (
    <Dashboard
      snap={role === "viewer" ? redact(snap) : snap}
      warning={warning}
      role={role}
      canUnlock={unlockAvailable()}
      token={searchParams?.k || ""}
    />
  );
}
