import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface PricingPackage {
  id: string; catId: string; nameEn: string; nameFr: string | null;
  sku: string | null; skuYear: string | null; compat: string[]; pos: string | null;
  priceMonthly: number | null; priceYearly: number | null; priceFlat: number | null;
  unit: string | null; activation: number | null;
  includesEn: string[]; includesFr: string[];
  internalEn: Record<string, string> | null; internalFr: Record<string, string> | null;
  status: string[]; groupName: string | null; tier: string | null; mode: string | null;
  rates: Record<string, number> | null; visible: boolean;
}
type PkgEdit = Partial<Omit<PricingPackage, 'id'>>;

interface PricingCategory {
  id: string; nameEn: string; nameFr: string; sortOrder: number; hourly: number | null;
  noteEn: string | null; noteFr: string | null;
}

// Category icons — matches the design handoff's icon set exactly.
const catIconPaths = (id: string): React.ReactNode => {
  switch (id) {
    case 'saas': return <><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3M17 6l3 3M15 8l2 2" /></>;
    case 'rental': return <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>;
    case 'menu': return <path d="M4 3v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3M6 3v18M16 3c-2 0-3 2-3 5s1 4 3 4v9" />;
    case 'install': return <path d="M14 7a4 4 0 0 0-5.5 5.2l-6 6 2 2 6-6A4 4 0 0 0 17 9l-2.5 2.5L12 9l2.5-2.5z" />;
    case 'support': return <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="2" y="14" width="4" height="6" rx="1.5" /><rect x="18" y="14" width="4" height="6" rx="1.5" /></>;
    case 'olo': return <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>;
    case 'shipping': return <><path d="M3 6h11v9H3z" /><path d="M14 9h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></>;
    case 'xperio': return <><path d="M12 22s7-6.2 7-12A7 7 0 0 0 5 10c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>;
    default: return null;
  }
};
const CatIcon: React.FC<{ id: string; className?: string }> = ({ id, className = 'h-4 w-4' }) => (
  <svg className={`flex-none ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    {catIconPaths(id)}
  </svg>
);

const slugify = () => 'new_pkg_' + Date.now().toString(36);

const PricingAdmin: React.FC = () => {
  const { t } = useTranslation();
  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [categories, setCategories] = useState<PricingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('saas');
  const [q, setQ] = useState('');
  const [catForm, setCatForm] = useState<{ editingId: string | null; nameEn: string; nameFr: string; hourly: string; noteEn: string; noteFr: string } | null>(null);
  const [savingCat, setSavingCat] = useState(false);

  const [edits, setEdits] = useState<Record<string, PkgEdit>>({});
  const [added, setAdded] = useState<PricingPackage[]>([]);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState(false);

  const [form, setForm] = useState<{ editingId: string | null; nameEn: string; nameFr: string; catId: string; compat: string[]; status: string[]; sku: string; monthly: string; yearly: string; flat: string; includesEn: string; includesFr: string } | null>(null);
  const [newTag, setNewTag] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/pricing`, { headers: authHeaders() });
      setPackages(r.data.packages || []);
      setCategories((r.data.categories || []).slice().sort((a: PricingCategory, b: PricingCategory) => a.sortOrder - b.sortOrder));
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to load pricing guide'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const CATS = categories.map((c) => c.id);
  const catLabel = (id: string) => categories.find((c) => c.id === id)?.nameEn || id;

  const openAddCatForm = () => setCatForm({ editingId: null, nameEn: '', nameFr: '', hourly: '', noteEn: '', noteFr: '' });
  const openEditCatForm = (c: PricingCategory) => setCatForm({
    editingId: c.id, nameEn: c.nameEn, nameFr: c.nameFr,
    hourly: c.hourly == null ? '' : String(c.hourly), noteEn: c.noteEn || '', noteFr: c.noteFr || '',
  });
  const saveCatForm = async () => {
    if (!catForm) return;
    if (!catForm.nameEn.trim()) { dialog.alert(t('admin.pricing.catNameRequired') as string); return; }
    setSavingCat(true);
    try {
      const payload = { nameEn: catForm.nameEn.trim(), nameFr: catForm.nameFr.trim(), hourly: catForm.hourly.trim(), noteEn: catForm.noteEn.trim(), noteFr: catForm.noteFr.trim() };
      if (catForm.editingId) {
        await axios.put(`${API_URL}/api/pricing/categories/${encodeURIComponent(catForm.editingId)}`, payload, { headers: authHeaders() });
      } else {
        await axios.post(`${API_URL}/api/pricing/categories`, payload, { headers: authHeaders() });
      }
      setCatForm(null);
      await fetchAll();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to save category'); }
    finally { setSavingCat(false); }
  };

  const allMerged: PricingPackage[] = packages.map((p) => ({ ...p, ...(edits[p.id] || {}) })).concat(added);
  const editedByCat: Record<string, boolean> = {};
  Object.keys(edits).forEach((id) => { const p = packages.find((x) => x.id === id); if (p) editedByCat[p.catId] = true; });
  added.forEach((p) => { editedByCat[p.catId] = true; });
  Object.keys(hidden).forEach((id) => { const p = allMerged.find((x) => x.id === id); if (p) editedByCat[p.catId] = true; });
  Object.keys(removed).forEach((id) => { const p = allMerged.find((x) => x.id === id); if (p) editedByCat[p.catId] = true; });

  let list = allMerged.filter((p) => p.catId === cat && !removed[p.id]);
  if (q.trim()) { const query = q.trim().toLowerCase(); list = list.filter((p) => `${p.nameEn} ${p.sku || ''}`.toLowerCase().includes(query)); }

  const editedCount = Object.keys(edits).length + added.length + Object.keys(hidden).length + Object.keys(removed).length;

  const ev = (id: string, field: keyof PkgEdit, fallback: number | null): string => {
    const e = edits[id];
    if (e && field in e) { const v = e[field]; return v == null ? '' : String(v); }
    return fallback == null ? '' : String(fallback);
  };
  const setEdit = (id: string, field: keyof PkgEdit, raw: string) => {
    const v: number | null = raw.trim() === '' ? null : (isNaN(+raw) ? null : +raw);
    setEdits((e) => ({ ...e, [id]: { ...(e[id] || {}), [field]: v } }));
  };
  const toggleVisible = (id: string) => setHidden((h) => {
    const n = { ...h };
    const currentlyHidden = n[id] !== undefined ? n[id] : !(allMerged.find((p) => p.id === id)?.visible ?? true);
    n[id] = !currentlyHidden;
    return n;
  });
  const isHidden = (p: PricingPackage) => (hidden[p.id] !== undefined ? hidden[p.id] : !p.visible);

  const removePackage = (id: string) => {
    if (added.some((a) => a.id === id)) {
      setAdded((a) => a.filter((x) => x.id !== id));
    } else {
      setRemoved((r) => ({ ...r, [id]: true }));
      setEdits((e) => { const n = { ...e }; delete n[id]; return n; });
      setHidden((h) => { const n = { ...h }; delete n[id]; return n; });
    }
  };

  const revertAll = () => { setEdits({}); setAdded([]); setHidden({}); setRemoved({}); };

  const publish = async () => {
    setPublishing(true);
    try {
      const updatedPayload = Object.entries(edits).map(([id, e]) => ({ ...packages.find((p) => p.id === id), ...e, id }));
      await axios.put(`${API_URL}/api/pricing`, { updated: updatedPayload, added, removed: Object.keys(removed), hidden }, { headers: authHeaders() });
      revertAll();
      await fetchAll();
      dialog.alert(t('admin.pricing.published') as string);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to publish'); }
    finally { setPublishing(false); }
  };

  const openAddForm = () => { setNewTag(''); setForm({ editingId: null, nameEn: '', nameFr: '', catId: cat, compat: ['V1'], status: [], sku: '', monthly: '', yearly: '', flat: '', includesEn: '', includesFr: '' }); };
  const openEditForm = (p: PricingPackage) => { setNewTag(''); setForm({
    editingId: p.id, nameEn: p.nameEn, nameFr: p.nameFr || '', catId: p.catId, compat: [...(p.compat || [])], status: [...(p.status || [])], sku: p.sku || '',
    monthly: p.priceMonthly == null ? '' : String(p.priceMonthly),
    yearly: p.priceYearly == null ? '' : String(p.priceYearly),
    flat: p.priceFlat == null ? '' : String(p.priceFlat),
    includesEn: p.includesEn.join('\n'), includesFr: p.includesFr.join('\n'),
  }); };
  const toggleFormArr = (k: 'compat' | 'status', val: string) => setForm((f) => {
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
    if (!form) return;
    const num = (v: string): number | null => (v.trim() === '' ? null : (isNaN(+v) ? null : +v));
    const includesEn = form.includesEn.split('\n').map((x) => x.trim()).filter(Boolean);
    const includesFr = form.includesFr.split('\n').map((x) => x.trim()).filter(Boolean);
    if (form.editingId) {
      setEdits((e) => ({
        ...e,
        [form.editingId as string]: {
          ...(e[form.editingId as string] || {}),
          catId: form.catId, nameEn: form.nameEn.trim() || 'Untitled', nameFr: form.nameFr.trim() || null,
          sku: form.sku.trim() || null, compat: form.compat, status: form.status,
          priceMonthly: num(form.monthly), priceYearly: num(form.yearly), priceFlat: num(form.flat),
          includesEn, includesFr,
        },
      }));
    } else {
      const rec: PricingPackage = {
        id: slugify(), catId: form.catId, nameEn: form.nameEn.trim() || 'Untitled', nameFr: form.nameFr.trim() || null,
        sku: form.sku.trim() || null, skuYear: null, compat: form.compat, pos: null,
        priceMonthly: num(form.monthly), priceYearly: num(form.yearly), priceFlat: num(form.flat),
        unit: null, activation: null,
        includesEn, includesFr,
        internalEn: null, internalFr: null, status: form.status, groupName: null, tier: null, mode: null, rates: null, visible: true,
      };
      setAdded((a) => [...a, rec]);
    }
    setForm(null);
    setNewTag('');
  };

  const inputCls = 'w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';
  const priceInputCls = 'w-full rounded-md border border-stroke bg-transparent px-2 py-1.5 text-right font-mono text-[13px] outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';

  return (
    <div className="relative">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-gray-400">{t('admin.pricing.hint')}</p>
        <button onClick={openAddForm} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90">
          + {t('admin.pricing.addPackage')}
        </button>
      </div>

      <div className="mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hardware.searchPh') as string}
          className="w-64 rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
      </div>

      <div className="flex gap-6">
        <div className="w-[190px] flex-none">
          <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('admin.pricing.priceLists')}</div>
          <div className="flex flex-col gap-0.5">
            {categories.map((catRow) => {
              const c = catRow.id;
              const on = cat === c;
              const count = allMerged.filter((p) => p.catId === c && !removed[p.id]).length;
              return (
                <div key={c} className={`group flex items-center gap-1 rounded-lg border-l-[3px] pr-1 ${on ? 'border-l-primary bg-gray-2 dark:bg-meta-4' : 'border-l-transparent hover:bg-gray-1 dark:hover:bg-meta-4/40'}`}>
                  <button onClick={() => setCat(c)} className={`flex flex-1 items-center gap-2 px-3 py-2 text-left text-[13px] font-medium ${on ? 'text-black dark:text-white' : 'text-body'}`}>
                    <CatIcon id={c} />
                    <span className="flex-1">{catLabel(c)}</span>
                    <span className="text-[11px] text-gray-400">{count}</span>
                    {editedByCat[c] && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </button>
                  <button onClick={() => openEditCatForm(catRow)} title={t('common.edit') as string}
                    className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-gray-400 opacity-0 hover:text-primary group-hover:opacity-100">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
          <button onClick={openAddCatForm} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stroke px-3 py-2 text-[12.5px] font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            {t('admin.pricing.addCategory')}
          </button>
        </div>

        <div className="min-w-0 flex-1 pb-20">
          {loading ? (
            <div className="flex h-40 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-stroke dark:border-strokedark">
              <table className="w-full text-sm">
                <thead className="bg-gray-2 dark:bg-meta-4">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">{t('admin.pricing.colName')}</th>
                    <th className="px-3 py-2.5 text-left font-medium">{t('admin.pricing.colSku')}</th>
                    <th className="w-24 px-3 py-2.5 text-right font-medium">{t('admin.pricing.colMonthly')}</th>
                    <th className="w-24 px-3 py-2.5 text-right font-medium">{t('admin.pricing.colYearly')}</th>
                    <th className="w-24 px-3 py-2.5 text-right font-medium">{t('admin.pricing.colFlat')}</th>
                    <th className="w-16 px-3 py-2.5 text-center font-medium">{t('admin.pricing.colVisible')}</th>
                    <th className="sticky right-0 w-20 bg-gray-2 px-2 py-2.5 dark:bg-meta-4" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const isNewRow = added.some((a) => a.id === p.id);
                    const rowHidden = isHidden(p);
                    const rowEdited = isNewRow || !!edits[p.id] || rowHidden !== !p.visible;
                    // No zebra striping — every row shares one background (shared with the sticky
                    // actions cell so they can never mismatch) instead of alternating tints.
                    const rowBg = 'bg-white dark:bg-boxdark';
                    return (
                      <tr key={p.id} className={`border-t border-l-[3px] border-stroke dark:border-strokedark ${rowBg} ${rowEdited ? 'border-l-primary' : 'border-l-transparent'}`}>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-black dark:text-white">{p.nameEn}</span>
                            {(p.compat.length > 0 || p.status.length > 0 || isNewRow || rowHidden) && (
                              <div className="flex flex-wrap items-center gap-1">
                                {p.compat.map((c) => (
                                  <span key={`c-${c}`} className="whitespace-nowrap rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                                    {c === 'V2' ? t('hardware.kaizen') : c}
                                  </span>
                                ))}
                                {p.status.map((s) => (
                                  <span key={`s-${s}`} className="whitespace-nowrap rounded-full bg-gray-2 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-500 dark:bg-meta-4">
                                    {s === 'new' ? t('pricingGuide.newTag') : s === 'legacy' ? t('pricingGuide.existingTag') : s}
                                  </span>
                                ))}
                                {isNewRow && <span className="whitespace-nowrap rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-700 dark:text-success">{t('admin.hardware.added')}</span>}
                                {rowHidden && <span className="whitespace-nowrap rounded-full bg-gray-2 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-500 dark:bg-meta-4">{t('admin.hardware.hidden')}</span>}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-400">{p.sku || '—'}</td>
                        <td className="px-2 py-1.5"><input value={ev(p.id, 'priceMonthly', p.priceMonthly)} onChange={(e) => setEdit(p.id, 'priceMonthly', e.target.value)} className={priceInputCls} /></td>
                        <td className="px-2 py-1.5"><input value={ev(p.id, 'priceYearly', p.priceYearly)} onChange={(e) => setEdit(p.id, 'priceYearly', e.target.value)} className={priceInputCls} /></td>
                        <td className="px-2 py-1.5"><input value={ev(p.id, 'priceFlat', p.priceFlat)} onChange={(e) => setEdit(p.id, 'priceFlat', e.target.value)} className={priceInputCls} /></td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => toggleVisible(p.id)}
                            className={`inline-flex h-[22px] w-[38px] items-center rounded-full p-0.5 ${rowHidden ? 'justify-start bg-stroke dark:bg-strokedark' : 'justify-end bg-primary'}`}>
                            <span className="h-[18px] w-[18px] rounded-full bg-white" />
                          </button>
                        </td>
                        <td className={`sticky right-0 flex items-center justify-center gap-1 px-2 py-2 ${rowBg}`}>
                          <button onClick={() => openEditForm(p)} title={t('common.edit') as string}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-primary/10 hover:text-primary">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
                          </button>
                          <button onClick={() => removePackage(p.id)} title={t('common.delete') as string}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-danger/10 hover:text-danger">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" /></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {list.length === 0 && (
                    <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">{t('admin.hardware.emptyCategory')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editedCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-3.5 border-t border-stroke bg-white/95 px-6 py-3.5 backdrop-blur dark:border-strokedark dark:bg-boxdark/95 md:left-[290px]">
          <span className="text-[13px] font-bold text-black dark:text-white">{t('admin.pricing.unsaved', { count: editedCount })}</span>
          <div className="flex-1" />
          <button onClick={revertAll} className="rounded-full border border-stroke px-3.5 py-2 text-[13px] text-gray-500 hover:border-danger hover:text-danger dark:border-strokedark">{t('common.cancel')}</button>
          <button onClick={publish} disabled={publishing} className="rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
            {publishing ? t('admin.pricing.publishing') : t('admin.pricing.publish')}
          </button>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onClick={() => setForm(null)}>
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
            <div className="flex flex-none items-center justify-between border-b border-stroke px-5 py-4 dark:border-strokedark">
              <span className="text-base font-bold text-black dark:text-white">{form.editingId ? t('admin.pricing.editPackage') : t('admin.pricing.newPackage')}</span>
              <button onClick={() => setForm(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fName')} (EN)</span><input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} className={inputCls} /></label>
                  <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fName')} (FR)</span><input value={form.nameFr} onChange={(e) => setForm({ ...form, nameFr: e.target.value })} className={inputCls} /></label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fCat')}</span>
                    <select value={form.catId} onChange={(e) => setForm({ ...form, catId: e.target.value })} className={inputCls}>
                      {CATS.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fSku')}</span><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className={`${inputCls} font-mono`} /></label>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fCompat')}</div>
                  <div className="flex gap-2">
                    {['V1', 'V2'].map((c) => (
                      <button key={c} onClick={() => toggleFormArr('compat', c)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${form.compat.includes(c) ? 'border-primary bg-primary/10 text-primary' : 'border-stroke text-body dark:border-strokedark'}`}>{c === 'V2' ? t('hardware.kaizen') : c}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fStatus')}</div>
                  <div className="flex flex-wrap gap-2">
                    {['new', 'legacy'].map((s) => (
                      <button key={s} onClick={() => toggleFormArr('status', s)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${form.status.includes(s) ? 'border-primary bg-primary/10 text-primary' : 'border-stroke text-body dark:border-strokedark'}`}>{t(`pricingGuide.${s === 'new' ? 'newTag' : 'existingTag'}`)}</button>
                    ))}
                    {form.status.filter((s) => s !== 'new' && s !== 'legacy').map((s) => (
                      <button key={s} onClick={() => toggleFormArr('status', s)} className="rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">{s}</button>
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
                <div className="grid grid-cols-3 gap-3">
                  <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.colMonthly')}</span><input value={form.monthly} onChange={(e) => setForm({ ...form, monthly: e.target.value })} className={inputCls} /></label>
                  <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.colYearly')}</span><input value={form.yearly} onChange={(e) => setForm({ ...form, yearly: e.target.value })} className={inputCls} /></label>
                  <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.colFlat')}</span><input value={form.flat} onChange={(e) => setForm({ ...form, flat: e.target.value })} className={inputCls} /></label>
                </div>
                <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fIncludes')} (EN)</span><textarea value={form.includesEn} onChange={(e) => setForm({ ...form, includesEn: e.target.value })} rows={3} className={inputCls} /></label>
                <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fIncludes')} (FR)</span><textarea value={form.includesFr} onChange={(e) => setForm({ ...form, includesFr: e.target.value })} rows={3} className={inputCls} /></label>
              </div>
            </div>
            <div className="flex flex-none items-center justify-end gap-2.5 border-t border-stroke p-4 dark:border-strokedark">
              <button onClick={() => setForm(null)} className="rounded-lg border border-stroke px-4 py-2.5 text-sm font-medium text-body dark:border-strokedark">{t('common.cancel')}</button>
              <button onClick={saveForm} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90">{form.editingId ? t('common.save') : t('admin.pricing.addPackage')}</button>
            </div>
          </div>
        </div>
      )}

      {catForm && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onClick={() => setCatForm(null)}>
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
            <div className="flex flex-none items-center justify-between border-b border-stroke px-5 py-4 dark:border-strokedark">
              <span className="text-base font-bold text-black dark:text-white">{catForm.editingId ? t('admin.pricing.editCategory') : t('admin.pricing.addCategory')}</span>
              <button onClick={() => setCatForm(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex flex-col gap-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fName')} (EN)</span><input value={catForm.nameEn} onChange={(e) => setCatForm({ ...catForm, nameEn: e.target.value })} className={inputCls} /></label>
                  <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fName')} (FR)</span><input value={catForm.nameFr} onChange={(e) => setCatForm({ ...catForm, nameFr: e.target.value })} className={inputCls} /></label>
                </div>
                <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fHourly')}</span><input value={catForm.hourly} onChange={(e) => setCatForm({ ...catForm, hourly: e.target.value })} placeholder="125" className={inputCls} /></label>
                <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fCatNote')} (EN)</span><textarea value={catForm.noteEn} onChange={(e) => setCatForm({ ...catForm, noteEn: e.target.value })} rows={2} className={inputCls} /></label>
                <label className="flex flex-col gap-1"><span className="text-xs font-semibold uppercase text-gray-400">{t('admin.pricing.fCatNote')} (FR)</span><textarea value={catForm.noteFr} onChange={(e) => setCatForm({ ...catForm, noteFr: e.target.value })} rows={2} className={inputCls} /></label>
              </div>
            </div>
            <div className="flex flex-none items-center justify-end gap-2.5 border-t border-stroke p-4 dark:border-strokedark">
              <button onClick={() => setCatForm(null)} className="rounded-lg border border-stroke px-4 py-2.5 text-sm font-medium text-body dark:border-strokedark">{t('common.cancel')}</button>
              <button onClick={saveCatForm} disabled={savingCat} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
                {catForm.editingId ? t('common.save') : t('admin.pricing.addCategory')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PricingAdmin;
