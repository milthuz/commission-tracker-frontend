import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV, NavItem, isItemVisible } from '../config/navigation';
import NavIcon, { IconName } from './Sidebar/NavIcon';
import { useNavCtx } from './Sidebar/useNavCtx';
import { useNavBadges } from './Sidebar/useNavBadges';
import { SOFIA_STATE_EVENT, setSofiaOpen } from '../lib/sofiaBus';

// Phone navigation (audit UX, P2 — canvas boards Main / Plus / TabBar): five tabs at the bottom,
// the thumb's reach, instead of a drawer behind a hamburger. Below `lg` only; the desktop keeps
// the sidebar.
//
//   Accueil · Pistes · Commissions · Sofia · Plus
//
// Pistes and Commissions follow the SAME visibility as their sidebar entries (config/navigation),
// so a role without them simply gets fewer tabs. « Plus » holds everything else (pages/More).

const findItem = (id: string): NavItem | undefined => {
  for (const s of NAV) for (const it of s.items) if (it.id === id) return it;
  return undefined;
};

export const TABBAR_SPACE = 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0';

const MobileTabBar = () => {
  const { t } = useTranslation();
  const ctx = useNavCtx();
  const { pathname } = useLocation();
  const badges = useNavBadges({ leads: ctx.isAdmin || ctx.can('leads:review'), partners: false, health: false });
  const [sofiaOpen, setSofiaOpenState] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setSofiaOpenState(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(SOFIA_STATE_EVENT, on);
    return () => window.removeEventListener(SOFIA_STATE_EVENT, on);
  }, []);

  const leads = findItem('leads');
  const report = findItem('commissionReport');
  const onLeads = pathname === '/leads' || pathname.startsWith('/leads/');
  const onReport = pathname.startsWith('/commission-report');
  const tabs: { id: string; to?: string; icon: IconName; label: string; active: boolean; badge?: number }[] = [
    { id: 'home', to: '/', icon: 'home', label: t('mobileNav.home'), active: !sofiaOpen && pathname === '/' },
    ...(leads && isItemVisible(leads, ctx) ? [{ id: 'leads', to: '/leads', icon: 'inbox' as IconName, label: t('sidebar.leads'), active: !sofiaOpen && onLeads, badge: badges.leads }] : []),
    ...(report && isItemVisible(report, ctx) ? [{ id: 'report', to: '/commission-report', icon: 'chart' as IconName, label: t('mobileNav.commissions'), active: !sofiaOpen && onReport }] : []),
    { id: 'sofia', icon: 'sparkle', label: 'Sofia', active: sofiaOpen },
    // « Plus » is where every other screen lives, so it reads as the current tab there.
    { id: 'more', to: '/plus', icon: 'grid', label: t('mobileNav.more'), active: !sofiaOpen && pathname !== '/' && !onLeads && !onReport },
  ];

  const cell = (active: boolean) => `flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-[11px] ${
    active ? 'font-bold text-accent-ink dark:text-accent-ink-dark' : 'font-medium text-[#575A61] dark:text-[#999AA7]'}`;
  const pill = (active: boolean) => `relative flex h-7 w-[52px] items-center justify-center rounded-full ${
    active ? 'bg-[rgba(245,131,69,0.14)] dark:bg-[rgba(245,131,69,0.16)]' : ''}`;

  return (
    <nav
      aria-label={t('sidebar.mainNav') as string}
      className="fixed inset-x-0 bottom-0 z-[9991] grid border-t border-stroke bg-white px-1 pb-[env(safe-area-inset-bottom)] pt-1.5 dark:border-strokedark dark:bg-[#121212] lg:hidden"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => {
        const inner = (
          <>
            <span className={pill(tab.active)}>
              <NavIcon name={tab.icon} size={22} />
              {!!tab.badge && (
                <span className="absolute -top-0.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-[#141414]"
                  aria-label={t('sidebar.leadsPending', { count: tab.badge }) as string}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </span>
            {tab.label}
          </>
        );
        return tab.to ? (
          <Link key={tab.id} to={tab.to} className={cell(tab.active)} aria-current={tab.active ? 'page' : undefined}
            onClick={() => setSofiaOpen(false)}>
            {inner}
          </Link>
        ) : (
          <button key={tab.id} type="button" className={cell(tab.active)} aria-pressed={tab.active} onClick={() => setSofiaOpen(!sofiaOpen)}>
            {inner}
          </button>
        );
      })}
    </nav>
  );
};

export default MobileTabBar;
