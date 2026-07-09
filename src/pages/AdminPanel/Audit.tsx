import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface SessionUser {
  email: string;
  displayName: string;
  accountType: 'zoho' | 'local' | 'unknown';
  isAdmin: boolean;
  sessionCount: number;
  hours: number;
  lastSeenAt: string;
  online: boolean;
}
interface SessionsResponse {
  range: string; users: SessionUser[]; onlineNow: number; activeUsers: number; totalHours: number;
}
interface LogRow {
  id: number; entity_type: string; entity_id: string; event_type: string;
  description: string; actor: string | null; amount: number | null; created_at: string;
}
interface Facets { actors: string[]; entityTypes: string[]; eventTypes: string[]; }

const SUBTABS = ['dashboard', 'logs'] as const;
type SubTab = typeof SUBTABS[number];
const RANGES = ['today', '7d', '30d'] as const;

// Admin → Audit: (1) who's connected right now + how many hours (coarse, session-based —
// see server.js touchSession), and (2) a filterable/paginated feed over the shared activity_log
// table across every domain (invoices, proposals, rep pay, auth, user management).
const Audit: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [subTab, setSubTab] = useState<SubTab>('dashboard');

  // Dashboard
  const [range, setRange] = useState<typeof RANGES[number]>('7d');
  const [sessions, setSessions] = useState<SessionsResponse | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState(false);

  const loadSessions = async (r: typeof RANGES[number]) => {
    setSessionsLoading(true); setSessionsError(false);
    try {
      const res = await axios.get(`${API_URL}/api/admin/audit/sessions`, { headers: authHeaders(), params: { range: r } });
      setSessions(res.data);
    } catch { setSessionsError(true); } finally { setSessionsLoading(false); }
  };
  useEffect(() => { if (subTab === 'dashboard') loadSessions(range); }, [subTab, range]);

  // Logs
  const [facets, setFacets] = useState<Facets>({ actors: [], entityTypes: [], eventTypes: [] });
  const [actor, setActor] = useState('');
  const [entityType, setEntityType] = useState('');
  const [eventType, setEventType] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState(false);
  const pageSize = 50;

  useEffect(() => {
    if (subTab !== 'logs') return;
    axios.get(`${API_URL}/api/admin/audit/logs/facets`, { headers: authHeaders() })
      .then(res => setFacets(res.data)).catch(() => {});
  }, [subTab]);

  const loadLogs = async () => {
    setLogsLoading(true); setLogsError(false);
    try {
      const res = await axios.get(`${API_URL}/api/admin/audit/logs`, {
        headers: authHeaders(),
        params: { actor: actor || undefined, entityType: entityType || undefined, eventType: eventType || undefined, q: q || undefined, from: from || undefined, to: to || undefined, page, pageSize },
      });
      setLogs(res.data.rows || []); setLogsTotal(res.data.total || 0);
    } catch { setLogsError(true); } finally { setLogsLoading(false); }
  };
  useEffect(() => { if (subTab === 'logs') loadLogs(); }, [subTab, page]);

  const applyFilters = () => { setPage(1); loadLogs(); };
  const resetFilters = () => { setActor(''); setEntityType(''); setEventType(''); setQ(''); setFrom(''); setTo(''); setPage(1); setTimeout(loadLogs, 0); };

  const fmtDt = (s: string) => new Date(s).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' });
  const totalPages = Math.max(1, Math.ceil(logsTotal / pageSize));

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-stroke bg-white p-1 shadow-default dark:border-strokedark dark:bg-boxdark">
        {SUBTABS.map((key) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${subTab === key ? 'bg-primary text-white shadow-sm' : 'text-body hover:bg-gray-50 dark:hover:bg-meta-4'}`}>
            {t(`admin.audit.tabs.${key}`)}
          </button>
        ))}
      </div>

      {subTab === 'dashboard' && (
        <>
          <div className="mb-4 flex items-center justify-end gap-1 rounded-lg border border-stroke bg-white p-1 shadow-default dark:border-strokedark dark:bg-boxdark w-fit">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${range === r ? 'bg-primary text-white' : 'text-body hover:bg-gray-50 dark:hover:bg-meta-4'}`}>
                {t(`admin.audit.range.${r}`)}
              </button>
            ))}
          </div>

          {sessionsLoading ? (
            <div className="flex h-32 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : sessionsError ? (
            <div className="rounded-xl border border-stroke bg-white p-8 text-center text-sm text-danger shadow-default dark:border-strokedark dark:bg-boxdark">{t('admin.audit.error')}</div>
          ) : sessions && (
            <>
              <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
                  <p className="text-sm text-body">{t('admin.audit.onlineNow')}</p>
                  <p className="mt-1 text-2xl font-bold text-success">{sessions.onlineNow}</p>
                </div>
                <div className="rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
                  <p className="text-sm text-body">{t('admin.audit.activeUsers')}</p>
                  <p className="mt-1 text-2xl font-bold text-black dark:text-white">{sessions.activeUsers}</p>
                </div>
                <div className="rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
                  <p className="text-sm text-body">{t('admin.audit.totalHours')}</p>
                  <p className="mt-1 text-2xl font-bold text-black dark:text-white">{sessions.totalHours.toFixed(1)}h</p>
                </div>
              </div>

              {sessions.users.length === 0 ? (
                <div className="rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark"><p className="text-sm text-gray-500">{t('admin.audit.noActivity')}</p></div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="bg-gray-2 dark:bg-meta-4">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">{t('admin.audit.colUser')}</th>
                          <th className="px-4 py-3 text-left font-medium">{t('admin.audit.colStatus')}</th>
                          <th className="px-4 py-3 text-right font-medium">{t('admin.audit.colHours')}</th>
                          <th className="px-4 py-3 text-right font-medium">{t('admin.audit.colSessions')}</th>
                          <th className="px-4 py-3 text-left font-medium">{t('admin.audit.colLastSeen')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.users.map((u) => (
                          <tr key={u.email} className="border-t border-stroke dark:border-strokedark">
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-black dark:text-white">{u.displayName}</p>
                              <p className="text-xs text-gray-400">{u.email}</p>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.online ? 'bg-success/15 text-success' : 'bg-gray-200 text-body dark:bg-meta-4'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${u.online ? 'bg-success' : 'bg-gray-400'}`} />
                                {u.online ? t('admin.audit.online') : t('admin.audit.offline')}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-body">{u.hours.toFixed(1)}h</td>
                            <td className="px-4 py-2.5 text-right text-body">{u.sessionCount}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-body">{fmtDt(u.lastSeenAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {subTab === 'logs' && (
        <>
          <div className="mb-4 rounded-xl border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[160px]">
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.audit.filterActor')}</label>
                <select value={actor} onChange={(e) => setActor(e.target.value)} className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white">
                  <option value="">{t('admin.audit.all')}</option>
                  {facets.actors.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="min-w-[140px]">
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.audit.filterEntityType')}</label>
                <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white">
                  <option value="">{t('admin.audit.all')}</option>
                  {facets.entityTypes.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="min-w-[160px]">
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.audit.filterEventType')}</label>
                <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white">
                  <option value="">{t('admin.audit.all')}</option>
                  {facets.eventTypes.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="min-w-[130px]">
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.audit.filterFrom')}</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
              </div>
              <div className="min-w-[130px]">
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.audit.filterTo')}</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.audit.filterSearch')}</label>
                <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
                  placeholder={t('admin.audit.filterSearchPlaceholder') as string}
                  className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
              </div>
              <button onClick={applyFilters} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90">{t('admin.audit.applyFilters')}</button>
              <button onClick={resetFilters} className="rounded-md border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4">{t('admin.audit.resetFilters')}</button>
            </div>
          </div>

          {logsLoading ? (
            <div className="flex h-32 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : logsError ? (
            <div className="rounded-xl border border-stroke bg-white p-8 text-center text-sm text-danger shadow-default dark:border-strokedark dark:bg-boxdark">{t('admin.audit.error')}</div>
          ) : logs.length === 0 ? (
            <div className="rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark"><p className="text-sm text-gray-500">{t('admin.audit.noLogs')}</p></div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-gray-2 dark:bg-meta-4">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">{t('admin.audit.colWhen')}</th>
                      <th className="px-4 py-3 text-left font-medium">{t('admin.audit.colActor')}</th>
                      <th className="px-4 py-3 text-left font-medium">{t('admin.audit.colEntity')}</th>
                      <th className="px-4 py-3 text-left font-medium">{t('admin.audit.colEvent')}</th>
                      <th className="px-4 py-3 text-left font-medium">{t('admin.audit.colDescription')}</th>
                      <th className="px-4 py-3 text-right font-medium">{t('admin.audit.colAmount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((r) => (
                      <tr key={r.id} className="border-t border-stroke dark:border-strokedark">
                        <td className="whitespace-nowrap px-4 py-2.5 text-body">{fmtDt(r.created_at)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-body">{r.actor || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-body dark:bg-meta-4">{r.entity_type}</span>
                          <span className="ml-1.5 text-xs text-gray-400">{r.entity_id}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{r.event_type}</span>
                        </td>
                        <td className="px-4 py-2.5 text-black dark:text-white">{r.description}</td>
                        <td className={`whitespace-nowrap px-4 py-2.5 text-right font-medium ${r.amount != null && r.amount < 0 ? 'text-danger' : 'text-body'}`}>
                          {r.amount != null ? `${r.amount < 0 ? '-' : ''}$${Math.abs(r.amount).toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-stroke px-4 py-3 dark:border-strokedark">
                <p className="text-xs text-gray-400">{t('admin.audit.pageOf', { page, totalPages, total: logsTotal })}</p>
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body transition hover:bg-gray-1 disabled:opacity-40 dark:border-strokedark dark:hover:bg-meta-4">{t('admin.audit.prev')}</button>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body transition hover:bg-gray-1 disabled:opacity-40 dark:border-strokedark dark:hover:bg-meta-4">{t('admin.audit.next')}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Audit;
