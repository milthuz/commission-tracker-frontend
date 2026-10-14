import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MapPin, RefreshCw, ExternalLink, ChevronLeft, ChevronRight, ArrowLeft, X, AlertTriangle, Star, Clock } from 'lucide-react';
import { ContentLoader } from '../../common/Loader';
import { api, fmtDistance, fmtMinutes, VERDICT_COLOR, STATUS_COLOR, type OverviewRoute, type OverviewStop, type PlaceStatus } from './api';
import { GoogleMapView, getOpenerConfig, pinIcon, useIsDark } from './GoogleMap';
import { convexHull, type LatLng } from './geo';

// « Suivi des visites » (gestionnaire, opener:routes). Refait le 2026-10-14 à la demande de David :
// « je veux voir ce qu'il a fait aujourd'hui, highlighter sa route et voir le résultat de chaque
// visite ; et sur la carte, tel client, quel système, visité quand ».
//
// - Un JOUR à la fois (‹ date ›), une carte par opener avec ses résultats.
// - Choisir un opener met SA route en évidence : tracé dans l'ordre réel des visites, les autres
//   routes s'effacent.
// - Chaque point a la couleur du RÉSULTAT de la visite (lead, intéressé, tiède, pas intéressé,
//   client, non visité, à faire). Le contrôle GPS reste visible : ⚠ quand la visite a été faite
//   loin du restaurant ou sans position.
// - Un clic sur un point (ou une ligne) ouvre la fiche du résultat : système, heure, durée,
//   intérêt, satisfaction, notes, lead.

export type ResultKind = 'lead' | 'hot' | 'warm' | 'cold' | 'client' | 'skipped' | 'todo';
export const RESULT_COLOR: Record<ResultKind, string> = {
  lead: '#F58346', hot: '#22C55E', warm: '#EAB308', cold: '#EF4444', client: '#0EA5E9', skipped: '#94A3B8', todo: '#CBD5E1',
};
const RESULT_ORDER: ResultKind[] = ['lead', 'hot', 'warm', 'cold', 'client', 'skipped', 'todo'];
export const resultOf = (s: OverviewStop): ResultKind => {
  if (s.outcome === 'skipped') return 'skipped';
  if (s.outcome !== 'done') return 'todo';
  if (s.result?.lead) return 'lead';
  if (s.place?.status === 'client') return 'client';
  const i = s.result?.interest || 0;
  return i >= 4 ? 'hot' : i === 3 ? 'warm' : i > 0 ? 'cold' : 'client';
};
const gpsWarn = (s: OverviewStop) => s.outcome === 'done' && !!s.checkin && (s.checkin.verdict === 'far' || s.checkin.verdict === 'nogps');

const MONTREAL: LatLng = [45.5236, -73.5865];
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// L'ordre RÉEL de la journée : les visites dans l'ordre des check-ins, puis les non visités, puis le reste.
const visitOrder = (stops: OverviewStop[]) => [
  ...stops.filter((s) => s.outcome === 'done' && s.checkin).sort((a, b) => a.checkin!.at.localeCompare(b.checkin!.at)),
  ...stops.filter((s) => s.outcome === 'done' && !s.checkin),
  ...stops.filter((s) => s.outcome === 'skipped'),
  ...stops.filter((s) => s.outcome === 'planned'),
];

export default function RouteTracking({ onOpen }: { onOpen: (routeId: number) => void }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language?.startsWith('fr') ? 'fr' : 'en';
  const loc = lng === 'fr' ? 'fr-CA' : 'en-CA';
  const dark = useIsDark();
  const [today, setToday] = useState('');
  const [day, setDay] = useState('');
  const [routes, setRoutes] = useState<OverviewRoute[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [stopSel, setStopSel] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mapRef = useRef<{ g: any; map: any } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const layers = useRef<any[]>([]);
  const fitted = useRef('');
  const fmtTime = (s: string) => new Date(s).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  const fmtDay = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString(loc, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

  useEffect(() => { getOpenerConfig().then((c) => { setToday(c.today); setDay(c.today); }).catch(() => {}); }, []);

  const load = useCallback(async () => {
    if (!day) return;
    setRefreshing(true);
    try {
      const r = await api<{ routes: OverviewRoute[] }>(`/api/opener/routes-overview?from=${day}&to=${day}`);
      setRoutes(r.routes);
    } catch { setRoutes([]); } finally { setRefreshing(false); }
  }, [day]);
  useEffect(() => { setRoutes(null); setSelected(null); setStopSel(null); load(); }, [load]);
  // La journée en cours se rafraîchit toute seule chaque minute.
  useEffect(() => {
    if (!day || day !== today) return;
    const iv = window.setInterval(load, 60000);
    return () => window.clearInterval(iv);
  }, [day, today, load]);

  const sel = routes?.find((r) => r.id === selected) || null;
  const stopOf = (id: number | null) => (id == null ? null : routes?.flatMap((r) => r.stops.map((s) => ({ s, r }))).find((x) => x.s.id === id) || null);
  const picked = stopOf(stopSel);
  const counts = (rs: OverviewRoute[]) => {
    const c: Record<ResultKind, number> = { lead: 0, hot: 0, warm: 0, cold: 0, client: 0, skipped: 0, todo: 0 };
    rs.forEach((r) => r.stops.forEach((s) => { c[resultOf(s)]++; }));
    return c;
  };
  const dayCounts = useMemo(() => counts(routes || []), [routes]);
  const legendCounts = useMemo(() => counts(sel ? [sel] : routes || []), [routes, sel]);

  // ------------------------------------------------------------------ carte
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !routes) return;
    const { g, map } = m;
    layers.current.forEach((l) => l.setMap(null));
    layers.current = [];
    const bounds = new g.maps.LatLngBounds();
    let any = false;
    for (const r of routes) {
      const focus = selected == null || r.id === selected;
      const pts = r.stops.filter((s) => s.lat != null).map((s) => [s.lat!, s.lng!] as LatLng);
      const zone = r.zone && r.zone.length >= 3 ? r.zone : pts.length >= 3 ? convexHull(pts) : null;
      if (zone) {
        const poly = new g.maps.Polygon({ paths: zone.map(([a, b]) => ({ lat: a, lng: b })), map, zIndex: 1,
          strokeColor: r.id === selected ? '#F58346' : '#64748B', strokeOpacity: focus ? 0.8 : 0.25, strokeWeight: r.id === selected ? 3 : 1.5,
          fillColor: r.id === selected ? '#F58346' : '#64748B', fillOpacity: r.id === selected ? 0.07 : focus ? 0.05 : 0.02 });
        poly.addListener('click', () => { setSelected(r.id); setStopSel(null); });
        layers.current.push(poly);
      }
      // Tracé de la journée, dans l'ordre réel des visites (route choisie seulement).
      if (r.id === selected) {
        const path = visitOrder(r.stops).filter((s) => s.outcome === 'done' && s.lat != null).map((s) => ({ lat: s.lat!, lng: s.lng! }));
        if (path.length > 1) {
          layers.current.push(new g.maps.Polyline({ path, map, zIndex: 20, clickable: false, strokeColor: '#F58346', strokeOpacity: 0.9, strokeWeight: 3,
            icons: [{ icon: { path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.6, strokeColor: '#F58346', fillColor: '#F58346', fillOpacity: 1 }, offset: '50%', repeat: '90px' }] }));
        }
      }
      const order = visitOrder(r.stops);
      order.forEach((s) => {
        if (s.lat == null) return;
        if (focus) { any = true; bounds.extend({ lat: s.lat, lng: s.lng }); }
        const k = resultOf(s);
        const n = s.outcome === 'done' && r.id === selected ? order.filter((x) => x.outcome === 'done').indexOf(s) + 1 : null;
        const mk = new g.maps.Marker({ position: { lat: s.lat, lng: s.lng }, map, zIndex: stopSel === s.id ? 3000 : focus ? 100 : 10,
          opacity: focus ? 1 : 0.3,
          icon: pinIcon(g, RESULT_COLOR[k], n, { size: focus ? 22 : 16, active: stopSel === s.id }),
          title: `${s.name} — ${t(`opener.track.result.${k}`)}${gpsWarn(s) ? ` · ⚠ ${t(`opener.track.verdict.${s.checkin!.verdict}`)}` : ''}` });
        mk.addListener('click', () => { setSelected(r.id); setStopSel(s.id); });
        layers.current.push(mk);
        // Visite faite loin du restaurant : trait restaurant → position du téléphone.
        if (r.id === selected && s.checkin?.lat != null && (s.checkin.verdict === 'far' || s.checkin.verdict === 'imprecise')) {
          layers.current.push(new g.maps.Polyline({ path: [{ lat: s.lat, lng: s.lng }, { lat: s.checkin.lat, lng: s.checkin.lng }], map,
            strokeColor: VERDICT_COLOR[s.checkin.verdict], strokeOpacity: 0.9, strokeWeight: 2, zIndex: 8, clickable: false }));
        }
      });
      // Dernière position connue de l'opener (son dernier check-in).
      if (focus && r.lastCheckin?.lat != null) {
        layers.current.push(new g.maps.Marker({ position: { lat: r.lastCheckin.lat, lng: r.lastCheckin.lng }, map, zIndex: 2000,
          title: `${r.openerName || ''} · ${fmtTime(r.lastCheckin.at)} · ${r.lastCheckin.stopName}`,
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#3C50E0', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } }));
      }
    }
    // On recadre quand la sélection change, pas à chaque rafraîchissement automatique.
    const key = `${day}|${selected}`;
    if (any && fitted.current !== key) { map.fitBounds(bounds, 70); fitted.current = key; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, selected, stopSel, mapReady, dark]);

  useEffect(() => {
    const p = picked?.s;
    if (p?.lat != null) mapRef.current?.map.panTo({ lat: p.lat, lng: p.lng });
  }, [stopSel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ morceaux
  const card = 'rounded-sm border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';
  const dot = (c: string, size = 'h-2.5 w-2.5') => <span className={`${size} shrink-0 rounded-full`} style={{ background: c }} />;
  const resultLine = (s: OverviewStop) => {
    const k = resultOf(s);
    if (k === 'skipped') return t(`opener.skip.${s.skipReason || 'other'}`);
    if (k === 'todo') return t('opener.track.outcome.planned');
    const parts = [
      k === 'lead' && s.result?.lead ? `${t('opener.track.result.lead')} ${s.result.lead.refCode}` : null,
      s.place?.status === 'client' && s.result?.satisfaction ? t('opener.field.client.satShort', { n: s.result.satisfaction }) : null,
      s.result?.interest ? t('opener.field.interestShort', { n: s.result.interest }) : null,
      s.result?.currentPos || null,
    ];
    return parts.filter(Boolean).join(' · ') || t('opener.track.outcome.done');
  };
  const summary = (r: OverviewRoute) => {
    const c = counts([r]);
    return RESULT_ORDER.filter((k) => k !== 'todo' && c[k]).map((k) => (
      <span key={k} className="inline-flex items-center gap-1 font-semibold text-black dark:text-bodydark1">{dot(RESULT_COLOR[k], 'h-2 w-2')}{c[k]} {t(`opener.track.result.${k}`).toLowerCase()}</span>
    ));
  };

  if (!day) return <ContentLoader />;

  return (
    <div className="grid grid-cols-1 gap-4 2xl:h-[calc(100vh-260px)] 2xl:min-h-[600px] 2xl:grid-cols-[400px_minmax(0,1fr)]">
      {/* ---------------- Panneau : le jour, les openers, le détail ---------------- */}
      <div className={`${card} flex min-h-0 flex-col p-4 2xl:order-none order-last`}>
        <div className="mb-3 flex items-center gap-1.5">
          <button onClick={() => setDay(addDays(day, -1))} className="rounded-lg border border-stroke p-2 text-body hover:text-primary dark:border-strokedark" aria-label={t('opener.track.prevDay') as string}><ChevronLeft className="h-4 w-4" /></button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-bold capitalize text-black dark:text-white">{fmtDay(day)}</p>
            {day !== today && <button onClick={() => setDay(today)} className="text-[11px] font-semibold text-primary hover:underline">{t('opener.track.backToday')}</button>}
            {day === today && <p className="text-[11px] text-body dark:text-bodydark">{t('opener.track.period.today')}</p>}
          </div>
          <button onClick={() => setDay(addDays(day, 1))} className="rounded-lg border border-stroke p-2 text-body hover:text-primary dark:border-strokedark" aria-label={t('opener.track.nextDay') as string}><ChevronRight className="h-4 w-4" /></button>
          <button onClick={load} disabled={refreshing} aria-label={t('opener.track.refresh') as string} className="rounded-lg border border-stroke p-2 text-body hover:text-primary dark:border-strokedark">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>

        {!routes && <ContentLoader />}
        {routes && !routes.length && (
          <p className="rounded border border-dashed border-stroke p-4 text-center text-xs text-body dark:border-strokedark dark:text-bodydark">
            <MapPin className="mx-auto mb-1 h-4 w-4" />{t('opener.track.emptyDay')}
          </p>
        )}

        {/* Tous les openers du jour */}
        {routes && routes.length > 0 && !sel && (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              {[['visits', dayCounts.lead + dayCounts.hot + dayCounts.warm + dayCounts.cold + dayCounts.client], ['leads', dayCounts.lead], ['skipped', dayCounts.skipped]].map(([k, v]) => (
                <div key={k as string} className="rounded-lg bg-gray-2 py-2 dark:bg-meta-4">
                  <p className="text-lg font-bold text-black dark:text-white">{v as number}</p>
                  <p className="text-[11px] text-body dark:text-bodydark">{t(`opener.track.kpi.${k}`)}</p>
                </div>
              ))}
            </div>
            <p className="mb-2 text-[11px] text-body dark:text-bodydark">{t('opener.track.pickOpener')}</p>
            <div className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
              {routes.map((r) => (
                <button key={r.id} onClick={() => { setSelected(r.id); setStopSel(null); }}
                  className="block w-full rounded-lg border border-stroke p-3 text-left hover:border-primary dark:border-strokedark">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-black dark:text-white">{r.openerName || '—'}</p>
                      <p className="truncate text-xs text-body dark:text-bodydark">{r.name} · {t(`opener.routeStatus.${r.status}`)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-black dark:text-white">{r.done}<span className="text-xs font-medium text-body">/{r.total}</span></span>
                  </div>
                  <div className="mb-2 flex h-1.5 overflow-hidden rounded-full bg-stroke dark:bg-meta-4">
                    {RESULT_ORDER.filter((k) => k !== 'todo').map((k) => {
                      const c = counts([r])[k];
                      return c ? <div key={k} style={{ width: `${(c / Math.max(1, r.total)) * 100}%`, background: RESULT_COLOR[k] }} /> : null;
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    {summary(r)}
                    {!r.done && !r.skipped && <span className="text-body dark:text-bodydark">{t('opener.track.notStarted')}</span>}
                    {r.lastCheckin && <span className="text-body dark:text-bodydark">{t('opener.track.lastCheckin', { time: fmtTime(r.lastCheckin.at), name: r.lastCheckin.stopName })}</span>}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Un opener : sa journée, dans l'ordre réel */}
        {sel && (
          <>
            <button onClick={() => { setSelected(null); setStopSel(null); }} className="mb-2 inline-flex items-center gap-1 self-start text-xs font-semibold text-primary hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" />{t('opener.track.allOpeners')}
            </button>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-black dark:text-white">{sel.openerName || '—'}</p>
                <p className="truncate text-xs text-body dark:text-bodydark">{sel.name}</p>
              </div>
              <button onClick={() => onOpen(sel.id)} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />{t('opener.track.openRoute')}
              </button>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              {summary(sel)}
              {sel.visitMinutes > 0 && <span className="text-body dark:text-bodydark">{t('opener.track.visitTime', { time: fmtMinutes(sel.visitMinutes) })}</span>}
            </div>
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              {visitOrder(sel.stops).map((s) => {
                const k = resultOf(s);
                return (
                  <button key={s.id} onClick={() => setStopSel(s.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${stopSel === s.id ? 'bg-gray-2 dark:bg-meta-4' : 'hover:bg-gray-2 dark:hover:bg-meta-4/60'}`}>
                    <span className="w-10 shrink-0 text-[11px] tabular-nums text-body dark:text-bodydark">{s.checkin ? fmtTime(s.checkin.at) : ''}</span>
                    {dot(RESULT_COLOR[k])}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-black dark:text-white">{s.name}</p>
                      <p className="truncate text-[11px] text-body dark:text-bodydark">{resultLine(s)}</p>
                    </div>
                    {gpsWarn(s) && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger" aria-label={t(`opener.track.verdict.${s.checkin!.verdict}`) as string} />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ---------------- Carte ---------------- */}
      <div className={`${card} relative min-h-[520px] overflow-hidden`}>
        <GoogleMapView lang={lng} dark={dark} className="absolute inset-0" center={MONTREAL} zoom={12}
          onReady={(g, map) => { mapRef.current = { g, map }; fitted.current = ''; setMapReady(true); }}
          fallback={(err) => <div className="flex h-full items-center justify-center p-6 text-center text-sm text-body dark:text-bodydark">{err === 'no_maps_key' ? t('opener.noMapsKey') : t('opener.mapsFailed')}</div>} />
        {/* Légende : le résultat de chaque visite, avec les comptes. */}
        <div className="absolute left-3 top-3 w-[190px] rounded-lg border border-stroke bg-white/95 p-2.5 text-xs shadow-md backdrop-blur dark:border-strokedark dark:bg-boxdark/95">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[.08em] text-body dark:text-bodydark2">{t('opener.track.legend')}</p>
          {RESULT_ORDER.map((k) => (
            <p key={k} className="flex items-center gap-2 py-0.5 text-black dark:text-bodydark1">
              {dot(RESULT_COLOR[k], 'h-3 w-3')}<span className="flex-1">{t(`opener.track.result.${k}`)}</span><b className="tabular-nums">{legendCounts[k]}</b>
            </p>
          ))}
          <p className="mt-1 flex items-center gap-2 border-t border-stroke pt-1 text-black dark:border-strokedark dark:text-bodydark1"><AlertTriangle className="h-3 w-3 text-danger" />{t('opener.track.gpsWarn')}</p>
          <p className="flex items-center gap-2 text-black dark:text-bodydark1">{dot('#3C50E0', 'h-3 w-3')}{t('opener.track.lastPosition')}</p>
        </div>

        {/* Fiche : le résultat de la visite */}
        {picked && (
          <StopCard s={picked.s} r={picked.r} onClose={() => setStopSel(null)} fmtTime={fmtTime} loc={loc} lng={lng} />
        )}
      </div>
    </div>
  );
}

function StopCard({ s, r, onClose, fmtTime, loc, lng }: { s: OverviewStop; r: OverviewRoute; onClose: () => void; fmtTime: (s: string) => string; loc: string; lng: 'fr' | 'en' }) {
  const { t } = useTranslation();
  const k = resultOf(s);
  const st = (s.place?.status || 'new') as PlaceStatus;
  const res = s.result;
  const row = (label: string, value: React.ReactNode) => value == null || value === '' ? null : (
    <div className="flex gap-2 py-0.5"><span className="w-[92px] shrink-0 text-body dark:text-bodydark">{label}</span><span className="min-w-0 flex-1 font-medium text-black dark:text-white">{value}</span></div>
  );
  // Le système : celui noté à la visite ; sinon Cluster pour un client, ou le POS d'une visite passée.
  const system = res?.currentPos || (st === 'client' ? `Cluster${s.place?.version ? ` ${s.place.version.toUpperCase()}` : ''}` : s.place?.competitorPos) || null;
  return (
    <div className="absolute bottom-3 right-3 z-10 max-h-[calc(100%-24px)] w-[min(360px,calc(100%-24px))] overflow-y-auto rounded-lg border border-stroke bg-white p-3.5 text-xs shadow-xl dark:border-strokedark dark:bg-boxdark">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-black dark:text-white">{s.name}</p>
          {s.address && <p className="truncate text-body dark:text-bodydark">{s.address}</p>}
        </div>
        <button onClick={onClose} className="rounded p-1 text-body hover:text-black dark:hover:text-white" aria-label={t('opener.designer.close') as string}><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-bold text-[#1C2434]" style={{ background: RESULT_COLOR[k] }}>
          {k === 'lead' && <Star className="h-3 w-3" />}{t(`opener.track.result.${k}`)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-2 px-2 py-0.5 font-semibold text-black dark:bg-meta-4 dark:text-white">
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[st] }} />{t(`opener.status.${st}`)}{s.place?.version ? ` ${s.place.version.toUpperCase()}` : ''}{s.place?.seasonal ? ` · ${t('opener.seasonal')}` : ''}
        </span>
        {s.place?.franchise && <span className="rounded-full bg-[#8B5CF6]/15 px-2 py-0.5 font-semibold text-[#7C3AED] dark:text-[#C4B5FD]">{t('opener.franchise.badge')}</span>}
      </div>

      {s.outcome === 'skipped' && row(t('opener.track.card.why'), t(`opener.skip.${s.skipReason || 'other'}`))}
      {s.outcome === 'planned' && <p className="mb-1 text-body dark:text-bodydark">{t('opener.track.card.notYet', { name: r.openerName || '—' })}</p>}

      {s.checkin && row(t('opener.track.card.when'), (
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />
          {s.checkin.startedAt ? `${fmtTime(s.checkin.startedAt)} → ` : ''}{fmtTime(s.checkin.at)}{s.checkin.durationMin != null ? ` · ${fmtMinutes(s.checkin.durationMin)}` : ''}
        </span>
      ))}
      {s.checkin && row(t('opener.track.card.gps'), (
        <span className="inline-flex items-center gap-1" style={{ color: VERDICT_COLOR[s.checkin.verdict] }}>
          {gpsWarn(s) && <AlertTriangle className="h-3 w-3" />}{t(`opener.track.verdict.${s.checkin.verdict}`)}{s.checkin.distanceM != null ? ` · ${fmtDistance(s.checkin.distanceM, lng)}` : ''}
        </span>
      ))}
      {row(t('opener.track.system'), system || t('opener.track.unknown'))}
      {res && row(t('opener.track.card.service'), res.serviceType ? `${t(`opener.serviceShort.${res.serviceType}`)}${res.terminals != null ? ` · ${t('opener.track.card.terminals', { n: res.terminals })}` : ''}${res.onlineDelivery ? ` · ${t('opener.track.card.delivery')}` : ''}` : null)}
      {res && st === 'client' && row(t('opener.field.client.lastSatisfaction'), res.satisfaction ? (
        <span className={res.satisfaction <= 2 ? 'text-danger' : ''}>{res.satisfaction}/5</span>
      ) : null)}
      {res && st === 'client' && row(t('opener.field.client.payments'), res.paymentsBy ? t(`opener.field.client.paymentsBy.${res.paymentsBy}`) : null)}
      {res && row(t('opener.track.card.interest'), res.interest ? `${res.interest}/5 · ${t(`opener.field.level.${res.interest}`)}` : st === 'client' && res.paymentsBy === 'cluster' ? t('opener.field.client.alreadyPays') : null)}
      {res && row(t('opener.track.card.decision'), res.decisionMaker ? t(`opener.field.${res.decisionMaker === 'later' ? 'later' : res.decisionMaker}`) : null)}
      {res && res.services.length > 0 && row(t('opener.track.card.services'), res.services.map((x) => t(`opener.serviceOf.${x}`)).join(', '))}
      {res?.lead && row(t('opener.field.lead'), (
        <a href={`/leads?ref=${encodeURIComponent(res.lead.refCode)}`} className="text-primary hover:underline">{res.lead.refCode} · {t(`leads.status.${res.lead.status}`, { defaultValue: res.lead.status })}</a>
      ))}
      {res?.notes && (
        <p className="mt-2 whitespace-pre-line rounded bg-gray-2 p-2 italic text-black dark:bg-meta-4 dark:text-white">« {res.notes} »</p>
      )}
      {!res && s.place?.visits ? <p className="mt-2 text-body dark:text-bodydark">{t('opener.track.card.pastVisits', { n: s.place.visits })}</p> : null}
      <p className="mt-2 text-[10px] text-body dark:text-bodydark">{new Date(`${r.date}T12:00:00Z`).toLocaleDateString(loc, { timeZone: 'UTC', day: 'numeric', month: 'long' })} · {r.openerName || '—'} · {r.name}</p>
    </div>
  );
}
