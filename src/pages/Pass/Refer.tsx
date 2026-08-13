import { useState, FormEvent } from 'react';
import Select from '../../components/Select';
import { Link } from 'react-router-dom';
import { usePassAuth, PASS_TOKEN_KEY } from '../../context/PassAuthContext';
import { PASS_API, PassMotion, useFmt, useTierName } from './passUi';
import { PassPortal } from './PortalShell';

// Formulaire de recommandation (écran 03) + confirmation (écran 04). Les deux vivent sur
// la MÊME route, en deux états : la confirmation n'est pas une destination, c'est le
// résultat de l'envoi. Une route séparée n'aurait rien ajouté qu'une page atteignable
// sans contexte, avec un numéro de dossier qu'on ne pourrait plus lui donner.

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

interface Created {
  refCode: string;
  restaurantName: string;
  creditAmount: number;
  tierUp: boolean;
}

const Refer = () => {
  const { member, refresh } = usePassAuth();
  const { t, tf, list, fr, money } = useFmt();
  const tierName = useTierName();

  const [form, setForm] = useState({
    restaurantName: '', contactName: '', city: '', province: '', postalCode: '',
    contact: '', contactLocale: 'fr-CA', relationship: '',
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [badFields, setBadFields] = useState<string[]>([]);
  const [done, setDone] = useState<Created | null>(null);

  if (!member) return null;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const nextTier = member.nextTier;
  const provinceName = (code: string) => {
    const k = `pass.provinceNames.${code}`;
    const v = t(k);
    return v === k ? code : v;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBadFields([]);
    if (!consent) { setError(t('pass.join.err.consent_required')); return; }
    setBusy(true);
    try {
      const res = await fetch(`${PASS_API}/api/pass/referrals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem(PASS_TOKEN_KEY)}`,
        },
        body: JSON.stringify({ ...form, consent: true, consentLocale: fr ? 'fr-CA' : 'en-CA' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Le palier monte-t-il grâce à celle-ci ? Calculé AVANT de rafraîchir le membre,
        // sinon le compteur a déjà bougé et la réponse serait toujours « non ».
        const tierUp = !!nextTier && nextTier.referralsAway === 1;
        setDone({
          refCode: data.referral?.refCode || '',
          restaurantName: form.restaurantName,
          creditAmount: Number(data.referral?.creditAmount ?? member.tier.credit),
          tierUp,
        });
        refresh();
      } else if (data.error === 'invalid_fields') {
        setBadFields(data.fields || []);
        setError(t('pass.join.err.generic'));
      } else {
        const k = `pass.join.err.${data.error}`;
        const msg = t(k);
        setError(msg === k ? t('pass.join.err.generic') : msg);
      }
    } catch {
      setError(t('pass.join.err.generic'));
    } finally {
      setBusy(false);
    }
  };

  const bad = (f: string) =>
    badFields.includes(f)
      ? 'border-[#F46060] focus:border-[#F46060] focus:ring-[#F46060]/15'
      : 'border-[#E0E0E0] dark:border-[#242424] focus:border-[#F58345] focus:ring-[#F58345]/15';
  const field =
    'mt-2 w-full rounded-xl bg-white dark:bg-[#141414] px-4 py-3.5 text-[15px] outline-none transition-colors duration-150 placeholder:text-[#94969C] dark:placeholder:text-white/35 focus:ring-4 border';
  const label = 'block text-[13px] font-medium text-[#424242] dark:text-white/80';

  // ── Confirmation ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <PassPortal title={t('pass.nav.confirmation')}>
        <PassMotion />
        <div className="mx-auto w-full max-w-[720px]">
          <div className="pass-rise rounded-[14px] border border-[#E0E0E0]/70 bg-white dark:bg-[#141414] p-8 shadow-[0_4px_6px_-2px_rgba(16,24,40,0.03),0_12px_16px_-4px_rgba(16,24,40,0.06)] sm:p-10">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FDE6DA]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="m4.5 12.5 5 5 10-11" stroke="#D16630" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h1 className="mt-5 text-[30px] font-bold leading-[1.12] tracking-[-0.015em]">
              {t('pass.confirmation.title')}
            </h1>
            <p className="mt-3 text-[15.5px] leading-[1.6] text-[#61646C] dark:text-white/55">
              {tf('pass.confirmation.sub', {
                firstName: (member.fullName || member.email).split(' ')[0],
                restaurant: done.restaurantName,
              })}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-[#FBCDB5] bg-[#FDE6DA]/70 px-5 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-[#8A4220]/70">
                  {t('pass.confirmation.reference')}
                </p>
                <p className="mt-1 font-mono text-[16px] font-bold">{done.refCode}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-[#8A4220]/70">
                  {t('pass.confirmation.ifLive')}
                </p>
                <p className="mt-1 text-[14px] leading-snug text-[#8A4220]">
                  {done.tierUp && nextTier
                    ? tf('pass.confirmation.ifLiveBodyTierUp', {
                        amount: money(done.creditAmount),
                        tier: tierName(nextTier.key),
                        nextAmount: money(nextTier.credit),
                      })
                    : tf('pass.confirmation.ifLiveBodyDyn', { amount: money(done.creditAmount) })}
                </p>
              </div>
            </div>

            <h2 className="mt-8 text-[13px] font-medium uppercase tracking-[0.07em] text-[#61646C] dark:text-white/55">
              {t('pass.confirmation.next')}
            </h2>
            <ol className="mt-4 space-y-5">
              {list('pass.confirmation.steps').map((s: { title: string; body: string }, i: number) => (
                <li key={s.title} className="flex gap-4">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#141414] dark:bg-white text-[12px] font-bold text-white dark:text-[#141414]">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[14.5px] font-semibold">{s.title}</p>
                    <p className="mt-1 text-[14px] leading-[1.55] text-[#61646C] dark:text-white/55">
                      {s.body.split('{restaurant}').join(done.restaurantName)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/pass"
                className="rounded-xl bg-[#F58345] px-5 py-3 text-[14.5px] font-bold text-white transition-colors duration-150 hover:bg-[#E5723A]"
              >
                {t('pass.confirmation.cta1')}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setDone(null); setConsent(false);
                  setForm({ restaurantName: '', contactName: '', city: '', province: '', postalCode: '', contact: '', contactLocale: 'fr-CA', relationship: '' });
                }}
                className="rounded-xl border border-[#E0E0E0] dark:border-[#242424] px-5 py-3 text-[14.5px] font-semibold transition-colors duration-150 hover:border-[#94969C] dark:hover:border-white/40"
              >
                {t('pass.confirmation.cta2')}
              </button>
            </div>
          </div>
        </div>
      </PassPortal>
    );
  }

  // ── Formulaire ────────────────────────────────────────────────────────────
  return (
    <PassPortal title={t('pass.nav.refer')}>
      <PassMotion />
      <div className="mx-auto w-full max-w-[1160px]">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:gap-14">
          {/* Ce que la recommandation rapporte — la raison d'être du formulaire */}
          <section className="pass-rise min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#D16630]">
              {t('pass.programName')}
            </p>
            <h1 className="mt-4 text-[40px] font-bold leading-[1.06] tracking-[-0.015em]">
              {t('pass.form.title')}
            </h1>
            <p className="mt-4 max-w-[42ch] text-[15.5px] leading-[1.62] text-[#61646C] dark:text-white/55">
              {t('pass.form.sub')}
            </p>

            <div className="mt-8 rounded-[14px] border border-[#FBCDB5] bg-[#FDE6DA]/70 p-6">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-[#8A4220]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F58345]" />
                {/* Variante paramétrée : la phrase du deck fige « palier 2 ». */}
                {tf('pass.form.tierLineDyn', { tier: tierName(member.tier.key), level: member.tier.level })}
              </p>
              {/* Le palier ne donne qu'un PLAFOND — le montant réel est confirmé à la main
                  après la mise en service, selon les services que la référence retient. Le
                  « Jusqu'à » porte donc la modulation, comme sur les cartes de la page
                  programme : sans lui, ce chiffre de 40 px est une promesse ferme. */}
              <p className="mt-3 flex items-baseline gap-2 text-[40px] font-bold leading-none tracking-[-0.02em] text-[#D16630]">
                <span className="text-[15px] font-semibold tracking-normal text-[#8A4220]/75">
                  {t('pass.upTo')}
                </span>
                {money(member.tier.credit)}
              </p>
              <p className="mt-2 text-[13.5px] text-[#8A4220]/80">{t('pass.form.creditWhen')}</p>
              {nextTier && (
                <p className="mt-4 border-t border-[#F79C6A]/30 pt-4 text-[13px] leading-[1.55] text-[#8A4220]/85">
                  {tf(
                    nextTier.referralsAway === 1 ? 'pass.form.nextTierOne' : 'pass.form.nextTierMany',
                    { n: nextTier.referralsAway, tier: tierName(nextTier.key), amount: money(nextTier.credit) },
                  )}
                </p>
              )}
            </div>

            <div className="mt-4 rounded-[14px] border border-[#E0E0E0] dark:border-[#242424] bg-white dark:bg-[#141414] p-6">
              <p className="text-[14.5px] font-bold">
                {tf('pass.form.discountTitleDyn', { amount: money(member.hardwareDiscount) })}
              </p>
              <p className="mt-2 text-[13.5px] leading-[1.55] text-[#61646C] dark:text-white/55">
                {t('pass.form.discountBody')}
              </p>
            </div>
          </section>

          {/* Le formulaire */}
          <section className="pass-rise min-w-0">
            <form
              onSubmit={submit}
              noValidate
              className="rounded-[14px] border border-[#E0E0E0]/70 bg-white dark:bg-[#141414] p-8 shadow-[0_4px_6px_-2px_rgba(16,24,40,0.03),0_12px_16px_-4px_rgba(16,24,40,0.06)] sm:p-10"
            >
              <p className="text-[12px] font-medium uppercase tracking-[0.07em] text-[#61646C] dark:text-white/55">
                {t('pass.form.section1')}
              </p>

              <div className="mt-5">
                <label htmlFor="r-name" className={label}>{t('pass.form.fields.restaurant')}</label>
                <input id="r-name" required value={form.restaurantName} onChange={set('restaurantName')}
                  className={`${field} ${bad('restaurantName')}`} placeholder="Café Merlebleu" />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="r-contact" className={label}>{t('pass.form.fields.contact')}</label>
                  <input id="r-contact" required value={form.contactName} onChange={set('contactName')}
                    className={`${field} ${bad('contactName')}`} placeholder="Samuel Okafor" />
                </div>
                <div>
                  <label htmlFor="r-city" className={label}>{t('pass.form.fields.city')}</label>
                  <input id="r-city" required value={form.city} onChange={set('city')}
                    className={`${field} ${bad('city')}`} placeholder="Montréal" />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="r-prov" className={label}>{t('pass.form.fields.province')}</label>
                  {/* Liste FERMÉE de 13 entrées — « Canada seulement » est une règle
                      d'éligibilité, pas une ligne de copie, et le serveur la revalide. */}
                  <Select id="r-prov" required value={form.province} onChange={(v) => set('province')({ target: { value: v } })} options={PROVINCES.map((code) => ({ value: code, label: provinceName(code) }))} placeholder="" buttonClassName={`${field} ${bad('province')}`} />
                </div>
                <div>
                  <label htmlFor="r-postal" className={label}>{t('pass.form.fields.postal')}</label>
                  <input id="r-postal" required value={form.postalCode} onChange={set('postalCode')}
                    className={`${field} ${bad('postalCode')}`} placeholder="H2T 1X4" />
                </div>
              </div>

              <div className="mt-4">
                <label htmlFor="r-reach" className={label}>{t('pass.form.fields.reach')}</label>
                <input id="r-reach" required value={form.contact} onChange={set('contact')}
                  className={`${field} ${bad('contact')}`} placeholder="bonjour@cafemerlebleu.ca" />
              </div>

              <div className="mt-4">
                <label htmlFor="r-lang" className={label}>{t('pass.form.fields.langPref')}</label>
                <Select id="r-lang" value={form.contactLocale} onChange={(v) => set('contactLocale')({ target: { value: v } })} options={[{ value: 'fr-CA', label: 'Français' }, { value: 'en-CA', label: 'English' }]} buttonClassName={`${field} ${bad('contactLocale')}`} />
              </div>

              <div className="mt-4">
                <label htmlFor="r-how" className={label}>{t('pass.form.fields.howKnow')}</label>
                <textarea id="r-how" rows={3} value={form.relationship} onChange={set('relationship')}
                  className={`${field} ${bad('relationship')} resize-none`}
                  placeholder={t('pass.form.fields.howKnowPlaceholder')} />
              </div>

              <label className="mt-6 flex cursor-pointer items-start gap-3 text-[13px] leading-[1.55] text-[#424242] dark:text-white/80">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer accent-[#F58345]" />
                <span>{t('pass.form.consent')}</span>
              </label>

              {error && (
                <p role="alert" className="mt-4 rounded-xl bg-[#FEF3F2] px-4 py-3 text-[13px] leading-[1.5] text-[#912018]">
                  {error}
                </p>
              )}

              <button type="submit" disabled={busy}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#F58345] px-5 py-3.5 text-[15px] font-bold text-white transition-colors duration-150 hover:bg-[#E5723A] active:bg-[#D16630] disabled:cursor-not-allowed disabled:opacity-45">
                {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {busy ? t('pass.form.sendingLabel') : t('pass.form.submit')}
              </button>
            </form>
          </section>
        </div>
      </div>
    </PassPortal>
  );
};

export default Refer;
