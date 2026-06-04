import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { NEW_FEATURES, type NewFeature } from '../config/newFeatures';

const API_URL = import.meta.env.VITE_API_URL;
const SEEN_DELAY_MS = 3000; // time on the page before a feature counts as "seen"

interface NewFeaturesCtx {
  isNew: (path: string) => boolean;       // exact path match (a sidebar item)
  anyNewUnder: (prefix: string) => boolean; // any unseen feature whose path starts with prefix
}

const Ctx = createContext<NewFeaturesCtx>({ isNew: () => false, anyNewUnder: () => false });
export const useNewFeatures = () => useContext(Ctx);

const token = () => localStorage.getItem('token');
const notExpired = (f: NewFeature) => !f.until || new Date() <= new Date(f.until);
const matchesPath = (f: NewFeature, pathname: string) =>
  pathname === f.path || pathname.startsWith(f.path + '/');

export function NewFeaturesProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // null = not loaded yet (or load failed) → render no badges to avoid false-flagging.
  const [seen, setSeen] = useState<string[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the user's already-seen feature ids.
  useEffect(() => {
    if (!token()) { setSeen([]); return; }
    let cancelled = false;
    fetch(`${API_URL}/api/features/seen`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d) => { if (!cancelled) setSeen(Array.isArray(d.seen) ? d.seen : []); })
      .catch(() => { if (!cancelled) setSeen(null); });
    return () => { cancelled = true; };
  }, []);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => (prev && prev.includes(id) ? prev : [...(prev || []), id]));
    fetch(`${API_URL}/api/features/seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ featureId: id }),
    }).catch(() => {});
  }, []);

  // After SEEN_DELAY on an unseen feature's page, mark it seen → the dot disappears.
  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (seen === null) return;
    const f = NEW_FEATURES.find((f) => matchesPath(f, pathname) && notExpired(f) && !seen.includes(f.id));
    if (!f) return;
    timerRef.current = setTimeout(() => markSeen(f.id), SEEN_DELAY_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [pathname, seen, markSeen]);

  const isNew = useCallback(
    (path: string) =>
      !!seen && NEW_FEATURES.some((f) => f.path === path && notExpired(f) && !seen.includes(f.id)),
    [seen],
  );

  const anyNewUnder = useCallback(
    (prefix: string) =>
      !!seen && NEW_FEATURES.some((f) => f.path.startsWith(prefix) && notExpired(f) && !seen.includes(f.id)),
    [seen],
  );

  return <Ctx.Provider value={{ isNew, anyNewUnder }}>{children}</Ctx.Provider>;
}
