import SetupForm from "./SetupForm";
import { LOGO_DATA_URI } from "../../lib/logo";

export const dynamic = "force-dynamic";

export const metadata = { title: "Connect Zoho \u2014 Margin by Client" };

export default function Setup({ searchParams }) {
  const gate = process.env.ACCESS_TOKEN;
  const k = searchParams?.k || "";
  if (gate && k !== gate) {
    return (
      <div className="gate">
        <h2>Not authorised</h2>
        <p>Add the token to the address: <code>/setup?k=YOUR_ACCESS_TOKEN</code></p>
      </div>
    );
  }

  const ok = !!process.env.ZOHO_REFRESH_TOKEN;

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src={LOGO_DATA_URI} alt="Kleecks" />
            <h1>Connect Zoho</h1>
            <div className="beta">v.0.1 — Beta for testing</div>
          </div>
        </div>
      </header>
      <div className="shell" style={{ maxWidth: 720 }}>
        <p className="intro">
          Zoho does not hand over the permanent key in one go. It first issues a single-use code
          that lasts ten minutes; this page exchanges it for the permanent key, so no terminal
          is needed.
        </p>
        {ok && (
          <div className="notice">
            <div>
              <strong>A key is already configured</strong>
              <p>
                Running this again is fine: the new key replaces the old one once you save it on
                Vercel. Old keys stay valid until you revoke them in the Zoho console.
              </p>
            </div>
          </div>
        )}
        <SetupForm k={k} />
      </div>
    </>
  );
}
