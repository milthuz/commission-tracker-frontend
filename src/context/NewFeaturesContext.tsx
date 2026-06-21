import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL;
const DEFAULT_NEW_DAYS = 7;

// A "new feature" announcement, now sourced from the backend (/api/features/new),
// which admins populate when publishing a release.
export interface NewFeature {
  id: string;          // stable feature_id (per-user "seen" key)
  path: string;        // sidebar route the announcement points at
  title?: string;      // on-page banner title (free text, set at publish time)
  description?: string;
  since: string;       // ISO date the feature shipped
  days?: number;       // window length (defaults to 7)
}

interface NewFeaturesCtx {
  showBadge: (path: string) => boolean;     // time-based "New" pill (stays a few days)
  hasDot: (path: string) => boolean;        // per-user unseen dot (clears immediately on visit)
  anyDotUnder: (prefix: string) => boolean; // any unseen-in-window feature under a path prefix
  markSeenUnder: (prefix: string) => void;  // acknowledge all features under a prefix (e.g. opening a section)
  currentBanner: () => NewFeature | null;   // in-window, non-dismissed feature for the current page
  dismissBanner: (id: string) => void;      // hide the on-page banner for this user
}

const bannerKey = (id: string) => `${id}::banner`;

const Ctx = createContext<NewFeaturesCtx>({
  showBadge: () => false,
  hasDot: () => false,
  anyDotUnder: () => false,
  markSeenUnder: () => {},
  currentBanner: () => null,
  dismissBanner: () => {},
});
export const useNewFeatures = () => useContext(Ctx);

const token = () => localStorage.getItem('token');

// The badge/banner is visible while now <= since + days.
function windowOpen(f: NewFeature) {
  const end = new Date(f.since);
  end.setDate(end.getDate() + (f.days ?? DEFAULT_NEW_DAYS));
  return new Date() <= end;
}
const matchesPath = (f: NewFeature, pathname: string) =>
  pathname === f.path || pathname.startsWith(f.path + '/');

export function NewFeaturesProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // null = seen not loaded yet (or failed) → render no dots to avoid false-flagging.
  const [seen, setSeen] = useState<string[] | null>(null);
  const [features, setFeatures] = useState<NewFeature[]>([]);

  // Load the active "what's new" catalog from the backend.
  useEffect(() => {
    if (!token()) return;
    let cancelled = false;
    fetch(`${API_URL}/api/features/new`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d) => { if (!cancelled) setFeatures(Array.isArray(d.features) ? d.features : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load the user's already-seen ids.
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
    const f = features.find((f) => matchesPath(f, pathname) && !seen.includes(f.id));
    if (f) markSeen(f.id);
  }, [pathname, seen, features, markSeen]);

  // "New" pill: shown only while the feature is recent (window) AND the user hasn't
  // seen it yet. It clears the moment they open the section (markSeen on navigation),
  // per-user and permanently — no lingering day-counter.
  const showBadge = useCallback(
    (path: string) => !!seen && features.some((f) => f.path === path && windowOpen(f) && !seen.includes(f.id)),
    [seen, features],
  );
  const hasDot = useCallback(
    (path: string) => !!seen && features.some((f) => f.path === path && windowOpen(f) && !seen.includes(f.id)),
    [seen, features],
  );
  const anyDotUnder = useCallback(
    (prefix: string) => !!seen && features.some((f) => f.path.startsWith(prefix) && windowOpen(f) && !seen.includes(f.id)),
    [seen, features],
  );
  // Acknowledge every in-window feature under a prefix at once — used when the user OPENS a
  // section (e.g. expands the Admin menu), so the aggregate dot clears even without visiting
  // each sub-page. Also covers features whose path never exactly matches a visited route.
  const markSeenUnder = useCallback(
    (prefix: string) => {
      if (!seen) return;
      features.forEach((f) => {
        if (f.path.startsWith(prefix) && windowOpen(f) && !seen.includes(f.id)) markSeen(f.id);
      });
    },
    [seen, features, markSeen],
  );
  const currentBanner = useCallback((): NewFeature | null => {
    if (seen === null) return null;
    return features.find(
      (f) => matchesPath(f, pathname) && windowOpen(f) && !seen.includes(bannerKey(f.id)),
    ) || null;
  }, [seen, features, pathname]);

  const dismissBanner = useCallback((id: string) => markSeen(bannerKey(id)), [markSeen]);

  return (
    <Ctx.Provider value={{ showBadge, hasDot, anyDotUnder, markSeenUnder, currentBanner, dismissBanner }}>
      {children}
    </Ctx.Provider>
  );
}
