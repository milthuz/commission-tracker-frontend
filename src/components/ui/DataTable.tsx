import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RowMenu, MenuItem } from './ActionMenu';

// « Un seul tableau pour remplacer les 30 » (planche « Tableau ») : colonnes triables, ligne
// entière cliquable (ouvre le détail), UN menu d'actions par ligne, pagination, et les états
// vide / chargement / erreur intégrés.

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  /** Makes the column sortable. Return a number for numbers/dates, a string otherwise. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  /** Extra classes on the cells (e.g. 'font-bold', 'whitespace-nowrap'). */
  className?: string;
}

export type SortDir = 'asc' | 'desc';

export function StateCard({ kind, title, body, onRetry }: {
  kind: 'empty' | 'loading' | 'error';
  title?: React.ReactNode;
  body?: React.ReactNode;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const eyebrow = <p className="m-0 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2">{t(`ui.state.${kind}`)}</p>;
  if (kind === 'loading') {
    return (
      <div className="flex min-h-[170px] flex-col gap-3 p-5" aria-busy="true">
        {eyebrow}
        {['80%', '65%', '72%', '50%'].map((w) => <div key={w} className="h-3.5 animate-pulse rounded-md bg-gray dark:bg-meta-4" style={{ width: w }} />)}
      </div>
    );
  }
  return (
    <div role={kind === 'error' ? 'alert' : undefined} className="flex min-h-[170px] flex-col items-center justify-center gap-2 p-5 text-center">
      {eyebrow}
      {title && <p className="m-0 text-[15px] font-bold text-black dark:text-white">{title}</p>}
      {body && <p className="m-0 max-w-md text-[13px] text-body dark:text-bodydark2">{body}</p>}
      {kind === 'error' && onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 h-[38px] rounded-[10px] border border-strokestrong px-3.5 text-[13px] font-bold text-black hover:bg-gray dark:border-graydark dark:text-white dark:hover:bg-meta-4">
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

function DataTable<T>({
  columns, rows, rowKey, onRowClick, rowActions, title, toolbar, defaultSort, pageSize = 25,
  loading, error, empty, selectedKey, rowLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => MenuItem[];
  title?: React.ReactNode;
  /** Right side of the title bar (an « Exporter » button…). */
  toolbar?: React.ReactNode;
  defaultSort?: { key: string; dir: SortDir };
  /** 0 = no pagination. */
  pageSize?: number;
  loading?: boolean;
  error?: { title: React.ReactNode; body?: React.ReactNode; onRetry?: () => void } | null;
  empty?: { title: React.ReactNode; body?: React.ReactNode };
  /** Row shown as open/selected (its detail panel is showing). */
  selectedKey?: string | number | null;
  /** Accessible name of a row's ⋮ button, e.g. t('…actionsOnInvoice'). */
  rowLabel?: (row: T) => string;
}) {
  const { t, i18n } = useTranslation();
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(defaultSort || null);
  const [page, setPage] = useState(0);
  const [menuOpenFor, setMenuOpenFor] = useState<string | number | null>(null);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const collator = new Intl.Collator(i18n.language, { numeric: true, sensitivity: 'base' });
    const dir = sort!.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a), vb = col.sortValue!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // empty values last, whatever the direction
      if (vb == null) return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : collator.compare(String(va), String(vb))) * dir;
    });
  }, [rows, sort, columns, i18n.language]);

  const pages = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  useEffect(() => { if (page > pages - 1) setPage(0); }, [pages, page]);
  const visible = pageSize > 0 ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted;

  const toggleSort = (key: string) => {
    setMenuOpenFor(null);
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };
  const alignCls = (a?: Column<T>['align']) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  let bodyState: React.ReactNode = null;
  if (loading) bodyState = <StateCard kind="loading" />;
  else if (error) bodyState = <StateCard kind="error" title={error.title} body={error.body} onRetry={error.onRetry} />;
  else if (!rows.length) bodyState = <StateCard kind="empty" title={empty?.title || t('ui.state.emptyTitle')} body={empty?.body} />;

  return (
    <div className="relative rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
      {(title || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stroke px-4 py-3 dark:border-strokedark">
          <p className="m-0 text-sm font-bold text-black dark:text-white">
            {title}
            {!loading && !error && rows.length > 0 && (
              <span className="font-medium text-body dark:text-bodydark2"> · {t('ui.table.results', { count: rows.length })}</span>
            )}
          </p>
          {toolbar}
        </div>
      )}
      {bodyState || (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-xs text-body dark:text-bodydark2">
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={c.sortValue ? (active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                        className={`border-b border-stroke p-0 font-bold dark:border-strokedark ${alignCls(c.align)}`}
                      >
                        {c.sortValue ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className={`w-full whitespace-nowrap px-4 py-3 font-bold ${alignCls(c.align)} ${active ? 'text-black dark:text-white' : 'hover:text-black dark:hover:text-white'}`}
                          >
                            {c.header}{active && (sort!.dir === 'asc' ? ' ↑' : ' ↓')}
                          </button>
                        ) : (
                          <span className="block whitespace-nowrap px-4 py-3">{c.header}</span>
                        )}
                      </th>
                    );
                  })}
                  {rowActions && <th className="w-14 border-b border-stroke p-0 dark:border-strokedark"><span className="sr-only">{t('ui.table.actions')}</span></th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const k = rowKey(row);
                  const hi = menuOpenFor === k || selectedKey === k;
                  return (
                    <tr
                      key={k}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row); } : undefined}
                      tabIndex={onRowClick ? 0 : undefined}
                      className={`${hi ? 'bg-[rgba(245,131,69,0.08)]' : onRowClick ? 'hover:bg-gray-2 dark:hover:bg-[#1B1B1B]' : ''} ${onRowClick ? 'cursor-pointer focus:outline-none focus-visible:bg-[rgba(245,131,69,0.08)]' : ''}`}
                    >
                      {columns.map((c) => (
                        <td key={c.key} className={`border-b border-stroke px-4 py-3 text-black dark:border-strokedark dark:text-white ${alignCls(c.align)} ${c.className || ''}`}>
                          {c.render(row)}
                        </td>
                      ))}
                      {rowActions && (
                        <td className="border-b border-stroke px-3 py-2 text-right dark:border-strokedark" onClick={(e) => e.stopPropagation()}>
                          <RowMenu items={rowActions(row)} label={rowLabel?.(row)} onOpenChange={(o) => setMenuOpenFor(o ? k : null)} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pageSize > 0 && sorted.length > pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px] text-body dark:text-bodydark2">
              <span>{t('ui.table.range', { from: page * pageSize + 1, to: Math.min(sorted.length, (page + 1) * pageSize), total: sorted.length })}</span>
              <span className="flex gap-1.5">
                <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="h-8 rounded-lg border border-stroke px-3 enabled:font-bold enabled:text-black enabled:hover:bg-gray disabled:cursor-not-allowed dark:border-strokedark dark:enabled:text-white dark:enabled:hover:bg-meta-4">
                  {t('ui.table.previous')}
                </button>
                <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="h-8 rounded-lg border border-stroke px-3 enabled:font-bold enabled:text-black enabled:hover:bg-gray disabled:cursor-not-allowed dark:border-strokedark dark:enabled:text-white dark:enabled:hover:bg-meta-4">
                  {t('ui.table.next')}
                </button>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default DataTable;
