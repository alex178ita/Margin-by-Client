/**
 * Come si chiama lo stesso cliente nei due sistemi.
 *
 * A sinistra il nome come arriva dalla fonte infrastrutturale, a destra il
 * cliente come si chiama in questa dashboard. Serve per i casi che nessuna
 * regola puo' risolvere da sola — "Haier" e "Haier / Candy Hoover" si
 * assomigliano, "Rainbow" e il nome di un prodotto no — e per quelli in cui due
 * clienti diversi si contendono la stessa riga.
 *
 * Non serve mettere qui le varianti che le regole gia' risolvono: FENDI S.R.L.
 * trova Fendi da solo, perche' la ragione sociale che fattura e' uno dei nomi
 * che la dashboard conosce gia'. Questo file e' per il resto.
 *
 * Come si compila senza indovinare. Con la fonte collegata, l'indirizzo
 * `/api/infra-map` restituisce questa tabella gia' scritta: ogni nome che la
 * fonte espone, il cliente su cui finisce oggi e come ci e' arrivato, e `null`
 * su quelli che non si abbinano. Si controlla, si corregge, si incolla qui.
 *
 * Una riga con `null` a destra e' una decisione presa: quel costo resta fuori
 * dai margini, di proposito. Diverso da una riga assente, che vuol dire che
 * nessuno ci ha ancora guardato.
 *
 * `INFRA_ALIASES` su Vercel ha la precedenza su questo file: serve a rimediare
 * a una riga sbagliata senza aspettare un deploy. Quando la correzione e'
 * definitiva, il posto giusto e' qui.
 */
const INFRA_MAP = {
  /* ---------------------------------------------------- un cliente, tre righe --
     Nel cluster Haier si presenta sotto tre nomi, uno per marchio. Le regole le
     trovano da sole per somiglianza di parole, ma un abbinamento dedotto puo'
     cambiare da solo il giorno che nasce un cliente con "candy" nel nome:
     scritte qui sono decise. I tre costi si sommano su un cliente solo. */
  "Haier Europe": "Haier / Candy Hoover",
  "Candy": "Haier / Candy Hoover",
  "Hoover": "Haier / Candy Hoover",

  /* ------------------------------------------------- nomi diversi, un cliente --
     A sinistra come la fonte lo chiama, a destra come si chiama qui. Nessuno di
     questi e' un caso difficile: sono scritti perche' "Gabel MC" sta su una riga
     sua accanto a "Gabel" e i due costi vanno sommati, non lasciati a una
     deduzione. */
  "Gabel MC": "Gabel",

  /* Cosa sia "MC" nei nomi del cluster non e' stato confermato: finche' non lo
     e', "Somma MC" resta affidato alle regole, che oggi la portano su "Somma".
     Se il cliente qui si chiama diversamente, va scritto qui sotto.
     "Somma MC": "Somma", */

  /* "Ita" sta per ITA Airways. Oggi la regola delle parole ci arriva da sola;
     va fissata appena si conferma come si chiama il cliente in dashboard.
     "Ita": "ITA Airways", */

  /* ----------------------------------------------------- fuori dai margini -----
     Righe che non sono clienti: una demo, un test interno, uno strumento nostro.
     Il `null` e' una decisione dichiarata — quel costo non entra in nessun
     margine — e si distingue da una riga assente, che vorrebbe dire che nessuno
     ci ha ancora guardato. */
  "Neencdn (demo)": null,
  "AI Search Audit": null,
  "Websim": null,

  /* I clienti finali dei partner non hanno un deal nel CRM, quindi non esistono
     come clienti in questa dashboard e il loro costo non puo' finire in nessun
     margine. La decisione e' di lasciarli fuori e non di accorparli sul partner:
     accorparli caricherebbe su Execus un costo che non e' suo, e per Jakala si
     va cliente per cliente, quindi le due vie non si somiglierebbero.
     Si scrivono qui, a `null`, man mano che `/api/infra-map` li elenca fra i non
     abbinati: cosi' la lista dei non abbinati resta la lista delle cose da
     guardare, invece di riempirsi ogni mese degli stessi nomi gia' decisi. */
};

export default INFRA_MAP;
