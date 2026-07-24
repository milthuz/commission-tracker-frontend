import React, { useEffect, useState } from 'react';
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
}
interface TeamMember { id: number; email: string; displayName: string | null; }
const BLANK_FORM = {
  businessName: '', contactFirstName: '', contactLastName: '', contactPhone: '', contactEmail: '',
  repFirstName: '', repLastName: '', repPhone: '', repEmail: '', notes: '',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-warning/15 text-warning',
  approved: 'bg-success/15 text-green-700 dark:text-success',
  rejected: 'bg-danger/15 text-danger',
};

const PartnerPortal: React.FC = () => {
  const { t } = useTranslation();
  const { user } = usePartnerAuth();

  const [tab, setTab] = useState<'list' | 'submit'>('list');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [submitting, setSubmitting] = useState(false);

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

  const inputCls = 'w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';
  const setF = (k: keyof typeof BLANK_FORM, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-title-md2 font-semibold text-black dark:text-white">{t('partnerPortal.title')}</h1>
        <p className="text-sm text-body">{user?.partnerName}</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-stroke bg-white p-1 shadow-default dark:border-strokedark dark:bg-boxdark">
        {(['list', 'submit'] as const).map((key) => (
          <button key={key} onClick={() => setTab(key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${tab === key ? 'bg-primary text-white shadow-sm' : 'text-body hover:bg-gray-50 dark:hover:bg-meta-4'}`}>
            {t(`partnerPortal.tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          {loading ? (
            <div className="flex h-32 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : opportunities.length === 0 ? (
            <div className="p-10 text-center text-sm text-body">{t('partnerPortal.noOpportunities')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark">
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colBusiness')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colContact')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colStatus')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colAssignedRep')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colLeadStage')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colSubmitted')}</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((o) => (
                    <tr key={o.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                      <td className="px-4 py-3 font-medium text-black dark:text-white">{o.businessName}</td>
                      <td className="px-4 py-3 text-body">
                        {[o.contactFirstName, o.contactLastName].filter(Boolean).join(' ') || '—'}
                        {o.contactEmail && <div className="text-xs text-gray-400">{o.contactEmail}</div>}
                      </td>
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
                      <td className="px-4 py-3 text-body">{new Date(o.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
    </div>
  );
};

export default PartnerPortal;
