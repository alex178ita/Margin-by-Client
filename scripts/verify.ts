/* Sanity checks for the pure logic. Run with: npx tsx scripts/verify.ts */
import { classifyProject, leaveHoursInWeek, WEEKLY_TARGET } from '../lib/report';
import { parseCsv } from '../lib/zoho';
import {
  addDays, isoWeek, lastClosedWeekStart, parseISODay, toISODay,
  toPeopleDate, toSprintsDateTime, isWorkingDay, holidayName, weekStart,
} from '../lib/dates';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log(`FAIL  ${name}\n      got ${a}\n      want ${e}`); }
  else console.log(`ok    ${name}`);
}

// --- project classification -------------------------------------------------
check('classify client project', classifyProject('FENDI - Implementations - 2026'), 'projects');
check('classify presales (=)', classifyProject('=Presales'), 'projects');
check('classify internal (_)', classifyProject('_Digital Operations'), 'internal');
check('classify internal (__)', classifyProject('__Progetto2-Esempio'), 'internal');
check('classify internal (::)', classifyProject(':: IT Infrastructure & Ops ::'), 'internal');
check('classify service (---)', classifyProject('---INTERNAL MEETING'), 'service');
check('classify service (--)', classifyProject('--Sviluppo'), 'service');
check('classify service (em dash)', classifyProject('—-CDA'), 'service');
check('classify empty', classifyProject(''), 'projects');

// --- week maths -------------------------------------------------------------
const monday = parseISODay('2026-09-07');
check('weekStart from a Wednesday', toISODay(weekStart(parseISODay('2026-09-09'))), '2026-09-07');
check('weekStart from a Sunday', toISODay(weekStart(parseISODay('2026-09-13'))), '2026-09-07');
check('last closed week (Mon 14 Sep)', toISODay(lastClosedWeekStart(parseISODay('2026-09-14'))), '2026-09-07');
check('last closed week (Fri 18 Sep)', toISODay(lastClosedWeekStart(parseISODay('2026-09-18'))), '2026-09-07');
check('iso week number', isoWeek(monday), { week: 37, year: 2026 });
check('iso week 1 of 2026', isoWeek(parseISODay('2025-12-29')), { week: 1, year: 2026 });

// --- Zoho date literals -----------------------------------------------------
check('People date literal', toPeopleDate(monday), '07-Sep-2026');
check('People date literal (Jan)', toPeopleDate(parseISODay('2026-01-05')), '05-Jan-2026');
check('Sprints from literal', toSprintsDateTime(monday), '2026-09-07 00:00:00');
check('Sprints to literal', toSprintsDateTime(addDays(monday, 6), true), '2026-09-13 23:59:59');

// --- holidays and working days ---------------------------------------------
check('Ferragosto 2026', holidayName(parseISODay('2026-08-15')), 'Ferragosto');
check('Easter Monday 2026', holidayName(parseISODay('2026-04-06')), 'Easter Monday');
check('St Ambrose', holidayName(parseISODay('2026-12-07')), 'St Ambrose (Milan)');
check('ordinary Tuesday is a working day', isWorkingDay(parseISODay('2026-09-08')), true);
check('Saturday is not', isWorkingDay(parseISODay('2026-09-12')), false);
check('holiday is not', isWorkingDay(parseISODay('2026-06-02')), false);

// --- leave allocation -------------------------------------------------------
const wkStart = parseISODay('2026-09-07');
const wkEnd = addDays(wkStart, 6);

check('single day of holiday inside the week',
  leaveHoursInWeek(parseISODay('2026-09-07'), parseISODay('2026-09-07'), 'Days', 1, wkStart, wkEnd), 8);
check('2.5 hours of permesso',
  leaveHoursInWeek(parseISODay('2026-09-07'), parseISODay('2026-09-07'), 'Hours', 2.5, wkStart, wkEnd), 2.5);
check('full week of holiday',
  leaveHoursInWeek(parseISODay('2026-09-07'), parseISODay('2026-09-11'), 'Days', 5, wkStart, wkEnd), 40);
check('leave outside the week contributes nothing',
  leaveHoursInWeek(parseISODay('2026-09-14'), parseISODay('2026-09-18'), 'Days', 5, wkStart, wkEnd), 0);

// 7-31 Aug 2026 = 17 working days, booked as 17 days. Week 24-30 Aug holds 5 of them.
const augWeek = parseISODay('2026-08-24');
check('long leave, share falling in one week',
  leaveHoursInWeek(parseISODay('2026-08-07'), parseISODay('2026-08-31'), 'Days', 17, augWeek, addDays(augWeek, 6)),
  40);
// 17-21 Aug booked as 40 hours -> 8h/day, all inside its own week.
const aug17 = parseISODay('2026-08-17');
check('hours-unit leave across a full week',
  leaveHoursInWeek(parseISODay('2026-08-17'), parseISODay('2026-08-21'), 'Hours', 40, aug17, addDays(aug17, 6)),
  40);
// A week containing Ferragosto: 1-7 Jun 2026 holds Republic Day (2 Jun).
const junWeek = parseISODay('2026-06-01');
check('holiday excluded from the allocation basis',
  leaveHoursInWeek(parseISODay('2026-06-01'), parseISODay('2026-06-05'), 'Days', 4, junWeek, addDays(junWeek, 6)),
  32);
check('leave booked on a weekend still allocates',
  leaveHoursInWeek(parseISODay('2026-09-12'), parseISODay('2026-09-12'), 'Hours', 4, wkStart, wkEnd), 4);

// --- CSV parsing ------------------------------------------------------------
check('csv: plain', parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
check('csv: quoted comma', parseCsv('a,b\n"x, y",2\n'), [['a', 'b'], ['x, y', '2']]);
check('csv: escaped quote', parseCsv('a\n"he said ""hi"""\n'), [['a'], ['he said "hi"']]);
check('csv: embedded newline', parseCsv('a,b\n"line1\nline2",2\n'), [['a', 'b'], ['line1\nline2', '2']]);
check('csv: crlf', parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);

check('weekly target', WEEKLY_TARGET, 40);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
