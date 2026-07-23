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
      </div>
    </div>
  );
};

export default PartnerProfile;
