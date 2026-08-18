import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL;

type Deal = {
  dealId: string; dealName: string; accountName: string; ownerName: string;
  leadSourceGroup: string | null; points: number; soldDate: string;
  excluded: boolean; exclusionReason: string | null;
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

  // The search box shows nothing until you type, so without this an exclusion becomes
  // invisible the moment it is made — you would have to remember the deal's name to undo it.
  // The standing list is what makes the feature reversible in practice, not just in theory.
  const [excludedList, setExcludedList] = useState<any[]>([]);
  const loadExcluded = async () => {
    try {
      const r = await axios.get(`${API_URL}/api/crm/excluded-deals`, { headers: headers() });
      setExcludedList(r.data.deals || []);
    } catch { /* the tab still works without it */ }
  };
  useEffect(() => { loadExcluded(); }, []);

  const search = async () => {
    if (q.trim().length < 2) return;
    setSearching(true);
    setSearched(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/deals-search`, { params: { q: q.trim() }, headers: headers() });
      const rows: Deal[] = (r.data.deals || []).map((d: any) => ({
        dealId: d.deal_id, dealName: d.deal_name, accountName: d.account_name, ownerName: d.owner_name,
        leadSourceGroup: d.lead_source_group, points: d.points, soldDate: d.sold_date,
        excluded: !!d.excluded, exclusionReason: d.exclusion_reason || null,
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

  // Excluding does not delete the deal — it stops counting toward points (annual, monthly,
  // per-rep and the quota gate). Reversible, which is why the same button puts it back.
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // Excluding opens a small dedicated window because a REASON matters here: six months on,
  // "who removed this deal and why" is the only thing that makes the decision reviewable.
  // The app's shared dialog only does confirm/alert, hence the local modal.
  // Restoring keeps the plain confirm — there is nothing to justify in giving points back.
  const [excludeModal, setExcludeModal] = useState<{ deal: Deal; reason: string } | null>(null);

  const applyExclusion = async (d: Deal, next: boolean, reason?: string) => {
    setTogglingId(d.dealId);
    try {
      await axios.post(`${API_URL}/api/crm/deals/${encodeURIComponent(d.dealId)}/exclude`,
        { excluded: next, reason: reason || undefined }, { headers: headers() });
      setDeals(ds => ds.map(x => x.dealId === d.dealId ? { ...x, excluded: next, exclusionReason: reason || null } : x));
      setExcludeModal(null);
      loadExcluded();
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || (t('admin.deals.saveError') as string));
    } finally {
      setTogglingId(null);
    }
  };

  const toggleExclude = async (d: Deal) => {
    if (!d.excluded) { setExcludeModal({ deal: d, reason: '' }); return; }
    const ok = await dialog.confirm(
      t('admin.deals.confirmRestore', { deal: d.dealName, points: d.points, rep: d.ownerName || '—' }) as string);
    if (ok) await applyExclusion(d, false);
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

        {excludedList.length > 0 && (
          <div className="mb-5 rounded-md border border-danger/30 bg-danger/5 p-4">
            <h4 className="mb-2 text-sm font-semibold text-black dark:text-white">
              {t('admin.deals.currentlyExcluded', { count: excludedList.length })}
            </h4>
            <ul className="flex flex-col gap-1.5">
              {excludedList.map((x: any) => (
                <li key={x.deal_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-body dark:text-bodydark">
                    <span className="font-medium text-black dark:text-white">{x.deal_name}</span>
                    {' · '}{x.owner_name || '—'}{' · '}{x.points ?? '?'} pt
                    {x.excluded_by ? ` · ${x.excluded_by}` : ''}
                    {x.reason ? <span className="block text-xs italic text-body dark:text-bodydark">{x.reason}</span> : null}
                  </span>
                  <button
                    onClick={() => toggleExclude({
                      dealId: x.deal_id, dealName: x.deal_name, accountName: '',
                      ownerName: x.owner_name || '', leadSourceGroup: null,
                      points: x.points ?? 0, soldDate: x.sold_date || '',
                      excluded: true, exclusionReason: x.reason || null,
                    })}
                    disabled={togglingId === x.deal_id}
                    className="whitespace-nowrap rounded-md border border-stroke px-3 py-1 text-xs font-medium text-body hover:border-primary hover:text-primary disabled:opacity-40 dark:border-strokedark"
                  >
                    {t('admin.deals.restore')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

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
                    <tr key={d.dealId} className={`border-t border-stroke dark:border-strokedark ${d.excluded ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-medium text-black dark:text-white ${d.excluded ? 'line-through' : ''}`}>{d.dealName}</span>
                          {d.excluded && (
                            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
                              {t('admin.deals.excludedBadge')}
                            </span>
                          )}
                        </div>
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
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => save(d.dealId)}
                            disabled={!changed || savingId === d.dealId}
                            className="whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90 disabled:opacity-40"
                          >
                            {savingId === d.dealId ? t('common.saving') : t('common.save')}
                          </button>
                          <button
                            onClick={() => toggleExclude(d)}
                            disabled={togglingId === d.dealId}
                            className={`whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                              d.excluded
                                ? 'border-stroke text-body hover:border-primary hover:text-primary dark:border-strokedark'
                                : 'border-danger/40 text-danger hover:bg-danger/5'}`}
                          >
                            {t(d.excluded ? 'admin.deals.restore' : 'admin.deals.exclude')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {excludeModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={() => togglingId === null && setExcludeModal(null)}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-semibold text-black dark:text-white">
              {t('admin.deals.excludeTitle')}
            </h3>
            <p className="mb-4 text-sm text-body">
              {t('admin.deals.confirmExclude', {
                deal: excludeModal.deal.dealName,
                points: excludeModal.deal.points,
                rep: excludeModal.deal.ownerName || '—',
              })}
            </p>

            <label className="mb-1 block text-xs font-medium text-body">{t('admin.deals.reasonLabel')}</label>
            <textarea
              rows={3}
              autoFocus
              value={excludeModal.reason}
              onChange={(e) => setExcludeModal(m => (m ? { ...m, reason: e.target.value } : m))}
              placeholder={t('admin.deals.reasonPlaceholder') as string}
              className="w-full resize-y rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:text-white"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setExcludeModal(null)}
                disabled={togglingId !== null}
                className="rounded border border-stroke px-4 py-2 text-sm text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => applyExclusion(excludeModal.deal, true, excludeModal.reason.trim())}
                disabled={togglingId !== null}
                className="rounded bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
              >
                {togglingId !== null ? t('common.saving') : t('admin.deals.exclude')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
