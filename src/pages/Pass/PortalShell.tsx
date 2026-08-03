import { ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { usePassAuth } from '../../context/PassAuthContext';
import { ClusterMark, PassPill, useFmt } from './passUi';

// La coquille du portail, telle que la v2 du design la spécifie : barre latérale de
// 230 px et topbar de 64 px. Les écrans membres ne sont donc plus des pages autonomes.
//
// Ce n'est pas une préférence esthétique : le brief du designer dit que « le Sales Hub EST
// ce portail », donc le cadre autour de La Passe est du produit existant, pas du dessin
// neuf. Les écrans du programme s'y insèrent au lieu de réinventer leur propre enveloppe.
//
// ⚠️ Ce que la maquette montre mais qu'on NE LIVRE PAS (règle 8 du brief) : le bloc
// « VUES DE PROTOTYPE » du menu (Confirmation, Courriels, Page du lien). Ce sont des
// raccourcis de revue, pas des destinations pour un marchand — la confirmation est un
// état du formulaire, les courriels partent par courriel, et la page du lien est
// publique. « Suivi interne » n'y est pas non plus : c'est l'écran des employés.

const ICONS: Record<string, ReactNode> = {
  program: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
    </>
  ),
  hub: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  refer: <path d="M12 5v14M5 12h14" />,
};

// « Programme » (la page marketing publique) n'y est pas ENCORE : elle n'est pas
// construite, et un menu qui mène à une page inexistante est pire qu'un menu court.
// À rajouter en même temps que l'écran.
const NAV = [
  { key: 'hub', to: '/pass', end: true },
  { key: 'refer', to: '/pass/referer', end: false },
] as const;

export const PassPortal = ({
  title,
  surface = 'dark',
  children,
}: {
  title: string;
  /**
   * Fond de la ZONE DE CONTENU seulement — la barre latérale et la topbar restent
   * sombres dans tous les cas. Le designer alterne : espace membre sur fond sombre,
   * formulaire et confirmation sur fond clair. Ce n'est pas une incohérence, c'est sa
   * façon de séparer « consulter » de « saisir ».
   */
  surface?: 'dark' | 'light';
  children: ReactNode;
}) => {
  const { t, i18n, fr } = useFmt();
  const { member, logout } = usePassAuth();

  const initials = (member?.business || member?.fullName || member?.email || '?')
    .split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const item =
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] transition-colors duration-150';

  return (
    <div className="flex min-h-screen bg-[#0A0A0A] font-satoshi text-white">
      {/* ── Barre latérale ─────────────────────────────────────────────── */}
      <aside className="hidden w-[230px] shrink-0 flex-col border-r border-[#242424] bg-[#121212] px-4 py-6 lg:flex">
        <Link to="/pass" className="px-2">
          <ClusterMark onDark className="h-[22px] w-auto" />
          <span className="mt-3 block">
            <PassPill />
          </span>
        </Link>

        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.key}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `${item} ${
                  isActive
                    ? 'bg-[#F58345] font-medium text-white'
                    : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                }`
              }
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                {ICONS[n.key]}
              </svg>
              {t(`pass.nav.${n.key}`)}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={logout}
          className={`${item} mt-auto text-white/45 hover:bg-white/[0.05] hover:text-white`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
          </svg>
          {t('pass.common.signOut')}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Topbar ───────────────────────────────────────────────────── */}
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[#242424] px-5 sm:px-7">
          {/* En dessous de lg la barre latérale disparaît : la marque doit rester quelque
              part, sinon le marchand ne sait plus où il est. */}
          <Link to="/pass" className="flex items-center gap-2.5 lg:hidden">
            <ClusterMark onDark className="h-[18px] w-auto" />
            <PassPill />
          </Link>

          <h1 className="hidden min-w-0 truncate text-[22px] font-medium tracking-[-0.01em] lg:block">
            {title}
          </h1>

          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-[#323439] px-3 py-1.5 text-[13px] text-white/60 sm:inline-flex">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z" />
                <circle cx="12" cy="10" r="2.4" />
              </svg>
              {t('pass.region')}
            </span>

            {/* Pastille de langue : code courant + chevron, comme le kit du portail. Un
                clic bascule — deux langues seulement, un menu serait une étape de trop. */}
            <button
              type="button"
              onClick={() => {
                const next = fr ? 'en' : 'fr';
                i18n.changeLanguage(next);
                localStorage.setItem('language', next);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#323439] px-3 py-1.5 text-[13px] font-medium text-white/75 transition-colors duration-150 hover:border-[#575A61] hover:text-white"
            >
              {fr ? 'FR' : 'EN'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12.5px] font-medium text-white"
              style={{ background: 'linear-gradient(135deg,#F79C6A,#D16630)' }}
              title={member?.business || member?.email || ''}
            >
              {initials}
            </span>
          </div>
        </header>

        <main
          className={`min-w-0 flex-1 px-5 py-6 sm:px-7 sm:py-8 ${
            surface === 'light' ? 'bg-[#F5F5F6] text-[#141414]' : 'bg-[#0A0A0A] text-white'
          }`}
        >
          <h1 className="mb-6 text-[22px] font-medium tracking-[-0.01em] lg:hidden">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  );
};
