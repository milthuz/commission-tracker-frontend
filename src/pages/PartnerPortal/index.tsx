import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import { dialog } from '../../lib/dialog';

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

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-warning/15 text-warning',
  approved: 'bg-success/15 text-green-700 dark:text-success',
  rejected: 'bg-danger/15 text-danger',
};
const PAYOUT_BADGE: Record<string, string> = {
  not_eligible: 'bg-gray-2 text-gray-500 dark:bg-meta-4',
  eligible: 'bg-success/15 text-green-700 dark:text-success',
  in_run: 'bg-primary/15 text-primary',
  paid: 'bg-primary text-white',
};

const PartnerPortal: React.FC = () => {
  const { t } = useTranslation();
  const { user } = usePartnerAuth();

  const [tab, setTab] = useState<'list' | 'submit' | 'payouts'>('list');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // Admins submit on behalf of any of their own reps, picked from the team roster (SH-27
  // follow-up) — they'll have registered on the platform to be selectable, rather than the old
  // free-text name/phone/email fields. Standard users don't need this at all: they ARE the rep.
  const isAdmin = user?.role === 'admin';
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedRepUserId, setSelectedRepUserId] = useState('');

  const fetchOpportunities = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/partner-portal/opportunities`, { headers: authHeaders() });
      setOpportunities(r.data.opportunities || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('partnerPortal.loadError') as string); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchOpportunities(); }, []);

  useEffect(() => {
    if (!isAdmin || tab !== 'submit' || teamMembers.length) return;
    axios.get(`${API_URL}/api/partner-portal/team`, { headers: authHeaders() })
      .then((r) => setTeamMembers((r.data.users || []).filter((u: any) => u.status === 'active')))
      .catch(() => { /* non-fatal — admin can still type the rep manually if this fails */ });
  }, [isAdmin, tab, teamMembers.length]);

  const selectRep = (userId: string) => {
    setSelectedRepUserId(userId);
    const member = teamMembers.find((m) => String(m.id) === userId);
    if (!member) { setF('repFirstName', ''); setF('repLastName', ''); setF('repEmail', ''); return; }
    const nameParts = (member.displayName || member.email).trim().split(/\s+/);
    setForm((f) => ({ ...f, repFirstName: nameParts[0] || '', repLastName: nameParts.slice(1).join(' '), repEmail: member.email, repPhone: '' }));
  };

  const submitOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.businessName.trim()) { dialog.alert(t('partnerPortal.businessNameRequired') as string); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/partner-portal/opportunities`, form, { headers: authHeaders() });
      setForm({ ...BLANK_FORM });
      await fetchOpportunities();
      setTab('list');
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('partnerPortal.submitError') as string); }
    finally { setSubmitting(false); }
  };

  // SH-39/42 — Admin-only "which invoice do we need to issue" report + upload. Fetched lazily,
  // same pattern as the team-roster fetch above.
  const [payoutRuns, setPayoutRuns] = useState<PayoutRunReport[]>([]);
  const [myInvoices, setMyInvoices] = useState<MyInvoice[]>([]);
  const [loadingPayoutsTab, setLoadingPayoutsTab] = useState(true);
  const fetchPayoutsTab = async () => {
    setLoadingPayoutsTab(true);
    try {
      const [runsRes, invoicesRes] = await Promise.all([
        axios.get(`${API_URL}/api/partner-portal/payout-runs`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/partner-portal/invoices`, { headers: authHeaders() }),
      ]);
      setPayoutRuns(runsRes.data.runs || []);
      setMyInvoices(invoicesRes.data.invoices || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('partnerPortal.payouts.loadError') as string); }
    finally { setLoadingPayoutsTab(false); }
  };
  useEffect(() => { if (isAdmin && tab === 'payouts') fetchPayoutsTab(); }, [isAdmin, tab]);

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadingForRun, setUploadingForRun] = useState<number | null>(null);
  const pickInvoiceFile = (runId: number) => { setUploadingForRun(runId); fileInput.current?.click(); };
  const uploadInvoice = async (file: File) => {
    if (!uploadingForRun) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('payoutRunId', String(uploadingForRun));
      await axios.post(`${API_URL}/api/partner-portal/invoices`, fd, { headers: authHeaders() });
      await fetchPayoutsTab();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('partnerPortal.payouts.uploadFailed') as string); }
    finally { setUploadingForRun(null); }
  };

  const inputCls = 'w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';
  const setF = (k: keyof typeof BLANK_FORM, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
  const filteredOpportunities = opportunities.filter((o) => statusFilter === 'all' || o.status === statusFilter);
  const teamBreakdown = isAdmin
    ? Object.values(opportunities.reduce((acc: Record<string, { name: string; count: number }>, o) => {
        const key = o.submittedByName || o.submittedByEmail || (t('partnerPortal.unknownSubmitter') as string);
        acc[key] = acc[key] || { name: key, count: 0 };
        acc[key].count += 1;
        return acc;
      }, {})).sort((a, b) => b.count - a.count)
    : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-title-md2 font-semibold text-black dark:text-white">{t('partnerPortal.title')}</h1>
        <p className="text-sm text-body">{user?.partnerName}</p>
      </div>

      <input ref={fileInput} type="file" accept="application/pdf,image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadInvoice(f); e.target.value = ''; }} />

      <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-stroke bg-white p-1 shadow-default dark:border-strokedark dark:bg-boxdark">
        {(isAdmin ? (['list', 'submit', 'payouts'] as const) : (['list', 'submit'] as const)).map((key) => (
          <button key={key} onClick={() => setTab(key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${tab === key ? 'bg-primary text-white shadow-sm' : 'text-body hover:bg-gray-50 dark:hover:bg-meta-4'}`}>
            {t(`partnerPortal.tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3.5 text-left transition ${
                  statusFilter === s
                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                    : 'border-stroke bg-white hover:border-primary/40 dark:border-strokedark dark:bg-boxdark'
                }`}>
                <span className="text-2xl font-bold text-black dark:text-white">{stats[s]}</span>
                <span className="text-xs font-medium text-body">{s === 'all' ? t('common.all') : t(`partnerPortal.status.${s}`)}</span>
              </button>
            ))}
          </div>

          {isAdmin && teamBreakdown.length > 0 && (
            <div className="rounded-lg border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="mb-2 text-xs font-bold uppercase text-gray-400">{t('partnerPortal.teamBreakdownTitle')}</div>
              <div className="flex flex-wrap gap-2">
                {teamBreakdown.map((m) => (
                  <span key={m.name} className="inline-flex items-center gap-1.5 rounded-full bg-gray-2 px-3 py-1 text-xs font-medium text-body dark:bg-meta-4">
                    {m.name} <span className="rounded-full bg-white px-1.5 text-black dark:bg-boxdark dark:text-white">{m.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            {loading ? (
              <div className="flex h-32 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
            ) : filteredOpportunities.length === 0 ? (
              <div className="p-10 text-center text-sm text-body">{t('partnerPortal.noOpportunities')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stroke dark:border-strokedark">
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colBusiness')}</th>
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colContact')}</th>
                      {isAdmin && <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colSubmittedBy')}</th>}
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colStatus')}</th>
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colAssignedRep')}</th>
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colLeadStage')}</th>
                      {isAdmin && <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colPayout')}</th>}
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colSubmitted')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOpportunities.map((o) => (
                      <tr key={o.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                        <td className="px-4 py-3 font-medium text-black dark:text-white">{o.businessName}</td>
                        <td className="px-4 py-3 text-body">
                          {[o.contactFirstName, o.contactLastName].filter(Boolean).join(' ') || '—'}
                          {o.contactEmail && <div className="text-xs text-gray-400">{o.contactEmail}</div>}
                        </td>
                        {isAdmin && <td className="px-4 py-3 text-body">{o.submittedByName || o.submittedByEmail || '—'}</td>}
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[o.status]}`}>{t(`partnerPortal.status.${o.status}`)}</span>
                          {o.status === 'rejected' && o.rejectionReason && <div className="mt-1 text-xs text-gray-400">{o.rejectionReason}</div>}
                        </td>
                        <td className="px-4 py-3 text-body">{o.assignedRepName || '—'}</td>
                        <td className="px-4 py-3 text-body">
                          {o.leadConverted ? (
                            <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:text-success">{t('partnerPortal.leadConverted')}</span>
                          ) : o.leadStage || '—'}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PAYOUT_BADGE[o.payoutStatus]}`}>
                              {t(`partnerPortal.payoutStatus.${o.payoutStatus}`)}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-body">{new Date(o.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'submit' && (
        <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <form onSubmit={submitOpportunity} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase text-gray-400">{t('partnerPortal.fBusinessName')} *</span>
              <input value={form.businessName} onChange={(e) => setF('businessName', e.target.value)} className={inputCls} required />
            </label>
            <div className={`grid grid-cols-1 gap-4 ${isAdmin ? 'sm:grid-cols-2' : ''}`}>
              <fieldset className="flex flex-col gap-3 rounded-lg border border-stroke p-4 dark:border-strokedark">
                <span className="text-xs font-bold uppercase text-gray-400">{t('partnerPortal.fContactSection')}</span>
                <input value={form.contactFirstName} onChange={(e) => setF('contactFirstName', e.target.value)} placeholder={t('partnerPortal.fFirstName') as string} className={inputCls} />
                <input value={form.contactLastName} onChange={(e) => setF('contactLastName', e.target.value)} placeholder={t('partnerPortal.fLastName') as string} className={inputCls} />
                <input value={form.contactPhone} onChange={(e) => setF('contactPhone', e.target.value)} placeholder={t('partnerPortal.fPhone') as string} className={inputCls} />
                <input value={form.contactEmail} onChange={(e) => setF('contactEmail', e.target.value)} type="email" placeholder={t('partnerPortal.fEmail') as string} className={inputCls} />
              </fieldset>
              {isAdmin && (
                <fieldset className="flex flex-col gap-3 rounded-lg border border-stroke p-4 dark:border-strokedark">
                  <span className="text-xs font-bold uppercase text-gray-400">{t('partnerPortal.fRepSection')}</span>
                  <select value={selectedRepUserId} onChange={(e) => selectRep(e.target.value)} className={inputCls}>
                    <option value="">{t('partnerPortal.fRepSelectPlaceholder')}</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>{m.displayName || m.email}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400">{t('partnerPortal.fRepSelectHint')}</p>
                </fieldset>
              )}
            </div>
            {!isAdmin && (
              <p className="text-xs text-gray-400">{t('partnerPortal.fRepAutoNote')}</p>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase text-gray-400">{t('partnerPortal.fNotes')}</span>
              <textarea value={form.notes} onChange={(e) => setF('notes', e.target.value)} rows={3} className={inputCls} />
            </label>
            <button type="submit" disabled={submitting}
              className="self-start rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
              {submitting ? t('partnerPortal.submitting') : t('partnerPortal.submit')}
            </button>
          </form>
        </div>
      )}

      {tab === 'payouts' && (
        <div className="flex flex-col gap-6">
          {loadingPayoutsTab ? (
            <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : payoutRuns.length === 0 ? (
            <div className="rounded-sm border border-stroke bg-white p-8 text-center text-sm text-body dark:border-strokedark dark:bg-boxdark">
              {t('partnerPortal.payouts.noRuns')}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {payoutRuns.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-stroke bg-white p-4 dark:border-strokedark dark:bg-boxdark">
                  <div>
                    <div className="font-semibold text-black dark:text-white">{r.periodLabel} — ${r.totalAmount.toFixed(2)}</div>
                    <div className="text-xs text-gray-400">{t('partnerPortal.payouts.opportunityCount', { count: r.opportunityCount })}</div>
                  </div>
                  {r.hasInvoice ? (
                    <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-green-700 dark:text-success">
                      ✓ {t('partnerPortal.payouts.invoiceSubmitted')}
                    </span>
                  ) : (
                    <button onClick={() => pickInvoiceFile(r.id)} disabled={uploadingForRun === r.id}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
                      {uploadingForRun === r.id ? t('common.saving') : t('partnerPortal.payouts.uploadInvoice')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {myInvoices.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-bold text-black dark:text-white">{t('partnerPortal.payouts.uploadHistory')}</h3>
              <div className="flex flex-col gap-1 rounded-lg border border-stroke bg-white p-3 dark:border-strokedark dark:bg-boxdark">
                {myInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between text-xs text-body">
                    <span>{inv.fileName}</span>
                    <span className="text-gray-400">{new Date(inv.uploadedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PartnerPortal;
