// Module Finance — Dépenses d'exploitation (miroir de Book4.xlsx). FY2027 = le budget, cellules
// jaunes modifiables avec « ⇥ » et une hausse mensuelle composée par ligne ; lignes de paie tirées
// de l'onglet Salaires ; lignes de voyage tirées du budget de voyages. FY2026 / FY2028 : lecture.
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, dialog } from '../../components/ui';
import { SEG, segBtn } from '../../components/ui/surface';
import Select from '../../components/Select';
import PageTitle from '../../components/PageTitle';
import { Card, EDIT_CELL, EditLegend, FinanceHeader, FinTable, Kpi, KpiRow, NumCell, type FRow } from './components';
import { useFinance, useFocusMonth, useFocusRow } from './FinanceContext';
import { PAGES } from './DriverPages';
import { OpexImportActions } from './ConsolidatedImport';
import { ApprovePageButton, DriverStatusCell } from './Progress';
import { downloadCsv } from './format';
import { sum, tripTotal, type Trip } from './model';

const DEPTS: Trip['dept'][] = ['S&M', 'R&D', 'G&A'];
const SEC_ID: Record<string, string> = { 'Sales & Marketing': 'sm', 'Research & Development': 'rd', 'General & Administrative': 'ga' };

export default function Opex() {
  const { t } = useTranslation();
  const F = useFinance();
  const { result, opex, trips, opexYear, setOpexYear, canEdit, fmt, goTo, payload } = F;
  const focus = useFocusRow();
  const focusMonth = useFocusMonth();
  const yy = 26 + opexYear;
  const months = fmt.months(yy);
  const ox = result.opexShown;
  const count = Object.keys(opex.opx).length + Object.values(opex.opxG).filter((g) => !!g).length;

  const rows: FRow[] = useMemo(() => ox.rows.map((r) => {
    const name = t(`finance.opexLines.${r.key}`, { defaultValue: r.item.name });
    if (r.kind === 'sec') return { id: r.key, kind: 'sec', label: (SEC_ID[r.item.name] ? t(`finance.master.opex.${SEC_ID[r.item.name]}`) : r.item.name) };
    const base: FRow = { id: r.key, focus: r.key, kind: r.kind, label: name, vals: r.vals, total: sum(r.vals), cellFmt: r.kind === 'line' ? 's' : '$' };
    if (r.kind !== 'line') return base;
    if (opexYear === 1 && r.pay) {
      return { ...base, label: `${name} ${t('finance.toSalaryTab')}`, ...(payload.caps.canPayroll ? { onClick: () => goTo(PAGES.payroll), linkCells: true } : {}) };
    }
    if (opexYear === 1 && r.travel) return { ...base, label: `${name} ${t('finance.opex.toTravel')}`, onClick: () => goTo(PAGES.opex, 'travel'), linkCells: true };
    if (!r.editable) return base;
    const g = opex.opxG[r.key];
    return {
      ...base,
      edit: { values: r.vals, decimals: 0, onChange: (i, v) => F.setOpexCell(r.key, i, v), onFill: () => F.fillOpex(r.key, r.vals[0]) },
      extra: (
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-body dark:text-bodydark2" title={t('finance.opex.growthTip')}>
          +<NumCell value={g || 0} width="w-[46px]" decimals={2} disabled={!canEdit} label={t('finance.opex.growthLabel', { line: name })} onChange={(v) => F.setOpexGrowth(r.key, v)} />%/{t('finance.opex.mo')}
          <DriverStatusCell driverKey={`opx:${r.key}`} />
        </span>
      ),
    };
  }), [ox, opex, opexYear, t, canEdit, F, goTo, payload.caps.canPayroll]);

  const tot = (k: string) => sum(ox.byKey[k] || []);
  const all = tot('opTot');
  const share = (k: string) => (all ? `${((tot(k) / all) * 100).toFixed(0)} %` : '—');

  const onReset = async () => {
    if (!(await dialog.confirm(t('finance.opex.resetConfirm', { n: count }), { danger: true }))) return;
    F.resetOpex();
  };
  const exportCsv = () => downloadCsv(`opex-FY20${yy}.csv`, ['CAD', ...months, t('finance.col.totalYear', { y: 2000 + yy })],
    rows.filter((r) => r.kind !== 'sec').map((r) => [String(r.label), ...(r.vals || []).map((v) => v ?? null), r.total ?? null]), fmt.fr);

  return (
    <>
      <PageTitle titleKey="sidebar.financeOpex" />
      <FinanceHeader
        title={t('finance.opex.title')}
        subtitle={t('finance.opex.subtitle')}
        actions={
          <>
            <div className={SEG} role="group" aria-label={t('finance.opex.year')}>
              {([0, 1, 2] as const).map((y) => (
                <button key={y} type="button" aria-pressed={opexYear === y} className={segBtn(opexYear === y)} onClick={() => setOpexYear(y)}>FY{2026 + y}</button>
              ))}
            </div>
            <Button size="sm" onClick={exportCsv}>{t('finance.export')}</Button>
            {canEdit && opexYear === 1 && <OpexImportActions />}
            {opexYear === 1 && <ApprovePageButton group="opex" />}
            {canEdit && <Button size="sm" variant="ghost" disabled={!count && !trips} onClick={onReset}>{t('finance.drivers.reset', { n: count })}</Button>}
          </>
        }
      />
      <KpiRow>
        <Kpi label={t('finance.opex.tileTotal', { y: 2026 + opexYear })} value={fmt.fmt(all, '$')} detail={t('finance.opex.avgMonthly', { v: fmt.fmt(all / 12, '$') })} />
        <Kpi label={t('finance.master.opex.sm')} value={fmt.fmt(tot('smTot'), '$')} detail={t('finance.opex.shareOfOpex', { s: share('smTot') })} />
        <Kpi label={t('finance.master.opex.rd')} value={fmt.fmt(tot('rdTot'), '$')} detail={t('finance.opex.shareOfOpex', { s: share('rdTot') })} />
        <Kpi label={t('finance.master.opex.ga')} value={fmt.fmt(tot('gaTot'), '$')} detail={t('finance.opex.shareOfOpex', { s: share('gaTot') })} />
      </KpiRow>
      <Card title={t('finance.opex.details')} sub={opexYear === 1 ? t('finance.opex.hint27') : t('finance.opex.hintRO')}>
        <FinTable rows={rows} months={months} labelHead="CAD" totalLabel={t('finance.col.totalYear', { y: 2000 + yy })} editable={canEdit && opexYear === 1} focus={focus} focusMonth={focusMonth} />
        {opexYear === 1 && <EditLegend />}
      </Card>
      {opexYear === 1 && <TravelBudget focus={focus} />}
    </>
  );
}

function TravelBudget({ focus }: { focus: string | null }) {
  const { t } = useTranslation();
  const { result, trips, setTrips, canEdit, fmt } = useFinance();
  const list = result.trips;
  const months = fmt.months(27);
  const edit = (i: number, patch: Partial<Trip>) => setTrips(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = () => setTrips([...list, { name: t('finance.opex.newTrip'), dept: 'S&M', month: 0, people: 1, airfare: 600, nights: 2, hotel: 220, days: 3, perDiem: 85, other: 0 }]);
  const remove = async (i: number) => {
    if (!(await dialog.confirm(t('finance.opex.removeTrip', { name: list[i].name }), { danger: true }))) return;
    setTrips(list.filter((_, j) => j !== i));
  };
  const num = (i: number, k: keyof Trip, label: string) => (
    <NumCell value={list[i][k] as number} width="w-[70px]" decimals={2} disabled={!canEdit} label={`${list[i].name} — ${label}`} onChange={(v) => edit(i, { [k]: Math.max(0, v) } as Partial<Trip>)} />
  );
  const th = 'whitespace-nowrap border-b border-stroke px-2 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:border-strokedark dark:text-bodydark2';
  const td = 'whitespace-nowrap border-b border-stroke/60 px-2 py-1.5 tabular-nums dark:border-strokedark/60';
  const cols = ['airfare', 'nights', 'hotel', 'days', 'perDiem', 'other'] as const;
  const travelRows: FRow[] = [
    ...DEPTS.map((d) => ({ id: `tr:${d}`, kind: 'line' as const, label: t('finance.opex.travelDept', { d }), vals: result.opex27.travel[d], total: sum(result.opex27.travel[d]), cellFmt: 's' as const })),
    { id: 'tr:tot', kind: 'grand', label: t('finance.opex.totalTravel'), vals: months.map((_, i) => DEPTS.reduce((a, d) => a + result.opex27.travel[d][i], 0)), total: DEPTS.reduce((a, d) => a + sum(result.opex27.travel[d]), 0), cellFmt: '$' },
  ];
  return (
    <section data-focus="travel" className={`mb-5 ${focus === 'travel' ? 'rounded-2xl ring-2 ring-[#FDB022]' : ''}`}>
      <Card title={t('finance.opex.travel')} sub={t('finance.opex.travelHint')} actions={canEdit ? <Button size="sm" onClick={add}>{t('finance.opex.addTrip')}</Button> : undefined}>
        <div className="mb-4 overflow-x-auto rounded-xl border border-stroke dark:border-strokedark">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className={th}>{t('finance.opex.trip')}</th><th className={th}>{t('finance.opex.dept')}</th><th className={th}>{t('finance.opex.month')}</th>
                <th className={th}>{t('finance.opex.people')}</th>
                {cols.map((c) => <th key={c} className={th}>{t(`finance.opex.${c}`)}</th>)}
                <th className={`${th} text-right`}>{t('finance.col.total')}</th>
                {canEdit && <th className={th}><span className="sr-only">{t('finance.remove')}</span></th>}
              </tr>
            </thead>
            <tbody>
              {list.map((tr, i) => (
                <tr key={i} className="text-black dark:text-white">
                  <td className={td}>
                    <input aria-label={t('finance.opex.trip')} disabled={!canEdit} value={tr.name} maxLength={120} onChange={(e) => edit(i, { name: e.target.value })} className={`h-7 w-[200px] rounded-md border px-1.5 text-[12.5px] ${EDIT_CELL}`} />
                  </td>
                  <td className={td}>
                    <Select disabled={!canEdit} value={tr.dept} onChange={(v) => edit(i, { dept: v as Trip['dept'] })} options={DEPTS.map((d) => ({ value: d, label: d }))} buttonClassName={`h-7 min-w-[72px] rounded-md border px-1.5 text-left text-[12.5px] ${EDIT_CELL}`} />
                  </td>
                  <td className={td}>
                    <Select disabled={!canEdit} value={String(tr.month)} onChange={(v) => edit(i, { month: Number(v) })} options={months.map((m, j) => ({ value: String(j), label: m }))} buttonClassName={`h-7 min-w-[80px] rounded-md border px-1.5 text-left text-[12.5px] ${EDIT_CELL}`} />
                  </td>
                  <td className={td}>{num(i, 'people', t('finance.opex.people'))}</td>
                  {cols.map((c) => <td key={c} className={td}>{num(i, c, t(`finance.opex.${c}`))}</td>)}
                  <td className={`${td} text-right font-bold`}>{fmt.fmt(tripTotal(tr), '$')}</td>
                  {canEdit && (
                    <td className={td}>
                      <button type="button" onClick={() => remove(i)} aria-label={t('finance.opex.removeTripLabel', { name: tr.name })} className="rounded px-1.5 text-body hover:bg-gray-2 hover:text-[#B42318] dark:hover:bg-meta-4">✕</button>
                    </td>
                  )}
                </tr>
              ))}
              {!list.length && <tr><td colSpan={12} className={`${td} text-body`}>{t('finance.opex.noTrips')}</td></tr>}
            </tbody>
          </table>
        </div>
        {trips === null && <p className="mb-3 text-[12px] text-body dark:text-bodydark2">{t('finance.opex.tripsDefault')}</p>}
        <FinTable rows={travelRows} months={months} labelHead={t('finance.opex.travelByDept')} totalLabel={t('finance.col.total27')} editable={false} />
      </Card>
    </section>
  );
}

