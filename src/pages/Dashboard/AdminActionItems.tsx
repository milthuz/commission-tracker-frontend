import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface PayrollPreview { dueBy: string | null; reps: { rep: string; total: number; sentAt?: string | null }[]; }
interface PointsResp { reps: { repName: string; quotaMet: boolean }[]; }
interface AllStatus { books: { lastSyncAt: string | null }; crm: { lastSyncAt: string | null }; zentact: { lastSyncAt: string | null }; }

const hoursSince = (iso: string | null) => iso ? (Date.now() - new Date(iso).getTime()) / 3.6e6 : Infinity;

// Actionable summary cards for admins, shown atop the finance dashboard.
const AdminActionItems: React.FC = () => {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const [payroll, setPayroll] = useState<PayrollPreview | null>(null);
  const [points, setPoints] = useState<PointsResp | null>(null);
  const [status, setStatus] = useState<AllStatus | null>(null);

  const fmt = (v: number) =>
    (Number(v) || 0).toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

  useEffect(() => {
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    const params = { year: now.getFullYear(), month: now.getMonth() + 1 };
    axios.get(`${API_URL}/api/commissions/payroll/preview`, { headers, params }).then(r => setPayroll(r.data)).catch(() => {});
    axios.get(`${API_URL}/api/crm/points`, { headers, params }).then(r => setPoints(r.data)).catch(() => {});
    axios.get(`${API_URL}/api/sync/all-status`, { headers }).then(r => setStatus(r.data)).catch(() => {});
  }, []);

  // Payroll: not-yet-sent reps with a positive total for this month.
  const unsent = (payroll?.reps || []).filter(r => !r.sentAt && r.total > 0);
  const payrollDue = unsent.reduce((s, r) => s + r.total, 0);
  const belowQuota = (points?.reps || []).filter(r => !r.quotaMet).length;

  // Sync staleness thresholds (auto-sync: books 4h, crm/zentact 1h — flag at ~2× cadence).
  const stale: string[] = [];
  if (status) {
    if (hoursSince(status.books.lastSyncAt) > 8) stale.push('Books');
    if (hoursSince(status.crm.lastSyncAt) > 3) stale.push('CRM');
    if (hoursSince(status.zentact.lastSyncAt) > 3) stale.push('Zentact');
  }
  const syncHealthy = status != null && stale.length === 0;

  const monthName = new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(now);

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* Payroll due */}
      <Link to="/admin/import-payments" className="rounded-xl border border-stroke bg-white p-5 shadow-default transition hover:border-primary dark:border-strokedark dark:bg-boxdark">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('adminActions.payrollDue', { month: monthName })}</span>
          <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </div>
        <p className="mt-2 text-2xl font-bold text-black dark:text-white">{fmt(payrollDue)}</p>
        <p className="mt-1 text-xs text-gray-500">
          {unsent.length > 0
            ? t('adminActions.repsToSend', { count: unsent.length }) + (payroll?.dueBy ? ` · ${t('adminActions.dueBy')} ${payroll.dueBy}` : '')
            : t('adminActions.allSent')}
        </p>
      </Link>

      {/* Reps below quota */}
      <Link to="/commission-tracker" className="rounded-xl border border-stroke bg-white p-5 shadow-default transition hover:border-primary dark:border-strokedark dark:bg-boxdark">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('adminActions.belowQuota')}</span>
          <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </div>
        <p className={`mt-2 text-2xl font-bold ${belowQuota > 0 ? 'text-warning' : 'text-success'}`}>{belowQuota}</p>
        <p className="mt-1 text-xs text-gray-500">{t('adminActions.ofReps', { total: points?.reps.length || 0 })}</p>
      </Link>

      {/* Sync health */}
      <div className="rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('adminActions.syncHealth')}</span>
        <div className="mt-2 flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${syncHealthy ? 'bg-success' : 'bg-warning'}`} />
          <p className="text-lg font-bold text-black dark:text-white">
            {status == null ? '—' : syncHealthy ? t('adminActions.allFresh') : t('adminActions.stale', { which: stale.join(', ') })}
          </p>
        </div>
        <p className="mt-1 text-xs text-gray-500">{t('adminActions.syncSub')}</p>
      </div>
    </div>
  );
};

export default AdminActionItems;
