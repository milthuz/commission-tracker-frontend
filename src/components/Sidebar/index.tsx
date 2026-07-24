import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SalesHubLogo from '../SalesHubLogo';
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

  // "Needs attention" (À corriger) badge: poll the aggregate data-health count so the
  // rail shows a red counter when there's something to fix. Server-cached 60s; we refresh
  // every 2 min. Only fetched for users who can see the page.
  const canHealth = isAdmin || can('admin:data_health');
  const canAudit = isAdmin || can('admin:audit_dashboard') || can('admin:audit_logs');
  const [healthCount, setHealthCount] = useState<number>(0);
  useEffect(() => {
    if (!canHealth) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/data-health`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setHealthCount(d.totalIssues || 0);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 120000);
    return () => { cancelled = true; clearInterval(id); };
  }, [canHealth]);

  // Same "needs attention" idiom as the data-health badge above, for pending Partner Portal
  // opportunities — so a partner manager notices a new submission without opening the page.
  const canPartners = isAdmin || can('partners:manage');
  const [pendingOppsCount, setPendingOppsCount] = useState<number>(0);
  useEffect(() => {
    if (!canPartners) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/admin/partner-opportunities/pending-count`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setPendingOppsCount(d.count || 0);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 120000);
    return () => { cancelled = true; clearInterval(id); };
  }, [canPartners]);

  const [adminMenuOpen, setAdminMenuOpen] = useState(pathname.includes('admin'));
  // Opening the Admin section acknowledges its "new" features, so the aggregate orange dot
  // clears even without visiting each sub-page (and covers feature paths that match no route).
  useEffect(() => { if (adminMenuOpen) markSeenUnder('/admin'); }, [adminMenuOpen, markSeenUnder]);

  // Resources submenu — the Hardware & Service Guide lives under Resources, same expand/collapse
  // idiom as the Admin Panel submenu below.
  const [resourcesMenuOpen, setResourcesMenuOpen] = useState(
    pathname.includes('resources') || pathname === '/pricing-guide'
  );

  // Nested "Resources" group inside the Admin Panel submenu — groups the three editors
  // (storage, hardware, pricing) that used to sit as separate flat entries.
  const [adminResourcesOpen, setAdminResourcesOpen] = useState(
    pathname === '/admin/resources' || pathname === '/admin/hardware' || pathname === '/admin/pricing'
  );

  // Desktop collapse — independent from the mobile drawer (sidebarOpen).
  // When collapsed, only icons are visible; labels and section headers hide.
  // Default to collapsed (icons-only) when no preference is stored yet.
  const storedCollapsed = localStorage.getItem('sidebar-collapsed');
  const [collapsed, setCollapsed] = useState(storedCollapsed === null ? true : storedCollapsed === 'true');
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
    // Auto-close the admin/resources submenus when collapsing so they don't pop into the
    // narrow rail awkwardly.
    if (collapsed) { setAdminMenuOpen(false); setResourcesMenuOpen(false); setAdminResourcesOpen(false); }
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
    <>
    <aside
      ref={sidebar}
      className={`absolute left-0 top-0 z-9999 flex h-screen flex-col bg-black duration-300 ease-linear dark:bg-boxdark lg:static lg:translate-x-0 ${
        collapsed ? 'w-20 overflow-visible' : 'w-72.5 overflow-y-hidden'
      } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* <!-- SIDEBAR HEADER --> */}
      <div className={`flex items-center gap-2 py-5.5 lg:py-6.5 ${collapsed ? 'flex-col justify-center px-2 gap-1.5' : 'justify-between px-6'}`}>
        <div className={`flex items-center ${collapsed ? 'flex-col gap-1.5' : 'gap-3'}`}>
          <NavLink to="/" className="flex items-center" title={collapsed ? `Sales Hub v${appVersion}` : undefined}>
            {collapsed ? (
              <SalesHubLogo variant="glyph" className="h-9 w-9" textClassName="text-white" />
            ) : (
              <SalesHubLogo variant="lockup" size="sm" textClassName="text-white" />
            )}
          </NavLink>
          {collapsed ? (
            <NavLink to="/versions" className="flex items-center hover:opacity-80 transition" title={`v${appVersion}`}>
              <span className="text-[10px] font-semibold text-white leading-none">v{appVersion}</span>
            </NavLink>
          ) : (
            <NavLink to="/versions" className="flex items-center hover:opacity-80 transition" title={`v${appVersion}`}>
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M15 9.5c-.5-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.5 6 4.6 0 1.3-1.3 2.2-3 2.2-1.3 0-2.5-.5-3-1.5M12 6.5v11" />
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18" />
                    <rect x="7" y="11" width="3" height="6" />
                    <rect x="12" y="7" width="3" height="10" />
                    <rect x="17" y="13" width="3" height="4" />
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" />
                      <circle cx="7.5" cy="7.5" r="1.5" />
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12h4l3 8 4-16 3 8h4" />
                    </svg>
                    <span className={labelCls}>{t('sidebar.revenue')}</span>
                    <NewBadge path="/revenue" collapsed={collapsed} />
                    <RailTip label={t('sidebar.revenue') as string} />
                  </NavLink>
                </li>
              )}
              {/* <!-- Menu Item Partners (perm: partners:manage) — a flat top-level item, not
                   nested under Admin Panel (user request 2026-07-2x): Admin Panel itself is
                   gated on isAdmin, so a non-admin "Partner Manager" role holding only
                   partners:manage had no way to reach it at all. --> */}
              {(isAdmin || can('partners:manage')) && (
                <li>
                  <NavLink to="/admin/partners" className={navLinkCls(pathname === '/admin/partners')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="9" cy="8" r="3" />
                      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                      <circle cx="17" cy="8" r="2.5" />
                      <path d="M15.5 14.2c2.5.4 4.5 2.6 4.5 5.8" />
                    </svg>
                    <span className={labelCls}>{t('sidebar.partnersAdmin')}</span>
                    {pendingOppsCount > 0 && !collapsed && (
                      <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-xs font-semibold text-white">
                        {pendingOppsCount}
                      </span>
                    )}
                    {pendingOppsCount > 0 && collapsed && (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" aria-hidden />
                    )}
                    <NewBadge path="/admin/partners" collapsed={collapsed} />
                    <RailTip label={t('sidebar.partnersAdmin') as string} />
                  </NavLink>
                </li>
              )}
              {/* <!-- Menu Item Resources (perm: resources:view) — the Hardware & Service Guide
                   nests under it as a submenu, same idiom as the Admin Panel below. --> */}
              {(isAdmin || can('resources:view')) && (() => {
                const canSub = isAdmin || can('hardware:view') || can('pricing:view');
                const subActive = pathname === '/pricing-guide';
                const icon = (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                );
                return (
                  <li>
                    {collapsed ? (
                      // Collapsed rail: identical structure to every sibling icon — no wrapper,
                      // no chevron (the submenu can't show in icon-only mode anyway).
                      <NavLink to="/resources" className={navLinkCls(pathname.includes('resources') || subActive)}>
                        {icon}
                        <span className={labelCls}>{t('sidebar.resources')}</span>
                        <NewBadge path="/resources" collapsed={collapsed} />
                        <RailTip label={t('sidebar.resources') as string} />
                      </NavLink>
                    ) : (
                      <div
                        className={`${navLinkCls(pathname.includes('resources') || subActive)} pr-2`}
                        onClick={() => canSub && setResourcesMenuOpen((v) => !v)}
                      >
                        <NavLink to="/resources" className="flex flex-1 items-center gap-2.5 overflow-hidden">
                          {icon}
                          <span className={labelCls}>{t('sidebar.resources')}</span>
                          <NewBadge path="/resources" collapsed={collapsed} />
                        </NavLink>
                        {canSub && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setResourcesMenuOpen((v) => !v); }}
                            aria-label={resourcesMenuOpen ? (t('sidebar.collapse') as string) : (t('sidebar.expand') as string)}
                          >
                            <svg
                              className={`fill-current transition-transform duration-200 ${resourcesMenuOpen ? 'rotate-180' : ''}`}
                              width="12" height="8" viewBox="0 0 12 8"
                            >
                              <path d="M1.41 0L6 4.58 10.59 0 12 1.41l-6 6-6-6z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                    {!collapsed && canSub && (
                      <ul
                        className={`mt-1 ml-7 flex flex-col gap-0.5 border-l border-bodydark2/30 pl-4 overflow-hidden transition-all duration-200 ${
                          resourcesMenuOpen ? 'max-h-[6rem] opacity-100' : 'max-h-0 opacity-0'
                        }`}
                      >
                        {(isAdmin || can('hardware:view') || can('pricing:view')) && (
                          <li>
                            <NavLink
                              to="/pricing-guide"
                              className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                                pathname === '/pricing-guide' ? 'text-white' : ''
                              }`}
                            >
                              {t('sidebar.pricingGuide')}
                              <NewBadge path="/pricing-guide" />
                            </NavLink>
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                );
              })()}
              {/* <!-- Menu Item Kaizen DEMO (perm: demo:kaizen) — streamed POS demo --> */}
              {(isAdmin || can('demo:kaizen')) && (
                <li>
                  <NavLink
                    to="/kaizen-demo"
                    className={navLinkCls(pathname.includes('kaizen-demo'))}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="12" rx="2" />
                      <path d="M8 20h8M12 16v4" />
                    </svg>
                    <span className={labelCls}>{t('sidebar.kaizenDemo')}</span>
                    <NewBadge path="/kaizen-demo" collapsed={collapsed} />
                    <RailTip label={t('sidebar.kaizenDemo') as string} />
                  </NavLink>
                </li>
              )}
              {/* <!-- Menu Item Proposals (perm: proposals:send) — build & send client proposals --> */}
              {(isAdmin || can('proposals:send')) && (
                <li>
                  <NavLink
                    to="/proposals"
                    className={navLinkCls(pathname.includes('proposals'))}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                      <path d="M14 3v5h5" />
                    </svg>
                    <span className={labelCls}>{t('sidebar.proposals')}</span>
                    <NewBadge path="/proposals" collapsed={collapsed} />
                    <RailTip label={t('sidebar.proposals') as string} />
                  </NavLink>
                </li>
              )}
              {/* <!-- Menu Item Savings calculator (perm: savings:use) --> */}
              {(isAdmin || can('savings:use')) && (
                <li>
                  <NavLink
                    to="/savings"
                    className={navLinkCls(pathname.includes('savings'))}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="3" width="14" height="18" rx="2" />
                      <path d="M8 7h8M8 11h2M12 11h2M8 15h2M12 15h2" />
                    </svg>
                    <span className={labelCls}>{t('sidebar.savings')}</span>
                    <RailTip label={t('sidebar.savings') as string} />
                  </NavLink>
                </li>
              )}
              {/* <!-- Menu Item SaaS Increase (perm: saas_increase:manage) — moved out of the Admin
                   Panel submenu so the granular saas_increase:* permissions can be assigned to
                   non-admin users; AdminPanel/index.tsx gates its whole render on isAdmin, which
                   blocked this tool for anyone without the literal admin flag regardless of perms. --> */}
              {(isAdmin || can('saas_increase:manage')) && (
                <li>
                  <NavLink
                    to="/saas-increase"
                    className={navLinkCls(pathname.includes('saas-increase'))}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3v18h18" />
                      <path d="M7 14l4-5 3 3 5-7" />
                    </svg>
                    <span className={labelCls}>{t('sidebar.saasIncrease')}</span>
                    <NewBadge path="/saas-increase" collapsed={collapsed} />
                    <RailTip label={t('sidebar.saasIncrease') as string} />
                  </NavLink>
                </li>
              )}
              {/* <!-- Menu Item Admin Panel (Admin Only) --> */}
              {isAdmin && (
                <li>
                  <button
                    data-tour-route="/admin"
                    onClick={() => {
                      if (collapsed) setCollapsed(false);
                      setAdminMenuOpen(!adminMenuOpen);
                    }}
                    className={`group relative flex w-full items-center rounded-sm py-2.5 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
                      collapsed ? 'justify-center px-2' : 'justify-between gap-2.5 px-4'
                    } ${pathname.includes('admin') ? 'bg-graydark dark:bg-meta-4' : ''}`}
                  >
                    <div className={`flex items-center ${collapsed ? '' : 'gap-2.5'}`}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.3-1.3L13.6 2h-3.2l-.4 2.5A7 7 0 0 0 7.7 5.8l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5.2 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.3 1.3l.4 2.5h3.2l.4-2.5a7 7 0 0 0 2.3-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z" />
                      </svg>
                      <span className={labelCls}>{t('sidebar.adminPanel')}</span>
                      {anyDotUnder('/admin') && !collapsed && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                      )}
                      {healthCount > 0 && !collapsed && (
                        <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-xs font-semibold text-white">
                          {healthCount}
                        </span>
                      )}
                    </div>
                    {(anyDotUnder('/admin') || healthCount > 0) && collapsed && (
                      <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${healthCount > 0 ? 'bg-danger' : 'bg-primary'}`} aria-hidden />
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
                    {canHealth && (
                      <li>
                        <NavLink
                          to="/admin/data-health"
                          className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                            pathname === '/admin/data-health' ? 'text-white' : ''
                          }`}
                        >
                          {t('sidebar.dataHealth')}
                          {healthCount > 0 && (
                            <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-semibold text-white">
                              {healthCount}
                            </span>
                          )}
                        </NavLink>
                      </li>
                    )}
                    {canAudit && (
                      <li>
                        <NavLink
                          to="/admin/audit"
                          className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                            pathname === '/admin/audit' ? 'text-white' : ''
                          }`}
                        >
                          {t('sidebar.audit')}
                        </NavLink>
                      </li>
                    )}
                    <li>
                      <NavLink
                        to="/admin/savings-pricing"
                        className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                          pathname === '/admin/savings-pricing' ? 'text-white' : ''
                        }`}
                      >
                        {t('sidebar.savingsPricing')}
                        <NewBadge path="/admin/savings-pricing" />
                      </NavLink>
                    </li>
                    <li>
                      <NavLink
                        to="/admin/notifications"
                        className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                          pathname === '/admin/notifications' ? 'text-white' : ''
                        }`}
                      >
                        {t('sidebar.notifications')}<NewBadge path="/admin/notifications" />
                      </NavLink>
                    </li>
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
                    {/* <!-- Grouped "Resources" sub-menu: storage editor + Hardware + Pricing --> */}
                    <li>
                      <button
                        type="button"
                        onClick={() => setAdminResourcesOpen((v) => !v)}
                        className={`flex w-full items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                          pathname === '/admin/resources' || pathname === '/admin/hardware' || pathname === '/admin/pricing' ? 'text-white' : ''
                        }`}
                      >
                        <span className="flex-1 text-left">{t('sidebar.resourcesGroup')}</span>
                        <svg
                          className={`fill-current transition-transform duration-200 ${adminResourcesOpen ? 'rotate-180' : ''}`}
                          width="10" height="7" viewBox="0 0 12 8"
                        >
                          <path d="M1.41 0L6 4.58 10.59 0 12 1.41l-6 6-6-6z" />
                        </svg>
                      </button>
                      <ul
                        className={`mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-bodydark2/20 pl-3 overflow-hidden transition-all duration-200 ${
                          adminResourcesOpen ? 'max-h-[8rem] opacity-100' : 'max-h-0 opacity-0'
                        }`}
                      >
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
                            to="/admin/hardware"
                            className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                              pathname === '/admin/hardware' ? 'text-white' : ''
                            }`}
                          >
                            {t('sidebar.hardwareAdmin')}<NewBadge path="/admin/hardware" />
                          </NavLink>
                        </li>
                        <li>
                          <NavLink
                            to="/admin/pricing"
                            className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                              pathname === '/admin/pricing' ? 'text-white' : ''
                            }`}
                          >
                            {t('sidebar.pricingAdmin')}<NewBadge path="/admin/pricing" />
                          </NavLink>
                        </li>
                      </ul>
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
                    <li>
                      <NavLink
                        to="/admin/merchant-links"
                        className={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                          pathname === '/admin/merchant-links' ? 'text-white' : ''
                        }`}
                      >
                        {t('sidebar.merchantLinks')}<NewBadge path="/admin/merchant-links" />
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

    </aside>

    {/* Floating collapse/expand toggle pinned to the sidebar's right edge — always visible,
        independent of the menu length, on every screen size. Rendered as a SIBLING of <aside>
        so the aside's transform/overflow can never clip it. Desktop only (mobile uses the drawer). */}
    <button
      type="button"
      data-tour="sidebar-toggle"
      onClick={() => setCollapsed(!collapsed)}
      title={collapsed ? (t('sidebar.expand') as string) : (t('sidebar.collapse') as string)}
      aria-label={collapsed ? (t('sidebar.expand') as string) : (t('sidebar.collapse') as string)}
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

export default Sidebar;
