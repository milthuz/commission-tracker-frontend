import { useEffect, useState } from 'react';
import PasswordInput from '../../components/PasswordInput';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import ClusterWordmark from '../../components/ClusterWordmark';
import { portalError } from './serverError';
import { useClusterFavicon } from '../../hooks/useClusterFavicon';
import { InlineError, Button, StateCard } from '../../components/ui';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com';

type Step = 'loading' | 'invalid' | 'password' | 'done';

// Modeled on Authentication/AcceptInvite.tsx's loading/invalid/password/qr/done step machine,
// pointed at /api/partner-auth/invite* instead of /api/auth/invite*.
const PartnerAcceptInvite = () => {
  // Page PUBLIQUE : hors du gabarit partenaire, elle n'heritait pas de l'icone Cluster.
  useClusterFavicon();
  const { t } = useTranslation();
  const { login } = usePartnerAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [step, setStep] = useState<Step>('loading');
  const [inviteEmail, setInviteEmail] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [invalidMsg, setInvalidMsg] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) { setStep('invalid'); setInvalidMsg(t('auth.invite.invalid') as string); return; }
      try {
        const r = await fetch(`${API_URL}/api/partner-auth/invite-info?token=${encodeURIComponent(token)}`);
        const d = await r.json();
        if (!r.ok) {
          setInvalidMsg(r.status === 410 ? (t('auth.invite.expired') as string) : (t('auth.invite.invalid') as string));
          setStep('invalid');
          return;
        }
        setInviteEmail(d.email);
        setPartnerName(d.partnerName || '');
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
      const r = await fetch(`${API_URL}/api/partner-auth/invite/accept`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw1 }),
      });
      const d = await r.json();
      if (!r.ok) { setError(portalError(d.error, t, t('errors.generic') as string)); return; }
      // Le compte est ouvert des le mot de passe pose : la double authentification n'est
      // plus imposee ici, elle s'active depuis le profil si la personne le souhaite.
      const v = await fetch(`${API_URL}/api/partner-auth/verify`, { headers: { Authorization: `Bearer ${d.token}` } });
      const vd = await v.json();
      login(vd.user, d.token);
      setStep('done');
      setTimeout(() => navigate('/partner-portal', { replace: true }), 1200);
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  const inputCls = 'h-12 w-full rounded-xl border border-stroke bg-white px-4 text-base text-black outline-none transition focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-2 px-4 py-10 dark:bg-boxdark-2">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <ClusterWordmark className="h-10 w-auto" />
        </div>
        <div className="rounded-[20px] border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark sm:p-10">
          {step === 'loading' && (
            <StateCard kind="loading" />
          )}

          {step === 'invalid' && (
            <div className="text-center">
              <h2 className="mb-3 text-2xl font-bold text-black dark:text-white">{t('auth.invite.invalidTitle')}</h2>
              <p className="mb-8 text-sm text-body">{invalidMsg}</p>
              <Link to="/partner-portal/login" className="font-medium text-primary hover:underline">
                ← {t('auth.backToLoginBtn')}
              </Link>
            </div>
          )}

          {step === 'password' && (
            <>
              <h2 className="mb-2 text-center text-2xl font-bold text-black dark:text-white">{t('auth.invite.title')}</h2>
              <p className="mb-1 text-center text-sm text-body">
                {t('auth.invite.subtitle')} <span className="font-semibold text-black dark:text-white">{inviteEmail}</span>
              </p>
              {partnerName && <p className="mb-8 text-center text-sm text-body">{t('partnerPortal.inviteFor', { partner: partnerName })}</p>}
              <form onSubmit={submitPassword} className={`space-y-4 ${partnerName ? '' : 'mt-8'}`}>
                <PasswordInput  required value={pw1} autoComplete="new-password"
                  onChange={(e) => setPw1(e.target.value)}
                  placeholder={t('auth.invite.choosePassword') as string} className={inputCls} />
                <PasswordInput  required value={pw2} autoComplete="new-password"
                  onChange={(e) => setPw2(e.target.value)}
                  placeholder={t('auth.invite.confirmPassword') as string} className={inputCls} />
                <p className="text-xs text-body">{t('auth.invite.pwHint')}</p>
                {error && <InlineError title={error} />}
                <Button type="submit" variant="primary" disabled={busy} className="!h-12 w-full text-base">
                  {busy ? <span aria-label={t('common.loading') as string} className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#141414] border-t-transparent" /> : t('auth.invite.continue')}
                </Button>
              </form>
            </>
          )}

          {step === 'done' && (
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(23,178,106,0.12)] dark:bg-[rgba(23,178,106,0.18)]">
                <svg className="h-7 w-7 text-[#067647] dark:text-[#57D193]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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

export default PartnerAcceptInvite;
