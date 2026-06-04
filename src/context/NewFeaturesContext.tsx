import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { NEW_FEATURES, type NewFeature } from '../config/newFeatures';

const API_URL = import.meta.env.VITE_API_URL;
const DEFAULT_NEW_DAYS = 7;

interface NewFeaturesCtx {
  showBadge: (path: string) => boolean;     // time-based "New" pill (stays a few days)
  hasDot: (path: string) => boolean;        // per-user unseen dot (clears immediately on visit)
  anyDotUnder: (prefix: string) => boolean; // any unseen-in-window feature under a path prefix
  currentBanner: () => NewFeature | null;   // in-window, non-dismissed feature for the current page
  dismissBanner: (id: string) => void;      // hide the on-page banner for this user
}

const bannerKey = (id: string) => `${id}::banner`;

const Ctx = createContext<NewFeaturesCtx>({
  showBadge: () => false,
  hasDot: () => false,
  anyDotUnder: () => false,
  currentBanner: () => null,
  dismissBanner: () => {},
});
export const useNewFeatures = () => useContext(Ctx);

const token = () => localStorage.getItem('token');

// The "New" badge is visible while now <= since + days.
function windowOpen(f: NewFeature) {
  const end = new Date(f.since);
  end.setDate(end.getDate() + (f.days ?? DEFAULT_NEW_DAYS));
  return new Date() <= end;
}
const matchesPath = (f: NewFeature, pathname: string) =>
  pathname === f.path || pathname.startsWith(f.path + '/');

export function NewFeaturesProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // null = not loaded (or load failed) → render no dots to avoid false-flagging.
  const [seen, setSeen] = useState<string[] | null>(null);

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

  // Clear the DOT immediately when the user opens a feature's page (no delay).
  useEffect(() => {
    if (seen === null) return;
    const f = NEW_FEATURES.find((f) => matchesPath(f, pathname) && !seen.includes(f.id));
    if (f) markSeen(f.id);
  }, [pathname, seen, markSeen]);

  // Badge = time-based only (shows even after seen, for the whole window).
  const showBadge = useCallback(
    (path: string) => NEW_FEATURES.some((f) => f.path === path && windowOpen(f)),
    [],
  );
  // Dot = per-user unseen, and only while still within the badge window.
  const hasDot = useCallback(
    (path: string) => !!seen && NEW_FEATURES.some((f) => f.path === path && windowOpen(f) && !seen.includes(f.id)),
    [seen],
  );
  const anyDotUnder = useCallback(
    (prefix: string) => !!seen && NEW_FEATURES.some((f) => f.path.startsWith(prefix) && windowOpen(f) && !seen.includes(f.id)),
    [seen],
  );

  // On-page banner for the current route: in-window and not dismissed by this user.
  const currentBanner = useCallback((): NewFeature | null => {
    if (seen === null) return null;
    return NEW_FEATURES.find(
      (f) => matchesPath(f, pathname) && windowOpen(f) && !seen.includes(bannerKey(f.id)),
    ) || null;
  }, [seen, pathname]);

  const dismissBanner = useCallback((id: string) => markSeen(bannerKey(id)), [markSeen]);

  return (
    <Ctx.Provider value={{ showBadge, hasDot, anyDotUnder, currentBanner, dismissBanner }}>
      {children}
    </Ctx.Provider>
  );
}
