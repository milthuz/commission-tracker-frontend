import React, { useEffect, useMemo, useRef, useState } from 'react';
import Select from '../../components/Select';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import { fmtMoney, fmtDate } from '../../lib/format';
import {
  Button, StatusPill, StatusFamily, Modal, Tabs, useUrlTab, FilterBar, FilterChip, DataTable, Column,
  InlineError, toast,
} from '../../components/ui';
import PartnerPageHeader from './PageHeader';
import { useMedia } from './useMedia';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('partnerToken')}` });

interface Opportunity {
  id: number; businessName: string;
  contactFirstName: string | null; contactLastName: string | null;
  contactPhone: string | null; contactEmail: string | null;
  repFirstName: string | null; repLastName: string | null;
  repPhone: string | null; repEmail: string | null;
  notes: string | null; status: 'pending' | 'approved' | 'rejected';
  reviewedAt: string | null; rejectionReason: string | null; createdAt: string;
  // Partner-safe subset of the SH-30 CRM follow-up — who owns the Lead at Cluster + its live
  // stage in Zoho CRM, so the partner can track their deal without seeing internal review data.
  assignedRepName: string | null;
  leadStage: string | null;
  dealStage?: string | null;
  depositDate?: string | null;
  leadConverted: boolean;
  // Admin-only (see the "By team member" breakdown below) — a Standard user's own name on every
  // row would just be redundant, so the column is hidden for them rather than the data withheld.
  submittedByName: string | null;
  submittedByEmail: string | null;
  // SH-39/42 — real payout status (never fabricated), and which run (if any) claimed this
  // opportunity. Admin-only concern, per SH-39's own description.
  payoutStatus: 'not_eligible' | 'eligible' | 'in_run' | 'paid';
  payoutRunId: number | null;
}
interface TeamMember { id: number; email: string; displayName: string | null; }
interface PayoutRunReport {
  id: number; periodLabel: string; totalAmount: number; opportunityCount: number;
  finalizedAt: string; hasInvoice: boolean;
}
interface MyInvoice { id: number; payoutRunId: number | null; fileName: string; uploadedAt: string; }
const BLANK_FORM = {
  businessName: '', contactFirstName: '', contactLastName: '', contactPhone: '', contactEmail: '',
  repFirstName: '', repLastName: '', repPhone: '', repEmail: '', notes: '',
};

// « Une couleur = un sens » (StatusPill): every status lands in one of the five families.
const STATUS_FAMILY: Record<Opportunity['status'], StatusFamily> = { pending: 'wait', approved: 'ok', rejected: 'err' };
const PAYOUT_FAMILY: Record<Opportunity['payoutStatus'], StatusFamily> = { not_eligible: 'neutral', eligible: 'new', in_run: 'wait', paid: 'ok' };

type TabId = 'liste' | 'soumettre' | 'versements';
type StatusFilter = 'all' | Opportunity['status'];

const errText = (e: any, fallback: string) => e?.response?.data?.error || fallback;
const fullName = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' ');

const PartnerPortal: React.FC = () => {
  const { t } = useTranslation();
  const { user } = usePartnerAuth();
  // Phones get a two-column table (business + status) — the eight-column one only scrolled
  // sideways at 375 px. Every field stays one tap away in the detail window.
  const phone = useMedia('(max-width: 767px)');
  // The open sidebar leaves « fenêtre − 290 − 48 » px for the table (memory « admin tables »):
  // ~1100 at 1440, ~925 at 1280, ~690 at 1024. Columns whose value is also in the detail
  // window step out as the room shrinks — first the assigned rep, then the payout status.
  const compact = useMedia('(max-width: 1439px)');
  const narrow = useMedia('(max-width: 1279px)');

  // Admins submit on behalf of any of their own reps, picked from the team roster (SH-27
  // follow-up) — they'll have registered on the platform to be selectable, rather than the old
  // free-text name/phone/email fields. Standard users don't need this at all: they ARE the rep.
  const isAdmin = user?.role === 'admin';
  // The active tab lives in the address (?onglet=…), so the tab bar's « Soumettre » can link to it.
  const allowedTabs: TabId[] = isAdmin ? ['liste', 'soumettre', 'versements'] : ['liste', 'soumettre'];
  const [tab, setTab] = useUrlTab<TabId>('liste', allowedTabs);

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Opportunity | null>(null);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedRepUserId, setSelectedRepUserId] = useState('');

  const fetchOpportunities = async () => {
    setLoading(true); setLoadError('');
    try {
      const r = await axios.get(`${API_URL}/api/partner-portal/opportunities`, { headers: authHeaders() });
      setOpportunities(r.data.opportunities || []);
    } catch (e: any) { setLoadError(errText(e, t('partnerPortal.loadError') as string)); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchOpportunities(); }, []);

  useEffect(() => {
    if (!isAdmin || tab !== 'soumettre' || teamMembers.length) return;
    axios.get(`${API_URL}/api/partner-portal/team`, { headers: authHeaders() })
      .then((r) => setTeamMembers((r.data.users || []).filter((u: any) => u.status === 'active')))
      .catch(() => { /* non-fatal — admin can still type the rep manually if this fails */ });
  }, [isAdmin, tab, teamMembers.length]);

  const setF = (k: keyof typeof BLANK_FORM, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const selectRep = (userId: string) => {
    setSelectedRepUserId(userId);
    const member = teamMembers.find((m) => String(m.id) === userId);
    if (!member) { setForm((f) => ({ ...f, repFirstName: '', repLastName: '', repEmail: '' })); return; }
    const nameParts = (member.displayName || member.email).trim().split(/\s+/);
    setForm((f) => ({ ...f, repFirstName: nameParts[0] || '', repLastName: nameParts.slice(1).join(' '), repEmail: member.email, repPhone: '' }));
  };

  const submitOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!form.businessName.trim()) { setSubmitError(t('partnerPortal.businessNameRequired') as string); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/partner-portal/opportunities`, form, { headers: authHeaders() });
      setForm({ ...BLANK_FORM });
      setSelectedRepUserId('');
      toast.success(t('partnerPortal.submitted', { name: form.businessName.trim() }));
      await fetchOpportunities();
      setTab('liste');
    } catch (e: any) { setSubmitError(errText(e, t('partnerPortal.submitError') as string)); }
    finally { setSubmitting(false); }
  };

  // SH-39/42 — Admin-only "which invoice do we need to issue" report + upload. Fetched lazily,
  // same pattern as the team-roster fetch above.
  const [payoutRuns, setPayoutRuns] = useState<PayoutRunReport[]>([]);
  const [myInvoices, setMyInvoices] = useState<MyInvoice[]>([]);
  const [loadingPayoutsTab, setLoadingPayoutsTab] = useState(true);
  const [payoutsError, setPayoutsError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fetchPayoutsTab = async () => {
    setLoadingPayoutsTab(true); setPayoutsError('');
    try {
      const [runsRes, invoicesRes] = await Promise.all([
        axios.get(`${API_URL}/api/partner-portal/payout-runs`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/partner-portal/invoices`, { headers: authHeaders() }),
      ]);
      setPayoutRuns(runsRes.data.runs || []);
      setMyInvoices(invoicesRes.data.invoices || []);
    } catch (e: any) { setPayoutsError(errText(e, t('partnerPortal.payouts.loadError') as string)); }
    finally { setLoadingPayoutsTab(false); }
  };
  useEffect(() => { if (isAdmin && tab === 'versements') fetchPayoutsTab(); }, [isAdmin, tab]);

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadingForRun, setUploadingForRun] = useState<number | null>(null);
  const pickInvoiceFile = (runId: number) => { setUploadingForRun(runId); fileInput.current?.click(); };
  const uploadInvoice = async (file: File) => {
    if (!uploadingForRun) return;
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('payoutRunId', String(uploadingForRun));
      await axios.post(`${API_URL}/api/partner-portal/invoices`, fd, { headers: authHeaders() });
      toast.success(t('partnerPortal.payouts.uploaded'));
      await fetchPayoutsTab();
    } catch (e: any) { setUploadError(errText(e, t('partnerPortal.payouts.uploadFailed') as string)); }
    finally { setUploadingForRun(null); }
  };

  // SH-35/36 — turn the flat list into a small dashboard: counts double as the status filter
  // (same pattern as the internal Opportunity Queue), and a Partner Admin additionally sees a
  // per-team-member breakdown since they're accountable for the whole partnership's pipeline,
  // not just their own submissions (SH-26).
  const stats = {
    all: opportunities.length,
    pending: opportunities.filter((o) => o.status === 'pending').length,
    approved: opportunities.filter((o) => o.status === 'approved').length,
    rejected: opportunities.filter((o) => o.status === 'rejected').length,
  };
  const needle = search.trim().toLowerCase();
  const filteredOpportunities = useMemo(() => opportunities.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (!needle) return true;
    return [o.businessName, o.contactFirstName, o.contactLastName, o.contactEmail, o.submittedByName, o.submittedByEmail, o.assignedRepName]
      .some((v) => v && v.toLowerCase().includes(needle));
  }), [opportunities, statusFilter, needle]);
  const teamBreakdown = isAdmin
    ? Object.values(opportunities.reduce((acc: Record<string, { name: string; count: number }>, o) => {
        const key = o.submittedByName || o.submittedByEmail || (t('partnerPortal.unknownSubmitter') as string);
        acc[key] = acc[key] || { name: key, count: 0 };
        acc[key].count += 1;
        return acc;
      }, {})).sort((a, b) => b.count - a.count)
    : [];

  const statusLabel = (s: Opportunity['status']) => t(`partnerPortal.status.${s}`) as string;
  const chips: FilterChip[] = statusFilter === 'all' ? [] : [{
    key: 'status', label: t('partnerPortal.list.statusChip', { status: statusLabel(statusFilter) }), onRemove: () => setStatusFilter('all'),
  }];

  const stageCell = (o: Opportunity) => o.dealStage ? (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusPill family="new">{t('partnerPortal.dealBadge')}</StatusPill>
      <span>{o.dealStage}</span>
    </span>
  ) : o.leadConverted ? (
    <StatusPill family="ok">{t('partnerPortal.leadConverted')}</StatusPill>
  ) : <span className="text-body dark:text-bodydark2">{o.leadStage || '—'}</span>;

  const contactLine = (o: Opportunity) => [fullName(o.contactFirstName, o.contactLastName), o.contactEmail].filter(Boolean).join(' · ');
  // Date compactee : `8/5/2026` etait ambigu en FR comme en EN, `05/08/26` suit la langue.
  const shortDate = (d: string) => fmtDate(d, { day: '2-digit', month: '2-digit', year: '2-digit' });

  const businessCol: Column<Opportunity> = {
    key: 'business', header: t('partnerPortal.colBusinessContact'), sortValue: (o) => o.businessName,
    render: (o) => {
      const sub = contactLine(o);
      return (
        <div className="leading-tight">
          {/* Free text is truncated (full value on hover) rather than `nowrap`: a long business
              name alone used to force 245 px. */}
          <div className={`${phone ? 'max-w-[160px]' : narrow ? 'max-w-[160px]' : 'max-w-[210px]'} truncate font-bold`} title={o.businessName}>{o.businessName}</div>
          {phone
            ? <div className="mt-0.5 text-xs text-body dark:text-bodydark2">{shortDate(o.createdAt)}</div>
            : sub && <div className={`${narrow ? 'max-w-[160px]' : 'max-w-[210px]'} truncate text-xs text-body dark:text-bodydark2`} title={sub}>{sub}</div>}
        </div>
      );
    },
  };
  const statusCol: Column<Opportunity> = {
    key: 'status', header: t('partnerPortal.colStatus'), sortValue: (o) => statusLabel(o.status),
    render: (o) => <StatusPill family={STATUS_FAMILY[o.status]}>{statusLabel(o.status)}</StatusPill>,
  };
  const columns: Column<Opportunity>[] = phone ? [businessCol, { ...statusCol, align: 'right' }] : [
    businessCol,
    statusCol,
    ...(compact ? [] : [{ key: 'rep', header: t('partnerPortal.colAssignedRep'), className: 'whitespace-nowrap', sortValue: (o: Opportunity) => o.assignedRepName || '', render: (o: Opportunity) => o.assignedRepName || '—' }]),
    { key: 'stage', header: t('partnerPortal.colLeadStage'), sortValue: (o) => o.dealStage || o.leadStage || '', render: stageCell },
    ...(isAdmin && !narrow ? [{
      key: 'payout', header: t('partnerPortal.colPayout'), sortValue: (o: Opportunity) => o.payoutStatus,
      render: (o: Opportunity) => <StatusPill family={PAYOUT_FAMILY[o.payoutStatus]}>{t(`partnerPortal.payoutStatus.${o.payoutStatus}`)}</StatusPill>,
    }] : []),
    {
      key: 'created', header: isAdmin ? t('partnerPortal.colSubmittedOnBy') : t('partnerPortal.colSubmitted'), align: 'right', className: 'whitespace-nowrap tabular-nums',
      sortValue: (o) => new Date(o.createdAt).getTime(),
      // Admins: who submitted it, under the date — its own column cost ~200 px for a name.
      render: (o) => (
        <div className="leading-tight">
          {shortDate(o.createdAt)}
          {isAdmin && (o.submittedByName || o.submittedByEmail) && (
            <div className="ml-auto max-w-[150px] truncate text-xs text-body dark:text-bodydark2" title={o.submittedByName || o.submittedByEmail || ''}>
              {o.submittedByName || o.submittedByEmail}
            </div>
          )}
        </div>
      ),
    },
  ];

  const inputCls = 'h-11 w-full rounded-xl border border-stroke bg-white px-3.5 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white';
  const labelCls = 'flex flex-col gap-1.5 text-[13px] font-bold text-black dark:text-white';
  const card = 'rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';

  const runColumns: Column<PayoutRunReport>[] = [
    { key: 'period', header: t('partnerPortal.payouts.colPeriod'), sortValue: (r) => r.finalizedAt ? new Date(r.finalizedAt).getTime() : r.periodLabel, render: (r) => <span className="font-bold">{r.periodLabel}</span> },
    { key: 'amount', header: t('partnerPortal.payouts.colAmount'), align: 'right', className: 'whitespace-nowrap tabular-nums', sortValue: (r) => r.totalAmount, render: (r) => fmtMoney(r.totalAmount) },
    { key: 'count', header: t('partnerPortal.payouts.colCount'), className: 'whitespace-nowrap', sortValue: (r) => r.opportunityCount, render: (r) => t('partnerPortal.payouts.opportunityCount', { count: r.opportunityCount }) },
    {
      key: 'invoice', header: t('partnerPortal.payouts.colInvoice'), align: 'right',
      render: (r) => r.hasInvoice
        ? <StatusPill family="ok">{t('partnerPortal.payouts.invoiceSubmitted')}</StatusPill>
        : <Button size="xs" variant="primary" onClick={() => pickInvoiceFile(r.id)} disabled={uploadingForRun === r.id}>
            {uploadingForRun === r.id ? t('common.saving') : t('partnerPortal.payouts.uploadInvoice')}
          </Button>,
    },
  ];
  const invoiceColumns: Column<MyInvoice>[] = [
    { key: 'file', header: t('partnerPortal.payouts.colFile'), render: (i) => <span className="break-all">{i.fileName}</span> },
    { key: 'date', header: t('partnerPortal.payouts.colUploaded'), align: 'right', className: 'whitespace-nowrap tabular-nums', sortValue: (i) => new Date(i.uploadedAt).getTime(), render: (i) => fmtDate(i.uploadedAt) },
  ];

  const Field = ({ label, children, wide }: { label: React.ReactNode; children: React.ReactNode; wide?: boolean }) => (
    <div className={`flex flex-col gap-0.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs font-bold text-body dark:text-bodydark2">{label}</dt>
      <dd className="m-0 break-words text-sm text-black dark:text-white">{children}</dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <PartnerPageHeader
        eyebrow={user?.partnerName}
        title={t('partnerPortal.title')}
        actions={tab !== 'soumettre' && (
          <Button variant="primary" size="md" className="max-sm:hidden" onClick={() => setTab('soumettre')}>
            {t('partnerPortal.submitCta')}
          </Button>
        )}
      />

      <input ref={fileInput} type="file" accept="application/pdf,image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadInvoice(f); else setUploadingForRun(null); e.target.value = ''; }} />

      <Tabs<TabId>
        ariaLabel={t('partnerPortal.title') as string}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'liste', label: t('partnerPortal.tabs.list'), count: loading ? undefined : stats.all },
          { id: 'soumettre', label: t('partnerPortal.tabs.submit') },
          ...(isAdmin ? [{ id: 'versements' as TabId, label: t('partnerPortal.tabs.payouts') }] : []),
        ]}
      />

      {tab === 'liste' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label={t('partnerPortal.colStatus') as string}>
            {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)} aria-pressed={statusFilter === s}
                className={`flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition ${
                  statusFilter === s
                    ? 'border-primary bg-[rgba(245,131,69,0.08)] dark:bg-[rgba(245,131,69,0.10)]'
                    : 'border-stroke bg-white hover:border-strokestrong dark:border-strokedark dark:bg-boxdark dark:hover:border-graydark'
                }`}>
                <span className="text-2xl font-bold tabular-nums text-black dark:text-white">{loading ? '—' : stats[s]}</span>
                <span className="text-xs font-bold text-body dark:text-bodydark2">{s === 'all' ? t('common.all') : statusLabel(s)}</span>
              </button>
            ))}
          </div>

          {isAdmin && teamBreakdown.length > 0 && (
            <div className={`${card} p-4`}>
              <p className="m-0 mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2">{t('partnerPortal.teamBreakdownTitle')}</p>
              <div className="flex flex-wrap gap-2">
                {teamBreakdown.map((m) => (
                  <span key={m.name} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-gray px-3 py-1 text-xs font-bold text-[#424242] dark:bg-meta-4 dark:text-bodydark">
                    <span className="truncate">{m.name}</span>
                    <span className="rounded-full bg-white px-1.5 text-black dark:bg-boxdark dark:text-white">{m.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <FilterBar search={search} onSearch={setSearch} searchPlaceholder={t('partnerPortal.list.searchPlaceholder') as string}
            chips={chips} onClearAll={chips.length || search ? () => { setStatusFilter('all'); setSearch(''); } : undefined} />

          <DataTable<Opportunity>
            title={t('partnerPortal.list.tableTitle')}
            columns={columns}
            rows={filteredOpportunities}
            rowKey={(o) => o.id}
            onRowClick={setDetail}
            selectedKey={detail?.id ?? null}
            defaultSort={{ key: 'created', dir: 'desc' }}
            loading={loading}
            error={loadError ? { title: t('partnerPortal.loadError'), body: loadError !== t('partnerPortal.loadError') ? loadError : undefined, onRetry: fetchOpportunities } : null}
            empty={opportunities.length
              ? { title: t('partnerPortal.list.noMatchTitle'), body: t('partnerPortal.list.noMatchBody') }
              : { title: t('partnerPortal.noOpportunities'), body: t('partnerPortal.list.emptyBody') }}
          />
        </>
      )}

      {tab === 'soumettre' && (
        <form onSubmit={submitOpportunity} className={`${card} flex flex-col gap-4 p-4 sm:p-6`}>
          <label className={labelCls}>
            {t('partnerPortal.fBusinessName')} *
            <input value={form.businessName} onChange={(e) => setF('businessName', e.target.value)} className={inputCls} required autoComplete="organization" />
          </label>
          <div className={`grid grid-cols-1 gap-4 ${isAdmin ? 'md:grid-cols-2' : ''}`}>
            <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-xl border border-stroke p-4 dark:border-strokedark">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2">{t('partnerPortal.fContactSection')}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelCls}>{t('partnerPortal.fFirstName')}
                  <input value={form.contactFirstName} onChange={(e) => setF('contactFirstName', e.target.value)} className={inputCls} autoComplete="off" />
                </label>
                <label className={labelCls}>{t('partnerPortal.fLastName')}
                  <input value={form.contactLastName} onChange={(e) => setF('contactLastName', e.target.value)} className={inputCls} autoComplete="off" />
                </label>
                <label className={labelCls}>{t('partnerPortal.fPhone')}
                  <input value={form.contactPhone} onChange={(e) => setF('contactPhone', e.target.value)} type="tel" className={inputCls} autoComplete="off" />
                </label>
                <label className={labelCls}>{t('partnerPortal.fEmail')}
                  <input value={form.contactEmail} onChange={(e) => setF('contactEmail', e.target.value)} type="email" className={inputCls} autoComplete="off" />
                </label>
              </div>
            </fieldset>
            {isAdmin && (
              <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-xl border border-stroke p-4 dark:border-strokedark">
                <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2">{t('partnerPortal.fRepSection')}</legend>
                <Select value={selectedRepUserId} onChange={(v) => selectRep(v)} aria-label={t('partnerPortal.fRepSection') as string}
                  options={[{ value: '', label: t('partnerPortal.fRepSelectPlaceholder') as string }, ...teamMembers.map((m) => ({ value: String(m.id), label: m.displayName || m.email }))]} buttonClassName={inputCls} />
                <p className="m-0 text-xs text-body dark:text-bodydark2">{t('partnerPortal.fRepSelectHint')}</p>
              </fieldset>
            )}
          </div>
          {!isAdmin && <p className="m-0 text-xs text-body dark:text-bodydark2">{t('partnerPortal.fRepAutoNote')}</p>}
          <label className={labelCls}>
            {t('partnerPortal.fNotes')}
            <textarea value={form.notes} onChange={(e) => setF('notes', e.target.value)} rows={3}
              className="w-full rounded-xl border border-stroke bg-white px-3.5 py-2.5 text-sm font-normal text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
          </label>
          {submitError && <InlineError title={t('partnerPortal.submitErrorTitle')} detail={submitError} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={submitting} className="max-sm:w-full">
              {submitting ? t('partnerPortal.submitting') : t('partnerPortal.submit')}
            </Button>
          </div>
        </form>
      )}

      {tab === 'versements' && isAdmin && (
        <>
          {uploadError && <InlineError title={t('partnerPortal.payouts.uploadFailedTitle')} detail={uploadError} />}
          <DataTable<PayoutRunReport>
            title={t('partnerPortal.payouts.tableTitle')}
            columns={runColumns}
            rows={payoutRuns}
            rowKey={(r) => r.id}
            pageSize={0}
            defaultSort={{ key: 'period', dir: 'desc' }}
            loading={loadingPayoutsTab}
            error={payoutsError ? { title: t('partnerPortal.payouts.loadError'), body: payoutsError !== t('partnerPortal.payouts.loadError') ? payoutsError : undefined, onRetry: fetchPayoutsTab } : null}
            empty={{ title: t('partnerPortal.payouts.noRuns') }}
          />
          {!loadingPayoutsTab && myInvoices.length > 0 && (
            <DataTable<MyInvoice>
              title={t('partnerPortal.payouts.uploadHistory')}
              columns={invoiceColumns}
              rows={myInvoices}
              rowKey={(i) => i.id}
              defaultSort={{ key: 'date', dir: 'desc' }}
              pageSize={10}
            />
          )}
        </>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.businessName || ''}
        footer={<Button size="md" onClick={() => setDetail(null)}>{t('common.close')}</Button>}>
        {detail && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill family={STATUS_FAMILY[detail.status]}>{statusLabel(detail.status)}</StatusPill>
              {isAdmin && <StatusPill family={PAYOUT_FAMILY[detail.payoutStatus]}>{t(`partnerPortal.payoutStatus.${detail.payoutStatus}`)}</StatusPill>}
            </div>
            <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {detail.status === 'rejected' && detail.rejectionReason && (
                <Field wide label={t('partnerPortal.detail.rejectionReason')}>{detail.rejectionReason}</Field>
              )}
              <Field label={t('partnerPortal.fContactSection')}>{fullName(detail.contactFirstName, detail.contactLastName) || '—'}</Field>
              <Field label={t('partnerPortal.fPhone')}>{detail.contactPhone || '—'}</Field>
              <Field label={t('partnerPortal.fEmail')}>{detail.contactEmail || '—'}</Field>
              <Field label={t('partnerPortal.colSubmitted')}>{fmtDate(detail.createdAt)}</Field>
              {isAdmin && <Field label={t('partnerPortal.colSubmittedBy')}>{detail.submittedByName || detail.submittedByEmail || '—'}</Field>}
              <Field label={t('partnerPortal.fRepSection')}>{fullName(detail.repFirstName, detail.repLastName) || detail.repEmail || '—'}</Field>
              <Field label={t('partnerPortal.colAssignedRep')}>{detail.assignedRepName || '—'}</Field>
              <Field label={t('partnerPortal.colLeadStage')}>{stageCell(detail)}</Field>
              {detail.notes && <Field wide label={t('partnerPortal.fNotes')}><span className="whitespace-pre-wrap">{detail.notes}</span></Field>}
            </dl>
          </>
        )}
      </Modal>

    </div>
  );
};

export default PartnerPortal;
