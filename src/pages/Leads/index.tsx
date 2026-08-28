import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import Select from '../../components/Select';
import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import IntakeForm from './IntakeForm';
import LeadDetail from './LeadDetail';
import { authHeaders, leadFullName, statusTone, LEAD_SOURCES, type Lead, type LeadRep } from './types';

const API_URL = import.meta.env.VITE_API_URL;

// La couche d'accueil des pistes, côté écran. Le parti pris de navigation : les ONGLETS SONT le
// filtre de statut. Une pastille « À examiner » plus un menu déroulant « statut » se
// contrediraient à la première combinaison, et rien n'indiquerait laquelle gagne.

type Tab = 'queue' | 'accepted' | 'closed' | 'all' | 'stats';
const TAB_STATUSES: Record<Exclude<Tab, 'stats' | 'all'>, string[]> = {
  queue: ['new', 'in_review'],
  accepted: ['accepted'],
  closed: ['rejected', 'duplicate'],
};

interface Stats {
  byStatus: Record<string, number>;
  bySource: { source: string; n: number; accepted: number }[];
  byMonth: { month: string; n: number; accepted: number; rejected: number }[];
  byRep: { rep: string; n: number; converted: number; won: number }[];
  funnel: { received: number; accepted: number; converted: number; won: number };
  queue: { waiting: number; over_4h: number; over_24h: number; oldest: string | null };
  speed: { avg_hours: number | null; median_hours: number | null };
}

const Leads = () => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');
  const location = useLocation();

  const [tab, setTab] = useState<Tab>('queue');
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [can, setCan] = useState({ review: false, intake: false, viewAll: false, rules: false });
  const [reps, setReps] = useState<LeadRep[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const [source, setSource] = useState('');
  const [rep, setRep] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);

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
      setCan(data.can || { review: false, intake: false, viewAll: false, rules: false });
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
    if (tab !== 'stats' || (!can.viewAll && !can.review)) return;
    fetch(`${API_URL}/api/leads/stats`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => {});
  }, [tab, can.viewAll, can.review]);

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
    ? ['queue', 'accepted', 'closed', 'all', 'stats']
    : ['queue', 'accepted', 'closed', 'all'];

  const kpis = stats ? [
    { label: t('leads.kpi.waiting'), value: String(stats.queue.waiting), tone: stats.queue.waiting ? 'text-warning' : '' },
    { label: t('leads.kpi.over24h'), value: String(stats.queue.over_24h), tone: stats.queue.over_24h ? 'text-danger' : '' },
    { label: t('leads.kpi.medianReview'), value: stats.speed.median_hours != null ? t('leads.kpi.hours', { n: stats.speed.median_hours }) as string : '—', tone: '' },
    { label: t('leads.kpi.won'), value: `${stats.funnel.won} / ${stats.funnel.received}`, tone: '' },
  ] : [];

  return (
    <>
      <Breadcrumb pageName={t('sidebar.leads')} />

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-title-md2 font-bold text-black dark:text-white">{t('leads.title')}</h2>
          <p className="mt-1 text-sm text-bodydark2">{t('leads.subtitle')}</p>
        </div>
        {can.intake && (
          <button
            type="button"
            onClick={() => setIntakeOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            {t('leads.newLead')}
          </button>
        )}
      </div>

      <div className="mb-5 inline-flex flex-wrap rounded-sm border border-stroke bg-white p-1 shadow-default dark:border-strokedark dark:bg-boxdark">
        {TABS.map((k) => {
          const n = tabCount(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-sm px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                tab === k ? 'bg-primary text-white' : 'text-bodydark2 hover:text-black dark:hover:text-white'
              }`}
            >
              {t(`leads.tabs.${k}`)}
              {n != null && n > 0 && (
                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${tab === k ? 'bg-white/25' : 'bg-gray-2 dark:bg-meta-4'}`}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'stats' ? (
        <>
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
                <h3 className="mb-4 text-sm font-medium text-black dark:text-white">{t('leads.stats.byRep')}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] table-auto">
                    <thead>
                      <tr className="text-left text-xs text-bodydark2">
                        <th className="pb-2 font-medium">{t('leads.columns.rep')}</th>
                        <th className="pb-2 text-right font-medium">{t('leads.stats.assigned')}</th>
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
                          <td className="py-2 text-right text-sm text-black dark:text-white">{r.converted}</td>
                          <td className="py-2 text-right text-sm text-black dark:text-white">{r.won}</td>
                          <td className="py-2 text-right text-sm text-black dark:text-white">{r.n ? Math.round((r.won / r.n) * 100) : 0}%</td>
                        </tr>
                      ))}
                      {!stats.byRep.length && <tr><td colSpan={5} className="py-6 text-center text-sm text-bodydark2">{t('leads.stats.noData')}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Barre de filtres en CARTE pleine largeur sous le titre — convention maison :
              sélecteurs à gauche, recherche qui s'étire, jamais flottante à côté du titre. */}
          <div className="mb-5 rounded-sm border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={source}
                onChange={setSource}
                buttonClassName="rounded border border-stroke bg-transparent px-4 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4"
                options={[{ value: '', label: t('leads.filters.allSources') as string },
                  ...LEAD_SOURCES.map((s) => ({ value: s, label: t(`leads.source.${s}`) as string }))]}
              />
              {(can.viewAll || can.review) && (
                <Select
                  value={rep}
                  onChange={setRep}
                  buttonClassName="rounded border border-stroke bg-transparent px-4 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4"
                  options={[{ value: '', label: t('leads.filters.allReps') as string },
                    ...reps.map((r) => ({ value: r.name, label: r.name }))]}
                />
              )}
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('leads.filters.search') as string}
                className="min-w-[220px] flex-1 rounded border border-stroke bg-transparent px-4 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4"
              />
            </div>
          </div>

          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] table-auto">
                <thead>
                  <tr className="bg-gray-2 text-left dark:bg-meta-4">
                    <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('leads.columns.business')}</th>
                    <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('leads.columns.contact')}</th>
                    <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('leads.columns.source')}</th>
                    <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('leads.columns.received')}</th>
                    <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('leads.columns.rep')}</th>
                    <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('leads.columns.status')}</th>
                    <th className="sticky right-0 bg-gray-2 px-4 py-4 dark:bg-meta-4" />
                  </tr>
                </thead>
                <tbody>
                  {visible?.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-bodydark2">
                        {source || q || rep ? t('leads.empty') : t(`leads.emptyTab.${tab}`)}
                      </td>
                    </tr>
                  )}
                  {visible?.map((l) => {
                    const waitingH = Math.round((Date.now() - new Date(l.createdAt).getTime()) / 3600000);
                    const stale = (l.status === 'new' || l.status === 'in_review') && waitingH >= 24;
                    return (
                      <tr key={l.id} className="border-t border-stroke dark:border-strokedark">
                        <td className="px-4 py-4">
                          <p className="font-medium text-black dark:text-white">{l.businessName}</p>
                          <p className="mt-0.5 text-xs text-bodydark2">
                            {l.refCode}
                            {[l.city, l.province].filter(Boolean).length ? ` · ${[l.city, l.province].filter(Boolean).join(', ')}` : ''}
                          </p>
                          {/* Signalements : jamais bloquants, toujours visibles avant d'accepter. */}
                          {(!!l.duplicate.records?.length || l.crm.error || stale) && (
                            <p className="mt-1.5 flex flex-wrap gap-1.5">
                              {!!l.duplicate.records?.length && (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 9v5M12 17.5v.1" /><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                                  {t('leads.badge.duplicate')}
                                </span>
                              )}
                              {stale && (
                                <span className="inline-flex whitespace-nowrap rounded bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium text-danger">
                                  {t('leads.badge.waiting', { n: waitingH })}
                                </span>
                              )}
                              {l.crm.error && (
                                <span title={l.crm.error} className="inline-flex whitespace-nowrap rounded bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium text-danger">
                                  {t('leads.badge.crmFailed')}
                                </span>
                              )}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-black dark:text-white">{leadFullName(l) || '—'}</p>
                          <p className="mt-0.5 whitespace-nowrap text-xs text-bodydark2">
                            {l.contactPhone || l.contactEmail || '—'}
                            {' · '}{l.language === 'en' ? 'EN' : 'FR'}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-black dark:text-white">{t(`leads.source.${l.source}`)}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-black dark:text-white">{dt(l.createdAt)}</td>
                        <td className="px-4 py-4 text-sm">
                          {l.assigned?.repName
                            ? <span className="text-black dark:text-white">{l.assigned.repName}</span>
                            : l.suggested?.repName
                            ? <span className="text-bodydark2">{t('leads.suggestedShort', { rep: l.suggested.repName })}</span>
                            : <span className="text-bodydark2">—</span>}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusTone[l.status]}`}>
                            {t(`leads.status.${l.status}`)}
                          </span>
                        </td>
                        {/* Colonne d'actions collée à droite, fond opaque : sur un écran étroit
                            elle doit rester lisible par-dessus le contenu qui défile dessous. */}
                        <td className="sticky right-0 bg-white px-4 py-4 text-right dark:bg-boxdark">
                          <button
                            type="button"
                            onClick={() => setOpenId(l.id)}
                            className="whitespace-nowrap rounded border border-stroke px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4"
                          >
                            {can.review && (l.status === 'new' || l.status === 'in_review') ? t('leads.actions.review') : t('leads.actions.open')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <IntakeForm open={intakeOpen} onClose={() => setIntakeOpen(false)} onCreated={load} />
      {openId != null && (
        <LeadDetail leadId={openId} reps={reps} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </>
  );
};

export default Leads;
