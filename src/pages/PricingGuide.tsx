import React, { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface PricingCategory {
  id: string; sortOrder: number; hourly: number | null;
  noteEn: string | null; noteFr: string | null;
  considerationsEn: string[]; considerationsFr: string[];
}
interface PricingPackage {
  id: string; catId: string; nameEn: string; nameFr: string | null;
  sku: string | null; skuYear: string | null; compat: string | null; pos: string | null;
  priceMonthly: number | null; priceYearly: number | null; priceFlat: number | null;
  unit: string | null; activation: number | null;
  includesEn: string[]; includesFr: string[];
  internalEn: { effort?: string; requirements?: string; margin?: string; notes?: string } | null;
  internalFr: { effort?: string; requirements?: string; margin?: string; notes?: string } | null;
  status: string | null; groupName: string | null; tier: string | null; mode: string | null;
  rates: Record<string, number> | null; visible: boolean;
}
interface PricingGuideRef { id: string; titleEn: string; titleFr: string | null; bodyEn: string; bodyFr: string | null; }
interface PricingData { categories: PricingCategory[]; packages: PricingPackage[]; guides: PricingGuideRef[]; }

const CATS = ['saas', 'rental', 'menu', 'install', 'support', 'olo', 'shipping', 'xperio'];
const CATS_WITH_BILLING = new Set(['saas']);

const PricingGuide: React.FC = () => {
  const { t, i18n } = useTranslation();
  const fr = i18n.language?.startsWith('fr');
  const pick = (en: string | null | undefined, frText: string | null | undefined) => (fr && frText ? frText : en) || '';

  const [data, setData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [cat, setCat] = useState('saas');
  const [compat, setCompat] = useState<'all' | 'V1' | 'V2'>('all');
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [q, setQ] = useState('');
  const [internal, setInternal] = useState(false);
  const [quote, setQuote] = useState<Record<string, number>>({});
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setError('');
      try {
        const r = await axios.get(`${API_URL}/api/pricing`, { headers: authHeaders() });
        setData(r.data);
      } catch (e: any) {
        setError(e?.response?.data?.error || t('pricingGuide.loadError') as string);
      } finally { setLoading(false); }
    })();
  }, []);

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

  const allPackages = data?.packages || [];
  const activeCatData = data?.categories.find((c) => c.id === cat) || null;
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return allPackages.filter((p) => {
      if (p.catId !== cat) return false;
      if (compat !== 'all') {
        if (!p.compat || p.compat !== compat) return false;
      }
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
  const toggleQuote = (id: string) => {
    setQuote((q0) => {
      const next = { ...q0 };
      if (next[id]) delete next[id]; else next[id] = 1;
      return next;
    });
  };
  const setQty = (id: string, qty: number) => setQuote((q0) => ({ ...q0, [id]: Math.max(1, qty) }));

  const quoteIds = Object.keys(quote);
  let rec = 0, oneTime = 0;
  const quoteRows = quoteIds.map((id) => {
    const p = allPackages.find((x) => x.id === id);
    if (!p) return null;
    const qty = quote[id];
    const qp = quotePrice(p);
    const line = qp.amt * qty;
    if (qp.recurring) rec += line; else oneTime += line;
    return { id, name: pick(p.nameEn, p.nameFr), sku: p.sku || (t('pricingGuide.noSku') as string), qty, lineTotal: money(line) || '—' };
  }).filter(Boolean) as { id: string; name: string; sku: string; qty: number; lineTotal: string }[];

  const segBtn = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${active ? 'bg-primary text-white' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`;
  const inputCls = 'flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-black dark:text-white placeholder:text-body';

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-primary">{activeCatData ? t(`pricingGuide.categories.${cat}.eyebrow`) : ''}</span>
            <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning">{t('pricingGuide.internalOnly')}</span>
          </div>
          <h2 className="text-2xl font-bold text-black dark:text-white">{t(`pricingGuide.categories.${cat}.title`)}</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">{t(`pricingGuide.categories.${cat}.desc`)}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setInternal((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold ${internal ? 'border border-primary/40 bg-primary/10 text-primary' : 'border border-stroke text-body dark:border-strokedark'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${internal ? 'bg-primary' : 'bg-gray-400'}`} />
            {internal ? t('pricingGuide.hideInternal') : t('pricingGuide.showInternal')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : error ? (
        <div className="rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark"><p className="text-sm text-danger">{error}</p></div>
      ) : (
        <div className="flex gap-6">
          <div className="w-[190px] flex-none">
            <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('pricingGuide.sections')}</div>
            <div className="flex flex-col gap-0.5">
              {CATS.map((c) => {
                const count = allPackages.filter((p) => p.catId === c).length;
                const on = cat === c;
                return (
                  <button key={c} onClick={() => { setCat(c); setQ(''); }}
                    className={`flex items-center gap-2 rounded-lg border-l-[3px] px-3 py-2.5 text-left text-[13.5px] font-medium transition ${
                      on ? 'border-l-primary bg-gray-2 text-black dark:bg-meta-4 dark:text-white' : 'border-l-transparent text-body hover:bg-gray-1 dark:hover:bg-meta-4/40'
                    }`}>
                    <span className="flex-1">{t(`pricingGuide.categories.${c}.title`)}</span>
                    <span className="text-[11px] font-semibold text-gray-400">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 flex-1 pb-24">
            <div className="mb-4 flex flex-wrap items-center gap-3.5 border-t border-stroke pt-3.5 dark:border-strokedark">
              <div className="flex flex-1 max-w-xs items-center gap-2 rounded-full border border-stroke bg-white px-3.5 py-2 dark:border-strokedark dark:bg-boxdark">
                <svg className="h-4 w-4 flex-none text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pricingGuide.searchPh') as string} className={inputCls} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400">{t('pricingGuide.compatLabel')}</span>
                <div className="inline-flex rounded-full border border-stroke p-1 dark:border-strokedark">
                  {(['all', 'V2', 'V1'] as const).map((c) => (
                    <button key={c} onClick={() => setCompat(c)} className={segBtn(compat === c)}>{c === 'all' ? t('common.all') : c === 'V2' ? t('hardware.kaizen') : 'V1'}</button>
                  ))}
                </div>
              </div>
              {CATS_WITH_BILLING.has(cat) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-400">{t('pricingGuide.billing')}</span>
                  <div className="inline-flex rounded-full border border-stroke p-1 dark:border-strokedark">
                    {(['monthly', 'yearly'] as const).map((b) => (
                      <button key={b} onClick={() => setBilling(b)} className={segBtn(billing === b)}>{b === 'monthly' ? t('pricingGuide.monthly') : t('pricingGuide.yearly')}</button>
                    ))}
                  </div>
                  {billing === 'yearly' && <span className="rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">{t('pricingGuide.save5')}</span>}
                </div>
              )}
            </div>

            {activeCatData && pick(activeCatData.noteEn, activeCatData.noteFr) && (
              <div className="mb-4 flex gap-2.5 rounded-xl border border-stroke bg-gray-2 p-3.5 dark:border-strokedark dark:bg-meta-4">
                <span className="mt-0.5 flex-none text-primary">ⓘ</span>
                <span className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">{pick(activeCatData.noteEn, activeCatData.noteFr)}</span>
              </div>
            )}

            {list.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <svg className="h-9 w-9 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
                <div className="text-base font-semibold text-black dark:text-white">{t('pricingGuide.noResultsTitle')}</div>
                <button onClick={() => { setCompat('all'); setQ(''); }} className="mt-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90">{t('pricingGuide.reset')}</button>
              </div>
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {list.map((p) => {
                  const pr = priceOf(p);
                  const inQuote = !!quote[p.id];
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
                            {p.compat === 'V2' && <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{t('pricingGuide.kaizenTag')}</span>}
                            {p.compat === 'V1' && <span className="rounded-full border border-stroke bg-gray-2 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:border-strokedark dark:bg-meta-4">V1</span>}
                            {p.status === 'new' && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-success">{t('pricingGuide.newTag')}</span>}
                            {p.status === 'legacy' && <span className="rounded-full bg-gray-2 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:bg-meta-4">{t('pricingGuide.existingTag')}</span>}
                            {p.pos && <span className="rounded-full bg-gray-2 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:bg-meta-4">{p.pos}</span>}
                            {p.mode && <span className="rounded-full bg-gray-2 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 dark:bg-meta-4">{p.mode}</span>}
                          </div>
                          <div className="text-[15.5px] font-bold leading-tight text-black dark:text-white">{pick(p.nameEn, p.nameFr)}</div>
                        </div>
                        <button onClick={() => toggleQuote(p.id)} title={t('pricingGuide.addQuote') as string}
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
                            <span className={`flex-none ${done ? 'text-success' : ''}`}>{done ? '✓' : '⧉'}</span>
                          </button>
                        ) : <span className="text-[11.5px] italic text-gray-400">{t('pricingGuide.noSku')}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {cat === 'saas' && data && data.guides.length > 0 && (
              <div className="mt-8">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('pricingGuide.reference')}</div>
                <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                  {data.guides.map((g) => (
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
          <div className="flex items-center gap-3.5 px-6 py-3.5">
            <span className="text-primary">📄</span>
            <span className="text-[13px] font-bold text-black dark:text-white">{t('pricingGuide.quoteBuilder')}</span>
            <span className="text-xs text-gray-400">{quoteIds.length} {t('pricingGuide.items')}</span>
            <div className="flex-1" />
            <div className="mr-1.5 text-right">
              <div className="text-[11px] text-gray-400">{t('pricingGuide.estTotal')}</div>
              <div className="text-lg font-black tracking-tight text-black dark:text-white">{money(rec) || '$0'}</div>
            </div>
            <button onClick={() => { setQuote({}); setQuoteOpen(false); }} className="rounded-full border border-stroke px-3.5 py-2 text-[13px] text-gray-500 hover:border-danger hover:text-danger dark:border-strokedark">{t('pricingGuide.clear')}</button>
            <button onClick={() => setQuoteOpen((v) => !v)} className="rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-opacity-90">{quoteOpen ? t('pricingGuide.close') : t('pricingGuide.open')}</button>
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
                <span className="text-[13px] text-gray-400">{t('pricingGuide.recurring')}</span>
                <span className="w-[110px] text-right text-[13px] font-bold text-black dark:text-white">{money(rec) || '$0'} {t('pricingGuide.perMonth')}</span>
              </div>
              <div className="flex justify-end gap-10">
                <span className="text-[13px] text-gray-400">{t('pricingGuide.oneTime')}</span>
                <span className="w-[110px] text-right text-[13px] font-bold text-black dark:text-white">{money(oneTime) || '$0'}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default PricingGuide;
