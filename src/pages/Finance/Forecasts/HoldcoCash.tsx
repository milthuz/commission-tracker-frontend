// Module Finance — Trésorerie Holdco, 13 semaines, méthode directe. Solde d'ouverture saisi ou lu
// dans Zoho Books (comptes bancaires — portée banking.READ) ; encaissements et décaissements
// hebdomadaires par catégorie (saisie, import Excel) ; scénarios = ajustements EXPLICITES et nommés
// (le prototype ajoutait 15 000 $/semaine sans le dire) ; réserve modifiable ; vraies dates de
// semaines commençant le lundi (le prototype écrivait « Oct Nov 7 »).
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, StatusPill, dialog } from '../../../components/ui';
import { INPUT, LABEL, SEG, segBtn } from '../../../components/ui/surface';
import Select from '../../../components/Select';
import PageTitle from '../../../components/PageTitle';
import { Card, EditLegend, Kpi, KpiRow, NumCell } from '../components';
import { useFinance } from '../FinanceContext';
import { downloadCsv } from '../format';
import { errCode, fcApi, type BankAccounts, type CashDoc } from './api';
import { CASH_CATS, CASH_IN, CASH_OUT, WEEKS, computeCash, weekStart, type Adjustment, type CashCat, type CashWeek } from './engine';
import { CHART, Chart, FcHeader, Grid, ImportExcel, Note, PageGate, SaveBadge, compact, useChartBase, useDocSaver, useLoad, type Col } from './ui';

type Scen = 'base' | 'down' | 'up';
const SCENS: Scen[] = ['down', 'base', 'up'];

export default function HoldcoCash() {
  const { t, i18n } = useTranslation();
  const { fmt } = useFinance();
  const loc = i18n.language?.startsWith('fr') ? 'fr-CA' : 'en-CA';
  const load = useLoad(() => fcApi.cash(), []);
  const p = load.data;
  const onConflict = load.reload;
  const saver = useDocSaver<CashDoc>('cash', p?.doc, onConflict);
  const [scen, setScen] = useState<Scen>('base');
  const [bank, setBank] = useState<BankAccounts | null>(null);
  const [bankBusy, setBankBusy] = useState(false);
  const [editAdj, setEditAdj] = useState<{ scen: 'down' | 'up'; adj: Adjustment; isNew: boolean } | null>(null);
  const { base } = useChartBase();
  const d = saver.data;

  const results = useMemo(() => {
    if (!d || d.opening.amount == null) return null;
    const of = (s: Scen) => computeCash(d.startDate, d.opening.amount as number, d.reserve, d.lines, s === 'base' ? [] : d.scenarios[s] || []);
    return { base: of('base'), down: of('down'), up: of('up') };
  }, [d]);

  const gate = <PageGate error={load.error} loading={!p} onRetry={load.reload} />;
  if (!p || !d) return <><PageTitle titleKey="finance.forecasts.cash.title" />{gate}</>;
  const canEdit = p.caps.canEdit;
  const R = results ? results[scen] : null;
  const dateLabel = (iso: string, long = false) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(loc, { day: 'numeric', month: long ? 'long' : 'short', year: long ? 'numeric' : undefined, timeZone: 'UTC' });
  const catLabel = (c: CashCat) => t(`finance.forecasts.cash.cat.${c}`);

  const setLine = (c: CashCat, w: number, v: number) => saver.update((x) => {
    const cur = [...(x.lines[c] || Array(WEEKS).fill(null))];
    cur[w] = v;
    return { ...x, lines: { ...x.lines, [c]: cur } };
  });
  // Date choisie → lundi de cette semaine (le serveur refuse un autre jour).
  const setStart = (iso: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const dt = new Date(`${iso}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    saver.update((x) => ({ ...x, startDate: dt.toISOString().slice(0, 10) }));
  };
  const readBooks = async () => {
    setBankBusy(true);
    try { setBank(await fcApi.bankAccounts()); } catch (e) { setBank({ status: 'error' }); void errCode(e); } finally { setBankBusy(false); }
  };
  const applyAccounts = (ids: string[]) => {
    if (!bank || !bank.accounts) return;
    const amount = bank.accounts.filter((a) => ids.includes(a.id)).reduce((s, a) => s + a.balance, 0);
    saver.update((x) => ({ ...x, opening: { mode: 'books', amount, accountIds: ids, at: bank.fetchedAt || new Date().toISOString() } }));
  };
  const removeAdj = async (s: 'down' | 'up', id: string) => {
    if (!(await dialog.confirm(t('finance.forecasts.cash.adj.removeConfirm'), { danger: true }))) return;
    saver.update((x) => ({ ...x, scenarios: { ...x.scenarios, [s]: x.scenarios[s].filter((a) => a.id !== id) } }));
  };
  const saveAdj = () => {
    if (!editAdj) return;
    const { scen: s, adj, isNew } = editAdj;
    saver.update((x) => ({ ...x, scenarios: { ...x.scenarios, [s]: isNew ? [...x.scenarios[s], adj] : x.scenarios[s].map((a) => (a.id === adj.id ? adj : a)) } }));
    setEditAdj(null);
  };

  const money = (v: number | null | undefined) => (v == null ? '—' : fmt.fmt(v, '$'));
  const cell = (v: number) => (v ? fmt.fmt(v, 's') : '—');
  const balCls = (v: number) => (v < 0 ? 'text-[#B42318] dark:text-[#F46060]' : v < d.reserve ? 'text-[#B54708] dark:text-[#FDB022]' : '');

  type WRow = { w: number; week: CashWeek | null };
  const wrows: WRow[] = Array.from({ length: WEEKS }, (_, i) => ({ w: i, week: R ? R.weeks[i] : null }));
  const lineVal = (c: CashCat, w: number) => (d.lines[c] && d.lines[c]![w]) || 0;
  const cols: Col<WRow>[] = [
    { id: 'wk', head: t('finance.forecasts.cash.week'), left: true, cell: (r) => <span className="whitespace-nowrap">W{r.w + 1} · {dateLabel(weekStart(d.startDate, r.w))}</span> },
    { id: 'open', head: t('finance.forecasts.cash.opening'), cell: (r) => (r.week ? money(r.week.open) : '—') },
    ...CASH_CATS.map((c) => ({
      id: c,
      head: <span title={catLabel(c)}>{catLabel(c)}{CASH_OUT.includes(c as never) ? ' (−)' : (CASH_IN as readonly string[]).includes(c) ? ' (+)' : ' (±)'}</span>,
      cell: (r: WRow) => (canEdit
        ? <NumCell value={lineVal(c, r.w)} decimals={0} width="w-[92px]" label={`${catLabel(c)} — W${r.w + 1}`} onChange={(v) => setLine(c, r.w, v)} />
        : cell(lineVal(c, r.w))),
    })),
    ...(scen !== 'base' ? [{ id: 'adj', head: t('finance.forecasts.cash.adjCol'), cell: (r: WRow) => (r.week ? <span className={r.week.adj < 0 ? 'text-[#B42318] dark:text-[#F46060]' : ''}>{cell(r.week.adj)}</span> : '—') }] : []),
    { id: 'net', head: t('finance.forecasts.cash.net'), cell: (r) => (r.week ? fmt.fmt(r.week.net, 's') : '—') },
    { id: 'close', head: t('finance.forecasts.cash.closing'), cell: (r) => (r.week ? <span className={`font-bold ${balCls(r.week.close)}`}>{money(r.week.close)}</span> : '—') },
  ];

  const fmtAxis = compact(fmt.loc);
  const cats = Array.from({ length: WEEKS }, (_, i) => `W${i + 1} ${dateLabel(weekStart(d.startDate, i))}`);
  const series: ApexAxisChartSeries = results ? SCENS.map((s) => ({ name: t(`finance.forecasts.cash.scen.${s}`), data: results[s].weeks.map((w) => Math.round(w.close)) })) : [];
  const options = base({
    chart: { type: 'line' },
    colors: SCENS.map((s) => (s === scen ? CHART.brand : s === 'down' ? CHART.budget : CHART.prior)),
    stroke: { width: SCENS.map((s) => (s === scen ? 3.5 : 2)), curve: 'straight', dashArray: SCENS.map((s) => (s === scen ? 0 : 4)) },
    markers: { size: 0 },
    xaxis: { categories: cats, labels: { rotate: -45, hideOverlappingLabels: true } },
    yaxis: { labels: { formatter: (v: number) => fmtAxis(v) } },
    annotations: { yaxis: [{ y: d.reserve, borderColor: CHART.bad, strokeDashArray: 5, label: { text: t('finance.forecasts.cash.reserveLine', { v: money(d.reserve) }), style: { color: '#fff', background: CHART.bad } } }] },
    tooltip: { y: { formatter: (v: number) => money(v) } },
  });

  const exportCsv = () => downloadCsv(`holdco-cash-${d.startDate}-${scen}.csv`,
    [t('finance.forecasts.cash.week'), t('finance.forecasts.cash.weekOf'), t('finance.forecasts.cash.opening'), ...CASH_CATS.map(catLabel), t('finance.forecasts.cash.adjCol'), t('finance.forecasts.cash.net'), t('finance.forecasts.cash.closing')],
    wrows.map((r) => [`W${r.w + 1}`, weekStart(d.startDate, r.w), r.week ? r.week.open : null, ...CASH_CATS.map((c) => lineVal(c, r.w)), r.week ? r.week.adj : null, r.week ? r.week.net : null, r.week ? r.week.close : null]), fmt.fr);

  const opening = d.opening;
  const lastDate = weekStart(d.startDate, WEEKS - 1);

  return (
    <>
      <PageTitle titleKey="finance.forecasts.cash.title" />
      <FcHeader
        group={t('finance.forecasts.group')}
        title={t('finance.forecasts.cash.title')}
        subtitle={t('finance.forecasts.cash.subtitle', { from: dateLabel(d.startDate, true), to: dateLabel(lastDate, true) })}
        right={<SaveBadge status={saver.status} error={saver.error} />}
        notice={saver.notice}
        actions={<>
          <div className={SEG} role="group" aria-label={t('finance.forecasts.cash.scenario')}>
            {SCENS.map((s) => <button key={s} type="button" aria-pressed={scen === s} className={segBtn(scen === s)} onClick={() => setScen(s)}>{t(`finance.forecasts.cash.scen.${s}`)}</button>)}
          </div>
          <label className="flex items-center gap-2 text-[13px] text-body dark:text-bodydark2">
            {t('finance.forecasts.cash.startDate')}
            <input type="date" className={`${INPUT} h-9`} value={d.startDate} disabled={!canEdit} onChange={(e) => setStart(e.target.value)} />
          </label>
          <span className="ml-auto" />
          <Button size="sm" onClick={exportCsv}>{t('finance.export')}</Button>
          {canEdit && <ImportExcel kind="cash" versions={() => ({ cash: saver.version() })} extraBefore={saver.flush} onApplied={load.reload} renderSummary={(s) => <CashImportSummary s={s} />} />}
        </>}
      />

      {opening.amount == null && <Note tone="warn">{t('finance.forecasts.cash.noOpening')}</Note>}

      <KpiRow>
        <Kpi label={t('finance.forecasts.cash.tiles.opening')} value={money(opening.amount)}
          detail={opening.mode === 'books' ? t('finance.forecasts.cash.tiles.fromBooks', { n: opening.accountIds?.length || 0, at: opening.at ? new Date(opening.at).toLocaleString(loc, { dateStyle: 'medium', timeStyle: 'short' }) : '—' }) : t('finance.forecasts.cash.tiles.manual')} />
        <Kpi label={t('finance.forecasts.cash.tiles.min')} value={R ? money(R.min.value) : '—'} tone={R && R.min.value < d.reserve ? 'dn' : undefined}
          detail={R ? t('finance.forecasts.cash.tiles.minDetail', { w: R.min.week, date: dateLabel(weekStart(d.startDate, R.min.week - 1)), reserve: money(d.reserve) }) : undefined}
          sub={R && R.belowReserve.length ? t('finance.forecasts.cash.tiles.belowReserve', { n: R.belowReserve.length }) : undefined} />
        <Kpi label={t('finance.forecasts.cash.tiles.end')} value={R ? money(R.end) : '—'}
          detail={R && opening.amount != null ? t('finance.forecasts.cash.tiles.endDetail', { d: `${R.end - opening.amount >= 0 ? '+' : '−'}${money(Math.abs(R.end - opening.amount))}` }) : undefined} />
        <Kpi label={t('finance.forecasts.cash.tiles.runway')} value={!R ? '—' : R.runway == null ? t('finance.forecasts.cash.tiles.noBurn') : t('finance.forecasts.cash.tiles.months', { n: fmt.int.format(Math.round(R.runway * 10) / 10) })}
          detail={R && R.runway != null ? t('finance.forecasts.cash.tiles.burn', { v: money(R.monthlyBurn) }) : undefined}
          sub={R && R.runwayAboveReserve != null ? t('finance.forecasts.cash.tiles.aboveReserve', { n: fmt.int.format(Math.round(R.runwayAboveReserve * 10) / 10) }) : undefined} />
      </KpiRow>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={t('finance.forecasts.cash.chartTitle')} sub={t('finance.forecasts.cash.chartSub')}>
          {results ? <Chart type="line" k={`${scen}-${d.startDate}`} options={options} series={series} /> : <p className="m-0 py-10 text-center text-[13px] text-body dark:text-bodydark2">{t('finance.forecasts.cash.noOpening')}</p>}
          <p className="mt-2 text-[12px] text-body dark:text-bodydark2">{t('finance.forecasts.cash.runwayFormula')}</p>
        </Card>
        <Card title={t('finance.forecasts.cash.openingTitle')} sub={t('finance.forecasts.cash.openingSub')}>
          <div className="flex flex-col gap-3 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-black dark:text-white">{t('finance.forecasts.cash.openingManual')}</span>
              {canEdit ? <NumCell value={opening.amount ?? NaN} decimals={2} width="w-[130px]" label={t('finance.forecasts.cash.openingManual')} onChange={(v) => saver.update((x) => ({ ...x, opening: { mode: 'manual', amount: v } }))} /> : <span>{money(opening.amount)}</span>}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-black dark:text-white">{t('finance.forecasts.cash.reserve')}</span>
              {canEdit ? <NumCell value={d.reserve} decimals={0} width="w-[130px]" label={t('finance.forecasts.cash.reserve')} onChange={(v) => saver.update((x) => ({ ...x, reserve: Math.max(0, v) }))} /> : <span>{money(d.reserve)}</span>}
            </div>
            <div className="border-t border-stroke pt-3 dark:border-strokedark">
              <Button size="sm" disabled={bankBusy} onClick={readBooks}>{t('finance.forecasts.cash.readBooks')}</Button>
              {bank && bank.status === 'reconnect' && <p role="status" className="m-0 mt-2 text-[13.5px] text-[#B54708] dark:text-[#FDB022]">{t('finance.forecasts.cash.booksReconnect')}</p>}
              {bank && (bank.status === 'error' || bank.status === 'unavailable') && <p role="status" className="m-0 mt-2 text-[13.5px] text-[#B42318] dark:text-[#F46060]">{t(`finance.forecasts.cash.books_${bank.status}`)}</p>}
              {bank && bank.status === 'ok' && <BooksAccounts bank={bank} selected={opening.mode === 'books' ? opening.accountIds || [] : []} canEdit={canEdit} onUse={applyAccounts} money={money} />}
            </div>
          </div>
        </Card>
      </div>

      {scen !== 'base' && (
        <Card title={t('finance.forecasts.cash.adj.title', { s: t(`finance.forecasts.cash.scen.${scen}`) })} sub={t('finance.forecasts.cash.adj.sub')}
          actions={canEdit ? <Button size="sm" onClick={() => setEditAdj({ scen, isNew: true, adj: { id: `a${Date.now().toString(36)}`, label: '', category: 'residual', mode: 'pct', value: 0, from: 1, to: WEEKS } })}>{t('finance.forecasts.cash.adj.add')}</Button> : undefined}>
          {!(d.scenarios[scen] || []).length ? <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.forecasts.cash.adj.none')}</p> : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {d.scenarios[scen].map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-stroke/60 pb-2 text-[13px] dark:border-strokedark/60">
                  <span className="text-black dark:text-white"><b>{a.label}</b> — {t(`finance.forecasts.cash.cat.${a.category}`)} {a.mode === 'pct' ? `${a.value >= 0 ? '+' : '−'}${fmt.int.format(Math.abs(a.value))} %` : `${a.value >= 0 ? '+' : '−'}${money(Math.abs(a.value))} / ${t('finance.forecasts.cash.adj.perWeek')}`} · W{a.from}–W{a.to}</span>
                  {canEdit && <span className="flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setEditAdj({ scen, adj: { ...a }, isNew: false })}>{t('finance.forecasts.common.edit')}</Button>
                    <Button size="xs" variant="ghost" onClick={() => removeAdj(scen, a.id)}>{t('finance.forecasts.common.remove')}</Button>
                  </span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card title={t('finance.forecasts.cash.tableTitle')} sub={t('finance.forecasts.cash.tableSub')}
        actions={<StatusPill family="neutral">{t(`finance.forecasts.cash.scen.${scen}`)}</StatusPill>}>
        <Grid cols={cols} rows={wrows} rowKey={(r) => String(r.w)} caption={t('finance.forecasts.cash.tableTitle')} />
        {canEdit && <EditLegend />}
      </Card>

      <Modal open={!!editAdj} onClose={() => setEditAdj(null)} title={t(editAdj?.isNew ? 'finance.forecasts.cash.adj.add' : 'finance.forecasts.cash.adj.edit')} size="md"
        footer={<>
          <Button size="md" variant="ghost" onClick={() => setEditAdj(null)}>{t('finance.forecasts.common.cancel')}</Button>
          <Button size="md" variant="primary" disabled={!editAdj || !editAdj.adj.label.trim() || editAdj.adj.to < editAdj.adj.from} onClick={saveAdj}>{t('finance.forecasts.common.save')}</Button>
        </>}>
        {editAdj && (() => {
          const a = editAdj.adj;
          const set = (patch: Partial<Adjustment>) => setEditAdj({ ...editAdj, adj: { ...a, ...patch } });
          const weekOpts = Array.from({ length: WEEKS }, (_, i) => ({ value: String(i + 1), label: `W${i + 1} · ${dateLabel(weekStart(d.startDate, i))}` }));
          return (
            <>
              <div><label className={LABEL} htmlFor="adj-label">{t('finance.forecasts.cash.adj.label')}</label>
                <input id="adj-label" className={`${INPUT} w-full`} maxLength={120} value={a.label} onChange={(e) => set({ label: e.target.value })} placeholder={t('finance.forecasts.cash.adj.labelPh')} /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><span className={LABEL}>{t('finance.forecasts.cash.adj.category')}</span>
                  <Select value={a.category} onChange={(v) => set({ category: v as Adjustment['category'] })} options={[...CASH_CATS, 'allIn', 'allOut'].map((c) => ({ value: c, label: t(`finance.forecasts.cash.cat.${c}`) }))} /></div>
                <div><span className={LABEL}>{t('finance.forecasts.cash.adj.mode')}</span>
                  <Select value={a.mode} onChange={(v) => set({ mode: v as Adjustment['mode'] })} options={[{ value: 'pct', label: t('finance.forecasts.cash.adj.pct') }, { value: 'amount', label: t('finance.forecasts.cash.adj.amount') }]} /></div>
                <div><span className={LABEL}>{t('finance.forecasts.cash.adj.from')}</span>
                  <Select value={String(a.from)} onChange={(v) => set({ from: Number(v) })} options={weekOpts} /></div>
                <div><span className={LABEL}>{t('finance.forecasts.cash.adj.to')}</span>
                  <Select value={String(a.to)} onChange={(v) => set({ to: Number(v) })} options={weekOpts} /></div>
              </div>
              <div className="flex items-center gap-2"><span className={LABEL}>{t('finance.forecasts.cash.adj.value')}</span>
                <NumCell value={a.value} decimals={2} width="w-[120px]" label={t('finance.forecasts.cash.adj.value')} onChange={(v) => set({ value: v })} />
                <span className="text-[12px] text-body dark:text-bodydark2">{a.mode === 'pct' ? '%' : `$ / ${t('finance.forecasts.cash.adj.perWeek')}`}</span></div>
              <p className="m-0 text-[12px] text-body dark:text-bodydark2">{t('finance.forecasts.cash.adj.hint')}</p>
            </>
          );
        })()}
      </Modal>
    </>
  );
}

function BooksAccounts({ bank, selected, canEdit, onUse, money }: { bank: BankAccounts; selected: string[]; canEdit: boolean; onUse: (ids: string[]) => void; money: (v: number) => string }) {
  const { t } = useTranslation();
  const [ids, setIds] = useState<string[]>(selected.length ? selected : (bank.accounts || []).map((a) => a.id));
  const total = (bank.accounts || []).filter((a) => ids.includes(a.id)).reduce((s, a) => s + a.balance, 0);
  return (
    <div className="mt-2">
      {!(bank.accounts || []).length && <p className="m-0 text-[13.5px] text-body dark:text-bodydark2">{t('finance.forecasts.cash.noAccounts')}</p>}
      {(bank.accounts || []).map((a) => (
        <label key={a.id} className="flex items-center justify-between gap-2 py-0.5 text-[13px] text-black dark:text-white">
          <span className="flex items-center gap-2"><input type="checkbox" checked={ids.includes(a.id)} onChange={(e) => setIds(e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id))} />{a.name}{a.currency && a.currency !== 'CAD' ? ` (${a.currency})` : ''}</span>
          <span className="tabular-nums">{money(a.balance)}</span>
        </label>
      ))}
      {(bank.accounts || []).some((a) => a.currency && a.currency !== 'CAD') && <p className="m-0 mt-1 text-[12px] text-[#B54708] dark:text-[#FDB022]">{t('finance.forecasts.cash.fxWarning')}</p>}
      {canEdit && !!(bank.accounts || []).length && <Button size="xs" className="mt-2" onClick={() => onUse(ids)}>{t('finance.forecasts.cash.applyAccounts', { v: money(total) })}</Button>}
    </div>
  );
}

function CashImportSummary({ s }: { s: any }) {
  const { t } = useTranslation();
  return (
    <ul className="m-0 list-disc pl-5 text-[13px] text-black dark:text-white">
      {s.startDate && <li>{t('finance.forecasts.cash.startDate')} : {s.startDate}</li>}
      {s.opening != null && <li>{t('finance.forecasts.cash.openingManual')} : {s.opening}</li>}
      {s.reserve != null && <li>{t('finance.forecasts.cash.reserve')} : {s.reserve}</li>}
      {(s.categories || []).map((c: string) => <li key={c}>{t(`finance.forecasts.cash.cat.${c}`)} : {s.totals[c]}</li>)}
    </ul>
  );
}
