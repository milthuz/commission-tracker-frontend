import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PasswordInput from '../../components/PasswordInput';
import ClusterWordmark from '../../components/ClusterWordmark';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import { portalError } from './serverError';
import { useClusterFavicon } from '../../hooks/useClusterFavicon';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Inscription libre par code d'organisation.
//
// Le parcours est VOLONTAIREMENT le même que celui d'une invitation à partir de la deuxième
// étape — mot de passe, puis double authentification. Un chemin d'entrée plus court aurait été
// un chemin d'entrée plus faible, et c'est exactement là qu'il ne faut pas économiser.
type Step = 'form' | 'qr' | 'done';

const PartnerSignup = () => {
  // Page PUBLIQUE : hors du gabarit partenaire, elle n'hérite pas de l'icône Cluster.
  useClusterFavicon();
  const { t, i18n } = useTranslation();
  const { login } = usePartnerAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [step, setStep] = useState<Step>('form');
  // Le code peut arriver par l'URL : ça permet de partager un lien tout prêt plutôt que de
  // demander une recopie à la main. Il reste modifiable — un lien peut être périmé.
  const [orgCode, setOrgCode] = useState((params.get('code') || '').toUpperCase());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [code2fa, setCode2fa] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw1 !== pw2) { setError(t('partnerPortal.signup.passwordMismatch') as string); return; }
    if (pw1.length < 8) { setError(t('partnerPortal.signup.passwordTooShort') as string); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/partner-auth/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: orgCode.trim(), email: email.trim(), name: name.trim(),
                               password: pw1, locale: i18n.language }),
      });
      const d = await r.json();
      // Les codes du serveur sont traduits ici : « invalid_code » sous un champ n'apprend rien.
      if (!r.ok) { setError(traduire(d.error)); return; }
      setPartnerName(d.partnerName || '');
      setQr(d.qrDataUrl); setSecret(d.secret); setSetupToken(d.setupToken);
      setStep('qr');
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  const traduire = (cle: string) => {
    const connus: Record<string, string> = {
      invalid_code: 'partnerPortal.signup.errInvalidCode',
      email_domain_not_allowed: 'partnerPortal.signup.errDomain',
      account_exists: 'partnerPortal.signup.errExists',
      password_too_short: 'partnerPortal.signup.passwordTooShort',
      invalid_email: 'partnerPortal.signup.errEmail',
      name_required: 'partnerPortal.signup.errName',
    };
    return connus[cle] ? (t(connus[cle]) as string) : portalError(cle, t, t('auth.networkError') as string);
  };

  const submit2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      // Le MÊME point d'accès que l'activation d'une invitation : deux parcours parallèles
      // finiraient par diverger, et c'est celui-ci qui pose le compte en « actif ».
      const r = await fetch(`${API_URL}/api/partner-auth/invite/verify-2fa`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupToken, code: code2fa }),
      });
      const d = await r.json();
      if (!r.ok) { setError(portalError(d.error, t, t('partnerPortal.signup.errCode') as string)); return; }
      // `login` attend l'usager ET le jeton — le contexte ne va pas le chercher lui-meme.
      // Meme sequence que l'activation d'une invitation, pour ne pas ouvrir un second chemin.
      const v = await fetch(`${API_URL}/api/partner-auth/verify`, { headers: { Authorization: `Bearer ${d.token}` } });
      const vd = await v.json();
      login(vd.user, d.token);
      setStep('done');
      navigate('/partner-portal', { replace: true });
    } catch {
      setError(t('auth.networkError') as string);
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-10 dark:bg-boxdark-2">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><ClusterWordmark className="h-8 w-auto" /></div>
        <div className="rounded-2xl bg-white p-8 shadow-default dark:bg-boxdark">
          {step === 'form' && (
            <>
              <h1 className="text-center text-2xl font-bold text-black dark:text-white">{t('partnerPortal.signup.title')}</h1>
              <p className="mt-2 text-center text-sm text-body">{t('partnerPortal.signup.subtitle')}</p>
              <form onSubmit={submitForm} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">{t('partnerPortal.signup.orgCode')}</label>
                  {/* Majuscules imposées et espacement large : ce code est recopié à la main
                      depuis un courriel ou lu au téléphone. */}
                  <input value={orgCode} onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
                    required placeholder="XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false}
                    className="w-full rounded-lg border border-stroke bg-transparent px-4 py-3 text-center font-mono text-lg tracking-widest outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
                  <p className="mt-1.5 text-xs text-body">{t('partnerPortal.signup.orgCodeHint')}</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">{t('partnerPortal.fName')}</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required
                    className="w-full rounded-lg border border-stroke bg-transparent px-4 py-3 outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">{t('partnerPortal.fEmail')}</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                    className="w-full rounded-lg border border-stroke bg-transparent px-4 py-3 outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
                  <p className="mt-1.5 text-xs text-body">{t('partnerPortal.signup.emailHint')}</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">{t('partnerPortal.signup.password')}</label>
                  <PasswordInput value={pw1} onChange={(e) => setPw1(e.target.value)} required
                    autoComplete="new-password" className="w-full rounded-lg border border-stroke bg-transparent px-4 py-3 outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">{t('partnerPortal.signup.passwordConfirm')}</label>
                  <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} required
                    autoComplete="new-password" className="w-full rounded-lg border border-stroke bg-transparent px-4 py-3 outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <button type="submit" disabled={busy}
                  className="w-full rounded-lg bg-black py-3 font-semibold text-white hover:bg-opacity-90 disabled:opacity-50 dark:bg-white dark:text-black">
                  {busy ? t('partnerPortal.signup.creating') : t('partnerPortal.signup.submit')}
                </button>
              </form>
              <p className="mt-6 text-center text-sm text-body">
                {t('partnerPortal.signup.haveAccount')}{' '}
                <Link to="/partner-portal/login" className="font-semibold text-primary hover:underline">{t('partnerPortal.signup.signIn')}</Link>
              </p>
            </>
          )}

          {step === 'qr' && (
            <>
              <h1 className="text-center text-2xl font-bold text-black dark:text-white">{t('partnerPortal.signup.twoFactorTitle')}</h1>
              <p className="mt-2 text-center text-sm text-body">
                {partnerName
                  ? t('partnerPortal.signup.twoFactorSubtitlePartner', { partner: partnerName })
                  : t('partnerPortal.signup.twoFactorSubtitle')}
              </p>
              {qr && <img src={qr} alt="QR" className="mx-auto my-5 h-52 w-52 rounded-lg border border-stroke dark:border-strokedark" />}
              {/* Le secret en clair sous le code : sans lui, une personne qui scanne mal reste
                  bloquée sans recours. */}
              <p className="mb-5 break-all text-center font-mono text-xs text-body">{secret}</p>
              <form onSubmit={submit2fa} className="space-y-4">
                <input value={code2fa} onChange={(e) => setCode2fa(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric" placeholder="000000" required
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
                {error && <p className="text-sm text-danger">{error}</p>}
                <button type="submit" disabled={busy || code2fa.length !== 6}
                  className="w-full rounded-lg bg-black py-3 font-semibold text-white hover:bg-opacity-90 disabled:opacity-50 dark:bg-white dark:text-black">
                  {busy ? t('partnerPortal.signup.verifying') : t('partnerPortal.signup.finish')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartnerSignup;
