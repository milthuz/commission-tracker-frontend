import { useTranslation } from 'react-i18next';
import { X, Printer } from 'lucide-react';

// A scenario, presented for a decision rather than for editing. Deliberately a separate file and
// a separate visual language from the working table: the board is not choosing rates, it is
// approving a campaign, and the questions it asks are how much, from where, when does the money
// actually arrive, and what could go wrong.
//
// Every figure is derived from rows the caller has already computed with the page's own helpers —
// no business logic is duplicated here, so this view cannot drift from the table it summarises.

export interface BoardRow {
  orgName: string;
  planName: string;
  customerName: string;
  subscriptionNumber: string;
  // Amounts as Zoho bills them, per period — 799.95 for a yearly plan, 119 for a monthly one.
  currentPeriod: number;
  newPeriod: number;
  periodMonths: number;
  riskTier: 'low' | 'medium' | 'high';
  nextBillingAt: string | null;
  raised: boolean;
  skipped: boolean;
}

interface Props {
  scenarioName: string;
  targetMrr: number;
  rows: BoardRow[];
  onClose: () => void;
}

const money0 = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n || 0);
const money2 = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD' }).format(n || 0);
const pct1 = (n: number) => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(1)}%`;

const monthlyDeltaOf = (r: BoardRow) => (r.newPeriod - r.currentPeriod) / r.periodMonths;
const monthlyNowOf = (r: BoardRow) => r.currentPeriod / r.periodMonths;

// Months from now until this subscription's next renewal, clamped to a 0-11 window. A renewal
// date already in the past (or missing) lands in month 0 — the increase takes effect at the very
// next billing run, so counting it immediately is the honest reading.
const monthsUntilRenewal = (raw: string | null): number => {
  if (!raw) return 0;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(raw);
  if (isNaN(d.getTime())) return 0;
  const now = new Date();
  const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  return Math.max(0, Math.min(11, months));
};

export default function SaasIncreaseBoard({ scenarioName, targetMrr, rows, onClose }: Props) {
  const { t, i18n } = useTranslation();

  const raised = rows.filter(r => r.raised);
  const skipped = rows.filter(r => r.skipped);
  const untouched = rows.filter(r => !r.raised && !r.skipped);

  const mrrAdd = raised.reduce((sum, r) => sum + monthlyDeltaOf(r), 0);
  const mrrBase = raised.reduce((sum, r) => sum + monthlyNowOf(r), 0);
  // Weighted by revenue, not a mean of percentages: a 20% bump on a $40 plan and a 2% bump on a
  // $2,000 plan do not average to 11% in any sense a board would recognise.
  const avgPct = mrrBase > 0 ? (mrrAdd / mrrBase) * 100 : 0;
  const targetPct = targetMrr > 0 ? Math.min(100, (mrrAdd / targetMrr) * 100) : 0;

  // Realisation curve. The increase lands at each subscription's own renewal, so the full
  // run-rate is not reached until the last one comes round. Presenting the headline number as if
  // it arrived on day one would overstate the first year by roughly half.
  const ramp: number[] = Array.from({ length: 12 }, () => 0);
  for (const r of raised) ramp[monthsUntilRenewal(r.nextBillingAt)] += monthlyDeltaOf(r);
  const cumulative = ramp.reduce<number[]>((acc, v, i) => [...acc, (acc[i - 1] || 0) + v], []);
  // Cash actually collected across the first 12 months — each month's realised run-rate summed,
  // which is what the first year is worth, not 12 x the headline.
  const firstYearCash = cumulative.reduce((sum, v) => sum + v, 0);
  const rampMax = cumulative[11] || 1;
  const monthsToFull = cumulative.findIndex(v => v >= rampMax * 0.999) + 1;

  const groupBy = (key: (r: BoardRow) => string) => {
    const map = new Map<string, BoardRow[]>();
    for (const r of raised) {
      const k = key(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries())
      .map(([k, rs]) => ({
        key: k,
        count: rs.length,
        base: rs.reduce((s, r) => s + monthlyNowOf(r), 0),
        add: rs.reduce((s, r) => s + monthlyDeltaOf(r), 0),
      }))
      .sort((a, b) => b.add - a.add);
  };
  const byOrg = groupBy(r => r.orgName);
  const bySegment = groupBy(r => `${r.orgName} · ${r.planName}`).slice(0, 12);

  const riskCount = (tier: BoardRow['riskTier']) => raised.filter(r => r.riskTier === tier).length;
  const riskMrr = (tier: BoardRow['riskTier']) =>
    raised.filter(r => r.riskTier === tier).reduce((s, r) => s + monthlyDeltaOf(r), 0);
  // The whole revenue relationship is what walks out if an account cancels — not merely the
  // increase. Stating the smaller number would understate the exposure it is meant to describe.
  const highExposure = raised
    .filter(r => r.riskTier === 'high')
    .reduce((s, r) => s + monthlyNowOf(r) + monthlyDeltaOf(r), 0);

  const monthLabel = (offset: number) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return d.toLocaleDateString(i18n.language, { month: 'short' });
  };
  const today = new Date().toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' });

  const sectionTitle = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400';
  const card = 'rounded-2xl border border-gray-200 bg-white';

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-gray-100 print:static print:overflow-visible print:bg-white">
      {/* Print rules live with the only view that needs them. The app chrome is fixed-position and
          would otherwise stamp a sidebar across every printed page. */}
      <style>{`
        @media print {
          body > *:not(.saas-board-root) { display: none !important; }
          .saas-board-root { position: static !important; }
          .saas-board-page { break-inside: avoid; page-break-inside: avoid; }
          .saas-board-break { break-before: page; page-break-before: always; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="saas-board-root">
        {/* Screen-only toolbar. */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white/90 px-6 py-3 backdrop-blur print:hidden">
          <div className="text-sm font-medium text-gray-900">{t('saasIncrease.board.title')}</div>
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90"
            >
              <Printer className="h-4 w-4" />
              {t('saasIncrease.board.print')}
            </button>
            <button
              type="button" onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <X className="h-4 w-4" />
              {t('saasIncrease.board.close')}
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-[900px] px-6 py-8 print:max-w-none print:px-0 print:py-0">
          {/* ---------------------------------------------------------------- Cover / the ask */}
          <header className="saas-board-page mb-8">
            <div className={sectionTitle}>{t('saasIncrease.board.eyebrow')}</div>
            <h1 className="mt-2 text-[32px] font-semibold leading-tight text-gray-900">{scenarioName}</h1>
            <div className="mt-1 text-sm text-gray-500">{today}</div>

            <div className={`${card} mt-6 p-8`}>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <div className={sectionTitle}>{t('saasIncrease.board.mrrAdded')}</div>
                  <div className="mt-1 text-[44px] font-semibold leading-none tracking-tight text-gray-900">
                    {money0(mrrAdd)}<span className="ml-1 text-lg font-normal text-gray-400">{t('saasIncrease.board.perMonth')}</span>
                  </div>
                  <div className="mt-2 text-sm text-gray-500">
                    {t('saasIncrease.board.annualised', { amount: money0(mrrAdd * 12) })}
                  </div>
                </div>
                <div className="text-right">
                  <div className={sectionTitle}>{t('saasIncrease.board.againstTarget')}</div>
                  <div className="mt-1 text-[28px] font-semibold leading-none text-gray-900">{pct1(targetPct)}</div>
                  <div className="mt-2 text-sm text-gray-500">{t('saasIncrease.board.ofTarget', { amount: money0(targetMrr) })}</div>
                </div>
              </div>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-primary" style={{ width: `${targetPct}%` }} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4">
              {[
                { label: t('saasIncrease.board.subsRaised'), value: String(raised.length), sub: t('saasIncrease.board.ofScope', { count: rows.length }) },
                { label: t('saasIncrease.board.avgIncrease'), value: pct1(avgPct), sub: t('saasIncrease.board.revenueWeighted') },
                { label: t('saasIncrease.board.baseAffected'), value: money0(mrrBase), sub: t('saasIncrease.board.baseAffectedSub') },
              ].map((k) => (
                <div key={k.label} className={`${card} p-5`}>
                  <div className={sectionTitle}>{k.label}</div>
                  <div className="mt-1.5 text-2xl font-semibold text-gray-900">{k.value}</div>
                  <div className="mt-1 text-xs text-gray-400">{k.sub}</div>
                </div>
              ))}
            </div>
          </header>

          {/* ---------------------------------------------------------- When the money arrives */}
          <section className="saas-board-page mb-8">
            <div className={sectionTitle}>{t('saasIncrease.board.timingTitle')}</div>
            <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-gray-600">
              {t('saasIncrease.board.timingBody')}
            </p>
            <div className={`${card} mt-4 p-6`}>
              <div className="flex items-end gap-1.5" style={{ height: 140 }}>
                {cumulative.map((v, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1.5" style={{ height: '100%' }}>
                    <div className="text-[10px] tabular-nums text-gray-400">{v > 0 ? money0(v) : ''}</div>
                    <div
                      className="w-full rounded-t bg-primary/85"
                      style={{ height: `${Math.max(2, (v / rampMax) * 100)}%` }}
                    />
                    <div className="text-[10px] text-gray-400">{monthLabel(i)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-4 border-t border-gray-100 pt-5">
                <div>
                  <div className={sectionTitle}>{t('saasIncrease.board.monthOne')}</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{money0(cumulative[0] || 0)}<span className="ml-1 text-xs font-normal text-gray-400">{t('saasIncrease.board.perMonth')}</span></div>
                </div>
                <div>
                  <div className={sectionTitle}>{t('saasIncrease.board.fullRunRate')}</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{t('saasIncrease.board.monthN', { count: monthsToFull })}</div>
                </div>
                <div>
                  <div className={sectionTitle}>{t('saasIncrease.board.firstYearCash')}</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{money0(firstYearCash)}</div>
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------ Where it comes from */}
          <section className="saas-board-page mb-8">
            <div className={sectionTitle}>{t('saasIncrease.board.sourceTitle')}</div>
            <div className={`${card} mt-3 overflow-hidden`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="px-5 py-2.5 font-semibold">{t('saasIncrease.board.colOrg')}</th>
                    <th className="px-5 py-2.5 text-right font-semibold">{t('saasIncrease.board.colSubs')}</th>
                    <th className="px-5 py-2.5 text-right font-semibold">{t('saasIncrease.board.colCurrent')}</th>
                    <th className="px-5 py-2.5 text-right font-semibold">{t('saasIncrease.board.colAdded')}</th>
                    <th className="px-5 py-2.5 text-right font-semibold">{t('saasIncrease.board.colPct')}</th>
                  </tr>
                </thead>
                <tbody>
                  {byOrg.map((g) => (
                    <tr key={g.key} className="border-b border-gray-100 last:border-0">
                      <td className="px-5 py-3 font-medium text-gray-900">{g.key}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-600">{g.count}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-600">{money0(g.base)}</td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums text-gray-900">{money0(g.add)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-600">{pct1(g.base > 0 ? (g.add / g.base) * 100 : 0)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-5 py-3 text-gray-900">{t('saasIncrease.board.total')}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-900">{raised.length}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-900">{money0(mrrBase)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-900">{money0(mrrAdd)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-900">{pct1(avgPct)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* --------------------------------------------------------------------- Top segments */}
          <section className="saas-board-page saas-board-break mb-8">
            <div className={sectionTitle}>{t('saasIncrease.board.segmentTitle')}</div>
            <div className={`${card} mt-3 p-6`}>
              {bySegment.map((g) => (
                <div key={g.key} className="mb-3.5 last:mb-0">
                  <div className="mb-1 flex items-baseline justify-between gap-4">
                    <span className="truncate text-[13px] text-gray-700">{g.key}</span>
                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-gray-900">
                      {money0(g.add)}
                      <span className="ml-2 text-xs font-normal text-gray-400">{g.count}</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(g.add / (bySegment[0]?.add || 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ---------------------------------------------------------------------------- Risk */}
          <section className="saas-board-page mb-8">
            <div className={sectionTitle}>{t('saasIncrease.board.riskTitle')}</div>
            <div className="mt-3 grid grid-cols-3 gap-4">
              {(['low', 'medium', 'high'] as const).map((tier) => (
                <div key={tier} className={`${card} p-5`}>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: tier === 'low' ? '#22C55E' : tier === 'medium' ? '#F59E0B' : '#EF4444' }}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {t(`saasIncrease.risk.${tier}`)}
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-gray-900">{riskCount(tier)}</div>
                  <div className="mt-1 text-xs text-gray-400">{t('saasIncrease.board.riskAdds', { amount: money0(riskMrr(tier)) })}</div>
                </div>
              ))}
            </div>
            <div className={`${card} mt-4 p-6`}>
              <div className="text-sm font-medium text-gray-900">{t('saasIncrease.board.exposureTitle')}</div>
              <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-gray-600">
                {t('saasIncrease.board.exposureBody', { amount: money0(highExposure), count: riskCount('high') })}
              </p>
              <p className="mt-3 max-w-[62ch] text-xs leading-relaxed text-gray-400">
                {t('saasIncrease.board.riskCaveat')}
              </p>
            </div>
          </section>

          {/* ------------------------------------------------------------------ Not in the plan */}
          <section className="saas-board-page mb-8">
            <div className={sectionTitle}>{t('saasIncrease.board.excludedTitle')}</div>
            <div className={`${card} mt-3 grid grid-cols-2 gap-6 p-6`}>
              <div>
                <div className="text-2xl font-semibold text-gray-900">{skipped.length}</div>
                <div className="mt-1 text-sm text-gray-500">{t('saasIncrease.board.excludedSkipped')}</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-gray-900">{untouched.length}</div>
                <div className="mt-1 text-sm text-gray-500">{t('saasIncrease.board.excludedUntouched')}</div>
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------------- Assumptions */}
          <footer className="saas-board-page border-t border-gray-200 pt-6">
            <div className={sectionTitle}>{t('saasIncrease.board.methodTitle')}</div>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-gray-500">
              {['effective', 'planOnly', 'preTax', 'heuristic', 'reversible'].map((k) => (
                <li key={k} className="flex gap-2">
                  <span className="text-gray-300">—</span>
                  <span className="max-w-[76ch]">{t(`saasIncrease.board.method.${k}`)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 text-[11px] text-gray-400">
              {t('saasIncrease.board.footer', { total: money2(mrrAdd) })}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
