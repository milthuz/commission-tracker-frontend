import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../lib/dialog';

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
interface HardwareData { categories: HardwareCategory[]; products: HardwareProduct[]; }

const STATUS_ORDER = ['all', 'new', 'soon', 'eol', 'wsl', 'legacy'] as const;
const STATUS_DOT: Record<string, string> = { new: '#17B26A', soon: '#FDB022', eol: '#F46060', wsl: '#E0A94A', legacy: '#94969C', rental: '#608EFA' };
const STATUS_BADGE_CLS: Record<string, string> = {
  new:    'bg-success/15 text-success dark:bg-success/20',
  soon:   'bg-warning/15 text-warning dark:bg-warning/20',
  eol:    'bg-danger/15 text-danger dark:bg-danger/20',
  wsl:    'bg-[#E0A94A]/15 text-[#8A5A00] dark:text-[#E0A94A]',
  legacy: 'bg-gray-2 text-gray-500 dark:bg-meta-4 dark:text-gray-300',
  rental: 'bg-primary/15 text-primary',
};

const Hardware: React.FC = () => {
  const { t, i18n } = useTranslation();
  const fr = i18n.language?.startsWith('fr');
  const pick = (en: string | null, frText: string | null) => (fr && frText ? frText : en) || '';

  const [data, setData] = useState<HardwareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [cat, setCat] = useState('all');
  const [compat, setCompat] = useState<'all' | 'V1' | 'V2'>('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');

  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setError('');
      try {
        const r = await axios.get(`${API_URL}/api/hardware`, { headers: authHeaders() });
        setData(r.data);
      } catch (e: any) {
        setError(e?.response?.data?.error || t('hardware.loadError') as string);
      } finally { setLoading(false); }
    })();
  }, []);

  const catLabel = (id: string) => (id === 'all' ? t('hardware.categoriesAll') : t(`hardware.categories.${id}`));
  const statusLabel = (k: string) => (k === 'all' ? t('common.all') : t(`hardware.status.${k}`));

  const all = data?.products || [];
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return all.filter((p) => {
      if (cat !== 'all' && p.catId !== cat) return false;
      if (compat !== 'all' && !p.compat.includes(compat)) return false;
      if (status !== 'all' && !p.status.includes(status)) return false;
      if (query) {
        const hay = `${pick(p.nameEn, p.nameFr)} ${p.sku || ''} ${(fr && p.specsFr.length ? p.specsFr : p.specsEn).join(' ')}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, cat, compat, status, q, fr]);

  const imgSrc = (p: HardwareProduct) => (p.hasImage ? `${API_URL}/api/hardware/${p.id}/image` : null);

  const copySku = (sku: string | null) => {
    if (!sku) return;
    try { navigator.clipboard.writeText(sku); } catch { /* ignore */ }
    setCopied(sku);
    setTimeout(() => setCopied((c) => (c === sku ? null : c)), 1500);
  };

  const toggleCompare = (id: string) => {
    setCompare((c) => {
      if (c.includes(id)) return c.filter((x) => x !== id);
      if (c.length >= 4) { dialog.alert(t('hardware.compareMax') as string); return c; }
      return [...c, id];
    });
  };

  const detail = detailId ? all.find((p) => p.id === detailId) || null : null;
  const compareItems = compare.map((id) => all.find((p) => p.id === id)).filter(Boolean) as HardwareProduct[];

  const inputCls = 'flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-black dark:text-white placeholder:text-body';
  const segBtn = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${active ? 'bg-primary text-white' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`;
  const chipBtn = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
      active ? 'border-primary bg-primary/10 text-primary dark:text-white' : 'border-stroke text-body hover:border-primary/40 dark:border-strokedark'
    }`;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-primary">{t('hardware.eyebrow')}</span>
            <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning">{t('hardware.internalOnly')}</span>
          </div>
          <h2 className="text-2xl font-bold text-black dark:text-white">{t('hardware.title')}</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">{t('hardware.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-stroke p-1 dark:border-strokedark">
            {(['en', 'fr'] as const).map((l) => (
              <button key={l} onClick={() => { i18n.changeLanguage(l); localStorage.setItem('language', l); }}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${i18n.language?.startsWith(l) ? 'bg-primary text-white' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-black dark:text-white">{filtered.length}</div>
            <div className="text-xs text-gray-400">{t('hardware.ofItems', { count: all.length })}</div>
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 max-w-md items-center gap-2 rounded-full border border-stroke bg-white px-4 py-2.5 dark:border-strokedark dark:bg-boxdark">
          <svg className="h-4 w-4 flex-none text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hardware.searchPh') as string} className={inputCls} />
          {q && <button onClick={() => setQ('')} className="text-gray-400 hover:text-danger"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>}
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : error ? (
        <div className="rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark"><p className="text-sm text-danger">{error}</p></div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {['all', ...(data?.categories.map((c) => c.id) || [])].map((c) => {
              const count = c === 'all' ? all.length : all.filter((p) => p.catId === c).length;
              return (
                <button key={c} onClick={() => setCat(c)} className={chipBtn(cat === c)}>
                  <span>{catLabel(c)}</span>
                  <span className={`rounded-full px-1.5 text-[11px] font-semibold ${cat === c ? 'bg-primary text-white' : 'bg-gray-2 text-gray-500 dark:bg-meta-4 dark:text-gray-400'}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-4 border-t border-stroke pt-3 dark:border-strokedark">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400">{t('hardware.compatLabel')}</span>
              <div className="inline-flex rounded-full border border-stroke p-1 dark:border-strokedark">
                {(['all', 'V2', 'V1'] as const).map((c) => (
                  <button key={c} onClick={() => setCompat(c)} className={segBtn(compat === c)}>{c === 'all' ? t('common.all') : c === 'V2' ? t('hardware.kaizen') : 'V1'}</button>
                ))}
              </div>
            </div>
            <div className="h-5 w-px bg-stroke dark:bg-strokedark" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-400">{t('hardware.statusLabel')}</span>
              {STATUS_ORDER.map((k) => (
                <button key={k} onClick={() => setStatus(k)} className={chipBtn(status === k)}>
                  {k !== 'all' && <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_DOT[k] }} />}
                  {statusLabel(k)}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <svg className="h-10 w-10 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
              <div className="text-base font-semibold text-black dark:text-white">{t('hardware.noResultsTitle')}</div>
              <div className="text-sm text-gray-400">{t('hardware.noResultsSub')}</div>
              <button onClick={() => { setCat('all'); setCompat('all'); setStatus('all'); setQ(''); }} className="mt-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90">{t('hardware.resetFilters')}</button>
            </div>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {filtered.map((p) => {
                const inCmp = compare.includes(p.id);
                const src = imgSrc(p);
                const done = copied === p.sku;
                return (
                  <div key={p.id} onClick={() => setDetailId(p.id)}
                    className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-stroke bg-white transition hover:border-primary/40 hover:-translate-y-0.5 dark:border-strokedark dark:bg-boxdark">
                    <div className="relative h-36 flex-none bg-gray-2 dark:bg-meta-4">
                      {src ? <img src={src} alt={pick(p.nameEn, p.nameFr)} className="h-full w-full object-contain p-3" /> : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-gray-400">
                          <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8 12 3 3 8v8l9 5 9-5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 5 9-5M12 13v8" /></svg>
                          <span className="text-[11px]">{t('hardware.noPhoto')}</span>
                        </div>
                      )}
                      <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
                        {p.status.map((k) => (
                          <span key={k} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE_CLS[k] || ''} border-transparent`}>{t(`hardware.status.${k}`)}</span>
                        ))}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); toggleCompare(p.id); }} title={t('hardware.compare') as string}
                        className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg border ${inCmp ? 'border-primary bg-primary text-white' : 'border-stroke bg-white/80 text-body dark:border-strokedark dark:bg-boxdark/80'}`}>
                        {inCmp ? '✓' : '+'}
                      </button>
                    </div>
                    <div className="flex flex-1 flex-col gap-2.5 p-3.5">
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{catLabel(p.catId)}</div>
                        <div className="text-[15px] font-bold leading-tight text-black dark:text-white">{pick(p.nameEn, p.nameFr)}</div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.compat.includes('V2') && <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">{t('hardware.kaizen')}</span>}
                        {p.compat.includes('V1') && <span className="rounded-full border border-stroke bg-gray-2 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500 dark:border-strokedark dark:bg-meta-4 dark:text-gray-300">V1</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(fr && p.specsFr.length ? p.specsFr : p.specsEn).slice(0, 3).map((s, i) => (
                          <span key={i} className="rounded-md border border-stroke bg-gray-2 px-2 py-1 text-[11.5px] text-gray-500 dark:border-strokedark dark:bg-meta-4 dark:text-gray-300">{s}</span>
                        ))}
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2 border-t border-stroke pt-2.5 dark:border-strokedark">
                        <button onClick={(e) => { e.stopPropagation(); copySku(p.sku); }} title={t('hardware.copySku') as string}
                          className="flex min-w-0 items-center gap-1.5 text-gray-500 hover:text-primary">
                          <span className="max-w-[130px] truncate font-mono text-[11.5px]">{p.sku || '—'}</span>
                          {p.sku && <span className={`flex-none ${done ? 'text-success' : ''}`}>{done ? '✓' : '⧉'}</span>}
                        </button>
                        <span className="whitespace-nowrap text-sm font-bold text-black dark:text-white">{p.price}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Compare tray */}
      {compareItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-stroke bg-white/95 px-6 py-3.5 backdrop-blur dark:border-strokedark dark:bg-boxdark/95 md:left-[290px]">
          <div className="flex items-center gap-3.5">
            <span className="text-sm font-medium text-gray-500">{t('hardware.compare')}</span>
            <div className="flex flex-1 gap-2 overflow-x-auto">
              {compareItems.map((ci) => (
                <div key={ci.id} className="flex flex-none items-center gap-2 rounded-full border border-stroke bg-gray-2 py-1 pl-3 pr-1.5 dark:border-strokedark dark:bg-meta-4">
                  <span className="max-w-[160px] truncate text-[12.5px] font-medium text-black dark:text-white">{pick(ci.nameEn, ci.nameFr)}</span>
                  <button onClick={() => toggleCompare(ci.id)} className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-stroke text-[10px] text-gray-500 dark:bg-strokedark">✕</button>
                </div>
              ))}
            </div>
            <button onClick={() => setCompare([])} className="flex-none rounded-full border border-stroke px-3.5 py-2 text-[13px] text-gray-500 hover:border-danger hover:text-danger dark:border-strokedark">{t('hardware.clearCompare')}</button>
            <button onClick={() => setCompareOpen(true)} className="flex-none rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-opacity-90">{t('hardware.compareN', { count: compareItems.length })}</button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-[99999] bg-black/50" onClick={() => setDetailId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
            <div className="flex flex-none items-center justify-between border-b border-stroke px-5 py-4 dark:border-strokedark">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{catLabel(detail.catId)}</span>
              <button onClick={() => setDetailId(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 hover:text-danger dark:border-strokedark"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 p-5">
              <div className="mb-4 flex h-56 items-center justify-center overflow-hidden rounded-2xl bg-gray-2 dark:bg-meta-4">
                {imgSrc(detail) ? <img src={imgSrc(detail)!} alt={pick(detail.nameEn, detail.nameFr)} className="h-full w-full object-contain p-5" /> : <span className="text-sm text-gray-400">{t('hardware.noPhoto')}</span>}
              </div>
              <h3 className="mb-2 text-xl font-bold text-black dark:text-white">{pick(detail.nameEn, detail.nameFr)}</h3>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {detail.compat.includes('V2') && <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">{t('hardware.kaizen')}</span>}
                {detail.compat.includes('V1') && <span className="rounded-full border border-stroke bg-gray-2 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500 dark:border-strokedark dark:bg-meta-4">V1</span>}
              </div>
              {pick(detail.noteEn, detail.noteFr) && (
                <div className="mb-4 flex gap-2.5 rounded-xl border border-stroke bg-gray-2 p-3.5 dark:border-strokedark dark:bg-meta-4">
                  <span className="mt-0.5 flex-none text-primary">ⓘ</span>
                  <span className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">{pick(detail.noteEn, detail.noteFr)}</span>
                </div>
              )}
              <div className="mb-4 grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-stroke bg-gray-2 p-3 dark:border-strokedark dark:bg-meta-4">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">{t('hardware.priceLabel')}</div>
                  <div className="text-[15px] font-bold text-black dark:text-white">{detail.price}</div>
                </div>
                <div className="rounded-xl border border-stroke bg-gray-2 p-3 dark:border-strokedark dark:bg-meta-4">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">{t('hardware.warrantyLabel')}</div>
                  <div className="text-[15px] font-bold text-black dark:text-white">{pick(detail.warrantyEn, detail.warrantyFr) || '—'}</div>
                </div>
              </div>
              <div className="mb-4">
                <div className="mb-2 text-[11px] uppercase tracking-wide text-gray-400">{t('hardware.recUse')}</div>
                <div className="text-[14px] text-gray-600 dark:text-gray-300">{pick(detail.useEn, detail.useFr) || '—'}</div>
              </div>
              <div className="mb-4">
                <div className="mb-2 text-[11px] uppercase tracking-wide text-gray-400">{t('hardware.specsLabel')}</div>
                <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-stroke dark:border-strokedark">
                  {(fr && detail.specsFr.length ? detail.specsFr : detail.specsEn).map((s, i) => (
                    <div key={i} className="flex items-center gap-2.5 bg-gray-2 px-3.5 py-2.5 dark:bg-meta-4">
                      <span className="h-1.5 w-1.5 flex-none rounded-full bg-primary" />
                      <span className="text-[13.5px] text-gray-600 dark:text-gray-300">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wide text-gray-400">{t('hardware.skuLabel')}</div>
                <button onClick={() => copySku(detail.sku)} className="flex w-full items-center justify-between gap-2.5 rounded-xl border border-stroke bg-gray-2 px-3.5 py-3 text-black dark:border-strokedark dark:bg-meta-4 dark:text-white">
                  <span className="font-mono text-[13px]">{detail.sku || '—'}</span>
                  <span className={`flex items-center gap-1.5 text-xs ${copied === detail.sku ? 'text-success' : 'text-gray-400'}`}>{copied === detail.sku ? `✓ ${t('hardware.copied')}` : t('hardware.copySku')}</span>
                </button>
              </div>
            </div>
            <div className="flex-none border-t border-stroke p-4 dark:border-strokedark">
              <button onClick={() => toggleCompare(detail.id)}
                className={`w-full rounded-xl px-4 py-3 text-sm font-semibold ${compare.includes(detail.id) ? 'border border-stroke bg-gray-2 text-black dark:border-strokedark dark:bg-meta-4 dark:text-white' : 'bg-primary text-white'}`}>
                {compare.includes(detail.id) ? t('hardware.removeCompare') : t('hardware.addCompare')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compare modal */}
      {compareOpen && compareItems.length > 0 && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/55 p-6" onClick={() => setCompareOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
            <div className="flex flex-none items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
              <div>
                <h3 className="text-lg font-bold text-black dark:text-white">{t('hardware.compareTitle')}</h3>
                <div className="text-xs text-gray-400">{t('hardware.compareSub', { count: compareItems.length })}</div>
              </div>
              <button onClick={() => setCompareOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 hover:text-danger dark:border-strokedark"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-[150px] border-b border-r border-stroke bg-white dark:border-strokedark dark:bg-boxdark" />
                    {compareItems.map((ci) => (
                      <th key={ci.id} className="min-w-[190px] border-b border-stroke p-3.5 text-center dark:border-strokedark">
                        <div className="mx-auto mb-2.5 flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg bg-gray-2 dark:bg-meta-4">
                          {imgSrc(ci) ? <img src={imgSrc(ci)!} alt={pick(ci.nameEn, ci.nameFr)} className="h-full w-full object-contain p-2" /> : <span className="text-[11px] text-gray-400">{t('hardware.noPhoto')}</span>}
                        </div>
                        <div className="text-[13.5px] font-bold text-black dark:text-white">{pick(ci.nameEn, ci.nameFr)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: t('hardware.rowCategory'), get: (p: HardwareProduct) => catLabel(p.catId) },
                    { label: t('hardware.rowCompat'), get: (p: HardwareProduct) => p.compat.map((x) => (x === 'V2' ? t('hardware.kaizen') : 'V1')).join(' · ') },
                    { label: t('hardware.rowStatus'), get: (p: HardwareProduct) => (p.status.length ? p.status.map((k) => t(`hardware.status.${k}`)).join(', ') : t('hardware.current')) },
                    { label: t('hardware.rowPrice'), get: (p: HardwareProduct) => p.price || '—' },
                    { label: t('hardware.rowSpecs'), get: (p: HardwareProduct) => (fr && p.specsFr.length ? p.specsFr : p.specsEn).join(' · ') },
                    { label: t('hardware.rowSku'), get: (p: HardwareProduct) => p.sku || '—' },
                    { label: t('hardware.rowUse'), get: (p: HardwareProduct) => pick(p.useEn, p.useFr) || '—' },
                    { label: t('hardware.rowWarranty'), get: (p: HardwareProduct) => pick(p.warrantyEn, p.warrantyFr) || '—' },
                  ].map((row, i) => (
                    <tr key={i}>
                      <td className="sticky left-0 z-10 border-b border-r border-stroke bg-white p-3.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:border-strokedark dark:bg-boxdark">{row.label}</td>
                      {compareItems.map((ci) => (
                        <td key={ci.id} className="border-b border-stroke p-3.5 text-[13px] leading-relaxed text-gray-600 dark:border-strokedark dark:text-gray-300">{row.get(ci)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Hardware;
