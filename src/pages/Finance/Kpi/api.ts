// Module Finance — onglet KPI : appels à l'API (commission-tracker/services/finance/kpi.js).
import { authHeaders as sharedAuthHeaders } from '../../../lib/auth';
import { ApiError } from '../api';
import type { KpiData, KpiKey, Saved } from './kpiModel';

const API_URL = import.meta.env.VITE_API_URL || '';
const json = () => ({ ...sharedAuthHeaders(), 'Content-Type': 'application/json' });

export type GlLine = 'recurringRevenue' | 'sellingExpense' | 'subscriptionRevenue' | 'adyenIncome';
export interface MappingItem { key: string; sign?: 1 | -1 }
export interface KpiSettings {
  canadaOrgIds: string[];
  usaOrgIds: string[];
  cooReasons: string[];
  resellerAliases: string[];
  useResellersTable: boolean;
  opening: { month: string; value: number } | null;
  glMapping: Record<GlLine, MappingItem[]>;
  version: number;
  updatedBy?: string | null;
  updatedAt?: string | null;
}
export interface SourceStatus { source: string; state: 'ok' | 'error' | 'reconnect' | 'busy' | 'warning'; lastTryAt: string | null; lastOkAt: string | null; error: string | null; detail: any }
export interface KpiPayload extends KpiData {
  defaultEnd: string;
  currentMonth: string;
  settings: KpiSettings;
  orgs: { id: string; name: string }[];
  sources: SourceStatus[];
  syncing: boolean;
  caps: { canEdit: boolean; canSync: boolean };
}
export interface DetailRow { org: string; sub: string; customer: string; plan: string; monthly: number; date: string; reseller?: string | null; reason?: string | null; coo?: boolean; cooOf?: string; dateSrc?: string }
export interface Account { key: string; name: string; section: string; isGroup: boolean; months: number; lastAmount: number | null; suggest: GlLine[] }
export interface ImportPreview { sheet: string; months: string[]; cells: { month: string; key: KpiKey; value: number; old: number | null }[]; unchanged: number; errors: { row: number; month?: string; error: string; value?: string }[] }
export interface BudgetCell { month: string; key: KpiKey; value: number | null; version?: number }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { method, headers: json(), body: body === undefined ? undefined : JSON.stringify(body) });
  let j: any = null;
  try { j = await r.json(); } catch { /* corps vide */ }
  if (!r.ok) throw new ApiError(r.status, j);
  return j as T;
}

function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const kpiApi = {
  load: (end?: string) => call<KpiPayload>('GET', `/api/finance/kpi${end ? `?end=${encodeURIComponent(end)}` : ''}`),
  detail: (month: string) => call<{ month: string; detail: { activations: DetailRow[]; cancellations: DetailRow[]; usaChurn: DetailRow[] } }>('GET', `/api/finance/kpi/detail?month=${encodeURIComponent(month)}`),
  saveBudget: (cells: BudgetCell[], mode?: 'import') => call<{ saved: { month: string; key: KpiKey; version: number }[] }>('PUT', '/api/finance/kpi/budget', { cells, ...(mode ? { mode } : {}) }),
  saveActual: (month: string, key: KpiKey, value: number | null, note: string | null, version: number) =>
    call<{ version: number; kind: string }>('PUT', '/api/finance/kpi/actual', { month, key, value, note, version }),
  settings: () => call<{ settings: KpiSettings; orgs: { id: string; name: string }[] }>('GET', '/api/finance/kpi/settings'),
  saveSettings: (data: Omit<KpiSettings, 'version'>, version: number) => call<{ version: number }>('PUT', '/api/finance/kpi/settings', { data, version }),
  accounts: () => call<{ accounts: Account[]; lines: GlLine[] }>('GET', '/api/finance/kpi/accounts'),
  sync: () => call<{ started: true }>('POST', '/api/finance/kpi/sync'),
  status: () => call<{ syncing: boolean; sources: SourceStatus[] }>('GET', '/api/finance/kpi/status'),
  async template(end: string, lang: string) {
    const r = await fetch(`${API_URL}/api/finance/kpi/budget/template?end=${encodeURIComponent(end)}&lang=${encodeURIComponent(lang)}`, { headers: sharedAuthHeaders() });
    if (!r.ok) throw new ApiError(r.status, await r.json().catch(() => null));
    saveBlob(await r.blob(), `kpi-budget-${end}.xlsx`);
  },
  async importPreview(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`${API_URL}/api/finance/kpi/budget/import`, { method: 'POST', headers: sharedAuthHeaders(), body: fd });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new ApiError(r.status, j);
    return j as ImportPreview;
  },
  async exportXlsx(filename: string, rows: (string | number | null)[][]) {
    const r = await fetch(`${API_URL}/api/finance/kpi/export`, { method: 'POST', headers: json(), body: JSON.stringify({ filename, rows }) });
    if (!r.ok) throw new ApiError(r.status, await r.json().catch(() => null));
    saveBlob(await r.blob(), filename);
  },
};

export type { Saved };
