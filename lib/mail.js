/**
 * Invio dello zip per email. Usa Resend, che vuole solo una chiave API e non
 * una connessione SMTP in uscita dalla lambda.
 *
 *   RESEND_API_KEY   chiave del progetto Resend
 *   MAIL_FROM        mittente verificato, es. "Kleecks BI <bi@kleecks.com>"
 *
 * Senza queste due variabili il pulsante email resta disattivato e la dashboard
 * lo dice, invece di fingere di aver spedito.
 */
const ENV = (k) => (process.env[k] || "").trim();

export function mailConfigured() {
  return !!(ENV("RESEND_API_KEY") && ENV("MAIL_FROM"));
}

export async function sendZip(to, zipBuffer, count) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error("that does not look like an email address");
  const stamp = new Date().toISOString().slice(0, 10);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + ENV("RESEND_API_KEY"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ENV("MAIL_FROM"),
      to: [to],
      subject: `Margin by Clients — detail workbooks (${stamp})`,
      text:
        `Attached are ${count} detail workbooks from Margin by Clients.\n\n` +
        "deals/ holds one workbook per deal, projects/ one per project, clients/ one per client. " +
        "Deal and project do not always correspond one to one, which is why both cuts are there.\n\n" +
        "Revenue is the invoice sub-total, net of VAT and net of any credit note that reversed it. " +
        "Margin is before server and infrastructure costs, which Zoho does not record.\n",
      attachments: [{
        filename: `margin_detail_${stamp}.zip`,
        content: Buffer.from(zipBuffer).toString("base64"),
      }],
    }),
  });
  if (!r.ok) throw new Error("the email service refused the message — " + (await r.text()).slice(0, 200));
  return true;
}
