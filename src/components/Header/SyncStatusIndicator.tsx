import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface SyncStatus {
  books:   { lastSyncAt: string | null; invoiceCount: number;  status: string; autoSyncEvery: string };
  crm:     { lastSyncAt: string | null; dealCount: number;     autoSyncEvery: string };
  zentact: {
    lastSyncAt: string | null; merchantCount: number; activeCount: number; autoSyncEvery: string;
    webhookConfigured: boolean; webhookLastReceivedAt: string | null; webhookTotalReceived: number;
  };
  serverTime: string;
}

// "5 min ago" / "3 hours ago" / "Just now"
const relativeTime = (iso: string | null, now: Date, t: (k: string, v?: any) => string) => {
  if (!iso) return t('sync.never');
  const past = new Date(iso).getTime();
  const diff = now.getTime() - past;
  if (diff < 0) return t('sync.justNow'); // clock skew
  const s = Math.floor(diff / 1000);
  if (s < 30)    return t('sync.justNow');
  if (s < 60)    return t('sync.secondsAgo', { count: s });
  const m = Math.floor(s / 60);
  if (m < 60)    return t('sync.minutesAgo', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24)    return t('sync.hoursAgo',   { count: h });
  const d = Math.floor(h / 24);
  return t('sync.daysAgo', { count: d });
};

// Determine freshness color based on minutes since last sync
const freshnessColor = (iso: string | null, expectedHours: number) => {
  if (!iso) return 'text-danger';
  const minsAgo = (Date.now() - new Date(iso).getTime()) / 60000;
  const limit = expectedHours * 60;
  if (minsAgo < limit * 0.5)  return 'text-success';      // < half the cycle = fresh
  if (minsAgo < limit * 1.5)  return 'text-warning';      // up to 1.5x cycle = ok
  return 'text-danger';                                    // stale
};

const SyncStatusIndicator = () => {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const ref = useRef<HTMLDivElement>(null);

  // Fetch on mount + every 60s
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await axios.get(`${API_URL}/api/sync/all-status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setStatus(res.data);
      } catch { /* silent */ }
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 60_000);
    return () => clearInterval(id);
  }, []);

  // Tick "now" every 30s for relative time updates
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!status) return null;

  // Most-recent overall last sync — for the header display
  const allTimes = [status.books.lastSyncAt, status.crm.lastSyncAt, status.zentact.lastSyncAt].filter(Boolean) as string[];
  const oldest = allTimes.length > 0 ? allTimes.reduce((a, b) => new Date(a) < new Date(b) ? a : b) : null;
  const oldestColor = freshnessColor(oldest, 4); // worst case is books (4h)

  const formatFullDate = (iso: string | null) => {
    if (!iso) return t('common.never');
    return new Date(iso).toLocaleString(i18n.language, {
      dateStyle: 'short', timeStyle: 'short',
    });
  };

  return (
    <li className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative flex h-8.5 items-center gap-1.5 rounded-full border-[0.5px] border-stroke bg-gray px-2.5 hover:text-primary dark:border-strokedark dark:bg-meta-4 dark:text-white`}
        aria-label="Sync status"
        title={t('sync.lastUpdated')}
      >
        <svg className={`h-4 w-4 ${oldestColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs font-medium hidden sm:inline">
          {relativeTime(oldest, now, t)}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-md border border-stroke bg-white shadow-lg dark:border-strokedark dark:bg-boxdark z-[10000]">
          <div className="border-b border-stroke px-4 py-3 dark:border-strokedark">
            <p className="text-sm font-semibold text-black dark:text-white">{t('sync.title')}</p>
            <p className="text-xs text-body">{t('sync.subtitle')}</p>
          </div>

          {/* Books */}
          <div className="border-b border-stroke px-4 py-3 dark:border-strokedark">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-black dark:text-white">📚 {t('sync.books')}</span>
              <span className={`text-xs font-medium ${freshnessColor(status.books.lastSyncAt, 4)}`}>
                {relativeTime(status.books.lastSyncAt, now, t)}
              </span>
            </div>
            <p className="text-xs text-body">{status.books.invoiceCount} {t('sync.invoices')} · {t('sync.autoEvery', { interval: status.books.autoSyncEvery })}</p>
            <p className="text-[10px] text-body opacity-70 mt-0.5">{formatFullDate(status.books.lastSyncAt)}</p>
          </div>

          {/* CRM */}
          <div className="border-b border-stroke px-4 py-3 dark:border-strokedark">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-black dark:text-white">💼 {t('sync.crm')}</span>
              <span className={`text-xs font-medium ${freshnessColor(status.crm.lastSyncAt, 1)}`}>
                {relativeTime(status.crm.lastSyncAt, now, t)}
              </span>
            </div>
            <p className="text-xs text-body">{status.crm.dealCount} {t('sync.deals')} · {t('sync.autoEvery', { interval: status.crm.autoSyncEvery })}</p>
            <p className="text-[10px] text-body opacity-70 mt-0.5">{formatFullDate(status.crm.lastSyncAt)}</p>
          </div>

          {/* Zentact */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-black dark:text-white">💳 {t('sync.zentact')}</span>
              <span className={`text-xs font-medium ${freshnessColor(status.zentact.lastSyncAt, 1)}`}>
                {relativeTime(status.zentact.lastSyncAt, now, t)}
              </span>
            </div>
            <p className="text-xs text-body">{status.zentact.activeCount}/{status.zentact.merchantCount} {t('sync.merchantsActive')} · {t('sync.autoEvery', { interval: status.zentact.autoSyncEvery })}</p>
            <p className="text-[10px] text-body opacity-70 mt-0.5">{formatFullDate(status.zentact.lastSyncAt)}</p>
            {status.zentact.webhookConfigured && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success"></span>
                <p className="text-[10px] text-body">
                  {t('sync.webhookActive')}
                  {status.zentact.webhookLastReceivedAt && (
                    <> · {t('sync.lastEvent')} {relativeTime(status.zentact.webhookLastReceivedAt, now, t)}</>
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-stroke px-4 py-2 dark:border-strokedark">
            <p className="text-[10px] text-body text-center">
              {t('sync.autoRefresh')}
            </p>
          </div>
        </div>
      )}
    </li>
  );
};

export default SyncStatusIndicator;
