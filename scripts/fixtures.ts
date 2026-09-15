/* Real rows pulled from Zoho Analytics for the week 07-13 Sep 2026, used by
 * scripts/verify-pipeline.ts and by the local visual preview. */

const EMPLOYEES = [
  'Admin Vivian Srl|admin@kleecks.com|Administration',
  'Alessandro Cacciatore|alessandro.cacciatore@kleecks.com|Product',
  'Alessandro Musciola|alessandro.musciola@kleecks.com|Customer Success Management',
  'Alessia Boeri|alessia.boeri@kleecks.com|Product',
  'Alex Giorgi|alex.giorgi@kleecks.com|Digital Operations',
  'Andrea Evangelista|andrea.evangelista@kleecks.com|Customer Success Management',
  'Andrea Guffi|andrea.guffi@kleecks.com|Product',
  'Anthony Abissino|anthony.abissino@kleecks.com|Sales',
  'Aysenaz Darga|darga.aysenaz@kleecks.com|Digital Operations',
  'Diana Avelar|diana.avelar@kleecks.com|Management',
  'Digital Operations|digitalop@kleecks.com|',
  'Emanuel Oliva ( Ema )|emanuel.oliva@kleecks.com|Product',
  'Emanuela Farina|emanuela.farina@kleecks.com|Product',
  'Gabriele Perchinunno|gabriele.perchinunno@kleecks.com|Product',
  'Giada Birbitello|giada.birbitello@kleecks.com|Customer Success Management',
  'Gianluca Peretti ( ilgianloo )|gianluca.peretti@kleecks.com|Sales',
  'Grazia Pazienza|grazia.pazienza@kleecks.com|Customer Success Management',
  'Luca Manigrasso|luca.manigrasso@kleecks.com|Product',
  'Lucia Smerilli|lucia.smerilli@kleecks.com|Marketing',
  'Marco Baricevic ( Bar )|marco.baricevic@kleecks.com|Product',
  'Marco Bezzi|marco.bezzi@kleecks.com|Sales',
  'Marco Frassinetti|marco.frassinetti@kleecks.com|Sales',
  'Massimo Montanaro|massimo.montanaro@kleecks.com|Product',
  'Matteo Gobbo|matteo.gobbo@kleecks.com|Product',
  'Omar Odino|omar.odino@kleecks.com|Customer Success Management',
  'Riccardo Di Cecco|riccardo.dicecco@kleecks.com|Customer Success Management',
  'Roberto Biancucci|roberto.biancucci@kleecks.com|Product',
  'Roberto Pellagatti|roberto.pellagatti_ext@kleecks.com|Product',
  'Sauro Piva|sauro.piva@kleecks.com|HR & Finance',
  'Vanessa Noseda|vanessa.noseda@kleecks.com|Customer Success Management',
].map((s) => {
  const [emp_name, emp_email, department] = s.split('|');
  return { emp_id: '', emp_name, emp_email, department };
});

const TIME_LOGS = [
  ['alessandro.cacciatore@kleecks.com', 'Alessandro Cacciatore', 'FENDI - Implementations - 2026', '3.0'],
  ['alessandro.cacciatore@kleecks.com', 'Alessandro Cacciatore', '_TAG HEUER - Roadmap LVMH - 2026', '1.0'],
  ['alessia.boeri@kleecks.com', 'Alessia Boeri', 'FENDI - Implementations - 2026', '3.0'],
  ['alessia.boeri@kleecks.com', 'Alessia Boeri', 'LORO PIANA - Maintenance - 2026', '5.0'],
  ['alessia.boeri@kleecks.com', 'Alessia Boeri', 'TIFFANY - Licence 2026 - CRO & AI Content', '8.0'],
  ['alex.giorgi@kleecks.com', 'Alex Giorgi', '---ADMIN', '15.499999950000001'],
  ['alex.giorgi@kleecks.com', 'Alex Giorgi', '---INTERNAL MEETING', '4.1833333'],
  ['alex.giorgi@kleecks.com', 'Alex Giorgi', '---ZOHO', '2.8333333'],
  ['alex.giorgi@kleecks.com', 'Alex Giorgi', 'FENDI - Implementations - 2026', '5.8000001'],
  ['alex.giorgi@kleecks.com', 'Alex Giorgi', '_AISA Marketing AIutomation', '1.7666667'],
  ['alex.giorgi@kleecks.com', 'Alex Giorgi', '_Digital Operations', '10.3333337'],
  ['alex.giorgi@kleecks.com', 'Alex Giorgi', '_TAG HEUER - Roadmap LVMH - 2026', '1.4833333'],
  ['emanuela.farina@kleecks.com', 'Emanuela Farina', 'BULGARI - Strategy - 2025-2027', '1.5'],
  ['emanuela.farina@kleecks.com', 'Emanuela Farina', 'LORO PIANA - Maintenance - 2026', '1.0'],
  ['emanuela.farina@kleecks.com', 'Emanuela Farina', '_Kleecks Rainbow - Feedback', '2.0'],
  ['grazia.pazienza@kleecks.com', 'Grazia Pazienza', 'BULGARI - Strategy - 2025-2027', '2.0'],
  ['grazia.pazienza@kleecks.com', 'Grazia Pazienza', '_ADP  - Roadmap LVMH - 2026', '1.0'],
  ['marco.baricevic@kleecks.com', 'Marco Baricevic ( Bar )', '---INTERNAL MEETING', '14.0'],
  ['marco.baricevic@kleecks.com', 'Marco Baricevic ( Bar )', '---SUPPORT/TICKET', '5.5'],
  ['marco.baricevic@kleecks.com', 'Marco Baricevic ( Bar )', '--Sviluppo', '7.5'],
  ['marco.baricevic@kleecks.com', 'Marco Baricevic ( Bar )', 'Ganni - Licence 2026 - POC 3 months', '0.5'],
  ['marco.baricevic@kleecks.com', 'Marco Baricevic ( Bar )', 'LORO PIANA - Maintenance - 2026', '2.5'],
  ['marco.baricevic@kleecks.com', 'Marco Baricevic ( Bar )', 'TIFFANY - Licence 2026 - CRO & AI Content', '0.5'],
  ['marco.baricevic@kleecks.com', 'Marco Baricevic ( Bar )', '_Sistemi', '12.0'],
  ['riccardo.dicecco@kleecks.com', 'Riccardo Di Cecco', '---INTERNAL MEETING', '2.25'],
  ['riccardo.dicecco@kleecks.com', 'Riccardo Di Cecco', '---SUPPORT/TICKET', '1.0'],
  ['riccardo.dicecco@kleecks.com', 'Riccardo Di Cecco', 'GABEL -  4 gg  - 2026', '13.0'],
  ['riccardo.dicecco@kleecks.com', 'Riccardo Di Cecco', 'Ganni - Licence 2026 - POC 3 months', '22.0'],
  ['riccardo.dicecco@kleecks.com', 'Riccardo Di Cecco', '_Kleecks Rainbow - Feedback', '1.0'],
  ['roberto.pellagatti_ext@kleecks.com', 'Roberto Pellagatti', '=Presales', '1.0'],
  ['roberto.pellagatti_ext@kleecks.com', 'Roberto Pellagatti', 'TIFFANY - Licence 2026 - CRO & AI Content', '3.0'],
  ['roberto.pellagatti_ext@kleecks.com', 'Roberto Pellagatti', '_Execus - Management - 2026', '1.0'],
  ['vanessa.noseda@kleecks.com', 'Vanessa Noseda', 'LORO PIANA - Maintenance - 2026', '2.0'],
  ['vanessa.noseda@kleecks.com', 'Vanessa Noseda', 'MCM - Strategy 2025/2026', '4.5'],
  ['vanessa.noseda@kleecks.com', 'Vanessa Noseda', 'VILLARI - Licence - 2026', '3.5'],
].map(([emp_email, emp_name, project_name, hours]) => ({ emp_email, emp_name, project_name, hours }));

const LEAVE = [
  ['vanessa.noseda@kleecks.com', 'Ferie/Holidays', 'Days', '1.00', '2026-09-07 00:00:00', '2026-09-07 00:00:00'],
  ['alessandro.cacciatore@kleecks.com', 'Permesso/Leave', 'Hours', '4.00', '2026-09-11 00:00:00', '2026-09-11 00:00:00'],
  ['grazia.pazienza@kleecks.com', 'Permesso/Leave', 'Hours', '2.00', '2026-09-07 00:00:00', '2026-09-07 00:00:00'],
  ['alessandro.cacciatore@kleecks.com', 'Permesso/Leave', 'Hours', '2.50', '2026-09-07 00:00:00', '2026-09-07 00:00:00'],
].map(([emp_email, leave_type, unit, taken, date_from, date_to]) =>
  ({ emp_email, emp_name: '', leave_type, unit, taken, date_from, date_to }));

const SPRINTS = [
  { emp_email: 'roberto.pellagatti_ext@kleecks.com', user_name: 'Roberto Pellagatti', minutes: '360.0' },
  // external collaborator, must be filtered out:
  { emp_email: 'sanvi.simo@gmail.com', user_name: 'sanvi.simo', minutes: '2400.0' },
];

export const fixtureQuery = async (sql: string) => {
  if (sql.includes('"Employee (Zoho People)"') && sql.includes('Employee status')) return EMPLOYEES as any;
  if (sql.includes('"Time Logs (Zoho People)"')) return TIME_LOGS as any;
  if (sql.includes('"Leave (Zoho People)"')) return LEAVE as any;
  if (sql.includes('"Timesheets (Zoho Sprints)"')) return SPRINTS as any;
  throw new Error(`unexpected query: ${sql}`);
};

