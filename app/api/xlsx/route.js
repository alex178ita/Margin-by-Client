import JSZip from "jszip";
import { loadDataset, exportTargets } from "../../../lib/dataset";
import { dealWorkbook, projectWorkbook, clientWorkbook, fileName } from "../../../lib/xlsx";
import { sendZip, mailConfigured } from "../../../lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Excel di dettaglio.
 *   /api/xlsx?k=<token>&type=deal&id=<dealId>
 *   /api/xlsx?k=<token>&type=project&id=<projectId>
 *   /api/xlsx?k=<token>&type=client&id=<client name>
 *   /api/xlsx?k=<token>&type=all               -> zip
 *   /api/xlsx?k=<token>&type=all&email=<addr>  -> zip via email
 */
export async function GET(request) {
  const url = new URL(request.url);
  const gate = process.env.ACCESS_TOKEN;
  if (gate && url.searchParams.get("k") !== gate) {
    return Response.json({ ok: false, error: "not authorised" }, { status: 401 });
  }

  const type = (url.searchParams.get("type") || "").toLowerCase();
  const id = url.searchParams.get("id") || "";
  const email = (url.searchParams.get("email") || "").trim();

  try {
    const ctx = await loadDataset();

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

    if (type === "all") {
      const { zip, count } = await everything(ctx);
      if (email) {
        if (!mailConfigured()) {
          return Response.json({
            ok: false,
            error: "Email is not configured on this deployment. Set RESEND_API_KEY and MAIL_FROM " +
                   "in the Vercel project, or use the download instead.",
          }, { status: 501 });
        }
        await sendZip(email, zip, count);
        return Response.json({ ok: true, sent: email, files: count });
      }
      const stamp = new Date().toISOString().slice(0, 10);
      return new Response(zip, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="margin_detail_${stamp}.zip"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return Response.json({ ok: false, error: "unknown type: use deal, project, client or all" }, { status: 400 });
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
async function everything(ctx) {
  const { dealIds, projectIds } = exportTargets(ctx);
  const zip = new JSZip();
  const deals = zip.folder("deals");
  const projects = zip.folder("projects");
  const clients = zip.folder("clients");
  let count = 0;
  const failed = [];

  for (const d of dealIds) {
    try {
      const wb = await dealWorkbook(ctx, d);
      const deal = ctx.dealById.get(d);
      deals.file(fileName("deal", deal ? deal.name : d), await wb.xlsx.writeBuffer());
      count += 1;
    } catch (e) { failed.push("deal " + d + ": " + e.message); }
  }
  for (const p of projectIds) {
    try {
      const wb = await projectWorkbook(ctx, p);
      const pr = ctx.projects.find((x) => x.id === p);
      projects.file(fileName("project", pr ? pr.n : p), await wb.xlsx.writeBuffer());
      count += 1;
    } catch (e) { failed.push("project " + p + ": " + e.message); }
  }
  for (const c of ctx.clients) {
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
