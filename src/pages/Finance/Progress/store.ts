// Module Finance — approbation par driver : cache de module partagé. Vingt pastilles sur une page ne
// font qu'UNE requête ; une écriture met le cache à jour avec la réponse du serveur ; un changement de
// valeur enregistré déclenche un rafraîchissement groupé (`refreshSoon`).
import { useEffect, useReducer } from 'react';
import { errCode, progressApi, type Mutation, type ProgressPayload, type StatusPayload } from './api';

const MAX_AGE_MS = 60_000;

interface Snapshot<T> { data: T | null; error: string | null; loading: boolean; at: number }

function makeStore<T>(fetcher: () => Promise<T>) {
  let snap: Snapshot<T> = { data: null, error: null, loading: false, at: 0 };
  const listeners = new Set<() => void>();
  let inflight: Promise<void> | null = null;
  let timer: number | null = null;
  const set = (s: Partial<Snapshot<T>>) => { snap = { ...snap, ...s }; listeners.forEach((l) => l()); };

  const load = (): Promise<void> => {
    if (inflight) return inflight;
    set({ loading: true });
    inflight = fetcher()
      .then((data) => set({ data, error: null, loading: false, at: Date.now() }))
      .catch((e) => set({ error: errCode(e), loading: false, at: Date.now() }))
      .finally(() => { inflight = null; });
    return inflight;
  };
  return {
    get: () => snap,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    /** Charge si jamais chargé ou si le cache a plus d'une minute (la donnée affichée reste en place). */
    ensure() { if (!inflight && (!snap.at || Date.now() - snap.at > MAX_AGE_MS)) void load(); },
    reload: load,
    /** Rafraîchit après une courte pause : les rafales (plusieurs cellules, plusieurs frappes) ne font qu'une requête. */
    refreshSoon(ms = 900) {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = null; void load(); }, ms);
    },
    patch(fn: (d: T) => T) { if (snap.data) set({ data: fn(snap.data) }); },
  };
}

export const statusStore = makeStore<StatusPayload>(progressApi.status);
export const progressStore = makeStore<ProgressPayload>(progressApi.progress);

/** Fusionne la réponse d'une écriture dans le cache : lignes modifiées, compteurs, annuaire. */
export function mergeMutation(r: Pick<Mutation, 'lines' | 'summary' | 'directory'>) {
  statusStore.patch((d) => {
    const by = new Map(r.lines.map((l) => [l.key, l]));
    return { ...d, lines: d.lines.map((l) => by.get(l.key) || l), summary: r.summary, directory: r.directory || d.directory };
  });
  progressStore.refreshSoon(200);
}

/** Abonnement d'un composant à un cache ; déclenche le chargement au besoin. */
export function useStore<T>(store: ReturnType<typeof makeStore<T>>): Snapshot<T> {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { const off = store.subscribe(bump); store.ensure(); return off; }, [store]);
  return store.get();
}
