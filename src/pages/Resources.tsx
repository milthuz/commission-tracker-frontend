import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../lib/dialog';
import { formatDateOnly } from '../utils/date';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface Resource {
  id: number; title: string; description: string; category: string; tags: string[];
  file_name: string; mime_type: string; file_size: number; uploaded_by: string;
  created_at: string; updated_at: string;
}
interface AuditEvent {
  id: number; action: string; resource_id: number | null; title: string;
  file_name: string; category: string; actor: string; created_at: string;
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
  const [isAdmin, setIsAdmin] = useState(false);

  // Add/edit modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [form, setForm] = useState({ title: '', description: '', category: '', tags: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  // Category management + audit journal (admin)
  const [showCats, setShowCats] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [showJournal, setShowJournal] = useState(false);
  const [audit, setAudit] = useState<AuditEvent[]>([]);

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => {
    axios.get(`${API_URL}/api/auth/verify`, { headers: authHeaders() })
      .then(r => {
        const u = r.data?.user; const perms: string[] = u?.permissions || [];
        const admin = !!u?.isAdmin || perms.includes('*');
        setIsAdmin(admin);
        setCanManage(admin || perms.includes('resources:manage'));
      }).catch(() => {});
  }, []);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/resources`, { headers: authHeaders(), params: { q, category: activeCat } });
      setResources(res.data.resources || []);
      setCategories(res.data.categories || []);
    } catch { setResources([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { const id = setTimeout(fetchResources, q ? 250 : 0); return () => clearTimeout(id); }, [q, activeCat]);

  const fetchAudit = async () => {
    try { const r = await axios.get(`${API_URL}/api/resources/audit`, { headers: authHeaders() }); setAudit(r.data.events || []); }
    catch { setAudit([]); }
  };

  const openResource = async (r: Resource) => {
    try {
      const res = await axios.get(`${API_URL}/api/resources/${r.id}/download`, { headers: authHeaders(), responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { dialog.alert(t('resources.openError')); }
  };

  const openAdd = () => { setEditing(null); setForm({ title: '', description: '', category: activeCat, tags: '' }); setFiles([]); setShowModal(true); };
  const openEdit = (r: Resource) => {
    setEditing(r);
    setForm({ title: r.title, description: r.description || '', category: r.category || '', tags: (r.tags || []).join(', ') });
    setFiles([]); setShowModal(true);
  };

  const save = async () => {
    const multi = !editing && files.length > 1;
    if (!editing && files.length === 0) { dialog.alert(t('resources.fileRequired')); return; }
    if (!multi && !editing && !form.title.trim()) { dialog.alert(t('resources.titleRequired')); return; }
    setSaving(true);
    try {
      const headers = { ...authHeaders(), 'Content-Type': 'multipart/form-data' };
      if (multi) {
        const fd = new FormData();
        fd.append('category', form.category); fd.append('tags', form.tags);
        files.forEach(f => fd.append('files', f));
        await axios.post(`${API_URL}/api/resources/bulk`, fd, { headers });
      } else {
        const fd = new FormData();
        fd.append('title', form.title); fd.append('description', form.description);
        fd.append('category', form.category); fd.append('tags', form.tags);
        if (files[0]) fd.append('file', files[0]);
        if (editing) await axios.put(`${API_URL}/api/resources/${editing.id}`, fd, { headers });
        else await axios.post(`${API_URL}/api/resources`, fd, { headers });
      }
      setShowModal(false);
      fetchResources();
      if (showJournal) fetchAudit();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const importZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await axios.post(`${API_URL}/api/resources/import-zip`, fd, { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' } });
      fetchResources(); if (showJournal) fetchAudit();
      await dialog.alert(t('resources.importDone', { added: r.data.added, skipped: (r.data.skipped || []).length }));
    } catch (err: any) { dialog.alert(err?.response?.data?.error || 'Import failed'); }
    finally { setImporting(false); }
  };

  const remove = async (r: Resource) => {
    if (!(await dialog.confirm(t('resources.deleteConfirm', { title: r.title }) as string))) return;
    try {
      await axios.delete(`${API_URL}/api/resources/${r.id}`, { headers: authHeaders() });
      fetchResources(); if (showJournal) fetchAudit();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to delete'); }
  };

  const addCategory = async () => {
    const name = newCat.trim(); if (!name) return;
    try { await axios.post(`${API_URL}/api/resource-categories`, { name }, { headers: authHeaders() }); setNewCat(''); fetchResources(); }
    catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
  };
  const removeCategory = async (name: string) => {
    // categories list is names; we need ids — refetch the managed list to find the id
    try {
      const r = await axios.get(`${API_URL}/api/resource-categories`, { headers: authHeaders() });
      const cat = (r.data.categories || []).find((c: any) => c.name === name);
      if (!cat) return;
      if (!(await dialog.confirm(t('resources.catDeleteConfirm', { name }) as string))) return;
      await axios.delete(`${API_URL}/api/resource-categories/${cat.id}`, { headers: authHeaders() });
      fetchResources();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
  };

  const toggleJournal = () => { const n = !showJournal; setShowJournal(n); if (n) fetchAudit(); };

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white">{t('resources.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('resources.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button onClick={toggleJournal} className="inline-flex items-center gap-2 rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              {t('resources.journal')}
            </button>
          )}
          {canManage && (
            <button onClick={() => setShowCats(true)} className="inline-flex items-center gap-2 rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" /></svg>
              {t('resources.manageCats')}
            </button>
          )}
          {canManage && (
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4 ${importing ? 'pointer-events-none opacity-50' : ''}`}>
              {importing ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />{t('resources.importing')}</>
              ) : (
                <><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>{t('resources.importZip')}</>
              )}
              <input type="file" accept=".zip,application/zip,application/x-zip-compressed" className="hidden" disabled={importing} onChange={importZip} />
            </label>
          )}
          {canManage && (
            <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-opacity-90">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              {t('resources.add')}
            </button>
          )}
        </div>
      </div>

      {/* Journal (admin) */}
      {isAdmin && showJournal && (
        <div className="mb-5 rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-3 text-sm font-semibold text-black dark:text-white">{t('resources.journalTitle')}</h3>
          {audit.length === 0 ? <p className="text-sm text-gray-500">{t('resources.journalEmpty')}</p> : (
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {audit.map(e => (
                <div key={e.id} className="flex items-center gap-3 text-xs">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${e.action === 'delete' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>{t(`resources.action_${e.action}`)}</span>
                  <span className="min-w-0 flex-1 truncate text-black dark:text-white">{e.title} <span className="text-gray-400">· {e.file_name}</span></span>
                  <span className="shrink-0 text-gray-400">{e.actor}</span>
                  <span className="shrink-0 text-gray-400">{new Date(e.created_at).toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                  <div className="mt-2 flex flex-wrap gap-1">{r.tags.map(tag => <span key={tag} className="rounded bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary">#{tag}</span>)}</div>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>{fmtSize(r.file_size)}</span><span>{formatDateOnly(r.updated_at, i18n.language)}</span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button onClick={() => openResource(r)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-opacity-90">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    {t('resources.open')}
                  </button>
                  {canManage && (
                    <button onClick={() => openEdit(r)} title={t('common.edit') as string} className="rounded-lg border border-stroke p-2 text-body hover:text-primary dark:border-strokedark">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => remove(r)} title={t('common.delete') as string} className="rounded-lg border border-stroke p-2 text-body hover:text-danger dark:border-strokedark">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
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
              {/* File(s) first — multi-upload allowed when adding */}
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{editing ? t('resources.fReplaceFile') : t('resources.fFiles')}</label>
                <input type="file" multiple={!editing} onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  className="w-full text-sm text-body file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white" />
                {editing && <p className="mt-1 text-xs text-gray-400">{t('resources.fCurrentFile', { name: editing.file_name })}</p>}
                {!editing && files.length > 1 && <p className="mt-1 text-xs text-primary">{t('resources.multiNote', { count: files.length })}</p>}
              </div>
              {/* Title only for single upload / edit */}
              {(editing || files.length <= 1) && (
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('resources.fTitle') as string}
                  className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
              )}
              {(editing || files.length <= 1) && (
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('resources.fDescription') as string} rows={2}
                  className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
              )}
              <div className="grid grid-cols-2 gap-3">
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white">
                  <option value="">{t('resources.noCategory')}</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder={t('resources.fTags') as string}
                  className="rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4">{t('common.cancel')}</button>
              <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">{saving ? t('common.saving') : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Manage categories modal */}
      {showCats && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCats(false)}>
          <div className="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 shadow-2xl dark:border-strokedark dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold text-black dark:text-white">{t('resources.manageCats')}</h3>
            <div className="mb-3 flex gap-2">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }} placeholder={t('resources.newCategory') as string}
                className="flex-1 rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
              <button onClick={addCategory} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90">{t('resources.addCat')}</button>
            </div>
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {categories.length === 0 ? <p className="text-sm text-gray-500">{t('resources.noCats')}</p> : categories.map(c => (
                <div key={c} className="flex items-center justify-between rounded-lg border border-stroke px-3 py-2 text-sm dark:border-strokedark">
                  <span className="text-black dark:text-white">{c}</span>
                  {isAdmin && (
                    <button onClick={() => removeCategory(c)} className="text-body hover:text-danger" title={t('common.delete') as string}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-400">{t('resources.catNote')}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default Resources;
