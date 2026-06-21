import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const GB = 1073741824;
const fmtUsed = (b: number) => (b < 0.1 * GB ? `${(b / 1048576).toFixed(0)} MB` : `${(b / GB).toFixed(2)} GB`);

interface UserRow { email: string; used: number; limit: number | null; }

const ResourcesAdmin: React.FC = () => {
  const { t } = useTranslation();
  const [used, setUsed] = useState(0);
  const [limit, setLimit] = useState<number | null>(null);
  const [globalInput, setGlobalInput] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [knownEmails, setKnownEmails] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newEmail, setNewEmail] = useState('');
  const [newLimit, setNewLimit] = useState('');

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const loadGlobal = async () => {
    const r = await axios.get(`${API_URL}/api/resources/storage`, { headers: headers() });
    setUsed(r.data.used); setLimit(r.data.limit);
    setGlobalInput(r.data.limit ? String(Math.round(r.data.limit / GB)) : '');
  };
  const loadUsers = async () => {
    const r = await axios.get(`${API_URL}/api/resources/user-storage`, { headers: headers() });
    const list: UserRow[] = r.data.users || [];
    setUsers(list); setKnownEmails(r.data.knownEmails || []);
    setDrafts(Object.fromEntries(list.map(u => [u.email, u.limit ? String(Math.round(u.limit / GB)) : ''])));
  };
  useEffect(() => { loadGlobal().catch(() => {}); loadUsers().catch(() => {}); }, []);

  const saveGlobal = async () => {
    const gb = parseFloat(globalInput);
    const limitBytes = (!globalInput || isNaN(gb) || gb <= 0) ? 0 : Math.round(gb * GB);
    try { await axios.put(`${API_URL}/api/resources/storage`, { limitBytes }, { headers: headers() }); loadGlobal(); dialog.alert(t('admin.resources.saved')); }
    catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
  };
  const saveUser = async (email: string, gbStr: string) => {
    const gb = parseFloat(gbStr);
    const limitBytes = (!gbStr || isNaN(gb) || gb <= 0) ? 0 : Math.round(gb * GB);
    try { await axios.put(`${API_URL}/api/resources/user-storage`, { email, limitBytes }, { headers: headers() }); loadUsers(); }
    catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
  };
  const addUser = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    await saveUser(email, newLimit);
    setNewEmail(''); setNewLimit('');
  };

  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const barColor = pct >= 90 ? '#e2483d' : pct >= 75 ? '#d97706' : '#3c50e0';
  const inputCls = 'w-24 rounded-lg border border-stroke bg-transparent px-2 py-1.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';

  return (
    <div className="space-y-6">
      {/* Global library quota */}
      <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.resources.globalTitle')}</h3>
        <p className="mb-4 text-sm text-body">{t('admin.resources.globalSubtitle')}</p>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium text-black dark:text-white">{t('admin.resources.used')}</span>
          <span className="text-gray-500">{fmtUsed(used)}{limit ? ` / ${(limit / GB).toFixed(0)} GB (${pct}%)` : ` · ${t('admin.resources.unlimited')}`}</span>
        </div>
        {limit != null && (
          <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-meta-4">
            <div className="h-2 rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, backgroundColor: barColor }} />
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-body">{t('admin.resources.limit')}</span>
          <input type="number" min="0" value={globalInput} onChange={(e) => setGlobalInput(e.target.value)} placeholder="∞" className={inputCls} />
          <span className="text-sm text-body">GB</span>
          <button onClick={saveGlobal} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-opacity-90">{t('common.save')}</button>
          <span className="text-xs text-gray-400">{t('admin.resources.limitHint')}</span>
        </div>
      </div>

      {/* Per-user quotas */}
      <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.resources.perUserTitle')}</h3>
        <p className="mb-4 text-sm text-body">{t('admin.resources.perUserSubtitle')}</p>

        {/* Add a limit for a user */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-stroke p-3 dark:border-strokedark">
          <input list="known-emails" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={t('admin.resources.userEmail') as string}
            className="min-w-[220px] flex-1 rounded-lg border border-stroke bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
          <datalist id="known-emails">{knownEmails.map(e => <option key={e} value={e} />)}</datalist>
          <input type="number" min="0" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} placeholder="GB" className={inputCls} />
          <span className="text-sm text-body">GB</span>
          <button onClick={addUser} disabled={!newEmail.trim()} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">{t('admin.resources.setLimit')}</button>
        </div>

        <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
          <table className="w-full text-sm">
            <thead className="bg-gray-2 dark:bg-meta-4">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{t('admin.resources.userEmail')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('admin.resources.used')}</th>
                <th className="px-4 py-2 text-left font-medium">{t('admin.resources.limit')} (GB)</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-body">{t('admin.resources.noUsers')}</td></tr>
              ) : users.map(u => {
                const over = u.limit != null && u.used > u.limit;
                return (
                  <tr key={u.email} className="border-t border-stroke dark:border-strokedark">
                    <td className="px-4 py-2 font-medium text-black dark:text-white">{u.email}</td>
                    <td className={`px-4 py-2 text-right ${over ? 'font-semibold text-danger' : 'text-body'}`}>{fmtUsed(u.used)}</td>
                    <td className="px-4 py-2">
                      <input type="number" min="0" value={drafts[u.email] ?? ''} placeholder="∞"
                        onChange={(e) => setDrafts({ ...drafts, [u.email]: e.target.value })} className={inputCls} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => saveUser(u.email, drafts[u.email] ?? '')} className="rounded-md border border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-white">{t('common.save')}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">{t('admin.resources.perUserHint')}</p>
      </div>
    </div>
  );
};

export default ResourcesAdmin;
