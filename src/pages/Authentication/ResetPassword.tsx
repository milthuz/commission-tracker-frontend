import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ClusterLogo from '../../images/logo/cluster-on-light.svg';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com';

// Password reset landing page — reached from the emailed link /reset-password?token=…
const ResetPassword = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw1.length < 8) { setError(t('auth.invite.pwTooShort') as string); return; }
    if (pw1 !== pw2) { setError(t('auth.invite.pwMismatch') as string); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw1 }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Failed'); return; }
      setDone(true);
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  const inputCls = 'w-full rounded-xl border border-stroke bg-gray-50 px-5 py-4 text-base text-black outline-none transition focus:border-primary focus:bg-white dark:border-strokedark dark:bg-meta-4 dark:text-white';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-10 dark:bg-boxdark-2">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <img src={ClusterLogo} alt="Cluster" className="h-9 w-auto" />
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-xl dark:bg-boxdark sm:p-10">
          {done ? (
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success bg-opacity-10">
                <svg className="h-7 w-7 text-success" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-black dark:text-white">{t('auth.reset.doneTitle')}</h2>
              <p className="mb-8 text-sm text-body">{t('auth.reset.doneSubtitle')}</p>
              <Link to="/auth/zoho-login"
                className="block w-full rounded-full bg-black py-4 text-center text-base font-semibold text-white hover:bg-opacity-80 dark:bg-primary">
                {t('auth.backToLoginBtn')}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="mb-2 text-center text-2xl font-bold text-black dark:text-white">{t('auth.reset.title')}</h2>
              <p className="mb-8 text-center text-sm text-body">{t('auth.reset.subtitle')}</p>
              <form onSubmit={submit} className="space-y-4">
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
                  {busy ? <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : t('auth.reset.submit')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
