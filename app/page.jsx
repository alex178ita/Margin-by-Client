import Dashboard from "./Dashboard";
import seed from "../data/snapshot.json";
import { buildSnapshot } from "../lib/zoho";

export const revalidate = 86400;
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }) {
  const gate = process.env.ACCESS_TOKEN;
  if (gate && (searchParams?.k || "") !== gate) {
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
      warning = "Zoho could not be reached, so there is nothing to show: " + e.message +
        "  \u2014 if it mentions OAuth, reconnect from /setup?k=<token>.";
    }
  } else {
    warning =
      "Zoho credentials are not configured, so there is nothing to show. " +
      "Connect Zoho from /setup?k=<token>.";
  }

  // Il token serve anche ai link di export: stessa porta, stesso lucchetto.
  return <Dashboard snap={snap} warning={warning} token={searchParams?.k || ""} />;
}
