import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { Eye, Download, X } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL;

interface DrillInvoice {
  invoiceNumber: string;
  customerName: string;
  date: string;
  total: number;
  commission: number;
  status: string;
  commissionPaid: boolean;
}

interface MonthData {
  month: number;
  invoices: number;
  revenue: number;
  commission: number;
  paidCommission: number;
  paidRevenue: number;
  commissionPaidCount: number;
  commissionQualifyingCount: number;
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
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedRep, setSelectedRep] = useState('');
  const [salespeople, setSalespeople] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [approvingMonth, setApprovingMonth] = useState<number | null>(null);

  // Drill-down state
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [drillInvoices, setDrillInvoices] = useState<DrillInvoice[]>([]);
  const [loadingDrill, setLoadingDrill] = useState(false);

  // Preview modal
  const [previewModal, setPreviewModal] = useState<{ isOpen: boolean; invoiceNumber: string; loading: boolean }>({
    isOpen: false, invoiceNumber: '', loading: false,
  });
  // Email modal
  const [emailModal, setEmailModal] = useState<{ isOpen: boolean; invoiceNumber: string; email: string; sending: boolean }>({
    isOpen: false, invoiceNumber: '', email: '', sending: false,
  });
  const [notification, setNotification] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false, message: '', type: 'success',
  });

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
    // Reset drill-downs when filters change
    setExpandedMonth(null);
    setExpandedCustomer(null);
    setDrillInvoices([]);

    const fetchReport = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const params: Record<string, string> = { year: selectedYear };
        if (selectedRep) params.repName = selectedRep;
        if (selectedMonth !== 'all') params.month = selectedMonth;

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
  }, [selectedYear, selectedMonth, selectedRep]);

  const refreshReport = async () => {
    try {
      const token = localStorage.getItem('token');
      const params: Record<string, string> = { year: selectedYear };
      if (selectedRep) params.repName = selectedRep;
      if (selectedMonth !== 'all') params.month = selectedMonth;
      const res = await axios.get(`${API_URL}/api/commissions/report`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setReport(res.data);
    } catch (e) {
      console.error('Error refreshing report:', e);
    }
  };

  const approveMonth = async (month: number) => {
    if (!report) return;
    const monthName = MONTH_NAMES[month - 1];
    if (!confirm(`Approve commission for ${report.repName} — ${monthName} ${selectedYear}? This marks all qualifying invoices as commission paid.`)) return;
    
    setApprovingMonth(month);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/commissions/approve`, {
        repName: report.repName,
        year: selectedYear,
        month,
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      alert(`✓ Approved! ${res.data.invoicesUpdated} invoices marked as commission paid.`);
      await refreshReport();
    } catch (e) {
      console.error('Error approving:', e);
      alert('Failed to approve commission');
    } finally {
      setApprovingMonth(null);
    }
  };

  const unapproveMonth = async (month: number) => {
    if (!report) return;
    const monthName = MONTH_NAMES[month - 1];
    if (!confirm(`Undo approval for ${report.repName} — ${monthName} ${selectedYear}? This will revert commission paid status.`)) return;
    
    setApprovingMonth(month);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/commissions/unapprove`, {
        repName: report.repName,
        year: selectedYear,
        month,
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      alert(`↩ Reverted! ${res.data.invoicesUpdated} invoices unmarked.`);
      await refreshReport();
    } catch (e) {
      console.error('Error unapproving:', e);
      alert('Failed to unapprove commission');
    } finally {
      setApprovingMonth(null);
    }
  };

  // Drill-down: fetch invoices for a month
  const toggleMonthDrill = async (month: number) => {
    if (expandedMonth === month) {
      setExpandedMonth(null);
      setDrillInvoices([]);
      return;
    }
    setExpandedMonth(month);
    setExpandedCustomer(null);
    setLoadingDrill(true);
    try {
      const token = localStorage.getItem('token');
      const params: Record<string, string> = { year: selectedYear, month: String(month) };
      if (report) params.repName = report.repName;
      const res = await axios.get(`${API_URL}/api/commissions/invoices`, {
        headers: { Authorization: `Bearer ${token}` }, params,
      });
      setDrillInvoices(res.data.invoices || []);
    } catch (e) {
      console.error('Error fetching drill invoices:', e);
    } finally {
      setLoadingDrill(false);
    }
  };

  // Drill-down: fetch invoices for a customer
  const toggleCustomerDrill = async (customerName: string) => {
    if (expandedCustomer === customerName) {
      setExpandedCustomer(null);
      setDrillInvoices([]);
      return;
    }
    setExpandedCustomer(customerName);
    setExpandedMonth(null);
    setLoadingDrill(true);
    try {
      const token = localStorage.getItem('token');
      const params: Record<string, string> = {
        year: selectedYear,
        customer: customerName,
        repName: report?.repName || '',
      };
      if (selectedMonth !== 'all') params.month = selectedMonth;
      const res = await axios.get(`${API_URL}/api/commissions/invoices`, {
        headers: { Authorization: `Bearer ${token}` }, params,
      });
      setDrillInvoices(res.data.invoices || []);
    } catch (e) {
      console.error('Error fetching customer invoices:', e);
    } finally {
      setLoadingDrill(false);
    }
  };

  // Invoice preview
  const handlePreview = (invoiceNumber: string) => {
    setPreviewModal({ isOpen: true, invoiceNumber, loading: true });
  };
  const handleClosePreview = () => {
    setPreviewModal({ isOpen: false, invoiceNumber: '', loading: false });
  };

  // Print
  const handlePrint = async (invoiceNumber: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/invoices/${invoiceNumber}/pdf`, {
        headers: { Authorization: `Bearer ${token}` }, responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) printWindow.onload = () => printWindow.print();
    } catch (_e) {
      alert('Failed to print invoice.');
    }
  };

  // Download PDF
  const handleDownload = async (invoiceNumber: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/invoices/${invoiceNumber}/pdf`, {
        headers: { Authorization: `Bearer ${token}` }, responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${invoiceNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (_e) {
      alert('Failed to download PDF.');
    }
  };

  // Email
  const handleEmail = (invoiceNumber: string) => {
    setEmailModal({ isOpen: true, invoiceNumber, email: '', sending: false });
  };
  const handleSendEmail = async () => {
    const { invoiceNumber, email } = emailModal;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setNotification({ show: true, message: 'Please enter a valid email', type: 'error' });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
      return;
    }
    setEmailModal(prev => ({ ...prev, sending: true }));
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/invoices/${invoiceNumber}/email`,
        { recipientEmail: email },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEmailModal({ isOpen: false, invoiceNumber: '', email: '', sending: false });
      setNotification({ show: true, message: 'Invoice sent successfully!', type: 'success' });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
    } catch (_e) {
      setEmailModal(prev => ({ ...prev, sending: false }));
      setNotification({ show: true, message: 'Failed to send email', type: 'error' });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
    }
  };

  // Reusable invoice sub-table for drill-downs
  const renderInvoiceTable = (invoices: DrillInvoice[]) => (
    <table className="w-full table-auto">
      <thead>
        <tr className="bg-gray-50 dark:bg-meta-4/50">
          <th className="px-3 py-2 text-xs font-medium text-body text-left">Invoice #</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-left">Customer</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-left">Date</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-right">Total</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-right">Commission</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-center">Comm. Status</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-center">Actions</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.invoiceNumber} className="border-b border-stroke/50 dark:border-strokedark/50 hover:bg-gray-50 dark:hover:bg-meta-4/30">
            <td className="px-3 py-2.5 text-xs font-medium text-primary">{inv.invoiceNumber}</td>
            <td className="px-3 py-2.5 text-xs text-black dark:text-white truncate max-w-[160px]">{inv.customerName}</td>
            <td className="px-3 py-2.5 text-xs text-body">{new Date(inv.date).toLocaleDateString('en-CA')}</td>
            <td className="px-3 py-2.5 text-xs text-right text-body">{formatCurrency(inv.total)}</td>
            <td className="px-3 py-2.5 text-xs text-right font-medium text-black dark:text-white">{formatCurrency(inv.commission)}</td>
            <td className="px-3 py-2.5 text-center">
              {inv.commissionPaid ? (
                <span className="inline-flex rounded-full bg-success bg-opacity-10 px-1.5 py-0.5 text-[9px] font-bold text-success">PAID</span>
              ) : (
                <span className="inline-flex rounded-full bg-warning bg-opacity-10 px-1.5 py-0.5 text-[9px] font-bold text-warning">PENDING</span>
              )}
            </td>
            <td className="px-3 py-2.5">
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => handlePreview(inv.invoiceNumber)} className="text-primary hover:text-primary/70 transition" title="Preview">
                  <Eye className="h-4 w-4" />
                </button>
                <button onClick={() => handleDownload(inv.invoiceNumber)} className="text-success hover:text-success/70 transition" title="Download">
                  <Download className="h-4 w-4" />
                </button>
                <button onClick={() => handleEmail(inv.invoiceNumber)} className="text-body hover:text-primary transition" title="Email">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </button>
                <button onClick={() => handlePrint(inv.invoiceNumber)} className="text-body hover:text-primary transition" title="Print">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

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
    colors: report.months.map((_, i) => {
      const highlightMonth = selectedMonth !== 'all' ? parseInt(selectedMonth) - 1 : currentMonthIndex;
      return i === highlightMonth ? '#8B5CF6' : '#C4B5FD';
    }),
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

  // Compute display stats based on month filter
  const displayStats = (() => {
    if (selectedMonth === 'all') {
      return {
        commission: report.summary.ytd.commission,
        revenue: report.summary.ytd.revenue,
        invoices: report.summary.ytd.invoices,
        label: 'YTD',
      };
    }
    const m = report.months.find(m => m.month === parseInt(selectedMonth));
    return {
      commission: m?.paidCommission || 0,
      revenue: m?.paidRevenue || 0,
      invoices: m?.invoices || 0,
      label: MONTH_NAMES[parseInt(selectedMonth) - 1],
    };
  })();

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">
            Commission Report
          </h2>
          <p className="text-sm text-body">
            {report.repName} · {report.commissionRate}% rate · {selectedMonth !== 'all' ? `${MONTH_NAMES[parseInt(selectedMonth) - 1]} ` : ''}{selectedYear}
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

          {/* Month Selector */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded border border-stroke bg-transparent px-4 py-2 text-sm font-medium outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input"
          >
            <option value="all">All Months</option>
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>

          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="rounded border border-stroke bg-transparent px-4 py-2 text-sm font-medium outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input"
          >
            {[2026, 2025, 2024, 2023, 2022].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        {/* Period Commission */}
        <div className="rounded-sm border border-stroke bg-white px-6 py-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: '#8B5CF620' }}>
              <svg className="h-5 w-5" style={{ color: '#8B5CF6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <p className="text-sm font-medium text-body">{displayStats.label} Commission</p>
          </div>
          <h4 className="text-2xl font-bold text-black dark:text-white">
            {formatCurrency(displayStats.commission)}
          </h4>
          <p className="text-xs text-body mt-1">{displayStats.invoices} paid invoices</p>
        </div>

        {/* Period Revenue */}
        <div className="rounded-sm border border-stroke bg-white px-6 py-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: '#3B82F620' }}>
              <svg className="h-5 w-5" style={{ color: '#3B82F6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </span>
            <p className="text-sm font-medium text-body">{displayStats.label} Revenue</p>
          </div>
          <h4 className="text-2xl font-bold text-black dark:text-white">
            {formatCurrency(displayStats.revenue)}
          </h4>
          <p className="text-xs text-body mt-1">Paid invoices total</p>
        </div>

        {/* YTD Commission (always show for context) */}
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
                  {isAdmin && <th className="px-3 py-3 text-sm font-medium text-center text-black dark:text-white">Status</th>}
                </tr>
              </thead>
              <tbody>
                {report.months.map((m) => {
                  const isHighlighted = selectedMonth !== 'all'
                    ? m.month === parseInt(selectedMonth)
                    : m.month - 1 === currentMonthIndex && selectedYear === new Date().getFullYear().toString();
                  const isExpanded = expandedMonth === m.month;
                  return (
                  <React.Fragment key={m.month}>
                  <tr
                    className={`border-b border-stroke dark:border-strokedark cursor-pointer hover:bg-gray-50 dark:hover:bg-meta-4/30 transition ${
                      isHighlighted ? 'bg-[#8B5CF6] bg-opacity-5' : ''
                    } ${isExpanded ? 'bg-[#8B5CF6] bg-opacity-5' : ''}`}
                    onClick={() => m.paidCommission > 0 && toggleMonthDrill(m.month)}
                  >
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2">
                        {m.paidCommission > 0 && (
                          <svg className={`h-3.5 w-3.5 text-body transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        )}
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
                    {isAdmin && (
                      <td className="px-3 py-3.5 text-center">
                        {m.commissionQualifyingCount === 0 ? (
                          <span className="text-xs text-body">—</span>
                        ) : m.commissionPaidCount === m.commissionQualifyingCount ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-success bg-opacity-10 px-2.5 py-0.5 text-xs font-medium text-success">
                              ✓ Paid
                            </span>
                            <button
                              onClick={() => unapproveMonth(m.month)}
                              disabled={approvingMonth === m.month}
                              className="text-xs text-body hover:text-danger transition"
                              title="Undo approval"
                            >
                              ↩
                            </button>
                          </div>
                        ) : m.commissionPaidCount > 0 ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="inline-flex rounded-full bg-warning bg-opacity-10 px-2.5 py-0.5 text-xs font-medium text-warning">
                              {m.commissionPaidCount}/{m.commissionQualifyingCount}
                            </span>
                            <button
                              onClick={() => approveMonth(m.month)}
                              disabled={approvingMonth === m.month}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              {approvingMonth === m.month ? '...' : 'Approve rest'}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => approveMonth(m.month)}
                            disabled={approvingMonth === m.month}
                            className="inline-flex items-center gap-1 rounded-md border border-stroke px-3 py-1 text-xs font-medium text-body hover:bg-gray-50 hover:text-primary dark:border-strokedark dark:hover:bg-meta-4 transition disabled:opacity-50"
                          >
                            {approvingMonth === m.month ? (
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                            ) : (
                              'Approve'
                            )}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {/* Expanded invoice drill-down */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={isAdmin ? 5 : 4} className="p-0">
                        <div className="bg-[#8B5CF6] bg-opacity-[0.03] border-b border-[#8B5CF6] border-opacity-20 px-4 py-3">
                          {loadingDrill ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#8B5CF6] border-t-transparent"></div>
                              <span className="ml-2 text-xs text-body">Loading invoices...</span>
                            </div>
                          ) : drillInvoices.length === 0 ? (
                            <p className="text-xs text-body py-2">No qualifying invoices found</p>
                          ) : (
                            renderInvoiceTable(drillInvoices)
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })}
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
                  {isAdmin && <td></td>}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Commission by Customer */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <h3 className="text-lg font-semibold text-black dark:text-white">Commission by Customer</h3>
            <p className="text-sm text-body">Paid invoices only · {selectedMonth !== 'all' ? `${MONTH_NAMES[parseInt(selectedMonth) - 1]} ${selectedYear}` : `${selectedYear} YTD`} · Top 50</p>
          </div>
          <div className="p-6">
            {report.customers.length === 0 ? (
              <p className="text-sm text-body py-8 text-center">No paid commissions for this period</p>
            ) : (
              <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr className="bg-gray-2 text-left dark:bg-meta-4">
                      <th className="px-3 py-3 text-sm font-medium text-black dark:text-white">Customer</th>
                      <th className="px-3 py-3 text-sm font-medium text-right text-black dark:text-white">Revenue</th>
                      <th className="px-3 py-3 text-sm font-medium text-right text-black dark:text-white">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.customers.map((customer, idx) => {
                      const isExpanded = expandedCustomer === customer.customerName;
                      return (
                      <React.Fragment key={customer.customerName}>
                      <tr
                        className={`border-b border-stroke dark:border-strokedark cursor-pointer hover:bg-gray-50 dark:hover:bg-meta-4/30 transition ${isExpanded ? 'bg-[#8B5CF6] bg-opacity-5' : ''}`}
                        onClick={() => toggleCustomerDrill(customer.customerName)}
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <svg className={`h-3.5 w-3.5 text-body transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-2 dark:bg-meta-4 text-xs font-bold text-body flex-shrink-0">
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
                      {/* Expanded invoice drill-down */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={3} className="p-0">
                            <div className="bg-[#8B5CF6] bg-opacity-[0.03] border-b border-[#8B5CF6] border-opacity-20 px-4 py-3">
                              {loadingDrill ? (
                                <div className="flex items-center justify-center py-4">
                                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#8B5CF6] border-t-transparent"></div>
                                  <span className="ml-2 text-xs text-body">Loading invoices...</span>
                                </div>
                              ) : drillInvoices.length === 0 ? (
                                <p className="text-xs text-body py-2">No qualifying invoices found</p>
                              ) : (
                                renderInvoiceTable(drillInvoices)
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleClosePreview}>
          <div className="bg-white dark:bg-boxdark rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-stroke dark:border-strokedark">
              <h3 className="text-lg font-semibold text-black dark:text-white">Invoice {previewModal.invoiceNumber}</h3>
              <div className="flex items-center gap-3">
                <button onClick={() => handlePrint(previewModal.invoiceNumber)} className="inline-flex items-center gap-1.5 rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                  Print
                </button>
                <button onClick={() => handleDownload(previewModal.invoiceNumber)} className="inline-flex items-center gap-1.5 rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4">
                  <Download className="h-4 w-4" />
                  Download
                </button>
                <button onClick={() => handleEmail(previewModal.invoiceNumber)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Email
                </button>
                <button onClick={handleClosePreview} className="text-black dark:text-white hover:text-primary transition">
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            <div className="relative overflow-auto" style={{ height: 'calc(90vh - 80px)' }}>
              {previewModal.loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-boxdark">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
                </div>
              )}
              <iframe
                src={`${API_URL}/api/invoices/${previewModal.invoiceNumber}/preview?token=${localStorage.getItem('token')}`}
                className="w-full border-0"
                style={{ minHeight: '600px', height: 'calc(90vh - 80px)' }}
                title="Invoice Preview"
                onLoad={() => setPreviewModal(prev => ({ ...prev, loading: false }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {emailModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => !emailModal.sending && setEmailModal({ isOpen: false, invoiceNumber: '', email: '', sending: false })}>
          <div className="bg-white dark:bg-boxdark rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-stroke dark:border-strokedark">
              <div>
                <h3 className="text-lg font-bold text-black dark:text-white">Email Invoice</h3>
                <p className="text-sm text-body">{emailModal.invoiceNumber}</p>
              </div>
              <button onClick={() => !emailModal.sending && setEmailModal({ isOpen: false, invoiceNumber: '', email: '', sending: false })} className="text-black dark:text-white hover:text-primary transition">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <label className="mb-3 block text-sm font-medium text-black dark:text-white">Recipient Email</label>
              <input
                type="email"
                value={emailModal.email}
                onChange={(e) => setEmailModal(prev => ({ ...prev, email: e.target.value }))}
                placeholder="example@email.com"
                disabled={emailModal.sending}
                className="w-full rounded-lg border border-stroke bg-transparent py-3 px-5 text-black outline-none transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white"
                onKeyDown={(e) => { if (e.key === 'Enter' && !emailModal.sending) handleSendEmail(); }}
              />
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-stroke dark:border-strokedark">
              <button onClick={() => setEmailModal({ isOpen: false, invoiceNumber: '', email: '', sending: false })} disabled={emailModal.sending} className="rounded-md border border-stroke px-6 py-2.5 text-sm font-medium text-black dark:border-strokedark dark:text-white disabled:opacity-50">Cancel</button>
              <button onClick={handleSendEmail} disabled={emailModal.sending} className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
                {emailModal.sending ? (<><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>Sending...</>) : (<>Send Email</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification.show && (
        <div className="fixed top-4 right-4 z-50">
          <div className={`flex items-center gap-3 rounded-lg px-6 py-4 shadow-lg ${notification.type === 'success' ? 'bg-success text-white' : 'bg-danger text-white'}`}>
            <p className="font-medium">{notification.message}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionReport;
