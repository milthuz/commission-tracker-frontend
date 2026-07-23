import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import SalesHubLogo from '../../components/SalesHubLogo';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com';

type Step = 'loading' | 'invalid' | 'password' | 'qr' | 'done';

// Invitation acceptance: set a password, then MANDATORY TOTP enrollment (QR + code),
// then the user is logged in. Reached from the emailed link /accept-invite?token=…
const AcceptInvite = () => {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [step, setStep] = useState<Step>('loading');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invalidMsg, setInvalidMsg] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) { setStep('invalid'); setInvalidMsg(t('auth.invite.invalid') as string); return; }
      try {
        const r = await fetch(`${API_URL}/api/auth/invite-info?token=${encodeURIComponent(token)}`);
        const d = await r.json();
        if (!r.ok) {
          setInvalidMsg(r.status === 410 ? (t('auth.invite.expired') as string) : (t('auth.invite.invalid') as string));
          setStep('invalid');
          return;
        }
        setInviteEmail(d.email);
        setStep('password');
      } catch {
        setInvalidMsg(t('auth.networkError') as string);
        setStep('invalid');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw1.length < 8) { setError(t('auth.invite.pwTooShort') as string); return; }
    if (pw1 !== pw2) { setError(t('auth.invite.pwMismatch') as string); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/auth/invite/accept`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw1 }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Failed'); return; }
      setQr(d.qrDataUrl); setSecret(d.secret); setSetupToken(d.setupToken);
      setStep('qr');
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/auth/invite/verify-2fa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupToken, code }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Invalid code'); return; }
      const v = await fetch(`${API_URL}/api/auth/verify`, { headers: { Authorization: `Bearer ${d.token}` } });
      const vd = await v.json();
      login(vd.user, d.token);
      setStep('done');
      setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  const inputCls = 'w-full rounded-xl border border-stroke bg-gray-50 px-5 py-4 text-base text-black outline-none transition focus:border-primary focus:bg-white dark:border-strokedark dark:bg-meta-4 dark:text-white';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-10 dark:bg-boxdark-2">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <SalesHubLogo variant="stacked" tone="light" className="h-32 w-auto" />
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-xl dark:bg-boxdark sm:p-10">
          {step === 'loading' && (
            <div className="flex justify-center py-10">
              <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          )}

          {step === 'invalid' && (
            <div className="text-center">
              <h2 className="mb-3 text-2xl font-bold text-black dark:text-white">{t('auth.invite.invalidTitle')}</h2>
              <p className="mb-8 text-sm text-body">{invalidMsg}</p>
              <Link to="/auth/zoho-login" className="font-medium text-primary hover:underline">
                ← {t('auth.backToLoginBtn')}
              </Link>
            </div>
          )}

          {step === 'password' && (
            <>
              <h2 className="mb-2 text-center text-2xl font-bold text-black dark:text-white">{t('auth.invite.title')}</h2>
              <p className="mb-8 text-center text-sm text-body">
                {t('auth.invite.subtitle')} <span className="font-semibold text-black dark:text-white">{inviteEmail}</span>
              </p>
              <form onSubmit={submitPassword} className="space-y-4">
                <input type="password" required value={pw1} autoComplete="new-password"
                  onChange={(e) => setPw1(e.target.value)}
                  placeholder={t('auth.invite.choosePassword') as string} className={inputCls} />
                <input type="password" required value={pw2} autoComplete="new-password"
                  onChange={(e) => setPw2(e.target.value)}
                  placeholder={t('auth.invite.confirmPassword') as string} className={inputCls} />
                <p className="text-xs text-body">{t('auth.invite.pwHint')}</p>
                {error && <p className="text-sm text-danger">{error}</p>}
                <button type="submit" disabled={busy}
                  className="flex w-full items-center justify-center rounded-full bg-black py-4 text-base font-semibold text-white transition hover:bg-opacity-80 disabled:opacity-50 dark:bg-primary">
                  {busy ? <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : t('auth.invite.continue')}
                </button>
              </form>
            </>
          )}

          {step === 'qr' && (
            <>
              <h2 className="mb-2 text-center text-2xl font-bold text-black dark:text-white">{t('auth.invite.mfaTitle')}</h2>
              <p className="mb-6 text-center text-sm text-body">{t('auth.invite.mfaSubtitle')}</p>
              <div className="mb-4 flex justify-center">
                <img src={qr} alt="QR code" className="rounded-lg border border-stroke dark:border-strokedark" />
              </div>
              <p className="mb-6 text-center text-xs text-body">
                {t('auth.invite.manualKey')}<br />
                <code className="mt-1 inline-block rounded bg-gray-100 px-2 py-1 font-mono text-[11px] text-black dark:bg-meta-4 dark:text-white">{secret}</code>
              </p>
              <form onSubmit={submitCode} className="space-y-4">
                <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className={`${inputCls} text-center text-2xl font-bold tracking-[0.5em]`} />
                {error && <p className="text-sm text-danger">{error}</p>}
                <button type="submit" disabled={busy || code.length !== 6}
                  className="flex w-full items-center justify-center rounded-full bg-black py-4 text-base font-semibold text-white transition hover:bg-opacity-80 disabled:opacity-50 dark:bg-primary">
                  {busy ? <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : t('auth.invite.activate')}
                </button>
              </form>
            </>
          )}

          {step === 'done' && (
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success bg-opacity-10">
                <svg className="h-7 w-7 text-success" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-black dark:text-white">{t('auth.invite.doneTitle')}</h2>
              <p className="mt-2 text-sm text-body">{t('auth.invite.doneSubtitle')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AcceptInvite;
