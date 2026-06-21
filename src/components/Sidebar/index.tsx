import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ClusterLogo from '../../images/logo/cluster-on-dark.svg';
import ClusterMark from '../../images/logo/cluster-mark.svg';
import { useAppVersion } from '../../hooks/useAppVersion';
import NewBadge from '../NewBadge';
import { useNewFeatures } from '../../context/NewFeaturesContext';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (arg: boolean) => void;
}

const Sidebar = ({ sidebarOpen, setSidebarOpen }: SidebarProps) => {
  const { t } = useTranslation();
  const appVersion = useAppVersion();
  const { anyDotUnder, markSeenUnder } = useNewFeatures();
  const { user } = useAuth();
  // Permission check from the user's effective permissions ('*' = admin wildcard).
  const can = (p: string) => {
    const perms = user?.permissions || [];
    return perms.includes('*') || perms.includes(p) || perms.includes(`${p.split(':')[0]}:*`);
  };
  const location = useLocation();
  const { pathname } = location;

  const trigger = useRef<any>(null);
  const sidebar = useRef<any>(null);

  const storedSidebarExpanded = localStorage.getItem('sidebar-expanded');
  const [sidebarExpanded, _setSidebarExpanded] = useState(
    storedSidebarExpanded === null ? false : storedSidebarExpanded === 'true'
  );

  // Admin status from the EFFECTIVE identity (/api/auth/verify via AuthContext).
  // Not from the raw JWT — that stays admin while impersonating and would leak the
  // admin menu/tools during a "view as" session.
  const isAdmin = !!user?.isAdmin;
  const [adminMenuOpen, setAdminMenuOpen] = useState(pathname.includes('admin'));
  // Opening the Admin section acknowledges its "new" features, so the aggregate orange dot
  // clears even without visiting each sub-page (and covers feature paths that match no route).
  useEffect(() => { if (adminMenuOpen) markSeenUnder('/admin'); }, [adminMenuOpen, markSeenUnder]);

  // Desktop collapse — independent from the mobile drawer (sidebarOpen).
  // When collapsed, only icons are visible; labels and section headers hide.
  // Default to collapsed (icons-only) when no preference is stored yet.
  const storedCollapsed = localStorage.getItem('sidebar-collapsed');
  const [collapsed, setCollapsed] = useState(storedCollapsed === null ? true : storedCollapsed === 'true');
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
    // Auto-close the admin submenu when collapsing so it doesn't pop into the
    // narrow rail awkwardly.
    if (collapsed) setAdminMenuOpen(false);
  }, [collapsed]);

  // CSS helpers for collapsed mode — applied to every NavLink and the label spans.
  // Matches the Admin Panel button exactly so every rail item is consistent. Roominess comes
  // from the list gap (below), not an oversized highlight.
  const navLinkCls = (active: boolean) =>
    `group relative flex w-full items-center rounded-sm py-2.5 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
      collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'
    } ${active ? 'bg-graydark dark:bg-meta-4' : ''}`;
  const labelCls = collapsed ? 'sr-only' : '';

  // Wealthsimple-style floating label: when the rail is collapsed, hovering an item
  // slides a dark pill out to the right with the menu name. Pure CSS (group-hover);
  // rendered inside each item (which is `group relative`). Only shown when collapsed.
  const RailTip = ({ label }: { label: string }) =>
    collapsed ? (
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 dark:bg-meta-4"
      >
        {label}
      </span>
    ) : null;

  // close on click outside
  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!sidebar.current || !trigger.current) return;
      if (
        !sidebarOpen ||
        sidebar.current.contains(target) ||
        trigger.current.contains(target)
      )
        return;
      setSidebarOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  });

  // close if the esc key is pressed
  useEffect(() => {
    const keyHandler = ({ keyCode }: KeyboardEvent) => {
      if (!sidebarOpen || keyCode !== 27) return;
      setSidebarOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  });

  useEffect(() => {
    localStorage.setItem('sidebar-expanded', sidebarExpanded.toString());
    if (sidebarExpanded) {
      document.querySelector('body')?.classList.add('sidebar-expanded');
    } else {
      document.querySelector('body')?.classList.remove('sidebar-expanded');
    }
  }, [sidebarExpanded]);

  return (
    <aside
      ref={sidebar}
      className={`absolute left-0 top-0 z-9999 flex h-screen flex-col bg-black duration-300 ease-linear dark:bg-boxdark lg:static lg:translate-x-0 ${
        collapsed ? 'w-20 overflow-visible' : 'w-72.5 overflow-y-hidden'
      } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* <!-- SIDEBAR HEADER --> */}
      <div className={`flex items-center gap-2 py-5.5 lg:py-6.5 ${collapsed ? 'flex-col justify-center px-2 gap-1.5' : 'justify-between px-6'}`}>
        <div className={`flex items-center ${collapsed ? 'flex-col gap-1.5' : 'gap-3'}`}>
          <NavLink to="/" className="flex items-center" title={collapsed ? `Cluster v${appVersion}` : undefined}>
            <img
              src={collapsed ? ClusterMark : ClusterLogo}
              alt="Cluster"
              className={collapsed ? 'h-9 w-9' : 'h-8 w-auto'}
            />
          </NavLink>
          {collapsed ? (
            <NavLink to="/versions" className="flex flex-col items-center gap-0.5 hover:opacity-80 transition" title={`v${appVersion}`}>
              <span className="rounded-full bg-warning px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
                BETA
              </span>
              <span className="text-[10px] font-semibold text-white leading-none">v{appVersion}</span>
            </NavLink>
          ) : (
            <NavLink to="/versions" className="flex items-center gap-1.5 hover:opacity-80 transition" title={`v${appVersion}`}>
              <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-white leading-none">
                BETA
              </span>
              <span className="text-xs font-semibold text-white leading-none">v{appVersion}</span>
            </NavLink>
          )}
        </div>

        <button
          ref={trigger}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-controls="sidebar"
          aria-expanded={sidebarOpen}
          className="block lg:hidden"
        >
          <svg
            className="fill-current"
            width="20"
            height="18"
            viewBox="0 0 20 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M19 8.175H2.98748L9.36248 1.6875C9.69998 1.35 9.69998 0.825 9.36248 0.4875C9.02498 0.15 8.49998 0.15 8.16248 0.4875L0.399976 8.3625C0.0624756 8.7 0.0624756 9.225 0.399976 9.5625L8.16248 17.4375C8.31248 17.5875 8.53748 17.7 8.76248 17.7C8.98748 17.7 9.17498 17.625 9.36248 17.475C9.69998 17.1375 9.69998 16.6125 9.36248 16.275L3.02498 9.8625H19C19.45 9.8625 19.825 9.4875 19.825 9.0375C19.825 8.55 19.45 8.175 19 8.175Z"
              fill=""
            />
          </svg>
        </button>
      </div>
      {/* <!-- SIDEBAR HEADER --> */}

      <div className={`no-scrollbar flex flex-col duration-300 ease-linear ${collapsed ? 'overflow-visible' : 'overflow-y-auto'}`}>
        {/* <!-- Sidebar Menu --> */}
        <nav className={`mt-5 py-4 lg:mt-9 ${collapsed ? 'px-2' : 'px-4 lg:px-6'}`}>
          {/* <!-- Menu Group --> */}
          <div>
            {!collapsed && (
              <h3 className="mb-4 ml-4 text-sm font-semibold text-bodydark2">
                {t('sidebar.menu')}
              </h3>
            )}

            {/* data-tour-menu: the guided tour auto-builds one step per top-level <li> here,
                so any menu item added below automatically joins the tour (no tour edits needed). */}
            <ul data-tour-menu className={`mb-6 flex flex-col ${collapsed ? 'gap-3' : 'gap-1.5'}`}>
              {/* <!-- Menu Item Dashboard — "/" renders a role-appropriate dashboard for EVERYONE
                   (admin finance / manager team / rep personal), so always show the link. --> */}
              <li data-tour="nav-dashboard">
                <NavLink
                  to="/"
                  className={navLinkCls(pathname === '/')}
                >
                  <svg
                    className="fill-current"
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6.10322 0.956299H2.53135C1.5751 0.956299 0.787598 1.7438 0.787598 2.70005V6.27192C0.787598 7.22817 1.5751 8.01567 2.53135 8.01567H6.10322C7.05947 8.01567 7.84697 7.22817 7.84697 6.27192V2.72817C7.8751 1.7438 7.0876 0.956299 6.10322 0.956299ZM6.60947 6.30005C6.60947 6.5813 6.38447 6.8063 6.10322 6.8063H2.53135C2.2501 6.8063 2.0251 6.5813 2.0251 6.30005V2.72817C2.0251 2.44692 2.2501 2.22192 2.53135 2.22192H6.10322C6.38447 2.22192 6.60947 2.44692 6.60947 2.72817V6.30005Z"
                      fill=""
                    />
                    <path
                      d="M15.4689 0.956299H11.8971C10.9408 0.956299 10.1533 1.7438 10.1533 2.70005V6.27192C10.1533 7.22817 10.9408 8.01567 11.8971 8.01567H15.4689C16.4252 8.01567 17.2127 7.22817 17.2127 6.27192V2.72817C17.2127 1.7438 16.4252 0.956299 15.4689 0.956299ZM15.9752 6.30005C15.9752 6.5813 15.7502 6.8063 15.4689 6.8063H11.8971C11.6158 6.8063 11.3908 6.5813 11.3908 6.30005V2.72817C11.3908 2.44692 11.6158 2.22192 11.8971 2.22192H15.4689C15.7502 2.22192 15.9752 2.44692 15.9752 2.72817V6.30005Z"
                      fill=""
                    />
                    <path
                      d="M6.10322 9.92822H2.53135C1.5751 9.92822 0.787598 10.7157 0.787598 11.672V15.2438C0.787598 16.2001 1.5751 16.9876 2.53135 16.9876H6.10322C7.05947 16.9876 7.84697 16.2001 7.84697 15.2438V11.7001C7.8751 10.7157 7.0876 9.92822 6.10322 9.92822ZM6.60947 15.272C6.60947 15.5532 6.38447 15.7782 6.10322 15.7782H2.53135C2.2501 15.7782 2.0251 15.5532 2.0251 15.272V11.7001C2.0251 11.4188 2.2501 11.1938 2.53135 11.1938H6.10322C6.38447 11.1938 6.60947 11.4188 6.60947 11.7001V15.272Z"
                      fill=""
                    />
                    <path
                      d="M15.4689 9.92822H11.8971C10.9408 9.92822 10.1533 10.7157 10.1533 11.672V15.2438C10.1533 16.2001 10.9408 16.9876 11.8971 16.9876H15.4689C16.4252 16.9876 17.2127 16.2001 17.2127 15.2438V11.7001C17.2127 10.7157 16.4252 9.92822 15.4689 9.92822ZM15.9752 15.272C15.9752 15.5532 15.7502 15.7782 15.4689 15.7782H11.8971C11.6158 15.7782 11.3908 15.5532 11.3908 15.272V11.7001C11.3908 11.4188 11.6158 11.1938 11.8971 11.1938H15.4689C15.7502 11.1938 15.9752 11.4188 15.9752 11.7001V15.272Z"
                      fill=""
                    />
                  </svg>
                  <span className={labelCls}>{t('sidebar.dashboard')}</span>
                  <NewBadge path="/" collapsed={collapsed} />
                  <RailTip label={t('sidebar.dashboard') as string} />
                </NavLink>
              </li>
              {/* <!-- Menu Item Dashboard --> */}

              {/* <!-- Menu Item Commission Tracker (perm: tracker:view_*) --> */}
              {(isAdmin || can('tracker:view_own') || can('tracker:view_all_totals') || can('tracker:view_all_details')) && (
              <li data-tour="nav-tracker">
                <NavLink
                  to="/commission-tracker"
                  className={navLinkCls(pathname.includes('commission-tracker'))}
                >
                  <svg
                    className="fill-current"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.94s4.18 1.36 4.18 3.85c0 1.89-1.44 2.98-3.12 3.19z"
                      fill=""
                    />
                  </svg>
                  <span className={labelCls}>{t('sidebar.commissionTracker')}</span>
                  <NewBadge path="/commission-tracker" collapsed={collapsed} />
                  <RailTip label={t('sidebar.commissionTracker') as string} />
                </NavLink>
              </li>
              )}
              {/* <!-- Menu Item Commission Tracker --> */}

              {/* <!-- Menu Item Commission Report (perm: report:view_*) --> */}
              {(isAdmin || can('report:view_own') || can('report:view_others')) && (
              <li data-tour="nav-report">
                <NavLink
                  to="/commission-report"
                  className={navLinkCls(pathname.includes('commission-report'))}
                >
                  <svg
                    className="fill-current"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z" />
                  </svg>
                  <span className={labelCls}>{t('sidebar.commissionReport')}</span>
                  <NewBadge path="/commission-report" collapsed={collapsed} />
                  <RailTip label={t('sidebar.commissionReport') as string} />
                </NavLink>
              </li>
              )}
              {/* <!-- Menu Item Commission Report --> */}

              {/* <!-- Menu Item Reseller (perm: reseller:view) --> */}
              {can('reseller:view') && (
                <li>
                  <NavLink
                    to="/reseller"
                    className={navLinkCls(pathname.includes('reseller'))}
                  >
                    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z" />
                    </svg>
                    <span className={labelCls}>{t('sidebar.reseller')}</span>
                    <NewBadge path="/reseller" collapsed={collapsed} />
                    <RailTip label={t('sidebar.reseller') as string} />
                  </NavLink>
                </li>
              )}
              {/* <!-- Menu Item Revenue (perm: revenue:view) --> */}
              {can('revenue:view') && (
                <li>
                  <NavLink
                    to="/revenue"
                    className={navLinkCls(pathname.includes('revenue'))}
                  >
                    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M3 13h2v7H3v-7zm4-6h2v13H7V7zm4 3h2v10h-2V10zm4-7h2v17h-2V3zm4 9h2v8h-2v-8z" />
                    </svg>
                    <span className={labelCls}>{t('sidebar.revenue')}</span>
                    <NewBadge path="/revenue" collapsed={collapsed} />
                    <RailTip label={t('sidebar.revenue') as string} />
                  </NavLink>
                </li>
              )}
              {/* <!-- Menu Item Resources (perm: resources:view) --> */}
              {(isAdmin || can('resources:view')) && (
                <li>
                  <NavLink
                    to="/resources"
                    className={navLinkCls(pathname.includes('resources'))}
                  >
                    <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                    </svg>
                    <span className={labelCls}>{t('sidebar.resources')}</span>
                    <NewBadge path="/resources" collapsed={collapsed} />
                    <RailTip label={t('sidebar.resources') as string} />
                  </NavLink>
                </li>
              )}
              {/* <!-- Menu Item Admin Panel (Admin Only) --> */}
              {isAdmin && (
                <li>
                  <button
                    onClick={() => {
                      if (collapsed) setCollapsed(false);
                      setAdminMenuOpen(!adminMenuOpen);
                    }}
                    className={`group relative flex w-full items-center rounded-sm py-2.5 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
                      collapsed ? 'justify-center px-2' : 'justify-between gap-2.5 px-4'
                    } ${pathname.includes('admin') ? 'bg-graydark dark:bg-meta-4' : ''}`}
                  >
                    <div className={`flex items-center ${collapsed ? '' : 'gap-2.5'}`}>
                      <svg
                        className="fill-current"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.61 3.61 0 0112 15.6z" />
                      </svg>
                      <span className={labelCls}>{t('sidebar.adminPanel')}</span>
                      {anyDotUnder('/admin') && !collapsed && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                      )}
                    </div>
                    {anyDotUnder('/admin') && collapsed && (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
                    )}
                    {!collapsed && (
                      <svg
                        className={`fill-current transition-transform duration-200 ${adminMenuOpen ? 'rotate-180' : ''}`}
                        width="12"
                        height="8"
                        viewBox="0 0 12 8"
                      >
                        <path d="M1.41 0L6 4.58 10.59 0 12 1.41l-6 6-6-6z" />
                      </svg>
                    )}
                    <RailTip label={t('sidebar.adminPanel') as string} />
                  </button>
                  <ul
                    className={`mt-1 ml-7 flex flex-col gap-0.5 border-l border-bodydark2/30 pl-4 overflow-hidden transition-all duration-200 ${
                      adminMenuOpen && !collapsed ? 'max-h-[32rem] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <li>
                      <NavLink
                        to="/admin/sync"
                        className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                          pathname === '/admin/sync' || pathname === '/admin' ? 'text-white' : ''
                        }`}
                      >
                        {t('sidebar.zohoSync')}
                        <NewBadge path="/admin/sync" />
                      </NavLink>
                    </li>
                    <li>
                      <NavLink
                        to="/admin/salespeople"
                        className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                          pathname === '/admin/salespeople' ? 'text-white' : ''
                        }`}
                      >
                        {t('sidebar.salespeople')}<NewBadge path="/admin/salespeople" />
                      </NavLink>
                    </li>
                    <li>
                      <NavLink
                        to="/admin/customers"
                        className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                          pathname === '/admin/customers' ? 'text-white' : ''
                        }`}
                      >
                        {t('sidebar.customers')}<NewBadge path="/admin/customers" />
                      </NavLink>
                    </li>
                    <li>
                      <NavLink
                        to="/admin/releases"
                        className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                          pathname === '/admin/releases' ? 'text-white' : ''
                        }`}
                      >
                        {t('sidebar.releases')}<NewBadge path="/admin/releases" />
                      </NavLink>
                    </li>
                    <li>
                      <NavLink
                        to="/admin/resources"
                        className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                          pathname === '/admin/resources' ? 'text-white' : ''
                        }`}
                      >
                        {t('sidebar.resourcesAdmin')}<NewBadge path="/admin/resources" />
                      </NavLink>
                    </li>
                    <li>
                      <NavLink
                        to="/admin/users"
                        className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                          pathname === '/admin/users' || pathname === '/admin/admins' || pathname === '/admin/roles' ? 'text-white' : ''
                        }`}
                      >
                        {t('sidebar.users')}<NewBadge path="/admin/users" />
                      </NavLink>
                    </li>
                    <li>
                      <NavLink
                        to="/admin/import-payments"
                        className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                          pathname === '/admin/import-payments' ? 'text-white' : ''
                        }`}
                      >
                        {t('sidebar.importPayments')}<NewBadge path="/admin/import-payments" />
                      </NavLink>
                    </li>
                    <li>
                      <NavLink
                        to="/admin/resellers"
                        className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                          pathname === '/admin/resellers' ? 'text-white' : ''
                        }`}
                      >
                        {t('sidebar.resellersAdmin')}<NewBadge path="/admin/resellers" />
                      </NavLink>
                    </li>
                  </ul>
                </li>
              )}
              {/* <!-- Menu Item Admin Panel --> */}

              {/* <!-- Menu Item Profile --> */}
              <li>
                <NavLink
                  to="/profile"
                  className={navLinkCls(pathname.includes('profile'))}
                >
                  <svg
                    className="fill-current"
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M9.0002 7.79065C11.0814 7.79065 12.7689 6.1594 12.7689 4.1344C12.7689 2.1094 11.0814 0.478149 9.0002 0.478149C6.91895 0.478149 5.23145 2.1094 5.23145 4.1344C5.23145 6.1594 6.91895 7.79065 9.0002 7.79065ZM9.0002 1.7719C10.3783 1.7719 11.5033 2.84065 11.5033 4.16252C11.5033 5.4844 10.3783 6.55315 9.0002 6.55315C7.62207 6.55315 6.49707 5.4844 6.49707 4.16252C6.49707 2.84065 7.62207 1.7719 9.0002 1.7719Z"
                      fill=""
                    />
                    <path
                      d="M10.8283 9.05627H7.17207C4.16269 9.05627 1.71582 11.5313 1.71582 14.5406V16.875C1.71582 17.2125 1.99707 17.5219 2.3627 17.5219C2.72832 17.5219 3.00957 17.2407 3.00957 16.875V14.5406C3.00957 12.2344 4.89394 10.3219 7.22832 10.3219H10.8564C13.1627 10.3219 15.0752 12.2063 15.0752 14.5406V16.875C15.0752 17.2125 15.3564 17.5219 15.7221 17.5219C16.0877 17.5219 16.3689 17.2407 16.3689 16.875V14.5406C16.2846 11.5313 13.8377 9.05627 10.8283 9.05627Z"
                      fill=""
                    />
                  </svg>
                  <span className={labelCls}>{t('sidebar.profile')}</span>
                  <RailTip label={t('sidebar.profile') as string} />
                </NavLink>
              </li>
              {/* <!-- Menu Item Profile --> */}
            </ul>
          </div>
        </nav>
        {/* <!-- Sidebar Menu --> */}
      </div>

      {/* <!-- Desktop collapse toggle (Zoho-style, bottom-right) — hidden on mobile --> */}
      <button
        type="button"
        data-tour="sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? (t('sidebar.expand') as string) : (t('sidebar.collapse') as string)}
        aria-label={collapsed ? (t('sidebar.expand') as string) : (t('sidebar.collapse') as string)}
        className={`hidden lg:flex mt-auto mb-3 mx-3 items-center justify-center h-9 w-9 rounded-md border border-bodydark2/30 bg-black/30 text-bodydark2 hover:bg-graydark hover:text-white transition-all self-end ${
          collapsed ? 'self-center' : ''
        }`}
      >
        <svg
          className={`h-4 w-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    </aside>
  );
};

export default Sidebar;
