import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import PayStubModal, { PayStubData } from '../../components/PayStubModal';

const API_URL = import.meta.env.VITE_API_URL;

interface PreviewMatched {
  invoice_number: string;
  rep: string | null;
  customer: string | null;
  commission: number;
  current_status?: string;
  current_approval?: string;
}

interface PreviewBonus {
  merchant: string | null;
  amount: number;
  matched_zentact_id: string | null;
  date?: string | null;
}

interface PreviewSummary {
  filename: string;
  rep_name: string;
  paid_for_period: string;
  invoices_to_mark: number;
  invoices_skipped_zero: number;
  invoices_not_found: number;
  signup_bonuses_count: number;
  signup_bonuses_amount: number;
  monthly_bonus_amount: number;
  volume_bonuses_count?: number;
  volume_bonuses_amount?: number;
  total_to_pay: number;
}

interface PreviewResponse {
  preview: true;
  summary: PreviewSummary;
  matched: PreviewMatched[];
  skipped_zero: string[];
  not_found: string[];
  bonuses: PreviewBonus[];
  volume_bonuses?: { merchant: string | null; amount: number; matched_zentact_id: string | null }[];
}

// One row per dropped file — tracks both the file and its preview/commit state.
interface FileEntry {
  id: string;                       // local uuid for the row
  file: File;
  status: 'pending' | 'parsing' | 'previewed' | 'committing' | 'done' | 'error';
  preview?: PreviewResponse;
  error?: string;
  expanded?: boolean;
  result?: { invoices_to_mark: number; total: number };
}

interface HistoryRow {
  id: number;
  filename: string;
  rep_name: string;
  paid_for_period: string;
  imported_at: string;
  imported_by: string;
  invoices_marked: number;
  invoices_skipped: number;
  invoices_not_found: number;
  signup_bonuses_count: number;
  signup_bonuses_amount: number;
  monthly_bonus_amount: number;
  total_amount: number;
}

interface StubLine { invoice_number: string; customer: string | null; paid_amount: number; app_commission: number | null; }
interface StubBonus { bonus_type: string; merchant_name: string | null; amount: number; report_date: string | null; }
interface StubDetail { import: HistoryRow; lines: StubLine[]; bonuses: StubBonus[]; }

interface CoverageCell { importTotal: number | null; source: 'file' | 'app' | 'both' | null; unpaid: number; unpaidCount: number; }
interface CoverageRow { rep: string; cells: Record<string, CoverageCell>; totalPaid: number; totalUnpaid: number; }
interface CoverageData { months: string[]; rows: CoverageRow[]; }

interface ProcAccount { merchant_account_id: string; business_name: string; windowStart: string; windowEnd: string; avg: number; activeMonths: number; bonus: number; }
interface ProcRep { rep: string; total: number; accounts: ProcAccount[]; }
interface ProcData { year: number; month: number; grandTotal: number; reps: ProcRep[]; committed?: { count: number; total: number }; }

interface PayrollRep { rep: string; source: string; total: number; lineCount: number; bonusCount: number; }
interface PayrollData { year: number; month: number; dueBy: string | null; recipients: string[]; grandTotal: number; reps: PayrollRep[]; }

const newId = () => Math.random().toString(36).slice(2, 10);

// Map the import-detail response into the shared PayStubModal shape.
const toPayStub = (d: StubDetail): PayStubData => ({
  repName:     d.import.rep_name,
  period:      d.import.paid_for_period?.substring(0, 7) || '',
  subtitle:    d.import.filename,
  lines:       d.lines,
  bonuses:     d.bonuses,
  total:       d.import.total_amount,
  source:      'imported',
  linesStored: d.lines.length > 0,
});

const SUBTABS = ['import', 'coverage', 'payroll', 'bonus', 'adjustments', 'settings'] as const;
type SubTab = typeof SUBTABS[number];

const CommissionImport: React.FC = () => {
  const { t, i18n } = useTranslation();
  // Month name in the current locale (e.g. "May" / "mai"), capitalized.
  const monthName = (m: number) => {
    const s = new Date(2000, m - 1, 1).toLocaleString(i18n.language, { month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subTab, setSubTab] = useState<SubTab>('import');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [committingAll, setCommittingAll] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [stub, setStub] = useState<PayStubData | null>(null);
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  // Payroll send (compile a month's commissions and email payroll).
  const now = new Date();
  const [payYear, setPayYear] = useState(now.getFullYear());
  const [payMonth, setPayMonth] = useState(now.getMonth() + 1);
  const [payData, setPayData] = useState<PayrollData | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [paySending, setPaySending] = useState(false);
  const [payRecipients, setPayRecipients] = useState<string[]>([]);   // canonical recipient list
  const [newRecipient, setNewRecipient] = useState('');
  const [savingRecipients, setSavingRecipients] = useState(false);
  const [selectedReps, setSelectedReps] = useState<Set<string>>(new Set());

  const fetchPayRecipients = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/commissions/payroll/recipients`, { headers: { Authorization: `Bearer ${token}` } });
      setPayRecipients(res.data.recipients || []);
    } catch (_e) { /* silent */ }
  };

  const fetchPayroll = async () => {
    setPayLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/commissions/payroll/preview`, {
        headers: { Authorization: `Bearer ${token}` }, params: { year: payYear, month: payMonth },
      });
      setPayData(res.data);
      setPayRecipients(res.data.recipients || []);
      setSelectedReps(new Set((res.data.reps || []).map((r: { rep: string }) => r.rep))); // default: all
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to load payroll preview');
    } finally { setPayLoading(false); }
  };

  const saveRecipientList = async (emails: string[]) => {
    setSavingRecipients(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(`${API_URL}/api/commissions/payroll/recipients`, { emails }, { headers: { Authorization: `Bearer ${token}` } });
      setPayRecipients(res.data.recipients || emails);
    } catch (e: any) { alert(e?.response?.data?.error || 'Failed to save recipients'); }
    finally { setSavingRecipients(false); }
  };
  const addRecipient = async () => {
    const email = newRecipient.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert(t('admin.commissionImport.payroll.invalidEmail')); return; }
    if (payRecipients.includes(email)) { setNewRecipient(''); return; }
    await saveRecipientList([...payRecipients, email]);
    setNewRecipient('');
  };
  const removeRecipient = async (email: string) => {
    await saveRecipientList(payRecipients.filter(e => e !== email));
  };

  const toggleRep = (rep: string) => setSelectedReps(prev => {
    const next = new Set(prev);
    next.has(rep) ? next.delete(rep) : next.add(rep);
    return next;
  });
  const toggleAllReps = () => setSelectedReps(prev =>
    payData && prev.size === payData.reps.length ? new Set() : new Set((payData?.reps || []).map(r => r.rep)));

  const sendPayroll = async () => {
    if (!payData) return;
    const reps = [...selectedReps];
    if (reps.length === 0) { alert(t('admin.commissionImport.payroll.noReps') as string); return; }
    if (!confirm(t('admin.commissionImport.payroll.confirmSend', { count: reps.length }) as string)) return;
    setPaySending(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/commissions/payroll/send`, { year: payYear, month: payMonth, reps }, { headers: { Authorization: `Bearer ${token}` } });
      alert(t('admin.commissionImport.payroll.sent', { count: res.data.recipients }));
    } catch (e: any) { alert(e?.response?.data?.error || 'Failed to send'); }
    finally { setPaySending(false); }
  };

  // Manual bonus (free-text) on a rep's monthly stub.
  const [reps, setReps] = useState<string[]>([]);
  const [mbRep, setMbRep] = useState('');
  const [mbYear, setMbYear] = useState(new Date().getFullYear());
  const [mbMonth, setMbMonth] = useState(new Date().getMonth() + 1);
  const [mbAmount, setMbAmount] = useState('');
  const [mbDesc, setMbDesc] = useState('');
  const [manualList, setManualList] = useState<{ id: number; rep_name: string; period: string; amount: number; description: string; created_at: string }[]>([]);

  // Full history across all periods (admin console). Reloaded after add/delete.
  const fetchManualBonuses = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/commissions/manual-bonus`, {
        headers: { Authorization: `Bearer ${token}` }, params: { all: 'true' },
      });
      setManualList(res.data.bonuses || []);
    } catch (_e) { /* silent */ }
  };

  const addManualBonus = async () => {
    const amt = parseFloat(mbAmount);
    if (!mbRep || isNaN(amt)) { alert(t('admin.commissionImport.manualBonus.needRepAmount')); return; }
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/commissions/manual-bonus`,
        { repName: mbRep, year: mbYear, month: mbMonth, amount: amt, description: mbDesc },
        { headers: { Authorization: `Bearer ${token}` } });
      setMbAmount(''); setMbDesc('');
      fetchManualBonuses();
    } catch (e: any) { alert(e?.response?.data?.error || 'Failed to add'); }
  };

  const deleteManualBonus = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/commissions/manual-bonus/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchManualBonuses();
    } catch (e: any) { alert(e?.response?.data?.error || 'Failed to delete'); }
  };

  // ── Commission adjustments (carry an unpaid commission forward to a target month) ──
  interface AdjUnpaid { invoice_number: string; customer: string | null; commission: number; commission_status: string; payable_date: string | null; }
  interface AdjRow { id: number; rep_name: string; target_period: string; invoice_number: string | null; customer: string | null; amount: number; source_period: string | null; description: string; }
  const [adjRep, setAdjRep] = useState('');
  const [adjUnpaid, setAdjUnpaid] = useState<AdjUnpaid[]>([]);
  const [adjSelected, setAdjSelected] = useState<Set<string>>(new Set());
  const [adjYear, setAdjYear] = useState(new Date().getFullYear());
  const [adjMonth, setAdjMonth] = useState(new Date().getMonth() + 1);
  const [adjDesc, setAdjDesc] = useState('');
  const [adjList, setAdjList] = useState<AdjRow[]>([]);
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjHidePre2026, setAdjHidePre2026] = useState(true);   // hide the 2025 boundary-artifact invoices
  // Displayed unpaid list (optionally excludes pre-2026 / 2025 invoices).
  const adjUnpaidShown = adjHidePre2026
    ? adjUnpaid.filter(u => !u.payable_date || new Date(u.payable_date).getUTCFullYear() >= 2026)
    : adjUnpaid;

  const fetchAdjUnpaid = async (rep: string) => {
    if (!rep) { setAdjUnpaid([]); return; }
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/commissions/unpaid-commissions`, {
        headers: { Authorization: `Bearer ${token}` }, params: { repName: rep },
      });
      setAdjUnpaid(res.data.invoices || []);
      setAdjSelected(new Set());
    } catch (_e) { /* silent */ }
  };
  const fetchAdjustments = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/commissions/adjustments`, {
        headers: { Authorization: `Bearer ${token}` }, params: { all: 'true' },
      });
      setAdjList(res.data.adjustments || []);
    } catch (_e) { /* silent */ }
  };
  const createAdjustments = async () => {
    if (!adjRep || adjSelected.size === 0) { alert(t('admin.commissionImport.adjustments.needSelection')); return; }
    setAdjBusy(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/commissions/adjustments`,
        { repName: adjRep, year: adjYear, month: adjMonth, invoiceNumbers: [...adjSelected], description: adjDesc },
        { headers: { Authorization: `Bearer ${token}` } });
      setAdjDesc('');
      await fetchAdjUnpaid(adjRep);
      await fetchAdjustments();
    } catch (e: any) { alert(e?.response?.data?.error || 'Failed to create adjustment'); }
    finally { setAdjBusy(false); }
  };
  const deleteAdjustment = async (id: number) => {
    if (!window.confirm(t('admin.commissionImport.adjustments.deleteConfirm') as string)) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/commissions/adjustments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      await fetchAdjustments();
      if (adjRep) await fetchAdjUnpaid(adjRep);
    } catch (e: any) { alert(e?.response?.data?.error || 'Failed to delete'); }
  };
  const toggleAdjSel = (num: string) => setAdjSelected(prev => {
    const n = new Set(prev); n.has(num) ? n.delete(num) : n.add(num); return n;
  });

  // Processing-bonus preview (bi-annual: June covers Dec→May, December covers Jun→Nov).
  const [procYear, setProcYear] = useState(new Date().getFullYear());
  const [procMonth, setProcMonth] = useState<6 | 12>(new Date().getMonth() + 1 >= 6 && new Date().getMonth() + 1 < 12 ? 6 : 12);
  const [procData, setProcData] = useState<ProcData | null>(null);
  const [procLoading, setProcLoading] = useState(false);
  const [procExpanded, setProcExpanded] = useState<string | null>(null);
  // Past report years hidden from the Commission Report + coverage matrix.
  const [disabledYears, setDisabledYears] = useState<number[]>([]);
  const [savingYears, setSavingYears] = useState(false);

  const openStub = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/admin/commission-imports/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setStub(toPayStub(res.data as StubDetail));
    } catch (_e) { /* ignore */ }
  };

  // Open the UNIFIED pay stub (imported or app-generated) for a coverage cell.
  const openPeriodStub = async (rep: string, ym: string) => {
    try {
      const token = localStorage.getItem('token');
      const [year, month] = ym.split('-');
      const res = await axios.get(`${API_URL}/api/commissions/pay-stub`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { repName: rep, year, month: String(parseInt(month)) },
      });
      const d = res.data;
      const subtitle = d.filename && !String(d.filename).startsWith('app-generated') ? d.filename : undefined;
      setStub({
        repName: d.repName, period: d.period, subtitle,
        lines: d.lines || [], bonuses: d.bonuses || [], total: d.total || 0,
        source: d.source, linesStored: d.linesStored,
        missed: d.missed || [], missedTotal: d.missedTotal || 0,
        quota: d.quota || null,
      });
    } catch (_e) { /* ignore */ }
  };

  // Per-month quota override from the matrix flow — backend kicks a recalc (~2 min).
  const waiveQuota = async (waived: boolean) => {
    if (!stub) return;
    const [year, month] = stub.period.split('-');
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/commissions/quota-waiver`, {
        repName: stub.repName, year, month: String(parseInt(month)), waived,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setStub(null);
      alert(t('commissionReport.payStub.quotaWaiveStarted') as string);
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to update quota waiver');
    }
  };

  const fetchProcessing = async () => {
    setProcLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/admin/processing-bonus`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { year: procYear, month: procMonth },
      });
      setProcData(res.data);
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to load processing bonus');
    } finally {
      setProcLoading(false);
    }
  };

  const [procCommitting, setProcCommitting] = useState(false);
  const commitProcessing = async () => {
    if (!procData || procData.reps.length === 0) return;
    if (!window.confirm(t('admin.commissionImport.processing.commitConfirm', { total: fmt(procData.grandTotal) }) as string)) return;
    setProcCommitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/commissions/processing-bonus/commit`,
        { year: procYear, month: procMonth }, { headers: { Authorization: `Bearer ${token}` } });
      alert(t('admin.commissionImport.processing.commitDone', { count: res.data.accounts, total: fmt(res.data.total) }) as string);
      await fetchProcessing();
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to commit');
    } finally { setProcCommitting(false); }
  };

  const uncommitProcessing = async () => {
    if (!window.confirm(t('admin.commissionImport.processing.uncommitConfirm') as string)) return;
    setProcCommitting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/commissions/processing-bonus/uncommit`,
        { year: procYear, month: procMonth }, { headers: { Authorization: `Bearer ${token}` } });
      await fetchProcessing();
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to uncommit');
    } finally { setProcCommitting(false); }
  };

  const fetchCoverage = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/admin/commission-imports/coverage/matrix`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCoverage(res.data);
    } catch (_e) { /* silent */ }
  };

  const fetchHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/admin/commission-imports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHistory(res.data?.imports || []);
    } catch (_e) { /* silent */ }
  };

  const fetchDisabledYears = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/settings/report-years`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDisabledYears(Array.isArray(res.data?.disabledYears) ? res.data.disabledYears : []);
    } catch (_e) { /* silent */ }
  };

  const toggleYear = async (year: number) => {
    const next = disabledYears.includes(year)
      ? disabledYears.filter(y => y !== year)
      : [...disabledYears, year];
    setSavingYears(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(`${API_URL}/api/admin/report-years`, { disabledYears: next }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDisabledYears(Array.isArray(res.data?.disabledYears) ? res.data.disabledYears : next);
      await fetchCoverage(); // matrix months follow the setting
    } catch (_e) { /* keep prior state */ } finally {
      setSavingYears(false);
    }
  };

  useEffect(() => {
    fetchHistory(); fetchCoverage(); fetchDisabledYears();
    // Active salespeople for the manual-bonus rep dropdown.
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/api/salespeople`, { headers: { Authorization: `Bearer ${token}` } });
        setReps(res.data.salespeople || []);
      } catch (_e) { /* silent */ }
    })();
  }, []);
  // Load the full manual-bonus + adjustment history once (both span all periods).
  useEffect(() => { fetchManualBonuses(); fetchAdjustments(); fetchPayRecipients(); }, []);

  // Update a single entry by id
  const updateEntry = (id: string, patch: Partial<FileEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  const previewFile = async (entry: FileEntry) => {
    updateEntry(entry.id, { status: 'parsing', error: undefined });
    try {
      const fd = new FormData();
      fd.append('file', entry.file);
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/admin/commission-import/preview`, fd, {
        headers: { Authorization: `Bearer ${token}` },
      });
      updateEntry(entry.id, { status: 'previewed', preview: res.data });
    } catch (e: any) {
      updateEntry(entry.id, { status: 'error', error: e?.response?.data?.error || e?.message || 'Preview failed' });
    }
  };

  const onFilesAdded = async (files: FileList | File[]) => {
    const newEntries: FileEntry[] = Array.from(files)
      .filter(f => f.name.toLowerCase().endsWith('.xlsx'))
      .map(file => ({ id: newId(), file, status: 'pending' as const }));
    if (newEntries.length === 0) return;
    setEntries(prev => [...prev, ...newEntries]);
    // Preview them sequentially (in parallel would hammer the API with file uploads)
    for (const e of newEntries) {
      await previewFile(e);
    }
  };

  const commitOne = async (entry: FileEntry): Promise<{ invoices_to_mark: number; total: number } | null> => {
    if (entry.status !== 'previewed' || !entry.preview) return null;
    updateEntry(entry.id, { status: 'committing' });
    try {
      const fd = new FormData();
      fd.append('file', entry.file);
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/admin/commission-import/commit`, fd, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = {
        invoices_to_mark: res.data.summary.invoices_to_mark,
        total: res.data.summary.total_to_pay,
      };
      updateEntry(entry.id, { status: 'done', result });
      return result;
    } catch (e: any) {
      updateEntry(entry.id, { status: 'error', error: e?.response?.data?.error || e?.message || 'Commit failed' });
      return null;
    }
  };

  const commitAll = async () => {
    setCommittingAll(true);
    // Process sequentially — protects against race conditions on overlapping
    // commits and gives the user a predictable progress bar.
    const toCommit = entries.filter(e => e.status === 'previewed');
    for (const e of toCommit) {
      await commitOne(e);
    }
    await fetchHistory();
    await fetchCoverage();
    setCommittingAll(false);
  };

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const clearAll = () => setEntries([]);

  const toggleExpand = (id: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, expanded: !e.expanded } : e));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) void onFilesAdded(e.dataTransfer.files);
  };

  const fmt = (val: number) =>
    val.toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', {
      style: 'currency', currency: 'CAD', minimumFractionDigits: 2,
    });

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA'); }
    catch { return iso; }
  };

  // Aggregate totals across all previewed files
  const totals = entries.reduce((acc, e) => {
    if (e.status === 'previewed' && e.preview) {
      acc.files++;
      acc.invoices += e.preview.summary.invoices_to_mark;
      acc.signupCount += e.preview.summary.signup_bonuses_count;
      acc.signupAmount += e.preview.summary.signup_bonuses_amount;
      acc.monthlyBonus += e.preview.summary.monthly_bonus_amount;
      acc.total += e.preview.summary.total_to_pay;
    }
    return acc;
  }, { files: 0, invoices: 0, signupCount: 0, signupAmount: 0, monthlyBonus: 0, total: 0 });

  const anyPreviewed = entries.some(e => e.status === 'previewed');
  const anyParsing = entries.some(e => e.status === 'parsing' || e.status === 'committing');

  const statusBadge = (e: FileEntry) => {
    const map: Record<FileEntry['status'], { cls: string; label: string }> = {
      pending:    { cls: 'bg-gray-200 text-body dark:bg-meta-4',                 label: 'queued' },
      parsing:    { cls: 'bg-primary bg-opacity-10 text-primary',                label: t('admin.commissionImport.parsing') as string },
      previewed:  { cls: 'bg-warning bg-opacity-10 text-warning',                label: 'ready' },
      committing: { cls: 'bg-primary bg-opacity-10 text-primary animate-pulse', label: t('admin.commissionImport.committing') as string },
      done:       { cls: 'bg-success bg-opacity-10 text-success',                label: '✓ done' },
      error:      { cls: 'bg-danger bg-opacity-10 text-danger',                  label: 'error' },
    };
    const m = map[e.status];
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${m.cls}`}>{m.label}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-stroke bg-white p-1 shadow-default dark:border-strokedark dark:bg-boxdark">
        {SUBTABS.map(key => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              subTab === key ? 'bg-primary text-white shadow-sm' : 'text-body hover:bg-gray-50 dark:hover:bg-meta-4'
            }`}
          >
            {t(`admin.commissionImport.tabs.${key}`)}
          </button>
        ))}
      </div>

      {subTab === 'import' && (<>
      {/* Drop zone */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.commissionImport.uploadTitle')}</h3>
          <p className="text-sm text-body">{t('admin.commissionImport.uploadSubtitle')}</p>
        </div>
        <div className="p-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 cursor-pointer rounded-md border-2 border-dashed py-10 transition ${
              dragOver
                ? 'border-primary bg-primary bg-opacity-5'
                : 'border-stroke hover:border-primary dark:border-strokedark dark:hover:border-primary'
            }`}
          >
            <svg className="h-10 w-10 text-body" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <p className="text-sm text-black dark:text-white">{t('admin.commissionImport.dropMultiple')}</p>
            <p className="text-xs text-body">{t('admin.commissionImport.filenameHint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && onFilesAdded(e.target.files)}
            />
          </div>
        </div>
      </div>

      {/* Aggregated totals + bulk actions */}
      {entries.length > 0 && (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-black dark:text-white">
                {t('admin.commissionImport.batchTitle', { count: entries.length })}
              </h3>
              <p className="text-sm text-body">
                {totals.files} ready · {totals.invoices} invoices · {totals.signupCount} signup · {fmt(totals.total)} {t('admin.commissionImport.totalToPay').toLowerCase()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={clearAll}
                disabled={committingAll || anyParsing}
                className="rounded-md border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4 disabled:opacity-50"
              >
                {t('admin.commissionImport.clearAll')}
              </button>
              <button
                onClick={commitAll}
                disabled={!anyPreviewed || committingAll || anyParsing}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50"
              >
                {committingAll ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                    {t('admin.commissionImport.committingAll')}
                  </>
                ) : t('admin.commissionImport.confirmAll', { count: totals.files })}
              </button>
            </div>
          </div>

          {/* Aggregate summary chips */}
          <div className="grid grid-cols-2 gap-3 p-6 md:grid-cols-4">
            <div className="rounded-md border border-stroke p-3 dark:border-strokedark">
              <p className="text-xs uppercase text-body">{t('admin.commissionImport.filesReady')}</p>
              <p className="text-2xl font-bold text-primary">{totals.files} / {entries.length}</p>
            </div>
            <div className="rounded-md border border-stroke p-3 dark:border-strokedark">
              <p className="text-xs uppercase text-body">{t('admin.commissionImport.invoicesToMark')}</p>
              <p className="text-2xl font-bold text-black dark:text-white">{totals.invoices}</p>
            </div>
            <div className="rounded-md border border-stroke p-3 dark:border-strokedark">
              <p className="text-xs uppercase text-body">{t('admin.commissionImport.signupBonuses')} + {t('admin.commissionImport.monthlyBonus').toLowerCase()}</p>
              <p className="text-2xl font-bold text-black dark:text-white">{fmt(totals.signupAmount + totals.monthlyBonus)}</p>
            </div>
            <div className="rounded-md border border-success border-opacity-30 bg-success bg-opacity-5 p-3">
              <p className="text-xs uppercase text-success">{t('admin.commissionImport.totalToPay')}</p>
              <p className="text-2xl font-bold text-success">{fmt(totals.total)}</p>
            </div>
          </div>

          {/* Per-file list */}
          <div className="px-6 pb-6 space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="rounded-md border border-stroke dark:border-strokedark">
                <div className="flex items-center gap-3 px-3 py-2 flex-wrap">
                  <button
                    onClick={() => toggleExpand(e.id)}
                    disabled={e.status !== 'previewed' && e.status !== 'done' && e.status !== 'error'}
                    className="text-body hover:text-primary disabled:opacity-30"
                  >
                    <svg className={`h-3.5 w-3.5 transition-transform ${e.expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-black dark:text-white truncate">{e.file.name}</p>
                    {e.preview && (
                      <p className="text-xs text-body">
                        {e.preview.summary.rep_name} · {e.preview.summary.paid_for_period.substring(0, 7)} ·
                        {' '}{e.preview.summary.invoices_to_mark} inv · {fmt(e.preview.summary.total_to_pay)}
                        {e.preview.summary.invoices_not_found > 0 && (
                          <span className="text-danger"> · ⚠ {e.preview.summary.invoices_not_found} not found</span>
                        )}
                      </p>
                    )}
                    {e.error && <p className="text-xs text-danger">{e.error}</p>}
                  </div>
                  {statusBadge(e)}
                  {e.status !== 'done' && e.status !== 'committing' && (
                    <button
                      onClick={() => removeEntry(e.id)}
                      className="text-body hover:text-danger"
                      title={t('admin.commissionImport.remove') as string}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Expanded preview details */}
                {e.expanded && e.preview && (
                  <div className="border-t border-stroke dark:border-strokedark px-3 pb-3 pt-3 space-y-3">
                    {/* Matched invoices */}
                    <div>
                      <p className="mb-1 text-xs font-semibold text-black dark:text-white">
                        {t('admin.commissionImport.invoicesToMark')} ({e.preview.matched.length})
                      </p>
                      <div className="max-h-48 overflow-auto rounded border border-stroke dark:border-strokedark">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 dark:bg-meta-4 sticky top-0">
                            <tr>
                              <th className="px-2 py-1 text-left">Invoice</th>
                              <th className="px-2 py-1 text-left">Customer</th>
                              <th className="px-2 py-1 text-right">$</th>
                              <th className="px-2 py-1 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {e.preview.matched.map((m) => (
                              <tr key={m.invoice_number} className="border-t border-stroke dark:border-strokedark">
                                <td className="px-2 py-1 font-medium text-primary">{m.invoice_number}</td>
                                <td className="px-2 py-1 truncate max-w-[180px]">{m.customer}</td>
                                <td className="px-2 py-1 text-right">{fmt(m.commission)}</td>
                                <td className="px-2 py-1 text-center">
                                  <span className={`inline-flex rounded-full px-1.5 py-0 text-[9px] font-bold ${
                                    m.current_approval === 'paid' ? 'bg-success bg-opacity-10 text-success'
                                    : m.current_approval === 'approved' ? 'bg-primary bg-opacity-10 text-primary'
                                    : 'bg-warning bg-opacity-10 text-warning'
                                  }`}>{m.current_approval || 'pending'}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Bonuses */}
                    {e.preview.bonuses.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold text-black dark:text-white">
                          {t('admin.commissionImport.signupBonuses')} ({e.preview.bonuses.length})
                        </p>
                        <div className="rounded border border-stroke dark:border-strokedark">
                          <table className="w-full text-xs">
                            <tbody>
                              {e.preview.bonuses.map((b, i) => (
                                <tr key={i} className="border-t border-stroke first:border-t-0 dark:border-strokedark">
                                  <td className="px-2 py-1 truncate max-w-[220px]">{b.merchant}</td>
                                  <td className="px-2 py-1 text-center text-[10px]">
                                    {b.matched_zentact_id
                                      ? <span className="text-success">✓ Zentact</span>
                                      : <span className="text-warning">{t('admin.commissionImport.noMatch')}</span>}
                                  </td>
                                  <td className="px-2 py-1 text-right font-medium">{fmt(b.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Volume / processing bonuses (historical, recorded per account) */}
                    {e.preview.volume_bonuses && e.preview.volume_bonuses.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold text-black dark:text-white">
                          {t('admin.commissionImport.volumeBonuses')} ({e.preview.volume_bonuses.length})
                        </p>
                        <div className="rounded border border-stroke dark:border-strokedark">
                          <table className="w-full text-xs">
                            <tbody>
                              {e.preview.volume_bonuses.map((b, i) => (
                                <tr key={i} className="border-t border-stroke first:border-t-0 dark:border-strokedark">
                                  <td className="px-2 py-1 truncate max-w-[220px]">{b.merchant}</td>
                                  <td className="px-2 py-1 text-center text-[10px]">
                                    {b.matched_zentact_id
                                      ? <span className="text-success">✓ Zentact</span>
                                      : <span className="text-warning" title={t('admin.commissionImport.volumeNoMatchHint') as string}>{t('admin.commissionImport.noMatch')}</span>}
                                  </td>
                                  <td className="px-2 py-1 text-right font-medium">{fmt(b.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {e.preview.volume_bonuses.some(b => !b.matched_zentact_id) && (
                          <p className="mt-1 text-[10px] text-warning">{t('admin.commissionImport.volumeNoMatchHint')}</p>
                        )}
                      </div>
                    )}

                    {/* Warnings */}
                    {e.preview.not_found.length > 0 && (
                      <p className="text-xs text-danger">
                        ⚠ {t('admin.commissionImport.notFoundDetails', { count: e.preview.not_found.length })}:
                        {' '}{e.preview.not_found.slice(0, 8).join(', ')}{e.preview.not_found.length > 8 ? '…' : ''}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.commissionImport.historyTitle')}</h3>
            <p className="text-sm text-body">{t('admin.commissionImport.historySubtitle')}</p>
          </div>
          <div className="overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-meta-4 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">{t('admin.commissionImport.filename')}</th>
                  <th className="px-3 py-2 text-left">Rep</th>
                  <th className="px-3 py-2 text-left">{t('admin.commissionImport.period')}</th>
                  <th className="px-3 py-2 text-right">{t('admin.commissionImport.invoicesToMark')}</th>
                  <th className="px-3 py-2 text-right">{t('admin.commissionImport.signupBonuses')}</th>
                  <th className="px-3 py-2 text-right">{t('admin.commissionImport.totalToPay')}</th>
                  <th className="px-3 py-2 text-left">{t('admin.commissionImport.importedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} onClick={() => openStub(h.id)} className="cursor-pointer border-t border-stroke transition hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4/30">
                    <td className="px-3 py-1.5 truncate max-w-[280px] text-primary">{h.filename}</td>
                    <td className="px-3 py-1.5">{h.rep_name}</td>
                    <td className="px-3 py-1.5">{h.paid_for_period?.substring(0, 7)}</td>
                    <td className="px-3 py-1.5 text-right">{h.invoices_marked}</td>
                    <td className="px-3 py-1.5 text-right">{h.signup_bonuses_count} ({fmt(h.signup_bonuses_amount)})</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{fmt(h.total_amount)}</td>
                    <td className="px-3 py-1.5 text-body">{fmtDate(h.imported_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </>)}

      {subTab === 'coverage' && (<>
      {/* Coverage / reconciliation matrix: rep × month */}
      {coverage && coverage.rows.length > 0 && (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.commissionImport.coverage.title')}</h3>
            <p className="text-sm text-body">{t('admin.commissionImport.coverage.subtitle')}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-body">
              <span><span className="font-bold text-success">✓</span> {t('admin.commissionImport.coverage.legendFile')}</span>
              <span><span className="font-bold text-primary">✓</span> {t('admin.commissionImport.coverage.legendApp')}</span>
              <span><span className="font-bold text-warning">●</span> {t('admin.commissionImport.coverage.legendUnpaid')}</span>
              <span><span className="font-bold">—</span> {t('admin.commissionImport.coverage.legendNothing')}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-meta-4">
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left dark:bg-meta-4">Rep</th>
                  {coverage.months.map(ym => (
                    <th key={ym} className="whitespace-nowrap px-2 py-2 text-center font-medium">{ym}</th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-2 text-right">{t('admin.commissionImport.coverage.totalPaid')}</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">{t('admin.commissionImport.coverage.totalUnpaid')}</th>
                </tr>
              </thead>
              <tbody>
                {coverage.rows.map(row => (
                  <tr key={row.rep} className="border-t border-stroke dark:border-strokedark">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5 font-medium text-black dark:bg-boxdark dark:text-white">
                      {row.rep}
                    </td>
                    {coverage.months.map(ym => {
                      const c = row.cells[ym];
                      const hasImport = c && c.importTotal != null;
                      const hasUnpaid = c && c.unpaid > 0.005;
                      return (
                        <td
                          key={ym}
                          onClick={() => (hasImport || hasUnpaid) && openPeriodStub(row.rep, ym)}
                          title={`${row.rep} · ${ym}`}
                          className={`whitespace-nowrap px-2 py-1.5 text-center align-middle ${
                            hasImport || hasUnpaid ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-meta-4/40' : ''
                          }`}
                        >
                          {hasImport ? (
                            <div className="leading-tight">
                              <span className={`font-bold ${c.source === 'file' ? 'text-success' : 'text-primary'}`}>✓</span>
                              <span className="ml-1 text-black dark:text-white">{fmt(c.importTotal!)}</span>
                              {hasUnpaid && (
                                <div className="text-[10px] font-medium text-warning">● {fmt(c.unpaid)}</div>
                              )}
                            </div>
                          ) : hasUnpaid ? (
                            <span className="font-medium text-warning">● {fmt(c.unpaid)}</span>
                          ) : (
                            <span className="text-bodydark2">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold text-black dark:text-white">{fmt(row.totalPaid)}</td>
                    <td className={`whitespace-nowrap px-3 py-1.5 text-right font-semibold ${row.totalUnpaid > 0.005 ? 'text-warning' : 'text-body'}`}>
                      {fmt(row.totalUnpaid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </>)}

      {subTab === 'payroll' && (<>
      {/* Payroll recipients — managed list (add one at a time, remove individually) */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.commissionImport.payroll.recipientsTitle')}</h3>
          <p className="text-sm text-body">{t('admin.commissionImport.payroll.recipientsSubtitle')}</p>
        </div>
        <div className="px-6 py-4">
          {payRecipients.length === 0 ? (
            <p className="mb-3 text-sm text-body">{t('admin.commissionImport.payroll.noRecipients')}</p>
          ) : (
            <ul className="mb-3 flex flex-wrap gap-2">
              {payRecipients.map(em => (
                <li key={em} className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                  {em}
                  <button onClick={() => removeRecipient(em)} disabled={savingRecipients} title={t('common.delete') as string}
                    className="text-primary/70 transition hover:text-danger disabled:opacity-50">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input type="email" value={newRecipient} onChange={(e) => setNewRecipient(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addRecipient(); }}
              placeholder="paie@compagnie.com"
              className="w-72 rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
            <button onClick={addRecipient} disabled={savingRecipients || !newRecipient.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
              {t('admin.commissionImport.payroll.addRecipient')}
            </button>
          </div>
        </div>
      </div>

      {/* Payroll send — compile a month and email it to payroll */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.commissionImport.payroll.title')}</h3>
          <p className="text-sm text-body">{t('admin.commissionImport.payroll.subtitle')}</p>
        </div>
        <div className="px-6 py-4">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-body">{t('admin.commissionImport.payroll.month')}</label>
              <div className="flex gap-2">
                <select value={payMonth} onChange={(e) => setPayMonth(parseInt(e.target.value))}
                  className="rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{monthName(m)}</option>)}
                </select>
                <input type="number" value={payYear} onChange={(e) => setPayYear(parseInt(e.target.value) || payYear)}
                  className="w-24 rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
              </div>
            </div>
            <button onClick={fetchPayroll} disabled={payLoading}
              className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-white disabled:opacity-50">
              {payLoading ? t('admin.commissionImport.processing.loading') : t('admin.commissionImport.payroll.preview')}
            </button>
            {payData?.dueBy && (
              <span className="text-sm text-body">{t('admin.commissionImport.payroll.dueBy')}: <span className="font-semibold text-warning">{payData.dueBy}</span></span>
            )}
          </div>

          {payData && (
            <>
              {payData.reps.length === 0 ? (
                <p className="py-6 text-center text-sm text-body">{t('admin.commissionImport.payroll.none')}</p>
              ) : (
                <>
                  <div className="mb-3 overflow-x-auto rounded border border-stroke dark:border-strokedark">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-2 dark:bg-meta-4">
                        <tr>
                          <th className="px-3 py-2 text-center font-medium">
                            <input type="checkbox" checked={selectedReps.size === payData.reps.length && payData.reps.length > 0}
                              onChange={toggleAllReps} title={t('admin.commissionImport.payroll.selectAll') as string} />
                          </th>
                          <th className="px-4 py-2 text-left font-medium">Rep</th>
                          <th className="px-4 py-2 text-center font-medium">{t('admin.commissionImport.payroll.status')}</th>
                          <th className="px-4 py-2 text-right font-medium">Total</th></tr>
                      </thead>
                      <tbody>
                        {payData.reps.map(r => (
                          <tr key={r.rep} className={`border-t border-stroke dark:border-strokedark ${selectedReps.has(r.rep) ? '' : 'opacity-50'}`}>
                            <td className="px-3 py-2 text-center">
                              <input type="checkbox" checked={selectedReps.has(r.rep)} onChange={() => toggleRep(r.rep)} />
                            </td>
                            <td className="px-4 py-2 font-medium text-black dark:text-white">{r.rep}</td>
                            <td className="px-4 py-2 text-center">
                              {r.source === 'imported'
                                ? <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" />{t('admin.commissionImport.payroll.statusReady')}</span>
                                : <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning"><span className="h-1.5 w-1.5 rounded-full bg-warning" />{t('admin.commissionImport.payroll.statusToApprove')}</span>}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-black dark:text-white">{fmt(r.total)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-black dark:border-white">
                          <td className="px-4 py-2 font-bold text-black dark:text-white" colSpan={3}>{t('admin.commissionImport.payroll.selectedTotal', { count: selectedReps.size })}</td>
                          <td className="px-4 py-2 text-right font-bold text-primary">{fmt(payData.reps.filter(r => selectedReps.has(r.rep)).reduce((s, r) => s + r.total, 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <button onClick={sendPayroll} disabled={paySending || payRecipients.length === 0 || selectedReps.size === 0}
                    className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
                    title={payRecipients.length === 0 ? t('admin.commissionImport.payroll.noRecipients') as string : undefined}>
                    {paySending ? t('admin.commissionImport.payroll.sending') : t('admin.commissionImport.payroll.send')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      </>)}

      {subTab === 'bonus' && (<>
      {/* Processing bonus (bi-annual) preview */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.commissionImport.processing.title')}</h3>
          <p className="text-sm text-body">{t('admin.commissionImport.processing.subtitle')}</p>
        </div>
        <div className="px-6 py-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              value={procMonth}
              onChange={(e) => setProcMonth(parseInt(e.target.value) as 6 | 12)}
              className="rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input"
            >
              <option value={6}>{t('admin.commissionImport.processing.june')}</option>
              <option value={12}>{t('admin.commissionImport.processing.december')}</option>
            </select>
            <input
              type="number"
              value={procYear}
              onChange={(e) => setProcYear(parseInt(e.target.value) || procYear)}
              className="w-24 rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white"
            />
            <button
              onClick={fetchProcessing}
              disabled={procLoading}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
            >
              {procLoading ? t('admin.commissionImport.processing.loading') : t('admin.commissionImport.processing.preview')}
            </button>
            {procData && (
              <span className="text-sm text-body">
                {t('admin.commissionImport.processing.total')}:
                <span className="ml-1 font-semibold text-black dark:text-white">{fmt(procData.grandTotal)}</span>
              </span>
            )}
            {procData && procData.reps.length > 0 && (
              <button
                onClick={commitProcessing}
                disabled={procCommitting}
                className="rounded-md bg-success px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
              >
                {procCommitting ? t('admin.commissionImport.processing.loading') : t('admin.commissionImport.processing.commit')}
              </button>
            )}
          </div>
          {procData && procData.committed && procData.committed.count > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-success/30 bg-success/10 px-4 py-2 text-sm">
              <span className="text-black dark:text-white">
                {t('admin.commissionImport.processing.committedInfo', { count: procData.committed.count, total: fmt(procData.committed.total) })}
              </span>
              <button
                onClick={uncommitProcessing}
                disabled={procCommitting}
                className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
              >
                {t('admin.commissionImport.processing.uncommit')}
              </button>
            </div>
          )}
          {procData && (
            procData.reps.length === 0 ? (
              <p className="py-6 text-center text-sm text-body">{t('admin.commissionImport.processing.none')}</p>
            ) : (
              <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
                <table className="w-full text-sm">
                  <thead className="bg-gray-2 dark:bg-meta-4">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Rep</th>
                      <th className="px-4 py-2 text-right font-medium">{t('admin.commissionImport.processing.accounts')}</th>
                      <th className="px-4 py-2 text-right font-medium">{t('admin.commissionImport.processing.bonus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {procData.reps.map((r) => (
                      <React.Fragment key={r.rep}>
                        <tr
                          onClick={() => setProcExpanded(procExpanded === r.rep ? null : r.rep)}
                          className="cursor-pointer border-t border-stroke transition hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4/30"
                        >
                          <td className="px-4 py-2 font-medium text-black dark:text-white">{procExpanded === r.rep ? '▾' : '▸'} {r.rep}</td>
                          <td className="px-4 py-2 text-right text-body">{r.accounts.length}</td>
                          <td className="px-4 py-2 text-right font-semibold text-success">{fmt(r.total)}</td>
                        </tr>
                        {procExpanded === r.rep && r.accounts.map((a) => (
                          <tr key={a.merchant_account_id} className="border-t border-stroke bg-gray-50 text-xs dark:border-strokedark dark:bg-meta-4/20">
                            <td className="px-4 py-1.5 pl-8 text-black dark:text-white">{a.business_name}<span className="ml-2 text-body">({a.windowStart} → {a.windowEnd})</span></td>
                            <td className="px-4 py-1.5 text-right text-body">{a.activeMonths} mo · ~{fmt(a.avg)}/mo</td>
                            <td className="px-4 py-1.5 text-right text-body">{fmt(a.bonus)}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      {/* Manual bonus — add a free-text bonus to a rep's monthly pay stub */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.commissionImport.manualBonus.title')}</h3>
          <p className="text-sm text-body">{t('admin.commissionImport.manualBonus.subtitle')}</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-body">Rep</label>
              <select value={mbRep} onChange={(e) => setMbRep(e.target.value)}
                className="w-48 rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input">
                <option value="">{t('admin.commissionImport.manualBonus.selectRep')}</option>
                {reps.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-body">{t('admin.commissionImport.payroll.month')}</label>
              <div className="flex gap-2">
                <select value={mbMonth} onChange={(e) => setMbMonth(parseInt(e.target.value))}
                  className="rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{monthName(m)}</option>)}
                </select>
                <input type="number" value={mbYear} onChange={(e) => setMbYear(parseInt(e.target.value) || mbYear)}
                  className="w-24 rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-body">{t('admin.commissionImport.manualBonus.amount')}</label>
              <input type="number" step="0.01" value={mbAmount} onChange={(e) => setMbAmount(e.target.value)} placeholder="0.00"
                className="w-28 rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-body">{t('admin.commissionImport.manualBonus.description')}</label>
              <input type="text" value={mbDesc} onChange={(e) => setMbDesc(e.target.value)}
                placeholder={t('admin.commissionImport.manualBonus.descPlaceholder') as string}
                className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
            </div>
            <button onClick={addManualBonus}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90">
              {t('admin.commissionImport.manualBonus.add')}
            </button>
          </div>

          {manualList.length > 0 && (
            <div className="mt-6">
              <h4 className="mb-2 text-sm font-semibold text-black dark:text-white">{t('admin.commissionImport.manualBonus.historyTitle')}</h4>
              <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-gray-2 dark:bg-meta-4">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium whitespace-nowrap">{t('admin.commissionImport.manualBonus.date')}</th>
                      <th className="px-4 py-2 text-left font-medium whitespace-nowrap">{t('admin.commissionImport.manualBonus.period')}</th>
                      <th className="px-4 py-2 text-left font-medium">Rep</th>
                      <th className="px-4 py-2 text-left font-medium">{t('admin.commissionImport.manualBonus.description')}</th>
                      <th className="px-4 py-2 text-right font-medium">{t('admin.commissionImport.manualBonus.amount')}</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualList.map(m => (
                      <tr key={m.id} className="border-t border-stroke dark:border-strokedark">
                        <td className="px-4 py-2 text-body whitespace-nowrap">{fmtDate(m.created_at)}</td>
                        <td className="px-4 py-2 text-body whitespace-nowrap">{monthName(new Date(m.period).getUTCMonth() + 1)} {new Date(m.period).getUTCFullYear()}</td>
                        <td className="px-4 py-2 text-black dark:text-white whitespace-nowrap">{m.rep_name}</td>
                        <td className="px-4 py-2 text-body">{m.description || '—'}</td>
                        <td className="px-4 py-2 text-right font-semibold text-success whitespace-nowrap">{fmt(m.amount)}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => deleteManualBonus(m.id)} className="whitespace-nowrap text-xs text-danger hover:underline">{t('common.delete')}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      </>)}

      {subTab === 'adjustments' && (<>
      {/* Commission adjustments — carry an unpaid commission from a past month to a target month */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.commissionImport.adjustments.title')}</h3>
          <p className="text-sm text-body">{t('admin.commissionImport.adjustments.subtitle')}</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-body">Rep</label>
              <select value={adjRep} onChange={(e) => { setAdjRep(e.target.value); fetchAdjUnpaid(e.target.value); }}
                className="w-48 rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input">
                <option value="">{t('admin.commissionImport.manualBonus.selectRep')}</option>
                {reps.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-body">{t('admin.commissionImport.adjustments.targetMonth')}</label>
              <div className="flex gap-2">
                <select value={adjMonth} onChange={(e) => setAdjMonth(parseInt(e.target.value))}
                  className="rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{monthName(m)}</option>)}
                </select>
                <input type="number" value={adjYear} onChange={(e) => setAdjYear(parseInt(e.target.value) || adjYear)}
                  className="w-24 rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="mb-1 block text-xs font-medium text-body">{t('admin.commissionImport.manualBonus.description')}</label>
              <input type="text" value={adjDesc} onChange={(e) => setAdjDesc(e.target.value)}
                placeholder={t('admin.commissionImport.adjustments.descPlaceholder') as string}
                className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white" />
            </div>
            <button onClick={createAdjustments} disabled={adjBusy || adjSelected.size === 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
              {adjBusy ? '…' : t('admin.commissionImport.adjustments.carry', { count: adjSelected.size })}
            </button>
          </div>

          {/* Unpaid commissions for the selected rep — pick which to carry forward */}
          {adjRep && (
            <label className="mt-3 flex items-center gap-2 text-xs font-medium text-body">
              <input type="checkbox" checked={adjHidePre2026}
                onChange={(e) => {
                  setAdjHidePre2026(e.target.checked);
                  if (e.target.checked) setAdjSelected(prev => {
                    const next = new Set<string>();
                    adjUnpaid.forEach(u => { if (prev.has(u.invoice_number) && (!u.payable_date || new Date(u.payable_date).getUTCFullYear() >= 2026)) next.add(u.invoice_number); });
                    return next;
                  });
                }} />
              {t('admin.commissionImport.adjustments.hide2025')}
            </label>
          )}
          {adjRep && (
            adjUnpaidShown.length === 0 ? (
              <p className="mt-4 text-sm text-body">{t('admin.commissionImport.adjustments.noUnpaid')}</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded border border-stroke dark:border-strokedark">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-gray-2 dark:bg-meta-4">
                    <tr>
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2 text-left font-medium">{t('admin.commissionImport.invoicesToMark')}</th>
                      <th className="px-3 py-2 text-left font-medium">{t('admin.commissionImport.manualBonus.period')}</th>
                      <th className="px-3 py-2 text-left font-medium">Client</th>
                      <th className="px-3 py-2 text-right font-medium">{t('admin.commissionImport.manualBonus.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjUnpaidShown.map(u => (
                      <tr key={u.invoice_number} className={`border-t border-stroke dark:border-strokedark ${adjSelected.has(u.invoice_number) ? 'bg-primary/5' : ''}`}>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={adjSelected.has(u.invoice_number)} onChange={() => toggleAdjSel(u.invoice_number)} />
                        </td>
                        <td className="px-3 py-2 font-medium text-primary">{u.invoice_number}</td>
                        <td className="px-3 py-2 text-body whitespace-nowrap">{u.payable_date ? `${monthName(new Date(u.payable_date).getUTCMonth() + 1)} ${new Date(u.payable_date).getUTCFullYear()}` : '—'}</td>
                        <td className="px-3 py-2 text-black dark:text-white">{u.customer || '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-black dark:text-white whitespace-nowrap">{fmt(u.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* History of adjustments */}
          {adjList.length > 0 && (
            <div className="mt-6">
              <h4 className="mb-2 text-sm font-semibold text-black dark:text-white">{t('admin.commissionImport.adjustments.historyTitle')}</h4>
              <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-gray-2 dark:bg-meta-4">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">{t('admin.commissionImport.adjustments.targetMonth')}</th>
                      <th className="px-3 py-2 text-left font-medium">Rep</th>
                      <th className="px-3 py-2 text-left font-medium">{t('admin.commissionImport.invoicesToMark')}</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">{t('admin.commissionImport.adjustments.from')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('admin.commissionImport.manualBonus.amount')}</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjList.map(a => (
                      <tr key={a.id} className="border-t border-stroke dark:border-strokedark">
                        <td className="px-3 py-2 text-body whitespace-nowrap">{monthName(new Date(a.target_period).getUTCMonth() + 1)} {new Date(a.target_period).getUTCFullYear()}</td>
                        <td className="px-3 py-2 text-black dark:text-white whitespace-nowrap">{a.rep_name}</td>
                        <td className="px-3 py-2 font-medium text-primary">{a.invoice_number || '—'}<span className="ml-2 text-body">{a.description || ''}</span></td>
                        <td className="px-3 py-2 text-body whitespace-nowrap">{a.source_period ? `${monthName(new Date(a.source_period).getUTCMonth() + 1)} ${new Date(a.source_period).getUTCFullYear()}` : '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-success whitespace-nowrap">{fmt(a.amount)}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => deleteAdjustment(a.id)} className="whitespace-nowrap text-xs text-danger hover:underline">{t('common.delete')}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      </>)}

      {subTab === 'settings' && (<>
      {/* Report years visibility — hide a noisy past year (e.g. 2025) everywhere */}
      {new Date().getFullYear() > 2025 && (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.commissionImport.reportYears.title')}</h3>
            <p className="text-sm text-body">{t('admin.commissionImport.reportYears.subtitle')}</p>
          </div>
          <div className="px-6 py-4">
            {Array.from({ length: new Date().getFullYear() - 2025 }, (_, i) => 2025 + i).map(y => {
              const hidden = disabledYears.includes(y);
              return (
                <div key={y} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-black dark:text-white">{y}</span>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      hidden ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                    }`}>
                      {hidden ? t('admin.commissionImport.reportYears.hidden') : t('admin.commissionImport.reportYears.visible')}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleYear(y)}
                    disabled={savingYears}
                    className={`whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                      hidden ? 'bg-success hover:bg-success/90' : 'bg-warning hover:bg-warning/90'
                    }`}
                  >
                    {hidden ? t('admin.commissionImport.reportYears.show') : t('admin.commissionImport.reportYears.hide')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      </>)}

      {/* Pay Stub detail modal (shared component) */}
      <PayStubModal data={stub} onClose={() => setStub(null)} showAppCalc onQuotaWaive={waiveQuota} onAdjusted={() => { fetchCoverage(); fetchAdjustments(); }} />
    </div>
  );
};

export default CommissionImport;
