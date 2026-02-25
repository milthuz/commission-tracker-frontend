import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';

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
  recentInvoices: {
    invoiceNumber: string;
    customer: string;
    salesperson: string;
    total: number;
    commission: number;
    status: string;
    date: string;
  }[];
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

const statusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400';
    case 'overdue': return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
    case 'sent': return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';
    case 'draft': return 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400';
    case 'partially_paid': return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400';
    case 'void': return 'bg-gray-100 text-gray-500 dark:bg-gray-500/20 dark:text-gray-500';
    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400';
  }
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
    { name: 'Paid Revenue', data: data?.monthlyTrend.map(m => m.revenue) || [] },
    { name: 'Overdue', data: data?.monthlyTrend.map(m => m.overdue) || [] },
    { name: 'Commission', data: data?.monthlyTrend.map(m => m.commission) || [] },
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
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading dashboard...</p>
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
            Sales Hub
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Revenue overview, invoices, and customer insights</p>
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
            {syncStatus === 'syncing' ? 'Syncing...' : 
             syncStatus?.startsWith('done_') ? `✓ ${syncStatus.split('_')[1]} synced` :
             syncStatus === 'needs_import' ? 'Full import needed (Admin Panel)' :
             syncStatus === 'error' ? 'Sync failed' :
             'Sync Now'}
          </button>

          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="rounded-lg border border-stroke bg-white px-4 py-2 text-sm font-medium text-black shadow-sm dark:border-strokedark dark:bg-boxdark dark:text-white"
          >
            {[...Array(5)].map((_, i) => {
              const y = new Date().getFullYear() - i;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
        </div>
      </div>

      {/* ====== Stats Cards ====== */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:gap-7.5">
        {/* Paid Revenue */}
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
            <svg className="fill-emerald-600 dark:fill-emerald-400" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.94s4.18 1.36 4.18 3.85c0 1.89-1.44 2.98-3.12 3.19z" />
            </svg>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-black dark:text-white">
              {formatCurrency(data.cards.paidRevenue)}
            </h4>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Paid Revenue</span>
            <span className="ml-2 text-xs font-medium text-emerald-600">
              {data.cards.paidCount} invoices
            </span>
          </div>
        </div>

        {/* Total Sales Volume */}
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">
            <svg className="stroke-blue-600 dark:stroke-blue-400" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
              <polyline points="16 7 22 7 22 13"/>
            </svg>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-black dark:text-white">
              {formatCurrency(data.cards.paidRevenue + data.cards.overdueAmount)}
            </h4>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Sales</span>
          </div>
        </div>

        {/* Total Invoices */}
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-500/20">
            <svg className="fill-purple-600 dark:fill-purple-400" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
            </svg>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-black dark:text-white">
              {data.cards.totalInvoices.toLocaleString()}
            </h4>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Invoices</span>
          </div>
        </div>

        {/* Overdue Amount */}
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20">
            <svg className="fill-red-600 dark:fill-red-400" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(data.cards.overdueAmount)}
            </h4>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Overdue</span>
            <span className="ml-2 text-xs font-medium text-red-500">
              {data.cards.overdueCount} invoices
            </span>
          </div>
        </div>
      </div>

      {/* ====== Charts Row 1: Revenue Trend ====== */}
      <div className="mt-4 grid grid-cols-12 gap-4 md:mt-6 md:gap-6 2xl:mt-7.5 2xl:gap-7.5">
        {/* Monthly Revenue Trend - Full Width */}
        <div className="col-span-12 rounded-sm border border-stroke bg-white px-5 pt-7.5 pb-5 shadow-default dark:border-strokedark dark:bg-boxdark xl:col-span-8">
          <div className="mb-3 flex items-center justify-between">
            <h5 className="text-xl font-semibold text-black dark:text-white">
              Monthly Revenue Trend — {selectedYear}
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

        {/* Invoice Status Breakdown - Donut */}
        <div className="col-span-12 rounded-sm border border-stroke bg-white px-5 pt-7.5 pb-5 shadow-default dark:border-strokedark dark:bg-boxdark xl:col-span-4">
          <h5 className="mb-3 text-xl font-semibold text-black dark:text-white">
            Invoice Status
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

      {/* ====== Charts Row 2: Top Customers (full width) ====== */}
      <div className="mt-4 grid grid-cols-12 gap-4 md:mt-6 md:gap-6 2xl:gap-7.5">
        {/* Top Customers */}
        <div className="col-span-12 rounded-sm border border-stroke bg-white px-5 pt-7.5 pb-5 shadow-default dark:border-strokedark dark:bg-boxdark xl:col-span-12">
          <h5 className="mb-4 text-xl font-semibold text-black dark:text-white">
            Top Customers
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
                    {customer.invoices} invoice{customer.invoices !== 1 ? 's' : ''}
                  </span>
                </div>
              );
            })}
            {data.topCustomers.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No customer data available</p>
            )}
          </div>
        </div>
      </div>

      {/* ====== Recent Invoices Table ====== */}
      <div className="mt-4 md:mt-6 2xl:mt-7.5">
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="px-4 py-6 md:px-6 xl:px-7.5">
            <h4 className="text-xl font-semibold text-black dark:text-white">
              Recent Invoices
            </h4>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-7 border-t border-stroke px-4 py-4.5 dark:border-strokedark md:px-6 2xl:px-7.5">
            <div className="col-span-1">
              <p className="font-medium text-sm text-gray-500 dark:text-gray-400">Invoice #</p>
            </div>
            <div className="col-span-1">
              <p className="font-medium text-sm text-gray-500 dark:text-gray-400">Customer</p>
            </div>
            <div className="col-span-1">
              <p className="font-medium text-sm text-gray-500 dark:text-gray-400">Sales Rep</p>
            </div>
            <div className="col-span-1">
              <p className="font-medium text-sm text-gray-500 dark:text-gray-400">Date</p>
            </div>
            <div className="col-span-1">
              <p className="font-medium text-sm text-gray-500 dark:text-gray-400 text-right">Total</p>
            </div>
            <div className="col-span-1">
              <p className="font-medium text-sm text-gray-500 dark:text-gray-400 text-right">Commission</p>
            </div>
            <div className="col-span-1">
              <p className="font-medium text-sm text-gray-500 dark:text-gray-400 text-center">Status</p>
            </div>
          </div>

          {/* Table Body */}
          {data.recentInvoices.map((inv, index) => (
            <div
              key={inv.invoiceNumber}
              className={`grid grid-cols-7 border-t border-stroke px-4 py-4 dark:border-strokedark md:px-6 2xl:px-7.5 ${
                index % 2 === 0 ? '' : 'bg-gray-50 dark:bg-meta-4/30'
              }`}
            >
              <div className="col-span-1 flex items-center">
                <p className="text-sm font-medium text-primary">{inv.invoiceNumber}</p>
              </div>
              <div className="col-span-1 flex items-center">
                <p className="text-sm text-black dark:text-white truncate">{inv.customer}</p>
              </div>
              <div className="col-span-1 flex items-center">
                <p className="text-sm text-black dark:text-white truncate">{inv.salesperson}</p>
              </div>
              <div className="col-span-1 flex items-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {new Date(inv.date).toLocaleDateString('en-CA')}
                </p>
              </div>
              <div className="col-span-1 flex items-center justify-end">
                <p className="text-sm font-medium text-black dark:text-white">
                  {formatCurrencyFull(inv.total)}
                </p>
              </div>
              <div className="col-span-1 flex items-center justify-end">
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  {formatCurrencyFull(inv.commission)}
                </p>
              </div>
              <div className="col-span-1 flex items-center justify-center">
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${statusColor(inv.status)}`}>
                  {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                </span>
              </div>
            </div>
          ))}

          {data.recentInvoices.length === 0 && (
            <div className="border-t border-stroke px-4 py-8 text-center dark:border-strokedark">
              <p className="text-sm text-gray-500 dark:text-gray-400">No invoices found for {selectedYear}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ECommerce;
