import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Streams the Kaizen POS (hosted on AWS AppStream 2.0) inside an iframe so reps can run a live demo.
// The backend mints a short-lived signed streaming URL; the AppStream stack must have embedding
// enabled with this app's domain allow-listed.
type Session = { userId: string | null; mine: boolean; state: string; connectionState: string; startTime: string | null };
type Capacity = {
  fleet: { state: string; type: string | null; maxUserDurationSec: number | null; idleDisconnectSec: number | null };
  capacity: { desired: number | null; running: number | null; inUse: number | null; available: number | null };
  sessions: Session[];
  isAdmin: boolean;
};

// "since" elapsed label for a session start time.
const sinceLabel = (iso: string | null) => {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
};

const CapacityPanel: React.FC<{ cap: Capacity | null; loading: boolean; err: string | null; onRefresh: () => void }> = ({ cap, loading, err, onRefresh }) => {
  const { t } = useTranslation();
  const fleetState = cap?.fleet.state || 'UNKNOWN';
  const stateColor =
    fleetState === 'RUNNING' ? 'bg-success/15 text-success'
    : fleetState === 'STOPPED' ? 'bg-gray-400/20 text-gray-500 dark:text-gray-300'
    : 'bg-warning/15 text-warning'; // STARTING / STOPPING / UNKNOWN
  const c = cap?.capacity;
  const avail = c?.available ?? null;
  const noFree = fleetState === 'RUNNING' && avail !== null && avail <= 0;

  const stat = (label: string, val: number | null, highlight?: boolean) => (
    <div className={`rounded-lg border px-4 py-3 ${highlight ? 'border-primary/40 bg-primary/5' : 'border-stroke dark:border-strokedark'}`}>
      <p className="text-2xl font-bold text-black dark:text-white">{val ?? '—'}</p>
      <p className="text-xs font-medium text-body">{label}</p>
    </div>
  );

  return (
    <div className="mb-5 rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-black dark:text-white">{t('kaizenDemo.sessions.title')}</h3>
          {cap && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${stateColor}`}>{t(`kaizenDemo.sessions.state.${fleetState}`, fleetState)}</span>}
        </div>
        <button onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4">
          {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-body border-t-transparent" />}
          {t('kaizenDemo.sessions.refresh')}
        </button>
      </div>

      {err ? (
        <p className="rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">{err}</p>
      ) : !cap ? (
        <p className="text-sm text-body">…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stat(t('kaizenDemo.sessions.available'), c!.available, true)}
            {stat(t('kaizenDemo.sessions.inUse'), c!.inUse)}
            {stat(t('kaizenDemo.sessions.running'), c!.running)}
            {stat(t('kaizenDemo.sessions.desired'), c!.desired)}
          </div>

          {fleetState === 'STOPPED' && (
            <p className="mt-4 rounded-lg bg-warning/10 px-4 py-2 text-sm text-[#9D5425] dark:text-warning">{t('kaizenDemo.sessions.hintStopped')}</p>
          )}
          {noFree && (
            <p className="mt-4 rounded-lg bg-warning/10 px-4 py-2 text-sm text-[#9D5425] dark:text-warning">{t('kaizenDemo.sessions.hintFull')}</p>
          )}

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-black dark:text-white">{t('kaizenDemo.sessions.activeCount', { count: cap.sessions.length })}</p>
            {cap.sessions.length === 0 ? (
              <p className="text-sm text-body">{t('kaizenDemo.sessions.none')}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-stroke dark:border-strokedark">
                <table className="w-full min-w-[480px] table-auto text-sm">
                  <thead>
                    <tr className="bg-gray-2 text-left dark:bg-meta-4">
                      <th className="px-4 py-2.5 font-medium text-black dark:text-white">{t('kaizenDemo.sessions.colUser')}</th>
                      <th className="px-4 py-2.5 font-medium text-black dark:text-white">{t('kaizenDemo.sessions.colState')}</th>
                      <th className="px-4 py-2.5 font-medium text-black dark:text-white">{t('kaizenDemo.sessions.colSince')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cap.sessions.map((s, i) => (
                      <tr key={i} className="border-t border-stroke dark:border-strokedark">
                        <td className="whitespace-nowrap px-4 py-2.5 text-black dark:text-white">
                          {s.userId || t('kaizenDemo.sessions.anonUser')}
                          {s.mine && <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">{t('kaizenDemo.sessions.you')}</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-body">
                          {s.state}{s.connectionState === 'NOT_CONNECTED' ? ` · ${t('kaizenDemo.sessions.notConnected')}` : ''}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-body">{sinceLabel(s.startTime) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const KaizenDemo: React.FC = () => {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Admin maintenance switch — checked upfront so a rep sees a friendly card instead of hitting
  // "Launch" and getting an AWS error while the image/fleet is being updated (see kaizen-status).
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string } | null>(null);
  useEffect(() => {
    axios.get(`${API_URL}/api/demo/kaizen-status`, { headers: authHeaders() })
      .then(r => setMaintenance(r.data))
      .catch(() => setMaintenance({ enabled: true, message: '' })); // fail open — don't block on a status-check error
  }, []);

  // Fleet capacity + active-sessions panel (diagnose "no streaming resources").
  const [cap, setCap] = useState<Capacity | null>(null);
  const [capOpen, setCapOpen] = useState(false);
  const [capLoading, setCapLoading] = useState(false);
  const [capErr, setCapErr] = useState<string | null>(null);

  const loadCapacity = async () => {
    setCapLoading(true); setCapErr(null);
    try {
      const r = await axios.get(`${API_URL}/api/demo/kaizen-capacity`, { headers: authHeaders() });
      setCap(r.data);
    } catch (e: any) {
      const code = e?.response?.data?.error;
      setCapErr(code === 'demo_not_configured' ? t('kaizenDemo.notConfigured') : (e?.response?.data?.detail || t('kaizenDemo.error')));
    } finally { setCapLoading(false); }
  };
  const toggleCapacity = () => {
    const next = !capOpen;
    setCapOpen(next);
    if (next) loadCapacity();
  };

  // Safari blocks the cross-origin storage the embedded AppStream stream needs (cross-site
  // tracking protection), so the iframe stays black. Opening the URL as a first-party tab works.
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  const openInNewTab = () => { if (url) window.open(url, '_blank', 'noopener,noreferrer'); };

  const launch = async () => {
    setLoading(true); setError(null);
    try {
      const r = await axios.post(`${API_URL}/api/demo/kaizen-url`, {}, { headers: authHeaders() });
      setUrl(r.data.url);
    } catch (e: any) {
      const code = e?.response?.data?.error;
      setError(
        code === 'demo_not_configured' ? t('kaizenDemo.notConfigured')
        : code === 'fleet_stopped' ? t('kaizenDemo.fleetStopped')
        : code === 'maintenance' ? (e?.response?.data?.message || t('kaizenDemo.maintenanceDefault'))
        : (e?.response?.data?.detail || t('kaizenDemo.error'))
      );
    } finally { setLoading(false); }
  };

  const fullscreen = () => { frameRef.current?.requestFullscreen?.(); };

  return (
    <div className="mx-auto max-w-screen-2xl">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white">{t('kaizenDemo.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('kaizenDemo.subtitle')}</p>
        </div>
        {maintenance?.enabled !== false && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button onClick={toggleCapacity} className="inline-flex items-center gap-2 rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {t('kaizenDemo.sessions.button')}
          </button>
          {url && (<>
            <button onClick={openInNewTab} className="inline-flex items-center gap-2 rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              {t('kaizenDemo.openNewTab')}
            </button>
            <button onClick={fullscreen} className="inline-flex items-center gap-2 rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              {t('kaizenDemo.fullscreen')}
            </button>
            <button onClick={launch} className="inline-flex items-center gap-2 rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {t('kaizenDemo.relaunch')}
            </button>
          </>)}
        </div>
        )}
      </div>

      {maintenance && !maintenance.enabled ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark" style={{ minHeight: '50vh' }}>
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
            <svg className="h-8 w-8 text-warning" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg>
          </div>
          <p className="mb-1 text-lg font-semibold text-black dark:text-white">{t('kaizenDemo.maintenanceTitle')}</p>
          <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">{maintenance.message || t('kaizenDemo.maintenanceDefault')}</p>
        </div>
      ) : (
      <>
      {capOpen && <CapacityPanel cap={cap} loading={capLoading} err={capErr} onRefresh={loadCapacity} />}

      {!url ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark" style={{ minHeight: '50vh' }}>
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>
          </div>
          <p className="mb-1 text-lg font-semibold text-black dark:text-white">{t('kaizenDemo.readyTitle')}</p>
          <p className="mb-6 max-w-md text-sm text-gray-500 dark:text-gray-400">{t('kaizenDemo.readyHint')}</p>
          {error && <p className="mb-4 max-w-md rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}
          <button onClick={launch} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
            {loading ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{t('kaizenDemo.launching')}</>
            ) : (
              <><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>{t('kaizenDemo.launch')}</>
            )}
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stroke bg-black shadow-default dark:border-strokedark">
          {isSafari && (
            <div className="flex items-start gap-2 bg-warning/15 px-4 py-3 text-sm text-[#9D5425] dark:text-warning">
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              <span>{t('kaizenDemo.safariHint')}</span>
            </div>
          )}
          <iframe
            ref={frameRef}
            src={url}
            title="Kaizen POS"
            className="w-full"
            style={{ height: 'calc(100vh - 220px)', minHeight: 480, border: 0 }}
            allow="fullscreen; clipboard-read; clipboard-write; microphone; camera"
          />
        </div>
      )}
      </>
      )}
    </div>
  );
};

export default KaizenDemo;
