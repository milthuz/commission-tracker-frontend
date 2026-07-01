import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL;

type Deal = {
  dealId: string; dealName: string; accountName: string; ownerName: string;
  leadSourceGroup: string | null; points: number; soldDate: string;
};

const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString();
const monthLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

// Move a deal (and its points) to a different month — e.g. a deal submitted last month but only
// synced from Zoho this month because of an internal delay. sold_date is the single column that
// decides which month's points/quota a deal counts toward (see /api/crm/points); it's otherwise
// immutable across CRM re-syncs, so a correction made here sticks.
export default function DealsAdmin() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const search = async () => {
    if (q.trim().length < 2) return;
    setSearching(true);
    setSearched(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/deals-search`, { params: { q: q.trim() }, headers: headers() });
      const rows: Deal[] = (r.data.deals || []).map((d: any) => ({
        dealId: d.deal_id, dealName: d.deal_name, accountName: d.account_name, ownerName: d.owner_name,
        leadSourceGroup: d.lead_source_group, points: d.points, soldDate: d.sold_date,
      }));
      setDeals(rows);
      const initEdit: Record<string, string> = {};
      rows.forEach(d => { initEdit[d.dealId] = d.soldDate; });
      setEditing(initEdit);
    } catch {
      dialog.alert(t('admin.deals.searchError') as string);
    } finally {
      setSearching(false);
    }
  };

  const shiftToPreviousMonth = (dealId: string, current: string) => {
    const d = new Date(current + 'T00:00:00');
    d.setMonth(d.getMonth() - 1);
    setEditing(e => ({ ...e, [dealId]: d.toISOString().slice(0, 10) }));
  };

  const save = async (dealId: string) => {
    const soldDate = editing[dealId];
    if (!soldDate) return;
    setSavingId(dealId);
    try {
      await axios.patch(`${API_URL}/api/crm/sold-deals-db/${encodeURIComponent(dealId)}`, { soldDate }, { headers: headers() });
      setDeals(ds => ds.map(d => d.dealId === dealId ? { ...d, soldDate } : d));
      dialog.alert(t('admin.deals.saved') as string);
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || (t('admin.deals.saveError') as string));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
        <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.deals.title')}</h3>
        <p className="text-sm text-body mt-1">{t('admin.deals.subtitle')}</p>
      </div>

      <div className="p-7">
        <div className="mb-5 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder={t('admin.deals.searchPlaceholder') as string}
            className="grow max-w-md rounded-md border border-stroke bg-transparent px-4 py-2 text-sm text-black outline-none transition focus:border-primary dark:border-strokedark dark:text-white"
          />
          <button
            onClick={search}
            disabled={searching || q.trim().length < 2}
            className="whitespace-nowrap rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
          >
            {searching ? t('admin.deals.searching') : t('admin.deals.search')}
          </button>
        </div>

        {searched && !searching && deals.length === 0 && (
          <p className="text-sm text-body">{t('admin.deals.noResults')}</p>
        )}

        {deals.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-stroke dark:border-strokedark">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="bg-gray-2 text-left dark:bg-meta-4">
                  <th className="px-4 py-3 font-medium text-black dark:text-white">{t('admin.deals.colDeal')}</th>
                  <th className="px-4 py-3 font-medium text-black dark:text-white">{t('admin.deals.colRep')}</th>
                  <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('admin.deals.colPoints')}</th>
                  <th className="px-4 py-3 font-medium text-black dark:text-white">{t('admin.deals.colCurrentMonth')}</th>
                  <th className="px-4 py-3 font-medium text-black dark:text-white">{t('admin.deals.colNewDate')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {deals.map(d => {
                  const draft = editing[d.dealId] ?? d.soldDate;
                  const changed = draft !== d.soldDate;
                  return (
                    <tr key={d.dealId} className="border-t border-stroke dark:border-strokedark">
                      <td className="px-4 py-3">
                        <div className="font-medium text-black dark:text-white">{d.dealName}</div>
                        <div className="text-xs text-body">{d.accountName}</div>
                      </td>
                      <td className="px-4 py-3 text-body">{d.ownerName || '—'}</td>
                      <td className="px-4 py-3 text-right text-body">{d.points}</td>
                      <td className="px-4 py-3 text-body">
                        {monthLabel(d.soldDate)}
                        <span className="block text-xs text-gray-400">{fmtDate(d.soldDate)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={draft}
                            onChange={(e) => setEditing(ed => ({ ...ed, [d.dealId]: e.target.value }))}
                            className="rounded border border-stroke bg-transparent px-2 py-1 text-sm outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => shiftToPreviousMonth(d.dealId, d.soldDate)}
                            title={t('admin.deals.moveToPrevMonth') as string}
                            className="whitespace-nowrap rounded border border-stroke px-2 py-1 text-xs text-body hover:border-primary hover:text-primary dark:border-strokedark"
                          >
                            {t('admin.deals.moveToPrevMonthShort')}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => save(d.dealId)}
                          disabled={!changed || savingId === d.dealId}
                          className="whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90 disabled:opacity-40"
                        >
                          {savingId === d.dealId ? t('common.saving') : t('common.save')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
