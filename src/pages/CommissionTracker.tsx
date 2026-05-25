import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

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

interface RepData {
  repName: string;
  totalPoints: number;
  quota: number;
  quotaMet: boolean;
  pointsToQuota: number;
  monthlyBonus: number;
  bonusTier: { points: number; bonus: number } | null;
  nextBonusTier: { points: number; bonus: number } | null;
  annualPoints: number;
  annualBonus: number;
  deals: Deal[];
}

interface PointsData {
  year: number;
  month: number;
  quota: number;
  totalDeals: number;
  reps: RepData[];
}

const CommissionTracker: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<PointsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [expandedRep, setExpandedRep] = useState<string | null>(null);

  // Locale-aware month names (short), e.g. "Jan" / "Jan." / "janv."
  const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(new Date(2000, i, 1))
  );

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

  const getSourceBadgeColor = (sourceGroup: string) => {
    const s = sourceGroup.toLowerCase();
    if (s.includes('outbound')) return 'bg-[#8B5CF6] text-white';
    if (s.includes('partner')) return 'bg-[#F59E0B] text-white';
    return 'bg-[#3B82F6] text-white';
  };

  const getQuotaBarColor = (points: number) => {
    const pct = (points / QUOTA) * 100;
    if (pct >= 100) return 'bg-success';
    if (pct >= 60) return 'bg-warning';
    return 'bg-danger';
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

  const totalPoints = data.reps.reduce((s, r) => s + r.totalPoints, 0);
  const repsMetQuota = data.reps.filter(r => r.quotaMet).length;
  const totalDeals = data.totalDeals;
  const currentMonthName = MONTH_NAMES[selectedMonth - 1];

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
              count: totalDeals,
              quota: QUOTA,
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
            {[...Array(4)].map((_, i) => {
              const y = new Date().getFullYear() - i;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 2xl:gap-7.5 mb-6">
        {/* Total Points */}
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-[#8B5CF6] bg-opacity-20">
            <svg className="h-6 w-6 text-[#8B5CF6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-black dark:text-white">{totalPoints} pts</h4>
            <span className="text-sm font-medium text-gray-500">{t('commissionTracker.totalTeamPoints')}</span>
          </div>
        </div>

        {/* Deals Closed */}
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-[#10B981] bg-opacity-20">
            <svg className="h-6 w-6 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-black dark:text-white">{totalDeals}</h4>
            <span className="text-sm font-medium text-gray-500">{t('commissionTracker.soldDealsMonth')}</span>
          </div>
        </div>

        {/* Quota Attainment */}
        <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-[#F59E0B] bg-opacity-20">
            <svg className="h-6 w-6 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="mt-4">
            <h4 className="text-2xl font-bold text-black dark:text-white">
              {repsMetQuota}/{data.reps.length}
            </h4>
            <span className="text-sm font-medium text-gray-500">
              {t('commissionTracker.repsMetQuota', { quota: QUOTA })}
            </span>
          </div>
        </div>
      </div>

      {/* Rep Cards */}
      <div className="space-y-4">
        {data.reps.length === 0 ? (
          <div className="rounded-sm border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark">
            <p className="text-gray-500">
              {t('commissionTracker.noDealsFound', { month: currentMonthName, year: selectedYear })}
            </p>
          </div>
        ) : data.reps.map(rep => {
          const quotaPct = Math.min(100, (rep.totalPoints / QUOTA) * 100);
          const isExpanded = expandedRep === rep.repName;

          return (
            <div key={rep.repName} className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              {/* Rep Header */}
              <div
                className="flex cursor-pointer items-center justify-between px-6 py-5"
                onClick={() => setExpandedRep(isExpanded ? null : rep.repName)}
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
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-meta-4">
                      <div
                        className={`h-2 rounded-full transition-all ${getQuotaBarColor(rep.totalPoints)}`}
                        style={{ width: `${quotaPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Points + deals count */}
                <div className="flex items-center gap-6 ml-4">
                  <div className="text-right">
                    <p className="text-xl font-bold text-black dark:text-white">
                      {rep.totalPoints}<span className="text-sm font-normal text-gray-500"> / {QUOTA} pts</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {rep.deals.length} {rep.deals.length !== 1
                        ? t('commissionTracker.deals')
                        : t('commissionTracker.deal')}
                    </p>
                  </div>
                  <svg className={`h-5 w-5 text-body transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Annual summary bar */}
              <div className="border-t border-stroke px-6 py-2 dark:border-strokedark flex items-center gap-6 text-xs text-gray-500">
                <span>
                  {t('commissionTracker.ytd', { year: selectedYear })}{' '}
                  <strong className="text-black dark:text-white">{rep.annualPoints} pts</strong>
                </span>
                {rep.annualBonus > 0 && (
                  <span className="text-success font-semibold">
                    {t('commissionTracker.annualBonus', { amount: rep.annualBonus.toLocaleString() })}
                  </span>
                )}
                {rep.nextBonusTier && rep.quotaMet && (
                  <span>
                    {t('commissionTracker.morePtsToBonus', {
                      count: rep.nextBonusTier.points - rep.totalPoints,
                      amount: rep.nextBonusTier.bonus.toLocaleString(),
                    })}
                  </span>
                )}
              </div>

              {/* Expanded deals table */}
              {isExpanded && (
                <div className="border-t border-stroke dark:border-strokedark">
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
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getSourceBadgeColor(deal.lead_source_group)}`}>
                              {deal.lead_source_group || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-body">
                            {deal.close_date ? new Date(deal.close_date).toLocaleDateString(i18n.language) : '—'}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#8B5CF6] text-xs font-bold text-white">
                              {deal.points}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-stroke bg-gray-50 dark:border-strokedark dark:bg-meta-4/30">
                        <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-black dark:text-white">
                          {t('commissionTracker.total')}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <span className="inline-flex h-7 w-auto min-w-7 items-center justify-center rounded-full bg-[#8B5CF6] px-2 text-xs font-bold text-white">
                            {rep.totalPoints} pts
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};

export default CommissionTracker;
