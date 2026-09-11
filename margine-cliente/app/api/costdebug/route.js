import { costDiagnostics } from "../../../lib/zoho";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Mostra il dato grezzo che Analytics restituisce, accanto agli ID progetto
 * di Zoho Projects. Serve solo a capire perché i costi non si agganciano.
 * Non espone credenziali: solo nomi di colonna, ID e importi.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET || process.env.ACCESS_TOKEN;
  const key = new URL(request.url).searchParams.get("k");
  if (secret && key !== secret) {
    return Response.json({ ok: false, error: "non autorizzato" }, { status: 401 });
  }
  try {
    const d = await costDiagnostics();
    return Response.json({ ok: true, ...d });
  } catch (e) {
    // Anche fallendo, l'elenco dei tentativi dice quale forma di chiamata usare.
    const { LAST_JOB_ATTEMPTS: attempts } = await import("../../../lib/zoho");
    return Response.json({ ok: false, error: e.message, attempts }, { status: 500 });
  }
}
