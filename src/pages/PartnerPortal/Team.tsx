import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Select from '../../components/Select';
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
  const { t, i18n } = useTranslation();
  const { user } = usePartnerAuth();

  const [team, setTeam] = useState<TeamUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'standard' | 'admin'>('standard');
  // Langue du courriel d'invitation. Par defaut celle de la personne qui invite : dans
  // la vaste majorite des cas elle invite quelqu'un de son equipe, donc de sa langue.
  const [inviteLocale, setInviteLocale] = useState<'fr' | 'en'>(
    (i18n.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en'
  );
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
        { email: inviteEmail.trim(), name: inviteName.trim(), role: inviteRole, locale: inviteLocale },
        { headers: authHeaders() });
      setInviteEmail(''); setInviteName(''); setInviteRole('standard');
      await fetchTeam();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('partnerPortal.inviteError') as string); }
    finally { setInviting(false); }
  };

  const inputCls = 'w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';


  // Gestion d'un membre de l'équipe. Les règles vivent côté serveur (dernier administrateur,
  // cloisonnement entre partenaires, soi-même) ; ici on ne fait que TRADUIRE ses refus, et
  // proposer la désactivation quand la suppression est refusée pour cause d'historique.
  const [busyUser, setBusyUser] = useState<number | null>(null);
  const explainRefusal = async (e: any, onDisableInstead?: () => Promise<void>) => {
    const d = e?.response?.data;
    if (d?.error === 'last_admin') { dialog.alert(t('partnerPortal.userMgmt.errLastAdmin', { name: d.partnerName }) as string); return; }
    if (d?.error === 'cannot_target_self') { dialog.alert(t('partnerPortal.userMgmt.errSelf') as string); return; }
    if (d?.error === 'user_has_history') {
      const ok = await dialog.confirm(t('partnerPortal.userMgmt.errHistoryAskDisable', {
        email: d.email, opportunities: d.counts?.opportunities ?? 0, invoices: d.counts?.invoices ?? 0,
      }) as string);
      if (ok && onDisableInstead) await onDisableInstead();
      return;
    }
    dialog.alert(d?.error || e?.message || 'Action failed');
  };
  const patchMember = async (tu: TeamUser, body: any, confirmMsg: string) => {
    if (!(await dialog.confirm(confirmMsg))) return;
    setBusyUser(tu.id);
    try {
      await axios.put(`${API_URL}/api/partner-portal/team/${tu.id}`, body, { headers: authHeaders() });
      await fetchTeam();
    } catch (e) { await explainRefusal(e); } finally { setBusyUser(null); }
  };
  const disableMember = (tu: TeamUser) => patchMember(tu, { status: 'disabled' },
    t('partnerPortal.userMgmt.confirmDisable', { email: tu.email }) as string);
  const deleteMember = async (tu: TeamUser) => {
    if (!(await dialog.confirm(t('partnerPortal.userMgmt.confirmDelete', { email: tu.email }) as string))) return;
    setBusyUser(tu.id);
    try {
      await axios.delete(`${API_URL}/api/partner-portal/team/${tu.id}`, { headers: authHeaders() });
      await fetchTeam();
    } catch (e) {
      await explainRefusal(e, async () => {
        await axios.put(`${API_URL}/api/partner-portal/team/${tu.id}`, { status: 'disabled' }, { headers: authHeaders() });
        await fetchTeam();
      });
    } finally { setBusyUser(null); }
  };

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
            <Select value={inviteRole} onChange={(v) => setInviteRole(v as 'standard' | 'admin')} options={[{ value: 'standard', label: t('partnerPortal.roleStandard') as string }, { value: 'admin', label: t('partnerPortal.roleAdmin') as string }]} buttonClassName={inputCls} className="max-w-[160px]" />
            <Select
              value={inviteLocale}
              onChange={(v) => setInviteLocale(v as 'fr' | 'en')}
              options={[
                { value: 'fr', label: t('partnerPortal.localeFr') as string },
                { value: 'en', label: t('partnerPortal.localeEn') as string },
              ]}
              aria-label={t('partnerPortal.inviteLocaleHint') as string}
              className="max-w-[160px]"
            />
            <button type="submit" disabled={inviting}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
              {inviting ? t('partnerPortal.inviting') : t('partnerPortal.invite')}
            </button>
          </form>
        </div>
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          {teamLoading ? (
            <div className="flex h-24 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stroke dark:border-strokedark">
                  <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.fEmail')}</th>
                  <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colRole')}</th>
                  <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('partnerPortal.colStatus')}</th>
                  <th className="px-4 py-3 text-right font-semibold text-black dark:text-white">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {team.map((tu) => (
                  <tr key={tu.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                    <td className="px-4 py-3 text-black dark:text-white">{tu.displayName || tu.email}<div className="text-xs text-gray-400">{tu.email}</div></td>
                    <td className="px-4 py-3 text-body">
                      {/* Le rôle se change en cliquant la pastille — même idiome que les statuts
                          cliquables ailleurs dans l'app. */}
                      <button
                        onClick={() => patchMember(tu, { role: tu.role === 'admin' ? 'standard' : 'admin' },
                          t('partnerPortal.userMgmt.confirmRole', { email: tu.email,
                            role: t(tu.role === 'admin' ? 'partnerPortal.roleStandard' : 'partnerPortal.roleAdmin') }) as string)}
                        disabled={busyUser === tu.id}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold disabled:opacity-50 ${
                          tu.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-gray-2 text-gray-500 dark:bg-meta-4'}`}>
                        {tu.role === 'admin' ? t('partnerPortal.roleAdmin') : t('partnerPortal.roleStandard')}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {/* Le statut brut s'affichait en anglais (« imported », « disabled »). */}
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        tu.status === 'active' ? 'bg-success/15 text-green-700 dark:text-success'
                        : tu.status === 'disabled' ? 'bg-danger/15 text-danger'
                        : 'bg-gray-2 text-gray-500 dark:bg-meta-4'}`}>
                        {t(`partnerPortal.userStatus.${tu.status}`, { defaultValue: tu.status })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {tu.status === 'disabled' ? (
                          <button onClick={() => patchMember(tu, { status: 'active' },
                            t('partnerPortal.userMgmt.confirmEnable', { email: tu.email }) as string)}
                            disabled={busyUser === tu.id}
                            className="whitespace-nowrap rounded-md border border-success/40 px-2 py-1 text-[11px] font-medium text-green-700 hover:bg-success/10 disabled:opacity-50 dark:text-success">
                            {t('partnerPortal.userMgmt.enable')}
                          </button>
                        ) : (
                          <button onClick={() => disableMember(tu)} disabled={busyUser === tu.id}
                            className="whitespace-nowrap rounded-md border border-stroke px-2 py-1 text-[11px] font-medium text-body hover:border-danger hover:text-danger disabled:opacity-50 dark:border-strokedark">
                            {t('partnerPortal.userMgmt.disable')}
                          </button>
                        )}
                        <button onClick={() => deleteMember(tu)} disabled={busyUser === tu.id}
                          title={t('partnerPortal.userMgmt.delete') as string}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-stroke text-body hover:border-danger hover:text-danger disabled:opacity-50 dark:border-strokedark">
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
          )}
        </div>
      </div>
    </div>
  );
};

export default PartnerTeam;
