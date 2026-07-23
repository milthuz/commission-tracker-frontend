import React, { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const b64ToBytes = (b64: string) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};

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

interface PricingCategory {
  id: string; nameEn: string; nameFr: string; sortOrder: number; hourly: number | null;
  noteEn: string | null; noteFr: string | null;
  considerationsEn: string[]; considerationsFr: string[];
}
interface PricingPackage {
  id: string; catId: string; nameEn: string; nameFr: string | null;
  sku: string | null; skuYear: string | null; compat: string[]; pos: string | null;
  priceMonthly: number | null; priceYearly: number | null; priceFlat: number | null;
  unit: string | null; activation: number | null;
  includesEn: string[]; includesFr: string[];
  internalEn: { effort?: string; requirements?: string; margin?: string; notes?: string } | null;
  internalFr: { effort?: string; requirements?: string; margin?: string; notes?: string } | null;
  status: string[]; groupName: string | null; tier: string | null; mode: string | null;
  rates: Record<string, number> | null; visible: boolean;
}
interface PricingGuideRef { id: string; titleEn: string; titleFr: string | null; bodyEn: string; bodyFr: string | null; }
interface PricingData { categories: PricingCategory[]; packages: PricingPackage[]; guides: PricingGuideRef[]; }

const CATS_WITH_BILLING = new Set(['saas']);
const STATUS_ORDER = ['all', 'new', 'soon', 'eol', 'wsl', 'legacy'] as const;
const STATUS_DOT: Record<string, string> = { new: '#17B26A', soon: '#FDB022', eol: '#F46060', wsl: '#E0A94A', legacy: '#94969C', rental: '#608EFA' };
const STATUS_BADGE_CLS: Record<string, string> = {
  new:    'bg-success/15 text-green-700 dark:bg-success/20 dark:text-success',
  soon:   'bg-warning/15 text-warning dark:bg-warning/20',
  eol:    'bg-danger/15 text-danger dark:bg-danger/20',
  wsl:    'bg-[#E0A94A]/15 text-[#8A5A00] dark:text-[#E0A94A]',
  legacy: 'bg-gray-2 text-gray-500 dark:bg-meta-4 dark:text-gray-300',
  rental: 'bg-primary/15 text-primary',
};

// Extracts a numeric unit price from hardware's free-text price string (e.g. "$1,150" -> 1150).
// Returns null for non-numeric values ("TBD", "Monthly rental", "—") — those can't be added to a
// quote with a firm price (mirrors the same parser server-side in POST /api/pricing/quote/pdf).
const parseHwPrice = (price: string | null): number | null => {
  if (!price) return null;
  const m = price.replace(/[, ]/g, '').match(/\$([0-9]+(?:\.[0-9]+)?)/);
  return m ? parseFloat(m[1]) : null;
};

// Category icons for BOTH catalogs merged into one switch — hardware and pricing category ids
// never collide (hardware: pos/tab/kp/rp/pay/disp/net/periph/cash; pricing: saas/rental/menu/
// install/support/olo/shipping/xperio), so one shared icon set is safe.
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

const PricingGuide: React.FC = () => {
  const { t, i18n } = useTranslation();
  const fr = i18n.language?.startsWith('fr');
  const pick = (en: string | null | undefined, frText: string | null | undefined) => (fr && frText ? frText : en) || '';

  const [hwData, setHwData] = useState<HardwareData | null>(null);
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [cat, setCat] = useState('');
  const [compat, setCompat] = useState<'all' | 'V1' | 'V2'>('all');
  const [status, setStatus] = useState('all'); // hardware-only filter
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [q, setQ] = useState('');
  const [internal, setInternal] = useState(false);
  const [quote, setQuote] = useState<Record<string, number>>({});
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [building, setBuilding] = useState(false);
  const [quotePdf, setQuotePdf] = useState<{ url: string; fileName: string } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setError('');
      const [hwRes, pkgRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/hardware`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/pricing`, { headers: authHeaders() }),
      ]);
      if (hwRes.status === 'fulfilled') setHwData(hwRes.value.data);
      if (pkgRes.status === 'fulfilled') setPricingData(pkgRes.value.data);
      // Only surface a hard error if BOTH catalogs failed — a 403 on just one (missing that
      // one permission) simply means that section doesn't render, not a broken page.
      if (hwRes.status === 'rejected' && pkgRes.status === 'rejected') {
        setError(t('pricingGuide.loadError') as string);
      }
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const money = (n: number | null | undefined): string | null => {
    if (n == null) return null;
    const s = (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '');
    return '$' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const priceOf = (p: PricingPackage): { main: string; unit: string; sub: string | null } => {
    if (billing === 'yearly' && p.priceYearly != null) return { main: money(p.priceYearly)!, unit: t('pricingGuide.perYear') as string, sub: null };
    if (p.priceMonthly != null) {
      let sub: string | null = null;
      if (p.activation) sub = `+ ${money(p.activation)} ${t('pricingGuide.activation')}`;
      return { main: money(p.priceMonthly)!, unit: p.unit && p.unit !== 'month' ? `/${p.unit}` : t('pricingGuide.perMonth') as string, sub };
    }
    if (p.priceFlat != null) {
      if (p.priceFlat === 0) return { main: t('pricingGuide.free') as string, unit: '', sub: null };
      return { main: money(p.priceFlat)!, unit: p.unit ? `/${p.unit}` : '', sub: null };
    }
    return { main: `${t('pricingGuide.from')} —`, unit: '', sub: t('pricingGuide.noSkuLine') as string };
  };
  const quotePrice = (p: PricingPackage): { amt: number; recurring: boolean } => {
    if (billing === 'yearly' && p.priceYearly != null) return { amt: p.priceYearly, recurring: true };
    if (p.priceMonthly != null) return { amt: p.priceMonthly, recurring: true };
    if (p.priceFlat != null) return { amt: p.priceFlat, recurring: false };
    return { amt: 0, recurring: false };
  };

  // Hidden rows are for the Admin editors only — the rep-facing guide never shows them, even to
  // a manage-permission admin browsing this page (server-side already excludes hidden rows for
  // everyone without the manage permission; this is the client-side backstop).
  const hwAll = (hwData?.products || []).filter((p) => p.visible);
  const allPackages = (pricingData?.packages || []).filter((p) => p.visible);

  const hwCats = (hwData?.categories || []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.id);
  const pkgCats = (pricingData?.categories || []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.id);
  const activeGroup: 'hardware' | 'pricing' | null = hwCats.includes(cat) ? 'hardware' : pkgCats.includes(cat) ? 'pricing' : null;
  const activeCatData = pricingData?.categories.find((c) => c.id === cat) || null;

  // Default to the first available category once a catalog loads — Hardware leads (per the
  // "Hardware & Service Guide" name), falling back to Pricing if the rep can't see Hardware.
  useEffect(() => {
    if (cat) return;
    if (hwCats.length) setCat(hwCats[0]);
    else if (pkgCats.length) setCat(pkgCats[0]);
  }, [cat, hwCats.length, pkgCats.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const catLabel = (id: string) => {
    if (hwCats.includes(id)) return t(`hardware.categories.${id}`);
    const c = pricingData?.categories.find((x) => x.id === id);
    return c ? pick(c.nameEn, c.nameFr) : id;
  };

  const imgSrc = (p: HardwareProduct) => (p.hasImage ? `${API_URL}/api/hardware/${p.id}/image` : null);

  const hwList = useMemo(() => {
    const query = q.trim().toLowerCase();
    return hwAll.filter((p) => {
      if (p.catId !== cat) return false;
      if (compat !== 'all' && !p.compat.includes(compat)) return false;
      if (status !== 'all' && !p.status.includes(status)) return false;
      if (query) {
        const hay = `${pick(p.nameEn, p.nameFr)} ${p.sku || ''} ${(fr && p.specsFr.length ? p.specsFr : p.specsEn).join(' ')}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hwAll, cat, compat, status, q, fr]);

  const pkgList = useMemo(() => {
    const query = q.trim().toLowerCase();
    return allPackages.filter((p) => {
      if (p.catId !== cat) return false;
      if (compat !== 'all' && !p.compat.includes(compat)) return false;
      if (query) {
        const hay = `${pick(p.nameEn, p.nameFr)} ${p.sku || ''} ${(fr && p.includesFr.length ? p.includesFr : p.includesEn).join(' ')}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPackages, cat, compat, q, fr]);

  const copySku = (sku: string | null) => {
    if (!sku) return;
    try { navigator.clipboard.writeText(sku); } catch { /* ignore */ }
    setCopied(sku);
    setTimeout(() => setCopied((c) => (c === sku ? null : c)), 1500);
  };

  // Quote items are keyed "hw:<id>" / "pkg:<id>" — the two catalogs' raw ids aren't guaranteed
  // never to collide, and the prefix also tells buildQuote() + quoteRows which table to resolve
  // against without a second lookup.
  const hwKey = (id: string) => `hw:${id}`;
  const pkgKey = (id: string) => `pkg:${id}`;
  const toggleQuote = (key: string) => {
    setQuote((q0) => {
      const next = { ...q0 };
      if (next[key]) delete next[key]; else next[key] = 1;
      return next;
    });
  };
  const setQty = (key: string, qty: number) => setQuote((q0) => ({ ...q0, [key]: Math.max(1, qty) }));

  const buildQuote = async () => {
    if (!clientName.trim()) { dialog.alert(t('pricingGuide.clientNameRequired') as string); return; }
    setBuilding(true);
    try {
      const r = await axios.post(`${API_URL}/api/pricing/quote/pdf`, {
        items: quoteIds.map((key) => ({
          id: key.slice(key.indexOf(':') + 1), qty: quote[key],
          type: key.startsWith('hw:') ? 'hardware' : 'package',
        })),
        clientName: clientName.trim(), billing, lang: fr ? 'fr' : 'en',
      }, { headers: authHeaders() });
      const blob = new Blob([b64ToBytes(r.data.pdfBase64) as BlobPart], { type: 'application/pdf' });
      setQuotePdf({ url: URL.createObjectURL(blob), fileName: r.data.fileName });
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || t('pricingGuide.quoteError') as string);
    } finally { setBuilding(false); }
  };
  // Revoke the previous blob URL whenever it's replaced or the page unmounts.
  useEffect(() => { const url = quotePdf?.url; return () => { if (url) URL.revokeObjectURL(url); }; }, [quotePdf]);

  const quoteIds = Object.keys(quote);
  let rec = 0, oneTime = 0;
  const quoteRows = quoteIds.map((key) => {
    const rawId = key.slice(key.indexOf(':') + 1);
    const qty = quote[key];
    if (key.startsWith('hw:')) {
      const p = hwAll.find((x) => x.id === rawId);
      const unitAmt = p ? parseHwPrice(p.price) : null;
      if (!p || unitAmt == null) return null;
      const line = unitAmt * qty;
      oneTime += line;
      return { id: key, name: pick(p.nameEn, p.nameFr), sku: p.sku || (t('pricingGuide.noSku') as string), qty, lineTotal: money(line) || '—' };
    }
    const p = allPackages.find((x) => x.id === rawId);
    if (!p) return null;
    const qp = quotePrice(p);
    const line = qp.amt * qty;
    if (qp.recurring) rec += line; else oneTime += line;
    return { id: key, name: pick(p.nameEn, p.nameFr), sku: p.sku || (t('pricingGuide.noSku') as string), qty, lineTotal: money(line) || '—' };
  }).filter(Boolean) as { id: string; name: string; sku: string; qty: number; lineTotal: string }[];

  const segBtn = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${active ? 'bg-primary text-white' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`;
  const chipBtn = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
      active ? 'border-primary bg-primary/10 text-primary dark:text-white' : 'border-stroke text-body hover:border-primary/40 dark:border-strokedark'
    }`;
  const inputCls = 'flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-black dark:text-white placeholder:text-body';

  const selectCat = (c: string) => { setCat(c); setQ(''); setStatus('all'); };

  return (
    <>
      <div className="mb-1">
        <h1 className="text-title-md2 font-semibold text-black dark:text-white">{t('pricingGuide.title')}</h1>
        <p className="text-sm text-body">{t('pricingGuide.subtitle')}</p>
      </div>

      <div className="mb-5 mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-stroke pt-4 dark:border-strokedark">
        <div>
          <div className="mb-2 flex items-center gap-2">
            {activeGroup === 'pricing' && i18n.exists(`pricingGuide.categories.${cat}.eyebrow`) && (
              <span className="text-xs font-bold uppercase tracking-wide text-primary">{t(`pricingGuide.categories.${cat}.eyebrow`)}</span>
            )}
            <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning">{t('pricingGuide.internalOnly')}</span>
          </div>
          <h2 className="text-2xl font-bold text-black dark:text-white">{catLabel(cat)}</h2>
          {activeGroup === 'pricing' && i18n.exists(`pricingGuide.categories.${cat}.desc`) && (
            <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">{t(`pricingGuide.categories.${cat}.desc`)}</p>
          )}
        </div>
        {activeGroup === 'pricing' && (
          <div className="flex items-center gap-3">
            <button onClick={() => setInternal((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold ${internal ? 'border border-primary/40 bg-primary/10 text-primary' : 'border border-stroke text-body dark:border-strokedark'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${internal ? 'bg-primary' : 'bg-gray-400'}`} />
              {internal ? t('pricingGuide.hideInternal') : t('pricingGuide.showInternal')}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : error ? (
        <div className="rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark"><p className="text-sm text-danger">{error}</p></div>
      ) : (
        <div className="flex gap-6">
          <div className="w-[190px] flex-none">
            {hwCats.length > 0 && (
              <>
                <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('hardware.title')}</div>
                <div className="mb-4 flex flex-col gap-0.5">
                  {hwCats.map((c) => {
                    const count = hwAll.filter((p) => p.catId === c).length;
                    const on = cat === c;
                    return (
                      <button key={c} onClick={() => selectCat(c)}
                        className={`flex items-center gap-2 rounded-lg border-l-[3px] px-3 py-2.5 text-left text-[13.5px] font-medium transition ${
                          on ? 'border-l-primary bg-gray-2 text-black dark:bg-meta-4 dark:text-white' : 'border-l-transparent text-body hover:bg-gray-1 dark:hover:bg-meta-4/40'
                        }`}>
                        <CatIcon id={c} />
                        <span className="flex-1">{catLabel(c)}</span>
                        <span className="text-[11px] font-semibold text-gray-400">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {pkgCats.length > 0 && (
              <>
                <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('pricingGuide.sections')}</div>
                <div className="flex flex-col gap-0.5">
                  {pkgCats.map((c) => {
                    const count = allPackages.filter((p) => p.catId === c).length;
                    const on = cat === c;
                    return (
                      <button key={c} onClick={() => selectCat(c)}
                        className={`flex items-center gap-2 rounded-lg border-l-[3px] px-3 py-2.5 text-left text-[13.5px] font-medium transition ${
                          on ? 'border-l-primary bg-gray-2 text-black dark:bg-meta-4 dark:text-white' : 'border-l-transparent text-body hover:bg-gray-1 dark:hover:bg-meta-4/40'
                        }`}>
                        <CatIcon id={c} />
                        <span className="flex-1">{catLabel(c)}</span>
                        <span className="text-[11px] font-semibold text-gray-400">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="min-w-0 flex-1 pb-24">
            <div className="mb-4 flex flex-wrap items-center gap-3.5 border-t border-stroke pt-3.5 dark:border-strokedark">
              <div className="flex flex-1 max-w-xs items-center gap-2 rounded-full border border-stroke bg-white px-3.5 py-2 dark:border-strokedark dark:bg-boxdark">
                <svg className="h-4 w-4 flex-none text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(activeGroup === 'hardware' ? 'hardware.searchPh' : 'pricingGuide.searchPh') as string} className={inputCls} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400">{t('pricingGuide.compatLabel')}</span>
                <div className="inline-flex rounded-full border border-stroke p-1 dark:border-strokedark">
                  {(['all', 'V2', 'V1'] as const).map((c) => (
                    <button key={c} onClick={() => setCompat(c)} className={segBtn(compat === c)}>{c === 'all' ? t('common.all') : c === 'V2' ? t('hardware.kaizen') : 'V1'}</button>
                  ))}
                </div>
              </div>
              {activeGroup === 'hardware' && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-gray-400">{t('hardware.statusLabel')}</span>
                  {STATUS_ORDER.map((k) => (
                    <button key={k} onClick={() => setStatus(k)} className={chipBtn(status === k)}>
                      {k !== 'all' && <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_DOT[k] }} />}
                      {k === 'all' ? t('common.all') : t(`hardware.status.${k}`)}
                    </button>
                  ))}
                </div>
              )}
              {activeGroup === 'pricing' && CATS_WITH_BILLING.has(cat) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-400">{t('pricingGuide.billing')}</span>
                  <div className="inline-flex rounded-full border border-stroke p-1 dark:border-strokedark">
                    {(['monthly', 'yearly'] as const).map((b) => (
                      <button key={b} onClick={() => setBilling(b)} className={segBtn(billing === b)}>{b === 'monthly' ? t('pricingGuide.monthly') : t('pricingGuide.yearly')}</button>
                    ))}
                  </div>
                  {billing === 'yearly' && <span className="rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-green-700 dark:text-success">{t('pricingGuide.save5')}</span>}
                </div>
              )}
            </div>

            {activeGroup === 'pricing' && activeCatData && pick(activeCatData.noteEn, activeCatData.noteFr) && (
              <div className="mb-4 flex gap-2.5 rounded-xl border border-stroke bg-gray-2 p-3.5 dark:border-strokedark dark:bg-meta-4">
                <span className="mt-0.5 flex-none text-primary">ⓘ</span>
                <span className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">{pick(activeCatData.noteEn, activeCatData.noteFr)}</span>
              </div>
            )}

            {activeGroup === 'hardware' ? (
              hwList.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <svg className="h-9 w-9 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
                  <div className="text-base font-semibold text-black dark:text-white">{t('pricingGuide.noResultsTitle')}</div>
                  <button onClick={() => { setCompat('all'); setStatus('all'); setQ(''); }} className="mt-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90">{t('pricingGuide.reset')}</button>
                </div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                  {hwList.map((p) => {
                    const key = hwKey(p.id);
                    const inQuote = !!quote[key];
                    const done = copied === p.sku;
                    const unitPrice = parseHwPrice(p.price);
                    const src = imgSrc(p);
                    return (
                      <div key={p.id} className={`flex flex-col gap-2.5 rounded-2xl border bg-white p-4 dark:bg-boxdark ${inQuote ? 'border-primary' : 'border-stroke dark:border-strokedark'}`}>
                        <div className="flex items-start gap-3">
                          <div className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-lg bg-gray-2 dark:bg-meta-4">
                            {src ? <img src={src} alt={pick(p.nameEn, p.nameFr)} className="h-full w-full object-contain p-1" /> : <span className="text-[8px] text-gray-400">{t('hardware.noPhoto')}</span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap gap-1.5">
                              {p.compat.includes('V2') && <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{t('hardware.kaizen')}</span>}
                              {p.compat.includes('V1') && <span className="rounded-full border border-stroke bg-gray-2 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:border-strokedark dark:bg-meta-4">V1</span>}
                              {p.status.map((k) => <span key={k} className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_BADGE_CLS[k] || 'bg-gray-2 text-gray-500 dark:bg-meta-4'}`}>{t(`hardware.status.${k}`)}</span>)}
                            </div>
                            <div className="text-[15.5px] font-bold leading-tight text-black dark:text-white">{pick(p.nameEn, p.nameFr)}</div>
                          </div>
                          <button onClick={() => unitPrice != null && toggleQuote(key)} disabled={unitPrice == null}
                            title={(unitPrice == null ? t('hardware.noFirmPrice') : t('pricingGuide.addQuote')) as string}
                            className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg border ${
                              unitPrice == null ? 'cursor-not-allowed border-stroke text-gray-300 dark:border-strokedark dark:text-gray-600' :
                              inQuote ? 'border-primary bg-primary text-white' : 'border-stroke text-body dark:border-strokedark'
                            }`}>
                            {inQuote ? '✓' : '+'}
                          </button>
                        </div>
                        <div className="text-2xl font-black tracking-tight text-black dark:text-white">{p.price || '—'}</div>
                        <div className="flex flex-col gap-1.5">
                          {(fr && p.specsFr.length ? p.specsFr : p.specsEn).map((s, i) => (
                            <div key={i} className="flex gap-2 text-[13px] text-gray-600 dark:text-gray-300">
                              <span className="mt-0.5 flex-none text-primary">✓</span><span>{s}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-auto flex items-center justify-between border-t border-stroke pt-2.5 dark:border-strokedark">
                          {p.sku ? (
                            <button onClick={() => copySku(p.sku)} className="flex min-w-0 items-center gap-1.5 text-gray-500 hover:text-primary">
                              <span className="max-w-[160px] truncate font-mono text-[11.5px]">{p.sku}</span>
                              <span className={`flex-none ${done ? 'text-green-700 dark:text-success' : ''}`}>{done ? '✓' : '⧉'}</span>
                            </button>
                          ) : <span className="text-[11.5px] italic text-gray-400">{t('pricingGuide.noSku')}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : activeGroup === 'pricing' ? (
              pkgList.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <svg className="h-9 w-9 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
                  <div className="text-base font-semibold text-black dark:text-white">{t('pricingGuide.noResultsTitle')}</div>
                  <button onClick={() => { setCompat('all'); setQ(''); }} className="mt-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90">{t('pricingGuide.reset')}</button>
                </div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                  {pkgList.map((p) => {
                    const key = pkgKey(p.id);
                    const pr = priceOf(p);
                    const inQuote = !!quote[key];
                    const done = copied === p.sku;
                    const irs: { k: string; v: string }[] = [];
                    const inn = (fr && p.internalFr) ? p.internalFr : p.internalEn;
                    if (inn?.effort) irs.push({ k: fr ? 'Effort :' : 'Effort:', v: inn.effort });
                    if (inn?.requirements) irs.push({ k: fr ? 'Exigences :' : 'Requirements:', v: inn.requirements });
                    if (inn?.margin) irs.push({ k: fr ? 'Marge :' : 'Margin:', v: inn.margin });
                    if (inn?.notes) irs.push({ k: fr ? 'Note :' : 'Note:', v: inn.notes });
                    return (
                      <div key={p.id} className={`flex flex-col gap-2.5 rounded-2xl border bg-white p-4 dark:bg-boxdark ${inQuote ? 'border-primary' : 'border-stroke dark:border-strokedark'}`}>
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0">
                            <div className="mb-1.5 flex flex-wrap gap-1.5">
                              {p.compat.includes('V2') && <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{t('pricingGuide.kaizenTag')}</span>}
                              {p.compat.includes('V1') && <span className="rounded-full border border-stroke bg-gray-2 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:border-strokedark dark:bg-meta-4">V1</span>}
                              {p.status.includes('new') && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700 dark:text-success">{t('pricingGuide.newTag')}</span>}
                              {p.status.includes('legacy') && <span className="rounded-full bg-gray-2 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:bg-meta-4">{t('pricingGuide.existingTag')}</span>}
                              {p.pos && <span className="rounded-full bg-gray-2 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:bg-meta-4">{p.pos}</span>}
                              {p.mode && <span className="rounded-full bg-gray-2 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:bg-meta-4">{p.mode}</span>}
                            </div>
                            <div className="text-[15.5px] font-bold leading-tight text-black dark:text-white">{pick(p.nameEn, p.nameFr)}</div>
                          </div>
                          <button onClick={() => toggleQuote(key)} title={t('pricingGuide.addQuote') as string}
                            className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg border ${inQuote ? 'border-primary bg-primary text-white' : 'border-stroke text-body dark:border-strokedark'}`}>
                            {inQuote ? '✓' : '+'}
                          </button>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl font-black tracking-tight text-black dark:text-white">{pr.main}</span>
                          <span className="text-[13px] text-gray-400">{pr.unit}</span>
                        </div>
                        {pr.sub && <div className="-mt-1.5 text-xs text-gray-400">{pr.sub}</div>}
                        <div className="flex flex-col gap-1.5">
                          {(fr && p.includesFr.length ? p.includesFr : p.includesEn).map((inc, i) => (
                            <div key={i} className="flex gap-2 text-[13px] text-gray-600 dark:text-gray-300">
                              <span className="mt-0.5 flex-none text-primary">✓</span><span>{inc}</span>
                            </div>
                          ))}
                        </div>
                        {internal && irs.length > 0 && (
                          <div className="flex flex-col gap-1.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
                            <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-primary">🔒 {t('pricingGuide.internal')}</div>
                            {irs.map((ir, i) => (
                              <div key={i} className="text-xs leading-relaxed text-gray-600 dark:text-gray-300"><span className="font-semibold text-primary">{ir.k}</span> {ir.v}</div>
                            ))}
                          </div>
                        )}
                        <div className="mt-auto flex items-center justify-between border-t border-stroke pt-2.5 dark:border-strokedark">
                          {p.sku ? (
                            <button onClick={() => copySku(p.sku)} className="flex min-w-0 items-center gap-1.5 text-gray-500 hover:text-primary">
                              <span className="max-w-[160px] truncate font-mono text-[11.5px]">{p.sku}</span>
                              <span className={`flex-none ${done ? 'text-green-700 dark:text-success' : ''}`}>{done ? '✓' : '⧉'}</span>
                            </button>
                          ) : <span className="text-[11.5px] italic text-gray-400">{t('pricingGuide.noSku')}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : null}

            {activeGroup === 'pricing' && cat === 'saas' && pricingData && pricingData.guides.length > 0 && (
              <div className="mt-8">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('pricingGuide.reference')}</div>
                <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                  {pricingData.guides.map((g) => (
                    <div key={g.id} className="rounded-2xl border border-stroke bg-white p-4 dark:border-strokedark dark:bg-boxdark">
                      <div className="mb-1.5 text-sm font-bold text-black dark:text-white">{pick(g.titleEn, g.titleFr)}</div>
                      <div className="text-[12.5px] leading-relaxed text-gray-500 dark:text-gray-400">{pick(g.bodyEn, g.bodyFr)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quote tray */}
      {quoteIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-stroke bg-white/95 backdrop-blur dark:border-strokedark dark:bg-boxdark/95 md:left-[290px]">
          <div className="flex flex-wrap items-center gap-3.5 px-6 py-3.5">
            <span className="text-primary">📄</span>
            <span className="text-[13px] font-bold text-black dark:text-white">{t('pricingGuide.quoteBuilder')}</span>
            <span className="text-xs text-gray-400">{quoteIds.length} {t('pricingGuide.items')}</span>
            <div className="flex-1" />
            <div className="mr-1.5 text-right">
              <div className="text-[11px] text-gray-400">{t(billing === 'yearly' ? 'pricingGuide.estTotalYearly' : 'pricingGuide.estTotal')}</div>
              <div className="text-lg font-black tracking-tight text-black dark:text-white">{money(rec) || '$0'}</div>
            </div>
            <button onClick={() => { setQuote({}); setQuoteOpen(false); }} className="rounded-full border border-stroke px-3.5 py-2 text-[13px] text-gray-500 hover:border-danger hover:text-danger dark:border-strokedark">{t('pricingGuide.clear')}</button>
            <button onClick={() => setQuoteOpen((v) => !v)} className="rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-opacity-90">{quoteOpen ? t('pricingGuide.close') : t('pricingGuide.open')}</button>
          </div>
          {/* Always visible — no scrolling needed to reach these, regardless of how long the item list gets. */}
          <div className="flex flex-wrap items-center gap-2.5 border-t border-stroke px-6 py-3 dark:border-strokedark">
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={t('pricingGuide.clientNamePh') as string}
              className="min-w-0 flex-1 rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
            <button onClick={buildQuote} disabled={building}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
              {building ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <span>👁</span>}
              {t('pricingGuide.buildQuote')}
            </button>
          </div>
          {quoteOpen && (
            <div className="max-h-[230px] overflow-y-auto border-t border-stroke px-6 pb-4 dark:border-strokedark">
              {quoteRows.map((qr) => (
                <div key={qr.id} className="flex items-center gap-3 border-b border-stroke py-2.5 dark:border-strokedark">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold text-black dark:text-white">{qr.name}</div>
                    <div className="font-mono text-[11px] text-gray-400">{qr.sku}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQty(qr.id, qr.qty - 1)} className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-stroke text-black dark:border-strokedark dark:text-white">–</button>
                    <span className="w-5 text-center text-[13px] font-semibold">{qr.qty}</span>
                    <button onClick={() => setQty(qr.id, qr.qty + 1)} className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-stroke text-black dark:border-strokedark dark:text-white">+</button>
                  </div>
                  <div className="w-[110px] text-right text-[13.5px] font-bold text-black dark:text-white">{qr.lineTotal}</div>
                  <button onClick={() => toggleQuote(qr.id)} className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-2 text-[10px] text-gray-500 dark:bg-meta-4">✕</button>
                </div>
              ))}
              <div className="flex justify-end gap-10 pt-3.5">
                <span className="text-[13px] text-gray-400">{t('pricingGuide.recurring')} {billing === 'yearly' ? t('pricingGuide.perYear') : t('pricingGuide.perMonth')}</span>
                <span className="w-[110px] text-right text-[13px] font-bold text-black dark:text-white">{money(rec) || '$0'}</span>
              </div>
              <div className="flex justify-end gap-10">
                <span className="text-[13px] text-gray-400">{t('pricingGuide.oneTime')}</span>
                <span className="w-[110px] text-right text-[13px] font-bold text-black dark:text-white">{money(oneTime) || '$0'}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quote PDF preview */}
      {quotePdf && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setQuotePdf(null); }}>
          <div className="flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
            <div className="flex flex-none items-center justify-between border-b border-stroke px-5 py-3.5 dark:border-strokedark">
              <span className="text-base font-bold text-black dark:text-white">{t('pricingGuide.quotePreview')}</span>
              <div className="flex items-center gap-2">
                <a href={quotePdf.url} download={quotePdf.fileName}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-opacity-90">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m6 5v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1" /></svg>
                  {t('pricingGuide.downloadPdf')}
                </a>
                <button onClick={() => setQuotePdf(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
            </div>
            <iframe src={quotePdf.url} title={t('pricingGuide.quotePreview') as string} className="h-full w-full flex-1 border-0" />
          </div>
        </div>
      )}
    </>
  );
};

export default PricingGuide;
