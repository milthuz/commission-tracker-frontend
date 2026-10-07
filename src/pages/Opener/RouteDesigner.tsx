import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, GripVertical, Navigation, Pencil, Check, Loader2, Send, Undo2, Trash2, Star, Search, MapPin, Save, Sparkles, Phone, Clock, Globe, Info, Minus, Ban } from 'lucide-react';
import Select from '../../components/Select';
import DateField from '../../components/DateField';
import { ContentLoader } from '../../common/Loader';
import { dialog } from '../../lib/dialog';
import {
  api, ApiError, fmtDistance, fmtMinutes, STATUS_COLOR, VERDICT_COLOR,
  type Route, type RouteSummary, type ScannedPlace, type PlaceStatus, type Stop, type PlaceCard,
} from './api';
import { GoogleMapView, getOpenerConfig, pinIcon, dotIcon, useIsDark } from './GoogleMap';
import { optimize, pathM, circlePolygon, kindOf, suggestRoutes, type PlaceKind, type Suggestion, type LatLng } from './geo';
import RouteTracking from './RouteTracking';
import CampaignView from './CampaignView';

// Écran 1g — conception des routes (manager). Permission opener:routes.
// Trois onglets : « Campagne » (CampaignView, ouvert par défaut : le territoire déjà découpé en routes),
// « Planifier » (ci-dessous) et « Suivi » (RouteTracking : avancement des routes et
// vérification des visites par la position GPS du check-in).
//
// Planification automatique : un quartier ou une adresse + un rayon → zone balayée ; le temps
// disponible et les minutes par arrêt → routes suggérées (geo.suggestRoutes), compactes, qui
// tiennent dans la journée. « Utiliser » remplit le brouillon ; « Créer en brouillons » en fait
// une par jour ouvrable.
//
// 1. Ou dessiner une zone sur la carte (clics → sommets, « Terminer la zone »).
// 2. Le serveur balaie la zone (Google) et rend chaque restaurant avec son statut Cluster.
// 3. Filtrer, cliquer un point pour voir sa fiche, ajouter des arrêts, les réordonner, optimiser.
// 4. Choisir l'opener et la date, publier : l'opener reçoit un courriel.
//
// Le brouillon s'enregistre tout seul (verrou de version côté serveur).

type DraftStop = Pick<Stop, 'placeId' | 'name' | 'address' | 'lat' | 'lng'> & Partial<Stop>;
interface Draft {
  id: number | null; name: string; date: string; openerEmail: string; zone: [number, number][] | null;
  stops: DraftStop[]; version: number | null; status: Route['status']; openerName?: string | null;
}

const MONTREAL: [number, number] = [45.5236, -73.5865];
const ALL_STATUSES: PlaceStatus[] = ['new', 'prospect', 'former', 'client'];
const ALL_KINDS: PlaceKind[] = ['restaurant', 'takeout', 'cafe', 'bar', 'bakery', 'other'];
// Couleurs des routes suggérées (une par route, sur la carte et dans la liste).
const SUG_COLORS = ['#F58346', '#3C50E0', '#10B981', '#E85D9B', '#8B5CF6', '#F2B53C', '#22B8CF', '#64748B'];
// Prochain jour ouvrable (lundi à vendredi) à partir d'une date AAAA-MM-JJ, incluse.
const weekdaysFrom = (ymd: string, n: number) => {
  const out: string[] = [];
  const d = new Date(`${ymd}T12:00:00Z`);
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};

const emptyDraft = (today: string): Draft => ({ id: null, name: '', date: today, openerEmail: '', zone: null, stops: [], version: null, status: 'draft' });

export default function RouteDesigner() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language?.startsWith('fr') ? 'fr' : 'en';
  const dark = useIsDark();
  const [today, setToday] = useState<string>('');
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [openers, setOpeners] = useState<{ email: string; name: string }[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<ScannedPlace[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState<{ calls: number; truncated: boolean; budget?: { calls: number; limit: number } } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawPts, setDrawPts] = useState<[number, number][]>([]);
  const [statuses, setStatuses] = useState<PlaceStatus[]>(['new', 'prospect', 'former']);
  const [lastVisitMin, setLastVisitMin] = useState('0');
  const [minRating, setMinRating] = useState('0');
  const [service, setService] = useState<'all' | 'tables' | 'quick'>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'campaign' | 'plan' | 'track'>('campaign');
  const [kinds, setKinds] = useState<PlaceKind[]>(ALL_KINDS);
  // Planification automatique
  const [planQ, setPlanQ] = useState('');
  const [planRadius, setPlanRadius] = useState('800');
  const [planHours, setPlanHours] = useState('5');
  const [stopMin, setStopMin] = useState('12');
  const [planning, setPlanning] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion<ScannedPlace>[]>([]);
  const [sugHover, setSugHover] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<'results' | 'suggest'>('results');
  // Fiche détaillée (Google, à la demande) du point sélectionné
  const [detail, setDetail] = useState<PlaceCard | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const mapRef = useRef<{ g: any; map: any } | null>(null);
  const layers = useRef<{ markers: Map<string, any>; poly: any; line: any; drawLine: any; clickL: any; sug: any[] }>({ markers: new Map(), poly: null, line: null, drawLine: null, clickL: null, sug: [] });
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  // Les écouteurs de clic des marqueurs sont créés une fois : ils lisent la liste À JOUR ici.
  const resultsRef = useRef<ScannedPlace[]>([]);
  resultsRef.current = results;

  // ------------------------------------------------------------------ chargement
  const loadRoutes = useCallback(async () => {
    const r = await api<{ routes: RouteSummary[] }>('/api/opener/routes');
    setRoutes(r.routes);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getOpenerConfig();
        setToday(cfg.today);
        const [, o] = await Promise.all([loadRoutes(), api<{ openers: { email: string; name: string }[] }>('/api/opener/openers')]);
        setOpeners(o.openers);
        setDraft(emptyDraft(cfg.today));
      } catch (e: any) { dialog.alert(e.message); }
      finally { setLoading(false); }
    })();
  }, [loadRoutes]);

  const fromRoute = (r: Route): Draft => ({
    id: r.id, name: r.name, date: r.date, openerEmail: r.openerEmail || '', zone: r.zone, version: r.version, status: r.status,
    openerName: r.openerName, stops: r.stops,
  });

  const openRoute = async (id: string) => {
    if (dirty && draft?.id) await save();
    if (id === 'new') { setDraft(emptyDraft(today)); setResults([]); setScanInfo(null); setDirty(false); return; }
    const r = await api<{ route: Route }>(`/api/opener/routes/${id}`);
    setSuggestions([]);
    setDraft(fromRoute(r.route));
    setDirty(false);
    setResults([]);
    if (r.route.zone) await scan(r.route.zone, false);
    fitTo(r.route.stops.filter((s) => s.lat != null).map((s) => [s.lat!, s.lng!] as [number, number]));
  };

  // ------------------------------------------------------------------ enregistrement
  const editable = draft?.status === 'draft';
  const patch = (p: Partial<Draft>) => { setDraft((d) => (d ? { ...d, ...p } : d)); setDirty(true); };

  const save = useCallback(async (): Promise<Draft | null> => {
    const d = draftRef.current;
    if (!d || d.status !== 'draft' || !d.name.trim() || !d.date) return d;
    setSaving('saving');
    const body = {
      name: d.name.trim(), date: d.date, openerEmail: d.openerEmail || null, zone: d.zone,
      stops: d.stops.map((s) => ({ placeId: s.placeId, name: s.name, address: s.address, lat: s.lat, lng: s.lng })),
    };
    try {
      const r = d.id
        ? await api<{ route: Route }>(`/api/opener/routes/${d.id}`, { method: 'PUT', body: { ...body, version: d.version } })
        : await api<{ route: Route }>('/api/opener/routes', { method: 'POST', body });
      const nd = fromRoute(r.route);
      setDraft(nd);
      setDirty(false);
      setSaving('saved');
      loadRoutes().catch(() => {});
      return nd;
    } catch (e) {
      setSaving('error');
      if (e instanceof ApiError && e.body?.error === 'version_conflict') {
        await dialog.alert(t('opener.designer.conflict'));
        if (d.id) await openRoute(String(d.id));
      }
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRoutes, t]);

  // Autosave 1,2 s après la dernière modification.
  useEffect(() => {
    if (!dirty || !editable) return;
    const h = window.setTimeout(() => { save(); }, 1200);
    return () => window.clearTimeout(h);
  }, [draft, dirty, editable, save]);

  // ------------------------------------------------------------------ balayage
  const scan = async (zone: [number, number][], fit = true): Promise<ScannedPlace[] | null> => {
    setScanning(true);
    try {
      const r = await api<{ places: ScannedPlace[]; calls: number; truncated: boolean; budget: { calls: number; limit: number } }>(
        '/api/opener/scan', { method: 'POST', body: { polygon: zone } });
      setResults(r.places);
      setScanInfo({ calls: r.calls, truncated: r.truncated, budget: r.budget });
      if (fit) fitTo(zone);
      return r.places;
    } catch (e) {
      const err = e as ApiError;
      dialog.alert(err.body?.error === 'zone_too_large' ? t('opener.designer.zoneTooLarge', { km2: err.body.maxKm2 })
        : err.body?.error === 'scan_budget_exhausted' ? t('opener.designer.budgetExhausted')
        : t('opener.designer.scanFailed', { error: err.message }));
      return null;
    } finally { setScanning(false); }
  };

  // ------------------------------------------------------------------ carte
  const fitTo = (pts: [number, number][]) => {
    const m = mapRef.current;
    if (!m || !pts.length) return;
    const b = new m.g.maps.LatLngBounds();
    pts.forEach(([a, c]) => b.extend({ lat: a, lng: c }));
    m.map.fitBounds(b, 60);
  };

  const inRoute = useMemo(() => new Map((draft?.stops || []).map((s, i) => [s.placeId, i + 1])), [draft?.stops]);

  const addStop = useCallback((p: ScannedPlace) => {
    const d = draftRef.current;
    if (!d || d.status !== 'draft' || d.stops.some((s) => s.placeId === p.placeId)) return;
    if (d.stops.length >= 60) { dialog.alert(t('opener.designer.maxStops')); return; }
    patch({ stops: [...d.stops, { placeId: p.placeId, name: p.name, address: p.address, lat: p.lat, lng: p.lng, status: p.status }] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  const addStopRef = useRef(addStop);
  addStopRef.current = addStop;

  // Dessin des calques à chaque changement.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const { g, map } = m;
    const L = layers.current;
    // Zone
    if (L.poly) { L.poly.setMap(null); L.poly = null; }
    if (draft?.zone) {
      L.poly = new g.maps.Polygon({ paths: draft.zone.map(([a, b]) => ({ lat: a, lng: b })), strokeColor: '#F58346', strokeOpacity: 0.9,
        strokeWeight: 2, fillColor: '#F58346', fillOpacity: 0.06, clickable: false, map });
    }
    // Points
    const want = new Map<string, ScannedPlace | DraftStop>();
    results.forEach((p) => want.set(p.placeId, p));
    (draft?.stops || []).forEach((s) => { if (!want.has(s.placeId)) want.set(s.placeId, s); });
    L.markers.forEach((mk, id) => { if (!want.has(id)) { mk.setMap(null); L.markers.delete(id); } });
    want.forEach((p, id) => {
      if (p.lat == null || p.lng == null) return;
      const n = inRoute.get(id);
      const color = STATUS_COLOR[(p.status as PlaceStatus) || 'new'];
      const icon = n ? pinIcon(g, color, n, { size: 26, active: selected === id }) : dotIcon(g, color, selected === id ? 14 : 10);
      let mk = L.markers.get(id);
      if (!mk) {
        mk = new g.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map, title: p.name });
        // Clic : la fiche du restaurant s'ouvre (l'ajout se fait depuis la fiche).
        mk.addListener('click', () => setSelected(id));
        L.markers.set(id, mk);
      }
      mk.setIcon(icon);
      mk.setTitle(`${p.name}${p.status ? ` · ${t(`opener.status.${p.status}`)}` : ''}`);
      mk.setZIndex(n ? 1000 + n : selected === id ? 900 : 1);
    });
    // Tracé de la route
    if (L.line) { L.line.setMap(null); L.line = null; }
    const path = (draft?.stops || []).filter((s) => s.lat != null).map((s) => ({ lat: s.lat!, lng: s.lng! }));
    if (path.length > 1) {
      L.line = new g.maps.Polyline({ path, map, strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, strokeColor: '#F58346', scale: 3 }, offset: '0', repeat: '10px' }], clickable: false });
    }
    // Routes suggérées : un secteur coloré par route.
    L.sug.forEach((x) => x.setMap(null));
    L.sug = [];
    suggestions.forEach((s, i) => {
      if (s.hull.length < 3) return;
      const col = SUG_COLORS[i % SUG_COLORS.length];
      const on = sugHover === i;
      const poly = new g.maps.Polygon({ paths: s.hull.map(([a, b]) => ({ lat: a, lng: b })), strokeColor: col, strokeOpacity: 0.95,
        strokeWeight: on ? 4 : 2, fillColor: col, fillOpacity: on ? 0.22 : 0.1, map, zIndex: 2 });
      poly.addListener('mouseover', () => setSugHover(i));
      poly.addListener('mouseout', () => setSugHover(null));
      L.sug.push(poly);
    });
  }, [draft?.zone, draft?.stops, results, inRoute, selected, t, suggestions, sugHover]);

  // Fiche : on oublie les détails Google d'un autre point.
  useEffect(() => { setDetail(null); }, [selected]);

  // Mode dessin : clics sur la carte → sommets ; trait provisoire.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const L = layers.current;
    if (L.clickL) { L.clickL.remove(); L.clickL = null; }
    if (L.drawLine) { L.drawLine.setMap(null); L.drawLine = null; }
    m.map.setOptions({ draggableCursor: drawing ? 'crosshair' : null });
    if (!drawing) return;
    L.clickL = m.map.addListener('click', (e: any) => setDrawPts((pts) => [...pts, [e.latLng.lat(), e.latLng.lng()]]));
    if (drawPts.length) {
      L.drawLine = new m.g.maps.Polyline({ path: drawPts.map(([a, b]) => ({ lat: a, lng: b })), map: m.map, strokeColor: '#F58346', strokeWeight: 2, clickable: false });
    }
  }, [drawing, drawPts]);

  const finishZone = async () => {
    if (drawPts.length < 3) return;
    const zone = drawPts;
    setDrawing(false);
    setDrawPts([]);
    patch({ zone });
    await scan(zone);
  };

  // ------------------------------------------------------------------ filtres
  const applyFilters = useCallback((list: ScannedPlace[]) => {
    const minDays = parseInt(lastVisitMin, 10) || 0;
    const minR = parseFloat(minRating) || 0;
    const now = Date.now();
    const qq = q.trim().toLowerCase();
    return list.filter((p) => statuses.includes(p.status)
      && kinds.includes(kindOf(p.primaryType))
      && (!minDays || !p.lastVisitAt || (now - new Date(p.lastVisitAt).getTime()) / 86400000 >= minDays)
      && (!minR || (p.rating != null && p.rating >= minR))
      && (service === 'all' || p.serviceType === service || p.serviceType === 'both')
      && (!qq || p.name.toLowerCase().includes(qq) || p.address.toLowerCase().includes(qq)))
      .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }, [statuses, kinds, lastVisitMin, minRating, service, q]);
  const filtered = useMemo(() => applyFilters(results), [applyFilters, results]);
  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    results.forEach((p) => { const k = kindOf(p.primaryType); c[k] = (c[k] || 0) + 1; });
    return c;
  }, [results]);

  // ------------------------------------------------------------------ planification automatique
  const computeSuggestions = (list: ScannedPlace[]) => {
    const s = suggestRoutes(applyFilters(list), { minutes: (parseFloat(planHours) || 5) * 60, stopMin: parseInt(stopMin, 10) || 12 });
    setSuggestions(s);
    setRightTab('suggest');
    if (!s.length) dialog.alert(t('opener.designer.noSuggestion'));
  };

  const plan = async () => {
    setPlanning(true);
    try {
      let list = results;
      if (planQ.trim()) {
        const g = await api<{ results: { name: string; lat: number; lng: number }[] }>(`/api/opener/geocode?q=${encodeURIComponent(planQ.trim())}`);
        if (!g.results.length) { dialog.alert(t('opener.designer.placeNotFound', { q: planQ })); return; }
        const zone = circlePolygon([g.results[0].lat, g.results[0].lng], parseInt(planRadius, 10) || 800);
        if (draftRef.current?.status === 'draft') patch({ zone });
        const scanned = await scan(zone);
        if (!scanned) return;
        list = scanned;
      } else if (!results.length) {
        dialog.alert(t('opener.designer.planNeedsZone'));
        return;
      }
      computeSuggestions(list);
    } catch (e: any) { dialog.alert(t('opener.designer.scanFailed', { error: e.message })); }
    finally { setPlanning(false); }
  };

  const toDraftStops = (s: Suggestion<ScannedPlace>) =>
    s.stops.map((p) => ({ placeId: p.placeId, name: p.name, address: p.address, lat: p.lat, lng: p.lng, status: p.status, version: p.version }));

  const useSuggestion = async (i: number) => {
    const s = suggestions[i];
    const d = draftRef.current;
    if (!s || !d) return;
    if (d.status !== 'draft') {
      setDraft({ ...emptyDraft(today), name: `${planQ.trim() || t('opener.designer.route')} · ${i + 1}`, zone: s.hull, stops: toDraftStops(s) });
      setDirty(true);
      return;
    }
    if (d.stops.length && !(await dialog.confirm(t('opener.designer.replaceStops', { n: d.stops.length })))) return;
    patch({ stops: toDraftStops(s), zone: s.hull, name: d.name || `${planQ.trim() || t('opener.designer.route')} · ${i + 1}` });
    fitTo(s.hull);
  };

  // Une route par jour ouvrable, à partir de la date du brouillon, pour l'opener choisi.
  const createAllDrafts = async () => {
    const d = draftRef.current;
    if (!suggestions.length || !d) return;
    const dates = weekdaysFrom(d.date || today, suggestions.length);
    const base = planQ.trim() || d.name.trim() || t('opener.designer.route');
    if (!(await dialog.confirm(t('opener.designer.createAllConfirm', { n: suggestions.length, from: dates[0], to: dates[dates.length - 1] })))) return;
    setBusy(true);
    try {
      let firstId: number | null = null;
      for (const [i, s] of suggestions.entries()) {
        const r = await api<{ route: Route }>('/api/opener/routes', { method: 'POST', body: {
          name: `${base} · ${i + 1}`, date: dates[i], openerEmail: d.openerEmail || null, zone: s.hull,
          stops: s.stops.map((p) => ({ placeId: p.placeId, name: p.name, address: p.address, lat: p.lat, lng: p.lng })) } });
        if (firstId == null) firstId = r.route.id;
      }
      await loadRoutes();
      dialog.alert(t('opener.designer.createdAll', { n: suggestions.length }));
      if (firstId != null) { setDirty(false); await openRoute(String(firstId)); }
    } catch (e: any) { dialog.alert(e.message); } finally { setBusy(false); }
  };

  const loadDetail = async (placeId: string) => {
    setDetailLoading(true);
    try { setDetail(await api<PlaceCard>(`/api/opener/place/${encodeURIComponent(placeId)}?lang=${lng}`)); }
    catch (e: any) { dialog.alert(e.message); } finally { setDetailLoading(false); }
  };

  const addAll = () => {
    const d = draftRef.current;
    if (!d) return;
    const room = 60 - d.stops.length;
    const add = filtered.filter((p) => !inRoute.has(p.placeId)).slice(0, Math.max(0, room));
    patch({ stops: [...d.stops, ...add.map((p) => ({ placeId: p.placeId, name: p.name, address: p.address, lat: p.lat, lng: p.lng, status: p.status }))] });
  };

  // ------------------------------------------------------------------ arrêts
  const removeStop = (i: number) => draft && patch({ stops: draft.stops.filter((_, k) => k !== i) });

  // « Pas un restaurant » : exclu pour de bon (scans, campagne) ; rétablissable dans l'onglet Campagne.
  const excludePlace = async (p: { placeId: string; name: string }) => {
    if (!(await dialog.confirm(t('opener.campaign.excludeConfirm', { name: p.name || '—' }), { confirmText: t('opener.campaign.exclude'), danger: true }))) return;
    try {
      await api(`/api/opener/places/${encodeURIComponent(p.placeId)}/exclude`, { method: 'POST', body: { reason: 'not_restaurant' } });
      setResults((rs) => rs.filter((x) => x.placeId !== p.placeId));
      const d = draftRef.current;
      if (d && d.status === 'draft' && d.stops.some((x) => x.placeId === p.placeId)) patch({ stops: d.stops.filter((x) => x.placeId !== p.placeId) });
      setSelected(null);
    } catch (e: any) { dialog.alert(e.message); }
  };
  const moveStop = (from: number, to: number) => {
    if (!draft || from === to) return;
    const s = [...draft.stops];
    const [x] = s.splice(from, 1);
    s.splice(to, 0, x);
    patch({ stops: s });
  };
  const optimizeOrder = () => {
    if (!draft) return;
    const withPos = draft.stops.filter((s) => s.lat != null);
    const without = draft.stops.filter((s) => s.lat == null);
    const order = optimize(withPos.map((s) => [s.lat!, s.lng!]));
    patch({ stops: [...order.map((i) => withPos[i]), ...without] });
  };

  const stats = useMemo(() => {
    const pts = (draft?.stops || []).filter((s) => s.lat != null).map((s) => [s.lat!, s.lng!] as [number, number]);
    const m = pathM(pts);
    const minutes = Math.round(m / 80) + (draft?.stops.length || 0) * (parseInt(stopMin, 10) || 12);   // marche + minutes par arrêt
    return { m, h: Math.floor(minutes / 60), min: minutes % 60 };
  }, [draft?.stops, stopMin]);

  // ------------------------------------------------------------------ publication
  const publish = async () => {
    if (!draft) return;
    if (!draft.openerEmail) { dialog.alert(t('opener.designer.pickOpener')); return; }
    if (!draft.stops.length) { dialog.alert(t('opener.designer.addStopsFirst')); return; }
    const who = openers.find((o) => o.email === draft.openerEmail)?.name || draft.openerEmail;
    if (!(await dialog.confirm(t('opener.designer.publishConfirm', { name: who, date: draft.date, n: draft.stops.length }), { confirmText: t('opener.designer.publish') }))) return;
    setBusy(true);
    try {
      const saved = await save();
      if (!saved?.id) throw new Error(t('opener.designer.saveFirst') as string);
      const r = await api<{ route: Route; emailSent: boolean }>(`/api/opener/routes/${saved.id}/publish`, { method: 'POST' });
      setDraft(fromRoute(r.route));
      setDirty(false);
      loadRoutes().catch(() => {});
      dialog.alert(r.emailSent ? t('opener.designer.published', { name: who }) : t('opener.designer.publishedNoEmail', { name: who }));
    } catch (e) {
      const err = e as ApiError;
      dialog.alert(err.body?.error === 'opener_has_route' ? t('opener.designer.openerHasRoute', { name: err.body.route?.name || '' }) : err.message);
    } finally { setBusy(false); }
  };

  const unpublish = async () => {
    if (!draft?.id) return;
    try {
      const r = await api<{ route: Route }>(`/api/opener/routes/${draft.id}/unpublish`, { method: 'POST' });
      setDraft(fromRoute(r.route));
      loadRoutes().catch(() => {});
    } catch (e) {
      const err = e as ApiError;
      dialog.alert(err.body?.error === 'route_started' ? t('opener.designer.routeStarted') : err.message);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    if (!(await dialog.confirm(t('opener.designer.deleteConfirm', { name: draft.name }), { danger: true, confirmText: t('opener.designer.delete') }))) return;
    await api(`/api/opener/routes/${draft.id}`, { method: 'DELETE' }).catch((e) => dialog.alert(e.message));
    setDraft(emptyDraft(today)); setResults([]); setScanInfo(null); setDirty(false);
    loadRoutes().catch(() => {});
  };

  if (loading || !draft) return <ContentLoader />;

  const routeOptions = [
    { value: 'new', label: t('opener.designer.newRoute') },
    ...routes.map((r) => ({ value: String(r.id), label: `${r.date} · ${r.name}${r.openerName ? ` · ${r.openerName}` : ''} — ${t(`opener.routeStatus.${r.status}`)}${r.status !== 'draft' ? ` (${r.done}/${r.stops})` : ''}` })),
  ];
  const openerName = openers.find((o) => o.email === draft.openerEmail)?.name || draft.openerName;
  const card = 'rounded-sm border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';

  return (
    <div className="space-y-4">
      <div className="inline-flex gap-1 rounded-xl border border-stroke bg-white p-1 dark:border-strokedark dark:bg-boxdark">
        {(['campaign', 'plan', 'track'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`h-9 rounded-[9px] px-4 text-sm font-semibold ${tab === k ? 'bg-primary text-white' : 'text-body dark:text-bodydark'}`}>
            {t(`opener.designer.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'campaign' ? (
        <CampaignView onOpenRoute={(id) => { setTab('plan'); openRoute(String(id)); }} />
      ) : tab === 'track' ? (
        <RouteTracking onOpen={(id) => { setTab('plan'); openRoute(String(id)); }} />
      ) : (<>
      {/* En-tête : choix de la route + état d'enregistrement */}
      <div className={`${card} flex flex-wrap items-center gap-3 p-3`}>
        <div className="min-w-[260px] flex-1">
          <Select value={draft.id ? String(draft.id) : 'new'} onChange={openRoute} options={routeOptions} />
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${draft.status === 'draft' ? 'bg-stroke text-body dark:bg-meta-4 dark:text-bodydark' : draft.status === 'published' ? 'bg-success/15 text-success' : 'bg-primary/15 text-primary'}`}>
          {t(`opener.routeStatus.${draft.status}`)}
        </span>
        <span className="text-xs text-body dark:text-bodydark">
          {saving === 'saving' ? t('opener.designer.saving') : saving === 'saved' && !dirty ? t('opener.designer.saved') : saving === 'error' ? t('opener.designer.saveError') : dirty ? t('opener.designer.unsaved') : ''}
        </span>
        {scanInfo?.budget && (
          <span className="text-xs text-body dark:text-bodydark" title={t('opener.designer.budgetHelp') as string}>
            {t('opener.designer.budget', { used: scanInfo.budget.calls, limit: scanInfo.budget.limit })}
          </span>
        )}
      </div>

      {/* Planification automatique : où, combien de temps → routes suggérées. */}
      <div className={`${card} p-3`}>
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-black dark:text-white">{t('opener.designer.planTitle')}</p>
          <span className="hidden text-xs text-body dark:text-bodydark sm:inline">{t('opener.designer.planHelp')}</span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-[2]">
            <label className="mb-1 block text-xs font-medium text-black dark:text-white">{t('opener.designer.planWhere')}</label>
            <input value={planQ} onChange={(e) => setPlanQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') plan(); }}
              placeholder={t('opener.designer.planWherePh') as string}
              className="h-11 w-full rounded border border-stroke bg-transparent px-3 text-sm text-black outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white" />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-black dark:text-white">{t('opener.designer.planRadius')}</label>
            <Select value={planRadius} onChange={setPlanRadius} options={['500', '800', '1200', '1500'].map((v) => ({ value: v, label: Number(v) >= 1000 ? `${(Number(v) / 1000).toLocaleString(lng === 'fr' ? 'fr-CA' : 'en-CA')} km` : `${v} m` }))} />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-black dark:text-white">{t('opener.designer.planTime')}</label>
            <Select value={planHours} onChange={setPlanHours} options={['2', '3', '4', '5', '6', '7', '8'].map((v) => ({ value: v, label: `${v} h` }))} />
          </div>
          <div className="w-36">
            <label className="mb-1 block text-xs font-medium text-black dark:text-white">{t('opener.designer.planPerStop')}</label>
            <Select value={stopMin} onChange={setStopMin} options={['8', '10', '12', '15', '20'].map((v) => ({ value: v, label: `${v} min` }))} />
          </div>
          <button onClick={plan} disabled={planning || scanning}
            className="inline-flex h-11 items-center gap-2 rounded bg-primary px-4 text-sm font-bold text-white hover:bg-opacity-90 disabled:opacity-50">
            {planning || scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t('opener.designer.planGo')}
          </button>
        </div>
      </div>

      {/* 3 colonnes à partir de 2xl seulement : sous ce seuil, la barre latérale (~290 px) ne laisse
          pas assez de place à la carte. En dessous : la carte en haut, route et filtres côte à côte. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:h-[calc(100vh-220px)] 2xl:min-h-[640px] 2xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        {/* ---------------- Gauche : la route ---------------- */}
        <div className={`${card} flex min-h-0 flex-col p-4 md:max-h-[760px] 2xl:max-h-none`}>
          <label className="mb-1 block text-xs font-medium text-black dark:text-white">{t('opener.designer.routeName')}</label>
          <input value={draft.name} disabled={!editable} onChange={(e) => patch({ name: e.target.value })} placeholder={t('opener.designer.routeNamePh') as string}
            className="mb-3 h-11 w-full rounded border border-stroke bg-transparent px-3 text-[15px] font-semibold text-black outline-none focus:border-primary disabled:opacity-70 dark:border-form-strokedark dark:bg-form-input dark:text-white" />
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-black dark:text-white">{t('opener.designer.date')}</label>
              <DateField value={draft.date} onChange={(v) => editable && patch({ date: v })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-black dark:text-white">{t('opener.designer.opener')}</label>
              <Select value={draft.openerEmail} disabled={!editable} onChange={(v) => patch({ openerEmail: v })}
                placeholder={t('opener.designer.pickOpenerPh') as string}
                options={openers.map((o) => ({ value: o.email, label: o.name }))} />
            </div>
          </div>
          {!openers.length && <p className="mb-2 text-xs text-warning">{t('opener.designer.noOpeners')}</p>}
          <p className="mb-3 text-xs text-body dark:text-bodydark">
            {t('opener.designer.stats', { n: draft.stops.length, dist: fmtDistance(stats.m, lng), h: stats.h, min: String(stats.min).padStart(2, '0') })}
          </p>

          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[.06em] text-body dark:text-bodydark2">{t('opener.designer.stopsTitle')}</p>
            {editable && draft.stops.length > 2 && (
              <button onClick={optimizeOrder} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Navigation className="h-3.5 w-3.5" />{t('opener.designer.optimize')}
              </button>
            )}
          </div>
          <div className="-mx-1 min-h-[120px] flex-1 space-y-1 overflow-y-auto px-1">
            {!draft.stops.length && <p className="rounded border border-dashed border-stroke p-4 text-center text-xs text-body dark:border-strokedark dark:text-bodydark">{t('opener.designer.noStops')}</p>}
            {draft.stops.map((s, i) => {
              const st = (s.status as PlaceStatus) || 'new';
              return (
                <div key={s.placeId}
                  draggable={editable}
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={() => { if (dragIdx != null) moveStop(dragIdx, i); setDragIdx(null); }}
                  onClick={() => { setSelected(s.placeId); if (s.lat != null) mapRef.current?.map.panTo({ lat: s.lat, lng: s.lng }); }}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${selected === s.placeId ? 'bg-gray-2 dark:bg-meta-4' : 'hover:bg-gray-2 dark:hover:bg-meta-4/60'} ${dragIdx === i ? 'opacity-50' : ''}`}>
                  {editable && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-body" />}
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#1C2434]" style={{ background: STATUS_COLOR[st] }}>
                    {s.outcome === 'done' ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-black dark:text-white">{s.name}</p>
                    <p className="truncate text-[11px] text-body dark:text-bodydark2">
                      {t(`opener.status.${st}`)}{s.version ? ` ${s.version.toUpperCase()}` : ''} · {s.address || '—'}
                      {s.outcome === 'skipped' ? ` · ${t(`opener.skip.${s.skipReason || 'other'}`)}` : ''}
                      {s.outcome === 'done' && s.checkin?.durationMin != null ? ` · ${fmtMinutes(s.checkin.durationMin)}` : ''}
                    </p>
                  </div>
                  {editable && (
                    <button onClick={(e) => { e.stopPropagation(); removeStop(i); }} className="rounded p-1 text-body hover:text-danger" aria-label={t('opener.designer.remove') as string}>
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-stroke pt-3 dark:border-strokedark">
            {editable ? (
              <>
                <button onClick={() => save()} disabled={!dirty || !draft.name.trim()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded border border-stroke px-3 py-2.5 text-sm font-semibold text-black hover:border-primary disabled:opacity-50 dark:border-form-strokedark dark:bg-meta-4 dark:text-white">
                  <Save className="h-4 w-4" />{t('opener.designer.save')}
                </button>
                <button onClick={publish} disabled={busy || !draft.name.trim()}
                  className="inline-flex flex-[1.4] items-center justify-center gap-1.5 rounded bg-primary px-3 py-2.5 text-sm font-bold text-white hover:bg-opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {openerName ? t('opener.designer.publishTo', { name: openerName.split(' ')[0] }) : t('opener.designer.publish')}
                </button>
                {draft.id && (
                  <button onClick={remove} className="inline-flex items-center gap-1 rounded px-2 py-2 text-xs text-body hover:text-danger" title={t('opener.designer.delete') as string}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="w-full text-xs text-body dark:text-bodydark">
                  {t('opener.designer.lockedHelp', { name: openerName || '—' })}
                </p>
                {draft.status === 'published' && (
                  <button onClick={unpublish} className="inline-flex items-center gap-1.5 rounded border border-stroke px-3 py-2 text-sm font-semibold text-black hover:border-primary dark:border-form-strokedark dark:bg-meta-4 dark:text-white">
                    <Undo2 className="h-4 w-4" />{t('opener.designer.unpublish')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ---------------- Centre : la carte ---------------- */}
        <div className={`${card} relative order-first min-h-[460px] overflow-hidden md:col-span-2 2xl:order-none 2xl:col-span-1`}>
          <GoogleMapView lang={lng} dark={dark} className="absolute inset-0" center={MONTREAL} zoom={14}
            onReady={(g, map) => {
              // La carte est recréée en revenant de l'onglet Suivi : les anciens calques n'existent plus.
              layers.current = { markers: new Map(), poly: null, line: null, drawLine: null, clickL: null, sug: [] };
              mapRef.current = { g, map }; setResults((r) => [...r]);
            }}
            fallback={(err) => (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-body dark:text-bodydark">
                {err === 'no_maps_key' ? t('opener.noMapsKey') : t('opener.mapsFailed')}
              </div>
            )} />
          {/* Outils */}
          {editable && (
            <div className="absolute right-3 top-3 flex flex-col gap-2">
              <button onClick={() => { setDrawing((d) => !d); setDrawPts([]); }} title={t('opener.designer.drawZone') as string}
                className={`flex h-9 w-9 items-center justify-center rounded-[10px] border shadow ${drawing ? 'border-primary bg-primary text-white' : 'border-stroke bg-white text-primary dark:border-strokedark dark:bg-boxdark'}`}>
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => mapRef.current?.map.setZoom(mapRef.current.map.getZoom() + 1)} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-stroke bg-white text-black dark:border-strokedark dark:bg-boxdark dark:text-bodydark1 shadow">+</button>
              <button onClick={() => mapRef.current?.map.setZoom(mapRef.current.map.getZoom() - 1)} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-stroke bg-white text-black dark:border-strokedark dark:bg-boxdark dark:text-bodydark1 shadow">−</button>
            </div>
          )}
          {/* Bandeau bas */}
          <div className="absolute bottom-3 left-3 right-16 flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-stroke bg-white px-3 py-1.5 text-xs text-black dark:border-strokedark dark:bg-boxdark dark:text-bodydark1 shadow">
              {drawing
                ? t('opener.designer.drawHelp', { n: drawPts.length })
                : scanning ? t('opener.designer.scanning')
                : results.length ? t('opener.designer.zoneInfo', { n: results.length }) + (scanInfo?.truncated ? ` · ${t('opener.designer.truncated')}` : '')
                : editable ? t('opener.designer.startHelp') : ''}
            </div>
            {drawing && (
              <>
                <button onClick={finishZone} disabled={drawPts.length < 3} className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white shadow disabled:opacity-50">
                  {t('opener.designer.finishZone')}
                </button>
                <button onClick={() => setDrawPts((p) => p.slice(0, -1))} disabled={!drawPts.length} className="rounded-full border border-stroke bg-white px-3 py-1.5 text-xs text-black dark:border-strokedark dark:bg-boxdark dark:text-bodydark1 shadow disabled:opacity-50">
                  {t('opener.designer.undoPoint')}
                </button>
              </>
            )}
            {!drawing && draft.zone && editable && (
              <button onClick={() => scan(draft.zone!)} disabled={scanning} className="rounded-full border border-stroke bg-white px-3 py-1.5 text-xs text-black dark:border-strokedark dark:bg-boxdark dark:text-bodydark1 shadow disabled:opacity-50">
                {scanning ? <Loader2 className="inline h-3 w-3 animate-spin" /> : t('opener.designer.rescan')}
              </button>
            )}
          </div>
          {/* Fiche du point sélectionné */}
          {(() => {
            const p = results.find((r) => r.placeId === selected) || (draft.stops.find((s) => s.placeId === selected) as ScannedPlace | undefined);
            if (!p) return null;
            const n = inRoute.get(p.placeId);
            const g = detail?.placeId === p.placeId ? detail.google : null;
            const days = p.lastVisitAt ? Math.floor((Date.now() - new Date(p.lastVisitAt).getTime()) / 86400000) : null;
            return (
              <div className="absolute bottom-14 left-3 z-10 w-[min(340px,calc(100%-24px))] rounded-lg border border-stroke bg-white p-3 shadow-lg dark:border-strokedark dark:bg-boxdark">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-black dark:text-white">{p.name}</p>
                    <p className="truncate text-xs text-body dark:text-bodydark">{p.address}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="rounded p-1 text-body hover:text-black dark:hover:text-white" aria-label={t('opener.designer.close') as string}><X className="h-4 w-4" /></button>
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1 font-semibold text-black dark:text-white">
                    <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[(p.status as PlaceStatus) || 'new'] }} />
                    {t(`opener.status.${p.status || 'new'}`)}{p.version ? ` ${p.version.toUpperCase()}` : ''}
                  </span>
                  {p.rating != null && <span className="text-body dark:text-bodydark"><Star className="mb-0.5 inline h-3 w-3 fill-[#FDB022] text-[#FDB022]" /> {p.rating.toLocaleString(lng === 'fr' ? 'fr-CA' : 'en-CA')}{p.reviews != null ? ` (${p.reviews})` : ''}</span>}
                  {p.primaryType && <span className="text-body dark:text-bodydark">{t(`opener.kind.${kindOf(p.primaryType)}`)}</span>}
                  {p.serviceType && <span className="text-body dark:text-bodydark">{t(`opener.serviceShort.${p.serviceType}`)}</span>}
                </div>
                <div className="mb-2 space-y-0.5 text-xs text-body dark:text-bodydark">
                  <p>{days != null ? t('opener.designer.lastVisitBy', { n: days, by: p.lastVisitBy || '—' }) : t('opener.field.neverVisited')}</p>
                  {p.competitorPos && <p>POS : {p.competitorPos}</p>}
                  {p.lead && <p>{t('opener.field.lead')} : {p.lead.refCode}</p>}
                  {p.clusterName && <p>{t('opener.field.clusterName')} : {p.clusterName}</p>}
                  {p.status === 'client' && p.lastSatisfaction != null && <p className={p.lastSatisfaction <= 2 ? 'font-semibold text-danger' : ''}>{t('opener.field.client.lastSatisfaction')} : {p.lastSatisfaction}/5{p.lastPaymentsBy ? ` · ${t(`opener.field.client.paymentsBy.${p.lastPaymentsBy}`)}` : ''}</p>}
                  {g && (
                    <>
                      {g.openNow != null && <p className="flex items-center gap-1"><Clock className="h-3 w-3" /><span className={g.openNow ? 'text-success' : 'text-danger'}>{g.openNow ? t('opener.field.openNow') : t('opener.field.closedNow')}</span></p>}
                      {g.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{g.phone}</p>}
                      {g.website && <p className="flex items-center gap-1 truncate"><Globe className="h-3 w-3 shrink-0" /><a href={g.website} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">{g.website.replace(/^https?:\/\/(www\.)?/, '')}</a></p>}
                    </>
                  )}
                  {detail?.placeId === p.placeId && detail.history.length > 0 && (
                    <div className="mt-1 border-t border-stroke pt-1 dark:border-strokedark">
                      {detail.history.slice(0, 3).map((h) => (
                        <p key={h.id} className="flex items-center gap-1">
                          {h.verdict && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: VERDICT_COLOR[h.verdict] }} title={t(`opener.track.verdict.${h.verdict}`) as string} />}
                          {new Date(h.at).toLocaleDateString(lng === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short' })} · {h.by}{h.satisfaction ? ` · ${t('opener.field.client.satShort', { n: h.satisfaction })}` : ''} · {t('opener.field.interestShort', { n: h.interest })}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {editable && (n ? (
                    <button onClick={() => removeStop(n - 1)} className="inline-flex items-center gap-1 rounded border border-stroke px-3 py-1.5 text-xs font-semibold text-black hover:border-danger hover:text-danger dark:border-strokedark dark:text-white">
                      <Minus className="h-3.5 w-3.5" />{t('opener.designer.removeFromRoute', { n })}
                    </button>
                  ) : (
                    <button onClick={() => addStop(p as ScannedPlace)} className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-bold text-white">
                      <Plus className="h-3.5 w-3.5" />{t('opener.designer.addToRoute')}
                    </button>
                  ))}
                  {detail?.placeId !== p.placeId && (
                    <button onClick={() => loadDetail(p.placeId)} disabled={detailLoading} className="inline-flex items-center gap-1 rounded border border-stroke px-3 py-1.5 text-xs font-medium text-black hover:border-primary dark:border-strokedark dark:text-white">
                      {detailLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Info className="h-3.5 w-3.5" />}{t('opener.designer.moreDetails')}
                    </button>
                  )}
                  {p.status !== 'client' && p.status !== 'former' && (
                    <button onClick={() => excludePlace(p)} className="inline-flex items-center gap-1 rounded border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:border-danger hover:text-danger dark:border-strokedark dark:text-bodydark">
                      <Ban className="h-3.5 w-3.5" />{t('opener.campaign.notRestaurant')}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
          {/* Légende */}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {ALL_STATUSES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full border border-stroke bg-white px-2 py-1 text-[11px] font-semibold text-black shadow dark:border-strokedark dark:bg-boxdark dark:text-bodydark1">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />{t(`opener.status.${s}`)}
              </span>
            ))}
          </div>
        </div>

        {/* ---------------- Droite : ajouter des arrêts ---------------- */}
        <div className={`${card} flex min-h-0 flex-col p-4 md:max-h-[760px] 2xl:max-h-none`}>
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-stroke p-1 dark:border-strokedark">
            {(['results', 'suggest'] as const).map((k) => (
              <button key={k} onClick={() => setRightTab(k)} className={`h-8 rounded-[9px] text-xs font-semibold ${rightTab === k ? 'bg-primary text-white' : 'text-body dark:text-bodydark'}`}>
                {k === 'results' ? t('opener.designer.tabResults', { n: filtered.length }) : t('opener.designer.tabSuggest', { n: suggestions.length })}
              </button>
            ))}
          </div>
          <p className="mb-1 text-xs font-medium text-black dark:text-white">{t('opener.designer.filterStatus')}</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ALL_STATUSES.map((s) => {
              const on = statuses.includes(s);
              return (
                <button key={s} onClick={() => setStatuses((x) => (on ? x.filter((y) => y !== s) : [...x, s]))}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${on ? 'bg-primary text-white' : 'border border-stroke text-black dark:border-strokedark dark:text-bodydark1'}`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />{t(`opener.status.${s}`)}
                </button>
              );
            })}
          </div>
          <p className="mb-1 text-xs font-medium text-black dark:text-white">{t('opener.designer.filterKind')}</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ALL_KINDS.filter((k) => kindCounts[k] || kinds.includes(k) === false).map((k) => {
              const on = kinds.includes(k);
              return (
                <button key={k} onClick={() => setKinds((x) => (on ? x.filter((y) => y !== k) : [...x, k]))}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${on ? 'bg-primary text-white' : 'border border-stroke text-black dark:border-strokedark dark:text-bodydark1'}`}>
                  {t(`opener.kind.${k}`)} <span className="opacity-70">({kindCounts[k] || 0})</span>
                </button>
              );
            })}
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-xs font-medium text-black dark:text-white">{t('opener.designer.lastVisit')}</p>
              <Select value={lastVisitMin} onChange={setLastVisitMin} options={['0', '30', '60', '90', '180'].map((v) => ({ value: v, label: v === '0' ? t('opener.designer.any') : `> ${v} ${t('opener.designer.days')}` }))} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-black dark:text-white">{t('opener.designer.minRating')}</p>
              <Select value={minRating} onChange={setMinRating} options={['0', '3.5', '4', '4.5'].map((v) => ({ value: v, label: v === '0' ? t('opener.designer.any') : `${Number(v).toLocaleString(lng === 'fr' ? 'fr-CA' : 'en-CA', { minimumFractionDigits: 1 })} ★` }))} />
            </div>
          </div>
          <p className="mb-1 text-xs font-medium text-black dark:text-white">{t('opener.designer.serviceType')}</p>
          <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-stroke p-1 dark:border-strokedark">
            {(['all', 'tables', 'quick'] as const).map((v) => (
              <button key={v} onClick={() => setService(v)} className={`h-8 rounded-[9px] text-xs font-semibold ${service === v ? 'bg-primary text-white' : 'text-body dark:text-bodydark'}`}>
                {t(`opener.designer.service.${v}`)}
              </button>
            ))}
          </div>
          {rightTab === 'suggest' ? (
            <div className="-mx-1 min-h-[160px] flex-1 space-y-2 overflow-y-auto px-1">
              {!suggestions.length && (
                <p className="rounded border border-dashed border-stroke p-4 text-center text-xs text-body dark:border-strokedark dark:text-bodydark">
                  <Sparkles className="mx-auto mb-1 h-4 w-4" />{t('opener.designer.noSuggestionYet')}
                </p>
              )}
              {suggestions.map((s, i) => (
                <div key={i} onMouseEnter={() => setSugHover(i)} onMouseLeave={() => setSugHover(null)}
                  className={`rounded-lg border p-3 ${sugHover === i ? 'border-primary' : 'border-stroke dark:border-strokedark'}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: SUG_COLORS[i % SUG_COLORS.length] }} />
                    <p className="text-sm font-semibold text-black dark:text-white">{t('opener.designer.sugTitle', { n: i + 1 })}</p>
                  </div>
                  <p className="mb-2 text-xs text-body dark:text-bodydark">
                    {t('opener.designer.sugStats', { n: s.stops.length, dist: fmtDistance(s.meters, lng), h: Math.floor(s.minutes / 60), min: String(s.minutes % 60).padStart(2, '0') })}
                  </p>
                  <p className="mb-2 truncate text-[11px] text-body dark:text-bodydark2">{s.stops.slice(0, 4).map((p) => p.name).join(' · ')}{s.stops.length > 4 ? ' …' : ''}</p>
                  <div className="flex gap-2">
                    <button onClick={() => useSuggestion(i)} className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-bold text-white">{t('opener.designer.useSuggestion')}</button>
                    <button onClick={() => fitTo(s.hull.length ? s.hull : s.stops.map((p) => [p.lat, p.lng] as LatLng))} className="rounded border border-stroke px-3 py-1.5 text-xs font-medium text-black dark:border-strokedark dark:text-white">{t('opener.designer.showOnMap')}</button>
                  </div>
                </div>
              ))}
              {suggestions.length > 0 && (
                <div className="border-t border-stroke pt-3 dark:border-strokedark">
                  <button onClick={createAllDrafts} disabled={busy} className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-primary px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5 disabled:opacity-50">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    {t('opener.designer.createAll', { n: suggestions.length })}
                  </button>
                  <p className="mt-1 text-[11px] text-body dark:text-bodydark">{t('opener.designer.createAllHelp')}</p>
                </div>
              )}
            </div>
          ) : (<>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-body" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('opener.designer.searchPh') as string}
              className="h-9 w-full rounded border border-stroke bg-transparent pl-8 pr-2 text-sm text-black outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white" />
          </div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-body dark:text-bodydark">{t('opener.designer.results', { n: filtered.length })}</span>
            {editable && filtered.some((p) => !inRoute.has(p.placeId)) && (
              <button onClick={addAll} className="font-semibold text-primary hover:underline">{t('opener.designer.addAll')}</button>
            )}
          </div>
          <div className="-mx-1 min-h-[160px] flex-1 space-y-1 overflow-y-auto px-1">
            {!results.length && !scanning && (
              <p className="rounded border border-dashed border-stroke p-4 text-center text-xs text-body dark:border-strokedark dark:text-bodydark">
                <MapPin className="mx-auto mb-1 h-4 w-4" />{t('opener.designer.noResults')}
              </p>
            )}
            {scanning && <ContentLoader />}
            {filtered.map((p) => {
              const n = inRoute.get(p.placeId);
              const days = p.lastVisitAt ? Math.floor((Date.now() - new Date(p.lastVisitAt).getTime()) / 86400000) : null;
              return (
                <div key={p.placeId} onClick={() => { setSelected(p.placeId); mapRef.current?.map.panTo({ lat: p.lat, lng: p.lng }); }}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${selected === p.placeId ? 'bg-gray-2 dark:bg-meta-4' : ''}`}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[p.status] }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-black dark:text-white">{p.name}</p>
                    <p className="truncate text-[11px] text-body dark:text-bodydark2">
                      {p.rating != null && <><Star className="mb-0.5 inline h-3 w-3 fill-[#FDB022] text-[#FDB022]" /> {p.rating.toLocaleString(lng === 'fr' ? 'fr-CA' : 'en-CA')} · </>}
                      {t(`opener.status.${p.status}`)}{p.version ? ` ${p.version.toUpperCase()}` : ''}
                      {days != null ? ` · ${t('opener.designer.visitedAgo', { n: days })}` : ''}
                      {p.competitorPos ? ` · ${p.competitorPos}` : ''}
                      {p.serviceType ? ` · ${t(`opener.serviceShort.${p.serviceType}`)}` : ''}
                    </p>
                  </div>
                  {n ? (
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary">{n}</span>
                  ) : editable ? (
                    <button onClick={() => addStop(p)} aria-label={t('opener.designer.add') as string}
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-gray-2 text-black hover:bg-primary hover:text-white dark:bg-meta-4 dark:text-white">
                      <Plus className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          </>)}
        </div>
      </div>
      </>)}
    </div>
  );
}
