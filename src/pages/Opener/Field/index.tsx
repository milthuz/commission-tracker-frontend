import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Routes, Route as R, NavLink, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, List, Users, CalendarDays, WifiOff } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import useColorMode from '../../../hooks/useColorMode';
import './field.css';
import { api, type Route } from '../api';
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

  const reload = useCallback(async () => {
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

  const value = useMemo<FieldCtx>(() => ({ lng, dark, setTheme: setColorMode, date, route, loading, error, reload, position, accuracy, outbox, online, markStop }),
    [lng, dark, setColorMode, date, route, loading, error, reload, position, accuracy, outbox, online, markStop]);

  if (!allowed) {
    return (
      <div className="opener-field flex min-h-screen items-center justify-center p-6 text-center text-sm text-[var(--of-muted)]">
        {t('opener.field.noAccess')}
      </div>
    );
  }

  return (
    <Ctx.Provider value={value}>
      <div className="opener-field min-h-screen font-satoshi">
        <div className="relative mx-auto min-h-screen max-w-[480px]">
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
