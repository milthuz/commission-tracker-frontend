// Module Finance, lot A — appels à l'API des budgets d'entité et départementaux
// (commission-tracker/services/finance/entityBudgets.js). Approuver / déverrouiller : routes de la
// phase 1, sur la ligne `finance_budgets` de l'entité.
import { authHeaders } from '../../../lib/auth';
import { ApiError, type BudgetInfo } from '../api';
import type { DeptReference, EntityReference, Overrides } from './entityModel';

const API_URL = import.meta.env.VITE_API_URL || '';

export type EntityKey = 'cluster' | 'xperio';
export interface EntityBudgetInfo extends BudgetInfo { importedAt?: string; importedBy?: string | null }
export interface EntityCaps { canEdit: boolean; canImport: boolean; canApprove: boolean }
export interface DriversState { data: { ov: Overrides }; version: number; updatedBy?: string; updatedAt?: string }
export interface EntityPayload {
  empty?: boolean;
  budget: EntityBudgetInfo;
  reference: EntityReference;
  state: { drivers: DriversState | null };
  caps: EntityCaps;
  applied?: { action: string; kept: number; dropped: { id: string; gl: string }[] };
}
export interface DeptPayload {
  empty?: boolean;
  budget: EntityBudgetInfo;
  reference: DeptReference;
  caps: { canImport: boolean };
  applied?: { action: string };
}
export interface ImportMessage { code: string; [k: string]: unknown }
export interface Totals { revenue: number; cogs: number; grossProfit: number; opex: number; ebitda: number; netIncome: number }
export interface EntityPreview {
  token: string;
  base: string | null;
  exists: boolean;
  file: string | null;
  lines: { name: string; fyBefore: number | null; fyAfter: number }[];
  drivers: { count: number; added: { id: string; gl: string; cat: string }[]; removed: { id: string; gl: string; cat: string }[]; changed: number };
  totals: { before: { fy: Totals; t16: Totals } | null; after: { fy: Totals; t16: Totals } };
  overrides: { kept: number; dropped: { id: string; gl: string }[] };
  warnings: ImportMessage[];
  checks: { check: string; status: string }[] | null;
  gaps: { line: string; lineTotal: number; driversTotal: number; gap: number }[];
}
export interface DeptPreview {
  token: string;
  base: string | null;
  exists: boolean;
  file: string | null;
  depts: { key: string; rows: number; changed: number; removed: number }[];
  leaders: { key: string; name: string; fyBefore: number | null; fyAfter: number | null; t16Before: number | null; t16After: number | null }[];
  warnings: ImportMessage[];
}

async function parse<T>(r: Response): Promise<T> {
  let j: any = null;
  try { j = await r.json(); } catch { /* corps vide */ }
  if (!r.ok) throw new ApiError(r.status, j);
  return j as T;
}
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    method, headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(r);
}
// Téléversement : pas de Content-Type, le navigateur pose la frontière multipart.
async function send<T>(path: string, file: File, fields: Record<string, string | null> = {}): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.append(k, v);
  const r = await fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders(), body: fd });
  return parse<T>(r);
}
async function download(path: string, fallbackName: string) {
  const r = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!r.ok) { let j: any = null; try { j = await r.json(); } catch { /* */ } throw new ApiError(r.status, j); }
  const blob = await r.blob();
  const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const entityApi = {
  load: (ent: EntityKey) => call<EntityPayload>('GET', `/api/finance/entity/${ent}`),
  saveDrivers: (id: number, ov: Overrides, version: number) => call<{ version: number }>('PUT', `/api/finance/entity/budgets/${id}/drivers`, { data: { ov }, version }),
  preview: (ent: EntityKey, file: File) => send<{ preview: EntityPreview }>(`/api/finance/entity/${ent}/import`, file),
  confirm: (ent: EntityKey, file: File, p: EntityPreview) => send<EntityPayload>(`/api/finance/entity/${ent}/import`, file, { confirm: p.token, base: p.base }),
  template: (ent: EntityKey) => download(`/api/finance/entity/${ent}/template`, `${ent}-budget.xlsx`),
  approve: (id: number) => call<{ budget: EntityBudgetInfo }>('POST', `/api/finance/budgets/${id}/approve`),
  unlock: (id: number) => call<{ budget: EntityBudgetInfo }>('POST', `/api/finance/budgets/${id}/unlock`),
};

export const deptApi = {
  load: () => call<DeptPayload>('GET', '/api/finance/dept'),
  preview: (file: File) => send<{ preview: DeptPreview }>('/api/finance/dept/import', file),
  confirm: (file: File, p: DeptPreview) => send<DeptPayload>('/api/finance/dept/import', file, { confirm: p.token, base: p.base }),
  template: () => download('/api/finance/dept/template', 'department-budgets.xlsx'),
};

export const errCode = (e: unknown) => (e instanceof ApiError ? e.body?.error || `http_${e.status}` : 'network');
// Chargement d'une page : 403 = pas la permission (ou mode démo), comme la phase 1.
export const loadErrCode = (e: unknown) => (e instanceof ApiError && e.status === 403 ? (e.body?.demo ? 'demo' : 'forbidden') : errCode(e));
