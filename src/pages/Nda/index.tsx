import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import { ContentLoader } from '../../common/Loader';
import { dialog } from '../../lib/dialog';
import { Button, DataTable, FilterBar, PageHeader, StatusPill, Tabs } from '../../components/ui';
import NdaForm from './NdaForm';
import NdaDetailView from './NdaDetailView';
import { API_URL, authHeaders, DELETABLE, scrollToTop, statusFamily, type NdaDetail, type NdaListItem, type NdaMeta, type NdaStatus, type Signer } from './types';

// Section NDA : ententes de confidentialité envoyées pour signature électronique. N'importe
// quelle équipe les prépare (`nda:send`) ; Cluster est toujours contresigné par le signataire
// configuré (David). Même organisation que la section RH : une page, trois vues (liste, fiche,
// formulaire), et le lien « ?id= » des courriels internes ouvre directement la fiche.

type Tab = 'active' | 'toSign' | 'completed' | 'closed' | 'all';
const TAB_STATUSES: Record<Exclude<Tab, 'all'>, NdaStatus[]> = {
  active: ['draft', 'sent', 'viewed', 'party_signed'],
  toSign: ['party_signed'],
  completed: ['completed'],
  closed: ['declined', 'cancelled'],
};
type View = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; detail: NdaDetail } | { kind: 'detail'; detail: NdaDetail };

const INPUT =
  'w-full rounded-[10px] border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';

// Réglage du signataire de Cluster — visible seulement avec nda:countersign.
const SignerEditor = ({ signer, onSaved }: { signer: Signer; onSaved: (s: Signer) => void }) => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Signer>(signer);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/nda/signer`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || String(r.status));
      onSaved(d.signer); setOpen(false);
    } catch (e: any) { dialog.alert(`${t('nda.detail.actionFailed')} ${e?.message || ''}`); } finally { setBusy(false); }
  };
  return (
    <div className="mt-5 rounded-2xl border border-stroke bg-white px-5 py-4 text-sm dark:border-strokedark dark:bg-boxdark">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-black dark:text-white">{t('nda.signer.current', { name: signer.name, title: (fr ? signer.titleFr : signer.titleEn) || signer.titleEn || signer.titleFr, email: signer.email })}</span>
        {!open && <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => { setV(signer); setOpen(true); }}>{t('common.edit')}</button>}
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {([['name', t('nda.signer.name')], ['email', t('nda.signer.email')], ['titleEn', t('nda.signer.titleEn')], ['titleFr', t('nda.signer.titleFr')]] as [keyof Signer, string][]).map(([k, label]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-xs text-bodydark2">{label}</span>
                <input className={INPUT} value={v[k] || ''} onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
          <p className="text-xs text-bodydark2">{t('nda.signer.hint')}</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={save}>{t('nda.form.save')}</Button>
          </div>
        </div>
      )}
    </div>
  );
};

const Nda = () => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');
  const location = useLocation();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<NdaMeta | null>(null);
  const [rows, setRows] = useState<NdaListItem[] | null>(null);
  const [tab, setTab] = useState<Tab>('active');
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [error, setError] = useState<string | null>(null);

  const loadList = async () => {
    try {
      const res = await fetch(`${API_URL}/api/nda/agreements`, { headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      setRows((await res.json()).agreements || []);
    } catch { setRows([]); setError(t('nda.loadFailed') as string); }
  };
  const openNda = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/nda/agreements/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      setView({ kind: 'detail', detail: await res.json() });
      navigate(`/nda?id=${id}`, { replace: true });
    } catch { setError(t('nda.loadFailed') as string); }
  };

  useEffect(() => {
    fetch(`${API_URL}/api/nda/meta`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((m: NdaMeta) => setMeta(m))
      .catch(() => setError(t('nda.loadFailed') as string));
    loadList();
    const id = new URLSearchParams(location.search).get('id');
    if (id) openNda(id);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const viewKey = view.kind === 'detail' || view.kind === 'edit' ? `${view.kind}:${view.detail.id}` : view.kind;
  useEffect(() => { scrollToTop(); }, [viewKey]);

  const backToList = () => { setView({ kind: 'list' }); navigate('/nda', { replace: true }); loadList(); };

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { active: 0, toSign: 0, completed: 0, closed: 0, all: rows?.length || 0 };
    for (const r of rows || []) for (const k of Object.keys(TAB_STATUSES) as Exclude<Tab, 'all'>[]) if (TAB_STATUSES[k].includes(r.status)) c[k] += 1;
    return c;
  }, [rows]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || [])
      .filter((r) => tab === 'all' || TAB_STATUSES[tab].includes(r.status))
      .filter((r) => !needle || `${r.company} ${r.signerName} ${r.email} ${r.ref} ${r.team} ${r.createdBy}`.toLowerCase().includes(needle));
  }, [rows, tab, q]);

  const removeRow = async (r: NdaListItem) => {
    if (!(await dialog.confirm(t('nda.detail.confirmDelete', { company: r.company }) as string, { danger: true, confirmText: t('common.delete') }))) return;
    const res = await fetch(`${API_URL}/api/nda/agreements/${r.id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) { dialog.alert(t('nda.detail.actionFailed') as string); return; }
    loadList();
  };
  const when = (r: NdaListItem) => r.completedAt || r.partySignedAt || r.viewedAt || r.sentAt || r.updatedAt;
  // L'onglet « À contresigner » ne sert qu'au signataire.
  const tabs: Tab[] = meta?.can.countersign ? ['active', 'toSign', 'completed', 'closed', 'all'] : ['active', 'completed', 'closed', 'all'];

  if (!meta && !error) return <ContentLoader />;

  return (
    <>
      <div id="nda-top" />
      {view.kind !== 'list' && <Breadcrumb pageName={t('sidebar.nda')} />}
      {error && <div className="mb-5 rounded border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      {meta && view.kind === 'new' && (
        <NdaForm meta={meta} initial={null} onCancel={backToList} onSaved={(d) => { setView({ kind: 'detail', detail: d }); navigate(`/nda?id=${d.id}`, { replace: true }); }} />
      )}
      {meta && view.kind === 'edit' && (
        <NdaForm meta={meta} initial={view.detail} onCancel={() => setView({ kind: 'detail', detail: view.detail })} onSaved={(d) => setView({ kind: 'detail', detail: d })} />
      )}
      {meta && view.kind === 'detail' && (
        <NdaDetailView meta={meta} detail={view.detail} onBack={backToList}
          onEdit={() => setView({ kind: 'edit', detail: view.detail })}
          onChanged={(d) => setView({ kind: 'detail', detail: d })}
          onDeleted={backToList} onOpen={openNda} />
      )}

      {meta && view.kind === 'list' && (
        <>
          <PageHeader section={t('sidebar.sections.ops')} title={t('nda.title')} subtitle={t('nda.subtitle', { name: meta.signer.name })}
            actions={meta.can.send ? (
              <Button size="md" variant="primary" onClick={() => setView({ kind: 'new' })}
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}>
                {t('nda.new')}
              </Button>
            ) : undefined} />

          <Tabs tabs={tabs.map((k) => ({ id: k, label: t(`nda.tabs.${k}`), count: counts[k] > 0 ? counts[k] : undefined }))} value={tab} onChange={setTab} />

          <div className="mt-4 space-y-4">
            <FilterBar search={q} onSearch={setQ} searchPlaceholder={t('nda.search') as string} />
            <DataTable
              rows={visible}
              rowKey={(r) => r.id}
              onRowClick={(r) => openNda(r.id)}
              loading={rows === null}
              empty={{
                title: rows && rows.length ? t('nda.noMatch') : t('nda.empty'),
                body: rows && !rows.length && meta.can.send
                  ? <button type="button" onClick={() => setView({ kind: 'new' })} className="mt-1 text-sm font-bold text-accent-ink hover:underline dark:text-accent-ink-dark">{t('nda.new')}</button>
                  : undefined,
              }}
              columns={[
                { key: 'company', header: t('nda.columns.company'), sortValue: (r) => r.company.toLowerCase(),
                  render: (r) => (<div className="min-w-0"><p className="m-0 font-bold">{r.company}</p><p className="m-0 text-xs text-body dark:text-bodydark2">{r.ref} · {r.signerName}</p></div>) },
                { key: 'kind', header: t('nda.columns.kind'), render: (r) => <span className="whitespace-nowrap">{t(`nda.form.mode.${r.mode}`)} · {r.lang.toUpperCase()}</span> },
                { key: 'by', header: t('nda.columns.preparedBy'), sortValue: (r) => r.createdBy || '',
                  render: (r) => <span className="text-xs">{r.team ? <b className="mr-1">{r.team}</b> : null}{r.createdBy}</span> },
                { key: 'status', header: t('nda.columns.status'), sortValue: (r) => r.status,
                  render: (r) => <StatusPill family={statusFamily[r.status]}>{t(`nda.status.${r.status}`)}</StatusPill> },
                { key: 'updated', header: t('nda.columns.updated'), sortValue: (r) => when(r) || '',
                  render: (r) => <span className="whitespace-nowrap text-xs text-body dark:text-bodydark2">{new Date(when(r)).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric' })}</span> },
                ...(meta.can.send ? [{ key: 'del', header: '', align: 'right' as const,
                  render: (r: NdaListItem) => DELETABLE.includes(r.status) ? (
                    <button type="button" title={t('common.delete') as string} aria-label={t('common.delete') as string}
                      onClick={(e) => { e.stopPropagation(); removeRow(r); }}
                      className="rounded p-1.5 text-body transition hover:bg-danger/10 hover:text-danger dark:text-bodydark2">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                    </button>
                  ) : null }] : []),
              ]}
            />
          </div>
          {meta.can.editSigner && <SignerEditor signer={meta.signer} onSaved={(s) => setMeta((m) => (m ? { ...m, signer: s } : m))} />}
        </>
      )}
    </>
  );
};

export default Nda;
