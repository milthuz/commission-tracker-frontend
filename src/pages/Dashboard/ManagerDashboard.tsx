import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const QUOTA = 15;

interface RepRow {
  repName: string;
  totalPoints: number;
  quota: number;
  quotaMet: boolean;
  pointsToQuota: number;
  zentactActivations: number;
  deals: { crm_deal_id: string }[];
  team?: { id: number; name: string } | null;
}
interface TeamRow {
  teamId: number; name: string; countsTowardQuota: boolean;
  memberCount: number; membersMet: number; totalPoints: number;
  quotaTarget: number; quotaMet: boolean;
}
interface PointsResp {
  reps: RepRow[]; teams: TeamRow[];
  companyPoints?: number; companyTarget?: number; totalDeals?: number; totalZentactActivations?: number;
}

const ManagerDashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const [points, setPoints] = useState<PointsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true); setError('');
        const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const p = await axios.get(`${API_URL}/api/crm/points`, { headers, params: { year: now.getFullYear(), month: now.getMonth() + 1 } });
        setPoints(p.data);
      } catch (e: any) {
        setError(e?.response?.data?.error || 'Failed to load dashboard');
      } finally { setLoading(false); }
    };
    run();
  }, []);

  if (loading) return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
  if (error) return <div className="flex h-[60vh] items-center justify-center"><p className="text-danger">{error}</p></div>;

  const reps = [...(points?.reps || [])].sort((a, b) => b.totalPoints - a.totalPoints);
  const teams = points?.teams || [];
  const companyPoints = points?.companyPoints || 0;
  const companyTarget = points?.companyTarget || 0;
  const companyPct = companyTarget > 0 ? Math.min(100, Math.round((companyPoints / companyTarget) * 100)) : 0;
  const repsMet = reps.filter(r => r.quotaMet).length;
  const underQuota = reps.filter(r => !r.quotaMet);
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(now);

  const bar = (pct: number) => `hsl(${Math.round(Math.max(0, Math.min(100, pct)) * 1.2)}, 72%, 45%)`;

  return (
    <>
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white">{t('managerDashboard.title')}</h2>
          <p className="text-sm capitalize text-gray-500 dark:text-gray-400">{t('managerDashboard.subtitle', { month: monthName })}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/commission-report" className="rounded-lg border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-white">
            {t('managerDashboard.reviewCommissions')}
          </Link>
          <Link to="/commission-tracker" className="rounded-lg border border-stroke bg-white px-3 py-2 text-sm font-medium text-black hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:text-white dark:hover:bg-meta-4">
            {t('managerDashboard.fullTracker')}
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="rounded-xl bg-primary p-5 text-white shadow-default">
          <p className="text-xs opacity-85">{t('managerDashboard.teamPoints')}</p>
          <p className="mt-1 text-2xl font-bold">{companyPoints} <span className="text-sm font-normal opacity-80">/ {companyTarget}</span></p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/30">
            <div className="h-1.5 rounded-full bg-white" style={{ width: `${companyPct}%` }} />
          </div>
        </div>
        {[
          { label: t('managerDashboard.repsMetQuota'), value: `${repsMet}/${reps.length}` },
          { label: t('managerDashboard.totalDeals'), value: String(points?.totalDeals ?? reps.reduce((s, r) => s + r.deals.length, 0)) },
          { label: t('managerDashboard.activations'), value: String(points?.totalZentactActivations ?? reps.reduce((s, r) => s + r.zentactActivations, 0)) },
        ].map((c, i) => (
          <div key={i} className="rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
            <p className="text-xs font-medium text-gray-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-black dark:text-white">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Teams breakdown */}
      {teams.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map(tm => {
            const pct = tm.quotaTarget > 0 ? Math.min(100, Math.round((tm.totalPoints / tm.quotaTarget) * 100)) : 0;
            return (
              <div key={tm.teamId} className={`rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark ${tm.countsTowardQuota ? '' : 'opacity-70'}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold text-black dark:text-white">{tm.name}</span>
                  <span className="text-xs text-gray-500">{tm.membersMet}/{tm.memberCount} {t('managerDashboard.met')}</span>
                </div>
                <p className="text-lg font-bold text-black dark:text-white">{tm.totalPoints} <span className="text-sm font-normal text-gray-500">/ {tm.quotaTarget} pts</span></p>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-100 dark:bg-meta-4">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: bar(pct) }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reps needing attention */}
      {underQuota.length > 0 && (
        <div className="mt-4 rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h5 className="mb-3 text-sm font-semibold text-warning">⚠️ {t('managerDashboard.belowQuota', { count: underQuota.length })}</h5>
          <div className="flex flex-wrap gap-2">
            {underQuota.map(r => (
              <span key={r.repName} className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                {r.repName} · {r.totalPoints}/{r.quota || QUOTA} ({t('managerDashboard.ptsLeft', { count: r.pointsToQuota })})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Full rep table */}
      <div className="mt-4 rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
          <h5 className="text-sm font-semibold text-black dark:text-white">🏆 {t('managerDashboard.repPerformance')}</h5>
        </div>
        <div className="divide-y divide-stroke dark:divide-strokedark">
          {reps.map((r, i) => {
            const pct = Math.min(100, Math.round((r.totalPoints / (r.quota || QUOTA)) * 100));
            return (
              <div key={r.repName} className="flex items-center gap-4 px-5 py-3">
                <span className="w-6 text-sm font-semibold text-gray-400">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="truncate font-medium text-black dark:text-white">{r.repName}</span>
                    {r.team && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-meta-4 dark:text-gray-300">{r.team.name}</span>}
                    {r.quotaMet
                      ? <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">✓</span>
                      : <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">{t('managerDashboard.ptsLeft', { count: r.pointsToQuota })}</span>}
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-meta-4">
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: bar(pct) }} />
                  </div>
                </div>
                <span className="w-20 text-right text-sm font-bold text-black dark:text-white">{r.totalPoints} pts</span>
              </div>
            );
          })}
          {reps.length === 0 && <p className="py-8 text-center text-sm text-gray-500">{t('managerDashboard.noData')}</p>}
        </div>
      </div>
    </>
  );
};

export default ManagerDashboard;
