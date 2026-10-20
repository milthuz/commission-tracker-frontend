// Module Finance — lot C : appels à l'API (commission-tracker/services/finance/forecasts.js).
import { authHeaders } from '../../../lib/auth';
import { ApiError } from '../api';
import type { Adjustment, Assumptions, CashCat, InvCalc, InvDoc, PayActual, PayField, Person, SalesActuals, SalesCells } from './engine';

const API_URL = import.meta.env.VITE_API_URL || '';
const BASE = '/api/finance/forecasts';

export interface Doc<T> { data: T; version: number; updatedBy: string | null; updatedAt: string | null }
export interface Caps { canEdit: boolean; canPayroll: boolean; canEditPayroll: boolean }
export interface Today { ym: string; day: number; date: string }

export interface SalesPayload { year: number; today: Today; actual: SalesActuals; prior: SalesActuals; doc: Doc<{ cells: SalesCells }>; caps: Caps }
export interface PaymentsDoc { assumptions: Partial<Assumptions>; overrides: Record<string, Partial<Record<PayField, number>>>; convTeamIds: number[] | null; compareVersionId: number | null }
export interface VersionInfo { id: number; label: string; createdBy: string; createdAt: string }
export interface PaymentsPayload {
  year: number; today: Today;
  actual: { source: string; months: PayActual[]; lastActual: string | null };
  seed: PayActual[] | null;
  doc: Doc<PaymentsDoc>;
  teams: { id: number; name: string; auto: boolean }[];
  versions: (VersionInfo & { data: { series: Record<string, Partial<Record<PayField, number>>>; assumptions: Partial<Assumptions> } })[];
  caps: Caps;
}
export interface CashDoc {
  startDate: string;
  opening: { mode: 'manual' | 'books'; amount: number | null; accountIds?: string[]; at?: string | null };
  reserve: number;
  lines: Partial<Record<CashCat, (number | null)[]>>;
  scenarios: { down: Adjustment[]; up: Adjustment[] };
}
export interface CashPayload { today: Today; doc: Doc<CashDoc>; defaultReserve: number; caps: Caps }
export interface BankAccounts { status: 'ok' | 'reconnect' | 'unavailable' | 'error'; fetchedAt?: string; accounts?: { id: string; name: string; bank: string; type: string; currency: string; balance: number }[] }
export type Program = 'v2' | 'payments';
export interface InvestmentPayload { program: Program; today: Today; doc: Doc<InvDoc>; computed: InvCalc; people?: Doc<{ people: Person[] }>; caps: Caps }
export type ImportKind = 'sales' | 'payments' | 'cash' | 'investment';
export interface ImportPreview { importId: number; kind: ImportKind; fileName: string; summary: any }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { method, headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j: any = null;
  try { j = await r.json(); } catch { /* corps vide */ }
  if (!r.ok) throw new ApiError(r.status, j);
  return j as T;
}

export const fcApi = {
  sales: (year: number) => call<SalesPayload>('GET', `${BASE}/sales?year=${year}`),
  payments: (year: number) => call<PaymentsPayload>('GET', `${BASE}/payments?year=${year}`),
  cash: () => call<CashPayload>('GET', `${BASE}/cash`),
  bankAccounts: () => call<BankAccounts>('GET', `${BASE}/cash/bank-accounts`),
  investment: (program: Program) => call<InvestmentPayload>('GET', `${BASE}/investment?program=${program}`),
  saveDoc: <T>(key: string, data: T, version: number) => call<{ version: number; data: T }>('PUT', `${BASE}/docs/${encodeURIComponent(key)}`, { data, version }),
  saveVersion: (label: string, series: Record<string, Partial<Record<PayField, number>>>, assumptions: Partial<Assumptions>) =>
    call<{ version: VersionInfo }>('POST', `${BASE}/payments/versions`, { label, series, assumptions }),
  async preview(kind: ImportKind, file: File): Promise<ImportPreview> {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`${API_URL}${BASE}/import/${kind}/preview`, { method: 'POST', headers: authHeaders(), body: fd });
    let j: any = null;
    try { j = await r.json(); } catch { /* */ }
    if (!r.ok) throw new ApiError(r.status, j);
    return j as ImportPreview;
  },
  confirm: (id: number, versions: Record<string, number>) => call<{ ok: true; versions: Record<string, number> }>('POST', `${BASE}/import/${id}/confirm`, { versions }),
  async template(kind: ImportKind, query = ''): Promise<void> {
    const r = await fetch(`${API_URL}${BASE}/template/${kind}${query}`, { headers: authHeaders() });
    if (!r.ok) { let j: any = null; try { j = await r.json(); } catch { /* */ } throw new ApiError(r.status, j); }
    const blob = await r.blob();
    const cd = r.headers.get('content-disposition') || '';
    const name = /filename="([^"]+)"/.exec(cd)?.[1] || `${kind}.xlsx`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

export const errCode = (e: unknown) => (e instanceof ApiError ? (e.status === 403 ? (e.body?.demo ? 'demo' : 'forbidden') : e.body?.error || `http_${e.status}`) : 'network');
