import { useEffect, useState, FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePassAuth } from '../../context/PassAuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-production-b7f9.up.railway.app';

// L'ADHÉSION N'EST PAS DESSINÉE — le design la reconnaît comme un trou (« "Join The Pass"
// is a CTA with no designed signup/eligibility-check flow »). Cet écran est donc inventé,
// mais pas librement : il reprend la composition en deux volets déjà utilisée par la page
// de connexion de Sales Hub, et les jetons visuels du deck (fond #141414, accent #F58345,
// Satoshi — déjà la police de l'app). Il n'invente que ce que le design ne dit pas.
//
// Le volet sombre n'est pas décoratif : c'est le seul argumentaire qu'un marchand arrivant
// par un courriel verra avant de donner son adresse. Les montants viennent de
// /api/pass/program, jamais du client (brief, règle 4).

type Step = 'form' | 'sent' | 'connecting' | 'closed';

interface ProgramTier { level: number; key: string; from: number; credit: number }
interface Program { enabled: boolean; currency: string; hardwareDiscount: number; tiers: ProgramTier[] }

const Join = () => {
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
    <div className="min-h-screen bg-[#F5F5F6] font-satoshi text-[#141414]">
      <style>{`
        @keyframes passRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        .pass-rise { animation: passRise .22s cubic-bezier(.2,.8,.2,1) both }
      `}</style>

      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
        {/* ── Volet sombre : l'argumentaire ─────────────────────────────── */}
        <aside className="relative overflow-hidden bg-[#141414] px-8 py-12 text-white sm:px-12 lg:px-14 lg:py-16">
          {/* Halo chaud très discret — le deck éclaire ses fonds sombres plutôt que de les
              laisser plats, mais sans jamais concurrencer le texte. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full opacity-[0.13] blur-3xl"
            style={{ background: 'radial-gradient(circle, #F58345 0%, transparent 70%)' }}
          />

          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-4">
              <span className="relative text-[22px] font-bold lowercase leading-none tracking-tight">
                cluster
                <span className="absolute -bottom-1 left-0 block h-[5px] w-[5px] rounded-full bg-[#F58345]" />
              </span>
              <span className="h-5 w-px bg-white/20" />
              <span className="text-[15px] font-medium leading-tight text-white/70">
                {t('pass.programName')}
              </span>
            </div>

            <div className="pass-rise mt-12 lg:mt-16">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#F58345]/35 bg-[#F58345]/10 px-4 py-2 text-[13px] font-medium text-[#F79C6A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F58345]" />
                {t('pass.landing.eyebrow')}
              </span>

              <h1 className="mt-7 max-w-[13ch] text-[38px] font-medium leading-[1.08] tracking-[-0.01em] sm:text-[46px] lg:text-[52px]">
                {t('pass.landing.title')}
              </h1>

              <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.6] text-white/60">
                {t('pass.landing.sub')}
              </p>
            </div>

            {/* L'échelle, telle que la configuration la définit — jamais recopiée ici. */}
            {program && (
              <div className="pass-rise mt-11 lg:mt-14">
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/40">
                  {t('pass.join.ladderTitle')}
                </p>
                <ul className="mt-4 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                  {program.tiers.map((tier) => (
                    <li key={tier.level} className="flex items-baseline justify-between gap-6 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold">
                          {tierName(tier.key)}
                          <span className="ml-2 font-normal text-white/35">
                            {tierLabels?.[tier.level - 1]}
                          </span>
                        </p>
                        <p className="mt-1 truncate text-[13px] text-white/45">
                          {tierRules?.[tier.level - 1]}
                        </p>
                      </div>
                      <span className="shrink-0 text-[22px] font-bold leading-none tracking-tight text-[#F58345]">
                        {money(tier.credit)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 max-w-[52ch] text-[13px] leading-relaxed text-white/45">
                  {t('pass.join.ladderRule')}
                </p>
                {program.hardwareDiscount > 0 && (
                  <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed text-white/45">
                    {t('pass.join.hardware', { amount: money(program.hardwareDiscount) })}
                  </p>
                )}
              </div>
            )}

            <p className="mt-auto pt-12 text-[11px] leading-[1.65] text-white/25">
              {t('pass.landing.legal')}
            </p>
          </div>
        </aside>

        {/* ── Volet clair : l'action ────────────────────────────────────── */}
        <main className="relative flex flex-col px-6 py-10 sm:px-10 lg:px-14 lg:py-12">
          <div className="flex justify-end">
            <div className="inline-flex rounded-full border border-[#E0E0E0] bg-white p-1 text-[13px] font-medium">
              {(['fr', 'en'] as const).map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => { i18n.changeLanguage(lng); localStorage.setItem('language', lng); }}
                  className={`rounded-full px-3.5 py-1.5 transition-colors duration-150 ${
                    (lng === 'fr') === !!fr ? 'bg-[#141414] text-white' : 'text-[#61646C] hover:text-[#141414]'
                  }`}
                >
                  {lng.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center py-10">
            <div className="pass-rise w-full max-w-[440px] rounded-2xl border border-[#E0E0E0]/70 bg-white p-8 shadow-[0_8px_16px_-4px_rgba(16,24,40,0.06),0_24px_48px_-12px_rgba(16,24,40,0.10)] sm:p-10">
              {step === 'connecting' && (
                <div className="flex flex-col items-center gap-5 py-10 text-center">
                  <span className="h-9 w-9 animate-spin rounded-full border-2 border-[#E0E0E0] border-t-[#F58345]" />
                  <p className="text-[15px] text-[#61646C]">{t('pass.join.connecting')}</p>
                </div>
              )}

              {step === 'closed' && (
                <div className="text-center">
                  <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em]">
                    {t('pass.join.closedTitle')}
                  </h1>
                  <p className="mt-3 text-[15px] leading-[1.6] text-[#61646C]">
                    {t('pass.join.closedBody')}
                  </p>
                </div>
              )}

              {step === 'sent' && (
                <div className="text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FDE6DA]">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M3 7.5 12 13l9-5.5M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5Z"
                        stroke="#D16630" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <h1 className="mt-5 text-[26px] font-bold leading-tight tracking-[-0.01em]">
                    {t('pass.join.sentTitle')}
                  </h1>
                  <p className="mt-3 text-[15px] leading-[1.6] text-[#61646C]">
                    {t('pass.join.sentBody', { email })}
                  </p>
                  <p className="mt-4 text-[13px] leading-[1.6] text-[#94969C]">
                    {t('pass.join.sentHint')}
                  </p>
                  <div className="mt-7 flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => submit()}
                      className="rounded-xl border border-[#E0E0E0] px-5 py-3 text-[14px] font-semibold transition-colors duration-150 hover:border-[#94969C] disabled:opacity-50"
                    >
                      {t('pass.join.resend')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStep('form'); setError(''); }}
                      className="py-1 text-[13px] font-medium text-[#61646C] underline-offset-4 hover:underline"
                    >
                      {t('pass.join.wrongEmail')}
                    </button>
                  </div>
                  {error && (
                    <p role="alert" className="mt-4 text-[13px] text-[#D92D20]">{error}</p>
                  )}
                </div>
              )}

              {step === 'form' && (
                <form onSubmit={submit} noValidate>
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#D16630]">
                    {t('pass.programName')}
                  </p>
                  <h1 className="mt-2.5 text-[28px] font-bold leading-[1.15] tracking-[-0.01em]">
                    {t('pass.join.title')}
                  </h1>
                  <p className="mt-3 text-[15px] leading-[1.6] text-[#61646C]">
                    {t('pass.join.sub')}
                  </p>

                  <label htmlFor="pass-email" className="mt-8 block text-[13px] font-medium text-[#424242]">
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
                    className="mt-2 w-full rounded-xl border border-[#E0E0E0] bg-white px-4 py-3.5 text-[15px] outline-none transition-colors duration-150 placeholder:text-[#94969C] focus:border-[#F58345] focus:ring-4 focus:ring-[#F58345]/15"
                  />

                  <label className="mt-5 flex cursor-pointer items-start gap-3 text-[13px] leading-[1.55] text-[#424242]">
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
                      <Link to="/privacy" target="_blank" className="text-[#D16630] underline-offset-2 hover:underline">
                        {t('pass.join.privacy')}
                      </Link>
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

                  <p className="mt-5 text-center text-[12.5px] leading-[1.55] text-[#94969C]">
                    {t('pass.join.eligibility')}
                  </p>
                </form>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Join;
