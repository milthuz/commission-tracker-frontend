// Module Finance — onglet KPI (« MoM BvA, trailing 12 months », demandé par la CFO).
// Rendu DANS le FinanceProvider (fmt, et le modèle de drivers FY2027 qui préremplit le budget des
// mois 2027). Ses données viennent de /api/finance/kpi (Zoho Billing, Zoho Books, Banque du
// Canada, Zentact), les calculs de kpiModel.ts.
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import PageTitle from '../../../components/PageTitle';
import Select from '../../../components/Select';
import { Button, InlineError, PageHeader, StateCard, StatusPill, toast } from '../../../components/ui';
import type { StatusFamily } from '../../../components/ui';
import { CARD, SEG, segBtn } from '../../../components/ui/surface';
import { ContentLoader } from '../../../common/Loader';
import { useFinance } from '../FinanceContext';
import { EDIT_CELL } from '../components';
import { downloadCsv } from '../format';
import { computeKpiTable, modelLike, modelPrefill, type ACell, type BCell, type KpiDef, type KpiRowOut } from './kpiModel';
import { exportGrid, KpiTable, useKpiFormat, type View } from './KpiTable';
import { CellModal } from './CellModal';
import { SettingsModal } from './SettingsModal';
import { ImportModal } from './ImportModal';
import { errCode, useKpi } from './useKpi';
import { kpiApi, type SourceStatus } from './api';

const VIEW_KEY = 'finance.kpi.view';
const readView = (): View => { try { return localStorage.getItem(VIEW_KEY) === 'actual' ? 'actual' : 'bva'; } catch { return 'bva'; } };

const STATE_FAMILY: Record<string, StatusFamily> = { ok: 'ok', error: 'err', reconnect: 'err', busy: 'wait', warning: 'wait' };

export default function KpiPage() {
  const { t, i18n } = useTranslation();
  const { fmt, result, payload: budgetPayload } = useFinance();
  const F = useKpiFormat(fmt);
  const K = useKpi();
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* stockage bloqué */ } };
  const [cellOpen, setCellOpen] = useState<{ row: KpiRowOut; m: string; cell: ACell } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const data = K.data;
  // Préremplissage du budget des mois de l'exercice du budget maître, par le modèle de drivers.
  const prefill = useMemo(() => modelPrefill(modelLike(result), budgetPayload.budget.fiscalYear), [result, budgetPayload.budget.fiscalYear]);
  const table = useMemo(() => (data ? computeKpiTable(data, prefill) : null), [data, prefill]);

  if (K.error === 'forbidden' || K.error === 'demo') return <StateCard kind="empty" title={t(`finance.kpi.errors.${K.error}`)} />;
  if (K.error && !data) return <InlineError title={t('finance.kpi.errors.load')} detail={K.error} onRetry={() => K.reload()} retryLabel={t('finance.kpi.retry')} />;
  if (!data || !table) return <ContentLoader label={t('finance.kpi.loading')} />;

  const canEdit = data.caps.canEdit;
  const endOpts = Array.from({ length: 36 }, (_, i) => {
    const y = +data.currentMonth.slice(0, 4), mo = +data.currentMonth.slice(5, 7) - i;
    const d = new Date(y, mo - 1, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value: m, label: F.month(m) };
  });

  const savedBy = (s: { by?: string | null; at?: string | null } | null | undefined) => (s ? ` (${t('finance.kpi.src.by', { who: s.by || '—', when: F.when(s.at) })})` : '');
  const srcTitle = (def: KpiDef, a: ACell, m: string) => {
    if (!a.src) return t('finance.kpi.src.none');
    let s = t(`finance.kpi.src.${a.src}`);
    if (a.src === 'override' || a.src === 'manual') s += `${savedBy(a.saved)}${a.saved?.note ? ` : ${a.saved.note}` : ''}`;
    if (a.src === 'boc') { const fx = data.facts[m]?.fx?.boc; if (fx) s += ` · ${fx.date}`; }
    return `${s} — ${t(`finance.kpi.formula.${def.key}`)}`;
  };
  const budgetTitle = (b: BCell) => (b.src === 'stored' ? `${t('finance.kpi.src.stored')}${savedBy(b.saved)}` : b.src === 'model' ? t('finance.kpi.src.model') : b.src === 'formula' ? t('finance.kpi.src.bformula') : '');

  const onSync = async () => {
    try {
      toast.success(t('finance.kpi.toolbar.syncStarted'));
      await K.startSync();
      toast.success(t('finance.kpi.toolbar.syncDone'));
    } catch (e) {
      const c = errCode(e);
      const body = (e as { body?: { retryAfterSec?: number } }).body;
      K.setNotice(c === 'rate_limited' ? `rate:${body?.retryAfterSec || 300}` : c === 'busy' ? 'busy' : `save:${c}`);
    }
  };
  const fileBase = `kpi-${table.months[0]}-${table.months[table.months.length - 1]}${view === 'bva' ? '-bva' : ''}`;
  const onCsv = () => { const g = exportGrid(table, view, t, F.month); downloadCsv(`${fileBase}.csv`, g.head, g.rows, fmt.fr); };
  const onXlsx = async () => {
    const g = exportGrid(table, view, t, F.month);
    try { await kpiApi.exportXlsx(`${fileBase}.xlsx`, [g.head, ...g.rows]); } catch (e) { K.setNotice(`save:${errCode(e)}`); }
  };
  const onTemplate = async () => { try { await kpiApi.template(data.end, i18n.language); } catch (e) { K.setNotice(`save:${errCode(e)}`); } };

  const notice = K.notice;
  const noticeText = !notice ? null
    : notice === 'conflict' ? t('finance.kpi.errors.conflict')
      : notice === 'busy' ? t('finance.kpi.errors.busy')
        : notice.startsWith('rate:') ? t('finance.kpi.errors.rateLimited', { sec: notice.slice(5) })
          : t('finance.kpi.errors.save', { code: notice.replace(/^save:/, '') });

  const src = (name: string) => data.sources.find((s) => s.source === name);
  const books = src('books');
  const mappingEmpty = Object.values(data.settings.glMapping).every((l) => !l.length);
  const sourceChips: { label: string; s: SourceStatus | undefined }[] = [
    ...[...data.settings.canadaOrgIds, ...data.settings.usaOrgIds].map((o) => ({ label: t('finance.kpi.sources.billing', { org: data.orgs.find((x) => x.id === o)?.name || o }), s: src(`billing:${o}`) })),
    { label: t('finance.kpi.sources.books'), s: books },
    { label: t('finance.kpi.sources.creditnotes'), s: src('creditnotes') },
    { label: t('finance.kpi.sources.fx'), s: src('fx') },
  ];

  return (
    <>
      <PageTitle titleKey="finance.kpi.title" />
      <PageHeader
        section={t('finance.kpi.section')}
        title={t('finance.kpi.title')}
        subtitle={t('finance.kpi.subtitle', { month: F.month(data.end) })}
        actions={
          <>
            {K.saveStatus !== 'idle' && (
              <span aria-live="polite" className={`text-[12px] ${K.saveStatus === 'error' ? 'font-bold text-[#B42318] dark:text-[#F46060]' : 'text-body dark:text-bodydark2'}`}>
                {K.saveStatus === 'error' ? t('finance.save.error', { code: '' }) : t(`finance.save.${K.saveStatus}`)}
              </span>
            )}
            {K.syncing && <StatusPill family="wait">{t('finance.kpi.toolbar.syncing')}</StatusPill>}
          </>
        }
      />
      {/* Barre d'outils en carte pleine largeur sous le titre (convention des barres d'outils). */}
      <div className={`${CARD} mb-4 flex flex-wrap items-center gap-2 px-3 py-2.5`}>
        <span className="text-[12px] font-bold text-body dark:text-bodydark2">{t('finance.kpi.toolbar.endMonth')}</span>
        <div className="w-[140px]"><Select value={data.end} onChange={K.changeEnd} options={endOpts} /></div>
        <div className={SEG} role="group" aria-label={t('finance.kpi.toolbar.view')}>
          <button type="button" aria-pressed={view === 'bva'} className={segBtn(view === 'bva')} onClick={() => setView('bva')}>{t('finance.kpi.toolbar.bva')}</button>
          <button type="button" aria-pressed={view === 'actual'} className={segBtn(view === 'actual')} onClick={() => setView('actual')}>{t('finance.kpi.toolbar.actualOnly')}</button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {data.caps.canSync && <Button size="sm" onClick={onSync} disabled={K.syncing}>{K.syncing ? t('finance.kpi.toolbar.syncing') : t('finance.kpi.toolbar.sync')}</Button>}
          <Button size="sm" variant="secondary" onClick={onCsv}>{t('finance.kpi.toolbar.exportCsv')}</Button>
          <Button size="sm" variant="secondary" onClick={onXlsx}>{t('finance.kpi.toolbar.exportXlsx')}</Button>
          <Button size="sm" variant="secondary" onClick={onTemplate}>{t('finance.kpi.toolbar.template')}</Button>
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>{t('finance.kpi.toolbar.import')}</Button>}
          <Button size="sm" variant="secondary" onClick={() => setSettingsOpen(true)}>{t('finance.kpi.toolbar.settings')}</Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-body dark:text-bodydark2">
        <span className="font-bold">{t('finance.kpi.sources.title')}</span>
        {sourceChips.map(({ label, s }) => (
          <span key={label} title={s?.error || ''} className="inline-flex items-center gap-1.5">
            <StatusPill family={s ? STATE_FAMILY[s.state] || 'neutral' : 'neutral'}>{s ? t(`finance.kpi.sources.state.${s.state}`) : t('finance.kpi.sources.never')}</StatusPill>
            <span>{label}{s?.lastOkAt ? ` · ${t('finance.kpi.sources.lastOk', { when: F.when(s.lastOkAt) })}` : ''}</span>
          </span>
        ))}
      </div>

      {noticeText && <Banner tone="info" onClose={() => K.setNotice(null)}>{noticeText}</Banner>}
      {!data.billingReady && <Banner tone="warn">{t('finance.kpi.notice.billingNotReady')}</Banner>}
      {books?.state === 'reconnect' && <Banner tone="warn">{t('finance.kpi.notice.booksReconnect')}</Banner>}
      {books?.state === 'ok' && mappingEmpty && <Banner tone="info">{t('finance.kpi.notice.noMapping')}</Banner>}
      {!data.opening && <Banner tone="info">{t('finance.kpi.notice.noOpening')}</Banner>}

      <KpiTable
        table={table}
        view={view}
        canEdit={canEdit}
        fmt={fmt}
        srcTitle={srcTitle}
        budgetTitle={budgetTitle}
        onActual={(row, m, cell) => setCellOpen({ row, m, cell })}
        onBudget={(m, def, v) => K.setBudget(m, def.key, v)}
      />
      <div className="mt-2 space-y-1 text-[12px] text-body dark:text-bodydark2">
        <p className="flex items-center gap-2"><span aria-hidden className={`inline-block h-3 w-5 rounded border ${EDIT_CELL}`} />{t('finance.kpi.legend.editable')}</p>
        {view === 'bva' && <p>{t('finance.kpi.legend.model')}</p>}
        <p>{t('finance.kpi.legend.varPct')} {t('finance.kpi.notice.partial')}</p>
      </div>

      {cellOpen && (
        <CellModal
          open
          onClose={() => setCellOpen(null)}
          month={cellOpen.m}
          def={cellOpen.row.def}
          cell={cellOpen.cell}
          canEdit={canEdit}
          fmt={fmt}
          srcText={srcTitle(cellOpen.row.def, cellOpen.cell, cellOpen.m).split(' — ')[0]}
          onSaved={() => K.reload()}
        />
      )}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={data.settings}
        orgs={data.orgs}
        months={endOpts.map((o) => o.value)}
        canEdit={canEdit}
        fmt={fmt}
        onSaved={() => K.reload()}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} fmt={fmt} onDone={() => K.reload()} />
    </>
  );
}

function Banner({ tone, children, onClose }: { tone: 'warn' | 'info'; children: ReactNode; onClose?: () => void }) {
  const { t } = useTranslation();
  const cls = tone === 'warn'
    ? 'border-[rgba(247,144,9,0.45)] bg-[rgba(247,144,9,0.08)] text-[#93370D] dark:text-[#FEC84B]'
    : 'border-stroke bg-gray-2 text-black dark:border-strokedark dark:bg-meta-4 dark:text-white';
  return (
    <div role="status" className={`mb-3 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-[13px] ${cls}`}>
      <span>{children}</span>
      {onClose && <button type="button" onClick={onClose} aria-label={t('finance.kpi.cell.close')} className="shrink-0 rounded px-1.5 text-[15px] leading-none hover:bg-black/5 dark:hover:bg-white/10">×</button>}
    </div>
  );
}
