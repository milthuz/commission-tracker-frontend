import React, { useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('partnerToken')}` });

const PartnerProfile: React.FC = () => {
  const { t } = useTranslation();
  const { user, checkAuth } = usePartnerAuth();

  const [displayName, setDisplayName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');

  // 2FA device reset — request a fresh secret/QR, then confirm with a live code before it
  // replaces the current device (mirrors the invite-time QR setup step).
  const [totpEnabled, setTotpEnabled] = useState(!!user?.totpEnabled);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<'starting' | 'qr' | 'done'>('starting');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [code, setCode] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');

  const inputCls = 'w-full rounded-lg border border-stroke bg-transparent py-3 px-5 text-black outline-none transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';

  const saveProfile = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/partner-portal/profile`, { displayName }, { headers: authHeaders() });
      await checkAuth();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || t('partnerPortal.profile.saveFailed') as string);
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
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 3000);
    } catch (e: any) {
      setPwError(e?.response?.data?.error || t('partnerPortal.profile.passwordSaveFailed') as string);
    } finally {
      setPwSaving(false);
    }
  };

  const startReset = async () => {
    setResetOpen(true);
    setResetStep('starting');
    setResetError('');
    setCode('');
    setResetBusy(true);
    try {
      const r = await axios.post(`${API_URL}/api/partner-portal/2fa/reset`, {}, { headers: authHeaders() });
      setQr(r.data.qrDataUrl); setSecret(r.data.secret); setSetupToken(r.data.setupToken);
      setResetStep('qr');
    } catch (e: any) {
      setResetError(e?.response?.data?.error || t('partnerPortal.profile.twoFactor.resetFailed') as string);
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

  const closeReset = () => { setResetOpen(false); setQr(''); setSecret(''); setSetupToken(''); setCode(''); };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-title-md2 font-semibold text-black dark:text-white">{t('partnerPortal.profile.title')}</h1>
        <p className="text-sm text-body">{user?.partnerName}</p>
      </div>

      <div className="flex flex-col gap-6 xl:max-w-2xl">
        {/* Account Information */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
            <h3 className="text-lg font-semibold text-black dark:text-white">{t('partnerPortal.profile.accountInfo')}</h3>
          </div>
          <div className="p-7">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">{t('partnerPortal.profile.displayName')}</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">{t('partnerPortal.fEmail')}</label>
                <input type="email" value={user?.email || ''} disabled
                  className={`${inputCls} bg-whiter cursor-not-allowed opacity-70`} />
              </div>
              <div>
                <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">{t('partnerPortal.colRole')}</label>
                <input type="text" value={user?.role === 'admin' ? t('partnerPortal.roleAdmin') as string : t('partnerPortal.roleStandard') as string} disabled
                  className={`${inputCls} bg-whiter cursor-not-allowed opacity-70`} />
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button onClick={saveProfile} disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
                {saving ? t('common.saving') : t('common.save')}
              </button>
              {saved && <span className="text-sm font-medium text-success animate-fade-in">{t('partnerPortal.profile.saved')}</span>}
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
            <h3 className="text-lg font-semibold text-black dark:text-white">{t('partnerPortal.profile.changePassword')}</h3>
          </div>
          <div className="p-7">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">{t('partnerPortal.profile.currentPassword')}</label>
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} />
              </div>
              <div />
              <div>
                <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">{t('partnerPortal.profile.newPassword')}</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">{t('partnerPortal.profile.confirmPassword')}</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
              </div>
            </div>
            {pwError && <p className="mt-3 text-sm text-danger">{pwError}</p>}
            <div className="mt-6 flex items-center gap-3">
              <button onClick={changePassword} disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
                {pwSaving ? t('common.saving') : t('partnerPortal.profile.changePassword')}
              </button>
              {pwSaved && <span className="text-sm font-medium text-success animate-fade-in">{t('partnerPortal.profile.passwordSaved')}</span>}
            </div>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
            <h3 className="text-lg font-semibold text-black dark:text-white">{t('partnerPortal.profile.twoFactor.title')}</h3>
          </div>
          <div className="p-7">
            <div className="flex items-center gap-3">
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${totpEnabled ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}>
                {totpEnabled ? t('partnerPortal.profile.twoFactor.enabled') : t('partnerPortal.profile.twoFactor.disabled')}
              </span>
            </div>
            <p className="mt-3 text-sm text-body">{t('partnerPortal.profile.twoFactor.subtitle')}</p>
            <div className="mt-6">
              <button onClick={startReset}
                className="inline-flex items-center gap-2 rounded-md border border-stroke px-6 py-2.5 text-sm font-medium text-black hover:bg-gray-50 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
                {t('partnerPortal.profile.twoFactor.resetButton')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2FA reset modal */}
      {resetOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => !resetBusy && closeReset()}>
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
            {resetStep === 'starting' && (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            )}
            {resetStep === 'qr' && (
              <>
                <h3 className="mb-1 text-lg font-semibold text-black dark:text-white">{t('partnerPortal.profile.twoFactor.resetTitle')}</h3>
                <p className="mb-4 text-sm text-body">{t('partnerPortal.profile.twoFactor.resetSubtitle')}</p>
                <div className="mb-4 flex justify-center">
                  {qr && <img src={qr} alt="QR code" className="rounded-lg border border-stroke dark:border-strokedark" />}
                </div>
                <p className="mb-4 text-center text-xs text-body">
                  {t('partnerPortal.profile.twoFactor.manualKey')}<br />
                  <code className="mt-1 inline-block rounded bg-gray-100 px-2 py-1 font-mono text-[11px] text-black dark:bg-meta-4 dark:text-white">{secret}</code>
                </p>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className={`${inputCls} text-center text-2xl font-bold tracking-[0.5em]`} />
                {resetError && <p className="mt-3 text-sm text-danger">{resetError}</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={closeReset} disabled={resetBusy}
                    className="rounded-md border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-50 disabled:opacity-50 dark:border-strokedark">
                    {t('common.cancel')}
                  </button>
                  <button onClick={confirmReset} disabled={resetBusy || code.length !== 6}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
                    {resetBusy ? t('common.saving') : t('partnerPortal.profile.twoFactor.confirmButton')}
                  </button>
                </div>
              </>
            )}
            {resetStep === 'done' && (
              <>
                <h3 className="mb-2 text-lg font-semibold text-black dark:text-white">{t('partnerPortal.profile.twoFactor.doneTitle')}</h3>
                <p className="mb-4 text-sm text-body">{t('partnerPortal.profile.twoFactor.doneSubtitle')}</p>
                <div className="flex justify-end">
                  <button onClick={closeReset}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90">
                    {t('common.close')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnerProfile;
