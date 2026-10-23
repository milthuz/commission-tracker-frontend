// Module Finance — lot C : briques communes aux quatre écrans (chargement, enregistrement
// automatique versionné, en-tête, import Excel avec aperçu, tableau, graphiques).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { Button, InlineError, Modal, PageHeader, StateCard, toast } from '../../../components/ui';
import { CARD, TABLE_WRAP } from '../../../components/ui/surface';
import { ContentLoader } from '../../../common/Loader';
import { useIsDark } from '../../../lib/theme';
import { errCode, fcApi, type Doc, type ImportKind, type ImportPreview } from './api';

const SAVE_DELAY = 700;
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

// ---------------------------------------------------------------------------- chargement
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const d = await fn();
      if (my !== seq.current) return null;
      setError(null); setData(d); return d;
    } catch (e) {
      if (my === seq.current) setError(errCode(e));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, setData, error, reload };
}

/** Garde de page : chargement, accès refusé, mode démo, erreur. Rend `null` quand tout va bien. */
export function PageGate({ error, loading, onRetry }: { error: string | null; loading: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  if (error === 'forbidden') return <StateCard kind="empty" title={t('finance.forecasts.common.forbidden')} />;
  if (error === 'demo') return <StateCard kind="empty" title={t('finance.errors.demo')} />;
  if (error && loading) return <InlineError title={t('finance.forecasts.common.loadError')} detail={error} onRetry={onRetry} retryLabel={t('finance.retry')} />;
  if (loading) return <ContentLoader label={t('finance.loading')} />;
  return null;
}

// ---------------------------------------------------------------------------- enregistrement
/**
 * Document versionné, enregistré automatiquement après une courte pause. Conflit (quelqu'un a
 * enregistré entre-temps) : on prévient et on recharge — on n'écrase jamais.
 */
export function useDocSaver<T>(key: string, doc: Doc<T> | null | undefined, onConflict: () => void) {
  const { t } = useTranslation();
  const [data, setData] = useState<T | null>(doc ? doc.data : null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const version = useRef(doc ? doc.version : 0);
  const pending = useRef<T | null>(null);
  const timer = useRef<number | null>(null);
  const inFlight = useRef(false);
  // Fonctions de rappel gardées dans des refs : flush reste STABLE (sinon le nettoyage d'effet
  // ci-dessous l'appellerait à chaque rendu et l'attente avant envoi ne servirait à rien).
  const conflictRef = useRef(onConflict);
  conflictRef.current = onConflict;
  const tRef = useRef(t);
  tRef.current = t;

  // Nouveau document du serveur (rechargement, import) : il remplace l'état local.
  useEffect(() => {
    if (!doc) return;
    setData(doc.data); version.current = doc.version; pending.current = null;
  }, [doc]);

  const flush = useCallback(async () => {
    if (inFlight.current || pending.current == null) return;
    const body = pending.current;
    pending.current = null;
    inFlight.current = true;
    setStatus('saving');
    try {
      const r = await fcApi.saveDoc(key, body, version.current);
      version.current = r.version;
      setStatus(pending.current ? 'pending' : 'saved'); setError(null);
    } catch (e) {
      const c = errCode(e);
      if (c === 'conflict') { setNotice(tRef.current('finance.notice.conflict')); setStatus('idle'); conflictRef.current(); }
      else { setStatus('error'); setError(c); }
    } finally {
      inFlight.current = false;
      if (pending.current != null) timer.current = window.setTimeout(flush, SAVE_DELAY);
    }
  }, [key]);

  const update = useCallback((fn: (d: T) => T) => {
    setData((cur) => {
      if (cur == null) return cur;
      const next = fn(cur);
      pending.current = next;
      setStatus('pending');
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY);
      return next;
    });
  }, [flush]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); flush(); }, [flush]);
  useEffect(() => {
    const warn = (ev: BeforeUnloadEvent) => { if (pending.current != null || inFlight.current) { ev.preventDefault(); ev.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return { data, update, status, error, notice, version: () => version.current, flush };
}

export function SaveBadge({ status, error }: { status: SaveStatus; error: string | null }) {
  const { t } = useTranslation();
  if (status === 'idle') return null;
  const txt = status === 'error' ? t('finance.save.error', { code: error }) : t(`finance.save.${status}`);
  return <span aria-live="polite" className={`text-[12px] ${status === 'error' ? 'font-bold text-[#B42318] dark:text-[#F46060]' : 'text-body dark:text-bodydark2'}`}>{txt}</span>;
}

// ---------------------------------------------------------------------------- en-tête
// L'en-tête de la phase 1 montre le statut du budget consolidé ; ces écrans n'en ont pas : leur
// propre en-tête, même brique PageHeader, barre d'outils en carte sous le titre.
export function FcHeader({ group, title, subtitle, right, actions, notice }: { group: string; title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; actions?: React.ReactNode; notice?: string | null }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader section={`${t('sidebar.sections.finance')} · ${group}`} title={title} subtitle={subtitle} actions={right} />
      {actions && <div className={`${CARD} mb-4 flex flex-wrap items-center gap-2 px-3 py-2.5`}>{actions}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl border border-stroke bg-gray-2 px-4 py-3 text-[13px] text-black dark:border-strokedark dark:bg-meta-4 dark:text-white">{notice}</div>}
    </>
  );
}

/** Bandeau d'information (source en attente, saisie manuelle…). */
export const Note = ({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) => (
  <div role="status" className={`mb-4 rounded-xl border px-4 py-3 text-[13px] ${tone === 'warn'
    ? 'border-[rgba(253,176,34,0.45)] bg-[rgba(253,176,34,0.12)] text-[#B54708] dark:text-[#FDB022]'
    : 'border-stroke bg-gray-2 text-black dark:border-strokedark dark:bg-meta-4 dark:text-white'}`}>{children}</div>
);

// ---------------------------------------------------------------------------- import Excel
/**
 * « Importer (Excel) » : fichier → aperçu validé par le serveur → la CFO confirme → enregistré.
 * `versions()` donne la version de chaque document que la page a lu (concurrence optimiste).
 */
export function ImportExcel({ kind, versions, onApplied, renderSummary, templateQuery, disabled, extraBefore }: {
  kind: ImportKind;
  versions: () => Record<string, number>;
  onApplied: () => void;
  renderSummary: (s: any) => React.ReactNode;
  templateQuery?: string;
  disabled?: boolean;
  extraBefore?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try { setPreview(await fcApi.preview(kind, f)); } catch (e) { setErr(errCode(e)); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const confirm = async () => {
    if (!preview) return;
    setBusy(true); setErr(null);
    try {
      if (extraBefore) await extraBefore();
      await fcApi.confirm(preview.importId, versions());
      setPreview(null);
      toast.success(t('finance.forecasts.import.done'));
      onApplied();
    } catch (e) { setErr(errCode(e)); } finally { setBusy(false); }
  };
  const tpl = async () => { try { await fcApi.template(kind, templateQuery || ''); } catch (e) { setErr(errCode(e)); } };
  return (
    <>
      <Button size="sm" onClick={tpl}>{t('finance.forecasts.import.template')}</Button>
      <Button size="sm" disabled={disabled || busy} onClick={() => input.current?.click()}>{t('finance.forecasts.import.button')}</Button>
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label={t('finance.forecasts.import.button')} onChange={(e) => pick(e.target.files?.[0])} />
      {err && !preview && <span role="alert" className="text-[12px] font-bold text-[#B42318] dark:text-[#F46060]">{t(`finance.forecasts.errors.${err}`, { defaultValue: t('finance.forecasts.errors.generic', { code: err }) })}</span>}
      <Modal
        open={!!preview}
        onClose={() => { setPreview(null); setErr(null); }}
        title={t('finance.forecasts.import.previewTitle', { file: preview?.fileName || '' })}
        size="lg"
        footer={<>
          <Button size="md" variant="ghost" onClick={() => setPreview(null)}>{t('finance.forecasts.common.cancel')}</Button>
          <Button size="md" variant="primary" disabled={busy} onClick={confirm}>{t('finance.forecasts.import.confirm')}</Button>
        </>}
      >
        <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.forecasts.import.previewHint')}</p>
        {preview && renderSummary(preview.summary)}
        {(preview?.summary?.errors?.length || 0) > 0 && <ImportErrors errors={preview!.summary.errors} />}
        {err && <InlineError title={t(`finance.forecasts.errors.${err}`, { defaultValue: t('finance.forecasts.errors.generic', { code: err }) })} />}
      </Modal>
    </>
  );
}

export function ImportErrors({ errors }: { errors: { row?: number; code: string; field?: string; key?: string; week?: number; month?: string }[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl bg-[rgba(253,176,34,0.12)] px-3.5 py-3 text-[13px] text-[#B54708] dark:text-[#FDB022]">
      <p className="m-0 font-bold">{t('finance.forecasts.import.ignored', { n: errors.length })}</p>
      <ul className="m-0 mt-1 list-disc pl-5">
        {errors.slice(0, 12).map((e, i) => (
          <li key={i}>{e.row ? t('finance.forecasts.import.row', { n: e.row }) + ' — ' : ''}{t(`finance.forecasts.import.err.${e.code}`, { defaultValue: e.code })}{e.field || e.key ? ` (${e.field || e.key})` : ''}{e.week ? ` W${e.week}` : ''}{e.month ? ` ${e.month}` : ''}</li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------- tableau
export interface Col<T> { id: string; head: React.ReactNode; cell: (r: T) => React.ReactNode; left?: boolean; cls?: (r: T) => string; headCls?: string }
const TH = 'whitespace-nowrap border-b border-stroke px-2.5 py-2 text-[13px] font-semibold text-body dark:border-strokedark dark:text-bodydark2';
const TD = 'whitespace-nowrap border-b border-stroke/60 px-2.5 py-1.5 tabular-nums dark:border-strokedark/60';
export function Grid<T>({ cols, rows, rowKey, rowCls, foot, caption }: { cols: Col<T>[]; rows: T[]; rowKey: (r: T, i: number) => string; rowCls?: (r: T) => string; foot?: T; caption?: string }) {
  const cell = (c: Col<T>, r: T, first: boolean, tfoot: boolean) => (
    <td key={c.id} className={`${TD} ${c.left || first ? 'text-left' : 'text-right'} ${first ? 'sticky left-0 z-[1] bg-white dark:bg-boxdark' : ''} ${tfoot ? 'font-bold' : ''} ${c.cls ? c.cls(r) : ''}`}>{c.cell(r)}</td>
  );
  return (
    <div className={TABLE_WRAP}>
      <table className="w-full border-collapse text-[14px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead><tr>{cols.map((c, j) => <th key={c.id} scope="col" className={`${TH} ${c.left || j === 0 ? 'text-left' : 'text-right'} ${j === 0 ? 'sticky left-0 z-10 bg-white dark:bg-boxdark' : ''} ${c.headCls || ''}`}>{c.head}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={rowKey(r, i)} className={`text-black dark:text-white ${rowCls ? rowCls(r) : ''}`}>{cols.map((c, j) => cell(c, r, j === 0, false))}</tr>)}</tbody>
        {foot && <tfoot><tr className="text-black dark:text-white [&>td]:border-t [&>td]:border-t-[#141414] dark:[&>td]:border-t-white [&>td]:bg-[#F5F5F5] dark:[&>td]:bg-[#161718]">{cols.map((c, j) => cell(c, foot, j === 0, true))}</tr></tfoot>}
      </table>
    </div>
  );
}

export const toneCls = (v: number | null | undefined) => (v == null ? '' : v >= 0 ? 'text-[#067647] dark:text-[#57D193]' : 'text-[#B42318] dark:text-[#F46060]');

// ---------------------------------------------------------------------------- graphiques
// Palette : orange de la marque pour le réel / la série courante, gris pour le budget, gris clair
// pour l'année précédente ; mêmes réglages qu'ailleurs dans l'app (LeadsChart).
export const CHART = { brand: '#F58345', brandSoft: '#FFBE9B', budget: '#7A7D85', prior: '#C9CBD1', priorDark: '#3A3B40', ok: '#17B26A', warn: '#FDB022', bad: '#F04438' };

export function useChartBase(): { dark: boolean; base: (o: ApexOptions) => ApexOptions } {
  const dark = useIsDark();
  const ink = dark ? '#AEB7C0' : '#64748B';
  const base = (o: ApexOptions): ApexOptions => ({
    ...o,
    chart: { fontFamily: 'Satoshi, sans-serif', toolbar: { show: false }, zoom: { enabled: false }, background: 'transparent', animations: { enabled: false }, ...(o.chart || {}) },
    theme: { mode: dark ? 'dark' : 'light' },
    dataLabels: { enabled: false },
    grid: { borderColor: dark ? '#26272B' : '#E2E8F0', strokeDashArray: 4, xaxis: { lines: { show: false } } },
    legend: { show: true, position: 'top', horizontalAlign: 'left', labels: { colors: ink }, ...(o.legend || {}) },
    xaxis: { axisBorder: { show: false }, axisTicks: { show: false }, ...(o.xaxis || {}), labels: { style: { colors: ink, fontSize: '11px' }, ...((o.xaxis && o.xaxis.labels) || {}) } },
    yaxis: Array.isArray(o.yaxis) ? o.yaxis : { ...(o.yaxis || {}), labels: { style: { colors: ink }, ...(((o.yaxis as any) || {}).labels || {}) } },
    tooltip: { theme: dark ? 'dark' : 'light', shared: true, intersect: false, ...(o.tooltip || {}) },
    states: { hover: { filter: { type: 'none' } } as never },
  });
  return { dark, base };
}

export const Chart = ({ type, options, series, height = 280, k }: { type: 'bar' | 'line'; options: ApexOptions; series: ApexAxisChartSeries; height?: number; k?: string }) => (
  <ReactApexChart key={k} type={type} height={height} options={options} series={series} />
);

/** Format compact des axes (K / M), dans la langue. */
export const compact = (loc: string) => {
  const f = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
  return (v: number) => (Number.isFinite(v) ? f.format(v) : '');
};

/** Libellé d'une période (mois, trimestre, exercice), traduit. */
export function usePeriodLabel() {
  const { t, i18n } = useTranslation();
  const loc = i18n.language?.startsWith('fr') ? 'fr-CA' : 'en-CA';
  return (kind: 'm' | 'q' | 'y', index: number, year: number) => {
    if (kind === 'm') {
      const s = new Date(Date.UTC(year, index, 15)).toLocaleString(loc, { month: 'short', timeZone: 'UTC' }).replace('.', '');
      return `${s.charAt(0).toUpperCase()}${s.slice(1)} ${year}`;
    }
    if (kind === 'q') return t('finance.forecasts.common.quarter', { q: index + 1, y: year });
    return t('finance.forecasts.common.fyLabel', { y: year });
  };
}

/** Libellé court d'un mois « YYYY-MM ». */
export function useYmLabel() {
  const { i18n } = useTranslation();
  const loc = i18n.language?.startsWith('fr') ? 'fr-CA' : 'en-CA';
  return (k: string, long = false) => {
    const d = new Date(Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 15));
    const s = d.toLocaleString(loc, { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' }).replace('.', '');
    return `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
  };
}
