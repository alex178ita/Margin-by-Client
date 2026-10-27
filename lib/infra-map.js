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
  // "Haier": "Haier / Candy Hoover",
  // "prada.com": "Prada",
  // "Qualcosa che non vogliamo contare": null,
};

export default INFRA_MAP;
