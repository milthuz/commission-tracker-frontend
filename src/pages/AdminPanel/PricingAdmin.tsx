import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface PricingPackage {
  id: string; catId: string; nameEn: string; nameFr: string | null;
  sku: string | null; skuYear: string | null; compat: string | null; pos: string | null;
  priceMonthly: number | null; priceYearly: number | null; priceFlat: number | null;
  unit: string | null; activation: number | null;
  includesEn: string[]; includesFr: string[];
  internalEn: Record<string, string> | null; internalFr: Record<string, string> | null;
  status: string | null; groupName: string | null; tier: string | null; mode: string | null;
  rates: Record<string, number> | null; visible: boolean;
}
type PkgEdit = Partial<Pick<PricingPackage, 'priceMonthly' | 'priceYearly' | 'priceFlat'>>;

const CATS = ['saas', 'rental', 'menu', 'install', 'support', 'olo', 'shipping', 'xperio'];

const slugify = () => 'new_pkg_' + Date.now().toString(36);

const PricingAdmin: React.FC = () => {
  const { t } = useTranslation();
  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('saas');
  const [q, setQ] = useState('');

  const [edits, setEdits] = useState<Record<string, PkgEdit>>({});
  const [added, setAdded] = useState<PricingPackage[]>([]);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState(false);

  const [form, setForm] = useState<{ nameEn: string; nameFr: string; catId: string; compat: string; sku: string; monthly: string; yearly: string; flat: string; includesEn: string; includesFr: string } | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/pricing`, { headers: authHeaders() });
      setPackages(r.data.packages || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to load pricing guide'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const catLabel = (id: string) => t(`pricingGuide.categories.${id}.title`);

  const allMerged: PricingPackage[] = packages.map((p) => ({ ...p, ...(edits[p.id] || {}) })).concat(added);
  const editedByCat: Record<string, boolean> = {};
  Object.keys(edits).forEach((id) => { const p = packages.find((x) => x.id === id); if (p) editedByCat[p.catId] = true; });
  added.forEach((p) => { editedByCat[p.catId] = true; });
  Object.keys(hidden).forEach((id) => { const p = allMerged.find((x) => x.id === id); if (p) editedByCat[p.catId] = true; });

  let list = allMerged.filter((p) => p.catId === cat);
  if (q.trim()) { const query = q.trim().toLowerCase(); list = list.filter((p) => `${p.nameEn} ${p.sku || ''}`.toLowerCase().includes(query)); }

  const editedCount = Object.keys(edits).length + added.length + Object.keys(hidden).length;

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

  const revertAll = () => { setEdits({}); setAdded([]); setHidden({}); };

  const publish = async () => {
    setPublishing(true);
    try {
      const updatedPayload = Object.entries(edits).map(([id, e]) => ({ ...packages.find((p) => p.id === id), ...e, id }));
      await axios.put(`${API_URL}/api/pricing`, { updated: updatedPayload, added, removed: [], hidden }, { headers: authHeaders() });
      revertAll();
      await fetchAll();
      dialog.alert(t('admin.pricing.published') as string);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to publish'); }
    finally { setPublishing(false); }
  };

  const openAddForm = () => setForm({ nameEn: '', nameFr: '', catId: cat, compat: 'V1', sku: '', monthly: '', yearly: '', flat: '', includesEn: '', includesFr: '' });
  const saveNewPackage = () => {
    if (!form) return;
    const num = (v: string): number | null => (v.trim() === '' ? null : (isNaN(+v) ? null : +v));
    const rec: PricingPackage = {
      id: slugify(), catId: form.catId, nameEn: form.nameEn.trim() || 'Untitled', nameFr: form.nameFr.trim() || null,
      sku: form.sku.trim() || null, skuYear: null, compat: form.compat || null, pos: null,
      priceMonthly: num(form.monthly), priceYearly: num(form.yearly), priceFlat: num(form.flat),
      unit: null, activation: null,
      includesEn: form.includesEn.split('\n').map((x) => x.trim()).filter(Boolean),
      includesFr: form.includesFr.split('\n').map((x) => x.trim()).filter(Boolean),
      internalEn: null, internalFr: null, status: null, groupName: null, tier: null, mode: null, rates: null, visible: true,
    };
    setAdded((a) => [...a, rec]);
    setForm(null);
  };

  const inputCls = 'w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';
  const priceInputCls = 'w-full rounded-md border border-stroke bg-transparent px-2 py-1.5 text-right font-mono text-[13px] outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';

  return (
    <div className="relative">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.pricing.title')}</h3>
          <p className="text-sm text-body">{t('admin.pricing.subtitle')}</p>
          <p className="mt-1 text-xs text-gray-400">{t('admin.pricing.hint')}</p>
        </div>
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
            {CATS.map((c) => {
              const on = cat === c;
              return (
                <button key={c} onClick={() => setCat(c)}
                  className={`flex items-center gap-2 rounded-lg border-l-[3px] px-3 py-2 text-left text-[13px] font-medium ${on ? 'border-l-primary bg-gray-2 text-black dark:bg-meta-4 dark:text-white' : 'border-l-transparent text-body hover:bg-gray-1 dark:hover:bg-meta-4/40'}`}>
                  <span className="flex-1">{catLabel(c)}</span>
                  {editedByCat[c] && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>
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
                  </tr>
                </thead>
                <tbody>
                  {list.map((p, i) => {
                    const isNewRow = added.some((a) => a.id === p.id);
                    const rowHidden = isHidden(p);
                    const rowEdited = isNewRow || !!edits[p.id] || rowHidden !== !p.visible;
                    return (
                      <tr key={p.id} className={`border-t border-l-[3px] border-stroke dark:border-strokedark ${i % 2 ? 'bg-gray-1/40 dark:bg-meta-4/10' : ''} ${rowEdited ? 'border-l-primary' : 'border-l-transparent'}`}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-black dark:text-white">{p.nameEn}</span>
                            {p.compat === 'V2' && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">{t('hardware.kaizen')}</span>}
                            {isNewRow && <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">{t('admin.hardware.added')}</span>}
                            {rowHidden && <span className="rounded-full bg-gray-2 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-500 dark:bg-meta-4">{t('admin.hardware.hidden')}</span>}
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
                      </tr>
                    );
                  })}
                  {list.length === 0 && (
                    <tr><td colSpan={6} className="py-10 text-center text-sm text-gray-400">{t('admin.hardware.emptyCategory')}</td></tr>
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
              <span className="text-base font-bold text-black dark:text-white">{t('admin.pricing.newPackage')}</span>
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
                      <button key={c} onClick={() => setForm({ ...form, compat: c })} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${form.compat === c ? 'border-primary bg-primary/10 text-primary' : 'border-stroke text-body dark:border-strokedark'}`}>{c === 'V2' ? t('hardware.kaizen') : c}</button>
                    ))}
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
              <button onClick={saveNewPackage} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90">{t('admin.pricing.addPackage')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PricingAdmin;
