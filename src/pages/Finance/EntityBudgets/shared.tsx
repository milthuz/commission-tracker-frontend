// Module Finance, lot A — briques communes des budgets d'entité et départementaux : bascule de
// colonnes (Sommaire / 18 mois, partagée entre les pages comme dans le prototype), tableau
// « budget » à colonnes de réels + totaux ombrés, fenêtre d'import Excel (aperçu puis
// confirmation), messages de validation traduits.
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '../../../components/ui';
import { TABLE_WRAP } from '../../../components/ui/surface';
import { makeFormat } from '../format';
import type { ColMode } from './entityModel';
import { errCode, type ImportMessage } from './api';

export const NS = 'finance.entityBudgets';

// ---------------------------------------------------------------------------- colonnes
const COL_KEY = 'saleshub-finance-colmode';
export function useColMode(): [ColMode, (m: ColMode) => void] {
  const [mode, setMode] = useState<ColMode>(() => {
    try { return localStorage.getItem(COL_KEY) === 'm' ? 'm' : 'sum'; } catch { return 'sum'; }
  });
  const set = useCallback((m: ColMode) => { setMode(m); try { localStorage.setItem(COL_KEY, m); } catch { /* stockage indisponible */ } }, []);
  return [mode, set];
}

export function ColSeg({ mode, onChange }: { mode: ColMode; onChange: (m: ColMode) => void }) {
  const { t } = useTranslation();
  const opts: [ColMode, string][] = [['sum', t(`${NS}.cols.summary`)], ['m', t(`${NS}.cols.months`)]];
  return (
    <div role="group" aria-label={t(`${NS}.cols.label`)} className="inline-flex rounded-lg border border-stroke p-0.5 dark:border-strokedark">
      {opts.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={mode === v} onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1 text-[12.5px] font-bold transition ${mode === v ? 'bg-primary text-white' : 'text-body hover:text-black dark:text-bodydark2 dark:hover:text-white'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

export interface Col { label: string; cls: 'act' | 'tot2' | '' }
export function useColumns(mode: ColMode): Col[] {
  const { t, i18n } = useTranslation();
  const fmt = makeFormat(i18n.language);
  const act: Col[] = [{ label: t(`${NS}.cols.janAug`), cls: 'act' }, { label: t(`${NS}.cols.aug`), cls: 'act' }];
  if (mode === 'sum') return [...act, { label: t(`${NS}.cols.sd`), cls: 'tot2' }, { label: t(`${NS}.cols.fy`), cls: 'tot2' }, { label: t(`${NS}.cols.m16`), cls: 'tot2' }];
  const months = [...fmt.months(26).slice(8), ...fmt.months(27)];
  return [...act, ...months.map((m) => ({ label: m, cls: '' as const })), { label: t(`${NS}.cols.m16`), cls: 'tot2' }];
}

// ---------------------------------------------------------------------------- tableau
export type GridKind = 'sec' | 'line' | 'total' | 'gm' | 'grp' | 'gl' | 'glsub';
export interface GridRow {
  id: string;
  kind: GridKind;
  label: React.ReactNode;
  /** Texte de chaque cellule, et nombre brut (pour le rouge des négatifs en vue 18 mois). */
  cells: { text: string; value: number | null }[];
  title?: string;
  changed?: boolean;
  expand?: { open: boolean; toggle: () => void; hint: string };
  extra?: React.ReactNode;
}

const ROW: Record<GridKind, string> = {
  sec: 'text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2',
  line: 'text-black dark:text-white',
  total: 'font-bold text-black dark:text-white [&>td]:border-t [&>td]:border-t-[#9a9aa3] dark:[&>td]:border-t-[#575A61] [&>td]:bg-[#F5F5F5] dark:[&>td]:bg-[#161718]',
  gm: 'italic text-body dark:text-bodydark2',
  grp: 'text-[11.5px] font-bold text-body dark:text-bodydark2 [&>td]:bg-[#FAFAFA] dark:[&>td]:bg-[#121214]',
  gl: 'text-[#424242] dark:text-bodydark [&>td]:bg-[#FAFAFA] dark:[&>td]:bg-[#121214]',
  glsub: 'text-[12px] text-body dark:text-bodydark2 [&>td]:bg-[#FAFAFA] dark:[&>td]:bg-[#121214]',
};
const INDENT: Partial<Record<GridKind, string>> = { grp: 'pl-5', gl: 'pl-5', glsub: 'pl-12' };
// Couleur des valeurs d'un driver modifié (orange du design, lisible en clair comme en sombre).
const CHANGED = 'text-[#B54708] dark:text-[#FDB022]';

export function BudgetGrid({ cols, rows, labelHead, monthMode }: { cols: Col[]; rows: GridRow[]; labelHead: string; monthMode: boolean }) {
  const th = 'whitespace-nowrap border-b border-stroke px-2.5 py-2 text-right text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:border-strokedark dark:text-bodydark2';
  const td = 'whitespace-nowrap border-b border-stroke/60 px-2.5 py-1.5 text-right tabular-nums dark:border-strokedark/60';
  const colCls = (c: Col) => (c.cls === 'act'
    ? 'text-body dark:text-bodydark2 border-r border-r-stroke dark:border-r-strokedark'
    : c.cls === 'tot2' ? 'bg-[#F3F3F3] dark:bg-[#19191B] border-l border-l-stroke dark:border-l-strokedark' : '');
  return (
    <div className={TABLE_WRAP}>
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            <th className={`${th} sticky left-0 z-10 min-w-[300px] bg-white !text-left dark:bg-boxdark`}>{labelHead}</th>
            {cols.map((c, i) => <th key={i} className={`${th} ${colCls(c)}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            if (r.kind === 'sec') {
              return <tr key={r.id} className={ROW.sec}><td colSpan={cols.length + 1} className="border-b border-stroke px-2.5 pb-1.5 pt-4 dark:border-strokedark">{r.label}</td></tr>;
            }
            const inner = (
              <span className={`flex flex-wrap items-center gap-1.5 ${INDENT[r.kind] || ''}`}>
                {r.expand && <span aria-hidden className="inline-block w-3 text-[10px] text-body">{r.expand.open ? '▾' : '▸'}</span>}
                <span className="min-w-0 whitespace-normal">{r.label}</span>
                {r.extra}
              </span>
            );
            const stick = r.kind === 'total' ? '!bg-[#F5F5F5] dark:!bg-[#161718]' : r.kind === 'gl' || r.kind === 'glsub' || r.kind === 'grp' ? '!bg-[#FAFAFA] dark:!bg-[#121214]' : 'bg-white dark:bg-boxdark';
            return (
              <tr key={r.id} className={ROW[r.kind]} title={r.title || undefined}>
                <td className={`${td} sticky left-0 z-[1] min-w-[300px] max-w-[460px] !text-left ${stick}`}>
                  {r.expand
                    ? <button type="button" aria-expanded={r.expand.open} title={r.expand.hint} onClick={r.expand.toggle} className="w-full text-left hover:text-accent-ink dark:hover:text-accent-ink-dark">{inner}</button>
                    : inner}
                </td>
                {r.kind === 'grp'
                  ? <td colSpan={cols.length} className={td} />
                  : cols.map((c, i) => {
                    const cell = r.cells[i] || { text: '', value: null };
                    const neg = monthMode && c.cls === '' && r.kind !== 'gm' && cell.value != null && cell.value < 0;
                    return <td key={i} className={`${td} ${colCls(c)} ${r.changed ? CHANGED : neg ? 'text-[#B42318] dark:text-[#F46060]' : ''}`}>{cell.text}</td>;
                  })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------- messages de validation
export function MessageList({ items, tone }: { items: ImportMessage[]; tone: 'err' | 'warn' }) {
  const { t, i18n } = useTranslation();
  const fmt = makeFormat(i18n.language);
  if (!items.length) return null;
  const params = (m: ImportMessage) => {
    const p: Record<string, unknown> = { ...m };
    for (const k of ['expected', 'actual']) if (typeof p[k] === 'number') p[k] = fmt.fmt(p[k] as number, '$2');
    return p;
  };
  return (
    <ul className={`m-0 list-disc space-y-0.5 rounded-lg border px-6 py-2 text-[12.5px] ${tone === 'err'
      ? 'border-[rgba(240,68,56,0.35)] bg-[rgba(240,68,56,0.06)] text-[#B42318] dark:text-[#F46060]'
      : 'border-[rgba(247,144,9,0.35)] bg-[rgba(247,144,9,0.06)] text-[#93370D] dark:text-[#FDB022]'}`}>
      {items.map((m, i) => <li key={i}>{t(`${NS}.msg.${m.code}`, { ...params(m), defaultValue: `${m.code} ${JSON.stringify(m)}` })}</li>)}
    </ul>
  );
}

// ---------------------------------------------------------------------------- import Excel
// 1. la CFO choisit son classeur → le serveur le lit, le VALIDE, renvoie un aperçu (rien n'est
//    écrit) ; 2. elle confirme → le même fichier repart avec le jeton de l'aperçu → enregistré.
export function ImportModal<P extends { token: string }, R>({ open, onClose, title, intro, preview, confirm, renderPreview, onApplied }: {
  open: boolean;
  onClose: () => void;
  title: string;
  intro: React.ReactNode;
  preview: (f: File) => Promise<{ preview: P }>;
  confirm: (f: File, p: P) => Promise<R>;
  renderPreview: (p: P) => React.ReactNode;
  onApplied: (r: R) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pv, setPv] = useState<P | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; items: ImportMessage[]; warnings: ImportMessage[] } | null>(null);

  const reset = () => { setFile(null); setPv(null); setError(null); setBusy(false); if (input.current) input.current.value = ''; };
  const close = () => { reset(); onClose(); };
  const pick = async (f: File | null) => {
    setPv(null); setError(null); setFile(f);
    if (!f) return;
    setBusy(true);
    try { setPv((await preview(f)).preview); }
    catch (e: any) { setError({ code: errCode(e), items: e?.body?.errors || [], warnings: e?.body?.warnings || [] }); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!file || !pv) return;
    setBusy(true);
    try { const r = await confirm(file, pv); reset(); onApplied(r); }
    catch (e: any) { setError({ code: errCode(e), items: [], warnings: [] }); setBusy(false); }
  };

  return (
    <Modal open={open} onClose={close} title={title} size="xl" dirty={!!pv}
      footer={
        <>
          <Button size="md" onClick={close}>{t(`${NS}.import.cancel`)}</Button>
          <Button size="md" variant="primary" disabled={!pv || busy} onClick={apply}>{t(`${NS}.import.confirm`)}</Button>
        </>
      }>
      <div className="space-y-3 text-[13px] text-black dark:text-white">
        <p className="m-0 text-body dark:text-bodydark2">{intro}</p>
        <label className="block">
          <span className="mb-1 block text-[12px] font-bold">{t(`${NS}.import.file`)}</span>
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => pick(e.target.files?.[0] || null)}
            className="block w-full text-[13px] file:mr-3 file:rounded-md file:border file:border-stroke file:bg-white file:px-3 file:py-1.5 file:font-bold dark:file:border-strokedark dark:file:bg-boxdark dark:file:text-white" />
        </label>
        {busy && <p role="status" className="m-0 text-body dark:text-bodydark2">{t(`${NS}.import.reading`)}</p>}
        {error && (
          <div role="alert" className="space-y-2">
            <p className="m-0 font-bold text-[#B42318] dark:text-[#F46060]">{t(`${NS}.import.error.${error.code}`, { defaultValue: t(`${NS}.import.error.generic`, { code: error.code }) })}</p>
            <MessageList items={error.items} tone="err" />
            <MessageList items={error.warnings} tone="warn" />
          </div>
        )}
        {pv && renderPreview(pv)}
      </div>
    </Modal>
  );
}

// Petit tableau « avant / après » de l'aperçu.
export function DiffTable({ head, rows }: { head: string[]; rows: (React.ReactNode)[][] }) {
  return (
    <div className={TABLE_WRAP}>
      <table className="w-full border-collapse text-[12.5px]">
        <thead><tr>{head.map((h, i) => <th key={i} className={`whitespace-nowrap border-b border-stroke px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:border-strokedark dark:text-bodydark2 ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`border-b border-stroke/60 px-2.5 py-1 tabular-nums dark:border-strokedark/60 ${j ? 'text-right' : 'text-left'}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export const Notice = ({ tone = 'info', children }: { tone?: 'info' | 'ok'; children: React.ReactNode }) => (
  <div role="status" className={`mb-4 rounded-xl border px-4 py-3 text-[13px] ${tone === 'ok'
    ? 'border-[rgba(23,178,106,0.35)] bg-[rgba(23,178,106,0.08)] text-[#067647] dark:text-[#57D193]'
    : 'border-stroke bg-gray-2 text-black dark:border-strokedark dark:bg-meta-4 dark:text-white'}`}>{children}</div>
);
