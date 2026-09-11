# Margin by Clients — deploy

Il progetto è già collegato al tuo progetto Vercel (`.vercel/project.json`,
team Kleecks BI). Dalla cartella:

    npx vercel --prod

La prima volta chiede di fare login (`npx vercel login`), oppure passa il token:

    npx vercel --prod --token=IL_TUO_TOKEN

Non serve `npm install` prima: ci pensa Vercel a installare e buildare.
Per provare in locale: `npm install && npm run dev`.

## Cosa è cambiato in questa versione

- Ricavo = imponibile fattura (Sub Total), al netto di IVA e delle note di credito.
- Fatture, clienti e note di credito arrivano da Zoho Analytics con una query sola.
- Deal da CRM con tipo (Licence / Professional Services), moduli, owner e CSM.
- Progetti agganciati ai deal via CRMid; se manca, ipotesi sul nome, dichiarata.
- Logo Kleecks in bianco e "v.0.1 — Beta for testing" in cima.
- Splash "Loading data… please wait" con logo nero mentre carica.
- Deal e progetti cliccabili: aprono Zoho CRM / Zoho Projects in una nuova scheda.
- Excel di dettaglio: per deal, per progetto, per cliente; e zip di tutti.

## Variabili d'ambiente nuove (facoltative)

Solo per il pulsante "Email them instead":

    RESEND_API_KEY   chiave Resend
    MAIL_FROM        mittente verificato, es. "Kleecks BI <bi@kleecks.com>"

Senza queste due, il pulsante dice che l'email non è configurata e il download
dello zip funziona lo stesso.
