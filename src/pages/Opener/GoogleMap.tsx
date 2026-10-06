import { useEffect, useRef, useState } from 'react';

// Thème de Sales Hub (classe `dark` sur le body), suivi EN DIRECT : basculer le thème
// recolore la carte sans la recharger.
export function useIsDark() {
  const read = () => typeof document !== 'undefined' && document.body.classList.contains('dark');
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(read()));
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}
import { api } from './api';

// Carte Google Maps du module Opener.
//
// ⚠️ Google exige que les données Places soient affichées sur une carte GOOGLE : pas de
// Leaflet ici, contrairement au prototype.
//
// La clé navigateur vient de l'API (GOOGLE_MAPS_BROWSER_KEY sur Railway) et non du build :
// elle se change sans redéployer le site. Restreinte au domaine dans la console Google.
//
// Les styles clair et sombre passent par `styles` (sans Map ID) : un Map ID désactive `styles`, et les
// marqueurs classiques suffisent pour quelques dizaines de points.

declare global {
  interface Window { google?: any; __shGmapsReady?: () => void }
}

let loading: Promise<any> | null = null;
let config: Promise<{ mapsKey: string | null; today: string }> | null = null;

export const getOpenerConfig = () => (config = config || api('/api/opener/config').catch((e) => { config = null; throw e; }));

export function loadGoogleMaps(lang: string): Promise<any> {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (loading) return loading;
  loading = getOpenerConfig().then((cfg) => new Promise((resolve, reject) => {
    if (!cfg.mapsKey) { reject(new Error('no_maps_key')); return; }
    window.__shGmapsReady = () => resolve(window.google);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cfg.mapsKey)}&v=weekly&loading=async`
      + `&language=${lang === 'en' ? 'en' : 'fr'}&region=CA&callback=__shGmapsReady`;
    s.async = true;
    s.onerror = () => reject(new Error('maps_load_failed'));
    document.head.appendChild(s);
  })).catch((e) => { loading = null; throw e; });
  return loading;
}

// Thème sombre aligné sur Sales Hub (boxdark-2 / strokedark / bodydark).
export const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d2733' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A99AF' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1A222C' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2E3A47' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#24303F' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3d4d60' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#121a23' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#212c39' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3d4d60' }] },
];

// Thème clair : la carte Google standard, sans les points d'intérêt ni les transports (seuls
// NOS points comptent sur cette carte).
export const LIGHT_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];
const styleFor = (dark: boolean) => (dark ? DARK_STYLE : LIGHT_STYLE);

// Pastille numérotée (SVG) pour un marqueur classique.
export function pinIcon(g: any, color: string, label: string | number | null, opts: { size?: number; done?: boolean; active?: boolean; surface?: string } = {}) {
  const size = opts.size || 28;
  const r = size / 2;
  const halo = opts.active ? `<circle cx="${r + 6}" cy="${r + 6}" r="${r + 5}" fill="rgba(245,131,70,.35)"/>` : '';
  const body = opts.done
    ? `<circle cx="${r + 6}" cy="${r + 6}" r="${r - 1}" fill="${opts.surface || '#24303F'}" stroke="${color}" stroke-width="2"/>`
      + `<path d="M${r + 6 - 5} ${r + 6} l3.5 3.5 l6.5 -7" stroke="${color}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<circle cx="${r + 6}" cy="${r + 6}" r="${r}" fill="${color}" stroke="#1A222C" stroke-width="1.5"/>`
      + (label != null ? `<text x="${r + 6}" y="${r + 6 + 4}" text-anchor="middle" font-family="Satoshi,Arial,sans-serif" font-size="12" font-weight="700" fill="#1C2434">${label}</text>` : '');
  const w = size + 12;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}">${halo}${body}</svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new g.maps.Size(w, w), anchor: new g.maps.Point(w / 2, w / 2) };
}

export function dotIcon(g: any, color: string, size = 10) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 4}" height="${size + 4}"><circle cx="${(size + 4) / 2}" cy="${(size + 4) / 2}" r="${size / 2}" fill="${color}" stroke="#1C2434" stroke-opacity=".55" stroke-width="1.5"/></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new g.maps.Size(size + 4, size + 4), anchor: new g.maps.Point((size + 4) / 2, (size + 4) / 2) };
}

// Le conteneur de la carte. `onReady(g, map)` est appelé une fois la carte créée.
export function GoogleMapView({ lang, className, center, zoom = 15, onReady, interactive = true, fallback, dark = true }: {
  lang: string; className?: string; center: [number, number]; zoom?: number; dark?: boolean;
  onReady: (g: any, map: any) => void; interactive?: boolean; fallback?: (err: string) => JSX.Element;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);
  const mapObj = useRef<any>(null);
  useEffect(() => {
    mapObj.current?.setOptions({ styles: styleFor(dark), backgroundColor: dark ? '#1A222C' : '#F1F5F9' });
  }, [dark]);
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(lang).then((g) => {
      if (cancelled || !el.current || done.current) return;
      done.current = true;
      const map = new g.maps.Map(el.current, {
        center: { lat: center[0], lng: center[1] }, zoom, styles: styleFor(dark), backgroundColor: dark ? '#1A222C' : '#F1F5F9',
        disableDefaultUI: true, clickableIcons: false, gestureHandling: interactive ? 'greedy' : 'none',
        keyboardShortcuts: interactive, zoomControl: false,
      });
      mapObj.current = map;
      onReady(g, map);
    }).catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (error && fallback) return fallback(error);
  // `isolation: isolate` : les calques de la carte restent sous les éléments posés par-dessus.
  return <div ref={el} className={className} style={{ isolation: 'isolate' }} />;
}
