import React, { useState } from 'react';
import PasswordInput from '../../components/PasswordInput';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import { Button, StatusPill, Modal, InlineError, StateCard, toast } from '../../components/ui';
import { portalError } from './serverError';
import PartnerPageHeader from './PageHeader';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('partnerToken')}` });

const PartnerProfile: React.FC = () => {
  const { t } = useTranslation();
  const { user, checkAuth } = usePartnerAuth();

  const [displayName, setDisplayName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');

  // 2FA device reset — request a fresh secret/QR, then confirm with a live code before it
  // replaces the current device (mirrors the invite-time QR setup step).
  const [totpEnabled, setTotpEnabled] = useState(!!user?.totpEnabled);
  const [resetOpen, setResetOpen] = useState(false);
  // 'password' first — the backend now requires the current password to re-bind 2FA, so a stolen
  // session token alone can't move the second factor to an attacker's authenticator.
  const [resetStep, setResetStep] = useState<'password' | 'starting' | 'qr' | 'done' | 'disable'>('password');
  const [resetPassword, setResetPassword] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [code, setCode] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');

  const inputCls = 'h-11 w-full rounded-xl border border-stroke bg-white px-3.5 text-sm text-black outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:bg-gray-2 disabled:text-body dark:border-strokedark dark:bg-form-input dark:text-white dark:disabled:bg-meta-4 dark:disabled:text-bodydark2';
  const labelCls = 'mb-1.5 block text-[13px] font-bold text-black dark:text-white';
  const card = 'rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';
  const cardHead = 'border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6';

  const saveProfile = async () => {
    setSaving(true); setSaveError('');
    try {
      await axios.put(`${API_URL}/api/partner-portal/profile`, { displayName }, { headers: authHeaders() });
      await checkAuth();
      toast.success(t('partnerPortal.profile.saved'));
    } catch (e: any) {
      setSaveError(portalError(e?.response?.data?.error, t, t('partnerPortal.profile.saveFailed') as string));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setPwError('');
    if (newPassword.length < 8) { setPwError(t('partnerPortal.profile.passwordTooShort') as string); return; }
    if (newPassword !== confirmPassword) { setPwError(t('partnerPortal.profile.passwordMismatch') as string); return; }
    setPwSaving(true);
    try {
      await axios.post(`${API_URL}/api/partner-portal/change-password`,
        { currentPassword, newPassword }, { headers: authHeaders() });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      toast.success(t('partnerPortal.profile.passwordSaved'));
    } catch (e: any) {
      setPwError(portalError(e?.response?.data?.error, t, t('partnerPortal.profile.passwordSaveFailed') as string));
    } finally {
      setPwSaving(false);
    }
  };

  const startReset = () => {
    setResetOpen(true);
    setResetStep('password');
    setResetError('');
    setCode('');
    setResetPassword('');
  };

  const submitResetPassword = async () => {
    setResetError('');
    setResetBusy(true);
    setResetStep('starting');
    try {
      const r = await axios.post(`${API_URL}/api/partner-portal/2fa/reset`,
        { currentPassword: resetPassword }, { headers: authHeaders() });
      setQr(r.data.qrDataUrl); setSecret(r.data.secret); setSetupToken(r.data.setupToken);
      setResetStep('qr');
    } catch (e: any) {
      setResetError(e?.response?.data?.error || t('partnerPortal.profile.twoFactor.resetFailed') as string);
      setResetStep('password');
    } finally {
      setResetBusy(false);
    }
  };

  const confirmReset = async () => {
    setResetError('');
    setResetBusy(true);
    try {
      await axios.post(`${API_URL}/api/partner-portal/2fa/confirm`, { setupToken, code }, { headers: authHeaders() });
      setTotpEnabled(true);
      setResetStep('done');
    } catch (e: any) {
      setResetError(e?.response?.data?.error || t('partnerPortal.profile.twoFactor.invalidCode') as string);
    } finally {
      setResetBusy(false);
    }
  };

  // Retirer la double authentification exige le mot de passe courant, comme pour la poser :
  // un jeton vole ne doit pas pouvoir baisser la protection du compte.
  const startDisable = () => {
    setResetError(''); setResetPassword('');
    setResetStep('disable');
    setResetOpen(true);
  };

  const submitDisable = async () => {
    setResetError('');
    setResetBusy(true);
    try {
      await axios.post(`${API_URL}/api/partner-portal/2fa/disable`,
        { currentPassword: resetPassword }, { headers: authHeaders() });
      setTotpEnabled(false);
      setResetStep('done');
    } catch (e: any) {
      setResetError(e?.response?.data?.error || t('partnerPortal.profile.twoFactor.resetFailed') as string);
    } finally {
      setResetBusy(false);
    }
  };

  const closeReset = () => { if (resetBusy) return; setResetOpen(false); setQr(''); setSecret(''); setSetupToken(''); setCode(''); };

  const tf = 'partnerPortal.profile.twoFactor';
  const modalTitle = resetStep === 'disable' ? t(`${tf}.disableTitle`) : resetStep === 'done' ? t(`${tf}.doneTitle`) : t(`${tf}.resetTitle`);
  const cancelBtn = <Button size="md" onClick={closeReset} disabled={resetBusy}>{t('common.cancel')}</Button>;
  const modalFooter = resetStep === 'password' ? (
    <>{cancelBtn}<Button size="md" variant="primary" onClick={submitResetPassword} disabled={resetBusy || !resetPassword}>{t('common.continue')}</Button></>
  ) : resetStep === 'qr' ? (
    <>{cancelBtn}<Button size="md" variant="primary" onClick={confirmReset} disabled={resetBusy || code.length !== 6}>
      {resetBusy ? t('common.saving') : t(`${tf}.confirmButton`)}</Button></>
  ) : resetStep === 'disable' ? (
    <>{cancelBtn}<Button size="md" variant="danger" onClick={submitDisable} disabled={resetBusy || !resetPassword}>{t(`${tf}.disableButton`)}</Button></>
  ) : resetStep === 'done' ? (
    <Button size="md" variant="primary" onClick={closeReset}>{t('common.close')}</Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <PartnerPageHeader eyebrow={user?.partnerName} title={t('partnerPortal.profile.title')} />

      <div className="flex flex-col gap-4 xl:max-w-2xl">
        {/* Account Information */}
        <section className={card}>
          <div className={cardHead}>
            <h2 className="m-0 text-base font-bold text-black dark:text-white">{t('partnerPortal.profile.accountInfo')}</h2>
          </div>
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pp-name" className={labelCls}>{t('partnerPortal.profile.displayName')}</label>
                <input id="pp-name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="pp-email" className={labelCls}>{t('partnerPortal.fEmail')}</label>
                <input id="pp-email" type="email" value={user?.email || ''} disabled className={inputCls} />
              </div>
              <div>
                <label htmlFor="pp-role" className={labelCls}>{t('partnerPortal.colRole')}</label>
                <input id="pp-role" type="text" value={user?.role === 'admin' ? t('partnerPortal.roleAdmin') as string : t('partnerPortal.roleStandard') as string} disabled className={inputCls} />
              </div>
            </div>
            {saveError && <InlineError title={t('partnerPortal.profile.saveFailed')} detail={saveError !== t('partnerPortal.profile.saveFailed') ? saveError : undefined} />}
            <div>
              <Button variant="primary" size="md" onClick={saveProfile} disabled={saving} className="max-sm:w-full">
                {saving ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </section>

        {/* Change Password */}
        <section className={card}>
          <div className={cardHead}>
            <h2 className="m-0 text-base font-bold text-black dark:text-white">{t('partnerPortal.profile.changePassword')}</h2>
          </div>
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pp-cur" className={labelCls}>{t('partnerPortal.profile.currentPassword')}</label>
                <PasswordInput id="pp-cur" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} />
              </div>
              <div className="max-sm:hidden" />
              <div>
                <label htmlFor="pp-new" className={labelCls}>{t('partnerPortal.profile.newPassword')}</label>
                <PasswordInput id="pp-new" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="pp-new2" className={labelCls}>{t('partnerPortal.profile.confirmPassword')}</label>
                <PasswordInput id="pp-new2" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
              </div>
            </div>
            {pwError && <InlineError title={pwError} />}
            <div>
              <Button variant="primary" size="md" onClick={changePassword} disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword} className="max-sm:w-full">
                {pwSaving ? t('common.saving') : t('partnerPortal.profile.changePassword')}
              </Button>
            </div>
          </div>
        </section>

        {/* Two-Factor Authentication */}
        <section className={card}>
          <div className={`${cardHead} flex flex-wrap items-center justify-between gap-2`}>
            <h2 className="m-0 text-base font-bold text-black dark:text-white">{t(`${tf}.title`)}</h2>
            <StatusPill family={totpEnabled ? 'ok' : 'wait'}>{totpEnabled ? t(`${tf}.enabled`) : t(`${tf}.disabled`)}</StatusPill>
          </div>
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <p className="m-0 text-[13px] text-body dark:text-bodydark2">
              {totpEnabled ? t(`${tf}.subtitle`) : t(`${tf}.offSubtitle`)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="md" variant={totpEnabled ? 'secondary' : 'primary'} onClick={startReset}>
                {totpEnabled ? t(`${tf}.resetButton`) : t(`${tf}.enableButton`)}
              </Button>
              {totpEnabled && (
                <Button size="md" onClick={startDisable} className="!text-[#D92D20] dark:!text-[#F46060]">
                  {t(`${tf}.disableButton`)}…
                </Button>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* 2FA set-up / reset / removal — the shared window: Échap ferme, le focus y reste. */}
      <Modal open={resetOpen} onClose={closeReset} title={modalTitle} size="sm" footer={modalFooter}>
        {resetStep === 'password' && (
          <>
            <p className="m-0 text-sm text-body dark:text-bodydark2">{t(`${tf}.confirmPasswordFirst`)}</p>
            <PasswordInput autoComplete="current-password" autoFocus
              value={resetPassword} onChange={(e) => setResetPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && resetPassword) submitResetPassword(); }}
              placeholder={t('partnerPortal.profile.currentPassword') as string}
              aria-label={t('partnerPortal.profile.currentPassword') as string}
              className={inputCls} />
          </>
        )}
        {resetStep === 'starting' && <StateCard kind="loading" />}
        {resetStep === 'qr' && (
          <>
            <p className="m-0 text-sm text-body dark:text-bodydark2">{t(`${tf}.resetSubtitle`)}</p>
            <div className="flex justify-center">
              {qr && <img src={qr} alt={t(`${tf}.qrAlt`) as string} className="max-w-full rounded-xl border border-stroke bg-white dark:border-strokedark" />}
            </div>
            <p className="m-0 text-center text-xs text-body dark:text-bodydark2">
              {t(`${tf}.manualKey`)}<br />
              <code className="mt-1 inline-block max-w-full break-all rounded bg-gray-2 px-2 py-1 font-mono text-[11px] text-black dark:bg-meta-4 dark:text-white">{secret}</code>
            </p>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) confirmReset(); }}
              placeholder="000000" aria-label={t(`${tf}.codeLabel`) as string}
              className={`${inputCls} !h-14 text-center text-2xl font-bold tracking-[0.5em]`} />
          </>
        )}
        {resetStep === 'disable' && (
          <>
            <p className="m-0 text-sm text-body dark:text-bodydark2">{t(`${tf}.disableSubtitle`)}</p>
            <PasswordInput value={resetPassword} onChange={(e) => setResetPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && resetPassword) submitDisable(); }}
              autoComplete="current-password" autoFocus
              placeholder={t(`${tf}.currentPassword`) as string}
              aria-label={t(`${tf}.currentPassword`) as string}
              className={inputCls} />
          </>
        )}
        {resetStep === 'done' && <p className="m-0 text-sm text-body dark:text-bodydark2">{t(`${tf}.doneSubtitle`)}</p>}
        {resetError && resetStep !== 'done' && <InlineError title={resetError} />}
      </Modal>
    </div>
  );
};

export default PartnerProfile;
