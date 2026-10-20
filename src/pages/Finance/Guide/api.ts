// Module Finance — lot H (guide) : appels à l'API (commission-tracker/services/finance/guide.js).
import { authHeaders as sharedAuthHeaders } from '../../../lib/auth';
import { ApiError } from '../api';

const API_URL = import.meta.env.VITE_API_URL || '';
const json = () => ({ ...sharedAuthHeaders(), 'Content-Type': 'application/json' });

export type NoteState = 'new' | 'asked' | 'answered';
export interface GuideNote { qid: string; note: string; state: NoteState; version: number; updatedAt: string }

export type Department = 'sales' | 'support_ops' | 'accounting' | 'rnd' | 'other';
export type MetricKey =
  | 'rule_of_40' | 'revenue_growth' | 'gross_margin' | 'ebitda_margin' | 'sm_pct' | 'rd_pct' | 'ga_pct' | 'recurring_share'
  | 'churn_annual' | 'cac_payback_months' | 'ltv_cac' | 'arpu_monthly' | 'arr_per_location' | 'nrr' | 'grr';
export type Unit = 'pct' | 'pts' | 'months' | 'ratio' | 'cad' | 'usd' | 'cad_year' | 'usd_year';

export interface Benchmark {
  id: string;
  metric: MetricKey;
  labelEn: string;
  labelFr: string;
  value: number | null;
  unit: Unit;
  direction: 'higher_better' | 'lower_better';
  kind: 'public' | 'reference' | 'internal';
  useForFlags: boolean;
  sourceOrg: string | null;
  sourceUrl: string | null;
  sourceYear: number | null;
  sourceDate: string | null;
  note: string | null;
  origin: 'shipped' | 'cfo';
  edited: boolean;
  enteredBy: string | null;
  version: number;
  updatedAt: string;
}
export interface BenchmarkInput {
  metric: MetricKey; labelEn: string; labelFr: string; value: number | null; unit: Unit; direction: 'higher_better' | 'lower_better';
  kind: 'public' | 'reference' | 'internal'; useForFlags: boolean; sourceOrg: string | null; sourceUrl: string | null;
  sourceYear: number | null; sourceDate: string | null; note: string | null;
}
export interface BenchmarksPayload { benchmarks: Benchmark[]; metrics: Record<string, { unit: Unit; model: boolean; actual: boolean }>; units: Unit[]; shippedVersion: string; caps: { canEdit: boolean } }

export interface Levers {
  growth: number | null; margin: number | null; score: number | null; gap: number | null; passes: boolean | null;
  onePtGrowthRevenue: number | null; onePtMarginOpex: number | null; shortfall: number; extraRevenueNeeded: number | null;
  costCutNeeded: number | null; costCutPctOfOpex: number | null;
}
export interface ActualMetrics {
  from: string; to: string; revenue: number; cogs: number; opex: number; ebitda: number; priorRevenue: number | null;
  growthPct: number | null; ebitdaMarginPct: number | null; grossMarginPct: number | null; rule40: number | null; gap: number | null;
  levers: Levers; note: string;
}
export interface Lead {
  id: string; rank: number; type: 'vs_avg' | 'vs_last_year'; accountKey: string; accountName: string; section: string; kind: 'cogs' | 'opex';
  month: string; amount: number; baseline: number; deltaAbs: number; deltaPct: number | null;
  owner: string | null; department: Department | null; assigned: boolean;
}
export interface AccountRow {
  accountKey: string; accountName: string; section: string; kind: 'cogs' | 'opex'; windowTotal: number; lastAmount: number; sharePct: number | null;
  owner: string | null; department: Department | null; budgetLine: string | null; assigned: boolean; windowMonths?: number;
}
export interface SavingsPayload {
  hasActuals: boolean;
  latestMonth: string | null;
  monthsAvailable: number;
  params: { minPct: number; minAbs: number; avgWindow: number; topN: number; maxLeads: number };
  metrics: ActualMetrics | null;
  metricsReason: string | null;
  leads: Lead[];
  topAccounts: AccountRow[];
  unassigned: AccountRow[];
  accounts: AccountRow[];
  budgetLines: Record<string, Record<string, number>>;
  classification: Record<string, number>;
  unknownSections: string[];
  books: { state: string; lastOkAt: string | null; error: string | null };
  knownOwners: string[];
  departments: Department[];
  caps: { canEdit: boolean };
}
export interface Assignment { accountKey: string; owner: string; department: Department; budgetLine?: string | null }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { method, headers: json(), body: body === undefined ? undefined : JSON.stringify(body) });
  let j: any = null;
  try { j = await r.json(); } catch { /* corps vide */ }
  if (!r.ok) throw new ApiError(r.status, j);
  return j as T;
}

export const errCode = (e: unknown) => (e instanceof ApiError ? (e.status === 403 && e.body?.demo ? 'demo' : e.status === 403 ? 'forbidden' : e.body?.error || `http_${e.status}`) : 'network');

export const guideApi = {
  notes: () => call<{ notes: GuideNote[] }>('GET', '/api/finance/guide/notes'),
  saveNote: (qid: string, note: string, state: NoteState, version: number) =>
    call<{ version: number }>('PUT', `/api/finance/guide/notes/${encodeURIComponent(qid)}`, { note, state, version }),
  savings: () => call<SavingsPayload>('GET', '/api/finance/guide/savings'),
  assign: (assignments: Assignment[], clear: string[] = []) => call<{ assigned: number; cleared: number }>('PUT', '/api/finance/guide/accounts/owners', { assignments, clear }),
  benchmarks: () => call<BenchmarksPayload>('GET', '/api/finance/guide/benchmarks'),
  createBenchmark: (b: BenchmarkInput) => call<{ benchmark: Benchmark }>('POST', '/api/finance/guide/benchmarks', b),
  saveBenchmark: (id: string, b: BenchmarkInput, version: number) => call<{ benchmark: Benchmark }>('PUT', `/api/finance/guide/benchmarks/${encodeURIComponent(id)}`, { ...b, version }),
  deleteBenchmark: (id: string) => call<{ ok: true }>('DELETE', `/api/finance/guide/benchmarks/${encodeURIComponent(id)}`),
  resetBenchmark: (id: string) => call<{ benchmark: Benchmark }>('POST', `/api/finance/guide/benchmarks/${encodeURIComponent(id)}/reset`),
};
