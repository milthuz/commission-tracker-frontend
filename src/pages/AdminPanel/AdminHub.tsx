import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getToken } from '../../lib/auth';

// Le hub d'administration (audit UX, P2 — planche DeskAdmin). Avant : une page de 4 100 lignes
// et ~16 entrées de menu sans regroupement. Maintenant `/admin` ouvre huit ZONES (plus
// « Système » pour les admins), chacune listant ses écrans. Un lien n'apparaît que si la
// personne peut ouvrir l'écran — mêmes règles que `canAccessTab` dans AdminPanel/index.tsx et
// que le menu (config/navigation) ; une zone sans lien est cachée.

const API_URL = import.meta.env.VITE_API_URL || '';

interface HubLink { label: string; to: string; show: boolean; keywords?: string }
interface Zone { id: string; title: string; desc: string; links: HubLink[]; badge?: { text: string; tone: 'new' | 'wait' | 'err' } }

const BADGE_CLS = {
  new: 'bg-[rgba(245,131,69,0.14)] text-accent-ink dark:bg-[rgba(245,131,69,0.16)] dark:text-accent-ink-dark',
  wait: 'bg-[rgba(253,176,34,0.18)] text-[#B54708] dark:bg-[rgba(253,176,34,0.16)] dark:text-[#FDB022]',
  err: 'bg-[rgba(244,96,96,0.12)] text-[#D92D20] dark:bg-[rgba(244,96,96,0.16)] dark:text-[#F46060]',
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const AdminHub = ({ isAdmin, can, canAccessTab }: {
  isAdmin: boolean;
  can: (perm: string) => boolean;
  canAccessTab: (tab: string) => boolean;
}) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [health, setHealth] = useState<{ total: number; parts: string[] } | null>(null);
  const [pendingOpps, setPendingOpps] = useState(0);
  const auth = { Authorization: `Bearer ${getToken()}` };

  useEffect(() => {
    if (!isAdmin) return;
    fetch(`${API_URL}/api/admin/data-health`, { headers: auth })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const i = d.issues || {};
        const parts = [
          [i.unassignedInvoices?.count, 'unassignedInvoices'],
          [i.unassignedZentactMerchants, 'unassignedZentact'],
          [i.unassignedResellerActivations, 'unassignedResellers'],
          [i.repsNoRole?.count, 'repsNoRole'],
          [i.unmappedResellerEmails, 'unmappedEmails'],
          [i.userReports?.count, 'userReports'],
          [i.staleActiveMerchants?.count, 'staleMerchants'],
        ].filter(([n]) => Number(n) > 0).map(([n, k]) => t(`adminHub.health.${k}`, { count: Number(n) }) as string);
        setHealth({ total: d.totalIssues || 0, parts });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (!canAccessTab('partners')) return;
    fetch(`${API_URL}/api/admin/partner-opportunities/pending-count`, { headers: auth })
      .then((r) => (r.ok ? r.json() : null)).then((d) => setPendingOpps(d?.count || 0)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zones: Zone[] = useMemo(() => {
    const ct = (k: string) => t(`admin.commissionImport.tabs.${k}`) as string;
    return [
      {
        id: 'people', title: t('adminHub.zones.people.title'), desc: t('adminHub.zones.people.desc'),
        links: [
          { label: t('admin.usersSection.tabs.access'), to: '/admin/users', show: canAccessTab('users'), keywords: 'utilisateurs users accès' },
          { label: t('admin.roles.title'), to: '/admin/users?onglet=roles', show: canAccessTab('users'), keywords: 'rôles permissions' },
          { label: t('admin.usersSection.tabs.external'), to: '/admin/users?onglet=external', show: canAccessTab('users'), keywords: 'externes totp' },
          { label: t('admin.usersSection.tabs.impersonation'), to: '/admin/users?onglet=impersonation', show: canAccessTab('users'), keywords: 'emprunter voir en tant que' },
          { label: t('admin.sofia.tab'), to: '/admin/users?onglet=sofia', show: canAccessTab('users'), keywords: 'sofia ia assistant' },
          { label: t('sidebar.hrAdmin'), to: '/admin/hr', show: canAccessTab('hr'), keywords: 'rh embauche gabarit' },
        ],
      },
      {
        id: 'sales', title: t('adminHub.zones.sales.title'), desc: t('adminHub.zones.sales.desc'),
        links: [
          { label: t('adminHub.links.salespeople'), to: '/admin/salespeople', show: canAccessTab('salespeople'), keywords: 'représentants équipes quota paliers points source bonus' },
        ],
      },
      {
        id: 'pay', title: t('adminHub.zones.pay.title'), desc: t('adminHub.zones.pay.desc'),
        links: ['import', 'coverage', 'adjustments', 'payroll', 'bonus', 'reconciliation', 'deals', 'settings'].map((k) => ({
          label: ct(k), to: k === 'import' ? '/admin/import-payments' : `/admin/import-payments?onglet=${k}`, show: canAccessTab('import-payments'), keywords: 'commissions paie',
        })),
      },
      {
        id: 'partners', title: t('adminHub.zones.partners.title'), desc: t('adminHub.zones.partners.desc'),
        badge: pendingOpps > 0 ? { text: t('adminHub.pendingOpps', { count: pendingOpps }), tone: 'new' } : undefined,
        links: [
          { label: t('sidebar.partnersQueue'), to: '/admin/partners', show: canAccessTab('partners') },
          { label: t('sidebar.partnersManage'), to: '/admin/partners?view=manage', show: canAccessTab('partners') },
          { label: t('sidebar.partnersUsers'), to: '/admin/partners?view=users', show: canAccessTab('partners') },
          { label: t('sidebar.partnersPayouts'), to: '/admin/partners?view=payouts', show: canAccessTab('partners') },
          { label: t('sidebar.resellersAdmin'), to: '/admin/resellers', show: canAccessTab('resellers'), keywords: 'revendeurs' },
          { label: t('sidebar.passOps'), to: '/pass-referrals', show: can('pass:referrals'), keywords: 'la passe référence' },
        ],
      },
      {
        id: 'catalog', title: t('adminHub.zones.catalog.title'), desc: t('adminHub.zones.catalog.desc'),
        links: [
          { label: t('sidebar.hardwareAdmin'), to: '/admin/hardware', show: canAccessTab('hardware'), keywords: 'matériel hardware' },
          { label: t('sidebar.pricingAdmin'), to: '/admin/pricing', show: canAccessTab('pricing'), keywords: 'prix sku forfaits' },
          { label: t('sidebar.icplusRates'), to: '/admin/icplus-rates', show: canAccessTab('icplus-rates'), keywords: 'taux ic+ interchange' },
          { label: t('sidebar.resourcesAdmin'), to: '/admin/resources', show: canAccessTab('resources'), keywords: 'documents bibliothèque' },
        ],
      },
      {
        id: 'leads', title: t('adminHub.zones.leads.title'), desc: t('adminHub.zones.leads.desc'),
        links: [
          { label: t('admin.leads.tabs.rules'), to: '/admin/leads', show: canAccessTab('leads'), keywords: 'attribution règles' },
          { label: t('admin.leads.tabs.rotation'), to: '/admin/leads?onglet=rotation', show: canAccessTab('leads'), keywords: 'rotation tour de rôle' },
          { label: t('admin.leads.tabs.automation'), to: '/admin/leads?onglet=automation', show: canAccessTab('leads'), keywords: 'automatisations courriels' },
          { label: t('sidebar.openerMatch'), to: '/admin/opener', show: canAccessTab('opener'), keywords: 'opener emplacements google' },
          { label: ct('reviews'), to: '/admin/import-payments?onglet=reviews', show: canAccessTab('import-payments'), keywords: 'avis google prime' },
        ],
      },
      {
        id: 'customers', title: t('adminHub.zones.customers.title'), desc: t('adminHub.zones.customers.desc'),
        links: [
          { label: t('sidebar.merchantLinks'), to: '/admin/merchant-links', show: canAccessTab('merchant-links'), keywords: 'marchand abonnement saas' },
          { label: t('sidebar.customers'), to: '/admin/customers', show: canAccessTab('customers'), keywords: 'exclusions top clients' },
          { label: t('sidebar.saasGroup'), to: '/saas-increase', show: isAdmin || can('saas_increase:manage'), keywords: 'hausse prix campagne' },
        ],
      },
      {
        id: 'data', title: t('adminHub.zones.data.title'), desc: t('adminHub.zones.data.desc'),
        badge: health && health.total > 0 ? { text: t('adminHub.toFix', { count: health.total }), tone: 'err' } : undefined,
        links: [
          { label: t('sidebar.zohoSync'), to: '/admin/sync', show: canAccessTab('sync'), keywords: 'zoho zentact connexions synchro' },
          { label: t('sidebar.dataHealth'), to: '/admin/data-health', show: canAccessTab('data-health'), keywords: 'corriger anomalies' },
          { label: t('sidebar.audit'), to: '/admin/audit', show: canAccessTab('audit'), keywords: 'journal audit activité' },
          { label: t('sidebar.notifications'), to: '/admin/notifications', show: canAccessTab('notifications'), keywords: 'courriels gabarits' },
        ],
      },
    ];
  }, [t, can, canAccessTab, isAdmin, pendingOpps, health]);

  const words = norm(q).split(/\s+/).filter(Boolean);
  const matches = (z: Zone, l: HubLink) => !words.length || words.every((w) => norm(`${l.label} ${l.keywords || ''} ${z.title}`).includes(w));
  const visibleZones = zones
    .map((z) => ({ ...z, links: z.links.filter((l) => l.show && matches(z, l)) }))
    .filter((z) => z.links.length > 0);
  const systemLinks = isAdmin
    ? [
      { label: t('sidebar.releases'), to: '/admin/releases' },
      { label: t('adminHub.system.kaizen'), to: '/admin/sync' },
    ].filter((l) => !words.length || words.every((w) => norm(l.label).includes(w)))
    : [];

  return (
    <div className="flex max-w-[1240px] flex-col gap-[22px]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-2xl font-bold leading-tight tracking-[-0.01em] text-black dark:text-white">{t('sidebar.adminPanel')}</h1>
          <span className="text-[13px] text-body dark:text-bodydark2">{t('adminHub.subtitle')}</span>
        </div>
        <label className="flex h-10 w-full max-w-[360px] items-center gap-2 rounded-xl border border-stroke bg-white px-3 text-body focus-within:border-primary dark:border-strokedark dark:bg-boxdark dark:text-bodydark2">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span className="sr-only">{t('adminHub.search')}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('adminHub.searchPlaceholder') as string}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-black outline-none placeholder:opacity-75 dark:text-white" />
        </label>
      </header>

      {/* « À corriger » : les anomalies en une ligne, et une seule porte vers la file. */}
      {health && health.total > 0 && !words.length && (
        <section aria-labelledby="fix-h" className="flex flex-wrap items-center gap-4 rounded-2xl border border-[rgba(217,45,32,0.3)] bg-[rgba(244,96,96,0.08)] px-5 py-4 dark:border-[rgba(244,96,96,0.35)] dark:bg-[rgba(244,96,96,0.12)]">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
            <h2 id="fix-h" className="m-0 text-base font-bold text-[#D92D20] dark:text-[#F46060]">{t('adminHub.toFixTitle', { count: health.total })}</h2>
            <span className="text-sm text-[#424242] dark:text-bodydark">{health.parts.join(' · ')}</span>
          </div>
          <Link to="/admin/data-health" className="inline-flex h-10 items-center rounded-xl bg-[#D92D20] px-4 text-sm font-bold text-white hover:bg-[#B42318]">{t('adminHub.openQueue')}</Link>
        </section>
      )}

      {visibleZones.length === 0 && systemLinks.length === 0 && (
        <p className="m-0 rounded-2xl border border-stroke bg-white px-5 py-8 text-center text-sm text-body dark:border-strokedark dark:bg-boxdark dark:text-bodydark2">{t('adminHub.noMatch')}</p>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
        {visibleZones.map((z) => (
          <section key={z.id} aria-labelledby={`zone-${z.id}`} className="flex flex-col gap-3 rounded-2xl border border-stroke bg-white p-[18px] dark:border-strokedark dark:bg-boxdark">
            <div className="flex items-start justify-between gap-2">
              <h2 id={`zone-${z.id}`} className="m-0 text-base font-bold text-black dark:text-white">{z.title}</h2>
              {z.badge && <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE_CLS[z.badge.tone]}`}>{z.badge.text}</span>}
            </div>
            <p className="m-0 text-[13px] leading-[1.45] text-body dark:text-bodydark2">{z.desc}</p>
            <div className="flex flex-wrap gap-1.5">
              {z.links.map((l) => (
                <Link key={l.to} to={l.to} className="rounded-full bg-gray px-2.5 py-[5px] text-[13px] font-medium text-black hover:bg-[#E4E4E7] dark:bg-meta-4 dark:text-white dark:hover:bg-[#2A2A2A]">{l.label}</Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {systemLinks.length > 0 && (
        <section aria-labelledby="sys-h" className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-strokestrong p-[18px] dark:border-graydark">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 id="sys-h" className="m-0 text-base font-bold text-black dark:text-white">{t('adminHub.system.title')}</h2>
            <span className="rounded-full bg-gray px-2 py-0.5 text-[11px] font-bold text-[#424242] dark:bg-meta-4 dark:text-bodydark">{t('adminHub.system.adminsOnly')}</span>
          </div>
          <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('adminHub.system.desc')}</p>
          <div className="flex flex-wrap gap-1.5">
            {systemLinks.map((l) => (
              <Link key={l.to + l.label} to={l.to} className="rounded-full border border-stroke px-2.5 py-[5px] text-[13px] font-medium text-[#424242] hover:bg-gray dark:border-strokedark dark:text-bodydark dark:hover:bg-meta-4">{l.label}</Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default AdminHub;
