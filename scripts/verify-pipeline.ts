/*
 * End-to-end check of buildReport against real rows pulled from Zoho Analytics
 * for the week 07–13 Sep 2026. Run with: npx tsx scripts/verify-pipeline.ts
 */
import { buildReport } from '../lib/report';

import { fixtureQuery as query } from './fixtures';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log(`FAIL  ${name}\n      got ${a}\n      want ${e}`); }
  else console.log(`ok    ${name}`);
}

(async () => {
  const report = await buildReport('2026-09-07', query);
  const by = (email: string) => report.rows.find((r) => r.email === email)!;

  console.log(`\n${report.isoLabel} · ${report.rangeLabel}\n`);
  console.log(
    ['Person', 'Proj', 'Int', 'Svc', 'Abs', 'Spr', 'Total'].join('\t').toUpperCase(),
  );
  for (const r of report.rows) {
    if (r.total === 0) continue;
    console.log([r.name.slice(0, 22), r.projects, r.internal, r.service, r.absence, r.sprints,
      `${r.total}${r.meetsTarget ? ' ✓' : ' ✗'}`].join('\t'));
  }
  console.log(`\n(+ ${report.rows.filter((r) => r.total === 0).length} people with nothing logged)\n`);

  check('system accounts excluded', report.rows.some((r) => r.email === 'admin@kleecks.com'), false);
  check('digitalop excluded', report.rows.some((r) => r.email === 'digitalop@kleecks.com'), false);
  check('external Sprints user excluded', report.rows.some((r) => r.email.endsWith('gmail.com')), false);
  check('headcount', report.totals.people, 28);

  const alex = by('alex.giorgi@kleecks.com');
  check('Alex projects', alex.projects, 5.8);
  check('Alex internal', alex.internal, 13.58);
  check('Alex service', alex.service, 22.52);
  check('Alex total', alex.total, 41.9);
  check('Alex meets target', alex.meetsTarget, true);

  const marco = by('marco.baricevic@kleecks.com');
  check('Marco service (--- and --)', marco.service, 27);
  check('Marco internal (_Sistemi)', marco.internal, 12);
  check('Marco projects', marco.projects, 3.5);
  check('Marco total', marco.total, 42.5);

  const ric = by('riccardo.dicecco@kleecks.com');
  check('Riccardo total just below target', ric.total, 39.25);
  check('Riccardo flagged red', ric.meetsTarget, false);

  const rob = by('roberto.pellagatti_ext@kleecks.com');
  check('Roberto presales counted as project', rob.projects, 4);
  check('Roberto Sprints hours', rob.sprints, 6);
  check('Roberto total', rob.total, 11);

  const van = by('vanessa.noseda@kleecks.com');
  check('Vanessa one day of leave = 8h', van.absence, 8);
  check('Vanessa total', van.total, 18);

  const cac = by('alessandro.cacciatore@kleecks.com');
  check('Alessandro permesso 4h + 2.5h', cac.absence, 6.5);
  check('Alessandro total', cac.total, 10.5);

  const idle = by('lucia.smerilli@kleecks.com');
  check('person with nothing logged still listed', idle.total, 0);
  check('person with nothing logged is red', idle.meetsTarget, false);

  check('department mapped onto the person', alex.department, 'Digital Operations');
  check('department for a Product person', marco.department, 'Product');
  check('department list, alphabetical', report.departments, [
    'Customer Success Management', 'Digital Operations', 'HR & Finance',
    'Management', 'Marketing', 'Product', 'Sales',
  ]);
  check('below target count', report.totals.below, 26);
  check('rows sorted ascending by total', report.rows[0].total <= report.rows[1].total, true);
  check('no public holiday this week', report.holidays.length, 0);
  check('week not in progress', report.inProgress, false);

  const sum = report.rows.reduce((a, r) => a + r.total, 0);
  check('totals row matches the sum of the rows', report.totals.total, Math.round(sum * 100) / 100);

  const alexDetail = alex.detail.find((d) => d.label === '---ADMIN')!;
  check('drawer detail keeps the project name', alexDetail.category, 'service');
  check('drawer detail hours', alexDetail.hours, 15.5);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
