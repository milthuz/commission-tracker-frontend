import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Search, RefreshCw, ChevronRight, MapPin } from 'lucide-react';
import { TabBar, useField } from './index';
import { Eyebrow, GpsBanner, StatusBadge, inputCls } from './ui';
import { api, ApiError, fmtDistance, type PlaceStatus } from '../api';
import { saveFreePlace, type FreePlace } from './freePlace';

// Check-in LIBRE (2026-10-16, David : « permettre les check-ins à n'importe quel moment, l'étendre
// à tous mes employés ») : les restaurants autour du téléphone, ou cherchés par nom ; un appui
// ouvre le check-in habituel, sans route. Permission opener:checkin (incluse dans opener:field).

export default function Here() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lng, position, gps, retryGps, online } = useField();
  const [places, setPlaces] = useState<FreePlace[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);

  const search = useCallback(async (text?: string) => {
    setBusy(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (position) { p.set('lat', String(position[0])); p.set('lng', String(position[1])); }
      if (text?.trim()) p.set('q', text.trim());
      const r = await api<{ places: FreePlace[] }>(`/api/opener/nearby?${p}`);
      setPlaces(r.places);
    } catch (e) {
      const err = e as ApiError;
      setError(err.body?.error === 'scan_budget_exhausted' ? t('opener.field.here.budget') : err.message);
    } finally { setBusy(false); }
  }, [position, t]);

  // Les restos autour, dès que la position arrive (une fois ; « Actualiser » relance).
  useEffect(() => {
    if (asked.current || !position) return;
    asked.current = true;
    search();
  }, [position, search]);

  const pick = (p: FreePlace) => { saveFreePlace(p); navigate(`/opener/here/${encodeURIComponent(p.placeId)}/checkin`); };

  return (
    <div className="px-4 pb-28" style={{ paddingTop: 'calc(var(--of-top, env(safe-area-inset-top, 0px)) + 20px)' }}>
      <Eyebrow>{t('opener.field.here.eyebrow')}</Eyebrow>
      <h1 className="mb-1 text-2xl font-bold tracking-[-0.01em] text-[var(--of-title)]">{t('opener.field.here.title')}</h1>
      <p className="mb-3 text-sm text-[var(--of-muted)]">{t('opener.field.here.help')}</p>

      <GpsBanner gps={gps} onRetry={() => { asked.current = false; retryGps(); }} className="mb-3" />

      <form onSubmit={(e) => { e.preventDefault(); search(q); }} className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--of-faint)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('opener.field.here.searchPh') as string}
            className={`${inputCls} pl-9`} enterKeyHint="search" />
        </div>
        <button type="submit" disabled={busy || !online} className="h-11 rounded-[10px] bg-primary px-4 text-sm font-bold text-[#141414] disabled:opacity-50">
          {t('opener.field.here.search')}
        </button>
      </form>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--of-muted)]">
          {q.trim() && places ? t('opener.field.here.results', { n: places.length }) : t('opener.field.here.around')}
        </p>
        <button onClick={() => { setQ(''); search(); }} disabled={busy || (!position && !q)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{t('opener.field.refresh')}
        </button>
      </div>

      {!online && <p className="mb-2 text-xs text-[var(--of-warn)]">{t('opener.field.here.offline')}</p>}
      {error && <p className="mb-2 text-sm text-[var(--of-bad)]">{error}</p>}
      {!places && !error && (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-[var(--of-muted)]">
          {position || busy ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <MapPin className="h-7 w-7 text-[var(--of-faint)]" />}
          {position || busy ? t('opener.field.here.looking') : t('opener.field.here.noPosition')}
        </div>
      )}
      {places && !places.length && <p className="py-8 text-center text-sm text-[var(--of-muted)]">{t('opener.field.here.none')}</p>}

      <div className="space-y-2">
        {places?.map((p) => (
          <button key={p.placeId} onClick={() => pick(p)}
            className="flex w-full items-center gap-3 rounded-[14px] border border-[var(--of-stroke)] bg-[var(--of-surface)] p-3 text-left">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[15px] font-bold text-[var(--of-title)]">{p.name}</p>
                <StatusBadge status={p.status as PlaceStatus} version={p.version} />
              </div>
              <p className="truncate text-xs text-[var(--of-muted)]">{p.address}</p>
              <p className="truncate text-[11px] text-[var(--of-faint)]">
                {[p.distanceM != null ? fmtDistance(p.distanceM, lng) : null, p.franchise ? t('opener.franchise.badge') : null,
                  p.competitorPos ? `POS : ${p.competitorPos}` : null,
                  p.lastVisitAt ? t('opener.field.visitedOn', { date: new Date(p.lastVisitAt).toLocaleDateString(lng === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'long' }) }) : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary">{t('opener.field.checkin')}<ChevronRight className="h-4 w-4" /></span>
          </button>
        ))}
      </div>
      <TabBar />
    </div>
  );
}
