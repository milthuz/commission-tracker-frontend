// Guide — volet 3 : règle des 40 (modèle FY2027 ET réels quand ils existent), leviers chiffrés,
// tableau de repères SaaS / POS sourcés (modifiable) et zones à améliorer avec le département.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineError, StatusPill, toast } from '../../../components/ui';
import type { StatusFamily } from '../../../components/ui';
import { CARD, CARD_BODY, CARD_HEAD, CARD_SUB, CARD_TITLE, INPUT, LABEL, TABLE, TABLE_WRAP, TD, TH, THEAD_ROW } from '../../../components/ui/surface';
import { ContentLoader } from '../../../common/Loader';
import { useFinance } from '../FinanceContext';
import { BenchmarkModal } from './BenchmarkModal';
import { errCode, guideApi, type Benchmark, type BenchmarksPayload, type MetricKey, type SavingsPayload } from './api';
import { METRIC_DEPT, THRESHOLD, benchmarkPrompt, compareBenchmarks, levers, marginPtsFromCut, modelMetrics, type CompareStatus } from './guideModel';
import { copyText, fmtUnit, useL } from './shared';

const STATUS_FAMILY: Record<CompareStatus, StatusFamily> = { better: 'ok', on_par: 'neutral', worse: 'err', no_metric: 'neutral', to_validate: 'wait' };

export function BenchmarksTab() {
  const { t, i18n } = useTranslation();
  const L = useL();
  const { payload, result, fmt } = useFinance();
  const [bm, setBm] = useState<BenchmarksPayload | null>(null);
  const [savings, setSavings] = useState<SavingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Benchmark | 'new' | null>(null);
  const [cut, setCut] = useState('');

  const load = useCallback(async () => {
    try { setBm(await guideApi.benchmarks()); setError(null); } catch (e) { setError(errCode(e)); }
    // Les réels sont facultatifs ici : leur absence ne bloque pas l'écran.
    try { setSavings(await guideApi.savings()); } catch { setSavings(null); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const model = useMemo(() => modelMetrics(result, payload.reference), [result, payload.reference]);
  const actual = savings && savings.hasActuals ? savings.metrics : null;
  const actualMetrics = useMemo(() => (actual ? {
    rule_of_40: actual.rule40, revenue_growth: actual.growthPct, gross_margin: actual.grossMarginPct, ebitda_margin: actual.ebitdaMarginPct,
  } as Partial<Record<MetricKey, number | null>> : null), [actual]);
  const list = bm ? bm.benchmarks : [];
  const cmpModel = useMemo(() => compareBenchmarks(model.metrics, list), [model, list]);
  const cmpActual = useMemo(() => (actualMetrics ? compareBenchmarks(actualMetrics, list) : null), [actualMetrics, list]);

  if (error && !bm) return <InlineError title={error === 'forbidden' || error === 'demo' ? L(`errors.${error}`) : L('errors.load')} detail={error} onRetry={load} />;
  if (!bm) return <ContentLoader label={L('loading')} />;

  const fr = i18n.language.startsWith('fr');
  const labelOf = (b: Benchmark) => (fr ? b.labelFr : b.labelEn);
  const L40 = model.levers;
  const A40 = actual ? actual.levers : null;
  const cutN = cut.trim() ? fmt.parse(cut) : null;
  const copy = async (text: string) => { if (await copyText(text)) toast.success(L('copied')); };
  const money = (v: number | null) => (v == null ? '—' : fmt.fmt(v, '$'));
  const pts = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : ''}${fmt.pct(Math.abs(v)).replace(/\s?%$/, '')} pts`);
  const passPill = (passes: boolean | null, gap: number | null) => (passes == null || gap == null
    ? <StatusPill family="neutral">{L('r40.unknown')}</StatusPill>
    : <StatusPill family={passes ? 'ok' : 'err'}>{passes ? L('r40.above', { gap: pts(Math.abs(gap)) }) : L('r40.below', { gap: pts(Math.abs(gap)) })}</StatusPill>);

  // Zones à améliorer : repères (avec valeur, à signaler) sous lesquels le modèle OU les réels se situent.
  interface Flag { b: Benchmark; source: 'model' | 'actual'; current: number }
  const flags: Flag[] = [];
  for (const b of list) {
    const m = cmpModel.find((c) => c.id === b.id);
    if (m && m.flag && m.current != null) flags.push({ b, source: 'model', current: m.current });
    const a = cmpActual && cmpActual.find((c) => c.id === b.id);
    if (a && a.flag && a.current != null) flags.push({ b, source: 'actual', current: a.current });
  }
  const srcText = (b: Benchmark) => [b.sourceOrg, b.sourceYear, b.sourceUrl].filter(Boolean).join(' — ');

  const columnVal = (c: { status: CompareStatus; current: number | null } | undefined, b: Benchmark) => (c && c.current != null ? fmtUnit(fmt, c.current, b.unit) : '—');
  const statusOf = (b: Benchmark) => {
    const m = cmpModel.find((c) => c.id === b.id)!;
    const a = cmpActual && cmpActual.find((c) => c.id === b.id);
    return a && a.status !== 'no_metric' && a.status !== 'to_validate' ? a : m;
  };

  return (
    <div className="space-y-4">
      {error && <InlineError title={t(`finance.guide.errors.${error}`, { defaultValue: t('finance.guide.errors.generic', { code: error }) }) as string} />}

      {/* ----------------------------------------------------------- règle des 40 */}
      <section className={CARD}>
        <div className={CARD_HEAD}><h2 className={CARD_TITLE}>{L('r40.title')}</h2><p className={CARD_SUB}>{L('r40.sub', { n: THRESHOLD })}</p></div>
        <div className={`${CARD_BODY} grid gap-4 md:grid-cols-2`}>
          <div>
            <h3 className="m-0 mb-2 text-[13px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2">{L('r40.model', { fy: payload.budget.fiscalYear })}</h3>
            <dl className="m-0 space-y-1 text-[14px]">
              <div className="flex justify-between"><dt>{L('r40.growth')}</dt><dd className="m-0 tabular-nums">{L40.growth == null ? '—' : fmt.pct(L40.growth, true)}</dd></div>
              <div className="flex justify-between"><dt>{L('r40.marginEbitda')}</dt><dd className="m-0 tabular-nums">{L40.margin == null ? '—' : fmt.pct(L40.margin, true)}</dd></div>
              <div className="flex justify-between border-t border-stroke pt-1 font-bold dark:border-strokedark"><dt>{L('r40.score')}</dt><dd className="m-0 tabular-nums">{L40.score == null ? '—' : fmt.pct(L40.score)}</dd></div>
            </dl>
            <div className="mt-2">{passPill(L40.passes, L40.gap)}</div>
          </div>
          <div>
            <h3 className="m-0 mb-2 text-[13px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2">{L('r40.actual')}</h3>
            {actual ? (
              <>
                <dl className="m-0 space-y-1 text-[14px]">
                  <div className="flex justify-between"><dt>{L('r40.growth')}</dt><dd className="m-0 tabular-nums">{actual.growthPct == null ? '—' : fmt.pct(actual.growthPct, true)}</dd></div>
                  <div className="flex justify-between"><dt>{L('r40.marginOperating')}</dt><dd className="m-0 tabular-nums">{actual.ebitdaMarginPct == null ? '—' : fmt.pct(actual.ebitdaMarginPct, true)}</dd></div>
                  <div className="flex justify-between border-t border-stroke pt-1 font-bold dark:border-strokedark"><dt>{L('r40.score')}</dt><dd className="m-0 tabular-nums">{actual.rule40 == null ? '—' : fmt.pct(actual.rule40)}</dd></div>
                </dl>
                <div className="mt-2">{passPill(A40 ? A40.passes : null, A40 ? A40.gap : null)}</div>
                <p className="m-0 mt-2 text-[12px] text-body dark:text-bodydark2">{L('r40.actualPeriod', { from: actual.from, to: actual.to })}{savings && savings.metricsReason === 'growth_needs_24_months' ? ` ${L('r40.needs24')}` : ''}</p>
              </>
            ) : (
              <p className="m-0 text-[13px] text-body dark:text-bodydark2">{savings && savings.hasActuals ? L('r40.actualShort', { n: savings.monthsAvailable }) : L('r40.noActuals')}</p>
            )}
          </div>
        </div>
        <div className="space-y-1 border-t border-stroke px-5 py-3 text-[12px] text-body dark:border-strokedark dark:text-bodydark2">
          <p className="m-0">{L('r40.baseNote', { fy: payload.budget.fiscalYear })}</p>
          <p className="m-0">{L('r40.cashFlowMissing')}</p>
        </div>
      </section>

      {/* ----------------------------------------------------------- leviers */}
      <section className={CARD}>
        <div className={CARD_HEAD}><h2 className={CARD_TITLE}>{L('lev.title')}</h2><p className={CARD_SUB}>{L('lev.sub', { fy: payload.budget.fiscalYear })}</p></div>
        <ul className={`${CARD_BODY} m-0 list-disc space-y-1.5 pl-9 text-[14px] text-black dark:text-white`}>
          <li>{L('lev.growth', { amt: money(L40.onePtGrowthRevenue) })}</li>
          <li>{L('lev.margin', { amt: money(L40.onePtMarginOpex) })}</li>
          {L40.score != null && L40.shortfall > 0 && (
            <>
              <li>{L('lev.gapGrowth', { pts: pts(L40.shortfall), amt: money(L40.extraRevenueNeeded) })}</li>
              <li>{L('lev.gapCost', { pts: pts(L40.shortfall), amt: money(L40.costCutNeeded), pct: L40.costCutPctOfOpex == null ? '—' : fmt.pct(L40.costCutPctOfOpex) })}</li>
            </>
          )}
          {L40.score != null && L40.shortfall === 0 && <li>{L('lev.ok')}</li>}
          {L40.score == null && <li>{L('lev.unknown')}</li>}
        </ul>
        <div className="flex flex-wrap items-end gap-3 border-t border-stroke px-5 py-3 dark:border-strokedark">
          <div>
            <label className={LABEL} htmlFor="lev-cut">{L('lev.whatIf')}</label>
            <input id="lev-cut" inputMode="decimal" className={`${INPUT} w-[160px]`} value={cut} onChange={(e) => setCut(e.target.value)} placeholder="50 000" />
          </div>
          {cutN != null && cutN > 0 && model.inputs.revenue ? (
            <p role="status" className="m-0 pb-2 text-[13px] text-black dark:text-white">
              {L('lev.whatIfResult', {
                amt: money(cutN), pts: pts(marginPtsFromCut(cutN, model.inputs.revenue)),
                score: L40.score == null ? '—' : fmt.pct(levers({ ...model.inputs, profit: (model.inputs.profit || 0) + cutN }).score),
              })}
            </p>
          ) : <span className="pb-2 text-[12px] text-body dark:text-bodydark2">{L('lev.whatIfHelp')}</span>}
        </div>
      </section>

      {/* ----------------------------------------------------------- zones à améliorer */}
      <section className={CARD}>
        <div className={CARD_HEAD}><h2 className={CARD_TITLE}>{L('flags.title')}</h2><p className={CARD_SUB}>{L('flags.sub')}</p></div>
        {flags.length === 0 ? <p className="m-0 p-5 text-[13px] text-body dark:text-bodydark2">{L('flags.none')}</p> : (
          <ul className="m-0 list-none divide-y divide-stroke p-0 dark:divide-strokedark">
            {flags.map((f) => {
              const dept = METRIC_DEPT[f.b.metric];
              const mine = fmtUnit(fmt, f.current, f.b.unit);
              const bench = fmtUnit(fmt, f.b.value, f.b.unit);
              return (
                <li key={`${f.b.id}:${f.source}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[14px] font-bold text-black dark:text-white">{L(`metric.${f.b.metric}`)} <StatusPill family="err">{L(`flags.source.${f.source}`)}</StatusPill></p>
                    <p className="m-0 text-[13px] text-body dark:text-bodydark2">{L('flags.line', { mine, bench, label: labelOf(f.b) })}</p>
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    <StatusPill family="new">{L(`group.${dept}`)}</StatusPill>
                    <Button size="xs" variant="secondary" aria-label={`${L('flags.copy')} — ${L(`metric.${f.b.metric}`)}`} onClick={() => copy(benchmarkPrompt({
                      label: labelOf(f.b), mine, bench, source: srcText(f.b), dept: L(`group.${dept}`), metricLabel: L(`metric.${f.b.metric}`),
                    }, L))}>{L('flags.copy')}</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ----------------------------------------------------------- tableau des repères */}
      <section className={CARD}>
        <div className={`${CARD_HEAD} flex flex-wrap items-start justify-between gap-3`}>
          <div><h2 className={CARD_TITLE}>{L('bench.title')}</h2><p className={CARD_SUB}>{L('bench.sub', { v: bm.shippedVersion })}</p></div>
          {bm.caps.canEdit && <Button size="sm" variant="secondary" onClick={() => setEdit('new')}>{L('bench.add')}</Button>}
        </div>
        <div className={`${TABLE_WRAP} m-3`}>
          <table className={TABLE}>
            <thead><tr className={THEAD_ROW}>
              <th className={`${TH} text-left`}>{L('bench.col.benchmark')}</th><th className={`${TH} text-right`}>{L('bench.col.value')}</th>
              <th className={`${TH} text-right`}>{L('bench.col.model')}</th><th className={`${TH} text-right`}>{L('bench.col.actual')}</th>
              <th className={`${TH} text-left`}>{L('bench.col.status')}</th><th className={`${TH} text-left`}>{L('bench.col.source')}</th>
              {bm.caps.canEdit && <th className={TH}><span className="sr-only">{L('bench.col.edit')}</span></th>}
            </tr></thead>
            <tbody>
              {list.map((b) => {
                const c = statusOf(b);
                const cm = cmpModel.find((x) => x.id === b.id);
                const ca = cmpActual ? cmpActual.find((x) => x.id === b.id) : undefined;
                return (
                  <tr key={b.id}>
                    <td className={TD}>
                      {labelOf(b)}
                      <div className="mt-0.5 flex flex-wrap gap-1.5">
                        <span className="text-[11px] text-body dark:text-bodydark2">{L(`metric.${b.metric}`)}</span>
                        {b.kind !== 'public' && <StatusPill family="neutral">{L(`kind.${b.kind}`)}</StatusPill>}
                        {b.edited && <StatusPill family="new">{L('bench.edited')}</StatusPill>}
                      </div>
                      {b.note && (
                        <div className="mt-0.5 text-[12px] text-body dark:text-bodydark2">
                          {/* Remarque livrée avec l'application (en anglais dans la base) : traduite par identifiant tant que la CFO ne l'a pas modifiée. */}
                          {b.origin === 'shipped' && !b.edited
                            ? t(`finance.guide.bench.shippedNote.${b.id.replace(/\./g, '_')}`, { defaultValue: b.note })
                            : b.note}
                        </div>
                      )}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{b.value == null ? '—' : fmtUnit(fmt, b.value, b.unit)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{columnVal(cm, b)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{columnVal(ca, b)}</td>
                    <td className={TD}><StatusPill family={STATUS_FAMILY[c.status]}>{L(`status.${c.status}`)}</StatusPill>{!b.useForFlags && b.value != null && <div className="mt-1 text-[11px] text-body dark:text-bodydark2">{L('bench.infoOnly')}</div>}</td>
                    <td className={`${TD} text-[12px]`}>
                      {b.value == null ? <span className="text-body dark:text-bodydark2">{L('bench.toValidate')}</span> : (
                        <>
                          {b.sourceUrl ? <a href={b.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent-ink underline dark:text-accent-ink-dark">{b.sourceOrg}</a> : b.sourceOrg}
                          <div className="text-body dark:text-bodydark2">{[b.sourceYear, b.sourceDate].filter(Boolean).join(' · ')}</div>
                        </>
                      )}
                    </td>
                    {bm.caps.canEdit && <td className={TD}><Button size="xs" variant="secondary" aria-label={`${L('bench.edit')} — ${labelOf(b)}`} onClick={() => setEdit(b)}>{L('bench.edit')}</Button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 border-t border-stroke px-5 py-3 text-[12px] text-body dark:border-strokedark dark:text-bodydark2">{L('bench.proxyNote')}</p>
      </section>

      {edit && (
        <BenchmarkModal key={edit === 'new' ? 'new' : edit.id} open onClose={() => setEdit(null)} existing={edit === 'new' ? null : edit} metrics={Object.keys(bm.metrics)} onSaved={load} />
      )}
    </div>
  );
}
