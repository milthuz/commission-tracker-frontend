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
// Per-type label + brand-ish colour for the document icon.
const fileMeta = (name: string, mime: string) => {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (mime?.includes('pdf') || ext === 'pdf') return { label: 'PDF', color: '#e2483d' };
  if (['doc', 'docx'].includes(ext)) return { label: 'DOC', color: '#2b67c2' };  // Word blue
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: ext === 'csv' ? 'CSV' : 'XLS', color: '#1d8f5d' };  // Excel green
  if (['ppt', 'pptx'].includes(ext)) return { label: 'PPT', color: '#d24726' };  // PowerPoint orange
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes(ext)) return { label: 'IMG', color: '#7a5af8' };
  if (['zip', 'rar', '7z'].includes(ext)) return { label: 'ZIP', color: '#b45309' };
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return { label: 'VID', color: '#db2777' };
  return { label: ext.toUpperCase().slice(0, 4) || 'FILE', color: '#64748b' };
};

// A clean document-style file-type icon (page with folded corner + coloured type band).
const FileIcon: React.FC<{ name: string; mime: string; className?: string }> = ({ name, mime, className = 'h-10 w-8' }) => {
  const { label, color } = fileMeta(name, mime);
  return (
    <svg viewBox="0 0 32 40" className={`shrink-0 ${className}`} role="img" aria-label={label}>
      {/* page */}
      <path d="M5 2.5h14.5L27 10v25.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4.5a2 2 0 0 1 2-2z" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1.2" />
      {/* folded corner */}
      <path d="M19.5 2.5L27 10h-5.5a2 2 0 0 1-2-2z" fill="#eef2f7" />
      {/* type band */}
      <rect x="3" y="22" width="22" height="12" rx="2.5" fill={color} />
      <text x="14" y="30.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#ffffff" fontFamily="Satoshi, system-ui, sans-serif" letterSpacing="0.3">{label}</text>
    </svg>
  );
};

const Resources: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [openFolder, setOpenFolder] = useState<string | null>(null); // null = folder landing
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('resourcesView') as 'grid' | 'list') || 'list');
  const [loading, setLoading] = useState(true);
  useEffect(() => { localStorage.setItem('resourcesView', view); }, [view]);
  const [canManage, setCanManage] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Add/edit modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [form, setForm] = useState({ title: '', description: '', category: '', tags: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  // Category management + audit journal (admin)
  const [showCats, setShowCats] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [showJournal, setShowJournal] = useState(false);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [storage, setStorage] = useState<{ used: number; limit: number | null } | null>(null);
  const [limitInput, setLimitInput] = useState('');
  const GB = 1073741824;

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

  // Fetch everything once; folder browsing + search are done client-side (modest library size)
  // so we can show folder tiles, per-folder counts and root files without extra round-trips.
  const fetchResources = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/resources`, { headers: authHeaders() });
      setResources(res.data.resources || []);
      setCategories(res.data.categories || []);
    } catch { setResources([]); }
    finally { setLoading(false); }
  };
  const fetchStorage = async () => {
    try {
      const r = await axios.get(`${API_URL}/api/resources/storage`, { headers: authHeaders() });
      setStorage(r.data);
      setLimitInput(r.data.limit ? String(Math.round(r.data.limit / GB)) : '');
    } catch { /* silent */ }
  };
  useEffect(() => { fetchResources(); fetchStorage(); }, []);

  const saveLimit = async () => {
    const gb = parseFloat(limitInput);
    const limitBytes = (!limitInput || isNaN(gb) || gb <= 0) ? 0 : Math.round(gb * GB);
    try {
      await axios.put(`${API_URL}/api/resources/storage`, { limitBytes }, { headers: authHeaders() });
      fetchStorage();
      dialog.alert(t('resources.storageSaved'));
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
  };

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

  const openAdd = () => { setEditing(null); setForm({ title: '', description: '', category: openFolder || '', tags: '' }); setFiles([]); setShowModal(true); };
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
      fetchResources(); fetchStorage();
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
      const r = await axios.post(`${API_URL}/api/resources/import-zip`, fd, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      // The server imports in the background; files land progressively. Refresh a few times.
      await dialog.alert(t('resources.importQueued', { count: r.data.queued }));
      fetchResources(); fetchStorage(); if (showJournal) fetchAudit();
      [4000, 10000, 20000].forEach(ms => setTimeout(() => { fetchResources(); fetchStorage(); if (showJournal) fetchAudit(); }, ms));
    } catch (err: any) { dialog.alert(err?.response?.data?.error || t('resources.importError')); }
    finally { setImporting(false); }
  };

  // Import a whole folder (webkitdirectory). Each immediate sub-folder becomes a category.
  // Uploaded in small size-bounded batches to the existing /bulk endpoint — safe for dyno RAM
  // and avoids the 30s timeout; the browser keeps the files, we send them progressively.
  const importFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files || []);
    e.target.value = '';
    if (!all.length) return;
    const valid = all.filter(f => {
      const rel = (f as any).webkitRelativePath || f.name;
      return f.name && !f.name.startsWith('.') && !rel.includes('__MACOSX') && f.size > 0 && f.size <= 25 * 1024 * 1024;
    });
    if (!valid.length) { dialog.alert(t('resources.empty')); return; }
    // Group by category = the file's top sub-folder (segment after the picked root). Root files → none.
    const groups: Record<string, File[]> = {};
    for (const f of valid) {
      const seg = ((f as any).webkitRelativePath || '').split('/').filter(Boolean);
      const cat = seg.length >= 3 ? seg[1] : '';
      (groups[cat] = groups[cat] || []).push(f);
    }
    // Size-bounded batches (≤15MB or 20 files) so each request stays light on the ~512MB dyno.
    const batchify = (list: File[]) => {
      const out: File[][] = []; let cur: File[] = []; let bytes = 0;
      for (const f of list) {
        if (cur.length && (bytes + f.size > 15 * 1024 * 1024 || cur.length >= 20)) { out.push(cur); cur = []; bytes = 0; }
        cur.push(f); bytes += f.size;
      }
      if (cur.length) out.push(cur);
      return out;
    };
    setImporting(true);
    try {
      let done = 0;
      for (const [cat, list] of Object.entries(groups)) {
        for (const batch of batchify(list)) {
          const fd = new FormData(); fd.append('category', cat); fd.append('tags', '');
          batch.forEach(f => fd.append('files', f));
          await axios.post(`${API_URL}/api/resources/bulk`, fd, { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
          done += batch.length;
          setImportMsg(t('resources.folderProgress', { done, total: valid.length }));
        }
      }
      fetchResources(); fetchStorage(); if (showJournal) fetchAudit();
      await dialog.alert(t('resources.folderDone', { count: valid.length }));
    } catch (err: any) { dialog.alert(err?.response?.data?.error || t('resources.importError')); }
    finally { setImporting(false); setImportMsg(''); }
  };

  const deleteAll = async () => {
    if (!(await dialog.confirm(t('resources.deleteAllConfirm', { count: resources.length }) as string, { danger: true, confirmText: t('resources.deleteAllBtn') as string }))) return;
    try {
      await axios.post(`${API_URL}/api/resources/delete-all`, { confirm: 'DELETE ALL' }, { headers: authHeaders() });
      setShowCats(false); setOpenFolder(null);
      fetchResources(); fetchStorage(); if (showJournal) fetchAudit();
      await dialog.alert(t('resources.deleteAllDone'));
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
  };

  const remove = async (r: Resource) => {
    if (!(await dialog.confirm(t('resources.deleteConfirm', { title: r.title }) as string))) return;
    try {
      await axios.delete(`${API_URL}/api/resources/${r.id}`, { headers: authHeaders() });
      fetchResources(); fetchStorage(); if (showJournal) fetchAudit();
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

  // --- Folder/file derivation (Drive-style) ---
  const ql = q.trim().toLowerCase();
  const isSearching = ql.length > 0;
  const matches = (r: Resource) =>
    r.title.toLowerCase().includes(ql) || (r.description || '').toLowerCase().includes(ql) || (r.tags || []).join(',').toLowerCase().includes(ql);
  const searchResults = resources.filter(matches);
  const folderNames = Array.from(new Set([...categories, ...resources.map(r => r.category).filter(Boolean)]));
  const folders = folderNames.map(name => ({ name, count: resources.filter(r => r.category === name).length }));
  const rootFiles = resources.filter(r => !r.category);
  const folderFiles = openFolder ? resources.filter(r => r.category === openFolder) : [];

  // Lighter card (grid view). showCat=false inside a folder (the folder name is already the context).
  const renderCard = (r: Resource, showCat: boolean) => {
    return (
      <div key={r.id} className="flex flex-col rounded-xl border border-stroke bg-white p-4 shadow-default transition hover:border-primary dark:border-strokedark dark:bg-boxdark">
        <button onClick={() => openResource(r)} className="flex items-start gap-3 text-left">
          <FileIcon name={r.file_name} mime={r.mime_type} className="h-11 w-auto" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-black dark:text-white">{r.title}</p>
            <p className="text-xs text-gray-400">{fmtSize(r.file_size)} · {formatDateOnly(r.updated_at, i18n.language)}</p>
            {showCat && r.category && <p className="mt-0.5 truncate text-[11px] text-body">{r.category}</p>}
          </div>
        </button>
        <div className="mt-3 flex items-center justify-end gap-1 border-t border-stroke pt-2 dark:border-strokedark">
          <button onClick={() => openResource(r)} title={t('resources.open') as string} className="rounded-lg p-1.5 text-primary hover:bg-primary/10">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
          {canManage && (
            <button onClick={() => openEdit(r)} title={t('common.edit') as string} className="rounded-lg p-1.5 text-body hover:text-primary"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
          )}
          {isAdmin && (
            <button onClick={() => remove(r)} title={t('common.delete') as string} className="rounded-lg p-1.5 text-body hover:text-danger"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
          )}
        </div>
      </div>
    );
  };

  // Row (list view) — dense, Drive-like.
  const renderRow = (r: Resource, showCat: boolean) => {
    return (
      <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-gray-1 dark:hover:bg-meta-4/40">
        <FileIcon name={r.file_name} mime={r.mime_type} className="h-8 w-auto" />
        <button onClick={() => openResource(r)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium text-black hover:text-primary dark:text-white">{r.title}</span>
          {showCat && r.category && <span className="block truncate text-xs text-gray-400">{r.category}</span>}
        </button>
        <span className="hidden w-16 shrink-0 text-right text-xs text-gray-400 sm:block">{fmtSize(r.file_size)}</span>
        <span className="hidden w-24 shrink-0 text-right text-xs text-gray-400 md:block">{formatDateOnly(r.updated_at, i18n.language)}</span>
        <button onClick={() => openResource(r)} title={t('resources.open') as string} className="rounded-lg p-1.5 text-primary hover:bg-primary/10"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></button>
        {canManage && <button onClick={() => openEdit(r)} title={t('common.edit') as string} className="rounded-lg p-1.5 text-body hover:text-primary"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>}
        {isAdmin && <button onClick={() => remove(r)} title={t('common.delete') as string} className="rounded-lg p-1.5 text-body hover:text-danger"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>}
      </div>
    );
  };

  // showCat: hide the category label when we're inside that folder (redundant).
  const renderFiles = (list: Resource[]) => {
    const showCat = isSearching || !openFolder;
    return view === 'list'
      ? <div className="divide-y divide-stroke overflow-hidden rounded-xl border border-stroke bg-white shadow-default dark:divide-strokedark dark:border-strokedark dark:bg-boxdark">{list.map(r => renderRow(r, showCat))}</div>
      : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map(r => renderCard(r, showCat))}</div>;
  };

  return (
    <>
      {/* Header — title, then a tidy toolbar row so buttons never orphan beside the title */}
      <div className="mb-6 flex flex-col gap-4">
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
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2zM12 11v5m0 0l-2-2m2 2l2-2" /></svg>
              {t('resources.importFolder')}
              <input type="file" multiple className="hidden" disabled={importing} onChange={importFolder} {...({ webkitdirectory: '', directory: '' } as any)} />
            </label>
          )}
          {canManage && (
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4 ${importing ? 'pointer-events-none opacity-50' : ''}`}>
              {importing ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />{importMsg || t('resources.importing')}</>
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
                  <span className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${e.action.includes('delete') ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>{t(`resources.action_${e.action}`)}</span>
                  <span className="min-w-0 flex-1 truncate text-black dark:text-white">{e.title} <span className="text-gray-400">· {e.file_name}</span></span>
                  <span className="shrink-0 text-gray-400">{e.actor}</span>
                  <span className="shrink-0 text-gray-400">{new Date(e.created_at).toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Storage usage (managers see usage; admins can set the limit) */}
      {canManage && storage && (() => {
        const usedGB = storage.used / GB;
        const limitGB = storage.limit ? storage.limit / GB : null;
        const pct = limitGB ? Math.min(100, Math.round((storage.used / storage.limit!) * 100)) : 0;
        const barColor = pct >= 90 ? '#e2483d' : pct >= 75 ? '#d97706' : '#3c50e0';
        return (
          <div className="mb-5 rounded-xl border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-black dark:text-white">{t('resources.storage')}</span>
              <span className="text-sm text-gray-500">
                {usedGB < 0.1 ? `${(storage.used / 1048576).toFixed(0)} MB` : `${usedGB.toFixed(2)} GB`}
                {limitGB ? ` / ${limitGB.toFixed(0)} GB (${pct}%)` : ` · ${t('resources.unlimited')}`}
              </span>
            </div>
            {limitGB != null && (
              <div className="mt-2 h-2 w-full rounded-full bg-gray-100 dark:bg-meta-4">
                <div className="h-2 rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, backgroundColor: barColor }} />
              </div>
            )}
            {isAdmin && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-body">{t('resources.storageLimit')}</span>
                <input type="number" min="0" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} placeholder="∞"
                  className="w-24 rounded-lg border border-stroke bg-transparent px-2 py-1 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
                <span className="text-xs text-body">GB</span>
                <button onClick={saveLimit} className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-opacity-90">{t('common.save')}</button>
                <span className="text-[11px] text-gray-400">{t('resources.storageHint')}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Search + view toggle */}
      <div className="mb-5 flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-body" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('resources.search') as string}
            className="w-full rounded-lg border border-stroke bg-white py-2.5 pl-9 pr-3 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-boxdark dark:text-white" />
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-stroke dark:border-strokedark">
          <button onClick={() => setView('list')} title={t('resources.viewList') as string}
            className={`p-2.5 ${view === 'list' ? 'bg-primary text-white' : 'bg-white text-body hover:bg-gray-1 dark:bg-boxdark dark:hover:bg-meta-4'}`}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <button onClick={() => setView('grid')} title={t('resources.viewGrid') as string}
            className={`p-2.5 ${view === 'grid' ? 'bg-primary text-white' : 'bg-white text-body hover:bg-gray-1 dark:bg-boxdark dark:hover:bg-meta-4'}`}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z" /></svg>
          </button>
        </div>
      </div>

      {/* Breadcrumb (inside a folder) */}
      {!isSearching && openFolder && (
        <div className="mb-4 flex items-center gap-1.5 text-sm">
          <button onClick={() => setOpenFolder(null)} className="font-medium text-primary hover:underline">{t('resources.title')}</button>
          <span className="text-gray-400">/</span>
          <span className="font-medium text-black dark:text-white">{openFolder}</span>
          <span className="ml-1 text-xs text-gray-400">({folderFiles.length})</span>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : isSearching ? (
        /* Flat search results across all folders */
        searchResults.length === 0
          ? <div className="rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark"><p className="text-sm text-gray-500">{t('resources.empty')}</p></div>
          : (<><p className="mb-3 text-sm text-body">{t('resources.searchResults', { count: searchResults.length })}</p>{renderFiles(searchResults)}</>)
      ) : openFolder ? (
        /* Inside a folder */
        folderFiles.length === 0
          ? <div className="rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark"><p className="text-sm text-gray-500">{t('resources.folderEmpty')}</p></div>
          : renderFiles(folderFiles)
      ) : resources.length === 0 ? (
        <div className="rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark"><p className="text-sm text-gray-500">{t('resources.empty')}</p></div>
      ) : (
        /* Landing: folder tiles + root files */
        <div className="space-y-7">
          {folders.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{t('resources.folders')}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {folders.map(f => (
                  <button key={f.name} onClick={() => setOpenFolder(f.name)}
                    className="group flex flex-col items-center rounded-xl border border-stroke bg-white p-5 text-center shadow-default transition hover:border-primary hover:shadow-md dark:border-strokedark dark:bg-boxdark">
                    <svg className="h-10 w-10 text-[#fe6523]" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" /></svg>
                    <span className="mt-2 w-full truncate text-sm font-medium text-black dark:text-white">{f.name}</span>
                    <span className="text-xs text-gray-400">{t('resources.fileCount', { count: f.count })}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {rootFiles.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{folders.length > 0 ? t('resources.rootFiles') : t('resources.files')}</p>
              {renderFiles(rootFiles)}
            </div>
          )}
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
            {isAdmin && (
              <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3">
                <p className="mb-2 text-xs font-semibold text-danger">{t('resources.dangerZone')}</p>
                <button onClick={deleteAll} className="inline-flex items-center gap-2 rounded-lg border border-danger px-3 py-2 text-sm font-medium text-danger hover:bg-danger hover:text-white">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  {t('resources.deleteAllBtn')}
                </button>
                <p className="mt-1.5 text-[11px] text-body">{t('resources.deleteAllNote')}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Resources;
