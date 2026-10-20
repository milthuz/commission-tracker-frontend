// Module Finance, lot A — Budget Cluster / Budget Xperio : P&L autonome Sep 2026 → Dec 2027 tiré du
// classeur de la CFO. Chaque ligne se déplie en ses drivers GL ; les cellules jaunes (drivers
// « Run-rate » et « Monthly growth ») se modifient, tout se recalcule à chaque frappe
// (entityModel.ts) et s'enregistre après une courte pause (concurrence optimiste). Approuvé =
// VERROUILLÉ : le serveur refuse toute écriture, les cellules sont grisées.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineError, PageHeader, StateCard, StatusPill, dialog, toast } from '../../../components/ui';
import { CARD } from '../../../components/ui/surface';
import { ContentLoader } from '../../../common/Loader';
import PageTitle from '../../../components/PageTitle';
import { Card, EDIT_CELL, Kpi, KpiRow } from '../components';
import { downloadCsv, makeFormat } from '../format';
import { entityApi, errCode, loadErrCode, type EntityKey, type EntityPayload, type EntityPreview, type Totals } from './api';
import {
  LINE_NAMES, OV_MAX, OV_MIN, buildRows, cellsOf, computeEntity, driversFor, makeBudgetFormat, scheduleIds, tiles,
  type BudgetRow, type EntityDriver, type Overrides,
} from './entityModel';
import { BudgetGrid, ColSeg, DiffTable, ImportModal, MessageList, NS, Notice, useColMode, useColumns, type GridRow } from './shared';

const SAVE_DELAY = 700;
type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

// Noms des lignes du P&L (données du classeur) → clés de traduction.
const PL_KEY: Record<string, string> = {
  'Recurring Revenue': 'recurringRevenue', 'Hardware Revenue': 'hardwareRevenue', 'Service Revenue': 'serviceRevenue',
  'Licence & Other Revenue': 'licenceRevenue', 'Total Revenue': 'totalRevenue', 'Recurring COGS': 'recurringCogs',
  'Hardware COGS': 'hardwareCogs', 'Service COGS': 'serviceCogs', 'Licence COGS': 'licenceCogs', 'Total COGS': 'totalCogs',
  'GROSS PROFIT': 'grossProfit', 'Gross Margin': 'grossMargin', 'Sales & Marketing': 'salesMarketing',
  'Research & Development': 'researchDevelopment', 'General & Administrative': 'generalAdmin', 'Total OPEX': 'totalOpex',
  EBITDA: 'ebitda', 'Non-operating Income': 'nonOpIncome', 'Non-operating Expense': 'nonOpExpense', 'NET INCOME / (LOSS)': 'netIncome',
};
const TYPE_KEY: Record<string, string> = {
  'Run-rate': 'runRate', 'Monthly growth': 'monthlyGrowth', 'Payroll allocation': 'payrollAllocation', 'Contractor schedule': 'contractorSchedule',
  'Revenue-linked': 'revenueLinked', 'One-time / zero': 'oneTime', 'Manual / event': 'manualEvent',
};

export default function EntityBudget({ entity }: { entity: EntityKey }) {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<EntityPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const p = await entityApi.load(entity); setError(null); setPayload(p); return p; }
    catch (e) { setError(loadErrCode(e)); return null; }
  }, [entity]);
  useEffect(() => { setPayload(null); load(); }, [load]);

  const titleKey = `${NS}.nav.${entity}`;
  if (error === 'forbidden' || error === 'demo') return <><PageTitle titleKey={titleKey} /><StateCard kind="empty" title={t(`${NS}.errors.${error}`)} /></>;
  if (error && !payload) return <><PageTitle titleKey={titleKey} /><InlineError title={t(`${NS}.errors.load`)} detail={error} onRetry={load} retryLabel={t(`${NS}.retry`)} /></>;
  if (!payload) return <ContentLoader label={t(`${NS}.loading`)} />;
  if (payload.empty) return <><PageTitle titleKey={titleKey} /><EmptyEntity entity={entity} canImport={payload.caps.canImport} onApplied={(p) => setPayload(p)} /></>;
  return <><PageTitle titleKey={titleKey} /><EntityPage key={payload.budget.id} entity={entity} initial={payload} reload={load} /></>;
}

function EmptyEntity({ entity, canImport, onApplied }: { entity: EntityKey; canImport: boolean; onApplied: (p: EntityPayload) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ent = entity === 'cluster' ? 'Cluster' : 'Xperio';
  return (
    <>
      <PageHeader section={`${t('sidebar.sections.finance')} · FY2027 · ${ent}`} title={t(`${NS}.entity.title`, { ent })} />
      <StateCard kind="empty" title={t(`${NS}.empty.title`)} body={t(canImport ? `${NS}.empty.bodyImport` : `${NS}.empty.body`)} />
      {canImport && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}>{t(`${NS}.import.button`)}</Button>
          <Button size="sm" onClick={() => entityApi.template(entity).catch(() => toast.success(t(`${NS}.import.templateFailed`)))}>{t(`${NS}.import.template`)}</Button>
        </div>
      )}
      <EntityImport entity={entity} open={open} onClose={() => setOpen(false)} onApplied={(p) => { setOpen(false); onApplied(p); }} />
    </>
  );
}

function EntityPage({ entity, initial, reload }: { entity: EntityKey; initial: EntityPayload; reload: () => Promise<EntityPayload | null> }) {
  const { t, i18n } = useTranslation();
  const F = useMemo(() => makeBudgetFormat(i18n.language), [i18n.language]);
  const fmt = useMemo(() => makeFormat(i18n.language), [i18n.language]);
  const [payload, setPayload] = useState(initial);
  const [ov, setOvState] = useState<Overrides>(() => ({ ...(initial.state.drivers?.data?.ov || {}) }));
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [mode, setMode] = useColMode();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [all, setAll] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const cols = useColumns(mode);

  const ref = payload.reference;
  const ent = ref.entity;
  const locked = payload.budget.status === 'approved';
  const canEdit = payload.caps.canEdit && !locked;

  // ---------------------------------------------------------------- enregistrement
  const version = useRef(initial.state.drivers?.version || 0);
  const pending = useRef<Overrides | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);

  const apply = useCallback((p: EntityPayload) => {
    setPayload(p);
    setOvState({ ...(p.state.drivers?.data?.ov || {}) });
    setRaw({});
    version.current = p.state.drivers?.version || 0;
    pending.current = null;
  }, []);
  const refresh = useCallback(async () => { const p = await reload(); if (p && !p.empty) apply(p); }, [reload, apply]);

  const flush = useCallback(async () => {
    if (inFlight.current || !pending.current) return;
    const data = pending.current;
    pending.current = null;
    inFlight.current = true;
    setSaveStatus('saving');
    try {
      const r = await entityApi.saveDrivers(payload.budget.id, data, version.current);
      version.current = r.version;
      setSaveStatus(pending.current ? 'pending' : 'saved');
      setSaveError(null);
    } catch (e) {
      const code = errCode(e);
      if (code === 'locked' || code === 'conflict') {
        setNotice(t(`${NS}.notice.${code === 'locked' ? 'lockedMeanwhile' : 'conflict'}`));
        await refresh();
        setSaveStatus('idle');
      } else { setSaveStatus('error'); setSaveError(code); }
    } finally {
      inFlight.current = false;
      if (pending.current) timer.current = window.setTimeout(flush, SAVE_DELAY);
    }
  }, [payload.budget.id, refresh, t]);
  const queue = useCallback((next: Overrides) => {
    pending.current = next;
    setSaveStatus('pending');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY);
  }, [flush]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); flush(); }, [flush]);
  useEffect(() => {
    const warn = (ev: BeforeUnloadEvent) => { if (pending.current || inFlight.current) { ev.preventDefault(); ev.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // Saisie : on garde le texte tapé ; vide = retour à la valeur du classeur ; illisible ou hors
  // plage = rien n'est enregistré (cellule marquée invalide).
  const onInput = useCallback((d: EntityDriver, text: string) => {
    if (!canEdit) return;
    setRaw((r) => ({ ...r, [d.id]: text }));
    const s = text.trim();
    const v = s === '' ? null : fmt.parse(s);
    if (s !== '' && (v == null || v < OV_MIN || v > OV_MAX)) return;
    setOvState((cur) => {
      const next = { ...cur };
      if (v == null) delete next[d.id]; else next[d.id] = v;
      queue(next);
      return next;
    });
  }, [canEdit, fmt, queue]);

  const resetDrivers = async () => {
    if (!canEdit) return;
    if (!(await dialog.confirm(t(`${NS}.reset.confirm`, { ent }), { details: [t(`${NS}.reset.detail`)] }))) return;
    setOvState({}); setRaw({}); queue({});
  };

  const approve = async () => {
    if (!(await dialog.confirm(t(`${NS}.approve.confirm`, { ent }), { details: [t(`${NS}.approve.detail`)] }))) return;
    try {
      if (timer.current) window.clearTimeout(timer.current);
      await flush();
      const r = await entityApi.approve(payload.budget.id);
      setPayload((p) => ({ ...p, budget: { ...p.budget, ...r.budget } }));
      toast.success(t(`${NS}.approve.done`, { ent }));
    } catch (e) { setNotice(t(`${NS}.errors.generic`, { code: errCode(e) })); }
  };
  const unlock = async () => {
    if (!(await dialog.confirm(t(`${NS}.approve.unlockConfirm`, { ent })))) return;
    try {
      const r = await entityApi.unlock(payload.budget.id);
      setPayload((p) => ({ ...p, budget: { ...p.budget, ...r.budget } }));
      toast.success(t(`${NS}.approve.unlocked`, { ent }));
    } catch (e) { setNotice(t(`${NS}.errors.generic`, { code: errCode(e) })); }
  };

  // ---------------------------------------------------------------- calcul
  const schedules = useMemo(() => scheduleIds(ref), [ref]);
  const res = useMemo(() => computeEntity(ref, ov, schedules), [ref, ov, schedules]);
  const rows = useMemo(() => buildRows(ref, res, ov), [ref, res, ov]);
  const T = tiles(res);
  const isOpen = (line: string) => all || !!open[line];
  const toggle = (line: string) => () => {
    // Quitter « tout déplier » en repliant UNE ligne garde les autres ouvertes (le prototype les
    // repliait toutes).
    if (all) { setAll(false); setOpen(Object.fromEntries(LINE_NAMES.map((l) => [l, l !== line]))); return; }
    setOpen((o) => ({ ...o, [line]: !o[line] }));
  };
  const plName = (n: string) => (PL_KEY[n] ? t(`${NS}.pl.${PL_KEY[n]}`, { defaultValue: n }) : n);
  const cellText = (row: BudgetRow) => cellsOf(row, mode, res).map((v) => ({ text: row.kind === 'gm' ? F.pct(v) : F.money(v), value: v }));

  const grid: GridRow[] = rows.filter((r) => !r.line || isOpen(r.line)).map((r) => {
    if (r.kind === 'sec') return { id: r.id, kind: 'sec', label: t(`${NS}.sec.${r.name}`), cells: [] };
    if (r.kind === 'grp') return { id: r.id, kind: 'grp', label: r.name, cells: [] };
    if (r.kind === 'line') {
      return { id: r.id, kind: 'line', label: plName(r.name), cells: cellText(r),
        expand: { open: isOpen(r.name), toggle: toggle(r.name), hint: t(`${NS}.glDrivers`, { count: r.count || 0 }) } };
    }
    if (r.kind !== 'gl') return { id: r.id, kind: r.kind, label: plName(r.name), cells: cellText(r) };
    const d = r.driver!;
    return {
      id: r.id, kind: r.sub ? 'glsub' : 'gl', label: r.name, cells: cellText(r), changed: r.changed, title: d.note || d.basis || undefined,
      extra: (
        <>
          {!r.sub && d.type && <TypePill type={d.type} />}
          {r.schedule && <span title={t(`${NS}.schedule.hint`)} className="rounded-full border border-[#B54708]/40 px-1.5 text-[10.5px] font-bold text-[#B54708] dark:border-[#FDB022]/40 dark:text-[#FDB022]">{t(`${NS}.schedule.pill`)}</span>}
          {r.editable && (
            <span className="inline-flex items-center gap-1">
              <DriverInput d={d} value={raw[d.id] ?? (ov[d.id] != null ? F.input(ov[d.id]) : F.input(d.input * 100))} disabled={!canEdit} onChange={(v) => onInput(d, v)} />
              <span className="text-[11px] text-body dark:text-bodydark2">
                {`% ${d.type === 'Run-rate' ? t(`${NS}.hint.input`) : t(`${NS}.hint.perMonth`)}${d.esc ? ` · ${t(`${NS}.hint.esc`, { pct: F.int(d.esc * 100) })}` : ''}`}
              </span>
            </span>
          )}
        </>
      ),
    };
  });

  // Lignes dont la somme des drivers diffère de la ligne du classeur : la ligne fait foi.
  const gaps = useMemo(() => LINE_NAMES.map((l) => {
    const r = ref.pl.find((x) => x.name === l);
    if (!r) return null;
    const line = r.v.slice(2, 18).reduce<number>((a, b) => a + (b || 0), 0);
    const drv = driversFor(ref, l).reduce((a, d) => a + d.m.reduce((x, y) => x + y, 0), 0);
    return Math.abs(line - drv) > 0.5 ? { line: l, gap: line - drv } : null;
  }).filter(Boolean) as { line: string; gap: number }[], [ref]);

  const exportCsv = () => {
    const out = rows.filter((r) => r.kind !== 'sec' && r.kind !== 'grp').map((r) => {
      const c = cellsOf(r, mode, res).map((v) => (v == null ? null : r.kind === 'gm' ? Math.round(v * 1000) / 10 : v));
      const label = r.kind === 'gl' ? `    ${r.name}` : plName(r.name);
      return [label, ...c];
    });
    downloadCsv(`${entity}-budget-${mode === 'sum' ? 'summary' : '18-months'}.csv`, ['CAD', ...cols.map((c) => c.label)], out, F.fr);
  };

  const b = payload.budget;
  const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(F.loc, { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
  const saveText = saveStatus === 'idle' ? null : saveStatus === 'error' ? t(`${NS}.save.error`, { code: saveError }) : t(`${NS}.save.${saveStatus}`);
  const tileLabel = (k: string, margin?: number) => (k === 'grossProfit' ? `${t(`${NS}.tiles.grossProfit`)} · ${F.pct(margin)}` : t(`${NS}.tiles.${k}`));

  return (
    <>
      <PageHeader
        section={`${t('sidebar.sections.finance')} · FY${ref.fiscalYear} · ${ent}`}
        title={t(`${NS}.entity.title`, { ent })}
        subtitle={t(`${NS}.entity.subtitle`)}
        actions={
          <>
            {saveText && <span aria-live="polite" className={`text-[12px] ${saveStatus === 'error' ? 'font-bold text-[#B42318] dark:text-[#F46060]' : 'text-body dark:text-bodydark2'}`}>{saveText}</span>}
            <StatusPill family={locked ? 'ok' : 'neutral'}>{t(`${NS}.status.${locked ? 'approved' : 'draft'}`)}</StatusPill>
            {payload.caps.canApprove && (locked
              ? <Button size="sm" onClick={unlock}>{t(`${NS}.approve.unlock`)}</Button>
              : <Button size="sm" variant="primary" onClick={approve}>{t(`${NS}.approve.approve`)}</Button>)}
          </>
        }
      />
      <div className={`${CARD} mb-4 flex flex-wrap items-center gap-2 px-3 py-2.5`}>
        <ColSeg mode={mode} onChange={setMode} />
        <Button size="sm" onClick={() => { setAll((a) => !a); setOpen({}); }}>{all ? t(`${NS}.collapseAll`) : t(`${NS}.expandAll`)}</Button>
        {canEdit && (
          <Button size="sm" disabled={!res.overrideCount} onClick={resetDrivers}>
            {t(`${NS}.reset.button`)}{res.overrideCount ? ` (${res.overrideCount})` : ''}
          </Button>
        )}
        <Button size="sm" onClick={exportCsv}>{t(`${NS}.export`)}</Button>
        {payload.caps.canImport && !locked && <Button size="sm" onClick={() => setImporting(true)}>{t(`${NS}.import.button`)}</Button>}
        <Button size="sm" onClick={() => entityApi.template(entity).catch((e) => setNotice(t(`${NS}.errors.generic`, { code: errCode(e) })))}>{t(`${NS}.import.template`)}</Button>
      </div>
      {locked && <Notice tone="ok">{t(`${NS}.locked`, { ent, who: b.approvedBy || '—', when: when(b.approvedAt) })}</Notice>}
      {notice && <Notice>{notice}</Notice>}

      <KpiRow>
        {T.map((x) => (
          <Kpi key={x.key} label={tileLabel(x.key, (x as { margin?: number }).margin)} value={F.money(x.t16)} tone={x.t16 < 0 ? 'dn' : undefined}
            detail={t(`${NS}.tiles.detail`, { sd: F.money(x.sd), fy: F.money(x.fy) })} />
        ))}
      </KpiRow>

      <Card title={t(`${NS}.entity.tableTitle`, { ent })} sub={t(`${NS}.entity.tableHint`)}>
        <BudgetGrid cols={cols} rows={grid} labelHead="CAD" monthMode={mode === 'm'} />
        <div className="mt-2 space-y-1 text-[12px] text-body dark:text-bodydark2">
          <p className="m-0 flex items-center gap-2"><span aria-hidden className={`inline-block h-3 w-5 rounded border ${EDIT_CELL}`} />{t(`${NS}.legend.editable`)}</p>
          {schedules.size > 0 && <p className="m-0">{t(`${NS}.schedule.legend`)}</p>}
          {gaps.length > 0 && (
            <p className="m-0">{t(`${NS}.gaps`, { list: gaps.map((g) => `${plName(g.line)} ${F.money(g.gap)}`).join(' · ') })}</p>
          )}
          <p className="m-0">{t(ref.source.kind === 'xlsx' ? `${NS}.source.xlsx` : `${NS}.source.handoff`, { file: ref.source.file || '—', when: when(b.importedAt), who: b.importedBy || '—' })}</p>
        </div>
      </Card>

      <EntityImport entity={entity} open={importing} onClose={() => setImporting(false)}
        onApplied={(p) => {
          setImporting(false);
          apply(p);
          const dropped = p.applied?.dropped?.length || 0;
          toast.success(dropped ? t(`${NS}.import.doneDropped`, { count: dropped }) : t(`${NS}.import.done`));
        }} />
    </>
  );
}

function TypePill({ type }: { type: string }) {
  const { t } = useTranslation();
  return (
    <span className="whitespace-nowrap rounded-full bg-[#EEF4FF] px-1.5 py-px text-[10.5px] font-bold text-[#3538CD] dark:bg-[#1D2140] dark:text-[#A4BCFD]">
      {TYPE_KEY[type] ? t(`${NS}.types.${TYPE_KEY[type]}`, { defaultValue: type }) : type}
    </span>
  );
}

function DriverInput({ d, value, disabled, onChange }: { d: EntityDriver; value: string; disabled: boolean; onChange: (v: string) => void }) {
  const { t, i18n } = useTranslation();
  const fmt = makeFormat(i18n.language);
  const s = value.trim();
  const v = s === '' ? 0 : fmt.parse(s);
  const bad = v == null || v < OV_MIN || v > OV_MAX;
  return (
    <input type="text" inputMode="decimal" value={value} disabled={disabled} aria-invalid={bad || undefined}
      aria-label={t(`${NS}.inputLabel`, { gl: d.gl })}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => { const el = e.target; requestAnimationFrame(() => el.select()); }}
      className={`h-[22px] w-[58px] rounded-md border px-1.5 text-right text-[12px] tabular-nums outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-70 ${EDIT_CELL} ${bad ? '!border-[#F04438] ring-1 ring-[#F04438]' : ''}`} />
  );
}

function EntityImport({ entity, open, onClose, onApplied }: { entity: EntityKey; open: boolean; onClose: () => void; onApplied: (p: EntityPayload) => void }) {
  const { t, i18n } = useTranslation();
  const F = makeBudgetFormat(i18n.language);
  const ent = entity === 'cluster' ? 'Cluster' : 'Xperio';
  const METRICS: (keyof Totals)[] = ['revenue', 'cogs', 'grossProfit', 'opex', 'ebitda', 'netIncome'];
  const render = (p: EntityPreview) => {
    const before = p.totals.before?.fy, after = p.totals.after.fy;
    const failing = (p.checks || []).filter((c) => c.status.toUpperCase() !== 'PASS').length;
    return (
      <div className="space-y-3">
        <p className="m-0 font-bold">{t(p.exists ? `${NS}.import.willReplace` : `${NS}.import.willCreate`, { ent, file: p.file || '—' })}</p>
        <DiffTable head={[t(`${NS}.import.metric`), t(`${NS}.import.fyBefore`), t(`${NS}.import.fyAfter`), t(`${NS}.import.delta`)]}
          rows={METRICS.map((m) => [t(`${NS}.import.metrics.${m}`), before ? F.money(before[m]) : '—', F.money(after[m]), before ? F.money(after[m] - before[m]) : '—'])} />
        {p.exists && (p.lines.length
          ? <DiffTable head={[t(`${NS}.import.lineChanged`), t(`${NS}.import.fyBefore`), t(`${NS}.import.fyAfter`)]}
            rows={p.lines.map((l) => [l.name, l.fyBefore == null ? '—' : F.money(l.fyBefore), F.money(l.fyAfter)])} />
          : <p className="m-0">{t(`${NS}.import.noLineChange`)}</p>)}
        <ul className="m-0 list-disc space-y-0.5 pl-5">
          <li>{t(`${NS}.import.driverCount`, { count: p.drivers.count, changed: p.drivers.changed, added: p.drivers.added.length, removed: p.drivers.removed.length })}</li>
          {p.drivers.added.length > 0 && <li>{t(`${NS}.import.added`, { list: p.drivers.added.map((d) => d.gl).join(', ') })}</li>}
          {p.drivers.removed.length > 0 && <li>{t(`${NS}.import.removed`, { list: p.drivers.removed.map((d) => d.gl).join(', ') })}</li>}
          {p.exists && <li>{t(`${NS}.import.overridesKept`, { count: p.overrides.kept })}</li>}
          {p.overrides.dropped.length > 0 && <li className="font-bold text-[#B42318] dark:text-[#F46060]">{t(`${NS}.import.overridesDropped`, { list: p.overrides.dropped.map((d) => d.gl).join(', ') })}</li>}
          {p.checks && <li>{t(`${NS}.import.checks`, { count: p.checks.length, failing })}</li>}
          {p.gaps.length > 0 && <li>{t(`${NS}.import.gaps`, { list: p.gaps.map((g) => `${g.line} ${F.money(g.gap)}`).join(' · ') })}</li>}
        </ul>
        <MessageList items={p.warnings} tone="warn" />
      </div>
    );
  };
  return (
    <ImportModal<EntityPreview, EntityPayload> open={open} onClose={onClose}
      title={t(`${NS}.import.title`, { ent })} intro={t(`${NS}.import.intro`, { ent })}
      preview={(f) => entityApi.preview(entity, f)} confirm={(f, p) => entityApi.confirm(entity, f, p)}
      renderPreview={render} onApplied={onApplied} />
  );
}
