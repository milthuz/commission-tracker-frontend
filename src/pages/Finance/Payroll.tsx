// Module Finance — Salaires & contractuels (miroir de « salary & contractors.xlsx »). Réservé à
// `finance:payroll` : noms et salaires réels. Alimente les COGS (soutien, livraison) et l'OPEX
// (ventes, succès client, R&D, administration, comptabilité, opérations, TI) du Budget maître.
//
// Ajout de la phase 1 (décision de David, 2026-10-19) : la CFO ajoute et retire des personnes,
// avec un mois d'arrivée et de départ pour les embauches et les départs prévus.
import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, dialog } from '../../components/ui';
import { CARD, LABEL } from '../../components/ui/surface';
import Select from '../../components/Select';
import PageTitle from '../../components/PageTitle';
import { Card, EDIT_CELL, FinanceHeader, Kpi, KpiRow, NumCell } from './components';
import { useFinance } from './FinanceContext';
import { RosterImportActions } from './ConsolidatedImport';
import { downloadCsv } from './format';
import { MAPS, masterCount, payCodesOf, sum, type Contractor, type Employee, type PnlMap, type Series } from './model';

const ENTITIES = ['Cluster', 'Xperio'];
const th = 'whitespace-nowrap border-b border-stroke px-2 py-2 text-left text-[13px] font-semibold text-body dark:border-strokedark dark:text-bodydark2';
const thR = `${th} text-right`;
const td = 'whitespace-nowrap border-b border-[#F0F0ED] px-2 py-2 tabular-nums dark:border-[#232428]';
const tdR = `${td} text-right`;
// Style « relevé épuré » de la CFO (SH-50) : sous-total en simple filet, grand total en bande douce.
const SUB = 'font-bold [&>td]:border-t [&>td]:border-t-[#C9C9C5] dark:[&>td]:border-t-[#3A3C42]';
const GRAND = 'font-extrabold [&>td]:border-t-2 [&>td]:border-t-[#141414] dark:[&>td]:border-t-[#E4E4E7] [&>td]:bg-[#FFF7F1] dark:[&>td]:bg-[#2A2015]';
const SEC = 'text-[14px] font-bold text-black dark:text-white';

// Champ texte qui garde la frappe localement (la sauvegarde part après une pause).
function TextCell({ value, onChange, disabled, label, width = 'w-[160px]', upper }: { value: string; onChange: (v: string) => void; disabled?: boolean; label: string; width?: string; upper?: boolean }) {
  const [raw, setRaw] = useState(value);
  useEffect(() => { setRaw(value); }, [value]);
  return (
    <input type="text" aria-label={label} disabled={disabled} value={raw} maxLength={120}
      onChange={(e) => { const v = upper ? e.target.value.toUpperCase() : e.target.value; setRaw(v); if (v.trim()) onChange(v); }}
      className={`${width} h-7 rounded-md border px-1.5 text-[13.5px] outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-70 ${EDIT_CELL}`} />
  );
}

// Nombre facultatif : vide = suit le réglage global (affiché en indication).
function OptNumCell({ value, global, onChange, disabled, label }: { value: number | null; global: number; onChange: (v: number | null) => void; disabled?: boolean; label: string }) {
  const { fmt } = useFinance();
  const [raw, setRaw] = useState<string | null>(null);
  useEffect(() => { setRaw(null); }, [value]);
  const shown = value == null ? '' : (fmt.fr ? String(value).replace('.', ',') : String(value));
  return (
    <input type="text" inputMode="decimal" aria-label={label} disabled={disabled} placeholder={fmt.fr ? String(global).replace('.', ',') : String(global)}
      value={raw ?? shown}
      onChange={(e) => { setRaw(e.target.value); if (!e.target.value.trim()) onChange(null); else { const v = fmt.parse(e.target.value); if (v != null) onChange(v); } }}
      onBlur={() => setRaw(null)}
      className={`h-7 w-[56px] rounded-md border px-1.5 text-right text-[13.5px] tabular-nums outline-none placeholder:text-[#9A3F12]/50 focus:ring-2 focus:ring-primary/40 disabled:opacity-70 dark:placeholder:text-[#FFBE9B]/40 ${EDIT_CELL}`} />
  );
}

const SEL_BTN = `h-7 rounded-md border px-1.5 text-left text-[13.5px] ${EDIT_CELL}`;

export default function Payroll() {
  const { t } = useTranslation();
  const F = useFinance();
  const { payrollCalc: P, globals, canEditPayroll: can, fmt, roster, payload } = F;
  const months = fmt.months(27);
  const money = (v: number) => fmt.fmt(v, '$');
  // Surlignage bref de la ligne atteinte par un lien (déclaré avant tout retour anticipé).
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => { if (!flash) return; const h = setTimeout(() => setFlash(null), 1600); return () => clearTimeout(h); }, [flash]);
  if (!P || !roster) return <p className="text-body">{t('finance.payroll.noAccess')}</p>;

  const monthOpts = months.map((m, i) => ({ value: String(i), label: m }));
  const mapOpts = MAPS.map((m) => ({ value: m, label: t(`finance.maps.${m}`) }));
  const mapLabel = (m: string) => t(`finance.maps.${m}`, { defaultValue: m });
  const payCodes = payCodesOf(payload.reference);
  // Départements connus : ceux de l'effectif et ceux que lisent les lignes de paie de l'OPEX. Une
  // personne dans un autre département ne serait comptée nulle part dans le Budget maître.
  const deptOpts = [...new Set([...P.emp.map((e) => e.dept), ...payCodes.filter((x) => x !== 'R&D' && !x.startsWith('con:'))])]
    .sort().map((d) => ({ value: d, label: d }));
  const countFlag = (n: number) => (n === 1 ? null : (
    <span className="ml-1 inline-flex whitespace-nowrap rounded-full bg-[rgba(253,176,34,0.18)] px-1.5 py-0.5 text-[10.5px] font-bold text-[#B54708] dark:text-[#FDB022]"
      title={t(n === 0 ? 'finance.payroll.notCountedTip' : 'finance.payroll.doubleCountedTip')}>
      {t(n === 0 ? 'finance.payroll.notCounted' : 'finance.payroll.doubleCounted')}
    </span>
  ));

  const payTot = P.payTot, conTot = P.conTot;
  const grandAll = sum(payTot) + sum(conTot);
  const cogsShare = sum(P.payByMap['Recurring COGS']) + sum(P.payByMap['Service COGS']) + sum(P.conByMap['Recurring COGS']) + sum(P.conByMap['Service COGS']);

  // Par département : paie de chaque entité|département, contractuels de Cluster rattachés par
  // département (comme le prototype), triés par total décroissant.
  const deptKeys = [...new Set(P.emp.map((e) => `${e.ent}|${e.dept}`))].sort();
  const depts = deptKeys.map((k) => {
    const [ent, dept] = k.split('|');
    const es = P.emp.filter((e) => e.ent === ent && e.dept === dept);
    const cs = ent === 'Cluster' ? P.con.filter((c) => c.dept === dept) : [];
    const p = es.reduce((a, e) => a + sum(e.m), 0), c = cs.reduce((a, x) => a + sum(x.m), 0);
    return { ent, dept, hc: es.length, incl: es.reduce((a, e) => a + e.incl, 0), pay: p, con: c, tot: p + c };
  }).sort((a, b) => b.tot - a.tot);

  // Liens entre le tableau par département et le détail des employés (SH-48) : chaque département
  // mène à son groupe, chaque total de groupe ramène au tableau. Un bref surlignage montre où l'on
  // arrive.
  const slug = (k: string) => k.replace(/[^A-Za-z0-9]+/g, '-');
  const jump = (id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setFlash(id); };
  const flashCls = (id: string) => (flash === id ? '[&>td]:!bg-[#FFF4DB] dark:[&>td]:!bg-[#2A2410]' : '');
  const linkBtn = 'text-left decoration-primary underline-offset-[3px] hover:underline focus-visible:underline hover:text-accent-ink dark:hover:text-accent-ink-dark';

  // Budget de hausse par code de département (comme `deptRaise`, sans distinction d'entité) :
  // coût 2027 de la hausse = la part du mensuel due à la hausse, mois par mois.
  const deptRaise = globals.deptRaise || {};
  const raiseCostOf = (e: (typeof P.emp)[number]) => e.m.reduce((a, v, k) => (k >= e.raiseMoV && v && e.raise > -100 ? a + (v * e.raise) / (100 + e.raise) : a), 0);
  const raiseRows = [...new Set(P.emp.map((e) => e.dept))].sort().map((dept) => {
    const es = P.emp.filter((e) => e.dept === dept);
    return { dept, hc: es.length, pay: es.reduce((a, e) => a + sum(e.m), 0), own: es.filter((e) => e.raisePct != null).length, cost: es.reduce((a, e) => a + raiseCostOf(e), 0) };
  });
  const raiseTotal = raiseRows.reduce((a, r) => a + r.cost, 0);
  const setDeptRaise = (dept: string, v: number | null) => {
    const next = { ...deptRaise };
    if (v == null) delete next[dept]; else next[dept] = Math.max(-100, Math.min(100, v));
    F.setGlobals({ deptRaise: next });
  };

  // Détail des employés groupé par entité | département, dans l'ordre du tableau par département.
  const groups = depts.map((d) => ({ ...d, key: `${d.ent}|${d.dept}`, es: P.emp.filter((e) => e.ent === d.ent && e.dept === d.dept) }));

  const onReset = async () => {
    if (!(await dialog.confirm(t('finance.payroll.resetConfirm'), { danger: true }))) return;
    await F.resetPayroll();
  };
  const addEmployee = () => F.addPerson('employee', { ent: 'Cluster', dept: 'SALES', name: t('finance.payroll.newHire'), salary: 0, alloc: 1, map: 'S&M', startMo: 0 });
  const addContractor = () => F.addPerson('contractor', { co: t('finance.payroll.newContractor'), name: '', svc: '', amt: 0, map: 'R&D', dept: '', startMo: 0 });
  const remove = async (kind: 'employee' | 'contractor', id: number, name: string) => {
    if (!(await dialog.confirm(t('finance.payroll.removeConfirm', { name }), { danger: true }))) return;
    await F.removePerson(kind, id);
  };
  const exportCsv = () => downloadCsv('salary-contractors-FY2027.csv',
    [t('finance.payroll.entity'), t('finance.payroll.dept'), t('finance.payroll.name'), t('finance.payroll.annualSalary'), t('finance.payroll.alloc'), t('finance.payroll.map'), ...months, t('finance.col.total27')],
    [
      ...P.emp.map((e) => [e.ent, e.dept, e.name, e.salary, `${Math.round(e.alloc * 100)}%`, e.map, ...e.m, sum(e.m)]),
      ...P.con.map((c) => [t('finance.payroll.contractor'), c.dept, [c.co, c.name].filter(Boolean).join(' — '), null, null, c.map, ...c.m, sum(c.m)]),
    ], fmt.fr);

  const series = (vals: Series, dollar = false) => vals.map((v, i) => <td key={i} className={tdR}>{dollar ? money(v) : fmt.fmt(v, 's')}</td>);

  return (
    <>
      <PageTitle titleKey="sidebar.financePayroll" />
      <FinanceHeader
        title={t('finance.payroll.title')}
        subtitle={t('finance.payroll.subtitle')}
        actions={
          <>
            <Button size="sm" onClick={exportCsv}>{t('finance.export')}</Button>
            {can && <RosterImportActions />}
            {can && <Button size="sm" variant="ghost" onClick={onReset}>{t('finance.payroll.reset')}</Button>}
          </>
        }
      />
      {/* Réglages globaux : barre en carte pleine largeur sous le titre (convention des barres d'outils). */}
      <div className={`${CARD} mb-4 flex flex-wrap items-end gap-4 px-4 py-3`}>
        <label className="flex flex-col"><span className={LABEL}>{t('finance.payroll.burden')} (%)</span>
          <NumCell value={globals.burden} disabled={!can} width="w-[90px]" label={t('finance.payroll.burden')} onChange={(v) => F.setGlobals({ burden: Math.max(0, Math.min(100, v)) })} />
        </label>
        <label className="flex flex-col"><span className={LABEL}>{t('finance.payroll.raiseAll')} (%)</span>
          <NumCell value={globals.raise} disabled={!can} width="w-[90px]" label={t('finance.payroll.raiseAll')} onChange={(v) => F.setGlobals({ raise: Math.max(-100, Math.min(100, v)) })} />
        </label>
        <div className="flex flex-col"><span className={LABEL}>{t('finance.payroll.raiseMo')}</span>
          <Select value={String(globals.raiseMo)} disabled={!can} onChange={(v) => F.setGlobals({ raiseMo: Number(v) })} options={monthOpts} buttonClassName={`${SEL_BTN} h-7 min-w-[96px]`} />
        </div>
        <p className="m-0 max-w-[520px] text-[12px] text-body dark:text-bodydark2">{t('finance.payroll.formula')}</p>
      </div>

      <KpiRow>
        <Kpi label={t('finance.payroll.headcount')} value={String(P.emp.length)} detail={t('finance.payroll.contractorsCount', { n: P.con.length })} />
        <Kpi label={t('finance.payroll.payroll27')} value={money(sum(payTot))}
          detail={globals.raise ? t('finance.payroll.burdenRaise', { b: fmt.pct(globals.burden), r: fmt.pct(globals.raise), m: months[globals.raiseMo] }) : t('finance.payroll.burdenOnly', { b: fmt.pct(globals.burden) })} />
        <Kpi label={t('finance.payroll.contractors27')} value={money(sum(conTot))} detail={t('finance.payroll.monthly', { v: money(conTot[0]) })} />
        <Kpi label={t('finance.payroll.total27')} value={money(grandAll)} detail={t('finance.payroll.split', { cogs: money(cogsShare), opex: money(grandAll - cogsShare) })} />
      </KpiRow>

      <Card title={t('finance.payroll.summary')} sub={t('finance.payroll.summaryHint')}>
        <div className="overflow-x-auto rounded-xl border border-stroke dark:border-strokedark">
          <table className="w-full border-collapse text-[14px] text-black dark:text-white">
            <thead><tr><th className={th}>{t('finance.payroll.map')}</th><th className={thR}>{t('finance.payroll.baseAnnual')}</th><th className={thR}>{t('finance.payroll.inclAnnual')}</th>{months.map((m) => <th key={m} className={thR}>{m}</th>)}<th className={thR}>{t('finance.col.total27')}</th></tr></thead>
            <tbody>
              <tr className={SEC}><td colSpan={16} className={td}>{t('finance.payroll.payrollSec')}</td></tr>
              {MAPS.map((mp) => {
                const es = P.emp.filter((e) => e.map === mp);
                return <tr key={`p${mp}`}><td className={td}>{mapLabel(mp)}</td><td className={tdR}>{money(es.reduce((a, e) => a + e.salary, 0))}</td><td className={tdR}>{money(es.reduce((a, e) => a + e.incl, 0))}</td>{series(P.payByMap[mp])}<td className={`${tdR} font-bold`}>{money(sum(P.payByMap[mp]))}</td></tr>;
              })}
              <tr className={SUB}><td className={td}>{t('finance.payroll.totalPayroll')}</td><td className={tdR}>{money(P.emp.reduce((a, e) => a + e.salary, 0))}</td><td className={tdR}>{money(P.emp.reduce((a, e) => a + e.incl, 0))}</td>{series(payTot)}<td className={tdR}>{money(sum(payTot))}</td></tr>
              <tr className={SEC}><td colSpan={16} className={td}>{t('finance.payroll.contractorsSec')}</td></tr>
              {MAPS.map((mp) => <tr key={`c${mp}`}><td className={td}>{mapLabel(mp)}</td><td className={td} /><td className={td} />{series(P.conByMap[mp])}<td className={`${tdR} font-bold`}>{money(sum(P.conByMap[mp]))}</td></tr>)}
              <tr className={SUB}><td className={td}>{t('finance.payroll.totalContractors')}</td><td className={td} /><td className={td} />{series(conTot)}<td className={tdR}>{money(sum(conTot))}</td></tr>
              <tr className={GRAND}><td className={td}>{t('finance.payroll.totalAll')}</td><td className={td} /><td className={td} />{series(payTot.map((v, i) => v + conTot[i]))}<td className={tdR}>{money(grandAll)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-body dark:text-bodydark2">{t('finance.payroll.gaContractorNote')}</p>
      </Card>

      <Card title={t('finance.payroll.byDept')} sub={t('finance.payroll.byDeptHint')}>
        <div className="overflow-x-auto rounded-xl border border-stroke dark:border-strokedark">
          <table className="w-full border-collapse text-[14px] text-black dark:text-white">
            <thead><tr>{['entity', 'dept', 'headcount', 'inclAnnual', 'payroll27', 'contractors27', 'total27', 'share'].map((k, i) => <th key={k} className={i > 1 ? thR : th}>{t(`finance.payroll.${k}`)}</th>)}</tr></thead>
            <tbody>
              {depts.map((d) => (
                <tr key={`${d.ent}|${d.dept}`} id={`pay-sum-${slug(`${d.ent}|${d.dept}`)}`} className={flashCls(`pay-sum-${slug(`${d.ent}|${d.dept}`)}`)}><td className={td}>{d.ent}</td>
                  <td className={td}><button type="button" onClick={() => jump(`pay-grp-${slug(`${d.ent}|${d.dept}`)}`)} title={t('finance.payroll.toDetail', { dept: d.dept })} className={linkBtn}>{d.dept}</button></td><td className={tdR}>{d.hc}</td><td className={tdR}>{money(d.incl)}</td><td className={tdR}>{money(d.pay)}</td><td className={tdR}>{d.con ? money(d.con) : '–'}</td><td className={`${tdR} font-bold`}>{money(d.tot)}</td><td className={tdR}>{grandAll ? fmt.pct((d.tot / grandAll) * 100) : '—'}</td></tr>
              ))}
              <tr className={GRAND}><td className={td}>{t('finance.col.total')}</td><td className={td} /><td className={tdR}>{P.emp.length}</td><td className={tdR}>{money(P.emp.reduce((a, e) => a + e.incl, 0))}</td><td className={tdR}>{money(sum(payTot))}</td><td className={tdR}>{money(sum(conTot))}</td><td className={tdR}>{money(grandAll)}</td><td className={tdR}>100 %</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('finance.payroll.raiseBudget')} sub={t('finance.payroll.raiseBudgetHint')}>
        <div className="overflow-x-auto rounded-xl border border-stroke dark:border-strokedark">
          <table className="w-full border-collapse text-[14px] text-black dark:text-white">
            <thead><tr>
              <th className={th}>{t('finance.payroll.dept')}</th><th className={thR}>{t('finance.payroll.headcount')}</th>
              <th className={thR}>{t('finance.payroll.payroll27')}</th><th className={th}>{t('finance.payroll.raiseDeptPct')}</th>
              <th className={th}>{t('finance.payroll.raiseMo')}</th><th className={thR}>{t('finance.payroll.raiseCost')}</th><th className={thR}>{t('finance.payroll.raiseShare')}</th>
            </tr></thead>
            <tbody>
              {raiseRows.map((r) => (
                <tr key={r.dept}>
                  <td className={td}>{r.dept}{r.own > 0 && <span className="ml-2 text-[11.5px] text-body dark:text-bodydark2">{t('finance.payroll.ownRaise', { count: r.own })}</span>}</td>
                  <td className={tdR}>{r.hc}</td>
                  <td className={tdR}>{money(r.pay)}</td>
                  <td className={td}><OptNumCell value={deptRaise[r.dept] ?? null} global={globals.raise} disabled={!can} label={`${r.dept} — ${t('finance.payroll.raiseDeptPct')}`} onChange={(v) => setDeptRaise(r.dept, v)} /></td>
                  <td className={td}>{months[globals.raiseMo]}</td>
                  <td className={`${tdR} font-bold`}>{money(r.cost)}</td>
                  <td className={tdR}>{r.pay ? fmt.pct((r.cost / r.pay) * 100) : '—'}</td>
                </tr>
              ))}
              <tr className={GRAND}><td className={td}>{t('finance.payroll.totalRaise')}</td><td className={tdR}>{P.emp.length}</td><td className={tdR}>{money(sum(payTot))}</td><td className={td}>{fmt.pct(globals.raise)}</td><td className={td}>{months[globals.raiseMo]}</td><td className={tdR}>{money(raiseTotal)}</td><td className={tdR}>{sum(payTot) ? fmt.pct((raiseTotal / sum(payTot)) * 100) : '—'}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('finance.payroll.empDetail')} sub={t('finance.payroll.empHint')} actions={can ? <Button size="sm" onClick={addEmployee}>{t('finance.payroll.addEmployee')}</Button> : undefined}>
        <div className="overflow-x-auto rounded-xl border border-stroke dark:border-strokedark">
          <table className="w-full border-collapse text-[14px] text-black dark:text-white">
            <thead><tr>
              {can && <th className={th}><span className="sr-only">{t('finance.remove')}</span></th>}
              {['entity', 'dept', 'name', 'annualSalary', 'alloc', 'map', 'inclAnnual', 'raise', 'raiseMoShort', 'burdenShort', 'startMo', 'endMo'].map((k) => <th key={k} className={th}>{t(`finance.payroll.${k}`)}</th>)}
              <th className={thR}>{months[0]}</th><th className={thR}>{months[11]}</th><th className={thR}>{t('finance.col.total27')}</th>
            </tr></thead>
            <tbody>
              {groups.map((g) => {
                const gid = `pay-grp-${slug(g.key)}`;
                const cols = 15 + (can ? 1 : 0);
                return (
                  <Fragment key={g.key}>
                    <tr id={gid} className={`${SEC} ${flashCls(gid)}`}>
                      <td colSpan={cols} className="border-b border-stroke bg-[#F3F6FA] px-2 pb-1.5 pt-3 dark:border-strokedark dark:bg-[#161A20]">
                        {g.dept} · {g.ent} · {t('finance.payroll.employees', { count: g.hc })}
                      </td>
                    </tr>
              {g.es.map((e) => {
                const patch = (p: Partial<Employee>) => F.patchPerson('employee', e.id, p);
                return (
                  <tr key={e.id}>
                    {can && <td className={td}><button type="button" onClick={() => remove('employee', e.id, e.name)} aria-label={t('finance.payroll.removeLabel', { name: e.name })} title={t('finance.payroll.removeLabel', { name: e.name })} className="rounded px-1.5 text-body hover:bg-gray-2 hover:text-[#B42318] dark:hover:bg-meta-4">✕</button></td>}
                    <td className={td}><Select value={e.ent} disabled={!can} onChange={(v) => patch({ ent: v })} options={ENTITIES.map((x) => ({ value: x, label: x }))} buttonClassName={`${SEL_BTN} min-w-[84px]`} /></td>
                    <td className={td}><Select value={e.dept} disabled={!can} onChange={(v) => patch({ dept: v })} options={deptOpts} buttonClassName={`${SEL_BTN} min-w-[150px]`} /></td>
                    <td className={td}><TextCell value={e.name} width="w-[170px]" disabled={!can} label={t('finance.payroll.name')} onChange={(v) => patch({ name: v.trim() })} /></td>
                    <td className={td}><NumCell value={e.salary} width="w-[90px]" decimals={0} disabled={!can} label={`${e.name} — ${t('finance.payroll.annualSalary')}`} onChange={(v) => patch({ salary: Math.max(0, v) })} /></td>
                    <td className={td}><NumCell value={Math.round(e.alloc * 1000) / 10} width="w-[56px]" decimals={1} disabled={!can} label={`${e.name} — ${t('finance.payroll.alloc')}`} onChange={(v) => patch({ alloc: Math.max(0, Math.min(100, v)) / 100 })} /></td>
                    <td className={td}><span className="inline-flex items-center"><Select value={e.map} disabled={!can} onChange={(v) => patch({ map: v as PnlMap })} options={mapOpts} buttonClassName={`${SEL_BTN} min-w-[120px]`} />{countFlag(masterCount(payCodes, e, false))}</span></td>
                    <td className={tdR}>{money(e.incl)}</td>
                    <td className={td}><OptNumCell value={e.raisePct} global={deptRaise[e.dept] ?? globals.raise} disabled={!can} label={`${e.name} — ${t('finance.payroll.raise')}`} onChange={(v) => patch({ raisePct: v })} /></td>
                    <td className={td}><Select value={e.raiseMo == null ? '' : String(e.raiseMo)} disabled={!can} onChange={(v) => patch({ raiseMo: v === '' ? null : Number(v) })} options={[{ value: '', label: t('finance.payroll.followGlobal') }, ...monthOpts]} buttonClassName={`${SEL_BTN} min-w-[96px]`} /></td>
                    <td className={td}><OptNumCell value={e.burdenPct} global={globals.burden} disabled={!can} label={`${e.name} — ${t('finance.payroll.burden')}`} onChange={(v) => patch({ burdenPct: v })} /></td>
                    <td className={td}><Select value={String(e.startMo)} disabled={!can} onChange={(v) => patch({ startMo: Number(v) })} options={monthOpts.filter((o) => e.endMo == null || Number(o.value) <= e.endMo)} buttonClassName={`${SEL_BTN} min-w-[84px]`} /></td>
                    <td className={td}><Select value={e.endMo == null ? '' : String(e.endMo)} disabled={!can} onChange={(v) => patch({ endMo: v === '' ? null : Number(v) })} options={[{ value: '', label: '—' }, ...monthOpts.filter((o) => Number(o.value) >= e.startMo)]} buttonClassName={`${SEL_BTN} min-w-[84px]`} /></td>
                    <td className={tdR}>{money(e.m[0])}</td><td className={tdR}>{money(e.m[11])}</td><td className={`${tdR} font-bold`}>{money(sum(e.m))}</td>
                  </tr>
                );
              })}
                    <tr className={SUB}>
                      {can && <td className={td} />}
                      <td className={td} colSpan={6}>
                        <button type="button" onClick={() => jump(`pay-sum-${slug(g.key)}`)} title={t('finance.payroll.toSummary')} className={linkBtn}>{t('finance.payroll.deptTotal', { dept: g.dept })}</button>
                      </td>
                      <td className={tdR}>{money(g.incl)}</td>
                      <td className={td} colSpan={5} />
                      <td className={tdR}>{money(g.es.reduce((a, e) => a + e.m[0], 0))}</td>
                      <td className={tdR}>{money(g.es.reduce((a, e) => a + e.m[11], 0))}</td>
                      <td className={tdR}>{money(g.pay)}</td>
                    </tr>
                  </Fragment>
                );
              })}
              <tr className={GRAND}>
                {can && <td className={td} />}
                <td className={td} colSpan={6}>{t('finance.payroll.totalPayroll')}</td>
                <td className={tdR}>{money(P.emp.reduce((a, e) => a + e.incl, 0))}</td>
                <td className={td} colSpan={5} />
                <td className={tdR}>{money(payTot[0])}</td><td className={tdR}>{money(payTot[11])}</td><td className={tdR}>{money(sum(payTot))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('finance.payroll.conDetail')} sub={t('finance.payroll.conHint')} actions={can ? <Button size="sm" onClick={addContractor}>{t('finance.payroll.addContractor')}</Button> : undefined}>
        <div className="overflow-x-auto rounded-xl border border-stroke dark:border-strokedark">
          <table className="w-full border-collapse text-[14px] text-black dark:text-white">
            <thead><tr>
              {['company', 'name', 'service', 'dept'].map((k) => <th key={k} className={th}>{t(`finance.payroll.${k}`)}</th>)}
              <th className={thR}>{t('finance.payroll.rate')}</th><th className={thR}>{t('finance.payroll.hours')}</th>
              {['monthlyCol', 'map', 'startMo', 'endMo'].map((k) => <th key={k} className={th}>{t(`finance.payroll.${k}`)}</th>)}
              <th className={thR}>{t('finance.col.total27')}</th>
              {can && <th className={th}><span className="sr-only">{t('finance.remove')}</span></th>}
            </tr></thead>
            <tbody>
              {P.con.map((c) => {
                const patch = (p: Partial<Contractor>) => F.patchPerson('contractor', c.id, p);
                const who = [c.co, c.name].filter(Boolean).join(' — ') || '—';
                return (
                  <tr key={c.id}>
                    <td className={td}><TextCell value={c.co} width="w-[150px]" disabled={!can} label={t('finance.payroll.company')} onChange={(v) => patch({ co: v.trim() })} /></td>
                    <td className={td}><TextCell value={c.name} width="w-[140px]" disabled={!can} label={t('finance.payroll.name')} onChange={(v) => patch({ name: v.trim() })} /></td>
                    <td className={td}><TextCell value={c.svc} width="w-[170px]" disabled={!can} label={t('finance.payroll.service')} onChange={(v) => patch({ svc: v.trim() })} /></td>
                    <td className={td}><TextCell value={c.dept} upper width="w-[120px]" disabled={!can} label={t('finance.payroll.dept')} onChange={(v) => patch({ dept: v.trim() })} /></td>
                    <td className={tdR}>{c.rate ? fmt.fmt(c.rate, '$2') : '–'}</td>
                    <td className={tdR}>{c.hours ? fmt.fmt(c.hours, 'n') : '–'}</td>
                    <td className={td}><NumCell value={c.amt} width="w-[90px]" decimals={2} disabled={!can} label={`${who} — ${t('finance.payroll.monthlyCol')}`} onChange={(v) => patch({ amt: Math.max(0, v) })} /></td>
                    <td className={td}><span className="inline-flex items-center"><Select value={c.map} disabled={!can} onChange={(v) => patch({ map: v as PnlMap })} options={mapOpts} buttonClassName={`${SEL_BTN} min-w-[120px]`} />{countFlag(masterCount(payCodes, c, true))}</span></td>
                    <td className={td}><Select value={String(c.startMo)} disabled={!can} onChange={(v) => patch({ startMo: Number(v) })} options={monthOpts.filter((o) => c.endMo == null || Number(o.value) <= c.endMo)} buttonClassName={`${SEL_BTN} min-w-[84px]`} /></td>
                    <td className={td}><Select value={c.endMo == null ? '' : String(c.endMo)} disabled={!can} onChange={(v) => patch({ endMo: v === '' ? null : Number(v) })} options={[{ value: '', label: '—' }, ...monthOpts.filter((o) => Number(o.value) >= c.startMo)]} buttonClassName={`${SEL_BTN} min-w-[84px]`} /></td>
                    <td className={`${tdR} font-bold`}>{money(sum(c.m))}</td>
                    {can && <td className={td}><button type="button" onClick={() => remove('contractor', c.id, who)} aria-label={t('finance.payroll.removeLabel', { name: who })} className="rounded px-1.5 text-body hover:bg-gray-2 hover:text-[#B42318] dark:hover:bg-meta-4">✕</button></td>}
                  </tr>
                );
              })}
              <tr className={GRAND}><td className={td}>{t('finance.payroll.totalContractors')}</td><td className={td} /><td className={td} /><td className={td} /><td className={td} /><td className={td} /><td className={tdR}>{money(conTot[0])}</td><td className={td} /><td className={td} /><td className={td} /><td className={tdR}>{money(sum(conTot))}</td>{can && <td className={td} />}</tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
