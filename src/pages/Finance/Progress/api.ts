// Module Finance — approbation par driver et barre de progression : appels à l'API
// (commission-tracker/services/finance/driverApprovals.js).
import { authHeaders } from '../../../lib/auth';

const API_URL = import.meta.env.VITE_API_URL || '';

export class ProgressApiError extends Error {
  constructor(public status: number, public body: any) { super(body?.error || `HTTP ${status}`); }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    method,
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j: any = null;
  try { j = await r.json(); } catch { /* corps vide */ }
  if (!r.ok) throw new ProgressApiError(r.status, j);
  return j as T;
}

/** Code d'erreur pour l'écran : 403 → `forbidden` (ou `demo_blocked`), sinon le code du serveur. */
export const errCode = (e: unknown) => {
  if (!(e instanceof ProgressApiError)) return 'network';
  if (e.status === 403) return e.body?.demo || e.body?.error === 'demo_blocked' ? 'demo_blocked' : 'forbidden';
  return e.body?.error || `http_${e.status}`;
};

// ---------------------------------------------------------------------------- types
export type LineState = 'default' | 'proposed' | 'submitted' | 'approved' | 'stale';
export type LineGroup = 'revenue' | 'cogs' | 'opex';
export interface StatusLine {
  /** `drv:<clé>` (driver) ou `opx:<clé>` (ligne OPEX). */
  key: string;
  kind: 'driver' | 'opex';
  id: string;
  group: LineGroup;
  dept: string | null;
  name: string | null;
  state: LineState;
  modified: boolean;
  values: number[];
  growth: number;
  hash: string;
  owner: string | null;
  suggestedOwner: string;
  version: number;
  submittedBy: string | null; submittedAt: string | null;
  approvedBy: string | null; approvedAt: string | null;
  updatedBy: string | null; updatedAt: string | null;
}
export interface GroupCounts { total: number; approved: number; stale: number; submitted: number; proposed: number; default: number }
export interface Summary extends GroupCounts { ownersMissing: number; groups: Record<LineGroup, GroupCounts> }
export interface StatusPayload {
  empty?: boolean;
  budget?: { id: number; status: 'draft' | 'approved'; approvedBy: string | null; approvedAt: string | null };
  locked?: boolean;
  caps?: { canEdit: boolean; canApprove: boolean };
  lines: StatusLine[];
  directory: string[];
  summary: Summary;
}
/** Réponse d'une écriture : seules les lignes modifiées reviennent, avec les nouveaux compteurs. */
export interface Mutation {
  ok: true;
  changed: string[];
  skipped: { key: string; reason: string }[];
  lines: StatusLine[];
  summary: Summary;
  directory?: string[];
}
export type Expect = Record<string, { version?: number; hash?: string }>;

export type ItemState = 'done' | 'todo' | 'warn' | 'blocked';
export interface ProgressItem {
  id: string;
  labelKey: string;
  state: ItemState;
  done: number;
  total: number;
  /** `{ code, ...paramètres }` : l'écran compose le texte (finance.progress.detail.<code>). */
  detail: ({ code: string } & Record<string, any>) | null;
  link: string | null;
  group: 'drivers' | 'inputs' | 'data' | 'budgets';
  required: boolean;
  weight: number;
}
export interface ProgressPayload {
  empty?: boolean;
  budget?: StatusPayload['budget'];
  items: ProgressItem[];
  ready: boolean;
  percent: number;
  requiredDone?: number;
  requiredTotal?: number;
  weighting?: { required: number; optional: number };
  summary?: Summary;
  caps?: { canEdit: boolean; canApprove: boolean };
  generatedAt?: string;
}

// ---------------------------------------------------------------------------- appels
const DS = '/api/finance/driver-status';
export const progressApi = {
  status: () => call<StatusPayload>('GET', DS),
  progress: () => call<ProgressPayload>('GET', '/api/finance/progress'),
  submit: (keys: string[], expect?: Expect) => call<Mutation>('POST', `${DS}/submit`, { keys, expect }),
  approve: (keys: string[], expect?: Expect) => call<Mutation>('POST', `${DS}/approve`, { keys, expect }),
  reopen: (keys: string[], reason: string, expect?: Expect) => call<Mutation>('POST', `${DS}/reopen`, { keys, reason, expect }),
  setOwner: (keys: string[], owner: string | null, expect?: Expect) => call<Mutation>('PUT', `${DS}/owner`, { keys, owner, expect }),
  confirmOwners: (keys: string[]) => call<Mutation>('POST', `${DS}/owners/confirm`, { keys }),
  addToDirectory: (name: string) => call<{ ok: true; directory: string[] }>('POST', `${DS}/directory`, { name }),
  removeFromDirectory: (name: string) => call<{ ok: true; directory: string[] }>('DELETE', `${DS}/directory/${encodeURIComponent(name)}`),
};

/** La version et le hachage que l'écran a sous les yeux : le serveur refuse (409) si l'un a bougé. */
export const expectOf = (lines: StatusLine[]): Expect => Object.fromEntries(lines.map((l) => [l.key, { version: l.version, hash: l.hash }]));
