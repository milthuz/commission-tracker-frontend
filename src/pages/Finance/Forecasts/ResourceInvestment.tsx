// Module Finance — Investissement en ressources : Kaizen V2 | Paiements (conversion). Les vraies
// données sont dans le classeur de la CFO (feuilles `V2`, `Payments Conversion`) : import →
// aperçu → confirmation. Initiatives, taux de capitalisation, autres coûts et rendement se
// saisissent ici ; le seuil de rentabilité est CALCULÉ (le prototype l'écrivait en dur).
// 🔑 Noms et montants par personne : `finance:payroll` seulement — le serveur ne les envoie pas
// aux autres, qui voient les totaux par initiative.
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, dialog } from '../../../components/ui';
import { INPUT, LABEL, SEG, segBtn } from '../../../components/ui/surface';
import Select from '../../../components/Select';
import PageTitle from '../../../components/PageTitle';
import { Card, EditLegend, FinTable, Kpi, KpiRow, NumCell, type FRow } from '../components';
import { useFinance } from '../FinanceContext';
import { downloadCsv } from '../format';
import { fcApi, type Program } from './api';
import { breakEven, capitalizable, computeInvestment, type InvCalc, type InvDoc, type Person } from './engine';
import { CHART, Chart, FcHeader, Grid, ImportExcel, Note, PageGate, SaveBadge, compact, useChartBase, useDocSaver, useLoad, useYmLabel, type Col } from './ui';

// Sans la paie : coût de paie par initiative tel que calculé par le serveur, autres coûts saisis ici.
function mergeServer(server: InvCalc, inv: InvDoc): InvCalc {
  const months = inv.months;
  const by = new Map(server.initiatives.map((i) => [i.id, i]));
  const initiatives = inv.initiatives.map((it) => {
    const s = by.get(it.id);
    const payroll = Object.fromEntries(months.map((k) => [k, s ? s.payroll[k] || 0 : 0]));
    const other = Object.fromEntries(months.map((k) => [k, Number(it.other?.[k]) || 0]));
    return { id: it.id, name: it.name, capPct: it.capPct, employees: s?.employees || 0, contractors: s?.contractors || 0, fte: s?.fte || 0, payroll, other, cost: Object.fromEntries(months.map((k) => [k, payroll[k] + other[k]])) };
  });
  // Une initiative retirée ici : ses personnes deviennent « non affectées ».
  const gone = server.initiatives.filter((i) => !inv.initiatives.some((x) => x.id === i.id));
  const unassigned = Object.fromEntries(months.map((k) => [k, (server.unassigned[k] || 0) + gone.reduce((s, g) => s + (g.payroll[k] || 0), 0)]));
  const total = Object.fromEntries(months.map((k) => [k, initiatives.reduce((s, i) => s + i.cost[k], 0) + unassigned[k]]));
  return { months, initiatives, unassigned, unassignedCount: server.unassignedCount + gone.reduce((s, g) => s + g.employees + g.contractors, 0), total, headcount: server.headcount };
}

export default function ResourceInvestment({ program }: { program: Program }) {
  const { t } = useTranslation();
  const { fmt, goTo } = useFinance();
  const load = useLoad(() => fcApi.investment(program), [program]);
  const p = load.data;
  const onConflict = load.reload;
  const inv = useDocSaver<InvDoc>(`inv:${program}`, p?.doc, onConflict);
  const ppl = useDocSaver<{ people: Person[] }>(`people:${program}`, p?.people, onConflict);
  const ymLabel = useYmLabel();
  const { base } = useChartBase();
  const [fy, setFy] = useState<number | null>(null);
  const [newInit, setNewInit] = useState<string | null>(null);
  const otherVersions = useRef<Record<string, number>>({});

  const doc = inv.data;
  const people = p?.people ? ppl.data?.people || null : null;
  const calc = useMemo(() => (!p || !doc ? null : people ? computeInvestment(doc, people) : mergeServer(p.computed, doc)), [p, doc, people]);
  const months = doc?.months || [];
  const years = [...new Set(months.map((k) => Number(k.slice(0, 4))))];
  const year = fy && years.includes(fy) ? fy : years.includes(new Date().getFullYear() + 1) ? new Date().getFullYear() + 1 : years[years.length - 1];
  const fyMonths = months.filter((k) => Number(k.slice(0, 4)) === year);
  const be = useMemo(() => (calc && doc ? breakEven(months, calc.total, doc.returns || {}) : null), [calc, doc, months]);

  const gate = <PageGate error={load.error} loading={!p} onRetry={load.reload} />;
  const titleKey = `finance.forecasts.inv.title_${program}`;
  if (!p || !doc || !calc) return <><PageTitle titleKey={titleKey} />{gate}</>;
  const canEdit = p.caps.canEdit;
  const canPeople = p.caps.canEditPayroll && !!people;
  const sumK = (o: Record<string, number>, ks: string[]) => ks.reduce((s, k) => s + (o[k] || 0), 0);
  const money = (v: number | null | undefined) => (v == null ? '—' : fmt.fmt(v, '$'));
  const cap = capitalizable(calc, fyMonths);
  const fyTotal = sumK(calc.total, fyMonths);
  const horizon = sumK(calc.total, months);
  const retTotal = sumK(doc.returns || {}, months);

  // ------------------------------------------------------------- modifications
  const setInit = (id: string, patch: Partial<InvDoc['initiatives'][number]>) => inv.update((d) => ({ ...d, initiatives: d.initiatives.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const setOther = (id: string, k: string, v: number) => inv.update((d) => ({ ...d, initiatives: d.initiatives.map((i) => (i.id === id ? { ...i, other: { ...i.other, [k]: Math.max(0, v) } } : i)) }));
  const setReturn = (k: string, v: number) => inv.update((d) => ({ ...d, returns: { ...(d.returns || {}), [k]: v } }));
  const addInit = () => {
    const name = (newInit || '').trim();
    if (!name) return;
    inv.update((d) => ({ ...d, initiatives: [...d.initiatives, { id: `i${Date.now().toString(36)}`, name, capPct: null, other: {} }] }));
    setNewInit(null);
  };
  const removeInit = async (id: string, name: string) => {
    if (!(await dialog.confirm(t('finance.forecasts.inv.removeConfirm', { name }), { danger: true }))) return;
    inv.update((d) => ({ ...d, initiatives: d.initiatives.filter((i) => i.id !== id) }));
  };
  const setPerson = (id: string, patch: Partial<Person>) => ppl.update((d) => ({ people: d.people.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  // ------------------------------------------------------------- initiatives
  type IRow = InvCalc['initiatives'][number] | { id: '__unassigned'; name: string; capPct: null; employees: number; contractors: number; fte: number; cost: Record<string, number> };
  const irows: IRow[] = [...calc.initiatives, ...(calc.unassignedCount || sumK(calc.unassigned, months) ? [{ id: '__unassigned' as const, name: t('finance.forecasts.inv.unassigned'), capPct: null, employees: calc.unassignedCount, contractors: 0, fte: 0, cost: calc.unassigned }] : [])];
  const icols: Col<IRow>[] = [
    { id: 'n', head: t(program === 'v2' ? 'finance.forecasts.inv.initiative' : 'finance.forecasts.inv.category'), left: true, cell: (r) => (r.id !== '__unassigned' && canEdit
      ? <input aria-label={t('finance.forecasts.inv.name')} className={`${INPUT} h-8 w-[220px]`} maxLength={120} value={r.name} onChange={(e) => setInit(r.id, { name: e.target.value })} onBlur={(e) => { if (!e.target.value.trim()) setInit(r.id, { name: t('finance.forecasts.inv.untitled') }); }} />
      : <span className={r.id === '__unassigned' ? 'italic' : ''}>{r.name}</span>) },
    { id: 'pp', head: t('finance.forecasts.inv.people'), cell: (r) => (r.id === '__unassigned' ? fmt.fmt(r.employees, 'n') : `${fmt.fmt(r.employees + r.contractors, 'n')}${r.fte ? ` · ${fmt.int.format(Math.round(r.fte * 10) / 10)} ${t('finance.forecasts.inv.fte')}` : ''}`) },
    { id: 'cap', head: t('finance.forecasts.inv.capPct'), cell: (r) => (r.id === '__unassigned' ? '—' : canEdit
      ? <NumCell value={r.capPct ?? NaN} decimals={1} width="w-[64px]" label={`${t('finance.forecasts.inv.capPct')} — ${r.name}`} onChange={(v) => setInit(r.id, { capPct: Math.min(100, Math.max(0, v)) })} />
      : r.capPct == null ? t('finance.forecasts.inv.notSet') : fmt.pct(r.capPct)) },
    { id: 'fy', head: `FY${year}`, cell: (r) => money(sumK(r.cost, fyMonths)) },
    { id: 'h', head: t('finance.forecasts.inv.horizon'), cell: (r) => money(sumK(r.cost, months)) },
    { id: 'sh', head: '%', cell: (r) => (fyTotal ? fmt.pct((sumK(r.cost, fyMonths) / fyTotal) * 100) : '—') },
    ...(canEdit ? [{ id: 'x', head: <span className="sr-only">{t('finance.forecasts.common.remove')}</span>, cell: (r: IRow) => (r.id === '__unassigned' ? '' : <Button size="xs" variant="ghost" onClick={() => removeInit(r.id, r.name)}>{t('finance.forecasts.common.remove')}</Button>) }] : []),
  ];

  // ------------------------------------------------------------- tableau mensuel (FinTable)
  const mLabels = months.map((k) => ymLabel(k));
  const vals = (o: Record<string, number>) => months.map((k) => o[k] || 0);
  const netArr = months.map((k) => (doc.returns?.[k] || 0) - (calc.total[k] || 0));
  let acc = 0;
  const cumNet = netArr.map((v) => (acc += v));
  const frows: FRow[] = [
    { id: 'sec-cost', kind: 'sec', label: t('finance.forecasts.inv.costs') },
    ...calc.initiatives.flatMap((it): FRow[] => [
      { id: `pay-${it.id}`, kind: 'line', label: t('finance.forecasts.inv.payrollOf', { name: it.name }), vals: vals(it.payroll), total: sumK(it.payroll, months), cellFmt: 's' },
      {
        id: `oth-${it.id}`, kind: 'line', label: t('finance.forecasts.inv.otherOf', { name: it.name }), vals: vals(it.other), total: sumK(it.other, months), cellFmt: 's',
        ...(canEdit ? { edit: { values: vals(it.other), decimals: 0, onChange: (i: number, v: number) => setOther(it.id, months[i], v) } } : {}),
      },
    ]),
    ...(sumK(calc.unassigned, months) ? [{ id: 'unas', kind: 'line' as const, label: t('finance.forecasts.inv.unassigned'), vals: vals(calc.unassigned), total: sumK(calc.unassigned, months), cellFmt: 's' as const }] : []),
    { id: 'tot', kind: 'sub', label: t('finance.forecasts.inv.totalCost'), vals: vals(calc.total), total: horizon, cellFmt: '$' },
    { id: 'sec-ret', kind: 'sec', label: t('finance.forecasts.inv.return') },
    {
      id: 'ret', kind: 'line', label: doc.returnLabel || t(`finance.forecasts.inv.returnLabel_${program}`), vals: vals(doc.returns || {}), total: retTotal, cellFmt: '$',
      ...(canEdit ? { edit: { values: vals(doc.returns || {}), decimals: 0, onChange: (i: number, v: number) => setReturn(months[i], v) } } : {}),
    },
    { id: 'net', kind: 'grand', label: t('finance.forecasts.inv.net'), vals: netArr, total: retTotal - horizon, cellFmt: '$' },
    { id: 'cum', kind: 'pct', label: t('finance.forecasts.inv.cumNet'), vals: cumNet, total: null, cellFmt: '$' },
  ];

  // ------------------------------------------------------------- graphique
  const fmtAxis = compact(fmt.loc);
  const options = base({
    chart: { type: 'line' },
    colors: [CHART.budget, CHART.brand],
    stroke: { width: [2.5, 3], curve: 'straight' },
    xaxis: { categories: mLabels, labels: { rotate: -45, hideOverlappingLabels: true } },
    yaxis: { labels: { formatter: (v: number) => fmtAxis(v) } },
    annotations: be && be.index != null ? { xaxis: [{ x: mLabels[be.index], borderColor: CHART.ok, label: { text: t('finance.forecasts.inv.breakEvenAt', { m: ymLabel(be.ym as string, true) }), style: { color: '#fff', background: CHART.ok } } }] } : {},
    tooltip: { y: { formatter: (v: number) => money(v) } },
  });
  const series: ApexAxisChartSeries = be ? [
    { name: t('finance.forecasts.inv.cumCost'), data: be.cumCost.map((v) => Math.round(v)) },
    { name: t('finance.forecasts.inv.cumReturn'), data: be.cumRet.map((v) => Math.round(v)) },
  ] : [];

  // ------------------------------------------------------------- effectif (paie)
  const fyAvg = (pp: Person) => (fyMonths.length ? fyMonths.reduce((s, k) => s + (pp.monthly[k] || 0) * (pp.alloc / 100), 0) : 0);
  const pcols: Col<Person>[] = [
    { id: 'n', head: t('finance.forecasts.inv.person'), left: true, cell: (x) => x.name },
    { id: 't', head: t('finance.forecasts.inv.type'), left: true, cell: (x) => t(`finance.forecasts.inv.type_${x.type}`) },
    { id: 'm', head: t('finance.forecasts.inv.map'), left: true, cell: (x) => x.map || '—' },
    { id: 'i', head: t(program === 'v2' ? 'finance.forecasts.inv.initiative' : 'finance.forecasts.inv.category'), left: true, cell: (x) => (canPeople
      ? <div className="w-[200px]"><Select value={x.initiativeId || ''} onChange={(v) => setPerson(x.id, { initiativeId: v || null })} options={[{ value: '', label: t('finance.forecasts.inv.unassigned') }, ...doc.initiatives.map((i) => ({ value: i.id, label: i.name }))]} /></div>
      : doc.initiatives.find((i) => i.id === x.initiativeId)?.name || t('finance.forecasts.inv.unassigned')) },
    { id: 'a', head: t('finance.forecasts.inv.alloc'), cell: (x) => (canPeople ? <NumCell value={x.alloc} decimals={0} width="w-[60px]" label={`${t('finance.forecasts.inv.alloc')} — ${x.name}`} onChange={(v) => setPerson(x.id, { alloc: Math.min(100, Math.max(0, v)) })} /> : fmt.pct(x.alloc)) },
    { id: 'mc', head: t('finance.forecasts.inv.monthlyCost', { y: year }), cell: (x) => money(fyMonths.length ? fyAvg(x) / fyMonths.length : null) },
    { id: 'fy', head: `FY${year}`, cell: (x) => money(fyAvg(x)) },
  ];

  const exportCsv = () => downloadCsv(`resource-investment-${program}.csv`, ['', ...months, t('finance.forecasts.inv.horizon')],
    frows.filter((r) => r.kind !== 'sec').map((r) => [String(r.label), ...(r.vals || []).map((v) => v ?? null), r.total ?? null]), fmt.fr);
  const exportPeople = () => people && downloadCsv(`resource-investment-${program}-roster.csv`,
    [t('finance.forecasts.inv.person'), t('finance.forecasts.inv.type'), t('finance.forecasts.inv.map'), t('finance.forecasts.inv.initiative'), t('finance.forecasts.inv.alloc'), ...months],
    people.map((x) => [x.name, x.type, x.map, doc.initiatives.find((i) => i.id === x.initiativeId)?.name || '', x.alloc, ...months.map((k) => (x.monthly[k] || 0) * (x.alloc / 100))]), fmt.fr);

  // L'import écrit les deux programmes : on lit d'abord les versions de l'autre.
  const other: Program = program === 'v2' ? 'payments' : 'v2';
  const beforeImport = async () => {
    await inv.flush(); await ppl.flush();
    const o = await fcApi.investment(other);
    otherVersions.current = { [`inv:${other}`]: o.doc.version, [`people:${other}`]: o.people ? o.people.version : 0 };
  };

  const empty = !months.length;

  return (
    <>
      <PageTitle titleKey={titleKey} />
      <FcHeader
        group={t('finance.forecasts.invGroup')}
        title={t('finance.forecasts.inv.title')}
        subtitle={t(`finance.forecasts.inv.sub_${program}`)}
        right={<><SaveBadge status={inv.status === 'idle' ? ppl.status : inv.status} error={inv.error || ppl.error} /></>}
        notice={inv.notice || ppl.notice}
        actions={<>
          <div className={SEG} role="group" aria-label={t('finance.forecasts.inv.program')}>
            {(['v2', 'payments'] as Program[]).map((x) => <button key={x} type="button" aria-pressed={program === x} className={segBtn(program === x)} onClick={() => goTo(`/finance/investment/${x}`)}>{t(`finance.forecasts.inv.prog_${x}`)}</button>)}
          </div>
          {years.length > 1 && <div className="w-[120px]"><Select value={String(year)} onChange={(v) => setFy(Number(v))} options={years.map((y) => ({ value: String(y), label: `FY${y}` }))} /></div>}
          <span className="ml-auto" />
          <Button size="sm" disabled={empty} onClick={exportCsv}>{t('finance.export')}</Button>
          {people && <Button size="sm" disabled={!people.length} onClick={exportPeople}>{t('finance.forecasts.inv.exportRoster')}</Button>}
          {canEdit && <Button size="sm" disabled={empty} onClick={() => setNewInit('')}>{t(program === 'v2' ? 'finance.forecasts.inv.addInitiative' : 'finance.forecasts.inv.addCategory')}</Button>}
          {p.caps.canEditPayroll && <ImportExcel kind="investment" extraBefore={beforeImport}
            versions={() => ({ [`inv:${program}`]: inv.version(), [`people:${program}`]: ppl.version(), ...otherVersions.current })}
            onApplied={load.reload} renderSummary={(s) => <InvImportSummary s={s} />} />}
        </>}
      />

      {empty && <Note tone="warn">{t(p.caps.canEditPayroll ? 'finance.forecasts.inv.emptyImport' : 'finance.forecasts.inv.emptyAsk')}</Note>}
      {doc.source && <Note>{t('finance.forecasts.inv.sourceNote', { sheet: doc.source.sheet, file: doc.source.file || '—', at: new Date(doc.source.importedAt).toLocaleDateString(fmt.loc, { day: 'numeric', month: 'long', year: 'numeric' }) })}</Note>}

      {!empty && (
        <>
          <KpiRow>
            <Kpi label={t('finance.forecasts.inv.tiles.fy', { y: year })} value={money(fyTotal)} detail={t('finance.forecasts.inv.tiles.horizon', { v: money(horizon), from: ymLabel(months[0]), to: ymLabel(months[months.length - 1]) })} />
            <Kpi label={t('finance.forecasts.inv.tiles.people')} value={fmt.int.format(Math.round(calc.headcount.fte * 10) / 10)}
              detail={t('finance.forecasts.inv.tiles.peopleDetail', { e: calc.headcount.employees, c: calc.headcount.contractors })} />
            <Kpi label={t('finance.forecasts.inv.tiles.cap')} value={cap.pct == null ? t('finance.forecasts.inv.notSet') : fmt.pct(cap.pct)}
              detail={cap.pct == null ? t('finance.forecasts.inv.tiles.capNone') : t('finance.forecasts.inv.tiles.capDetail', { v: money(cap.amount), y: year })}
              sub={cap.uncovered > 0 && cap.pct != null ? t('finance.forecasts.inv.tiles.capUncovered', { v: money(cap.uncovered) }) : undefined} />
            <Kpi label={t('finance.forecasts.inv.tiles.return')} value={money(retTotal)}
              detail={!retTotal ? t('finance.forecasts.inv.tiles.noReturn') : be && be.ym ? t('finance.forecasts.inv.tiles.breakEven', { m: ymLabel(be.ym, true) }) : t('finance.forecasts.inv.tiles.noBreakEven', { v: money(Math.abs(be ? be.gap : 0)) })}
              sub={be && be.monthlyYm ? t('finance.forecasts.inv.tiles.monthlyBreakEven', { m: ymLabel(be.monthlyYm, true) }) : undefined} />
          </KpiRow>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card title={t(program === 'v2' ? 'finance.forecasts.inv.initiatives' : 'finance.forecasts.inv.categories')} sub={t('finance.forecasts.inv.initiativesSub')}>
              <Grid cols={icols} rows={irows} rowKey={(r) => r.id} caption={t('finance.forecasts.inv.initiatives')} />
            </Card>
            <Card title={t('finance.forecasts.inv.chartTitle')} sub={t('finance.forecasts.inv.chartSub')}>
              <Chart type="line" k={`${program}-${months.length}`} options={options} series={series} />
            </Card>
          </div>

          <Card title={t('finance.forecasts.inv.monthlyTitle')} sub={t(`finance.forecasts.inv.returnHint_${program}`)}>
            <FinTable rows={frows} months={mLabels} totalLabel={t('finance.forecasts.inv.horizon')} labelHead="CAD" editable={canEdit} />
            {canEdit && <EditLegend />}
          </Card>

          {people ? (
            <Card title={t('finance.forecasts.inv.roster')} sub={t('finance.forecasts.inv.rosterSub')}>
              <Grid cols={pcols} rows={people} rowKey={(x) => x.id} caption={t('finance.forecasts.inv.roster')} />
            </Card>
          ) : <Note>{t('finance.forecasts.inv.rosterHidden')}</Note>}
        </>
      )}

      <Modal open={newInit != null} onClose={() => setNewInit(null)} title={t(program === 'v2' ? 'finance.forecasts.inv.addInitiative' : 'finance.forecasts.inv.addCategory')} size="sm"
        footer={<>
          <Button size="md" variant="ghost" onClick={() => setNewInit(null)}>{t('finance.forecasts.common.cancel')}</Button>
          <Button size="md" variant="primary" disabled={!(newInit || '').trim()} onClick={addInit}>{t('finance.forecasts.common.add')}</Button>
        </>}>
        <label className={LABEL} htmlFor="inv-new-name">{t('finance.forecasts.inv.name')}</label>
        <input id="inv-new-name" className={`${INPUT} w-full`} maxLength={120} value={newInit || ''} onChange={(e) => setNewInit(e.target.value)} />
      </Modal>
    </>
  );
}

function InvImportSummary({ s }: { s: any }) {
  const { t } = useTranslation();
  const { fmt } = useFinance();
  const progs = Object.entries(s.programs || {}) as [string, any][];
  return (
    <div className="flex flex-col gap-3 text-[13px] text-black dark:text-white">
      {progs.map(([k, x]) => (
        <div key={k} className="rounded-xl border border-stroke p-3 dark:border-strokedark">
          <p className="m-0 font-bold">{t(`finance.forecasts.inv.prog_${k}`)} — {t('finance.forecasts.import.sheet', { s: x.sheet })}</p>
          {x.error ? <p className="m-0 mt-1 text-[#B42318] dark:text-[#F46060]">{t(`finance.forecasts.import.err.${x.error}`, { defaultValue: x.error })}</p> : (
            <ul className="m-0 mt-1 list-disc pl-5">
              <li>{t('finance.forecasts.import.invPeople', { e: x.employees, c: x.contractors, from: x.from, to: x.to })}</li>
              {Object.entries(x.costByYear || {}).map(([y, v]) => <li key={y}>{t('finance.forecasts.import.invCost', { y, v: fmt.fmt(v as number, '$2') })}{x.returnByYear ? ` · ${t('finance.forecasts.import.invReturn', { v: fmt.fmt(x.returnByYear[y] || 0, '$2') })}` : ''}</li>)}
              <li className={x.warnings?.length ? 'text-[#B54708] dark:text-[#FDB022]' : 'text-[#067647] dark:text-[#57D193]'}>{x.warnings?.length ? t('finance.forecasts.import.invWarnings', { n: x.warnings.length }) : t('finance.forecasts.import.invTies')}</li>
            </ul>
          )}
        </div>
      ))}
      <p className="m-0 text-[12px] text-body dark:text-bodydark2">{t('finance.forecasts.import.invKeep')}</p>
    </div>
  );
}
