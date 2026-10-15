import React, { useState, useEffect } from 'react';
import Select from '../components/Select';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { Eye, Download, X } from 'lucide-react';
import { fmtMoney, fmtMonth, fmtDate, fmtDateOnly, fmtNumber, appLocale, monthNames as appMonthNames } from '../lib/format';
import PayStubModal, { PayStubData } from '../components/PayStubModal';
import ProbationBadge from '../components/ProbationBadge';
import { dialog } from '../lib/dialog';
import { setPageEntity } from '../lib/pageContext';
import useLocalStorage from '../hooks/useLocalStorage';
import { ContentLoader } from '../common/Loader';
import { Button, FilterBar, RowMenu, StateCard, StatusPill, Tabs, useUrlTab } from '../components/ui';
import type { MenuItem, StatusFamily } from '../components/ui';

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
const COMMISSION_STATUS_STYLES: Record<string, { key: string; family: StatusFamily }> = {
  hardware:         { key: 'commissionReport.csHardware',       family: 'new' },
  saas_first:       { key: 'commissionReport.csSaasFirst',      family: 'new' },
  saas_annual:      { key: 'commissionReport.csSaasAnnual',     family: 'new' },
  saas_renewal:     { key: 'commissionReport.csSaasRenewal',    family: 'neutral' },
  pending_saas:     { key: 'commissionReport.csPendingSaas',    family: 'wait' },
  pending_payment:  { key: 'commissionReport.csPendingPayment', family: 'wait' },
  too_late:         { key: 'commissionReport.csTooLate',        family: 'err' },
  quota_not_met:    { key: 'commissionReport.csQuotaNotMet',    family: 'wait' },
  quota_partial:    { key: 'commissionReport.csQuotaPartial',   family: 'wait' },
  rep_inactive:     { key: 'commissionReport.csRepInactive',    family: 'neutral' },
  not_eligible:     { key: 'commissionReport.csNotEligible',    family: 'neutral' },
  excluded:         { key: 'commissionReport.csExcluded',       family: 'neutral' },
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
  quotaForfeited: number;
}

interface MonthPoints {
  month: number;
  crmPoints: number;
  zentactPoints: number;
  zentactActivations: number;
  zentactBonus: number;
  totalPoints: number;
  quota?: number;
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
  baseSalary?: number | null;
  hireDate?: string | null;
  canViewSalary?: boolean;
  probation?: { inProbation: boolean; endDate: string | null; daysLeft: number | null } | null;
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


// Fallback only: the rep's own quota comes back on each month from /api/crm/points/annual.
const MONTHLY_QUOTA = 15;

const CommissionReport = () => {
  const { t } = useTranslation();
  useAuth();
  // Short month names in the user's language (was a fixed English array).
  const MONTH_NAMES = appMonthNames();
  // Onglet actif dans l'adresse (?onglet=) : un lien vers « Rapport › Factures » se partage.
  const [tab, setTab] = useUrlTab<'apercu' | 'mois' | 'factures' | 'paiements'>('apercu', ['apercu', 'mois', 'factures', 'paiements']);
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
  // Via useLocalStorage, not localStorage directly: read during render, a Safari
  // SecurityError (storage blocked / private browsing) would take this whole page
  // down. Same class of bug as the one that broke every authenticated page on
  // 2026-08-17 — this was the other place carrying the pattern.
  const [selectedRep, setSelectedRep] = useLocalStorage<string>('commissionReport.selectedRep', '');
  const [salespeople, setSalespeople] = useState<string[]>([]);
  const [canViewOthers, setCanViewOthers] = useState(false);
  // Privacy toggle for the salary / total-compensation figures (persisted per browser).
  const [salaryHidden, setSalaryHidden] = useLocalStorage<boolean>('commissionReport.salaryHidden', false);
  const toggleSalaryHidden = () => setSalaryHidden((h: boolean) => !h);
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
  // Sélection de factures PRÉCISES (demande de David, 2026-10-05) : payer la commission d'une
  // seule facture plutôt que tout le mois. Les deux endpoints acceptaient déjà une liste ;
  // il n'y avait aucun moyen de la composer à l'écran.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<'approve' | 'pay' | null>(null);

  // Drill-down state
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);
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
  // Auto-dismiss any toast after a few seconds (longer for the slower recalc message).
  useEffect(() => {
    if (!notification.show) return;
    const id = setTimeout(() => setNotification(n => ({ ...n, show: false })), 6000);
    return () => clearTimeout(id);
  }, [notification.show, notification.message]);
  // "Missing commission" report modal (rep-facing)
  const [missingModal, setMissingModal] = useState<{ open: boolean; invoiceNumber: string; message: string; sending: boolean }>({
    open: false, invoiceNumber: '', message: '', sending: false,
  });
  // Client/invoice search across the whole selected year (rep can find a specific deal fast).
  const [searchInput, setSearchInput] = useState('');
  const [searchModal, setSearchModal] = useState<{ open: boolean; q: string; loading: boolean; results: DrillInvoice[] }>({
    open: false, q: '', loading: false, results: [],
  });
  const runSearch = async () => {
    const q = searchInput.trim();
    if (!q) return;
    setSearchModal({ open: true, q, loading: true, results: [] });
    try {
      const token = localStorage.getItem('token');
      const params: Record<string, string> = { year: selectedYear, q };
      if (report) params.repName = report.repName;
      const res = await axios.get(`${API_URL}/api/commissions/invoices`, { headers: { Authorization: `Bearer ${token}` }, params });
      setSearchModal({ open: true, q, loading: false, results: res.data.invoices || [] });
    } catch (e) {
      setSearchModal({ open: true, q, loading: false, results: [] });
    }
  };

  // Rep's payment (Zentact) merchants + processing-bonus commission paid.
  type ProcMerchant = { merchantId: string; name: string; status: string; bonusPaid: boolean; bonusAmount: number; bonusDate: string | null };
  const [processing, setProcessing] = useState<{ merchants: ProcMerchant[]; totals: { bonus: number } } | null>(null);
  useEffect(() => {
    if (!report?.repName) { setProcessing(null); return; }
    const token = localStorage.getItem('token');
    axios.get(`${API_URL}/api/commissions/my-processing`, { headers: { Authorization: `Bearer ${token}` }, params: { repName: report.repName } })
      .then(r => setProcessing({ merchants: r.data.merchants || [], totals: r.data.totals || { bonus: 0 } }))
      .catch(() => setProcessing(null));
  }, [report?.repName]);

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
      dialog.alert(e?.response?.data?.error || t('errors.sendFailed'));
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

  // Fetch the reps the viewer may open (admin → all; manager → their team(s); else → self).
  useEffect(() => {
    const fetchReps = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/api/commissions/viewable-reps`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const reps: string[] = res.data.reps || [];
        setSalespeople(reps);
        setCanViewOthers(!!res.data.canViewOthers);
        // If the viewer isn't themselves a salesperson, auto-select the first rep
        // (otherwise the empty selection falls back to their own name → empty report).
        // A restored selection no longer in the list also falls back.
        if (!isSalesperson && reps.length > 0 && (!selectedRep || !reps.includes(selectedRep))) {
          setSelectedRep(reps[0]);
        }
      } catch (e) {
        console.error('Error fetching viewable reps:', e);
      }
    };
    fetchReps();
  }, [isAdmin, isSalesperson]);

  // Sofia sait quel rapport est affiché (« explique ce mois-ci »).
  useEffect(() => {
    const who = report?.repName || selectedRep;
    const when = selectedMonth === 'all' ? selectedYear : `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    setPageEntity({ kind: 'commissionReport', label: `${who ? `${who} · ` : ''}${when} · ${tab}` });
    return () => setPageEntity(null);
  }, [report?.repName, selectedRep, selectedMonth, selectedYear, tab]);

  // Remember the selected rep for the next visit (instant correct first fetch).
  useEffect(() => {
    if (selectedRep) localStorage.setItem('commissionReport.selectedRep', selectedRep);
  }, [selectedRep]);

  // Fetch report data
  useEffect(() => {
    // Reset drill-downs when filters change
    setExpandedMonth(null);
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
    const period = fmtMonth(Number(selectedYear), month);
    if (!(await dialog.confirm(t('commissionReport.approveConfirm', { rep: report.repName, period }) as string))) return;
    
    setApprovingMonth(month);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/commissions/approve`, {
        repName: report.repName,
        year: selectedYear,
        month,
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      dialog.alert(t('commissionReport.approveDone', { count: res.data.invoicesUpdated }) as string);
      await refreshReport();
    } catch (e) {
      console.error('Error approving:', e);
      dialog.alert(t('commissionReport.approveFailed') as string);
    } finally {
      setApprovingMonth(null);
    }
  };

  const markPaidMonth = async (month: number) => {
    if (!report) return;
    const period = fmtMonth(Number(selectedYear), month);
    if (!(await dialog.confirm(t('commissionReport.markPaidConfirm', { rep: report.repName, period }) as string))) return;

    setMarkingPaidMonth(month);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/commissions/mark-paid`, {
        repName: report.repName,
        year: selectedYear,
        month,
      }, { headers: { Authorization: `Bearer ${token}` } });

      dialog.alert(t('commissionReport.markPaidDone', { count: res.data.invoicesUpdated }) as string);
      await refreshReport();
    } catch (e) {
      console.error('Error marking paid:', e);
      dialog.alert(t('commissionReport.markPaidFailed') as string);
    } finally {
      setMarkingPaidMonth(null);
    }
  };

  const unapproveMonth = async (month: number) => {
    if (!report) return;
    const period = fmtMonth(Number(selectedYear), month);
    if (!(await dialog.confirm(t('commissionReport.unapproveConfirm', { rep: report.repName, period }) as string))) return;
    
    setApprovingMonth(month);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/commissions/unapprove`, {
        repName: report.repName,
        year: selectedYear,
        month,
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      dialog.alert(t('commissionReport.unapproveDone', { count: res.data.invoicesUpdated }) as string);
      await refreshReport();
    } catch (e) {
      console.error('Error unapproving:', e);
      dialog.alert(t('commissionReport.unapproveFailed') as string);
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
        appGenerated: !!d.appGenerated,
        linesStored: d.linesStored,
        missed:      d.missed || [],
        missedTotal: d.missedTotal || 0,
        payDate:     d.payDate || null,
        paySentAt:   d.paySentAt || null,
        quota:       d.quota || null,
      });
    } catch (e) {
      console.error('Error loading pay stub:', e);
      dialog.alert(t('commissionReport.payStub.loadFailed') as string);
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
      dialog.alert(e?.response?.data?.error || t('commissionReport.payStub.quotaWaiveFailed'));
    }
  };

  // Commit an app-generated stub: mark the period's unlocked-but-unpaid commissions as paid
  // and record the stub. Admin / report:mark_paid only (button only wired for them).
  const commitPayStub = async () => {
    if (!payStub || payStub.source !== 'generated' || selectedMonth === 'all') return;
    const period = fmtMonth(Number(selectedYear), parseInt(selectedMonth));
    if (!(await dialog.confirm(t('commissionReport.payStub.commitConfirm', { rep: payStub.repName, period }) as string))) return;
    setCommittingStub(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/commissions/pay-stub/commit`, {
        repName: payStub.repName,
        year: selectedYear,
        month: selectedMonth,
      }, { headers: { Authorization: `Bearer ${token}` } });
      dialog.alert(t('commissionReport.payStub.committedToPayroll', { count: res.data.invoicesMarked, month: period }));
      await openPayStub();     // re-open → now an 'imported' (app-generated) stub
      await refreshReport();   // reflect new paid status in the report
    } catch (e: any) {
      console.error('Error committing pay stub:', e);
      dialog.alert(e?.response?.data?.error || t('commissionReport.payStub.commitFailed'));
    } finally {
      setCommittingStub(false);
    }
  };

  const uncommitPayStub = async () => {
    if (!payStub || selectedMonth === 'all') return;
    const period = fmtMonth(Number(selectedYear), parseInt(selectedMonth));
    if (!(await dialog.confirm(t('commissionReport.payStub.uncommitConfirm', { rep: payStub.repName, period }) as string))) return;
    setCommittingStub(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/commissions/pay-stub/uncommit`, {
        repName: payStub.repName, year: selectedYear, month: selectedMonth,
      }, { headers: { Authorization: `Bearer ${token}` } });
      dialog.alert(t('commissionReport.payStub.uncommitDone', { count: res.data.reverted }));
      await openPayStub();      // re-open → back to a 'generated' stub
      await refreshReport();    // reflect pending status in the report
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || t('commissionReport.payStub.uncommitFailed'));
    } finally {
      setCommittingStub(false);
    }
  };

  // Drill-down: fetch invoices for a month
  const openMonth = async (month: number) => {
    setExpandedMonth(month);
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

  useEffect(() => {
    if ((tab === 'mois' || tab === 'factures') && report && expandedMonth == null) {
      openMonth(selectedMonth !== 'all' ? parseInt(selectedMonth) : new Date().getMonth() + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, report, expandedMonth]);

  // Refuse / restore commission on ONE invoice (admin).
  const toggleExcludeCommission = async (invoiceNumber: string, currentlyExcluded: boolean) => {
    const excluded = !currentlyExcluded;
    if (excluded && !(await dialog.confirm(t('commissionReport.exclude.confirm', { invoice: invoiceNumber }) as string))) return;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/api/commissions/invoice/${encodeURIComponent(invoiceNumber)}/commission-excluded`,
        { excluded }, { headers: { Authorization: `Bearer ${token}` } });
      // Refresh the open drill-down (exclude is immediate; restore recomputes in background).
      if (expandedMonth != null && report) {
        const r = await axios.get(`${API_URL}/api/commissions/invoices`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { year: selectedYear, month: String(expandedMonth), repName: report.repName },
        });
        setDrillInvoices(r.data.invoices || []);
      }
      refreshReport();
      if (!excluded && res.data.note) dialog.alert(t('commissionReport.exclude.restored') as string);
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || t('commissionReport.exclude.failed'));
    }
  };

  // Drill-down: fetch invoices for a customer

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
      dialog.alert(t('commissionReport.printFailed') as string);
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
      dialog.alert(t('commissionReport.downloadFailed') as string);
    }
  };

  // Email
  const handleEmail = (invoiceNumber: string) => {
    setEmailModal({ isOpen: true, invoiceNumber, email: '', sending: false });
  };
  const handleSendEmail = async () => {
    const { invoiceNumber, email } = emailModal;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setNotification({ show: true, message: t('commissionReport.emailInvoice.invalid') as string, type: 'error' });
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
      setNotification({ show: true, message: t('commissionReport.emailInvoice.sent', { number: invoiceNumber, email }) as string, type: 'success' });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 4000);
    } catch (e: any) {
      setEmailModal(prev => ({ ...prev, sending: false }));
      const msg = e?.response?.data?.error || e?.response?.data?.details || t('errors.sendFailed');
      setNotification({ show: true, message: String(msg), type: 'error' });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 5000);
    }
  };

  // Ce qu'on a le droit de faire sur UNE facture. Ces règles reproduisent exactement celles du
  // serveur — approuver exige `pending` + une commission réellement gagnée, payer exige
  // `approved`. Les recopier ici évite d'offrir une case à cocher qui ne ferait rien.
  const GAGNE = ['hardware', 'saas_first', 'saas_annual', 'quota_partial'];
  const approuvable = (inv: DrillInvoice) =>
    inv.approvalStatus === 'pending' && (inv.commission || 0) > 0 && GAGNE.includes(inv.commissionStatus || '');
  const payable = (inv: DrillInvoice) => inv.approvalStatus === 'approved';
  const selectionnable = (inv: DrillInvoice) =>
    (canApprove && approuvable(inv)) || (canMarkPaid && payable(inv));

  const basculer = (num: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(num)) n.delete(num); else n.add(num);
    return n;
  });

  // Agit sur les factures sélectionnées QUI SONT DANS LE BON ÉTAT, et le dit : envoyer une
  // facture déjà payée à « approuver » ne ferait rien, en silence.
  const agirSurSelection = async (quoi: 'approve' | 'pay', factures: DrillInvoice[]) => {
    const cibles = factures.filter((i) => selected.has(i.invoiceNumber) && (quoi === 'approve' ? approuvable(i) : payable(i)));
    if (!cibles.length) return;
    const total = cibles.reduce((a, i) => a + (i.commission || 0), 0);
    const qui = report?.repName || '';
    const message = quoi === 'approve'
      ? t('commissionReport.bulk.confirmApprove', { n: cibles.length, total: formatCurrency(total), rep: qui })
      : t('commissionReport.bulk.confirmPay', { n: cibles.length, total: formatCurrency(total), rep: qui });
    if (!(await dialog.confirm(message as string))) return;
    setBulkBusy(quoi);
    try {
      const token = localStorage.getItem('token');
      const url = quoi === 'approve' ? '/api/commissions/approve' : '/api/commissions/mark-paid';
      const res = await axios.post(`${API_URL}${url}`,
        { invoiceNumbers: cibles.map((i) => i.invoiceNumber) },
        { headers: { Authorization: `Bearer ${token}` } });
      setSelected(new Set());
      await refreshReport();
      dialog.alert(t('commissionReport.bulk.done', { n: res.data?.invoicesUpdated ?? cibles.length }) as string);
    } catch (e) {
      console.error('bulk action failed:', e);
      dialog.alert(t('commissionReport.bulk.failed') as string);
    } finally { setBulkBusy(null); }
  };

  // Reusable invoice sub-table for drill-downs
  const renderInvoiceTable = (invoices: DrillInvoice[]) => {
    const cochables = invoices.filter(selectionnable);
    const choisies = invoices.filter((i) => selected.has(i.invoiceNumber));
    const nApprouver = choisies.filter(approuvable).length;
    const nPayer = choisies.filter(payable).length;
    const montant = (f: (i: DrillInvoice) => boolean) =>
      choisies.filter(f).reduce((a, i) => a + (i.commission || 0), 0);
    return (
    <>
    {/* La barre n'apparaît QUE s'il y a une sélection : une barre d'actions permanente sur un
        écran d'argent invite au clic distrait. Chaque bouton annonce son nombre ET son montant. */}
    {!!cochables.length && !!choisies.length && (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke bg-primary/5 px-3 py-2.5 dark:border-strokedark">
        <span className="text-xs text-black dark:text-white">
          {t('commissionReport.bulk.selected', { n: choisies.length })}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-2 text-xs text-body underline hover:text-primary">
            {t('commissionReport.bulk.clear')}
          </button>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {canApprove && nApprouver > 0 && (
            <button type="button" onClick={() => agirSurSelection('approve', invoices)} disabled={!!bulkBusy}
              className="rounded border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60">
              {bulkBusy === 'approve' ? '…' : t('commissionReport.bulk.approve', { n: nApprouver, total: formatCurrency(montant(approuvable)) })}
            </button>
          )}
          {canMarkPaid && nPayer > 0 && (
            <button type="button" onClick={() => agirSurSelection('pay', invoices)} disabled={!!bulkBusy}
              className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
              {bulkBusy === 'pay' ? '…' : t('commissionReport.bulk.pay', { n: nPayer, total: formatCurrency(montant(payable)) })}
            </button>
          )}
        </span>
      </div>
    )}
    <table className="w-full table-auto">
      <thead>
        <tr className="bg-gray-50 dark:bg-meta-4/50">
          {!!cochables.length && (
            <th className="w-8 px-3 py-2">
              <input type="checkbox" aria-label={t('commissionReport.bulk.selectAll') as string}
                checked={cochables.every((i) => selected.has(i.invoiceNumber))}
                onChange={(e) => setSelected((prev) => {
                  const n = new Set(prev);
                  cochables.forEach((i) => (e.target.checked ? n.add(i.invoiceNumber) : n.delete(i.invoiceNumber)));
                  return n;
                })} />
            </th>
          )}
          <th className="px-3 py-2 text-xs font-medium text-body text-left">{t('commissionReport.invoiceNumber')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-left">{t('commissionReport.customer')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-left">{t('commissionReport.date')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-left">{t('commissionReport.unlockMonth')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-center">{t('commissionReport.type')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-right">{t('commissionReport.total')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-right">{t('commissionReport.commission')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-center">{t('commissionReport.commStatus')}</th>
          <th className="px-3 py-2 text-xs font-medium text-body text-center">{t('common.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => {
          const cs = inv.commissionStatus && COMMISSION_STATUS_STYLES[inv.commissionStatus];
          return (
          <tr key={inv.invoiceNumber} className="border-b border-stroke/50 dark:border-strokedark/50 hover:bg-gray-50 dark:hover:bg-meta-4/30">
            {!!cochables.length && (
              <td className="px-3 py-2.5">
                {/* Une facture déjà payée, exclue ou sans commission gagnée n'a pas de case :
                    rien ne s'y appliquerait. Mieux vaut l'absence que l'illusion du choix. */}
                {selectionnable(inv) && (
                  <input type="checkbox" checked={selected.has(inv.invoiceNumber)}
                    onChange={() => basculer(inv.invoiceNumber)}
                    aria-label={inv.invoiceNumber} />
                )}
              </td>
            )}
            <td className="px-3 py-2.5 text-xs">
              <button onClick={() => handlePreview(inv.invoiceNumber)} className="font-medium text-primary hover:underline">{inv.invoiceNumber}</button>
            </td>
            <td className="px-3 py-2.5 text-xs text-black dark:text-white truncate max-w-[160px]">{inv.customerName}</td>
            <td className="px-3 py-2.5 text-xs text-body">{fmtDateOnly(inv.date)}</td>
            <td className="px-3 py-2.5 text-xs text-body">
              {inv.commissionPayableDate ? fmtDateOnly(inv.commissionPayableDate) : '—'}
            </td>
            <td className="px-3 py-2.5 text-center">
              {cs ? <StatusPill family={cs.family}>{t(cs.key)}</StatusPill> : <span className="text-xs text-body">—</span>}
            </td>
            <td className="px-3 py-2.5 text-xs text-right text-body">{formatCurrency(inv.total)}</td>
            <td className="px-3 py-2.5 text-xs text-right font-medium text-black dark:text-white">{formatCurrency(inv.commission)}</td>
            <td className="px-3 py-2.5 text-center">{approvalPill(inv)}</td>
            <td className="px-3 py-2.5">
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => handlePreview(inv.invoiceNumber)} className="text-primary hover:text-primary/70 transition" title={t('common.preview') as string}>
                  <Eye className="h-4 w-4" />
                </button>
                <button onClick={() => handleDownload(inv.invoiceNumber)} className="text-success hover:text-success/70 transition" title={t('common.download') as string}>
                  <Download className="h-4 w-4" />
                </button>
                <button onClick={() => handleEmail(inv.invoiceNumber)} className="text-body hover:text-primary transition" title={t('common.email') as string}>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </button>
                <button onClick={() => handlePrint(inv.invoiceNumber)} className="text-body hover:text-primary transition" title={t('common.print') as string}>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                </button>
                {canMarkPaid && inv.approvalStatus !== 'paid' && (
                  inv.commissionStatus === 'excluded' ? (
                    <button onClick={() => toggleExcludeCommission(inv.invoiceNumber, true)} className="text-success hover:text-success/70 transition" title={t('commissionReport.exclude.restore') as string}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v6h6M3 13a9 9 0 103-7.7L3 8" /></svg>
                    </button>
                  ) : (
                    <button onClick={() => toggleExcludeCommission(inv.invoiceNumber, false)} className="text-body hover:text-danger transition" title={t('commissionReport.exclude.refuse') as string}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0M5.636 5.636l12.728 12.728" /></svg>
                    </button>
                  )
                )}
              </div>
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
    </>
    );
  };

  const formatCurrency = (val: number) => fmtMoney(val);
  // Bonus amounts are whole dollars; show cents only when there are some.
  const bonusMoney = (val: number) => fmtMoney(val, { decimals: Number.isInteger(val) ? 0 : 2 });

  const currentMonthIndex = new Date().getMonth();


  // Look up points for a given month number (1-based)
  const getMonthPoints = (month: number): MonthPoints | null =>
    pointsData?.months.find(m => m.month === month) || null;

  if (loading) return <ContentLoader />;

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
      return i === highlightMonth ? '#F58345' : '#FBCDB5';
    }),
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: MONTH_NAMES,
      labels: { style: { colors: '#999AA7', fontSize: '12px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#999AA7', fontSize: '12px' },
        formatter: (v: number) => (appLocale().startsWith('fr') ? `${fmtNumber(v / 1000, 0)} k$` : `$${fmtNumber(v / 1000, 0)}k`),
      },
    },
    grid: {
      strokeDashArray: 3,
      borderColor: 'rgba(153,154,167,0.25)',
      xaxis: { lines: { show: false } },
    },
    tooltip: {
      theme: 'dark',
      y: {
        formatter: (v: number) => fmtMoney(v),
      },
    },
  };

  const chartSeries = [{
    name: t('commissionReport.commission') as string,
    data: report.months.map(m => m.commission),
  }];

  // ── Refonte UI (P2, planche DeskRapport) ─────────────────────────────────────────────
  // Quatre onglets dont l'actif est dans l'adresse (?onglet=) : Aperçu, Par mois (tableau +
  // panneau de détail du mois), Factures (tableau complet, sélection, approbation),
  // Paiements (marchands Zentact). Les actions et leurs règles sont INCHANGÉES : seul
  // l'affichage est réorganisé.
  const curYear = new Date().getFullYear().toString();
  const isCurrentMonth = (m: number) => m - 1 === currentMonthIndex && selectedYear === curYear;
  const panelMonth = expandedMonth ?? (selectedMonth !== 'all' ? parseInt(selectedMonth) : currentMonthIndex + 1);
  const panelData = report.months.find((m) => m.month === panelMonth);
  const panelPts = getMonthPoints(panelMonth);
  const yearBonus = pointsData ? pointsData.months.reduce((s, m) => s + m.monthlyBonus + m.zentactBonus, 0) : 0;
  const monthStatus = (m?: MonthData): { family: StatusFamily; label: string } | null => {
    if (!m || !m.commissionQualifyingCount) return null;
    if (m.commissionPaidCount === m.commissionQualifyingCount) return { family: 'ok', label: t('commissionReport.paidBadge') };
    if (m.commissionApprovedCount + m.commissionPaidCount === m.commissionQualifyingCount) return { family: 'new', label: t('commissionReport.approvedBadge') };
    return { family: 'neutral', label: t('commissionReport.v2.inProgress') };
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const approvalPill = (inv: DrillInvoice) => inv.approvalStatus === 'paid'
    ? <StatusPill family="ok" title={inv.payoutPaidAt ? t('commissionReport.paidOn', { date: fmtDateOnly(inv.payoutPaidAt) }) as string : undefined}>{t('commissionReport.paidBadge')}</StatusPill>
    : inv.approvalStatus === 'approved'
      ? <StatusPill family="new" title={inv.approvedAt ? t('commissionReport.approvedOn', { date: fmtDateOnly(inv.approvedAt) }) as string : undefined}>{t('commissionReport.approvedBadge')}</StatusPill>
      : <StatusPill family="neutral">{cap(t('commissionReport.pending'))}</StatusPill>;
  const invoiceMenu = (inv: DrillInvoice): MenuItem[] => [
    { label: t('common.preview'), onSelect: () => handlePreview(inv.invoiceNumber) },
    { label: t('commissionReport.v2.downloadPdf'), onSelect: () => handleDownload(inv.invoiceNumber) },
    { label: t('commissionReport.v2.sendEmail'), onSelect: () => handleEmail(inv.invoiceNumber) },
    { label: t('common.print'), onSelect: () => handlePrint(inv.invoiceNumber) },
    ...(canMarkPaid && inv.approvalStatus !== 'paid'
      ? [inv.commissionStatus === 'excluded'
        ? { label: t('commissionReport.exclude.restore'), onSelect: () => toggleExcludeCommission(inv.invoiceNumber, true), separated: true }
        : { label: `${t('commissionReport.exclude.refuse')}…`, onSelect: () => toggleExcludeCommission(inv.invoiceNumber, false), danger: true, separated: true }]
      : []),
  ];
  const openMissing = (invoiceNumber = '') => setMissingModal({ open: true, invoiceNumber, message: '', sending: false });
  const selectCls = 'w-full rounded-xl border border-stroke bg-white px-3 py-2 text-sm font-medium outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white md:w-auto';
  const kpi = (label: string, value: React.ReactNode, sub?: React.ReactNode, subCls = '') => (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-stroke bg-white p-4 dark:border-strokedark dark:bg-boxdark">
      <span className="text-[13px] text-body dark:text-bodydark2">{label}</span>
      <span className="text-[26px] font-bold tracking-[-0.01em] text-black dark:text-white">{value}</span>
      {sub && <span className={`text-xs ${subCls || 'text-body dark:text-bodydark2'}`}>{sub}</span>}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* En-tête : titre, puis la barre de filtres pleine largeur, puis les onglets. */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-body dark:text-bodydark2">{t('sidebar.sections.pay')}</span>
            <h1 className="m-0 text-2xl font-bold leading-tight tracking-[-0.01em] text-black dark:text-white">{t('commissionReport.title')}</h1>
            <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-body dark:text-bodydark2">
              <span>{report.repName} · {t('commissionReport.rateLine', { rate: fmtNumber(report.commissionRate) })}</span>
              <ProbationBadge probation={report.probation} />
            </p>
          </div>
          {canViewPaystub && (
            <Button
              variant="primary"
              size="md"
              onClick={openPayStub}
              disabled={loadingStub}
              disabledReason={selectedMonth === 'all' ? t('commissionReport.v2.payStubPickMonth') : undefined}
            >
              {loadingStub ? '…' : selectedMonth === 'all'
                ? t('commissionReport.payStub.open')
                : t('commissionReport.v2.payStubFor', { month: fmtMonth(parseInt(selectedYear), parseInt(selectedMonth)) })}
            </Button>
          )}
        </div>

        <FilterBar search={searchInput} onSearch={setSearchInput} searchPlaceholder={t('commissionReport.searchPlaceholder') as string}>
          {canViewOthers && salespeople.length > 0 && (
            <Select value={selectedRep} onChange={(v) => setSelectedRep(v)} options={[...(isSalesperson ? [{ value: '', label: t('commissionReport.myReport') as string }] : []), ...salespeople.map((rep) => ({ value: rep, label: rep }))]} buttonClassName={`${selectCls} md:w-52`} />
          )}
          <Select value={selectedMonth} onChange={(v) => setSelectedMonth(v)} options={[{ value: 'all', label: t('commissionReport.allMonths') as string }, ...MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name }))]} buttonClassName={selectCls} />
          <Select value={selectedYear} onChange={(v) => setSelectedYear(v)} options={Array.from({ length: new Date().getFullYear() - 2024 }, (_, i) => new Date().getFullYear() - i).filter((y) => !disabledYears.includes(y)).map((y) => ({ value: String(y), label: String(y) }))} buttonClassName={selectCls} />
          <Button size="sm" onClick={runSearch} disabled={!searchInput.trim()}>{t('commissionReport.search')}</Button>
        </FilterBar>

        <Tabs
          ariaLabel={t('commissionReport.v2.tabsLabel') as string}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'apercu', label: t('commissionReport.v2.tabOverview') },
            { id: 'mois', label: t('commissionReport.v2.tabMonths') },
            { id: 'factures', label: t('commissionReport.v2.tabInvoices') },
            { id: 'paiements', label: t('commissionReport.v2.tabPayments') },
          ]}
          right={
            <button type="button" onClick={() => openMissing()} className="inline-flex items-center gap-1.5 py-2 text-[13px] font-bold text-accent-ink hover:underline dark:text-accent-ink-dark">
              {t('commissionReport.missing.button')}
            </button>
          }
        />
      </header>

      {/* Missing-commission modal */}
      {missingModal.open && (
        <div className="fixed inset-0 z-[9999] flex items-start overflow-y-auto justify-center bg-black bg-opacity-50 p-4" onClick={() => !missingModal.sending && setMissingModal(m => ({ ...m, open: false }))}>
          <div className="my-auto w-full max-w-md rounded-[20px] border border-strokestrong bg-white p-6 shadow-xl dark:border-graydark dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-bold text-black dark:text-white">{t('commissionReport.missing.title')}</h3>
            <p className="mb-4 text-sm text-body">{t('commissionReport.missing.subtitle')}</p>
            <label className="mb-1 block text-xs font-medium text-body">{t('commissionReport.missing.invoiceLabel')}</label>
            <input
              type="text"
              value={missingModal.invoiceNumber}
              onChange={(e) => setMissingModal(m => ({ ...m, invoiceNumber: e.target.value }))}
              placeholder="INV-012345"
              className="mb-3 w-full rounded-xl border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
            />
            <label className="mb-1 block text-xs font-medium text-body">{t('commissionReport.missing.messageLabel')}</label>
            <textarea
              value={missingModal.message}
              onChange={(e) => setMissingModal(m => ({ ...m, message: e.target.value }))}
              rows={4}
              placeholder={t('commissionReport.missing.messagePlaceholder') as string}
              className="mb-4 w-full rounded-xl border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <Button size="md" onClick={() => setMissingModal(m => ({ ...m, open: false }))} disabled={missingModal.sending}>{t('common.cancel')}</Button>
              <Button size="md" variant="primary" onClick={submitMissing} disabled={missingModal.sending || !missingModal.message.trim()}>
                {missingModal.sending ? t('commissionReport.missing.sending') : t('commissionReport.missing.send')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Client / invoice search results */}
      {searchModal.open && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 p-4 pt-16" onClick={() => setSearchModal(s => ({ ...s, open: false }))}>
          <div className="w-full max-w-4xl rounded-[20px] border border-strokestrong bg-white shadow-xl dark:border-graydark dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
              <div>
                <h3 className="text-lg font-bold text-black dark:text-white">{t('commissionReport.searchResultsTitle')}</h3>
                <p className="text-sm text-body">
                  {searchModal.loading ? t('commissionReport.loadingInvoices') : t('commissionReport.searchResultsCount', { count: searchModal.results.length, q: searchModal.q, year: selectedYear })}
                </p>
              </div>
              <button onClick={() => setSearchModal(s => ({ ...s, open: false }))} aria-label={t('common.close') as string} className="text-body hover:text-black dark:hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[70vh] overflow-auto p-4">
              {searchModal.loading ? (
                <StateCard kind="loading" />
              ) : searchModal.results.length === 0 ? (
                <p className="py-6 text-center text-sm text-body">{t('commissionReport.searchNoResults')}</p>
              ) : (
                renderInvoiceTable(searchModal.results)
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pay Stub modal (shared component) */}
      <PayStubModal
        data={payStub}
        onClose={() => setPayStub(null)}
        onCommit={canMarkPaid ? commitPayStub : undefined}
        onUncommit={canMarkPaid ? uncommitPayStub : undefined}
        committing={committingStub}
        showAppCalc={canMarkPaid}
        onQuotaWaive={canMarkPaid ? waiveQuota : undefined}
        onAdjusted={canMarkPaid ? refreshReport : undefined}
      />

      {/* ═══ Aperçu ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'apercu' && (
        <>
          {/* Quatre indicateurs, sans doublon (avant : le cumul annuel apparaissait trois fois). */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpi(t('commissionReport.v2.kpiCommission', { year: selectedYear }), formatCurrency(report.summary.ytd.commission),
              t('commissionReport.v2.kpiInvoices', { count: report.summary.ytd.invoices }))}
            {kpi(t('commissionReport.v2.kpiBonus', { year: selectedYear }), bonusMoney(yearBonus), t('commissionReport.v2.kpiBonusSub'))}
            {kpi(t('commissionReport.pendingTitle'), formatCurrency(report.summary.pending?.commission || 0),
              t('commissionReport.v2.kpiPendingSub', { count: report.summary.pending?.count || 0 }),
              (report.summary.pending?.commission || 0) > 0 ? 'font-bold text-warning' : '')}
            {pointsData && kpi(t('commissionReport.v2.kpiPoints', { year: selectedYear }),
              <>{pointsData.annual.totalPoints}{pointsData.annual.nextTier && <span className="text-[15px] font-medium text-body dark:text-bodydark2"> / {pointsData.annual.nextTier.points}</span>}</>,
              t('commissionReport.v2.kpiQuotaMonths', { met: pointsData.months.filter((m) => m.quotaMet).length, total: pointsData.months.filter((m) => m.totalPoints > 0 || m.quotaMet).length }))}
          </div>

          {/* Total Compensation — GAGNE A CE JOUR : salaire de base accumule par periode de paie
              (26 periodes de 14 jours par an) + commissions de l'annee + bonus.
              L'accumulation part de la DATE D'EMBAUCHE quand elle tombe apres le 1er janvier :
              compter depuis le 1er janvier creditait un nouvel employe d'un salaire jamais gagne
              — 29 423 $ affiches pour quelqu'un arrive depuis un mois. */}
          {report.canViewSalary !== false && (() => {
            const PAY_PERIODS = 26;
            const annualSalary = report.baseSalary || 0;
            const now = new Date();
            const yearNum = parseInt(selectedYear);
            const yearStart = new Date(yearNum, 0, 1);
            const yearEnd = new Date(yearNum, 11, 31, 23, 59, 59);
            const hire = report.hireDate ? new Date(`${report.hireDate}T00:00:00`) : null;
            // Depart de l'accumulation : l'embauche si elle tombe APRES le 1er janvier de l'annee
            // affichee, sinon le 1er janvier. Vaut aussi pour les annees passees — un vendeur
            // embauche en juillet 2025 n'a pas gagne 26 periodes en 2025.
            const hiredMidYear = !!hire && hire > yearStart;
            const accrualStart = hiredMidYear ? hire : yearStart;
            const accrualEnd = now < yearEnd ? now : yearEnd;
            const daysElapsed = Math.floor((accrualEnd.getTime() - accrualStart.getTime()) / 86400000);
            const periodsElapsed = Math.min(PAY_PERIODS, Math.max(0, Math.floor(daysElapsed / 14)));
            const pct = Math.round((periodsElapsed / PAY_PERIODS) * 100);
            const baseSalaryEarned = annualSalary * (periodsElapsed / PAY_PERIODS);
            const ytdComm = report.summary.ytd.commission || 0;
            const annualBonus = pointsData?.annual?.annualBonus || 0;
            const signupPay = pointsData?.annual?.zentactBonus || 0;
            const totalComp = baseSalaryEarned + ytdComm + annualBonus + signupPay;
            const money = (value: number) => salaryHidden ? '••••••' : formatCurrency(value);
            const part = (label: string, value: number) => (
              <div>
                <p className="whitespace-nowrap text-xs text-body dark:text-bodydark2">{label}</p>
                <p className="mt-0.5 whitespace-nowrap text-lg font-bold text-black dark:text-white">{money(value)}</p>
              </div>
            );
            const op = (sym: string) => (
              <span className="hidden select-none text-xl font-light text-bodydark2 sm:block">{sym}</span>
            );
            return (
              <section className="rounded-[20px] border border-stroke bg-white px-6 py-5 dark:border-strokedark dark:bg-boxdark">
                <div className="mb-4 flex items-center gap-2">
                  <h2 className="m-0 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2">
                    {t('commissionReport.totalComp')} ({selectedYear})
                  </h2>
                  <button
                    onClick={toggleSalaryHidden}
                    title={salaryHidden ? t('commissionReport.salaryShow') as string : t('commissionReport.salaryHide') as string}
                    aria-label={salaryHidden ? t('commissionReport.salaryShow') as string : t('commissionReport.salaryHide') as string}
                    className="text-body transition hover:text-black dark:hover:text-white"
                  >
                    {salaryHidden ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" /></svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-4">
                  <div>
                    <p className="whitespace-nowrap text-xs text-body dark:text-bodydark2">{t('commissionReport.compBase')}</p>
                    <p className="mt-0.5 whitespace-nowrap text-lg font-bold text-black dark:text-white">{money(baseSalaryEarned)}</p>
                    <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-stroke dark:bg-strokedark">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 whitespace-nowrap text-[11px] text-body dark:text-bodydark2">
                      {t('commissionReport.payPeriodsProgress', { done: periodsElapsed, total: PAY_PERIODS, pct })}
                    </p>
                    <p className="whitespace-nowrap text-[11px] text-body dark:text-bodydark2">{t('commissionReport.compBaseOf', { amount: money(annualSalary) })}</p>
                    {/* Sans cette ligne, « 2/26 » ressemble a une erreur pour un nouvel employe. */}
                    {hiredMidYear && (
                      <p className="whitespace-nowrap text-[11px] italic text-body dark:text-bodydark2">
                        {t('commissionReport.compSinceHire', { date: fmtDate(hire, { year: 'numeric', month: 'long', day: 'numeric' }) })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-x-3">{op('+')}{part(t('commissionReport.compCommission'), ytdComm)}</div>
                  <div className="flex items-center gap-x-3">{op('+')}{part(t('commissionReport.compAnnualBonus'), annualBonus)}</div>
                  <div className="flex items-center gap-x-3">{op('+')}{part(t('commissionReport.compSignup'), signupPay)}</div>
                  <div className="flex shrink-0 items-center gap-3 lg:border-l lg:border-stroke lg:pl-5 lg:dark:border-strokedark">
                    {op('=')}
                    <div className="rounded-xl bg-[rgba(245,131,69,0.14)] px-5 py-3 dark:bg-[rgba(245,131,69,0.16)]">
                      <p className="whitespace-nowrap text-xs font-bold uppercase tracking-wide text-accent-ink dark:text-accent-ink-dark">{t('commissionReport.earnedToDate')}</p>
                      <p className="mt-0.5 whitespace-nowrap text-2xl font-bold text-black dark:text-white">{money(totalComp)}</p>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[11px] italic text-body dark:text-bodydark2">{t('commissionReport.grossDisclaimer')}</p>
              </section>
            );
          })()}

          {/* Monthly Commission Chart */}
          <section className="rounded-[20px] border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
              <h2 className="m-0 text-lg font-bold text-black dark:text-white">{t('commissionReport.monthlyCommission')}</h2>
              <p className="m-0 text-sm text-body dark:text-bodydark2">{t('commissionReport.monthlyCommissionByUnlock')}</p>
            </div>
            <div className="p-6">
              <ReactApexChart options={chartOptions} series={chartSeries} type="bar" height={320} />
            </div>
          </section>
        </>
      )}

      {/* ═══ Par mois : tableau + panneau de détail du mois ═══════════════════════════ */}
      {tab === 'mois' && (
        <div className="flex flex-wrap items-start gap-5">
          <section className="min-w-0 flex-[999_1_520px]">
            <div className="overflow-x-auto rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-body dark:text-bodydark2">
                    <th className="border-b border-stroke px-4 py-3 font-bold dark:border-strokedark">{t('commissionReport.unlockMonth')}</th>
                    {pointsData && <th className="border-b border-stroke px-4 py-3 text-right font-bold dark:border-strokedark">{t('commissionReport.pts')}</th>}
                    <th className="border-b border-stroke px-4 py-3 text-right font-bold dark:border-strokedark">{t('commissionReport.revenue')}</th>
                    <th className="border-b border-stroke px-4 py-3 text-right font-bold dark:border-strokedark">{t('commissionReport.commission')}</th>
                    {pointsData && <th className="border-b border-stroke px-4 py-3 text-right font-bold dark:border-strokedark">{t('commissionReport.bonus')}</th>}
                    <th className="border-b border-stroke px-4 py-3 font-bold dark:border-strokedark">{t('commissionReport.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.months.map((m) => {
                    const sel = m.month === panelMonth;
                    const mp = getMonthPoints(m.month);
                    const st = monthStatus(m);
                    return (
                      <tr key={m.month} onClick={() => openMonth(m.month)} className={`cursor-pointer ${sel ? 'bg-[rgba(245,131,69,0.08)]' : 'hover:bg-gray-2 dark:hover:bg-[#1B1B1B]'}`}>
                        <td className="border-b border-stroke p-0 dark:border-strokedark">
                          <button type="button" aria-pressed={sel} onClick={(e) => { e.stopPropagation(); openMonth(m.month); }} className="flex w-full items-center gap-2 px-4 py-3 text-left font-bold text-black dark:text-white">
                            {MONTH_NAMES[m.month - 1]}
                            {isCurrentMonth(m.month) && <StatusPill family="new">{t('commissionReport.now')}</StatusPill>}
                          </button>
                        </td>
                        {pointsData && (
                          <td className={`border-b border-stroke px-4 py-3 text-right font-bold dark:border-strokedark ${mp && mp.totalPoints > 0 && !mp.quotaMet ? 'text-warning' : 'text-black dark:text-white'}`}>
                            {mp && mp.totalPoints > 0 ? mp.totalPoints : '—'}
                          </td>
                        )}
                        <td className="border-b border-stroke px-4 py-3 text-right text-[#424242] dark:border-strokedark dark:text-bodydark">{m.paidRevenue > 0 ? formatCurrency(m.paidRevenue) : '—'}</td>
                        <td className="border-b border-stroke px-4 py-3 text-right font-bold text-black dark:border-strokedark dark:text-white">
                          {m.commission > 0 ? formatCurrency(m.commission) : m.quotaForfeited > 0.005
                            ? <StatusPill family="wait" title={t('commissionReport.quotaForfeitedHint', { amount: formatCurrency(m.quotaForfeited) }) as string}>{t('commissionReport.quotaForfeitedBadge')}</StatusPill>
                            : '—'}
                        </td>
                        {pointsData && (
                          <td className="border-b border-stroke px-4 py-3 text-right dark:border-strokedark">
                            {mp && mp.monthlyBonus + mp.zentactBonus > 0 ? <span className="font-bold text-success">{bonusMoney(mp.monthlyBonus + mp.zentactBonus)}</span> : <span className="text-body">—</span>}
                          </td>
                        )}
                        <td className="border-b border-stroke px-4 py-3 dark:border-strokedark">
                          {st ? <StatusPill family={st.family}>{st.label}</StatusPill> : <span className="text-body">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="px-4 py-3 font-bold text-black dark:text-white">{t('commissionReport.total')}</td>
                    {pointsData && <td className="px-4 py-3 text-right font-bold text-black dark:text-white">{pointsData.months.reduce((s, m) => s + m.totalPoints, 0)}</td>}
                    <td className="px-4 py-3 text-right font-bold text-black dark:text-white">{formatCurrency(report.summary.ytd.revenue)}</td>
                    <td className="px-4 py-3 text-right font-bold text-black dark:text-white">{formatCurrency(report.summary.ytd.commission)}</td>
                    {pointsData && <td className="px-4 py-3 text-right font-bold text-success">{yearBonus > 0 ? bonusMoney(yearBonus) : '—'}</td>}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Panneau : le détail du mois choisi, ses actions et ses factures. */}
          <aside aria-labelledby="month-panel-h" className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5 rounded-2xl border border-stroke bg-white p-[18px] dark:border-strokedark dark:bg-boxdark">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-body dark:text-bodydark2">{t('commissionReport.v2.monthDetail')}</span>
                <h2 id="month-panel-h" className="m-0 text-xl font-bold capitalize text-black dark:text-white">{fmtMonth(parseInt(selectedYear), panelMonth)}</h2>
              </div>
              {(() => { const st = monthStatus(panelData); return st ? <StatusPill family={st.family}>{st.label}</StatusPill> : null; })()}
            </div>

            <dl className="m-0 flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><dt className="text-body dark:text-bodydark2">{t('commissionReport.commission')}</dt><dd className="m-0 font-medium text-black dark:text-white">{formatCurrency(panelData?.commission || 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-body dark:text-bodydark2">{t('commissionReport.monthlyBonus')}</dt><dd className="m-0 font-medium text-black dark:text-white">{bonusMoney(panelPts?.monthlyBonus || 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-body dark:text-bodydark2">{t('commissionReport.zentactBonus')}</dt><dd className="m-0 font-medium text-black dark:text-white">{bonusMoney(panelPts?.zentactBonus || 0)}</dd></div>
              <div className="flex justify-between border-t border-stroke pt-2 dark:border-strokedark"><dt className="font-bold text-black dark:text-white">{t('commissionReport.total')}</dt><dd className="m-0 font-bold text-black dark:text-white">{formatCurrency((panelData?.commission || 0) + (panelPts?.monthlyBonus || 0) + (panelPts?.zentactBonus || 0))}</dd></div>
              {(panelData?.quotaForfeited || 0) > 0.005 && (
                <p className="m-0 rounded-xl bg-[rgba(253,176,34,0.18)] px-3 py-2 text-[13px] font-medium text-[#B54708] dark:bg-[rgba(253,176,34,0.16)] dark:text-[#FDB022]">
                  {t('commissionReport.quotaForfeitedHint', { amount: formatCurrency(panelData!.quotaForfeited) })}
                </p>
              )}
              {panelPts && (
                <p className="m-0 text-[13px] text-body dark:text-bodydark2">
                  {t('commissionReport.v2.pointsLine', { pts: panelPts.totalPoints, quota: panelPts.quota ?? MONTHLY_QUOTA })}
                  {panelPts.quotaMet ? ` · ✓ ${t('commissionReport.quotaMet')}` : ''}
                </p>
              )}
            </dl>

            {/* Actions du mois (approuver / marquer payé / annuler) — mêmes règles qu'avant. */}
            {(canApprove || canMarkPaid) && panelData && panelData.commissionQualifyingCount > 0 && (() => {
              const m = panelData;
              const qualifying = m.commissionQualifyingCount, approved = m.commissionApprovedCount, paid = m.commissionPaidCount;
              const pending = Math.max(0, qualifying - approved - paid);
              const busy = approvingMonth === m.month || markingPaidMonth === m.month;
              return (
                <div className="flex flex-wrap items-center gap-2 border-t border-stroke pt-3 dark:border-strokedark">
                  <span className="mr-auto text-xs text-body dark:text-bodydark2" title={t('commissionReport.countsTitle', { pending, approved, paid }) as string}>
                    {t('commissionReport.v2.counts', { pending, approved, paid })}
                  </span>
                  {canApprove && pending > 0 && (
                    <Button size="xs" onClick={() => approveMonth(m.month)} disabled={busy}>{approvingMonth === m.month ? '…' : (approved > 0 || paid > 0 ? t('commissionReport.approveRest') : t('commissionReport.approve'))}</Button>
                  )}
                  {canMarkPaid && approved > 0 && (
                    <Button size="xs" variant="primary" onClick={() => markPaidMonth(m.month)} disabled={busy}>{markingPaidMonth === m.month ? '…' : t('commissionReport.markPaid')}</Button>
                  )}
                  {canApprove && paid === qualifying && (
                    <Button size="xs" variant="ghost" onClick={() => unapproveMonth(m.month)} disabled={busy}>{t('commissionReport.undoApproval')}</Button>
                  )}
                </div>
              );
            })()}

            <div className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2">
                {t('commissionReport.v2.invoicesCount', { count: drillInvoices.length })}
              </span>
              {loadingDrill ? (
                <StateCard kind="loading" />
              ) : drillInvoices.length === 0 ? (
                <p className="m-0 py-4 text-sm text-body dark:text-bodydark2">{t('commissionReport.noQualifyingInvoices')}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {drillInvoices.map((inv) => {
                    const cs = inv.commissionStatus ? COMMISSION_STATUS_STYLES[inv.commissionStatus] : null;
                    return (
                      <li key={inv.invoiceNumber} className="flex items-center gap-2.5 border-b border-stroke py-2.5 last:border-b-0 dark:border-strokedark">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium text-black dark:text-white">{inv.customerName}</span>
                          <span className="flex flex-wrap items-center gap-1.5 text-xs text-body dark:text-bodydark2">
                            <button type="button" onClick={() => handlePreview(inv.invoiceNumber)} className="hover:underline">{inv.invoiceNumber}</button>
                            {cs && <StatusPill family={cs.family}>{t(cs.key)}</StatusPill>}
                            {approvalPill(inv)}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-black dark:text-white">{formatCurrency(inv.commission)}</span>
                        <RowMenu items={invoiceMenu(inv)} label={t('commissionReport.v2.invoiceActions', { number: inv.invoiceNumber }) as string} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {(canApprove || canMarkPaid) && drillInvoices.some(selectionnable) && (
              <Button size="sm" onClick={() => setTab('factures')}>{t('commissionReport.v2.selectInvoices')}</Button>
            )}
            <Button size="md" variant="secondary" className="text-accent-ink dark:text-accent-ink-dark" onClick={() => openMissing()}>{t('commissionReport.missing.button')}</Button>
          </aside>
        </div>
      )}

      {/* ═══ Factures : tableau complet du mois, sélection et approbation ═════════════ */}
      {tab === 'factures' && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 mr-auto text-lg font-bold capitalize text-black dark:text-white">
              {t('commissionReport.v2.invoicesOf', { month: fmtMonth(parseInt(selectedYear), panelMonth) })}
            </h2>
            <Select value={String(panelMonth)} onChange={(v) => openMonth(parseInt(v))} options={MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name }))} buttonClassName={selectCls} />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
            {loadingDrill ? <StateCard kind="loading" />
              : drillInvoices.length === 0 ? <StateCard kind="empty" title={t('commissionReport.noQualifyingInvoices')} />
              : renderInvoiceTable(drillInvoices)}
          </div>
        </section>
      )}

      {/* ═══ Paiements : marchands Zentact et prime de traitement ═════════════════════ */}
      {tab === 'paiements' && (
        !processing || processing.merchants.length === 0 ? (
          <div className="rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
            <StateCard kind="empty" title={t('commissionReport.v2.noPayments')} />
          </div>
        ) : (
          <section className="rounded-[20px] border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stroke px-6 py-4 dark:border-strokedark">
              <div>
                <h2 className="m-0 text-lg font-bold text-black dark:text-white">{t('commissionReport.processing.title')}</h2>
                <p className="m-0 text-sm text-body dark:text-bodydark2">{t('commissionReport.processing.subtitle')}</p>
              </div>
              <div className="text-right">
                <p className="m-0 text-xs uppercase text-body dark:text-bodydark2">{t('commissionReport.processing.totalBonus')}</p>
                <p className="m-0 text-xl font-bold text-success">{formatCurrency(processing.totals.bonus)}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-body dark:text-bodydark2">
                    <th className="border-b border-stroke px-4 py-3 font-bold dark:border-strokedark">{t('commissionReport.processing.merchant')}</th>
                    <th className="border-b border-stroke px-4 py-3 text-right font-bold dark:border-strokedark">{t('commissionReport.processing.bonus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {processing.merchants.map((m) => (
                    <tr key={m.merchantId}>
                      <td className="border-b border-stroke px-4 py-3 font-medium text-black dark:border-strokedark dark:text-white">{m.name}</td>
                      <td className="border-b border-stroke px-4 py-3 text-right dark:border-strokedark">
                        {m.bonusPaid
                          ? <span className="font-bold text-success">{formatCurrency(m.bonusAmount)}{m.bonusDate ? ` · ${fmtDateOnly(m.bonusDate)}` : ''}</span>
                          : <StatusPill family="neutral">{t('commissionReport.processing.notPaid')}</StatusPill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}

      {/* Preview Modal */}
      {previewModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[99999] p-4" onClick={handleClosePreview}>
          <div className="bg-white dark:bg-boxdark rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-stroke dark:border-strokedark bg-white dark:bg-boxdark">
              <h3 className="text-lg font-semibold text-black dark:text-white">{t('commissionReport.previewTitle', { number: previewModal.invoiceNumber })}</h3>
              <div className="flex items-center gap-3">
                <button onClick={() => handlePrint(previewModal.invoiceNumber)} className="inline-flex items-center gap-1.5 rounded-md border border-stroke bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:text-white dark:hover:bg-meta-4">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                  {t('common.print')}
                </button>
                <button onClick={() => handleDownload(previewModal.invoiceNumber)} className="inline-flex items-center gap-1.5 rounded-md border border-stroke bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:text-white dark:hover:bg-meta-4">
                  <Download className="h-4 w-4" />
                  {t('common.download')}
                </button>
                <button onClick={() => handleEmail(previewModal.invoiceNumber)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  {t('common.email')}
                </button>
                <button onClick={handleClosePreview} className="text-black dark:text-white hover:text-primary transition" title={t('common.close') as string}>
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            <div className="relative overflow-auto" style={{ height: 'calc(90vh - 80px)' }}>
              {previewModal.loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-boxdark">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
                </div>
              )}
              <iframe
                src={`${API_URL}/api/invoices/${previewModal.invoiceNumber}/preview?token=${localStorage.getItem('token')}`}
                className="w-full border-0"
                style={{ minHeight: '600px', height: 'calc(90vh - 80px)' }}
                title={t('commissionReport.invoicePreview') as string}
                onLoad={() => setPreviewModal(prev => ({ ...prev, loading: false }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {emailModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-start overflow-y-auto justify-center z-[99999] p-4" onClick={() => !emailModal.sending && setEmailModal({ isOpen: false, invoiceNumber: '', email: '', sending: false })}>
          <div className="my-auto bg-white dark:bg-boxdark rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-stroke dark:border-strokedark">
              <div>
                <h3 className="text-lg font-bold text-black dark:text-white">{t('commissionReport.emailInvoice.title')}</h3>
                <p className="text-sm text-body">{emailModal.invoiceNumber}</p>
              </div>
              <button onClick={() => !emailModal.sending && setEmailModal({ isOpen: false, invoiceNumber: '', email: '', sending: false })} className="text-black dark:text-white hover:text-primary transition">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <label className="mb-3 block text-sm font-medium text-black dark:text-white">{t('commissionReport.emailInvoice.recipient')}</label>
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
              <button onClick={() => setEmailModal({ isOpen: false, invoiceNumber: '', email: '', sending: false })} disabled={emailModal.sending} className="rounded-md border border-stroke px-6 py-2.5 text-sm font-medium text-black dark:border-strokedark dark:text-white disabled:opacity-50">{t('common.cancel')}</button>
              <button onClick={handleSendEmail} disabled={emailModal.sending} className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
                {emailModal.sending ? (<><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>{t('commissionReport.emailInvoice.sending')}</>) : (<>{t('commissionReport.emailInvoice.send')}</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification — bottom-right toast, auto-dismisses, manually closable */}
      {notification.show && (
        <div className="fixed bottom-6 max-lg:bottom-[calc(4.6rem+env(safe-area-inset-bottom))] right-6 z-[999999] max-w-sm max-lg:left-4 max-lg:right-4">
          <div className={`flex items-start gap-3 rounded-lg px-5 py-3.5 shadow-xl ${notification.type === 'success' ? 'bg-success text-emerald-900' : 'bg-danger text-white'}`}>
            <p className="text-sm font-medium leading-snug">{notification.message}</p>
            <button onClick={() => setNotification(n => ({ ...n, show: false }))} className="-mr-1 ml-auto shrink-0 text-white/80 transition hover:text-white" aria-label={t('common.close') as string}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionReport;
