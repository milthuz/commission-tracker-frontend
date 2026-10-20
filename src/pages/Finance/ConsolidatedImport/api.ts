// Import Excel du budget consolidé — appels à l'API (commission-tracker/services/finance/consolidatedImport.js).
// 1. aperçu (le serveur lit, valide, compare ; il n'écrit RIEN) ; 2. confirmation avec le jeton.
import { authHeaders as sharedAuthHeaders } from '../../../lib/auth';
import { ApiError } from '../api';

const API_URL = import.meta.env.VITE_API_URL || '';

export interface Msg { sheet: string | null; row: number; code: string; value?: string }
export interface Change { field: 'salary' | 'alloc' | 'map' | 'dept' | 'amt' | 'rate' | 'hours' | 'svc'; before: string | number | null; after: string | number | null }
export interface EmpRow { ent: string; dept: string; name: string; salary: number; alloc: number; map: string }
export interface ConRow { co: string; name: string; svc: string; rate: number; hours: number; amt: number; map: string; dept: string }
export interface Side<R> {
  compared: boolean;
  added: R[];
  changed: (R & { id: number; changes: Change[] })[];
  missing: (R & { id: number })[];
  unchanged: number;
}
export interface PayTotals { headcount: number; contractorCount: number; payroll: number; contractors: number; total: number }
export interface RosterPreview {
  token: string | null;
  base: string;
  canConfirm: boolean;
  file: string | null;
  sheets: { employees?: string; contractors?: string };
  employees: Side<EmpRow>;
  contractors: Side<ConRow>;
  totals: { before: PayTotals; after: PayTotals; afterRemoveMissing: PayTotals };
  errors: Msg[];
  warnings: Msg[];
}
export interface RosterApplied { applied: { employees: { added: number; changed: number; removed: number }; contractors: { added: number; changed: number; removed: number } }; totals: PayTotals }

export type Fy3 = [number, number, number];
export interface OpexLine { key: string; name: string; section: string; special: 'payroll' | 'travel' | null; months: number; fy: { before: number; after: number }[] }
export interface OpexPreview {
  token: string | null;
  base: string;
  canConfirm: boolean;
  file: string | null;
  sheet: string | null;
  changed: OpexLine[];
  unchanged: number;
  unmatched: { section: string | null; name: string; row: number; fy: Fy3; duplicate?: boolean }[];
  notInFile: { key: string; name: string; section: string }[];
  totals: { before: Fy3; after: Fy3; fy27Editable: { before: number; after: number } };
  errors: Msg[];
  warnings: Msg[];
}
export interface OpexApplied { applied: { lines: number } }

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, init);
  let j: any = null;
  try { j = await r.json(); } catch { /* corps vide */ }
  if (!r.ok) throw new ApiError(r.status, j);
  return j as T;
}
const upload = <T,>(path: string, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return send<T>(path, { method: 'POST', headers: sharedAuthHeaders(), body: fd });
};
const post = <T,>(path: string, body: unknown) =>
  send<T>(path, { method: 'POST', headers: { ...sharedAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function download(path: string, fallbackName: string) {
  const r = await fetch(`${API_URL}${path}`, { headers: sharedAuthHeaders() });
  if (!r.ok) { let j: any = null; try { j = await r.json(); } catch { /* */ } throw new ApiError(r.status, j); }
  const blob = await r.blob();
  const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const RP = '/api/finance/consolidated/roster';
const OP = '/api/finance/consolidated/opex';

export const consolidatedApi = {
  rosterPreview: (file: File) => upload<{ preview: RosterPreview }>(`${RP}/preview`, file),
  rosterConfirm: (p: RosterPreview, removeMissing: boolean) => post<RosterApplied>(`${RP}/confirm`, { token: p.token, base: p.base, removeMissing }),
  rosterTemplate: (lang: string) => download(`${RP}/template?lang=${lang.startsWith('fr') ? 'fr' : 'en'}`, 'salary-contractors-FY2027.xlsx'),
  opexPreview: (file: File) => upload<{ preview: OpexPreview }>(`${OP}/preview`, file),
  opexConfirm: (p: OpexPreview) => post<OpexApplied>(`${OP}/confirm`, { token: p.token, base: p.base }),
  opexTemplate: () => download(`${OP}/template`, 'opex-FY2027.xlsx'),
};

// Code d'erreur lisible (traduit sous finance.consolidatedImport.error.*).
export const errCode = (e: unknown) => {
  if (!(e instanceof ApiError)) return 'network';
  const c = e.body?.error;
  if (e.body?.demo || c === 'demo_blocked') return 'demo_blocked';
  if (e.status === 403 && c !== 'token_forbidden') return 'forbidden';
  return c || `http_${e.status}`;
};
