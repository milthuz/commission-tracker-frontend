import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('partnerToken')}` });

interface TeamUser {
  id: number; email: string; displayName: string | null; role: 'admin' | 'standard';
  status: string; totpEnabled: boolean; lastLoginAt: string | null; createdAt: string;
}

// Extracted out of PartnerPortal/index.tsx's old "team" tab into its own sidebar page — the
// Partner Portal now has a real left nav (user request 2026-07-2x), so Team is a top-level
// section rather than a subtab of Opportunities.
const PartnerTeam: React.FC = () => {
  const { t } = useTranslation();
  const { user } = usePartnerAuth();

  const [team, setTeam] = useState<TeamUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'standard' | 'admin'>('standard');
  const [inviting, setInviting] = useState(false);

  const fetchTeam = async () => {
    setTeamLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/partner-portal/team`, { headers: authHeaders() });
      setTeam(r.data.users || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('partnerPortal.loadError') as string); }
    finally { setTeamLoading(false); }
  };
  useEffect(() => { fetchTeam(); }, []);

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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-title-md2 font-semibold text-black dark:text-white">{t('partnerPortal.sidebar.team')}</h1>
        <p className="text-sm text-body">{user?.partnerName}</p>
      </div>

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
    </div>
  );
};

export default PartnerTeam;
