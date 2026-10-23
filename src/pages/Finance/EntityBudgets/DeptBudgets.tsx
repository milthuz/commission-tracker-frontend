// Module Finance, lot A — Budgets départementaux : présentation « leader » du budget Sep 2026 →
// Dec 2027 (Ventes, R&D, Livraison & Opérations, Comptabilité), lue des feuilles « Dept - … » du
// classeur de la CFO. Affichage seul : aucun recalcul, les ajustements des budgets d'entité n'y
// passent pas (comme le prototype). Le budget « Ventes » est une CONTRIBUTION (revenus − S&M), pas
// une dépense : c'est dit partout où il paraît.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineError, PageHeader, StateCard, StatusPill, Tabs, toast, useUrlTab } from '../../../components/ui';
import { CARD } from '../../../components/ui/surface';
import { ContentLoader } from '../../../common/Loader';
import PageTitle from '../../../components/PageTitle';
import { Card, Kpi, KpiRow } from '../components';
import { downloadCsv } from '../format';
import { deptApi, errCode, loadErrCode, type DeptPayload, type DeptPreview } from './api';
import { deptCells, deptRows, makeBudgetFormat } from './entityModel';
import { BudgetGrid, ColSeg, DiffTable, ImportModal, MessageList, NS, Notice, useColMode, useColumns, type GridRow } from './shared';

const TABS = ['overview', 'sales', 'rd', 'ops', 'acct'] as const;
type Tab = (typeof TABS)[number];

export default function DeptBudgets() {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<DeptPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const p = await deptApi.load(); setError(null); setPayload(p); } catch (e) { setError(loadErrCode(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const head = <PageTitle titleKey={`${NS}.nav.dept`} />;
  if (error === 'forbidden' || error === 'demo') return <>{head}<StateCard kind="empty" title={t(`${NS}.errors.${error}`)} /></>;
  if (error && !payload) return <>{head}<InlineError title={t(`${NS}.errors.load`)} detail={error} onRetry={load} retryLabel={t(`${NS}.retry`)} /></>;
  if (!payload) return <ContentLoader label={t(`${NS}.loading`)} />;
  return <>{head}<DeptPage payload={payload} onApplied={setPayload} /></>;
}

function DeptPage({ payload, onApplied }: { payload: DeptPayload; onApplied: (p: DeptPayload) => void }) {
  const { t, i18n } = useTranslation();
  const F = useMemo(() => makeBudgetFormat(i18n.language), [i18n.language]);
  const [tab, setTab] = useUrlTab<Tab>('overview', TABS, 'dept');
  const [mode, setMode] = useColMode();
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cols = useColumns(mode);
  const ref = payload.empty ? null : payload.reference;
  const deptName = (key: string, fallback?: string) => t(`${NS}.dept.names.${key}`, { defaultValue: fallback || key });

  const toolbar = (
    <div className={`${CARD} mb-4 flex flex-wrap items-center gap-2 px-3 py-2.5`}>
      {ref && <ColSeg mode={mode} onChange={setMode} />}
      {ref && tab !== 'overview' && <Button size="sm" onClick={() => exportTab()}>{t(`${NS}.export`)}</Button>}
      {payload.caps.canImport && <Button size="sm" onClick={() => setImporting(true)}>{t(`${NS}.import.button`)}</Button>}
      <Button size="sm" onClick={() => deptApi.template().catch((e) => setNotice(t(`${NS}.errors.generic`, { code: errCode(e) })))}>{t(`${NS}.import.template`)}</Button>
    </div>
  );
  const importModal = (
    <DeptImport open={importing} onClose={() => setImporting(false)}
      onApplied={(p) => { setImporting(false); onApplied(p); toast.success(t(`${NS}.import.done`)); }} />
  );
  const header = (
    <PageHeader section={`${t('sidebar.sections.finance')} · FY2027`} title={t(`${NS}.dept.title`)} subtitle={t(`${NS}.dept.subtitle`)} />
  );

  const dep = ref && tab !== 'overview' ? ref.depts.find((d) => d.key === tab) : null;
  const exportTab = () => {
    if (!dep) return;
    const rows = deptRows(dep.rows).filter((r) => r.kind !== 'sec').map((r) => [r.name, ...deptCells(r, mode)]);
    downloadCsv(`department-${dep.key}-${mode === 'sum' ? 'summary' : '18-months'}.csv`, [t(`${NS}.dept.expenseLine`), ...cols.map((c) => c.label)], rows, F.fr);
  };

  if (!ref) {
    return (
      <>
        {header}{toolbar}
        <StateCard kind="empty" title={t(`${NS}.empty.title`)} body={t(payload.caps.canImport ? `${NS}.empty.deptBodyImport` : `${NS}.empty.body`)} />
        {importModal}
      </>
    );
  }

  const leaderLabel = (key: string, name: string) => deptName(key, name);
  const contrib = (key: string) => ref.depts.find((d) => d.key === key)?.contribution;
  const tabsItems = TABS.map((k) => ({ id: k, label: k === 'overview' ? t(`${NS}.dept.overview`) : t(`${NS}.dept.tabs.${k}`) }));

  return (
    <>
      {header}{toolbar}
      {notice && <Notice>{notice}</Notice>}
      <div className="mb-4"><Tabs tabs={tabsItems} value={tab} onChange={setTab} ariaLabel={t(`${NS}.dept.title`)} /></div>

      {tab === 'overview' && (
        <>
          <KpiRow>
            {ref.leaders.map((L) => (
              <Kpi key={L.key} label={contrib(L.key) ? `${leaderLabel(L.key, L.name)} · ${t(`${NS}.dept.contribution`)}` : leaderLabel(L.key, L.name)}
                value={F.money(L.v[2])} onClick={() => setTab(L.key as Tab)}
                detail={t(`${NS}.tiles.detail`, { sd: F.money(L.v[0]), fy: F.money(L.v[1]) })} />
            ))}
          </KpiRow>
          <Card title={t(`${NS}.dept.leaderView`)} sub={t(`${NS}.dept.leaderHint`)}>
            <DiffTable head={[t(`${NS}.dept.department`), t(`${NS}.cols.sd`), t(`${NS}.cols.fy`), t(`${NS}.cols.m16`)]}
              rows={ref.leaders.map((L) => [
                <button key={L.key} type="button" onClick={() => setTab(L.key as Tab)} className="inline-flex flex-wrap items-center gap-2 text-left font-bold decoration-primary underline-offset-[3px] hover:underline focus-visible:underline hover:text-accent-ink dark:hover:text-accent-ink-dark">
                  {leaderLabel(L.key, L.name)}
                  {contrib(L.key) && <StatusPill family="new">{t(`${NS}.dept.contribution`)}</StatusPill>}
                </button>,
                <b key="sd">{F.money(L.v[0])}</b>, <b key="fy">{F.money(L.v[1])}</b>, <b key="t">{F.money(L.v[2])}</b>,
              ])} />
            <p className="mb-0 mt-2 text-[12px] text-body dark:text-bodydark2">{t(`${NS}.dept.contributionNote`)}</p>
          </Card>
        </>
      )}

      {dep && (
        <Card title={deptName(dep.key, dep.title)} sub={t(`${NS}.dept.detailHint`)}>
          {dep.contribution && <Notice>{t(`${NS}.dept.contributionNote`)}</Notice>}
          <BudgetGrid cols={cols} labelHead={t(`${NS}.dept.expenseLine`)} monthMode={mode === 'm'}
            rows={deptRows(dep.rows).map((r, i): GridRow => (r.kind === 'sec'
              ? { id: `${i}`, kind: 'sec', label: r.name, cells: [] }
              : { id: `${i}`, kind: r.kind, label: r.name, cells: deptCells(r, mode).map((v) => ({ text: F.money(v), value: v })) }))} />
          <p className="mb-0 mt-2 text-[12px] text-body dark:text-bodydark2">
            {t(ref.source.kind === 'xlsx' ? `${NS}.source.xlsx` : `${NS}.source.handoff`, { file: ref.source.file || '—', when: payload.budget.importedAt ? new Date(payload.budget.importedAt).toLocaleDateString(F.loc) : '—', who: payload.budget.importedBy || '—' })}
          </p>
        </Card>
      )}
      {importModal}
    </>
  );
}

function DeptImport({ open, onClose, onApplied }: { open: boolean; onClose: () => void; onApplied: (p: DeptPayload) => void }) {
  const { t, i18n } = useTranslation();
  const F = makeBudgetFormat(i18n.language);
  const render = (p: DeptPreview) => (
    <div className="space-y-3">
      <p className="m-0 font-bold">{t(p.exists ? `${NS}.import.deptWillReplace` : `${NS}.import.deptWillCreate`, { file: p.file || '—' })}</p>
      <DiffTable head={[t(`${NS}.dept.department`), t(`${NS}.import.fyBefore`), t(`${NS}.import.fyAfter`), t(`${NS}.import.rowsChanged`)]}
        rows={p.leaders.map((L) => {
          const d = p.depts.find((x) => x.key === L.key);
          return [t(`${NS}.dept.names.${L.key}`, { defaultValue: L.name }), L.fyBefore == null ? '—' : F.money(L.fyBefore), F.money(L.fyAfter),
            d ? t(`${NS}.import.rowsChangedValue`, { changed: d.changed, rows: d.rows, removed: d.removed }) : '—'];
        })} />
      <MessageList items={p.warnings} tone="warn" />
    </div>
  );
  return (
    <ImportModal<DeptPreview, DeptPayload> open={open} onClose={onClose} title={t(`${NS}.import.deptTitle`)} intro={t(`${NS}.import.deptIntro`)}
      preview={deptApi.preview} confirm={deptApi.confirm} renderPreview={render} onApplied={onApplied} />
  );
}
