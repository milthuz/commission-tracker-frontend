import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL;

interface LocalUser {
  id: number;
  email: string;
  display_name: string | null;
  status: 'invited' | 'active' | 'disabled';
  totp_enabled: boolean;
  invite_expires_at: string | null;
  invited_by: string | null;
  last_login_at: string | null;
  created_at: string;
}

// Admin card: external (non-Zoho) users — invite by email, manage status.
// They log in with email+password+TOTP; permissions via Admin → Roles (by email).
const ExternalUsers: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [smtpConfigured, setSmtpConfigured] = useState(true);
  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string; link?: string } | null>(null);

  const hdrs = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const load = async () => {
    try {
      const r = await axios.get(`${API_URL}/api/admin/local-users`, hdrs());
      setUsers(r.data.users || []);
      setSmtpConfigured(!!r.data.smtpConfigured);
    } catch { /* silent */ }
  };
  useEffect(() => { load(); }, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setNotice(null);
    try {
      const r = await axios.post(`${API_URL}/api/admin/local-users/invite`, { email: invEmail, name: invName }, hdrs());
      setNotice(r.data.emailSent
        ? { type: 'success', msg: t('admin.externalUsers.inviteSent', { email: invEmail }) as string }
        : { type: 'success', msg: t('admin.externalUsers.inviteNotSent') as string, link: r.data.inviteUrl });
      setInvEmail(''); setInvName('');
      await load();
    } catch (e: any) {
      setNotice({ type: 'error', msg: e?.response?.data?.error || 'Failed' });
    } finally { setBusy(false); }
  };

  const resend = async (u: LocalUser) => {
    setBusy(true); setNotice(null);
    try {
      const r = await axios.post(`${API_URL}/api/admin/local-users/invite`, { email: u.email, name: u.display_name || '' }, hdrs());
      setNotice(r.data.emailSent
        ? { type: 'success', msg: t('admin.externalUsers.inviteSent', { email: u.email }) as string }
        : { type: 'success', msg: t('admin.externalUsers.inviteNotSent') as string, link: r.data.inviteUrl });
      await load();
    } catch (e: any) {
      setNotice({ type: 'error', msg: e?.response?.data?.error || 'Failed' });
    } finally { setBusy(false); }
  };

  const setStatus = async (u: LocalUser, status: 'active' | 'disabled') => {
    try {
      await axios.put(`${API_URL}/api/admin/local-users/${u.id}/status`, { status }, hdrs());
      await load();
    } catch (e: any) {
      setNotice({ type: 'error', msg: e?.response?.data?.error || 'Failed' });
    }
  };

  const remove = async (u: LocalUser) => {
    if (!confirm(t('admin.externalUsers.confirmDelete', { email: u.email }) as string)) return;
    try {
      await axios.delete(`${API_URL}/api/admin/local-users/${u.id}`, hdrs());
      await load();
    } catch (e: any) {
      setNotice({ type: 'error', msg: e?.response?.data?.error || 'Failed' });
    }
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return iso; }
  };

  const statusBadge = (u: LocalUser) => {
    const map = {
      invited:  { cls: 'bg-warning bg-opacity-10 text-warning', label: t('admin.externalUsers.statusInvited') },
      active:   { cls: 'bg-success bg-opacity-10 text-success', label: t('admin.externalUsers.statusActive') },
      disabled: { cls: 'bg-danger bg-opacity-10 text-danger',   label: t('admin.externalUsers.statusDisabled') },
    } as const;
    const m = map[u.status] || map.invited;
    return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${m.cls}`}>{m.label}</span>;
  };

  return (
    <div className="mt-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
        <h3 className="text-lg font-semibold text-black dark:text-white">🔐 {t('admin.externalUsers.title')}</h3>
        <p className="mt-1 text-sm text-body">{t('admin.externalUsers.subtitle')}</p>
        {!smtpConfigured && (
          <p className="mt-2 rounded-md border border-warning border-opacity-40 bg-warning bg-opacity-10 px-3 py-2 text-xs text-black dark:text-white">
            ⚠ {t('admin.externalUsers.smtpWarning')}
          </p>
        )}
      </div>

      <div className="p-7">
        {/* Invite form */}
        <form onSubmit={invite} className="mb-6 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">{t('admin.externalUsers.email')}</label>
            <input type="email" required value={invEmail} onChange={(e) => setInvEmail(e.target.value)}
              placeholder="personne@exemple.com"
              className="w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input" />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">{t('admin.externalUsers.name')}</label>
            <input type="text" value={invName} onChange={(e) => setInvName(e.target.value)}
              placeholder={t('admin.externalUsers.namePlaceholder') as string}
              className="w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input" />
          </div>
          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
            {busy && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            {t('admin.externalUsers.sendInvite')}
          </button>
        </form>

        {notice && (
          <div className={`mb-5 rounded-md px-4 py-3 text-sm ${notice.type === 'success' ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}>
            {notice.msg}
            {notice.link && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-white px-2 py-1 text-[11px] text-black dark:bg-meta-4 dark:text-white">{notice.link}</code>
                <button onClick={() => navigator.clipboard?.writeText(notice.link!)}
                  className="whitespace-nowrap rounded border border-stroke px-2 py-1 text-xs font-medium text-body hover:text-primary dark:border-strokedark">
                  {t('admin.externalUsers.copyLink')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Users table */}
        {users.length === 0 ? (
          <p className="py-4 text-center text-sm text-body">{t('admin.externalUsers.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-gray-2 text-left dark:bg-meta-4">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t('admin.externalUsers.email')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('admin.externalUsers.name')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('admin.externalUsers.status')}</th>
                  <th className="px-4 py-2.5 font-medium">2FA</th>
                  <th className="px-4 py-2.5 font-medium">{t('admin.externalUsers.lastLogin')}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t('admin.externalUsers.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-stroke dark:border-strokedark">
                    <td className="px-4 py-2.5 font-medium text-black dark:text-white">{u.email}</td>
                    <td className="px-4 py-2.5 text-black dark:text-white">{u.display_name || '—'}</td>
                    <td className="px-4 py-2.5">{statusBadge(u)}</td>
                    <td className="px-4 py-2.5">{u.totp_enabled ? '✅' : '—'}</td>
                    <td className="px-4 py-2.5 text-body">{fmtDate(u.last_login_at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        {u.status === 'invited' && (
                          <button onClick={() => resend(u)} disabled={busy}
                            className="rounded border border-stroke px-2.5 py-1 text-xs font-medium text-body hover:text-primary dark:border-strokedark">
                            {t('admin.externalUsers.resend')}
                          </button>
                        )}
                        {u.status === 'active' && (
                          <button onClick={() => setStatus(u, 'disabled')}
                            className="rounded border border-stroke px-2.5 py-1 text-xs font-medium text-warning dark:border-strokedark">
                            {t('admin.externalUsers.disable')}
                          </button>
                        )}
                        {u.status === 'disabled' && (
                          <button onClick={() => setStatus(u, 'active')}
                            className="rounded border border-stroke px-2.5 py-1 text-xs font-medium text-success dark:border-strokedark">
                            {t('admin.externalUsers.enable')}
                          </button>
                        )}
                        <button onClick={() => remove(u)}
                          className="rounded border border-stroke px-2.5 py-1 text-xs font-medium text-danger dark:border-strokedark">
                          {t('admin.externalUsers.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-body">{t('admin.externalUsers.rolesHint')}</p>
      </div>
    </div>
  );
};

export default ExternalUsers;
