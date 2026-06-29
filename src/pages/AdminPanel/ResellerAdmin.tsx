import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL;

// Admin tool to manage resellers: exact name, active, associated form emails, Zentact key,
// and assignment of discovered (unassigned) emails to the right reseller.
export default function ResellerAdmin() {
  const { t } = useTranslation();
  const [resellers, setResellers] = useState<any[]>([]);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [zentactNames, setZentactNames] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const load = async () => {
    const [r, u, z] = await Promise.all([
      axios.get(`${API_URL}/api/resellers`, { headers: headers() }),
      axios.get(`${API_URL}/api/resellers/unassigned-emails`, { headers: headers() }),
      axios.get(`${API_URL}/api/resellers/zentact-names`, { headers: headers() }),
    ]);
    setResellers((r.data.resellers || []).map((x: any) => ({ ...x, emailsText: (x.emails || []).join(', ') })));
    setUnassigned(u.data.emails || []);
    setZentactNames(z.data.names || []);
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const patchLocal = (id: number, patch: any) =>
    setResellers((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const save = async (r: any) => {
    setSavingId(r.id);
    try {
      const emails = String(r.emailsText || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      await axios.put(`${API_URL}/api/resellers/${r.id}`,
        { name: r.name, active: r.active, emails, zentact_key: r.zentact_key || null },
        { headers: headers() });
      await load();
    } catch { /* ignore */ } finally { setSavingId(null); }
  };

  const create = async () => {
    if (!newName.trim()) return;
    await axios.post(`${API_URL}/api/resellers`, { name: newName.trim() }, { headers: headers() });
    setNewName('');
    await load();
  };

  const remove = async (r: any) => {
    if (!(await dialog.confirm(t('admin.resellers.confirmDelete', { name: r.name })))) return;
    await axios.delete(`${API_URL}/api/resellers/${r.id}`, { headers: headers() });
    await load();
  };

  const uploadLogo = async (r: any, file: File | undefined) => {
    if (!file) return;
    setSavingId(r.id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await axios.post(`${API_URL}/api/resellers/${r.id}/logo`, fd,
        { headers: { ...headers(), 'Content-Type': 'multipart/form-data' } });
      await load();
    } catch { dialog.alert(t('admin.resellers.logoHint')); } finally { setSavingId(null); }
  };

  const removeLogo = async (r: any) => {
    if (!(await dialog.confirm(t('admin.resellers.confirmRemoveLogo', { name: r.name })))) return;
    await axios.delete(`${API_URL}/api/resellers/${r.id}/logo`, { headers: headers() });
    await load();
  };

  // Cache-bust the <img> when a logo changes (logo_updated_at is an epoch from the API).
  const logoSrc = (r: any) => `${API_URL}/api/resellers/${r.id}/logo?v=${r.logo_updated_at || 0}`;

  const assignEmail = async (email: string, resellerId: number) => {
    const r = resellers.find((x) => x.id === resellerId);
    if (!r) return;
    const emails = [...new Set([...(r.emails || []), email.toLowerCase()])];
    await axios.put(`${API_URL}/api/resellers/${resellerId}`, { emails }, { headers: headers() });
    await load();
  };

  const inputCls = 'w-full rounded border-[1.5px] border-stroke bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input';

  return (
    <div className="space-y-6">
      <datalist id="zentact-names">
        {zentactNames.map((z) => <option key={z.name} value={z.name}>{`${z.name} (${z.merchants})`}</option>)}
      </datalist>
      {/* Unassigned emails */}
      {unassigned.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-semibold text-black dark:text-white">{t('admin.resellers.unassignedTitle')}</p>
          <p className="mb-3 text-xs text-body">{t('admin.resellers.unassignedHint')}</p>
          <div className="space-y-2">
            {unassigned.map((u) => (
              <div key={u.email} className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-black dark:text-white">{u.email}</span>
                <span className="text-xs text-body">({u.locations} {t('reseller.activations.locations')}, {u.licenses} {t('reseller.activations.licenses')})</span>
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && assignEmail(u.email, parseInt(e.target.value))}
                  className="ml-auto rounded border-[1.5px] border-stroke bg-transparent px-2 py-1 text-sm dark:border-form-strokedark dark:bg-form-input"
                >
                  <option value="">{t('admin.resellers.assignTo')}</option>
                  {resellers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create reseller */}
      <div className="flex items-center gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('admin.resellers.newPlaceholder') as string}
          className={inputCls + ' max-w-xs'} onKeyDown={(e) => e.key === 'Enter' && create()} />
        <button onClick={create} className="whitespace-nowrap rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-opacity-90">
          + {t('admin.resellers.add')}
        </button>
      </div>

      {/* Resellers table */}
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="bg-gray-2 text-left dark:bg-meta-4">
              <th className="px-3 py-2 font-medium text-black dark:text-white">{t('admin.resellers.logo')}</th>
              <th className="px-3 py-2 font-medium text-black dark:text-white">{t('admin.resellers.name')}</th>
              <th className="px-3 py-2 font-medium text-black dark:text-white">{t('admin.resellers.emails')}</th>
              <th className="px-3 py-2 font-medium text-black dark:text-white">{t('admin.resellers.zentactKey')}</th>
              <th className="px-3 py-2 font-medium text-black dark:text-white">{t('reseller.activations.locations')}</th>
              <th className="px-3 py-2 font-medium text-black dark:text-white">{t('reseller.activations.licenses')}</th>
              <th className="px-3 py-2 font-medium text-black dark:text-white">{t('admin.resellers.active')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {resellers.map((r) => (
              <tr key={r.id} className="border-b border-stroke align-top dark:border-strokedark">
                <td className="px-3 py-2">
                  <div className="flex flex-col items-start gap-1.5">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-stroke bg-gray-1 dark:border-strokedark dark:bg-meta-4">
                      {r.has_logo
                        ? <img src={logoSrc(r)} alt={r.name} className="h-full w-full object-contain" />
                        : <span className="text-[10px] font-medium text-body">—</span>}
                    </div>
                    <div className="flex items-center gap-2 whitespace-nowrap text-xs">
                      <label className="cursor-pointer font-medium text-primary hover:underline">
                        {r.has_logo ? t('admin.resellers.logoChange') : t('admin.resellers.logoUpload')}
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => { uploadLogo(r, e.target.files?.[0]); e.currentTarget.value = ''; }} />
                      </label>
                      {r.has_logo && (
                        <button onClick={() => removeLogo(r)} className="font-medium text-danger hover:underline">{t('admin.resellers.logoRemove')}</button>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2"><input value={r.name} onChange={(e) => patchLocal(r.id, { name: e.target.value })} className={inputCls} /></td>
                <td className="px-3 py-2"><input value={r.emailsText} onChange={(e) => patchLocal(r.id, { emailsText: e.target.value })} placeholder="a@b.com, c@d.com" className={inputCls + ' min-w-[14rem]'} /></td>
                <td className="px-3 py-2"><input list="zentact-names" value={r.zentact_key || ''} onChange={(e) => patchLocal(r.id, { zentact_key: e.target.value })} className={inputCls} /></td>
                <td className="px-3 py-2 text-body">{r.locations}</td>
                <td className="px-3 py-2 text-body">{r.licenses}</td>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={!!r.active} onChange={(e) => patchLocal(r.id, { active: e.target.checked })} className="h-4 w-4" />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button onClick={() => save(r)} disabled={savingId === r.id}
                    className="mr-2 rounded bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
                    {savingId === r.id ? '…' : t('admin.resellers.save')}
                  </button>
                  <button onClick={() => remove(r)} className="text-xs font-medium text-danger hover:underline">{t('admin.resellers.delete')}</button>
                </td>
              </tr>
            ))}
            {resellers.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-body">{t('admin.resellers.none')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
