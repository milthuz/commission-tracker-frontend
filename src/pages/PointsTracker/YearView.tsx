import { useTranslation } from 'react-i18next';
import { fmtMonth, monthNames } from '../../lib/format';
import { ANNUAL_TIERS, type PointsData, UNASSIGNED, nextAnnualTier } from './points';

// Onglet « Année » (maquette « Suivi des points — onglet Année ») : une case par mois du plan
// v7.7, colorée selon le quota du mois, et la course au bonus annuel (240, 300, 360 points).

const card = 'rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';
const CELL = {
  ok: 'bg-[#D1FADF] text-[#054F31] dark:bg-[rgba(23,178,106,0.28)] dark:text-[#B7F0D1]',
  near: 'bg-[#FEF0C7] text-[#7A2E0E] dark:bg-[rgba(253,176,34,0.26)] dark:text-[#FEDF89]',
  miss: 'bg-[#FEE4E2] text-[#7A271A] dark:bg-[rgba(244,96,96,0.24)] dark:text-[#FECDCA]',
  cur: 'border-[1.5px] border-dashed border-[#575A61] bg-[#F7F7F8] text-black dark:border-[#999AA7] dark:bg-[#1B1B1B] dark:text-white',
};

export interface YearMonth { year: number; month: number; data: PointsData | null }

export default function YearView({ months, currentKey, teamFilter }: {
  months: YearMonth[];
  /** « AAAA-MM » du mois en cours (case en pointillés, pas encore jugée). */
  currentKey: string;
  /** Garde un représentant ? (même filtre d'équipe que l'onglet du mois) */
  teamFilter: (teamId: number | null) => boolean;
}) {
  const { t } = useTranslation();
  const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
  // En-tête de colonne : le mois seul (« Mai », « Juil. ») — l'année est dans le titre et la case.
  const names12 = monthNames('short');
  const colLabel = (m: number) => { const n = names12[m - 1]; return n.charAt(0).toUpperCase() + n.slice(1); };

  // Représentants : ceux du mois le plus récent d'abord, puis ceux qui n'apparaissent qu'avant.
  const names: string[] = [];
  const meta = new Map<string, { team: string | null; teamId: number | null; probation: boolean }>();
  for (const mo of [...months].reverse()) {
    for (const r of mo.data?.reps || []) {
      if (r.repName === UNASSIGNED || meta.has(r.repName)) continue;
      meta.set(r.repName, { team: r.team?.name || null, teamId: r.team?.id ?? null, probation: !!r.probation?.inProbation });
      names.push(r.repName);
    }
  }
  const shown = names.filter((n) => teamFilter(meta.get(n)!.teamId));

  type Cell = { v: number | null; quota: number; kind: keyof typeof CELL | null; title: string };
  const rows = shown.map((name) => {
    let met = 0, closed = 0, total = 0;
    const cells: Cell[] = months.map((mo) => {
      const label = fmtMonth(mo.year, mo.month);
      const r = mo.data?.reps.find((x) => x.repName === name);
      if (!mo.data) return { v: null, quota: 15, kind: null, title: t('pointsTracker.year.notLoaded', { month: label }) };
      if (!r) return { v: null, quota: 15, kind: null, title: t('pointsTracker.year.absent', { month: label }) };
      const q = r.quota || 15;
      total += r.totalPoints;
      if (key(mo.year, mo.month) === currentKey) return { v: r.totalPoints, quota: q, kind: 'cur', title: t('pointsTracker.year.cellCurrent', { month: label, pts: r.totalPoints, quota: q }) };
      closed++;
      if (r.totalPoints >= q) { met++; return { v: r.totalPoints, quota: q, kind: 'ok', title: t('pointsTracker.year.cellMet', { month: label, pts: r.totalPoints }) }; }
      if (r.totalPoints >= q - 3) return { v: r.totalPoints, quota: q, kind: 'near', title: t('pointsTracker.year.cellNear', { month: label, pts: r.totalPoints, gap: q - r.totalPoints }) };
      return { v: r.totalPoints, quota: q, kind: 'miss', title: t('pointsTracker.year.cellMissed', { month: label, pts: r.totalPoints }) };
    });
    // Mois consécutifs manqués, en partant du dernier mois clos (pour « À surveiller »).
    let streak = 0;
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i];
      if (c.kind === 'cur' || c.kind === null) continue;
      if (c.kind === 'ok') break;
      streak++;
    }
    const tier = nextAnnualTier(total);
    return { name, meta: meta.get(name)!, cells, met, closed, total, tier, streak };
  });

  // Encarts du bas.
  const closedCells = rows.flatMap((r) => r.cells.filter((c) => c.kind && c.kind !== 'cur'));
  const okCells = closedCells.filter((c) => c.kind === 'ok').length;
  const rate = closedCells.length ? Math.round((okCells / closedCells.length) * 100) : null;
  const monthTotals = months.map((mo, i) => ({
    label: (() => { const l = fmtMonth(mo.year, mo.month); return l.charAt(0).toUpperCase() + l.slice(1); })(),
    closed: key(mo.year, mo.month) !== currentKey,
    pts: rows.reduce((s, r) => s + (r.cells[i].v || 0), 0),
    met: rows.filter((r) => r.cells[i].kind === 'ok').length,
    present: rows.filter((r) => r.cells[i].v != null).length,
  }));
  const best = monthTotals.filter((m) => m.closed && m.pts > 0).sort((a, b) => b.pts - a.pts)[0] || null;
  const watch = [...rows].filter((r) => r.streak >= 2).sort((a, b) => b.streak - a.streak)[0] || null;

  const legend = [
    { cls: CELL.ok, label: t('pointsTracker.year.legendMet') },
    { cls: CELL.near, label: t('pointsTracker.year.legendNear') },
    { cls: CELL.miss, label: t('pointsTracker.year.legendMissed') },
    { cls: CELL.cur, label: t('pointsTracker.year.legendCurrent') },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[15px] text-[#424242] dark:text-bodydark">{t('pointsTracker.year.intro', { tiers: ANNUAL_TIERS.join(', ') })}</p>
      <div className="flex flex-wrap gap-4 text-xs text-body dark:text-bodydark2">
        {legend.map((l) => <span key={l.label} className="flex items-center gap-1.5"><span className={`box-border h-3.5 w-3.5 rounded ${l.cls}`} />{l.label}</span>)}
      </div>

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[820px] border-separate border-spacing-1 p-2 text-sm">
          <caption className="sr-only">{t('pointsTracker.year.caption')}</caption>
          <thead>
            <tr className="text-center text-xs text-body dark:text-bodydark2">
              <th scope="col" className="px-2.5 py-2 text-left font-bold">{t('pointsTracker.year.rep')}</th>
              {months.map((mo) => <th scope="col" key={key(mo.year, mo.month)} className="w-[74px] px-1 py-2 font-bold">{colLabel(mo.month)}</th>)}
              <th scope="col" className="px-2.5 py-2 font-bold">{t('pointsTracker.year.monthsAtQuota')}</th>
              <th scope="col" className="w-[220px] px-2.5 py-2 text-left font-bold">{t('pointsTracker.year.annualBonus')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={months.length + 3} className="py-8 text-center text-body dark:text-bodydark2">{t('pointsTracker.year.empty')}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.name}>
                <th scope="row" className="px-2.5 py-2 text-left font-normal">
                  <span className="flex flex-col gap-0.5">
                    <span className="font-bold text-black dark:text-white">{r.name}</span>
                    <span className="text-xs text-body dark:text-bodydark2">{[r.meta.team, r.meta.probation ? t('pointsTracker.probation') : null].filter(Boolean).join(' · ') || t('pointsTracker.noTeam')}</span>
                  </span>
                </th>
                {r.cells.map((c, i) => (
                  <td key={i} title={c.title} aria-label={c.title}
                    className={`box-border h-11 rounded-lg text-center font-bold ${c.kind ? CELL[c.kind] : 'text-body dark:text-bodydark2'}`}>
                    {c.v ?? '—'}
                  </td>
                ))}
                <td className="text-center font-bold text-black dark:text-white">{r.met} / {r.closed}</td>
                <td className="px-2.5 py-2">
                  <span className="flex flex-col gap-1.5">
                    <span className="flex justify-between text-[13px]">
                      <b className="text-black dark:text-white">{r.total} pts</b>
                      <span className="text-body dark:text-bodydark2">{r.tier ? t('pointsTracker.year.toTier', { count: r.tier - r.total, tier: r.tier }) : t('pointsTracker.year.topTier', { tier: ANNUAL_TIERS[ANNUAL_TIERS.length - 1] })}</span>
                    </span>
                    <span role="img" aria-label={t('pointsTracker.year.barAria', { pts: r.total, max: ANNUAL_TIERS[ANNUAL_TIERS.length - 1] })}
                      className="relative block h-2 rounded-full bg-[#ECECEE] dark:bg-[#232323]">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(Math.min(r.total, 360) / 360) * 100}%` }} />
                      {ANNUAL_TIERS.slice(0, -1).map((tier) => (
                        <span key={tier} className="absolute inset-y-0 w-0.5 bg-white dark:bg-boxdark" style={{ left: `${(tier / 360) * 100}%` }} />
                      ))}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
        <div className={`${card} flex flex-col gap-1.5 p-4`}>
          <span className="text-xs text-body dark:text-bodydark2">{t('pointsTracker.year.rate')}</span>
          <span className="text-2xl font-bold text-black dark:text-white">{rate == null ? '—' : `${rate} %`}</span>
          <span className="text-[13px] text-body dark:text-bodydark2">{t('pointsTracker.year.rateSub', { ok: okCells, total: closedCells.length })}</span>
        </div>
        <div className={`${card} flex flex-col gap-1.5 p-4`}>
          <span className="text-xs text-body dark:text-bodydark2">{t('pointsTracker.year.best')}</span>
          <span className="text-2xl font-bold text-black dark:text-white">{best ? `${best.label} · ${best.pts} pts` : '—'}</span>
          {best && <span className="text-[13px] text-body dark:text-bodydark2">{t('pointsTracker.year.bestSub', { met: best.met, present: best.present })}</span>}
        </div>
        <div className={`${card} flex flex-col gap-1.5 p-4`}>
          <span className="text-xs text-body dark:text-bodydark2">{t('pointsTracker.year.watch')}</span>
          <span className="text-2xl font-bold text-black dark:text-white">{watch ? watch.name : t('pointsTracker.year.watchNone')}</span>
          {watch && <span className="text-[13px] text-body dark:text-bodydark2">{t('pointsTracker.year.watchSub', { count: watch.streak })}</span>}
        </div>
      </div>
    </div>
  );
}
