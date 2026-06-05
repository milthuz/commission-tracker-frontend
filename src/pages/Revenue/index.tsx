import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

type Tab = 'byRep' | 'byReseller';
type Row = {
  merchant_account_id: string;
  business_name: string;
  sales_rep_name: string | null;
  reseller_name: string | null;
  month: number; // 1-12
  transaction_profit: number;
  volume: number;
  payments_count: number;
};
type Filter = { month: string; search: string };

const CHART_PALETTE = ['#3C50E0', '#80CAEE', '#0FADCF', '#F58346', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#22C55E'];
const money = (n: number) => '$' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  search: 'M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z',
};

function KpiCard({ label, value, color, iconD }: { label: string; value: string; color: string; iconD: string }) {
  return (
    <div className="rounded-sm border border-stroke bg-white px-5 py-4 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex items-center gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${color}`}>
          <Icon d={iconD} />
        </span>
        <div>
          <p className="text-title-md font-bold leading-tight text-black dark:text-white">{value}</p>
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

  // Rows relevant to the tab (reseller tab: only reseller-attributed rows).
  const tabRows = useMemo(() => (data || []).filter((r) => (tab === 'byReseller' ? !!r.reseller_name : true)), [data, tab]);

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
    const dims = new Set<string>();
    let profit = 0, volume = 0;
    for (const r of filtered) {
      profit += r.transaction_profit; volume += r.volume;
      merchants.add(r.merchant_account_id);
      const d = dimOf(r); if (d) dims.add(d);
    }
    return { profit, volume, merchants: merchants.size, dims: dims.size };
  }, [filtered, tab]);

  // Aggregate table by dimension.
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; profit: number; volume: number; merchants: Set<string> }>();
    for (const r of filtered) {
      const d = dimOf(r) || t('revenue.unassigned');
      if (!map.has(d)) map.set(d, { name: d, profit: 0, volume: 0, merchants: new Set() });
      const g = map.get(d)!;
      g.profit += r.transaction_profit; g.volume += r.volume; g.merchants.add(r.merchant_account_id);
    }
    return [...map.values()].map((g) => ({ name: g.name, profit: g.profit, volume: g.volume, merchants: g.merchants.size })).sort((a, b) => b.profit - a.profit);
  }, [filtered, tab]);

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
                <KpiCard label={t('revenue.kpi.profit')} value={money(kpis.profit)} color="bg-primary bg-opacity-10 text-primary" iconD={ICONS.profit} />
                <KpiCard label={t('revenue.kpi.volume')} value={money(kpis.volume)} color="bg-success bg-opacity-10 text-success" iconD={ICONS.volume} />
                <KpiCard label={t('revenue.kpi.merchants')} value={String(kpis.merchants)} color="bg-warning bg-opacity-10 text-warning" iconD={ICONS.merchants} />
                <KpiCard label={tab === 'byRep' ? t('revenue.kpi.reps') : t('revenue.kpi.resellers')} value={String(kpis.dims)} color="bg-[#6366F1] bg-opacity-10 text-[#6366F1]" iconD={ICONS.reps} />
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
                        <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('revenue.cols.volume')}</th>
                        <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('revenue.cols.merchants')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map((g) => (
                        <tr key={g.name} className="border-t border-stroke hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4/40">
                          <td className="px-4 py-3 font-medium text-black dark:text-white">{g.name}</td>
                          <td className="px-4 py-3 text-right font-semibold text-primary">{money(g.profit)}</td>
                          <td className="px-4 py-3 text-right text-body">{money(g.volume)}</td>
                          <td className="px-4 py-3 text-right text-body">{g.merchants}</td>
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
    </>
  );
}
