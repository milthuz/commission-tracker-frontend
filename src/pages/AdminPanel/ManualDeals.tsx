import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import Select from '../../components/Select';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL;

type ManualDeal = {
  deal_id: string; deal_name: string; account_name: string; owner_name: string;
  lead_source_group: string; points: number; sold_date: string;
  manual_note: string | null; manual_created_by: string | null;
};

const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString();
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// POS points for a sale that has no Zoho deal — typically a V2 install on an existing client,
// where recreating the whole deal in Zoho makes no sense. The server stores it as a deal like
// any other, so it counts in the tracker, the monthly totals and the quota gate; its points are
// the deal TYPE's value, never a free number, so it can't drift from the "Points by deal type" card.
// Hidden entirely when the viewer lacks `tracker:manual_deal` (the list call answers 403).
export default function ManualDeals() {
  const { t } = useTranslation();
  const [allowed, setAllowed] = useState(false);
  const [list, setList] = useState<ManualDeal[]>([]);
  const [reps, setReps] = useState<string[]>([]);
  const [groups, setGroups] = useState<{ sourceGroup: string; points: number }[]>([]);
  const [rep, setRep] = useState('');
  const [dealName, setDealName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [group, setGroup] = useState('');
  const [soldDate, setSoldDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const load = async () => {
    try {
      const r = await axios.get(`${API_URL}/api/crm/deals/manual`, { headers: headers() });
      setList(r.data.deals || []);
      setAllowed(true);
    } catch { setAllowed(false); }
  };

  useEffect(() => {
    load();
    axios.get(`${API_URL}/api/salespeople`, { headers: headers() })
      .then(r => setReps(r.data.salespeople || [])).catch(() => {});
    axios.get(`${API_URL}/api/deal-source-points`, { headers: headers() })
      .then(r => setGroups(r.data.groups || [])).catch(() => {});
  }, []);

  if (!allowed) return null;

  const selectedPts = groups.find(g => g.sourceGroup === group)?.points;

  const add = async () => {
    if (!rep || !dealName.trim() || !group || !soldDate) {
      dialog.alert(t('admin.deals.manual.needFields') as string);
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API_URL}/api/crm/deals/manual`,
        { repName: rep, dealName: dealName.trim(), accountName: accountName.trim(), leadSourceGroup: group, soldDate, note: note.trim() },
        { headers: headers() });
      setDealName(''); setAccountName(''); setNote('');
      await load();
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || (t('admin.deals.saveError') as string));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: ManualDeal) => {
    const ok = await dialog.confirm(
      t('admin.deals.manual.confirmRemove', { deal: d.deal_name, points: d.points, rep: d.owner_name }) as string);
    if (!ok) return;
    setRemovingId(d.deal_id);
    try {
      await axios.delete(`${API_URL}/api/crm/deals/manual/${encodeURIComponent(d.deal_id)}`, { headers: headers() });
      await load();
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || (t('admin.deals.saveError') as string));
    } finally {
      setRemovingId(null);
    }
  };

  const inputCls = 'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm text-black outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';

  return (
    <div className="mt-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
        <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.deals.manual.title')}</h3>
        <p className="mt-1 text-sm text-body">{t('admin.deals.manual.subtitle')}</p>
      </div>

      <div className="p-7">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-body">{t('admin.deals.colRep')}</label>
            <Select value={rep} onChange={setRep} options={reps.map(r => ({ value: r, label: r }))}
              placeholder={t('admin.deals.manual.selectRep') as string} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-body">{t('admin.deals.manual.dealName')}</label>
            <input value={dealName} onChange={e => setDealName(e.target.value)} className={inputCls}
              placeholder={t('admin.deals.manual.dealNamePlaceholder') as string} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-body">{t('admin.deals.manual.accountName')}</label>
            <input value={accountName} onChange={e => setAccountName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-body">{t('admin.deals.manual.dealType')}</label>
            <Select value={group} onChange={setGroup}
              options={groups.map(g => ({ value: g.sourceGroup, label: `${g.sourceGroup} · ${g.points} pt` }))}
              placeholder={t('admin.deals.manual.selectType') as string} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-body">{t('admin.deals.manual.soldDate')}</label>
            <input type="date" value={soldDate} onChange={e => setSoldDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-body">{t('admin.deals.manual.note')}</label>
            <input value={note} onChange={e => setNote(e.target.value)} className={inputCls}
              placeholder={t('admin.deals.manual.notePlaceholder') as string} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={add} disabled={saving}
            className="whitespace-nowrap rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
            {saving ? t('common.saving') : t('admin.deals.manual.add')}
          </button>
          {selectedPts != null && rep && (
            <span className="text-sm text-body">
              {t('admin.deals.manual.preview', { rep, points: selectedPts, month: new Date(soldDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })}
            </span>
          )}
        </div>

        {list.length === 0 ? (
          <p className="mt-5 text-xs text-gray-400">{t('admin.deals.manual.none')}</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-md border border-stroke dark:border-strokedark">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="bg-gray-2 text-left dark:bg-meta-4">
                  <th className="px-4 py-3 font-medium text-black dark:text-white">{t('admin.deals.manual.soldDate')}</th>
                  <th className="px-4 py-3 font-medium text-black dark:text-white">{t('admin.deals.colDeal')}</th>
                  <th className="px-4 py-3 font-medium text-black dark:text-white">{t('admin.deals.colRep')}</th>
                  <th className="px-4 py-3 font-medium text-black dark:text-white">{t('admin.deals.manual.dealType')}</th>
                  <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('admin.deals.colPoints')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map(d => (
                  <tr key={d.deal_id} className="border-t border-stroke dark:border-strokedark">
                    <td className="whitespace-nowrap px-4 py-3 text-body">{fmtDate(d.sold_date)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-black dark:text-white">{d.deal_name}</span>
                      {(d.account_name || d.manual_note) && (
                        <span className="block text-xs text-body">
                          {[d.account_name, d.manual_note].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {d.manual_created_by && <span className="block text-xs text-gray-400">{d.manual_created_by}</span>}
                    </td>
                    <td className="px-4 py-3 text-body">{d.owner_name}</td>
                    <td className="px-4 py-3 text-body">{d.lead_source_group}</td>
                    <td className="px-4 py-3 text-right text-body">{d.points}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => remove(d)} disabled={removingId === d.deal_id}
                        className="whitespace-nowrap rounded-md border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/5 disabled:opacity-40">
                        {t('admin.deals.manual.remove')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
