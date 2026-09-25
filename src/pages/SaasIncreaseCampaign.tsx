import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, TrendingUp, AlertTriangle, Users, CalendarClock, LifeBuoy, ExternalLink } from 'lucide-react';

// Le suivi d'une campagne EN COURS, par opposition a la vue board qui est une proposition figee.
// Une hausse de prix ne finit pas au clic sur « Appliquer » : chaque abonnement change de prix a
// SON renouvellement, donc la campagne se deroule sur douze mois. Pendant ce temps deux questions
// comptent — est-ce que l'argent arrive, et est-ce que des clients partent.
//
// Tout vient d'un seul appel, entierement derive des faits enregistres. Rien ici ne se saisit a
// la main : un compteur d'avancement qu'il faut penser a mettre a jour finit toujours par mentir.

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface Campaign {
  scenario: { id: number; name: string; status: string; createdAt: string };
  phase: 'draft' | 'notifying' | 'applying' | 'live' | 'complete';
  counts: {
    total: number; skipped: number; raised: number; pending: number;
    pushed: number; pushFailed: number; notified: number; notifyFailed: number;
  };
  mrr: { target: number; planned: number; committed: number; realized: number; upcoming: number };
  timeline: { month: string; subs: number; mrr: number; past: boolean }[];
  churn: {
    count: number; mrrLost: number;
    list: { customerName: string; subscriptionNumber: string; orgName: string;
            cancelledAt: string; pushedAt: string; monthly: number }[];
  };
  leads: number;
  firstPushAt: string | null;
}

interface DeskTicket {
  id: string; number: string; subject: string; createdAt: string;
  category: string | null; channel: string | null; url: string | null;
  accountName: string; customerName: string; daysAfterNotice: number;
}
interface Desk {
  days: number;
  departmentId: string | null;
  notifiedTotal: number;   // tous les marchands avises
  eligible: number;        // ceux avises depuis assez longtemps pour une fenetre complete
  merchantsMatched: number;// ceux effectivement retrouves dans Desk
  before: number; after: number;
  byCategory: { category: string; before: number; after: number; delta: number }[];
  keyword: { count: number; samples: DeskTicket[] };
  tickets: DeskTicket[];
  departments: { id: string; name: string; n: number }[];
}

interface Scenario { id: number; name: string }

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n || 0);
const money2 = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD' }).format(n || 0);

// 'AAAA-MM' -> 'septembre 2026'. Construit en parties locales : new Date('2026-09') est minuit
// UTC et recule d'un mois dans tout fuseau nord-americain.
const moisLisible = (m: string, locale: string) => {
  const [y, mo] = m.split('-').map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString(locale, { month: 'short', year: '2-digit' });
};

const PHASE_COLOR: Record<Campaign['phase'], string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-[#1B1B1B] dark:text-[#999AA7]',
  notifying: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  applying: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  live: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  complete: 'bg-gray-100 text-gray-600 dark:bg-[#1B1B1B] dark:text-[#999AA7]',
};

export default function SaasIncreaseCampaign() {
  const { t, i18n } = useTranslation();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [id, setId] = useState<number | null>(null);
  const [data, setData] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Le croisement avec Zoho Desk porte sur des milliers de billets : il ne se charge que si on le
  // demande, pour que ce tableau de bord reste instantane a ouvrir.
  const [desk, setDesk] = useState<Desk | null>(null);
  const [deskLoading, setDeskLoading] = useState(false);
  const [deskDays, setDeskDays] = useState(30);
  // '' = tous les pupitres. Le choix est enregistre pour l'equipe : sans ca, deux personnes
  // liraient deux chiffres differents de la meme campagne.
  const [dept, setDept] = useState<string>('');
  const [deptSaved, setDeptSaved] = useState(false);
  // La liste des pupitres arrive AVANT le croisement : elle vivait dans la reponse des billets,
  // donc le menu n'apparaissait qu'apres avoir charge des milliers de lignes — il fallait deja
  // savoir que le choix existait pour le faire apparaitre.
  const [pupitres, setPupitres] = useState<{ id: string; name: string; n: number }[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/admin/saas-increase/cs-department`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!d) return; setDept(d.departmentId || ''); setPupitres(d.departments || []); })
      .catch(() => { /* le panneau reste utilisable sur tous les pupitres */ });

    fetch(`${API_URL}/api/admin/saas-increase/scenarios`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        const list: Scenario[] = d.scenarios || [];
        setScenarios(list);
        if (list.length) setId(list[0].id);
      })
      .catch(() => setError(t('saasCampaign.error') as string));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const charger = async (scenarioId: number) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${scenarioId}/campaign`,
        { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
    } catch { setError(t('saasCampaign.error') as string); setData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (id != null) void charger(id); setDesk(null); /* eslint-disable-next-line */ }, [id]);

  // `pupitre` non passe = on laisse le serveur appliquer le reglage enregistre ; passe = on
  // previsualise un autre choix sans encore l'enregistrer.
  const chargerDesk = async (jours: number, pupitre?: string) => {
    if (id == null) return;
    setDeskLoading(true);
    try {
      const qs = new URLSearchParams({ days: String(jours) });
      if (pupitre !== undefined) qs.set('dept', pupitre);
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${id}/campaign/desk?${qs}`,
        { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const d: Desk = await r.json();
      setDesk(d);
      setDept(d.departmentId || '');
      if (d.departments?.length) setPupitres(d.departments);
    } catch { setDesk(null); }
    finally { setDeskLoading(false); }
  };

  const enregistrerPupitre = async (valeur: string) => {
    setDept(valeur);
    setDeptSaved(false);
    void chargerDesk(deskDays, valeur);
    try {
      await fetch(`${API_URL}/api/admin/saas-increase/cs-department`, {
        method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentId: valeur }),
      });
      setDeptSaved(true);
      setTimeout(() => setDeptSaved(false), 2500);
    } catch { /* le filtre s'applique quand meme a l'ecran, il ne sera juste pas retenu */ }
  };

  const card = 'rounded-2xl border border-gray-200 bg-white dark:border-[#1B1B1B] dark:bg-[#0E0F11]';
  const textPri = 'text-gray-900 dark:text-white';
  const textSec = 'text-gray-600 dark:text-[#D1D1D1]';
  const textTer = 'text-gray-500 dark:text-[#999AA7]';
  const textQuat = 'text-gray-400 dark:text-[#61646C]';
  const label = `text-[11px] font-semibold uppercase tracking-wider ${textQuat}`;

  const pctCible = data && data.mrr.target > 0
    ? Math.min(100, (data.mrr.committed / data.mrr.target) * 100) : 0;
  const pctRealise = data && data.mrr.target > 0
    ? Math.min(100, (data.mrr.realized / data.mrr.target) * 100) : 0;
  const maxMois = data ? Math.max(1, ...data.timeline.map(x => x.mrr)) : 1;

  return (
    <div className="font-satoshi">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={`text-title-md2 font-semibold ${textPri}`}>{t('saasCampaign.title')}</h2>
          <p className="mt-1 text-sm text-body">{t('saasCampaign.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {scenarios.length > 1 && (
            <select
              value={id ?? ''}
              onChange={(e) => setId(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary dark:border-[#242424] dark:bg-[#0A0A0A] dark:text-white"
            >
              {scenarios.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
            </select>
          )}
          <button
            onClick={() => id != null && charger(id)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#242424] dark:bg-[#141414] dark:text-[#D1D1D1]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('saasCampaign.refresh')}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</div>}
      {!data && !loading && !error && (
        <div className={`${card} p-6 text-sm ${textTer}`}>{t('saasCampaign.none')}</div>
      )}

      {data && (
        <>
          {/* ── L'ETAT, en une ligne ─────────────────────────────────────────────────────── */}
          <div className={`${card} mb-4 p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${PHASE_COLOR[data.phase]}`}>
                  {t(`saasCampaign.phase.${data.phase}`)}
                </span>
                <span className={`text-sm font-medium ${textPri}`}>{data.scenario.name}</span>
                {data.firstPushAt && (
                  <span className={`text-xs ${textQuat}`}>
                    {t('saasCampaign.since', { date: data.firstPushAt })}
                  </span>
                )}
              </div>
              <span className={`max-w-[60ch] text-xs ${textTer}`}>{t(`saasCampaign.phaseHint.${data.phase}`)}</span>
            </div>
          </div>

          {/* ── L'ARGENT : engage vs reellement facture ──────────────────────────────────── */}
          <div className={`${card} mb-4 p-6`}>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className={label}>{t('saasCampaign.realized')}</div>
                <div className={`mt-1 text-[38px] font-semibold leading-none tracking-tight ${textPri}`}>
                  {money(data.mrr.realized)}<span className={`ml-1 text-base font-normal ${textQuat}`}>/mo</span>
                </div>
                {/* La distinction que tout compteur unique de « MRR ajoute » efface : ecrit dans
                    Zoho n'est pas facture. Entre les deux il y a le renouvellement de chacun. */}
                <div className={`mt-2 text-sm ${textTer}`}>
                  {t('saasCampaign.committedVs', { committed: money(data.mrr.committed), upcoming: money(data.mrr.upcoming) })}
                </div>
              </div>
              <div className="text-right">
                <div className={label}>{t('saasCampaign.target')}</div>
                <div className={`mt-1 text-2xl font-semibold ${textPri}`}>{money(data.mrr.target)}</div>
                <div className={`mt-1 text-xs ${textQuat}`}>
                  {t('saasCampaign.committedPct', { pct: pctCible.toFixed(1) })}
                </div>
              </div>
            </div>
            {/* Deux barres superposees : le fonce est encaisse, le pale est promis. */}
            <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-[#1B1B1B]">
              <div className="relative h-full">
                <div className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${pctCible}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pctRealise}%` }} />
              </div>
            </div>
          </div>

          {/* ── L'AVANCEMENT ─────────────────────────────────────────────────────────────── */}
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { icon: TrendingUp, label: t('saasCampaign.pushed'), value: `${data.counts.pushed} / ${data.counts.raised}`,
                sub: data.counts.pending > 0 ? t('saasCampaign.pendingN', { count: data.counts.pending }) : t('saasCampaign.allPushed') },
              { icon: Users, label: t('saasCampaign.notified'), value: String(data.counts.notified),
                sub: data.counts.notifyFailed > 0 ? t('saasCampaign.notifyFailedN', { count: data.counts.notifyFailed }) : t('saasCampaign.noNotifyFail') },
              { icon: CalendarClock, label: t('saasCampaign.spared'), value: String(data.counts.skipped),
                sub: t('saasCampaign.ofTotal', { count: data.counts.total }) },
              { icon: TrendingUp, label: t('saasCampaign.leads'), value: String(data.leads),
                sub: t('saasCampaign.leadsHint') },
            ].map((k, n) => (
              <div key={n} className={`${card} p-5`}>
                <div className={`flex items-center gap-1.5 ${label}`}><k.icon className="h-3.5 w-3.5" />{k.label}</div>
                <div className={`mt-1.5 text-2xl font-semibold ${textPri}`}>{k.value}</div>
                <div className={`mt-1 text-xs ${textQuat}`}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── QUAND L'ARGENT ENTRE ─────────────────────────────────────────────────────── */}
          {data.timeline.length > 0 && (
            <div className={`${card} mb-4 p-6`}>
              <div className={label}>{t('saasCampaign.timeline')}</div>
              <p className={`mt-1.5 max-w-[70ch] text-xs ${textTer}`}>{t('saasCampaign.timelineHint')}</p>
              <div className="mt-4 flex items-end gap-1.5" style={{ height: 130 }}>
                {data.timeline.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1.5" style={{ height: '100%' }}>
                    <div className={`text-[10px] tabular-nums ${textQuat}`}>{money(m.mrr)}</div>
                    <div
                      className={`w-full rounded-t ${m.past ? 'bg-primary' : 'bg-primary/30'}`}
                      style={{ height: `${Math.max(2, (m.mrr / maxMois) * 100)}%` }}
                      title={t('saasCampaign.barTitle', { subs: m.subs, mrr: money2(m.mrr) }) as string}
                    />
                    <div className={`text-[10px] ${textQuat}`}>{moisLisible(m.month, i18n.language)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CE QUE LA HAUSSE A COUTE AU SOUTIEN ──────────────────────────────────────── */}
          <div className={`${card} mb-4 p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <LifeBuoy className={`h-3.5 w-3.5 ${textQuat}`} />
                <span className={label}>{t('saasCampaign.desk.title')}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Le pupitre se CHOISIT ici. Il etait seulement liste, en attendant que David me
                    dise lequel — ce qui voulait dire attendre un deploiement pour un reglage. */}
                {pupitres.length > 0 && (
                  <select
                    value={dept}
                    onChange={(e) => void enregistrerPupitre(e.target.value)}
                    className="max-w-[220px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-primary dark:border-[#242424] dark:bg-[#0A0A0A] dark:text-white"
                  >
                    <option value="">{t('saasCampaign.desk.allDesks')}</option>
                    {pupitres.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.n})</option>
                    ))}
                  </select>
                )}
                {deptSaved && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {t('saasCampaign.desk.deptSaved')}
                  </span>
                )}
                <select
                  value={deskDays}
                  onChange={(e) => { const v = Number(e.target.value); setDeskDays(v); if (desk) void chargerDesk(v); }}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-primary dark:border-[#242424] dark:bg-[#0A0A0A] dark:text-white"
                >
                  {[14, 30, 60, 90].map(d => (
                    <option key={d} value={d}>{t('saasCampaign.desk.window', { days: d })}</option>
                  ))}
                </select>
                <button
                  onClick={() => void chargerDesk(deskDays)}
                  disabled={deskLoading}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#242424] dark:bg-[#141414] dark:text-[#D1D1D1]"
                >
                  {deskLoading ? t('saasCampaign.desk.loading') : desk ? t('saasCampaign.refresh') : t('saasCampaign.desk.load')}
                </button>
              </div>
            </div>

            {/* La methode, ecrite sur la page. Un chiffre de soutien sans sa methode se cite
                ensuite en reunion comme s'il etait mesure, alors qu'il est estime. */}
            <p className={`mt-2 max-w-[85ch] text-xs leading-relaxed ${textTer}`}>
              {t('saasCampaign.desk.method')}
            </p>
            {!desk && (
              <p className={`mt-2 text-xs ${textQuat}`}>
                {dept
                  ? t('saasCampaign.desk.scopedTo', { name: pupitres.find(d => d.id === dept)?.name || dept })
                  : t('saasCampaign.desk.scopedAll')}
              </p>
            )}

            {desk && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { l: t('saasCampaign.desk.before'), v: String(desk.before) },
                    { l: t('saasCampaign.desk.after'), v: String(desk.after),
                      hi: desk.after > desk.before },
                    { l: t('saasCampaign.desk.delta'),
                      v: `${desk.after - desk.before >= 0 ? '+' : '−'}${Math.abs(desk.after - desk.before)}`,
                      hi: desk.after > desk.before },
                    { l: t('saasCampaign.desk.coverage'),
                      v: `${desk.merchantsMatched} / ${desk.eligible}` },
                  ].map((k, n) => (
                    <div key={n}>
                      <div className={label}>{k.l}</div>
                      <div className={`mt-1 text-2xl font-semibold ${k.hi ? 'text-amber-600 dark:text-amber-400' : textPri}`}>{k.v}</div>
                    </div>
                  ))}
                </div>
                {/* Le denominateur, dit en clair. « 12 billets » ne veut rien dire sans savoir
                    sur combien de marchands la mesure porte reellement. */}
                <p className={`mt-2 text-xs ${textQuat}`}>
                  {t('saasCampaign.desk.coverageHint', {
                    matched: desk.merchantsMatched, eligible: desk.eligible, notified: desk.notifiedTotal, days: desk.days })}
                </p>

                {desk.byCategory.length > 0 && (
                  <div className="mt-5">
                    <div className={label}>{t('saasCampaign.desk.byCategory')}</div>
                    <p className={`mt-1 max-w-[80ch] text-xs ${textQuat}`}>{t('saasCampaign.desk.byCategoryHint')}</p>
                    <div className="mt-2 divide-y divide-gray-100 dark:divide-[#161616]">
                      {desk.byCategory.slice(0, 10).map(c => (
                        <div key={c.category} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                          <span className={`min-w-0 truncate ${textSec}`}>{c.category}</span>
                          <span className={`shrink-0 tabular-nums ${textQuat}`}>
                            {c.before} → <span className={textPri}>{c.after}</span>
                            <span className={`ml-2 font-semibold ${c.delta > 0 ? 'text-amber-600 dark:text-amber-400' : c.delta < 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                              {c.delta > 0 ? '+' : ''}{c.delta}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {desk.keyword.count > 0 && (
                  <div className="mt-5">
                    <div className={label}>{t('saasCampaign.desk.keyword', { count: desk.keyword.count })}</div>
                    <p className={`mt-1 max-w-[80ch] text-xs ${textQuat}`}>{t('saasCampaign.desk.keywordHint')}</p>
                    <div className="mt-2 divide-y divide-gray-100 dark:divide-[#161616]">
                      {desk.keyword.samples.map(k => (
                        <div key={k.id} className="flex items-center justify-between gap-3 py-1.5">
                          <div className="min-w-0">
                            <div className={`truncate text-[13px] ${textSec}`}>{k.subject}</div>
                            <div className={`truncate text-[11px] ${textQuat}`}>
                              {k.customerName} · {t('saasCampaign.desk.daysAfter', { days: k.daysAfterNotice })}
                              {k.category ? ` · ${k.category}` : ''}
                            </div>
                          </div>
                          {k.url && (
                            <a href={k.url} target="_blank" rel="noreferrer"
                               className={`shrink-0 ${textQuat} hover:text-primary`}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* La portee courante, ecrite sous les chiffres : un compte filtre sur un pupitre
                    et un compte sur tous se ressemblent trop pour qu'on laisse deviner lequel
                    on regarde. */}
                <p className={`mt-4 text-xs ${textQuat}`}>
                  {dept
                    ? t('saasCampaign.desk.scopedTo', {
                        name: pupitres.find(d => d.id === dept)?.name || dept })
                    : t('saasCampaign.desk.scopedAll')}
                </p>
              </>
            )}
          </div>

          {/* ── CE QUI FAIT MAL ──────────────────────────────────────────────────────────── */}
          <div className={`${card} p-6`}>
            <div className="flex items-center gap-1.5">
              <AlertTriangle className={`h-3.5 w-3.5 ${data.churn.count > 0 ? 'text-red-500' : textQuat}`} />
              <span className={label}>{t('saasCampaign.churn')}</span>
            </div>
            {data.churn.count === 0 ? (
              <p className={`mt-2 text-sm ${textTer}`}>{t('saasCampaign.churnNone')}</p>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
                  <span className="text-2xl font-semibold text-red-600 dark:text-red-400">{data.churn.count}</span>
                  <span className={`text-sm ${textSec}`}>
                    {t('saasCampaign.churnLost', { amount: money2(data.churn.mrrLost) })}
                  </span>
                </div>
                {/* Enonce en clair, parce qu'un tableau de bord qui affiche un churn a cote d'une
                    hausse de prix se lit comme une accusation. Un client annule pour mille
                    raisons ; ce chiffre dit qu'il faut regarder, pas qu'on sait pourquoi. */}
                <p className={`mt-1.5 max-w-[80ch] text-xs ${textTer}`}>{t('saasCampaign.churnCaveat')}</p>
                <div className="mt-3 divide-y divide-gray-100 dark:divide-[#161616]">
                  {data.churn.list.map((c) => (
                    <div key={c.subscriptionNumber} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className={`truncate text-[13px] font-medium ${textPri}`}>{c.customerName}</div>
                        <div className={`truncate font-mono text-[11px] ${textQuat}`}>
                          {c.subscriptionNumber} · {c.orgName}
                        </div>
                      </div>
                      <div className={`shrink-0 text-right text-[11px] ${textTer}`}>
                        <div className="tabular-nums">{money2(c.monthly)}/mo</div>
                        <div className={textQuat}>{t('saasCampaign.churnDates', { pushed: c.pushedAt, cancelled: c.cancelledAt })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
