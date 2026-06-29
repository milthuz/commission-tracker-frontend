import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { useTranslation } from 'react-i18next';
import AdminActionItems from './AdminActionItems';
const API_URL = import.meta.env.VITE_API_URL || process.env.REACT_APP_API_URL || 'http://localhost:5000';

interface DashboardData {
  cards: {
    paidRevenue: number;
    totalCommission: number;
    totalInvoices: number;
    overdueAmount: number;
    paidCount: number;
    overdueCount: number;
  };
  monthlyTrend: { month: string; revenue: number; overdue: number; commission: number }[];
  commissionsByRep: { name: string; invoices: number; sales: number; commission: number }[];
  statusBreakdown: { status: string; count: number; total: number }[];
  topCustomers: { name: string; invoices: number; total: number }[];
  avgSaas: { total: number; clients: number; monthly: number };
  avgProcessing: { total: number; clients: number; monthly: number } | null;
  avgRevenuePerMerchant: { total: number; merchants: number; monthly: number } | null;
  year: number;
}

const formatCurrency = (val: number) => {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
};

const formatCurrencyFull = (val: number) => {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(val);
};

const statusPieColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid': return '#10B981';
    case 'overdue': return '#EF4444';
    case 'sent': return '#3B82F6';
    case 'draft': return '#9CA3AF';
    case 'partially_paid': return '#F59E0B';
    case 'void': return '#6B7280';
    default: return '#D1D5DB';
  }
};

const ECommerce: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, [selectedYear]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/dashboard?year=${selectedYear}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(response.data);
      setError('');
    } catch (err: any) {
      console.error('Dashboard error:', err);
      setError(err.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const triggerSync = async () => {
    try {
      setSyncStatus('syncing');
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/invoices/incremental-sync`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.data.needsBulkImport) {
        setSyncStatus('needs_import');
      } else {
        setSyncStatus(`done_${response.data.totalSynced || 0}`);
        // Refresh dashboard after sync
        setTimeout(() => {
          fetchDashboard();
          setSyncStatus(null);
        }, 2000);
      }
    } catch (err) {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(null), 3000);
    }
  };

  // --- Chart Configs ---
  const revenueChartOptions: ApexOptions = {
    chart: { type: 'area', height: 350, fontFamily: 'Satoshi, sans-serif', toolbar: { show: false } },
    colors: ['#3C50E0', '#EF4444', '#10B981'],
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: [2, 2, 2] },
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.05, stops: [0, 95, 100] },
    },
    xaxis: {
      categories: data?.monthlyTrend.map(m => m.month) || [],
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        formatter: (val: number) => formatCurrency(val),
      },
    },
    legend: { position: 'top', horizontalAlign: 'left' },
    tooltip: {
      y: { formatter: (val: number) => formatCurrencyFull(val) },
    },
    grid: { borderColor: '#e7e7e7', strokeDashArray: 4 },
  };

  const revenueChartSeries = [
    { name: t('dashboard.paidRevenueSeries'), data: data?.monthlyTrend.map(m => m.revenue) || [] },
    { name: t('dashboard.overdueSeries'), data: data?.monthlyTrend.map(m => m.overdue) || [] },
    { name: t('dashboard.commissionSeries'), data: data?.monthlyTrend.map(m => m.commission) || [] },
  ];

  const statusChartOptions: ApexOptions = {
    chart: { type: 'donut', fontFamily: 'Satoshi, sans-serif' },
    colors: data?.statusBreakdown.map(s => statusPieColor(s.status)) || [],
    labels: data?.statusBreakdown.map(s => s.status.charAt(0).toUpperCase() + s.status.slice(1)) || [],
    legend: { position: 'bottom', fontSize: '13px' },
    plotOptions: {
      pie: {
        donut: {
          size: '65%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total',
              formatter: function (w: any) {
                return w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0).toString();
              },
            },
          },
        },
      },
    },
    dataLabels: { enabled: false },
    responsive: [{ breakpoint: 480, options: { chart: { width: 280 }, legend: { position: 'bottom' } } }],
  };

  const statusChartSeries = data?.statusBreakdown.map(s => s.count) || [];

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.loadingDashboard')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-red-500">{error}</p>
          <button
            onClick={fetchDashboard}
            className="rounded-lg bg-primary px-5 py-2.5 text-white hover:bg-opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      {/* Header with year selector and sync */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white">
            {t('dashboard.title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Sync Button */}
          <button
            onClick={triggerSync}
            disabled={syncStatus === 'syncing'}
            className="inline-flex items-center gap-2 rounded-lg border border-stroke bg-white px-4 py-2 text-sm font-medium text-black shadow-sm hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:text-white dark:hover:bg-meta-4 disabled:opacity-50"
          >
            <svg className={`h-4 w-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncStatus === 'syncing' ? t('dashboard.syncing') : 
             syncStatus?.startsWith('done_') ? `✓ ${syncStatus.split('_')[1]} ${t('dashboard.synced')}` :
             syncStatus === 'needs_import' ? t('dashboard.fullImportNeeded') :
             syncStatus === 'error' ? t('dashboard.syncFailed') :
             t('dashboard.syncNow')}
          </button>

          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="rounded-lg border border-stroke bg-white px-4 py-2 text-sm font-medium text-black shadow-sm dark:border-strokedark dark:bg-boxdark dark:text-white"
          >
            {/* Data starts Jan 2025 — list current year down to 2025 only */}
            {[...Array(new Date().getFullYear() - 2024)].map((_, i) => {
              const y = new Date().getFullYear() - i;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
        </div>
      </div>

      {/* ====== Action items (admin) ====== */}
      <AdminActionItems />

      {/* ====== Board averages (monthly run-rate): SaaS / processing / combined per merchant ====== */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:mt-6 md:grid-cols-3 2xl:gap-7.5">
        {/* Average monthly SaaS revenue per client */}
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-500/20">
            <svg className="stroke-cyan-600 dark:stroke-cyan-400" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M2 11h20M6 3h12" />
            </svg>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-black dark:text-white">{formatCurrencyFull(data.avgSaas?.monthly || 0)}</h4>
            <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.avgSaasPerClient')}</span>
            <span className="text-xs font-medium text-gray-400">{data.avgSaas?.clients || 0} {t('dashboard.clientsCount')}</span>
          </div>
        </div>

        {/* Average monthly processing profit per merchant — revenue-gated */}
        {data.avgProcessing && (
          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
              <svg className="stroke-emerald-600 dark:stroke-emerald-400" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
              </svg>
            </div>
            <div className="mt-4">
              <h4 className="text-2xl font-bold text-black dark:text-white">{formatCurrencyFull(data.avgProcessing.monthly || 0)}</h4>
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.avgProcessingPerClient')}</span>
              <span className="text-xs font-medium text-gray-400">{data.avgProcessing.clients || 0} {t('dashboard.merchantsCount')}</span>
            </div>
          </div>
        )}

        {/* Combined revenue per merchant (SaaS + processing) — revenue-gated */}
        {data.avgRevenuePerMerchant && (
          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/20">
              <svg className="stroke-indigo-600 dark:stroke-indigo-400" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" />
              </svg>
            </div>
            <div className="mt-4">
              <h4 className="text-2xl font-bold text-black dark:text-white">{formatCurrencyFull(data.avgRevenuePerMerchant.monthly || 0)}</h4>
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">{t('dashboard.avgRevenuePerMerchant')}</span>
              <span className="text-xs font-medium text-gray-400">{data.avgRevenuePerMerchant.merchants || 0} {t('dashboard.merchantsCount')}</span>
            </div>
          </div>
        )}
      </div>

      {/* ====== Charts Row 1: Revenue Trend ====== */}
      <div className="mt-4 grid grid-cols-12 gap-4 md:mt-6 md:gap-6 2xl:mt-7.5 2xl:gap-7.5">
        {/* Monthly Revenue Trend - Full Width */}
        <div className="col-span-12 rounded-sm border border-stroke bg-white px-5 pt-7.5 pb-5 shadow-default dark:border-strokedark dark:bg-boxdark xl:col-span-8">
          <div className="mb-3 flex items-center justify-between">
            <h5 className="text-xl font-semibold text-black dark:text-white">
              {t('dashboard.monthlyRevenueTrend')} — {selectedYear}
            </h5>
          </div>
          <div>
            <ReactApexChart
              options={revenueChartOptions}
              series={revenueChartSeries}
              type="area"
              height={350}
            />
          </div>
        </div>

        {/* {t('dashboard.invoiceStatus')} Breakdown - Donut */}
        <div className="col-span-12 rounded-sm border border-stroke bg-white px-5 pt-7.5 pb-5 shadow-default dark:border-strokedark dark:bg-boxdark xl:col-span-4">
          <h5 className="mb-3 text-xl font-semibold text-black dark:text-white">
            {t('dashboard.invoiceStatus')}
          </h5>
          <div className="flex items-center justify-center">
            <ReactApexChart
              options={statusChartOptions}
              series={statusChartSeries}
              type="donut"
              height={340}
            />
          </div>
        </div>
      </div>

      {/* ====== Charts Row 2: {t('dashboard.topCustomers')} (full width) ====== */}
      <div className="mt-4 grid grid-cols-12 gap-4 md:mt-6 md:gap-6 2xl:gap-7.5">
        {/* {t('dashboard.topCustomers')} */}
        <div className="col-span-12 rounded-sm border border-stroke bg-white px-5 pt-7.5 pb-5 shadow-default dark:border-strokedark dark:bg-boxdark xl:col-span-12">
          <h5 className="mb-4 text-xl font-semibold text-black dark:text-white">
            {t('dashboard.topCustomers')}
          </h5>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {data.topCustomers.map((customer, index) => {
              const maxTotal = data.topCustomers[0]?.total || 1;
              const percentage = (customer.total / maxTotal) * 100;
              return (
                <div key={index}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-black dark:text-white truncate max-w-[60%]">
                      {index + 1}. {customer.name}
                    </span>
                    <span className="text-sm font-semibold text-black dark:text-white">
                      {formatCurrencyFull(customer.total)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-meta-4">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {customer.invoices} {t('dashboard.invoices')}
                  </span>
                </div>
              );
            })}
            {data.topCustomers.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">{t('dashboard.noCustomerData')}</p>
            )}
          </div>
        </div>
      </div>

    </>
  );
};

export default ECommerce;
