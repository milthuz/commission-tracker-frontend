import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, AlertTriangle, LifeBuoy, Info, ChevronDown } from 'lucide-react';

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
  // L'etat du pilote quotidien qui applique les hausses. `enabled` dit ce qui DEVRAIT se passer,
  // `lastPushAt` dit ce qui s'est reellement passe — c'est le second qui tranche.
  autopilot?: { enabled: boolean | null; lastPushAt: string | null; waiting?: number };
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
  // Presents SEULEMENT quand le croisement ne rend rien : trois causes possibles, trois gestes
  // differents. Sans ca le panneau affiche « 0 » et laisse deviner lequel des trois.
  reason?: 'no_notices' | 'window_too_long';
  lastNotifiedAt?: string | null;
  oldestNotifiedAt?: string | null;
  // Le VOLUME depuis l'avis, sans fenetre symetrique : c'est lui qui repond a « est-ce qu'on a
  // des billets la-dessus », et il existe des le premier avis envoye.
  // Les familles de billets, comptees SEPAREMENT. « Il demande une explication » et « il demande
  // a annuler » ne disent pas la meme chose et ne se classent pas au meme endroit dans Desk.
  categorized?: {
    key: string; issueType: string; csCategory: string; since?: string;
    total: number; matchedToCampaign?: number; open?: number; closed?: number;
    medianHoursToClose?: number | null;
    byMonth?: { month: string; n: number }[];
    list: (DeskTicket & { inCampaign: boolean; statusType: string | null })[];
  }[];
  sinceNotice?: {
    tickets: number; merchants: number;
    byCategory: { category: string; n: number }[];
    list: DeskTicket[];
  };
  diag?: {
    accountsMatched: number; ticketsAnyDept: number; ticketsAnyWindow: number;
    reason: 'no_name_match' | 'wrong_desk' | 'outside_window' | 'no_tickets';
  } | null;
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

// Parties locales : new Date('2026-09-25') est minuit UTC et recule d'un jour chez nous.
const fmtJour = (raw: string, locale: string) => {
  const [y, m, d] = String(raw).slice(0, 10).split('-').map(Number);
  if (!y) return raw;
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
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
  // Les explications et les listes vivent derriere un geste : elles restent atteignables sans
  // occuper l'ecran a chaque coup d'oeil.
  const [methodOpen, setMethodOpen] = useState(false);
  const [famOpen, setFamOpen] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [churnOpen, setChurnOpen] = useState(false);
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
  const neutralPill = 'bg-gray-100 text-gray-500 dark:bg-[#1B1B1B] dark:text-[#61646C]';

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
          {/* ── L'ETAT, L'ARGENT ET L'AVANCEMENT, DANS UNE SEULE CARTE ──────────────────────
              C'etaient trois cartes empilees — la phase, le MRR, puis quatre tuiles — qui
              disaient toutes la meme chose sous trois formes et occupaient un ecran complet
              avant le premier graphique. Elles se lisent ensemble, elles tiennent ensemble. */}
          <div className={`${card} mb-4 p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PHASE_COLOR[data.phase]}`}>
                  {t(`saasCampaign.phase.${data.phase}`)}
                </span>
                <span className={`text-sm font-medium ${textPri}`}>{data.scenario.name}</span>
                {data.firstPushAt && (
                  <span className={`text-[11px] ${textQuat}`}>{t('saasCampaign.since', { date: data.firstPushAt })}</span>
                )}
                {/* Le moteur. Un compteur immobile ne dit pas s'il attend son tour ou si le
                    pilote est arrete — et la difference vaut toute la campagne. */}
                {data.autopilot && (
                  data.autopilot.enabled === false ? (
                    <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      {t('saasCampaign.auto.off')}
                    </span>
                  ) : (
                    <span className={`text-[11px] ${textQuat}`}>
                      {data.autopilot.lastPushAt
                        ? t('saasCampaign.auto.on', {
                            date: fmtJour(data.autopilot.lastPushAt, i18n.language),
                            waiting: data.autopilot.waiting ?? 0 })
                        : t('saasCampaign.auto.onNoRun', { waiting: data.autopilot.waiting ?? 0 })}
                    </span>
                  )
                )}
              </div>
              <span className={`max-w-[52ch] text-[11px] ${textQuat}`}>{t(`saasCampaign.phaseHint.${data.phase}`)}</span>
            </div>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div>
                <div className={label}>{t('saasCampaign.realized')}</div>
                <div className={`mt-1 text-[32px] font-semibold leading-none tracking-tight ${textPri}`}>
                  {money(data.mrr.realized)}<span className={`ml-1 text-sm font-normal ${textQuat}`}>/mo</span>
                </div>
              </div>
              {/* La distinction que tout compteur unique de « MRR ajoute » efface : ecrit dans
                  Zoho n'est pas facture. Entre les deux, le renouvellement de chacun. */}
              <div className={`text-[11px] ${textTer}`}>
                {t('saasCampaign.committedVs', {
                  committed: money(data.mrr.committed), upcoming: money(data.mrr.upcoming) })}
                <br />
                <span className={textQuat}>
                  {t('saasCampaign.committedPct', { pct: pctCible.toFixed(1) })} · {t('saasCampaign.target')} {money(data.mrr.target)}
                </span>
              </div>
            </div>
            {/* Deux barres superposees : le fonce est encaisse, le pale est promis. */}
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-[#1B1B1B]">
              <div className="relative h-full">
                <div className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${pctCible}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pctRealise}%` }} />
              </div>
            </div>

            {/* L'avancement en bande, pas en tuiles : quatre chiffres n'ont pas besoin de quatre
                cartes bordees pour se lire. */}
            <div className={`mt-4 flex flex-wrap gap-x-7 gap-y-2 border-t border-gray-100 pt-3 dark:border-[#161616]`}>
              {[
                { l: t('saasCampaign.pushed'), v: `${data.counts.pushed} / ${data.counts.raised}`,
                  s: data.counts.pending > 0 ? t('saasCampaign.pendingN', { count: data.counts.pending }) : t('saasCampaign.allPushed') },
                { l: t('saasCampaign.notified'), v: String(data.counts.notified),
                  s: data.counts.notifyFailed > 0 ? t('saasCampaign.notifyFailedN', { count: data.counts.notifyFailed }) : t('saasCampaign.noNotifyFail') },
                { l: t('saasCampaign.spared'), v: String(data.counts.skipped),
                  s: t('saasCampaign.ofTotal', { count: data.counts.total }) },
                { l: t('saasCampaign.leads'), v: String(data.leads), s: t('saasCampaign.leadsHint') },
              ].map((k, n) => (
                <div key={n} className="min-w-0">
                  <div className={label}>{k.l}</div>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span className={`text-lg font-semibold ${textPri}`}>{k.v}</span>
                    <span className={`truncate text-[11px] ${textQuat}`}>{k.s}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── QUAND L'ARGENT ENTRE ───────────────────────────────────────────────────────
              Sous trois mois, tout tient sur UNE ligne : titre, puis les montants a la suite.
              Une carte pleine largeur avec un seul chiffre a gauche et une phrase d'explication
              a droite laisse un trou au milieu — c'est la boite vide que David a signalee deux
              fois. La phrase passe en infobulle; elle reste atteignable sans meubler l'ecran. */}
          {data.timeline.length > 0 && (
            <div className={`${card} mb-4 p-5`}>
              {data.timeline.length < 3 ? (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <span className="flex items-center gap-1.5">
                    <span className={label}>{t('saasCampaign.timeline')}</span>
                    <span title={t('saasCampaign.timelineHint') as string} className={`cursor-help ${textQuat}`}>
                      <Info className="h-3.5 w-3.5" />
                    </span>
                  </span>
                  {data.timeline.map((m) => (
                    <span key={m.month} className="flex items-baseline gap-2">
                      <span className={`text-lg font-semibold tabular-nums ${textPri}`}>{money(m.mrr)}</span>
                      <span className={`text-[11px] ${textQuat}`}>
                        {moisLisible(m.month, i18n.language)} · {t('saasCampaign.subsN', { count: m.subs })}
                      </span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${m.past ? 'bg-primary/15 text-primary' : neutralPill}`}>
                        {m.past ? t('saasCampaign.billed') : t('saasCampaign.toCome')}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className={label}>{t('saasCampaign.timeline')}</span>
                    <span className={`max-w-[70ch] text-[11px] ${textQuat}`}>{t('saasCampaign.timelineHint')}</span>
                  </div>
                  <div className="mt-3 flex items-end gap-1.5" style={{ height: 84 }}>
                    {data.timeline.map((m) => (
                      <div key={m.month} className="flex max-w-[64px] flex-1 flex-col items-center justify-end gap-1"
                           title={t('saasCampaign.barTitle', { subs: m.subs, mrr: money2(m.mrr) }) as string}>
                        <div className={`text-[10px] tabular-nums ${textQuat}`}>{money(m.mrr)}</div>
                        <div
                          className={`w-full rounded-t ${m.past ? 'bg-primary' : 'bg-primary/30'}`}
                          style={{ height: `${Math.max(3, (m.mrr / maxMois) * 100)}%` }}
                        />
                        <div className={`text-[10px] ${textQuat}`}>{moisLisible(m.month, i18n.language)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {/* ── CHARGE DU SERVICE A LA CLIENTELE ──────────────────────────────────────────────
              Reecrit en compact : la version precedente empilait, pour chaque famille, un grand
              nombre, deux paragraphes d'explication, un graphique et une liste ouverte. Six
              blocs pleine largeur pour trois chiffres. Les explications comptent — elles disent
              comment le chiffre est fait — mais elles n'ont pas a occuper l'ecran en permanence :
              elles passent derriere un ⓘ, et les listes derriere un depliant. */}
          <div className={`${card} mb-4 p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <LifeBuoy className={`h-3.5 w-3.5 ${textQuat}`} />
                <span className={label}>{t('saasCampaign.desk.title')}</span>
                <button
                  type="button"
                  onClick={() => setMethodOpen(v => !v)}
                  title={t('saasCampaign.desk.methodShow') as string}
                  className={`rounded-full p-0.5 ${methodOpen ? 'text-primary' : textQuat} hover:text-primary`}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {pupitres.length > 0 && (
                  <select
                    value={dept}
                    onChange={(e) => void enregistrerPupitre(e.target.value)}
                    className="max-w-[200px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-primary dark:border-[#242424] dark:bg-[#0A0A0A] dark:text-white"
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

            {/* La methode reste disponible mais cesse d'occuper quatre lignes en permanence. */}
            {methodOpen && (
              <p className={`mt-3 max-w-[85ch] text-xs leading-relaxed ${textTer}`}>
                {t('saasCampaign.desk.method')}
              </p>
            )}

            {desk && (
              <>
                {/* Les familles cote a cote. Elles se comparent du regard au lieu de se succeder
                    sur deux ecrans de defilement. */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(desk.categorized || []).filter(f => f.issueType || f.csCategory).map(fam => {
                    const grave = fam.key === 'churn';
                    const max = Math.max(1, ...(fam.byMonth || []).map(x => x.n));
                    const ouvert = famOpen === fam.key;
                    return (
                      <div key={fam.key}
                        className={`rounded-xl border p-4 ${grave
                          ? 'border-red-200 bg-red-50/40 dark:border-red-900/40 dark:bg-red-950/10'
                          : 'border-gray-200 bg-gray-50/60 dark:border-[#1B1B1B] dark:bg-[#0A0A0A]'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className={`flex items-baseline gap-2`}>
                              <span className={`text-[28px] font-semibold leading-none ${grave ? 'text-red-700 dark:text-red-400' : textPri}`}>
                                {fam.total}
                              </span>
                              <span className={`truncate text-[13px] font-medium ${textSec}`}>
                                {t(`saasCampaign.desk.fam.${fam.key}`)}
                              </span>
                            </div>
                            <div className={`mt-1.5 text-[11px] ${textQuat}`}>
                              {t('saasCampaign.desk.cat.split', { open: fam.open ?? 0, closed: fam.closed ?? 0 })}
                              {fam.medianHoursToClose != null &&
                                ` · ${t('saasCampaign.desk.cat.median', { hours: fam.medianHoursToClose })}`}
                              {` · ${t('saasCampaign.desk.cat.matchedShort', { matched: fam.matchedToCampaign ?? 0 })}`}
                            </div>
                          </div>
                          {/* La regle de comptage suit le chiffre, en infobulle : elle doit rester
                              atteignable sans etre relue a chaque coup d'oeil. */}
                          <span
                            title={t('saasCampaign.desk.cat.rule', {
                              issueType: fam.issueType || '—', csCategory: fam.csCategory || '—' }) as string}
                            className={`shrink-0 cursor-help ${textQuat}`}
                          >
                            <Info className="h-3.5 w-3.5" />
                          </span>
                        </div>

                        {(fam.byMonth || []).length > 1 && (
                          <div className="mt-3 flex items-end gap-1" style={{ height: 30 }}>
                            {(fam.byMonth || []).map(m => (
                              <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-0.5"
                                   title={`${moisLisible(m.month, i18n.language)} · ${m.n}`}>
                                <div className={`w-full rounded-sm ${grave ? 'bg-red-400/70' : 'bg-primary/60'}`}
                                     style={{ height: `${Math.max(6, (m.n / max) * 100)}%` }} />
                              </div>
                            ))}
                          </div>
                        )}

                        {fam.list.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setFamOpen(ouvert ? null : fam.key)}
                            className={`mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium ${textTer} hover:text-primary`}
                          >
                            {ouvert ? t('saasCampaign.desk.hideTickets') : t('saasCampaign.desk.showTickets', { count: fam.total })}
                            <ChevronDown className={`h-3 w-3 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                        {ouvert && (
                          <div className="mt-2 max-h-72 space-y-1.5 overflow-auto pr-1">
                            {fam.list.map(k => (
                              <a key={k.id} href={k.url || undefined} target="_blank" rel="noreferrer"
                                 className="block rounded-lg px-2 py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]">
                                <div className={`truncate text-[12px] ${textSec}`}>{k.subject}</div>
                                <div className={`truncate text-[10px] ${textQuat}`}>
                                  {k.customerName || '—'}
                                  {k.inCampaign ? ` · ${t('saasCampaign.desk.cat.inCampaign')}` : ''}
                                  {k.statusType ? ` · ${k.statusType}` : ''}
                                </div>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Le volume d'ensemble, sur une seule ligne : c'est un reperage, pas une analyse. */}
                {desk.sinceNotice && desk.sinceNotice.tickets > 0 && (
                  <div className="mt-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-[#1B1B1B]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className={`text-lg font-semibold ${textPri}`}>{desk.sinceNotice.tickets}</span>
                        <span className={`text-xs ${textTer}`}>
                          {t('saasCampaign.desk.sinceNotice', { merchants: desk.sinceNotice.merchants })}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAllOpen(v => !v)}
                        className={`inline-flex items-center gap-1 text-[11px] font-medium ${textTer} hover:text-primary`}
                      >
                        {allOpen ? t('saasCampaign.desk.hideTickets') : t('saasCampaign.desk.showTickets', { count: desk.sinceNotice.tickets })}
                        <ChevronDown className={`h-3 w-3 transition-transform ${allOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    {/* Les categories en pastilles : huit valeurs sur une ligne au lieu de huit
                        lignes. C'est la forme d'une ventilation qu'on survole. */}
                    {desk.sinceNotice.byCategory.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {desk.sinceNotice.byCategory.slice(0, 10).map(c => (
                          <span key={c.category}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${neutralPill}`}>
                            {c.category}<span className="font-semibold">{c.n}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {allOpen && (
                      <div className="mt-2 max-h-80 space-y-1.5 overflow-auto pr-1">
                        {desk.sinceNotice.list.map(k => (
                          <a key={k.id} href={k.url || undefined} target="_blank" rel="noreferrer"
                             className="block rounded-lg px-2 py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]">
                            <div className={`truncate text-[12px] ${textSec}`}>{k.subject}</div>
                            <div className={`truncate text-[10px] ${textQuat}`}>
                              {k.customerName} · {t('saasCampaign.desk.daysAfter', { days: k.daysAfterNotice })}
                              {k.category ? ` · ${k.category}` : ''}
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* La comparaison appariee : quatre chiffres sur une ligne, avec son explication
                    d'absence juste dessous quand elle manque de recul. */}
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-gray-100 pt-3 dark:border-[#161616]">
                  <span className={label}>{t('saasCampaign.desk.paired')}</span>
                  {[
                    { l: t('saasCampaign.desk.before'), v: desk.before },
                    { l: t('saasCampaign.desk.after'), v: desk.after },
                    { l: t('saasCampaign.desk.delta'), v: `${desk.after - desk.before >= 0 ? '+' : '−'}${Math.abs(desk.after - desk.before)}`,
                      hi: desk.after > desk.before },
                    { l: t('saasCampaign.desk.coverage'), v: `${desk.merchantsMatched} / ${desk.eligible}` },
                  ].map((k, n) => (
                    <span key={n} className="inline-flex items-baseline gap-1.5">
                      <span className={`text-sm font-semibold ${k.hi ? 'text-amber-600 dark:text-amber-400' : textPri}`}>{k.v}</span>
                      <span className={`text-[11px] ${textQuat}`}>{k.l}</span>
                    </span>
                  ))}
                </div>

                {(desk.reason || desk.diag) && (
                  <p className={`mt-2 max-w-[85ch] text-[11px] leading-relaxed text-amber-700 dark:text-amber-400`}>
                    {desk.reason === 'no_notices'
                      ? t('saasCampaign.desk.why.noNotices')
                      : desk.reason === 'window_too_long'
                        ? t('saasCampaign.desk.why.windowTooLong', {
                            days: desk.days,
                            oldest: desk.oldestNotifiedAt ? new Date(desk.oldestNotifiedAt).toLocaleDateString(i18n.language) : '—',
                            notified: desk.notifiedTotal })
                        : t(`saasCampaign.desk.why.${desk.diag?.reason}`, {
                            merchants: desk.eligible,
                            accounts: desk.diag?.accountsMatched ?? 0,
                            anyDept: desk.diag?.ticketsAnyDept ?? 0,
                            anyWindow: desk.diag?.ticketsAnyWindow ?? 0,
                            days: desk.days })}
                  </p>
                )}

                <p className={`mt-2 text-[11px] ${textQuat}`}>
                  {dept
                    ? t('saasCampaign.desk.scopedTo', { name: pupitres.find(d => d.id === dept)?.name || dept })
                    : t('saasCampaign.desk.scopedAll')}
                </p>
              </>
            )}

            {!desk && (
              <p className={`mt-3 text-[11px] ${textQuat}`}>
                {dept
                  ? t('saasCampaign.desk.scopedTo', { name: pupitres.find(d => d.id === dept)?.name || dept })
                  : t('saasCampaign.desk.scopedAll')}
              </p>
            )}
          </div>
          {/* ── CE QUI FAIT MAL ────────────────────────────────────────────────────────────
              Meme traitement que les familles de billets : le chiffre et sa mise en garde
              restent au premier plan, la liste des comptes passe derriere un depliant. Elle
              peut compter vingt-cinq lignes et n'a pas a pousser tout le reste hors de l'ecran. */}
          <div className={`${card} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className={`h-3.5 w-3.5 ${data.churn.count > 0 ? 'text-red-500' : textQuat}`} />
                <span className={label}>{t('saasCampaign.churn')}</span>
              </div>
              {data.churn.count > 0 && (
                <button
                  type="button"
                  onClick={() => setChurnOpen(v => !v)}
                  className={`inline-flex items-center gap-1 text-[11px] font-medium ${textTer} hover:text-primary`}
                >
                  {churnOpen ? t('saasCampaign.desk.hideTickets') : t('saasCampaign.churnShow', { count: data.churn.count })}
                  <ChevronDown className={`h-3 w-3 transition-transform ${churnOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
            {data.churn.count === 0 ? (
              <p className={`mt-1.5 text-[13px] ${textTer}`}>{t('saasCampaign.churnNone')}</p>
            ) : (
              <>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
                  <span className="text-2xl font-semibold leading-none text-red-600 dark:text-red-400">{data.churn.count}</span>
                  <span className={`text-[13px] ${textSec}`}>
                    {t('saasCampaign.churnLost', { amount: money2(data.churn.mrrLost) })}
                  </span>
                </div>
                {/* Enonce en clair, parce qu'un tableau de bord qui affiche un churn a cote d'une
                    hausse de prix se lit comme une accusation. Un client annule pour mille
                    raisons ; ce chiffre dit qu'il faut regarder, pas qu'on sait pourquoi. */}
                <p className={`mt-1.5 max-w-[85ch] text-[11px] leading-relaxed ${textQuat}`}>{t('saasCampaign.churnCaveat')}</p>
                {churnOpen && (
                  <div className="mt-2 max-h-80 space-y-1 overflow-auto pr-1">
                    {data.churn.list.map((c) => (
                      <div key={c.subscriptionNumber}
                           className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]">
                        <div className="min-w-0">
                          <div className={`truncate text-[12px] font-medium ${textPri}`}>{c.customerName}</div>
                          <div className={`truncate font-mono text-[10px] ${textQuat}`}>
                            {c.subscriptionNumber} · {c.orgName}
                          </div>
                        </div>
                        <div className={`shrink-0 text-right text-[10px] ${textTer}`}>
                          <div className="tabular-nums">{money2(c.monthly)}/mo</div>
                          <div className={textQuat}>{t('saasCampaign.churnDates', { pushed: c.pushedAt, cancelled: c.cancelledAt })}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
