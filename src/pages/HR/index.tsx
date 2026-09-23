import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import { ContentLoader } from '../../common/Loader';
import HireForm from './HireForm';
import HireDetailView from './HireDetailView';
import { API_URL, authHeaders, scrollToTop, statusTone, type HireDetail, type HireListItem, type HireStatus, type Meta } from './types';

// Section RH : embauche d'un représentant. Une seule page qui alterne trois vues (liste, fiche,
// formulaire) plutôt que des fenêtres superposées — pas de second ascenseur, et le lien
// « ?id= » envoyé dans les courriels internes ouvre directement la bonne fiche.

type Tab = 'active' | 'completed' | 'closed' | 'all';
const TAB_STATUSES: Record<Exclude<Tab, 'all'>, HireStatus[]> = {
  active: ['draft', 'sent', 'viewed', 'employee_signed'],
  completed: ['completed'],
  closed: ['declined', 'cancelled'],
};

type View = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; detail: HireDetail } | { kind: 'detail'; detail: HireDetail };

const HR = () => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<HireListItem[] | null>(null);
  const [tab, setTab] = useState<Tab>('active');
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [error, setError] = useState<string | null>(null);

  const loadList = async () => {
    try {
      const res = await fetch(`${API_URL}/api/hr/hires`, { headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      setRows((await res.json()).hires || []);
    } catch { setRows([]); setError(t('hr.loadFailed') as string); }
  };

  const openHire = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/hr/hires/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      setView({ kind: 'detail', detail: await res.json() });
      navigate(`/hr?id=${id}`, { replace: true });
    } catch { setError(t('hr.loadFailed') as string); }
  };

  useEffect(() => {
    fetch(`${API_URL}/api/hr/meta`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setMeta)
      .catch(() => setError(t('hr.loadFailed') as string));
    loadList();
    const id = new URLSearchParams(location.search).get('id');
    if (id) openHire(id);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  // Chaque changement de vue repart du haut (formulaire long → fiche, fiche → liste).
  const viewKey = view.kind === 'detail' || view.kind === 'edit' ? `${view.kind}:${view.detail.id}` : view.kind;
  useEffect(() => { scrollToTop(); }, [viewKey]);

  const backToList = () => {
    setView({ kind: 'list' });
    navigate('/hr', { replace: true });
    loadList();
  };

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { active: 0, completed: 0, closed: 0, all: rows?.length || 0 };
    for (const r of rows || []) for (const k of Object.keys(TAB_STATUSES) as Exclude<Tab, 'all'>[]) if (TAB_STATUSES[k].includes(r.status)) c[k] += 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || [])
      .filter((r) => tab === 'all' || TAB_STATUSES[tab].includes(r.status))
      .filter((r) => !needle || `${r.name} ${r.email} ${r.ref} ${r.position}`.toLowerCase().includes(needle));
  }, [rows, tab, q]);

  const day = (iso?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return '—';
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const when = (r: HireListItem) => r.completedAt || r.employeeSignedAt || r.viewedAt || r.sentAt || r.updatedAt;

  if (!meta && !error) return <ContentLoader />;

  return (
    <>
      <div id="hr-top" />
      <Breadcrumb pageName={t('sidebar.hr')} />
      {error && <div className="mb-5 rounded border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      {meta && view.kind === 'new' && (
        <HireForm meta={meta} initial={null} onCancel={backToList} onSaved={(d) => { setView({ kind: 'detail', detail: d }); navigate(`/hr?id=${d.id}`, { replace: true }); }} />
      )}
      {meta && view.kind === 'edit' && (
        <HireForm meta={meta} initial={view.detail} onCancel={() => setView({ kind: 'detail', detail: view.detail })} onSaved={(d) => setView({ kind: 'detail', detail: d })} />
      )}
      {meta && view.kind === 'detail' && (
        <HireDetailView
          meta={meta}
          detail={view.detail}
          onBack={backToList}
          onEdit={() => setView({ kind: 'edit', detail: view.detail })}
          onChanged={(d) => setView({ kind: 'detail', detail: d })}
          onDeleted={backToList}
          onOpen={openHire}
        />
      )}

      {meta && view.kind === 'list' && (
        <>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-title-md2 font-bold text-black dark:text-white">{t('hr.title')}</h2>
              <p className="mt-1 text-sm text-bodydark2">{t('hr.subtitle')}</p>
              {meta.can.manage && !user?.isAdmin && (
                <Link to="/admin/hr" className="mt-1 inline-block text-sm font-medium text-primary hover:underline">{t('hr.managers.settingsLink')}</Link>
              )}
            </div>
            {meta.can.manage && (
              <button type="button" onClick={() => setView({ kind: 'new' })}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                {t('hr.newHire')}
              </button>
            )}
          </div>

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-stroke bg-white p-3 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="inline-flex flex-wrap gap-1">
              {(['active', 'completed', 'closed', 'all'] as Tab[]).map((k) => (
                <button key={k} type="button" onClick={() => setTab(k)}
                  className={`rounded-sm px-4 py-2 text-sm font-medium transition-colors ${tab === k ? 'bg-primary text-white' : 'text-bodydark2 hover:text-black dark:hover:text-white'}`}>
                  {t(`hr.tabs.${k}`)}
                  {counts[k] > 0 && <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${tab === k ? 'bg-white/25' : 'bg-gray-2 dark:bg-meta-4'}`}>{counts[k]}</span>}
                </button>
              ))}
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hr.search') as string}
              className="w-full rounded border border-stroke bg-transparent px-4 py-2 text-sm text-black outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white sm:w-64" />
          </div>

          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            {rows === null ? (
              <div className="px-6 py-12 text-center text-sm text-bodydark2">{t('common.loading')}</div>
            ) : !visible.length ? (
              <div className="px-6 py-14 text-center">
                <p className="text-sm text-bodydark2">{rows.length ? t('hr.noMatch') : t('hr.empty')}</p>
                {!rows.length && meta.can.manage && (
                  <button type="button" onClick={() => setView({ kind: 'new' })} className="mt-3 text-sm font-medium text-primary hover:underline">{t('hr.newHire')}</button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] table-auto">
                  <thead>
                    <tr className="border-b border-stroke text-left text-xs text-bodydark2 dark:border-strokedark">
                      <th className="px-5 py-3 font-medium">{t('hr.columns.candidate')}</th>
                      <th className="px-4 py-3 font-medium">{t('hr.columns.position')}</th>
                      <th className="px-4 py-3 font-medium">{t('hr.columns.start')}</th>
                      <th className="px-4 py-3 font-medium">{t('hr.columns.status')}</th>
                      <th className="px-4 py-3 font-medium">{t('hr.columns.updated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id} onClick={() => openHire(r.id)} className="cursor-pointer border-b border-stroke last:border-0 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4">
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium text-black dark:text-white">{r.name}</p>
                          <p className="text-xs text-bodydark2">{r.ref} · {r.email}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-black dark:text-white">{r.position}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-black dark:text-white">{day(r.startDate)}</td>
                        <td className="px-4 py-3">
                          <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusTone[r.status]}`}>{t(`hr.status.${r.status}`)}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-bodydark2">
                          {new Date(when(r)).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
};

export default HR;
