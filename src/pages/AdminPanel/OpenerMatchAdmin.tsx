import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Loader2, Search, Check, X, RotateCcw, ExternalLink, AlertTriangle, MapPin } from 'lucide-react';
import Select from '../../components/Select';
import { ContentLoader } from '../../common/Loader';
import { dialog } from '../../lib/dialog';

// Module Opener, lot 0 — appariement des magasins Cluster (API Kaizen) à leur fiche Google.
//
// Ce qui se décide ici : quels restaurants s'afficheront « client » sur la carte des openers.
// Le serveur apparie seul ce qui est sûr (même code postal, même nom, même numéro) ; cet écran
// sert aux cas douteux : deux fiches presque identiques, un nom qui ne ressemble pas, une
// adresse absente dans Kaizen. Une décision prise ici n'est JAMAIS écrasée par l'automatique.
//
// Permission : opener:match.

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

type MatchStatus = 'pending' | 'auto' | 'review' | 'none' | 'no_address' | 'manual' | 'ignored';

interface Candidate {
  id: string;
  googleName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  closed: boolean;
  score: number | null;
  parts: { postal?: string; name?: number; civic?: string; closed?: boolean };
}

interface Store {
  uuid: string;
  storeId: string | null;
  storeName: string;
  street: string | null;
  unit: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  active: boolean;
  missingSince: string | null;
  status: MatchStatus;
  placeId: string | null;
  score: number | null;
  candidates: Candidate[];
  matchedBy: string | null;
  matchedAt: string | null;
  note: string | null;
  sharedPlace: number;
}

interface RunInfo {
  at: string;
  source: string;
  sync?: { fetched: number; inserted: number; updated: number; missing: number; missingSkipped: boolean; rematch: number };
  match?: { tried: number; auto: number; review: number; none: number; no_address: number; errors: number; remaining: number; aborted?: boolean; lastError?: string; skipped?: string };
  syncError?: string;
  matchError?: string;
}

interface Status {
  configured: { kaizen: boolean; google: boolean };
  running: boolean;
  lastRun: RunInfo | null;
  counts: Record<MatchStatus, number>;
  totals: { active: number; inactive: number; missing: number };
}

const FILTERS = ['todo', 'review', 'none', 'no_address', 'pending', 'auto', 'manual', 'ignored', 'missing', 'all'] as const;
type Filter = typeof FILTERS[number];
const PAGE = 50;

const TONE: Record<MatchStatus, string> = {
  auto: 'bg-success/15 text-success',
  manual: 'bg-success/15 text-success',
  review: 'bg-warning/15 text-warning',
  none: 'bg-danger/10 text-danger',
  no_address: 'bg-danger/10 text-danger',
  pending: 'bg-stroke text-body dark:bg-meta-4 dark:text-bodydark',
  ignored: 'bg-stroke text-body dark:bg-meta-4 dark:text-bodydark',
};

const mapsUrl = (placeId: string) => `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
const fmtDate = (s: string | null | undefined, lng: string) => (s ? new Date(s).toLocaleString(lng === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

const OpenerMatchAdmin = () => {
  const { t, i18n } = useTranslation();
  const lng = i18n.language?.startsWith('fr') ? 'fr' : 'en';
  const [status, setStatus] = useState<Status | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Filter>('todo');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // uuid en cours d'action
  const [searchFor, setSearchFor] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => { const h = window.setTimeout(() => setQDebounced(q.trim()), 300); return () => window.clearTimeout(h); }, [q]);
  useEffect(() => { setOffset(0); }, [filter, active, qDebounced]);

  const loadStatus = useCallback(async () => {
    const r = await fetch(`${API_URL}/api/opener/kaizen/status`, { headers: authHeaders() });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    const s: Status = await r.json();
    setStatus(s);
    return s;
  }, []);

  const loadStores = useCallback(async () => {
    setListLoading(true);
    try {
      const p = new URLSearchParams({ status: filter, limit: String(PAGE), offset: String(offset) });
      if (active) p.set('active', active);
      if (qDebounced) p.set('q', qDebounced);
      const r = await fetch(`${API_URL}/api/opener/kaizen/stores?${p}`, { headers: authHeaders() });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const d = await r.json();
      setStores(d.stores);
      setTotal(d.total);
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setListLoading(false); }
  }, [filter, active, qDebounced, offset]);

  useEffect(() => {
    loadStatus().catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [loadStatus]);
  useEffect(() => { loadStores(); }, [loadStores]);

  // Pendant une synchro : on relit l'état toutes les 5 s, puis la liste à la fin.
  useEffect(() => {
    if (!status?.running) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const s = await loadStatus();
        if (!s.running) { if (pollRef.current) window.clearInterval(pollRef.current); loadStores(); }
      } catch { /* on réessaie au prochain tour */ }
    }, 5000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [status?.running, loadStatus, loadStores]);

  const runSync = async () => {
    const r = await fetch(`${API_URL}/api/opener/kaizen/sync`, { method: 'POST', headers: authHeaders(), body: '{}' });
    if (r.status === 409) { dialog.alert(t('openerMatch.alreadyRunning')); }
    else if (!r.ok) { dialog.alert((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`); return; }
    setStatus((s) => (s ? { ...s, running: true } : s));
  };

  const replaceStore = (st: Store) => setStores((list) => list.map((x) => (x.uuid === st.uuid ? st : x)));

  const act = async (store: Store, path: 'confirm' | 'ignore' | 'reset', body: object = {}) => {
    setBusy(store.uuid);
    try {
      const r = await fetch(`${API_URL}/api/opener/kaizen/stores/${store.uuid}/${path}`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      if (path === 'confirm' && d.store) {
        replaceStore(d.store);
        if (searchFor === store.uuid) { setSearchFor(null); setSearchRes(null); }
      } else {
        await loadStores();
      }
      loadStatus().catch(() => {});
    } catch (e: any) {
      dialog.alert(t('openerMatch.actionFailed', { error: e.message }));
    } finally { setBusy(null); }
  };

  const confirmPlace = (store: Store, c: Candidate) => act(store, 'confirm', { placeId: c.id });

  const ignore = async (store: Store) => {
    if (!(await dialog.confirm(t('openerMatch.ignoreConfirm', { name: store.storeName }), { confirmText: t('openerMatch.ignore') }))) return;
    act(store, 'ignore', {});
  };
  const reset = async (store: Store) => {
    if ((store.status === 'manual' || store.status === 'ignored')
      && !(await dialog.confirm(t('openerMatch.resetConfirm', { name: store.storeName }), { confirmText: t('openerMatch.reset'), danger: true }))) return;
    act(store, 'reset');
  };

  const openSearch = (store: Store) => {
    setSearchFor(store.uuid);
    setSearchRes(null);
    setSearchQ([store.storeName, store.street, store.city].filter(Boolean).join(', '));
  };
  const runSearch = async (store: Store) => {
    if (searchQ.trim().length < 3) return;
    setSearching(true);
    try {
      const p = new URLSearchParams({ q: searchQ.trim(), uuid: store.uuid });
      const r = await fetch(`${API_URL}/api/opener/kaizen/search?${p}`, { headers: authHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setSearchRes(d.candidates);
    } catch (e: any) { dialog.alert(t('openerMatch.actionFailed', { error: e.message })); }
    finally { setSearching(false); }
  };

  if (loading) return <ContentLoader />;
  if (!status) return <p className="text-sm text-danger">{error}</p>;

  const c = status.counts;
  const matched = c.auto + c.manual;
  const live = status.totals.active + status.totals.inactive;
  const run = status.lastRun;
  const scorePct = (s: number | null) => (s == null ? '—' : `${Math.round(s * 100)} %`);

  const addressLine = (s: Store) => [
    [s.street, s.unit ? `#${s.unit}` : null].filter(Boolean).join(' '),
    s.city, s.postalCode,
  ].filter(Boolean).join(', ');

  const CandidateRow = ({ store, cand }: { store: Store; cand: Candidate }) => (
    <div className="flex flex-wrap items-center gap-3 rounded border border-stroke px-3 py-2 dark:border-strokedark">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-black dark:text-white">
          {cand.googleName}
          {cand.closed && <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">{t('openerMatch.closedPermanently')}</span>}
        </p>
        <p className="text-xs text-body dark:text-bodydark">{cand.address}</p>
        {cand.score != null && (
          <p className="mt-0.5 text-xs text-body dark:text-bodydark">
            {t('openerMatch.score')} {scorePct(cand.score)} ·{' '}
            {t(`openerMatch.postal.${cand.parts.postal || 'unknown'}`)} ·{' '}
            {t('openerMatch.nameSim', { pct: Math.round((cand.parts.name || 0) * 100) })} ·{' '}
            {t(`openerMatch.civic.${cand.parts.civic || 'unknown'}`)}
          </p>
        )}
      </div>
      <a href={mapsUrl(cand.id)} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <ExternalLink className="h-3.5 w-3.5" />{t('openerMatch.viewOnMaps')}
      </a>
      <button onClick={() => confirmPlace(store, cand)} disabled={busy === store.uuid}
        className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
        {busy === store.uuid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        {t('openerMatch.thisOne')}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Configuration manquante : dit exactement quoi faire, et où. */}
      {(!status.configured.kaizen || !status.configured.google) && (
        <div className="flex gap-2 rounded-sm border border-warning bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-black dark:text-white">
            {!status.configured.kaizen && <p>{t('openerMatch.noKaizen')}</p>}
            {!status.configured.google && <p>{t('openerMatch.noGoogle')}</p>}
          </div>
        </div>
      )}

      {/* État du parc + dernier passage */}
      <div className="rounded-sm border border-stroke bg-white p-4 dark:border-strokedark dark:bg-boxdark">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-black dark:text-white">{t('openerMatch.parkTitle')}</h3>
            <p className="text-xs text-body dark:text-bodydark">
              {run ? t('openerMatch.lastRun', { date: fmtDate(run.at, lng), source: run.source.startsWith('manual') ? t('openerMatch.sourceManual') : t('openerMatch.sourceScheduled') }) : t('openerMatch.neverRun')}
            </p>
          </div>
          <button onClick={runSync} disabled={status.running || !status.configured.kaizen}
            className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
            {status.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {status.running ? t('openerMatch.running') : t('openerMatch.syncNow')}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: t('openerMatch.tiles.stores'), value: live, sub: t('openerMatch.tiles.storesSub', { active: status.totals.active, inactive: status.totals.inactive }) },
            { label: t('openerMatch.tiles.matched'), value: matched, sub: t('openerMatch.tiles.matchedSub', { auto: c.auto, manual: c.manual }), tone: 'text-success' },
            { label: t('openerMatch.tiles.toReview'), value: c.review + c.none + c.no_address, sub: t('openerMatch.tiles.toReviewSub', { review: c.review, none: c.none, noAddr: c.no_address }), tone: 'text-warning' },
            { label: t('openerMatch.tiles.pending'), value: c.pending, sub: t('openerMatch.tiles.pendingSub', { ignored: c.ignored, missing: status.totals.missing }) },
          ].map((tile) => (
            <div key={tile.label} className="rounded border border-stroke p-3 dark:border-strokedark">
              <p className="text-xs font-medium text-body dark:text-bodydark">{tile.label}</p>
              <p className={`text-2xl font-bold tracking-tight ${tile.tone || 'text-black dark:text-white'}`}>{tile.value.toLocaleString(lng === 'fr' ? 'fr-CA' : 'en-CA')}</p>
              <p className="text-xs text-body dark:text-bodydark">{tile.sub}</p>
            </div>
          ))}
        </div>

        {run && (run.syncError || run.matchError || run.match?.aborted || run.sync?.missingSkipped) && (
          <div className="mt-3 space-y-1 text-xs text-danger">
            {run.syncError && <p>{t('openerMatch.syncError', { error: run.syncError })}</p>}
            {run.matchError && <p>{t('openerMatch.matchError', { error: run.matchError })}</p>}
            {run.match?.aborted && <p>{t('openerMatch.matchAborted', { error: run.match.lastError || '' })}</p>}
            {run.sync?.missingSkipped && <p className="text-warning">{t('openerMatch.missingSkipped')}</p>}
          </div>
        )}
        {run?.match && !run.match.skipped && (
          <p className="mt-2 text-xs text-body dark:text-bodydark">
            {t('openerMatch.lastMatch', { tried: run.match.tried, auto: run.match.auto, review: run.match.review, none: run.match.none, remaining: run.match.remaining })}
          </p>
        )}
      </div>

      {/* Barre de filtres — carte pleine largeur sous l'en-tête (convention du projet). */}
      <div className="rounded-sm border border-stroke bg-white p-3 dark:border-strokedark dark:bg-boxdark">
        <div className="mb-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const n = f === 'todo' ? c.review + c.none + c.no_address
              : f === 'missing' ? status.totals.missing
              : f === 'all' ? live
              : c[f as MatchStatus];
            return (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === f
                  ? 'bg-primary text-white'
                  : 'border border-stroke text-black hover:border-primary dark:border-strokedark dark:text-bodydark1'}`}>
                {t(`openerMatch.filter.${f}`)} <span className="opacity-70">({n})</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-body" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('openerMatch.searchPlaceholder') as string}
              className="w-full rounded border border-stroke bg-transparent py-2.5 pl-9 pr-4 text-sm text-black outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white" />
          </div>
          <div className="w-48">
            <Select value={active} onChange={(v) => setActive(v as '' | 'true' | 'false')}
              options={[
                { value: '', label: t('openerMatch.activeAll') },
                { value: 'true', label: t('openerMatch.activeOnly') },
                { value: 'false', label: t('openerMatch.inactiveOnly') },
              ]} />
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="space-y-2">
        {listLoading && stores.length === 0 && <ContentLoader />}
        {!listLoading && stores.length === 0 && (
          <p className="rounded-sm border border-stroke bg-white p-6 text-center text-sm text-body dark:border-strokedark dark:bg-boxdark dark:text-bodydark">
            {t('openerMatch.empty')}
          </p>
        )}
        {stores.map((s) => (
          <div key={s.uuid} className={`rounded-sm border bg-white p-4 dark:bg-boxdark ${s.status === 'review' ? 'border-warning/60' : 'border-stroke dark:border-strokedark'} ${listLoading ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-black dark:text-white">{s.storeName}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[s.status]}`}>{t(`openerMatch.status.${s.status}`)}</span>
                  {!s.active && <span className="rounded-full bg-stroke px-2 py-0.5 text-xs text-body dark:bg-meta-4 dark:text-bodydark">{t('openerMatch.inactive')}</span>}
                  {s.missingSince && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">{t('openerMatch.missingSince', { date: fmtDate(s.missingSince, lng) })}</span>}
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-body dark:text-bodydark">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {addressLine(s) || <span className="italic">{t('openerMatch.noAddress')}</span>}
                </p>
                <p className="text-xs text-body dark:text-bodydark">
                  {[
                    s.storeId ? `Kaizen ${s.storeId}` : null,
                    s.status === 'manual' && s.matchedBy ? t('openerMatch.matchedBy', { who: s.matchedBy, date: fmtDate(s.matchedAt, lng) }) : null,
                    s.status === 'auto' ? t('openerMatch.autoScore', { score: scorePct(s.score) }) : null,
                    s.status === 'ignored' ? s.note : null,
                  ].filter(Boolean).join(' · ')}
                </p>
                {s.note && s.status === 'manual' && <p className="mt-1 text-xs text-warning">{s.note}</p>}
                {s.sharedPlace > 0 && <p className="mt-1 text-xs text-warning">{t('openerMatch.sharedPlace', { count: s.sharedPlace })}</p>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {s.placeId && (
                  <a href={mapsUrl(s.placeId)} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-stroke px-3 py-1.5 text-xs font-medium text-black hover:border-primary dark:border-strokedark dark:text-white">
                    <ExternalLink className="h-3.5 w-3.5" />{t('openerMatch.viewOnMaps')}
                  </a>
                )}
                {s.status !== 'ignored' && (
                  <button onClick={() => (searchFor === s.uuid ? setSearchFor(null) : openSearch(s))}
                    className="inline-flex items-center gap-1 rounded border border-stroke px-3 py-1.5 text-xs font-medium text-black hover:border-primary dark:border-strokedark dark:text-white">
                    <Search className="h-3.5 w-3.5" />{s.placeId ? t('openerMatch.change') : t('openerMatch.search')}
                  </button>
                )}
                {s.status !== 'ignored' && (
                  <button onClick={() => ignore(s)} disabled={busy === s.uuid}
                    className="inline-flex items-center gap-1 rounded border border-stroke px-3 py-1.5 text-xs font-medium text-black hover:border-danger hover:text-danger disabled:opacity-50 dark:border-strokedark dark:text-white">
                    <X className="h-3.5 w-3.5" />{t('openerMatch.ignore')}
                  </button>
                )}
                {s.status !== 'pending' && (
                  <button onClick={() => reset(s)} disabled={busy === s.uuid} title={t('openerMatch.resetHelp') as string}
                    className="inline-flex items-center gap-1 rounded border border-stroke px-3 py-1.5 text-xs font-medium text-black hover:border-primary disabled:opacity-50 dark:border-strokedark dark:text-white">
                    <RotateCcw className="h-3.5 w-3.5" />{t('openerMatch.reset')}
                  </button>
                )}
              </div>
            </div>

            {/* Candidats proposés par l'automatique */}
            {s.candidates.length > 0 && searchFor !== s.uuid && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-body dark:text-bodydark2">{t('openerMatch.candidates')}</p>
                {s.candidates.map((cand) => <CandidateRow key={cand.id} store={s} cand={cand} />)}
              </div>
            )}

            {/* Recherche Google libre */}
            {searchFor === s.uuid && (
              <div className="mt-3 space-y-2">
                <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); runSearch(s); }}>
                  <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} autoFocus
                    className="min-w-[240px] flex-1 rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white" />
                  <button type="submit" disabled={searching || searchQ.trim().length < 3}
                    className="inline-flex items-center gap-1.5 rounded bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {t('openerMatch.searchGoogle')}
                  </button>
                </form>
                <p className="text-xs text-body dark:text-bodydark">{t('openerMatch.searchHelp')}</p>
                {searchRes && searchRes.length === 0 && <p className="text-sm text-body dark:text-bodydark">{t('openerMatch.noResults')}</p>}
                {searchRes?.map((cand) => <CandidateRow key={cand.id} store={s} cand={cand} />)}
              </div>
            )}
          </div>
        ))}
      </div>

      {total > PAGE && (
        <div className="flex items-center justify-between text-sm text-body dark:text-bodydark">
          <span>{t('openerMatch.pageInfo', { from: offset + 1, to: Math.min(offset + PAGE, total), total })}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}
              className="rounded border border-stroke px-3 py-1.5 disabled:opacity-40 dark:border-strokedark">{t('openerMatch.prev')}</button>
            <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}
              className="rounded border border-stroke px-3 py-1.5 disabled:opacity-40 dark:border-strokedark">{t('openerMatch.next')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpenerMatchAdmin;
