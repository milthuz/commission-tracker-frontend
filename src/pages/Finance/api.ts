// Module Finance — appels à l'API (commission-tracker/services/finance/routes.js).
import { authHeaders as sharedAuthHeaders } from '../../lib/auth';
import type { Contractor, Employee, PayrollAgg, PayrollGlobals, Reference, Roster } from './model';

const API_URL = import.meta.env.VITE_API_URL || '';
const headers = () => ({ ...sharedAuthHeaders(), 'Content-Type': 'application/json' });

export type Section = 'drivers' | 'opex' | 'trips' | 'payroll';
export interface StateEntry<T = any> { data: T; version: number; updatedBy?: string; updatedAt?: string }
export interface BudgetInfo { id: number; fiscalYear: number; entity: string; status: 'draft' | 'approved'; approvedBy: string | null; approvedAt: string | null; updatedAt: string }
export interface Caps { canEdit: boolean; canPayroll: boolean; canApprove: boolean }
export interface BudgetPayload {
  empty?: boolean;
  budget: BudgetInfo;
  reference: Reference;
  state: Partial<Record<Section, StateEntry>>;
  payrollGlobals: PayrollGlobals;
  payroll: PayrollAgg;
  roster?: Roster;
  caps: Caps;
}

export class ApiError extends Error {
  constructor(public status: number, public body: any) { super(body?.error || `HTTP ${status}`); }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  let j: any = null;
  try { j = await r.json(); } catch { /* corps vide */ }
  if (!r.ok) throw new ApiError(r.status, j);
  return j as T;
}

export const financeApi = {
  load: (fy = 2027) => call<BudgetPayload>('GET', `/api/finance/budget?fy=${fy}`),
  saveState: (id: number, section: Section, data: unknown, version: number) =>
    call<{ version: number }>('PUT', `/api/finance/budgets/${id}/state/${section}`, { data, version }),
  addEmployee: (id: number, e: Partial<Employee>) => call<{ employee: Employee }>('POST', `/api/finance/budgets/${id}/employees`, e),
  editEmployee: (id: number, eid: number, patch: Partial<Employee>) => call<{ employee: Employee }>('PATCH', `/api/finance/budgets/${id}/employees/${eid}`, patch),
  removeEmployee: (id: number, eid: number) => call<{ ok: true }>('DELETE', `/api/finance/budgets/${id}/employees/${eid}`),
  addContractor: (id: number, c: Partial<Contractor>) => call<{ contractor: Contractor }>('POST', `/api/finance/budgets/${id}/contractors`, c),
  editContractor: (id: number, cid: number, patch: Partial<Contractor>) => call<{ contractor: Contractor }>('PATCH', `/api/finance/budgets/${id}/contractors/${cid}`, patch),
  removeContractor: (id: number, cid: number) => call<{ ok: true }>('DELETE', `/api/finance/budgets/${id}/contractors/${cid}`),
  resetPayroll: (id: number) => call<{ roster: Roster; payrollGlobals: PayrollGlobals; version: number }>('POST', `/api/finance/budgets/${id}/payroll/reset`),
  approve: (id: number) => call<{ budget: BudgetInfo }>('POST', `/api/finance/budgets/${id}/approve`),
  unlock: (id: number) => call<{ budget: BudgetInfo }>('POST', `/api/finance/budgets/${id}/unlock`),
};
