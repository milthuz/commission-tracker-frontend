import { useEffect, useState, FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ClusterMark, PASS_API, PassLangToggle, PassMotion, useFmt } from './passUi';

// Écran 07 — la page publique du lien personnel d'un membre, `/pass/{slug}`.
//
// Coquille AUTONOME et visiteur DÉCONNECTÉ : aucune barre latérale, aucun bouton « Espace
// membre » (il n'a pas de compte), et surtout aucun renvoi vers Sales Hub — le brief est
// explicite là-dessus, la puce « retour au prototype » de la maquette ne se livre pas.
//
// L'attribution vient du SLUG dans l'URL, jamais d'un champ du formulaire : le visiteur ne
// sait pas — et n'a pas à savoir — qu'une recommandation est en train de se créer au nom de
// quelqu'un d'autre.

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

interface Referrer {
  referrerFirstName: string;
  referrerName: string;
  referrerBusiness: string;
  hardwareDiscount: number;
}

const LinkPage = () => {
  const { slug = '' } = useParams();
  const { t, tf, list, money } = useFmt();

  const [ref, setRef] = useState<Referrer | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'sent'>('loading');
  const [form, setForm] = useState({
    restaurantName: '', contactName: '', city: '', province: '', contact: '', contactLocale: 'fr-CA',
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [badFields, setBadFields] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${PASS_API}/api/pass/link/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (!r.ok) { setState('gone'); return null; }
        return r.json();
      })
      .then((d: Referrer | null) => {
        if (!d) return;
        setRef(d);
        setState('ready');
        // Le clic n'est compté qu'une fois le lien reconnu — sinon une adresse erronée
        // gonflerait les statistiques de personne.
        fetch(`${PASS_API}/api/pass/link/${encodeURIComponent(slug)}/click`, { method: 'POST' }).catch(() => {});
      })
      .catch(() => setState('gone'));
  }, [slug]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBadFields([]);
    if (!consent) { setError(t('pass.join.err.consent_required')); return; }
    setBusy(true);
    try {
      const res = await fetch(`${PASS_API}/api/pass/link/${encodeURIComponent(slug)}/refer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, consent: true }),
      });
      const data = await res.json().catch(() => ({}));
      // Un restaurant déjà recommandé par quelqu'un d'autre reçoit la MÊME confirmation :
      // il a fait sa part, et la préséance entre deux restaurateurs ne le concerne pas.
      if (res.ok) setState('sent');
      else if (data.error === 'invalid_fields') { setBadFields(data.fields || []); setError(t('pass.join.err.generic')); }
      else setError(t('pass.join.err.generic'));
    } catch {
      setError(t('pass.join.err.generic'));
    } finally {
      setBusy(false);
    }
  };

  const provinceName = (code: string) => {
    const k = `pass.provinceNames.${code}`;
    const v = t(k);
    return v === k ? code : v;
  };
  const bad = (f: string) =>
    badFields.includes(f)
      ? 'border-[#F46060] focus:border-[#F46060] focus:ring-[#F46060]/15'
      : 'border-[#E0E0E0] focus:border-[#F58345] focus:ring-[#F58345]/15';
  const field =
    'mt-2 w-full rounded-xl border bg-white px-4 py-3.5 text-[15px] outline-none transition-colors duration-150 placeholder:text-[#94969C] focus:ring-4';
  const label = 'block text-[13px] font-medium text-[#424242]';
  const wrap = 'mx-auto w-full max-w-[1100px] px-6 sm:px-8';

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F6]">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#E0E0E0] border-t-[#F58345]" />
      </div>
    );
  }

  // Lien inconnu, membre suspendu ou programme fermé : une seule et même réponse. On ne
  // dit pas LAQUELLE — un visiteur n'a rien à apprendre de l'état du compte d'un tiers.
  if (state === 'gone') {
    return (
      <div className="flex min-h-screen flex-col bg-[#F5F5F6] font-satoshi text-[#141414]">
        <header className={`${wrap} py-6`}>
          <ClusterMark className="h-[22px] w-auto" />
        </header>
        <div className="flex flex-1 items-center justify-center px-6 pb-20 text-center">
          <div>
            <h1 className="text-[26px] font-medium tracking-[-0.01em]">
              {t('pass.join.err.link_invalid_or_expired')}
            </h1>
            <a
              href="https://www.clusterpos.com"
              className="mt-6 inline-flex rounded-xl bg-[#F58345] px-5 py-3 text-[14.5px] font-medium text-white hover:bg-[#E5723A]"
            >
              clusterpos.com
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F6] font-satoshi text-[#141414]">
      <PassMotion />

      <header className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-6`}>
        <ClusterMark className="h-[22px] w-auto" />
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-[#94969C]">{t('pass.region')}</span>
          {/* Le visiteur arrive froid depuis le lien d'un membre : c'est ici que la bascule
              de langue compte le plus, il n'a aucune préférence enregistrée. */}
          <PassLangToggle />
        </div>
      </header>

      <main className={`${wrap} pb-20`}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-16">
          {/* ── L'argumentaire, personnalisé par le slug ─────────────────── */}
          <section className="pass-rise min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#D16630]">
              {t('pass.referralLinkPage.eyebrow')}
            </p>
            <h1 className="mt-4 text-[38px] font-medium leading-[1.08] tracking-[-0.015em] sm:text-[46px]">
              {tf('pass.referralLinkPage.titleA', {
                referrerName: ref?.referrerName || '',
                referrerBusiness: ref?.referrerBusiness || '',
              })}
              <br />
              {t('pass.referralLinkPage.titleB')}
            </h1>
            <p className="mt-5 max-w-[46ch] text-[15.5px] leading-[1.62] text-[#61646C]">
              {t('pass.referralLinkPage.sub')}
            </p>

            {/* Le rabais est le seul chiffre de la page — il vient de la configuration. */}
            {!!ref && (
              <div className="mt-8 rounded-[14px] border border-[#FBCDB5] bg-[#FDE6DA]/70 p-6">
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#8A4220]">
                  {t('pass.referralLinkPage.discountLabel')}
                </p>
                <p className="mt-3 text-[40px] font-medium leading-none tracking-[-0.02em] text-[#D16630]">
                  {money(ref.hardwareDiscount)}
                </p>
                <p className="mt-2 text-[13.5px] text-[#8A4220]/85">
                  {tf('pass.referralLinkPage.discountNote', { referrerFirstName: ref.referrerFirstName })}
                </p>
              </div>
            )}

            <h2 className="mt-10 text-[13px] font-medium uppercase tracking-[0.07em] text-[#94969C]">
              {t('pass.referralLinkPage.whyTitle')}
            </h2>
            <ul className="mt-5 space-y-5">
              {(list('pass.referralLinkPage.why') as { title: string; body: string }[]).map((w) => (
                <li key={w.title}>
                  <p className="text-[15.5px] font-medium">{w.title}</p>
                  <p className="mt-1.5 max-w-[52ch] text-[14.5px] leading-[1.6] text-[#61646C]">{w.body}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* ── Le formulaire, ou sa confirmation ───────────────────────── */}
          <section className="pass-rise min-w-0">
            <div className="rounded-[14px] border border-[#E0E0E0]/70 bg-white p-8 shadow-[0_4px_6px_-2px_rgba(16,24,40,0.03),0_12px_16px_-4px_rgba(16,24,40,0.06)] sm:p-10">
              {state === 'sent' ? (
                <div className="py-6 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FDE6DA]">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="m4.5 12.5 5 5 10-11" stroke="#D16630" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <h2 className="mt-5 text-[24px] font-medium leading-tight tracking-[-0.01em]">
                    {t('pass.referralLinkPage.formTitle')}
                  </h2>
                  <p className="mx-auto mt-3 max-w-[34ch] text-[15px] leading-[1.6] text-[#61646C]">
                    {t('pass.referralLinkPage.formSub')}
                  </p>
                </div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <h2 className="text-[24px] font-medium leading-tight tracking-[-0.01em]">
                    {t('pass.referralLinkPage.formTitle')}
                  </h2>
                  <p className="mt-2.5 text-[14.5px] leading-[1.6] text-[#61646C]">
                    {t('pass.referralLinkPage.formSub')}
                  </p>

                  <div className="mt-7">
                    <label htmlFor="lp-rest" className={label}>{t('pass.referralLinkPage.fields.restaurant')}</label>
                    <input id="lp-rest" required value={form.restaurantName} onChange={set('restaurantName')}
                      className={`${field} ${bad('restaurantName')}`} />
                  </div>
                  <div className="mt-4">
                    <label htmlFor="lp-name" className={label}>{t('pass.referralLinkPage.fields.name')}</label>
                    <input id="lp-name" required value={form.contactName} onChange={set('contactName')}
                      className={`${field} ${bad('contactName')}`} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="lp-city" className={label}>{t('pass.referralLinkPage.fields.city')}</label>
                      <input id="lp-city" required value={form.city} onChange={set('city')}
                        className={`${field} ${bad('city')}`} />
                    </div>
                    <div>
                      <label htmlFor="lp-prov" className={label}>{t('pass.referralLinkPage.fields.province')}</label>
                      {/* Liste fermée de 13 entrées, revalidée côté serveur : « Canada
                          seulement » est une règle d'éligibilité, pas un détail d'adresse. */}
                      <select id="lp-prov" required value={form.province} onChange={set('province')}
                        className={`${field} ${bad('province')} appearance-none`}>
                        <option value="" disabled />
                        {PROVINCES.map((c) => <option key={c} value={c}>{provinceName(c)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label htmlFor="lp-reach" className={label}>{t('pass.referralLinkPage.fields.reach')}</label>
                    <input id="lp-reach" required value={form.contact} onChange={set('contact')}
                      className={`${field} ${bad('contact')}`} />
                  </div>
                  <div className="mt-4">
                    <label htmlFor="lp-lang" className={label}>{t('pass.referralLinkPage.fields.lang')}</label>
                    <select id="lp-lang" value={form.contactLocale} onChange={set('contactLocale')}
                      className={`${field} ${bad('contactLocale')} appearance-none`}>
                      <option value="fr-CA">Français</option>
                      <option value="en-CA">English</option>
                    </select>
                  </div>

                  <label className="mt-6 flex cursor-pointer items-start gap-3 text-[13px] leading-[1.55] text-[#424242]">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#F58345]" />
                    <span>{t('pass.referralLinkPage.consent')}</span>
                  </label>

                  {error && (
                    <p role="alert" className="mt-4 rounded-xl bg-[#FEF3F2] px-4 py-3 text-[13px] leading-[1.5] text-[#912018]">
                      {error}
                    </p>
                  )}

                  <button type="submit" disabled={busy}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#F58345] px-5 py-3.5 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[#E5723A] active:bg-[#D16630] disabled:cursor-not-allowed disabled:opacity-45">
                    {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                    {t('pass.referralLinkPage.submit')}
                  </button>

                  <p className="mt-5 text-[12.5px] leading-[1.55] text-[#94969C]">
                    {t('pass.referralLinkPage.trust')}
                  </p>
                </form>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-[#E0E0E0] py-8">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-4`}>
          {/* Attribution : le visiteur doit savoir de qui vient la recommandation. */}
          <p className="text-[13px] text-[#61646C]">
            {tf('pass.referralLinkPage.attribution', {
              referrerName: ref?.referrerName || '',
              referrerBusiness: ref?.referrerBusiness || '',
            })}
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            <Link to="/terms" className="text-[#61646C] hover:text-[#141414]">
              {t('pass.landing.publicFooter.terms')}
            </Link>
            <Link to="/privacy" className="text-[#61646C] hover:text-[#141414]">
              {t('pass.landing.publicFooter.privacy')}
            </Link>
          </div>
        </div>
        {/* Mention légale reprise de la page programme, PAS réécrite : inventer une clause
            sur un rabais est une décision juridique, pas de rédaction. */}
        <p className={`${wrap} mt-6 max-w-[100ch] text-[11.5px] leading-[1.7] text-[#94969C]`}>
          {t('pass.landing.legal')}
        </p>
      </footer>
    </div>
  );
};

export default LinkPage;
