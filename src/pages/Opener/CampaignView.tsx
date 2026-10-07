import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, Map as MapIcon, CalendarPlus, X, Ban, ExternalLink, Footprints, Car, Minus, Plus, Undo2 } from 'lucide-react';
import DateField from '../../components/DateField';
import Select from '../../components/Select';
import { ContentLoader } from '../../common/Loader';
import { dialog } from '../../lib/dialog';
import {
  api, ApiError, fmtMinutes, fmtDistance, STATUS_COLOR, CAMPAIGN_COLOR,
  type Campaign, type CampaignRouteDetail, type PlaceStatus,
} from './api';
import { GoogleMapView, getOpenerConfig, useIsDark } from './GoogleMap';

// Onglet « Campagne » (manager, opener:routes) — ouvert par défaut.
//
// Le territoire (Montréal, Laval, Rive-Nord, Rive-Sud) est DÉJÀ découpé en routes d'une journée :
// elles apparaissent sur la carte sans rien demander, colorées selon qu'elles sont à faire,
// planifiées ou faites. La cartographie (inventaire Google) avance seule la nuit ; sa progression
// est affichée par région. « Planifier la semaine » donne 5 routes voisines à chaque opener coché.

const MONTREAL: [number, number] = [45.55, -73.65];
const nextMonday = (today: string) => {
  const d = new Date(`${today}T12:00:00Z`);
  const add = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
};
// Une couleur par opener dans la proposition de la semaine (distinctes des couleurs de statut).
const OPENER_COLORS = ['#F58346', '#8B5CF6', '#0EA5E9', '#EC4899', '#14B8A6', '#EAB308', '#EF4444', '#6366F1'];
interface Proposal {
  openerEmail: string; openerName: string;
  days: { date: string; campaignRouteId: number; seq: number; region: string; name: string; stops: number; minutes: number; mode: 'walk' | 'car' }[];
}
const addWeeks = (ymd: string, w: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + w * 7); return d.toISOString().slice(0, 10); };

export default function CampaignView({ onOpenRoute }: { onOpenRoute: (routeId: number) => void }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language?.startsWith('fr') ? 'fr' : 'en';
  const nf = (n: number) => n.toLocaleString(lng === 'fr' ? 'fr-CA' : 'en-CA');
  const dark = useIsDark();
  const [data, setData] = useState<Campaign | null>(null);
  const [today, setToday] = useState('');
  const [openers, setOpeners] = useState<{ email: string; name: string }[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<CampaignRouteDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [nOpeners, setNOpeners] = useState(2);
  const [targetWeeks, setTargetWeeks] = useState(6);
  const [weekStart, setWeekStart] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [assignTo, setAssignTo] = useState('');
  const [assignDate, setAssignDate] = useState('');
  const [planResult, setPlanResult] = useState<{ openerName: string; days: { date: string; name: string }[]; emailSent: boolean }[] | null>(null);
  // Proposition de la semaine (aperçu, rien de publié) : recalculée dès qu'on coche un opener ou
  // change la semaine. Le manager la regarde sur la carte, retire une route au besoin, puis publie.
  const [proposal, setProposal] = useState<Proposal[] | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [excludedList, setExcludedList] = useState<{ placeId: string; name: string | null; address: string | null; at: string; by: string | null; reason: string | null }[] | null>(null);
  const proposed = useMemo(() => {
    const m = new Map<number, { color: string; opener: string; date: string; day: number }>();
    (proposal || []).forEach((o, k) => o.days.forEach((d, i) => m.set(d.campaignRouteId, { color: OPENER_COLORS[k % OPENER_COLORS.length], opener: o.openerName, date: d.date, day: i })));
    return m;
  }, [proposal]);
  const mapRef = useRef<{ g: any; map: any } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const layers = useRef<any[]>([]);
  const labels = useRef<any[]>([]);
  const fmtDay = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString(lng === 'fr' ? 'fr-CA' : 'en-CA', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const fmtDayShort = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString(lng === 'fr' ? 'fr-CA' : 'en-CA', { timeZone: 'UTC', weekday: 'short' });

  const load = useCallback(async () => {
    const c = await api<Campaign>('/api/opener/campaign');
    setData(c);
    return c;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getOpenerConfig();
        setToday(cfg.today);
        setWeekStart(nextMonday(cfg.today));
        setAssignDate(cfg.today);
        const [, o] = await Promise.all([load(), api<{ openers: { email: string; name: string }[] }>('/api/opener/openers')]);
        setOpeners(o.openers);
        setPicked(o.openers.map((x) => x.email));
        setNOpeners(Math.max(1, o.openers.length));
      } catch (e: any) { dialog.alert(e.message); }
    })();
  }, [load]);

  // Pendant la cartographie : relecture toutes les 10 s.
  useEffect(() => {
    if (!data?.inventory.running) return;
    const iv = window.setInterval(() => { load().catch(() => {}); }, 10000);
    return () => window.clearInterval(iv);
  }, [data?.inventory.running, load]);

  useEffect(() => {
    if (selected == null) { setDetail(null); return; }
    setDetail(null);
    api<CampaignRouteDetail>(`/api/opener/campaign/routes/${selected}`).then(setDetail).catch(() => {});
  }, [selected]);

  // ------------------------------------------------------------------ chiffres
  const stats = useMemo(() => {
    const routes = data?.routes || [];
    const todo = routes.filter((r) => r.status === 'todo').length;
    const planned = routes.filter((r) => r.status === 'planned').length;
    const done = routes.filter((r) => r.status === 'done').length;
    const regions = data?.regions || [];
    const cellsTotal = regions.reduce((s, r) => s + r.cells.total, 0);
    const cellsDone = regions.reduce((s, r) => s + r.cells.done, 0);
    const places = regions.reduce((s, r) => s + r.places.total, 0);
    const clients = regions.reduce((s, r) => s + r.places.clients, 0);
    const visited = regions.reduce((s, r) => s + r.places.visited, 0);
    return { todo, planned, done, total: routes.length, cellsTotal, cellsDone, places, clients, visited,
      mapPct: cellsTotal ? Math.round((cellsDone / cellsTotal) * 100) : 0 };
  }, [data]);
  const weeksNeeded = Math.ceil((stats.todo + stats.planned) / Math.max(1, nOpeners * 5));
  const openersNeeded = Math.ceil((stats.todo + stats.planned) / Math.max(1, targetWeeks * 5));
  const finishDate = today ? addWeeks(nextMonday(today), weeksNeeded) : '';

  // ------------------------------------------------------------------ carte
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !data) return;
    const { g, map } = m;
    layers.current.forEach((l) => l.setMap(null));
    labels.current.forEach((l) => l.setMap(null));
    layers.current = []; labels.current = [];
    // Contours des régions (pointillés)
    for (const reg of data.regions) {
      layers.current.push(new g.maps.Polyline({ path: [...reg.polygon, reg.polygon[0]].map(([a, b]) => ({ lat: a, lng: b })), map, clickable: false,
        strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.5, strokeColor: dark ? '#8A99AF' : '#64748B', scale: 2 }, offset: '0', repeat: '8px' }] }));
    }
    for (const r of data.routes) {
      if (!r.hull || r.hull.length < 3) continue;
      const prop = proposed.get(r.id);
      const col = prop ? prop.color : CAMPAIGN_COLOR[r.status];
      const on = selected === r.id;
      const poly = new g.maps.Polygon({ paths: r.hull.map(([a, b]) => ({ lat: a, lng: b })), map, zIndex: on ? 12 : prop ? 8 : 2,
        strokeColor: on ? '#1C2434' : col, strokeOpacity: 0.95, strokeWeight: on ? 3 : prop ? 2.5 : 1.2,
        fillColor: col, fillOpacity: on ? 0.5 : prop ? 0.45 : 0.3 });
      poly.addListener('click', () => setSelected((s) => (s === r.id ? null : r.id)));
      layers.current.push(poly);
      // De loin, une route (~1 km²) n'est qu'un trait : un POINT de sa couleur la montre, et se
      // clique. Remplacé par le contour et le numéro au zoom 13 (signalé par David, 2026-10-08).
      const dot = new g.maps.Marker({ position: { lat: r.centroid[0], lng: r.centroid[1] }, map, zIndex: prop ? 35 : 15, title: `R${r.seq}`,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: prop || on ? 7 : 5, fillColor: col, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 1.5 } });
      dot.addListener('click', () => setSelected((s) => (s === r.id ? null : r.id)));
      (dot as any).__dot = true;
      labels.current.push(dot);
      // Route proposée : « Hao · lun. » toujours visible ; les autres : « R12 » de près seulement.
      const lbl = new g.maps.Marker({ position: { lat: r.centroid[0], lng: r.centroid[1] }, map, clickable: false, zIndex: prop ? 40 : 20,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 0 },
        label: { text: prop ? `${prop.opener.split(' ')[0]} · ${fmtDayShort(prop.date)}` : `R${r.seq}`, color: dark ? '#FFFFFF' : '#1C2434', fontSize: prop ? '12px' : '11px', fontWeight: '700' } });
      (lbl as any).__always = !!prop;
      labels.current.push(lbl);
    }
    // Étiquettes seulement de près : de loin, des centaines de numéros seraient illisibles.
    const toggle = () => {
      const z = map.getZoom();
      labels.current.forEach((l) => l.setVisible((l as any).__dot ? z < 13 : (l as any).__always || z >= 13));
    };
    toggle();
    const lst = map.addListener('zoom_changed', toggle);
    // Arrêts de la route sélectionnée
    if (detail) {
      for (const s of detail.stops) {
        if (s.lat == null) continue;
        layers.current.push(new g.maps.Marker({ position: { lat: s.lat, lng: s.lng }, map, zIndex: 30, title: s.name || '',
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 5, fillColor: STATUS_COLOR[(s.status as PlaceStatus) || 'new'], fillOpacity: 1, strokeColor: '#1C2434', strokeWeight: 1 } }));
      }
      const path = detail.stops.filter((s) => s.lat != null).map((s) => ({ lat: s.lat!, lng: s.lng! }));
      if (path.length > 1) {
        layers.current.push(new g.maps.Polyline({ path, map, zIndex: 25, clickable: false, strokeOpacity: 0,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: '#F58346', scale: 3 }, offset: '0', repeat: '10px' }] }));
      }
    }
    return () => lst.remove();
  }, [data, mapReady, selected, detail, dark, proposed]);

  // La proposition arrive : la carte se cadre sur ses routes.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !data || !proposed.size) return;
    const b = new m.g.maps.LatLngBounds();
    data.routes.filter((r) => proposed.has(r.id)).forEach((r) => (r.hull || []).forEach(([a, c]) => b.extend({ lat: a, lng: c })));
    if (!b.isEmpty()) m.map.fitBounds(b, 60);
  }, [proposed, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const fitAll = useCallback(() => {
    const m = mapRef.current;
    if (!m || !data) return;
    // Cadré sur les ROUTES (pas sur les régions entières, bien plus grandes que la partie déjà
    // cartographiée) ; les régions seulement s'il n'y a encore aucune route.
    const b = new m.g.maps.LatLngBounds();
    data.routes.forEach((r) => (r.hull || []).forEach(([a, c]) => b.extend({ lat: a, lng: c })));
    if (b.isEmpty()) data.regions.forEach((r) => r.polygon.forEach(([a, c]) => b.extend({ lat: a, lng: c })));
    m.map.fitBounds(b, 30);
  }, [data]);
  const framed = useRef(false);
  useEffect(() => { if (mapReady && data && !framed.current) { framed.current = true; fitAll(); } }, [mapReady, data, fitAll]);

  // ------------------------------------------------------------------ actions
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { const err = e as ApiError; dialog.alert(err.body?.error ? t(`opener.campaign.err.${err.body.error}`, { defaultValue: err.message }) : err.message); }
    finally { setBusy(null); }
  };
  const continueMapping = () => run('inventory', async () => {
    await api('/api/opener/campaign/inventory', { method: 'POST' });
    await load();
  });
  const recompute = () => run('recompute', async () => {
    const r = await api<{ routes: number; places: number }>('/api/opener/campaign/recompute', { method: 'POST' });
    await load();
    dialog.alert(t('opener.campaign.recomputed', { routes: nf(r.routes), places: nf(r.places) }));
  });
  // Aperçu : recalculé (sans rien publier) quand la sélection ou la semaine change.
  const todoCount = data?.routes.filter((r) => r.status === 'todo').length ?? 0;
  useEffect(() => {
    if (!picked.length || !weekStart || !todoCount) { setProposal(null); return; }
    let stale = false;
    setProposalBusy(true);
    const tm = window.setTimeout(() => {
      api<{ openers: Proposal[] }>('/api/opener/campaign/plan-week', { method: 'POST', body: { openers: picked, weekStart, days: 5, preview: true } })
        .then((r) => { if (!stale) setProposal(r.openers); })
        .catch(() => { if (!stale) setProposal(null); })
        .finally(() => { if (!stale) setProposalBusy(false); });
    }, 300);
    return () => { stale = true; window.clearTimeout(tm); };
  }, [picked, weekStart, todoCount]);

  const dropFromProposal = (routeId: number) =>
    setProposal((p) => (p ? p.map((o) => ({ ...o, days: o.days.filter((d) => d.campaignRouteId !== routeId) })) : p));
  const nProposed = (proposal || []).reduce((s, o) => s + o.days.length, 0);

  const planWeek = () => run('plan', async () => {
    if (!proposal || !nProposed) { dialog.alert(t('opener.campaign.pickOpeners')); return; }
    if (!(await dialog.confirm(t('opener.campaign.planConfirm', { n: proposal.filter((o) => o.days.length).length, routes: nProposed, date: fmtDay(weekStart) }), { confirmText: t('opener.campaign.publish') }))) return;
    const assignments = proposal.map((o) => ({ openerEmail: o.openerEmail, ids: o.days.map((d) => d.campaignRouteId) }));
    const r = await api<{ openers: { openerName: string; days: { date: string; name: string }[]; emailSent: boolean }[] }>(
      '/api/opener/campaign/plan-week', { method: 'POST', body: { openers: assignments.filter((a) => a.ids.length).map((a) => a.openerEmail), weekStart, days: 5, assignments } });
    setPlanResult(r.openers);
    setProposal(null);
    setPicked([]);
    await load();
  });
  const assignOne = () => run('assign', async () => {
    if (!selected || !assignTo) return;
    await api('/api/opener/campaign/assign', { method: 'POST', body: { ids: [selected], openerEmail: assignTo, startDate: assignDate } });
    await load();
    setSelected(null); setTimeout(() => setSelected(selected), 0);
  });
  const unassign = () => run('unassign', async () => {
    if (!selected) return;
    await api(`/api/opener/campaign/routes/${selected}/unassign`, { method: 'POST' });
    await load();
    setSelected(null); setTimeout(() => setSelected(selected), 0);
  });
  const exclude = (placeId: string, name: string | null) => run(`ex:${placeId}`, async () => {
    if (!(await dialog.confirm(t('opener.campaign.excludeConfirm', { name: name || '—' }), { confirmText: t('opener.campaign.exclude'), danger: true }))) return;
    await api(`/api/opener/places/${encodeURIComponent(placeId)}/exclude`, { method: 'POST', body: { reason: 'not_restaurant' } });
    setDetail((d) => (d ? { ...d, stops: d.stops.filter((s) => s.placeId !== placeId) } : d));
    load().catch(() => {});
  });

  const showExcluded = () => { setSelected(null); setExcludedList([]); api<{ excluded: NonNullable<typeof excludedList> }>('/api/opener/excluded').then((r) => setExcludedList(r.excluded)).catch((e) => { setExcludedList(null); dialog.alert(e.message); }); };
  const restore = (placeId: string) => run(`re:${placeId}`, async () => {
    await api(`/api/opener/places/${encodeURIComponent(placeId)}/exclude`, { method: 'DELETE' });
    setExcludedList((l) => (l ? l.filter((x) => x.placeId !== placeId) : l));
    await load();
  });

  if (!data) return <ContentLoader />;

  const card = 'rounded-sm border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';
  const sel = data.routes.find((r) => r.id === selected) || null;
  const bar = (parts: { v: number; c: string }[], total: number) => (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-stroke dark:bg-meta-4">
      {parts.map((p, i) => <div key={i} style={{ width: `${total ? (p.v / total) * 100 : 0}%`, background: p.c }} className="h-full transition-all" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Avancement : la cartographie et la couverture */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className={`${card} p-4`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-semibold text-black dark:text-white">{t('opener.campaign.mappingTitle')}</p>
            <span className="text-sm font-bold text-primary">{stats.mapPct} %</span>
          </div>
          {bar([{ v: stats.cellsDone, c: '#F58346' }], stats.cellsTotal)}
          <div className="mt-3 space-y-2">
            {data.regions.map((r) => {
              const pct = r.cells.total ? Math.round((r.cells.done / r.cells.total) * 100) : 0;
              return (
                <div key={r.key} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 text-xs">
                  <span className="truncate font-medium text-black dark:text-white">{lng === 'fr' ? r.fr : r.en}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-stroke dark:bg-meta-4"><div className="h-full rounded-full bg-primary/80" style={{ width: `${pct}%` }} /></div>
                  <span className="w-[150px] text-right text-body dark:text-bodydark">{pct} % · {t('opener.campaign.found', { n: nf(r.places.total) })}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-body dark:text-bodydark">
            {data.inventory.running
              ? t('opener.campaign.mappingRunning', { done: data.inventory.progress?.done ?? 0, total: data.inventory.progress?.total ?? 0 })
              : stats.mapPct >= 100 ? t('opener.campaign.mappingDone') : t('opener.campaign.mappingNightly')}
            {data.excluded ? <> · <button onClick={showExcluded} className="font-semibold text-primary hover:underline">{t('opener.campaign.excludedCount', { n: data.excluded })}</button></> : null}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {stats.mapPct < 100 && (
              <button onClick={continueMapping} disabled={!!busy || data.inventory.running}
                className="inline-flex items-center gap-1.5 rounded border border-stroke px-3 py-2 text-xs font-semibold text-black hover:border-primary disabled:opacity-50 dark:border-strokedark dark:text-white">
                {data.inventory.running || busy === 'inventory' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapIcon className="h-3.5 w-3.5" />}
                {t('opener.campaign.continueMapping')}
              </button>
            )}
            <button onClick={recompute} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded border border-stroke px-3 py-2 text-xs font-semibold text-black hover:border-primary disabled:opacity-50 dark:border-strokedark dark:text-white">
              {busy === 'recompute' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {t('opener.campaign.recompute')}
            </button>
          </div>
        </div>

        <div className={`${card} p-4`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-semibold text-black dark:text-white">{t('opener.campaign.coverageTitle')}</p>
            <span className="text-sm font-bold text-success">{stats.total ? Math.round((stats.done / stats.total) * 100) : 0} %</span>
          </div>
          {bar([{ v: stats.done, c: CAMPAIGN_COLOR.done }, { v: stats.planned, c: CAMPAIGN_COLOR.planned }], stats.total)}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {(['done', 'planned', 'todo'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-black dark:text-bodydark1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CAMPAIGN_COLOR[s] }} />
                {t(`opener.campaign.status.${s}`)} : <b>{nf(stats[s])}</b>
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-body dark:text-bodydark">
            {t('opener.campaign.placesLine', { places: nf(stats.places), clients: nf(stats.clients), visited: nf(stats.visited) })}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded border border-stroke p-3 dark:border-strokedark">
              <p className="mb-1 text-xs text-body dark:text-bodydark">{t('opener.campaign.withOpeners')}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setNOpeners((v) => Math.max(1, v - 1))} className="rounded border border-stroke p-1 dark:border-strokedark" aria-label="−"><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-6 text-center text-lg font-bold text-black dark:text-white">{nOpeners}</span>
                <button onClick={() => setNOpeners((v) => Math.min(30, v + 1))} className="rounded border border-stroke p-1 dark:border-strokedark" aria-label="+"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                {weeksNeeded ? t('opener.campaign.eta', { weeks: weeksNeeded, date: finishDate ? fmtDay(finishDate) : '—' }) : t('opener.campaign.nothingLeft')}
              </p>
            </div>
            <div className="rounded border border-stroke p-3 dark:border-strokedark">
              <p className="mb-1 text-xs text-body dark:text-bodydark">{t('opener.campaign.toFinishIn')}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setTargetWeeks((v) => Math.max(1, v - 1))} className="rounded border border-stroke p-1 dark:border-strokedark" aria-label="−"><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-6 text-center text-lg font-bold text-black dark:text-white">{targetWeeks}</span>
                <button onClick={() => setTargetWeeks((v) => Math.min(52, v + 1))} className="rounded border border-stroke p-1 dark:border-strokedark" aria-label="+"><Plus className="h-3.5 w-3.5" /></button>
                <span className="text-xs text-body dark:text-bodydark">{t('opener.campaign.weeks')}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-black dark:text-white">{t('opener.campaign.openersNeeded', { n: openersNeeded })}</p>
            </div>
          </div>
          {stats.mapPct < 100 && <p className="mt-2 text-[11px] text-body dark:text-bodydark">{t('opener.campaign.etaPartial')}</p>}
        </div>
      </div>

      {/* Carte + panneau */}
      <div className="grid grid-cols-1 gap-4 2xl:h-[calc(100vh-200px)] 2xl:min-h-[640px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className={`${card} relative min-h-[560px] overflow-hidden`}>
          <GoogleMapView lang={lng} dark={dark} className="absolute inset-0" center={MONTREAL} zoom={10}
            onReady={(g, map) => { mapRef.current = { g, map }; setMapReady(true); }}
            fallback={(err) => <div className="flex h-full items-center justify-center p-6 text-center text-sm text-body dark:text-bodydark">{err === 'no_maps_key' ? t('opener.noMapsKey') : t('opener.mapsFailed')}</div>} />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {(['todo', 'planned', 'done'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full border border-stroke bg-white px-2 py-1 text-[11px] font-semibold text-black shadow dark:border-strokedark dark:bg-boxdark dark:text-bodydark1">
                <span className="h-2 w-2 rounded-sm" style={{ background: CAMPAIGN_COLOR[s] }} />{t(`opener.campaign.status.${s}`)}
              </span>
            ))}
          </div>
          <button onClick={fitAll} className="absolute right-3 top-3 rounded-full border border-stroke bg-white px-3 py-1.5 text-xs font-semibold text-black shadow dark:border-strokedark dark:bg-boxdark dark:text-bodydark1">
            {t('opener.campaign.showAll')}
          </button>
          {!data.routes.length && (
            <div className="absolute inset-x-6 bottom-6 rounded-lg border border-stroke bg-white p-4 text-center text-sm text-black shadow dark:border-strokedark dark:bg-boxdark dark:text-white">
              {t('opener.campaign.noRoutesYet')}
            </div>
          )}
        </div>

        <div className={`${card} flex min-h-0 flex-col p-4`}>
          {excludedList && !sel ? (
            <>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-black dark:text-white">{t('opener.campaign.excludedTitle')}</p>
                  <p className="text-xs text-body dark:text-bodydark">{t('opener.campaign.excludedHelp')}</p>
                </div>
                <button onClick={() => setExcludedList(null)} className="rounded p-1 text-body hover:text-black dark:hover:text-white" aria-label={t('opener.designer.close') as string}><X className="h-4 w-4" /></button>
              </div>
              <div className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
                {!excludedList.length && <p className="py-6 text-center text-xs text-body dark:text-bodydark">{t('opener.campaign.excludedNone')}</p>}
                {excludedList.map((x) => (
                  <div key={x.placeId} className="flex items-center gap-2 rounded px-1.5 py-1.5 text-xs hover:bg-gray-2 dark:hover:bg-meta-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-black dark:text-white">{x.name || x.placeId}</p>
                      <p className="truncate text-[11px] text-body dark:text-bodydark">{[x.address, x.by, new Date(x.at).toLocaleDateString(lng === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}</p>
                    </div>
                    <button onClick={() => restore(x.placeId)} disabled={!!busy} className="inline-flex shrink-0 items-center gap-1 rounded border border-stroke px-2 py-1 text-[11px] font-semibold text-black hover:border-primary dark:border-strokedark dark:text-white">
                      {busy === `re:${x.placeId}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}{t('opener.campaign.restore')}
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : sel ? (
            <>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold text-black dark:text-white">R{sel.seq}</p>
                  <p className="text-xs text-body dark:text-bodydark">
                    {(data.regions.find((r) => r.key === sel.region) || { fr: sel.region, en: sel.region })[lng === 'fr' ? 'fr' : 'en']}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="rounded p-1 text-body hover:text-black dark:hover:text-white" aria-label={t('opener.designer.close') as string}><X className="h-4 w-4" /></button>
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-black dark:text-bodydark1">
                <span className="inline-flex items-center gap-1">{sel.mode === 'car' ? <Car className="h-3.5 w-3.5" /> : <Footprints className="h-3.5 w-3.5" />}{t(`opener.campaign.mode.${sel.mode}`)}</span>
                <span>{t('opener.campaign.nStops', { n: sel.n })}</span>
                {!!sel.clients && <span className="font-semibold text-success">{t('opener.campaign.nClients', { count: sel.clients })}</span>}
                <span>~{fmtMinutes(sel.minutes)}</span>
                <span>{fmtDistance(sel.meters, lng)}</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: CAMPAIGN_COLOR[sel.status] }} />{t(`opener.campaign.status.${sel.status}`)}</span>
              </div>
              {sel.status !== 'todo' && (
                <p className="mb-3 text-xs text-body dark:text-bodydark">
                  {t('opener.campaign.assignedTo', { name: sel.openerName || '—', date: sel.date ? fmtDay(sel.date) : '—', visited: sel.visited, n: sel.n })}
                </p>
              )}
              {sel.status === 'todo' && (
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <Select value={assignTo} onChange={setAssignTo} placeholder={t('opener.designer.pickOpenerPh') as string}
                    options={openers.map((o) => ({ value: o.email, label: o.name }))} />
                  <DateField value={assignDate} onChange={setAssignDate} />
                  <button onClick={assignOne} disabled={!assignTo || !!busy}
                    className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded bg-primary px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                    {busy === 'assign' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}{t('opener.campaign.assign')}
                  </button>
                </div>
              )}
              {sel.status === 'planned' && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {sel.routeId && <button onClick={() => onOpenRoute(sel.routeId!)} className="inline-flex items-center gap-1 rounded border border-stroke px-3 py-1.5 text-xs font-semibold text-black dark:border-strokedark dark:text-white"><ExternalLink className="h-3.5 w-3.5" />{t('opener.campaign.openRoute')}</button>}
                  <button onClick={unassign} disabled={!!busy} className="inline-flex items-center gap-1 rounded border border-stroke px-3 py-1.5 text-xs font-semibold text-black hover:border-danger hover:text-danger dark:border-strokedark dark:text-white"><Undo2 className="h-3.5 w-3.5" />{t('opener.campaign.unassign')}</button>
                </div>
              )}
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[.06em] text-body dark:text-bodydark2">{t('opener.campaign.stops')}</p>
              <div className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
                {!detail && <ContentLoader />}
                {detail?.stops.map((s, i) => (
                  <div key={s.placeId} className="group flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-gray-2 dark:hover:bg-meta-4">
                    <span className="w-5 shrink-0 text-right text-body">{i + 1}</span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[(s.status as PlaceStatus) || 'new'] }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-black dark:text-white">{s.name || '—'}</p>
                      <p className="truncate text-[11px] text-body dark:text-bodydark">{[s.address, t(`opener.status.${s.status || 'new'}`), s.kind ? t(`opener.kind.${s.kind}`, { defaultValue: s.kind }) : null].filter(Boolean).join(' · ')}</p>
                    </div>
                    {sel.status === 'todo' && (
                      <button onClick={() => exclude(s.placeId, s.name)} title={t('opener.campaign.exclude') as string}
                        className="shrink-0 rounded p-1 text-body opacity-60 hover:text-danger group-hover:opacity-100">
                        {busy === `ex:${s.placeId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="mb-1 font-semibold text-black dark:text-white">{t('opener.campaign.planWeek')}</p>
              <p className="mb-3 text-xs text-body dark:text-bodydark">{t('opener.campaign.planHelp')}</p>
              <label className="mb-1 block text-xs font-medium text-black dark:text-white">{t('opener.campaign.weekOf')}</label>
              <div className="mb-3"><DateField value={weekStart} onChange={setWeekStart} /></div>
              <p className="mb-1 text-xs font-medium text-black dark:text-white">{t('opener.campaign.openers')}</p>
              <div className="mb-3 space-y-1">
                {!openers.length && <p className="text-xs text-warning">{t('opener.designer.noOpeners')}</p>}
                {openers.map((o) => (
                  <label key={o.email} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-black hover:bg-gray-2 dark:text-white dark:hover:bg-meta-4">
                    <input type="checkbox" checked={picked.includes(o.email)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, o.email] : p.filter((x) => x !== o.email)))} className="h-4 w-4 accent-[#F58346]" />
                    {o.name}
                  </label>
                ))}
              </div>
              {picked.length > 0 && (
                <div className="mb-3 min-h-0 flex-1 overflow-y-auto rounded border border-stroke p-2 dark:border-strokedark">
                  <p className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-[.06em] text-body dark:text-bodydark2">
                    {t('opener.campaign.proposalTitle')}{proposalBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                  </p>
                  {!proposalBusy && !nProposed && <p className="px-1 py-2 text-xs text-warning">{t('opener.campaign.noneLeft')}</p>}
                  {(proposal || []).map((o, k) => (
                    <div key={o.openerEmail} className="mb-2">
                      <p className="flex items-center gap-1.5 px-1 py-1 text-sm font-semibold text-black dark:text-white">
                        <span className="h-3 w-3 rounded-sm" style={{ background: OPENER_COLORS[k % OPENER_COLORS.length] }} />{o.openerName}
                      </p>
                      {o.days.map((d) => (
                        <div key={d.campaignRouteId} className={`group flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-gray-2 dark:hover:bg-meta-4 ${selected === d.campaignRouteId ? 'bg-gray-2 dark:bg-meta-4' : ''}`}>
                          <button onClick={() => setSelected(d.campaignRouteId)} className="min-w-0 flex-1 text-left">
                            <p className="truncate font-medium text-black dark:text-white">{fmtDay(d.date)} — {d.name}</p>
                            <p className="truncate text-[11px] text-body dark:text-bodydark">
                              {t('opener.campaign.nStops', { n: d.stops })} · ~{fmtMinutes(d.minutes)} · {t(`opener.campaign.mode.${d.mode}`)}{(() => { const c = data.routes.find((x) => x.id === d.campaignRouteId)?.clients; return c ? ` · ${t('opener.campaign.nClients', { count: c })}` : ''; })()}
                            </p>
                          </button>
                          <button onClick={() => dropFromProposal(d.campaignRouteId)} title={t('opener.campaign.dropFromProposal') as string}
                            className="shrink-0 rounded p-1 text-body opacity-60 hover:text-danger group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={planWeek} disabled={!!busy || proposalBusy || !nProposed}
                className="mb-3 inline-flex items-center justify-center gap-1.5 rounded bg-primary px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {busy === 'plan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                {t('opener.campaign.publishN', { n: nProposed })}
              </button>
              {planResult && (
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded border border-success/40 bg-success/5 p-3 text-xs">
                  {planResult.map((o) => (
                    <div key={o.openerName}>
                      <p className="font-semibold text-black dark:text-white">{o.openerName}{o.emailSent ? ` · ${t('opener.campaign.emailSent')}` : ''}</p>
                      {o.days.length
                        ? o.days.map((d) => <p key={d.date} className="text-body dark:text-bodydark">{fmtDay(d.date)} — {d.name}</p>)
                        : <p className="text-warning">{t('opener.campaign.noneLeft')}</p>}
                    </div>
                  ))}
                </div>
              )}
              {!planResult && !picked.length && <p className="text-xs text-body dark:text-bodydark">{t('opener.campaign.clickHint')}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
