import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Select from '../../components/Select';
import { Modal, StatusPill } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { authHeaders } from '../../lib/auth';
import { appLocale, fmtDateOnly, fmtMoney, fmtMonth, fmtNumber } from '../../lib/format';
import { type PointsData, UNASSIGNED, isRisky, monthClock, project, repStatus, todayYmd } from '../PointsTracker/points';

// Tableau de bord de direction — proposition A « Cockpit » du canevas « Sales Hub — refonte UI »
// (planche « Tableau de bord gestionnaire · A — Cockpit (direction) »). Ce qu'il faut faire en
// haut, l'argent au centre (Zoho Billing), puis paiements et ventes du mois. Chaque chiffre vient
// d'un point d'accès existant ; l'historique du MRR vient de billing_metrics_monthly.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

type OrgMetrics = { orgId: string; name: string; mrr: number; arr: number; activeSubs: number; arpu: number; churned: number; churnRate: number; ltv: number };
type HistoryRow = { month: string; mrr: number; activeSubs: number; arpu: number; churnRate: number; ltv: number };
interface Billing {
  mrr: number; arr: number; activeSubs: number; arpu: number; churnedThisMonth: number; churnRate: number; ltv: number;
  orgCount: number; perOrg: OrgMetrics[]; history?: HistoryRow[];
}
interface PayrollPreview { dueBy: string | null; reps: { rep: string; total: number; sentAt?: string | null }[] }
interface AllStatus { books: { lastSyncAt: string | null }; crm: { lastSyncAt: string | null }; zentact: { lastSyncAt: string | null } }
interface DashboardData {
  avgProcessing: { clients: number; monthly: number } | null;
  avgRevenuePerMerchant: { merchants: number; activeMerchants?: number; monthly: number } | null;
}

const card = 'rounded-[20px] border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';
const linkCls = 'text-[13px] font-bold text-accent-ink hover:underline dark:text-[#F79C6A]';
const hoursSince = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 3.6e6 : Infinity);

/** « 432,5 k$ » — compact, dans la langue choisie. */
const compactMoney = (v: number) => new Intl.NumberFormat(appLocale(), {
  style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol', notation: 'compact', minimumFractionDigits: 1, maximumFractionDigits: 1,
}).format(v);
const pct = (v: number, digits = 1) => new Intl.NumberFormat(appLocale(), { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);

const AdminDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const today = todayYmd();
  const curYear = Number(today.slice(0, 4)), curMonth = Number(today.slice(5, 7));
  const [period, setPeriod] = useState(`${curYear}-${String(curMonth).padStart(2, '0')}`);
  const year = Number(period.slice(0, 4)), month = Number(period.slice(5, 7));

  const [billing, setBilling] = useState<Billing | null>(null);
  const [billingErr, setBillingErr] = useState(false);
  const [payroll, setPayroll] = useState<PayrollPreview | null>(null);
  const [points, setPoints] = useState<PointsData | null>(null);
  const [status, setStatus] = useState<AllStatus | null>(null);
  const [health, setHealth] = useState<{ total: number; parts: string[] } | null>(null);
  const [leads, setLeads] = useState<{ count: number; oldestAt: string | null } | null>(null);
  const [opps, setOpps] = useState<number | null>(null);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [orgsOpen, setOrgsOpen] = useState(false);

  // Une requête par bloc, chacune indépendante : un bloc en panne n'empêche pas les autres.
  useEffect(() => {
    const h = { headers: authHeaders() };
    axios.get(`${API_URL}/api/billing/metrics`, h).then((r) => setBilling(r.data)).catch(() => setBillingErr(true));
    axios.get(`${API_URL}/api/sync/all-status`, h).then((r) => setStatus(r.data)).catch(() => {});
    axios.get(`${API_URL}/api/leads/pending-count`, h).then((r) => setLeads(r.data)).catch(() => {});
    axios.get(`${API_URL}/api/admin/partner-opportunities/pending-count`, h).then((r) => setOpps(r.data?.count ?? 0)).catch(() => {});
    axios.get(`${API_URL}/api/dashboard`, { ...h, params: { year: curYear } }).then((r) => setDash(r.data)).catch(() => {});
    axios.get(`${API_URL}/api/admin/data-health`, h).then((r) => {
      const i = r.data?.issues || {};
      const parts = ([
        [i.unassignedInvoices?.count, 'unassignedInvoices'],
        [i.unassignedZentactMerchants, 'unassignedZentact'],
        [i.unassignedResellerActivations, 'unassignedResellers'],
        [i.repsNoRole?.count, 'repsNoRole'],
        [i.unmappedResellerEmails, 'unmappedEmails'],
        [i.userReports?.count, 'userReports'],
        [i.staleActiveMerchants?.count, 'staleMerchants'],
      ] as [unknown, string][]).filter(([n]) => Number(n) > 0).map(([n, k]) => t(`adminHub.health.${k}`, { count: Number(n) }) as string);
      setHealth({ total: r.data?.totalIssues || 0, parts });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paie et ventes suivent la période choisie.
  useEffect(() => {
    const h = { headers: authHeaders(), params: { year, month } };
    setPayroll(null); setPoints(null);
    axios.get(`${API_URL}/api/commissions/payroll/preview`, h).then((r) => setPayroll(r.data)).catch(() => {});
    axios.get(`${API_URL}/api/crm/points`, h).then((r) => setPoints(r.data)).catch(() => {});
  }, [year, month]);

  const periodOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(curYear, curMonth - 1 - i, 1));
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    const l = fmtMonth(y, m);
    return { value: `${y}-${String(m).padStart(2, '0')}`, label: l.charAt(0).toUpperCase() + l.slice(1) };
  }), [curYear, curMonth]);

  // ── En-tête ──
  const clockNow = monthClock(curYear, curMonth, today);
  const firstName = (user?.name || '').split(' ')[0];
  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const stale: string[] = [];
  if (status) {
    if (hoursSince(status.books.lastSyncAt) > 8) stale.push('Books');
    if (hoursSince(status.crm.lastSyncAt) > 3) stale.push('CRM');
    if (hoursSince(status.zentact.lastSyncAt) > 3) stale.push('Zentact');
  }

  // ── À faire ──
  const unsent = (payroll?.reps || []).filter((r) => !r.sentAt && r.total > 0);
  const payrollDue = unsent.reduce((s, r) => s + r.total, 0);
  const oldestH = leads?.oldestAt ? Math.max(0, Math.round(hoursSince(leads.oldestAt))) : null;
  // « Paie d'octobre » mais « Paie de mai » : l'élision dépend du mois (en anglais, le mois seul).
  const monthOnly = fmtMonth(year, month).split(' ')[0];
  const ofMonth = appLocale().startsWith('fr') ? (/^[aeiouyàâéèêh]/i.test(monthOnly) ? `d'${monthOnly}` : `de ${monthOnly}`) : monthOnly;
  const todo = [
    {
      key: 'payroll', to: '/admin/import-payments?onglet=payroll', strong: unsent.length > 0,
      label: payroll?.dueBy ? t('cockpit.todo.payrollDue', { ofMonth, date: fmtDateOnly(payroll.dueBy, { day: 'numeric', month: 'short' }) }) : t('cockpit.todo.payroll', { ofMonth }),
      labelCls: 'text-accent-ink dark:text-[#F79C6A]',
      value: payroll ? fmtMoney(payrollDue, { decimals: 0 }) : '…',
      sub: payroll ? (unsent.length ? t('cockpit.todo.payrollSub', { count: unsent.length }) : t('cockpit.todo.payrollDone')) : '',
      cta: t('cockpit.todo.payrollCta'),
    },
    {
      key: 'health', to: '/admin/data-health', strong: false,
      label: t('cockpit.todo.health'), labelCls: health?.total ? 'text-[#B42318] dark:text-[#F46060]' : 'text-body dark:text-bodydark2',
      value: health ? fmtNumber(health.total) : '…',
      sub: health ? (health.parts.slice(0, 2).join(', ') || t('cockpit.todo.healthNone')) : '',
      cta: t('cockpit.todo.healthCta'),
    },
    {
      key: 'leads', to: '/leads', strong: false,
      label: t('cockpit.todo.leads'), labelCls: 'text-body dark:text-bodydark2',
      value: leads ? fmtNumber(leads.count) : '…',
      sub: leads ? (leads.count && oldestH != null ? (oldestH < 48 ? t('cockpit.todo.leadsOldestH', { count: oldestH }) : t('cockpit.todo.leadsOldestD', { count: Math.round(oldestH / 24) })) : t('cockpit.todo.leadsNone')) : '',
      cta: t('cockpit.todo.leadsCta'),
    },
    {
      key: 'opps', to: '/admin/partners', strong: false,
      label: t('cockpit.todo.opps'), labelCls: 'text-body dark:text-bodydark2',
      value: opps == null ? '…' : fmtNumber(opps),
      sub: opps ? t('cockpit.todo.oppsSub') : t('cockpit.todo.oppsNone'),
      cta: t('cockpit.todo.oppsCta'),
    },
  ];

  // ── Revenu récurrent ──
  const hist = billing?.history || [];
  const prev = hist.length >= 2 ? hist[hist.length - 2] : null;
  const rel = (now: number, before: number | undefined) => (before ? (now - before) / before : null);
  const mrrDelta = billing && prev ? rel(billing.mrr, prev.mrr) : null;
  const prevLabel = prev ? fmtMonth(Number(prev.month.slice(0, 4)), Number(prev.month.slice(5, 7))).split(' ')[0] : '';
  const deltaPill = (d: number | null, goodWhenUp: boolean, text: string) => {
    if (d == null) return null;
    const fam = d === 0 ? 'neutral' : (d > 0) === goodWhenUp ? 'ok' : 'err';
    return <StatusPill family={fam}>{text}</StatusPill>;
  };
  const signed = (d: number, digits = 1) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${pct(Math.abs(d), digits)}`;
  const saas = billing ? [
    { key: 'subs', label: t('cockpit.mrr.activeSubs'), value: fmtNumber(billing.activeSubs),
      pill: prev ? deltaPill(billing.activeSubs - prev.activeSubs, true, `${billing.activeSubs - prev.activeSubs > 0 ? '+' : billing.activeSubs - prev.activeSubs < 0 ? '−' : ''}${fmtNumber(Math.abs(billing.activeSubs - prev.activeSubs))}`) : null },
    { key: 'arpu', label: t('cockpit.mrr.arpu'), value: fmtMoney(billing.arpu),
      pill: prev ? deltaPill(rel(billing.arpu, prev.arpu), true, signed(rel(billing.arpu, prev.arpu) || 0)) : null },
    { key: 'churn', label: t('cockpit.mrr.churn'), value: pct(billing.churnRate / 100, 2),
      pill: <StatusPill family={billing.churnRate < 1.5 ? 'neutral' : 'wait'}>{t('cockpit.mrr.churnedN', { count: billing.churnedThisMonth })}</StatusPill>,
      note: t('cockpit.mrr.churnTarget') },
    { key: 'ltv', label: t('cockpit.mrr.ltv'), value: fmtMoney(billing.ltv, { decimals: 0 }),
      pill: prev ? deltaPill(rel(billing.ltv, prev.ltv), true, signed(rel(billing.ltv, prev.ltv) || 0)) : null },
  ] : [];

  // Courbe du MRR (historique enregistré) : surface + ligne.
  const chart = useMemo(() => {
    if (hist.length < 2) return null;
    const vals = hist.map((h) => h.mrr);
    const lo = Math.min(...vals) * 0.98, hi = Math.max(...vals) * 1.02;
    const n = hist.length;
    const X = (i: number) => 76 + i * (554 / Math.max(n - 1, 1));
    const Y = (v: number) => 146 - ((v - lo) / Math.max(hi - lo, 1)) * 132;
    const line = vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${X(n - 1).toFixed(1)} 146 L${X(0).toFixed(1)} 146 Z`;
    const grid = [lo, (lo + hi) / 2, hi].map((v) => ({ y: Y(v), label: compactMoney(v) }));
    const labels = hist.map((h, i) => ({ x: X(i), label: fmtMonth(Number(h.month.slice(0, 4)), Number(h.month.slice(5, 7)), 'short').split(' ')[0] }))
      .filter((_, i) => i === 0 || i === n - 1 || i % Math.ceil(n / 5) === 0);
    return { line, area, grid, labels, endX: X(n - 1), endY: Y(vals[n - 1]) };
  }, [hist]);

  // ── Ventes du mois ──
  const sales = useMemo(() => {
    if (!points) return null;
    const clock = monthClock(year, month, today);
    const reps = points.reps.filter((r) => r.repName !== UNASSIGNED);
    const pts = points.companyPoints ?? reps.reduce((s, r) => s + r.totalPoints, 0);
    const target = points.companyTarget ?? reps.reduce((s, r) => s + (r.quota || 15), 0);
    const proj = project(pts, clock);
    const pace = Math.round(target * (clock.elapsed / Math.max(clock.total, 1)));
    const st = reps.map((r) => repStatus(r.totalPoints, r.quota || 15, project(r.totalPoints, clock), clock));
    return {
      clock, pts, target, proj, diff: pts - pace, n: reps.length,
      met: st.filter((s) => s === 'met' || s === 'tier').length,
      onTrack: st.filter((s) => s === 'onTrack').length,
      risk: st.filter(isRisky).length,
    };
  }, [points, year, month, today]);

  return (
    <div className="flex flex-col gap-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-2xl font-bold leading-tight tracking-[-0.01em] text-black dark:text-white">
            {firstName ? t('cockpit.hello', { name: firstName }) : t('cockpit.helloNoName')}
          </h1>
          <p className="m-0 mt-1 text-[13px] text-body first-letter:uppercase dark:text-bodydark2">
            {t('cockpit.subtitle', { date: dateLabel, count: clockNow.remaining, month: fmtMonth(curYear, curMonth).split(' ')[0] })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status && (stale.length === 0
            ? <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[rgba(23,178,106,0.12)] px-3 text-xs font-bold text-[#067647] dark:bg-[rgba(23,178,106,0.18)] dark:text-[#57D193]"><span className="h-[7px] w-[7px] rounded-full bg-[#17B26A]" />{t('cockpit.syncOk')}</span>
            : <Link to="/admin/sync" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[rgba(253,176,34,0.18)] px-3 text-xs font-bold text-[#B54708] dark:bg-[rgba(253,176,34,0.16)] dark:text-[#FDB022]"><span className="h-[7px] w-[7px] rounded-full bg-[#FDB022]" />{t('cockpit.syncStale', { list: stale.join(', ') })}</Link>)}
          <Select value={period} onChange={setPeriod} options={periodOptions} aria-label={t('cockpit.period') as string}
            buttonClassName="h-10 rounded-xl border border-stroke bg-white px-3 text-sm font-bold text-black dark:border-strokedark dark:bg-boxdark dark:text-white" />
        </div>
      </div>

      {/* À faire */}
      <section aria-labelledby="ck-todo-h" className="flex flex-col gap-2.5">
        <h2 id="ck-todo-h" className="m-0 text-lg font-bold text-black dark:text-white">{t('cockpit.todo.title')}</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {todo.map((c) => (
            <Link key={c.key} to={c.to}
              className={`flex flex-col gap-1.5 rounded-2xl border bg-white p-4 transition hover:border-primary dark:bg-boxdark ${c.strong ? 'border-primary' : 'border-stroke dark:border-strokedark'}`}>
              <span className={`text-xs font-bold ${c.labelCls}`}>{c.label}</span>
              <span className="text-2xl font-bold text-black dark:text-white">{c.value}</span>
              <span className="text-[13px] text-body dark:text-bodydark2">{c.sub}</span>
              <span className="mt-1 text-[13px] font-bold text-accent-ink dark:text-[#F79C6A]">{c.cta}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Revenu récurrent */}
      <section aria-labelledby="ck-mrr-h" className={`${card} flex flex-wrap gap-5 p-5 sm:p-[22px]`}>
        <div className="flex min-w-0 flex-[3_1_440px] flex-col gap-2.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="ck-mrr-h" className="m-0 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2">
                {t('cockpit.mrr.title', { count: billing?.orgCount ?? 3 })}
              </h2>
              <span className="text-[44px] font-bold leading-none tracking-[-0.02em] text-black dark:text-white">{billing ? compactMoney(billing.mrr) : billingErr ? '—' : '…'}</span>
              {billing && (
                <span className="text-sm text-[#424242] dark:text-bodydark">
                  ARR {compactMoney(billing.arr)}
                  {mrrDelta != null && <> · <b className={mrrDelta >= 0 ? 'text-[#067647] dark:text-[#57D193]' : 'text-[#B42318] dark:text-[#F46060]'}>{signed(mrrDelta)}</b> {t('cockpit.mrr.vs', { month: prevLabel })}</>}
                </span>
              )}
            </div>
            {billing && <button type="button" onClick={() => setOrgsOpen(true)} className={linkCls}>{t('cockpit.mrr.byOrg')}</button>}
          </div>
          {billingErr ? (
            <p className="m-0 text-sm text-body dark:text-bodydark2">{t('dashboard.billingUnavailable')}</p>
          ) : chart ? (
            <svg viewBox="0 0 640 170" width="100%" role="img" className="block"
              aria-label={t('cockpit.mrr.chartAria', { from: compactMoney(hist[0].mrr), to: compactMoney(hist[hist.length - 1].mrr), count: hist.length })}>
              {chart.grid.map((g, i) => (
                <g key={i}>
                  <line x1={76} x2={630} y1={g.y} y2={g.y} className="stroke-[#EFEFF1] dark:stroke-[#1F2023]" strokeWidth={1} />
                  <text x={68} y={g.y + 4} textAnchor="end" fontSize={11} className="fill-[#575A61] dark:fill-[#999AA7]">{g.label}</text>
                </g>
              ))}
              <path d={chart.area} className="fill-[rgba(245,131,69,0.12)] dark:fill-[rgba(245,131,69,0.14)]" stroke="none" />
              <path d={chart.line} fill="none" stroke="#F58345" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={chart.endX} cy={chart.endY} r={5} fill="#F58345" className="stroke-white dark:stroke-[#141414]" strokeWidth={2} />
              {chart.labels.map((l, i) => <text key={i} x={l.x} y={164} textAnchor="middle" fontSize={11} className="fill-[#575A61] dark:fill-[#999AA7]">{l.label}</text>)}
            </svg>
          ) : billing ? (
            <p className="m-0 rounded-xl bg-[#F7F7F8] px-3 py-2.5 text-[13px] text-body dark:bg-[#1B1B1B] dark:text-bodydark2">{t('cockpit.mrr.historyBuilding')}</p>
          ) : null}
        </div>
        <div className="flex flex-[2_1_280px] flex-col">
          {saas.map((s, i) => (
            <button key={s.key} type="button" onClick={() => setOrgsOpen(true)}
              className={`flex items-center justify-between gap-3 py-3.5 text-left ${i < saas.length - 1 ? 'border-b border-stroke dark:border-strokedark' : ''}`}>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] text-body dark:text-bodydark2">{s.label}</span>
                <span className="text-[22px] font-bold text-black dark:text-white">{s.value}</span>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                {s.pill}
                <span className="text-xs text-body dark:text-bodydark2">{s.note || (prev ? t('cockpit.mrr.vs', { month: prevLabel }) : t('cockpit.mrr.byOrgShort'))}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-5">
        {/* Paiements */}
        <section aria-labelledby="ck-pay-h" className={`${card} flex min-w-0 flex-[1_1_340px] flex-col gap-3.5 p-5`}>
          <h2 id="ck-pay-h" className="m-0 text-base font-bold text-black dark:text-white">{t('cockpit.pay.title')}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 rounded-[14px] bg-[#F7F7F8] p-3.5 dark:bg-[#1B1B1B]">
              <span className="text-xs text-body dark:text-bodydark2">{t('cockpit.pay.revenue')}</span>
              <span className="text-2xl font-bold text-black dark:text-white">{dash?.avgRevenuePerMerchant ? fmtMoney(dash.avgRevenuePerMerchant.monthly || 0) : '—'}</span>
              <span className="text-xs text-body dark:text-bodydark2">{t('cockpit.pay.perMonth')}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-[14px] bg-[#F7F7F8] p-3.5 dark:bg-[#1B1B1B]">
              <span className="text-xs text-body dark:text-bodydark2">{t('cockpit.pay.processing')}</span>
              <span className="text-2xl font-bold text-black dark:text-white">{dash?.avgProcessing ? fmtMoney(dash.avgProcessing.monthly || 0) : '—'}</span>
              <span className="text-xs text-body dark:text-bodydark2">{t('cockpit.pay.perMonth')}</span>
            </div>
          </div>
          {dash?.avgRevenuePerMerchant && (
            <span className="text-xs text-body dark:text-bodydark2">{t('cockpit.pay.basis', { count: dash.avgRevenuePerMerchant.merchants || 0 })}</span>
          )}
          <Link to="/revenue" className={linkCls}>{t('cockpit.pay.link')}</Link>
        </section>

        {/* Ventes du mois */}
        <section aria-labelledby="ck-sales-h" className={`${card} flex min-w-0 flex-[1_1_340px] flex-col gap-3 p-5`}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="ck-sales-h" className="m-0 text-base font-bold text-black dark:text-white">{t('cockpit.sales.title', { month: fmtMonth(year, month).split(' ')[0] })}</h2>
            {sales && sales.clock.current && sales.diff !== 0 && (
              <StatusPill family={sales.diff > 0 ? 'ok' : 'wait'}>{t(sales.diff > 0 ? 'cockpit.sales.ahead' : 'cockpit.sales.behind', { count: Math.abs(sales.diff) })}</StatusPill>
            )}
          </div>
          {sales ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-[32px] font-bold leading-none text-black dark:text-white">{sales.pts}</span>
                <span className="text-sm text-body dark:text-bodydark2">
                  / {sales.target} pts{sales.clock.current ? ` · ${t('cockpit.sales.projection', { n: sales.proj })}` : ''}
                </span>
              </div>
              <div role="img" aria-label={t('cockpit.sales.aria', { pts: sales.pts, target: sales.target, proj: sales.proj })}
                className="relative h-3 rounded-full bg-[#ECECEE] dark:bg-[#232323]">
                {sales.clock.current && <div className="absolute inset-y-0 left-0 rounded-full bg-[rgba(245,131,69,0.32)] dark:bg-[rgba(245,131,69,0.30)]" style={{ width: `${Math.min(100, (sales.proj / Math.max(sales.target, 1)) * 100)}%` }} />}
                <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.min(100, (sales.pts / Math.max(sales.target, 1)) * 100)}%` }} />
              </div>
              <dl className="m-0 flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-body dark:text-bodydark2">{t('cockpit.sales.atQuota')}</dt><dd className="m-0 font-bold text-black dark:text-white">{t('cockpit.sales.ofN', { n: sales.met, total: sales.n })}</dd></div>
                {sales.clock.current && <div className="flex justify-between"><dt className="text-body dark:text-bodydark2">{t('cockpit.sales.onTrack')}</dt><dd className="m-0 font-bold text-black dark:text-white">{sales.onTrack}</dd></div>}
                <div className="flex justify-between"><dt className="text-body dark:text-bodydark2">{t(sales.clock.current ? 'cockpit.sales.atRisk' : 'cockpit.sales.missed')}</dt><dd className={`m-0 font-bold ${sales.risk ? 'text-[#B54708] dark:text-[#FDB022]' : 'text-black dark:text-white'}`}>{sales.risk}</dd></div>
              </dl>
            </>
          ) : <p className="m-0 text-sm text-body dark:text-bodydark2">…</p>}
          <Link to="/commission-tracker" className={linkCls}>{t('cockpit.sales.link')}</Link>
        </section>
      </div>

      {/* Détail par organisation (Zoho Billing) */}
      <Modal open={orgsOpen && !!billing} onClose={() => setOrgsOpen(false)} size="lg" title={t('cockpit.orgs.title')}>
        {billing && (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-body dark:text-bodydark2">
                  <th scope="col" className="px-2 py-2 font-bold">{t('cockpit.orgs.org')}</th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">{t('cockpit.orgs.mrr')}</th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">{t('cockpit.mrr.activeSubs')}</th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">ARPU</th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">{t('cockpit.orgs.churn')}</th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">LTV</th>
                </tr>
              </thead>
              <tbody>
                {[...billing.perOrg, { orgId: 'total', name: t('dashboard.total'), mrr: billing.mrr, arr: billing.arr, activeSubs: billing.activeSubs, arpu: billing.arpu, churned: billing.churnedThisMonth, churnRate: billing.churnRate, ltv: billing.ltv }].map((o) => (
                  <tr key={o.orgId} className={`border-t border-stroke dark:border-strokedark ${o.orgId === 'total' ? 'font-bold' : ''}`}>
                    <th scope="row" className="px-2 py-2.5 text-left font-[inherit] text-black dark:text-white">{o.name}</th>
                    <td className="px-2 py-2.5 text-right text-black dark:text-white">{fmtMoney(o.mrr, { decimals: 0 })}</td>
                    <td className="px-2 py-2.5 text-right text-black dark:text-white">{fmtNumber(o.activeSubs)}</td>
                    <td className="px-2 py-2.5 text-right text-black dark:text-white">{fmtMoney(o.arpu)}</td>
                    <td className="px-2 py-2.5 text-right text-black dark:text-white">{pct(o.churnRate / 100, 2)} <span className="font-normal text-body dark:text-bodydark2">({o.churned})</span></td>
                    <td className="px-2 py-2.5 text-right text-black dark:text-white">{fmtMoney(o.ltv, { decimals: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminDashboard;
