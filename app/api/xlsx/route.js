import JSZip from "jszip";
import { loadDataset, exportTargets } from "../../../lib/dataset";
import { fetchRatePlan } from "../../../lib/zoho";
import { dealWorkbook, projectWorkbook, clientWorkbook, missingLinkWorkbook, missingRatesWorkbook, ratePlanWorkbook, dashboardWorkbook, fileName } from "../../../lib/xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Excel di dettaglio.
 *   /api/xlsx?k=<token>&type=deal&id=<dealId>
 *   /api/xlsx?k=<token>&type=project&id=<projectId>
 *   /api/xlsx?k=<token>&type=client&id=<client name>
 *   /api/xlsx?k=<token>&type=dashboard&year=..  -> la dashboard come la vedi
 *   /api/xlsx?k=<token>&type=missing            -> progetti senza CRMid
 *   /api/xlsx?k=<token>&type=rates              -> ore a tariffa zero
 *   /api/xlsx?k=<token>&type=rateplan&year=2026 -> anteprima allineamento tariffe
 *   /api/xlsx?k=<token>&type=all               -> zip
 */
export async function GET(request) {
  const url = new URL(request.url);
  const gate = process.env.ACCESS_TOKEN;
  if (gate && url.searchParams.get("k") !== gate) {
    return Response.json({ ok: false, error: "not authorised" }, { status: 401 });
  }

  const type = (url.searchParams.get("type") || "").toLowerCase();
  const id = url.searchParams.get("id") || "";

  try {
    // L'anteprima tariffe non ha bisogno dell'intero dataset: una query sola.
    if (type === "rateplan") {
      const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
      const wb = await ratePlanWorkbook(await fetchRatePlan(year), year);
      return new Response(await wb.xlsx.writeBuffer(), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="rate_plan_${year}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const ctx = await loadDataset();

    if (type === "dashboard") {
      const wb = await dashboardWorkbook(ctx, {
        year: url.searchParams.get("year") || "all",
        q: url.searchParams.get("q") || "",
        noExecus: url.searchParams.get("execus") === "0",
      });
      const y = url.searchParams.get("year") || "all";
      return new Response(await wb.xlsx.writeBuffer(), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="margin_by_clients_${y}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (type === "missing" || type === "rates") {
      const wb = type === "rates" ? await missingRatesWorkbook(ctx) : await missingLinkWorkbook(ctx);
      const buf = await wb.xlsx.writeBuffer();
      return new Response(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${type === "rates" ? "hourly_rates_missing" : "crmid_missing"}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (type === "deal" || type === "project" || type === "client") {
      const { wb, name } = await one(ctx, type, id);
      const buf = await wb.xlsx.writeBuffer();
      return new Response(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${name}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (type === "all" || type === "deals" || type === "projects" || type === "clients") {
      const { zip } = await everything(ctx, type);
      // Una serverless function di Vercel non può restituire più di 4,5 MB:
      // oltre, la risposta viene troncata e il browser riporta solo
      // "Load failed", senza che nei log compaia nulla. Meglio dirlo.
      if (zip.length > 4_000_000) {
        return Response.json({
          ok: false,
          error: `That selection is ${(zip.length / 1048576).toFixed(1)} MB and a download can carry at ` +
                 "most 4.5 MB. Download the three sets separately.",
        }, { status: 413 });
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const label = type === "all" ? "detail" : type;
      return new Response(zip, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": String(zip.length),
          "Content-Disposition": `attachment; filename="margin_${label}_${stamp}.zip"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return Response.json({
      ok: false,
      error: "unknown type: use deal, project, client, deals, projects, clients or all",
    }, { status: 400 });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

async function one(ctx, type, id) {
  if (type === "deal") {
    const wb = await dealWorkbook(ctx, id);
    const d = ctx.dealById.get(String(id));
    return { wb, name: fileName("deal", (d && d.name) || id) };
  }
  if (type === "project") {
    const wb = await projectWorkbook(ctx, id);
    const p = ctx.projects.find((x) => x.id === String(id));
    return { wb, name: fileName("project", (p && p.n) || id) };
  }
  const wb = await clientWorkbook(ctx, id);
  return { wb, name: fileName("client", id) };
}

/**
 * Un file per deal e uno per progetto, come chiesto: il taglio per deal e il
 * taglio per progetto non coincidono, quindi si producono entrambi.
 */
async function everything(ctx, scope) {
  const want = (k) => scope === "all" || scope === k;
  const { dealIds, projectIds } = exportTargets(ctx);
  const zip = new JSZip();
  const deals = zip.folder("deals");
  const projects = zip.folder("projects");
  const clients = zip.folder("clients");
  let count = 0;
  const failed = [];

  if (want("deals")) for (const d of dealIds) {
    try {
      const wb = await dealWorkbook(ctx, d);
      const deal = ctx.dealById.get(d);
      deals.file(fileName("deal", deal ? deal.name : d), await wb.xlsx.writeBuffer());
      count += 1;
    } catch (e) { failed.push("deal " + d + ": " + e.message); }
  }
  if (want("projects")) for (const p of projectIds) {
    try {
      const wb = await projectWorkbook(ctx, p);
      const pr = ctx.projects.find((x) => x.id === p);
      projects.file(fileName("project", pr ? pr.n : p), await wb.xlsx.writeBuffer());
      count += 1;
    } catch (e) { failed.push("project " + p + ": " + e.message); }
  }
  if (want("clients")) for (const c of ctx.clients) {
    try {
      const wb = await clientWorkbook(ctx, c.c);
      clients.file(fileName("client", c.c), await wb.xlsx.writeBuffer());
      count += 1;
    } catch (e) { failed.push("client " + c.c + ": " + e.message); }
  }

  zip.file("README.txt",
    "Margin by Clients — detail workbooks\n" +
    "Generated " + new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC\n\n" +
    "deals/     one workbook per deal, covering the whole deal\n" +
    "projects/  one workbook per project, covering that project alone\n" +
    "clients/   one workbook per client, with every costed project behind the margin\n\n" +
    "Deal and project do not always correspond one to one, which is why both cuts exist.\n" +
    "Revenue is the invoice sub-total, net of VAT and net of any credit note that reversed it.\n" +
    "Margin is before server and infrastructure costs, which Zoho does not record.\n" +
    (failed.length ? "\nNot generated:\n" + failed.join("\n") + "\n" : ""));

  return { zip: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), count };
}
