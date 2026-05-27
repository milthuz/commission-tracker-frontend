import { useEffect, useState } from 'react';
import axios from 'axios';
import packageJson from '../../package.json';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Cache version across hook instances during the session
let cached: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns the most recent app release version from the backend DB.
 * Falls back to package.json if the backend is unreachable.
 * Cached for 5 minutes to avoid hammering the endpoint.
 */
export function useAppVersion(): string {
  const fallback = packageJson.version;
  const [version, setVersion] = useState<string>(cached || fallback);

  useEffect(() => {
    const fresh = cached && (Date.now() - cachedAt) < CACHE_TTL_MS;
    if (fresh) {
      setVersion(cached!);
      return;
    }
    let cancelled = false;
    axios.get(`${API_URL}/api/releases/latest`)
      .then(res => {
        const v = (res.data?.version || '').replace(/^v/, '').trim();
        if (v && !cancelled) {
          cached = v;
          cachedAt = Date.now();
          setVersion(v);
        }
      })
      .catch(() => { /* keep fallback */ });
    return () => { cancelled = true; };
  }, []);

  return version;
}
