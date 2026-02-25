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

const CommissionTracker: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

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
      console.error('Commission Tracker error:', err);
      setError(err.response?.data?.error || 'Failed to load commission data');
    } finally {
      setLoading(false);
    }
  };

  // Derived stats
  const totalCommission = data?.cards.totalCommission || 0;
  const totalSales = data?.cards.paidRevenue || 0;
  const avgRate = totalSales > 0 ? ((totalCommission / totalSales) * 100).toFixed(1) : '0.0';
  const topEarner = data?.commissionsByRep?.length
    ? data.commissionsByRep.reduce((a, b) => (a.commission > b.commission ? a : b))
    : null;
  const currentMonth = new Date().getMonth(); // 0-indexed
  const currentMonthCommission = data?.monthlyTrend?.[currentMonth]?.commission || 0;

  // --- Commission Trend Chart ---
  const commissionTrendOptions: ApexOptions = {
    chart: { type: 'area', height: 350, fontFamily: 'Satoshi, sans-serif', toolbar: { show: false } },
    colors: ['#8B5CF6', '#3B82F6'],
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: [3, 2] },
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
      labels: { formatter: (val: number) => formatCurrency(val) },
    },
    legend: { position: 'top', horizontalAlign: 'left' },
    tooltip: { y: { formatter: (val: number) => formatCurrencyFull(val) } },
    grid: { borderColor: '#e7e7e7', strokeDashArray: 4 },
  };

  const commissionTrendSeries = [
    { name: 'Commission', data: data?.monthlyTrend.map(m => m.commission) || [] },
    { name: 'Revenue (ref)', data: data?.monthlyTrend.map(m => m.revenue) || [] },
  ];

  // --- Commission by Rep Chart ---
  const repChartOptions: ApexOptions = {
    chart: { type: 'bar', height: 350, fontFamily: 'Satoshi, sans-serif', toolbar: { show: false } },
    colors: ['#8B5CF6', '#10B981'],
    plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 4 } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: data?.commissionsByRep.map(r => {
        const name = r.name;
        return name.length > 12 ? name.substring(0, 12) + '...' : name;
      }) || [],
      labels: { rotate: -45, style: { fontSize: '11px' } },
    },
    yaxis: { labels: { formatter: (val: number) => formatCurrency(val) } },
    legend: { position: 'top' },
    tooltip: { y: { formatter: (val: number) => formatCurrencyFull(val) } },
    grid: { borderColor: '#e7e7e7', strokeDashArray: 4 },
  };

  const repChartSeries = [
    { name: 'Commission', data: data?.commissionsByRep.map(r => r.commission) || [] },
    { name: 'Sales', data: data?.commissionsByRep.map(r => r.sales) || [] },
  ];

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#8B5CF6] border-t-transparent"></div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading commissions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-red-500">{error}</p>
          <button onClick={fetchDashboard} className="rounded-lg bg-primary px-5 py-2.5 text-white hover:bg-opacity-90">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white">Commission Tracker</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track earnings, commissions by rep, and payout trends</p>
        </div>
        <div className="flex items-center gap-3">
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

      {/* ====== Commission Stats Cards ====== */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:gap-7.5">
        {/* Total Commission */}
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-[#8B5CF6] bg-opacity-20">
            <svg className="stroke-[#8B5CF6]" width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2"/>
              <circle cx="12" cy="12" r="3"/>
              <path d="M2 10h2"/>
              <path d="M20 10h2"/>
              <path d="M2 14h2"/>
              <path d="M20 14h2"/>
            </svg>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-black dark:text-white">
              {formatCurrency(totalCommission)}
            </h4>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Commission</span>
            <span className="ml-2 text-xs font-medium text-[#8B5CF6]">{selectedYear}</span>
          </div>
        </div>

        {/* Avg Commission Rate */}
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-[#3B82F6] bg-opacity-20">
            <svg className="stroke-[#3B82F6]" width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="5" x2="5" y2="19"/>
              <circle cx="6.5" cy="6.5" r="2.5"/>
              <circle cx="17.5" cy="17.5" r="2.5"/>
            </svg>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-black dark:text-white">
              {avgRate}%
            </h4>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Commission Rate</span>
          </div>
        </div>

        {/* Top Earner */}
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-[#10B981] bg-opacity-20">
            <svg className="stroke-[#10B981]" width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15l-2 5l9-11h-5l2-5l-9 11h5z"/>
            </svg>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-black dark:text-white truncate">
              {topEarner?.name || 'N/A'}
            </h4>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Top Earner</span>
            {topEarner && (
              <span className="ml-2 text-xs font-medium text-[#10B981]">
                {formatCurrency(topEarner.commission)}
              </span>
            )}
          </div>
        </div>

        {/* This Month Commission */}
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-[#F59E0B] bg-opacity-20">
            <svg className="stroke-[#F59E0B]" width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-black dark:text-white">
              {formatCurrency(currentMonthCommission)}
            </h4>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">This Month</span>
          </div>
        </div>
      </div>

      {/* ====== Charts Row: Commission Trend + By Rep ====== */}
      <div className="mt-4 grid grid-cols-12 gap-4 md:mt-6 md:gap-6 2xl:mt-7.5 2xl:gap-7.5">
        {/* Commission Trend */}
        <div className="col-span-12 rounded-sm border border-stroke bg-white px-5 pt-7.5 pb-5 shadow-default dark:border-strokedark dark:bg-boxdark xl:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <h5 className="text-xl font-semibold text-black dark:text-white">
              Commission Trend — {selectedYear}
            </h5>
          </div>
          <div>
            <ReactApexChart
              options={commissionTrendOptions}
              series={commissionTrendSeries}
              type="area"
              height={350}
            />
          </div>
        </div>

        {/* Commission by Rep Chart */}
        <div className="col-span-12 rounded-sm border border-stroke bg-white px-5 pt-7.5 pb-5 shadow-default dark:border-strokedark dark:bg-boxdark xl:col-span-5">
          <h5 className="mb-3 text-xl font-semibold text-black dark:text-white">
            Commission by Rep
          </h5>
          <div>
            <ReactApexChart
              options={repChartOptions}
              series={repChartSeries}
              type="bar"
              height={350}
            />
          </div>
        </div>
      </div>

      {/* ====== Detailed Rep Table ====== */}
      <div className="mt-4 md:mt-6 2xl:mt-7.5">
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="px-4 py-6 md:px-6 xl:px-7.5">
            <h4 className="text-xl font-semibold text-black dark:text-white">
              Sales Rep Breakdown
            </h4>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-5 border-t border-stroke px-4 py-4.5 dark:border-strokedark md:px-6 2xl:px-7.5">
            <div className="col-span-1">
              <p className="font-medium text-sm text-gray-500 dark:text-gray-400">Sales Rep</p>
            </div>
            <div className="col-span-1">
              <p className="font-medium text-sm text-gray-500 dark:text-gray-400 text-center">Invoices</p>
            </div>
            <div className="col-span-1">
              <p className="font-medium text-sm text-gray-500 dark:text-gray-400 text-right">Total Sales</p>
            </div>
            <div className="col-span-1">
              <p className="font-medium text-sm text-gray-500 dark:text-gray-400 text-right">Commission</p>
            </div>
            <div className="col-span-1">
              <p className="font-medium text-sm text-gray-500 dark:text-gray-400 text-right">Rate</p>
            </div>
          </div>

          {/* Table Body */}
          {data.commissionsByRep
            .sort((a, b) => b.commission - a.commission)
            .map((rep, index) => {
              const rate = rep.sales > 0 ? ((rep.commission / rep.sales) * 100).toFixed(1) : '0.0';
              return (
                <div
                  key={rep.name}
                  className={`grid grid-cols-5 border-t border-stroke px-4 py-4 dark:border-strokedark md:px-6 2xl:px-7.5 ${
                    index % 2 === 0 ? '' : 'bg-gray-50 dark:bg-meta-4/30'
                  }`}
                >
                  <div className="col-span-1 flex items-center">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${
                        index === 0 ? 'bg-[#F59E0B]' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-700' : 'bg-gray-300'
                      }`}>
                        {index + 1}
                      </div>
                      <p className="text-sm font-medium text-black dark:text-white truncate">{rep.name}</p>
                    </div>
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    <p className="text-sm text-black dark:text-white">{rep.invoices.toLocaleString()}</p>
                  </div>
                  <div className="col-span-1 flex items-center justify-end">
                    <p className="text-sm text-black dark:text-white">{formatCurrencyFull(rep.sales)}</p>
                  </div>
                  <div className="col-span-1 flex items-center justify-end">
                    <p className="text-sm font-semibold text-[#8B5CF6]">{formatCurrencyFull(rep.commission)}</p>
                  </div>
                  <div className="col-span-1 flex items-center justify-end">
                    <span className="inline-block rounded-full bg-[#8B5CF6] bg-opacity-10 px-3 py-1 text-xs font-medium text-[#8B5CF6]">
                      {rate}%
                    </span>
                  </div>
                </div>
              );
            })}

          {data.commissionsByRep.length === 0 && (
            <div className="border-t border-stroke px-4 py-8 text-center dark:border-strokedark">
              <p className="text-sm text-gray-500 dark:text-gray-400">No commission data for {selectedYear}</p>
            </div>
          )}

          {/* Totals Row */}
          {data.commissionsByRep.length > 0 && (
            <div className="grid grid-cols-5 border-t-2 border-stroke px-4 py-4 dark:border-strokedark md:px-6 2xl:px-7.5 bg-gray-50 dark:bg-meta-4/30">
              <div className="col-span-1 flex items-center">
                <p className="text-sm font-bold text-black dark:text-white">TOTAL</p>
              </div>
              <div className="col-span-1 flex items-center justify-center">
                <p className="text-sm font-bold text-black dark:text-white">
                  {data.commissionsByRep.reduce((sum, r) => sum + r.invoices, 0).toLocaleString()}
                </p>
              </div>
              <div className="col-span-1 flex items-center justify-end">
                <p className="text-sm font-bold text-black dark:text-white">
                  {formatCurrencyFull(data.commissionsByRep.reduce((sum, r) => sum + r.sales, 0))}
                </p>
              </div>
              <div className="col-span-1 flex items-center justify-end">
                <p className="text-sm font-bold text-[#8B5CF6]">
                  {formatCurrencyFull(data.commissionsByRep.reduce((sum, r) => sum + r.commission, 0))}
                </p>
              </div>
              <div className="col-span-1 flex items-center justify-end">
                <span className="inline-block rounded-full bg-[#8B5CF6] bg-opacity-10 px-3 py-1 text-xs font-bold text-[#8B5CF6]">
                  {avgRate}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CommissionTracker;
