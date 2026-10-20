// Module Finance — lot F : appels à l'API des suggestions de drivers et du brouillon IA
// (commission-tracker/services/finance/suggestions.js et aiBudget.js).
import { authHeaders as sharedAuthHeaders } from '../../../lib/auth';
import { ApiError } from '../api';

const API_URL = import.meta.env.VITE_API_URL || '';
const json = () => ({ ...sharedAuthHeaders(), 'Content-Type': 'application/json' });

export type Confidence = 'high' | 'medium' | 'low';
export type Method = 'avg' | 'trend' | 'seasonal';
export type Unit = 'count' | 'pct_per_month' | 'pct' | 'money';

export interface Alternative { method: Method; windowMonths: number; suggested: number[] }
export interface Basis {
  method: Method;
  windowMonths: number;
  sample: number[];
  unit: Unit;
  /** Pourquoi cette méthode : stable | variable | trend | seasonal | short_history | chosen. */
  why: string;
  /** Coefficient de variation des 12 derniers mois (null = indéfini). */
  cv: number | null;
  note: string;
}
export interface Suggestion {
  key: string;
  suggested: number[];
  basis: Basis;
  /** 24 derniers mois clos ; null = inconnu (avant le début de l'activité, ou donnée absente). */
  history: { months: string[]; values: (number | null)[] };
  /** Valeurs du budget au moment du calcul (le navigateur compare plutôt à son état vivant). */
  current: number[];
  confidence: Confidence;
  alternatives: Alternative[];
}
export interface Unavailable { key: string; reason: string; detail: string }
export interface SuggestionsPayload {
  empty: boolean;
  fiscalYear?: number;
  budget?: { id: number; fiscalYear: number; status: string };
  meta?: { lastClosedMonth: string; months: string[]; targets: string[]; window: number; generatedAt: string; sources: { billing: boolean; zentact: boolean } };
  suggestions: Suggestion[];
  unavailable: Unavailable[];
  caps: { canApply: boolean; canAiBudget: boolean };
}

export interface DraftDriver { key: string; values: number[]; rationale: string; confidence: Confidence; current: number[]; changed: boolean }
export interface Draft {
  id: number;
  createdAt: string;
  createdBy: string;
  model: string | null;
  lang: string | null;
  status: 'draft' | 'applied' | 'rejected';
  inputTokens: number | null;
  outputTokens: number | null;
  summary: string;
  drivers: DraftDriver[];
  rejected: { key: string | null; reason: string }[];
  warnings: { code: string }[];
  fiscalYear?: number;
  appliedKeys: string[] | null;
  decidedAt: string | null;
}
export interface AiStatus {
  available: boolean;
  limits: { perHour: number; perDay: number };
  used: { hour: number; day: number };
  remaining: number;
  model: string | null;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { method, headers: json(), body: body === undefined ? undefined : JSON.stringify(body) });
  let j: any = null;
  try { j = await r.json(); } catch { /* corps vide */ }
  if (!r.ok) throw new ApiError(r.status, j);
  return j as T;
}

export const suggestionsApi = {
  load: (window?: number) => call<SuggestionsPayload>('GET', `/api/finance/suggestions${window ? `?window=${window}` : ''}`),
  aiStatus: () => call<AiStatus>('GET', '/api/finance/ai-budget/status'),
  aiDrafts: () => call<{ drafts: Draft[] }>('GET', '/api/finance/ai-budget/drafts'),
  aiGenerate: (lang: string) => call<{ draft: Draft; remaining: number }>('POST', '/api/finance/ai-budget/draft', { lang }),
  aiMark: (id: number, status: 'applied' | 'rejected', keys?: string[]) =>
    call<{ draft: Draft }>('PATCH', `/api/finance/ai-budget/drafts/${id}`, { status, ...(keys ? { keys } : {}) }),
};

/** Code d'erreur lisible : celui du serveur, sinon http_NNN ou « network ». */
export const errCode = (e: unknown): string => {
  if (e instanceof ApiError) {
    if (e.status === 403) return e.body?.demo || e.body?.error === 'demo_blocked' ? 'demo_blocked' : 'forbidden';
    return e.body?.error || `http_${e.status}`;
  }
  return 'network';
};
