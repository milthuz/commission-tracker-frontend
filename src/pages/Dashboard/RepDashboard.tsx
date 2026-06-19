import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDateOnly } from '../../utils/date';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const QUOTA = 15;

interface Deal { crm_deal_id: string; deal_name: string; account_name: string; lead_source_group: string; points: number; close_date: string; }
interface Merchant { merchant_account_id: string; business_name: string; points: number; bonus_amount: number; activated_at: string; }
interface RepRow {
  repName: string;
  totalPoints: number;
  quota: number;
  quotaMet: boolean;
  pointsToQuota: number;
  monthlyBonus: number;
  zentactBonus: number;
  zentactActivations: number;
  bonusTier: { points: number; bonus: number } | null;
  nextBonusTier: { points: number; bonus: number } | null;
  annualPoints: number;
  annualBonus: number;
  includeDeals?: boolean;
  team?: { id: number; name: string } | null;
  deals: Deal[];
  zentactMerchants: Merchant[];
}
interface PointsResp { viewerName?: string; reps: RepRow[]; }
interface ReportResp {
  baseSalary: number;
  months: { month: number; commission: number }[];
  summary: {
    currentMonth: { commission: number; revenue: number; invoices: number };
    ytd: { commission: number; revenue: number; invoices: number };
    pending: { count: number; commission: number };
  };
}
interface AnnualData {
  totalPoints: number;
  annualBonus: number;
  annualBonusEnabled?: boolean;
  nextTier: { points: number; bonus: number } | null;
  ptsToNextTier: number;
  tiers: { points: number; bonus: number }[];
}

const RepDashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const [points, setPoints] = useState<PointsResp | null>(null);
  const [report, setReport] = useState<ReportResp | null>(null);
  const [annual, setAnnual] = useState<AnnualData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fmt = (v: number) =>
    (Number(v) || 0).toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmt2 = (v: number) =>
    (Number(v) || 0).toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        setError('');
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const [p, r] = await Promise.all([
          axios.get(`${API_URL}/api/crm/points`, { headers, params: { year: now.getFullYear(), month: now.getMonth() + 1 } }),
          axios.get(`${API_URL}/api/commissions/report`, { headers, params: { year: now.getFullYear() } }),
        ]);
        setPoints(p.data);
        setReport(r.data);
        // Annual bonus tracking (tier ladder) for the viewer.
        const vn = (p.data.viewerName || '').toLowerCase();
        const meRow = (p.data.reps || []).find((x: RepRow) => x.repName.toLowerCase() === vn);
        if (meRow) {
          try {
            const a = await axios.get(`${API_URL}/api/crm/points/annual`, { headers, params: { year: now.getFullYear(), repName: meRow.repName } });
            setAnnual(a.data.annual);
          } catch { /* annual optional */ }
        }
      } catch (e: any) {
        setError(e?.response?.data?.error || 'Failed to load dashboard');
      } finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  if (loading) return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
  if (error) return (
    <div className="flex h-[60vh] items-center justify-center">
      <p className="text-danger">{error}</p>
    </div>
  );

  const viewer = (points?.viewerName || '').toLowerCase();
  const reps = points?.reps || [];
  const me = reps.find(r => r.repName.toLowerCase() === viewer) || null;
  const firstName = (me?.repName || '').split(' ')[0] || '';
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(now);

  // Leaderboard = the viewer's team (or whatever reps the API returned), totals only.
  const leaderboard = [...reps].sort((a, b) => b.totalPoints - a.totalPoints);
  const myRank = me ? leaderboard.findIndex(r => r.repName.toLowerCase() === viewer) + 1 : 0;

  const quotaPts = me?.quota || QUOTA;
  const pts = me?.totalPoints || 0;
  const quotaPct = Math.min(100, Math.round((pts / (quotaPts || QUOTA)) * 100));
  const ringColor = `hsl(${Math.round(quotaPct * 1.2)}, 72%, 45%)`;

  const monthCommission = report?.summary.currentMonth.commission || 0;
  const monthlyBonus = me?.monthlyBonus || 0;
  const zentactBonus = me?.zentactBonus || 0;
  const periodTotal = monthCommission + monthlyBonus + zentactBonus;
  const ytd = report?.summary.ytd.commission || 0;
  const pending = report?.summary.pending.commission || 0;

  // Recent activity: this month's deals + activations, newest first.
  const activity = [
    ...(me?.deals || []).map(d => ({ kind: 'deal' as const, label: d.deal_name, sub: d.account_name, pts: d.points, date: d.close_date })),
    ...(me?.zentactMerchants || []).map(m => ({ kind: 'activation' as const, label: m.business_name, sub: t('repDashboard.paymentActivation'), pts: m.points, date: m.activated_at })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);

  const tier = me?.bonusTier || null;
  const next = me?.nextBonusTier || null;

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white">
            {firstName ? t('repDashboard.greeting', { name: firstName }) : t('repDashboard.title')}
          </h2>
          <p className="text-sm capitalize text-gray-500 dark:text-gray-400">{t('repDashboard.subtitle', { month: monthName })}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/commission-report" className="rounded-lg border border-stroke bg-white px-3 py-2 text-sm font-medium text-black hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:text-white dark:hover:bg-meta-4">
            {t('repDashboard.myReport')}
          </Link>
        </div>
      </div>

      {/* Hero + quota ring */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl bg-primary p-6 text-white shadow-default lg:col-span-2">
          <p className="text-sm opacity-85">{t('repDashboard.commissionThisMonth')}</p>
          <p className="mt-1 text-4xl font-bold">{fmt2(monthCommission)}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-90">
            {monthlyBonus > 0 && <span>+ {fmt(monthlyBonus)} {t('repDashboard.monthlyBonus')}</span>}
            {zentactBonus > 0 && <span>+ {fmt(zentactBonus)} {t('repDashboard.activationBonus')}</span>}
            <span className="font-semibold">{t('repDashboard.periodTotal')}: {fmt2(periodTotal)}</span>
          </div>
          {monthCommission === 0 && (
            <p className="mt-2 rounded-md bg-white/15 px-3 py-1.5 text-[11px] leading-snug">
              {t('repDashboard.zeroCommissionNote')}
            </p>
          )}
          <p className="mt-2 text-[11px] opacity-70">{t('repDashboard.beforeTax')}</p>
        </div>
        <div className="flex items-center gap-5 rounded-xl border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="relative h-[92px] w-[92px] shrink-0">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 72 72">
              <circle className="text-gray-200 dark:text-gray-700" cx="36" cy="36" r="32" fill="none" stroke="currentColor" strokeWidth="7" />
              <circle cx="36" cy="36" r="32" fill="none" stroke={ringColor} strokeWidth="7" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 32} strokeDashoffset={(2 * Math.PI * 32) * (1 - quotaPct / 100)}
                style={{ transition: 'stroke-dashoffset .5s ease' }} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-bold" style={{ color: ringColor }}>{quotaPct}%</span>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">{t('repDashboard.quota')}</p>
            <p className="text-2xl font-bold text-black dark:text-white">{pts} <span className="text-sm font-normal text-gray-500">/ {quotaPts} pts</span></p>
            {me?.quotaMet
              ? <span className="mt-1 inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">✓ {t('repDashboard.quotaMet')}</span>
              : <span className="mt-1 inline-flex rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">{t('repDashboard.ptsToQuota', { count: me?.pointsToQuota ?? quotaPts })}</span>}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: t('repDashboard.ytdEarnings'), value: fmt(ytd), accent: 'text-black dark:text-white', hint: '' },
          { label: t('repDashboard.pendingCommission'), value: fmt(pending), accent: 'text-warning', hint: t('repDashboard.pendingHint') },
          { label: t('repDashboard.activations'), value: String(me?.zentactActivations || 0), accent: 'text-black dark:text-white', hint: '' },
          { label: t('repDashboard.dealsClosed'), value: String(me?.deals.length || 0), accent: 'text-black dark:text-white', hint: '' },
        ].map((c, i) => (
          <div key={i} className="rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
            <p className="text-xs font-medium text-gray-500">{c.label}</p>
            <p className={`mt-1 text-2xl font-bold ${c.accent}`}>{c.value}</p>
            {c.hint && <p className="mt-1 text-[11px] leading-snug text-gray-400">{c.hint}</p>}
          </div>
        ))}
      </div>

      {/* Monthly bonus progress */}
      {(tier || next) && (
        <div className="mt-4 rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-black dark:text-white">🎯 {t('repDashboard.bonusProgress')}</span>
            <span className="text-sm text-gray-500">
              {tier ? t('repDashboard.currentTier', { amount: fmt(tier.bonus) }) : t('repDashboard.noTierYet')}
              {next && ` · ${t('repDashboard.nextTier', { count: next.points - pts, amount: fmt(next.bonus) })}`}
            </span>
          </div>
        </div>
      )}

      {/* Annual bonus tracking */}
      {annual && (annual.tiers?.length > 0) && (
        <div className="mt-4 rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-black dark:text-white">🏆 {t('repDashboard.annualBonus', { year: now.getFullYear() })}</span>
            {annual.annualBonusEnabled === false ? (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-meta-4 dark:text-gray-300">{t('repDashboard.annualDisabled')}</span>
            ) : annual.annualBonus > 0 ? (
              <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">{t('repDashboard.annualEarned', { amount: fmt(annual.annualBonus) })}</span>
            ) : annual.nextTier ? (
              <span className="text-xs text-gray-500">{t('repDashboard.annualNext', { count: annual.ptsToNextTier, amount: fmt(annual.nextTier.bonus) })}</span>
            ) : null}
          </div>
          {annual.annualBonusEnabled === false ? (
            <p className="text-xs text-gray-500">{t('repDashboard.annualDisabledNote')}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">{t('repDashboard.annualYtdPoints', { count: annual.totalPoints })}</p>
              {annual.tiers.map(tr => {
                const reached = annual.totalPoints >= tr.points;
                const pct = Math.min(100, Math.round((annual.totalPoints / tr.points) * 100));
                return (
                  <div key={tr.points} className={`rounded-lg border p-2.5 ${reached ? 'border-success/40 bg-success/5' : 'border-stroke dark:border-strokedark'}`}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className={`font-semibold ${reached ? 'text-success' : 'text-body'}`}>{reached ? '✓ ' : ''}{tr.points} pts → {fmt(tr.bonus)}</span>
                      <span className="text-gray-400">{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-meta-4">
                      <div className={`h-1.5 rounded-full ${reached ? 'bg-success' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Leaderboard + recent activity */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Leaderboard */}
        <div className="rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="mb-3 flex items-center justify-between">
            <h5 className="text-sm font-semibold text-black dark:text-white">🏆 {t('repDashboard.leaderboard')}</h5>
            {me?.team && <span className="text-xs text-gray-500">{me.team.name}</span>}
          </div>
          <div className="space-y-1.5">
            {leaderboard.slice(0, 8).map((r, i) => {
              const isMe = r.repName.toLowerCase() === viewer;
              return (
                <div key={r.repName} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${isMe ? 'bg-primary/10' : ''}`}>
                  <span className={`truncate ${isMe ? 'font-semibold text-primary' : 'text-gray-600 dark:text-gray-300'}`}>
                    {i + 1}. {r.repName}{isMe ? ` (${t('repDashboard.you')})` : ''}
                  </span>
                  <span className={`shrink-0 font-semibold ${isMe ? 'text-primary' : 'text-black dark:text-white'}`}>{r.totalPoints} pts</span>
                </div>
              );
            })}
            {leaderboard.length === 0 && <p className="py-4 text-center text-sm text-gray-500">{t('repDashboard.noData')}</p>}
          </div>
          {myRank > 0 && <p className="mt-2 text-center text-xs text-gray-500">{t('repDashboard.yourRank', { rank: myRank, total: leaderboard.length })}</p>}
        </div>

        {/* Recent activity */}
        <div className="rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h5 className="mb-3 text-sm font-semibold text-black dark:text-white">📋 {t('repDashboard.recentActivity')}</h5>
          <div className="space-y-2">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-2 border-b border-stroke/50 pb-2 text-sm last:border-0 last:pb-0 dark:border-strokedark/50">
                <div className="min-w-0">
                  <p className="truncate font-medium text-black dark:text-white">{a.label}</p>
                  <p className="truncate text-xs text-gray-500">{a.sub} · {formatDateOnly(a.date, i18n.language)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white ${a.kind === 'activation' ? 'bg-[#6366F1]' : 'bg-[#8B5CF6]'}`}>
                  +{a.pts}
                </span>
              </div>
            ))}
            {activity.length === 0 && <p className="py-4 text-center text-sm text-gray-500">{t('repDashboard.noActivity')}</p>}
          </div>
        </div>
      </div>
    </>
  );
};

export default RepDashboard;
