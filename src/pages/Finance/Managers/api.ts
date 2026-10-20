// Module Finance — gestionnaires : appels à l'API (commission-tracker/services/finance/managers.js).
import { authHeaders } from '../../../lib/auth';

const API_URL = import.meta.env.VITE_API_URL || '';

export class ManagersApiError extends Error {
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
  if (!r.ok) throw new ManagersApiError(r.status, j);
  return j as T;
}

async function upload<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders(), body: fd });
  let j: any = null;
  try { j = await r.json(); } catch { /* corps vide */ }
  if (!r.ok) throw new ManagersApiError(r.status, j);
  return j as T;
}

/** Téléchargement d'un fichier servi par l'API (modèle, export) avec l'en-tête d'authentification. */
export async function downloadFile(path: string, filename: string) {
  const r = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!r.ok) { let j: any = null; try { j = await r.json(); } catch { /* */ } throw new ManagersApiError(r.status, j); }
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const errCode = (e: unknown) => (e instanceof ManagersApiError ? e.body?.error || `http_${e.status}` : 'network');

// ---------------------------------------------------------------------------- types
export type Role = 'deferred' | 'revenue' | 'amortExpense' | 'accumAmort' | 'writeOffLoss' | 'terminalAsset';
export interface JournalLine { side: 'debit' | 'credit'; code: string; role: Role; amount: number; books: { accountId: string; accountName: string } | null }
export interface JournalPost {
  id: number; module: string; period: string; kind: string; hash: string; total: number; reference: string | null;
  status: 'posting' | 'posted' | 'failed' | 'voided'; booksJournalId: string | null; booksEntryNumber: string | null;
  attempts: number; postedBy: string | null; postedAt: string | null; error: string | null;
  voidedBy: string | null; voidedAt: string | null; voidReason: string | null; createdAt: string; updatedAt: string;
}
export interface Journal {
  module: 'deferred' | 'amortization'; kind: 'recognition' | 'amortization' | 'writeoff'; period: string; date: string;
  lines: JournalLine[]; debit: number; credit: number; balanced: boolean; missingAccounts: Role[]; hash: string;
  unknownTypes?: string[]; lots?: string[]; mode?: 'derecognize' | 'accelerate';
  unmapped: string[]; post: JournalPost | null; changedSincePost: boolean; history: JournalPost[];
}
export interface Caps { canEdit: boolean; canPost: boolean }
export interface Versioned<T> { data: T; version: number; updatedBy: string | null; updatedAt: string | null }

export interface ContractType { key: string; labelEn: string; labelFr: string; account: string }
export interface DeferredSettings { deferredAccount: string; types: ContractType[] }
export type ContractStatus = 'recognizing' | 'upcoming' | 'complete' | 'closed' | 'notBilled';
export interface Contract {
  id: number; ref: string; customer: string; type: string; total: number; startMonth: string; termMonths: number;
  billedDate: string | null; receivedDate: string | null; closedMonth: string | null; closeTreatment: 'release' | 'cancel' | null;
  closeReason: string | null; notes: string | null; source: string; version: number; updatedBy: string | null; updatedAt: string;
  calc: { status: ContractStatus; recognizedToDate: number; remaining: number; thisMonth: number; monthly: number; endMonth: string; inBook: boolean };
}
export interface DeferredPayload {
  currentMonth: string; month: string; range: { first: string; last: string };
  settings: Versioned<DeferredSettings>;
  contracts: Contract[];
  summary: {
    month: string; recognized: number; recognizedByType: Record<string, number>; balance: number; openContracts: number;
    newDeferrals: number; newCount: number; next12: number; beyond12: number; waterfall: { month: string; amount: number }[];
  };
  journal: Journal;
  caps: Caps;
}

export interface AmortSettings { expenseAccount: string; accumAccount: string; assetAccount: string; lossAccount: string; writeOffMode: 'derecognize' | 'accelerate'; defaultLife: number }
export type LotStatus = 'amortizing' | 'notInService' | 'fullyAmortized' | 'writtenOff';
export interface Lot {
  id: number; ref: string; description: string; quantity: number; unitCost: number; inServiceMonth: string; usefulLife: number;
  salvage: number; writtenOffMonth: string | null; writeOffReason: string | null; notes: string | null; source: string; version: number;
  updatedBy: string | null; updatedAt: string;
  calc: { status: LotStatus; cost: number; accumulated: number; nbv: number; thisMonth: number; monthly: number; endMonth: string; writeOffAmount: number | null };
}
export interface AmortPayload {
  currentMonth: string; month: string; range: { first: string; last: string };
  settings: Versioned<AmortSettings>;
  lots: Lot[];
  summary: {
    month: string; cost: number; accumulated: number; nbv: number; nbvPct: number | null; monthly: number; unitsDeployed: number;
    lots: number; notInService: number; writtenOff: number; projection: { month: string; nbv: number }[];
  };
  journal: Journal;
  writeOffJournal: Journal;
  caps: Caps;
}

export interface ImportRow { line: number; body: Record<string, any>; errors: string[]; warnings: string[] }
export interface ImportPreview { sheet: string; rows: ImportRow[]; valid: number; invalid: number }

export interface BooksAccount { id: string; code: string; name: string; type: string; active: boolean }
export interface AccountsPayload {
  accounts: BooksAccount[] | null; fetchedAt: string | null;
  map: Record<string, { accountId: string; accountName: string; accountCode: string; confirmedBy: string; confirmedAt: string }>;
  version: number;
  needed: { code: string; uses: { module: 'deferred' | 'amortization'; role: Role; label: { en: string; fr: string } | null }[] }[];
  suggestions: Record<string, string>;
  caps: { canEdit: boolean };
}

// ---------------------------------------------------------------------------- appels
const D = '/api/finance/deferred';
const A = '/api/finance/amortization';
const q = (month?: string) => (month ? `?month=${encodeURIComponent(month)}` : '');

export const deferredApi = {
  load: (month?: string) => call<DeferredPayload>('GET', `${D}${q(month)}`),
  add: (b: Record<string, unknown>) => call<{ contract: Contract }>('POST', `${D}/contracts`, b),
  edit: (id: number, b: Record<string, unknown>) => call<{ contract: Contract }>('PATCH', `${D}/contracts/${id}`, b),
  close: (id: number, b: { month: string; treatment: 'release' | 'cancel'; reason: string; version: number }) => call<{ contract: Contract }>('POST', `${D}/contracts/${id}/close`, b),
  reopen: (id: number, version: number) => call<{ contract: Contract }>('POST', `${D}/contracts/${id}/reopen`, { version }),
  remove: (id: number, version: number) => call<{ ok: true }>('DELETE', `${D}/contracts/${id}?version=${version}`),
  saveSettings: (data: DeferredSettings, version: number) => call<{ settings: Versioned<DeferredSettings> }>('PUT', `${D}/settings`, { data, version }),
  importPreview: (file: File) => upload<ImportPreview>(`${D}/import/preview`, file),
  importConfirm: (rows: Record<string, unknown>[]) => call<{ imported: number }>('POST', `${D}/import/confirm`, { rows }),
  template: () => downloadFile(`${D}/template`, 'deferred-revenue-template.xlsx'),
  exportXlsx: (month: string) => downloadFile(`${D}/export${q(month)}`, `deferred-revenue-${month}.xlsx`),
  post: (month: string, hash: string) => call<{ post: JournalPost }>('POST', `${D}/je/post`, { month, hash }),
};

export const amortApi = {
  load: (month?: string) => call<AmortPayload>('GET', `${A}${q(month)}`),
  add: (b: Record<string, unknown>) => call<{ lot: Lot }>('POST', `${A}/lots`, b),
  edit: (id: number, b: Record<string, unknown>) => call<{ lot: Lot }>('PATCH', `${A}/lots/${id}`, b),
  writeOff: (id: number, b: { month: string; reason: string; version: number }) => call<{ lot: Lot }>('POST', `${A}/lots/${id}/write-off`, b),
  restore: (id: number, version: number) => call<{ lot: Lot }>('POST', `${A}/lots/${id}/restore`, { version }),
  remove: (id: number, version: number) => call<{ ok: true }>('DELETE', `${A}/lots/${id}?version=${version}`),
  saveSettings: (data: AmortSettings, version: number) => call<{ settings: Versioned<AmortSettings> }>('PUT', `${A}/settings`, { data, version }),
  importPreview: (file: File) => upload<ImportPreview>(`${A}/import/preview`, file),
  importConfirm: (rows: Record<string, unknown>[]) => call<{ imported: number }>('POST', `${A}/import/confirm`, { rows }),
  template: () => downloadFile(`${A}/template`, 'terminal-lots-template.xlsx'),
  exportXlsx: (month: string) => downloadFile(`${A}/export${q(month)}`, `terminal-lots-${month}.xlsx`),
  post: (month: string, kind: 'amortization' | 'writeoff', hash: string) => call<{ post: JournalPost }>('POST', `${A}/je/post`, { month, kind, hash }),
};

export const journalApi = {
  void: (id: number, reason: string) => call<{ post: JournalPost }>('POST', `/api/finance/je/posts/${id}/void`, { reason }),
  accounts: () => call<AccountsPayload>('GET', '/api/finance/je/accounts'),
  refreshAccounts: () => call<AccountsPayload>('POST', '/api/finance/je/accounts/refresh'),
  saveMap: (map: Record<string, string | null>, version: number) => call<AccountsPayload>('PUT', '/api/finance/je/accounts/map', { map, version }),
};
