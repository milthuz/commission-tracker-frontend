import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Select from '../../components/Select';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface Partner {
  id: number; name: string; active: boolean; createdAt: string; hasLogo: boolean; userCount: number;
  leadSource: string | null;
  billingContactName: string | null; billingContactEmail: string | null; billingContactPhone: string | null;
  businessContactName: string | null; businessContactEmail: string | null; businessContactPhone: string | null;
  payoutRate: number | null;
}
interface CrmMatch {
  module: 'Leads' | 'Contacts' | 'Accounts'; id: string; name: string; company: string | null;
  phone: string | null; email: string | null; city: string | null; crmUrl: string | null;
}
interface Opportunity {
  id: number; businessName: string;
  contactFirstName: string | null; contactLastName: string | null;
  contactPhone: string | null; contactEmail: string | null;
  repFirstName: string | null; repLastName: string | null;
  repPhone: string | null; repEmail: string | null;
  notes: string | null; status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null; reviewedAt: string | null; rejectionReason: string | null; createdAt: string;
  partnerName: string; submittedByEmail: string | null;
  // SH-28/SH-30 — set by the backend, never sent to partners (see mapOpportunityRow's comment).
  crmMatchStatus: 'no_match' | 'match_found' | 'check_failed' | null;
  crmMatchSummary: string | null;
  crmMatchRecords: CrmMatch[];
  crmLeadId: string | null;
  crmLeadError: string | null;
  // SH-40/41 — set once the partner manager manually links this opportunity to the real,
  // invoiced Sales Hub customer it became (see recomputePartnerPayoutStatus's comment).
  linkedCustomerName: string | null;
  payoutStatus: 'not_eligible' | 'eligible' | 'in_run' | 'paid';
}
interface PendingPartnerPayout {
  partnerId: number; partnerName: string; payoutRate: number | null; suggestedAmount: number | null;
  opportunities: { id: number; businessName: string; linkedCustomerName: string | null; createdAt: string }[];
}
interface PayoutRun {
  id: number; partnerName: string; periodLabel: string; status: 'draft' | 'finalized';
  totalAmount: number; opportunityCount: number;
  createdBy: string | null; createdAt: string; finalizedBy: string | null; finalizedAt: string | null;
}

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

const PartnersAdmin: React.FC<{ canDelete?: boolean }> = ({ canDelete }) => {
  const { t, i18n } = useTranslation();
  // Landing on this page is the Opportunity Queue "dashboard" (user request 2026-07-2x) — Manage
  // Partners is reached either via the in-page tab or the Sidebar's "Manage Partners" submenu
  // item, which links here with ?view=manage.
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subFromParams = (): 'partners' | 'payouts' | 'queue' => {
    const v = searchParams.get('view');
    if (v === 'manage') return 'partners';
    if (v === 'payouts') return 'payouts';
    return 'queue';
  };
  const [sub, setSub] = useState<'partners' | 'payouts' | 'queue'>(subFromParams());
  // The route stays /admin/partners for every sub-view (only ?view= changes), so AdminPanel never
  // remounts this component — the useState initializer above only runs once. Re-sync on every
  // search-param change so the Sidebar's submenu links work from an already-open page.
  useEffect(() => {
    setSub(subFromParams());
  }, [searchParams]);

  // Manage Partners
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [inviteFor, setInviteFor] = useState<Partner | null>(null);
  const [deletingPartnerId, setDeletingPartnerId] = useState<number | null>(null);

  type Invite = {
    id: number; email: string; name: string | null; role: string; status: string;
    partnerName: string; invitedBy: string | null;
    invitedAt: string | null; openedAt: string | null; activatedAt: string | null;
    expiresAt: string | null;
  };
  const [invites, setInvites] = useState<Invite[]>([]);
  useEffect(() => {
    axios.get(`${API_URL}/api/admin/partner-invites`, { headers: authHeaders() })
      .then((r) => setInvites(r.data.invites || []))
      .catch(() => {});
  }, []);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const revokeInvite = async (iv: Invite) => {
    if (!(await dialog.confirm(t('admin.partners.revokeConfirm', { email: iv.email }) as string))) return;
    setRevokingId(iv.id);
    try {
      await axios.delete(`${API_URL}/api/admin/partner-invites/${iv.id}`, { headers: authHeaders() });
      setInvites((prev) => prev.filter((x) => x.id !== iv.id));
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error === 'already_active'
        ? t('admin.partners.revokeActive') as string
        : t('admin.partners.revokeFailed') as string);
    } finally { setRevokingId(null); }
  };
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(i18n.language?.startsWith('fr') ? 'fr-CA' : 'en-CA',
          { year: 'numeric', month: 'short', day: 'numeric' }) : null;
  // Un tiret plutot qu'une case vide : « rien ne s'est produit » et « la colonne ne
  // s'applique pas » ne doivent pas se ressembler.
  const Step = ({ at, pending }: { at: string | null; pending?: boolean }) =>
    at ? <span className="text-black dark:text-white">{fmtDate(at)}</span>
       : <span className={pending ? 'text-warning' : 'text-gray-400'}>{pending ? t('admin.partners.invitePending') : '—'}</span>;

  // Deux temps, et le second n'est demande QUE s'il y a quelque chose a perdre.
  // Le premier appel n'efface rien tant qu'il reste des donnees rattachees : le serveur
  // repond 409 avec le decompte, ce qui permet d'annoncer ce qui va disparaitre au lieu
  // de demander « etes-vous sur ? » dans le vide. Une confirmation qui ne dit pas ce
  // qu'elle detruit n'est pas une confirmation.
  const deletePartner = async (p: Partner) => {
    if (!(await dialog.confirm(t('admin.partners.deleteConfirm', { name: p.name }) as string))) return;
    setDeletingPartnerId(p.id);
    try {
      await axios.delete(`${API_URL}/api/admin/partners/${p.id}`, { headers: authHeaders() });
      await fetchPartners();
    } catch (e: any) {
      const d = e?.response?.data;
      if (e?.response?.status === 409 && d?.error === 'partner_has_data') {
        const c = d.counts || {};
        const ok = await dialog.confirm(t('admin.partners.deleteConfirmData', {
          name: d.name || p.name,
          users: c.users || 0,
          opportunities: c.opportunities || 0,
          invoices: c.invoices || 0,
          runs: c.payout_runs || 0,
        }) as string);
        if (!ok) { setDeletingPartnerId(null); return; }
        try {
          await axios.delete(`${API_URL}/api/admin/partners/${p.id}?force=1`, { headers: authHeaders() });
          await fetchPartners();
        } catch (e2: any) {
          dialog.alert(e2?.response?.data?.error || t('admin.partners.deleteFailed') as string);
        }
      } else {
        dialog.alert(d?.error || t('admin.partners.deleteFailed') as string);
      }
    } finally {
      setDeletingPartnerId(null);
    }
  };
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  // Langue du courriel d'invitation, par defaut celle de l'admin qui invite.
  const [inviteLocale, setInviteLocale] = useState<'fr' | 'en'>((i18n.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en');
  const [inviting, setInviting] = useState(false);

  const fetchPartners = async () => {
    setLoadingPartners(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/partners`, { headers: authHeaders() });
      setPartners(r.data.partners || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to load partners'); }
    finally { setLoadingPartners(false); }
  };
  useEffect(() => { fetchPartners(); }, []);

  const createPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartnerName.trim()) return;
    setCreating(true);
    try {
      await axios.post(`${API_URL}/api/admin/partners`, { name: newPartnerName.trim() }, { headers: authHeaders() });
      setNewPartnerName('');
      await fetchPartners();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to create partner'); }
    finally { setCreating(false); }
  };

  const toggleActive = async (p: Partner) => {
    try {
      await axios.put(`${API_URL}/api/admin/partners/${p.id}`, { name: p.name, active: !p.active }, { headers: authHeaders() });
      await fetchPartners();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to update partner'); }
  };

  // Partner-manager-configurable Lead Source + Billing/Business contact info (user request
  // 2026-07-2x, after the Zoho screenshot showed Lead Source as a required, unmapped field).
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', leadSource: '', payoutRate: '',
    billingContactName: '', billingContactEmail: '', billingContactPhone: '',
    businessContactName: '', businessContactEmail: '', businessContactPhone: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (p: Partner) => {
    setEditingPartner(p);
    setEditForm({
      name: p.name, leadSource: p.leadSource || '', payoutRate: p.payoutRate !== null ? String(p.payoutRate) : '',
      billingContactName: p.billingContactName || '', billingContactEmail: p.billingContactEmail || '', billingContactPhone: p.billingContactPhone || '',
      businessContactName: p.businessContactName || '', businessContactEmail: p.businessContactEmail || '', businessContactPhone: p.businessContactPhone || '',
    });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPartner || !editForm.name.trim()) return;
    setSavingEdit(true);
    try {
      await axios.put(`${API_URL}/api/admin/partners/${editingPartner.id}`, {
        name: editForm.name.trim(), active: editingPartner.active,
        leadSource: editForm.leadSource.trim(), payoutRate: editForm.payoutRate.trim() === '' ? null : editForm.payoutRate.trim(),
        billingContactName: editForm.billingContactName.trim(), billingContactEmail: editForm.billingContactEmail.trim(), billingContactPhone: editForm.billingContactPhone.trim(),
        businessContactName: editForm.businessContactName.trim(), businessContactEmail: editForm.businessContactEmail.trim(), businessContactPhone: editForm.businessContactPhone.trim(),
      }, { headers: authHeaders() });
      setEditingPartner(null);
      await fetchPartners();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to update partner'); }
    finally { setSavingEdit(false); }
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteFor || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await axios.post(`${API_URL}/api/admin/partners/${inviteFor.id}/invite-admin`,
        { email: inviteEmail.trim(), name: inviteName.trim(), locale: inviteLocale }, { headers: authHeaders() });
      setInviteFor(null); setInviteEmail(''); setInviteName('');
      await fetchPartners();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to send invite'); }
    finally { setInviting(false); }
  };

  // Opportunity Queue — always fetch the full set once and filter/search client-side (cheap at
  // this volume), so the status tiles below can show live counts across ALL statuses regardless
  // of which one is currently selected, and switching tiles/search needs no round-trip.
  const [allOpportunities, setAllOpportunities] = useState<Opportunity[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [queueSearch, setQueueSearch] = useState('');

  const fetchQueue = async () => {
    setLoadingQueue(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/partner-opportunities`, { headers: authHeaders() });
      setAllOpportunities(r.data.opportunities || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to load the opportunity queue'); }
    finally { setLoadingQueue(false); }
  };
  const queueStats = {
    pending: allOpportunities.filter((o) => o.status === 'pending').length,
    approved: allOpportunities.filter((o) => o.status === 'approved').length,
    rejected: allOpportunities.filter((o) => o.status === 'rejected').length,
    all: allOpportunities.length,
  };
  const searchLower = queueSearch.trim().toLowerCase();
  const opportunities = allOpportunities.filter((o) =>
    (statusFilter === 'all' || o.status === statusFilter)
    && (!searchLower || o.businessName.toLowerCase().includes(searchLower) || o.partnerName.toLowerCase().includes(searchLower))
  );
  useEffect(() => { if (sub === 'queue') fetchQueue(); }, [sub]);

  const [rejecting, setRejecting] = useState<Opportunity | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [checkingCrmId, setCheckingCrmId] = useState<number | null>(null);

  const setStatus = async (o: Opportunity, status: 'approved' | 'rejected', rejectionReason?: string, crmOwnerId?: string, crmOwnerName?: string) => {
    setReviewing(true);
    try {
      const r = await axios.put(`${API_URL}/api/admin/partner-opportunities/${o.id}`, { status, rejectionReason, crmOwnerId, crmOwnerName }, { headers: authHeaders() });
      setRejecting(null); setRejectReason('');
      setApproving(null); setSelectedRepId('');
      await fetchQueue();
      // SH-30 — surface the Lead-creation result right away rather than making the admin dig
      // for it; a failure here doesn't mean the approval failed, just that the Lead needs to be
      // created manually (crm_lead_error stays visible in the table either way).
      if (status === 'approved' && r.data?.crmLead?.error) {
        dialog.alert(t('admin.partners.crm.leadFailedAlert', { error: r.data.crmLead.error }) as string);
      }
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to update the opportunity'); }
    finally { setReviewing(false); }
  };

  // SH-30 follow-up — the partner manager picks which Zoho CRM rep the Lead gets assigned to
  // (Owner field) right when approving, instead of a plain yes/no confirm.
  const [approving, setApproving] = useState<Opportunity | null>(null);
  const [crmReps, setCrmReps] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loadingReps, setLoadingReps] = useState(false);
  const [selectedRepId, setSelectedRepId] = useState('');

  const approve = async (o: Opportunity) => {
    setApproving(o);
    setSelectedRepId('');
    if (!crmReps.length) {
      setLoadingReps(true);
      try {
        const r = await axios.get(`${API_URL}/api/admin/partner-opportunities/crm-reps`, { headers: authHeaders() });
        setCrmReps(r.data.reps || []);
      } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to load Zoho CRM reps'); }
      finally { setLoadingReps(false); }
    }
  };
  const confirmApprove = () => {
    const rep = crmReps.find((r) => r.id === selectedRepId);
    setStatus(approving as Opportunity, 'approved', undefined, selectedRepId || undefined, rep?.name);
  };

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const deleteOpportunity = async (o: Opportunity) => {
    const confirmKey = o.crmLeadId ? 'admin.partners.deleteOpportunityConfirmWithLead' : 'admin.partners.deleteOpportunityConfirm';
    if (!(await dialog.confirm(t(confirmKey, { name: o.businessName, id: o.crmLeadId }) as string))) return;
    setDeletingId(o.id);
    try {
      const r = await axios.delete(`${API_URL}/api/admin/partner-opportunities/${o.id}`, { headers: authHeaders() });
      setAllOpportunities((prev) => prev.filter((x) => x.id !== o.id));
      if (r.data?.crmDeleteError) {
        dialog.alert(t('admin.partners.crm.deleteFailedAlert', { error: r.data.crmDeleteError }) as string);
      }
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to delete the opportunity'); }
    finally { setDeletingId(null); }
  };

  const recheckCrm = async (o: Opportunity) => {
    setCheckingCrmId(o.id);
    try {
      const r = await axios.post(`${API_URL}/api/admin/partner-opportunities/${o.id}/crm-check`, {}, { headers: authHeaders() });
      setAllOpportunities((prev) => prev.map((x) => x.id === o.id
        ? { ...x, crmMatchStatus: r.data.crmMatchStatus, crmMatchSummary: r.data.crmMatchSummary, crmMatchRecords: r.data.crmMatchRecords || [] }
        : x));
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to check Zoho CRM'); }
    finally { setCheckingCrmId(null); }
  };

  // SH-28 — lets the partner manager actually look at what matched (name/phone/email/city) and
  // judge for themselves whether it's the same lead or just another location of a similar-named
  // business, instead of only seeing a flag and having to guess.
  const [viewingMatches, setViewingMatches] = useState<Opportunity | null>(null);

  // SH-40/41 — manually link a converted opportunity to the real, invoiced Sales Hub customer it
  // became (there's no automatic Zoho Lead → Sales Hub customer link), so payout eligibility can
  // be computed against that customer's actual paid invoices.
  const [linkingFor, setLinkingFor] = useState<Opportunity | null>(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<string[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const openLinking = (o: Opportunity) => { setLinkingFor(o); setLinkQuery(o.linkedCustomerName || ''); setLinkResults([]); };
  useEffect(() => {
    if (!linkingFor || linkQuery.trim().length < 2) { setLinkResults([]); return; }
    setLinkSearching(true);
    const timer = setTimeout(() => {
      axios.get(`${API_URL}/api/admin/partner-opportunities/customer-search`, { params: { q: linkQuery.trim() }, headers: authHeaders() })
        .then((r) => setLinkResults(r.data.customers || []))
        .catch(() => setLinkResults([]))
        .finally(() => setLinkSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [linkQuery, linkingFor]);
  const saveLink = async (customerName: string | null) => {
    if (!linkingFor) return;
    setSavingLink(true);
    try {
      const r = await axios.put(`${API_URL}/api/admin/partner-opportunities/${linkingFor.id}/link-customer`, { customerName }, { headers: authHeaders() });
      setAllOpportunities((prev) => prev.map((x) => x.id === linkingFor.id
        ? { ...x, linkedCustomerName: r.data.linkedCustomerName, payoutStatus: r.data.payoutStatus }
        : x));
      setLinkingFor(null);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to link customer'); }
    finally { setSavingLink(false); }
  };

  // SH-41 — the quarterly payout run workflow: pending eligible opportunities grouped by
  // partner (with a rate-based suggested total the manager can override), draft runs, and history.
  const [pendingPartners, setPendingPartners] = useState<PendingPartnerPayout[]>([]);
  const [runs, setRuns] = useState<PayoutRun[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const fetchPayouts = async () => {
    setLoadingPayouts(true);
    try {
      const [pendingRes, runsRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/partner-payouts/pending`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/admin/partner-payouts/runs`, { headers: authHeaders() }),
      ]);
      setPendingPartners(pendingRes.data.partners || []);
      setRuns(runsRes.data.runs || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to load payouts'); }
    finally { setLoadingPayouts(false); }
  };
  useEffect(() => { if (sub === 'payouts') fetchPayouts(); }, [sub]);

  const [creatingRunFor, setCreatingRunFor] = useState<PendingPartnerPayout | null>(null);
  const [runPeriod, setRunPeriod] = useState('');
  const [runAmount, setRunAmount] = useState('');
  const [runSelectedIds, setRunSelectedIds] = useState<Set<number>>(new Set());
  const [savingRun, setSavingRun] = useState(false);
  const openCreateRun = (p: PendingPartnerPayout) => {
    setCreatingRunFor(p);
    setRunPeriod('');
    setRunAmount(p.suggestedAmount !== null ? p.suggestedAmount.toFixed(2) : '');
    setRunSelectedIds(new Set(p.opportunities.map((o) => o.id)));
  };
  const toggleRunSelected = (id: number) => {
    setRunSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const submitCreateRun = async () => {
    if (!creatingRunFor || !runPeriod.trim() || !runSelectedIds.size) return;
    setSavingRun(true);
    try {
      await axios.post(`${API_URL}/api/admin/partner-payouts/runs`, {
        partnerId: creatingRunFor.partnerId, periodLabel: runPeriod.trim(),
        totalAmount: runAmount.trim() || 0, opportunityIds: [...runSelectedIds],
      }, { headers: authHeaders() });
      setCreatingRunFor(null);
      await fetchPayouts();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to create payout run'); }
    finally { setSavingRun(false); }
  };

  const [runningActionId, setRunningActionId] = useState<number | null>(null);
  const finalizeRun = async (run: PayoutRun) => {
    if (!(await dialog.confirm(t('admin.partners.payout.finalizeConfirm', { period: run.periodLabel, amount: run.totalAmount.toFixed(2) }) as string))) return;
    setRunningActionId(run.id);
    try {
      await axios.post(`${API_URL}/api/admin/partner-payouts/runs/${run.id}/finalize`, {}, { headers: authHeaders() });
      await fetchPayouts();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to finalize run'); }
    finally { setRunningActionId(null); }
  };
  const cancelRun = async (run: PayoutRun) => {
    if (!(await dialog.confirm(t('admin.partners.payout.cancelConfirm', { period: run.periodLabel }) as string))) return;
    setRunningActionId(run.id);
    try {
      await axios.delete(`${API_URL}/api/admin/partner-payouts/runs/${run.id}`, { headers: authHeaders() });
      await fetchPayouts();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to cancel run'); }
    finally { setRunningActionId(null); }
  };

  const inputCls = 'w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';

  return (
    <div>
      {/* No in-page tab strip here on purpose — Opportunity Queue is this page's default view,
          and Manage Partners is reached via the Sidebar's own submenu (user request
          2026-07-2x), so a second switcher on the page itself would be redundant. */}
      {sub !== 'queue' && (
        <div className="mb-4 flex items-center gap-2 text-sm text-body">
          <button onClick={() => navigate('/admin/partners')} className="flex items-center gap-1 font-medium text-primary hover:underline">
            ← {t('admin.partners.tabs.queue')}
          </button>
          <span>/</span>
          <span className="font-semibold text-black dark:text-white">{t(sub === 'partners' ? 'admin.partners.tabs.partners' : 'admin.partners.tabs.payouts')}</span>
        </div>
      )}

      {sub === 'partners' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
            <form onSubmit={createPartner} className="flex flex-wrap items-end gap-3">
              <input value={newPartnerName} onChange={(e) => setNewPartnerName(e.target.value)}
                placeholder={t('admin.partners.fName') as string} className={`${inputCls} max-w-xs`} />
              <button type="submit" disabled={creating}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
                {creating ? t('admin.partners.creating') : t('admin.partners.addPartner')}
              </button>
            </form>
          </div>

          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            {loadingPartners ? (
              <div className="flex h-24 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
            ) : partners.length === 0 ? (
              <div className="p-8 text-center text-sm text-body">{t('admin.partners.noPartners')}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark">
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.fName')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.colUsers')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.colActive')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-black dark:text-white">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                      <td className="px-4 py-3 font-medium text-black dark:text-white">{p.name}</td>
                      <td className="px-4 py-3 text-body">{p.userCount}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleActive(p)}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.active ? 'bg-success/15 text-green-700 dark:text-success' : 'bg-gray-2 text-gray-500 dark:bg-meta-4'}`}>
                          {p.active ? t('common.active') : t('common.inactive')}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(p)}
                            className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">
                            {t('admin.partners.editPartner')}
                          </button>
                          <button onClick={() => setInviteFor(p)}
                            className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">
                            {t('admin.partners.inviteAdmin')}
                          </button>
                          {canDelete && (
                            <button onClick={() => deletePartner(p)} disabled={deletingPartnerId === p.id}
                              title={t('admin.partners.deletePartner') as string}
                              className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-danger hover:border-danger disabled:opacity-50 dark:border-strokedark">
                              {deletingPartnerId === p.id
                                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-danger border-t-transparent" />
                                : t('admin.partners.deletePartner')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        {/* Suivi des invitations : envoyee -> lien ouvert -> compte active. */}
        <div className="mt-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <h4 className="text-sm font-bold text-black dark:text-white">{t('admin.partners.invitesTitle')}</h4>
            <p className="mt-0.5 text-xs text-body">{t('admin.partners.invitesHint')}</p>
          </div>
          {invites.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">{t('admin.partners.invitesEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark">
                    <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.colPartner')}</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-body">{t('partnerPortal.fEmail')}</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.inviteSent')}</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.inviteOpened')}</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.inviteAccepted')}</th>
                    <th className="whitespace-nowrap px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.inviteBy')}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((iv) => {
                    const pending = iv.status === 'invited';
                    const expired = pending && !!iv.expiresAt && new Date(iv.expiresAt) < new Date();
                    return (
                      <tr key={iv.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                        <td className="whitespace-nowrap px-6 py-3 font-medium text-black dark:text-white">{iv.partnerName}</td>
                        <td className="px-4 py-3">
                          <span className="text-black dark:text-white">{iv.email}</span>
                          {iv.role === 'admin' && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{t('partnerPortal.roleAdmin')}</span>}
                          {expired && <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-danger">{t('admin.partners.inviteExpired')}</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3"><Step at={iv.invitedAt} /></td>
                        <td className="whitespace-nowrap px-4 py-3"><Step at={iv.openedAt} pending={pending && !expired} /></td>
                        <td className="whitespace-nowrap px-4 py-3"><Step at={iv.activatedAt} pending={pending && !expired} /></td>
                        <td className="whitespace-nowrap px-6 py-3 text-body">{iv.invitedBy || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {pending && (
                            <button onClick={() => revokeInvite(iv)} disabled={revokingId === iv.id}
                              className="rounded-lg border border-stroke px-3 py-1 text-xs font-medium text-danger hover:border-danger disabled:opacity-50 dark:border-strokedark">
                              {t('admin.partners.revokeInvite')}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>
      )}

      {sub === 'queue' && (
        <div className="flex flex-col gap-4">
          {/* Status tiles double as the filter — clicking one both shows its count and narrows
              the table, so the "dashboard" framing and the filter are the same control. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3.5 text-left transition ${
                  statusFilter === s
                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                    : 'border-stroke bg-white hover:border-primary/40 dark:border-strokedark dark:bg-boxdark'
                }`}>
                <span className="text-2xl font-bold text-black dark:text-white">{queueStats[s]}</span>
                <span className="text-xs font-medium text-body">{s === 'all' ? t('common.all') : t(`partnerPortal.status.${s}`)}</span>
              </button>
            ))}
          </div>
          <input value={queueSearch} onChange={(e) => setQueueSearch(e.target.value)}
            placeholder={t('admin.partners.searchPh') as string}
            className="w-full max-w-xs rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            {loadingQueue ? (
              <div className="flex h-24 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
            ) : opportunities.length === 0 ? (
              <div className="p-8 text-center text-sm text-body">{t('admin.partners.noOpportunities')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stroke dark:border-strokedark">
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colBusiness')}</th>
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colContact')}</th>
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colStatus')}</th>
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.crm.title')}</th>
                      <th className="sticky right-0 bg-white px-4 py-3 text-right font-semibold text-black dark:bg-boxdark dark:text-white">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.map((o) => (
                      <tr key={o.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-400">{o.partnerName}</div>
                          <div className="font-medium text-black dark:text-white">{o.businessName}</div>
                        </td>
                        <td className="px-4 py-3 text-body">
                          {[o.contactFirstName, o.contactLastName].filter(Boolean).join(' ') || '—'}
                          {o.contactEmail && <div className="text-xs text-gray-400">{o.contactEmail}</div>}
                          {o.submittedByEmail && (
                            <div className="mt-1 text-xs text-gray-400" title={t('admin.partners.colSubmittedBy') as string}>
                              ↳ {o.submittedByEmail}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[o.status]}`}>{t(`partnerPortal.status.${o.status}`)}</span>
                          {o.status === 'rejected' && o.rejectionReason && <div className="mt-1 text-xs text-gray-400">{o.rejectionReason}</div>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {o.crmMatchStatus === 'match_found' && (
                              <button onClick={() => setViewingMatches(o)}
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning hover:bg-warning/25">
                                ⚠ {t('admin.partners.crm.matchFoundShort', { count: o.crmMatchRecords.length })}
                              </button>
                            )}
                            {o.crmMatchStatus === 'no_match' && (
                              <span className="whitespace-nowrap rounded-full bg-gray-2 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-meta-4">{t('admin.partners.crm.noMatch')}</span>
                            )}
                            {o.crmMatchStatus === 'check_failed' && (
                              <span className="whitespace-nowrap rounded-full bg-gray-2 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-meta-4">{t('admin.partners.crm.checkFailed')}</span>
                            )}
                            {!o.crmMatchStatus && (
                              <span className="whitespace-nowrap text-xs text-gray-400">{t('admin.partners.crm.notChecked')}</span>
                            )}
                            {o.status === 'pending' && (
                              <button onClick={() => recheckCrm(o)} disabled={checkingCrmId === o.id}
                                title={(o.crmMatchStatus ? t('admin.partners.crm.recheck') : t('admin.partners.crm.check')) as string}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10 disabled:opacity-50">
                                {checkingCrmId === o.id ? (
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                ) : (
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.5 9a7.5 7.5 0 0113-4.5M19.5 15a7.5 7.5 0 01-13 4.5" />
                                  </svg>
                                )}
                              </button>
                            )}
                          </div>
                          {o.crmLeadId && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-success" title={t('admin.partners.crm.leadCreated', { id: o.crmLeadId }) as string}>
                              ✓ {o.crmLeadId}
                            </div>
                          )}
                          {o.crmLeadError && (
                            <div className="mt-1 text-xs text-danger" title={o.crmLeadError}>⚠ {t('admin.partners.crm.leadFailed')}</div>
                          )}
                          {o.status === 'approved' && (
                            <div className="mt-1 flex items-center gap-1">
                              {o.linkedCustomerName ? (
                                <>
                                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAYOUT_BADGE[o.payoutStatus]}`}
                                    title={o.linkedCustomerName}>
                                    {t(`admin.partners.payout.status.${o.payoutStatus}`)}
                                  </span>
                                  {o.payoutStatus === 'not_eligible' && (
                                    <button onClick={() => openLinking(o)} title={t('admin.partners.payout.relink') as string}
                                      className="flex h-4 w-4 items-center justify-center text-gray-400 hover:text-primary">
                                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.5-9.5L21 5m0 0v5m0-5h-5" />
                                      </svg>
                                    </button>
                                  )}
                                </>
                              ) : (
                                <button onClick={() => openLinking(o)}
                                  className="whitespace-nowrap text-[11px] font-medium text-primary hover:underline">
                                  🔗 {t('admin.partners.payout.linkButton')}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="sticky right-0 bg-white px-4 py-3 text-right dark:bg-boxdark">
                          <div className="flex items-center justify-end gap-1.5">
                            {o.status === 'pending' ? (
                              <>
                                <button onClick={() => approve(o)} disabled={reviewing}
                                  className="rounded-md border border-success/40 px-2 py-1 text-[11px] font-medium text-green-700 hover:bg-success/10 disabled:opacity-60 dark:text-success">
                                  {t('admin.partners.approve')}
                                </button>
                                <button onClick={() => { setRejecting(o); setRejectReason(''); }} disabled={reviewing}
                                  className="rounded-md border border-danger/40 px-2 py-1 text-[11px] font-medium text-danger hover:bg-danger/10 disabled:opacity-60">
                                  {t('admin.partners.reject')}
                                </button>
                              </>
                            ) : <span className="text-xs text-gray-400">{o.reviewedBy}</span>}
                            <button onClick={() => deleteOpportunity(o)} disabled={deletingId === o.id}
                              title={t('common.delete') as string}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-stroke text-body hover:border-danger hover:text-danger disabled:opacity-60 dark:border-strokedark">
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {sub === 'payouts' && (
        <div className="flex flex-col gap-6">
          {loadingPayouts ? (
            <div className="flex h-24 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : (
            <>
              <div>
                <h3 className="mb-3 text-sm font-bold text-black dark:text-white">{t('admin.partners.payout.pendingTitle')}</h3>
                {pendingPartners.length === 0 ? (
                  <div className="rounded-sm border border-stroke bg-white p-6 text-center text-sm text-body dark:border-strokedark dark:bg-boxdark">
                    {t('admin.partners.payout.noPending')}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {pendingPartners.map((p) => (
                      <div key={p.partnerId} className="flex items-center justify-between gap-3 rounded-lg border border-stroke bg-white p-4 dark:border-strokedark dark:bg-boxdark">
                        <div>
                          <div className="font-semibold text-black dark:text-white">{p.partnerName}</div>
                          <div className="text-xs text-gray-400">{t('admin.partners.payout.opportunityCount', { count: p.opportunities.length })}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          {p.payoutRate === null ? (
                            <span className="text-xs font-medium text-warning">{t('admin.partners.payout.noRateWarning')}</span>
                          ) : (
                            <span className="font-bold text-black dark:text-white">${p.suggestedAmount?.toFixed(2)}</span>
                          )}
                          <button onClick={() => openCreateRun(p)} disabled={p.payoutRate === null}
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90 disabled:opacity-40">
                            {t('admin.partners.payout.createRun')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold text-black dark:text-white">{t('admin.partners.payout.historyTitle')}</h3>
                {runs.length === 0 ? (
                  <div className="rounded-sm border border-stroke bg-white p-6 text-center text-sm text-body dark:border-strokedark dark:bg-boxdark">
                    {t('admin.partners.payout.noRuns')}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stroke dark:border-strokedark">
                          <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.payout.colPartner')}</th>
                          <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.payout.colPeriod')}</th>
                          <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.payout.colOpportunities')}</th>
                          <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.payout.colAmount')}</th>
                          <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.payout.colRunStatus')}</th>
                          <th className="px-4 py-3 text-right font-semibold text-black dark:text-white">{t('common.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((r) => (
                          <tr key={r.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                            <td className="px-4 py-3 font-medium text-black dark:text-white">{r.partnerName}</td>
                            <td className="px-4 py-3 text-body">{r.periodLabel}</td>
                            <td className="px-4 py-3 text-body">{r.opportunityCount}</td>
                            <td className="px-4 py-3 text-body">${r.totalAmount.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === 'finalized' ? 'bg-success/15 text-green-700 dark:text-success' : 'bg-warning/15 text-warning'}`}>
                                {t(`admin.partners.payout.runStatus.${r.status}`)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {r.status === 'draft' && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button onClick={() => finalizeRun(r)} disabled={runningActionId === r.id}
                                    className="rounded-md border border-success/40 px-2 py-1 text-[11px] font-medium text-green-700 hover:bg-success/10 disabled:opacity-60 dark:text-success">
                                    {t('admin.partners.payout.finalize')}
                                  </button>
                                  <button onClick={() => cancelRun(r)} disabled={runningActionId === r.id}
                                    className="rounded-md border border-stroke px-2 py-1 text-[11px] font-medium text-body hover:border-danger hover:text-danger disabled:opacity-60 dark:border-strokedark">
                                    {t('admin.partners.payout.cancel')}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {creatingRunFor && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreatingRunFor(null); }}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.payout.createRunFor', { name: creatingRunFor.partnerName })}</span>
              <button onClick={() => setCreatingRunFor(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.payout.fPeriod')}</label>
                <input value={runPeriod} onChange={(e) => setRunPeriod(e.target.value)}
                  placeholder={t('admin.partners.payout.fPeriodPh') as string} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.payout.fAmount')}</label>
                <input value={runAmount} onChange={(e) => setRunAmount(e.target.value)} type="number" min="0" step="0.01" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.payout.fOpportunities', { count: runSelectedIds.size })}</label>
                <div className="flex flex-col gap-1 rounded-lg border border-stroke p-2 dark:border-strokedark">
                  {creatingRunFor.opportunities.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-1 dark:hover:bg-meta-4">
                      <input type="checkbox" checked={runSelectedIds.has(o.id)} onChange={() => toggleRunSelected(o.id)} />
                      <span className="text-black dark:text-white">{o.businessName}</span>
                      <span className="text-xs text-gray-400">— {o.linkedCustomerName}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={submitCreateRun} disabled={savingRun || !runPeriod.trim() || !runSelectedIds.size}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
                {savingRun ? t('common.saving') : t('admin.partners.payout.createRun')}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingMatches && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setViewingMatches(null); }}>
          <div className="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.crm.matchesFor', { name: viewingMatches.businessName })}</span>
              <button onClick={() => setViewingMatches(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="mb-4 text-xs text-body">{t('admin.partners.crm.matchesHint')}</p>
            <div className="flex flex-col gap-2">
              {viewingMatches.crmMatchRecords.map((m) => {
                const CardTag = m.crmUrl ? 'a' : 'div';
                return (
                  <CardTag key={`${m.module}:${m.id}`}
                    {...(m.crmUrl ? { href: m.crmUrl, target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className={`rounded-lg border border-stroke p-3 dark:border-strokedark ${m.crmUrl ? 'block transition hover:border-primary hover:bg-gray-1 dark:hover:bg-meta-4' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-black dark:text-white">{m.name}</span>
                      <span className="rounded-full bg-gray-2 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-meta-4">{m.module}</span>
                    </div>
                    {m.company && m.company !== m.name && (
                      <div className="mt-0.5 text-xs font-medium text-body">{m.company}</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-body">
                      {m.phone && <span>📞 {m.phone}</span>}
                      {m.email && <span>✉ {m.email}</span>}
                      {m.city && <span>📍 {m.city}</span>}
                    </div>
                    {m.crmUrl && (
                      <div className="mt-1.5 text-xs font-medium text-primary">{t('admin.partners.crm.viewInCrm')} →</div>
                    )}
                  </CardTag>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {linkingFor && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setLinkingFor(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.payout.linkFor', { name: linkingFor.businessName })}</span>
              <button onClick={() => setLinkingFor(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="mb-3 text-xs text-body">{t('admin.partners.payout.linkHint')}</p>
            <input value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} autoFocus
              placeholder={t('admin.partners.payout.linkSearchPh') as string} className={inputCls} />
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-stroke dark:border-strokedark">
              {linkSearching ? (
                <div className="p-3 text-center text-xs text-body">{t('common.loading')}</div>
              ) : linkResults.length === 0 ? (
                <div className="p-3 text-center text-xs text-gray-400">
                  {linkQuery.trim().length < 2 ? t('admin.partners.payout.linkSearchHint') : t('admin.partners.payout.linkNoResults')}
                </div>
              ) : (
                linkResults.map((name) => (
                  <button key={name} onClick={() => saveLink(name)} disabled={savingLink}
                    className="block w-full px-3 py-2 text-left text-sm text-black hover:bg-gray-1 disabled:opacity-60 dark:text-white dark:hover:bg-meta-4">
                    {name}
                  </button>
                ))
              )}
            </div>
            {linkingFor.linkedCustomerName && (
              <button onClick={() => saveLink(null)} disabled={savingLink}
                className="mt-3 text-xs font-medium text-danger hover:underline disabled:opacity-60">
                {t('admin.partners.payout.unlink')}
              </button>
            )}
          </div>
        </div>
      )}

      {editingPartner && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditingPartner(null); }}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.editPartnerFor', { name: editingPartner.name })}</span>
              <button onClick={() => setEditingPartner(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveEdit} className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.fName')}</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.fLeadSource')}</label>
                <input value={editForm.leadSource} onChange={(e) => setEditForm({ ...editForm, leadSource: e.target.value })}
                  placeholder={t('admin.partners.leadSourcePh') as string} className={inputCls} />
                <p className="mt-1 text-xs text-gray-400">{t('admin.partners.leadSourceHint')}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.fPayoutRate')}</label>
                <input value={editForm.payoutRate} onChange={(e) => setEditForm({ ...editForm, payoutRate: e.target.value })}
                  type="number" min="0" step="0.01" placeholder={t('admin.partners.payoutRatePh') as string} className={inputCls} />
                <p className="mt-1 text-xs text-gray-400">{t('admin.partners.payoutRateHint')}</p>
              </div>
              <div className="rounded-lg border border-stroke p-3 dark:border-strokedark">
                <div className="mb-2 text-xs font-semibold text-black dark:text-white">{t('admin.partners.billingContact')}</div>
                <div className="flex flex-col gap-2">
                  <input value={editForm.billingContactName} onChange={(e) => setEditForm({ ...editForm, billingContactName: e.target.value })}
                    placeholder={t('admin.partners.fContactName') as string} className={inputCls} />
                  <input value={editForm.billingContactEmail} onChange={(e) => setEditForm({ ...editForm, billingContactEmail: e.target.value })}
                    type="email" placeholder={t('admin.partners.fContactEmail') as string} className={inputCls} />
                  <input value={editForm.billingContactPhone} onChange={(e) => setEditForm({ ...editForm, billingContactPhone: e.target.value })}
                    placeholder={t('admin.partners.fContactPhone') as string} className={inputCls} />
                </div>
              </div>
              <div className="rounded-lg border border-stroke p-3 dark:border-strokedark">
                <div className="mb-2 text-xs font-semibold text-black dark:text-white">{t('admin.partners.businessContact')}</div>
                <div className="flex flex-col gap-2">
                  <input value={editForm.businessContactName} onChange={(e) => setEditForm({ ...editForm, businessContactName: e.target.value })}
                    placeholder={t('admin.partners.fContactName') as string} className={inputCls} />
                  <input value={editForm.businessContactEmail} onChange={(e) => setEditForm({ ...editForm, businessContactEmail: e.target.value })}
                    type="email" placeholder={t('admin.partners.fContactEmail') as string} className={inputCls} />
                  <input value={editForm.businessContactPhone} onChange={(e) => setEditForm({ ...editForm, businessContactPhone: e.target.value })}
                    placeholder={t('admin.partners.fContactPhone') as string} className={inputCls} />
                </div>
              </div>
              <button type="submit" disabled={savingEdit}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
                {savingEdit ? t('common.saving') : t('common.save')}
              </button>
            </form>
          </div>
        </div>
      )}

      {approving && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setApproving(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.approveFor', { name: approving.businessName })}</span>
              <button onClick={() => setApproving(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {approving.crmMatchStatus === 'match_found' && (
              <p className="mb-4 rounded-lg bg-warning/10 p-3 text-xs text-warning">
                {t('admin.partners.crm.duplicateConfirm', { name: approving.businessName, summary: approving.crmMatchSummary || '' })}
              </p>
            )}
            <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.assignRep')}</label>
            <select value={selectedRepId} onChange={(e) => setSelectedRepId(e.target.value)} disabled={loadingReps}
              className={`${inputCls} mb-1`}>
              <option value="">{t('admin.partners.assignRepNone')}</option>
              {crmReps.map((rep) => (
                <option key={rep.id} value={rep.id}>{rep.name}{rep.email ? ` — ${rep.email}` : ''}</option>
              ))}
            </select>
            <p className="mb-4 text-xs text-gray-400">{loadingReps ? t('admin.partners.loadingReps') : t('admin.partners.assignRepHint')}</p>
            <button onClick={confirmApprove} disabled={reviewing}
              className="w-full rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
              {t('admin.partners.approve')}
            </button>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setRejecting(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.rejectFor', { name: rejecting.businessName })}</span>
              <button onClick={() => setRejecting(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3}
              placeholder={t('admin.partners.rejectReasonPh') as string} className={`${inputCls} mb-4`} />
            <button onClick={() => setStatus(rejecting, 'rejected', rejectReason.trim() || undefined)} disabled={reviewing}
              className="w-full rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
              {t('admin.partners.reject')}
            </button>
          </div>
        </div>
      )}

      {inviteFor && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setInviteFor(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.inviteAdminFor', { name: inviteFor.name })}</span>
              <button onClick={() => setInviteFor(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={sendInvite} className="flex flex-col gap-3">
              <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" required
                placeholder={t('partnerPortal.fEmail') as string} className={inputCls} />
              <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder={t('partnerPortal.fName') as string} className={inputCls} />
              <Select
                value={inviteLocale}
                onChange={(v) => setInviteLocale(v as 'fr' | 'en')}
                options={[
                  { value: 'fr', label: t('partnerPortal.localeFr') as string },
                  { value: 'en', label: t('partnerPortal.localeEn') as string },
                ]}
                aria-label={t('partnerPortal.inviteLocaleHint') as string}
              />
              <button type="submit" disabled={inviting}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
                {inviting ? t('partnerPortal.inviting') : t('partnerPortal.invite')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnersAdmin;
