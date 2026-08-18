import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import InvoiceLink from '../../components/InvoiceLink';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface UserReport {
  id: number;
  report_type: 'missing_commission' | 'missing_points' | 'feature_request';
  reporter_email: string | null;
  reporter_name: string | null;
  reference: string | null;
  period: string | null;
  message: string;
  created_at: string;
  // Filled by the automatic diagnosis (runs on arrival, re-runnable). Null while it has
  // not run yet — an older report, or the very first seconds after it was filed.
  verdict: string | null;
  evidence: Record<string, unknown> | null;
  ai_note: string | null;
  likely_resolved: boolean | null;
  investigated_at: string | null;
}
interface HealthData {
  totalIssues: number;
  generatedAt: string;
  issues: {
    unassignedResellerActivations: number;
    unassignedInvoices: { count: number; totalCommission: number; items: { invoice_number: string; customer_name: string; commission: number; date: string }[] };
    unassignedZentactMerchants: number;
    repsNoRole: { count: number; names: string[] };
    unmappedResellerEmails: number;
    userReports: { count: number; items: UserReport[] };
    staleActiveMerchants: {
      count: number;
      neverEarned: number;
      items: { merchant_account_id: string; business_name: string; sales_rep_name: string;
               activated_at: string; last_period: number | null; never_earned: boolean }[];
    };
  };
}

// Admin "Needs attention" (À corriger): a card per auto-detected data-quality signal (each
// links to where it gets fixed) + a list of user-submitted reports (resolve inline).
// Rendered as a section inside the Admin Panel. Backed by GET /api/admin/data-health.
const DataHealth: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = async (fresh = false) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/admin/data-health${fresh ? '?fresh=1' : ''}`, { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
    } catch (e: any) {
      setError(t('dataHealth.error') as string);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(false); }, []);

  // Résoudre ouvre d'abord une fenêtre : le vendeur reçoit maintenant un courriel,
  // et « c'est corrigé » sans dire QUOI l'oblige à aller vérifier lui-même.
  // La note reste facultative — on ne bloque pas une résolution pour ça.
  const [resolveModal, setResolveModal] = useState<{ id: number; who: string; note: string; type: string; verdict: string | null } | null>(null);

  // Replies are keyed by the DIAGNOSED CASE first: once we know it is a renewal, offering
  // five generic answers is noise. The report-type list is only the fallback for reports the
  // diagnosis has not covered — older ones, or a verdict with no phrasing written yet.
  const repliesFor = (reportType: string, verdict: string | null): string[] => {
    const byVerdict = verdict
      ? (t(`dataHealth.reports.verdictReplies.${verdict}`, { returnObjects: true, defaultValue: [] }) as unknown as string[])
      : [];
    if (Array.isArray(byVerdict) && byVerdict.length) return byVerdict;
    const byType = t(`dataHealth.reports.quickReplies.${reportType}`, { returnObjects: true, defaultValue: [] }) as unknown as string[];
    return Array.isArray(byType) ? byType : [];
  };

  const quickReplies: string[] = resolveModal ? repliesFor(resolveModal.type, resolveModal.verdict) : [];

  // The diagnosis picks which canned reply fits; opening the modal starts from it rather
  // than a blank box. The AI note is deliberately NOT used here — it is a lead for the
  // admin, not something to send to the rep.
  const suggestedNote = (rep: UserReport): string =>
    rep.verdict ? (repliesFor(rep.report_type, rep.verdict)[0] || '') : '';

  const [investigating, setInvestigating] = useState<number | null>(null);
  const reinvestigate = async (id: number) => {
    setInvestigating(id);
    try {
      const r = await fetch(`${API_URL}/api/admin/user-reports/${id}/investigate`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      });
      if (!r.ok) throw new Error(String(r.status));
      await load(true);
    } catch {
      dialog.alert(t('dataHealth.error') as string);
    } finally { setInvestigating(null); }
  };

  const resolveReport = async (id: number, note: string) => {
    setResolving(id);
    try {
      const r = await fetch(`${API_URL}/api/admin/user-reports/${id}/resolve`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const out = await r.json();
      setResolveModal(null);
      // On dit franchement si l'avis n'est pas parti (pas de courriel au dossier,
      // SMTP muet…). Annoncer « résolu » en taisant l'échec ferait croire à
      // l'admin que le vendeur est au courant.
      if (out.notified === false && out.reason !== 'already_resolved') {
        dialog.alert(t('dataHealth.reports.notifyFailed', { reason: out.reason || '—' }) as string);
      }
      await load(true);
    } catch { setError(t('dataHealth.error') as string); }
    finally { setResolving(null); }
  };

  // Export to Excel — a .xls (HTML-table) file Excel opens natively, no dependency. Pulls the
  // richer /api/admin/unassigned-invoices (suggested rep from same-customer/CRM/Zentact matching)
  // rather than the lighter data-health list, since the whole point is fixing attribution in Zoho.
  const exportUnassignedInvoices = async () => {
    setExporting(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/unassigned-invoices`, { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const { rows } = await r.json();
      const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const head = ['Invoice', 'Customer', 'Date', 'Commission', 'Status', 'Suggested rep', 'Source'];
      const html = [
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">',
        `<tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`,
        ...rows.map((r: any) => `<tr><td>${esc(r.invoice_number)}</td><td>${esc(r.customer_name)}</td><td>${esc(r.invoice_date)}</td><td>${r.commission}</td><td>${esc(r.commission_status)}</td><td>${esc(r.suggested_rep || '')}</td><td>${esc(r.suggestion_source || '')}</td></tr>`),
        '</table></body></html>',
      ].join('');
      const blob = new Blob(['﻿', html], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Unassigned_Invoices_${new Date().toISOString().slice(0, 10)}.xls`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t('dataHealth.error') as string);
    } finally { setExporting(false); }
  };

  const i = data?.issues;
  const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD' }).format(n || 0);

  const cards = i ? [
    { key: 'resellerActivations', count: i.unassignedResellerActivations, to: '/reseller', detail: undefined as string | undefined, expandable: false },
    { key: 'invoices', count: i.unassignedInvoices.count, to: undefined as string | undefined,
      detail: i.unassignedInvoices.count > 0 ? t('dataHealth.cards.invoices.amount', { amount: money(i.unassignedInvoices.totalCommission) }) as string : undefined,
      expandable: i.unassignedInvoices.items.length > 0 },
    { key: 'zentactMerchants', count: i.unassignedZentactMerchants, to: '/commission-tracker', detail: undefined, expandable: false },
    { key: 'repsNoRole', count: i.repsNoRole.count, to: '/admin/users',
      detail: undefined, expandable: i.repsNoRole.count > 0 },
    { key: 'resellerEmails', count: i.unmappedResellerEmails, to: '/admin/resellers', detail: undefined, expandable: false },
    { key: 'staleMerchants', count: i.staleActiveMerchants.count, to: undefined as string | undefined,
      detail: i.staleActiveMerchants.neverEarned > 0
        ? t('dataHealth.cards.staleMerchants.never', { count: i.staleActiveMerchants.neverEarned }) as string
        : undefined,
      expandable: i.staleActiveMerchants.items.length > 0 },
  ] : [];

  const reports = i?.userReports.items || [];

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4"
        >
          <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          {t('dataHealth.refresh')}
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

      {!data && loading && (
        <div className="flex items-center justify-center rounded-xl border border-stroke bg-white p-10 dark:border-strokedark dark:bg-boxdark">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {data && data.totalIssues === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <svg className="h-7 w-7 text-success" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          </div>
          <p className="text-lg font-semibold text-black dark:text-white">{t('dataHealth.allClearTitle')}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dataHealth.allClearHint')}</p>
        </div>
      )}

      {data && data.totalIssues > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => {
              const ok = c.count === 0;
              return (
                <div key={c.key} className={`flex flex-col rounded-xl border bg-white p-5 shadow-default dark:bg-boxdark ${ok ? 'border-stroke dark:border-strokedark' : 'border-warning/40'}`}>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <span className="text-sm font-medium text-black dark:text-white">{t(`dataHealth.cards.${c.key}.title`)}</span>
                    <span className={`inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-0.5 text-sm font-bold ${ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>{c.count}</span>
                  </div>
                  <p className="mb-3 flex-1 text-xs text-gray-500 dark:text-gray-400">{t(`dataHealth.cards.${c.key}.desc`)}</p>
                  {c.detail && <p className="mb-3 rounded-md bg-gray-1 px-2.5 py-1.5 text-xs text-body dark:bg-meta-4 dark:text-bodydark">{c.detail}</p>}
                  <div className="flex items-center gap-4">
                    {/* Expandable cards (invoices, reps) → the list IS the main action (primary) */}
                    {c.expandable && (
                      <button onClick={() => setExpanded(expanded === c.key ? null : c.key)} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                        {expanded === c.key ? t('dataHealth.cards.hide') : t('dataHealth.cards.view')}
                        <svg className={`h-3.5 w-3.5 transition-transform ${expanded === c.key ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    )}
                    {/* A real fix destination (when one exists) */}
                    {ok ? (
                      <span className="text-sm font-medium text-gray-400">{t('dataHealth.cards.resolved')}</span>
                    ) : c.to ? (
                      <NavLink to={c.to} className={`inline-flex items-center gap-1.5 text-sm font-medium ${c.expandable ? 'text-body hover:text-primary' : 'text-primary hover:underline'}`}>
                        {t('dataHealth.cards.fix')}
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                      </NavLink>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expanded detail lists */}
          {expanded === 'invoices' && i && (
            <div className="mt-4 overflow-hidden rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="flex items-start justify-between gap-3 border-b border-stroke px-5 py-3 dark:border-strokedark">
                <div>
                  <h4 className="text-sm font-semibold text-black dark:text-white">{t('dataHealth.cards.invoices.title')}</h4>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t('dataHealth.invoiceList.hint')}</p>
                </div>
                <button
                  onClick={exportUnassignedInvoices}
                  disabled={exporting}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  {exporting ? t('dataHealth.invoiceList.exporting') : t('dataHealth.invoiceList.export')}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-stroke text-left text-xs text-gray-500 dark:border-strokedark">
                      <th className="px-5 py-2 font-medium">{t('dataHealth.invoiceList.invoice')}</th>
                      <th className="px-5 py-2 font-medium">{t('dataHealth.invoiceList.customer')}</th>
                      <th className="px-5 py-2 font-medium">{t('dataHealth.invoiceList.date')}</th>
                      <th className="px-5 py-2 text-right font-medium">{t('dataHealth.invoiceList.commission')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {i.unassignedInvoices.items.map((inv) => (
                      <tr key={inv.invoice_number} className="border-b border-stroke last:border-0 dark:border-strokedark">
                        <td className="whitespace-nowrap px-5 py-2"><InvoiceLink number={inv.invoice_number} className="font-medium text-primary hover:underline" /></td>
                        <td className="px-5 py-2 text-body dark:text-bodydark">{inv.customer_name}</td>
                        <td className="whitespace-nowrap px-5 py-2 text-body dark:text-bodydark">{inv.date}</td>
                        <td className="whitespace-nowrap px-5 py-2 text-right text-body dark:text-bodydark">{money(inv.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {expanded === 'staleMerchants' && i && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-stroke dark:border-strokedark">
                  <tr className="text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-2.5 font-medium">{t('dataHealth.cards.staleMerchants.colMerchant')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('dataHealth.cards.staleMerchants.colRep')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('dataHealth.cards.staleMerchants.colActivated')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('dataHealth.cards.staleMerchants.colLast')}</th>
                  </tr>
                </thead>
                <tbody>
                  {i.staleActiveMerchants.items.map((m) => (
                    <tr key={m.merchant_account_id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                      <td className="px-4 py-2.5 text-black dark:text-white">{m.business_name}</td>
                      <td className="px-4 py-2.5 text-body dark:text-bodydark">{m.sales_rep_name || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-body dark:text-bodydark">{String(m.activated_at).slice(0, 10)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {m.never_earned
                          ? <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">{t('dataHealth.cards.staleMerchants.neverBadge')}</span>
                          : <span className="text-body dark:text-bodydark">{String(m.last_period).slice(0, 4)}-{String(m.last_period).slice(4)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {expanded === 'repsNoRole' && i && (
            <div className="mt-4 rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
              <h4 className="mb-2 text-sm font-semibold text-black dark:text-white">{t('dataHealth.cards.repsNoRole.title')}</h4>
              <div className="flex flex-wrap gap-2">
                {i.repsNoRole.names.map((n) => (
                  <span key={n} className="rounded-full bg-gray-1 px-2.5 py-1 text-xs text-body dark:bg-meta-4 dark:text-bodydark">{n}</span>
                ))}
              </div>
            </div>
          )}

          {reports.length > 0 && (
            <div className="mt-6 rounded-xl border border-warning/40 bg-white shadow-default dark:bg-boxdark">
              <div className="border-b border-stroke px-5 py-3 dark:border-strokedark">
                <h4 className="text-sm font-semibold text-black dark:text-white">
                  {t('dataHealth.reports.title')} <span className="text-danger">({reports.length})</span>
                </h4>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t('dataHealth.reports.subtitle')}</p>
              </div>
              <ul className="divide-y divide-stroke dark:divide-strokedark">
                {reports.map((rep) => (
                  <li key={rep.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${rep.report_type === 'feature_request' ? 'bg-[#6366F1]/10 text-[#6366F1]' : rep.report_type === 'missing_points' ? 'bg-primary/10 text-primary' : 'bg-warning/15 text-[#9D5425] dark:text-warning'}`}>
                          {t(`dataHealth.reports.type.${rep.report_type}`)}
                        </span>
                        <span className="text-sm font-medium text-black dark:text-white">{rep.reporter_name || rep.reporter_email || '—'}</span>
                        {rep.period && <span className="text-xs text-gray-500">· {rep.period}</span>}
                        {rep.reference && <span className="text-xs text-gray-500">· {rep.reference}</span>}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-body dark:text-bodydark">{rep.message}</p>

                      {/* The automatic diagnosis. Green when it believes nothing is actually
                          missing, amber when something needs doing. Evidence is shown raw and
                          on purpose — the point is that an admin can VERIFY the verdict rather
                          than trust it. */}
                      {rep.verdict ? (
                        <div className={`mt-2 rounded-md border-l-2 py-1.5 pl-2.5 ${rep.likely_resolved ? 'border-[#10B981] bg-[#10B981]/5' : 'border-warning bg-warning/5'}`}>
                          <div className="flex flex-wrap items-center gap-x-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                              {t('dataHealth.reports.investigation')}
                            </span>
                            <span className="text-xs font-medium text-black dark:text-white">
                              {t(`dataHealth.reports.verdict.${rep.verdict}`, { defaultValue: rep.verdict })}
                            </span>
                          </div>
                          {rep.evidence && Object.keys(rep.evidence).length > 0 && (
                            <p className="mt-0.5 break-words text-[11px] leading-snug text-body dark:text-bodydark">
                              {Object.entries(rep.evidence).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
                            </p>
                          )}
                          {rep.ai_note && (
                            <p className="mt-1 break-words text-[11px] italic leading-snug text-body dark:text-bodydark">
                              {t('dataHealth.reports.aiNote')} — {rep.ai_note}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] italic text-gray-400">{t('dataHealth.reports.pending')}</p>
                      )}

                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[11px] text-gray-400">{new Date(rep.created_at).toLocaleString()}</span>
                        <button
                          onClick={() => reinvestigate(rep.id)}
                          disabled={investigating === rep.id}
                          className="text-[11px] text-primary hover:underline disabled:opacity-50"
                        >
                          {investigating === rep.id ? t('dataHealth.reports.investigating') : t('dataHealth.reports.reinvestigate')}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => setResolveModal({ id: rep.id, who: rep.reporter_name || rep.reporter_email || '—', note: suggestedNote(rep), type: rep.report_type, verdict: rep.verdict })}
                      disabled={resolving === rep.id}
                      className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      {resolving === rep.id ? t('dataHealth.reports.resolving') : t('dataHealth.reports.resolve')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {data && <p className="mt-4 text-xs text-gray-400">{t('dataHealth.lastChecked', { time: new Date(data.generatedAt).toLocaleTimeString() })}</p>}

      {resolveModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={() => resolving === null && setResolveModal(null)}
        >
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-semibold text-black dark:text-white">
              {t('dataHealth.reports.resolveTitle')}
            </h3>
            <p className="mb-4 text-sm text-body">
              {t('dataHealth.reports.resolveSubtitle', { who: resolveModal.who })}
            </p>

            {/* Canned answers for the causes that actually recur — wrong rep in Zentact, per-location
                units, frozen commissions, renewals at 0%. Clicking one fills the box so the common
                case is a two-click resolve; the text stays editable afterwards. Appends rather than
                overwrites, so a half-typed note is never destroyed. */}
            {quickReplies.length > 0 && (
              <div className="mb-3">
                <span className="mb-1 block text-xs font-medium text-body">
                  {t('dataHealth.reports.quickTitle')}
                </span>
                <div className="flex max-h-36 flex-col gap-1 overflow-y-auto pr-1">
                  {quickReplies.map((s, k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setResolveModal(m => (m ? { ...m, note: m.note.trim() ? `${m.note.trim()}\n${s}` : s } : m))}
                      className="rounded border border-stroke px-2.5 py-1.5 text-left text-xs leading-snug text-body hover:border-primary hover:bg-gray-1 dark:border-strokedark dark:text-bodydark dark:hover:bg-meta-4"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="mb-1 block text-xs font-medium text-body">
              {t('dataHealth.reports.noteLabel')}
            </label>
            <textarea
              rows={4}
              autoFocus
              value={resolveModal.note}
              onChange={(e) => setResolveModal(m => (m ? { ...m, note: e.target.value } : m))}
              placeholder={t('dataHealth.reports.notePlaceholder') as string}
              className="w-full resize-y rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:text-white"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setResolveModal(null)}
                disabled={resolving !== null}
                className="rounded border border-stroke px-4 py-2 text-sm text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => resolveReport(resolveModal.id, resolveModal.note.trim())}
                disabled={resolving !== null}
                className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
              >
                {resolving !== null ? t('dataHealth.reports.resolving') : t('dataHealth.reports.resolveAndNotify')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataHealth;
