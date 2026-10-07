import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route as R, NavLink, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, List, Users, CalendarDays, WifiOff, FlaskConical, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import useColorMode from '../../../hooks/useColorMode';
import './field.css';
import { api, type Route, type Campaign, type CampaignRouteDetail } from '../api';
import { flush, onOutboxChange, pending } from './outbox';
import { getOpenerConfig } from '../GoogleMap';
import Home from './Home';
import StopDetail from './StopDetail';
import CheckIn from './CheckIn';
import LeadForm from './LeadForm';
import MyLeads from './MyLeads';
import Day from './Day';

// Application de terrain de l'opener (écrans 1a à 1f du brief) — /opener/*.
// Plein écran, sans la barre latérale de Sales Hub, pensée pour un téléphone de 390 à 430 px.
// Permission : opener:field.

interface FieldCtx {
  lng: 'fr' | 'en';
  dark: boolean;
  setTheme: (mode: 'light' | 'dark') => void;
  date: string;
  route: Route | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  position: [number, number] | null;
  accuracy: number | null;
  outbox: number;
  online: boolean;
  markStop: (stopId: number, patch: Partial<Route['stops'][number]>) => void;
  // Mode démonstration (manager) : une vraie route de la campagne chargée sur le téléphone, RIEN
  // n'est enregistré (check-ins, leads, arrêts sautés, fin de journée simulés). Pour voir l'app
  // avant d'assigner des routes (demande de David, 2026-10-08).
  demo: boolean;
  canDemo: boolean;
  startDemo: () => Promise<void>;
  endDemo: () => void;
}
const Ctx = createContext<FieldCtx | null>(null);
export const useField = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useField hors de FieldApp');
  return c;
};

export default function FieldApp() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  // Le thème de Sales Hub n'est appliqué au body que par l'en-tête (DarkModeSwitcher), absent
  // d'ici : sans cet appel, l'application s'ouvrirait toujours en clair.
  const [colorMode, setColorMode] = useColorMode() as [string, (v: string) => void];
  const dark = colorMode === 'dark';
  const lng: 'fr' | 'en' = i18n.language?.startsWith('fr') ? 'fr' : 'en';
  const [date, setDate] = useState('');
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [outbox, setOutbox] = useState(pending().length);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const allowed = !!user && (user.isAdmin || user.permissions?.includes('*') || user.permissions?.includes('opener:field') || user.permissions?.includes('opener:*'));
  // La démo lit une route de la campagne : réservée à qui peut voir la campagne (opener:routes).
  const canDemo = !!user && !!(user.isAdmin || user.permissions?.includes('*') || user.permissions?.includes('opener:routes') || user.permissions?.includes('opener:*'));
  const [demo, setDemo] = useState(false);
  const demoRef = useRef(false);
  const realRoute = useRef<Route | null>(null);

  const reload = useCallback(async () => {
    if (demoRef.current) return; // en démo, la route simulée reste à l'écran
    try {
      const cfg = await getOpenerConfig();
      const r = await api<{ date: string; route: Route | null }>(`/api/opener/today?date=${cfg.today}`);
      setDate(r.date);
      setRoute(r.route);
      setError(null);
      // La route du jour est gardée : sans réseau, l'opener la retrouve.
      try { localStorage.setItem('opener_route_cache', JSON.stringify(r)); } catch { /* rien */ }
    } catch (e: any) {
      try {
        const c = JSON.parse(localStorage.getItem('opener_route_cache') || 'null');
        if (c) { setDate(c.date); setRoute(c.route); }
      } catch { /* rien */ }
      setError(e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (allowed) reload(); else setLoading(false); }, [allowed, reload]);

  // Position GPS : suivie tant que l'application est ouverte. Refusée → l'application marche
  // quand même (pas de distance au restaurant).
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => { setPosition([p.coords.latitude, p.coords.longitude]); setAccuracy(p.coords.accuracy); },
      () => { /* refus ou indisponible */ },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // File d'envoi : au retour du réseau, toutes les 30 s, et à chaque ajout.
  useEffect(() => {
    const off = onOutboxChange(() => setOutbox(pending().length));
    const up = () => { setOnline(true); flush().then(() => reload()); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const iv = window.setInterval(() => { if (pending().length) flush(); }, 30000);
    flush();
    return () => { off(); window.removeEventListener('online', up); window.removeEventListener('offline', down); window.clearInterval(iv); };
  }, [reload]);

  const markStop = useCallback((stopId: number, patch: Partial<Route['stops'][number]>) => {
    setRoute((r) => (r ? { ...r, stops: r.stops.map((s) => (s.id === stopId ? { ...s, ...patch } : s)) } : r));
  }, []);

  // Démo : la première route « à faire » de la campagne qui compte un client (pour voir aussi la
  // visite d'un client), sinon la première. Ses vrais restaurants, ses vraies fiches Google.
  const startDemo = useCallback(async () => {
    const c = await api<Campaign>('/api/opener/campaign');
    const todo = c.routes.filter((r) => r.status === 'todo');
    const pick = todo.find((r) => (r.clients || 0) > 0) || todo[0] || c.routes[0];
    if (!pick) throw new Error(t('opener.field.demo.none') as string);
    const d = await api<CampaignRouteDetail>(`/api/opener/campaign/routes/${pick.id}`);
    realRoute.current = route;
    demoRef.current = true;
    setDemo(true);
    setRoute({
      id: -1, name: `${t('opener.field.demo.routeName')} · R${d.seq}`, date, openerEmail: user?.email || null, openerName: null,
      status: 'published', zone: null, start: null, version: 1, publishedAt: null, publishedBy: null, updatedAt: new Date().toISOString(),
      stops: d.stops.map((s, i) => ({
        ...s, id: i + 1, placeId: s.placeId, position: i + 1, name: s.name || '—', address: s.address, lat: s.lat, lng: s.lng,
        outcome: 'planned', skipReason: null, doneAt: null, checkin: null,
      })),
    });
  }, [route, date, user?.email, t]);
  const endDemo = useCallback(() => {
    demoRef.current = false;
    setDemo(false);
    setRoute(realRoute.current);
    reload();
  }, [reload]);

  const value = useMemo<FieldCtx>(() => ({ lng, dark, setTheme: setColorMode, date, route, loading, error, reload, position, accuracy, outbox, online, markStop, demo, canDemo, startDemo, endDemo }),
    [lng, dark, setColorMode, date, route, loading, error, reload, position, accuracy, outbox, online, markStop, demo, canDemo, startDemo, endDemo]);

  if (!allowed) {
    return (
      <div className="opener-field flex min-h-screen items-center justify-center p-6 text-center text-sm text-[var(--of-muted)]">
        {t('opener.field.noAccess')}
      </div>
    );
  }

  return (
    <Ctx.Provider value={value}>
      <div className="opener-field min-h-screen font-satoshi"
        // En démo, le bandeau (30 px) décale le haut de chaque écran.
        style={{ ['--of-top' as any]: demo ? 'calc(env(safe-area-inset-top, 0px) + 30px)' : 'env(safe-area-inset-top, 0px)' }}>
        <div className="relative mx-auto min-h-screen max-w-[480px]">
          {demo && (
            <div className="fixed inset-x-0 top-0 z-50 mx-auto flex h-[calc(env(safe-area-inset-top,0px)+30px)] max-w-[480px] items-center justify-center gap-2 bg-[#8B5CF6] px-3 text-xs font-semibold text-white"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} role="status">
              <FlaskConical className="h-3.5 w-3.5" />{t('opener.field.demo.banner')}
              <button onClick={endDemo} className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-white/20 px-2 py-0.5"><X className="h-3 w-3" />{t('opener.field.demo.quit')}</button>
            </div>
          )}
          {(!online || outbox > 0) && (
            <div className="fixed inset-x-0 top-0 z-50 mx-auto flex max-w-[480px] items-center justify-center gap-2 bg-warning/90 px-3 py-1.5 text-xs font-semibold text-[#1C2434]"
              style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }} role="status">
              {!online && <WifiOff className="h-3.5 w-3.5" />}
              {!online ? t('opener.field.offline', { n: outbox }) : t('opener.field.sending', { n: outbox })}
            </div>
          )}
          <Routes>
            <R index element={<Home view="map" />} />
            <R path="list" element={<Home view="list" />} />
            <R path="stop/:stopId" element={<StopDetail />} />
            <R path="stop/:stopId/checkin" element={<CheckIn />} />
            <R path="stop/:stopId/lead" element={<LeadForm />} />
            <R path="leads" element={<MyLeads />} />
            <R path="day" element={<Day />} />
            <R path="*" element={<Navigate to="/opener" replace />} />
          </Routes>
        </div>
      </div>
    </Ctx.Provider>
  );
}

// Barre d'onglets fixe (84 px dont 34 px de zone du geste d'accueil).
export function TabBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const tabs = [
    { to: '/opener', icon: MapPin, label: t('opener.field.tabs.map'), active: pathname === '/opener' || pathname === '/opener/' },
    { to: '/opener/list', icon: List, label: t('opener.field.tabs.list'), active: pathname.startsWith('/opener/list') },
    { to: '/opener/leads', icon: Users, label: t('opener.field.tabs.leads'), active: pathname.startsWith('/opener/leads') },
    { to: '/opener/day', icon: CalendarDays, label: t('opener.field.tabs.day'), active: pathname.startsWith('/opener/day') },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto grid max-w-[480px] grid-cols-4 border-t border-[var(--of-stroke)] bg-[var(--of-page)]"
      style={{ height: 'calc(50px + env(safe-area-inset-bottom, 0px) + 8px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {tabs.map(({ to, icon: Icon, label, active }) => (
        <NavLink key={to} to={to} end className={`flex flex-col items-center justify-center gap-1 pt-1.5 text-[11px] font-semibold ${active ? 'text-primary' : 'text-[var(--of-faint)]'}`}>
          <Icon className="h-[22px] w-[22px]" strokeWidth={2} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
