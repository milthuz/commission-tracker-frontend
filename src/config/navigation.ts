// THE list of Sales Hub screens (audit UX, P1). The sidebar, the ⌘K search and Sofia's guided
// tour all read it — adding a screen = one entry here, with its permission.
//
// Before, the menu was ~1 000 lines of hand-repeated JSX in the order features were added; now it
// follows the work, in five sections (canvas « Sales Hub — refonte UI », board DeskSidebar):
//   Vente · Rémunération · Opérations · Direction · Administration (pinned at the bottom)
// A section with nothing visible for the user's role is hidden; a group is shown when at least one
// of its children is.

import type { IconName } from '../components/Sidebar/NavIcon';

export interface NavCtx {
  isAdmin: boolean;
  can: (perm: string) => boolean;
}

export type NavBadge = 'leads' | 'partners' | 'health';

export interface NavItem {
  id: string;
  /** i18n key of the label. */
  label: string;
  icon?: IconName;
  /** Route; a group without `to` only expands. */
  to?: string;
  visible?: (c: NavCtx) => boolean;
  /** Custom "is active" (query-string routes); default = pathname match. */
  active?: (pathname: string, search: string) => boolean;
  badge?: NavBadge;
  children?: NavItem[];
  /** Extra words the ⌘K search matches (both languages). */
  keywords?: string;
}

export interface NavSection {
  id: string;
  /** i18n key; none = no heading (footer). */
  label?: string;
  items: NavItem[];
  footer?: boolean;
}

const any = (c: NavCtx, ...perms: string[]) => c.isAdmin || perms.some((p) => c.can(p));
const adminOnly = (c: NavCtx) => c.isAdmin;
const partnersView = (view: string | null) => (p: string, s: string) =>
  p === '/admin/partners' && (view ? new URLSearchParams(s).get('view') === view : !new URLSearchParams(s).get('view'));

export const NAV: NavSection[] = [
  {
    id: 'sales',
    label: 'sidebar.sections.sales',
    items: [
      { id: 'dashboard', label: 'sidebar.dashboard', icon: 'home', to: '/', active: (p) => p === '/' },
      { id: 'leads', label: 'sidebar.leads', icon: 'inbox', to: '/leads', badge: 'leads',
        visible: (c) => ['leads:view_own', 'leads:view_all', 'leads:review', 'leads:intake'].some(c.can), keywords: 'pistes leads prospects' },
      { id: 'proposals', label: 'sidebar.proposals', icon: 'fileText', to: '/proposals', visible: (c) => any(c, 'proposals:send'), keywords: 'soumission quote' },
      {
        id: 'salesTools', label: 'sidebar.salesTools', icon: 'wrench',
        children: [
          { id: 'rateCalculator', label: 'sidebar.rateCalculator', to: '/rate-calculator', visible: (c) => any(c, 'icplus:use'), keywords: 'ic+ taux relevé statement' },
          { id: 'revenueModeler', label: 'sidebar.revenueModeler', to: '/revenue-modeler', visible: (c) => any(c, 'revmodel:use'), keywords: 'p&l scénario chaîne' },
          { id: 'pricingGuide', label: 'sidebar.pricingGuide', to: '/pricing-guide', // Same rule as the old menu, where the guide sat under Ressources: resources:view AND one of the two.
          visible: (c) => any(c, 'resources:view') && any(c, 'hardware:view', 'pricing:view'), keywords: 'prix matériel price hardware' },
          { id: 'kaizenDemo', label: 'sidebar.kaizenDemo', to: '/kaizen-demo', visible: (c) => any(c, 'demo:kaizen'), keywords: 'appstream démo' },
        ],
      },
      { id: 'resources', label: 'sidebar.resources', icon: 'folder', to: '/resources', visible: (c) => any(c, 'resources:view'), keywords: 'documents guides fichiers' },
    ],
  },
  {
    id: 'pay',
    label: 'sidebar.sections.pay',
    items: [
      { id: 'commissionTracker', label: 'sidebar.commissionTracker', icon: 'target', to: '/commission-tracker',
        visible: (c) => any(c, 'tracker:view_own', 'tracker:view_all_totals', 'tracker:view_all_details'), keywords: 'points quota' },
      { id: 'commissionReport', label: 'sidebar.commissionReport', icon: 'chart', to: '/commission-report',
        visible: (c) => any(c, 'report:view_own', 'report:view_others'), keywords: 'paie talon pay stub' },
      { id: 'credits', label: 'sidebar.credits', icon: 'card', to: '/credits',
        visible: (c) => any(c, 'credits:send', 'credits:view_all', 'credits:approve', 'credits:report', 'credits:delete'), keywords: 'zentact processeur' },
    ],
  },
  {
    id: 'ops',
    label: 'sidebar.sections.ops',
    items: [
      {
        id: 'opener', label: 'sidebar.opener', icon: 'route',
        children: [
          { id: 'openerRoutes', label: 'sidebar.openerRoutes', to: '/opener-routes', visible: (c) => any(c, 'opener:routes'), keywords: 'campagne porte-à-porte' },
          { id: 'openerField', label: 'sidebar.openerField', to: '/opener', active: (p) => p === '/opener' || p.startsWith('/opener/'), visible: (c) => any(c, 'opener:field') },
          { id: 'openerMatch', label: 'sidebar.openerMatch', to: '/admin/opener', visible: (c) => any(c, 'opener:match') },
        ],
      },
      {
        id: 'saas', label: 'sidebar.saasGroup', icon: 'trend',
        children: [
          { id: 'saasIncrease', label: 'sidebar.saasIncrease', to: '/saas-increase', active: (p) => p === '/saas-increase', visible: (c) => any(c, 'saas_increase:manage'), keywords: 'hausse prix campagne' },
          { id: 'saasIncreaseLookup', label: 'sidebar.saasIncreaseLookup', to: '/saas-increase/lookup', visible: (c) => any(c, 'saas_increase:lookup'), keywords: 'hausse référence service client' },
        ],
      },
      { id: 'pass', label: 'sidebar.passOps', icon: 'gift', to: '/pass-referrals', visible: (c) => c.can('pass:referrals'), keywords: 'the pass référence parrainage' },
      {
        id: 'partners', label: 'sidebar.partnersGroup', icon: 'users', badge: 'partners',
        children: [
          { id: 'partnersQueue', label: 'sidebar.partnersQueue', to: '/admin/partners', active: partnersView(null), badge: 'partners', visible: (c) => any(c, 'partners:manage'), keywords: 'opportunités partenaires' },
          { id: 'partnersManage', label: 'sidebar.partnersManage', to: '/admin/partners?view=manage', active: partnersView('manage'), visible: (c) => any(c, 'partners:manage') },
          { id: 'partnersUsers', label: 'sidebar.partnersUsers', to: '/admin/partners?view=users', active: partnersView('users'), visible: (c) => any(c, 'partners:manage') },
          { id: 'partnersPayouts', label: 'sidebar.partnersPayouts', to: '/admin/partners?view=payouts', active: partnersView('payouts'), visible: (c) => any(c, 'partners:manage') },
          { id: 'reseller', label: 'sidebar.reseller', to: '/reseller', visible: (c) => c.can('reseller:view'), keywords: 'revendeur activations' },
        ],
      },
    ],
  },
  {
    id: 'direction',
    label: 'sidebar.sections.direction',
    items: [
      { id: 'revenue', label: 'sidebar.revenue', icon: 'dollar', to: '/revenue', visible: (c) => c.can('revenue:view'), keywords: 'zentact profit traitement' },
      { id: 'support', label: 'sidebar.support', icon: 'message', to: '/support', visible: (c) => any(c, 'support:view_reports'), keywords: 'desk billets tickets' },
      { id: 'hr', label: 'sidebar.hr', icon: 'userPlus', to: '/hr', visible: (c) => any(c, 'hr:view'), keywords: 'rh embauche contrat offre' },
    ],
  },
  {
    id: 'footer',
    footer: true,
    items: [
      {
        // Until the P2 admin hub (8 zones) exists, Administration opens its list of screens here.
        id: 'admin', label: 'sidebar.adminPanel', icon: 'shield', badge: 'health',
        children: [
          { id: 'dataHealth', label: 'sidebar.dataHealth', to: '/admin/data-health', badge: 'health', visible: adminOnly },
          { id: 'audit', label: 'sidebar.audit', to: '/admin/audit', visible: adminOnly, keywords: 'journal activité log' },
          { id: 'users', label: 'sidebar.users', to: '/admin/users', active: (p) => ['/admin/users', '/admin/admins', '/admin/roles'].includes(p), visible: adminOnly, keywords: 'rôles permissions accès' },
          { id: 'salespeople', label: 'sidebar.salespeople', to: '/admin/salespeople', visible: adminOnly, keywords: 'représentants quota équipes' },
          { id: 'importPayments', label: 'sidebar.importPayments', to: '/admin/import-payments', visible: adminOnly, keywords: 'paie payroll primes import' },
          { id: 'customers', label: 'sidebar.customers', to: '/admin/customers', visible: adminOnly, keywords: 'exclusions clients' },
          { id: 'merchantLinks', label: 'sidebar.merchantLinks', to: '/admin/merchant-links', visible: adminOnly },
          { id: 'leadsAdmin', label: 'sidebar.leadsAdmin', to: '/admin/leads', visible: (c) => c.can('leads:manage_rules'), keywords: 'attribution rotation règles' },
          { id: 'hrAdmin', label: 'sidebar.hrAdmin', to: '/admin/hr', visible: (c) => c.can('hr:manage') },
          { id: 'hardwareAdmin', label: 'sidebar.hardwareAdmin', to: '/admin/hardware', visible: (c) => any(c, 'hardware:manage') },
          { id: 'pricingAdmin', label: 'sidebar.pricingAdmin', to: '/admin/pricing', visible: (c) => any(c, 'pricing:manage'), keywords: 'sku forfaits' },
          { id: 'icplusRates', label: 'sidebar.icplusRates', to: '/admin/icplus-rates', visible: (c) => any(c, 'icplus:rates') },
          { id: 'resourcesAdmin', label: 'sidebar.resourcesAdmin', to: '/admin/resources', visible: adminOnly },
          { id: 'resellersAdmin', label: 'sidebar.resellersAdmin', to: '/admin/resellers', visible: adminOnly },
          { id: 'zohoSync', label: 'sidebar.zohoSync', to: '/admin/sync', visible: adminOnly, keywords: 'zoho synchro intégrations' },
          { id: 'notifications', label: 'sidebar.notifications', to: '/admin/notifications', visible: adminOnly, keywords: 'courriels gabarits' },
          { id: 'releases', label: 'sidebar.releases', to: '/admin/releases', visible: adminOnly, keywords: 'versions publier' },
        ],
      },
    ],
  },
];

export const isItemVisible = (item: NavItem, c: NavCtx): boolean =>
  item.children ? item.children.some((ch) => isItemVisible(ch, c)) : (item.visible ? item.visible(c) : true);

export const isItemActive = (item: NavItem, pathname: string, search: string): boolean => {
  if (item.children) return item.children.some((ch) => isItemActive(ch, pathname, search));
  if (item.active) return item.active(pathname, search);
  if (!item.to) return false;
  const path = item.to.split('?')[0];
  return pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));
};

/** Every reachable screen, flattened, with its section and parent labels (for ⌘K). */
export function flattenNav(c: NavCtx): { item: NavItem; trail: string[] }[] {
  const out: { item: NavItem; trail: string[] }[] = [];
  const walk = (items: NavItem[], trail: string[]) => items.forEach((it) => {
    if (!isItemVisible(it, c)) return;
    if (it.children) walk(it.children, [...trail, it.label]);
    else if (it.to) out.push({ item: it, trail });
  });
  NAV.forEach((s) => walk(s.items, s.label ? [s.label] : []));
  return out;
}
