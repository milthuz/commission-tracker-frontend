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
      { id: 'golfCampaign', label: 'sidebar.golfCampaign', icon: 'phone', to: '/golf-campaign', visible: (c) => any(c, 'golfcampaign:use', 'golfcampaign:manage'), keywords: 'golf lightspeed gggolf appels clubs campagne' },
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
          { id: 'openerField', label: 'sidebar.openerField', to: '/opener', active: (p) => p === '/opener' || p.startsWith('/opener/'), visible: (c) => any(c, 'opener:field', 'opener:checkin') },
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
      { id: 'nda', label: 'sidebar.nda', icon: 'fileText', to: '/nda', visible: (c) => any(c, 'nda:send', 'nda:view_all', 'nda:countersign'), keywords: 'nda confidentialité non-divulgation entente signature' },
    ],
  },
  {
    // Module Finance (CFO) : budgets, prévisions, investissement, gestionnaires, KPI. Les chiffres et
    // les salaires viennent de l'API ; chaque écran a sa permission (en plus de finance:view).
    id: 'finance',
    label: 'sidebar.sections.finance',
    items: [
      { id: 'financeProgress', label: 'sidebar.financeProgress', icon: 'target', to: '/finance/progress',
        visible: (c) => any(c, 'finance:view') && any(c, 'finance:progress'), keywords: 'progression avancement budget liste de contrôle approbation responsables drivers à approuver' },
      {
        id: 'financeBudgets', label: 'sidebar.financeBudgets', icon: 'chart',
        children: [
          { id: 'financeMaster', label: 'sidebar.financeMaster', to: '/finance', active: (p) => p === '/finance',
            visible: (c) => any(c, 'finance:view'), keywords: 'budget maître p&l bénéfice ebitda baiia cfo' },
          { id: 'financeRevenue', label: 'sidebar.financeRevenue', to: '/finance/revenue-drivers',
            visible: (c) => any(c, 'finance:view'), keywords: 'drivers revenus rooftops arpu mrr adyen' },
          { id: 'financeCogs', label: 'sidebar.financeCogs', to: '/finance/cogs-drivers',
            visible: (c) => any(c, 'finance:view'), keywords: 'coût des ventes cogs marge' },
          { id: 'financePayroll', label: 'sidebar.financePayroll', to: '/finance/payroll',
            visible: (c) => any(c, 'finance:view') && any(c, 'finance:payroll'), keywords: 'salaires paie contractuels effectif payroll' },
          { id: 'financeOpex', label: 'sidebar.financeOpex', to: '/finance/opex',
            visible: (c) => any(c, 'finance:view'), keywords: 'dépenses exploitation opex voyages' },
          { id: 'financeCluster', label: 'sidebar.financeCluster', to: '/finance/cluster-budget',
            visible: (c) => any(c, 'finance:view') && any(c, 'finance:entity_budgets'), keywords: 'budget cluster entité p&l' },
          { id: 'financeXperio', label: 'sidebar.financeXperio', to: '/finance/xperio-budget',
            visible: (c) => any(c, 'finance:view') && any(c, 'finance:entity_budgets'), keywords: 'budget xperio entité p&l' },
          { id: 'financeDept', label: 'sidebar.financeDept', to: '/finance/departmental-budgets',
            visible: (c) => any(c, 'finance:view') && any(c, 'finance:dept_budgets'), keywords: 'budgets départementaux ventes r&d livraison comptabilité' },
        ],
      },
      { id: 'financeKpi', label: 'sidebar.financeKpi', icon: 'target', to: '/finance/kpi',
        visible: (c) => any(c, 'finance:view') && any(c, 'finance:kpi'), keywords: 'kpi mrr arpu rooftops churn budget réel bva mensuel investisseurs' },
      {
        id: 'financeForecasts', label: 'sidebar.financeForecasts', icon: 'trend',
        children: [
          { id: 'financeSalesForecast', label: 'sidebar.financeSalesForecast', to: '/finance/sales-forecast',
            visible: (c) => any(c, 'finance:view') && any(c, 'finance:forecasts'), keywords: 'prévision ventes bva mrr marchands installations' },
          { id: 'financePaymentsForecast', label: 'sidebar.financePaymentsForecast', to: '/finance/payments-forecast',
            visible: (c) => any(c, 'finance:view') && any(c, 'finance:forecasts'), keywords: 'prévision paiements résiduels marchands' },
          { id: 'financeCash', label: 'sidebar.financeCash', to: '/finance/holdco-cash',
            visible: (c) => any(c, 'finance:view') && any(c, 'finance:cash'), keywords: 'trésorerie holdco 13 semaines cash liquidités' },
        ],
      },
      {
        id: 'financeInvestment', label: 'sidebar.financeInvestment', icon: 'route',
        children: [
          { id: 'financeInvestV2', label: 'sidebar.financeInvestV2', to: '/finance/investment/v2',
            visible: (c) => any(c, 'finance:view') && any(c, 'finance:investment'), keywords: 'investissement ressources v2 initiatives' },
          { id: 'financeInvestPayments', label: 'sidebar.financeInvestPayments', to: '/finance/investment/payments',
            visible: (c) => any(c, 'finance:view') && any(c, 'finance:investment'), keywords: 'investissement ressources paiements conversion' },
        ],
      },
      { id: 'financeGuide', label: 'sidebar.financeGuide', icon: 'message', to: '/finance/guide',
        visible: (c) => any(c, 'finance:view') && any(c, 'finance:guide'), keywords: 'guide questions gestionnaires économies règle des 40 repères saas pos prompts' },
      {
        id: 'financeManagers', label: 'sidebar.financeManagers', icon: 'wrench',
        children: [
          { id: 'financeDeferred', label: 'sidebar.financeDeferred', to: '/finance/deferred-revenue',
            visible: (c) => any(c, 'finance:view') && any(c, 'finance:deferred'), keywords: 'revenus reportés écriture journal contrats' },
          { id: 'financeAmort', label: 'sidebar.financeAmort', to: '/finance/terminal-amortization',
            visible: (c) => any(c, 'finance:view') && any(c, 'finance:amortization'), keywords: 'amortissement terminaux lots valeur comptable nette' },
          { id: 'financeBooksAccounts', label: 'sidebar.financeBooksAccounts', to: '/finance/books-accounts',
            visible: (c) => any(c, 'finance:view') && any(c, 'finance:post_je'), keywords: 'zoho books comptes écritures journal correspondance' },
        ],
      },
    ],
  },
  {
    id: 'footer',
    footer: true,
    items: [
      {
        // ONE entry that opens the admin hub (/admin, 8 zones). Its screens stay listed below so
        // ⌘K finds them and visibility keeps following each screen's own permission.
        id: 'admin', label: 'sidebar.adminPanel', icon: 'shield', badge: 'health', to: '/admin',
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
  if (item.children) return (!!item.to && pathname === item.to) || item.children.some((ch) => isItemActive(ch, pathname, search));
  if (item.active) return item.active(pathname, search);
  if (!item.to) return false;
  const path = item.to.split('?')[0];
  return pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));
};

/**
 * Is this address a screen the user may open? (audit sécurité 2026-10-14 — « aucun usager ne voit un
 * écran auquel il n'a pas droit »). Routes only checked the session; typing an address opened the
 * page shell (tabs, buttons) even without the permission — the API refused the data, the screen
 * still showed. Same predicate as the menu: an address that belongs to a menu entry opens only if
 * that entry is visible. Addresses no entry claims (profile, /plus, sub-pages) are left to their page.
 */
export function canOpenPath(pathname: string, search: string, c: NavCtx): boolean {
  const leaves: NavItem[] = [];
  const walk = (items: NavItem[]) => items.forEach((it) => {
    if (it.children) { walk(it.children); if (it.to) leaves.push({ ...it, children: undefined, active: (p: string) => p === it.to }); } // the hub claims ITS address only, never its sub-screens
    else if (it.to) leaves.push(it);
  });
  NAV.forEach((s) => walk(s.items));
  const owners = leaves.filter((it) => isItemActive(it, pathname, search));
  if (!owners.length) return true;
  return owners.some((it) => {
    // A hub entry (Administration) is visible when any of its screens is.
    const full = NAV.flatMap((s) => s.items).find((x) => x.id === it.id);
    return isItemVisible(full || it, c);
  });
}

/** Every reachable screen, flattened, with its section and parent labels (for ⌘K). */
export function flattenNav(c: NavCtx): { item: NavItem; trail: string[] }[] {
  const out: { item: NavItem; trail: string[] }[] = [];
  const walk = (items: NavItem[], trail: string[]) => items.forEach((it) => {
    if (!isItemVisible(it, c)) return;
    if (it.children) {
      if (it.to) out.push({ item: it, trail }); // a hub (Administration) is a screen too
      walk(it.children, [...trail, it.label]);
    }
    else if (it.to) out.push({ item: it, trail });
  });
  NAV.forEach((s) => walk(s.items, s.label ? [s.label] : []));
  return out;
}
