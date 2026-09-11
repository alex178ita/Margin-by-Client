/**
 * Tariffe orarie dai cedolini Vivian S.r.l.
 *
 * Mediana del costo mensile sui mesi a libro paga, divisa per i giorni
 * lavorativi medi e per le ore al giorno. La mediana e' scelta apposta: passa
 * sopra la mensilita' di uscita, che porta il TFR, e sopra i mesi di maternita',
 * che arrivano a rimborso INPS — ma solo se quel mese c'e' davvero, altrimenti
 * non cambia nulla.
 *
 * Rigenerato quando arrivano cedolini nuovi: e' un file di dati, non di codice.
 */
const RATES = {
 "note": "Tariffe orarie dai cedolini Vivian S.r.l. Mediana del costo mensile dei mesi a libro paga (la mediana scarta da sola la mensilita' di uscita col TFR e i mesi di maternita' a rimborso INPS), divisa per i giorni lavorativi medi e le ore al giorno.",
 "working_days_per_month": 21.0,
 "hours_per_day": 8.0,
 "first_year": "2025",
 "years": {
  "2025": {
   "months": 11,
   "status": "fixed",
   "label": "2025 — hourly costs fixed"
  },
  "2026": {
   "months": 7,
   "status": "open",
   "label": "2026 — hourly costs updated to Sep 2026"
  },
  "2027": {
   "inherits": "2026",
   "status": "inherited",
   "label": "2027 — hourly costs updated to Sep 2026"
  }
 },
 "contractors": {
  "91305000000171025": {
   "name": "Roberto Pellagatti",
   "note": "Works on a VAT number, not on the payroll. No rate supplied yet — the rate Zoho carries on the logs is used."
  }
 },
 "people": {
  "91305000001779007": {
   "name": "Riccardo Di Cecco",
   "status": "active",
   "payroll": "DI CECCO RICCARDO",
   "dept": "HQ",
   "rates": {
    "2025": 34.277,
    "2026": 32.811
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000000021619": {
   "name": "Alex Giorgi",
   "status": "active",
   "payroll": "GIORGI ALESSANDRO",
   "dept": "OPERATION",
   "rates": {
    "2025": 62.979,
    "2026": 57.134
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000000170019": {
   "name": "Marco Baricevic",
   "status": "active",
   "payroll": "BARICEVIC MARCO",
   "dept": "IT",
   "rates": {
    "2025": 68.897,
    "2026": 62.455
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000000765161": {
   "name": "Emanuela Farina",
   "status": "active",
   "payroll": "FARINA EMANUELA",
   "dept": "CUSTOMER OPS",
   "rates": {
    "2025": 17.051,
    "2026": 17.196
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000005717116": {
   "name": "Andrea Guffi",
   "status": "active",
   "payroll": "GUFFI ANDREA",
   "dept": "IT",
   "rates": {
    "2025": 27.734,
    "2026": 28.041
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000005675744": {
   "name": "Vanessa Noseda",
   "status": "active",
   "payroll": "NOSEDA VANESSA",
   "dept": "HQ",
   "rates": {
    "2025": 23.317,
    "2026": 23.537
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000004401183": {
   "name": "Alessia Boeri",
   "status": "active",
   "payroll": "BOERI ALESSIA",
   "dept": "CUSTOMER OPS",
   "rates": {
    "2025": 29.478,
    "2026": 29.813
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000005383117": {
   "name": "Elisa Passerini",
   "status": "inactive",
   "payroll": "PASSERINI ELISA",
   "dept": "HQ",
   "rates": {
    "2025": 43.925,
    "2026": 44.118
   },
   "months": {
    "2025": 11,
    "2026": 4
   },
   "flags": []
  },
  "91305000001910049": {
   "name": "Alessandro Cacciatore",
   "status": "active",
   "payroll": "CACCIATORE ALESSANDRO",
   "dept": "CUSTOMER OPS",
   "rates": {
    "2025": 27.761,
    "2026": 31.8
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000002633586": {
   "name": "Giuseppe Sensitivo",
   "status": "inactive",
   "payroll": "SENSITIVO GIUSEPPE",
   "dept": "HQ",
   "rates": {
    "2025": 29.023,
    "2026": 29.023
   },
   "months": {
    "2025": 11,
    "2026": 3
   },
   "flags": [
    "2026: 47.33/h against 29.02/h the year before, more than a plausible rise — kept the earlier rate"
   ]
  },
  "91305000003508101": {
   "name": "Gianluca Peretti",
   "status": "active",
   "payroll": "PERETTI GIANLUCA",
   "dept": "SALES",
   "rates": {
    "2025": 43.178,
    "2026": 45.88
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000005799191": {
   "name": "Grazia Pazienza",
   "status": "active",
   "payroll": "PAZIENZA GRAZIA",
   "dept": null,
   "rates": {
    "2025": 26.537,
    "2026": 26.679
   },
   "months": {
    "2025": 10,
    "2026": 7
   },
   "flags": []
  },
  "91305000006134037": {
   "name": "Matteo Magri",
   "status": "inactive",
   "payroll": "MAGRI MATTEO",
   "dept": null,
   "rates": {
    "2025": 34.569,
    "2026": 34.845
   },
   "months": {
    "2025": 9,
    "2026": 5
   },
   "flags": []
  },
  "91305000000675027": {
   "name": "Marta Buffoni",
   "status": "inactive",
   "payroll": "BUFFONI MARTA",
   "dept": "HQ",
   "rates": {
    "2025": 41.669,
    "2026": 41.669
   },
   "months": {
    "2025": 11,
    "2026": 2
   },
   "flags": [
    "2026: only 2 months on the payroll, too few to read a rate — kept 41.67/h from 2025"
   ]
  },
  "91305000002633598": {
   "name": "Roberto Biancucci",
   "status": "active",
   "payroll": "BIANCUCCI ROBERTO",
   "dept": "IT",
   "rates": {
    "2025": 39.363,
    "2026": 39.963
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000000171025": {
   "name": "Roberto Pellagatti",
   "status": "active",
   "payroll": null,
   "dept": null,
   "rates": {},
   "months": {},
   "flags": []
  },
  "91305000002663113": {
   "name": "Elena Borgonovo",
   "status": "inactive",
   "payroll": "BORGONOVO ELENA",
   "dept": "HQ",
   "rates": {
    "2025": 29.814,
    "2026": 30.202
   },
   "months": {
    "2025": 11,
    "2026": 6
   },
   "flags": []
  },
  "91305000002065089": {
   "name": "Aysenaz Darga",
   "status": "active",
   "payroll": "DARGA AYSENAZ",
   "dept": "OPERATION",
   "rates": {
    "2025": 13.362,
    "2026": 17.121
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000005218707": {
   "name": "Alessandro Musciola",
   "status": "active",
   "payroll": "MUSCIOLA' ALESSANDRO",
   "dept": "HQ",
   "rates": {
    "2025": 40.811,
    "2026": 41.006
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000001253069": {
   "name": "Francesco Fiore",
   "status": "inactive",
   "payroll": "FIORE FRANCESCO",
   "dept": "HQ",
   "rates": {
    "2025": 36.176,
    "2026": 36.716
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000005717087": {
   "name": "Giada Birbitello",
   "status": "active",
   "payroll": "BIRBITELLO GIADA",
   "dept": "HQ",
   "rates": {
    "2025": 54.801,
    "2026": 54.801
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": [
    "2026: median monthly cost is zero or negative (parental leave reimbursements), rate discarded"
   ]
  },
  "91305000001253039": {
   "name": "Luca Manigrasso",
   "status": "active",
   "payroll": "MANIGRASSO LUCA ANTONIO",
   "dept": "IT",
   "rates": {
    "2025": 35.237,
    "2026": 35.994
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000005675405": {
   "name": "Massimo Montanaro",
   "status": "active",
   "payroll": "MONTANARO MASSIMO",
   "dept": "IT",
   "rates": {
    "2025": 26.552,
    "2026": 26.874
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000003959095": {
   "name": "Emanuel Oliva",
   "status": "active",
   "payroll": "OLIVA EMANUELE",
   "dept": "IT",
   "rates": {
    "2025": 52.828,
    "2026": 53.367
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000005510209": {
   "name": "Matteo Gobbo",
   "status": "active",
   "payroll": "GOBBO MATTEO",
   "dept": "IT",
   "rates": {
    "2025": 28.413,
    "2026": 28.682
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  },
  "91305000006515145": {
   "name": "Andrea Evangelista",
   "status": "active",
   "payroll": "EVANGELISTA ANDREA",
   "dept": null,
   "rates": {
    "2025": 3.571,
    "2026": 4.762
   },
   "months": {
    "2025": 7,
    "2026": 7
   },
   "flags": []
  },
  "91305000006072013": {
   "name": "Daniele Fabrizio",
   "status": "inactive",
   "payroll": "FABRIZIO DANIELE",
   "dept": "SALES",
   "rates": {
    "2025": 47.173
   },
   "months": {
    "2025": 7
   },
   "flags": []
  },
  "91305000001347003": {
   "name": "Diana Avelar",
   "status": "active",
   "payroll": "GOMES LOPES DE AVELAR DIANA",
   "dept": "HQ",
   "rates": {
    "2025": 55.32,
    "2026": 56.419
   },
   "months": {
    "2025": 11,
    "2026": 7
   },
   "flags": []
  }
 }
};

export default RATES;
