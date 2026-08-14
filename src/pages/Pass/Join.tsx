import { useEffect, useState, FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePassAuth } from '../../context/PassAuthContext';
import { PASS_API as API_URL, PassHeader, PassMotion, passPrivacyUrl, usePassFavicon } from './passUi';

// L'ADHÉSION N'EST PAS DESSINÉE — le design la reconnaît comme un trou (« "Join The Pass"
// is a CTA with no designed signup/eligibility-check flow »). L'écran est donc inventé,
// mais sa composition ne l'est pas : c'est celle de l'écran « Référer » du deck (colonne
// d'argumentaire à gauche, carte blanche d'action à droite, le tout dans un conteneur
// CENTRÉ et borné). Un plein écran coupé en deux moitiés égales avait été essayé et
// abandonné : sur un large moniteur, la moitié droite devenait un immense vide.
//
// Les montants viennent de /api/pass/program, jamais du client (brief, règle 4).

type Step = 'form' | 'sent' | 'connecting' | 'closed';

interface ProgramTier { level: number; key: string; from: number; credit: number }
interface Program { enabled: boolean; currency: string; hardwareDiscount: number; tiers: ProgramTier[] }

const Join = () => {
  usePassFavicon();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { login, isAuthenticated } = usePassAuth();
  const [params] = useSearchParams();
  const linkToken = params.get('token');

  const [step, setStep] = useState<Step>(linkToken ? 'connecting' : 'form');
  const [program, setProgram] = useState<Program | null>(null);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fr = i18n.language?.startsWith('fr');
  const money = (n: number) =>
    new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', {
      style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(n || 0);

  // Le lien magique porte la langue du membre : c'est SA préférence de correspondance qui
  // décide, pas celle du navigateur qui ouvre le lien.
  useEffect(() => {
    const lang = params.get('lang');
    if (lang === 'fr' || lang === 'en') {
      i18n.changeLanguage(lang);
      localStorage.setItem('language', lang);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !linkToken) navigate('/pass', { replace: true });
  }, [isAuthenticated, linkToken, navigate]);

  useEffect(() => {
    fetch(`${API_URL}/api/pass/program`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Program | null) => {
        if (!p) return;
        setProgram(p);
        if (!p.enabled && !linkToken) setStep('closed');
      })
      .catch(() => {});
  }, [linkToken]);

  // Le serveur renvoie des codes stables ; on les traduit ici plutôt que d'afficher son
  // texte, pour que le message reste bilingue et dans la voix du programme.
  const errText = (code?: string) => {
    const key = `pass.join.err.${code || 'generic'}`;
    const msg = t(key);
    return msg === key ? t('pass.join.err.generic') : msg;
  };

  // Échange du lien contre une session, une seule fois — le serveur ne l'honore qu'une fois
  // de toute façon, mais un double appel afficherait « lien déjà utilisé » sur un lien qui
  // vient de fonctionner.
  useEffect(() => {
    if (!linkToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/pass/auth/consume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: linkToken }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.token) {
          login(data.member, data.token);
          navigate('/pass', { replace: true });
        } else {
          setError(errText(data.error));
          setStep('form');
        }
      } catch {
        if (!cancelled) { setError(t('pass.join.err.generic')); setStep('form'); }
      }
    })();
    return () => { cancelled = true; };
  }, [linkToken]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!consent) { setError(t('pass.join.err.consent_required')); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/pass/auth/request-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), consent: true, locale: fr ? 'fr-CA' : 'en-CA' }),
      });
      const data = await res.json().catch(() => ({}));
      // 200 même pour une adresse non admissible : le serveur explique par courriel plutôt
      // qu'à l'écran, sinon ce formulaire devient un outil d'énumération de la clientèle.
      if (res.ok) setStep('sent');
      else setError(errText(data.error));
    } catch {
      setError(t('pass.join.err.generic'));
    } finally {
      setBusy(false);
    }
  };

  const tierLabels = t('pass.landing.tierLabel', { returnObjects: true }) as unknown as string[];
  const tierRules = t('pass.landing.rule', { returnObjects: true }) as unknown as string[];
  const tierName = (key: string) => {
    const k = `pass.tiers.${key}`;
    const v = t(k);
    return v === k ? key : v;
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F5F6] dark:bg-[#0A0A0A] font-satoshi text-[#141414] dark:text-white">
      <PassMotion />

      {/* Même en-tête que les écrans membres : le lockup de La Passe n'existe qu'à un seul
          endroit du code, donc il ne peut plus diverger d'un écran à l'autre. */}
      <PassHeader />

      <main className="mx-auto flex w-full max-w-[1160px] flex-1 items-center px-6 py-6 sm:px-8">
        <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
          {/* ── L'argumentaire : ce qu'un marchand doit savoir avant de donner son adresse */}
          <section className="pass-rise">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#D16630]">
              {t('pass.landing.eyebrow')}
            </p>
            <h1 className="mt-4 max-w-[13ch] text-[40px] font-bold leading-[1.06] tracking-[-0.015em] sm:text-[46px]">
              {t('pass.landing.title')}
            </h1>
            <p className="mt-5 max-w-[46ch] text-[15.5px] leading-[1.62] text-[#61646C] dark:text-white/55">
              {t('pass.landing.sub')}
            </p>

            {/* L'échelle, telle que la configuration la définit — jamais recopiée ici. La
                carte pêche est le motif que le deck utilise déjà pour les montants. */}
            {program && (
              <div className="mt-9 rounded-2xl border border-[#FBCDB5] bg-[#FDE6DA]/70 p-6 sm:p-7">
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#8A4220]">
                  {t('pass.join.ladderTitle')}
                </p>
                <ul className="mt-4 space-y-3.5">
                  {program.tiers.map((tier, i) => (
                    <li
                      key={tier.level}
                      className={`flex items-baseline justify-between gap-5 ${
                        i > 0 ? 'border-t border-[#F79C6A]/30 pt-3.5' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-[#141414] dark:text-white">
                          {tierName(tier.key)}
                          <span className="ml-2 text-[13px] font-medium text-[#8A4220]/60">
                            {tierLabels?.[tier.level - 1]}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[13px] leading-snug text-[#8A4220]/75">
                          {tierRules?.[tier.level - 1]}
                        </p>
                      </div>
                      <span className="shrink-0 text-[24px] font-bold leading-none tracking-[-0.02em] text-[#D16630]">
                        {money(tier.credit)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 border-t border-[#F79C6A]/30 pt-4 text-[13px] leading-[1.55] text-[#8A4220]/80">
                  {t('pass.join.ladderRule')}{' '}
                  {/* Cette phrase parlait du rabais matériel, d'où la condition sur son
                      montant. Elle parle maintenant du CRÉDIT, qui existe toujours — la
                      garder conditionnelle la faisait disparaître si le montant tombait à
                      0, pour une raison qui n'avait plus de rapport avec elle. */}
                  {t('pass.join.creditLine')}
                </p>
              </div>
            )}
          </section>

          {/* ── L'action ─────────────────────────────────────────────────── */}
          <section className="pass-rise lg:pt-2">
            <div className="rounded-2xl border border-[#E0E0E0]/70 bg-white dark:bg-[#141414] p-8 shadow-[0_4px_6px_-2px_rgba(16,24,40,0.03),0_12px_16px_-4px_rgba(16,24,40,0.06)] sm:p-10">
              {step === 'connecting' && (
                <div className="flex flex-col items-center gap-5 py-16 text-center">
                  <span className="h-8 w-8 animate-spin rounded-full border-4 border-[#E0E0E0] dark:border-[#242424] border-t-primary" />
                  <p className="text-[15px] text-[#61646C] dark:text-white/55">{t('pass.join.connecting')}</p>
                </div>
              )}

              {step === 'closed' && (
                <div className="py-8 text-center">
                  <h2 className="text-[26px] font-bold leading-tight tracking-[-0.01em]">
                    {t('pass.join.closedTitle')}
                  </h2>
                  <p className="mx-auto mt-3 max-w-[34ch] text-[15px] leading-[1.6] text-[#61646C] dark:text-white/55">
                    {t('pass.join.closedBody')}
                  </p>
                </div>
              )}

              {step === 'sent' && (
                <div className="py-2 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FDE6DA]">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M3 7.5 12 13l9-5.5M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5Z"
                        stroke="#D16630" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <h2 className="mt-5 text-[26px] font-bold leading-tight tracking-[-0.01em]">
                    {t('pass.join.sentTitle')}
                  </h2>
                  <p className="mx-auto mt-3 max-w-[38ch] text-[15px] leading-[1.6] text-[#61646C] dark:text-white/55">
                    {t('pass.join.sentBody', { email })}
                  </p>
                  <p className="mx-auto mt-4 max-w-[38ch] text-[13px] leading-[1.6] text-[#61646C] dark:text-white/55">
                    {t('pass.join.sentHint')}
                  </p>
                  <div className="mt-7 flex flex-col items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => submit()}
                      className="rounded-xl border border-[#E0E0E0] dark:border-[#242424] px-5 py-3 text-[14px] font-semibold transition-colors duration-150 hover:border-[#94969C] dark:hover:border-white/40 disabled:opacity-50"
                    >
                      {t('pass.join.resend')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStep('form'); setError(''); }}
                      className="py-1 text-[13px] font-medium text-[#61646C] dark:text-white/55 underline-offset-4 hover:underline"
                    >
                      {t('pass.join.wrongEmail')}
                    </button>
                  </div>
                  {error && <p role="alert" className="mt-4 text-[13px] text-[#D92D20]">{error}</p>}
                </div>
              )}

              {step === 'form' && (
                <form onSubmit={submit} noValidate>
                  <h2 className="text-[26px] font-bold leading-[1.15] tracking-[-0.01em]">
                    {t('pass.join.title')}
                  </h2>
                  <p className="mt-3 text-[15px] leading-[1.6] text-[#61646C] dark:text-white/55">
                    {t('pass.join.sub')}
                  </p>

                  <label htmlFor="pass-email" className="mt-8 block text-[13px] font-medium text-[#424242] dark:text-white/80">
                    {t('pass.join.emailLabel')}
                  </label>
                  <input
                    id="pass-email"
                    type="email"
                    autoFocus
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('pass.join.emailPlaceholder')}
                    className="mt-2 w-full rounded-xl border border-[#E0E0E0] dark:border-[#242424] bg-white dark:bg-[#141414] px-4 py-3.5 text-[15px] outline-none transition-colors duration-150 placeholder:text-[#94969C] dark:placeholder:text-white/35 focus:border-[#F58345] focus:ring-4 focus:ring-[#F58345]/15"
                  />

                  <label className="mt-5 flex cursor-pointer items-start gap-3 text-[13px] leading-[1.55] text-[#424242] dark:text-white/80">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#F58345]"
                    />
                    <span>
                      {t('pass.join.consent')}{' '}
                      <Link to="/terms" target="_blank" className="text-[#D16630] underline-offset-2 hover:underline">
                        {t('pass.join.terms')}
                      </Link>
                      {' · '}
                      <a href={passPrivacyUrl(i18n.language)} target="_blank" rel="noopener noreferrer" className="text-[#D16630] underline-offset-2 hover:underline">
                        {t('pass.join.privacy')}
                      </a>
                    </span>
                  </label>

                  {error && (
                    <p role="alert" className="mt-4 rounded-xl bg-[#FEF3F2] px-4 py-3 text-[13px] leading-[1.5] text-[#912018]">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={busy || !email.trim()}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#F58345] px-5 py-3.5 text-[15px] font-bold text-white transition-colors duration-150 hover:bg-[#E5723A] active:bg-[#D16630] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                    {t('pass.join.submit')}
                  </button>

                  <p className="mt-5 text-center text-[12.5px] leading-[1.55] text-[#61646C] dark:text-white/55">
                    {t('pass.join.eligibility')}
                  </p>
                </form>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-[1160px] px-6 pb-10 pt-4 sm:px-8">
        <p className="max-w-[92ch] text-[11px] leading-[1.7] text-[#61646C] dark:text-white/55">
          {t('pass.landing.legal')}
        </p>
      </footer>
    </div>
  );
};

export default Join;
