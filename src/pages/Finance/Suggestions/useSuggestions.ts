// Module Finance — lot F : chargement partagé des suggestions (cache de module) et mémoire de
// « garder la mienne » (sessionStorage). Tous les composants du lot lisent la MÊME réponse :
// vingt puces sur la page Drivers = une seule requête.
import { useCallback, useEffect, useState } from 'react';
import { errCode, suggestionsApi, type SuggestionsPayload } from './api';
import { readKept, withKept, withoutKept, writeKept } from './logic';
import type { Suggestion } from './api';

const TTL_MS = 5 * 60 * 1000;
type Status = 'loading' | 'ready' | 'forbidden' | 'error';
interface Entry { status: Status; data: SuggestionsPayload | null; error: string | null; at: number; promise: Promise<void> | null }

const cache = new Map<number, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const storage = (): Storage | null => { try { return window.sessionStorage; } catch { return null; } };
let kept: Record<string, string> | null = null;
const getKept = () => (kept = kept || readKept(storage()));

function entryFor(window: number): Entry {
  return cache.get(window) || { status: 'loading', data: null, error: null, at: 0, promise: null };
}

function fetchWindow(window: number, force: boolean): Promise<void> {
  const cur = cache.get(window);
  if (cur && cur.promise) return cur.promise;
  if (!force && cur && cur.status === 'ready' && Date.now() - cur.at < TTL_MS) return Promise.resolve();
  const prev = cur && cur.data ? cur.data : null;
  const promise = suggestionsApi.load(window)
    .then((data) => { cache.set(window, { status: 'ready', data, error: null, at: Date.now(), promise: null }); })
    .catch((e) => {
      const code = errCode(e);
      // Pas la permission (ou mode démo) : le lot reste invisible, sans bruit.
      cache.set(window, { status: code === 'forbidden' || code === 'demo_blocked' ? 'forbidden' : 'error', data: prev, error: code, at: Date.now(), promise: null });
    })
    .finally(() => emit());
  cache.set(window, { ...(cur || entryFor(window)), promise, status: cur && cur.data ? cur.status : 'loading' });
  emit();
  return promise;
}

/** Oublie le cache (après un changement de données source, ou à la demande de l'usager). */
export function invalidateSuggestions() { cache.clear(); emit(); }

export function useSuggestionData(window = 6) {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    fetchWindow(window, false);
    return () => { listeners.delete(l); };
  }, [window]);
  const e = entryFor(window);
  const reload = useCallback(() => fetchWindow(window, true), [window]);
  return { status: e.status, data: e.data, error: e.error, reload, loading: e.status === 'loading' || !!e.promise };
}

/** Suggestions NON appliquées dont la CFO a dit « garder la mienne » dans cette session. */
export function useKept() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const keep = useCallback((s: Suggestion) => { kept = withKept(getKept(), s); writeKept(storage(), kept); emit(); }, []);
  const forget = useCallback((key: string) => { kept = withoutKept(getKept(), key); writeKept(storage(), kept); emit(); }, []);
  return { kept: getKept(), keep, forget };
}
