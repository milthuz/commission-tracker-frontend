import { useEffect, useState } from 'react';
import { useAppVersion } from './useAppVersion';

/**
 * Returns true when the latest published release has not been viewed yet by
 * this user — i.e. when localStorage('last-seen-release-version') !== latest
 * version. Visiting the /versions page calls localStorage.setItem(...) and
 * dispatches a 'release-seen' event, which clears the flag.
 */
export function useUnseenRelease(): boolean {
  const latest = useAppVersion();
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    const norm = (v: string | null | undefined) => (v || '').replace(/^v/i, '').trim();
    const latestN = norm(latest);
    const check = () => {
      const seen = norm(localStorage.getItem('last-seen-release-version'));
      // First-time visitors: don't immediately yell — only flag after they've
      // seen *something* once. We treat 'no record' as already-seen.
      if (!seen) {
        localStorage.setItem('last-seen-release-version', latestN);
        setUnseen(false);
        return;
      }
      setUnseen(seen !== latestN);
    };
    check();
    const onSeen = () => check();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'last-seen-release-version') check();
    };
    window.addEventListener('release-seen', onSeen);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('release-seen', onSeen);
      window.removeEventListener('storage', onStorage);
    };
  }, [latest]);

  return unseen;
}
