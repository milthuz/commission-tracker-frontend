// Module Finance — lot F : logique PURE des suggestions (sans React, sans réseau) : comparaison
// avec le budget vivant, options de méthode, mémoire « garder la mienne » (par session), données
// du graphique, sélection par défaut, codes d'erreur connus. Compilée telle quelle par le banc
// (scripts/test-finance-suggestions.cjs).
import type { Alternative, Confidence, Method, Suggestion, Unavailable } from './api';

export const MONTHS = 12;
const EPS = 1e-9;

/** Valeurs courantes d'un driver : ajustement de la CFO, sinon valeur par défaut × 12 (comme model.ts). */
export function currentValues(drv: Record<string, number[]>, defaults: Record<string, number>, key: string): number[] {
  const a = drv[key];
  if (Array.isArray(a) && a.length === MONTHS) return a.map((v) => +v || 0);
  const d = +defaults[key] || 0;
  return Array(MONTHS).fill(d);
}

export function sameValues(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < EPS);
}

export const average = (a: readonly number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** Écart relatif en % de la moyenne ; null quand la valeur de départ est nulle (pas de division par zéro). */
export function changePct(from: number, to: number): number | null {
  return Math.abs(from) < EPS ? null : ((to - from) / Math.abs(from)) * 100;
}

// ---------------------------------------------------------------------------- méthodes
export interface Option { id: string; method: Method; windowMonths: number; values: number[]; isDefault: boolean }

export const optionId = (method: Method, windowMonths: number) => `${method}:${windowMonths}`;

/** La méthode par défaut du serveur en tête, puis les autres (sans doublon), ordre stable. */
export function buildOptions(s: Suggestion): Option[] {
  const out: Option[] = [{ id: optionId(s.basis.method, s.basis.windowMonths), method: s.basis.method, windowMonths: s.basis.windowMonths, values: s.suggested, isDefault: true }];
  const order = (a: Alternative) => (a.method === 'avg' ? a.windowMonths : a.method === 'trend' ? 100 : 101);
  for (const a of [...s.alternatives].sort((x, y) => order(x) - order(y))) {
    const id = optionId(a.method, a.windowMonths);
    if (out.some((o) => o.id === id)) continue;
    out.push({ id, method: a.method, windowMonths: a.windowMonths, values: a.suggested, isDefault: false });
  }
  return out;
}

// Phrases anglaises du serveur → clé de traduction (le reste s'affiche tel quel).
const NOTE_KEYS: Record<string, string> = {
  'rebuilt from current subscription prices: measures mix, not price increases': 'arpuMix',
  'revenue per merchant with processing volume, dominant currency only': 'adyenArpu',
  'merchants activated per month (all statuses)': 'adyenTarget',
};
export const noteKey = (note: string): string | null => NOTE_KEYS[note] || null;

// ---------------------------------------------------------------------------- état d'un driver
export type DriverState = 'same' | 'kept' | 'available';
export const signature = (values: readonly number[]) => values.join(',');

/** same = le budget vaut déjà la suggestion ; kept = la CFO a dit « garder la mienne » pour CETTE suggestion. */
export function driverState(s: Suggestion, current: readonly number[], kept: Record<string, string>): DriverState {
  if (sameValues(current, s.suggested)) return 'same';
  return kept[s.key] === signature(s.suggested) ? 'kept' : 'available';
}

// ---------------------------------------------------------------------------- « garder la mienne »
// Mémorisé par SESSION (sessionStorage) : ne modifie rien au budget. Si la suggestion change
// (nouveau mois clos), la mémoire ne s'applique plus.
export const KEPT_STORAGE_KEY = 'finance-suggestions-kept-v1';
interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function readKept(storage: StorageLike | null): Record<string, string> {
  try {
    const raw = storage ? storage.getItem(KEPT_STORAGE_KEY) : null;
    const j = raw ? JSON.parse(raw) : {};
    if (!j || typeof j !== 'object' || Array.isArray(j)) return {};
    return Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch { return {}; }
}
export function writeKept(storage: StorageLike | null, kept: Record<string, string>) {
  try { if (storage) storage.setItem(KEPT_STORAGE_KEY, JSON.stringify(kept)); } catch { /* stockage bloqué : la mémoire reste en mémoire vive */ }
}
export function withKept(kept: Record<string, string>, s: Suggestion): Record<string, string> {
  return { ...kept, [s.key]: signature(s.suggested) };
}
export function withoutKept(kept: Record<string, string>, key: string): Record<string, string> {
  const { [key]: _drop, ...rest } = kept;
  return rest;
}

// ---------------------------------------------------------------------------- liste complète
export interface Row { s: Suggestion; current: number[]; differs: boolean; state: DriverState }

export function buildRows(list: Suggestion[], getCurrent: (key: string) => number[], kept: Record<string, string>): Row[] {
  const rows = list.map((s) => {
    const current = getCurrent(s.key);
    return { s, current, differs: !sameValues(current, s.suggested), state: driverState(s, current, kept) };
  });
  // Ce qui demande une décision d'abord, puis le reste, dans l'ordre du serveur.
  return rows.map((r, i) => ({ r, i })).sort((a, b) => Number(b.r.differs) - Number(a.r.differs) || a.i - b.i).map((x) => x.r);
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
/** Sélection « recommandée » : confiance moyenne ou haute, et valeurs différentes. Jamais la basse confiance. */
export const recommendedKeys = (rows: Row[]): string[] => rows.filter((r) => r.differs && RANK[r.s.confidence] >= 1).map((r) => r.s.key);

// ---------------------------------------------------------------------------- graphique
export interface ChartData { categories: string[]; history: (number | null)[]; suggested: (number | null)[]; current: (number | null)[] }

/** Historique (24 mois clos) puis les 12 mois de l'exercice : trois séries sur le même axe. */
export function chartData(s: Suggestion, targets: string[], chosen: number[], current: number[]): ChartData {
  const hm = s.history.months;
  const nulls = (n: number) => Array(n).fill(null) as null[];
  return {
    categories: [...hm, ...targets],
    history: [...s.history.values, ...nulls(targets.length)],
    suggested: [...nulls(hm.length), ...chosen],
    current: [...nulls(hm.length), ...current],
  };
}

// ---------------------------------------------------------------------------- erreurs
// Codes renvoyés par services/finance/suggestions.js et aiBudget.js (le banc compare avec le serveur).
export const SUGGESTION_ERRORS = ['load_failed', 'bad_window', 'bad_method'];
export const AI_ERRORS = [
  'ai_unavailable', 'rate_limited', 'ai_failed', 'ai_bad_response', 'ai_no_valid_drivers', 'no_budget', 'draft_failed',
  'packet_too_large', 'bad_status', 'bad_id', 'not_found', 'bad_keys', 'already_decided', 'save_failed', 'load_failed',
];
export const COMMON_ERRORS = ['forbidden', 'demo_blocked', 'network'];
export const REASON_CODES = [
  'billing_not_synced', 'no_history', 'insufficient_history', 'zentact_empty', 'no_closure_date', 'no_reliable_join',
  'no_source', 'not_defined', 'ledger_required',
];
export const REJECT_REASONS = ['unknown_key', 'duplicate', 'out_of_bounds', 'bad_length', 'not_finite'];

/** Clé de traduction d'une erreur : connue → son texte ; sinon le texte générique « inconnue ». */
export function errorKey(ns: 'suggestions' | 'aiBudget', code: string): string {
  const known = [...COMMON_ERRORS, ...(ns === 'aiBudget' ? AI_ERRORS : SUGGESTION_ERRORS)];
  return `finance.${ns}.errors.${known.includes(code) ? code : 'unknown'}`;
}

export const reasonKey = (code: string) => `finance.suggestions.reason.${REASON_CODES.includes(code) ? code : 'unknown'}`;
export const unavailableSorted = (list: Unavailable[]): Unavailable[] => [...list].sort((a, b) => a.reason.localeCompare(b.reason) || a.key.localeCompare(b.key));
