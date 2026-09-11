import { LOGO_DATA_URI } from "../lib/logo";

/**
 * Schermata di attesa. La pagina interroga Books, CRM, Projects e Analytics a
 * ogni apertura, e Analytics risponde per job asincroni: dieci o venti secondi
 * sono normali. Senza questa schermata il browser resta bianco e sembra rotto.
 *
 * Next.js la mostra da sola mentre il server component sta ancora caricando.
 */
export default function Loading() {
  return (
    <div className="splash">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo ink" src={LOGO_DATA_URI} alt="Kleecks" />
      <div className="sp-bar"><span /></div>
      <p>Loading data… please wait.</p>
      <small>Reading invoices, deals, projects and time logs from Zoho.</small>
    </div>
  );
}
