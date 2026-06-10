import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import ClusterDark from '../../images/logo/cluster-on-dark.svg';
import { useAppVersion } from '../../hooks/useAppVersion';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com';

type Step = 'creds' | 'mfa' | 'forgot' | 'forgotSent';

// Split-screen login (Wealthsimple-style): dark brand panel + light form panel.
// Two ways in: email+password+TOTP (external users) or Zoho SSO (internal users).
const ZohoLogin = () => {
  const { t } = useTranslation();
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const appVersion = useAppVersion();

  const [step, setStep] = useState<Step>('creds');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const handleZohoLogin = async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/zoho`);
      const data = await response.json();
      if (data.authUrl) window.location.href = data.authUrl;
    } catch (e) {
      console.error('Failed to initiate Zoho login:', e);
    }
  };

  const finishLogin = async (token: string) => {
    // Pull the verified identity so AuthContext has fresh user data
    const v = await fetch(`${API_URL}/api/auth/verify`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await v.json();
    login(data.user, token);
    navigate('/', { replace: true });
  };

  const submitCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Login failed'); return; }
      if (d.mfaRequired) { setMfaToken(d.mfaToken); setCode(''); setStep('mfa'); }
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  const submitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/auth/login/verify-2fa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken, code }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Invalid code'); return; }
      await finishLogin(d.token);
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setStep('forgotSent');
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  const inputCls = 'w-full rounded-xl border border-stroke bg-gray-50 px-5 py-4 text-base text-black outline-none transition focus:border-primary focus:bg-white dark:border-strokedark dark:bg-meta-4 dark:text-white';

  return (
    <div className="flex min-h-screen">
      {/* Left — brand panel */}
      <div className="relative hidden w-1/2 flex-col bg-[#0f1722] lg:flex">
        <div className="px-12 py-10">
          <img src={ClusterDark} alt="Cluster" className="h-9 w-auto" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-16 pb-24 text-center">
          <p className="mb-6 text-sm font-semibold uppercase tracking-[0.25em] text-[#8a99af]">
            Sales Hub
          </p>
          <h1 className="mb-6 max-w-lg text-5xl font-bold leading-tight text-white">
            {t('auth.tagline')}
          </h1>
          <p className="max-w-md text-base leading-relaxed text-[#aab8c9]">
            {t('auth.taglineSub')}
          </p>
        </div>
        <p className="absolute bottom-8 left-12 text-xs text-[#5c6b80]">
          © Cluster Systems · v{appVersion}
        </p>
      </div>

      {/* Right — form panel */}
      <div className="flex w-full flex-col items-center justify-center bg-gray-100 px-4 py-10 dark:bg-boxdark-2 lg:w-1/2">
        {/* Mobile-only logo */}
        <div className="mb-8 rounded-xl bg-[#0f1722] px-6 py-4 lg:hidden">
          <img src={ClusterDark} alt="Cluster" className="h-8 w-auto" />
        </div>

        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl dark:bg-boxdark sm:p-10">
          {step === 'creds' && (
            <>
              <h2 className="mb-8 text-center text-3xl font-bold text-black dark:text-white">
                {t('auth.welcomeBack')}
              </h2>
              <form onSubmit={submitCreds} className="space-y-4">
                <input
                  type="email" required value={email} autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.email') as string}
                  className={inputCls}
                />
                <input
                  type="password" required value={password} autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.password') as string}
                  className={inputCls}
                />
                <div>
                  <button type="button" onClick={() => { setError(''); setStep('forgot'); }}
                    className="text-sm font-medium text-black underline hover:text-primary dark:text-bodydark">
                    {t('auth.forgotPassword')}
                  </button>
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <button type="submit" disabled={busy}
                  className="mx-auto !mt-6 flex w-full items-center justify-center rounded-full bg-black py-4 text-base font-semibold text-white transition hover:bg-opacity-80 disabled:opacity-50 dark:bg-primary">
                  {busy ? <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : t('auth.logIn')}
                </button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-stroke dark:bg-strokedark" />
                <span className="text-xs uppercase text-body">{t('auth.or')}</span>
                <div className="h-px flex-1 bg-stroke dark:bg-strokedark" />
              </div>

              <button onClick={handleZohoLogin}
                className="flex w-full items-center justify-center gap-3 rounded-full border border-stroke bg-white py-4 text-base font-semibold text-black transition hover:bg-gray-50 dark:border-strokedark dark:bg-meta-4 dark:text-white">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M23.5 12C23.5 5.649 18.351 0.5 12 0.5C5.649 0.5 0.5 5.649 0.5 12C0.5 18.351 5.649 23.5 12 23.5C18.351 23.5 23.5 18.351 23.5 12Z" fill="#1D8AC7" />
                  <path d="M6 9H18V15H6V9Z" fill="white" />
                </svg>
                {t('auth.zohoLogin')}
              </button>
            </>
          )}

          {step === 'mfa' && (
            <>
              <h2 className="mb-2 text-center text-2xl font-bold text-black dark:text-white">
                {t('auth.mfaTitle')}
              </h2>
              <p className="mb-8 text-center text-sm text-body">{t('auth.mfaSubtitle')}</p>
              <form onSubmit={submitMfa} className="space-y-4">
                <input
                  type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000" autoFocus
                  className={`${inputCls} text-center text-2xl font-bold tracking-[0.5em]`}
                />
                {error && <p className="text-sm text-danger">{error}</p>}
                <button type="submit" disabled={busy || code.length !== 6}
                  className="flex w-full items-center justify-center rounded-full bg-black py-4 text-base font-semibold text-white transition hover:bg-opacity-80 disabled:opacity-50 dark:bg-primary">
                  {busy ? <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : t('auth.verify')}
                </button>
                <button type="button" onClick={() => { setError(''); setStep('creds'); }}
                  className="w-full text-center text-sm font-medium text-body hover:text-primary">
                  ← {t('auth.back')}
                </button>
              </form>
            </>
          )}

          {step === 'forgot' && (
            <>
              <h2 className="mb-2 text-center text-2xl font-bold text-black dark:text-white">
                {t('auth.forgotTitle')}
              </h2>
              <p className="mb-8 text-center text-sm text-body">{t('auth.forgotSubtitle')}</p>
              <form onSubmit={submitForgot} className="space-y-4">
                <input
                  type="email" required value={email} autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.email') as string}
                  className={inputCls}
                />
                {error && <p className="text-sm text-danger">{error}</p>}
                <button type="submit" disabled={busy}
                  className="flex w-full items-center justify-center rounded-full bg-black py-4 text-base font-semibold text-white transition hover:bg-opacity-80 disabled:opacity-50 dark:bg-primary">
                  {busy ? <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : t('auth.sendResetLink')}
                </button>
                <button type="button" onClick={() => { setError(''); setStep('creds'); }}
                  className="w-full text-center text-sm font-medium text-body hover:text-primary">
                  ← {t('auth.back')}
                </button>
              </form>
            </>
          )}

          {step === 'forgotSent' && (
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success bg-opacity-10">
                <svg className="h-7 w-7 text-success" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-black dark:text-white">{t('auth.forgotSentTitle')}</h2>
              <p className="mb-8 text-sm text-body">{t('auth.forgotSentSubtitle')}</p>
              <button onClick={() => setStep('creds')}
                className="w-full rounded-full border border-stroke py-3.5 text-base font-semibold text-black hover:bg-gray-50 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
                ← {t('auth.backToLoginBtn')}
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 max-w-md text-center text-sm text-body">
          {t('auth.agreePrefix')}{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-black underline hover:text-primary dark:text-bodydark">
            {t('legal.termsTitle')}
          </a>{' '}
          {t('auth.and')}{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-black underline hover:text-primary dark:text-bodydark">
            {t('legal.privacyTitle')}
          </a>
        </p>
      </div>
    </div>
  );
};

export default ZohoLogin;
