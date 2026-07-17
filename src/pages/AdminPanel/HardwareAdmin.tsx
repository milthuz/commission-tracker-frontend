import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface HardwareCategory { id: string; sortOrder: number; }
interface HardwareProduct {
  id: string; catId: string; nameEn: string; nameFr: string | null;
  specsEn: string[]; specsFr: string[]; sku: string | null; price: string | null;
  compat: string[]; status: string[];
  useEn: string | null; useFr: string | null;
  warrantyEn: string | null; warrantyFr: string | null;
  noteEn: string | null; noteFr: string | null;
  hasImage: boolean; visible: boolean;
}
type ProductEdit = Partial<Omit<HardwareProduct, 'id' | 'hasImage' | 'visible'>>;

const STATUS_KEYS = ['new', 'soon', 'eol', 'wsl', 'legacy', 'rental'];

// Category icons — no icon set exists in the design handoff for Admin Hardware, so these are
// picked to read clearly at a glance per category (POS terminal, tablet, printer, receipt,
// card, display, wifi, scanner, cash), matching the stroke style used across the app.
const catIconPaths = (id: string): React.ReactNode => {
  switch (id) {
    case 'pos': return <><rect x="4" y="3" width="16" height="12" rx="2" /><path d="M9 21h6M12 15v6" /></>;
    case 'tab': return <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 19h2" /></>;
    case 'kp': return <><rect x="5" y="8" width="14" height="8" rx="1" /><path d="M7 8V4h10v4M7 16v4h10v-4" /></>;
    case 'rp': return <><path d="M6 2h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" /><path d="M9 7h6M9 11h6M9 15h4" /></>;
    case 'pay': return <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>;
    case 'disp': return <><rect x="2" y="5" width="14" height="10" rx="1.5" /><path d="M18 8v6M20.5 9v4" /></>;
    case 'net': return <><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r="1" /></>;
    case 'periph': return <><path d="M4 8V5a1 1 0 0 1 1-1h3M4 16v3a1 1 0 0 0 1 1h3M20 8V5a1 1 0 0 0-1-1h-3M20 16v3a1 1 0 0 1-1 1h-3" /><path d="M4 12h16" /></>;
    case 'cash': return <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 9v.01M18 15v.01" /></>;
    default: return null;
  }
};
const CatIcon: React.FC<{ id: string; className?: string }> = ({ id, className = 'h-4 w-4' }) => (
  <svg className={`flex-none ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    {catIconPaths(id)}
  </svg>
);

const slugify = (s: string) => 'new_' + s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) + '_' + Date.now().toString(36);

const HardwareAdmin: React.FC = () => {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<HardwareCategory[]>([]);
  const [products, setProducts] = useState<HardwareProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('pos');
  const [q, setQ] = useState('');

  const [edits, setEdits] = useState<Record<string, ProductEdit>>({});
  const [added, setAdded] = useState<HardwareProduct[]>([]);
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState(false);

  const [formId, setFormId] = useState<string | null>(null);
  const [formLang, setFormLang] = useState<'en' | 'fr'>('en');
  const [form, setForm] = useState<{
    catId: string; nameEn: string; nameFr: string; sku: string; price: string;
    compat: string[]; status: string[]; specsEn: string; specsFr: string;
    useEn: string; useFr: string; warrantyEn: string; warrantyFr: string; noteEn: string; noteFr: string;
    isNew: boolean; hasImage: boolean;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [newTag, setNewTag] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/hardware`, { headers: authHeaders() });
      setCategories(r.data.categories || []);
      setProducts(r.data.products || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to load hardware catalog'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  // Merged view: base products (minus removed) overlaid with local edits, plus staged "added".
  const allMerged: HardwareProduct[] = products
    .filter((p) => !removed[p.id])
    .map((p) => ({ ...p, ...(edits[p.id] || {}) }))
    .concat(added);

  const catLabel = (id: string) => t(`hardware.categories.${id}`);

  const editedByCat: Record<string, boolean> = {};
  Object.keys(edits).forEach((id) => { const p = allMerged.find((x) => x.id === id); if (p) editedByCat[p.catId] = true; });
  added.forEach((p) => { editedByCat[p.catId] = true; });
  Object.keys(removed).forEach((id) => { const p = products.find((x) => x.id === id); if (p) editedByCat[p.catId] = true; });
  Object.keys(hidden).forEach((id) => { const p = allMerged.find((x) => x.id === id); if (p) editedByCat[p.catId] = true; });

  let list = allMerged.filter((p) => p.catId === cat);
  if (q.trim()) { const query = q.trim().toLowerCase(); list = list.filter((p) => `${p.nameEn} ${p.sku || ''}`.toLowerCase().includes(query)); }

  const editedCount = Object.keys(edits).length + added.length + Object.keys(removed).length + Object.keys(hidden).length;

  const openForm = (p: HardwareProduct | null) => {
    const isNew = !p;
    const base = p || { id: slugify('product'), catId: cat, nameEn: '', nameFr: '', sku: '', price: '', compat: [], status: [], specsEn: [], specsFr: [], useEn: '', useFr: '', warrantyEn: '1-yr manufacturer', warrantyFr: '', noteEn: '', noteFr: '', hasImage: false, visible: true } as HardwareProduct;
    setFormId(base.id);
    setFormLang('en');
    setNewTag('');
    setForm({
      catId: base.catId, nameEn: base.nameEn || '', nameFr: base.nameFr || '', sku: base.sku || '', price: base.price || '',
      compat: [...(base.compat || [])], status: [...(base.status || [])],
      specsEn: (base.specsEn || []).join('\n'), specsFr: (base.specsFr || []).join('\n'),
      useEn: base.useEn || '', useFr: base.useFr || '', warrantyEn: base.warrantyEn || '', warrantyFr: base.warrantyFr || '',
      noteEn: base.noteEn || '', noteFr: base.noteFr || '', isNew, hasImage: base.hasImage,
    });
  };
  const closeForm = () => { setFormId(null); setForm(null); };
  const setF = <K extends keyof NonNullable<typeof form>>(k: K, v: NonNullable<typeof form>[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggleFArr = (k: 'compat' | 'status', val: string) => setForm((f) => {
    if (!f) return f;
    const arr = f[k].includes(val) ? f[k].filter((x) => x !== val) : [...f[k], val];
    return { ...f, [k]: arr };
  });
  const addCustomTag = () => {
    const tag = newTag.trim();
    if (!tag) return;
    setForm((f) => (f && !f.status.includes(tag) ? { ...f, status: [...f.status, tag] } : f));
    setNewTag('');
  };

  const saveForm = () => {
    if (!form || !formId) return;
    const rec: ProductEdit = {
      catId: form.catId, nameEn: form.nameEn.trim() || 'Untitled', nameFr: form.nameFr.trim() || null,
      sku: form.sku.trim() || null, price: form.price.trim() || null,
      compat: form.compat, status: form.status,
      specsEn: form.specsEn.split('\n').map((x) => x.trim()).filter(Boolean),
      specsFr: form.specsFr.split('\n').map((x) => x.trim()).filter(Boolean),
      useEn: form.useEn.trim() || null, useFr: form.useFr.trim() || null,
      warrantyEn: form.warrantyEn.trim() || null, warrantyFr: form.warrantyFr.trim() || null,
      noteEn: form.noteEn.trim() || null, noteFr: form.noteFr.trim() || null,
    };
    if (form.isNew) {
      setAdded((a) => [...a, { id: formId, hasImage: false, visible: true, ...rec } as HardwareProduct]);
    } else if (added.some((a) => a.id === formId)) {
      setAdded((a) => a.map((x) => (x.id === formId ? { ...x, ...rec } : x)));
    } else {
      setEdits((e) => ({ ...e, [formId]: { ...(e[formId] || {}), ...rec } }));
    }
    closeForm();
  };

  const removeProduct = () => {
    if (!formId) return;
    if (added.some((a) => a.id === formId)) {
      setAdded((a) => a.filter((x) => x.id !== formId));
    } else {
      setRemoved((r) => ({ ...r, [formId]: true }));
      setEdits((e) => { const n = { ...e }; delete n[formId]; return n; });
    }
    closeForm();
  };

  const toggleVisible = (id: string) => setHidden((h) => {
    const n = { ...h };
    const currentlyHidden = n[id] !== undefined ? n[id] : !(allMerged.find((p) => p.id === id)?.visible ?? true);
    n[id] = !currentlyHidden;
    return n;
  });
  const isHidden = (p: HardwareProduct) => (hidden[p.id] !== undefined ? hidden[p.id] : !p.visible);

  const revertAll = () => { setEdits({}); setAdded([]); setRemoved({}); setHidden({}); };

  const publish = async () => {
    setPublishing(true);
    try {
      const updatedPayload = Object.entries(edits).map(([id, e]) => ({ id, ...products.find((p) => p.id === id), ...e }));
      await axios.put(`${API_URL}/api/hardware`, { updated: updatedPayload, added, removed: Object.keys(removed), hidden }, { headers: authHeaders() });
      revertAll();
      await fetchAll();
      dialog.alert(t('admin.hardware.published') as string);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to publish'); }
    finally { setPublishing(false); }
  };

  const uploadImage = async (file: File) => {
    if (!formId || form?.isNew) return;
    setUploadingImg(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      await axios.post(`${API_URL}/api/hardware/${formId}/image`, fd, { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' } });
      setForm((f) => (f ? { ...f, hasImage: true } : f));
      setProducts((ps) => ps.map((p) => (p.id === formId ? { ...p, hasImage: true } : p)));
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Upload failed'); }
    finally { setUploadingImg(false); }
  };
  const removeImage = async () => {
    if (!formId) return;
    try {
      await axios.delete(`${API_URL}/api/hardware/${formId}/image`, { headers: authHeaders() });
      setForm((f) => (f ? { ...f, hasImage: false } : f));
      setProducts((ps) => ps.map((p) => (p.id === formId ? { ...p, hasImage: false } : p)));
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to remove image'); }
  };

  const inputCls = 'w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';
  const chipBtn = (active: boolean) => `rounded-full border px-3 py-1.5 text-xs font-medium ${active ? 'border-primary bg-primary/10 text-primary' : 'border-stroke text-body dark:border-strokedark'}`;

  return (
    <div className="relative">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.hardware.title')}</h3>
          <p className="text-sm text-body">{t('admin.hardware.subtitle')}</p>
        </div>
        <button onClick={() => openForm(null)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90">
          + {t('admin.hardware.addProduct')}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hardware.searchPh') as string}
          className="w-64 rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
      </div>

      <div className="flex gap-6">
        <div className="w-[190px] flex-none">
          <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('admin.hardware.categories')}</div>
          <div className="flex flex-col gap-0.5">
            {categories.map((c) => {
              const count = allMerged.filter((p) => p.catId === c.id).length;
              const on = cat === c.id;
              return (
                <button key={c.id} onClick={() => setCat(c.id)}
                  className={`flex items-center gap-2 rounded-lg border-l-[3px] px-3 py-2 text-left text-[13px] font-medium ${on ? 'border-l-primary bg-gray-2 text-black dark:bg-meta-4 dark:text-white' : 'border-l-transparent text-body hover:bg-gray-1 dark:hover:bg-meta-4/40'}`}>
                  <CatIcon id={c.id} />
                  <span className="flex-1">{catLabel(c.id)}</span>
                  <span className="text-[11px] text-gray-400">{count}</span>
                  {editedByCat[c.id] && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 flex-1 pb-20">
          {loading ? (
            <div className="flex h-40 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="text-sm text-gray-400">{t('admin.hardware.emptyCategory')}</div>
              <button onClick={() => openForm(null)} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">{t('admin.hardware.addProduct')}</button>
            </div>
          ) : (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {list.map((p) => {
                const isNewRow = added.some((a) => a.id === p.id);
                const rowHidden = isHidden(p);
                const rowEdited = isNewRow || !!edits[p.id] || rowHidden !== !p.visible;
                return (
                  <div key={p.id} className={`flex gap-3 rounded-2xl border bg-white p-3.5 dark:bg-boxdark ${rowEdited ? 'border-primary' : 'border-stroke dark:border-strokedark'}`}>
                    <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-xl bg-gray-2 dark:bg-meta-4">
                      {p.hasImage ? <img src={`${API_URL}/api/hardware/${p.id}/image`} alt={p.nameEn} className="h-full w-full object-contain p-1.5" /> : <span className="text-[10px] text-gray-400">{t('hardware.noPhoto')}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap gap-1">
                        {p.compat.includes('V2') && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">{t('hardware.kaizen')}</span>}
                        {p.status.map((k) => <span key={k} className="rounded-full bg-gray-2 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-500 dark:bg-meta-4">{t(`hardware.status.${k}`)}</span>)}
                        {isNewRow && <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-700 dark:text-success">{t('admin.hardware.added')}</span>}
                        {rowHidden && <span className="rounded-full bg-gray-2 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-500 dark:bg-meta-4">{t('admin.hardware.hidden')}</span>}
                      </div>
                      <div className="truncate text-[14px] font-bold text-black dark:text-white">{p.nameEn}</div>
                      <div className="truncate font-mono text-[11px] text-gray-400">{p.sku || '—'}</div>
                      <div className="mt-0.5 text-[13px] font-semibold text-black dark:text-white">{p.price || '—'}</div>
                    </div>
                    <div className="flex flex-none flex-col items-end justify-between">
                      <button onClick={() => openForm(p)} title={t('common.edit') as string} className="flex h-8 w-8 items-center justify-center rounded-lg border border-stroke text-gray-500 hover:text-primary dark:border-strokedark">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
                      </button>
                      <button onClick={() => toggleVisible(p.id)} title={t('admin.hardware.visible') as string}
                        className={`flex h-[22px] w-[38px] items-center rounded-full p-0.5 ${rowHidden ? 'justify-start bg-stroke dark:bg-strokedark' : 'justify-end bg-primary'}`}>
                        <span className="h-[18px] w-[18px] rounded-full bg-white" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Unsaved-changes tray */}
      {editedCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-3.5 border-t border-stroke bg-white/95 px-6 py-3.5 backdrop-blur dark:border-strokedark dark:bg-boxdark/95 md:left-[290px]">
          <span className="text-[13px] font-bold text-black dark:text-white">{t('admin.hardware.unsaved', { count: editedCount })}</span>
          <div className="flex-1" />
          <button onClick={revertAll} className="rounded-full border border-stroke px-3.5 py-2 text-[13px] text-gray-500 hover:border-danger hover:text-danger dark:border-strokedark">{t('common.cancel')}</button>
          <button onClick={publish} disabled={publishing} className="rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
            {publishing ? t('admin.hardware.publishing') : t('admin.hardware.publish')}
          </button>
        </div>
      )}

      {/* Edit/Add drawer */}
      {form && (
        <div className="fixed inset-0 z-[99999] bg-black/50" onClick={closeForm}>
          <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col overflow-hidden border-l border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
            <div className="flex flex-none items-center justify-between border-b border-stroke px-5 py-4 dark:border-strokedark">
              <span className="text-base font-bold text-black dark:text-white">{form.isNew ? t('admin.hardware.newProduct') : t('admin.hardware.editProduct')}</span>
              <button onClick={closeForm} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-4">
                <div className="mb-1 flex h-32 items-center justify-center overflow-hidden rounded-xl bg-gray-2 dark:bg-meta-4">
                  {form.hasImage ? <img src={`${API_URL}/api/hardware/${formId}/image?v=${Date.now()}`} alt="" className="h-full w-full object-contain p-3" /> : <span className="text-sm text-gray-400">{t('hardware.noPhoto')}</span>}
                </div>
                {form.isNew ? (
                  <p className="text-xs text-gray-400">{t('admin.hardware.imageAfterSave')}</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
                    <button onClick={() => fileRef.current?.click()} disabled={uploadingImg} className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:border-primary dark:border-strokedark disabled:opacity-50">
                      {uploadingImg ? t('common.loading') : t('admin.hardware.uploadImage')}
                    </button>
                    {form.hasImage && <button onClick={removeImage} className="text-xs text-danger hover:underline">{t('common.remove')}</button>}
                  </div>
                )}
              </div>

              <div className="mb-4 inline-flex rounded-lg border border-stroke p-1 dark:border-strokedark">
                {(['en', 'fr'] as const).map((l) => (
                  <button key={l} onClick={() => setFormLang(l)} className={`rounded-md px-4 py-1.5 text-sm font-semibold ${formLang === l ? 'bg-primary text-white' : 'text-body'}`}>{l.toUpperCase()}</button>
                ))}
              </div>

              <div className="flex flex-col gap-3.5">
                {formLang === 'en' ? (
                  <>
                    <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fName')} (EN)</span><input value={form.nameEn} onChange={(e) => setF('nameEn', e.target.value)} className={inputCls} /></label>
                    <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fSpecs')} (EN)</span><textarea value={form.specsEn} onChange={(e) => setF('specsEn', e.target.value)} rows={3} className={inputCls} /></label>
                    <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fUse')} (EN)</span><input value={form.useEn} onChange={(e) => setF('useEn', e.target.value)} className={inputCls} /></label>
                    <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fWarranty')} (EN)</span><input value={form.warrantyEn} onChange={(e) => setF('warrantyEn', e.target.value)} className={inputCls} /></label>
                    <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fNote')} (EN)</span><textarea value={form.noteEn} onChange={(e) => setF('noteEn', e.target.value)} rows={2} className={inputCls} /></label>
                  </>
                ) : (
                  <>
                    <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fName')} (FR)</span><input value={form.nameFr} onChange={(e) => setF('nameFr', e.target.value)} className={inputCls} /></label>
                    <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fSpecs')} (FR)</span><textarea value={form.specsFr} onChange={(e) => setF('specsFr', e.target.value)} rows={3} className={inputCls} /></label>
                    <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fUse')} (FR)</span><input value={form.useFr} onChange={(e) => setF('useFr', e.target.value)} className={inputCls} /></label>
                    <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fWarranty')} (FR)</span><input value={form.warrantyFr} onChange={(e) => setF('warrantyFr', e.target.value)} className={inputCls} /></label>
                    <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fNote')} (FR)</span><textarea value={form.noteFr} onChange={(e) => setF('noteFr', e.target.value)} rows={2} className={inputCls} /></label>
                  </>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fCat')}</span>
                    <select value={form.catId} onChange={(e) => setF('catId', e.target.value)} className={inputCls}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{catLabel(c.id)}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fPrice')}</span><input value={form.price} onChange={(e) => setF('price', e.target.value)} placeholder="$0" className={inputCls} /></label>
                </div>
                <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fSku')}</span><input value={form.sku} onChange={(e) => setF('sku', e.target.value)} className={`${inputCls} font-mono`} /></label>

                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fCompat')}</div>
                  <div className="flex gap-2">
                    {['V1', 'V2'].map((c) => <button key={c} onClick={() => toggleFArr('compat', c)} className={chipBtn(form.compat.includes(c))}>{c === 'V2' ? t('hardware.kaizen') : c}</button>)}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase text-gray-400">{t('admin.hardware.fStatus')}</div>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_KEYS.map((k) => <button key={k} onClick={() => toggleFArr('status', k)} className={chipBtn(form.status.includes(k))}>{t(`hardware.status.${k}`)}</button>)}
                    {form.status.filter((s) => !STATUS_KEYS.includes(s)).map((s) => (
                      <button key={s} onClick={() => toggleFArr('status', s)} className={chipBtn(true)}>{s}</button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input value={newTag} onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
                      placeholder={t('admin.pricing.fNewTagPh') as string}
                      className={`${inputCls} flex-1`} />
                    <button type="button" onClick={addCustomTag} className="whitespace-nowrap rounded-lg border border-stroke px-3 py-2 text-xs font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">{t('admin.pricing.fAddTag')}</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-none items-center gap-2.5 border-t border-stroke p-4 dark:border-strokedark">
              {!form.isNew && <button onClick={removeProduct} className="rounded-lg border border-danger/40 px-3.5 py-2.5 text-sm font-semibold text-danger hover:bg-danger hover:text-white">{t('common.delete')}</button>}
              <div className="flex-1" />
              <button onClick={closeForm} className="rounded-lg border border-stroke px-4 py-2.5 text-sm font-medium text-body dark:border-strokedark">{t('common.cancel')}</button>
              <button onClick={saveForm} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90">{form.isNew ? t('admin.hardware.add') : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HardwareAdmin;
