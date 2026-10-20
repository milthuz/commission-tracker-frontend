// Onglet KPI — chargement des données, enregistrement automatique du budget (cellule par cellule,
// concurrence optimiste) et suivi d'une synchronisation lancée à la main.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';
import { kpiApi, type BudgetCell, type KpiPayload } from './api';
import type { KpiKey } from './kpiModel';

const SAVE_DELAY = 700;
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
export const errCode = (e: unknown) => (e instanceof ApiError ? e.body?.error || `http_${e.status}` : 'network');

export function useKpi() {
  const [end, setEnd] = useState<string | null>(null);
  const [data, setData] = useState<KpiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const versions = useRef(new Map<string, number>());
  const pending = useRef(new Map<string, BudgetCell>());
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);
  const reqSeq = useRef(0);

  const load = useCallback(async (e?: string | null) => {
    const seq = ++reqSeq.current;
    try {
      const p = await kpiApi.load(e || undefined);
      if (seq !== reqSeq.current) return null;
      const v = new Map<string, number>();
      for (const [m, row] of Object.entries(p.budget)) for (const [k, s] of Object.entries(row)) if (s) v.set(`${m}|${k}`, s.version);
      versions.current = v;
      pending.current.clear();
      setData(p);
      setEnd(p.end);
      setSyncing(p.syncing);
      setError(null);
      return p;
    } catch (err) {
      if (seq !== reqSeq.current) return null;
      const code = err instanceof ApiError ? (err.status === 403 ? (err.body?.demo ? 'demo' : 'forbidden') : err.body?.error || `http_${err.status}`) : 'network';
      setError(code);
      return null;
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const changeEnd = useCallback((m: string) => { setEnd(m); load(m); }, [load]);
  const reload = useCallback(() => load(end), [load, end]);

  const flush = useCallback(async () => {
    if (inFlight.current) return;
    const cells = [...pending.current.values()].map((c) => ({ ...c, version: versions.current.get(`${c.month}|${c.key}`) || 0 }));
    if (!cells.length) return;
    pending.current.clear();
    inFlight.current = true;
    setSaveStatus('saving');
    try {
      const r = await kpiApi.saveBudget(cells);
      for (const s of r.saved) versions.current.set(`${s.month}|${s.key}`, s.version);
      setSaveStatus(pending.current.size ? 'pending' : 'saved');
    } catch (e) {
      if (errCode(e) === 'conflict') { setNotice('conflict'); setSaveStatus('idle'); await load(end); }
      else { setSaveStatus('error'); setNotice(`save:${errCode(e)}`); }
    } finally {
      inFlight.current = false;
      if (pending.current.size) timer.current = window.setTimeout(flush, SAVE_DELAY);
    }
  }, [load, end]);

  // Saisie d'une cellule du budget : le calcul suit tout de suite, l'envoi part après une pause.
  const setBudget = useCallback((month: string, key: KpiKey, value: number | null) => {
    setData((d) => {
      if (!d) return d;
      const row = { ...(d.budget[month] || {}) };
      if (value == null) delete row[key];
      else row[key] = { ...(row[key] || { version: versions.current.get(`${month}|${key}`) || 0 }), v: value };
      return { ...d, budget: { ...d.budget, [month]: row } };
    });
    pending.current.set(`${month}|${key}`, { month, key, value });
    setSaveStatus('pending');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY);
  }, [flush]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); flush(); }, [flush]);
  useEffect(() => {
    const warn = (ev: BeforeUnloadEvent) => { if (pending.current.size || inFlight.current) { ev.preventDefault(); ev.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // Synchronisation : le serveur répond tout de suite (202) ; on suit l'état, puis on recharge.
  const startSync = useCallback(async () => {
    await kpiApi.sync();
    setSyncing(true);
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try { const s = await kpiApi.status(); if (!s.syncing) break; } catch { break; }
    }
    setSyncing(false);
    await load(end);
  }, [load, end]);

  return { data, end, error, load, reload, changeEnd, setBudget, saveStatus, notice, setNotice, syncing, startSync };
}
