import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL;

interface PreviewMatched {
  invoice_number: string;
  rep: string | null;
  customer: string | null;
  commission: number;
  current_status?: string;
  current_approval?: string;
}

interface PreviewBonus {
  merchant: string | null;
  amount: number;
  matched_zentact_id: string | null;
  date?: string | null;
}

interface PreviewSummary {
  filename: string;
  rep_name: string;
  paid_for_period: string;
  invoices_to_mark: number;
  invoices_skipped_zero: number;
  invoices_not_found: number;
  signup_bonuses_count: number;
  signup_bonuses_amount: number;
  monthly_bonus_amount: number;
  total_to_pay: number;
}

interface PreviewResponse {
  preview: true;
  summary: PreviewSummary;
  matched: PreviewMatched[];
  skipped_zero: string[];
  not_found: string[];
  bonuses: PreviewBonus[];
}

// One row per dropped file — tracks both the file and its preview/commit state.
interface FileEntry {
  id: string;                       // local uuid for the row
  file: File;
  status: 'pending' | 'parsing' | 'previewed' | 'committing' | 'done' | 'error';
  preview?: PreviewResponse;
  error?: string;
  expanded?: boolean;
  result?: { invoices_to_mark: number; total: number };
}

interface HistoryRow {
  id: number;
  filename: string;
  rep_name: string;
  paid_for_period: string;
  imported_at: string;
  imported_by: string;
  invoices_marked: number;
  invoices_skipped: number;
  invoices_not_found: number;
  signup_bonuses_count: number;
  signup_bonuses_amount: number;
  monthly_bonus_amount: number;
  total_amount: number;
}

const newId = () => Math.random().toString(36).slice(2, 10);

const CommissionImport: React.FC = () => {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [committingAll, setCommittingAll] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const fetchHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/admin/commission-imports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHistory(res.data?.imports || []);
    } catch (_e) { /* silent */ }
  };

  useEffect(() => { fetchHistory(); }, []);

  // Update a single entry by id
  const updateEntry = (id: string, patch: Partial<FileEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  const previewFile = async (entry: FileEntry) => {
    updateEntry(entry.id, { status: 'parsing', error: undefined });
    try {
      const fd = new FormData();
      fd.append('file', entry.file);
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/admin/commission-import/preview`, fd, {
        headers: { Authorization: `Bearer ${token}` },
      });
      updateEntry(entry.id, { status: 'previewed', preview: res.data });
    } catch (e: any) {
      updateEntry(entry.id, { status: 'error', error: e?.response?.data?.error || e?.message || 'Preview failed' });
    }
  };

  const onFilesAdded = async (files: FileList | File[]) => {
    const newEntries: FileEntry[] = Array.from(files)
      .filter(f => f.name.toLowerCase().endsWith('.xlsx'))
      .map(file => ({ id: newId(), file, status: 'pending' as const }));
    if (newEntries.length === 0) return;
    setEntries(prev => [...prev, ...newEntries]);
    // Preview them sequentially (in parallel would hammer the API with file uploads)
    for (const e of newEntries) {
      await previewFile(e);
    }
  };

  const commitOne = async (entry: FileEntry): Promise<{ invoices_to_mark: number; total: number } | null> => {
    if (entry.status !== 'previewed' || !entry.preview) return null;
    updateEntry(entry.id, { status: 'committing' });
    try {
      const fd = new FormData();
      fd.append('file', entry.file);
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/admin/commission-import/commit`, fd, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = {
        invoices_to_mark: res.data.summary.invoices_to_mark,
        total: res.data.summary.total_to_pay,
      };
      updateEntry(entry.id, { status: 'done', result });
      return result;
    } catch (e: any) {
      updateEntry(entry.id, { status: 'error', error: e?.response?.data?.error || e?.message || 'Commit failed' });
      return null;
    }
  };

  const commitAll = async () => {
    setCommittingAll(true);
    // Process sequentially — protects against race conditions on overlapping
    // commits and gives the user a predictable progress bar.
    const toCommit = entries.filter(e => e.status === 'previewed');
    for (const e of toCommit) {
      await commitOne(e);
    }
    await fetchHistory();
    setCommittingAll(false);
  };

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const clearAll = () => setEntries([]);

  const toggleExpand = (id: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, expanded: !e.expanded } : e));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) void onFilesAdded(e.dataTransfer.files);
  };

  const fmt = (val: number) =>
    val.toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', {
      style: 'currency', currency: 'CAD', minimumFractionDigits: 2,
    });

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA'); }
    catch { return iso; }
  };

  // Aggregate totals across all previewed files
  const totals = entries.reduce((acc, e) => {
    if (e.status === 'previewed' && e.preview) {
      acc.files++;
      acc.invoices += e.preview.summary.invoices_to_mark;
      acc.signupCount += e.preview.summary.signup_bonuses_count;
      acc.signupAmount += e.preview.summary.signup_bonuses_amount;
      acc.monthlyBonus += e.preview.summary.monthly_bonus_amount;
      acc.total += e.preview.summary.total_to_pay;
    }
    return acc;
  }, { files: 0, invoices: 0, signupCount: 0, signupAmount: 0, monthlyBonus: 0, total: 0 });

  const anyPreviewed = entries.some(e => e.status === 'previewed');
  const anyParsing = entries.some(e => e.status === 'parsing' || e.status === 'committing');

  const statusBadge = (e: FileEntry) => {
    const map: Record<FileEntry['status'], { cls: string; label: string }> = {
      pending:    { cls: 'bg-gray-200 text-body dark:bg-meta-4',                 label: 'queued' },
      parsing:    { cls: 'bg-primary bg-opacity-10 text-primary',                label: t('admin.commissionImport.parsing') as string },
      previewed:  { cls: 'bg-warning bg-opacity-10 text-warning',                label: 'ready' },
      committing: { cls: 'bg-primary bg-opacity-10 text-primary animate-pulse', label: t('admin.commissionImport.committing') as string },
      done:       { cls: 'bg-success bg-opacity-10 text-success',                label: '✓ done' },
      error:      { cls: 'bg-danger bg-opacity-10 text-danger',                  label: 'error' },
    };
    const m = map[e.status];
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${m.cls}`}>{m.label}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.commissionImport.uploadTitle')}</h3>
          <p className="text-sm text-body">{t('admin.commissionImport.uploadSubtitle')}</p>
        </div>
        <div className="p-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 cursor-pointer rounded-md border-2 border-dashed py-10 transition ${
              dragOver
                ? 'border-primary bg-primary bg-opacity-5'
                : 'border-stroke hover:border-primary dark:border-strokedark dark:hover:border-primary'
            }`}
          >
            <svg className="h-10 w-10 text-body" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <p className="text-sm text-black dark:text-white">{t('admin.commissionImport.dropMultiple')}</p>
            <p className="text-xs text-body">{t('admin.commissionImport.filenameHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && onFilesAdded(e.target.files)}
            />
          </div>
        </div>
      </div>

      {/* Aggregated totals + bulk actions */}
      {entries.length > 0 && (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-black dark:text-white">
                {t('admin.commissionImport.batchTitle', { count: entries.length })}
              </h3>
              <p className="text-sm text-body">
                {totals.files} ready · {totals.invoices} invoices · {totals.signupCount} signup · {fmt(totals.total)} {t('admin.commissionImport.totalToPay').toLowerCase()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={clearAll}
                disabled={committingAll || anyParsing}
                className="rounded-md border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4 disabled:opacity-50"
              >
                {t('admin.commissionImport.clearAll')}
              </button>
              <button
                onClick={commitAll}
                disabled={!anyPreviewed || committingAll || anyParsing}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50"
              >
                {committingAll ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                    {t('admin.commissionImport.committingAll')}
                  </>
                ) : t('admin.commissionImport.confirmAll', { count: totals.files })}
              </button>
            </div>
          </div>

          {/* Aggregate summary chips */}
          <div className="grid grid-cols-2 gap-3 p-6 md:grid-cols-4">
            <div className="rounded-md border border-stroke p-3 dark:border-strokedark">
              <p className="text-xs uppercase text-body">{t('admin.commissionImport.filesReady')}</p>
              <p className="text-2xl font-bold text-primary">{totals.files} / {entries.length}</p>
            </div>
            <div className="rounded-md border border-stroke p-3 dark:border-strokedark">
              <p className="text-xs uppercase text-body">{t('admin.commissionImport.invoicesToMark')}</p>
              <p className="text-2xl font-bold text-black dark:text-white">{totals.invoices}</p>
            </div>
            <div className="rounded-md border border-stroke p-3 dark:border-strokedark">
              <p className="text-xs uppercase text-body">{t('admin.commissionImport.signupBonuses')} + {t('admin.commissionImport.monthlyBonus').toLowerCase()}</p>
              <p className="text-2xl font-bold text-black dark:text-white">{fmt(totals.signupAmount + totals.monthlyBonus)}</p>
            </div>
            <div className="rounded-md border border-success border-opacity-30 bg-success bg-opacity-5 p-3">
              <p className="text-xs uppercase text-success">{t('admin.commissionImport.totalToPay')}</p>
              <p className="text-2xl font-bold text-success">{fmt(totals.total)}</p>
            </div>
          </div>

          {/* Per-file list */}
          <div className="px-6 pb-6 space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="rounded-md border border-stroke dark:border-strokedark">
                <div className="flex items-center gap-3 px-3 py-2 flex-wrap">
                  <button
                    onClick={() => toggleExpand(e.id)}
                    disabled={e.status !== 'previewed' && e.status !== 'done' && e.status !== 'error'}
                    className="text-body hover:text-primary disabled:opacity-30"
                  >
                    <svg className={`h-3.5 w-3.5 transition-transform ${e.expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-black dark:text-white truncate">{e.file.name}</p>
                    {e.preview && (
                      <p className="text-xs text-body">
                        {e.preview.summary.rep_name} · {e.preview.summary.paid_for_period.substring(0, 7)} ·
                        {' '}{e.preview.summary.invoices_to_mark} inv · {fmt(e.preview.summary.total_to_pay)}
                        {e.preview.summary.invoices_not_found > 0 && (
                          <span className="text-danger"> · ⚠ {e.preview.summary.invoices_not_found} not found</span>
                        )}
                      </p>
                    )}
                    {e.error && <p className="text-xs text-danger">{e.error}</p>}
                  </div>
                  {statusBadge(e)}
                  {e.status !== 'done' && e.status !== 'committing' && (
                    <button
                      onClick={() => removeEntry(e.id)}
                      className="text-body hover:text-danger"
                      title={t('admin.commissionImport.remove') as string}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Expanded preview details */}
                {e.expanded && e.preview && (
                  <div className="border-t border-stroke dark:border-strokedark px-3 pb-3 pt-3 space-y-3">
                    {/* Matched invoices */}
                    <div>
                      <p className="mb-1 text-xs font-semibold text-black dark:text-white">
                        {t('admin.commissionImport.invoicesToMark')} ({e.preview.matched.length})
                      </p>
                      <div className="max-h-48 overflow-auto rounded border border-stroke dark:border-strokedark">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 dark:bg-meta-4 sticky top-0">
                            <tr>
                              <th className="px-2 py-1 text-left">Invoice</th>
                              <th className="px-2 py-1 text-left">Customer</th>
                              <th className="px-2 py-1 text-right">$</th>
                              <th className="px-2 py-1 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {e.preview.matched.map((m) => (
                              <tr key={m.invoice_number} className="border-t border-stroke dark:border-strokedark">
                                <td className="px-2 py-1 font-medium text-primary">{m.invoice_number}</td>
                                <td className="px-2 py-1 truncate max-w-[180px]">{m.customer}</td>
                                <td className="px-2 py-1 text-right">{fmt(m.commission)}</td>
                                <td className="px-2 py-1 text-center">
                                  <span className={`inline-flex rounded-full px-1.5 py-0 text-[9px] font-bold ${
                                    m.current_approval === 'paid' ? 'bg-success bg-opacity-10 text-success'
                                    : m.current_approval === 'approved' ? 'bg-primary bg-opacity-10 text-primary'
                                    : 'bg-warning bg-opacity-10 text-warning'
                                  }`}>{m.current_approval || 'pending'}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Bonuses */}
                    {e.preview.bonuses.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold text-black dark:text-white">
                          {t('admin.commissionImport.signupBonuses')} ({e.preview.bonuses.length})
                        </p>
                        <div className="rounded border border-stroke dark:border-strokedark">
                          <table className="w-full text-xs">
                            <tbody>
                              {e.preview.bonuses.map((b, i) => (
                                <tr key={i} className="border-t border-stroke first:border-t-0 dark:border-strokedark">
                                  <td className="px-2 py-1 truncate max-w-[220px]">{b.merchant}</td>
                                  <td className="px-2 py-1 text-center text-[10px]">
                                    {b.matched_zentact_id
                                      ? <span className="text-success">✓ Zentact</span>
                                      : <span className="text-warning">{t('admin.commissionImport.noMatch')}</span>}
                                  </td>
                                  <td className="px-2 py-1 text-right font-medium">{fmt(b.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Warnings */}
                    {e.preview.not_found.length > 0 && (
                      <p className="text-xs text-danger">
                        ⚠ {t('admin.commissionImport.notFoundDetails', { count: e.preview.not_found.length })}:
                        {' '}{e.preview.not_found.slice(0, 8).join(', ')}{e.preview.not_found.length > 8 ? '…' : ''}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.commissionImport.historyTitle')}</h3>
            <p className="text-sm text-body">{t('admin.commissionImport.historySubtitle')}</p>
          </div>
          <div className="overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-meta-4 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">{t('admin.commissionImport.filename')}</th>
                  <th className="px-3 py-2 text-left">Rep</th>
                  <th className="px-3 py-2 text-left">{t('admin.commissionImport.period')}</th>
                  <th className="px-3 py-2 text-right">{t('admin.commissionImport.invoicesToMark')}</th>
                  <th className="px-3 py-2 text-right">{t('admin.commissionImport.signupBonuses')}</th>
                  <th className="px-3 py-2 text-right">{t('admin.commissionImport.totalToPay')}</th>
                  <th className="px-3 py-2 text-left">{t('admin.commissionImport.importedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-stroke dark:border-strokedark">
                    <td className="px-3 py-1.5 truncate max-w-[280px]">{h.filename}</td>
                    <td className="px-3 py-1.5">{h.rep_name}</td>
                    <td className="px-3 py-1.5">{h.paid_for_period?.substring(0, 7)}</td>
                    <td className="px-3 py-1.5 text-right">{h.invoices_marked}</td>
                    <td className="px-3 py-1.5 text-right">{h.signup_bonuses_count} ({fmt(h.signup_bonuses_amount)})</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{fmt(h.total_amount)}</td>
                    <td className="px-3 py-1.5 text-body">{fmtDate(h.imported_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionImport;
