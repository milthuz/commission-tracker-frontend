import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { appLocale, fmtDateOnly, fmtMoney, fmtPeriod } from '../../lib/format';
import ProbationBadge from '../../components/ProbationBadge';
import InvoiceLink from '../../components/InvoiceLink';
import { ContentLoader } from '../../common/Loader';
import { InlineError, StatusPill } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { getToken } from '../../lib/auth';

// Tableau de bord du représentant — refonte UI (P2, planche DeskAccueil).
// Le représentant veut savoir combien il touchera et ce qui lui manque pour y arriver :
//   1. « Ta paie du mois » : UN montant (le total réellement touché) et sa répartition ;
//   2. « Points et paliers » : le mois ET l'année au même endroit ;
//   3. « À faire » : les gestes concrets (rappels de pistes, ventes sans points, quota) ;
//   4. le classement, où la ligne du représentant est TOUJOURS visible ;
//   5. les ventes du mois, puis les meilleurs clients de l'année.
// Aucune nouvelle route : tout vient des mêmes appels qu'avant.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const QUOTA = 15;

// Projection de la prime semestrielle (demande de David, 2026-10-07).
// `settledAmount` = la part DÉFINITIVE ; l'écart avec `total` vient des comptes dont la
// fenêtre de 6 mois n'est pas encore couverte — ce montant-là peut encore monter ou DESCENDRE.
interface BonusForecast {
  period: string; total: number; settledAmount: number; pendingAmount: number;
  openAccounts: number; dataThrough: string | null;
}
interface Deal { crm_deal_id: string; deal_name: string; account_name: string; lead_source_group: string; points: number; close_date: string; }
interface Merchant { merchant_account_id: string; business_name: string; points: number; bonus_amount: number; activated_at: string; }
interface Tier { points: number; bonus: number }
interface RepRow {
  repName: string; totalPoints: number; quota: number; quotaMet: boolean; pointsToQuota: number;
  monthlyBonus: number; zentactBonus: number; zentactActivations: number;
  bonusTier: Tier | null; nextBonusTier: Tier | null;
  team?: { id: number; name: string } | null;
  deals: Deal[]; zentactMerchants: Merchant[];
}
interface PointsResp { viewerName?: string; reps: RepRow[]; }
interface CustomerRow { customerName: string; invoices: number; revenue: number; commission: number; }
interface DrillInvoice { invoiceNumber: string; date: string; commission: number; status: string; }
interface ReportResp {
  repName: string;
  probation?: { inProbation: boolean; endDate: string | null; daysLeft: number | null } | null;
  months: { month: number; commission: number; quotaForfeited?: number }[];
  customers: CustomerRow[];
  summary: {
    currentMonth: { commission: number; revenue: number; invoices: number };
    ytd: { commission: number; revenue: number; invoices: number };
    pending: { count: number; commission: number };
  };
}
interface AnnualData { totalPoints: number; annualBonus: number; annualBonusEnabled?: boolean; nextTier: Tier | null; ptsToNextTier: number; tiers: Tier[]; }
interface LeadLite { id: number; businessName: string; callbackAt: string | null; booking?: { status: string | null }; crm?: { dealId: string | null } }

const card = 'rounded-[20px] border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark';
const eyebrow = 'm-0 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2';

/** A progress bar with tick marks (quota, bonus tiers) under it. */
function TierBar({ value, max, ticks, label }: { value: number; max: number; ticks: { at: number; text: string }[]; label: string }) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / (max || 1)) * 100))}%`;
  return (
    <div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-stroke dark:bg-strokedark" role="img" aria-label={label}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: pct(value) }} />
        {ticks.filter((tk) => tk.at > 0 && tk.at < max).map((tk) => (
          <div key={tk.at} className="absolute inset-y-0 w-0.5 bg-white dark:bg-boxdark" style={{ left: pct(tk.at) }} />
        ))}
      </div>
      <div aria-hidden="true" className="relative mt-1 h-4 text-[11px] text-body dark:text-bodydark2">
        {ticks.map((tk) => (
          <span key={tk.at} className="absolute whitespace-nowrap" style={tk.at >= max ? { right: 0 } : { left: pct(tk.at), transform: 'translateX(-50%)' }}>{tk.text}</span>
        ))}
      </div>
    </div>
  );
}

const RepDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const perms = user?.permissions || [];
  const canPerm = (p: string) => perms.includes('*') || perms.includes(p) || perms.includes(`${p.split(':')[0]}:*`);
  const now = new Date();
  const curMonth = now.getMonth() + 1;

  const [points, setPoints] = useState<PointsResp | null>(null);
  const [report, setReport] = useState<ReportResp | null>(null);
  const [annual, setAnnual] = useState<AnnualData | null>(null);
  const [forecast, setForecast] = useState<BonusForecast | null>(null);
  const [callbacks, setCallbacks] = useState<LeadLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [drillInvoices, setDrillInvoices] = useState<DrillInvoice[]>([]);
  const [loadingDrill, setLoadingDrill] = useState(false);

  const headers = () => ({ Authorization: `Bearer ${getToken()}` });

  // Projection de la prime semestrielle : chargée à part, car `report:bonus_forecast` n'est pas
  // donnée à tout le monde — un 403 fait disparaître la ligne, pas tout le tableau de bord.
  useEffect(() => {
    axios.get(`${API_URL}/api/commissions/processing-bonus/projection`, { headers: headers() })
      .then((r) => setForecast(r.data)).catch(() => setForecast(null));
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [p, r] = await Promise.all([
        axios.get(`${API_URL}/api/crm/points`, { headers: headers(), params: { year: now.getFullYear(), month: curMonth } }),
        axios.get(`${API_URL}/api/commissions/report`, { headers: headers(), params: { year: now.getFullYear() } }),
      ]);
      setPoints(p.data);
      setReport(r.data);
      const vn = (p.data.viewerName || '').toLowerCase();
      const meRow = (p.data.reps || []).find((x: RepRow) => x.repName.toLowerCase() === vn);
      if (meRow) {
        // Paliers annuels — facultatif.
        axios.get(`${API_URL}/api/crm/points/annual`, { headers: headers(), params: { year: now.getFullYear(), repName: meRow.repName } })
          .then((a) => setAnnual(a.data.annual)).catch(() => {});
        // Rappels de pistes : seulement pour qui voit des pistes, et seulement les siennes.
        if (['leads:view_own', 'leads:view_all', 'leads:review'].some(canPerm)) {
          fetch(`${API_URL}/api/leads?status=accepted&rep=${encodeURIComponent(meRow.repName)}&limit=50`, { headers: headers() })
            .then((res) => (res.ok ? res.json() : { leads: [] }))
            .then((d) => setCallbacks(d.leads || []))
            .catch(() => {});
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || t('errors.loadFailed'));
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleCustomerDrill = async (customerName: string, repName: string) => {
    if (expandedCustomer === customerName) { setExpandedCustomer(null); setDrillInvoices([]); return; }
    setExpandedCustomer(customerName);
    setLoadingDrill(true);
    try {
      const res = await axios.get(`${API_URL}/api/commissions/invoices`, {
        headers: headers(), params: { year: now.getFullYear(), customer: customerName, repName },
      });
      setDrillInvoices(res.data.invoices || []);
    } catch { setDrillInvoices([]); }
    finally { setLoadingDrill(false); }
  };

  if (loading) return <ContentLoader />;
  if (error) return <InlineError className="mx-auto mt-10 max-w-xl" title={t('repDashboard.v2.loadError')} detail={error} onRetry={fetchAll} />;

  const viewer = (points?.viewerName || '').toLowerCase();
  const reps = points?.reps || [];
  const me = reps.find((r) => r.repName.toLowerCase() === viewer) || null;
  const firstName = (me?.repName || user?.name || '').split(' ')[0] || '';
  const locale = appLocale();
  const monthLong = now.toLocaleDateString(locale, { month: 'long' });
  const monthEnd = new Date(now.getFullYear(), curMonth, 0).toLocaleDateString(locale, { day: 'numeric', month: 'long' });

  // ── Paie du mois ───────────────────────────────────────────────────────────────────
  const monthCommission = report?.summary.currentMonth.commission || 0;
  const monthlyBonus = me?.monthlyBonus || 0;
  const zentactBonus = me?.zentactBonus || 0;
  const periodTotal = monthCommission + monthlyBonus + zentactBonus;
  const forfeited = report?.months?.find((m) => m.month === curMonth)?.quotaForfeited || 0;
  const parts = [
    { key: 'commission', label: t('repDashboard.v2.partCommission'), value: monthCommission, cls: 'bg-primary' },
    { key: 'bonus', label: t('repDashboard.v2.partMonthlyBonus'), value: monthlyBonus, cls: 'bg-[#D16630] dark:bg-[#FBCDB5]' },
    { key: 'activation', label: t('repDashboard.v2.partActivations', { count: me?.zentactActivations || 0 }), value: zentactBonus, cls: 'bg-body dark:bg-bodydark2' },
  ];

  // ── Points et paliers ──────────────────────────────────────────────────────────────
  const quota = me?.quota || QUOTA;
  const pts = me?.totalPoints || 0;
  const tier = me?.bonusTier || null;
  const next = me?.nextBonusTier || null;
  const monthTicks = [{ at: quota, text: t('repDashboard.v2.quotaTick', { n: quota }) }];
  [tier, next].forEach((tr) => { if (tr && tr.points !== quota && !monthTicks.some((x) => x.at === tr.points)) monthTicks.push({ at: tr.points, text: String(tr.points) }); });
  const monthMax = Math.max(pts, ...monthTicks.map((x) => x.at)) || 1;
  const annualTiers = [...(annual?.tiers || [])].sort((a, b) => a.points - b.points);
  const showAnnual = !!annual && annual.annualBonusEnabled !== false && annualTiers.length > 0;
  const annualMax = annualTiers.length ? annualTiers[annualTiers.length - 1].points : 1;
  const callout = !me ? '' : !me.quotaMet
    ? `${t('repDashboard.v2.calloutQuota', { count: me.pointsToQuota, date: monthEnd })}${forfeited > 0 ? ' ' + t('repDashboard.v2.calloutUnlock', { amount: fmtMoney(forfeited) }) : ''}`
    : next ? t('repDashboard.v2.calloutNextTier', { count: next.points - pts, amount: fmtMoney(next.bonus, { decimals: 0 }) }) : '';

  // ── À faire ────────────────────────────────────────────────────────────────────────
  type Todo = { key: string; tone: 'new' | 'wait' | 'err' | 'neutral'; title: string; sub: string; to: string; action: string };
  const todos: Todo[] = [];
  const soon = now.getTime() + 48 * 3600e3, recent = now.getTime() - 2 * 3600e3;
  callbacks
    .filter((l) => l.callbackAt && l.booking?.status !== 'cancelled' && !l.crm?.dealId)
    .filter((l) => { const ts = new Date(l.callbackAt!).getTime(); return ts >= recent && ts <= soon; })
    .sort((a, b) => new Date(a.callbackAt!).getTime() - new Date(b.callbackAt!).getTime())
    .slice(0, 3)
    .forEach((l) => todos.push({
      key: `lead-${l.id}`, tone: new Date(l.callbackAt!).getTime() < now.getTime() ? 'wait' : 'new',
      title: t('repDashboard.v2.todoCallback', { name: l.businessName }),
      sub: new Date(l.callbackAt!).toLocaleString(locale, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      to: '/leads', action: t('repDashboard.v2.open'),
    }));
  (me?.deals || []).filter((d) => !d.points).slice(0, 3).forEach((d) => todos.push({
    key: `deal-${d.crm_deal_id}`, tone: 'err',
    title: t('repDashboard.v2.todoNoPoints', { name: d.deal_name || d.account_name }),
    sub: d.lead_source_group ? t('repDashboard.v2.todoNoPointsSub') : t('repDashboard.v2.todoNoSourceSub'),
    to: '/commission-tracker', action: t('repDashboard.v2.check'),
  }));
  if (me && !me.quotaMet) todos.push({
    key: 'quota', tone: 'neutral',
    title: t('repDashboard.v2.todoQuota', { count: me.pointsToQuota }),
    sub: t('repDashboard.v2.todoQuotaSub', { date: monthEnd }),
    to: '/commission-tracker', action: t('repDashboard.v2.see'),
  });
  const dotCls: Record<Todo['tone'], string> = { new: 'bg-primary', wait: 'bg-[#FDB022]', err: 'bg-[#F46060]', neutral: 'bg-body dark:bg-bodydark2' };

  // ── Classement : top 5, et la ligne du représentant toujours visible ───────────────
  const board = [...reps].sort((a, b) => b.totalPoints - a.totalPoints);
  const myRank = me ? board.findIndex((r) => r.repName.toLowerCase() === viewer) + 1 : 0;
  const top = board.slice(0, 5);

  // ── Ventes du mois ─────────────────────────────────────────────────────────────────
  const sales = [
    ...(me?.deals || []).map((d) => ({ key: `d-${d.crm_deal_id}`, name: d.deal_name || d.account_name, source: d.lead_source_group, date: d.close_date, pts: d.points })),
    ...(me?.zentactMerchants || []).map((m) => ({ key: `z-${m.merchant_account_id}`, name: m.business_name, source: t('repDashboard.paymentActivation'), date: m.activated_at, pts: m.points })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="flex max-w-[1240px] flex-col gap-5">
      {/* En-tête */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-2xl font-bold leading-tight tracking-[-0.01em] text-black dark:text-white">
            {firstName ? t('repDashboard.greeting', { name: firstName }) : t('repDashboard.title')}
          </h1>
          <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-body dark:text-bodydark2">
            <span className="first-letter:uppercase">{now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <ProbationBadge probation={report?.probation} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/commission-report" className="inline-flex h-10 items-center rounded-xl border border-stroke bg-white px-3.5 text-sm font-medium text-black hover:bg-gray-2 dark:border-strokedark dark:bg-boxdark dark:text-white dark:hover:bg-meta-4">
            {t('repDashboard.myReport')}
          </Link>
          {canPerm('leads:intake') && (
            <Link to="/leads?nouvelle=1" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-bold text-[#141414] hover:bg-[#F79C6A]">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              {t('repDashboard.v2.newLead')}
            </Link>
          )}
        </div>
      </header>

      <div className="flex flex-wrap gap-5">
        {/* Ta paie du mois */}
        <section aria-labelledby="pay-h" className={`${card} flex min-w-0 flex-[3_1_480px] flex-col gap-[18px]`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <h2 id="pay-h" className={eyebrow}>{t('repDashboard.v2.payTitle', { month: monthLong })}</h2>
              <span className="text-[44px] font-bold leading-none tracking-[-0.02em] text-black dark:text-white">{fmtMoney(periodTotal)}</span>
              <span className="text-sm text-[#424242] dark:text-bodydark">{t('repDashboard.beforeTax')}</span>
            </div>
            {forfeited > 0 && !me?.quotaMet && (
              <StatusPill family="wait" className="px-2.5 py-[5px]">{t('repDashboard.v2.heldUnderQuota', { amount: fmtMoney(forfeited) })}</StatusPill>
            )}
          </div>
          {periodTotal > 0 && (
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-stroke dark:bg-strokedark" role="img"
              aria-label={parts.filter((p) => p.value > 0).map((p) => `${p.label} ${fmtMoney(p.value)}`).join(', ')}>
              {parts.filter((p) => p.value > 0).map((p) => <div key={p.key} className={p.cls} style={{ width: `${(p.value / periodTotal) * 100}%` }} />)}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {parts.map((p) => (
              <div key={p.key} className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[13px] text-body dark:text-bodydark2"><span className={`h-2 w-2 rounded-sm ${p.cls}`} />{p.label}</span>
                <span className="text-lg font-bold text-black dark:text-white">{fmtMoney(p.value)}</span>
              </div>
            ))}
          </div>
          {monthCommission === 0 && <p className="m-0 rounded-xl bg-gray-2 px-3 py-2 text-xs leading-snug text-[#424242] dark:bg-meta-4 dark:text-bodydark">{t('repDashboard.zeroCommissionNote')}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-stroke pt-3.5 text-[13px] text-body dark:border-strokedark dark:text-bodydark2">
            <span>{t('repDashboard.v2.ytd', { year: now.getFullYear() })} <b className="font-bold text-black dark:text-white">{fmtMoney(report?.summary.ytd.commission || 0)}</b></span>
            <span title={t('repDashboard.pendingHint') as string}>{t('repDashboard.pendingCommission')} <b className="font-bold text-black dark:text-white">{fmtMoney(report?.summary.pending.commission || 0)}</b></span>
            {/* 🔑 Prime semestrielle : DEUX montants, jamais un seul — l'acquis d'abord ; la
                projection peut encore monter ou descendre tant que la fenêtre n'est pas close. */}
            {forecast && forecast.total > 0 && (
              <span title={(forecast.pendingAmount > 0 ? t('repDashboard.forecast.note', { through: forecast.dataThrough || '—' }) : t('repDashboard.forecast.noteSettled', { through: forecast.dataThrough || '—' })) as string}>
                {t('repDashboard.v2.forecast', { period: fmtPeriod(forecast.period) })}{' '}
                <b className="font-bold text-black dark:text-white">{fmtMoney(forecast.settledAmount)}</b> {t('repDashboard.v2.settled')}
                {forecast.pendingAmount > 0 && <> · <b className="font-bold text-accent-ink dark:text-accent-ink-dark">{fmtMoney(forecast.total)}</b> {t('repDashboard.v2.projected')}</>}
              </span>
            )}
          </div>
        </section>

        {/* Points et paliers */}
        <section aria-labelledby="pts-h" className={`${card} flex min-w-0 flex-[2_1_340px] flex-col gap-4`}>
          <h2 id="pts-h" className={eyebrow}>{t('repDashboard.v2.pointsTitle')}</h2>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-bold capitalize text-black dark:text-white">{monthLong}</span>
              <span className="text-sm text-[#424242] dark:text-bodydark"><b className="text-[22px] text-black dark:text-white">{pts}</b> / {quota} pts</span>
            </div>
            <TierBar value={pts} max={monthMax} ticks={monthTicks} label={t('repDashboard.v2.monthBarLabel', { pts, quota })} />
            {tier && <span className="text-xs text-success">✓ {t('repDashboard.currentTier', { amount: fmtMoney(tier.bonus, { decimals: 0 }) })}</span>}
          </div>
          {showAnnual && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] font-bold text-black dark:text-white">{t('repDashboard.v2.year', { year: now.getFullYear() })}</span>
                <span className="text-sm text-[#424242] dark:text-bodydark"><b className="text-[22px] text-black dark:text-white">{annual!.totalPoints}</b> / {(annual!.nextTier || annualTiers[annualTiers.length - 1]).points} pts</span>
              </div>
              <TierBar value={annual!.totalPoints} max={annualMax} ticks={annualTiers.map((tr) => ({ at: tr.points, text: String(tr.points) }))}
                label={t('repDashboard.v2.yearBarLabel', { pts: annual!.totalPoints, tiers: annualTiers.map((tr) => tr.points).join(', ') })} />
              {annual!.annualBonus > 0
                ? <span className="text-xs text-success">✓ {t('repDashboard.annualEarned', { amount: fmtMoney(annual!.annualBonus, { decimals: 0 }) })}</span>
                : annual!.nextTier && <span className="text-xs text-body dark:text-bodydark2">{t('repDashboard.annualNext', { count: annual!.ptsToNextTier, amount: fmtMoney(annual!.nextTier.bonus, { decimals: 0 }) })}</span>}
            </div>
          )}
          {callout && <p className="m-0 rounded-xl bg-[rgba(245,131,69,0.14)] px-3 py-2.5 text-[13px] font-medium leading-snug text-accent-ink dark:bg-[rgba(245,131,69,0.16)] dark:text-accent-ink-dark">{callout}</p>}
        </section>
      </div>

      <div className="flex flex-wrap gap-5">
        {/* À faire */}
        <section aria-labelledby="todo-h" className="flex min-w-0 flex-[3_1_480px] flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <h2 id="todo-h" className="m-0 text-lg font-bold text-black dark:text-white">{t('repDashboard.v2.todoTitle')}</h2>
            {todos.length > 0 && <span className="rounded-full bg-primary px-2 py-px text-xs font-bold text-[#141414]">{todos.length}</span>}
          </div>
          <div className="flex flex-col rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
            {todos.length === 0 && <p className="m-0 px-4 py-6 text-center text-sm text-body dark:text-bodydark2">{t('repDashboard.v2.todoNone')}</p>}
            {todos.map((td) => (
              <Link key={td.key} to={td.to} className="flex items-center gap-3 border-b border-stroke px-4 py-3.5 text-black last:border-b-0 hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-[#1B1B1B]">
                <span className={`h-2 w-2 flex-none rounded-full ${dotCls[td.tone]}`} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-medium">{td.title}</span>
                  <span className="truncate text-[13px] text-body first-letter:uppercase dark:text-bodydark2">{td.sub}</span>
                </span>
                <span className="text-[13px] font-bold text-accent-ink dark:text-accent-ink-dark">{td.action}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Classement */}
        <section aria-labelledby="lb-h" className="flex min-w-0 flex-[2_1_340px] flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="lb-h" className="m-0 text-lg font-bold text-black dark:text-white">{t('repDashboard.v2.leaderboard', { month: monthLong })}</h2>
            {me?.team && <span className="text-xs text-body dark:text-bodydark2">{me.team.name}</span>}
          </div>
          <ol className="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-stroke bg-white p-0 dark:border-strokedark dark:bg-boxdark">
            {board.length === 0 && <li className="px-4 py-6 text-center text-sm text-body dark:text-bodydark2">{t('repDashboard.noData')}</li>}
            {[...top, ...(myRank > top.length && me ? [me] : [])].map((r, i, arr) => {
              const isMe = r.repName.toLowerCase() === viewer;
              const rank = isMe ? myRank : i + 1;
              const gap = isMe && myRank > top.length;
              return (
                <li key={r.repName} className={`flex items-center gap-3 px-4 py-3 ${i < arr.length - 1 ? 'border-b border-stroke dark:border-strokedark' : ''} ${gap ? 'border-t-2 border-dashed' : ''} ${isMe ? 'bg-[rgba(245,131,69,0.14)] dark:bg-[rgba(245,131,69,0.16)]' : ''}`}>
                  <span className={`w-5 text-[13px] font-bold ${isMe ? 'text-accent-ink dark:text-accent-ink-dark' : 'text-body dark:text-bodydark2'}`}>{rank}</span>
                  <span className={`min-w-0 flex-1 truncate text-sm ${isMe ? 'font-bold text-accent-ink dark:text-accent-ink-dark' : 'font-medium text-black dark:text-white'}`}>
                    {isMe ? <span className="first-letter:uppercase inline-block">{t('repDashboard.you')}</span> : r.repName}
                  </span>
                  <span className={`text-sm font-bold ${isMe ? 'text-accent-ink dark:text-accent-ink-dark' : 'text-black dark:text-white'}`}>{r.totalPoints} pts</span>
                </li>
              );
            })}
          </ol>
          {myRank > 0 && <p className="m-0 text-center text-xs text-body dark:text-bodydark2">{t('repDashboard.yourRank', { rank: myRank, total: board.length })}</p>}
        </section>
      </div>

      {/* Ventes du mois */}
      <section aria-labelledby="sales-h" className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 id="sales-h" className="m-0 text-lg font-bold text-black dark:text-white">{t('repDashboard.v2.salesTitle', { month: monthLong })}</h2>
          <Link to="/commission-tracker" className="text-sm font-bold text-accent-ink hover:underline dark:text-accent-ink-dark">{t('repDashboard.v2.seeTracker')}</Link>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
          {sales.length === 0 ? (
            <p className="m-0 px-4 py-6 text-center text-sm text-body dark:text-bodydark2">{t('repDashboard.noActivity')}</p>
          ) : (
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-body dark:text-bodydark2">
                  <th className="border-b border-stroke px-4 py-3 font-bold dark:border-strokedark">{t('repDashboard.v2.colClient')}</th>
                  <th className="border-b border-stroke px-4 py-3 font-bold dark:border-strokedark">{t('repDashboard.v2.colSource')}</th>
                  <th className="border-b border-stroke px-4 py-3 font-bold dark:border-strokedark">{t('repDashboard.v2.colDate')}</th>
                  <th className="border-b border-stroke px-4 py-3 text-right font-bold dark:border-strokedark">{t('repDashboard.v2.colPoints')}</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s, i) => (
                  <tr key={s.key} className={i < sales.length - 1 ? 'border-b border-stroke dark:border-strokedark' : ''}>
                    <td className="px-4 py-3 font-medium text-black dark:text-white">{s.name}</td>
                    <td className="px-4 py-3">
                      {s.source
                        ? <span className="text-[#424242] dark:text-bodydark">{s.source}</span>
                        : <StatusPill family="err">{t('repDashboard.v2.sourceMissing')}</StatusPill>}
                    </td>
                    <td className="px-4 py-3 text-[#424242] dark:text-bodydark">{fmtDateOnly(s.date, { day: 'numeric', month: 'short' })}</td>
                    <td className="px-4 py-3 text-right font-bold text-black dark:text-white">{s.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Meilleurs clients de l'année (commission) */}
      {(report?.customers?.length ?? 0) > 0 && (
        <section aria-labelledby="cust-h" className="flex flex-col gap-2.5">
          <div className="flex flex-col">
            <h2 id="cust-h" className="m-0 text-lg font-bold text-black dark:text-white">{t('repDashboard.topCustomers', { year: now.getFullYear() })}</h2>
            <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('repDashboard.topCustomersSub')}</p>
          </div>
          <div className="flex max-h-[480px] flex-col overflow-y-auto rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
            {(() => {
              const maxComm = Math.max(...report!.customers.map((c) => c.commission), 1);
              return report!.customers.map((c, idx) => {
                const open = expandedCustomer === c.customerName;
                return (
                  <div key={c.customerName} className="border-b border-stroke last:border-b-0 dark:border-strokedark">
                    <button type="button" aria-expanded={open} onClick={() => toggleCustomerDrill(c.customerName, report!.repName)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-2 dark:hover:bg-[#1B1B1B]">
                      <span className="w-5 text-[13px] font-bold text-body dark:text-bodydark2">{idx + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="mb-1.5 flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium text-black dark:text-white">{c.customerName}</span>
                          <span className="text-sm font-bold text-black dark:text-white">{fmtMoney(c.commission)}</span>
                        </span>
                        <span className="block h-1.5 overflow-hidden rounded-full bg-stroke dark:bg-strokedark">
                          <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, Math.round((c.commission / maxComm) * 100))}%` }} />
                        </span>
                        <span className="mt-1 flex justify-between text-xs text-body dark:text-bodydark2">
                          <span>{c.invoices} {c.invoices !== 1 ? t('repDashboard.invoicesLower') : t('repDashboard.invoiceLower')}</span>
                          <span>{t('repDashboard.revenueLabel')}: {fmtMoney(c.revenue)}</span>
                        </span>
                      </span>
                      <svg aria-hidden="true" className={`h-4 w-4 flex-none text-body transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                    {open && (
                      <div className="border-t border-stroke px-4 py-2 pl-12 dark:border-strokedark">
                        {loadingDrill ? (
                          <p className="m-0 py-2 text-xs text-body dark:text-bodydark2">{t('common.loading')}</p>
                        ) : (() => {
                          // Only invoices that actually earned commission (the list total is commission-only).
                          const rows = drillInvoices.filter((inv) => inv.commission > 0);
                          return rows.length === 0 ? (
                            <p className="m-0 py-1.5 text-xs text-body dark:text-bodydark2">{t('repDashboard.noInvoices')}</p>
                          ) : (
                            <div className="flex flex-col gap-1 py-1">
                              {rows.map((inv) => (
                                <div key={inv.invoiceNumber} className="flex items-center justify-between gap-2 text-xs">
                                  <InvoiceLink number={inv.invoiceNumber} className="font-medium text-accent-ink hover:underline dark:text-accent-ink-dark" />
                                  <span className="text-body dark:text-bodydark2">{fmtDateOnly(inv.date)}</span>
                                  <span className="font-semibold text-black dark:text-white">{fmtMoney(inv.commission)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </section>
      )}
    </div>
  );
};

export default RepDashboard;
