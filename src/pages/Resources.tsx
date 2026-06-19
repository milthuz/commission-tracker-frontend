import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../lib/dialog';
import { formatDateOnly } from '../utils/date';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface Resource {
  id: number;
  title: string;
  description: string;
  category: string;
  tags: string[];
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

const fmtSize = (b: number) => {
  if (!b) return '';
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
};

const fileIcon = (name: string, mime: string) => {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (mime?.includes('pdf') || ext === 'pdf') return { label: 'PDF', cls: 'bg-danger/10 text-danger' };
  if (['doc', 'docx'].includes(ext)) return { label: 'DOC', cls: 'bg-[#3c50e0]/10 text-[#3c50e0]' };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: 'XLS', cls: 'bg-success/10 text-success' };
  if (['ppt', 'pptx'].includes(ext)) return { label: 'PPT', cls: 'bg-[#fe6523]/10 text-[#fe6523]' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return { label: 'IMG', cls: 'bg-[#7a5af8]/10 text-[#7a5af8]' };
  return { label: ext.toUpperCase().slice(0, 4) || 'FILE', cls: 'bg-gray-200 text-body dark:bg-meta-4' };
};

const Resources: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [activeCat, setActiveCat] = useState('');
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);

  // Modal state (add / edit)
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [form, setForm] = useState({ title: '', description: '', category: '', tags: '' });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get(`${API_URL}/api/auth/verify`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const u = r.data?.user;
        const perms: string[] = u?.permissions || [];
        setCanManage(!!u?.isAdmin || perms.includes('*') || perms.includes('resources:manage'));
      })
      .catch(() => setCanManage(false));
  }, []);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/resources`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { q, category: activeCat },
      });
      setResources(res.data.resources || []);
      setCategories(res.data.categories || []);
    } catch (e: any) {
      // 403 → no view permission; show empty
      setResources([]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const id = setTimeout(fetchResources, q ? 250 : 0); // debounce search
    return () => clearTimeout(id);
  }, [q, activeCat]);

  const openResource = async (r: Resource) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/resources/${r.id}/download`, {
        headers: { Authorization: `Bearer ${token}` }, responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { dialog.alert(t('resources.openError')); }
  };

  const openAdd = () => { setEditing(null); setForm({ title: '', description: '', category: '', tags: '' }); setFile(null); setShowModal(true); };
  const openEdit = (r: Resource) => {
    setEditing(r);
    setForm({ title: r.title, description: r.description || '', category: r.category || '', tags: (r.tags || []).join(', ') });
    setFile(null); setShowModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) { dialog.alert(t('resources.titleRequired')); return; }
    if (!editing && !file) { dialog.alert(t('resources.fileRequired')); return; }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('category', form.category);
      fd.append('tags', form.tags);
      if (file) fd.append('file', file);
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' };
      if (editing) await axios.put(`${API_URL}/api/resources/${editing.id}`, fd, { headers });
      else await axios.post(`${API_URL}/api/resources`, fd, { headers });
      setShowModal(false);
      fetchResources();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const remove = async (r: Resource) => {
    if (!(await dialog.confirm(t('resources.deleteConfirm', { title: r.title }) as string))) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/resources/${r.id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchResources();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to delete'); }
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white">{t('resources.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('resources.subtitle')}</p>
        </div>
        {canManage && (
          <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-opacity-90">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            {t('resources.add')}
          </button>
        )}
      </div>

      {/* Search + categories */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="relative max-w-md">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-body" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('resources.search') as string}
            className="w-full rounded-lg border border-stroke bg-white py-2.5 pl-9 pr-3 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-boxdark dark:text-white" />
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setActiveCat('')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${activeCat === '' ? 'bg-primary text-white' : 'border border-stroke bg-white text-body hover:border-primary dark:border-strokedark dark:bg-boxdark'}`}>
              {t('resources.allCategories')}
            </button>
            {categories.map(c => (
              <button key={c} onClick={() => setActiveCat(c)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${activeCat === c ? 'bg-primary text-white' : 'border border-stroke bg-white text-body hover:border-primary dark:border-strokedark dark:bg-boxdark'}`}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : resources.length === 0 ? (
        <div className="rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark">
          <p className="text-sm text-gray-500">{t('resources.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resources.map(r => {
            const icon = fileIcon(r.file_name, r.mime_type);
            return (
              <div key={r.id} className="flex flex-col rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
                <div className="flex items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${icon.cls}`}>{icon.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-black dark:text-white">{r.title}</p>
                    {r.category && <span className="mt-0.5 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-body dark:bg-meta-4">{r.category}</span>}
                  </div>
                </div>
                {r.description && <p className="mt-3 line-clamp-3 text-sm text-body">{r.description}</p>}
                {r.tags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.tags.map(tag => <span key={tag} className="rounded bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary">#{tag}</span>)}
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>{fmtSize(r.file_size)}</span>
                  <span>{formatDateOnly(r.updated_at, i18n.language)}</span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button onClick={() => openResource(r)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-opacity-90">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    {t('resources.open')}
                  </button>
                  {canManage && (
                    <>
                      <button onClick={() => openEdit(r)} title={t('common.edit') as string} className="rounded-lg border border-stroke p-2 text-body hover:text-primary dark:border-strokedark">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => remove(r)} title={t('common.delete') as string} className="rounded-lg border border-stroke p-2 text-body hover:text-danger dark:border-strokedark">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-2xl dark:border-strokedark dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">{editing ? t('resources.editTitle') : t('resources.addTitle')}</h3>
            <div className="space-y-3">
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('resources.fTitle') as string}
                className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('resources.fDescription') as string} rows={3}
                className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t('resources.fCategory') as string} list="resource-cats"
                  className="rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
                <datalist id="resource-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder={t('resources.fTags') as string}
                  className="rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{editing ? t('resources.fReplaceFile') : t('resources.fFile')}</label>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-body file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white" />
                {editing && <p className="mt-1 text-xs text-gray-400">{t('resources.fCurrentFile', { name: editing.file_name })}</p>}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4">{t('common.cancel')}</button>
              <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">{saving ? t('common.saving') : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Resources;
