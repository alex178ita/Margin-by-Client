"use client";

import { useState } from "react";

export default function SetupForm({ k }) {
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await fetch("/api/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k, client_id: id.trim(), client_secret: secret.trim(), code: code.trim() }),
      });
      const j = await r.json();
      if (j.refresh_token) setRes(j.refresh_token);
      else setErr(j.hint || j.error || "Unknown error");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="setup">
      <label htmlFor="cid">
        <b>1. Client ID</b>
        <span>Zoho console → your Self Client → <em>Client Secret</em> tab</span>
        <input id="cid" value={id} onChange={(e) => setId(e.target.value)}
               placeholder="1000.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" autoComplete="off" required />
      </label>

      <label htmlFor="csec">
        <b>2. Client Secret</b>
        <span>same screen, the line below</span>
        <input id="csec" value={secret} onChange={(e) => setSecret(e.target.value)}
               placeholder="paste here" autoComplete="off" required />
      </label>

      <label htmlFor="code">
        <b>3. The ten-minute code</b>
        <span>
          <em>Generate Code</em> tab. Paste this exact line into the scope field:
        </span>
        <code className="scopes">
          ZohoBooks.invoices.READ,ZohoProjects.portals.READ,ZohoProjects.projects.READ,ZohoAnalytics.data.read,ZohoCRM.coql.READ,ZohoCRM.modules.deals.READ
        </code>
        <span>Valid for 10 minutes. Copy the code and paste it here <b>straight away</b>.</span>
        <input id="code" value={code} onChange={(e) => setCode(e.target.value)}
               placeholder="1000.XXXXXXXX..." autoComplete="off" required />
      </label>

      <button type="submit" disabled={busy}>
        {busy ? "Exchanging…" : "Get the permanent key"}
      </button>

      {err && (
        <div className="out bad">
          <b>That did not work</b>
          <p>{err}</p>
        </div>
      )}

      {res && (
        <div className="out good">
          <b>Done. This is the permanent key.</b>
          <textarea readOnly id="rt" value={res} rows={3} onFocus={(e) => e.target.select()} />
          <button type="button" onClick={() => navigator.clipboard?.writeText(res)}>
            Copy
          </button>
          <p>
            Now on Vercel → Settings → Environment Variables → <code>ZOHO_REFRESH_TOKEN</code> → Edit →
            paste this value → Save. Then Deployments → Redeploy. This key does not expire.
          </p>
        </div>
      )}
    </form>
  );
}
