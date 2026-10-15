import { useEffect, useState } from 'react';
import PasswordInput from '../../components/PasswordInput';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import ClusterWordmark from '../../components/ClusterWordmark';
import { useAppVersion } from '../../hooks/useAppVersion';
import { getDeviceToken, storeDeviceToken } from '../../lib/deviceTrust';
import { portalError } from './serverError';
import { useClusterFavicon } from '../../hooks/useClusterFavicon';
import { Button, InlineError } from '../../components/ui';

const DEVICE_TOKEN_PREFIX = 'partnerDeviceToken';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com';

type Step = 'creds' | 'mfa' | 'forgot' | 'forgotSent';

// Modeled on Authentication/ZohoLogin.tsx's creds/mfa/forgot/forgotSent state machine, minus the
// Zoho SSO button and "no account? sign up" block — a partner account only ever has email+
// password+TOTP, no SSO option.
const PartnerLogin = () => {
  // Page PUBLIQUE : hors du gabarit partenaire, elle n'heritait pas de l'icone Cluster.
  useClusterFavicon();
  const { t } = useTranslation();
  const { isAuthenticated, login } = usePartnerAuth();
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
  const [rememberDevice, setRememberDevice] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as any)?.from?.pathname || '/partner-portal';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const finishLogin = async (token: string) => {
    const v = await fetch(`${API_URL}/api/partner-auth/verify`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await v.json();
    login(data.user, token);
    navigate('/partner-portal', { replace: true });
  };

  const submitCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const deviceToken = getDeviceToken(DEVICE_TOKEN_PREFIX, email);
      const r = await fetch(`${API_URL}/api/partner-auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, deviceToken }),
      });
      const d = await r.json();
      // `partner_inactive` est un code, pas une phrase : le montrer tel quel a un partenaire
      // ne lui apprend rien. Et le message doit se distinguer d'un mot de passe refuse —
      // sinon la personne cherche indefiniment une erreur de saisie qui n'existe pas.
      if (!r.ok) { setError(portalError(d.error, t, t('partnerPortal.serverError.loginFailed') as string)); return; }
      if (d.mfaRequired) { setMfaToken(d.mfaToken); setCode(''); setStep('mfa'); }
      else if (d.token) { await finishLogin(d.token); } // trusted device — MFA skipped
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  const submitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/partner-auth/login/verify-2fa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken, code, rememberDevice }),
      });
      const d = await r.json();
      if (!r.ok) { setError(portalError(d.error, t, t('partnerPortal.profile.twoFactor.invalidCode') as string)); return; }
      if (d.deviceToken) storeDeviceToken(DEVICE_TOKEN_PREFIX, email, d.deviceToken);
      await finishLogin(d.token);
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await fetch(`${API_URL}/api/partner-auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setStep('forgotSent');
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  const inputCls = 'h-12 w-full rounded-xl border border-stroke bg-white px-4 text-base text-black outline-none transition focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white';

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col bg-[#0F0F10] lg:flex">
        <div className="px-12 py-10">
          <ClusterWordmark tone="dark" className="h-8 w-auto" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-16 pb-24 text-center">
          <h1 className="mb-6 max-w-lg text-5xl font-bold leading-tight text-white">
            {t('partnerPortal.loginTagline')}
          </h1>
          <p className="max-w-md text-base leading-relaxed text-[#aab8c9]">
            {t('partnerPortal.loginTaglineSub')}
          </p>
        </div>
        <p className="absolute bottom-8 left-12 text-xs text-[#5c6b80]">
          © Cluster Systems · v{appVersion}
        </p>
      </div>

      <div className="flex w-full flex-col items-center justify-center bg-gray-2 px-4 py-10 dark:bg-boxdark-2 lg:w-1/2">
        <div className="mb-8 rounded-xl bg-[#0F0F10] px-6 py-5 lg:hidden">
          <ClusterWordmark tone="dark" className="h-8 w-auto" />
        </div>

        <div className="w-full max-w-md rounded-[20px] border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark sm:p-10">
          {step === 'creds' && (
            <>
              <h2 className="mb-2 text-center text-3xl font-bold text-black dark:text-white">
                {t('partnerPortal.title')}
              </h2>
              <p className="mb-8 text-center text-sm text-body">{t('partnerPortal.loginSubtitle')}</p>
              <form onSubmit={submitCreds} className="space-y-4">
                <input
                  type="email" required value={email} autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.email') as string}
                  className={inputCls}
                />
                <PasswordInput
                   required value={password} autoComplete="current-password"
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
                {error && <InlineError title={error} />}
                <Button type="submit" variant="primary" disabled={busy} className="!h-12 w-full text-base">
                  {busy ? <span aria-label={t('common.loading') as string} className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#141414] border-t-transparent" /> : t('auth.logIn')}
                </Button>
              </form>
              {/* La porte d entree de l inscription libre : sans ce lien, un partenaire a qui on
                  a donne un code n a nulle part ou le saisir. */}
              <p className="mt-6 text-center text-sm text-body">
                {t('partnerPortal.signup.noAccount')}{' '}
                <Link to="/partner-portal/signup" className="font-semibold text-primary hover:underline">
                  {t('partnerPortal.signup.createOne')}
                </Link>
              </p>
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
                <label className="flex items-center gap-2.5 text-sm text-black dark:text-bodydark">
                  <input type="checkbox" checked={rememberDevice} onChange={(e) => setRememberDevice(e.target.checked)}
                    className="h-4 w-4 rounded-[6px] border-stroke text-primary focus:ring-primary dark:border-strokedark" />
                  {t('auth.rememberDevice')}
                </label>
                {error && <InlineError title={error} />}
                <Button type="submit" variant="primary" disabled={busy || code.length !== 6} className="!h-12 w-full text-base">
                  {busy ? <span aria-label={t('common.loading') as string} className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#141414] border-t-transparent" /> : t('auth.verify')}
                </Button>
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
                {error && <InlineError title={error} />}
                <Button type="submit" variant="primary" disabled={busy} className="!h-12 w-full text-base">
                  {busy ? <span aria-label={t('common.loading') as string} className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#141414] border-t-transparent" /> : t('auth.sendResetLink')}
                </Button>
                <button type="button" onClick={() => { setError(''); setStep('creds'); }}
                  className="w-full text-center text-sm font-medium text-body hover:text-primary">
                  ← {t('auth.back')}
                </button>
              </form>
            </>
          )}

          {step === 'forgotSent' && (
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(23,178,106,0.12)] dark:bg-[rgba(23,178,106,0.18)]">
                <svg className="h-7 w-7 text-[#067647] dark:text-[#57D193]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-black dark:text-white">{t('auth.forgotSentTitle')}</h2>
              <p className="mb-8 text-sm text-body">{t('auth.forgotSentSubtitle')}</p>
              <Button onClick={() => setStep('creds')} className="!h-12 w-full text-base">
                ← {t('auth.backToLoginBtn')}
              </Button>
            </div>
          )}
        </div>

        <p className="mt-6 max-w-md text-center text-sm text-body">
          {t('auth.agreePrefix')}{' '}
          <a href="/terms?from=partner" target="_blank" rel="noopener noreferrer" className="font-medium text-black underline hover:text-primary dark:text-bodydark">
            {t('legal.termsTitle')}
          </a>{' '}
          {t('auth.and')}{' '}
          <a href="/privacy?from=partner" target="_blank" rel="noopener noreferrer" className="font-medium text-black underline hover:text-primary dark:text-bodydark">
            {t('legal.privacyTitle')}
          </a>
        </p>
      </div>
    </div>
  );
};

export default PartnerLogin;
