import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import { ContentLoader } from '../../common/Loader';
import HireForm from './HireForm';
import AddendumForm from './AddendumForm';
import HireDetailView from './HireDetailView';
import { dialog } from '../../lib/dialog';
import { API_URL, authHeaders, DELETABLE, scrollToTop, statusFamily, type HireDetail, type HireListItem, type HireStatus, type Meta } from './types';
import { Button, DataTable, FilterBar, PageHeader, StatusPill, Tabs } from '../../components/ui';

// Section RH : embauche d'un représentant. Une seule page qui alterne trois vues (liste, fiche,
// formulaire) plutôt que des fenêtres superposées — pas de second ascenseur, et le lien
// « ?id= » envoyé dans les courriels internes ouvre directement la bonne fiche.

type Tab = 'active' | 'completed' | 'closed' | 'all';
const TAB_STATUSES: Record<Exclude<Tab, 'all'>, HireStatus[]> = {
  active: ['draft', 'sent', 'viewed', 'employee_signed'],
  completed: ['completed'],
  closed: ['declined', 'cancelled'],
};

type View = { kind: 'list' } | { kind: 'new' } | { kind: 'newAddendum' } | { kind: 'edit'; detail: HireDetail } | { kind: 'detail'; detail: HireDetail };

const HR = () => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');
  const location = useLocation();
  const navigate = useNavigate();

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
      .filter((r) => !needle || `${r.name} ${r.email} ${r.ref} ${r.position} ${r.docTitleFr || ""} ${r.docTitleEn || ""}`.toLowerCase().includes(needle));
  }, [rows, tab, q]);

  const day = (iso?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return '—';
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  // Suppression depuis la liste (brouillon, annulé, refusé) — même garde que la fiche.
  const removeRow = async (r: HireListItem) => {
    if (!(await dialog.confirm(t(r.status === 'draft' ? 'hr.detail.confirmDelete' : 'hr.detail.confirmDeleteClosed', { name: r.name }) as string))) return;
    const res = await fetch(`${API_URL}/api/hr/hires/${r.id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) { dialog.alert(t('hr.detail.actionFailed') as string); return; }
    loadList();
  };
  const when = (r: HireListItem) => r.completedAt || r.employeeSignedAt || r.viewedAt || r.sentAt || r.updatedAt;

  if (!meta && !error) return <ContentLoader />;

  return (
    <>
      <div id="hr-top" />
      {/* Le fil d'Ariane sert de titre aux fiches et aux formulaires. La liste a déjà son propre
          titre + sous-titre : les deux ensemble affichaient « Embauches » deux fois. */}
      {view.kind !== 'list' && <Breadcrumb pageName={t('sidebar.hr')} />}
      {error && <div className="mb-5 rounded border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      {meta && view.kind === 'new' && (
        <HireForm meta={meta} initial={null} onCancel={backToList} onSaved={(d) => { setView({ kind: 'detail', detail: d }); navigate(`/hr?id=${d.id}`, { replace: true }); }} />
      )}
      {meta && view.kind === 'newAddendum' && (
        <AddendumForm meta={meta} initial={null} hires={rows || []} onCancel={backToList} onSaved={(d) => { setView({ kind: 'detail', detail: d }); navigate(`/hr?id=${d.id}`, { replace: true }); }} />
      )}
      {meta && view.kind === 'edit' && view.detail.kind === 'addendum' && (
        <AddendumForm meta={meta} initial={view.detail} hires={rows || []} onCancel={() => setView({ kind: 'detail', detail: view.detail })} onSaved={(d) => setView({ kind: 'detail', detail: d })} />
      )}
      {meta && view.kind === 'edit' && view.detail.kind !== 'addendum' && (
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
          <PageHeader section={t('sidebar.sections.direction')} title={t('hr.title')} subtitle={t('hr.subtitle')}
            actions={meta.can.manage ? (<>
              <Button size="md" onClick={() => setView({ kind: 'newAddendum' })}
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 12v6M9 15h6" /></svg>}>
                {t('hr.addendum.new')}
              </Button>
              <Button size="md" variant="primary" onClick={() => setView({ kind: 'new' })}
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}>
                {t('hr.newHire')}
              </Button>
            </>) : undefined} />

          <Tabs tabs={(['active', 'completed', 'closed', 'all'] as Tab[]).map((k) => ({ id: k, label: t(`hr.tabs.${k}`), count: counts[k] > 0 ? counts[k] : undefined }))}
            value={tab} onChange={setTab} />

          <div className="mt-4 space-y-4">
            <FilterBar search={q} onSearch={setQ} searchPlaceholder={t('hr.search') as string} />
            <DataTable
              rows={visible}
              rowKey={(r) => r.id}
              onRowClick={(r) => openHire(r.id)}
              loading={rows === null}
              empty={{
                title: rows && rows.length ? t('hr.noMatch') : t('hr.empty'),
                body: rows && !rows.length && meta.can.manage
                  ? <button type="button" onClick={() => setView({ kind: 'new' })} className="mt-1 text-sm font-bold text-accent-ink hover:underline dark:text-accent-ink-dark">{t('hr.newHire')}</button>
                  : undefined,
              }}
              columns={[
                { key: 'name', header: t('hr.columns.candidate'), sortValue: (r) => (r.name || '').toLowerCase(),
                  render: (r) => (<div className="min-w-0"><p className="m-0 font-bold">{r.name}</p><p className="m-0 text-xs text-body dark:text-bodydark2">{r.ref} · {r.email}</p></div>) },
                { key: 'position', header: t('hr.columns.position'),
                  render: (r) => r.kind === 'addendum'
                    ? <><StatusPill family="new" className="mr-1.5">{t('hr.addendum.badge')}</StatusPill>{(fr ? r.docTitleFr : r.docTitleEn) || r.docTitleFr}</>
                    : r.position },
                { key: 'start', header: t('hr.columns.start'), sortValue: (r) => r.startDate || '', render: (r) => <span className="whitespace-nowrap">{day(r.startDate)}</span> },
                { key: 'status', header: t('hr.columns.status'), sortValue: (r) => r.status,
                  render: (r) => <StatusPill family={statusFamily[r.status]}>{t(`hr.status.${r.status}`)}</StatusPill> },
                { key: 'updated', header: t('hr.columns.updated'), sortValue: (r) => when(r) || '',
                  render: (r) => <span className="whitespace-nowrap text-xs text-body dark:text-bodydark2">{new Date(when(r)).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric' })}</span> },
                ...(meta.can.manage ? [{ key: 'del', header: '', align: 'right' as const,
                  render: (r: HireListItem) => DELETABLE.includes(r.status) ? (
                    <button type="button" title={t('common.delete') as string} aria-label={t('common.delete') as string}
                      onClick={(e) => { e.stopPropagation(); removeRow(r); }}
                      className="rounded p-1.5 text-body transition hover:bg-danger/10 hover:text-danger dark:text-bodydark2">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                    </button>
                  ) : null }] : []),
              ]}
            />
          </div>
        </>
      )}
    </>
  );
};

export default HR;
