import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { Eye, Download, X } from 'lucide-react';
import { formatDateOnly } from '../utils/date';
import PayStubModal, { PayStubData } from '../components/PayStubModal';

const API_URL = import.meta.env.VITE_API_URL;

interface DrillInvoice {
  invoiceNumber: string;
  customerName: string;
  date: string;
  total: number;
  commission: number;
  status: string;
  commissionPaid: boolean;
  commissionStatus: string | null;
  commissionPayableDate: string | null;
  hardwareAmount: number;
  saasAmount: number;
  subscriptionActivationDate: string | null;
  paidDate: string | null;
  approvalStatus: 'pending' | 'approved' | 'paid' | 'rejected';
  approvedBy: string | null;
  approvedAt: string | null;
  payoutPaidBy: string | null;
  payoutPaidAt: string | null;
}

// Map commission_status → { i18n key, color classes }
const COMMISSION_STATUS_STYLES: Record<string, { key: string; cls: string }> = {
  hardware:         { key: 'commissionReport.csHardware',       cls: 'bg-primary bg-opacity-10 text-primary' },
  saas_first:       { key: 'commissionReport.csSaasFirst',      cls: 'bg-success bg-opacity-10 text-success' },
  saas_annual:      { key: 'commissionReport.csSaasAnnual',     cls: 'bg-success bg-opacity-10 text-success' },
  saas_renewal:     { key: 'commissionReport.csSaasRenewal',    cls: 'bg-gray-200 text-body dark:bg-meta-4' },
  pending_saas:     { key: 'commissionReport.csPendingSaas',    cls: 'bg-warning bg-opacity-10 text-warning' },
  pending_payment:  { key: 'commissionReport.csPendingPayment', cls: 'bg-warning bg-opacity-10 text-warning' },
  too_late:         { key: 'commissionReport.csTooLate',        cls: 'bg-danger bg-opacity-10 text-danger' },
  quota_not_met:    { key: 'commissionReport.csQuotaNotMet',    cls: 'bg-danger bg-opacity-10 text-danger' },
  not_eligible:     { key: 'commissionReport.csNotEligible',    cls: 'bg-gray-200 text-body dark:bg-meta-4' },
};

interface MonthData {
  month: number;
  invoices: number;
  revenue: number;
  commission: number;
  paidCommission: number;
  paidRevenue: number;
  commissionPaidCount: number;
  commissionApprovedCount: number;
  commissionQualifyingCount: number;
  approvedCommission: number;
}

interface MonthPoints {
  month: number;
  crmPoints: number;
  zentactPoints: number;
  zentactActivations: number;
  zentactBonus: number;
  totalPoints: number;
  quotaMet: boolean;
  monthlyBonus: number;
}

interface AnnualPoints {
  totalPoints: number;
  crmPoints: number;
  zentactPoints: number;
  zentactBonus: number;
  annualBonus: number;
  nextTier: { points: number; bonus: number } | null;
  ptsToNextTier: number;
  tiers: { points: number; bonus: number }[];
}

interface PointsAnnualData {
  repName: string;
  year: number;
  months: MonthPoints[];
  annual: AnnualPoints;
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
  baseSalary?: number;
  year: string;
  months: MonthData[];
  customers: CustomerData[];
  summary: {
    currentMonth: { commission: number; revenue: number; invoices: number };
    ytd: { commission: number; revenue: number; invoices: number };
    pending?: { count: number; commission: number };
  };
  groupBy?: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTHLY_QUOTA = 15;

const CommissionReport = () => {
  const { t, i18n } = useTranslation();
  useAuth();
  const [report, setReport] = useState<ReportData | null>(null);
  const [pointsData, setPointsData] = useState<PointsAnnualData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  // Default to the current month (1-12) so users land on what matters now.
  // Year defaults match — if user changes the year to a past one, they can
  // switch to 'All Months' manually for an annual view.
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  // Restore the last viewed rep so the FIRST report fetch already targets them.
  // Without this, an admin's initial fetch returns their own (empty) report, the
  // banner/cards flash $0, then the rep auto-select triggers a second fetch.
  const [selectedRep, setSelectedRep] = useState(() => localStorage.getItem('commissionReport.selectedRep') || '');
  const [salespeople, setSalespeople] = useState<string[]>([]);
  // Years hidden by the admin (Admin → Import Commissions) — dropped from the year dropdown.
  const [disabledYears, setDisabledYears] = useState<number[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSalesperson, setIsSalesperson] = useState(false);
  const [perms, setPerms] = useState<string[]>([]);
  const canApprove = isAdmin || perms.includes('*') || perms.includes('report:approve');
  const canMarkPaid = isAdmin || perms.includes('*') || perms.includes('report:mark_paid');
  const canViewPaystub = isAdmin || perms.includes('*') || perms.includes('report:view_paystub');
  // Rep-facing pay stub (Étape 3): app-generated or sourced from a historical import.
  const [payStub, setPayStub] = useState<PayStubData | null>(null);
  const [loadingStub, setLoadingStub] = useState(false);
  const [committingStub, setCommittingStub] = useState(false);
  const [approvingMonth, setApprovingMonth] = useState<number | null>(null);
  const [markingPaidMonth, setMarkingPaidMonth] = useState<number | null>(null);

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
  // "Missing commission" report modal (rep-facing)
  const [missingModal, setMissingModal] = useState<{ open: boolean; invoiceNumber: string; message: string; sending: boolean }>({
    open: false, invoiceNumber: '', message: '', sending: false,
  });

  const submitMissing = async () => {
    if (!missingModal.message.trim()) return;
    setMissingModal(m => ({ ...m, sending: true }));
    try {
      const token = localStorage.getItem('token');
      const period = selectedMonth === 'all' ? selectedYear : `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      await axios.post(`${API_URL}/api/commissions/missing-report`,
        { invoiceNumber: missingModal.invoiceNumber, period, message: missingModal.message },
        { headers: { Authorization: `Bearer ${token}` } });
      setMissingModal({ open: false, invoiceNumber: '', message: '', sending: false });
      setNotification({ show: true, type: 'success', message: t('commissionReport.missing.sent') as string });
    } catch (e: any) {
      setMissingModal(m => ({ ...m, sending: false }));
      alert(e?.response?.data?.error || 'Failed to send');
    }
  };

  // Check admin status + load effective permissions
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    // isAdmin/permissions come from /api/auth/verify, which reflects the EFFECTIVE
    // identity (impersonation downgrades to isAdmin=false). Do NOT trust the raw JWT's
    // isAdmin here — it stays true while impersonating and would expose the admin
    // rep-selector + other reps' reports. See impersonation middleware.
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/api/auth/verify`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setIsAdmin(!!res.data?.user?.isAdmin);
        if (Array.isArray(res.data?.user?.permissions)) setPerms(res.data.user.permissions);
        else if (Array.isArray(res.data?.permissions)) setPerms(res.data.permissions);
        setIsSalesperson(!!res.data?.user?.isSalesperson);
      } catch (_e) { /* leave isAdmin=false on failure (least privilege) */ }
    })();
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/api/settings/report-years`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const years: number[] = Array.isArray(res.data?.disabledYears) ? res.data.disabledYears : [];
        setDisabledYears(years);
        // If the selected year just became hidden, fall back to the newest visible one.
        setSelectedYear(prev => {
          if (!years.includes(parseInt(prev, 10))) return prev;
          for (let y = new Date().getFullYear(); y >= 2025; y--) {
            if (!years.includes(y)) return String(y);
          }
          return prev;
        });
      } catch (_e) { /* on failure, show all years */ }
    })();
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
        const reps: string[] = res.data.salespeople || [];
        setSalespeople(reps);
        // If admin is not themselves a salesperson, auto-select the first one
        // (otherwise the default empty selection falls back to admin's own name,
        // which produces an empty report since they have no commissions).
        // A restored selection that no longer exists in the list falls back too.
        if (!isSalesperson && reps.length > 0 && (!selectedRep || !reps.includes(selectedRep))) {
          setSelectedRep(reps[0]);
        }
      } catch (e) {
        console.error('Error fetching salespeople:', e);
      }
    };
    fetchReps();
  }, [isAdmin, isSalesperson]);

  // Remember the selected rep for the next visit (instant correct first fetch).
  useEffect(() => {
    if (selectedRep) localStorage.setItem('commissionReport.selectedRep', selectedRep);
  }, [selectedRep]);

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

  // Fetch points/bonus data whenever repName or year changes
  useEffect(() => {
    if (!report?.repName) return;
    const fetchPoints = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/api/crm/points/annual`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { year: selectedYear, repName: report.repName },
        });
        setPointsData(res.data);
      } catch (e) {
        console.error('Error fetching points annual data:', e);
        setPointsData(null);
      }
    };
    fetchPoints();
  }, [report?.repName, selectedYear]);

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

  const markPaidMonth = async (month: number) => {
    if (!report) return;
    const monthName = MONTH_NAMES[month - 1];
    if (!confirm(`Mark approved commissions as paid for ${report.repName} — ${monthName} ${selectedYear}? This records the final payout.`)) return;

    setMarkingPaidMonth(month);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/commissions/mark-paid`, {
        repName: report.repName,
        year: selectedYear,
        month,
      }, { headers: { Authorization: `Bearer ${token}` } });

      alert(`✓ Marked paid! ${res.data.invoicesUpdated} invoices.`);
      await refreshReport();
    } catch (e) {
      console.error('Error marking paid:', e);
      alert('Failed to mark commissions as paid');
    } finally {
      setMarkingPaidMonth(null);
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

  // Open the pay stub for the selected rep + month. The backend picks the source:
  // a historical import if one exists for that period, else the app-generated stub.
  const openPayStub = async () => {
    if (selectedMonth === 'all') return;
    setLoadingStub(true);
    try {
      const token = localStorage.getItem('token');
      const params: Record<string, string> = { year: selectedYear, month: selectedMonth };
      if (selectedRep) params.repName = selectedRep;
      const res = await axios.get(`${API_URL}/api/commissions/pay-stub`, {
        headers: { Authorization: `Bearer ${token}` }, params,
      });
      const d = res.data;
      // Hide the synthetic 'app-generated:…' filename from the subtitle.
      const subtitle = d.filename && !String(d.filename).startsWith('app-generated') ? d.filename : undefined;
      setPayStub({
        repName:     d.repName,
        period:      d.period,
        subtitle,
        lines:       d.lines || [],
        bonuses:     d.bonuses || [],
        total:       d.total || 0,
        source:      d.source,
        linesStored: d.linesStored,
        missed:      d.missed || [],
        missedTotal: d.missedTotal || 0,
        quota:       d.quota || null,
      });
    } catch (e) {
      console.error('Error loading pay stub:', e);
      alert('Failed to load pay stub');
    } finally {
      setLoadingStub(false);
    }
  };

  // Per-month quota override (plan v7.7): pay this rep's month despite the missed quota.
  // The backend kicks a recalc — the restored commissions appear after ~2 minutes.
  const waiveQuota = async (waived: boolean) => {
    if (!payStub || selectedMonth === 'all') return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/commissions/quota-waiver`, {
        repName: payStub.repName, year: selectedYear, month: selectedMonth, waived,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setPayStub(null);
      setNotification({ show: true, type: 'success', message: t('commissionReport.payStub.quotaWaiveStarted') as string });
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to update quota waiver');
    }
  };

  // Commit an app-generated stub: mark the period's unlocked-but-unpaid commissions as paid
  // and record the stub. Admin / report:mark_paid only (button only wired for them).
  const commitPayStub = async () => {
    if (!payStub || payStub.source !== 'generated' || selectedMonth === 'all') return;
    const monthName = MONTH_NAMES[parseInt(selectedMonth) - 1];
    if (!confirm(`Mark ${payStub.repName} — ${monthName} ${selectedYear} paid? This marks the period's unlocked commissions as paid and records the pay stub.`)) return;
    setCommittingStub(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/commissions/pay-stub/commit`, {
        repName: payStub.repName,
        year: selectedYear,
        month: selectedMonth,
      }, { headers: { Authorization: `Bearer ${token}` } });
      alert(t('commissionReport.payStub.committedToPayroll', { count: res.data.invoicesMarked, month: `${monthName} ${selectedYear}` }));
      await openPayStub();     // re-open → now an 'imported' (app-generated) stub
      await refreshReport();   // reflect new paid status in the report
    } catch (e: any) {
      console.error('Error committing pay stub:', e);
      alert(e?.response?.data?.error || 'Failed to commit pay stub');
    } finally {
      setCommittingStub(false);
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
      setNotification({ show: true, message: `Invoice ${invoiceNumber} sent to ${email}`, type: 'success' });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 4000);
    } catch (e: any) {
      setEmailModal(prev => ({ ...prev, sending: false }));
      const msg = e?.response?.data?.error || e?.response?.data?.details || 'Failed to send email';
      setNotification({ show: true, message: String(msg), type: 'error' });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 5000);
    }
  };

  // Reusable invoice sub-table for drill-downs
  const renderInvoiceTable = (invoices: DrillInvoice[]) => (
    <table className="w-full table-auto">
      <thead>
        <tr className="bg-gray-50 dark:bg-meta-4/50">
          <th className="px-3 py-2 text-xs font-medium text-body text-left">{t('commissionReport.invoiceNumber')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-left">{t('commissionReport.customer')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-left">{t('commissionReport.date')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-left">{t('commissionReport.unlockMonth')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-center">{t('commissionReport.type')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-right">{t('commissionReport.total')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-right">{t('commissionReport.commission')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-center">{t('commissionReport.commStatus')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-center">Actions</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => {
          const cs = inv.commissionStatus && COMMISSION_STATUS_STYLES[inv.commissionStatus];
          return (
          <tr key={inv.invoiceNumber} className="border-b border-stroke/50 dark:border-strokedark/50 hover:bg-gray-50 dark:hover:bg-meta-4/30">
            <td className="px-3 py-2.5 text-xs font-medium text-primary">{inv.invoiceNumber}</td>
            <td className="px-3 py-2.5 text-xs text-black dark:text-white truncate max-w-[160px]">{inv.customerName}</td>
            <td className="px-3 py-2.5 text-xs text-body">{formatDateOnly(inv.date, i18n.language)}</td>
            <td className="px-3 py-2.5 text-xs text-body">
              {inv.commissionPayableDate ? formatDateOnly(inv.commissionPayableDate, i18n.language) : '—'}
            </td>
            <td className="px-3 py-2.5 text-center">
              {cs ? (
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${cs.cls}`}>
                  {t(cs.key)}
                </span>
              ) : <span className="text-xs text-body">—</span>}
            </td>
            <td className="px-3 py-2.5 text-xs text-right text-body">{formatCurrency(inv.total)}</td>
            <td className="px-3 py-2.5 text-xs text-right font-medium text-black dark:text-white">{formatCurrency(inv.commission)}</td>
            <td className="px-3 py-2.5 text-center">
              {inv.approvalStatus === 'paid' ? (
                <span className="inline-flex rounded-full bg-success bg-opacity-10 px-1.5 py-0.5 text-[9px] font-bold text-success" title={inv.payoutPaidAt ? `Paid ${formatDateOnly(inv.payoutPaidAt, i18n.language)}` : ''}>PAID</span>
              ) : inv.approvalStatus === 'approved' ? (
                <span className="inline-flex rounded-full bg-primary bg-opacity-10 px-1.5 py-0.5 text-[9px] font-bold text-primary" title={inv.approvedAt ? `Approved ${formatDateOnly(inv.approvedAt, i18n.language)}` : ''}>APPROVED</span>
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
          );
        })}
      </tbody>
    </table>
  );

  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const currentMonthIndex = new Date().getMonth();

  // Locale-aware short month names
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(new Date(2000, i, 1))
  );

  // Look up points for a given month number (1-based)
  const getMonthPoints = (month: number): MonthPoints | null =>
    pointsData?.months.find(m => m.month === month) || null;

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
    data: report.months.map(m => m.commission),
  }];

  // Compute display stats based on month filter
  const displayStats = (() => {
    if (selectedMonth === 'all') {
      return {
        commission: report.summary.ytd.commission,
        revenue: report.summary.ytd.revenue,
        invoices: report.summary.ytd.invoices,
        label: t('commissionReport.ytd'),
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
          {/* Missing commission — discreet link (any rep viewing their own report can flag a gap) */}
          <button
            onClick={() => setMissingModal({ open: true, invoiceNumber: '', message: '', sending: false })}
            className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-body transition hover:text-primary"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z" />
            </svg>
            {t('commissionReport.missing.button')}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Rep Selector (Admin only) */}
          {isAdmin && salespeople.length > 0 && (
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="rounded border border-stroke bg-transparent px-4 py-2 text-sm font-medium outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input"
            >
              {isSalesperson && <option value="">{t('commissionReport.myReport')}</option>}
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
            {/* Data starts Jan 2025 — list current year down to 2025, minus admin-disabled years */}
            {Array.from({ length: new Date().getFullYear() - 2024 }, (_, i) => new Date().getFullYear() - i)
              .filter(y => !disabledYears.includes(y))
              .map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
          </select>

          {/* Pay Stub — per month; disabled on "All Months" */}
          {canViewPaystub && (
            <button
              onClick={openPayStub}
              disabled={selectedMonth === 'all' || loadingStub}
              title={selectedMonth === 'all' ? (t('commissionReport.payStub.open') as string) : undefined}
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded border border-primary bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingStub ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" />
                </svg>
              )}
              {t('commissionReport.payStub.open')}
            </button>
          )}

        </div>
      </div>

      {/* Missing-commission modal */}
      {missingModal.open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => !missingModal.sending && setMissingModal(m => ({ ...m, open: false }))}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-semibold text-black dark:text-white">{t('commissionReport.missing.title')}</h3>
            <p className="mb-4 text-sm text-body">{t('commissionReport.missing.subtitle')}</p>
            <label className="mb-1 block text-xs font-medium text-body">{t('commissionReport.missing.invoiceLabel')}</label>
            <input
              type="text"
              value={missingModal.invoiceNumber}
              onChange={(e) => setMissingModal(m => ({ ...m, invoiceNumber: e.target.value }))}
              placeholder="INV-012345"
              className="mb-3 w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
            />
            <label className="mb-1 block text-xs font-medium text-body">{t('commissionReport.missing.messageLabel')}</label>
            <textarea
              value={missingModal.message}
              onChange={(e) => setMissingModal(m => ({ ...m, message: e.target.value }))}
              rows={4}
              placeholder={t('commissionReport.missing.messagePlaceholder') as string}
              className="mb-4 w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setMissingModal(m => ({ ...m, open: false }))} disabled={missingModal.sending}
                className="rounded-md border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-50 disabled:opacity-50 dark:border-strokedark">
                {t('common.cancel')}
              </button>
              <button onClick={submitMissing} disabled={missingModal.sending || !missingModal.message.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
                {missingModal.sending ? t('commissionReport.missing.sending') : t('commissionReport.missing.send')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Stub modal (shared component) */}
      <PayStubModal
        data={payStub}
        onClose={() => setPayStub(null)}
        onCommit={canMarkPaid ? commitPayStub : undefined}
        committing={committingStub}
        showAppCalc={canMarkPaid}
        onQuotaWaive={canMarkPaid ? waiveQuota : undefined}
        onAdjusted={canMarkPaid ? refreshReport : undefined}
      />

      {/* Total Compensation — EARNED TO DATE: base salary accrued by pay period (26 bi-weekly
          periods/year, completed 14-day periods since Jan 1) + YTD commission + bonuses.
          The salary card shows both the earned amount and the full annual reference. */}
      {(() => {
        const PAY_PERIODS = 26;
        const annualSalary = report.baseSalary || 0;
        const now = new Date();
        const yearNum = parseInt(selectedYear);
        const daysElapsed = Math.floor((now.getTime() - new Date(yearNum, 0, 1).getTime()) / 86400000);
        const periodsElapsed = yearNum < now.getFullYear() ? PAY_PERIODS
          : yearNum > now.getFullYear() ? 0
          : Math.min(PAY_PERIODS, Math.max(0, Math.floor(daysElapsed / 14)));
        const pct = Math.round((periodsElapsed / PAY_PERIODS) * 100);
        const baseSalaryEarned = annualSalary * (periodsElapsed / PAY_PERIODS);
        const ytdComm = report.summary.ytd.commission || 0;
        const annualBonus = pointsData?.annual?.annualBonus || 0;
        const signupPay = pointsData?.annual?.zentactBonus || 0;
        const totalComp = baseSalaryEarned + ytdComm + annualBonus + signupPay;
        const part = (label: string, value: number) => (
          <div>
            <p className="whitespace-nowrap text-xs text-body">{label}</p>
            <p className="mt-0.5 whitespace-nowrap text-lg font-semibold text-black dark:text-white">{formatCurrency(value)}</p>
          </div>
        );
        const op = (sym: string) => (
          <span className="hidden select-none text-xl font-light text-bodydark2 sm:block">{sym}</span>
        );
        return (
          <div className="mb-6 rounded-sm border border-stroke bg-white px-6 py-5 shadow-default dark:border-strokedark dark:bg-boxdark">
            <p className="mb-4 text-sm font-medium text-body">
              {t('commissionReport.totalComp')} ({selectedYear})
            </p>
            {/* Visual equation flowing left: salary + commission + bonus + signup = total.
                ONE wrap container — no justify-between, so no dead gap inside the equation;
                leftover space sits naturally after the total box. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-4">
                {/* Base salary — with its own pay-period progress (stacked to stay narrow) */}
                <div>
                  <p className="whitespace-nowrap text-xs text-body">{t('commissionReport.compBase')}</p>
                  <p className="mt-0.5 whitespace-nowrap text-lg font-semibold text-black dark:text-white">{formatCurrency(baseSalaryEarned)}</p>
                  <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-gray-200 dark:bg-meta-4">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 whitespace-nowrap text-[11px] text-body">
                    {t('commissionReport.payPeriodsProgress', { done: periodsElapsed, total: PAY_PERIODS, pct })}
                  </p>
                  <p className="whitespace-nowrap text-[11px] text-body">{t('commissionReport.compBaseOf', { amount: formatCurrency(annualSalary) })}</p>
                </div>
                {/* Each '+' is welded to its card so wrapping keeps "+ <card>" together */}
                <div className="flex items-center gap-x-3">{op('+')}{part(t('commissionReport.compCommission'), ytdComm)}</div>
                <div className="flex items-center gap-x-3">{op('+')}{part(t('commissionReport.compAnnualBonus'), annualBonus)}</div>
                <div className="flex items-center gap-x-3">{op('+')}{part(t('commissionReport.compSignup'), signupPay)}</div>
                {/* Total — '=' + result box, flows right after the components (no dead gap) */}
                <div className="flex shrink-0 items-center gap-3 lg:border-l lg:border-stroke lg:pl-5 lg:dark:border-strokedark">
                  {op('=')}
                  <div className="rounded-lg border border-primary border-opacity-25 bg-primary bg-opacity-[0.06] px-5 py-3">
                    <p className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-primary">{t('commissionReport.earnedToDate')}</p>
                    <p className="mt-0.5 whitespace-nowrap text-2xl font-bold text-black dark:text-white">{formatCurrency(totalComp)}</p>
                  </div>
                </div>
            </div>
            <p className="mt-3 text-[11px] italic text-body">{t('commissionReport.grossDisclaimer')}</p>
          </div>
        );
      })()}

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
            <p className="text-sm font-medium text-body">{displayStats.label} {t('commissionReport.commission')}</p>
          </div>
          <h4 className="text-2xl font-bold text-black dark:text-white">
            {formatCurrency(displayStats.commission)}
          </h4>
          <p className="text-xs text-body mt-1">{displayStats.invoices} {t('commissionReport.paidInvoices')}</p>
        </div>

        {/* Period Revenue */}
        <div className="rounded-sm border border-stroke bg-white px-6 py-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: '#3B82F620' }}>
              <svg className="h-5 w-5" style={{ color: '#3B82F6' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </span>
            <p className="text-sm font-medium text-body">{displayStats.label} {t('commissionReport.revenue')}</p>
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
            <p className="text-sm font-medium text-body">{t('commissionReport.ytdCommission')}</p>
          </div>
          <h4 className="text-2xl font-bold text-black dark:text-white">
            {formatCurrency(report.summary.ytd.commission)}
          </h4>
          <p className="text-xs text-body mt-1">{report.summary.ytd.invoices} {t('commissionReport.totalInvoices')}</p>
        </div>

        {/* Commission Rate */}
        <div className="rounded-sm border border-stroke bg-white px-6 py-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: '#F59E0B20' }}>
              <svg className="h-5 w-5" style={{ color: '#F59E0B' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
            </span>
            <p className="text-sm font-medium text-body">{t('commissionReport.commissionRate')}</p>
          </div>
          <h4 className="text-2xl font-bold text-black dark:text-white">
            {report.commissionRate}%
          </h4>
          <p className="text-xs text-body mt-1">{report.commissionRate !== 10 ? t('commissionReport.standardRate') : t('commissionReport.standardRate')}</p>
        </div>
      </div>

      {/* Points & Bonus Summary */}
      {pointsData && (
        <div className="mb-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-black dark:text-white">{t('commissionReport.pointsBonuses')}</h3>
              <p className="text-sm text-body">{t('commissionReport.pointsBonusesSubtitle')}</p>
            </div>
            {/* Annual bonus badge */}
            {pointsData.annual.annualBonus > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success bg-opacity-10 px-3 py-1 text-sm font-semibold text-success">
                🏆 {t('commissionReport.annualBonusEarned', { amount: pointsData.annual.annualBonus.toLocaleString() })}
              </span>
            )}
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

              {/* Left — selected month or current month points */}
              {(() => {
                const mNum = selectedMonth !== 'all' ? parseInt(selectedMonth) : new Date().getMonth() + 1;
                const mp = getMonthPoints(mNum);
                const label = monthNames[mNum - 1];
                return (
                  <div>
                    <p className="mb-3 text-sm font-semibold text-black dark:text-white">
                      {label} {selectedYear} — {t('commissionReport.monthlyPoints')}
                    </p>
                    <div className="flex flex-wrap gap-4">
                      {/* Points */}
                      <div className="flex-1 min-w-[100px] rounded-md border border-stroke p-4 dark:border-strokedark">
                        <p className="text-xs uppercase text-body font-medium mb-1">{t('commissionReport.totalPoints')}</p>
                        <p className="text-2xl font-bold text-black dark:text-white">{mp?.totalPoints ?? 0}</p>
                        {(mp?.zentactPoints ?? 0) > 0 && (
                          <p className="text-xs text-[#6366F1] mt-1">
                            {mp!.crmPoints} CRM + {mp!.zentactPoints} 💳
                          </p>
                        )}
                      </div>
                      {/* Quota */}
                      <div className="flex-1 min-w-[100px] rounded-md border border-stroke p-4 dark:border-strokedark">
                        <p className="text-xs uppercase text-body font-medium mb-1">{t('commissionReport.quota')}</p>
                        <div className="flex items-baseline gap-1">
                          <p className="text-2xl font-bold text-black dark:text-white">{mp?.totalPoints ?? 0}</p>
                          <p className="text-sm text-body">/ {MONTHLY_QUOTA}</p>
                        </div>
                        {mp?.quotaMet ? (
                          <p className="text-xs text-success font-semibold mt-1">✓ {t('commissionReport.quotaMet')}</p>
                        ) : (
                          <p className="text-xs text-danger mt-1">{MONTHLY_QUOTA - (mp?.totalPoints ?? 0)} {t('commissionReport.ptsNeeded')}</p>
                        )}
                      </div>
                      {/* Monthly bonus */}
                      <div className="flex-1 min-w-[100px] rounded-md border border-stroke p-4 dark:border-strokedark">
                        <p className="text-xs uppercase text-body font-medium mb-1">{t('commissionReport.monthlyBonus')}</p>
                        <p className={`text-2xl font-bold ${(mp?.monthlyBonus ?? 0) > 0 ? 'text-success' : 'text-black dark:text-white'}`}>
                          ${(mp?.monthlyBonus ?? 0).toLocaleString()}
                        </p>
                        {(mp?.zentactBonus ?? 0) > 0 && (
                          <p className="text-xs text-[#6366F1] mt-1">+${mp!.zentactBonus.toLocaleString()} {t('commissionReport.zentactBonus')}</p>
                        )}
                      </div>
                    </div>
                    {/* Quota progress bar */}
                    {mp && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-body">{t('commissionReport.quotaProgress')}</span>
                          <span className="text-xs font-medium text-black dark:text-white">
                            {Math.min(100, Math.round((mp.totalPoints / MONTHLY_QUOTA) * 100))}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-meta-4">
                          <div
                            className={`h-2 rounded-full transition-all ${mp.quotaMet ? 'bg-success' : mp.totalPoints >= 10 ? 'bg-warning' : 'bg-danger'}`}
                            style={{ width: `${Math.min(100, (mp.totalPoints / MONTHLY_QUOTA) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Right — annual bonus progress */}
              <div>
                <p className="mb-3 text-sm font-semibold text-black dark:text-white">
                  {t('commissionReport.annualBonusProgress')} ({selectedYear})
                </p>
                <div className="flex flex-wrap gap-4 mb-4">
                  <div className="flex-1 min-w-[100px] rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs uppercase text-body font-medium mb-1">{t('commissionReport.ytdPoints')}</p>
                    <p className="text-2xl font-bold text-black dark:text-white">{pointsData.annual.totalPoints}</p>
                    {pointsData.annual.zentactPoints > 0 && (
                      <p className="text-xs text-[#6366F1] mt-1">incl. {pointsData.annual.zentactPoints} 💳</p>
                    )}
                  </div>
                  <div className="flex-1 min-w-[100px] rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs uppercase text-body font-medium mb-1">{t('commissionReport.annualBonus')}</p>
                    <p className={`text-2xl font-bold ${pointsData.annual.annualBonus > 0 ? 'text-success' : 'text-black dark:text-white'}`}>
                      ${pointsData.annual.annualBonus.toLocaleString()}
                    </p>
                  </div>
                  {pointsData.annual.zentactBonus > 0 && (
                    <div className="flex-1 min-w-[100px] rounded-md border border-stroke p-4 dark:border-strokedark">
                      <p className="text-xs uppercase text-body font-medium mb-1">{t('commissionReport.zentactBonusYtd')}</p>
                      <p className="text-2xl font-bold text-[#6366F1]">${pointsData.annual.zentactBonus.toLocaleString()}</p>
                    </div>
                  )}
                </div>
                {/* Annual tier ladder */}
                <div className="space-y-2">
                  {pointsData.annual.tiers.map(tier => {
                    const reached = pointsData.annual.totalPoints >= tier.points;
                    const pct = Math.min(100, Math.round((pointsData.annual.totalPoints / tier.points) * 100));
                    return (
                      <div key={tier.points} className={`rounded-md border p-3 ${reached ? 'border-success bg-success bg-opacity-5' : 'border-stroke dark:border-strokedark'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-semibold ${reached ? 'text-success' : 'text-body'}`}>
                            {reached ? '✓' : ''} {tier.points} {t('commissionReport.pts')} → ${tier.bonus.toLocaleString()}
                          </span>
                          <span className="text-xs text-body">{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-meta-4">
                          <div
                            className={`h-1.5 rounded-full ${reached ? 'bg-success' : 'bg-[#8B5CF6]'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {pointsData.annual.nextTier && !pointsData.annual.annualBonus && (
                  <p className="mt-3 text-xs text-body">
                    {t('commissionReport.ptsToNextTier', {
                      count: pointsData.annual.ptsToNextTier,
                      amount: pointsData.annual.nextTier.bonus.toLocaleString(),
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Commissions */}
      {report.summary.pending && report.summary.pending.commission > 0 && (
        <div className="mb-6 rounded-sm border border-warning border-opacity-40 bg-warning bg-opacity-5 px-6 py-5 dark:bg-warning dark:bg-opacity-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-warning bg-opacity-15">
                <svg className="h-5 w-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <div>
                <h4 className="text-base font-semibold text-black dark:text-white">{t('commissionReport.pendingTitle')}</h4>
                <p className="text-xs text-body">{t('commissionReport.pendingSubtitle')} — {t('commissionReport.pendingHelp')}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-warning">{formatCurrency(report.summary.pending.commission)}</p>
              <p className="text-xs text-body">{report.summary.pending.count} {t('commissionReport.invoiceCount').toLowerCase()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Commission Chart */}
      <div className="mb-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{t('commissionReport.monthlyCommission')}</h3>
          <p className="text-sm text-body">{t('commissionReport.monthlyCommissionByUnlock')}</p>
        </div>
        <div className="p-6">
          <ReactApexChart options={chartOptions} series={chartSeries} type="bar" height={320} />
        </div>
      </div>

      {/* Monthly Table + Top Customers — full width stacked (the breakdown + its expandable
          invoice detail is too wide for a half-width column) */}
      <div className="grid grid-cols-1 gap-6 min-w-0">
        {/* Monthly Breakdown Table */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark min-w-0 overflow-hidden">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <h3 className="text-lg font-semibold text-black dark:text-white">{t('commissionReport.monthlyBreakdown')}</h3>
          </div>
          <div className="p-6 overflow-x-auto">
            <table className="w-full table-fixed">
              <thead>
                <tr className="border-b-2 border-stroke text-left dark:border-strokedark">
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-body w-[22%]">{t('commissionReport.unlockMonth')}</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-right whitespace-nowrap text-body">{t('commissionReport.revenue')}</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-right whitespace-nowrap text-body">{t('commissionReport.commission')}</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-right whitespace-nowrap text-body">{t('commissionReport.invoiceCount')}</th>
                  {pointsData && <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-right whitespace-nowrap text-[#8B5CF6]">{t('commissionReport.pts')}</th>}
                  {pointsData && <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-right whitespace-nowrap text-[#8B5CF6]">{t('commissionReport.bonus')}</th>}
                  {(canApprove || canMarkPaid) && <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-center whitespace-nowrap text-body">{t('commissionReport.status')}</th>}
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
                    onClick={() => m.commission > 0 && toggleMonthDrill(m.month)}
                  >
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2">
                        {m.commission > 0 && (
                          <svg className={`h-3.5 w-3.5 text-body transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                        <span className="text-sm font-medium text-black dark:text-white">
                          {MONTH_NAMES[m.month - 1]}
                        </span>
                        {m.month - 1 === currentMonthIndex && selectedYear === new Date().getFullYear().toString() && (
                          <span className="inline-flex rounded-full bg-[#8B5CF6] bg-opacity-10 px-2 py-0.5 text-[10px] font-bold text-[#8B5CF6]">{t('commissionReport.now')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right text-sm text-body">
                      {m.paidRevenue > 0 ? formatCurrency(m.paidRevenue) : '—'}
                    </td>
                    <td className="px-3 py-3.5 text-right text-sm font-medium text-black dark:text-white">
                      {m.commission > 0 ? formatCurrency(m.commission) : '—'}
                    </td>
                    <td className="px-3 py-3.5 text-right text-sm text-body">
                      {m.invoices > 0 ? m.invoices : '—'}
                    </td>
                    {pointsData && (() => {
                      const mp = getMonthPoints(m.month);
                      return (
                        <>
                          <td className="px-3 py-3.5 text-right text-sm">
                            {mp && mp.totalPoints > 0 ? (
                              <span className={`font-semibold ${mp.quotaMet ? 'text-success' : 'text-black dark:text-white'}`}>
                                {mp.totalPoints}
                              </span>
                            ) : <span className="text-body">—</span>}
                          </td>
                          <td className="px-3 py-3.5 text-right text-sm">
                            {mp && mp.monthlyBonus > 0 ? (
                              <span className="font-semibold text-success">${mp.monthlyBonus.toLocaleString()}</span>
                            ) : mp && mp.zentactBonus > 0 ? (
                              <span className="font-semibold text-[#6366F1]">${mp.zentactBonus.toLocaleString()}</span>
                            ) : <span className="text-body">—</span>}
                          </td>
                        </>
                      );
                    })()}
                    {(canApprove || canMarkPaid) && (
                      <td className="px-3 py-3.5 text-center">
                        {(() => {
                          const qualifying = m.commissionQualifyingCount;
                          const approved   = m.commissionApprovedCount;
                          const paid       = m.commissionPaidCount;
                          const pending    = Math.max(0, qualifying - approved - paid);
                          const busy = approvingMonth === m.month || markingPaidMonth === m.month;

                          if (qualifying === 0) {
                            return <span className="text-xs text-body">—</span>;
                          }
                          // All paid
                          if (paid === qualifying) {
                            return (
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-success bg-opacity-10 px-2.5 py-0.5 text-xs font-medium text-success">
                                  ✓ {t('commissionReport.paidBadge')}
                                </span>
                                {canApprove && (
                                  <button onClick={(e) => { e.stopPropagation(); unapproveMonth(m.month); }} disabled={busy} className="text-xs text-body hover:text-danger transition" title={t('commissionReport.undoApproval') as string}>↩</button>
                                )}
                              </div>
                            );
                          }
                          // All approved (none paid yet) — show Mark Paid
                          if (approved === qualifying && paid === 0) {
                            return (
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="inline-flex rounded-full bg-primary bg-opacity-10 px-2.5 py-0.5 text-xs font-medium text-primary">
                                  ✓ {t('commissionReport.approvedBadge')}
                                </span>
                                {canMarkPaid && (
                                  <button onClick={(e) => { e.stopPropagation(); markPaidMonth(m.month); }} disabled={busy} className="text-xs font-medium text-success hover:underline">
                                    {markingPaidMonth === m.month ? '...' : t('commissionReport.markPaid')}
                                  </button>
                                )}
                              </div>
                            );
                          }
                          // Mixed state — show counts + Approve rest
                          if (approved > 0 || paid > 0) {
                            return (
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <span className="inline-flex rounded-full bg-warning bg-opacity-10 px-2.5 py-0.5 text-xs font-medium text-warning" title={`${pending} pending · ${approved} approved · ${paid} paid`}>
                                  {pending}/{approved}/{paid}
                                </span>
                                {canApprove && pending > 0 && (
                                  <button onClick={(e) => { e.stopPropagation(); approveMonth(m.month); }} disabled={busy} className="text-xs font-medium text-primary hover:underline">
                                    {approvingMonth === m.month ? '...' : t('commissionReport.approveRest')}
                                  </button>
                                )}
                                {canMarkPaid && approved > 0 && (
                                  <button onClick={(e) => { e.stopPropagation(); markPaidMonth(m.month); }} disabled={busy} className="text-xs font-medium text-success hover:underline">
                                    {markingPaidMonth === m.month ? '...' : t('commissionReport.markPaid')}
                                  </button>
                                )}
                              </div>
                            );
                          }
                          // All pending — show Approve button
                          return canApprove ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); approveMonth(m.month); }}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-md border border-stroke px-3 py-1 text-xs font-medium text-body hover:bg-gray-50 hover:text-primary dark:border-strokedark dark:hover:bg-meta-4 transition disabled:opacity-50"
                            >
                              {approvingMonth === m.month ? (
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                              ) : t('commissionReport.approve')}
                            </button>
                          ) : (
                            <span className="text-xs text-body">{qualifying} {t('commissionReport.pending')}</span>
                          );
                        })()}
                      </td>
                    )}
                  </tr>
                  {/* Expanded invoice drill-down */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={4 + (pointsData ? 2 : 0) + ((canApprove || canMarkPaid) ? 1 : 0)} className="p-0">
                        <div className="bg-[#8B5CF6] bg-opacity-[0.03] border-b border-[#8B5CF6] border-opacity-20 px-4 py-3 overflow-x-auto">
                          {loadingDrill ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#8B5CF6] border-t-transparent"></div>
                              <span className="ml-2 text-xs text-body">{t('commissionReport.loadingInvoices')}</span>
                            </div>
                          ) : drillInvoices.length === 0 ? (
                            <p className="text-xs text-body py-2">{t('commissionReport.noQualifyingInvoices')}</p>
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
                <tr className="border-t-2 border-stroke dark:border-strokedark">
                  <td className="px-3 py-3.5 text-sm font-bold text-black dark:text-white">{t('commissionReport.total')}</td>
                  <td className="px-3 py-3.5 text-right text-sm font-bold text-black dark:text-white">
                    {formatCurrency(report.summary.ytd.revenue)}
                  </td>
                  <td className="px-3 py-3.5 text-right text-sm font-bold text-[#8B5CF6]">
                    {formatCurrency(report.summary.ytd.commission)}
                  </td>
                  <td className="px-3 py-3.5 text-right text-sm font-bold text-black dark:text-white">
                    {report.summary.ytd.invoices}
                  </td>
                  {pointsData && (
                    <td className="px-3 py-3.5 text-right text-sm font-bold text-[#8B5CF6]">
                      {pointsData.months.reduce((s, m) => s + m.totalPoints, 0)}
                    </td>
                  )}
                  {pointsData && (
                    <td className="px-3 py-3.5 text-right text-sm font-bold text-success">
                      {(() => {
                        const total = pointsData.months.reduce((s, m) => s + m.monthlyBonus + m.zentactBonus, 0);
                        return total > 0 ? `$${total.toLocaleString()}` : '—';
                      })()}
                    </td>
                  )}
                  {(canApprove || canMarkPaid) && <td></td>}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Commission by Customer */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark min-w-0 overflow-hidden">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <h3 className="text-lg font-semibold text-black dark:text-white">{t('commissionReport.commByCustomer')}</h3>
            <p className="text-sm text-body">{t('commissionReport.unlockedOnly')} · {selectedMonth !== 'all' ? `${MONTH_NAMES[parseInt(selectedMonth) - 1]} ${selectedYear}` : `${selectedYear} ${t('commissionReport.ytd')}`} · {t('commissionReport.top50')}</p>
          </div>
          <div className="p-6">
            {report.customers.length === 0 ? (
              <p className="text-sm text-body py-8 text-center">{t('commissionReport.noUnlockedCommissions')}</p>
            ) : (
              <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr className="border-b-2 border-stroke text-left dark:border-strokedark">
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-body">{t('commissionReport.customer')}</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-right text-body">{t('commissionReport.revenue')}</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-right text-body">{t('commissionReport.commission')}</th>
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
                                  <span className="ml-2 text-xs text-body">{t('commissionReport.loadingInvoices')}</span>
                                </div>
                              ) : drillInvoices.length === 0 ? (
                                <p className="text-xs text-body py-2">{t('commissionReport.noQualifyingInvoices')}</p>
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
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[99999] p-4" onClick={handleClosePreview}>
          <div className="bg-white dark:bg-boxdark rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-stroke dark:border-strokedark bg-white dark:bg-boxdark">
              <h3 className="text-lg font-semibold text-black dark:text-white">Invoice {previewModal.invoiceNumber}</h3>
              <div className="flex items-center gap-3">
                <button onClick={() => handlePrint(previewModal.invoiceNumber)} className="inline-flex items-center gap-1.5 rounded-md border border-stroke bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:text-white dark:hover:bg-meta-4">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                  Print
                </button>
                <button onClick={() => handleDownload(previewModal.invoiceNumber)} className="inline-flex items-center gap-1.5 rounded-md border border-stroke bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:text-white dark:hover:bg-meta-4">
                  <Download className="h-4 w-4" />
                  Download
                </button>
                <button onClick={() => handleEmail(previewModal.invoiceNumber)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Email
                </button>
                <button onClick={handleClosePreview} className="text-black dark:text-white hover:text-primary transition" title="Close">
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
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[99999] p-4" onClick={() => !emailModal.sending && setEmailModal({ isOpen: false, invoiceNumber: '', email: '', sending: false })}>
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
        <div className="fixed top-4 right-4 z-[999999]">
          <div className={`flex items-center gap-3 rounded-lg px-6 py-4 shadow-lg ${notification.type === 'success' ? 'bg-success text-white' : 'bg-danger text-white'}`}>
            <p className="font-medium">{notification.message}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionReport;
