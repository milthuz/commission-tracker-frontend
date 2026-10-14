import { useEffect, useState } from 'react';

// ONE theme setting for the whole app (Sales Hub, partner portal, La Passe, opener field app).
//
// Before (audit UX, P1): two mechanisms that never agreed — the Header and the partner portal
// wrote `darkMode` ('true'/'false') and put `dark` on <html>; TailAdmin's useColorMode wrote
// `color-theme` (JSON) and put `dark` on <body>, as did the index.html pre-paint script. The
// opener maps followed <body>, the leads charts followed <html>: toggling in the header left the
// maps in the other theme.
//
// Now: key `theme` = 'dark' | 'light', class `dark` on <html> only. The two old keys are read
// once as a migration so nobody's choice is lost. index.html repeats `readTheme` inline (before
// the bundle loads, to avoid a flash) — keep both in sync.

export type Theme = 'dark' | 'light';

const KEY = 'theme';
const EVENT = 'sh-theme-change';

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light') return v;
    const legacyHeader = localStorage.getItem('darkMode');
    if (legacyHeader !== null) return legacyHeader === 'true' ? 'dark' : 'light';
    const legacyTemplate = localStorage.getItem('color-theme');
    if (legacyTemplate !== null) return JSON.parse(legacyTemplate) === 'dark' ? 'dark' : 'light';
  } catch { /* storage blocked: fall through */ }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.body?.classList.remove('dark'); // left over by the old body-based mechanism
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
    localStorage.removeItem('darkMode');
    localStorage.removeItem('color-theme');
  } catch { /* the choice still applies to this page */ }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }));
}

/** Current theme, kept in sync across every component and every open tab. */
export function useTheme(): [Theme, (t: Theme) => void, () => void] {
  const [theme, setLocal] = useState<Theme>(readTheme);
  useEffect(() => {
    const onChange = () => setLocal(readTheme());
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) { const t = readTheme(); applyTheme(t); setLocal(t); } };
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(EVENT, onChange); window.removeEventListener('storage', onStorage); };
  }, []);
  return [theme, setTheme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
}

export const useIsDark = () => useTheme()[0] === 'dark';
