import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';

const API_URL = import.meta.env.VITE_API_URL;

interface MonthData {
  month: number;
  invoices: number;
  revenue: number;
  commission: number;
  paidCommission: number;
  paidRevenue: number;
}

interface CustomerData {
  customerName: string;
  invoices: number;
  revenue: number;
  commission: number;
}

interface ReportData {
  repName: string;
  commissionRate: number;
  year: string;
  months: MonthData[];
  customers: CustomerData[];
  summary: {
    currentMonth: { commission: number; revenue: number; invoices: number };
    ytd: { commission: number; revenue: number; invoices: number };
  };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CommissionReport = () => {
  useAuth();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedRep, setSelectedRep] = useState('');
  const [salespeople, setSalespeople] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin status
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setIsAdmin(payload.isAdmin || false);
      } catch (e) { /* */ }
    }
  }, []);

  // Fetch salespeople list (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    const fetchReps = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/api/salespeople`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSalespeople(res.data.salespeople || []);
      } catch (e) {
        console.error('Error fetching salespeople:', e);
      }
    };
    fetchReps();
  }, [isAdmin]);

  // Fetch report data
  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const params: Record<string, string> = { year: selectedYear };
        if (selectedRep) params.repName = selectedRep;

        const res = await axios.get(`${API_URL}/api/commissions/report`, {
          headers: { Authorization: `Bearer ${token}` },
          params,
        });
        setReport(res.data);
      } catch (e) {
        console.error('Error fetching report:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [selectedYear, selectedRep]);

  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const currentMonthIndex = new Date().getMonth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!report) return null;

  const chartOptions: ApexOptions = {
    chart: {
      type: 'bar',
      height: 320,
      fontFamily: 'Satoshi, sans-serif',
      toolbar: { show: false },
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: '50%',
        distributed: true,
      },
    },
    colors: report.months.map((_, i) =>
      i === currentMonthIndex ? '#8B5CF6' : '#C4B5FD'
    ),
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: MONTH_NAMES,
      labels: { style: { colors: '#64748B', fontSize: '12px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#64748B', fontSize: '12px' },
        formatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
      },
    },
    grid: {
      strokeDashArray: 3,
      borderColor: '#e5e7eb',
      xaxis: { lines: { show: false } },
    },
    tooltip: {
      theme: 'dark',
      y: {
        formatter: (v: number) => `$${v.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`,
      },
    },
  };

  const chartSeries = [{
    name: 'Commission',
    data: report.months.map(m => m.paidCommission),
  }];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">
            Commission Report
          </h2>
          <p className="text-sm text-body">
            {report.repName} · {report.commissionRate}% rate · {selectedYear}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Rep Selector (Admin only) */}
          {isAdmin && salespeople.length > 0 && (
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="rounded border border-stroke bg-transparent px-4 py-2 text-sm font-medium outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input"
            >
              <option value="">My Report</option>
              {salespeople.map(rep => (
                <option key={rep} value={rep}>{rep}</option>
              ))}
            </select>
          )}

          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="rounded border border-stroke bg-transparent px-4 py-2 text-sm font-medium outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input"
          >
            {[2022, 2023, 2024, 2025, 2026].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        {/* This Month Commission */}
        <div className="rounded-sm border border-stroke bg-white px-6 py-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: '#8B5CF620' }}>
              <svg className="h-5 w-5" style={{ color: '#8B5CF6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <p className="text-sm font-medium text-body">This Month</p>
          </div>
          <h4 className="text-2xl font-bold text-black dark:text-white">
            {formatCurrency(report.summary.currentMonth.commission)}
          </h4>
          <p className="text-xs text-body mt-1">{report.summary.currentMonth.invoices} paid invoices</p>
        </div>

        {/* YTD Commission */}
        <div className="rounded-sm border border-stroke bg-white px-6 py-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: '#10B98120' }}>
              <svg className="h-5 w-5" style={{ color: '#10B981' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <p className="text-sm font-medium text-body">YTD Commission</p>
          </div>
          <h4 className="text-2xl font-bold text-black dark:text-white">
            {formatCurrency(report.summary.ytd.commission)}
          </h4>
          <p className="text-xs text-body mt-1">{report.summary.ytd.invoices} total invoices</p>
        </div>

        {/* YTD Revenue */}
        <div className="rounded-sm border border-stroke bg-white px-6 py-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: '#3B82F620' }}>
              <svg className="h-5 w-5" style={{ color: '#3B82F6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </span>
            <p className="text-sm font-medium text-body">YTD Revenue</p>
          </div>
          <h4 className="text-2xl font-bold text-black dark:text-white">
            {formatCurrency(report.summary.ytd.revenue)}
          </h4>
          <p className="text-xs text-body mt-1">Paid invoices total</p>
        </div>

        {/* Commission Rate */}
        <div className="rounded-sm border border-stroke bg-white px-6 py-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: '#F59E0B20' }}>
              <svg className="h-5 w-5" style={{ color: '#F59E0B' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
            </span>
            <p className="text-sm font-medium text-body">Commission Rate</p>
          </div>
          <h4 className="text-2xl font-bold text-black dark:text-white">
            {report.commissionRate}%
          </h4>
          <p className="text-xs text-body mt-1">{report.commissionRate !== 10 ? 'Custom override' : 'Standard rate'}</p>
        </div>
      </div>

      {/* Monthly Commission Chart */}
      <div className="mb-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">Monthly Commission</h3>
          <p className="text-sm text-body">Paid commission earned per month</p>
        </div>
        <div className="p-6">
          <ReactApexChart options={chartOptions} series={chartSeries} type="bar" height={320} />
        </div>
      </div>

      {/* Two Column: Monthly Table + Top Customers */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Monthly Breakdown Table */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <h3 className="text-lg font-semibold text-black dark:text-white">Monthly Breakdown</h3>
          </div>
          <div className="p-6">
            <table className="w-full table-auto">
              <thead>
                <tr className="bg-gray-2 text-left dark:bg-meta-4">
                  <th className="px-3 py-3 text-sm font-medium text-black dark:text-white">Month</th>
                  <th className="px-3 py-3 text-sm font-medium text-right text-black dark:text-white">Revenue</th>
                  <th className="px-3 py-3 text-sm font-medium text-right text-black dark:text-white">Commission</th>
                  <th className="px-3 py-3 text-sm font-medium text-right text-black dark:text-white">Invoices</th>
                </tr>
              </thead>
              <tbody>
                {report.months.map((m) => (
                  <tr
                    key={m.month}
                    className={`border-b border-stroke dark:border-strokedark ${
                      m.month - 1 === currentMonthIndex && selectedYear === new Date().getFullYear().toString()
                        ? 'bg-[#8B5CF6] bg-opacity-5'
                        : ''
                    }`}
                  >
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-black dark:text-white">
                          {MONTH_NAMES[m.month - 1]}
                        </span>
                        {m.month - 1 === currentMonthIndex && selectedYear === new Date().getFullYear().toString() && (
                          <span className="inline-flex rounded-full bg-[#8B5CF6] bg-opacity-10 px-2 py-0.5 text-[10px] font-bold text-[#8B5CF6]">NOW</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right text-sm text-body">
                      {m.paidRevenue > 0 ? formatCurrency(m.paidRevenue) : '—'}
                    </td>
                    <td className="px-3 py-3.5 text-right text-sm font-medium text-black dark:text-white">
                      {m.paidCommission > 0 ? formatCurrency(m.paidCommission) : '—'}
                    </td>
                    <td className="px-3 py-3.5 text-right text-sm text-body">
                      {m.invoices > 0 ? m.invoices : '—'}
                    </td>
                  </tr>
                ))}
                {/* Totals Row */}
                <tr className="bg-gray-2 dark:bg-meta-4">
                  <td className="px-3 py-3.5 text-sm font-bold text-black dark:text-white">Total</td>
                  <td className="px-3 py-3.5 text-right text-sm font-bold text-black dark:text-white">
                    {formatCurrency(report.summary.ytd.revenue)}
                  </td>
                  <td className="px-3 py-3.5 text-right text-sm font-bold text-[#8B5CF6]">
                    {formatCurrency(report.summary.ytd.commission)}
                  </td>
                  <td className="px-3 py-3.5 text-right text-sm font-bold text-black dark:text-white">
                    {report.summary.ytd.invoices}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Commission by Customer */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <h3 className="text-lg font-semibold text-black dark:text-white">Commission by Customer</h3>
            <p className="text-sm text-body">Paid invoices only · Top 50</p>
          </div>
          <div className="p-6">
            {report.customers.length === 0 ? (
              <p className="text-sm text-body py-8 text-center">No paid commissions for this period</p>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr className="bg-gray-2 text-left dark:bg-meta-4">
                      <th className="px-3 py-3 text-sm font-medium text-black dark:text-white">Customer</th>
                      <th className="px-3 py-3 text-sm font-medium text-right text-black dark:text-white">Revenue</th>
                      <th className="px-3 py-3 text-sm font-medium text-right text-black dark:text-white">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.customers.map((customer, idx) => (
                      <tr key={customer.customerName} className="border-b border-stroke dark:border-strokedark">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-2 dark:bg-meta-4 text-xs font-bold text-body">
                              {idx + 1}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-black dark:text-white truncate max-w-[200px]">
                                {customer.customerName}
                              </p>
                              <p className="text-xs text-body">{customer.invoices} invoice{customer.invoices !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-sm text-body">
                          {formatCurrency(customer.revenue)}
                        </td>
                        <td className="px-3 py-3 text-right text-sm font-medium text-black dark:text-white">
                          {formatCurrency(customer.commission)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommissionReport;
