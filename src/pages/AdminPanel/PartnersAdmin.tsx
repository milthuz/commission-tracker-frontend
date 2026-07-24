import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface Partner { id: number; name: string; active: boolean; createdAt: string; hasLogo: boolean; userCount: number; }
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
  crmLeadId: string | null;
  crmLeadError: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-warning/15 text-warning',
  approved: 'bg-success/15 text-green-700 dark:text-success',
  rejected: 'bg-danger/15 text-danger',
};

const PartnersAdmin: React.FC = () => {
  const { t } = useTranslation();
  const [sub, setSub] = useState<'partners' | 'queue'>('partners');

  // Manage Partners
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [inviteFor, setInviteFor] = useState<Partner | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
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

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteFor || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await axios.post(`${API_URL}/api/admin/partners/${inviteFor.id}/invite-admin`,
        { email: inviteEmail.trim(), name: inviteName.trim() }, { headers: authHeaders() });
      setInviteFor(null); setInviteEmail(''); setInviteName('');
      await fetchPartners();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to send invite'); }
    finally { setInviting(false); }
  };

  // Opportunity Queue
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  const fetchQueue = async () => {
    setLoadingQueue(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/partner-opportunities`, {
        headers: authHeaders(), params: statusFilter === 'all' ? {} : { status: statusFilter },
      });
      setOpportunities(r.data.opportunities || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to load the opportunity queue'); }
    finally { setLoadingQueue(false); }
  };
  useEffect(() => { if (sub === 'queue') fetchQueue(); }, [sub, statusFilter]);

  const [rejecting, setRejecting] = useState<Opportunity | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [checkingCrmId, setCheckingCrmId] = useState<number | null>(null);

  const setStatus = async (o: Opportunity, status: 'approved' | 'rejected', rejectionReason?: string) => {
    setReviewing(true);
    try {
      const r = await axios.put(`${API_URL}/api/admin/partner-opportunities/${o.id}`, { status, rejectionReason }, { headers: authHeaders() });
      setRejecting(null); setRejectReason('');
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
  const approve = async (o: Opportunity) => {
    // SH-28 — flag a possible duplicate to the approver before they create a fresh Lead anyway.
    if (o.crmMatchStatus === 'match_found') {
      if (!(await dialog.confirm(t('admin.partners.crm.duplicateConfirm', { name: o.businessName, summary: o.crmMatchSummary || '' }) as string))) return;
    } else if (!(await dialog.confirm(t('admin.partners.approveConfirm', { name: o.businessName }) as string))) return;
    setStatus(o, 'approved');
  };

  const recheckCrm = async (o: Opportunity) => {
    setCheckingCrmId(o.id);
    try {
      const r = await axios.post(`${API_URL}/api/admin/partner-opportunities/${o.id}/crm-check`, {}, { headers: authHeaders() });
      setOpportunities((prev) => prev.map((x) => x.id === o.id
        ? { ...x, crmMatchStatus: r.data.crmMatchStatus, crmMatchSummary: r.data.crmMatchSummary }
        : x));
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to check Zoho CRM'); }
    finally { setCheckingCrmId(null); }
  };

  const inputCls = 'w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-stroke bg-white p-1 shadow-default dark:border-strokedark dark:bg-boxdark">
        {(['partners', 'queue'] as const).map((key) => (
          <button key={key} onClick={() => setSub(key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${sub === key ? 'bg-primary text-white shadow-sm' : 'text-body hover:bg-gray-50 dark:hover:bg-meta-4'}`}>
            {t(`admin.partners.tabs.${key}`)}
          </button>
        ))}
      </div>

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
              <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
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
                        <button onClick={() => setInviteFor(p)}
                          className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">
                          {t('admin.partners.inviteAdmin')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {sub === 'queue' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">{t('admin.partners.filterStatus')}</span>
            <div className="inline-flex rounded-full border border-stroke p-1 dark:border-strokedark">
              {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${statusFilter === s ? 'bg-primary text-white' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`}>
                  {s === 'all' ? t('common.all') : t(`partnerPortal.status.${s}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            {loadingQueue ? (
              <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
            ) : opportunities.length === 0 ? (
              <div className="p-8 text-center text-sm text-body">{t('admin.partners.noOpportunities')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stroke dark:border-strokedark">
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.colPartner')}</th>
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colBusiness')}</th>
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colContact')}</th>
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.colSubmittedBy')}</th>
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colStatus')}</th>
                      <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.crm.title')}</th>
                      <th className="px-4 py-3 text-right font-semibold text-black dark:text-white">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.map((o) => (
                      <tr key={o.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                        <td className="px-4 py-3 text-black dark:text-white">{o.partnerName}</td>
                        <td className="px-4 py-3 font-medium text-black dark:text-white">{o.businessName}</td>
                        <td className="px-4 py-3 text-body">
                          {[o.contactFirstName, o.contactLastName].filter(Boolean).join(' ') || '—'}
                          {o.contactEmail && <div className="text-xs text-gray-400">{o.contactEmail}</div>}
                        </td>
                        <td className="px-4 py-3 text-body">{o.submittedByEmail || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[o.status]}`}>{t(`partnerPortal.status.${o.status}`)}</span>
                          {o.status === 'rejected' && o.rejectionReason && <div className="mt-1 text-xs text-gray-400">{o.rejectionReason}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {o.crmMatchStatus === 'match_found' && (
                            <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning" title={o.crmMatchSummary || ''}>
                              {t('admin.partners.crm.matchFound')}
                            </span>
                          )}
                          {o.crmMatchStatus === 'no_match' && (
                            <span className="rounded-full bg-gray-2 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-meta-4">{t('admin.partners.crm.noMatch')}</span>
                          )}
                          {o.crmMatchStatus === 'check_failed' && (
                            <span className="rounded-full bg-gray-2 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-meta-4">{t('admin.partners.crm.checkFailed')}</span>
                          )}
                          {!o.crmMatchStatus && (
                            <span className="text-xs text-gray-400">{t('admin.partners.crm.notChecked')}</span>
                          )}
                          {o.status === 'pending' && (
                            <button onClick={() => recheckCrm(o)} disabled={checkingCrmId === o.id}
                              className="ml-2 text-xs font-medium text-primary hover:underline disabled:opacity-50">
                              {checkingCrmId === o.id ? t('admin.partners.crm.checking') : (o.crmMatchStatus ? t('admin.partners.crm.recheck') : t('admin.partners.crm.check'))}
                            </button>
                          )}
                          {o.crmLeadId && (
                            <div className="mt-1 text-xs text-success">{t('admin.partners.crm.leadCreated', { id: o.crmLeadId })}</div>
                          )}
                          {o.crmLeadError && (
                            <div className="mt-1 text-xs text-danger" title={o.crmLeadError}>{t('admin.partners.crm.leadFailed')}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {o.status === 'pending' ? (
                            <div className="flex justify-end gap-2">
                              <button onClick={() => approve(o)} disabled={reviewing}
                                className="rounded-lg border border-success/40 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-success/10 disabled:opacity-60 dark:text-success">
                                {t('admin.partners.approve')}
                              </button>
                              <button onClick={() => { setRejecting(o); setRejectReason(''); }} disabled={reviewing}
                                className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-60">
                                {t('admin.partners.reject')}
                              </button>
                            </div>
                          ) : <span className="text-xs text-gray-400">{o.reviewedBy}</span>}
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
