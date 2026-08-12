import { useEffect, useState } from 'react';
import PassTierBadge from './PassTierBadge';
import { Link } from 'react-router-dom';
import { usePassAuth } from '../../context/PassAuthContext';
import { ClusterMark, PASS_API, PassLangToggle, PassThemeToggle, PassMotion, PassPill, useFmt, useTierName } from './passUi';

// Page programme (écran 01) — page marketing PUBLIQUE, pas un écran du portail. Coquille
// autonome : en-tête et pied publics, aucune barre latérale, pleine largeur.
//
// Elle doit fonctionner pour un visiteur DÉCONNECTÉ, parce que le lien de recommandation
// personnel d'un membre y envoie des non-clients. D'où le bouton « Espace membre » qui
// n'apparaît que si une session existe : le proposer à un visiteur sans compte l'enverrait
// dans un mur.
//
// Les montants viennent de /api/pass/program, jamais du client (règle 4 du brief).

interface Tier { level: number; key: string; from: number; credit: number }
interface Program { enabled: boolean; hardwareDiscount: number; tiers: Tier[] }

const Program = () => {
  const { t, list, money } = useFmt();
  const tierName = useTierName();
  const { isAuthenticated } = usePassAuth();
  const [program, setProgram] = useState<Program | null>(null);
  const [openFaq, setOpenFaq] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetch(`${PASS_API}/api/pass/program`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Program | null) => p && setProgram(p))
      .catch(() => {});
  }, []);

  const tiers = program?.tiers || [];
  const topCredit = tiers.length ? Math.max(...tiers.map((x) => x.credit)) : null;
  const perksFor = (level: number) => list(`pass.landing.perks${level}`) as string[];
  const rules = list('pass.landing.rule') as string[];
  const labels = list('pass.landing.tierLabel') as string[];

  const btnPrimary =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-[#F58345] px-6 py-3.5 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-[#E5723A] active:bg-[#D16630]';
  const btnGhost =
    'inline-flex items-center justify-center rounded-xl border border-[#D1D1D1] dark:border-white/20 px-6 py-3.5 text-[15px] font-medium text-[#141414] dark:text-white transition-colors duration-150 hover:border-[#94969C] dark:hover:border-white/45';
  const wrap = 'mx-auto w-full max-w-[1100px] px-6 sm:px-8';

  return (
    <div className="min-h-screen bg-[#F5F5F6] dark:bg-[#0A0A0A] font-satoshi text-[#141414] dark:text-white">
      <PassMotion />

      {/* ── En-tête public ─────────────────────────────────────────────── */}
      <header className="border-b border-[#E0E0E0] dark:border-[#242424]">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-5`}>
          <div className="flex items-center gap-3">
            <ClusterMark className="h-[22px] w-auto" />
            <PassPill />
          </div>
          <div className="flex items-center gap-3">
            <PassLangToggle />
            <PassThemeToggle />
            {/* Proposé UNIQUEMENT à qui a déjà une session — voir le commentaire d'en-tête. */}
            {isAuthenticated && (
              <Link
                to="/pass"
                className="rounded-xl border border-[#D1D1D1] dark:border-white/20 px-4 py-2.5 text-[14px] font-medium transition-colors duration-150 hover:border-[#94969C] dark:hover:border-white/45"
              >
                {t('pass.landing.publicHeader.hub')}
              </Link>
            )}
            <Link to="/pass/connexion" className="rounded-xl bg-[#F58345] px-4 py-2.5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-[#E5723A]">
              {t('pass.landing.cta1')}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Héros ──────────────────────────────────────────────────────── */}
      <section className={`${wrap} pass-rise py-16 text-center sm:py-24`}>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#F58345]/35 bg-[#F58345]/10 px-4 py-2 text-[13px] font-medium text-[#D16630] dark:text-[#F79C6A]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#F58345]" />
          {t('pass.landing.eyebrow')}
        </span>
        <h1 className="mx-auto mt-7 max-w-[15ch] text-[42px] font-medium leading-[1.06] tracking-[-0.015em] sm:text-[56px]">
          {t('pass.landing.title')}
        </h1>
        <p className="mx-auto mt-6 max-w-[58ch] text-[16.5px] leading-[1.65] text-[#61646C] dark:text-white/55">
          {t('pass.landing.sub')}
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link to="/pass/connexion" className={btnPrimary}>{t('pass.landing.cta1')}</Link>
          {isAuthenticated && <Link to="/pass" className={btnGhost}>{t('pass.landing.cta2')}</Link>}
        </div>

        {/* Le crédit maximal sort de la CONFIGURATION, jamais d'un nombre recopié.
            Le rabais matériel a été retiré d'ici : il ne s'adresse plus au restaurant
            recommandé, et David l'a aussi sorti des paliers — il n'a donc plus de place
            sur la page publique. Le champ reste en configuration, simplement inutilisé. */}
        {program && (
          <div className="mx-auto mt-14 grid max-w-[560px] gap-8 border-t border-[#E0E0E0] dark:border-white/[0.08] pt-10 sm:grid-cols-2">
            {[
              { v: topCredit !== null ? money(topCredit) : '—', l: t('pass.landing.stat1') },
              { v: t('pass.landing.stat3Value'), l: t('pass.landing.stat3') },
            ].map((s) => (
              <div key={s.l}>
                <p className="text-[30px] font-medium leading-none tracking-[-0.02em]">{s.v}</p>
                <p className="mt-2 text-[13px] leading-snug text-[#61646C] dark:text-white/45">{s.l}</p>
              </div>
            ))}
          </div>
        )}
      
        {/* Visuel produit, sous le bloc de texte plutot qu'a cote : en deux colonnes il
            faudrait empiler en mobile de toute facon, et un heros centre supporte mieux
            une image large qu'une grille qui se casse.

            Deux resolutions via `srcSet` — 1600 px suffit au conteneur borne a 1160 px,
            2400 px sert les ecrans a haute densite. En JPEG et non PNG : une PHOTO en PNG
            stocke chaque pixel, la source pesait 4,3 Mo contre 153 Ko ici. C'est la
            premiere image que voit un restaurateur, elle ne doit pas retarder la page.

            `loading="eager"` : elle est au-dessus de la ligne de flottaison, la differer
            ferait sauter la mise en page au chargement. */}
        <div className="mx-auto mt-14 max-w-[1160px] overflow-hidden rounded-[14px] border border-black/5 shadow-2xl dark:border-white/10">
          <img
            src="/pass-hero.jpg"
            srcSet="/pass-hero.jpg 1600w, /pass-hero@2x.jpg 2400w"
            sizes="(min-width: 1200px) 1160px, 100vw"
            width={1600}
            height={900}
            alt={t('pass.landing.heroAlt') as string}
            loading="eager"
            className="block h-auto w-full"
            draggable={false}
          />
        </div>
      </section>

      {/* ── L'échelle ──────────────────────────────────────────────────── */}
      <section className="border-y border-[#E0E0E0] dark:border-[#242424] bg-white dark:bg-[#0F0F0F] py-16 sm:py-20">
        <div className={wrap}>
          <p className="text-center text-[12px] font-medium uppercase tracking-[0.09em] text-[#D16630] dark:text-[#F79C6A]">
            {t('pass.landing.ladderEyebrow')}
          </p>
          <h2 className="mx-auto mt-4 max-w-[22ch] text-center text-[32px] font-medium leading-[1.12] tracking-[-0.015em] sm:text-[40px]">
            {t('pass.landing.ladderTitle')}
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-center text-[15.5px] leading-[1.6] text-[#61646C] dark:text-white/50">
            {t('pass.landing.ladderSub')}
          </p>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {tiers.map((tier, i) => (
              <div key={tier.level} className="flex flex-col rounded-[14px] border border-[#E0E0E0] dark:border-[#242424] bg-white dark:bg-[#141414] p-6 sm:p-7">
                <PassTierBadge level={tier.level} className="h-14 w-14" />
                <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.08em] text-[#61646C] dark:text-white/40">
                  {labels?.[i]}
                </p>
                <p className="mt-3 text-[17px] font-medium">{tierName(tier.key)}</p>
                {/* Le montant EST le titre de la carte — le brief interdit de le répéter
                    en puce parmi les avantages. */}
                <p className="mt-4 text-[40px] font-medium leading-none tracking-[-0.02em] text-[#D16630] dark:text-[#F58345]">
                  {money(tier.credit)}
                </p>
                <p className="mt-2 text-[13px] text-[#61646C] dark:text-white/45">{t('pass.landing.creditEach')}</p>
                <p className="mt-5 border-t border-[#E0E0E0] dark:border-white/[0.08] pt-5 text-[13.5px] leading-snug text-[#61646C] dark:text-white/55">
                  {rules?.[i]}
                </p>
                <ul className="mt-5 space-y-3">
                  {/* Chaque palier liste ses avantages PROPRES — la v2 du design a
                      supprimé les « tout ce qu'offre le palier inférieur ». */}
                  {perksFor(tier.level).map((p) => (
                    <li key={p} className="flex gap-3 text-[13.5px] leading-[1.5] text-[#424242] dark:text-white/70">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#F58345]" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-[13px] text-[#61646C] dark:text-white/40">{t('pass.landing.cumulativeNote')}</p>
        </div>
      </section>

      {/* ── Bandeau d'avantages ────────────────────────────────────────── */}
      <section className={`${wrap} py-16 sm:py-20`}>
        <h2 className="mx-auto max-w-[24ch] text-center text-[30px] font-medium leading-[1.14] tracking-[-0.015em] sm:text-[36px]">
          {t('pass.landing.benefitsTitle')}
        </h2>
        <p className="mx-auto mt-4 max-w-[58ch] text-center text-[15.5px] leading-[1.6] text-[#61646C] dark:text-white/50">
          {t('pass.landing.benefitsSub')}
        </p>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {(list('pass.landing.benefits') as { title: string; body: string }[]).map((b) => (
            <div key={b.title}>
              <p className="text-[16px] font-medium">{b.title}</p>
              <p className="mt-2.5 text-[14.5px] leading-[1.6] text-[#61646C] dark:text-white/50">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Comment ça marche ──────────────────────────────────────────── */}
      <section className="border-y border-[#E0E0E0] dark:border-[#242424] bg-white dark:bg-[#0F0F0F] py-16 sm:py-20">
        <div className={wrap}>
          <h2 className="text-center text-[30px] font-medium leading-[1.14] tracking-[-0.015em] sm:text-[36px]">
            {t('pass.landing.howTitle')}
          </h2>
          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {(list('pass.landing.steps') as { title: string; body: string }[]).map((s, i) => (
              <li key={s.title}>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#F58345]/40 bg-[#F58345]/10 text-[13px] font-medium text-[#D16630] dark:text-[#F79C6A]">
                  {i + 1}
                </span>
                <p className="mt-4 text-[16px] font-medium">{s.title}</p>
                <p className="mt-2 text-[14.5px] leading-[1.6] text-[#61646C] dark:text-white/50">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Teaser de l'espace membre ──────────────────────────────────── */}
      <section className={`${wrap} py-16 sm:py-20`}>
        <div className="rounded-[14px] border border-[#E0E0E0] dark:border-[#242424] bg-white dark:bg-[#141414] px-6 py-12 text-center sm:px-12">
          <h2 className="mx-auto max-w-[22ch] text-[28px] font-medium leading-[1.16] tracking-[-0.015em] sm:text-[34px]">
            {t('pass.landing.teaserTitle')}
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[15.5px] leading-[1.6] text-[#61646C] dark:text-white/50">
            {t('pass.landing.teaserSub')}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/pass/connexion" className={btnPrimary}>{t('pass.landing.teaserCta1')}</Link>
            <Link to={isAuthenticated ? '/pass/referer' : '/pass/connexion'} className={btnGhost}>
              {t('pass.landing.teaserCta2')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section className="border-y border-[#E0E0E0] dark:border-[#242424] bg-white dark:bg-[#0F0F0F] py-16 sm:py-20">
        <div className={`${wrap} max-w-[820px]`}>
          <h2 className="text-center text-[30px] font-medium leading-[1.14] tracking-[-0.015em] sm:text-[36px]">
            {t('pass.landing.faqTitle')}
          </h2>
          {/* Accordéon piloté par l'état plutôt que par <details> : la réponse n'est
              montée que lorsqu'elle est ouverte, et le chevron suit le même état — donc
              aucun risque de voir l'un sans l'autre. `aria-expanded` + `aria-controls`
              donnent au clavier et aux lecteurs d'écran ce que le <details> natif offrait.
              Le chevron est l'une des deux seules animations que le brief autorise. */}
          <div className="mt-10 divide-y divide-[#E0E0E0] dark:divide-[#242424] border-y border-[#E0E0E0] dark:border-[#242424]">
            {(list('pass.landing.faq') as { q: string; a: string }[]).map((f, i) => {
              const open = !!openFaq[i];
              return (
                <div key={f.q}>
                  <h3>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`faq-a-${i}`}
                      onClick={() => setOpenFaq((o) => ({ ...o, [i]: !o[i] }))}
                      className="flex w-full items-start justify-between gap-6 py-5 text-left text-[15.5px] font-medium leading-snug"
                    >
                      {f.q}
                      {/* La rotation est portée par un SPAN plutôt que par le <svg> :
                          l'origine de transformation d'un élément SVG dépend de
                          `transform-box`, alors que sur un élément HTML elle est au centre
                          par défaut — ce qu'on veut pour un chevron qui bascule. */}
                      <span
                        className="mt-1 inline-flex shrink-0 text-[#61646C] dark:text-white/40"
                        style={{
                          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 180ms cubic-bezier(.2,.8,.2,1)',
                        }}
                        aria-hidden
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                             strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                    </button>
                  </h3>
                  {open && (
                    <p id={`faq-a-${i}`} className="max-w-[70ch] pb-6 pr-10 text-[14.5px] leading-[1.7] text-[#61646C] dark:text-white/55">
                      {f.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA de clôture ─────────────────────────────────────────────── */}
      <section className={`${wrap} py-20 text-center sm:py-28`}>
        <h2 className="mx-auto max-w-[18ch] text-[34px] font-medium leading-[1.1] tracking-[-0.015em] sm:text-[44px]">
          {t('pass.landing.closeTitle')}
        </h2>
        <p className="mx-auto mt-4 max-w-[50ch] text-[16px] leading-[1.6] text-[#61646C] dark:text-white/50">
          {t('pass.landing.closeSub')}
        </p>
        <Link to="/pass/connexion" className={`${btnPrimary} mt-8`}>{t('pass.landing.closeCta')}</Link>
        <p className="mt-5 text-[12.5px] text-[#61646C] dark:text-white/35">{t('pass.landing.termsNote')}</p>
      </section>

      {/* ── Pied public ────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E0E0E0] dark:border-[#242424] py-12">
        <div className={wrap}>
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div>
              <ClusterMark className="h-[20px] w-auto" />
              <p className="mt-3 text-[13px] text-[#61646C] dark:text-white/40">{t('pass.landing.publicFooter.tagline')}</p>
            </div>
            <div className="flex flex-wrap gap-x-7 gap-y-2 text-[13.5px]">
              <Link to="/terms" className="text-[#61646C] dark:text-white/55 hover:text-[#141414] dark:hover:text-white">{t('pass.landing.publicFooter.terms')}</Link>
              <Link to="/privacy" className="text-[#61646C] dark:text-white/55 hover:text-[#141414] dark:hover:text-white">{t('pass.landing.publicFooter.privacy')}</Link>
              <a href="mailto:lapasse@clustersystems.com" className="text-[#61646C] dark:text-white/55 hover:text-[#141414] dark:hover:text-white">
                {t('pass.landing.publicFooter.contact')}
              </a>
            </div>
          </div>
          <p className="mt-10 max-w-[100ch] text-[11.5px] leading-[1.7] text-[#61646C] dark:text-white/25">
            {t('pass.landing.legal')}
          </p>
          <p className="mt-3 text-[11.5px] text-[#61646C] dark:text-white/20">{t('pass.landing.lastUpdated')}</p>
        </div>
      </footer>
    </div>
  );
};

export default Program;
