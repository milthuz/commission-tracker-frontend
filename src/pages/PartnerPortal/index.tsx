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
}
interface TeamUser {
  id: number; email: string; displayName: string | null; role: 'admin' | 'standard';
  status: string; totpEnabled: boolean; lastLoginAt: string | null; createdAt: string;
}
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
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState<'list' | 'submit' | 'team'>('list');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [submitting, setSubmitting] = useState(false);

  const [team, setTeam] = useState<TeamUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'standard' | 'admin'>('standard');
  const [inviting, setInviting] = useState(false);

  const fetchOpportunities = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/partner-portal/opportunities`, { headers: authHeaders() });
      setOpportunities(r.data.opportunities || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('partnerPortal.loadError') as string); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchOpportunities(); }, []);

  const fetchTeam = async () => {
    setTeamLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/partner-portal/team`, { headers: authHeaders() });
      setTeam(r.data.users || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('partnerPortal.loadError') as string); }
    finally { setTeamLoading(false); }
  };
  useEffect(() => { if (isAdmin && tab === 'team') fetchTeam(); }, [isAdmin, tab]);

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

  const inviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await axios.post(`${API_URL}/api/partner-portal/team/invite`,
        { email: inviteEmail.trim(), name: inviteName.trim(), role: inviteRole },
        { headers: authHeaders() });
      setInviteEmail(''); setInviteName(''); setInviteRole('standard');
      await fetchTeam();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('partnerPortal.inviteError') as string); }
    finally { setInviting(false); }
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
        {(['list', 'submit', ...(isAdmin ? ['team'] as const : [])] as const).map((key) => (
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <fieldset className="flex flex-col gap-3 rounded-lg border border-stroke p-4 dark:border-strokedark">
                <span className="text-xs font-bold uppercase text-gray-400">{t('partnerPortal.fContactSection')}</span>
                <input value={form.contactFirstName} onChange={(e) => setF('contactFirstName', e.target.value)} placeholder={t('partnerPortal.fFirstName') as string} className={inputCls} />
                <input value={form.contactLastName} onChange={(e) => setF('contactLastName', e.target.value)} placeholder={t('partnerPortal.fLastName') as string} className={inputCls} />
                <input value={form.contactPhone} onChange={(e) => setF('contactPhone', e.target.value)} placeholder={t('partnerPortal.fPhone') as string} className={inputCls} />
                <input value={form.contactEmail} onChange={(e) => setF('contactEmail', e.target.value)} type="email" placeholder={t('partnerPortal.fEmail') as string} className={inputCls} />
              </fieldset>
              <fieldset className="flex flex-col gap-3 rounded-lg border border-stroke p-4 dark:border-strokedark">
                <span className="text-xs font-bold uppercase text-gray-400">{t('partnerPortal.fRepSection')}</span>
                <input value={form.repFirstName} onChange={(e) => setF('repFirstName', e.target.value)} placeholder={t('partnerPortal.fFirstName') as string} className={inputCls} />
                <input value={form.repLastName} onChange={(e) => setF('repLastName', e.target.value)} placeholder={t('partnerPortal.fLastName') as string} className={inputCls} />
                <input value={form.repPhone} onChange={(e) => setF('repPhone', e.target.value)} placeholder={t('partnerPortal.fPhone') as string} className={inputCls} />
                <input value={form.repEmail} onChange={(e) => setF('repEmail', e.target.value)} type="email" placeholder={t('partnerPortal.fEmail') as string} className={inputCls} />
              </fieldset>
            </div>
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

      {tab === 'team' && isAdmin && (
        <div className="flex flex-col gap-6">
          <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 text-sm font-bold text-black dark:text-white">{t('partnerPortal.inviteTeammate')}</div>
            <form onSubmit={inviteUser} className="flex flex-wrap items-end gap-3">
              <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" required
                placeholder={t('partnerPortal.fEmail') as string} className={`${inputCls} max-w-xs`} />
              <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder={t('partnerPortal.fName') as string} className={`${inputCls} max-w-xs`} />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'standard' | 'admin')} className={`${inputCls} max-w-[160px]`}>
                <option value="standard">{t('partnerPortal.roleStandard')}</option>
                <option value="admin">{t('partnerPortal.roleAdmin')}</option>
              </select>
              <button type="submit" disabled={inviting}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
                {inviting ? t('partnerPortal.inviting') : t('partnerPortal.invite')}
              </button>
            </form>
          </div>
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            {teamLoading ? (
              <div className="flex h-24 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark">
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.fEmail')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colRole')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((tu) => (
                    <tr key={tu.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                      <td className="px-4 py-3 text-black dark:text-white">{tu.displayName || tu.email}<div className="text-xs text-gray-400">{tu.email}</div></td>
                      <td className="px-4 py-3 text-body">{tu.role === 'admin' ? t('partnerPortal.roleAdmin') : t('partnerPortal.roleStandard')}</td>
                      <td className="px-4 py-3 text-body">{tu.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnerPortal;
