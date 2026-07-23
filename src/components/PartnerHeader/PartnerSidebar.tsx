import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SalesHubLogo from '../SalesHubLogo';
import { useAppVersion } from '../../hooks/useAppVersion';
import { usePartnerAuth } from '../../context/PartnerAuthContext';

interface PartnerSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (arg: boolean) => void;
}

// Mirrors components/Sidebar/index.tsx's collapse/expand + mobile-drawer mechanics (same CSS
// classes, same localStorage idiom, same data-tour-menu marker so SofiaTour's generic
// "one step per top-level <li>" builder works here unchanged) — own localStorage keys so a
// partner session's rail state never collides with an internal session in the same browser.
// Deliberately its own component rather than reusing Sidebar/index.tsx directly: the nav items,
// permission model (partnerUser.role, not PERMISSION_CATALOG), and admin submenu are all
// different enough that sharing the component would mean threading partner-specific branches
// through code that's already dense with internal-app assumptions.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const PartnerSidebar = ({ sidebarOpen, setSidebarOpen }: PartnerSidebarProps) => {
  const { t } = useTranslation();
  const appVersion = useAppVersion();
  const { user } = usePartnerAuth();
  const isAdmin = user?.role === 'admin';
  const { pathname } = useLocation();
  const [logoOk, setLogoOk] = useState(true);

  const trigger = useRef<any>(null);
  const sidebar = useRef<any>(null);

  const storedCollapsed = localStorage.getItem('partner-sidebar-collapsed');
  const [collapsed, setCollapsed] = useState(storedCollapsed === null ? false : storedCollapsed === 'true');
  useEffect(() => { localStorage.setItem('partner-sidebar-collapsed', String(collapsed)); }, [collapsed]);

  // Admin Panel submenu (Team + Organization) — same expand/collapse idiom as the internal
  // Sidebar's Admin Panel (user request 2026-07-2x: group these under one menu, not two flat
  // items), auto-open when already on one of its pages.
  const [adminMenuOpen, setAdminMenuOpen] = useState(pathname === '/partner-portal/team' || pathname === '/partner-portal/organization');
  useEffect(() => { if (collapsed) setAdminMenuOpen(false); }, [collapsed]);

  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!sidebar.current || !trigger.current) return;
      if (!sidebarOpen || sidebar.current.contains(target) || trigger.current.contains(target)) return;
      setSidebarOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  });

  useEffect(() => {
    const keyHandler = ({ keyCode }: KeyboardEvent) => {
      if (!sidebarOpen || keyCode !== 27) return;
      setSidebarOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  });

  const navLinkCls = (active: boolean) =>
    `group relative flex w-full items-center rounded-sm py-2.5 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
      collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'
    } ${active ? 'bg-graydark dark:bg-meta-4' : ''}`;
  const labelCls = collapsed ? 'sr-only' : '';

  const RailTip = ({ label }: { label: string }) =>
    collapsed ? (
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 dark:bg-meta-4"
      >
        {label}
      </span>
    ) : null;

  return (
    <>
      <aside
        ref={sidebar}
        className={`absolute left-0 top-0 z-9999 flex h-screen flex-col bg-black duration-300 ease-linear dark:bg-boxdark lg:static lg:translate-x-0 ${
          collapsed ? 'w-20 overflow-visible' : 'w-72.5 overflow-y-hidden'
        } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className={`flex items-center gap-2 py-5.5 lg:py-6.5 ${collapsed ? 'flex-col justify-center px-2 gap-1.5' : 'justify-between px-6'}`}>
          <div className={`flex items-center ${collapsed ? 'flex-col gap-1.5' : 'gap-3'}`}>
            <NavLink to="/partner-portal" className="flex items-center" title={collapsed ? `Sales Hub v${appVersion}` : undefined}>
              {collapsed ? (
                <SalesHubLogo variant="glyph" className="h-9 w-9" textClassName="text-white" />
              ) : (
                <SalesHubLogo variant="lockup" size="sm" textClassName="text-white" />
              )}
            </NavLink>
            <span className={`${collapsed ? 'text-[10px]' : 'text-xs'} font-semibold leading-none text-white`}>v{appVersion}</span>
          </div>

          <button
            ref={trigger}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-controls="partner-sidebar"
            aria-expanded={sidebarOpen}
            className="block lg:hidden"
          >
            <svg className="fill-current" width="20" height="18" viewBox="0 0 20 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 8.175H2.98748L9.36248 1.6875C9.69998 1.35 9.69998 0.825 9.36248 0.4875C9.02498 0.15 8.49998 0.15 8.16248 0.4875L0.399976 8.3625C0.0624756 8.7 0.0624756 9.225 0.399976 9.5625L8.16248 17.4375C8.31248 17.5875 8.53748 17.7 8.76248 17.7C8.98748 17.7 9.17498 17.625 9.36248 17.475C9.69998 17.1375 9.69998 16.6125 9.36248 16.275L3.02498 9.8625H19C19.45 9.8625 19.825 9.4875 19.825 9.0375C19.825 8.55 19.45 8.175 19 8.175Z" fill="" />
            </svg>
          </button>
        </div>

        {/* Co-branded partner logo (SH-32) — set by a Partner Admin in Admin Panel >
            Organization; hidden entirely if none uploaded yet (onError below). Its own row
            with real padding/a light card, not squeezed inline next to the wordmark — most
            uploaded logos are dark-on-transparent or need a light backdrop to read at all,
            so the card can't just inherit the sidebar's near-black background (user feedback
            2026-07-2x: cramped white square looked slapped on). Skipped entirely when
            collapsed — the 80px rail has no room to show it meaningfully. */}
        {!collapsed && user && logoOk && (
          <div className="-mt-1 px-6 pb-5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-bodydark2">
              {t('partnerPortal.sidebar.partneredWith')}
            </p>
            <div className="flex items-center rounded-lg bg-white px-3 py-2 shadow-sm">
              <img
                src={`${API_URL}/api/partner-portal/organization/logo/${user.partnerId}`}
                alt={user.partnerName || ''}
                className="h-7 max-w-full object-contain"
                onError={() => setLogoOk(false)}
              />
            </div>
          </div>
        )}

        <div className={`no-scrollbar flex flex-col duration-300 ease-linear ${collapsed ? 'overflow-visible' : 'overflow-y-auto'}`}>
          <nav className={`mt-5 py-4 lg:mt-9 ${collapsed ? 'px-2' : 'px-4 lg:px-6'}`}>
            <div>
              {!collapsed && (
                <h3 className="mb-4 ml-4 text-sm font-semibold text-bodydark2">{t('partnerPortal.sidebar.menu')}</h3>
              )}

              <ul data-tour-menu className={`mb-6 flex flex-col ${collapsed ? 'gap-3' : 'gap-1.5'}`}>
                <li>
                  <NavLink to="/partner-portal" className={navLinkCls(pathname === '/partner-portal')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3v18h18" />
                      <rect x="7" y="11" width="3" height="6" />
                      <rect x="12" y="7" width="3" height="10" />
                      <rect x="17" y="13" width="3" height="4" />
                    </svg>
                    <span className={labelCls}>{t('partnerPortal.sidebar.opportunities')}</span>
                    <RailTip label={t('partnerPortal.sidebar.opportunities') as string} />
                  </NavLink>
                </li>

                {isAdmin && (
                  <li>
                    <button
                      data-tour-route="/partner-portal/team"
                      onClick={() => { if (collapsed) setCollapsed(false); setAdminMenuOpen(!adminMenuOpen); }}
                      className={`group relative flex w-full items-center rounded-sm py-2.5 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
                        collapsed ? 'justify-center px-2' : 'justify-between gap-2.5 px-4'
                      } ${pathname.startsWith('/partner-portal/team') || pathname.startsWith('/partner-portal/organization') ? 'bg-graydark dark:bg-meta-4' : ''}`}
                    >
                      <div className={`flex items-center ${collapsed ? '' : 'gap-2.5'}`}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.3-1.3L13.6 2h-3.2l-.4 2.5A7 7 0 0 0 7.7 5.8l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5.2 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.3 1.3l.4 2.5h3.2l.4-2.5a7 7 0 0 0 2.3-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z" />
                        </svg>
                        <span className={labelCls}>{t('partnerPortal.sidebar.adminPanel')}</span>
                      </div>
                      {!collapsed && (
                        <svg className={`fill-current transition-transform duration-200 ${adminMenuOpen ? 'rotate-180' : ''}`} width="12" height="8" viewBox="0 0 12 8">
                          <path d="M1.41 0L6 4.58 10.59 0 12 1.41l-6 6-6-6z" />
                        </svg>
                      )}
                      <RailTip label={t('partnerPortal.sidebar.adminPanel') as string} />
                    </button>
                    <ul
                      className={`mt-1 ml-7 flex flex-col gap-0.5 border-l border-bodydark2/30 pl-4 overflow-hidden transition-all duration-200 ${
                        adminMenuOpen && !collapsed ? 'max-h-[12rem] opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <li>
                        <NavLink to="/partner-portal/team"
                          className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                            pathname === '/partner-portal/team' ? 'text-white' : ''
                          }`}
                        >
                          {t('partnerPortal.sidebar.team')}
                        </NavLink>
                      </li>
                      <li>
                        <NavLink to="/partner-portal/organization"
                          className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                            pathname === '/partner-portal/organization' ? 'text-white' : ''
                          }`}
                        >
                          {t('partnerPortal.sidebar.organization')}
                        </NavLink>
                      </li>
                    </ul>
                  </li>
                )}

                <li>
                  <NavLink to="/partner-portal/profile" className={navLinkCls(pathname === '/partner-portal/profile')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009.09 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9.09a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
                    </svg>
                    <span className={labelCls}>{t('partnerPortal.sidebar.settings')}</span>
                    <RailTip label={t('partnerPortal.sidebar.settings') as string} />
                  </NavLink>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? (t('partnerPortal.sidebar.expand') as string) : (t('partnerPortal.sidebar.collapse') as string)}
        aria-label={collapsed ? (t('partnerPortal.sidebar.expand') as string) : (t('partnerPortal.sidebar.collapse') as string)}
        style={{ left: collapsed ? '66px' : '276px' }}
        className="hidden lg:flex fixed top-1/2 z-[99999] -translate-y-1/2 h-7 w-7 items-center justify-center rounded-full border border-stroke bg-white text-body shadow-md transition-all duration-300 hover:border-primary hover:bg-primary hover:text-white dark:border-strokedark dark:bg-boxdark dark:text-bodydark"
      >
        <svg className={`h-4 w-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    </>
  );
};

export default PartnerSidebar;
