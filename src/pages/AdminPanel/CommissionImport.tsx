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

const CommissionImport: React.FC = () => {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committedMessage, setCommittedMessage] = useState<string | null>(null);
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

  const onSelectFile = (f: File | null) => {
    setError(null);
    setPreview(null);
    setCommittedMessage(null);
    setFile(f);
    if (f) void uploadPreview(f);
  };

  const uploadPreview = async (f: File) => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/admin/commission-import/preview`, fd, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      setPreview(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const doCommit = async () => {
    if (!file) return;
    setCommitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/admin/commission-import/commit`, fd, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      setCommittedMessage(`Imported successfully. ${res.data.summary.invoices_to_mark} invoices marked paid.`);
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchHistory();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Commit failed');
    } finally {
      setCommitting(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onSelectFile(f);
  };

  const fmt = (val: number) =>
    val.toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', {
      style: 'currency', currency: 'CAD', minimumFractionDigits: 2,
    });

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA'); }
    catch { return iso; }
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
            className={`flex flex-col items-center justify-center gap-2 cursor-pointer rounded-md border-2 border-dashed py-12 transition ${
              dragOver
                ? 'border-primary bg-primary bg-opacity-5'
                : 'border-stroke hover:border-primary dark:border-strokedark dark:hover:border-primary'
            }`}
          >
            <svg className="h-10 w-10 text-body" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <p className="text-sm text-black dark:text-white">{t('admin.commissionImport.dropPrompt')}</p>
            <p className="text-xs text-body">{t('admin.commissionImport.filenameHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => onSelectFile(e.target.files?.[0] || null)}
            />
          </div>
          {loading && (
            <p className="mt-4 flex items-center gap-2 text-sm text-body">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
              {t('admin.commissionImport.parsing')}
            </p>
          )}
          {error && (
            <div className="mt-4 rounded-md bg-danger bg-opacity-10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}
          {committedMessage && (
            <div className="mt-4 rounded-md bg-success bg-opacity-10 px-4 py-3 text-sm text-success">
              ✓ {committedMessage}
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.commissionImport.previewTitle')}</h3>
              <p className="text-sm text-body">
                {preview.summary.rep_name} · {preview.summary.paid_for_period.substring(0, 7)} · {preview.summary.filename}
              </p>
            </div>
            <button
              onClick={doCommit}
              disabled={committing || preview.summary.invoices_to_mark === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50"
            >
              {committing ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                  {t('admin.commissionImport.committing')}
                </>
              ) : t('admin.commissionImport.confirmImport')}
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 p-6 md:grid-cols-4">
            <div className="rounded-md border border-stroke p-3 dark:border-strokedark">
              <p className="text-xs uppercase text-body">{t('admin.commissionImport.invoicesToMark')}</p>
              <p className="text-2xl font-bold text-primary">{preview.summary.invoices_to_mark}</p>
            </div>
            <div className="rounded-md border border-stroke p-3 dark:border-strokedark">
              <p className="text-xs uppercase text-body">{t('admin.commissionImport.signupBonuses')}</p>
              <p className="text-2xl font-bold text-black dark:text-white">{preview.summary.signup_bonuses_count}</p>
              <p className="text-xs text-body">{fmt(preview.summary.signup_bonuses_amount)}</p>
            </div>
            <div className="rounded-md border border-stroke p-3 dark:border-strokedark">
              <p className="text-xs uppercase text-body">{t('admin.commissionImport.monthlyBonus')}</p>
              <p className="text-2xl font-bold text-black dark:text-white">{fmt(preview.summary.monthly_bonus_amount)}</p>
            </div>
            <div className="rounded-md border border-success border-opacity-30 bg-success bg-opacity-5 p-3">
              <p className="text-xs uppercase text-success">{t('admin.commissionImport.totalToPay')}</p>
              <p className="text-2xl font-bold text-success">{fmt(preview.summary.total_to_pay)}</p>
            </div>
          </div>

          {/* Warnings: skipped + not found */}
          {(preview.summary.invoices_not_found > 0 || preview.summary.invoices_skipped_zero > 0) && (
            <div className="px-6 pb-3 flex flex-wrap gap-2">
              {preview.summary.invoices_not_found > 0 && (
                <span className="inline-flex rounded-full bg-danger bg-opacity-10 px-3 py-1 text-xs font-semibold text-danger">
                  ⚠ {preview.summary.invoices_not_found} {t('admin.commissionImport.notFoundShort')}
                </span>
              )}
              {preview.summary.invoices_skipped_zero > 0 && (
                <span className="inline-flex rounded-full bg-warning bg-opacity-10 px-3 py-1 text-xs font-semibold text-warning">
                  ⓘ {preview.summary.invoices_skipped_zero} {t('admin.commissionImport.skippedZeroShort')}
                </span>
              )}
            </div>
          )}

          {/* Matched invoices */}
          <div className="px-6 pb-6">
            <h4 className="mb-2 text-sm font-semibold text-black dark:text-white">{t('admin.commissionImport.invoicesToMark')} ({preview.matched.length})</h4>
            <div className="max-h-64 overflow-auto rounded-md border border-stroke dark:border-strokedark">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-meta-4 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Invoice</th>
                    <th className="px-3 py-2 text-left">Customer</th>
                    <th className="px-3 py-2 text-right">Commission</th>
                    <th className="px-3 py-2 text-center">Current</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.matched.map((m) => (
                    <tr key={m.invoice_number} className="border-t border-stroke dark:border-strokedark">
                      <td className="px-3 py-1.5 font-medium text-primary">{m.invoice_number}</td>
                      <td className="px-3 py-1.5 truncate max-w-[200px]">{m.customer}</td>
                      <td className="px-3 py-1.5 text-right">{fmt(m.commission)}</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          m.current_approval === 'paid' ? 'bg-success bg-opacity-10 text-success'
                          : m.current_approval === 'approved' ? 'bg-primary bg-opacity-10 text-primary'
                          : 'bg-warning bg-opacity-10 text-warning'
                        }`}>
                          {m.current_approval || 'pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Signup bonuses */}
          {preview.bonuses.length > 0 && (
            <div className="px-6 pb-6">
              <h4 className="mb-2 text-sm font-semibold text-black dark:text-white">{t('admin.commissionImport.signupBonuses')} ({preview.bonuses.length})</h4>
              <div className="rounded-md border border-stroke dark:border-strokedark">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-meta-4">
                    <tr>
                      <th className="px-3 py-2 text-left">{t('admin.commissionImport.merchant')}</th>
                      <th className="px-3 py-2 text-center">{t('admin.commissionImport.matchedZentact')}</th>
                      <th className="px-3 py-2 text-right">{t('admin.commissionImport.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.bonuses.map((b, i) => (
                      <tr key={i} className="border-t border-stroke dark:border-strokedark">
                        <td className="px-3 py-1.5">{b.merchant}</td>
                        <td className="px-3 py-1.5 text-center">
                          {b.matched_zentact_id ? (
                            <span className="text-[10px] text-success">✓ {b.matched_zentact_id.slice(0, 12)}…</span>
                          ) : (
                            <span className="text-[10px] text-warning">{t('admin.commissionImport.noMatch')}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium">{fmt(b.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Detailed lists for not-found / skipped */}
          {preview.not_found.length > 0 && (
            <div className="px-6 pb-6">
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-danger">
                  {t('admin.commissionImport.notFoundDetails', { count: preview.not_found.length })}
                </summary>
                <div className="mt-2 max-h-32 overflow-auto text-xs text-body">
                  {preview.not_found.join(', ')}
                </div>
              </details>
            </div>
          )}
          {preview.skipped_zero.length > 0 && (
            <div className="px-6 pb-6">
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-warning">
                  {t('admin.commissionImport.skippedZeroDetails', { count: preview.skipped_zero.length })}
                </summary>
                <div className="mt-2 max-h-32 overflow-auto text-xs text-body">
                  {preview.skipped_zero.join(', ')}
                </div>
              </details>
            </div>
          )}
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
