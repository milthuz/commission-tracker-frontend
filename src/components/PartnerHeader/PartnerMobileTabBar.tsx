import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import NavIcon, { IconName } from '../Sidebar/NavIcon';
import { SOFIA_STATE_EVENT, setSofiaOpen } from '../../lib/sofiaBus';

// Phone navigation of the partner portal — same bar as the internal MobileTabBar (refonte UI,
// canvas board TabBar), with the portal's own four destinations:
//
//   Opportunités · Soumettre · Sofia · Plus
//
// « Soumettre » is the portal's main gesture, so it gets a tab rather than hiding behind a
// sub-tab. « Plus » (pages/PartnerPortal/More) holds the rest: settings, the admin screens,
// theme, language and log out. Below `lg` only; the desktop keeps PartnerSidebar.

const PartnerMobileTabBar = () => {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const [sofiaOpen, setSofiaOpenState] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setSofiaOpenState(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(SOFIA_STATE_EVENT, on);
    return () => window.removeEventListener(SOFIA_STATE_EVENT, on);
  }, []);

  const onHome = pathname === '/partner-portal';
  const onSubmit = onHome && new URLSearchParams(search).get('onglet') === 'soumettre';
  const tabs: { id: string; to?: string; icon: IconName; label: string; active: boolean }[] = [
    { id: 'home', to: '/partner-portal', icon: 'chart', label: t('partnerPortal.mobileNav.opportunities'), active: !sofiaOpen && onHome && !onSubmit },
    { id: 'submit', to: '/partner-portal?onglet=soumettre', icon: 'userPlus', label: t('partnerPortal.mobileNav.submit'), active: !sofiaOpen && onSubmit },
    { id: 'sofia', icon: 'sparkle', label: 'Sofia', active: sofiaOpen },
    // « Plus » is where every other screen lives, so it reads as the current tab there.
    { id: 'more', to: '/partner-portal/plus', icon: 'grid', label: t('mobileNav.more'), active: !sofiaOpen && !onHome },
  ];

  const cell = (active: boolean) => `flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-[11px] ${
    active ? 'font-bold text-accent-ink dark:text-accent-ink-dark' : 'font-medium text-[#575A61] dark:text-[#999AA7]'}`;
  const pill = (active: boolean) => `relative flex h-7 w-[52px] items-center justify-center rounded-full ${
    active ? 'bg-[rgba(245,131,69,0.14)] dark:bg-[rgba(245,131,69,0.16)]' : ''}`;

  return (
    <nav
      aria-label={t('partnerPortal.mobileNav.label') as string}
      data-tour-tabbar
      className="fixed inset-x-0 bottom-0 z-[9991] grid border-t border-stroke bg-white px-1 pb-[env(safe-area-inset-bottom)] pt-1.5 dark:border-strokedark dark:bg-[#121212] lg:hidden"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => {
        const inner = (
          <>
            <span className={pill(tab.active)}><NavIcon name={tab.icon} size={22} /></span>
            {tab.label}
          </>
        );
        return tab.to ? (
          <Link key={tab.id} to={tab.to} data-tour-tab={tab.id} data-tour-label={tab.label} className={cell(tab.active)} aria-current={tab.active ? 'page' : undefined}
            onClick={() => setSofiaOpen(false)}>
            {inner}
          </Link>
        ) : (
          <button key={tab.id} type="button" data-tour-tab={tab.id} data-tour-label={tab.label} className={cell(tab.active)} aria-pressed={tab.active} onClick={() => setSofiaOpen(!sofiaOpen)}>
            {inner}
          </button>
        );
      })}
    </nav>
  );
};

export default PartnerMobileTabBar;
