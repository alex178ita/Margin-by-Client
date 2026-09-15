'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORY_LABELS, type PersonRow, type WeekReport } from '@/lib/report';
import Splash from './Splash';

type WeekOption = { value: string; label: string };

type SortKey =
  | 'name' | 'department' | 'projects' | 'internal' | 'service' | 'absence' | 'sprints' | 'total';

const TEXT_KEYS = new Set<SortKey>(['name', 'department']);

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Person' },
  { key: 'department', label: 'Department' },
  { key: 'projects', label: CATEGORY_LABELS.projects },
  { key: 'internal', label: CATEGORY_LABELS.internal },
  { key: 'service', label: CATEGORY_LABELS.service },
  { key: 'absence', label: CATEGORY_LABELS.absence },
  { key: 'sprints', label: CATEGORY_LABELS.sprints },
  { key: 'total', label: 'Total' },
];

function hours(n: number): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function Dashboard({
  report,
  weeks,
  currentWeek,
}: {
  report: WeekReport;
  weeks: WeekOption[];
  currentWeek: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'total', dir: 'asc' });
  const [onlyBelow, setOnlyBelow] = useState(false);
  const [department, setDepartment] = useState('all');
  const [selected, setSelected] = useState<PersonRow | null>(null);

  const index = weeks.findIndex((w) => w.value === currentWeek);

  const go = (week: string) => {
    startTransition(() => router.push(`/?week=${week}`, { scroll: false }));
  };

  const rows = useMemo(() => {
    const filtered = report.rows.filter(
      (r) => (!onlyBelow || !r.meetsTarget) && (department === 'all' || r.department === department),
    );
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (TEXT_KEYS.has(sort.key)) {
        const key = sort.key as 'name' | 'department';
        return factor * a[key].localeCompare(b[key], 'en-GB')
          || a.name.localeCompare(b.name, 'en-GB');
      }
      const key = sort.key as 'projects' | 'internal' | 'service' | 'absence' | 'sprints' | 'total';
      return factor * (a[key] - b[key]) || a.name.localeCompare(b.name, 'en-GB');
    });
  }, [report.rows, sort, onlyBelow, department]);

  /** Tiles and the totals row follow whatever is on screen. */
  const shown = useMemo(() => {
    const sum = (pick: (r: PersonRow) => number) =>
      Math.round(rows.reduce((a, r) => a + pick(r), 0) * 100) / 100;
    return {
      people: rows.length,
      below: rows.filter((r) => !r.meetsTarget).length,
      projects: sum((r) => r.projects),
      internal: sum((r) => r.internal),
      service: sum((r) => r.service),
      absence: sum((r) => r.absence),
      sprints: sum((r) => r.sprints),
      total: sum((r) => r.total),
    };
  }, [rows]);

  /**
   * One card per department for the whole week, regardless of the filters:
   * hours logged against 40h x headcount.
   */
  const byDepartment = useMemo(() => {
    const map = new Map<string, { name: string; people: number; hours: number; below: number }>();
    for (const r of report.rows) {
      const entry = map.get(r.department)
        ?? { name: r.department, people: 0, hours: 0, below: 0 };
      entry.people += 1;
      entry.hours += r.total;
      entry.below += r.meetsTarget ? 0 : 1;
      map.set(r.department, entry);
    }
    return [...map.values()]
      .map((d) => {
        const goal = d.people * report.target;
        return {
          ...d,
          hours: Math.round(d.hours * 100) / 100,
          goal,
          share: goal > 0 ? d.hours / goal : 0,
          meetsTarget: d.hours >= goal,
        };
      })
      .sort((a, b) => a.share - b.share || a.name.localeCompare(b.name, 'en-GB'));
  }, [report.rows, report.target]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: TEXT_KEYS.has(key) ? 'asc' : 'desc' },
    );
  };

  const downloadCsv = () => {
    const header = ['Person', 'Email', ...COLUMNS.slice(1).map((c) => c.label), 'Meets target'];
    const lines = [header, ...rows.map((r) => [
      r.name, r.email, r.department,
      r.projects, r.internal, r.service, r.absence, r.sprints, r.total,
      r.meetsTarget ? 'yes' : 'no',
    ])];
    const csv = lines
      .map((line) => line.map((cell) => {
        const s = String(cell);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekly-hours-${report.weekStart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {pending && <Splash overlay />}

      <div className="toolbar">
        <button
          className="btn icon"
          onClick={() => go(weeks[index + 1].value)}
          disabled={index < 0 || index + 1 >= weeks.length || pending}
          aria-label="Previous week"
        >
          ←
        </button>
        <select
          className="btn"
          value={currentWeek}
          onChange={(e) => go(e.target.value)}
          disabled={pending}
          aria-label="Select week"
        >
          {weeks.map((w) => (
            <option key={w.value} value={w.value}>{w.label}</option>
          ))}
        </select>
        <button
          className="btn icon"
          onClick={() => go(weeks[index - 1].value)}
          disabled={index <= 0 || pending}
          aria-label="Next week"
        >
          →
        </button>

        <span className="week-label">
          {pending ? 'Loading…' : `${shown.people} people · target ${report.target}h`}
        </span>

        <span className="spacer" />

        <select
          className="btn"
          style={{ minWidth: 0 }}
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          aria-label="Filter by department"
        >
          <option value="all">All departments</option>
          {(report.departments ?? []).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <button
          className={`btn${onlyBelow ? ' active' : ''}`}
          onClick={() => setOnlyBelow((v) => !v)}
        >
          {onlyBelow ? 'Showing below target' : 'Show below target only'}
        </button>
        <button className="btn" onClick={downloadCsv}>Download CSV</button>
      </div>

      <div className="tiles">
        <div className="tile">
          <p className="k">Hours logged</p>
          <p className="v">{hours(shown.total)}</p>
        </div>
        <div className={`tile${shown.below > 0 ? ' warn' : ''}`}>
          <p className="k">Below {report.target}h</p>
          <p className="v">{shown.below} / {shown.people}</p>
        </div>
        <div className="tile">
          <p className="k">Projects</p>
          <p className="v">{hours(shown.projects)}</p>
        </div>
        <div className="tile">
          <p className="k">Internal</p>
          <p className="v">{hours(shown.internal)}</p>
        </div>
        <div className="tile">
          <p className="k">Service</p>
          <p className="v">{hours(shown.service)}</p>
        </div>
        <div className="tile">
          <p className="k">Absence</p>
          <p className="v">{hours(shown.absence)}</p>
        </div>
        <div className="tile">
          <p className="k">Sprints</p>
          <p className="v">{hours(shown.sprints)}</p>
        </div>
      </div>

      <h2 className="section">By department <span>hours logged against {report.target}h per person</span></h2>

      <div className="depts">
        {byDepartment.map((d) => (
          <button
            key={d.name}
            type="button"
            className={`dept-card ${d.meetsTarget ? 'ok' : 'no'}${department === d.name ? ' picked' : ''}`}
            onClick={() => setDepartment(department === d.name ? 'all' : d.name)}
            aria-pressed={department === d.name}
          >
            <span className="dname">{d.name}</span>
            <span className="dfig">
              <strong>{hours(d.hours)}</strong> / {hours(d.goal)}h
            </span>
            <span className="dbar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.round(d.share * 100))}%` }} />
            </span>
            <span className="dsub">
              {d.people} {d.people === 1 ? 'person' : 'people'} · {d.below} below target
            </span>
          </button>
        ))}
      </div>

      {report.inProgress && (
        <p className="notice">
          <strong>This week is still in progress.</strong> Zoho consolidates the timesheet on
          Monday morning, so figures before then are partial.
        </p>
      )}

      {report.holidays.length > 0 && (
        <p className="notice">
          <strong>Public holiday this week:</strong>{' '}
          {report.holidays.map((h) => h.name).join(', ')}. The red/green threshold stays at{' '}
          {report.target}h regardless.
        </p>
      )}

      <div className="panel">
        <div className="scroll">
          <table>
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)} scope="col">
                    {c.label}
                    {sort.key === c.key && (
                      <span className="arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.email} onClick={() => setSelected(r)}>
                  <td className="name">
                    {r.name}
                    <small>{r.email}</small>
                  </td>
                  <td className="dept">{r.department}</td>
                  <td className={r.projects ? '' : 'zero'}>{hours(r.projects)}</td>
                  <td className={r.internal ? '' : 'zero'}>{hours(r.internal)}</td>
                  <td className={r.service ? '' : 'zero'}>{hours(r.service)}</td>
                  <td className={r.absence ? '' : 'zero'}>{hours(r.absence)}</td>
                  <td className={r.sprints ? '' : 'zero'}>{hours(r.sprints)}</td>
                  <td>
                    <span className={`pill ${r.meetsTarget ? 'ok' : 'no'}`}>{hours(r.total)}</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="empty" colSpan={COLUMNS.length}>No one to show for this week.</td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td>{hours(shown.projects)}</td>
                  <td>{hours(shown.internal)}</td>
                  <td>{hours(shown.service)}</td>
                  <td>{hours(shown.absence)}</td>
                  <td>{hours(shown.sprints)}</td>
                  <td>{hours(shown.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {selected && (
        <>
          <button
            className="drawer-backdrop"
            onClick={() => setSelected(null)}
            aria-label="Close details"
          />
          <aside className="drawer">
            <button className="close" onClick={() => setSelected(null)} aria-label="Close">×</button>
            <h2>{selected.name}</h2>
            <p className="sub">
              {selected.department} · {report.rangeLabel} · {hours(selected.total)}h of {report.target}h
            </p>
            {selected.detail.length === 0 && (
              <p className="sub">Nothing logged in Projects, People or Sprints this week.</p>
            )}
            {selected.detail.map((d) => (
              <div className="detail-row" key={`${d.category}-${d.label}`}>
                <span>
                  {d.label}
                  <span className="cat">{CATEGORY_LABELS[d.category]}</span>
                </span>
                <span className="h">{hours(d.hours)}h</span>
              </div>
            ))}
          </aside>
        </>
      )}
    </>
  );
}
