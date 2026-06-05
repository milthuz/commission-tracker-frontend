import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

type Tab = 'activations' | 'payments';

type Filter = { year: string; month: string; reseller: string; search: string };
const EMPTY_FILTER: Filter = { year: 'all', month: 'all', reseller: 'all', search: '' };

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const ICONS = {
  licenses: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  locations: 'M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
  resellers: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-9a4 4 0 11-8 0 4 4 0 018 0z',
  submissions: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0l-2 5H6l-2-5m16 0H4',
  merchants: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  active: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  search: 'M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z',
};

function KpiCard({ label, value, color, iconD }: { label: string; value: number; color: string; iconD: string }) {
  return (
    <div className="rounded-sm border border-stroke bg-white px-5 py-4 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex items-center gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${color}`}>
          <Icon d={iconD} />
        </span>
        <div>
          <p className="text-title-md font-bold leading-tight text-black dark:text-white">
            {value.toLocaleString()}
          </p>
          <p className="text-sm font-medium text-body">{label}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = (status || '').toUpperCase() === 'ACTIVE';
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        active ? 'bg-success bg-opacity-10 text-success' : 'bg-body bg-opacity-10 text-body'
      }`}
    >
      {status || '—'}
    </span>
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

function NotConnected({ source }: { source: string }) {
  const { t } = useTranslation();
  return <EmptyCard title={t('reseller.notConnectedTitle')} desc={t('reseller.notConnectedDesc', { source })} />;
}

// ---------------------------------------------------------------------------
// Filter bar — year / month / reseller / search, shared across tabs
// ---------------------------------------------------------------------------
function FilterBar({
  years,
  resellers,
  filter,
  setFilter,
  count,
}: {
  years: number[];
  resellers: string[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  count: number;
}) {
  const { t, i18n } = useTranslation();
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => ({
        value: String(m),
        label: new Date(2000, m, 1).toLocaleString(i18n.language, { month: 'long' }),
      })),
    [i18n.language],
  );
  const isFiltered =
    filter.year !== 'all' || filter.month !== 'all' || filter.reseller !== 'all' || filter.search.trim() !== '';

  const selectCls =
    'rounded-md border border-stroke bg-transparent py-2 pl-3 pr-8 text-sm font-medium text-black outline-none transition focus:border-primary dark:border-strokedark dark:text-white dark:focus:border-primary';
  const labelCls = 'mb-1.5 block text-xs font-medium text-body';

  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div>
        <label className={labelCls}>{t('reseller.filters.year')}</label>
        <select className={selectCls} value={filter.year} onChange={(e) => setFilter({ ...filter, year: e.target.value })}>
          <option value="all">{t('reseller.filters.all')}</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>{t('reseller.filters.month')}</label>
        <select className={selectCls} value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value })}>
          <option value="all">{t('reseller.filters.allMonths')}</option>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label.charAt(0).toUpperCase() + m.label.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>{t('reseller.filters.reseller')}</label>
        <select
          className={selectCls}
          value={filter.reseller}
          onChange={(e) => setFilter({ ...filter, reseller: e.target.value })}
        >
          <option value="all">{t('reseller.filters.all')}</option>
          {resellers.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="relative ml-auto">
        <label className={labelCls}>{t('reseller.filters.search')}</label>
        <span className="pointer-events-none absolute left-3 top-9 text-body">
          <Icon d={ICONS.search} className="h-4 w-4" />
        </span>
        <input
          type="text"
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          placeholder={t('reseller.filters.searchPlaceholder')}
          className="w-64 rounded-md border border-stroke bg-transparent py-2 pl-9 pr-3 text-sm text-black outline-none transition focus:border-primary dark:border-strokedark dark:text-white"
        />
      </div>

      <div className="flex items-center gap-3 pb-0.5">
        <span className="text-sm text-body">{t('reseller.filters.results', { count })}</span>
        {isFiltered && (
          <button
            onClick={() => setFilter({ ...EMPTY_FILTER })}
            className="text-sm font-medium text-primary hover:underline"
          >
            {t('reseller.filters.reset')}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic filtering
// ---------------------------------------------------------------------------
function passesFilter(
  filter: Filter,
  dateStr: string | null,
  reseller: string,
  searchText: string,
): boolean {
  const d = dateStr ? new Date(dateStr) : null;
  if (filter.year !== 'all' && (!d || d.getFullYear() !== Number(filter.year))) return false;
  if (filter.month !== 'all' && (!d || d.getMonth() !== Number(filter.month))) return false;
  if (filter.reseller !== 'all' && reseller !== filter.reseller) return false;
  const q = filter.search.trim().toLowerCase();
  if (q && !searchText.toLowerCase().includes(q)) return false;
  return true;
}

function deriveYears(dates: (string | null)[]): number[] {
  const set = new Set<number>();
  for (const ds of dates) {
    if (ds) {
      const y = new Date(ds).getFullYear();
      if (!Number.isNaN(y)) set.add(y);
    }
  }
  return [...set].sort((a, b) => b - a);
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function ActivationsTab({ data, filter, setFilter }: { data: any; filter: Filter; setFilter: (f: Filter) => void }) {
  const { t } = useTranslation();
  const rows = data?.activations || [];

  const years = useMemo(() => deriveYears(rows.map((r: any) => r.submitted_at)), [rows]);
  const resellers = useMemo(
    () => [...new Set(rows.map((r: any) => r.reseller_name).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const filtered = useMemo(
    () =>
      rows.filter((r: any) =>
        passesFilter(filter, r.submitted_at, r.reseller_name || '', `${r.reseller_name || ''} ${r.customer_name || ''}`),
      ),
    [rows, filter],
  );

  const kpis = useMemo(() => {
    const locations = new Set<string>();
    let licenses = 0;
    const rs = new Set<string>();
    for (const r of filtered) {
      if (r.customer_name) locations.add(r.customer_name);
      licenses += Number(r.quantity) || 0;
      if (r.reseller_name) rs.add(r.reseller_name);
    }
    return { licenses, locations: locations.size, resellers: rs.size, submissions: filtered.length };
  }, [filtered]);

  if (!data) return <p className="text-sm text-body">…</p>;
  if (!data.connected) return <NotConnected source="Zoho Forms" />;
  if (rows.length === 0)
    return <EmptyCard title={t('reseller.activations.emptyTitle')} desc={t('reseller.activations.emptyDesc')} />;

  return (
    <div>
      <FilterBar years={years} resellers={resellers} filter={filter} setFilter={setFilter} count={filtered.length} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t('reseller.kpi.licenses')} value={kpis.licenses} color="bg-primary bg-opacity-10 text-primary" iconD={ICONS.licenses} />
        <KpiCard label={t('reseller.kpi.locations')} value={kpis.locations} color="bg-success bg-opacity-10 text-success" iconD={ICONS.locations} />
        <KpiCard label={t('reseller.kpi.resellers')} value={kpis.resellers} color="bg-[#6366F1] bg-opacity-10 text-[#6366F1]" iconD={ICONS.resellers} />
        <KpiCard label={t('reseller.kpi.submissions')} value={kpis.submissions} color="bg-warning bg-opacity-10 text-warning" iconD={ICONS.submissions} />
      </div>

      {filtered.length === 0 ? (
        <EmptyCard title={t('reseller.filters.noResultsTitle')} desc={t('reseller.filters.noResultsDesc')} />
      ) : (
        <div className="max-h-[34rem] overflow-auto rounded-md border border-stroke dark:border-strokedark">
          <table className="w-full table-auto text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-2 text-left dark:bg-meta-4">
                <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.cols.reseller')}</th>
                <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.cols.customer')}</th>
                <th className="px-4 py-3 text-right font-medium text-black dark:text-white">{t('reseller.cols.licenses')}</th>
                <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.cols.date')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a: any) => (
                <tr key={a.id} className="border-t border-stroke hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4/40">
                  <td className="px-4 py-3 font-medium text-black dark:text-white">{a.reseller_name || '—'}</td>
                  <td className="px-4 py-3 text-body">{a.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-right text-body">{a.quantity}</td>
                  <td className="px-4 py-3 text-body">
                    {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PaymentsTab({ data, filter, setFilter }: { data: any; filter: Filter; setFilter: (f: Filter) => void }) {
  const { t } = useTranslation();
  const sales = data?.sales || [];

  const years = useMemo(() => deriveYears(sales.map((s: any) => s.activated_at)), [sales]);
  const resellers = useMemo(
    () => [...new Set(sales.map((s: any) => s.reseller_name).filter(Boolean) as string[])].sort(),
    [sales],
  );
  const filtered = useMemo(
    () =>
      sales.filter((s: any) =>
        passesFilter(filter, s.activated_at, s.reseller_name || '', `${s.reseller_name || ''} ${s.business_name || ''}`),
      ),
    [sales, filter],
  );

  const kpis = useMemo(() => {
    const rs = new Set<string>();
    let active = 0;
    for (const s of filtered) {
      if (s.reseller_name) rs.add(s.reseller_name);
      if ((s.status || '').toUpperCase() === 'ACTIVE') active++;
    }
    return { merchants: filtered.length, active, resellers: rs.size };
  }, [filtered]);

  if (!data) return <p className="text-sm text-body">…</p>;
  if (!data.connected) return <NotConnected source="Zentact" />;
  if (sales.length === 0)
    return <EmptyCard title={t('reseller.payments.emptyTitle')} desc={t('reseller.payments.emptyDesc')} />;

  return (
    <div>
      <FilterBar years={years} resellers={resellers} filter={filter} setFilter={setFilter} count={filtered.length} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label={t('reseller.kpi.merchants')} value={kpis.merchants} color="bg-primary bg-opacity-10 text-primary" iconD={ICONS.merchants} />
        <KpiCard label={t('reseller.kpi.active')} value={kpis.active} color="bg-success bg-opacity-10 text-success" iconD={ICONS.active} />
        <KpiCard label={t('reseller.kpi.resellers')} value={kpis.resellers} color="bg-[#6366F1] bg-opacity-10 text-[#6366F1]" iconD={ICONS.resellers} />
      </div>

      {filtered.length === 0 ? (
        <EmptyCard title={t('reseller.filters.noResultsTitle')} desc={t('reseller.filters.noResultsDesc')} />
      ) : (
        <div className="max-h-[34rem] overflow-auto rounded-md border border-stroke dark:border-strokedark">
          <table className="w-full table-auto text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-2 text-left dark:bg-meta-4">
                <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.cols.reseller')}</th>
                <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.payments.merchant')}</th>
                <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.payments.status')}</th>
                <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.payments.activatedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any, i: number) => (
                <tr key={i} className="border-t border-stroke hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4/40">
                  <td className="px-4 py-3 font-medium text-black dark:text-white">{s.reseller_name}</td>
                  <td className="px-4 py-3 text-body">{s.business_name || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-body">
                    {s.activated_at ? new Date(s.activated_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Reseller() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('activations');
  const [filter, setFilter] = useState<Filter>({ ...EMPTY_FILTER });
  const [activations, setActivations] = useState<any>(null);
  const [residuals, setResiduals] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    axios
      .get(`${API_URL}/api/resellers/pos-activations`, { headers })
      .then((r) => setActivations(r.data))
      .catch(() => setActivations({ connected: false, activations: [] }));
    axios
      .get(`${API_URL}/api/resellers/residuals`, { headers })
      .then((r) => setResiduals(r.data))
      .catch(() => setResiduals({ connected: false, sales: [] }));
  }, []);

  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
        tab === id
          ? 'border-primary text-primary'
          : 'border-transparent text-body hover:text-black dark:hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="mb-6">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">{t('reseller.title')}</h2>
        <p className="mt-1 text-sm text-body">{t('reseller.subtitle')}</p>
      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex gap-2 border-b border-stroke px-4 dark:border-strokedark">
          {tabBtn('activations', t('reseller.tabs.activations'))}
          {tabBtn('payments', t('reseller.tabs.payments'))}
        </div>

        <div className="p-6">
          {tab === 'activations' && <ActivationsTab data={activations} filter={filter} setFilter={setFilter} />}
          {tab === 'payments' && <PaymentsTab data={residuals} filter={filter} setFilter={setFilter} />}
        </div>
      </div>
    </>
  );
}
