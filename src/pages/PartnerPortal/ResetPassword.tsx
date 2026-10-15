import { useState } from 'react';
import PasswordInput from '../../components/PasswordInput';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ClusterWordmark from '../../components/ClusterWordmark';
import { Button, InlineError } from '../../components/ui';
import { useClusterFavicon } from '../../hooks/useClusterFavicon';
import { portalError } from './serverError';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com';

// Modeled on Authentication/ResetPassword.tsx, pointed at /api/partner-auth/reset-password.
const PartnerResetPassword = () => {
  // Page PUBLIQUE : hors du gabarit partenaire, elle n'heritait pas de l'icone Cluster.
  useClusterFavicon();
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
      const r = await fetch(`${API_URL}/api/partner-auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw1 }),
      });
      const d = await r.json();
      if (!r.ok) { setError(portalError(d.error, t, t('errors.generic') as string)); return; }
      setDone(true);
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  const inputCls = 'h-12 w-full rounded-xl border border-stroke bg-white px-4 text-base text-black outline-none transition focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-2 px-4 py-10 dark:bg-boxdark-2">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          {/* Portail partenaire = marque Cluster (cette page montrait le logo Sales Hub). */}
          <ClusterWordmark className="h-10 w-auto" />
        </div>
        <div className="rounded-[20px] border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark sm:p-10">
          {done ? (
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(23,178,106,0.12)] dark:bg-[rgba(23,178,106,0.18)]">
                <svg className="h-7 w-7 text-[#067647] dark:text-[#57D193]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-black dark:text-white">{t('auth.reset.doneTitle')}</h2>
              <p className="mb-8 text-sm text-body">{t('auth.reset.doneSubtitle')}</p>
              <Link to="/partner-portal/login"
                className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-bold text-[#141414] hover:bg-[#F79C6A]">
                {t('auth.backToLoginBtn')}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="mb-2 text-center text-2xl font-bold text-black dark:text-white">{t('auth.reset.title')}</h2>
              <p className="mb-8 text-center text-sm text-body">{t('auth.reset.subtitle')}</p>
              <form onSubmit={submit} className="space-y-4">
                <PasswordInput  required value={pw1} autoComplete="new-password"
                  onChange={(e) => setPw1(e.target.value)}
                  placeholder={t('auth.invite.choosePassword') as string} className={inputCls} />
                <PasswordInput  required value={pw2} autoComplete="new-password"
                  onChange={(e) => setPw2(e.target.value)}
                  placeholder={t('auth.invite.confirmPassword') as string} className={inputCls} />
                <p className="text-xs text-body">{t('auth.invite.pwHint')}</p>
                {error && <InlineError title={error} />}
                <Button type="submit" variant="primary" disabled={busy} className="!h-12 w-full text-base">
                  {busy ? <span aria-label={t('common.loading') as string} className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#141414] border-t-transparent" /> : t('auth.reset.submit')}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartnerResetPassword;
