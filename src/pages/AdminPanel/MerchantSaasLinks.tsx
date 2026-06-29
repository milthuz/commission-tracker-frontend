import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL;
const money = (n: number) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Row = {
  merchantAccountId: string; businessName: string; active: string;
  processingMonthly: number; saasMonthly: number; combinedMonthly: number;
  status: 'manual' | 'auto' | 'no_saas' | 'unmatched'; linkedCustomer: string | null;
};
type Customer = { customerName: string; subscriptionNumber: string | null; mrr: number };

// Admin tool (SH-14): match each Zentact payment merchant to its Zoho Billing SaaS customer so
// combined revenue per merchant is accurate. Auto-matches by name; admin curates the rest.
export default function MerchantSaasLinks() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'auto' | 'manual' | 'no_saas'>('unmatched');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  // Link modal
  const [linking, setLinking] = useState<Row | null>(null);
  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [custLoading, setCustLoading] = useState(false);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/merchant-links`, { headers: headers() });
      setRows(r.data.merchants || []);
      setSummary(r.data.summary || null);
    } catch { /* ignore */ } finally { setLoading(false); }
  };
  useEffect(() => { load().catch(() => {}); }, []);

  // Debounced customer search inside the link modal.
  useEffect(() => {
    if (!linking) return;
    const term = custQuery.trim();
    setCustLoading(true);
    const tmr = setTimeout(async () => {
      try {
        const r = await axios.get(`${API_URL}/api/admin/billing-customers`, { params: { q: term }, headers: headers() });
        setCustResults(r.data.customers || []);
      } catch { setCustResults([]); } finally { setCustLoading(false); }
    }, 300);
    return () => clearTimeout(tmr);
  }, [custQuery, linking]);

  const put = async (merchantId: string, body: any) => {
    setBusyId(merchantId);
    try {
      await axios.put(`${API_URL}/api/admin/merchant-links/${encodeURIComponent(merchantId)}`, body, { headers: headers() });
      await load();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); } finally { setBusyId(null); }
  };

  const openLink = (row: Row) => { setLinking(row); setCustQuery(row.businessName); setCustResults([]); };
  const chooseCustomer = async (c: Customer) => {
    const row = linking; if (!row) return;
    setLinking(null);
    await put(row.merchantAccountId, { customerName: c.customerName, subscriptionNumber: c.subscriptionNumber });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => (filter === 'all' || r.status === filter) && (!q || r.businessName.toLowerCase().includes(q)));
  }, [rows, filter, search]);

  const badge = (s: Row['status']) => {
    const map: Record<string, string> = {
      manual: 'bg-primary/10 text-primary',
      auto: 'bg-success/15 text-success',
      no_saas: 'bg-body/10 text-body',
      unmatched: 'bg-warning/15 text-[#9D5425] dark:text-warning',
    };
    return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[s]}`}>{t(`admin.merchantLinks.status_${s}`)}</span>;
  };

  const filterBtn = (key: typeof filter, n?: number) => (
    <button onClick={() => setFilter(key)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${filter === key ? 'bg-primary text-white' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`}>
      {t(`admin.merchantLinks.filter_${key}`)}{typeof n === 'number' ? ` (${n})` : ''}
    </button>
  );

  return (
    <div className="space-y-5">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([['total', summary.total], ['manual', summary.manual], ['auto', summary.auto], ['no_saas', summary.noSaas], ['unmatched', summary.unmatched]] as [string, number][]).map(([k, v]) => (
            <div key={k} className="rounded-sm border border-stroke bg-white px-4 py-3 dark:border-strokedark dark:bg-boxdark">
              <p className="text-xl font-bold text-black dark:text-white">{v}</p>
              <p className="text-xs text-body">{t(`admin.merchantLinks.summary_${k}`)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-stroke bg-white p-1 dark:border-strokedark dark:bg-boxdark">
          {filterBtn('unmatched', summary?.unmatched)}{filterBtn('auto', summary?.auto)}{filterBtn('manual', summary?.manual)}{filterBtn('no_saas', summary?.noSaas)}{filterBtn('all', summary?.total)}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('admin.merchantLinks.searchPlaceholder') as string}
          className="ml-auto w-60 rounded-md border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:text-white" />
      </div>

      <div className="overflow-x-auto rounded-md border border-stroke dark:border-strokedark">
        <table className="w-full min-w-[44rem] table-auto text-sm">
          <thead>
            <tr className="bg-gray-2 text-left dark:bg-meta-4">
              <th className="px-4 py-3 font-medium text-black dark:text-white">{t('admin.merchantLinks.colMerchant')}</th>
              <th className="px-4 py-3 font-medium text-black dark:text-white">{t('admin.merchantLinks.colStatus')}</th>
              <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('admin.merchantLinks.colProcessing')}</th>
              <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('admin.merchantLinks.colSaas')}</th>
              <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('admin.merchantLinks.colCombined')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-body">…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-body">{t('admin.merchantLinks.none')}</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.merchantAccountId} className="border-t border-stroke dark:border-strokedark">
                <td className="px-4 py-3">
                  <div className="font-medium text-black dark:text-white">{r.businessName || r.merchantAccountId}</div>
                  {r.linkedCustomer && <div className="text-xs text-body">→ {r.linkedCustomer}</div>}
                </td>
                <td className="px-4 py-3">{badge(r.status)}</td>
                <td className="px-4 py-3 text-right text-body">{money(r.processingMonthly)}</td>
                <td className="px-4 py-3 text-right text-body">{money(r.saasMonthly)}</td>
                <td className="px-4 py-3 text-right font-semibold text-primary">{money(r.combinedMonthly)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <button onClick={() => openLink(r)} disabled={busyId === r.merchantAccountId}
                    className="mr-2 rounded bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
                    {r.status === 'manual' || r.status === 'auto' ? t('admin.merchantLinks.relink') : t('admin.merchantLinks.link')}
                  </button>
                  {r.status !== 'no_saas' && (
                    <button onClick={() => put(r.merchantAccountId, { noSaas: true })} disabled={busyId === r.merchantAccountId}
                      className="mr-2 text-xs font-medium text-body hover:underline">{t('admin.merchantLinks.noSaas')}</button>
                  )}
                  {(r.status === 'manual' || r.status === 'no_saas') && (
                    <button onClick={() => put(r.merchantAccountId, { clear: true })} disabled={busyId === r.merchantAccountId}
                      className="text-xs font-medium text-danger hover:underline">{t('admin.merchantLinks.clear')}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Link modal: search Billing customers */}
      {linking && (
        <div className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex items-start justify-between border-b border-stroke px-5 py-3 dark:border-strokedark">
              <div>
                <h3 className="font-semibold text-black dark:text-white">{t('admin.merchantLinks.linkTitle', { name: linking.businessName })}</h3>
                <p className="text-xs text-body">{t('admin.merchantLinks.linkHint')}</p>
              </div>
              <button onClick={() => setLinking(null)} aria-label={t('common.close') as string}
                className="ml-3 shrink-0 rounded-lg p-1.5 text-body hover:bg-gray-1 hover:text-black dark:hover:bg-meta-4 dark:hover:text-white">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4">
              <input autoFocus value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder={t('admin.merchantLinks.searchCustomer') as string}
                className="w-full rounded-md border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:text-white" />
            </div>
            <div className="max-h-[50vh] overflow-y-auto px-2 pb-3">
              {custLoading ? <p className="px-3 py-4 text-sm text-body">…</p>
                : custResults.length === 0 ? <p className="px-3 py-4 text-sm text-body">{t('admin.merchantLinks.noCustomers')}</p>
                : custResults.map((c) => (
                  <button key={c.customerName + (c.subscriptionNumber || '')} onClick={() => chooseCustomer(c)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-gray-1 dark:hover:bg-meta-4">
                    <span className="text-black dark:text-white">{c.customerName}</span>
                    <span className="text-xs text-body">{money(c.mrr)}/mo</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
