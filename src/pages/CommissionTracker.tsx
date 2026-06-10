import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { formatDateOnly } from '../utils/date';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const QUOTA = 15;

interface Deal {
  crm_deal_id: string;
  deal_name: string;
  account_name: string;
  lead_source_group: string;
  points: number;
  close_date: string;
}

interface ZentactMerchant {
  merchant_account_id: string;
  business_name: string;
  sales_rep_name: string;
  opportunity_id: string | null;
  points: number;
  bonus_amount: number;
  activated_at: string;
}

interface RepData {
  repName: string;
  totalPoints: number;
  crmPoints: number;
  zentactPoints: number;
  zentactActivations: number;
  zentactBonus: number;
  quota: number;
  quotaMet: boolean;
  pointsToQuota: number;
  monthlyBonus: number;
  bonusTier: { points: number; bonus: number } | null;
  nextBonusTier: { points: number; bonus: number } | null;
  annualPoints: number;
  annualBonus: number;
  annualZentactActivations: number;
  annualZentactBonus: number;
  dealsCount: number;
  deals: Deal[];
  zentactMerchants: ZentactMerchant[];
  restricted?: boolean;   // backend flag — true when current user can't see this rep's details
  team?: { id: number; name: string } | null;
  countsTowardQuota?: boolean;
}

interface TeamAgg {
  teamId: number | null;
  name: string;
  countsTowardQuota: boolean;
  includeDeals: boolean;
  includePayments: boolean;
  totalPoints: number;
  memberCount: number;
  membersMet: number;
  quotaTarget: number;
  quotaMet: boolean;
}

interface PointsData {
  year: number;
  month: number;
  isAdmin?: boolean;
  viewerName?: string;
  quota: number;
  totalDeals: number;
  totalZentactActivations: number;
  reps: RepData[];
  teams?: TeamAgg[];
  companyPoints?: number;
  companyTarget?: number;
  companyQuotaMet?: boolean;
  leadSourceGroups?: string[];
}

const CommissionTracker: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<PointsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
  const [selectedTeamKey, setSelectedTeamKey] = useState<string | null>(null);
  const [editingDealSource, setEditingDealSource] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeReps, setActiveReps] = useState<string[]>([]);

  // Locale-aware month names (short), e.g. "Jan" / "Jan." / "janv."
  const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(new Date(2000, i, 1))
  );

  // Admin status from the EFFECTIVE identity (/api/auth/verify), not the raw JWT —
  // the JWT stays admin while impersonating, which would expose admin-only controls.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios
      .get(`${API_URL}/api/auth/verify`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setIsAdmin(!!res.data?.user?.isAdmin))
      .catch(() => setIsAdmin(false));
  }, []);

  // Fetch active salespeople (for the Assign dropdown when isAdmin)
  useEffect(() => {
    if (!isAdmin) return;
    const fetchReps = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/api/salespeople`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setActiveReps(res.data.salespeople || []);
      } catch (e) { console.error('Failed to fetch reps', e); }
    };
    fetchReps();
  }, [isAdmin]);

  // Assign a merchant to a rep (admins only). After save, refetch the tracker.
  const assignMerchant = async (merchantId: string, repName: string) => {
    if (!repName) return;
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/zentact/merchants/${encodeURIComponent(merchantId)}/rep`,
        { repName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchPoints(); // refresh totals
    } catch (e) {
      console.error('Failed to assign rep', e);
      alert('Failed to assign rep');
    }
  };

  useEffect(() => {
    fetchPoints();
  }, [selectedYear, selectedMonth]);

  const fetchPoints = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/crm/points`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { year: selectedYear, month: selectedMonth },
      });
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load points data');
    } finally {
      setLoading(false);
    }
  };

  // Admin: override a deal's lead source group (empty = revert to the CRM-synced value).
  const overrideDealSource = async (dealId: string, source: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/api/crm/deals/${encodeURIComponent(dealId)}/source`,
        { source },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchPoints();
    } catch (err) {
      console.error('Failed to override deal source', err);
    }
  };

  const getSourceBadgeColor = (sourceGroup: string) => {
    const s = sourceGroup.toLowerCase();
    if (s.includes('outbound')) return 'bg-[#8B5CF6] text-white';
    if (s.includes('partner')) return 'bg-[#F59E0B] text-white';
    return 'bg-[#3B82F6] text-white';
  };


  if (loading) return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#8B5CF6] border-t-transparent"></div>
        <p className="text-sm text-gray-500">{t('commissionTracker.loadingPoints')}</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="text-center">
        <p className="mb-4 text-red-500">{error}</p>
        <button onClick={fetchPoints} className="rounded-lg bg-primary px-5 py-2.5 text-white hover:bg-opacity-90">
          {t('common.retry')}
        </button>
      </div>
    </div>
  );

  if (!data) return null;

  const currentMonthName = MONTH_NAMES[selectedMonth - 1];

  // Group rep cards under their team (with a header per team), instead of one mixed list.
  type RepGroup = { key: string; team?: TeamAgg; reps: RepData[] };
  const repsByTeam: Record<string, RepData[]> = {};
  const noTeamReps: RepData[] = [];
  for (const r of data.reps) {
    const tid = r.team?.id;
    if (tid == null) noTeamReps.push(r);
    else { (repsByTeam[String(tid)] = repsByTeam[String(tid)] || []).push(r); }
  }
  const orderedTeams = data.teams || [];
  const groups: RepGroup[] = [];
  for (const tm of orderedTeams) {
    const rs = repsByTeam[String(tm.teamId)] || [];
    if (rs.length === 0) continue;
    groups.push({ key: `t-${tm.teamId}`, team: tm, reps: rs });
  }
  if (noTeamReps.length) groups.push({ key: 'none', reps: noTeamReps });
  // Active team for the top selector (default = first group; falls back if the selected one vanished).
  const activeKey = selectedTeamKey && groups.some(g => g.key === selectedTeamKey)
    ? selectedTeamKey
    : (groups[0]?.key ?? null);
  // Top summary reflects the SELECTED team (switches with the selector), not the whole company.
  const activeGroup = groups.find(g => g.key === activeKey);
  const agName = activeGroup ? (activeGroup.team ? activeGroup.team.name : t('commissionTracker.noTeamGroup')) : '';
  const agPoints = activeGroup ? (activeGroup.team ? activeGroup.team.totalPoints : activeGroup.reps.reduce((s, r) => s + r.totalPoints, 0)) : 0;
  const agTarget = activeGroup ? (activeGroup.team ? activeGroup.team.quotaTarget : activeGroup.reps.reduce((s, r) => s + (r.quota || QUOTA), 0)) : 0;
  const agMet = activeGroup ? (activeGroup.team ? activeGroup.team.membersMet : activeGroup.reps.filter(r => r.quotaMet).length) : 0;
  const agMembers = activeGroup ? (activeGroup.team ? activeGroup.team.memberCount : activeGroup.reps.length) : 0;
  const agDeals = activeGroup ? activeGroup.reps.reduce((s, r) => s + (r.dealsCount ?? r.deals.length), 0) : 0;

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white">
            {t('commissionTracker.title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('commissionTracker.subtitle', {
              month: currentMonthName,
              year: selectedYear,
              count: agDeals,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(parseInt(e.target.value))}
            className="rounded-lg border border-stroke bg-white px-3 py-2 text-sm font-medium text-black shadow-sm dark:border-strokedark dark:bg-boxdark dark:text-white"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value))}
            className="rounded-lg border border-stroke bg-white px-3 py-2 text-sm font-medium text-black shadow-sm dark:border-strokedark dark:bg-boxdark dark:text-white"
          >
            {/* Data starts Jan 2025 — list current year down to 2025 only */}
            {[...Array(new Date().getFullYear() - 2024)].map((_, i) => {
              const y = new Date().getFullYear() - i;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Compact company summary */}
      <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-sm border border-stroke bg-white px-6 py-4 shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#8B5CF6] bg-opacity-20">
            <svg className="h-5 w-5 text-[#8B5CF6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold leading-none text-black dark:text-white">
              {agPoints}<span className="text-sm font-normal text-gray-500"> / {agTarget} pts</span>
            </p>
            <span className="text-xs font-medium text-gray-500">{agName || t('commissionTracker.companyQuota')}</span>
          </div>
        </div>
        <div className="hidden h-9 w-px bg-stroke dark:bg-strokedark sm:block" />
        <div>
          <p className="text-2xl font-bold leading-none text-black dark:text-white">{agMet}/{agMembers}</p>
          <span className="text-xs font-medium text-gray-500">{t('commissionTracker.repsMetQuota')}</span>
        </div>
      </div>

      {/* Team selector */}
      {groups.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {groups.map(g => {
            const active = g.key === activeKey;
            return (
              <button
                key={g.key}
                onClick={() => setSelectedTeamKey(g.key)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-primary text-white shadow'
                    : 'border border-stroke bg-white text-body hover:bg-gray-100 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4'
                }`}
              >
                {g.team ? g.team.name : t('commissionTracker.noTeamGroup')}
                {g.team && (
                  <span className={`text-xs ${active ? 'text-white/80' : 'text-gray-400'}`}>
                    {g.team.totalPoints}/{g.team.quotaTarget}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Rep Cards */}
      <div className="space-y-4">
        {data.reps.length === 0 ? (
          <div className="rounded-sm border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark">
            <p className="text-gray-500">
              {t('commissionTracker.noDealsFound', { month: currentMonthName, year: selectedYear })}
            </p>
          </div>
        ) : groups.filter(g => g.key === activeKey).map(g => {
          const tm = g.team;
          const pct = tm && tm.quotaTarget > 0 ? Math.min(100, Math.round((tm.totalPoints / tm.quotaTarget) * 100)) : 0;
          // Continuous color from red (0%) → amber → green (100%) as the team nears its goal.
          const ringColor = `hsl(${Math.round(Math.max(0, Math.min(100, pct)) * 1.2)}, 72%, 45%)`;
          const sources = tm ? [
            tm.includeDeals && t('commissionTracker.srcDeals'),
            tm.includePayments && t('commissionTracker.srcPayments'),
          ].filter(Boolean).join(' + ') : '';
          return (
            <div key={g.key} className="overflow-hidden rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              {tm ? (
                <div className={`flex items-center justify-between gap-4 border-b border-stroke px-5 py-4 dark:border-strokedark ${tm.countsTowardQuota ? '' : 'bg-gray-50 dark:bg-meta-4/20'}`}>
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-black dark:text-white">{tm.name}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-meta-4 dark:text-gray-300">
                        {t('commissionTracker.teamMembers', { count: tm.memberCount })}
                      </span>
                      {tm.quotaMet && (
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">✓ {t('commissionTracker.quotaMet')}</span>
                      )}
                      {!tm.countsTowardQuota && (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-meta-4 dark:text-gray-300">{t('commissionTracker.notCounted')}</span>
                      )}
                    </div>
                    <p>
                      <span className={`text-xl font-bold ${tm.quotaMet ? 'text-success' : 'text-black dark:text-white'}`}>{tm.totalPoints}</span>
                      <span className="text-sm font-medium text-gray-500"> / {tm.quotaTarget} pts</span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 text-xs text-gray-500">
                      <span>{t('commissionTracker.teamRepsMet', { met: tm.membersMet, total: tm.memberCount })}</span>
                      {sources && <span>· {t('commissionTracker.quotaSources')}: {sources}</span>}
                    </div>
                  </div>
                  {/* Progress ring */}
                  <div className="relative h-[78px] w-[78px] shrink-0">
                    <svg className="h-full w-full -rotate-90" viewBox="0 0 72 72">
                      <circle className="text-gray-200 dark:text-gray-700" cx="36" cy="36" r="32" fill="none" stroke="currentColor" strokeWidth="7" />
                      <circle
                        cx="36" cy="36" r="32" fill="none" stroke={ringColor} strokeWidth="7" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 32}
                        strokeDashoffset={(2 * Math.PI * 32) * (1 - pct / 100)}
                        style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.5s ease' }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-lg font-bold" style={{ color: ringColor }}>{pct}%</span>
                  </div>
                </div>
              ) : (
                <div className="border-b border-stroke px-5 py-3 dark:border-strokedark">
                  <span className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t('commissionTracker.noTeamGroup')}</span>
                </div>
              )}
              <div className="divide-y divide-stroke dark:divide-strokedark">
                {g.reps.map(rep => {
                  const quotaPct = Math.min(100, (rep.totalPoints / (rep.quota || QUOTA)) * 100);
                  const repBarColor = `hsl(${Math.round(Math.max(0, Math.min(100, quotaPct)) * 1.2)}, 72%, 45%)`;
                  const isExpanded = expandedRep === rep.repName;
                  const canViewDetails = !rep.restricted; // backend flagged this row

                  return (
                    <div key={rep.repName} className="bg-white dark:bg-boxdark">
              {/* Rep Header */}
              <div
                className={`flex items-center justify-between px-6 py-5 ${canViewDetails ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                onClick={() => canViewDetails && setExpandedRep(isExpanded ? null : rep.repName)}
                title={canViewDetails ? '' : t('commissionTracker.restrictedDetails')}
              >
                <div className="flex items-center gap-4 flex-1">
                  {/* Avatar */}
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#8B5CF6] text-sm font-bold text-white">
                    {rep.repName.charAt(0)}
                  </div>

                  {/* Name + quota bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <p className="font-semibold text-black dark:text-white">{rep.repName}</p>
                      {rep.quotaMet ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success bg-opacity-10 px-2.5 py-0.5 text-xs font-semibold text-success">
                          {t('commissionTracker.quotaMet')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-danger bg-opacity-10 px-2.5 py-0.5 text-xs font-semibold text-danger">
                          {t('commissionTracker.ptsToQuota', { count: rep.pointsToQuota })}
                        </span>
                      )}
                      {rep.bonusTier && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F59E0B] bg-opacity-10 px-2.5 py-0.5 text-xs font-semibold text-[#F59E0B]">
                          🎯 {t('commissionTracker.monthlyBonus', { amount: rep.monthlyBonus.toLocaleString() })}
                        </span>
                      )}
                      {rep.zentactActivations > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#6366F1] bg-opacity-10 px-2.5 py-0.5 text-xs font-semibold text-[#6366F1]">
                          💳 {t('commissionTracker.zentactBonusBadge', { count: rep.zentactActivations, amount: rep.zentactBonus.toLocaleString() })}
                        </span>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-meta-4">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${quotaPct}%`, backgroundColor: repBarColor }}
                      />
                    </div>
                  </div>
                </div>

                {/* Points + deals count */}
                <div className="flex items-center gap-6 ml-4">
                  <div className="text-right">
                    <p className="text-xl font-bold text-black dark:text-white">
                      {rep.totalPoints}<span className="text-sm font-normal text-gray-500"> / {rep.quota || QUOTA} pts</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {rep.dealsCount ?? rep.deals.length} {(rep.dealsCount ?? rep.deals.length) !== 1
                        ? t('commissionTracker.deals')
                        : t('commissionTracker.deal')}
                    </p>
                  </div>
                  {canViewDetails ? (
                    <svg className={`h-5 w-5 text-body transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Expanded deals table */}
              {isExpanded && (
                <div className="border-t border-stroke dark:border-strokedark">
                  {/* CRM Deals */}
                  {rep.deals.length > 0 && (
                    <table className="w-full table-auto">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-meta-4/50">
                          <th className="px-6 py-3 text-left text-xs font-medium text-body">{t('commissionTracker.dealAccount')}</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-body">{t('commissionTracker.source')}</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-body">{t('commissionTracker.closeDate')}</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-body">{t('commissionTracker.points')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rep.deals.map(deal => (
                          <tr key={deal.crm_deal_id} className="border-t border-stroke/50 dark:border-strokedark/50 hover:bg-gray-50 dark:hover:bg-meta-4/20">
                            <td className="px-6 py-3">
                              <p className="text-sm font-medium text-black dark:text-white">{deal.deal_name}</p>
                              <p className="text-xs text-gray-500">{deal.account_name}</p>
                            </td>
                            <td className="px-6 py-3">
                              {isAdmin && editingDealSource === deal.crm_deal_id ? (
                                <select
                                  autoFocus
                                  value={deal.lead_source_group || ''}
                                  onChange={(e) => { overrideDealSource(deal.crm_deal_id, e.target.value); setEditingDealSource(null); }}
                                  onBlur={() => setEditingDealSource(null)}
                                  className="rounded border border-primary bg-transparent px-2 py-1 text-xs outline-none dark:bg-form-input text-black dark:text-white"
                                >
                                  <option value="">—</option>
                                  {(data.leadSourceGroups || []).map(g => (
                                    <option key={g} value={g}>{g}</option>
                                  ))}
                                  {deal.lead_source_group && !(data.leadSourceGroups || []).includes(deal.lead_source_group) && (
                                    <option value={deal.lead_source_group}>{deal.lead_source_group}</option>
                                  )}
                                </select>
                              ) : (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getSourceBadgeColor(deal.lead_source_group)}`}>
                                    {deal.lead_source_group || '—'}
                                  </span>
                                  {isAdmin && (
                                    <button
                                      onClick={() => setEditingDealSource(deal.crm_deal_id)}
                                      title={t('commissionTracker.overrideSourceHint') as string}
                                      className="text-body transition hover:text-primary"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3 text-sm text-body">
                              {formatDateOnly(deal.close_date, i18n.language)}
                            </td>
                            <td className="px-6 py-3 text-right">
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#8B5CF6] text-xs font-bold text-white">
                                {deal.points}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Zentact Payment Activations */}
                  {rep.zentactMerchants && rep.zentactMerchants.length > 0 && (
                    <div className="border-t border-stroke dark:border-strokedark">
                      <div className="flex items-center gap-2 px-6 py-2 bg-[#6366F1] bg-opacity-5">
                        <svg className="h-4 w-4 text-[#6366F1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        <span className="text-xs font-semibold text-[#6366F1]">{t('commissionTracker.zentactSection')}</span>
                      </div>
                      <table className="w-full table-auto">
                        <thead>
                          <tr className="bg-[#6366F1] bg-opacity-5">
                            <th className="px-6 py-3 text-left text-xs font-medium text-body">{t('commissionTracker.merchant')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-body">{t('commissionTracker.activatedDate')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-body">{t('commissionTracker.activation$100')}</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-body">{t('commissionTracker.points')}</th>
                            {isAdmin && rep.repName === 'Unassigned' && (
                              <th className="px-6 py-3 text-left text-xs font-medium text-body">{t('commissionTracker.assignTo')}</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {rep.zentactMerchants.map(m => (
                            <tr key={m.merchant_account_id} className="border-t border-stroke/50 dark:border-strokedark/50 hover:bg-[#6366F1]/5">
                              <td className="px-6 py-3">
                                <p className="text-sm font-medium text-black dark:text-white">{m.business_name}</p>
                                {m.opportunity_id && (
                                  <p className="text-xs text-gray-400">{t('commissionTracker.linkedDeal')}: {m.opportunity_id}</p>
                                )}
                              </td>
                              <td className="px-6 py-3 text-sm text-body">
                                {formatDateOnly(m.activated_at, i18n.language)}
                              </td>
                              <td className="px-6 py-3">
                                {m.bonus_amount > 0 ? (
                                  <span className="inline-flex items-center rounded-full bg-[#6366F1] bg-opacity-10 px-2.5 py-0.5 text-xs font-semibold text-[#6366F1]">
                                    ${m.bonus_amount.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-xs text-body">—</span>
                                )}
                              </td>
                              <td className="px-6 py-3 text-right">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#6366F1] text-xs font-bold text-white">
                                  {m.points}
                                </span>
                              </td>
                              {isAdmin && rep.repName === 'Unassigned' && (
                                <td className="px-6 py-3">
                                  <select
                                    defaultValue=""
                                    onChange={(e) => assignMerchant(m.merchant_account_id, e.target.value)}
                                    className="rounded border border-stroke bg-transparent px-2 py-1 text-xs outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input text-black dark:text-white"
                                  >
                                    <option value="" disabled>{t('commissionTracker.selectRep')}</option>
                                    {activeReps.map(name => (
                                      <option key={name} value={name}>{name}</option>
                                    ))}
                                  </select>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Combined Total */}
                  <div className="border-t border-stroke bg-gray-50 dark:border-strokedark dark:bg-meta-4/30 flex items-center justify-between px-6 py-3">
                    <span className="text-sm font-semibold text-black dark:text-white">{t('commissionTracker.total')}</span>
                    <div className="flex items-center gap-3">
                      {rep.zentactBonus > 0 && (
                        <span className="text-xs font-semibold text-[#6366F1]">
                          +${rep.zentactBonus.toLocaleString()} {t('commissionTracker.zentactBonusLabel')}
                        </span>
                      )}
                      <span className="inline-flex h-7 w-auto min-w-7 items-center justify-center rounded-full bg-[#8B5CF6] px-2 text-xs font-bold text-white">
                        {rep.totalPoints} pts
                      </span>
                    </div>
                  </div>
                </div>
              )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default CommissionTracker;
