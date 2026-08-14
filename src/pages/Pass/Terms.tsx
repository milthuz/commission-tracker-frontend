import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClusterMark, PassPill, PassLangToggle, PassThemeToggle, PassMotion,
  usePassFavicon, useFmt, passPrivacyUrl, PASS_API,
} from './passUi';

// Conditions du programme — page PUBLIQUE, coquille autonome comme /pass/programme : un
// restaurateur qui lit les conditions n'a pas de session, et ne doit jamais voir la barre
// latérale de Sales Hub.
//
// La version et la date d'entrée en vigueur viennent de l'API, PAS de la copie. C'est la
// même valeur que celle enregistrée sur le membre à son consentement
// (`pass_members.consent_terms_version`) : un document qui annonce une version différente de
// celle enregistrée rend le consentement inutilisable, et deux valeurs tenues à la main
// finissent toujours par diverger.
//
// Les MONTANTS sont volontairement absents du texte : ils sont configurables, et un document
// qui les recopie devient faux au premier changement dans l'admin. Le texte décrit le
// mécanisme et renvoie à la page du programme.

interface Program { termsVersion?: string; termsUpdated?: string }

const Terms = () => {
  usePassFavicon();
  const { t, list, fr } = useFmt();

  // Date d'entrée en vigueur — surtout PAS le `date()` de useFmt, qui rend « 14 août » sans
  // l'année : sur un document juridique l'année n'est pas décorative.
  //
  // 🐛 Et parsée LOCALEMENT, jamais par `new Date('2026-08-14')` : cette forme est lue comme
  // minuit UTC, donc affichée la VEILLE partout à l'ouest de Greenwich — le 13 août à
  // Montréal. Même piège que celui qui a imposé `DateField` dans le reste de l'app.
  const effectiveDate = (iso?: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    return new Date(y, m - 1, d).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  };
  const [program, setProgram] = useState<Program | null>(null);

  useEffect(() => {
    fetch(`${PASS_API}/api/pass/program`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Program | null) => p && setProgram(p))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.title = `${t('pass.terms.title')} | Cluster`;
  }, [t]);

  const sections = list('pass.terms.sections') as { h: string; p: string[] }[];
  const wrap = 'mx-auto w-full max-w-[1160px] px-6 sm:px-8';

  return (
    <div className="min-h-screen bg-white text-[#141414] dark:bg-[#0D0D0D] dark:text-white">
      <PassMotion />

      <header className="border-b border-[#E0E0E0] dark:border-[#242424]">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-5`}>
          <Link to="/pass/programme" className="flex items-center gap-3">
            <ClusterMark className="h-[22px] w-auto" />
            <PassPill />
          </Link>
          <div className="flex items-center gap-3">
            <PassLangToggle />
            <PassThemeToggle />
            <Link
              to="/pass/programme"
              className="rounded-xl border border-[#D1D1D1] dark:border-white/20 px-4 py-2.5 text-[14px] font-medium transition-colors duration-150 hover:border-[#94969C] dark:hover:border-white/45"
            >
              {t('pass.terms.backToProgram')}
            </Link>
          </div>
        </div>
      </header>

      {/* Un document se lit en colonne étroite. 76 caractères de large environ : au-delà,
          l'œil perd sa ligne en revenant à la gauche — le conteneur de 1 160 px du deck
          borne la PAGE, pas un paragraphe. */}
      <main className={`${wrap} pass-rise py-14 sm:py-20`}>
        <div className="mx-auto max-w-[68ch]">
          <h1 className="text-[32px] font-medium leading-[1.14] tracking-[-0.015em] sm:text-[40px]">
            {t('pass.terms.title')}
          </h1>
          <p className="mt-4 text-[16px] leading-[1.65] text-[#61646C] dark:text-white/55">
            {t('pass.terms.sub')}
          </p>

          <dl className="mt-7 flex flex-wrap gap-x-10 gap-y-3 border-y border-[#E0E0E0] dark:border-[#242424] py-4">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.07em] text-[#61646C] dark:text-white/40">
                {t('pass.terms.versionLabel')}
              </dt>
              <dd className="mt-1 font-mono text-[14px]">{program?.termsVersion || '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.07em] text-[#61646C] dark:text-white/40">
                {t('pass.terms.updatedLabel')}
              </dt>
              <dd className="mt-1 text-[14px]">{effectiveDate(program?.termsUpdated)}</dd>
            </div>
          </dl>

          {/* Pourquoi aucun montant n'apparaît dans le document — dit au lecteur plutôt que
              laissé à deviner. */}
          <p className="mt-6 rounded-[14px] border border-[#FBCDB5] bg-[#FDE6DA]/70 px-5 py-4 text-[13.5px] leading-[1.6] text-[#8A4220]">
            {t('pass.terms.amountsNote')}{' '}
            <Link to="/pass/programme" className="font-semibold underline-offset-2 hover:underline">
              {t('pass.terms.backToProgram')}
            </Link>
          </p>

          {sections.map((s) => (
            <section key={s.h} className="mt-9">
              <h2 className="text-[17px] font-medium leading-snug">{s.h}</h2>
              {s.p.map((para) => (
                <p key={para} className="mt-3 text-[14.5px] leading-[1.7] text-[#424242] dark:text-white/70">
                  {para}
                </p>
              ))}
            </section>
          ))}

          <p className="mt-12 border-t border-[#E0E0E0] dark:border-[#242424] pt-6 text-[13.5px] text-[#61646C] dark:text-white/45">
            <a
              href={passPrivacyUrl(document.documentElement.lang)}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {t('pass.terms.privacyLink')}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Terms;
