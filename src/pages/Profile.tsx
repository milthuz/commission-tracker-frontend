import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL;

interface UserProfile {
  email: string;
  name: string;
  photo: string | null;
  isAdmin: boolean;
  preferences: {
    language: string;
    currency: string;
    dateFormat: string;
    timezone: string;
  };
  salesperson: {
    name: string;
    isActive: boolean;
    commissionRate: number;
  } | null;
  stats: {
    paidInvoices: number;
    totalCommission: number;
    totalRevenue: number;
  };
  memberSince: string | null;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

const CURRENCIES = [
  { code: 'CAD', label: 'CAD ($)', symbol: '$' },
  { code: 'USD', label: 'USD ($)', symbol: '$' },
  { code: 'EUR', label: 'EUR (€)', symbol: '€' },
  { code: 'GBP', label: 'GBP (£)', symbol: '£' },
];

const DATE_FORMATS = [
  { code: 'YYYY-MM-DD', label: '2026-02-25' },
  { code: 'MM/DD/YYYY', label: '02/25/2026' },
  { code: 'DD/MM/YYYY', label: '25/02/2026' },
  { code: 'MMM DD, YYYY', label: 'Feb 25, 2026' },
];

const TIMEZONES = [
  { code: 'America/Toronto', label: 'Eastern Time (Toronto)' },
  { code: 'America/Chicago', label: 'Central Time (Chicago)' },
  { code: 'America/Denver', label: 'Mountain Time (Denver)' },
  { code: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
  { code: 'America/Vancouver', label: 'Pacific Time (Vancouver)' },
  { code: 'America/Montreal', label: 'Eastern Time (Montreal)' },
  { code: 'Europe/London', label: 'GMT (London)' },
  { code: 'Europe/Paris', label: 'CET (Paris)' },
];

const Profile = () => {
  const { t, i18n } = useTranslation();
  useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable fields
  const [displayName, setDisplayName] = useState('');
  const [language, setLanguage] = useState('en');
  const [currency, setCurrency] = useState('CAD');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [timezone, setTimezone] = useState('America/Toronto');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/api/user/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setProfile(res.data);
        setDisplayName(res.data.name || '');
        setLanguage(res.data.preferences.language);
        setCurrency(res.data.preferences.currency);
        setDateFormat(res.data.preferences.dateFormat);
        setTimezone(res.data.preferences.timezone);
        // Sync i18n language with saved preference
        if (res.data.preferences.language !== i18n.language) {
          i18n.changeLanguage(res.data.preferences.language);
          localStorage.setItem('language', res.data.preferences.language);
        }
      } catch (e) {
        console.error('Error fetching profile:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/user/preferences`, {
        displayName,
        language,
        currency,
        dateFormat,
        timezone,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Switch app language immediately
      i18n.changeLanguage(language);
      localStorage.setItem('language', language);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error('Error saving preferences:', e);
      alert('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!profile) {
    return <p className="text-body text-center py-12">{t('profile.failedToLoad')}</p>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">{t('profile.title')}</h2>
        <p className="text-sm text-body">{t('profile.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left Column - User Card */}
        <div className="xl:col-span-1">
          {/* Profile Card */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="p-7 text-center">
              {/* Avatar */}
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-primary bg-opacity-10">
                {profile.photo ? (
                  <img src={profile.photo} alt={profile.name} className="h-24 w-24 rounded-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-primary">
                    {(profile.name || profile.email).charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Name & Email */}
              <h3 className="text-xl font-semibold text-black dark:text-white mb-1">
                {profile.name}
              </h3>
              <p className="text-sm text-body mb-3">{profile.email}</p>

              {/* Badges */}
              <div className="flex items-center justify-center gap-2 mb-5">
                {profile.isAdmin && (
                  <span className="inline-flex rounded-full bg-primary bg-opacity-10 px-3 py-1 text-xs font-bold text-primary">
                    Admin
                  </span>
                )}
                {profile.salesperson && (
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                    profile.salesperson.isActive 
                      ? 'bg-success bg-opacity-10 text-success' 
                      : 'bg-danger bg-opacity-10 text-danger'
                  }`}>
                    {profile.salesperson.isActive ? t('profile.activeRep') : t('profile.inactiveRep')}
                  </span>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-stroke dark:border-strokedark my-5"></div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-bold text-black dark:text-white">
                    {profile.stats.paidInvoices.toLocaleString()}
                  </p>
                  <p className="text-xs text-body">{t('profile.paidInvoices')}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#8B5CF6]">
                    {formatCurrency(profile.stats.totalCommission)}
                  </p>
                  <p className="text-xs text-body">{t('profile.totalCommission')}</p>
                </div>
              </div>

              {/* Commission Rate */}
              {profile.salesperson && (
                <div className="mt-4 rounded-md bg-gray-2 dark:bg-meta-4 p-3">
                  <p className="text-xs text-body">{t('profile.commissionRate')}</p>
                  <p className="text-lg font-bold text-black dark:text-white">{profile.salesperson.commissionRate}%</p>
                </div>
              )}

              {/* Member Since */}
              {profile.memberSince && (
                <p className="mt-5 text-xs text-body">
                  {t('profile.memberSince')} {new Date(profile.memberSince).toLocaleDateString('en-CA', { year: 'numeric', month: 'long' })}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Settings */}
        <div className="xl:col-span-2 space-y-6">

          {/* Account Information */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
              <h3 className="text-lg font-semibold text-black dark:text-white">{t('profile.accountInfo')}</h3>
              <p className="text-sm text-body mt-1">{t('profile.accountInfoSubtitle')}</p>
            </div>
            <div className="p-7">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Display Name */}
                <div>
                  <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">
                    {t('profile.displayName')}
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg border border-stroke bg-transparent py-3 px-5 text-black outline-none transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
                  />
                </div>

                {/* Email (read only) */}
                <div>
                  <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">
                    {t('profile.email')}
                  </label>
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    className="w-full rounded-lg border border-stroke bg-whiter py-3 px-5 text-black outline-none dark:border-form-strokedark dark:bg-form-input dark:text-white cursor-not-allowed opacity-70"
                  />
                  <p className="mt-1 text-xs text-body">{t('common.managedByZoho')}</p>
                </div>

                {/* Role (read only) */}
                <div>
                  <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">
                    {t('profile.role')}
                  </label>
                  <input
                    type="text"
                    value={profile.isAdmin ? t('profile.administrator') : t('profile.salesRepresentative')}
                    disabled
                    className="w-full rounded-lg border border-stroke bg-whiter py-3 px-5 text-black outline-none dark:border-form-strokedark dark:bg-form-input dark:text-white cursor-not-allowed opacity-70"
                  />
                </div>

                {/* Salesperson Name (read only if linked) */}
                <div>
                  <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">
                    {t('profile.salespersonName')}
                  </label>
                  <input
                    type="text"
                    value={profile.salesperson?.name || t('profile.notLinked')}
                    disabled
                    className="w-full rounded-lg border border-stroke bg-whiter py-3 px-5 text-black outline-none dark:border-form-strokedark dark:bg-form-input dark:text-white cursor-not-allowed opacity-70"
                  />
                  <p className="mt-1 text-xs text-body">{t('profile.matchedFromZoho')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
              <h3 className="text-lg font-semibold text-black dark:text-white">{t('profile.preferences')}</h3>
              <p className="text-sm text-body mt-1">{t('profile.preferencesSubtitle')}</p>
            </div>
            <div className="p-7">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Language */}
                <div>
                  <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">
                    {t('profile.language')}
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-lg border border-stroke bg-transparent py-3 px-5 text-black outline-none transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white"
                  >
                    {LANGUAGES.map(l => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>

                {/* Currency */}
                <div>
                  <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">
                    {t('profile.currency')}
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-lg border border-stroke bg-transparent py-3 px-5 text-black outline-none transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Date Format */}
                <div>
                  <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">
                    {t('profile.dateFormat')}
                  </label>
                  <select
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    className="w-full rounded-lg border border-stroke bg-transparent py-3 px-5 text-black outline-none transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white"
                  >
                    {DATE_FORMATS.map(f => (
                      <option key={f.code} value={f.code}>{f.label}</option>
                    ))}
                  </select>
                </div>

                {/* Timezone */}
                <div>
                  <label className="mb-2.5 block text-sm font-medium text-black dark:text-white">
                    {t('profile.timezone')}
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full rounded-lg border border-stroke bg-transparent py-3 px-5 text-black outline-none transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white"
                  >
                    {TIMEZONES.map(t => (
                      <option key={t.code} value={t.code}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Save Button */}
              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      {t('common.saving')}
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {t('common.save')}
                    </>
                  )}
                </button>

                {saved && (
                  <span className="text-sm font-medium text-success animate-fade-in">
                    {t('profile.preferencesSaved')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Session & Security */}
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
              <h3 className="text-lg font-semibold text-black dark:text-white">{t('profile.session')}</h3>
              <p className="text-sm text-body mt-1">{t('profile.sessionSubtitle')}</p>
            </div>
            <div className="p-7">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Auth Provider */}
                <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary bg-opacity-10">
                      <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-black dark:text-white">{t('profile.authProvider')}</p>
                      <p className="text-xs text-body">{t('profile.connectedViaZoho')}</p>
                    </div>
                  </div>
                </div>

                {/* Session Info */}
                <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success bg-opacity-10">
                      <svg className="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-black dark:text-white">{t('profile.sessionActive')}</p>
                      <p className="text-xs text-body">{t('profile.tokenValid')}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* {t('profile.signOut')} */}
              <div className="mt-5">
                <button
                  onClick={() => {
                    if (confirm(t('profile.signOutConfirm'))) {
                      localStorage.removeItem('token');
                      window.location.href = '/auth/zoho-login';
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-danger px-5 py-2.5 text-sm font-medium text-danger hover:bg-danger hover:text-white transition"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {t('profile.signOut')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
