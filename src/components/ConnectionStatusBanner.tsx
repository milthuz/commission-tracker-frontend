import { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL;

interface ServiceStatus {
  connected: boolean;
  disconnected: boolean;
  reason: string | null;
  disconnectedAt: string | null;
  reconnectUrl: string;
}

interface ConnectionsResponse {
  books: ServiceStatus;
  crm:   ServiceStatus;
}

// Sticky banner that shows when Books or CRM OAuth is broken (refresh token
// revoked). Provides a one-click reconnect via the existing OAuth start URL.
// Polls /api/auth/connections-status every 60s while the page is visible.
const ConnectionStatusBanner = () => {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<ConnectionsResponse | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(
    () => JSON.parse(sessionStorage.getItem('conn-banner-dismissed') || '{}')
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await axios.get(`${API_URL}/api/auth/connections-status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setStatus(res.data);
      } catch { /* keep last known */ }
      finally {
        if (!cancelled) timer = setTimeout(poll, 60_000);
      }
    };
    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  if (!status) return null;

  const dismiss = (key: string) => {
    const next = { ...dismissed, [key]: true };
    setDismissed(next);
    sessionStorage.setItem('conn-banner-dismissed', JSON.stringify(next));
  };

  const reconnect = async (url: string) => {
    // The OAuth start endpoints return JSON { authUrl, state } rather than
    // doing a 302 — we have to fetch the authUrl and then redirect the
    // browser to it ourselves.
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}${url}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const authUrl = res.data?.authUrl;
      if (authUrl) {
        window.location.href = authUrl;
      } else {
        console.error('Reconnect: no authUrl in response', res.data);
      }
    } catch (e: any) {
      console.error('Reconnect failed:', e?.response?.data || e?.message);
    }
  };

  const fmt = (iso: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', {
        dateStyle: 'medium', timeStyle: 'short',
      });
    } catch { return iso; }
  };

  const banners = [];
  if (status.books.disconnected && !dismissed['books']) {
    banners.push(
      <BannerRow key="books" service="Books" status={status.books} fmt={fmt}
                 onReconnect={() => reconnect(status.books.reconnectUrl)}
                 onDismiss={() => dismiss('books')} t={t} />
    );
  }
  if (status.crm.disconnected && !dismissed['crm']) {
    banners.push(
      <BannerRow key="crm" service="CRM" status={status.crm} fmt={fmt}
                 onReconnect={() => reconnect(status.crm.reconnectUrl)}
                 onDismiss={() => dismiss('crm')} t={t} />
    );
  }
  if (banners.length === 0) return null;
  return <div className="space-y-px">{banners}</div>;
};

const BannerRow = ({ service, status, onReconnect, onDismiss, fmt, t }: any) => (
  <div className="sticky top-0 z-50 flex items-center gap-3 bg-danger px-4 py-2.5 text-sm text-white shadow-md">
    <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
    <div className="flex-1 min-w-0">
      <p className="font-semibold leading-tight">
        {t('connectionBanner.title', { service })}
      </p>
      <p className="text-xs opacity-90 leading-tight">
        {t('connectionBanner.subtitle', { service })}
        {status.disconnectedAt && ` · ${fmt(status.disconnectedAt)}`}
      </p>
    </div>
    <button
      onClick={onReconnect}
      className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-danger hover:bg-gray-100 transition flex-shrink-0"
    >
      {t('connectionBanner.reconnect')}
    </button>
    <button
      onClick={onDismiss}
      className="text-white hover:opacity-80 flex-shrink-0"
      aria-label="Dismiss"
      title={t('connectionBanner.dismiss') as string}
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
);

export default ConnectionStatusBanner;
