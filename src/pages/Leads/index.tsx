import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import Select from '../../components/Select';
import IntakeForm from './IntakeForm';
import ImportLeads from './ImportLeads';
import StatsFilters, { type StatsQuery } from './StatsFilters';
import LeadsChart, { type ChartPoint, SOURCE_ORDER, sourceColor, useIsDark } from './LeadsChart';
import LeadDetail from './LeadDetail';
import { authHeaders, leadFullName, statusFamily, LEAD_SOURCES, type Lead, type LeadRep } from './types';
import { notifyLeadsChanged } from '../../lib/badgeEvents';
import { Button, DataTable, FilterBar, StatusPill, Tabs, useUrlTab, type Column } from '../../components/ui';

const API_URL = import.meta.env.VITE_API_URL;

// La couche d'accueil des pistes, côté écran. Le parti pris de navigation : les ONGLETS SONT le
// filtre de statut. Une pastille « À examiner » plus un menu déroulant « statut » se
// contrediraient à la première combinaison, et rien n'indiquerait laquelle gagne.

type Tab = 'queue' | 'accepted' | 'closed' | 'support' | 'all' | 'stats';
const TAB_STATUSES: Record<Exclude<Tab, 'stats' | 'all'>, string[]> = {
  queue: ['new', 'in_review'],
  accepted: ['accepted'],
  closed: ['rejected', 'duplicate'],
  support: ['support_ticket'],
};

interface Stats {
  byStatus: Record<string, number>;
  bySource: { source: string; n: number; accepted: number }[];
  byMonth: { month: string; n: number; accepted: number; rejected: number }[];
  byRep: { rep: string; n: number; partner?: number; converted: number; won: number; sources?: Record<string, number> }[];
  funnel: { received: number; accepted: number; converted: number; won: number };
  queue: { waiting: number; over_4h: number; over_24h: number; oldest: string | null };
  speed: { avg_hours: number | null; median_hours: number | null };
  chart?: { week: ChartPoint[]; month: ChartPoint[] };
}

const Leads = () => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');
  const location = useLocation();

  // Onglet actif dans l'adresse (?onglet=) : un lien vers « Pistes › Acceptées » se partage.
  const [tab, setTab] = useUrlTab<Tab>('queue', ['queue', 'accepted', 'closed', 'support', 'all', 'stats']);
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [can, setCan] = useState({ review: false, intake: false, viewAll: false, rules: false, import: false, export: false });
  const [reps, setReps] = useState<LeadRep[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsQuery, setStatsQuery] = useState<StatsQuery | null>(null);
  const [chartHidden, setChartHidden] = useState<Set<string>>(new Set());
  const dark = useIsDark();
  // Les sources présentes chez au moins un représentant, dans l'ordre fixe du graphique.
  const repSources = useMemo(() => {
    const seen = new Set((stats?.byRep || []).flatMap((r) => Object.keys(r.sources || {})));
    return [...SOURCE_ORDER.filter((k) => seen.has(k)), ...[...seen].filter((k) => !SOURCE_ORDER.includes(k))];
  }, [stats]);

  const [source, setSource] = useState('');
  const [rep, setRep] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // « /leads?nouvelle=1 » (bouton « Nouvelle piste » du tableau de bord) ouvre la saisie,
  // une fois la permission connue — jamais pour qui n'a pas leads:intake.
  const wantsNew = new URLSearchParams(location.search).get('nouvelle') === '1';
  useEffect(() => { if (wantsNew && can.intake) setIntakeOpen(true); }, [wantsNew, can.intake]);

  const dt = (iso?: string | null, withTime = true) =>
    iso ? new Date(iso).toLocaleString(fr ? 'fr-CA' : 'en-CA', {
      day: 'numeric', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' }),
    }) : '—';

  const load = async () => {
    const params = new URLSearchParams();
    if (source) params.set('source', source);
    if (rep) params.set('rep', rep);
    if (q) params.set('q', q);
    try {
      const res = await fetch(`${API_URL}/api/leads?${params}`, { headers: authHeaders() });
      if (!res.ok) { setRows([]); return; }
      const data = await res.json();
      setRows(data.leads || []);
      setCounts(data.counts || {});
      setCan(data.can || { review: false, intake: false, viewAll: false, rules: false, import: false, export: false });
    } catch { setRows([]); }
  };

  useEffect(() => {
    // Recherche débattue : le filtrage se fait côté serveur, taper « Café » ne doit pas
    // déclencher quatre requêtes.
    const id = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(id);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [source, rep, q]);

  useEffect(() => {
    fetch(`${API_URL}/api/leads/meta/reps`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { reps: [] }))
      .then((d) => setReps(d.reps || []))
      .catch(() => {});
  }, []);

  // Le rapport n'est demandé que par ceux qui y ont droit : un représentant qui ne voit que ses
  // propres pistes recevrait un 403, et un 403 dans la console ressemble à une panne.
  useEffect(() => {
    if (tab !== 'stats' || (!can.viewAll && !can.review) || !statsQuery) return;
    const qs = new URLSearchParams({ from: statsQuery.from, to: statsQuery.to });
    if (statsQuery.source) qs.set('source', statsQuery.source);
    // Une réponse plus ancienne qui arrive en retard ne doit pas écraser la période choisie ensuite.
    let stale = false;
    setStats(null);
    fetch(`${API_URL}/api/leads/stats?${qs}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!stale) setStats(d); })
      .catch(() => {});
    return () => { stale = true; };
  }, [tab, can.viewAll, can.review, statsQuery]);

  // Lien profond « ?ref=L-00042 » : le courriel envoyé au représentant pointe ici quand la piste
  // n'a pas encore d'identifiant Zoho.
  useEffect(() => {
    const ref = new URLSearchParams(location.search).get('ref');
    if (!ref || !rows?.length) return;
    const hit = rows.find((l) => l.refCode === ref);
    if (hit) setOpenId(hit.id);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [rows]);

  const visible = useMemo(() => {
    if (!rows) return null;
    if (tab === 'all' || tab === 'stats') return rows;
    return rows.filter((l) => TAB_STATUSES[tab].includes(l.status));
  }, [rows, tab]);

  const tabCount = (k: Tab) => {
    if (k === 'all') return Object.values(counts).reduce((a, b) => a + b, 0);
    if (k === 'stats') return null;
    return TAB_STATUSES[k].reduce((a, s) => a + (counts[s] || 0), 0);
  };

  const TABS: Tab[] = can.viewAll || can.review
    ? ['queue', 'accepted', 'closed', 'support', 'all', 'stats']
    : ['queue', 'accepted', 'closed', 'all'];

  const kpis = stats ? [
    { label: t('leads.kpi.waiting'), value: String(stats.queue.waiting), tone: stats.queue.waiting ? 'text-warning' : '' },
    { label: t('leads.kpi.over24h'), value: String(stats.queue.over_24h), tone: stats.queue.over_24h ? 'text-danger' : '' },
    { label: t('leads.kpi.medianReview'), value: stats.speed.median_hours != null ? t('leads.kpi.hours', { n: stats.speed.median_hours }) as string : '—', tone: '' },
    { label: t('leads.kpi.won'), value: `${stats.funnel.won} / ${stats.funnel.received}`, tone: '' },
  ] : [];

  const leadColumns: Column<Lead>[] = [
    {
      key: 'business', header: t('leads.columns.business'), sortValue: (l) => l.businessName,
      render: (l) => {
        const waitingH = Math.round((Date.now() - new Date(l.createdAt).getTime()) / 3600000);
        const pendingReview = l.status === 'new' || l.status === 'in_review';
        const stale = pendingReview && waitingH >= 24;
        const existing = (!!l.existingCustomer?.matches?.length || l.formSaysExisting) && pendingReview;
        return (
          <div className="min-w-[180px]">
            <p className="m-0 font-bold">{l.businessName}</p>
            <p className="m-0 mt-0.5 text-xs text-body dark:text-bodydark2">
              {l.refCode}{[l.city, l.province].filter(Boolean).length ? ` · ${[l.city, l.province].filter(Boolean).join(', ')}` : ''}
            </p>
            {/* Signalements : jamais bloquants, toujours visibles avant d'accepter. */}
            {(l.possibleMerge || !!l.duplicate.records?.length || l.crm.error || stale || existing) && (
              <p className="m-0 mt-1.5 flex flex-wrap gap-1.5">
                {existing && <StatusPill family="wait">{t('leads.badge.existing')}</StatusPill>}
                {!!l.duplicate.records?.length && <StatusPill family="wait">{t('leads.badge.duplicate')}</StatusPill>}
                {l.possibleMerge && <StatusPill family="wait" title={t('leads.merge.badgeHint') as string}>{t('leads.merge.badge')}</StatusPill>}
                {stale && <StatusPill family="err">{t('leads.badge.waiting', { n: waitingH })}</StatusPill>}
                {l.crm.error && <StatusPill family="err" title={l.crm.error}>{t('leads.badge.crmFailed')}</StatusPill>}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'contact', header: t('leads.columns.contact'), sortValue: (l) => leadFullName(l),
      render: (l) => (
        <>
          <p className="m-0 text-sm">{leadFullName(l) || '—'}</p>
          <p className="m-0 mt-0.5 whitespace-nowrap text-xs text-body dark:text-bodydark2">{l.contactPhone || l.contactEmail || '—'} · {l.language === 'en' ? 'EN' : 'FR'}</p>
        </>
      ),
    },
    { key: 'source', header: t('leads.columns.source'), sortValue: (l) => t(`leads.source.${l.source}`) as string, className: 'whitespace-nowrap text-[#424242] dark:text-bodydark', render: (l) => t(`leads.source.${l.source}`) },
    {
      key: 'received', header: t('leads.columns.received'), sortValue: (l) => new Date(l.createdAt).getTime(), className: 'whitespace-nowrap',
      render: (l) => {
        const late = (l.status === 'new' || l.status === 'in_review') && Date.now() - new Date(l.createdAt).getTime() >= 4 * 3600e3;
        return <span className={late ? 'font-bold text-warning' : 'text-[#424242] dark:text-bodydark'}>{dt(l.createdAt)}</span>;
      },
    },
    {
      key: 'rep', header: t('leads.columns.rep'), sortValue: (l) => l.assigned?.repName || l.suggested?.repName || '',
      render: (l) => l.assigned?.repName
        ? l.assigned.repName
        : l.suggested?.repName
          ? <span className="text-body dark:text-bodydark2">{t('leads.suggestedShort', { rep: l.suggested.repName })}</span>
          : <span className="text-body dark:text-bodydark2">—</span>,
    },
    { key: 'status', header: t('leads.columns.status'), sortValue: (l) => l.status, render: (l) => <StatusPill family={statusFamily[l.status]}>{t(`leads.status.${l.status}`)}</StatusPill> },
  ];

  return (
    <>
      <header className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-body dark:text-bodydark2">{t('sidebar.sections.sales')}</span>
            <h1 className="m-0 text-2xl font-bold leading-tight tracking-[-0.01em] text-black dark:text-white">{t('leads.title')}</h1>
            <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('leads.subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can.import && (
              <Button size="md" onClick={() => setImportOpen(true)}
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 21h14" /></svg>}>
                {t('leads.import.button')}
              </Button>
            )}
            {can.intake && (
              <Button size="md" variant="primary" onClick={() => setIntakeOpen(true)}
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>}>
                {t('leads.newLead')}
              </Button>
            )}
          </div>
        </div>
        <Tabs
          ariaLabel={t('leads.v2.tabsLabel') as string}
          value={tab}
          onChange={setTab}
          tabs={TABS.map((k) => { const n = tabCount(k); return { id: k, label: t(`leads.tabs.${k}`), count: n != null && n > 0 ? n : undefined }; })}
        />
      </header>

      {tab === 'stats' ? (
        <>
          <StatsFilters onChange={setStatsQuery} canExport={can.export} chartHidden={chartHidden} />
          {!!kpis.length && (
            <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map((k) => (
                <div key={k.label} className="rounded-sm border border-stroke bg-white px-5 py-4 shadow-default dark:border-strokedark dark:bg-boxdark">
                  <p className="text-sm text-bodydark2">{k.label}</p>
                  <p className={`mt-1 text-title-md font-bold ${k.tone || 'text-black dark:text-white'}`}>{k.value}</p>
                </div>
              ))}
            </div>
          )}

          {!stats ? (
            <div className="rounded-sm border border-stroke bg-white px-6 py-12 text-center text-sm text-bodydark2 shadow-default dark:border-strokedark dark:bg-boxdark">
              {t('common.loading')}
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {statsQuery && <LeadsChart chart={stats.chart} from={statsQuery.from} to={statsQuery.to} hidden={chartHidden} onHiddenChange={setChartHidden} />}
              {/* L'entonnoir est la seule vue qui relie une piste à de l'argent réel : l'étape
                  « gagnée » vient de la date de dépôt du Deal Zoho, rafraîchie chaque heure. */}
              <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
                <h3 className="mb-4 text-sm font-medium text-black dark:text-white">{t('leads.stats.funnel')}</h3>
                {(['received', 'accepted', 'converted', 'won'] as const).map((k) => {
                  const v = stats.funnel[k] || 0;
                  const pct = stats.funnel.received ? Math.round((v / stats.funnel.received) * 100) : 0;
                  return (
                    <div key={k} className="mb-3">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-bodydark2">{t(`leads.stats.step.${k}`)}</span>
                        <span className="font-medium text-black dark:text-white">{v} <span className="text-bodydark2">· {pct}%</span></span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-2 dark:bg-meta-4">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <p className="mt-4 text-xs text-bodydark2">{t('leads.stats.funnelNote')}</p>
              </div>

              <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
                <h3 className="mb-4 text-sm font-medium text-black dark:text-white">{t('leads.stats.bySource')}</h3>
                <table className="w-full table-auto">
                  <thead>
                    <tr className="text-left text-xs text-bodydark2">
                      <th className="pb-2 font-medium">{t('leads.columns.source')}</th>
                      <th className="pb-2 text-right font-medium">{t('leads.stats.received')}</th>
                      <th className="pb-2 text-right font-medium">{t('leads.stats.accepted')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.bySource.map((r) => (
                      <tr key={r.source} className="border-t border-stroke dark:border-strokedark">
                        <td className="py-2 text-sm text-black dark:text-white">{t(`leads.source.${r.source}`, { defaultValue: r.source })}</td>
                        <td className="py-2 text-right text-sm text-black dark:text-white">{r.n}</td>
                        <td className="py-2 text-right text-sm text-black dark:text-white">{r.accepted}</td>
                      </tr>
                    ))}
                    {!stats.bySource.length && <tr><td colSpan={3} className="py-6 text-center text-sm text-bodydark2">{t('leads.stats.noData')}</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark lg:col-span-2">
                <h3 className="mb-1 text-sm font-medium text-black dark:text-white">{t('leads.stats.byRep')}</h3>
                <p className="mb-4 text-xs text-bodydark2">{t('leads.stats.byRepNote')}</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] table-auto">
                    <thead>
                      <tr className="text-left text-xs text-bodydark2">
                        <th className="pb-2 font-medium">{t('leads.columns.rep')}</th>
                        <th className="pb-2 text-right font-medium">{t('leads.stats.assigned')}</th>
                        {repSources.map((k) => (
                          <th key={k} className="whitespace-nowrap pb-2 pl-3 text-right font-medium">
                            <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: sourceColor(k, dark) }} />
                            {t(`leads.source.${k}`, { defaultValue: k })}
                          </th>
                        ))}
                        <th className="pb-2 text-right font-medium">{t('leads.stats.converted')}</th>
                        <th className="pb-2 text-right font-medium">{t('leads.stats.won')}</th>
                        <th className="pb-2 text-right font-medium">{t('leads.stats.winRate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.byRep.map((r) => (
                        <tr key={r.rep} className="border-t border-stroke dark:border-strokedark">
                          <td className="py-2 text-sm text-black dark:text-white">{r.rep}</td>
                          <td className="py-2 text-right text-sm text-black dark:text-white">{r.n}</td>
                          {repSources.map((k) => {
                            const v = r.sources?.[k] || 0;
                            return <td key={k} className={`py-2 pl-3 text-right text-sm ${v ? 'text-black dark:text-white' : 'text-bodydark2'}`}>{v || '—'}</td>;
                          })}
                          <td className="py-2 text-right text-sm text-black dark:text-white">{r.converted}</td>
                          <td className="py-2 text-right text-sm text-black dark:text-white">{r.won}</td>
                          <td className="py-2 text-right text-sm text-black dark:text-white">{r.n ? Math.round((r.won / r.n) * 100) : 0}%</td>
                        </tr>
                      ))}
                      {!stats.byRep.length && <tr><td colSpan={5 + repSources.length} className="py-6 text-center text-sm text-bodydark2">{t('leads.stats.noData')}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Barre de filtres en CARTE pleine largeur sous le titre — convention maison. */}
          <div className="mb-4">
            <FilterBar search={q} onSearch={setQ} searchPlaceholder={t('leads.filters.search') as string}>
              <Select
                value={source}
                onChange={setSource}
                buttonClassName="h-10 rounded-xl border border-stroke bg-white px-3 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
                options={[{ value: '', label: t('leads.filters.allSources') as string },
                  ...LEAD_SOURCES.map((s) => ({ value: s, label: t(`leads.source.${s}`) as string }))]}
              />
              {(can.viewAll || can.review) && (
                <Select
                  value={rep}
                  onChange={setRep}
                  buttonClassName="h-10 rounded-xl border border-stroke bg-white px-3 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
                  options={[{ value: '', label: t('leads.filters.allReps') as string },
                    ...reps.map((r) => ({ value: r.name, label: r.name }))]}
                />
              )}
            </FilterBar>
          </div>

          {/* Liste : la ligne ENTIÈRE ouvre le panneau de la piste à droite (audit UX). La file
              « À examiner » est triée de la plus ancienne à la plus récente : la plus vieille
              attend le plus. Pagination par 25. */}
          <DataTable<Lead>
            key={tab}
            rows={visible || []}
            loading={visible == null}
            rowKey={(l) => l.id}
            onRowClick={(l) => setOpenId(l.id)}
            selectedKey={openId}
            defaultSort={{ key: 'received', dir: tab === 'queue' ? 'asc' : 'desc' }}
            empty={{ title: source || q || rep ? t('leads.empty') : t(`leads.emptyTab.${tab}`) }}
            columns={leadColumns}
          />
        </>
      )}

      <ImportLeads open={importOpen} onClose={() => setImportOpen(false)} onChanged={() => { load(); notifyLeadsChanged(); }} />
      <IntakeForm open={intakeOpen} onClose={() => setIntakeOpen(false)} onCreated={() => { load(); notifyLeadsChanged(); }} />
      {openId != null && (
        <LeadDetail leadId={openId} reps={reps} onClose={() => setOpenId(null)} onChanged={() => { load(); notifyLeadsChanged(); }} onOpenLead={setOpenId} />
      )}
    </>
  );
};

export default Leads;
