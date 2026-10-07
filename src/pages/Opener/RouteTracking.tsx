import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MapPin, RefreshCw, ExternalLink } from 'lucide-react';
import { ContentLoader } from '../../common/Loader';
import { api, fmtDistance, fmtMinutes, VERDICT_COLOR, type OverviewRoute, type Verdict } from './api';
import { GoogleMapView, getOpenerConfig, pinIcon, useIsDark } from './GoogleMap';
import { convexHull, type LatLng } from './geo';

// Vue « Suivi » des routes (manager, opener:routes) : la carte découpée en un secteur par route,
// coloré selon l'avancement, et pour chaque visite, où était le téléphone au check-in.
//
// Vérification des visites : chaque arrêt visité prend la couleur de son VERDICT (sur place,
// à distance, position imprécise, sans position). Quand le check-in a été fait loin du
// restaurant, un trait relie le restaurant à la position du téléphone.
// Aucun suivi GPS continu : seule la position AU CHECK-IN est connue.

type Period = 'today' | 'past7' | 'next7';
const MONTREAL: LatLng = [45.5236, -73.5865];
const VERDICTS: Verdict[] = ['onsite', 'far', 'imprecise', 'nogps'];
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const progressColor = (r: OverviewRoute) =>
  r.status === 'closed' || (r.total > 0 && r.done + r.skipped >= r.total) ? '#57D193' : r.done > 0 ? '#F58346' : '#94A3B8';

export default function RouteTracking({ onOpen }: { onOpen: (routeId: number) => void }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language?.startsWith('fr') ? 'fr' : 'en';
  const dark = useIsDark();
  const [period, setPeriod] = useState<Period>('today');
  const autoNext = useRef(false);
  const [routes, setRoutes] = useState<OverviewRoute[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mapRef = useRef<{ g: any; map: any } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const layers = useRef<any[]>([]);
  const fmtTime = (s: string) => new Date(s).toLocaleTimeString(lng === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' });
  const fmtDay = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString(lng === 'fr' ? 'fr-CA' : 'en-CA', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const cfg = await getOpenerConfig();
      const from = period === 'past7' ? addDays(cfg.today, -6) : cfg.today;
      const to = period === 'next7' ? addDays(cfg.today, 6) : cfg.today;
      const r = await api<{ routes: OverviewRoute[] }>(`/api/opener/routes-overview?from=${from}&to=${to}`);
      setRoutes(r.routes);
      // Rien aujourd'hui (routes publiées pour les jours suivants) : on montre les 7 prochains jours
      // au lieu d'un écran vide — une seule fois, l'utilisateur garde ensuite la main.
      if (period === 'today' && !r.routes.length && !autoNext.current) { autoNext.current = true; setPeriod('next7'); }
    } catch { setRoutes([]); } finally { setRefreshing(false); }
  }, [period]);

  useEffect(() => { setRoutes(null); setSelected(null); load(); }, [load]);
  // La journée en cours se rafraîchit toute seule chaque minute.
  useEffect(() => {
    if (period === 'next7') return;
    const iv = window.setInterval(load, 60000);
    return () => window.clearInterval(iv);
  }, [period, load]);

  const shown = useMemo(() => (routes || []).filter((r) => selected == null || r.id === selected), [routes, selected]);

  // Calques de la carte.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !routes) return;
    const { g, map } = m;
    layers.current.forEach((l) => l.setMap(null));
    layers.current = [];
    const bounds = new g.maps.LatLngBounds();
    let any = false;
    for (const r of shown) {
      const pts = r.stops.filter((s) => s.lat != null).map((s) => [s.lat!, s.lng!] as LatLng);
      const color = progressColor(r);
      const zone = r.zone && r.zone.length >= 3 ? r.zone : pts.length >= 3 ? convexHull(pts) : null;
      if (zone) {
        const poly = new g.maps.Polygon({ paths: zone.map(([a, b]) => ({ lat: a, lng: b })), strokeColor: color, strokeOpacity: 0.9, strokeWeight: 2,
          fillColor: color, fillOpacity: selected === r.id ? 0.16 : 0.1, map, zIndex: 1 });
        poly.addListener('click', () => setSelected((s) => (s === r.id ? null : r.id)));
        layers.current.push(poly);
        // Étiquette au centre du secteur : nom et avancement.
        const c = zone.reduce((a, p) => [a[0] + p[0] / zone.length, a[1] + p[1] / zone.length], [0, 0]);
        layers.current.push(new g.maps.Marker({ position: { lat: c[0], lng: c[1] }, map, clickable: false, zIndex: 5,
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 0 },
          label: { text: `${r.name} · ${r.done}/${r.total}`, color: dark ? '#DEE4EE' : '#1C2434', fontSize: '12px', fontWeight: '700' } }));
      }
      r.stops.forEach((s, i) => {
        if (s.lat == null) return;
        any = true; bounds.extend({ lat: s.lat, lng: s.lng });
        const v = s.checkin?.verdict;
        const col = s.outcome === 'done' ? VERDICT_COLOR[v || 'nogps'] : s.outcome === 'skipped' ? '#94A3B8' : (dark ? '#3d4d60' : '#CBD5E1');
        const mk = new g.maps.Marker({ position: { lat: s.lat, lng: s.lng }, map, zIndex: 10 + i,
          icon: pinIcon(g, col, s.outcome === 'done' ? null : i + 1, { size: 22, done: s.outcome === 'done', surface: dark ? '#24303F' : '#FFFFFF' }),
          title: `${i + 1}. ${s.name} — ${s.outcome === 'done' ? `${t(`opener.track.verdict.${v || 'nogps'}`)}${s.checkin?.distanceM != null ? ` (${fmtDistance(s.checkin.distanceM, lng)})` : ''}${s.checkin?.durationMin != null ? ` · ${fmtMinutes(s.checkin.durationMin)}` : ''}` : t(`opener.track.outcome.${s.outcome}`)}` });
        layers.current.push(mk);
        // Visite faite loin du restaurant : trait restaurant → position du téléphone.
        if (s.checkin?.lat != null && (v === 'far' || v === 'imprecise')) {
          layers.current.push(new g.maps.Polyline({ path: [{ lat: s.lat, lng: s.lng }, { lat: s.checkin.lat, lng: s.checkin.lng }], map,
            strokeColor: VERDICT_COLOR[v], strokeOpacity: 0.9, strokeWeight: 2, zIndex: 8, clickable: false }));
          layers.current.push(new g.maps.Marker({ position: { lat: s.checkin.lat, lng: s.checkin.lng }, map, zIndex: 9, clickable: false,
            icon: { path: g.maps.SymbolPath.CIRCLE, scale: 4, fillColor: VERDICT_COLOR[v], fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5 } }));
          bounds.extend({ lat: s.checkin.lat, lng: s.checkin.lng });
        }
      });
      // Dernière position connue de l'opener (son dernier check-in).
      if (r.lastCheckin?.lat != null) {
        layers.current.push(new g.maps.Marker({ position: { lat: r.lastCheckin.lat, lng: r.lastCheckin.lng }, map, zIndex: 2000,
          title: `${r.openerName || ''} · ${fmtTime(r.lastCheckin.at)} · ${r.lastCheckin.stopName}`,
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#3C50E0', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } }));
      }
    }
    if (any) map.fitBounds(bounds, 60);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, mapReady, dark, routes]);

  const card = 'rounded-sm border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';
  const sel = routes?.find((r) => r.id === selected) || null;

  return (
    <div className="grid grid-cols-1 gap-4 2xl:h-[calc(100vh-260px)] 2xl:min-h-[600px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className={`${card} relative min-h-[480px] overflow-hidden`}>
        <GoogleMapView lang={lng} dark={dark} className="absolute inset-0" center={MONTREAL} zoom={13}
          onReady={(g, map) => { mapRef.current = { g, map }; setMapReady(true); }}
          fallback={(err) => <div className="flex h-full items-center justify-center p-6 text-center text-sm text-body dark:text-bodydark">{err === 'no_maps_key' ? t('opener.noMapsKey') : t('opener.mapsFailed')}</div>} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {VERDICTS.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full border border-stroke bg-white px-2 py-1 text-[11px] font-semibold text-black shadow dark:border-strokedark dark:bg-boxdark dark:text-bodydark1">
              <span className="h-2 w-2 rounded-full" style={{ background: VERDICT_COLOR[v] }} />{t(`opener.track.verdict.${v}`)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 rounded-full border border-stroke bg-white px-2 py-1 text-[11px] font-semibold text-black shadow dark:border-strokedark dark:bg-boxdark dark:text-bodydark1">
            <span className="h-2 w-2 rounded-full bg-[#3C50E0]" />{t('opener.track.lastPosition')}
          </span>
        </div>
      </div>

      <div className={`${card} flex min-h-0 flex-col p-4`}>
        <div className="mb-3 flex items-center gap-2">
          <div className="grid flex-1 grid-cols-3 gap-1 rounded-xl border border-stroke p-1 dark:border-strokedark">
            {(['past7', 'today', 'next7'] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`h-8 rounded-[9px] text-xs font-semibold ${period === p ? 'bg-primary text-white' : 'text-body dark:text-bodydark'}`}>
                {t(`opener.track.period.${p}`)}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={refreshing} aria-label={t('opener.track.refresh') as string} className="rounded-lg border border-stroke p-2 text-body hover:text-primary dark:border-strokedark">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
        <p className="mb-3 text-xs text-body dark:text-bodydark">{t('opener.track.help')}</p>

        {!routes && <ContentLoader />}
        {routes && !routes.length && (
          <p className="rounded border border-dashed border-stroke p-4 text-center text-xs text-body dark:border-strokedark dark:text-bodydark">
            <MapPin className="mx-auto mb-1 h-4 w-4" />{t('opener.track.empty')}
          </p>
        )}

        <div className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
          {(sel ? [sel] : routes || []).map((r) => (
            <div key={r.id} onClick={() => setSelected((s) => (s === r.id ? null : r.id))}
              className={`cursor-pointer rounded-lg border p-3 ${selected === r.id ? 'border-primary' : 'border-stroke dark:border-strokedark'}`}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-black dark:text-white">{r.name}</p>
                  <p className="truncate text-xs text-body dark:text-bodydark">{fmtDay(r.date)} · {r.openerName || '—'} · {t(`opener.routeStatus.${r.status}`)}</p>
                </div>
                <span className="shrink-0 text-sm font-bold" style={{ color: progressColor(r) }}>{r.done}/{r.total}</span>
              </div>
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-stroke dark:bg-meta-4">
                <div className="h-full rounded-full" style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%`, background: progressColor(r) }} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                {VERDICTS.filter((v) => r.verdicts?.[v]).map((v) => (
                  <span key={v} className="inline-flex items-center gap-1 font-semibold text-black dark:text-bodydark1">
                    <span className="h-2 w-2 rounded-full" style={{ background: VERDICT_COLOR[v] }} />{r.verdicts[v]} {t(`opener.track.verdict.${v}`).toLowerCase()}
                  </span>
                ))}
                {r.visitMinutes > 0 && (
                  <span className="text-body dark:text-bodydark">{t('opener.track.visitTime', { time: fmtMinutes(r.visitMinutes) })}</span>
                )}
                {r.lastCheckin && (
                  <span className="text-body dark:text-bodydark">{t('opener.track.lastCheckin', { time: fmtTime(r.lastCheckin.at), name: r.lastCheckin.stopName })}</span>
                )}
              </div>

              {selected === r.id && (
                <div className="mt-3 space-y-1 border-t border-stroke pt-2 dark:border-strokedark">
                  {r.stops.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs">
                      <span className="w-5 shrink-0 text-right text-body">{i + 1}.</span>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.outcome === 'done' ? VERDICT_COLOR[s.checkin?.verdict || 'nogps'] : '#94A3B8' }} />
                      <span className="min-w-0 flex-1 truncate text-black dark:text-white">{s.name}</span>
                      <span className="shrink-0 text-body dark:text-bodydark">
                        {s.outcome === 'done' && s.checkin
                          ? `${s.checkin.startedAt ? `${fmtTime(s.checkin.startedAt)} → ` : ''}${fmtTime(s.checkin.at)}${s.checkin.durationMin != null ? ` · ${fmtMinutes(s.checkin.durationMin)}` : ''} · ${s.checkin.distanceM != null ? fmtDistance(s.checkin.distanceM, lng) : t('opener.track.verdict.nogps')}`
                          : s.outcome === 'skipped' ? t(`opener.skip.${s.skipReason || 'other'}`) : t(`opener.track.outcome.${s.outcome}`)}
                      </span>
                    </div>
                  ))}
                  <button onClick={(e) => { e.stopPropagation(); onOpen(r.id); }} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" />{t('opener.track.openRoute')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
