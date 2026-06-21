import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const GB = 1073741824;
const fmtUsed = (b: number) => (b < 0.1 * GB ? `${(b / 1048576).toFixed(0)} MB` : `${(b / GB).toFixed(2)} GB`);
const gbStr = (bytes: number | null) => (bytes ? String(Math.round((bytes / GB) * 100) / 100) : '');

interface RoleRow { id: number; name: string; isSystem: boolean; limit: number | null; }
interface UserRow {
  email: string; used: number; roles: string[];
  userLimit: number | null; roleLimit: number | null; effectiveLimit: number | null;
  source: 'user' | 'role' | 'none';
}

const ResourcesAdmin: React.FC = () => {
  const { t } = useTranslation();
  const [used, setUsed] = useState(0);
  const [limit, setLimit] = useState<number | null>(null);
  const [globalInput, setGlobalInput] = useState('');

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<number, string>>({});

  const [users, setUsers] = useState<UserRow[]>([]);
  const [editEmail, setEditEmail] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const loadGlobal = async () => {
    const r = await axios.get(`${API_URL}/api/resources/storage`, { headers: headers() });
    setUsed(r.data.used); setLimit(r.data.limit);
    setGlobalInput(r.data.limit ? String(Math.round(r.data.limit / GB)) : '');
  };
  const loadRoles = async () => {
    const r = await axios.get(`${API_URL}/api/resources/role-storage`, { headers: headers() });
    const list: RoleRow[] = r.data.roles || [];
    setRoles(list);
    setRoleDrafts(Object.fromEntries(list.map(x => [x.id, gbStr(x.limit)])));
  };
  const loadUsers = async () => {
    const r = await axios.get(`${API_URL}/api/resources/user-storage`, { headers: headers() });
    setUsers(r.data.users || []);
  };
  useEffect(() => { loadGlobal().catch(() => {}); loadRoles().catch(() => {}); loadUsers().catch(() => {}); }, []);

  const saveGlobal = async () => {
    const gb = parseFloat(globalInput);
    const limitBytes = (!globalInput || isNaN(gb) || gb <= 0) ? 0 : Math.round(gb * GB);
    try { await axios.put(`${API_URL}/api/resources/storage`, { limitBytes }, { headers: headers() }); loadGlobal(); dialog.alert(t('admin.resources.saved')); }
    catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
  };
  const saveRole = async (roleId: number, gbStr: string) => {
    const gb = parseFloat(gbStr);
    const limitBytes = (!gbStr || isNaN(gb) || gb <= 0) ? 0 : Math.round(gb * GB);
    try { await axios.put(`${API_URL}/api/resources/role-storage`, { roleId, limitBytes }, { headers: headers() }); await loadRoles(); await loadUsers(); }
    catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
  };
  const saveUser = async (email: string, gbStr: string) => {
    const gb = parseFloat(gbStr);
    const limitBytes = (!gbStr || isNaN(gb) || gb <= 0) ? 0 : Math.round(gb * GB);
    try {
      await axios.put(`${API_URL}/api/resources/user-storage`, { email, limitBytes }, { headers: headers() });
      setEditEmail(null); await loadUsers();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
  };

  const beginEdit = (u: UserRow) => { setEditEmail(u.email); setEditDraft(gbStr(u.userLimit)); };

  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const barColor = pct >= 90 ? '#e2483d' : pct >= 75 ? '#d97706' : '#3c50e0';
  const inputCls = 'w-24 rounded-lg border border-stroke bg-transparent px-2 py-1.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';
  const cardCls = 'rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark';

  // How a user's effective limit reads in the table.
  const effLabel = (u: UserRow) => {
    if (u.effectiveLimit == null) return <span className="text-gray-400">{t('admin.resources.libraryCapOnly')}</span>;
    const val = `${(u.effectiveLimit / GB).toFixed(u.effectiveLimit % GB === 0 ? 0 : 2)} GB`;
    const tag = u.source === 'user' ? t('admin.resources.srcCustom') : t('admin.resources.srcRole');
    const over = u.used > u.effectiveLimit;
    return (
      <span className={over ? 'font-semibold text-danger' : 'text-black dark:text-white'}>
        {val} <span className={`ml-1 text-xs ${u.source === 'user' ? 'text-primary' : 'text-gray-400'}`}>· {tag}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Global library quota */}
      <div className={cardCls}>
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
          <button onClick={saveGlobal} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-opacity-90">{t('admin.resources.saveBtn')}</button>
          <span className="text-xs text-gray-400">{t('admin.resources.limitHint')}</span>
        </div>
      </div>

      {/* Limits by role */}
      <div className={cardCls}>
        <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.resources.roleTitle')}</h3>
        <p className="mb-4 text-sm text-body">{t('admin.resources.roleSubtitle')}</p>
        <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
          <table className="w-full text-sm">
            <thead className="bg-gray-2 dark:bg-meta-4">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{t('admin.resources.role')}</th>
                <th className="px-4 py-2 text-left font-medium">{t('admin.resources.limit')} (GB)</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-body">—</td></tr>
              ) : roles.map(r => (
                <tr key={r.id} className="border-t border-stroke dark:border-strokedark">
                  <td className="px-4 py-2 font-medium text-black dark:text-white">{r.name}</td>
                  <td className="px-4 py-2">
                    <input type="number" min="0" value={roleDrafts[r.id] ?? ''} placeholder="∞"
                      onChange={(e) => setRoleDrafts({ ...roleDrafts, [r.id]: e.target.value })} className={inputCls} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => saveRole(r.id, roleDrafts[r.id] ?? '')} className="rounded-md border border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-white">{t('admin.resources.saveBtn')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">{t('admin.resources.roleHint')}</p>
      </div>

      {/* Per-user limits (auto-populated from all known users) */}
      <div className={cardCls}>
        <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.resources.perUserTitle')}</h3>
        <p className="mb-4 text-sm text-body">{t('admin.resources.perUserSubtitle')}</p>
        <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
          <table className="w-full text-sm">
            <thead className="bg-gray-2 dark:bg-meta-4">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{t('admin.resources.userEmail')}</th>
                <th className="px-4 py-2 text-left font-medium">{t('admin.resources.roles')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('admin.resources.used')}</th>
                <th className="px-4 py-2 text-left font-medium">{t('admin.resources.effective')}</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-body">{t('admin.resources.noUsers')}</td></tr>
              ) : users.map(u => (
                <tr key={u.email} className="border-t border-stroke dark:border-strokedark">
                  <td className="px-4 py-2 font-medium text-black dark:text-white">{u.email}</td>
                  <td className="px-4 py-2 text-body">{u.roles.length ? u.roles.join(', ') : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-2 text-right text-body">{fmtUsed(u.used)}</td>
                  <td className="px-4 py-2">
                    {editEmail === u.email ? (
                      <div className="flex items-center gap-2">
                        <input type="number" min="0" autoFocus value={editDraft} placeholder={gbStr(u.roleLimit) || '∞'}
                          onChange={(e) => setEditDraft(e.target.value)} className={inputCls} />
                        <span className="text-xs text-body">GB</span>
                      </div>
                    ) : effLabel(u)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {editEmail === u.email ? (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => saveUser(u.email, editDraft)} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-opacity-90">{t('admin.resources.saveBtn')}</button>
                        <button onClick={() => setEditEmail(null)} className="rounded-md border border-stroke px-3 py-1 text-xs font-medium text-body hover:bg-gray-1 dark:border-strokedark">{t('common.cancel')}</button>
                      </div>
                    ) : (
                      <button onClick={() => beginEdit(u)} title={t('common.edit') as string} className="rounded-md p-1.5 text-body hover:text-primary">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">{t('admin.resources.perUserHint')}</p>
      </div>
    </div>
  );
};

export default ResourcesAdmin;
