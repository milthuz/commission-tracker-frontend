// Module Finance — pages Drivers de revenus et Drivers de COGS (même gabarit) : en haut, le
// sommaire qui alimente le Budget maître (chaque ligne mène à son calcul) ; en bas, les drivers,
// cellules jaunes modifiables et formules verrouillées.
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, dialog } from '../../components/ui';
import PageTitle from '../../components/PageTitle';
import { Card, EditLegend, FinanceHeader, FinTable, type FRow } from './components';
import { useFinance, useFocusRow } from './FinanceContext';
import { downloadCsv } from './format';
import { sum, type FinanceResult, type Reference } from './model';
import { COGS_BOT, COGS_TOP, DRV_BOT, DRV_TOP, JUMP, isSec, type RowDef, type RowSpec } from './rows';

export const PAGES = {
  master: '/finance',
  drivers: '/finance/revenue-drivers',
  cogs: '/finance/cogs-drivers',
  payroll: '/finance/payroll',
  opex: '/finance/opex',
};

function useRows(spec: RowSpec[], top: boolean): FRow[] {
  const { t } = useTranslation();
  const { result, payload, setDriver, fillDriver, goTo } = useFinance();
  const ref = payload.reference;
  return useMemo(() => spec.map((r, idx) => {
    if (isSec(r)) return { id: `sec:${r.sec}:${idx}`, kind: 'sec', label: t(`finance.sections.${r.sec}`) } as FRow;
    return buildRow(r, idx, top, result, ref, t, {
      setDriver, fillDriver,
      jump: (k) => goTo(window.location.pathname, k),
      toPayroll: payload.caps.canPayroll ? () => goTo(PAGES.payroll) : undefined,
    });
  }), [spec, top, result, ref, t, setDriver, fillDriver, goTo, payload.caps.canPayroll]);
}

function buildRow(r: RowDef, idx: number, top: boolean, R: FinanceResult, ref: Reference, t: (k: string, o?: any) => string,
  h: { setDriver: (k: string, i: number, v: number) => void; fillDriver: (k: string) => void; jump: (k: string) => void; toPayroll?: () => void }): FRow {
  const vals = r.inp ? R.I[r.key] : (R.Rm[r.key] || R.I[r.key]);
  const noTotal = r.fmt === '%' || r.fmt === '$2';
  const total = r.fy27 === 'first' ? vals[0]
    : r.fy27 === 'last' ? vals[11]
      : r.fy27 === 'hwPct' ? (ref.fy26.hwCogs ? (sum(R.Rm.hwCogs) / sum(R.Rm.totalHW)) * 100 : null)
        : noTotal ? null : sum(vals);
  const f26 = ref.fy26[r.key];
  const fy26 = typeof f26 === 'number' ? f26 : null;
  const vs = fy26 != null && fy26 !== 0 && total != null && !noTotal ? ((total - fy26) / Math.abs(fy26)) * 100 : null;
  let label = t(`finance.rows.${r.l}`);
  const row: FRow = { id: `${top ? 'top' : 'bot'}:${r.key}:${idx}`, kind: r.kind || 'line', label, fmt: r.fmt, vals, total, fy26, vs };
  if (r.payroll) {
    label += ` ${t('finance.toSalaryTab')}`;
    row.label = label;
    if (h.toPayroll) { row.onClick = h.toPayroll; row.linkCells = true; }
  }
  if (top) row.onClick = row.onClick || (() => h.jump(JUMP[r.key] || r.key));
  else row.focus = r.key;
  if (r.inp && !r.payroll) {
    row.edit = { values: vals, onChange: (i, v) => h.setDriver(r.key, i, v), onFill: () => h.fillDriver(r.key), decimals: r.fmt === '%' ? 3 : 2 };
  }
  return row;
}

function exportRows(name: string, rows: FRow[], months: string[], fmtHead: { fy26: string; fy27: string; vs: string; label: string }, fr: boolean) {
  const header = [fmtHead.label, fmtHead.fy26, ...months, fmtHead.fy27, fmtHead.vs];
  const lines = rows.filter((r) => r.kind !== 'sec').map((r) => [
    typeof r.label === 'string' ? r.label : r.id, r.fy26 ?? null, ...(r.vals || []).map((v) => v ?? null), r.total ?? null, r.vs == null ? null : `${r.vs.toFixed(1)}%`,
  ]);
  downloadCsv(name, header, lines, fr);
}

function DriverPage({ kind }: { kind: 'drivers' | 'cogs' }) {
  const { t } = useTranslation();
  const { drivers, resetDrivers, canEdit, fmt, goTo } = useFinance();
  const focus = useFocusRow();
  const topRows = useRows(kind === 'drivers' ? DRV_TOP : COGS_TOP, true);
  const botRows = useRows(kind === 'drivers' ? DRV_BOT : COGS_BOT, false);
  const months = fmt.months(27);
  const count = Object.keys(drivers.drv).length;
  const heads = { fy26: t('finance.col.fy26'), fy27: t('finance.col.fy27'), vs: t('finance.col.vs26'), label: 'CAD' };
  const P = kind === 'drivers' ? 'finance.drivers' : 'finance.cogs';

  const onReset = async () => {
    if (!(await dialog.confirm(t('finance.drivers.resetConfirm', { n: count }), { danger: true }))) return;
    resetDrivers();
  };
  const table = (rows: FRow[]) => (
    <FinTable rows={rows} months={months} showFy26 showVs labelHead="CAD" totalLabel={heads.fy27} fy26Label={heads.fy26} vsLabel={heads.vs} editable={canEdit} focus={focus} />
  );
  return (
    <>
      <PageTitle titleKey={kind === 'drivers' ? 'sidebar.financeRevenue' : 'sidebar.financeCogs'} />
      <FinanceHeader
        title={t(`${P}.title`)}
        subtitle={t(`${P}.subtitle`)}
        actions={
          <>
            <Button size="sm" onClick={() => goTo(PAGES.master)}>{t('finance.backMaster')}</Button>
            <Button size="sm" onClick={() => exportRows(`${kind === 'drivers' ? 'revenue-drivers' : 'cogs-drivers'}-FY2027.csv`, [...topRows, ...botRows], months, heads, fmt.fr)}>{t('finance.export')}</Button>
            {canEdit && <Button size="sm" variant="ghost" disabled={!count} onClick={onReset}>{t('finance.drivers.reset', { n: count })}</Button>}
          </>
        }
      />
      <Card title={t(`${P}.topTitle`)} sub={t(`${P}.topHint`)}>{table(topRows)}</Card>
      <Card title={t(`${P}.botTitle`)} sub={t('finance.drivers.botHint')}>
        {table(botRows)}
        <EditLegend />
      </Card>
    </>
  );
}

export const RevenueDrivers = () => <DriverPage kind="drivers" />;
export const CogsDrivers = () => <DriverPage kind="cogs" />;
