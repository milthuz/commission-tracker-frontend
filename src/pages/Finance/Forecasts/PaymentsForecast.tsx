// Module Finance — Prévision des paiements. Réels = Zentact (marchands qui traitent, activations,
// frais, profit), corrigeables par la CFO ; mois suivants = boucle de prévision partant du
// dernier réel, à partir d'hypothèses modifiables (par défaut : les 3 derniers mois réels). Les
// tuiles, le graphique et le tableau lisent la MÊME série (le prototype les contredisait).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, dialog, toast } from '../../../components/ui';
import { INPUT, LABEL, SEG, segBtn } from '../../../components/ui/surface';
import Select from '../../../components/Select';
import PageTitle from '../../../components/PageTitle';
import { Card, EditLegend, Kpi, NumCell } from '../components';
import { useFinance } from '../FinanceContext';
import { downloadCsv } from '../format';
import { errCode, fcApi, type PaymentsDoc } from './api';
import {
  ASSUMPTION_KEYS, defaultAssumptions, mergeActuals, paymentRows, paymentSeries, ymAdd,
  type AssumptionKey, type Assumptions, type PayField, type PayMonth, type PayRow, type Period,
} from './engine';
import { CHART, Chart, FcHeader, Grid, ImportExcel, Note, PageGate, SaveBadge, compact, toneCls, useChartBase, useDocSaver, useLoad, usePeriodLabel, useYmLabel, type Col } from './ui';

export default function PaymentsForecast() {
  const { t } = useTranslation();
  const { fmt } = useFinance();
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [period, setPeriod] = useState<Period>('m');
  const load = useLoad(() => fcApi.payments(year), [year]);
  const p = load.data;
  const onConflict = load.reload;
  const saver = useDocSaver<PaymentsDoc>('payments', p?.doc, onConflict);
  const periodLabel = usePeriodLabel();
  const ymLabel = useYmLabel();
  const { base } = useChartBase();
  const [saveOpen, setSaveOpen] = useState(false);
  const [label, setLabel] = useState('');
  // Version de comparaison : choisie localement par tous, gardée dans le document par qui peut écrire.
  const [cmpLocal, setCmpLocal] = useState<number | null | undefined>(undefined);
  // Changer d'équipe de conversion change les RÉELS (calculés par le serveur) : on recharge après l'enregistrement.
  const reloadAfterSave = useRef(false);
  const reload = load.reload;
  useEffect(() => { if (saver.status === 'saved' && reloadAfterSave.current) { reloadAfterSave.current = false; reload(); } }, [saver.status, reload]);

  const doc = saver.data;
  const actual = useMemo(() => {
    if (!p || !doc) return [];
    const src = p.actual.months.length ? p.actual.months : p.seed || [];
    return mergeActuals(src, doc.overrides || {}, p.actual.lastActual);
  }, [p, doc]);
  const defaults = useMemo(() => defaultAssumptions(actual), [actual]);
  const A: Assumptions | null = useMemo(() => (defaults ? { ...defaults, ...(doc?.assumptions || {}) } as Assumptions : null), [defaults, doc]);
  const ser = useMemo(() => paymentSeries(actual, A, year), [actual, A, year]);
  const rows = useMemo(() => paymentRows(ser.months, period, year), [ser, period, year]);
  const priorRows = useMemo(() => paymentRows(ser.prior, period, year - 1), [ser, period, year]);
  const cmpId = cmpLocal !== undefined ? cmpLocal : doc?.compareVersionId ?? null;
  const compare = useMemo(() => (p && cmpId ? p.versions.find((v) => v.id === cmpId) || null : null), [p, cmpId]);

  const gate = <PageGate error={load.error} loading={!p} onRetry={load.reload} />;
  if (!p || !doc) return <><PageTitle titleKey="finance.forecasts.payments.title" />{gate}</>;
  const canEdit = p.caps.canEdit;
  const hasPrior = ser.prior.length > 0;

  const cmpResidual = (r: PayRow): number | null => {
    if (!compare) return null;
    const ks = r.months.map((i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    const vals = ks.map((k) => compare.data.series[k]?.residual).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  };

  const setOverride = (k: string, f: PayField, v: number) => saver.update((d) => ({ ...d, overrides: { ...(d.overrides || {}), [k]: { ...((d.overrides || {})[k] || {}), [f]: v } } }));
  const setAssumption = (k: AssumptionKey, v: number) => saver.update((d) => ({ ...d, assumptions: { ...(d.assumptions || {}), [k]: v } }));
  const resetAssumptions = () => saver.update((d) => ({ ...d, assumptions: {} }));
  const resetOverrides = async () => {
    const n = Object.keys(doc.overrides || {}).length;
    if (!(await dialog.confirm(t('finance.forecasts.payments.resetOverridesConfirm', { n }), { danger: true }))) return;
    saver.update((d) => ({ ...d, overrides: {} }));
  };
  const setTeams = (ids: number[] | null) => { reloadAfterSave.current = true; saver.update((d) => ({ ...d, convTeamIds: ids })); };
  const autoTeams = p.teams.filter((x) => x.auto).map((x) => x.id);
  const teamIds = doc.convTeamIds ?? autoTeams;

  const saveVersion = async () => {
    const series: Record<string, Partial<Record<PayField, number>>> = {};
    for (const m of ser.months) series[m.ym] = { active: m.active, installs: m.installs, conv: m.conv, churned: m.churned ?? 0, grossFees: m.grossFees, residual: m.residual };
    try {
      const r = await fcApi.saveVersion(label.trim(), series, A || {});
      setSaveOpen(false); setLabel('');
      toast.success(t('finance.forecasts.payments.versionSaved', { label: r.version.label }));
      load.reload();
    } catch (e) { dialog.alert(t('finance.forecasts.errors.generic', { code: errCode(e) })); }
  };

  // Tuiles : le DERNIER mois réel, comparé à la version choisie (même mois) ou au mois précédent.
  const last = ser.seed;
  const prevM = last ? actual.find((m) => m.ym === ymAdd(last.ym, -1)) || null : null;
  const cmpM = last && compare ? compare.data.series[last.ym] || null : null;
  const ref = (f: PayField | 'arpu' | 'margin'): number | null => {
    if (cmpM) {
      if (f === 'arpu') return cmpM.active ? (cmpM.grossFees || 0) / cmpM.active : null;
      if (f === 'margin') return cmpM.grossFees ? ((cmpM.residual || 0) / cmpM.grossFees) * 100 : null;
      return (cmpM as Record<string, number>)[f] ?? null;
    }
    if (!prevM) return null;
    return f === 'arpu' ? prevM.arpu : f === 'margin' ? prevM.margin : (prevM as unknown as Record<string, number>)[f] ?? null;
  };
  const refLabel = cmpM ? compare!.label : prevM ? ymLabel(prevM.ym) : null;
  const tile = (key: string, value: number | null, f: PayField | 'arpu' | 'margin', kind: '$' | 'n' | '%') => {
    const r = ref(f);
    const show = (v: number | null) => (v == null ? '—' : kind === '%' ? fmt.pct(v) : fmt.fmt(kind === 'n' ? Math.round(v) : v, kind));
    const d = value != null && r != null ? (kind === '%' ? value - r : r ? ((value - r) / Math.abs(r)) * 100 : null) : null;
    return (
      <Kpi key={key} label={`${t(`finance.forecasts.payments.tiles.${key}`)}${last ? ` · ${ymLabel(last.ym)}` : ''}`} value={show(value)}
        detail={refLabel ? t('finance.forecasts.payments.tiles.vs', { ref: refLabel, v: show(r) }) : t('finance.forecasts.payments.tiles.noRef')}
        sub={d == null ? undefined : <span className={toneCls(d)}>{kind === '%' ? `${d >= 0 ? '+' : '−'}${fmt.int.format(Math.abs(Math.round(d * 10) / 10))} pt` : fmt.pct(d, true)}</span>} />
    );
  };

  const show$ = (v: number | null, live = false) => (v == null ? '—' : `${live ? '~' : ''}${fmt.fmt(v, '$')}`);
  const showN = (v: number | null, live = false) => (v == null ? '—' : `${live ? '~' : ''}${fmt.fmt(Math.round(v), 'n')}`);
  const monthOf = (r: PayRow): PayMonth | null => (period === 'm' && r !== fy ? r.last : null);
  const editable = (r: PayRow, f: PayField, v: number | null, kind: '$' | 'n') => {
    const m = monthOf(r);
    if (m && !m.live && canEdit) {
      return (
        <span className="inline-flex items-center gap-1">
          {m.overridden.includes(f) && <span className="text-[10px] font-bold text-accent-ink dark:text-accent-ink-dark" title={t('finance.forecasts.payments.overridden')}>●</span>}
          <NumCell value={v ?? NaN} decimals={kind === '$' ? 2 : 0} width={kind === '$' ? 'w-[96px]' : 'w-[64px]'} label={`${t(`finance.forecasts.payments.col.${f}`)} — ${ymLabel(m.ym)}`} onChange={(x) => setOverride(m.ym, f, x)} />
        </span>
      );
    }
    return kind === '$' ? show$(v, r.live) : showN(v, r.live);
  };
  const cols: Col<PayRow>[] = [
    { id: 'p', head: t('finance.forecasts.common.period'), cell: (r) => r === fy ? t('finance.forecasts.common.totalFy', { y: year }) : <>{periodLabel(period, r.months[0] / (period === 'q' ? 3 : 1) | 0, year)}{r.live && <span className="ml-1.5 text-[11px] text-body dark:text-bodydark2">{t(r.mixed ? 'finance.forecasts.payments.partlyForecast' : 'finance.forecasts.payments.forecastTag')}</span>}</>, left: true },
    { id: 'act', head: t('finance.forecasts.payments.col.active'), cell: (r) => editable(r, 'active', r.last ? r.last.active : null, 'n') },
    { id: 'ins', head: t('finance.forecasts.payments.col.installs'), cell: (r) => editable(r, 'installs', r.installs, 'n') },
    { id: 'conv', head: t('finance.forecasts.payments.col.conv'), cell: (r) => editable(r, 'conv', r.conv, 'n') },
    { id: 'ch', head: t('finance.forecasts.payments.col.churned'), cell: (r) => editable(r, 'churned', r.churned, 'n') },
    { id: 'arpu', head: t('finance.forecasts.payments.col.arpu'), cell: (r) => show$(r.last ? r.last.arpu : null, r.live) },
    { id: 'gf', head: t('finance.forecasts.payments.col.grossFees'), cell: (r) => editable(r, 'grossFees', r.grossFees, '$') },
    { id: 'res', head: t('finance.forecasts.payments.col.residual'), cell: (r) => editable(r, 'residual', r.residual, '$'), cls: () => 'font-bold' },
    { id: 'mg', head: t('finance.forecasts.payments.col.margin'), cell: (r) => (r.margin == null ? '—' : fmt.pct(r.margin)) },
    ...(compare ? [
      { id: 'cmp', head: compare.label, cell: (r: PayRow) => show$(cmpResidual(r)) },
      { id: 'cmpv', head: '%', cell: (r: PayRow) => { const c = cmpResidual(r); const v = c ? ((r.residual - c) / Math.abs(c)) * 100 : null; return <span className={toneCls(v)}>{v == null ? '—' : fmt.pct(v, true)}</span>; } },
    ] : []),
    ...(hasPrior ? [{ id: 'py', head: t('finance.forecasts.payments.priorResidual', { y: year - 1 }), cell: (r: PayRow) => { const x = priorRows.find((q) => q.months[0] === r.months[0]); return x && x.last ? show$(x.residual) : '—'; } }] : []),
  ];
  const fy = paymentRows(ser.months, 'y', year)[0];

  const cats = rows.map((r) => periodLabel(period, r.months[0] / (period === 'q' ? 3 : 1) | 0, year));
  const fmtAxis = compact(fmt.loc);
  const series: ApexAxisChartSeries = [
    ...(hasPrior ? [{ name: t('finance.forecasts.payments.priorResidual', { y: year - 1 }), data: rows.map((r) => priorRows.find((q) => q.months[0] === r.months[0])?.residual ?? 0) }] : []),
    ...(compare ? [{ name: compare.label, data: rows.map((r) => cmpResidual(r) ?? 0) }] : []),
    { name: t('finance.forecasts.payments.actualResidual'), data: rows.map((r) => (!r.live ? r.residual : r.mixed ? r.residual - r.months.reduce((s, i) => s + (ser.months.find((m) => m.ym === `${year}-${String(i + 1).padStart(2, '0')}` && m.live)?.residual || 0), 0) : 0)) },
    { name: t('finance.forecasts.payments.forecastResidual'), data: rows.map((r) => (r.live ? r.months.reduce((s, i) => s + (ser.months.find((m) => m.ym === `${year}-${String(i + 1).padStart(2, '0')}` && m.live)?.residual || 0), 0) : 0)) },
  ];
  const colors = [...(hasPrior ? [CHART.prior] : []), ...(compare ? [CHART.budget] : []), CHART.brand, CHART.brandSoft];
  const options = base({
    chart: { type: 'bar', stacked: false },
    colors,
    plotOptions: { bar: { columnWidth: period === 'm' ? '70%' : '45%', borderRadius: 3 } },
    xaxis: { categories: cats },
    yaxis: { labels: { formatter: (v: number) => fmtAxis(v) } },
    tooltip: { y: { formatter: (v: number) => fmt.fmt(v, '$') } },
  });

  const exportCsv = () => downloadCsv(`payments-forecast-${year}.csv`,
    [t('finance.forecasts.common.month'), t('finance.forecasts.payments.kind'), ...(['active', 'installs', 'conv', 'churned', 'arpu', 'grossFees', 'residual', 'margin'] as const).map((f) => t(`finance.forecasts.payments.col.${f}`))],
    ser.months.map((m) => [m.ym, t(m.live ? 'finance.forecasts.payments.forecastTag' : 'finance.forecasts.payments.actualTag'), m.active, m.installs, m.conv, m.churned, m.arpu, m.grossFees, m.residual, m.margin]), fmt.fr);

  const yearOpts = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => ({ value: String(y), label: `FY${y}` }));
  const asmUnit: Record<AssumptionKey, string> = { inst: t('finance.forecasts.payments.perMo'), conv: t('finance.forecasts.payments.perMo'), churn: '%', arpuG: '%', margin: '%' };

  return (
    <>
      <PageTitle titleKey="finance.forecasts.payments.title" />
      <FcHeader
        group={t('finance.forecasts.group')}
        title={t('finance.forecasts.payments.title')}
        subtitle={t('finance.forecasts.payments.subtitle')}
        right={<SaveBadge status={saver.status} error={saver.error} />}
        notice={saver.notice}
        actions={<>
          <div className="w-[120px]"><Select value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOpts} /></div>
          <div className={SEG} role="group" aria-label={t('finance.forecasts.common.period')}>
            {(['m', 'q', 'y'] as Period[]).map((x) => <button key={x} type="button" aria-pressed={period === x} className={segBtn(period === x)} onClick={() => setPeriod(x)}>{t(`finance.forecasts.common.per.${x}`)}</button>)}
          </div>
          <div className="w-[230px]">
            <Select value={String(cmpId || '')} onChange={(v) => { const id = v ? Number(v) : null; setCmpLocal(id); if (canEdit) saver.update((d) => ({ ...d, compareVersionId: id })); }} disabled={!p.versions.length}
              options={[{ value: '', label: t('finance.forecasts.payments.noCompare') }, ...p.versions.map((v) => ({ value: String(v.id), label: `${t('finance.forecasts.payments.compareWith')} ${v.label}` }))]} />
          </div>
          <span className="ml-auto" />
          <Button size="sm" onClick={exportCsv}>{t('finance.export')}</Button>
          {canEdit && <Button size="sm" disabled={!A} onClick={() => setSaveOpen(true)}>{t('finance.forecasts.payments.saveVersion')}</Button>}
          {canEdit && <ImportExcel kind="payments" templateQuery={`?year=${year}`} versions={() => ({ payments: saver.version() })} extraBefore={saver.flush} onApplied={load.reload} renderSummary={(s) => <PaymentsImportSummary s={s} />} />}
        </>}
      />

      {p.actual.source !== 'zentact' && <Note tone="warn">{t('finance.forecasts.payments.noZentact')}</Note>}
      {p.actual.lastActual && <Note>{t('finance.forecasts.payments.sourceNote', { last: ymLabel(p.actual.lastActual, true) })}</Note>}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {tile('active', last ? last.active : null, 'active', 'n')}
        {tile('installs', last ? last.installs : null, 'installs', 'n')}
        {tile('conv', last ? last.conv : null, 'conv', 'n')}
        {tile('arpu', last ? last.arpu : null, 'arpu', '$')}
        {tile('residual', last ? last.residual : null, 'residual', '$')}
        {tile('margin', last ? last.margin : null, 'margin', '%')}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={t('finance.forecasts.payments.chartTitle')} sub={t('finance.forecasts.payments.fyResidual', { y: year, v: fmt.fmt(fy.residual, '$') })}>
          <Chart type="bar" k={`${period}-${year}-${compare?.id || 0}`} options={options} series={series} />
        </Card>
        <Card title={t('finance.forecasts.payments.assumptions')} sub={t('finance.forecasts.payments.assumptionsSub')}
          actions={canEdit ? <Button size="xs" variant="ghost" disabled={!Object.keys(doc.assumptions || {}).length} onClick={resetAssumptions}>{t('finance.forecasts.payments.resetDefaults')}</Button> : undefined}>
          {!A ? <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.forecasts.payments.noSeed')}</p> : (
            <div className="flex flex-col gap-2.5">
              {ASSUMPTION_KEYS.map((k) => {
                const own = doc.assumptions?.[k] != null;
                return (
                  <div key={k} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-black dark:text-white">{t(`finance.forecasts.payments.asm.${k}`)}
                      <span className="block text-[11.5px] text-body dark:text-bodydark2">{own ? t('finance.forecasts.payments.asmOwn') : t('finance.forecasts.payments.asmDefault')}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      {canEdit ? <NumCell value={A[k]} decimals={2} width="w-[78px]" label={t(`finance.forecasts.payments.asm.${k}`)} onChange={(v) => setAssumption(k, v)} /> : <span className="tabular-nums">{fmt.int.format(Math.round(A[k] * 100) / 100)}</span>}
                      <span className="w-[44px] text-[12px] text-body dark:text-bodydark2">{asmUnit[k]}</span>
                    </span>
                  </div>
                );
              })}
              <p className="m-0 text-[12px] text-body dark:text-bodydark2">{t('finance.forecasts.payments.formula')}</p>
              <fieldset className="mt-1 border-t border-stroke pt-2.5 dark:border-strokedark">
                <legend className="text-[12px] font-bold text-body dark:text-bodydark2">{t('finance.forecasts.payments.convTeams')}</legend>
                {!p.teams.length && <p className="m-0 text-[12px] text-body dark:text-bodydark2">{t('finance.forecasts.payments.noTeams')}</p>}
                {p.teams.map((tm) => (
                  <label key={tm.id} className="mt-1 flex items-center gap-2 text-[13px] text-black dark:text-white">
                    <input type="checkbox" disabled={!canEdit} checked={teamIds.includes(tm.id)}
                      onChange={(e) => setTeams(e.target.checked ? [...teamIds, tm.id] : teamIds.filter((x) => x !== tm.id))} />
                    {tm.name}{tm.auto && <span className="text-[11px] text-body dark:text-bodydark2">({t('finance.forecasts.payments.autoTeam')})</span>}
                  </label>
                ))}
                {doc.convTeamIds != null && canEdit && <button type="button" className="mt-1 text-[12px] font-bold text-accent-ink hover:underline dark:text-accent-ink-dark" onClick={() => setTeams(null)}>{t('finance.forecasts.payments.teamsAuto')}</button>}
              </fieldset>
            </div>
          )}
        </Card>
      </div>

      <Card title={t('finance.forecasts.payments.tableTitle')} sub={t('finance.forecasts.payments.tableSub')}
        actions={canEdit && Object.keys(doc.overrides || {}).length ? <Button size="xs" variant="ghost" onClick={resetOverrides}>{t('finance.forecasts.payments.resetOverrides', { n: Object.keys(doc.overrides || {}).length })}</Button> : undefined}>
        <Grid cols={cols} rows={rows.filter((r) => r.last)} foot={period !== 'y' ? fy : undefined} rowKey={(r) => `${period}${r.months[0]}`} caption={t('finance.forecasts.payments.tableTitle')} />
        {canEdit && period === 'm' && <EditLegend />}
        <p className="mt-2 text-[12px] text-body dark:text-bodydark2">{t('finance.forecasts.payments.definitions')}</p>
      </Card>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title={t('finance.forecasts.payments.saveVersion')} size="sm"
        footer={<>
          <Button size="md" variant="ghost" onClick={() => setSaveOpen(false)}>{t('finance.forecasts.common.cancel')}</Button>
          <Button size="md" variant="primary" disabled={!label.trim()} onClick={saveVersion}>{t('finance.forecasts.common.save')}</Button>
        </>}>
        <label className={LABEL} htmlFor="fc-version-label">{t('finance.forecasts.payments.versionLabel')}</label>
        <input id="fc-version-label" className={`${INPUT} w-full`} maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('finance.forecasts.payments.versionPlaceholder')} />
        <p className="m-0 text-[12px] text-body dark:text-bodydark2">{t('finance.forecasts.payments.versionHint')}</p>
      </Modal>
    </>
  );
}

function PaymentsImportSummary({ s }: { s: any }) {
  const { t } = useTranslation();
  const keys = Object.keys(s.assumptions || {});
  return (
    <ul className="m-0 list-disc pl-5 text-[13px] text-black dark:text-white">
      <li>{t('finance.forecasts.import.assumptions', { n: keys.length })}{keys.length ? ` : ${keys.map((k) => `${t(`finance.forecasts.payments.asm.${k}`)} = ${s.assumptions[k]}`).join(' · ')}` : ''}</li>
      <li>{t('finance.forecasts.import.overrides', { n: (s.overrideMonths || []).length })}{s.overrideMonths?.length ? ` (${s.overrideMonths[0]} → ${s.overrideMonths[s.overrideMonths.length - 1]})` : ''}</li>
    </ul>
  );
}
