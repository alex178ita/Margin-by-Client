import Dashboard from "./Dashboard";
import seed from "../data/snapshot.json";
import { buildSnapshot } from "../lib/zoho";
import { tokenOk, roleFromCookies, redact, unlockAvailable } from "../lib/access";

export const revalidate = 86400;
export const dynamic = "force-dynamic";

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
