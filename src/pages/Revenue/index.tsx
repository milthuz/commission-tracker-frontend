import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

type Tab = 'byRep' | 'byReseller';
type Store = { storeId: string; storeReferenceId?: string | null };
type Row = {
  merchant_account_id: string;
  business_name: string;
  sales_rep_name: string | null;
  reseller_name: string | null;
  month: number; // 1-12
  transaction_profit: number;
  other_revenue: number;
  volume: number;
  payments_count: number;
  stores?: Store[];
};

// Zentact has no per-store display name — storeReferenceId is a slug derived from
// the location name ("Cantine_Des_Sources"). Prettify it; fall back to the storeId.
const storeName = (s: Store) => {
  const ref = (s.storeReferenceId || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return ref || s.storeId;
};
type Filter = { month: string; search: string };

const CHART_PALETTE = ['#3C50E0', '#80CAEE', '#0FADCF', '#F58346', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#22C55E'];
const money = (n: number) => '$' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Compact for large headline numbers (e.g. volume): $2.87M, $9.6K. Exact value goes in a tooltip.
const moneyCompact = (n: number) =>
  '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n || 0);

function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
const ICONS = {
  profit: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  volume: 'M3 13h2v7H3v-7zm4-6h2v13H7V7zm4 3h2v10h-2V10zm4-7h2v17h-2V3zm4 9h2v8h-2v-8z',
  merchants: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  reps: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-9a4 4 0 11-8 0 4 4 0 018 0z',
  other: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  total: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
  search: 'M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z',
};

function KpiCard({ label, value, color, iconD, title }: { label: string; value: string; color: string; iconD: string; title?: string }) {
  return (
    <div className="rounded-sm border border-stroke bg-white px-5 py-4 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${color}`}>
          <Icon d={iconD} />
        </span>
        <div className="min-w-0">
          <p title={title || value} className="truncate text-xl font-bold leading-tight text-black dark:text-white">{value}</p>
          <p className="text-sm font-medium text-body">{label}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-md border border-dashed border-stroke p-10 text-center dark:border-strokedark">
      <p className="text-sm font-medium text-black dark:text-white">{title}</p>
      <p className="mt-1 text-sm text-body">{desc}</p>
    </div>
  );
}

// Stacked column chart: profit per month of the year, segmented by rep/reseller.
function YearChart({ points, title }: { points: { month: number; key: string; value: number }[]; title: string }) {
  const { t, i18n } = useTranslation();
  const monthLabels = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => {
        const l = new Date(2000, m, 1).toLocaleString(i18n.language, { month: 'short' }).replace('.', '');
        return l.charAt(0).toUpperCase() + l.slice(1);
      }),
    [i18n.language],
  );
  const series = useMemo(() => {
    const byKey = new Map<string, number[]>();
    for (const p of points) {
      if (!byKey.has(p.key)) byKey.set(p.key, new Array(12).fill(0));
      byKey.get(p.key)![p.month - 1] += p.value;
    }
    let entries = [...byKey.entries()]
      .map(([name, data]) => ({ name, data: data.map((v) => Math.round(v * 100) / 100), total: data.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);
    const CAP = 8;
    if (entries.length > CAP) {
      const others = entries.slice(CAP);
      const od = new Array(12).fill(0);
      for (const e of others) e.data.forEach((v, i) => (od[i] += v));
      entries = [...entries.slice(0, CAP), { name: t('revenue.others'), data: od.map((v) => Math.round(v * 100) / 100), total: 0 }];
    }
    return entries.map((e) => ({ name: e.name, data: e.data }));
  }, [points, t]);

  const options: ApexOptions = {
    colors: CHART_PALETTE,
    chart: { type: 'bar', height: 350, stacked: true, fontFamily: 'Satoshi, sans-serif', toolbar: { show: false }, zoom: { enabled: false } },
    plotOptions: { bar: { horizontal: false, columnWidth: '45%', borderRadius: 3, borderRadiusApplication: 'end', borderRadiusWhenStacked: 'last' } },
    dataLabels: { enabled: false },
    xaxis: { categories: monthLabels },
    yaxis: { labels: { formatter: (v: number) => '$' + Math.round(v).toLocaleString() } },
    legend: { position: 'top', horizontalAlign: 'left', fontFamily: 'Satoshi', fontWeight: 500, fontSize: '13px', markers: { radius: 99 } },
    fill: { opacity: 1 },
    tooltip: { y: { formatter: (v: number) => money(v) } },
  };
  return (
    <div className="mb-6 rounded-sm border border-stroke bg-white px-5 pt-5 pb-2 shadow-default dark:border-strokedark dark:bg-boxdark">
      <h4 className="mb-2 text-base font-semibold text-black dark:text-white">{title}</h4>
      <ReactApexChart options={options} series={series} type="bar" height={350} />
    </div>
  );
}

export default function Revenue() {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const [tab, setTab] = useState<Tab>('byRep');
  const [year, setYear] = useState<number>(now.getFullYear());
  const [years, setYears] = useState<number[]>([now.getFullYear()]);
  const [filter, setFilter] = useState<Filter>({ month: String(now.getMonth() + 1), search: '' });
  const [data, setData] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const [drill, setDrill] = useState<string | null>(null); // dimension name being drilled into
  const [drillSort, setDrillSort] = useState<{ col: 'name' | 'profit' | 'other' | 'total'; dir: 'asc' | 'desc' }>({ col: 'total', dir: 'desc' });
  const [drillSearch, setDrillSearch] = useState('');
  useEffect(() => { setDrillSearch(''); }, [drill]); // fresh search per drill-down
  const [activeReps, setActiveReps] = useState<Set<string> | null>(null);
  const [activeResellers, setActiveResellers] = useState<Set<string> | null>(null);

  // Load active salespeople + active resellers so the report shows only active ones.
  useEffect(() => {
    const token = localStorage.getItem('token');
    const h = { headers: { Authorization: `Bearer ${token}` } };
    axios
      .get(`${API_URL}/api/salespeople`, h) // active-only by default
      .then((r) => setActiveReps(new Set((r.data.salespeople || []).map((n: string) => n.toLowerCase()))))
      .catch(() => setActiveReps(null));
    axios
      .get(`${API_URL}/api/resellers`, h)
      .then((r) => setActiveResellers(new Set((r.data.resellers || []).filter((x: any) => x.active).map((x: any) => String(x.name).toLowerCase()))))
      .catch(() => setActiveResellers(null)); // no reseller:view → don't filter
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setData(null); setError(false);
    axios
      .get(`${API_URL}/api/zentact/revenue?year=${year}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        setData(r.data.rows || []);
        if (Array.isArray(r.data.years) && r.data.years.length) setYears(r.data.years);
      })
      .catch(() => { setData([]); setError(true); });
  }, [year]);

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, m) => ({ value: String(m + 1), label: new Date(2000, m, 1).toLocaleString(i18n.language, { month: 'long' }) })),
    [i18n.language],
  );

  // Dimension accessor for the active tab.
  const dimOf = (r: Row) => (tab === 'byRep' ? r.sales_rep_name || t('revenue.unassigned') : r.reseller_name);

  // Rows relevant to the tab, restricted to ACTIVE salespeople / resellers.
  // (activeReps/activeResellers are null until loaded → no filtering yet, avoids an empty flash.)
  const tabRows = useMemo(() => {
    const rows = data || [];
    if (tab === 'byReseller') {
      return rows.filter((r) => !!r.reseller_name && (activeResellers === null || activeResellers.has(r.reseller_name.toLowerCase())));
    }
    return rows.filter((r) => !!r.sales_rep_name && (activeReps === null || activeReps.has(r.sales_rep_name.toLowerCase())));
  }, [data, tab, activeReps, activeResellers]);

  // Month + search filter (for KPIs + table).
  const filtered = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return tabRows.filter((r) => {
      if (filter.month !== 'all' && r.month !== Number(filter.month)) return false;
      if (q && !`${r.business_name} ${r.sales_rep_name || ''} ${r.reseller_name || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tabRows, filter]);

  const kpis = useMemo(() => {
    const merchants = new Set<string>();
    let profit = 0, other = 0, volume = 0;
    for (const r of filtered) {
      profit += r.transaction_profit; other += r.other_revenue; volume += r.volume;
      merchants.add(r.merchant_account_id);
    }
    return { profit, other, total: profit + other, volume, merchants: merchants.size };
  }, [filtered, tab]);

  // Aggregate table by dimension.
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; profit: number; other: number; merchants: Set<string> }>();
    for (const r of filtered) {
      const d = dimOf(r) || t('revenue.unassigned');
      if (!map.has(d)) map.set(d, { name: d, profit: 0, other: 0, merchants: new Set() });
      const g = map.get(d)!;
      g.profit += r.transaction_profit; g.other += r.other_revenue; g.merchants.add(r.merchant_account_id);
    }
    return [...map.values()]
      .map((g) => ({ name: g.name, profit: g.profit, other: g.other, total: g.profit + g.other, merchants: g.merchants.size }))
      .sort((a, b) => b.total - a.total);
  }, [filtered, tab]);

  // Drill-down: per-merchant breakdown for the clicked dimension (same filtered period).
  const drillMerchants = useMemo(() => {
    if (!drill) return [];
    const map = new Map<string, { name: string; profit: number; other: number; stores: Store[] }>();
    for (const r of filtered) {
      if ((dimOf(r) || t('revenue.unassigned')) !== drill) continue;
      const key = r.merchant_account_id;
      if (!map.has(key)) map.set(key, { name: r.business_name || r.merchant_account_id, profit: 0, other: 0, stores: r.stores || [] });
      const m = map.get(key)!;
      m.profit += r.transaction_profit; m.other += r.other_revenue;
      if ((!m.stores || !m.stores.length) && r.stores?.length) m.stores = r.stores;
    }
    let rows = [...map.values()].map((m) => ({ ...m, total: m.profit + m.other }));
    if (drillSearch.trim()) {
      // Accent-insensitive merchant search ("cafe" matches "Café")
      const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const q = norm(drillSearch.trim());
      rows = rows.filter((m) => norm(m.name).includes(q));
    }
    const { col, dir } = drillSort;
    const sign = dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => col === 'name'
      ? sign * a.name.localeCompare(b.name)
      : sign * ((a[col] as number) - (b[col] as number)));
    return rows;
  }, [drill, filtered, tab, drillSort, drillSearch]);
  const drillTotal = useMemo(() => drillMerchants.reduce((s, m) => s + m.total, 0), [drillMerchants]);
  const sortDrillBy = (col: 'name' | 'profit' | 'other' | 'total') =>
    setDrillSort((s) => s.col === col
      ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: col === 'name' ? 'asc' : 'desc' });
  const sortArrow = (col: string) => drillSort.col === col ? (drillSort.dir === 'asc' ? ' ▲' : ' ▼') : '';

  // Chart points: full year (ignores month filter), respects search + tab.
  const chartPoints = useMemo(() => {
    const q = filter.search.trim().toLowerCase();
    return tabRows
      .filter((r) => !q || `${r.business_name} ${r.sales_rep_name || ''} ${r.reseller_name || ''}`.toLowerCase().includes(q))
      .map((r) => ({ month: r.month, key: dimOf(r) || t('revenue.unassigned'), value: r.transaction_profit }));
  }, [tabRows, filter.search, tab]);

  const isFiltered = filter.month !== String(now.getMonth() + 1) || filter.search.trim() !== '';
  const selectCls = 'rounded-md border border-stroke bg-transparent py-2 pl-3 pr-8 text-sm font-medium text-black outline-none transition focus:border-primary dark:border-strokedark dark:text-white';
  const labelCls = 'mb-1.5 block text-xs font-medium text-body';
  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`border-b-2 px-4 py-3 text-sm font-medium transition ${tab === id ? 'border-primary text-primary' : 'border-transparent text-body hover:text-black dark:hover:text-white'}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="mb-6">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">{t('revenue.title')}</h2>
        <p className="mt-1 text-sm text-body">{t('revenue.subtitle')}</p>
      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex gap-2 border-b border-stroke px-4 dark:border-strokedark">
          {tabBtn('byRep', t('revenue.tabs.byRep'))}
          {tabBtn('byReseller', t('revenue.tabs.byReseller'))}
        </div>

        <div className="p-6">
          {data === null ? (
            <p className="text-sm text-body">…</p>
          ) : error || data.length === 0 ? (
            <EmptyCard title={t('revenue.emptyTitle')} desc={t('revenue.emptyDesc')} />
          ) : (
            <>
              {/* Filter bar */}
              <div className="mb-6 flex flex-wrap items-end gap-4">
                <div>
                  <label className={labelCls}>{t('revenue.filters.year')}</label>
                  <select className={selectCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                    {years.map((y) => (<option key={y} value={y}>{y}</option>))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t('revenue.filters.month')}</label>
                  <select className={selectCls} value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value })}>
                    <option value="all">{t('revenue.filters.allMonths')}</option>
                    {months.map((m) => (<option key={m.value} value={m.value}>{m.label.charAt(0).toUpperCase() + m.label.slice(1)}</option>))}
                  </select>
                </div>
                <div className="relative ml-auto">
                  <label className={labelCls}>{t('revenue.filters.search')}</label>
                  <span className="pointer-events-none absolute left-3 top-9 text-body"><Icon d={ICONS.search} className="h-4 w-4" /></span>
                  <input
                    type="text"
                    value={filter.search}
                    onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                    placeholder={t('revenue.filters.searchPlaceholder')}
                    className="w-72 rounded-md border border-stroke bg-transparent py-2 pl-9 pr-3 text-sm text-black outline-none transition focus:border-primary dark:border-strokedark dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-3 pb-0.5">
                  <span className="text-sm text-body">{t('revenue.filters.results', { count: filtered.length })}</span>
                  {isFiltered && (
                    <button onClick={() => setFilter({ month: String(now.getMonth() + 1), search: '' })} className="text-sm font-medium text-primary hover:underline">
                      {t('revenue.filters.reset')}
                    </button>
                  )}
                </div>
              </div>

              {/* KPI cards */}
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label={t('revenue.kpi.profit')} value={moneyCompact(kpis.profit)} title={money(kpis.profit)} color="bg-primary bg-opacity-10 text-primary" iconD={ICONS.profit} />
                <KpiCard label={t('revenue.kpi.other')} value={moneyCompact(kpis.other)} title={money(kpis.other)} color="bg-[#6366F1] bg-opacity-10 text-[#6366F1]" iconD={ICONS.other} />
                <KpiCard label={t('revenue.kpi.total')} value={moneyCompact(kpis.total)} title={money(kpis.total)} color="bg-success bg-opacity-10 text-success" iconD={ICONS.total} />
                <KpiCard label={t('revenue.kpi.merchants')} value={String(kpis.merchants)} color="bg-warning bg-opacity-10 text-warning" iconD={ICONS.merchants} />
              </div>

              <YearChart points={chartPoints} title={t('revenue.chartTitle', { year })} />

              {filtered.length === 0 ? (
                <EmptyCard title={t('revenue.filters.noResultsTitle')} desc={t('revenue.filters.noResultsDesc')} />
              ) : (
                <div className="max-h-[34rem] overflow-auto rounded-md border border-stroke dark:border-strokedark">
                  <table className="w-full table-auto text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-2 text-left dark:bg-meta-4">
                        <th className="px-4 py-3 font-medium text-black dark:text-white">{tab === 'byRep' ? t('revenue.cols.rep') : t('revenue.cols.reseller')}</th>
                        <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('revenue.cols.profit')}</th>
                        <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('revenue.cols.other')}</th>
                        <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('revenue.cols.total')}</th>
                        <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('revenue.cols.merchants')}</th>
                        <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('revenue.cols.avgPerMerchant')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map((g) => (
                        <tr key={g.name} className="border-t border-stroke hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4/40">
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setDrill(g.name)}
                              className="font-medium text-primary hover:underline"
                              title={t('revenue.viewAccounts')}
                            >
                              {g.name}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right text-body">{money(g.profit)}</td>
                          <td className="px-4 py-3 text-right text-body">{money(g.other)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-primary">{money(g.total)}</td>
                          <td className="px-4 py-3 text-right text-body">{g.merchants}</td>
                          <td className="px-4 py-3 text-right text-body">{money(g.merchants ? g.total / g.merchants : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Drill-down modal: per-merchant accounts for the clicked rep/reseller */}
      {drill && (
        <div
          className="fixed inset-0 z-999999 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDrill(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
              <div>
                <h3 className="text-lg font-semibold text-black dark:text-white">{drill}</h3>
                <p className="text-sm text-body">
                  {t('revenue.accountsSubtitle', { count: drillMerchants.length })} · {money(drillTotal)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative hidden sm:block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body"><Icon d={ICONS.search} className="h-4 w-4" /></span>
                  <input
                    type="text"
                    value={drillSearch}
                    onChange={(e) => setDrillSearch(e.target.value)}
                    placeholder={t('revenue.searchAccounts')}
                    className="w-56 rounded-md border border-stroke bg-transparent py-2 pl-9 pr-3 text-sm text-black outline-none transition focus:border-primary dark:border-strokedark dark:text-white"
                  />
                </div>
                <button onClick={() => setDrill(null)} className="text-body hover:text-black dark:hover:text-white" aria-label="Close">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Mobile search (header too narrow) */}
            <div className="border-b border-stroke px-6 py-3 dark:border-strokedark sm:hidden">
              <input
                type="text"
                value={drillSearch}
                onChange={(e) => setDrillSearch(e.target.value)}
                placeholder={t('revenue.searchAccounts')}
                className="w-full rounded-md border border-stroke bg-transparent py-2 px-3 text-sm text-black outline-none transition focus:border-primary dark:border-strokedark dark:text-white"
              />
            </div>
            <div className="max-h-[calc(80vh-5rem)] overflow-auto">
              <table className="w-full table-auto text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-2 text-left dark:bg-meta-4">
                    <th className="px-6 py-3 font-medium text-black dark:text-white">
                      <button onClick={() => sortDrillBy('name')} className="font-medium transition hover:text-primary">{t('revenue.cols.merchant')}{sortArrow('name')}</button>
                    </th>
                    <th className="px-6 py-3 text-right font-medium text-black dark:text-white">
                      <button onClick={() => sortDrillBy('profit')} className="font-medium transition hover:text-primary">{t('revenue.cols.profit')}{sortArrow('profit')}</button>
                    </th>
                    <th className="px-6 py-3 text-right font-medium text-black dark:text-white">
                      <button onClick={() => sortDrillBy('other')} className="font-medium transition hover:text-primary">{t('revenue.cols.other')}{sortArrow('other')}</button>
                    </th>
                    <th className="px-6 py-3 text-right font-medium text-black dark:text-white">
                      <button onClick={() => sortDrillBy('total')} className="font-medium transition hover:text-primary">{t('revenue.cols.total')}{sortArrow('total')}</button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {drillMerchants.map((m) => (
                    <tr key={m.name} className="border-t border-stroke align-top dark:border-strokedark">
                      <td className="px-6 py-3 text-black dark:text-white">
                        {m.name}
                        {m.stores && m.stores.length > 1 && (
                          <div className="mt-1 flex flex-col gap-0.5 text-xs font-normal text-body">
                            <span className="font-medium">{t('revenue.storesCount', { count: m.stores.length })}</span>
                            {m.stores.map((s) => (
                              <span key={s.storeId} className="pl-3">• {storeName(s)}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right text-body">{money(m.profit)}</td>
                      <td className="px-6 py-3 text-right text-body">{money(m.other)}</td>
                      <td className="px-6 py-3 text-right font-semibold text-primary">{money(m.total)}</td>
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
}
