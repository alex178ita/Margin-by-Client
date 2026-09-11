/**
 * Modello cliente Kleecks: entità fatturante → cliente finale.
 *
 * Molti ricavi arrivano tramite partner (Jakala, Cerved, The Newco, FGMC, Neen,
 * Dentsu, TIG, Execus) che fatturano per conto del cliente finale. Il cliente
 * finale è riconoscibile solo dal nome del deal CRM riportato sulla fattura.
 */

export const PARTNERS = {
  "JAKALA S.P.A. SOCIETA BENEFIT": "Jakala",
  "Cerved Group S.p.A.": "Cerved",
  "THE NEWCO S.R.L.": "The Newco",
  "FGMC s.r.l.": "FGMC",
  "Neen SpA": "Neen",
  "Dentsu Digital S.r.l": "Dentsu",
  "TIG MEDIA S.R.L.": "TIG Media",
  "EXECUS S.P.A.": "Execus",
};

// Prima corrispondenza nel nome del deal: l'ordine conta.
export const FINAL_CLIENT_RULES = [
  ["miu miu", "Miu Miu"], ["miumiu", "Miu Miu"], ["prada", "Prada"],
  ["ita airlines", "ITA Airways"], ["ariston", "Ariston"], ["enervit", "Enervit"],
  ["msc", "MSC"], ["ritz carlton", "Ritz-Carlton"], ["longines", "Longines"],
  ["ginori", "Ginori 1735"], ["kempinski", "Kempinski"], ["boggi", "Boggi"],
  ["virgin fibra", "Virgin Fibra"], ["golden goose", "Golden Goose"],
  ["gnv", "GNV"], ["ovs", "OVS"], ["replay", "Replay"], ["fsa", "FSA"],
  ["pulsee", "Pulsee"], ["sky", "Sky"], ["mortadella", "Mortadella Bologna"],
  ["granapadano", "Grana Padano"], ["grana padano", "Grana Padano"],
  ["salame cacciatore", "Salame Cacciatore"], ["poliform", "Poliform"],
  ["zurich", "Zurich"], ["qualitas", "Qualitas Auto"], ["conte", "ConTe.it"],
  ["safilo", "Safilo"], ["wopta", "Wopta"], ["pool industriale", "Pool Industriale"],
  ["printcentral", "Printcentral"], ["casa del grano", "La Casa del Grano"],
];

// Entità fatturanti diverse che sono lo stesso cliente commerciale.
export const GROUPS = {
  "ADMIRAL INTERMEDIARY SERVICES S.A.U.": "Admiral Group",
  "Admiral Intermediary Services SA": "Admiral Group",
  "EDISON ENERGIA S.P.A.": "Edison",
  "EDISON S.P.A.": "Edison",
  "MCM Global AG": "MCM",
  "MCM Korea Inc": "MCM",
};

// Nome leggibile per gli account diretti.
export const DISPLAY = {
  "BULGARI S.P.A.": "Bulgari",
  "FENDI S.R.L.": "Fendi",
  "LORO PIANA S.P.A.": "Loro Piana",
  "GIANNI VERSACE S.R.L.": "Versace",
  "GABEL INDUSTRIA TESSILE S.P.A.": "Gabel",
  "MANIFATTURA VALCISMON S.P.A.": "MVC Group",
  "TAG Heuer - Branch of LVMH Swiss Manufactures SA": "TAG Heuer",
  "TIFFANY & CO": "Tiffany & Co.",
  "FASHION BOX S.P.A.": "Fashion Box (Replay)",
  "Givenchy SA": "Givenchy",
  "LVMH BEAUTY TECH": "LVMH Beauty Tech",
  "CANDY HOOVER GROUP S.R.L.": "Haier / Candy Hoover",
  "VALENTINO S.P.A.": "Valentino",
  "NOVE25 SRL": "Nove25",
  "SAFILO S.P.A": "Safilo",
  "MEDSPA S.R.L.": "Miamo",
  "Borgione Centro Didattico Srl": "Borgione",
  "WEB WORLD TECHNOLOGIES S.R.L.": "Web World Technologies",
  "GINO RAG. FELICE & FIGLIO - S.P.A.": "Gino",
  "VILLARI SRL": "Villari",
  "GANNI A/S": "Ganni",
  "RAI - RADIOTELEVISIONE ITALIANA S.P.A.": "RAI",
  "Luxottica Group S.p.A.": "Luxottica",
  "NATUZZI S.P.A.": "Natuzzi",
  "TEAMSYSTEM S.P.A.": "TeamSystem (MailUp)",
  "Bestinbrands Pte Ltd": "Best in Brands",
  "IMPORT FOR ME SOCIETA A RESPONSABILITA LIMITATA": "Import For Me",
  "Competitor Group, Inc.": "Competitor Group",
  "WORLD TRIATHLON CORPORATION": "World Triathlon (Ironman)",
  "Global Business Solution S.r.l.": "Caffè Vergnano",
  "MACROPIX S.R.L.": "Macropix",
  "MANEL SERVICE S.R.L.": "Manel Service",
  "Ideificio s.r.l.": "Truly Venice",
  "E-GLOBE S.P.A.": "Climamarket",
  "Milani Home S.r.l.s.": "Milani Home",
  "Stroppiana Srl": "Stroppiana",
  "DEVORO SRL": "Devoro",
  "Atelier Emé srl": "Atelier Emé",
  "FALCONERI S.R.L.": "Falconeri",
  "19ADV srl": "Gaudenzi",
  Trenord: "Trenord",
};

// Nomi progetto che non coincidono col nome cliente.
export const PROJECT_ALIASES = {
  mvc: "MVC Group", "loro piana": "Loro Piana", haier: "Haier / Candy Hoover",
  "tag heuer": "TAG Heuer", adp: "LVMH Beauty Tech", "acqua di parma": "LVMH Beauty Tech",
  miamo: "Miamo", wwt: "Web World Technologies", execus: "Execus", jakala: "Jakala",
  prada: "Prada", miumiu: "Miu Miu", conte: "ConTe.it", qualitas: "Qualitas Auto",
  mortadella: "Mortadella Bologna", "grana padano": "Grana Padano",
  "salame cacciatore": "Salame Cacciatore", poliform: "Poliform",
  "edison energia": "Edison", "edison corporate": "Edison", borgione: "Borgione",
  "best in brands": "Best in Brands", replay: "Replay", longines: "Longines",
  sky: "Sky", nove25: "Nove25", "nove 25": "Nove25", gabel: "Gabel",
  bulgari: "Bulgari", fendi: "Fendi", givenchy: "Givenchy", valentino: "Valentino",
  tiffany: "Tiffany & Co.", ganni: "Ganni", villari: "Villari", gino: "Gino",
  mcm: "MCM", starhotels: "Starhotels", "zeta idraulica": "Zeta Idraulica",
  "tod s": "Tod's", "brunello cucinelli": "Brunello Cucinelli",
};

/**
 * Convenzione prefissi progetto in Zoho Projects.
 *   ---  —-  ::   interno puro          → nessun cliente
 *   =             presale               → costo commerciale, non di cliente
 *   _             management/CSM        → È costo di cliente (a differenza del
 *                                          project report, che li salta)
 */
export function projectClass(name) {
  const n = (name || "").trim();
  if (n.startsWith("---") || n.startsWith("—-") || n.startsWith("::") || n.startsWith(":")) return "internal";
  if (n.startsWith("=")) return "presale";
  if (n.startsWith("_")) return "client_mgmt";
  return "client";
}

/** → [clienteFinale, partner|null] */
export function finalClient(billingAccount, dealName) {
  const partner = PARTNERS[billingAccount];
  if (partner) {
    const d = (dealName || "").toLowerCase();
    for (const [key, name] of FINAL_CLIENT_RULES) if (d.includes(key)) return [name, partner];
    return [partner, partner]; // attività del partner su se stesso
  }
  const grp = GROUPS[billingAccount];
  if (grp) return [grp, null];
  return [DISPLAY[billingAccount] || billingAccount, null];
}
