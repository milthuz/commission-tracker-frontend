import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Navigation, Check, ChevronRight, RefreshCw, Loader2, FlaskConical } from 'lucide-react';
import { useField, TabBar } from './index';
import { Eyebrow, StatusBadge, btnPrimary, btnSecondary } from './ui';
import { GoogleMapView, pinIcon } from '../GoogleMap';
import { dialog } from '../../../lib/dialog';
import { STATUS_COLOR, haversine, fmtDistance, fmtMinutes, walkMin, directionsUrl, type PlaceStatus, type Stop } from '../api';

// Écrans 1a (carte) et 1b (liste) — la route du jour.

type Filter = 'all' | 'client' | 'prospect' | 'new';
const MONTREAL: [number, number] = [45.5236, -73.5865];

export default function Home({ view }: { view: 'map' | 'list' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lng, dark, route, loading, error, reload, position, date, canDemo, startDemo } = useField();
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mapRef = useRef<{ g: any; map: any } | null>(null);
  const layers = useRef<{ markers: Map<number, any>; me: any; line: any }>({ markers: new Map(), me: null, line: null });
  const [mapReady, setMapReady] = useState(false);

  const stops = route?.stops || [];
  const done = stops.filter((s) => s.outcome === 'done').length;
  const next = stops.find((s) => s.outcome === 'planned') || null;
  const shown = useMemo(() => stops.filter((s) => filter === 'all'
    || (filter === 'client' ? s.status === 'client' || s.status === 'former' : s.status === filter)), [stops, filter]);
  const selected = stops.find((s) => s.id === selectedId) || next;
  const dayLabel = date ? new Date(`${date}T12:00:00Z`).toLocaleDateString(lng === 'fr' ? 'fr-CA' : 'en-CA', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const distTo = (s: Stop | null) => (s && position && s.lat != null ? haversine(position, [s.lat, s.lng!]) : null);

  // Calques de la carte.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    const { g, map } = m;
    const L = layers.current;
    const ids = new Set(shown.map((s) => s.id));
    L.markers.forEach((mk, id) => { if (!ids.has(id)) { mk.setMap(null); L.markers.delete(id); } });
    shown.forEach((s) => {
      if (s.lat == null || s.lng == null) return;
      const n = stops.indexOf(s) + 1;
      const color = STATUS_COLOR[s.status as PlaceStatus] || STATUS_COLOR.new;
      const active = selected?.id === s.id;
      const icon = pinIcon(g, color, n, { size: active ? 36 : 28, done: s.outcome === 'done', active, surface: dark ? '#24303F' : '#FFFFFF' });
      let mk = L.markers.get(s.id);
      if (!mk) {
        mk = new g.maps.Marker({ position: { lat: s.lat, lng: s.lng }, map });
        mk.addListener('click', () => setSelectedId(s.id));
        L.markers.set(s.id, mk);
      }
      mk.setIcon(icon);
      mk.setZIndex(active ? 999 : n);
    });
    if (L.line) L.line.setMap(null);
    const path = stops.filter((s) => s.lat != null).map((s) => ({ lat: s.lat!, lng: s.lng! }));
    L.line = path.length > 1 ? new g.maps.Polyline({ path, map, strokeOpacity: 0, clickable: false,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, strokeColor: '#F58346', scale: 3 }, offset: '0', repeat: '10px' }] }) : null;
  }, [shown, stops, selected?.id, mapReady, dark]);

  // Position de l'opener.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !position) return;
    const L = layers.current;
    const icon = { path: m.g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#3C50E0', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 };
    if (!L.me) L.me = new m.g.maps.Marker({ position: { lat: position[0], lng: position[1] }, map: m.map, icon, zIndex: 2000, clickable: false });
    else L.me.setPosition({ lat: position[0], lng: position[1] });
  }, [position, mapReady]);

  // Cadrage : tous les arrêts (+ l'opener) au premier affichage.
  const framed = useRef(false);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || framed.current || !stops.length) return;
    framed.current = true;
    const b = new m.g.maps.LatLngBounds();
    stops.forEach((s) => s.lat != null && b.extend({ lat: s.lat, lng: s.lng }));
    m.map.fitBounds(b, { top: 140, bottom: 260, left: 40, right: 40 });
  }, [stops, mapReady]);

  const refresh = async () => { setRefreshing(true); await reload(); setRefreshing(false); };
  const [demoBusy, setDemoBusy] = useState(false);
  const tryDemo = async () => { setDemoBusy(true); try { await startDemo(); } catch (e: any) { dialog.alert(e.message); } finally { setDemoBusy(false); } };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (!route) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 pb-24 text-center">
        <Navigation className="h-10 w-10 text-primary" />
        <p className="text-lg font-bold text-[var(--of-title)]">{t('opener.field.noRoute')}</p>
        <p className="text-sm text-[var(--of-faint)]">{error ? t('opener.field.loadError') : t('opener.field.noRouteHelp', { date: dayLabel })}</p>
        <button onClick={refresh} className={btnSecondary}>{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t('opener.field.refresh')}</button>
        {canDemo && (
          <div className="mt-4 w-full rounded-[14px] border border-dashed border-[#8B5CF6]/60 p-4">
            <p className="mb-1 text-sm font-semibold text-[var(--of-title)]">{t('opener.field.demo.title')}</p>
            <p className="mb-3 text-xs text-[var(--of-faint)]">{t('opener.field.demo.help')}</p>
            <button onClick={tryDemo} disabled={demoBusy} className={`${btnPrimary} w-full !bg-[#8B5CF6] !text-white`}>
              {demoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}{t('opener.field.demo.start')}
            </button>
          </div>
        )}
        <TabBar />
      </div>
    );
  }

  const sheet = selected && (
    <div className="rounded-t-[18px] border-t border-[var(--of-stroke)] bg-[var(--of-surface)] px-4 pb-4 pt-2 shadow-[0_-8px_24px_var(--of-shadow)]">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--of-input-stroke)]" />
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>{selected.id === next?.id ? t('opener.field.nextStop', { n: stops.indexOf(selected) + 1, total: stops.length }) : t('opener.field.stopN', { n: stops.indexOf(selected) + 1, total: stops.length })}</Eyebrow>
        {distTo(selected) != null && <span className="text-xs font-medium text-[var(--of-faint)]">{fmtDistance(distTo(selected)!, lng)} · {walkMin(distTo(selected)!)} min</span>}
      </div>
      <button onClick={() => navigate(`/opener/stop/${selected.id}`)} className="mb-3 flex w-full items-start gap-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#1C2434]" style={{ background: STATUS_COLOR[selected.status as PlaceStatus] }}>
          {selected.outcome === 'done' ? <Check className="h-5 w-5" /> : stops.indexOf(selected) + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[17px] font-bold text-[var(--of-title)]">{selected.name}</p>
            <StatusBadge status={selected.status as PlaceStatus} version={selected.version} />
          </div>
          <p className="truncate text-[13px] text-[var(--of-muted)]">{selected.address || '—'}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-[var(--of-faint)]">
            {[
              selected.competitorPos ? `POS : ${selected.competitorPos}` : null,
              selected.lastVisitAt ? t('opener.field.visitedOn', { date: new Date(selected.lastVisitAt).toLocaleDateString(lng === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'long' }) }) : t('opener.field.neverVisited'),
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
        <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-[var(--of-faint)]" />
      </button>
      <div className="flex gap-2">
        {selected.lat != null && (
          <a href={directionsUrl(selected.lat, selected.lng!, selected.placeId)} target="_blank" rel="noreferrer" className={`${btnSecondary} flex-1`}>
            <Navigation className="h-4 w-4" />{t('opener.field.directions')}
          </a>
        )}
        {selected.outcome !== 'done' && route.status === 'published' && (
          <button onClick={() => navigate(`/opener/stop/${selected.id}/checkin`)} className={`${btnPrimary} flex-[1.4]`}>{t('opener.field.checkin')}</button>
        )}
        {selected.outcome === 'done' && (
          <button onClick={() => navigate(`/opener/stop/${selected.id}`)} className={`${btnSecondary} flex-[1.4]`}>{t('opener.field.openCard')}</button>
        )}
      </div>
    </div>
  );

  if (view === 'map') {
    return (
      <div className="fixed inset-0 mx-auto max-w-[480px]">
        <GoogleMapView lang={lng} dark={dark} className="absolute inset-0" center={position || MONTREAL} zoom={15}
          onReady={(g, map) => { mapRef.current = { g, map }; setMapReady(true); }}
          fallback={(err) => <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[var(--of-muted)]">{err === 'no_maps_key' ? t('opener.noMapsKey') : t('opener.mapsFailed')}</div>} />
        {/* Haut : route + compteur + filtres */}
        <div className="absolute inset-x-0 top-0 z-10 px-4" style={{ paddingTop: 'calc(var(--of-top, env(safe-area-inset-top, 0px)) + 16px)' }}>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--of-stroke)] bg-[var(--of-surface)] py-2 pl-2.5 pr-3.5 shadow-[0_4px_10px_var(--of-shadow)]">
              <Navigation className="h-[18px] w-[18px] shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-[var(--of-title)]">{route.name}</p>
                <p className="truncate text-[11px] font-medium text-[var(--of-faint)]">{dayLabel} · {t('opener.field.nStops', { n: stops.length })}</p>
              </div>
            </div>
            <div className="rounded-full border border-[var(--of-stroke)] bg-[var(--of-surface)] px-3 py-2 shadow-[0_4px_10px_var(--of-shadow)]">
              <span className="text-sm font-bold text-[var(--of-ok)]">{done}</span><span className="text-xs font-medium text-[var(--of-faint)]"> / {stops.length}</span>
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(['all', 'client', 'prospect', 'new'] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow ${filter === f ? 'bg-primary text-[#1C2434]' : 'border border-[var(--of-stroke)] bg-[var(--of-surface)] text-[var(--of-text)]'}`}>
                {f !== 'all' && <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[f as PlaceStatus] }} />}
                {t(`opener.field.filter.${f}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="absolute inset-x-0 z-10" style={{ bottom: 'calc(58px + env(safe-area-inset-bottom, 0px))' }}>{sheet}</div>
        <TabBar />
      </div>
    );
  }

  // ------------------------------------------------------------------ liste
  const upcoming = stops.filter((s) => s.outcome === 'planned');
  const finished = stops.filter((s) => s.outcome !== 'planned');
  return (
    <div className="px-4 pb-28" style={{ paddingTop: 'calc(var(--of-top, env(safe-area-inset-top, 0px)) + 20px)' }}>
      <p className="text-xs font-medium capitalize text-[var(--of-faint)]">{dayLabel}</p>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h1 className="truncate text-2xl font-bold tracking-[-0.01em] text-[var(--of-title)]">{route.name}</h1>
        <p className="shrink-0"><span className="text-[22px] font-bold text-[var(--of-ok)]">{done}</span><span className="text-sm text-[var(--of-faint)]"> / {stops.length}</span></p>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-[var(--of-surface)]">
        <div className="h-full rounded-full bg-[#57D193] transition-all" style={{ width: `${stops.length ? (done / stops.length) * 100 : 0}%` }} />
      </div>
      {route.status === 'closed' && <p className="mb-3 rounded-[10px] border border-[var(--of-stroke)] bg-[var(--of-surface)] p-3 text-xs text-[var(--of-muted)]">{t('opener.field.routeClosed')}</p>}

      {upcoming.length > 0 && <Eyebrow className="mb-2">{t('opener.field.upcoming')}</Eyebrow>}
      <div className="mb-5 space-y-2">
        {upcoming.map((s) => {
          const d = distTo(s);
          return (
            <button key={s.id} onClick={() => navigate(`/opener/stop/${s.id}`)}
              className={`flex w-full items-center gap-3 rounded-[14px] border bg-[var(--of-surface)] px-3.5 py-3 text-left ${s.id === next?.id ? 'border-primary' : 'border-[var(--of-stroke)]'}`}>
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#1C2434]" style={{ background: STATUS_COLOR[s.status as PlaceStatus] }}>{stops.indexOf(s) + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><p className="truncate text-[15px] font-bold text-[var(--of-title)]">{s.name}</p><StatusBadge status={s.status as PlaceStatus} version={s.version} /></div>
                <p className="truncate text-xs text-[var(--of-faint)]">{s.address || '—'}{d != null ? ` · ${fmtDistance(d, lng)}` : ''}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-[var(--of-faint)]" />
            </button>
          );
        })}
      </div>
      {finished.length > 0 && <Eyebrow className="mb-2">{t('opener.field.finished')}</Eyebrow>}
      <div className="space-y-2">
        {finished.map((s) => (
          <button key={s.id} onClick={() => navigate(`/opener/stop/${s.id}`)} className="flex w-full items-center gap-3 rounded-[14px] border border-[var(--of-stroke)] px-3.5 py-3 text-left opacity-75">
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 bg-[var(--of-surface)]" style={{ borderColor: STATUS_COLOR[s.status as PlaceStatus] }}>
              {s.outcome === 'done' ? <Check className="h-4 w-4" style={{ color: STATUS_COLOR[s.status as PlaceStatus] }} /> : <span className="text-xs text-[var(--of-faint)]">—</span>}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-[var(--of-title)]">{s.name}</p>
              <p className="truncate text-xs text-[var(--of-faint)]">
                {s.outcome === 'done'
                  ? `${t('opener.field.checkinAt', { time: s.doneAt ? new Date(s.doneAt).toLocaleTimeString(lng === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' }) : '—' })}${s.checkin?.durationMin != null ? ` · ${fmtMinutes(s.checkin.durationMin)}` : ''}${s.checkin ? ` · ${t('opener.field.interestShort', { n: s.checkin.interest })}` : ''}${s.checkin?.leadId ? ` · ${t('opener.field.leadCreated')}` : ''}`
                  : t(`opener.skip.${s.skipReason || 'other'}`)}
              </p>
            </div>
          </button>
        ))}
      </div>
      <TabBar />
    </div>
  );
}
