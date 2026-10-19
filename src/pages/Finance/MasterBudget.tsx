// Module Finance — Budget maître consolidé FY2027 (« Budgeted Statement of Income »). Aucune
// cellule modifiable ici : chaque ligne se déplie en ses comptes, et chaque compte mène à la page
// qui le calcule (drivers, COGS, salaires, OPEX), ligne surlignée.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui';
import PageTitle from '../../components/PageTitle';
import { Card, FinanceHeader, FinTable, Kpi, KpiRow, type FRow } from './components';
import { useFinance } from './FinanceContext';
import { PAGES } from './DriverPages';
import { downloadCsv, type Fmt } from './format';
import { COGS_GL, OPEX_SECTIONS, PAYROLL_KEYS, REV_CATS, REV_GL, ratio, sum, type RevCat, type Series } from './model';
import { COGS_KEYS } from './rows';

const OPEX_SEC_ID: Record<(typeof OPEX_SECTIONS)[number], string> = {
  'Sales & Marketing': 'sm', 'Research & Development': 'rd', 'General & Administrative': 'ga',
};

export default function MasterBudget() {
  const { t } = useTranslation();
  const { result, payload, fmt, goTo, setOpexYear } = useFinance();
  const { master: M, Rm, ox, kpis: K } = result;
  const ref = payload.reference;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [all, setAll] = useState(false);
  const months = fmt.months(27);

  const rows = useMemo(() => {
    const out: (FRow & { parent?: string })[] = [];
    const isOpen = (id: string) => all || !!open[id];
    const toggle = (id: string) => () => { setAll(false); setOpen((o) => ({ ...o, [id]: !isOpen(id) })); };
    const sec = (id: string) => out.push({ id: `sec:${id}`, kind: 'sec', label: t(`finance.master.sec.${id}`) });
    const money = (id: string, label: string, vals: Series, kind: FRow['kind'], dollar: boolean) =>
      out.push({ id, kind, label, vals, total: sum(vals), cellFmt: (dollar ? '$' : 's') as Fmt });
    const pct = (id: string, label: string, num: Series, den: Series) => {
      const r = ratio(num, den);
      out.push({ id, kind: 'pct', label, vals: r.months, total: r.total, cellFmt: 'ratio' });
    };
    const line = (id: string, label: string, vals: Series, dollar: boolean, gl: FRow[]) => {
      out.push({ id, kind: 'line', label, vals, total: sum(vals), cellFmt: dollar ? '$' : 's', expand: { open: isOpen(id), toggle: toggle(id) } });
      gl.forEach((g) => out.push({ ...g, parent: id }));
    };
    const glDriver = (k: string): FRow => {
      const vals = Rm[k] || result.I[k];
      if (PAYROLL_KEYS.has(k)) {
        return { id: `gl:${k}`, kind: 'gl', label: `${t(`finance.gl.${k}`)} (${t('sidebar.financePayroll')})`, vals, total: sum(vals), cellFmt: 's',
          ...(payload.caps.canPayroll ? { onClick: () => goTo(PAGES.payroll), linkCells: true } : {}) };
      }
      return { id: `gl:${k}`, kind: 'gl', label: t(`finance.gl.${k}`), vals, total: sum(vals), cellFmt: 's',
        onClick: () => goTo(COGS_KEYS.has(k) ? PAGES.cogs : PAGES.drivers, k), linkCells: true };
    };

    sec('revenue');
    REV_CATS.forEach((c, i) => line(`rev:${c}`, t(`finance.master.rev.${c}`), M.rev[c], i === 0, REV_GL[c].map(glDriver)));
    money('tRev', t('finance.master.totalRevenue'), M.tRev, 'grand', true);
    sec('cogs');
    REV_CATS.forEach((c, i) => line(`cogs:${c}`, t(`finance.master.cogs.${c}`), M.cogs[c], i === 0, COGS_GL[c].map(glDriver)));
    money('tCogs', t('finance.master.totalCogs'), M.tCogs, 'sub', true);
    money('gp', t('finance.master.grossProfit'), M.gp, 'grand', true);
    pct('gm', t('finance.master.grossMargin'), M.gp, M.tRev);
    sec('gmByCat');
    REV_CATS.forEach((c: RevCat, i) => {
      money(`gp:${c}`, t('finance.master.catGp', { cat: t(`finance.master.cat.${c}`) }), M.gpBy[c], 'line', i === 0);
      pct(`gm:${c}`, t('finance.master.catMargin', { cat: t(`finance.master.cat.${c}`) }), M.gpBy[c], M.rev[c]);
    });
    sec('opex');
    OPEX_SECTIONS.forEach((s, i) => {
      const id = OPEX_SEC_ID[s];
      line(`opex:${id}`, t(`finance.master.opex.${id}`), M.opex[s], i === 0, ox[s].map((l) => ({
        id: `gl:opex:${l.key}`, kind: 'gl', label: t(`finance.opexLines.${l.key}`, { defaultValue: l.name }), vals: l.vals, total: sum(l.vals), cellFmt: 's',
        onClick: () => { setOpexYear(1); goTo(PAGES.opex, l.key); }, linkCells: true,
      } as FRow)));
      pct(`opexPct:${id}`, t('finance.master.pctOfRevenue', { line: t(`finance.master.opex.${id}`) }), M.opex[s], M.tRev);
    });
    money('tOpex', t('finance.master.totalOpex'), M.tOpex, 'sub', true);
    pct('tOpexPct', t('finance.master.totalOpexPct'), M.tOpex, M.tRev);
    money('ebitda', t('finance.master.ebitda'), M.ebitda, 'grand', true);
    pct('ebitdaPct', t('finance.master.ebitdaMargin'), M.ebitda, M.tRev);
    sec('nonOp');
    const nonOpGl = (side: 'income' | 'expense') => ref.nonOp[side].gl.map((g, j) => ({ id: `gl:${side}:${j}`, kind: 'gl', label: g.name, vals: g.v, total: sum(g.v), cellFmt: 's' } as FRow));
    line('noi', t('finance.master.nonOpIncome'), M.noi, true, nonOpGl('income'));
    line('noe', t('finance.master.nonOpExpense'), M.noe, false, nonOpGl('expense'));
    money('ni', t('finance.master.netIncome'), M.ni, 'grand', true);
    pct('niPct', t('finance.master.netMargin'), M.ni, M.tRev);
    return out;
  }, [M, Rm, ox, ref, result.I, t, open, all, goTo, setOpexYear, payload.caps.canPayroll]);

  const shown = rows.filter((r) => !r.parent || all || open[r.parent]);
  const money = (v: number) => fmt.fmt(v, '$');
  const vsLine = (prev: number, vs: number | null) => t('finance.kpi.prevLine', { prev: money(prev), vs: fmt.pct(vs, true) });

  const exportCsv = () => downloadCsv('master-budget-FY2027.csv', ['CAD', ...months, t('finance.col.total27')],
    rows.filter((r) => r.kind !== 'sec').map((r) => [String(r.label), ...(r.vals || []).map((v) => (r.kind === 'pct' && v != null ? Math.round(v * 1000) / 10 : v ?? null)), r.kind === 'pct' && r.total != null ? Math.round(r.total * 1000) / 10 : r.total ?? null]),
    fmt.fr);

  return (
    <>
      <PageTitle titleKey="sidebar.financeMaster" />
      <FinanceHeader
        title={t('finance.master.title')}
        subtitle={t('finance.master.subtitle')}
        actions={
          <>
            <Button size="sm" onClick={() => { setAll((a) => !a); setOpen({}); }}>{all ? t('finance.collapseAll') : t('finance.expandAll')}</Button>
            <Button size="sm" onClick={() => goTo(PAGES.drivers)}>{t('finance.master.openDrivers')}</Button>
            <Button size="sm" onClick={exportCsv}>{t('finance.export')}</Button>
          </>
        }
      />
      <KpiRow>
        <Kpi label={t('finance.kpi.revenue')} value={money(K.revenue.value)}
          detail={t('finance.kpi.revenueMix', { rec: K.revenue.recurringShare.toFixed(0), tx: K.revenue.transactionShare.toFixed(0) })}
          sub={vsLine(K.revenue.prev, K.revenue.vs)} />
        <Kpi label={t('finance.kpi.grossProfit')} value={money(K.grossProfit.value)}
          detail={t('finance.kpi.marginLine', { m: fmt.pct(K.grossProfit.margin), p: fmt.pct(K.grossProfit.prevMargin) })}
          sub={vsLine(K.grossProfit.prev, K.grossProfit.vs)} />
        <Kpi label={t('finance.kpi.ebitda')} value={money(K.ebitda.value)} tone={K.ebitda.value < 0 ? 'dn' : 'up'}
          detail={t('finance.kpi.marginLine', { m: fmt.pct(K.ebitda.margin), p: fmt.pct(K.ebitda.prevMargin) })}
          sub={vsLine(K.ebitda.prev, K.ebitda.vs)} />
        <Kpi label={t('finance.kpi.netIncome')} value={money(K.netIncome.value)} tone={K.netIncome.value < 0 ? 'dn' : 'up'}
          detail={t('finance.kpi.marginLine', { m: fmt.pct(K.netIncome.margin), p: fmt.pct(K.netIncome.prevMargin) })}
          sub={vsLine(K.netIncome.prev, K.netIncome.vs)} />
      </KpiRow>
      <KpiRow>
        <Kpi label={t('finance.kpi.rooftops')} onClick={() => goTo(PAGES.drivers, 'canBeg')}
          value={`+${fmt.fmt(K.rooftops.added, 'n')} → ${fmt.fmt(K.rooftops.ending, 'n')}`}
          detail={t('finance.kpi.rooftopsDetail', { churn: fmt.fmt(K.rooftops.churn, 'n'), net: `${K.rooftops.net >= 0 ? '+' : '−'}${fmt.fmt(Math.abs(K.rooftops.net), 'n')}` })} />
        <Kpi label={t('finance.kpi.arpu')} onClick={() => goTo(PAGES.drivers, 'canArpu')}
          value={`${K.arpu.added >= 0 ? '+' : '−'}${fmt.fmt(Math.abs(K.arpu.added), '$2')} → ${fmt.fmt(K.arpu.end, '$2')}`}
          detail={t('finance.kpi.arpuDetail', { start: fmt.fmt(K.arpu.start, '$2') })} />
        <Kpi label={t('finance.kpi.mrr')} onClick={() => goTo(PAGES.drivers, 'totalSub')}
          value={`${K.mrr.added >= 0 ? '+' : '−'}${money(Math.abs(K.mrr.added))} → ${money(K.mrr.end)}`}
          detail={t('finance.kpi.mrrDetail', { arr: money(K.mrr.exitArr), vs: fmt.pct(K.mrr.vsAvg, true) })} />
        <Kpi label={t('finance.kpi.adyen')} onClick={() => goTo(PAGES.drivers, 'adyenBeg')}
          value={t('finance.kpi.adyenValue', { pts: `${K.adyen.pts >= 0 ? '+' : '−'}${Math.abs(K.adyen.pts).toFixed(1)}`, end: fmt.pct(K.adyen.end) })}
          detail={t('finance.kpi.adyenDetail', { start: fmt.pct(K.adyen.start) })} />
      </KpiRow>
      <Card title={t('finance.master.statement')} sub={t('finance.master.statementHint')}>
        <FinTable rows={shown} months={months} labelHead="CAD" totalLabel={t('finance.col.total27')} editable={false} />
      </Card>
    </>
  );
}
