import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Select from '../../components/Select';
import { useTranslation } from 'react-i18next';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import { fmtDate } from '../../lib/format';
import {
  Button, StatusPill, StatusFamily, Modal, DataTable, Column, MenuItem, InlineError, toast, dialog,
} from '../../components/ui';
import { portalError } from './serverError';
import PartnerPageHeader from './PageHeader';
import PartnerAdminOnly from './AdminOnly';
import { usePhone } from './useMedia';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('partnerToken')}` });

interface TeamUser {
  id: number; email: string; displayName: string | null; role: 'admin' | 'standard';
  status: string; totpEnabled: boolean; lastLoginAt: string | null; createdAt: string;
}

const USER_STATUS_FAMILY: Record<string, StatusFamily> = { active: 'ok', invited: 'new', imported: 'neutral', disabled: 'err' };

// Extracted out of PartnerPortal/index.tsx's old "team" tab into its own sidebar page — the
// Partner Portal now has a real left nav (user request 2026-07-2x), so Team is a top-level
// section rather than a subtab of Opportunities.
const PartnerTeamScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = usePartnerAuth();
  const phone = usePhone();
  // Code d'organisation. Ce composant n'est monté que pour un administrateur (PartnerAdminOnly) :
  // un appel qu'on sait voué au 403 serait du bruit dans les journaux.
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [joinDomains, setJoinDomains] = useState<string | null>(null);
  const [joinEnabled, setJoinEnabled] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    axios.get(`${API_URL}/api/partner-portal/team/join-code`, { headers: authHeaders() })
      .then((r) => { setJoinCode(r.data.joinCode); setJoinEnabled(!!r.data.joinEnabled); setJoinDomains(r.data.joinEmailDomains); })
      // Silencieux : l'absence de code n'empêche rien, et une erreur rouge en haut de l'écran
      // Équipe ferait croire à une panne alors que l'inscription est simplement fermée.
      .catch(() => {});
  }, []);

  const copyCode = () => {
    if (!joinCode) return;
    navigator.clipboard?.writeText(joinCode);
    toast.success(t('partnerPortal.join.copiedToast'));
  };
  const rotateCode = async () => {
    if (!(await dialog.confirm(t('partnerPortal.join.rotateConfirm') as string, {
      title: t('partnerPortal.join.rotateTitle') as string, danger: true, confirmText: t('partnerPortal.join.rotate') as string,
    }))) return;
    setRotating(true); setJoinError('');
    try {
      const r = await axios.post(`${API_URL}/api/partner-portal/team/join-code`, {}, { headers: authHeaders() });
      setJoinCode(r.data.joinCode);
      toast.success(t('partnerPortal.join.rotated'));
    } catch (e: any) {
      setJoinError(portalError(e?.response?.data?.error, t, t('partnerPortal.join.rotateFailed') as string));
    } finally { setRotating(false); }
  };

  const [team, setTeam] = useState<TeamUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState('');
  const fetchTeam = async () => {
    setTeamLoading(true); setTeamError('');
    try {
      const r = await axios.get(`${API_URL}/api/partner-portal/team`, { headers: authHeaders() });
      setTeam(r.data.users || []);
    } catch (e: any) { setTeamError(portalError(e?.response?.data?.error, t, t('partnerPortal.loadError') as string)); }
    finally { setTeamLoading(false); }
  };
  useEffect(() => { fetchTeam(); }, []);

  // Invitation nominative — dans une fenêtre : partager le code est devenu le geste principal,
  // inviter une personne à la fois l'exception.
  const defaultLocale = (): 'fr' | 'en' => ((i18n.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'standard' | 'admin'>('standard');
  // Langue du courriel d'invitation. Par defaut celle de la personne qui invite : dans
  // la vaste majorite des cas elle invite quelqu'un de son equipe, donc de sa langue.
  const [inviteLocale, setInviteLocale] = useState<'fr' | 'en'>(defaultLocale);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const openInvite = () => {
    setInviteEmail(''); setInviteName(''); setInviteRole('standard'); setInviteLocale(defaultLocale()); setInviteError('');
    setInviteOpen(true);
  };

  const inviteUser = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true); setInviteError('');
    try {
      await axios.post(`${API_URL}/api/partner-portal/team/invite`,
        { email: inviteEmail.trim(), name: inviteName.trim(), role: inviteRole, locale: inviteLocale },
        { headers: authHeaders() });
      setInviteOpen(false);
      toast.success(t('partnerPortal.invited', { email: inviteEmail.trim() }));
      await fetchTeam();
    } catch (e: any) { setInviteError(portalError(e?.response?.data?.error, t, t('partnerPortal.inviteError') as string)); }
    finally { setInviting(false); }
  };

  // Gestion d'un membre de l'équipe. Les règles vivent côté serveur (dernier administrateur,
  // cloisonnement entre partenaires, soi-même) ; ici on ne fait que TRADUIRE ses refus, et
  // proposer la désactivation quand la suppression est refusée pour cause d'historique.
  const [busyUser, setBusyUser] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const explainRefusal = async (e: any, onDisableInstead?: () => Promise<void>) => {
    const d = e?.response?.data;
    if (d?.error === 'last_admin') { setActionError(t('partnerPortal.userMgmt.errLastAdmin', { name: d.partnerName }) as string); return; }
    if (d?.error === 'cannot_target_self') { setActionError(t('partnerPortal.userMgmt.errSelf') as string); return; }
    if (d?.error === 'user_has_history') {
      const ok = await dialog.confirm(t('partnerPortal.userMgmt.errHistoryAskDisable', {
        email: d.email, opportunities: d.counts?.opportunities ?? 0, invoices: d.counts?.invoices ?? 0,
      }) as string, { confirmText: t('partnerPortal.userMgmt.disable') as string });
      if (ok && onDisableInstead) await onDisableInstead();
      return;
    }
    setActionError(portalError(d?.error, t, e?.message || (t('errors.generic') as string)));
  };
  const patchMember = async (tu: TeamUser, body: any, confirmMsg: string, done: string, danger = false) => {
    if (!(await dialog.confirm(confirmMsg, { danger }))) return;
    setBusyUser(tu.id); setActionError('');
    try {
      await axios.put(`${API_URL}/api/partner-portal/team/${tu.id}`, body, { headers: authHeaders() });
      toast.success(done);
      await fetchTeam();
    } catch (e) { await explainRefusal(e); } finally { setBusyUser(null); }
  };
  const disableMember = (tu: TeamUser) => patchMember(tu, { status: 'disabled' },
    t('partnerPortal.userMgmt.confirmDisable', { email: tu.email }) as string,
    t('partnerPortal.userMgmt.disabledToast', { email: tu.email }) as string, true);
  const deleteMember = async (tu: TeamUser) => {
    if (!(await dialog.confirm(t('partnerPortal.userMgmt.confirmDelete', { email: tu.email }) as string, {
      danger: true, confirmText: t('partnerPortal.userMgmt.delete') as string,
    }))) return;
    setBusyUser(tu.id); setActionError('');
    try {
      await axios.delete(`${API_URL}/api/partner-portal/team/${tu.id}`, { headers: authHeaders() });
      toast.success(t('partnerPortal.userMgmt.deletedToast', { email: tu.email }));
      await fetchTeam();
    } catch (e) {
      await explainRefusal(e, async () => {
        try {
          await axios.put(`${API_URL}/api/partner-portal/team/${tu.id}`, { status: 'disabled' }, { headers: authHeaders() });
          toast.success(t('partnerPortal.userMgmt.disabledToast', { email: tu.email }));
          await fetchTeam();
        } catch (e2) { await explainRefusal(e2); }
      });
    } finally { setBusyUser(null); }
  };

  const roleLabel = (r: TeamUser['role']) => (r === 'admin' ? t('partnerPortal.roleAdmin') : t('partnerPortal.roleStandard')) as string;
  const statusPill = (tu: TeamUser) => (
    // Le statut brut s'affichait en anglais (« imported », « disabled »).
    <StatusPill family={USER_STATUS_FAMILY[tu.status] || 'neutral'}>{t(`partnerPortal.userStatus.${tu.status}`, { defaultValue: tu.status })}</StatusPill>
  );
  const memberCol: Column<TeamUser> = {
    key: 'member', header: t('partnerPortal.colMember'), sortValue: (tu) => tu.displayName || tu.email,
    render: (tu) => (
      <div className="min-w-0 leading-tight">
        <div className="max-w-[240px] truncate font-bold">{tu.displayName || tu.email}</div>
        {tu.displayName && <div className="max-w-[240px] truncate text-xs text-body dark:text-bodydark2">{tu.email}</div>}
        {/* Phone: role and status under the name instead of in their own columns. */}
        {phone && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <StatusPill family={tu.role === 'admin' ? 'new' : 'neutral'}>{roleLabel(tu.role)}</StatusPill>
            {statusPill(tu)}
          </div>
        )}
      </div>
    ),
  };
  const columns: Column<TeamUser>[] = phone ? [memberCol] : [
    memberCol,
    { key: 'role', header: t('partnerPortal.colRole'), sortValue: (tu) => roleLabel(tu.role),
      render: (tu) => <StatusPill family={tu.role === 'admin' ? 'new' : 'neutral'}>{roleLabel(tu.role)}</StatusPill> },
    { key: 'status', header: t('partnerPortal.colStatus'), sortValue: (tu) => tu.status, render: statusPill },
    { key: 'last', header: t('partnerPortal.colLastLogin'), align: 'right', className: 'whitespace-nowrap tabular-nums',
      sortValue: (tu) => (tu.lastLoginAt ? new Date(tu.lastLoginAt).getTime() : null),
      render: (tu) => (tu.lastLoginAt ? fmtDate(tu.lastLoginAt) : <span className="text-body dark:text-bodydark2">{t('partnerPortal.neverLoggedIn')}</span>) },
  ];
  const rowActions = (tu: TeamUser): MenuItem[] => {
    const busy = busyUser === tu.id;
    const nextRole = tu.role === 'admin' ? 'standard' : 'admin';
    return [
      {
        label: `${t(nextRole === 'admin' ? 'partnerPortal.userMgmt.makeAdmin' : 'partnerPortal.userMgmt.makeStandard')}…`,
        disabled: busy,
        onSelect: () => patchMember(tu, { role: nextRole },
          t('partnerPortal.userMgmt.confirmRole', { email: tu.email, role: roleLabel(nextRole) }) as string,
          t('partnerPortal.userMgmt.roleToast', { email: tu.email, role: roleLabel(nextRole) }) as string),
      },
      tu.status === 'disabled'
        ? { label: `${t('partnerPortal.userMgmt.enable')}…`, disabled: busy,
            onSelect: () => patchMember(tu, { status: 'active' }, t('partnerPortal.userMgmt.confirmEnable', { email: tu.email }) as string,
              t('partnerPortal.userMgmt.enabledToast', { email: tu.email }) as string) }
        : { label: `${t('partnerPortal.userMgmt.disable')}…`, disabled: busy, onSelect: () => disableMember(tu) },
      { label: `${t('partnerPortal.userMgmt.delete')}…`, danger: true, separated: true, disabled: busy, onSelect: () => deleteMember(tu) },
    ];
  };

  const inputCls = 'h-11 w-full rounded-xl border border-stroke bg-white px-3.5 text-sm font-normal text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white';
  const labelCls = 'flex flex-col gap-1.5 text-[13px] font-bold text-black dark:text-white';
  const card = 'rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';
  const signupLink = joinCode ? `${window.location.origin}/partner-portal/signup?code=${joinCode}` : '';

  return (
    <div className="flex flex-col gap-4">
      <PartnerPageHeader eyebrow={user?.partnerName} title={t('partnerPortal.sidebar.team')}
        actions={<Button variant="primary" size="md" onClick={openInvite}>{t('partnerPortal.inviteTeammate')}</Button>} />

      {/* Le code d'organisation passe AVANT la liste : partager un code à toute son équipe est
          devenu le geste principal, inviter une personne à la fois l'exception. */}
      {joinEnabled && joinCode && (
        <section className={`${card} p-4 sm:p-6`}>
          <h2 className="m-0 text-base font-bold text-black dark:text-white">{t('partnerPortal.join.title')}</h2>
          <p className="m-0 mt-1 text-[13px] text-body dark:text-bodydark2">{t('partnerPortal.join.hint')}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={copyCode} title={t('partnerPortal.join.copy') as string}
              className="max-w-full break-all rounded-xl border border-strokestrong px-4 py-2.5 font-mono text-lg tracking-widest text-black hover:border-primary dark:border-graydark dark:text-white">
              {joinCode}
            </button>
            <Button size="sm" onClick={copyCode}>{t('partnerPortal.join.copy')}</Button>
            <Button size="sm" variant="ghost" onClick={rotateCode} disabled={rotating}>
              {rotating ? t('common.saving') : `${t('partnerPortal.join.rotate')}…`}
            </Button>
          </div>
          {joinError && <InlineError className="mt-3" title={t('partnerPortal.join.rotateFailed')} detail={joinError !== t('partnerPortal.join.rotateFailed') ? joinError : undefined} />}
          {/* Les domaines en LECTURE : c'est ce que l'administrateur répondra au collègue dont
              l'adresse personnelle est refusée. Il ne peut pas les changer — c'est ce qui rend
              le code inoffensif s'il circule trop. */}
          {joinDomains && <p className="m-0 mt-3 text-xs text-body dark:text-bodydark2">{t('partnerPortal.join.domains', { domains: joinDomains })}</p>}
          <p className="m-0 mt-1 break-all text-xs text-body dark:text-bodydark2">
            {t('partnerPortal.join.linkHint')} <span className="font-mono">{signupLink}</span>
          </p>
        </section>
      )}

      {actionError && <InlineError title={t('partnerPortal.userMgmt.actionFailed')} detail={actionError} />}

      <DataTable<TeamUser>
        title={t('partnerPortal.teamTableTitle')}
        columns={columns}
        rows={team}
        rowKey={(tu) => tu.id}
        rowActions={rowActions}
        rowLabel={(tu) => t('partnerPortal.userMgmt.actionsOn', { email: tu.email }) as string}
        defaultSort={{ key: 'member', dir: 'asc' }}
        loading={teamLoading}
        error={teamError ? { title: t('partnerPortal.loadError'), body: teamError !== t('partnerPortal.loadError') ? teamError : undefined, onRetry: fetchTeam } : null}
        empty={{ title: t('partnerPortal.teamEmpty') }}
      />

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t('partnerPortal.inviteTeammate')}
        dirty={!inviting && !!(inviteEmail.trim() || inviteName.trim())}
        size="sm"
        footer={(
          <>
            <Button size="md" onClick={() => setInviteOpen(false)} disabled={inviting}>{t('common.cancel')}</Button>
            <Button size="md" variant="primary" type="submit" form="partner-invite-form" disabled={inviting || !inviteEmail.trim()}>
              {inviting ? t('partnerPortal.inviting') : t('partnerPortal.invite')}
            </Button>
          </>
        )}
      >
        <form id="partner-invite-form" onSubmit={inviteUser} className="flex flex-col gap-3.5">
          <label className={labelCls}>{t('partnerPortal.fEmail')}
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" required autoComplete="off" className={inputCls} />
          </label>
          <label className={labelCls}>{t('partnerPortal.fName')}
            <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} autoComplete="off" className={inputCls} />
          </label>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className={labelCls}>
              <span>{t('partnerPortal.colRole')}</span>
              <Select value={inviteRole} onChange={(v) => setInviteRole(v as 'standard' | 'admin')} aria-label={t('partnerPortal.colRole') as string}
                options={[{ value: 'standard', label: t('partnerPortal.roleStandard') as string }, { value: 'admin', label: t('partnerPortal.roleAdmin') as string }]} buttonClassName={inputCls} />
            </div>
            <div className={labelCls}>
              <span>{t('partnerPortal.inviteLocaleLabel')}</span>
              <Select value={inviteLocale} onChange={(v) => setInviteLocale(v as 'fr' | 'en')} aria-label={t('partnerPortal.inviteLocaleHint') as string}
                options={[{ value: 'fr', label: t('partnerPortal.localeFr') as string }, { value: 'en', label: t('partnerPortal.localeEn') as string }]} buttonClassName={inputCls} />
            </div>
          </div>
          {inviteError && <InlineError title={t('partnerPortal.inviteError')} detail={inviteError !== t('partnerPortal.inviteError') ? inviteError : undefined} />}
        </form>
      </Modal>
    </div>
  );
};

const PartnerTeam: React.FC = () => {
  const { t } = useTranslation();
  const { user } = usePartnerAuth();
  // Standard users get the title and the « réservé aux administrateurs » card, never the
  // screen itself (its requests would only collect 403s).
  return (
    <PartnerAdminOnly fallbackHeader={<PartnerPageHeader eyebrow={user?.partnerName} title={t('partnerPortal.sidebar.team')} />}>
      <PartnerTeamScreen />
    </PartnerAdminOnly>
  );
};

export default PartnerTeam;
