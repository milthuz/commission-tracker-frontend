// Module Finance — Prévision des ventes · BvA. Par mois : MRR ajouté, nouveaux marchands,
// installations — réel (ce que Sales Hub sait), budget (modèle de drivers pour l'exercice du
// budget maître ; saisi par la CFO pour les autres), prévision (saisie / import de la CFO pour les
// mois non clos), atterrissage. Aucun chiffre inventé : une source absente le DIT.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, StatusPill } from '../../../components/ui';
import { SEG, segBtn } from '../../../components/ui/surface';
import Select from '../../../components/Select';
import PageTitle from '../../../components/PageTitle';
import { Card, EditLegend, Kpi, KpiRow, NumCell } from '../components';
import { useFinance } from '../FinanceContext';
import { downloadCsv } from '../format';
import { fcApi } from './api';
import {
  buildSales, liveSource, modelSalesBudget, salesRows, salesTiles, varianceDrivers,
  type Period, type SalesCells, type SalesField, type SalesMonth, type SalesRow, type SalesSeries,
} from './engine';
import { CHART, Chart, FcHeader, Grid, ImportExcel, Note, PageGate, SaveBadge, compact, toneCls, useChartBase, useDocSaver, useLoad, usePeriodLabel, type Col } from './ui';

export default function SalesForecast() {
  const { t } = useTranslation();
  const F = useFinance();
  const { fmt } = F;
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [period, setPeriod] = useState<Period>('m');
  const [metric, setMetric] = useState<SalesField>('mrr');
  const load = useLoad(() => fcApi.sales(year), [year]);
  const p = load.data;
  const onConflict = load.reload;
  const saver = useDocSaver<{ cells: SalesCells }>('sales', p?.doc, onConflict);
  const periodLabel = usePeriodLabel();
  const { base } = useChartBase();

  // Budget de l'exercice du budget maître = modèle de drivers (lecture seule ici, modifiable sur
  // la page Drivers) ; les autres années : grille saisie par la CFO.
  const modelYear = F.payload.budget.fiscalYear;
  const model = useMemo(() => (year === modelYear ? modelSalesBudget(F.payload.reference.start, F.result.Rm, F.result.I) : null), [year, modelYear, F.payload.reference.start, F.result]);

  const cells = saver.data?.cells || {};
  const months = useMemo(() => (p ? buildSales(year, p.today.ym, p.actual, cells, model) : []), [p, year, cells, model]);
  const prior = useMemo(() => (p ? buildSales(year - 1, p.today.ym, p.prior, cells, null) : null), [p, year, cells]);
  const rows = useMemo(() => salesRows(months, period, year), [months, period, year]);
  const priorRows = useMemo(() => (prior ? salesRows(prior, period, year - 1) : []), [prior, period, year]);
  const hasPrior = priorRows.some((r) => r.actual[metric] != null);
  const tiles = useMemo(() => (p ? salesTiles(months, prior, p.today.ym, p.today.day) : null), [months, prior, p]);
  const drivers = useMemo(() => (p ? varianceDrivers(months, p.actual, model, year) : null), [months, p, model, year]);

  const gate = <PageGate error={load.error} loading={!p} onRetry={load.reload} />;
  if (!p || !saver.data) return <><PageTitle titleKey="finance.forecasts.sales.title" />{gate}</>;
  const canEdit = p.caps.canEdit;
  const src = { mrr: p.actual.mrr.source, merchants: p.actual.merchants.source, installs: p.actual.installs.source } as Record<SalesField, string>;

  const setCell = (series: SalesSeries, k: string, f: SalesField, v: number | null) => saver.update((d) => {
    const c: SalesCells = JSON.parse(JSON.stringify(d.cells || {}));
    const byYm = (c[series] = c[series] || {});
    const cell = { ...(byYm[k] || {}) };
    if (v == null) delete cell[f]; else cell[f] = v;
    if (Object.keys(cell).length) byYm[k] = cell; else delete byYm[k];
    return { cells: c };
  });

  const money = metric === 'mrr';
  const show = (v: number | null | undefined, approx = false) => (v == null ? '—' : `${approx ? '~' : ''}${money ? fmt.fmt(v, '$') : fmt.fmt(v, 'n')}`);
  const editCell = (series: SalesSeries, r: SalesRow, value: number | null) => {
    const k = months[r.months[0]].ym;
    return <NumCell value={value ?? NaN} decimals={money ? 2 : 1} label={`${t(`finance.forecasts.sales.series.${series}`)} — ${periodLabel(r.label.kind, r.label.index, year)}`} onChange={(v) => setCell(series, k, metric, v)} />;
  };
  const monthOf = (r: SalesRow): SalesMonth | null => (period === 'm' && r.label.kind === 'm' ? months[r.months[0]] : null);

  const statusPill = (r: SalesRow) => {
    if (r.status === 'future') return <StatusPill family="neutral">{t('finance.forecasts.sales.status.forecast')}</StatusPill>;
    if (r.status === 'mtd') return <StatusPill family="neutral">{t('finance.forecasts.sales.status.mtd')}</StatusPill>;
    if (r.status === 'mixed') return <StatusPill family="neutral">{t('finance.forecasts.sales.status.mixed')}</StatusPill>;
    if (!r.track) return <StatusPill family="neutral">{t('finance.forecasts.sales.status.closed')}</StatusPill>;
    return <StatusPill family={r.track === 'onTrack' ? 'ok' : 'wait'}>{t('finance.forecasts.sales.status.closed')} · {t(`finance.forecasts.sales.status.${r.track}`)}</StatusPill>;
  };

  const cols: Col<SalesRow>[] = [
    { id: 'p', head: t('finance.forecasts.common.period'), cell: (r) => (r.label.kind !== period ? t('finance.forecasts.common.totalFy', { y: year }) : periodLabel(r.label.kind, r.label.index, year)), left: true },
    { id: 's', head: t('finance.forecasts.common.status'), cell: (r) => (r.label.kind !== period ? '' : statusPill(r)), left: true },
    ...(hasPrior ? [{ id: 'py', head: t('finance.forecasts.sales.priorYear', { y: year - 1 }), cell: (r: SalesRow) => show(priorRows[r.label.index]?.actual[metric]) }] : []),
    {
      id: 'b', head: t('finance.forecasts.sales.series.budget'), cell: (r) => {
        const m = monthOf(r);
        return m && !model && canEdit ? editCell('budget', r, m.budget[metric]) : show(r.budget[metric]);
      },
    },
    {
      id: 'a', head: t('finance.forecasts.sales.series.actual'), cell: (r) => {
        const m = monthOf(r);
        return m && m.status !== 'future' && !liveSource(src[metric]) && canEdit ? editCell('actual', r, m.actual[metric]) : show(r.actual[metric]);
      },
    },
    {
      id: 'f', head: t('finance.forecasts.sales.series.forecast'), cell: (r) => {
        const m = monthOf(r);
        return m && m.status !== 'closed' && canEdit ? editCell('forecast', r, m.forecast[metric]) : show(m ? m.forecast[metric] : null);
      },
    },
    { id: 'l', head: t('finance.forecasts.sales.landing'), cell: (r) => show(r.landing[metric], r.status !== 'closed') },
    {
      id: 'v', head: t('finance.forecasts.common.variance'), cell: (r) => {
        const v = r.landing[metric] != null && r.budget[metric] != null ? (r.landing[metric] as number) - (r.budget[metric] as number) : null;
        return <span className={toneCls(v)}>{v == null ? '—' : `${v >= 0 ? '+' : '−'}${money ? fmt.fmt(Math.abs(v), '$') : fmt.fmt(Math.abs(v), 'n')}`}</span>;
      },
    },
    {
      id: 'vp', head: '%', cell: (r) => {
        const b = r.budget[metric], l = r.landing[metric];
        const v = l != null && b ? ((l - b) / Math.abs(b)) * 100 : null;
        return <span className={toneCls(v)}>{v == null ? '—' : fmt.pct(v, true)}</span>;
      },
    },
  ];
  const tot = salesRows(months, 'y', year)[0];
  const foot: SalesRow = tot;

  // Graphique : FY−1 (si connue), budget, réel puis atterrissage (plus pâle).
  const cats = rows.map((r) => periodLabel(r.label.kind, r.label.index, year));
  const series: ApexAxisChartSeries = [
    ...(hasPrior ? [{ name: t('finance.forecasts.sales.priorYear', { y: year - 1 }), data: priorRows.map((r) => r.actual[metric] ?? 0) }] : []),
    { name: t('finance.forecasts.sales.series.budget'), data: rows.map((r) => r.budget[metric] ?? 0) },
    { name: t('finance.forecasts.sales.series.actual'), data: rows.map((r) => (r.status === 'closed' ? r.actual[metric] ?? 0 : 0)) },
    { name: t('finance.forecasts.sales.landingFcst'), data: rows.map((r) => (r.status !== 'closed' ? r.landing[metric] ?? 0 : 0)) },
  ];
  const colors = [...(hasPrior ? [CHART.prior] : []), CHART.budget, CHART.brand, CHART.brandSoft];
  const fmtAxis = compact(fmt.loc);
  const options = base({
    chart: { type: 'bar' },
    colors,
    plotOptions: { bar: { columnWidth: period === 'm' ? '70%' : '45%', borderRadius: 3 } },
    xaxis: { categories: cats },
    yaxis: { labels: { formatter: (v: number) => fmtAxis(v) } },
    tooltip: { y: { formatter: (v: number) => (money ? fmt.fmt(v, '$') : fmt.fmt(v, 'n')) } },
  });

  const exportCsv = () => downloadCsv(`sales-forecast-${year}.csv`,
    [t('finance.forecasts.common.month'), t('finance.forecasts.common.status'),
      ...(['mrr', 'merchants', 'installs'] as SalesField[]).flatMap((f) => (['budget', 'actual', 'forecast'] as const).map((s) => `${t(`finance.forecasts.sales.metric.${f}`)} — ${t(`finance.forecasts.sales.series.${s}`)}`)),
      t('finance.forecasts.sales.metric.mrr') + ' — ' + t('finance.forecasts.sales.landing')],
    months.map((m) => [m.ym, t(`finance.forecasts.sales.status.${m.status === 'future' ? 'forecast' : m.status}`),
      ...(['mrr', 'merchants', 'installs'] as SalesField[]).flatMap((f) => [m.budget[f], m.actual[f], m.forecast[f]]), m.landing.mrr]), fmt.fr);

  const yearOpts = [...new Set([new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1, modelYear])].sort().map((y) => ({ value: String(y), label: `FY${y}` }));
  const metricVal = (v: number | null) => (v == null ? '—' : fmt.fmt(v, '$'));

  return (
    <>
      <PageTitle titleKey="finance.forecasts.sales.title" />
      <FcHeader
        group={t('finance.forecasts.group')}
        title={t('finance.forecasts.sales.title')}
        subtitle={t('finance.forecasts.sales.subtitle')}
        right={<SaveBadge status={saver.status} error={saver.error} />}
        notice={saver.notice}
        actions={<>
          <div className="w-[120px]"><Select value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOpts} /></div>
          <div className={SEG} role="group" aria-label={t('finance.forecasts.common.period')}>
            {(['m', 'q', 'y'] as Period[]).map((x) => <button key={x} type="button" aria-pressed={period === x} className={segBtn(period === x)} onClick={() => setPeriod(x)}>{t(`finance.forecasts.common.per.${x}`)}</button>)}
          </div>
          <div className={SEG} role="group" aria-label={t('finance.forecasts.sales.metricLabel')}>
            {(['mrr', 'merchants', 'installs'] as SalesField[]).map((x) => <button key={x} type="button" aria-pressed={metric === x} className={segBtn(metric === x)} onClick={() => setMetric(x)}>{t(`finance.forecasts.sales.metric.${x}`)}</button>)}
          </div>
          <span className="ml-auto" />
          <Button size="sm" onClick={exportCsv}>{t('finance.export')}</Button>
          {canEdit && <ImportExcel kind="sales" templateQuery={`?year=${year}`} versions={() => ({ sales: saver.version() })} extraBefore={saver.flush} onApplied={load.reload} renderSummary={(s) => <SalesImportSummary s={s} />} />}
        </>}
      />

      {src.mrr !== 'billing' && <Note tone="warn">{t(p.actual.mrr.error ? 'finance.forecasts.sales.mrrError' : 'finance.forecasts.sales.mrrPending')}</Note>}
      {model
        ? <Note>{t('finance.forecasts.sales.budgetModel', { y: modelYear })}</Note>
        : <Note>{t('finance.forecasts.sales.budgetManual', { y: year })}</Note>}

      {tiles && (
        <KpiRow>
          <Kpi label={t('finance.forecasts.sales.tiles.mtd')} value={tiles.mtd ? metricVal(tiles.mtd.mrr) : '—'}
            detail={tiles.mtd ? t('finance.forecasts.sales.tiles.mtdDetail', { budget: metricVal(tiles.mtd.budget), pct: tiles.mtd.pct == null ? '—' : fmt.pct(tiles.mtd.pct), day: tiles.mtd.day, days: tiles.mtd.days }) : t('finance.forecasts.sales.tiles.notThisYear')} />
          <Kpi label={t('finance.forecasts.sales.tiles.merchants')} value={tiles.mtd && tiles.mtd.merchants != null ? fmt.fmt(tiles.mtd.merchants, 'n') : '—'}
            detail={tiles.mtd ? t('finance.forecasts.sales.tiles.merchantsDetail', { budget: tiles.mtd.merchantsBudget == null ? '—' : fmt.fmt(tiles.mtd.merchantsBudget, 'n'), pace: tiles.mtd.pace == null ? '—' : fmt.fmt(Math.round(tiles.mtd.pace), 'n') }) : undefined} />
          <Kpi label={t('finance.forecasts.sales.tiles.ytd')} value={tiles.ytd && tiles.ytd.pct != null ? fmt.pct(tiles.ytd.pct, true) : '—'} tone={tiles.ytd && tiles.ytd.pct != null && tiles.ytd.pct < 0 ? 'dn' : undefined}
            detail={tiles.ytd ? t('finance.forecasts.sales.tiles.ytdDetail', { a: metricVal(tiles.ytd.actual), b: metricVal(tiles.ytd.budget), n: tiles.ytd.months }) : t('finance.forecasts.sales.tiles.noClosed')}
            sub={tiles.ytd && tiles.ytd.prior != null ? t('finance.forecasts.sales.tiles.ytdPrior', { y: year - 1, v: metricVal(tiles.ytd.prior) }) : undefined} />
          <Kpi label={t('finance.forecasts.sales.tiles.fy')} value={metricVal(tiles.fy.landing)}
            detail={t('finance.forecasts.sales.tiles.fyDetail', { b: metricVal(tiles.fy.budget), pct: tiles.fy.pct == null ? '—' : fmt.pct(tiles.fy.pct, true) })} />
        </KpiRow>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={t('finance.forecasts.sales.chartTitle', { m: t(`finance.forecasts.sales.metric.${metric}`) })} sub={t('finance.forecasts.sales.chartSub')}>
          <Chart type="bar" k={`${metric}-${period}-${year}`} options={options} series={series} />
        </Card>
        <Card title={t('finance.forecasts.sales.drivers.title')} sub={drivers ? t('finance.forecasts.sales.drivers.sub', { n: drivers.months }) : undefined}>
          {!drivers ? <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.forecasts.sales.drivers.none')}</p> : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
              {drivers.drivers.map((d) => (
                <li key={d.key} className="flex items-baseline justify-between gap-3 border-b border-stroke/60 pb-2 dark:border-strokedark/60">
                  <span className="text-black dark:text-white">{t(`finance.forecasts.sales.drivers.${d.key}`)}</span>
                  <span className={`tabular-nums ${toneCls(d.value)}`}>{d.value >= 0 ? '+' : '−'}{fmt.fmt(Math.abs(d.value), '$')}</span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-3 pt-1 font-bold">
                <span className="text-black dark:text-white">{t('finance.forecasts.sales.drivers.net')}</span>
                <span className={`tabular-nums ${toneCls(drivers.net)}`}>{drivers.net >= 0 ? '+' : '−'}{fmt.fmt(Math.abs(drivers.net), '$')}</span>
              </li>
              <li className="text-[12px] text-body dark:text-bodydark2">{t(model && src.mrr === 'billing' ? 'finance.forecasts.sales.drivers.howModel' : 'finance.forecasts.sales.drivers.howSimple')}</li>
            </ul>
          )}
        </Card>
      </div>

      <Card title={t('finance.forecasts.sales.tableTitle', { m: t(`finance.forecasts.sales.metric.${metric}`) })}
        sub={`${t(`finance.forecasts.sales.source.${src[metric]}`, { defaultValue: src[metric] })}${period !== 'm' && canEdit ? ` · ${t('finance.forecasts.sales.editMonthly')}` : ''}`}>
        <Grid cols={cols} rows={rows} foot={period !== 'y' ? foot : undefined} rowKey={(r) => `${r.label.kind}${r.label.index}`} caption={t('finance.forecasts.sales.tableTitle', { m: t(`finance.forecasts.sales.metric.${metric}`) })} />
        {canEdit && period === 'm' && <EditLegend />}
        <p className="mt-2 text-[12px] text-body dark:text-bodydark2">{t('finance.forecasts.sales.landingHint')}</p>
        {metric === 'merchants' && <p className="mt-1 text-[12px] text-body dark:text-bodydark2">{t('finance.forecasts.sales.payActivations', { n: fmt.fmt(p.actual.payActivations.values.reduce<number>((s, v) => s + (v || 0), 0), 'n') })}</p>}
      </Card>
    </>
  );
}

function SalesImportSummary({ s }: { s: any }) {
  const { t } = useTranslation();
  return (
    <ul className="m-0 list-disc pl-5 text-[13px] text-black dark:text-white">
      <li>{t('finance.forecasts.import.salesCells', { n: s.cells, changed: s.changed })}</li>
      {s.from && <li>{t('finance.forecasts.import.range', { from: s.from, to: s.to })}</li>}
      {Object.entries(s.bySeries || {}).map(([k, v]) => <li key={k}>{t(`finance.forecasts.sales.series.${k}`)} : {String(v)}</li>)}
    </ul>
  );
}
