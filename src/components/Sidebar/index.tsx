import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SalesHubLogo from '../SalesHubLogo';
import { useAppVersion } from '../../hooks/useAppVersion';
import NewBadge from '../NewBadge';
import { useNewFeatures } from '../../context/NewFeaturesContext';
import { useAuth } from '../../context/AuthContext';
import { NAV, NavItem, NavBadge, isItemActive, isItemVisible } from '../../config/navigation';
import NavIcon from './NavIcon';
import CommandPalette, { openCommandPalette, isMac } from './CommandPalette';
import { useNavBadges } from './useNavBadges';
import { useNavCtx } from './useNavCtx';

// Main navigation (audit UX, P1 — board DeskSidebar). Everything it shows comes from
// config/navigation: five sections, Administration pinned at the bottom with the user card.
//
// Sofia's guided tour reads THIS DOM: one step per `[data-tour-menu] > li` whose first child is
// an <a> or <button>; the label is the first <span>, the route is `href` or `data-tour-route`.
// Section headings are <li> without a link, so the tour skips them.

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (arg: boolean) => void;
}

const COLLAPSED_KEY = 'sh-nav-collapsed';

const Sidebar = ({ sidebarOpen, setSidebarOpen }: SidebarProps) => {
  const { t } = useTranslation();
  const appVersion = useAppVersion();
  const { anyDotUnder, markSeenUnder } = useNewFeatures();
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const sidebar = useRef<HTMLElement>(null);

  const ctx = useNavCtx();

  const badges = useNavBadges({
    leads: ctx.isAdmin || ctx.can('leads:review'),
    partners: ctx.isAdmin || ctx.can('partners:manage'),
    health: ctx.isAdmin,
  });

  // Expanded by default (the audit: a rail of bare icons is unusable on touch). The old
  // `sidebar-collapsed` key, forced to true at every login, is ignored on purpose.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === 'true'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem(COLLAPSED_KEY, String(collapsed)); } catch { /* ignore */ } }, [collapsed]);

  // Groups open on the page they contain.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const next: Record<string, boolean> = {};
    NAV.forEach((s) => s.items.forEach((it) => { if (it.children && isItemActive(it, pathname, search)) next[it.id] = true; }));
    setOpenGroups((g) => ({ ...g, ...next }));
  }, [pathname, search]);
  // Visiting the admin hub acknowledges its "new" features (aggregate dot clears).
  useEffect(() => { if (pathname === '/admin') markSeenUnder('/admin'); }, [pathname, markSeenUnder]);

  // Mobile drawer: close on outside click, Escape, and after navigating.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (sidebar.current?.contains(target) || target.closest('[aria-controls="sidebar"]')) return;
      setSidebarOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  }, [sidebarOpen, setSidebarOpen]);
  useEffect(() => { setSidebarOpen(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pathname, search]);

  const count = (b?: NavBadge) => (b ? badges[b] : 0);

  const BadgeCount = ({ b }: { b?: NavBadge }) => {
    const n = count(b);
    if (!n) return null;
    const cls = b === 'health'
      ? 'bg-[rgba(244,96,96,0.12)] text-[#D92D20] dark:bg-[rgba(244,96,96,0.16)] dark:text-[#F46060]'
      : 'bg-primary text-[#141414]';
    if (collapsed) return <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${b === 'health' ? 'bg-[#F46060]' : 'bg-primary'}`} aria-hidden />;
    return (
      <span className={`rounded-full px-[7px] py-px text-[11px] font-bold ${cls}`} title={b === 'leads' ? (t('sidebar.leadsPending', { count: n }) as string) : undefined}>
        {n}
      </span>
    );
  };

  const RailTip = ({ label }: { label: string }) => (collapsed ? (
    <span role="tooltip" className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg bg-[#141414] px-3 py-1.5 text-sm font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 dark:bg-white dark:text-[#141414]">
      {label}
    </span>
  ) : null);

  const rowCls = (active: boolean) => `group relative flex h-[38px] w-full items-center rounded-[10px] text-sm transition-colors ${
    collapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5'
  } ${active
    ? 'bg-[rgba(245,131,69,0.14)] font-bold text-accent-ink dark:bg-[rgba(245,131,69,0.16)] dark:text-accent-ink-dark'
    : 'font-medium text-[#424242] hover:bg-gray dark:text-bodydark dark:hover:bg-[#1B1B1B]'}`;

  const renderLeaf = (item: NavItem) => {
    const active = isItemActive(item, pathname, search);
    const label = t(item.label) as string;
    return (
      <NavLink to={item.to!} className={rowCls(active)} aria-current={active ? 'page' : undefined} end={item.to === '/'}>
        {item.icon && <NavIcon name={item.icon} />}
        <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{label}</span>
        <BadgeCount b={item.badge} />
        <NewBadge path={item.to!.split('?')[0]} collapsed={collapsed} />
        <RailTip label={label} />
      </NavLink>
    );
  };

  const renderGroup = (item: NavItem) => {
    const visibleChildren = item.children!.filter((c) => isItemVisible(c, ctx));
    const active = isItemActive(item, pathname, search);
    const open = !collapsed && !!openGroups[item.id];
    const label = t(item.label) as string;
    const hasDot = visibleChildren.some((c) => c.to && anyDotUnder(c.to.split('?')[0]));
    return (
      <>
        <button
          type="button"
          data-tour-route={item.id === 'admin' ? '/admin' : visibleChildren[0]?.to?.split('?')[0]}
          aria-expanded={open}
          onClick={() => {
            if (collapsed) { setCollapsed(false); setOpenGroups((g) => ({ ...g, [item.id]: true })); return; }
            setOpenGroups((g) => ({ ...g, [item.id]: !g[item.id] }));
          }}
          className={rowCls(active && !open)}
        >
          {item.icon && <NavIcon name={item.icon} />}
          <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate text-left'}>{label}</span>
          <BadgeCount b={item.badge} />
          {!open && hasDot && <span className={collapsed ? 'absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary' : 'h-1.5 w-1.5 rounded-full bg-primary'} aria-hidden />}
          {!collapsed && <NavIcon name="chevron" size={14} className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />}
          <RailTip label={label} />
        </button>
        {open && (
          <ul className="mt-0.5 flex flex-col gap-0.5 pl-[30px]">
            {visibleChildren.map((c) => <li key={c.id}>{renderLeaf(c)}</li>)}
          </ul>
        )}
      </>
    );
  };

  const initials = (user?.name || user?.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('');
  const shortcut = isMac() ? '⌘K' : 'Ctrl K';

  return (
    <>
      <aside
        ref={sidebar}
        id="sidebar"
        aria-label={t('sidebar.mainNav') as string}
        className={`absolute left-0 top-0 z-9999 flex h-screen flex-none flex-col border-r border-stroke bg-white duration-300 ease-linear dark:border-strokedark dark:bg-[#0F0F10] lg:static lg:translate-x-0 ${
          collapsed ? 'w-[72px] overflow-visible' : 'w-64'
        } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className={`flex items-center gap-2 pb-[18px] pt-5 ${collapsed ? 'flex-col px-2' : 'justify-between px-[22px]'}`}>
          <div className={`flex items-center ${collapsed ? 'flex-col gap-1.5' : 'gap-3'}`}>
            <NavLink to="/" className="flex items-center" title={collapsed ? `Sales Hub v${appVersion}` : undefined}>
              {collapsed
                ? <SalesHubLogo variant="glyph" className="h-8 w-8" textClassName="text-black dark:text-white" />
                : <SalesHubLogo variant="lockup" size="sm" textClassName="text-black dark:text-white" />}
            </NavLink>
            <NavLink to="/versions" className="text-[11px] font-semibold leading-none text-body hover:text-black dark:text-bodydark2 dark:hover:text-white" title={`v${appVersion}`}>
              v{appVersion}
            </NavLink>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} aria-label={t('common.close') as string} className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#424242] hover:bg-gray dark:text-bodydark dark:hover:bg-meta-4 lg:hidden">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className={collapsed ? 'px-2' : 'px-3.5'}>
          <button
            type="button"
            onClick={openCommandPalette}
            className={`group relative flex h-10 w-full items-center gap-2 rounded-xl border border-stroke bg-[#F7F7F8] text-left text-sm text-body hover:border-strokestrong dark:border-strokedark dark:bg-form-input dark:text-bodydark2 dark:hover:border-graydark ${collapsed ? 'justify-center px-2' : 'px-3'}`}
          >
            <NavIcon name="search" size={16} />
            <span className={collapsed ? 'sr-only' : 'flex-1 truncate'}>{t('sidebar.search')}</span>
            {!collapsed && <kbd className="rounded-md bg-gray px-1.5 py-0.5 font-satoshi text-[11px] font-bold text-body dark:bg-meta-4 dark:text-bodydark2">{shortcut}</kbd>}
            <RailTip label={`${t('sidebar.search')} (${shortcut})`} />
          </button>
        </div>

        <nav className={`no-scrollbar mt-[18px] flex min-h-0 flex-1 flex-col ${collapsed ? 'overflow-visible px-2' : 'overflow-y-auto px-3.5'}`}>
          <ul data-tour-menu className="flex min-h-full flex-col gap-0.5 pb-3">
            {NAV.map((section) => {
              const items = section.items.filter((it) => isItemVisible(it, ctx));
              if (!items.length) return null;
              return (
                <React.Fragment key={section.id}>
                  {section.label && !collapsed && (
                    <li role="presentation" className="px-2.5 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-[0.06em] text-body first:pt-0 dark:text-bodydark2">
                      {t(section.label)}
                    </li>
                  )}
                  {section.label && collapsed && <li role="presentation" className="mx-3 my-2 h-px bg-stroke first:hidden dark:bg-strokedark" />}
                  {items.map((it, i) => (
                    <li
                      key={it.id}
                      data-tour={it.id === 'dashboard' ? 'nav-dashboard' : it.id === 'commissionTracker' ? 'nav-tracker' : it.id === 'commissionReport' ? 'nav-report' : undefined}
                      className={section.footer && i === 0 ? 'mt-auto border-t border-stroke pt-3 dark:border-strokedark' : undefined}
                    >
                      {it.children && !it.to ? renderGroup(it) : renderLeaf(it)}
                    </li>
                  ))}
                </React.Fragment>
              );
            })}
            {/* User card — profile and preferences. Kept in the tour (link + first span = label). */}
            <li className={NAV.find((s) => s.footer)?.items.some((it) => isItemVisible(it, ctx)) ? 'pt-1' : 'mt-auto border-t border-stroke pt-3 dark:border-strokedark'}>
              <NavLink to="/profile" className={`group relative flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-gray dark:hover:bg-[#1B1B1B] ${collapsed ? 'justify-center' : ''} ${pathname.startsWith('/profile') ? 'bg-gray dark:bg-[#1B1B1B]' : ''}`}>
                <span className="sr-only">{t('sidebar.profile')}</span>
                {user?.photo
                  ? <img src={user.photo} alt="" className="h-[34px] w-[34px] flex-none rounded-full object-cover" />
                  : <span aria-hidden="true" className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[rgba(245,131,69,0.14)] text-[13px] font-bold text-accent-ink dark:bg-[rgba(245,131,69,0.16)] dark:text-accent-ink-dark">{initials}</span>}
                {!collapsed && (
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-medium text-black dark:text-white">{user?.name || user?.email}</span>
                    <span className="truncate text-xs text-body dark:text-bodydark2">{t('sidebar.profileSub')}</span>
                  </span>
                )}
                <RailTip label={t('sidebar.profile') as string} />
              </NavLink>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Collapse/expand toggle on the sidebar's edge — a SIBLING of <aside> so its transform and
          overflow can never clip it. Desktop only (mobile uses the drawer). */}
      <button
        type="button"
        data-tour="sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? (t('sidebar.expand') as string) : (t('sidebar.collapse') as string)}
        aria-label={collapsed ? (t('sidebar.expand') as string) : (t('sidebar.collapse') as string)}
        style={{ left: collapsed ? '58px' : '242px' }}
        className="fixed top-1/2 z-[99999] hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-stroke bg-white text-body shadow-md transition-all duration-300 hover:border-primary hover:bg-primary hover:text-[#141414] dark:border-strokedark dark:bg-boxdark dark:text-bodydark lg:flex"
      >
        <svg className={`h-4 w-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <CommandPalette ctx={ctx} />
    </>
  );
};

export default Sidebar;
