import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface HealthData {
  totalIssues: number;
  generatedAt: string;
  issues: {
    unassignedResellerActivations: number;
    unassignedInvoices: { count: number; totalCommission: number };
    unassignedZentactMerchants: number;
    repsNoRole: { count: number; names: string[] };
    unmappedResellerEmails: number;
  };
}

// Admin "Needs attention" (À corriger): one card per data-quality signal, each with a
// count and a link to the screen where it gets fixed. Backed by GET /api/admin/data-health.
const DataHealth: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const i = data?.issues;
  const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD' }).format(n || 0);

  const cards = i ? [
    {
      key: 'resellerActivations',
      count: i.unassignedResellerActivations,
      to: '/reseller',
      detail: undefined as string | undefined,
    },
    {
      key: 'invoices',
      count: i.unassignedInvoices.count,
      to: '/admin/import-payments',
      detail: i.unassignedInvoices.count > 0 ? t('dataHealth.cards.invoices.amount', { amount: money(i.unassignedInvoices.totalCommission) }) as string : undefined,
    },
    {
      key: 'zentactMerchants',
      count: i.unassignedZentactMerchants,
      to: '/commission-tracker',
      detail: undefined,
    },
    {
      key: 'repsNoRole',
      count: i.repsNoRole.count,
      to: '/admin/users',
      detail: i.repsNoRole.count > 0 ? i.repsNoRole.names.join(', ') : undefined,
    },
    {
      key: 'resellerEmails',
      count: i.unmappedResellerEmails,
      to: '/admin/resellers',
      detail: undefined,
    },
  ] : [];

  return (
    <div className="mx-auto max-w-screen-xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white">{t('dataHealth.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('dataHealth.subtitle')}</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4"
        >
          <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          {t('dataHealth.refresh')}
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

      {!data && loading && (
        <div className="flex items-center justify-center rounded-xl border border-stroke bg-white p-10 dark:border-strokedark dark:bg-boxdark">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => {
            const ok = c.count === 0;
            return (
              <div
                key={c.key}
                className={`flex flex-col rounded-xl border bg-white p-5 shadow-default dark:bg-boxdark ${
                  ok ? 'border-stroke dark:border-strokedark' : 'border-warning/40'
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-black dark:text-white">{t(`dataHealth.cards.${c.key}.title`)}</span>
                  <span className={`inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-0.5 text-sm font-bold ${
                    ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                  }`}>{c.count}</span>
                </div>
                <p className="mb-3 flex-1 text-xs text-gray-500 dark:text-gray-400">{t(`dataHealth.cards.${c.key}.desc`)}</p>
                {c.detail && (
                  <p className="mb-3 rounded-md bg-gray-1 px-2.5 py-1.5 text-xs text-body dark:bg-meta-4 dark:text-bodydark">{c.detail}</p>
                )}
                <NavLink
                  to={c.to}
                  className={`inline-flex items-center gap-1.5 self-start text-sm font-medium ${ok ? 'text-gray-400 pointer-events-none' : 'text-primary hover:underline'}`}
                >
                  {ok ? t('dataHealth.cards.resolved') : t('dataHealth.cards.fix')}
                  {!ok && <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>}
                </NavLink>
              </div>
            );
          })}
        </div>
      )}

      {data && (
        <p className="mt-4 text-xs text-gray-400">{t('dataHealth.lastChecked', { time: new Date(data.generatedAt).toLocaleTimeString() })}</p>
      )}
    </div>
  );
};

export default DataHealth;
