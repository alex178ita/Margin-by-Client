// Minimal Zoho Analytics client: OAuth refresh-token flow plus the bulk
// "export job" SQL API (create job -> poll -> download CSV).

const ACCOUNTS_DOMAIN = process.env.ZOHO_ACCOUNTS_DOMAIN || 'https://accounts.zoho.eu';
const ANALYTICS_DOMAIN = process.env.ZOHO_ANALYTICS_DOMAIN || 'https://analyticsapi.zoho.eu';
const ORG_ID = process.env.ZOHO_ANALYTICS_ORG_ID || '20070118906';
const WORKSPACE_ID = process.env.ZOHO_ANALYTICS_WORKSPACE_ID || '86612000000004001';

const POLL_INTERVAL_MS = 900;
const POLL_TIMEOUT_MS = 45_000;

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Set it in Vercel (Project Settings -> Environment Variables) and redeploy.`,
    );
  }
  return value;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const body = new URLSearchParams({
    refresh_token: required('ZOHO_REFRESH_TOKEN'),
    client_id: required('ZOHO_CLIENT_ID'),
    client_secret: required('ZOHO_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  });

  const res = await fetch(`${ACCOUNTS_DOMAIN}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const token = typeof json.access_token === 'string' ? json.access_token : null;
  if (!res.ok || !token) {
    throw new Error(
      `Zoho token refresh failed (${res.status}): ${JSON.stringify(json)}. ` +
        'Check ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN and that ZOHO_ACCOUNTS_DOMAIN matches the account data centre.',
    );
  }

  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  tokenCache = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

async function analyticsFetch(path: string, accessToken: string): Promise<Response> {
  return fetch(`${ANALYTICS_DOMAIN}${path}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'ZANALYTICS-ORGID': ORG_ID,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
}

/** RFC 4180-ish CSV parser: handles quoted fields, escaped quotes and embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; }
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') { field += ch; }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((key, idx) => { obj[key] = (r[idx] ?? '').trim(); });
      return obj;
    });
}

/**
 * Run a SQL query against the Zoho Analytics workspace and return the rows.
 * Uses the asynchronous bulk export API, which is the only one that accepts
 * arbitrary SQL.
 */
export async function runQuery(sql: string): Promise<Record<string, string>[]> {
  const accessToken = await getAccessToken();
  const config = encodeURIComponent(JSON.stringify({ responseFormat: 'csv', sqlQuery: sql }));

  const createRes = await fetch(
    `${ANALYTICS_DOMAIN}/restapi/v2/bulk/workspaces/${WORKSPACE_ID}/data?CONFIG=${config}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'ZANALYTICS-ORGID': ORG_ID,
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  );

  const createJson = (await createRes.json().catch(() => ({}))) as any;
  const jobId: string | undefined = createJson?.data?.jobId;
  if (!createRes.ok || !jobId) {
    throw new Error(`Zoho Analytics rejected the query (${createRes.status}): ${JSON.stringify(createJson)}`);
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let status = '';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await analyticsFetch(
      `/restapi/v2/bulk/workspaces/${WORKSPACE_ID}/exportjobs/${jobId}`,
      accessToken,
    );
    const pollJson = (await pollRes.json().catch(() => ({}))) as any;
    status = String(pollJson?.data?.jobStatus ?? '').toUpperCase();
    if (status.includes('COMPLETED')) break;
    if (status.includes('FAIL') || status.includes('ERROR')) {
      throw new Error(`Zoho Analytics export job failed: ${JSON.stringify(pollJson)}`);
    }
  }
  if (!status.includes('COMPLETED')) {
    throw new Error('Zoho Analytics export job timed out.');
  }

  const dataRes = await analyticsFetch(
    `/restapi/v2/bulk/workspaces/${WORKSPACE_ID}/exportjobs/${jobId}/data`,
    accessToken,
  );
  if (!dataRes.ok) {
    throw new Error(`Zoho Analytics download failed (${dataRes.status}): ${await dataRes.text()}`);
  }

  return rowsToObjects(parseCsv(await dataRes.text()));
}

export function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
