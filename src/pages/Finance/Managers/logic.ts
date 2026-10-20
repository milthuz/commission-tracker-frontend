// Module Finance — gestionnaires : petites fonctions PURES du navigateur (mois, saisie des
// fenêtres). Les calculs comptables restent sur le serveur (services/finance/managersEngine.js) :
// le navigateur affiche ce que le serveur renvoie et ne recalcule aucun montant d'écriture.
// Testé par scripts/test-finance-managers.cjs.

export const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** 'AAAA-MM' → index de mois ; null si illisible. */
export function ym(s: string | null | undefined): number | null {
  const m = MONTH_RE.exec(String(s || ''));
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
}
export function mStr(i: number): string {
  const y = Math.floor(i / 12);
  return `${y}-${String(i - y * 12 + 1).padStart(2, '0')}`;
}
export const addMonths = (s: string, k: number) => { const i = ym(s); return i == null ? s : mStr(i + k); };

/** Mois de `first` à `last` inclus, du plus récent au plus ancien (menu du sélecteur). */
export function monthRange(first: string, last: string): string[] {
  const a = ym(first), b = ym(last);
  if (a == null || b == null || b < a) return [];
  const out: string[] = [];
  for (let i = b; i >= a && out.length < 600; i--) out.push(mStr(i));
  return out;
}

/** « Septembre 2026 » / « September 2026 ». */
export function monthLabel(s: string, loc: string, short = false): string {
  const i = ym(s);
  if (i == null) return s;
  const d = new Date(Math.floor(i / 12), i % 12, 1);
  const txt = d.toLocaleString(loc, { month: short ? 'short' : 'long', year: 'numeric' }).replace('.', '');
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export function isDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDate() === Number(m[3]);
}

/** Saisie d'un nombre : virgule décimale, espaces et $ acceptés. null = illisible ou vide. */
export function parseAmount(raw: string): number | null {
  let s = String(raw || '').replace(/[\s$  ]/g, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s) && s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
  s = s.replace(/,/g, '');
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
export function parseIntStrict(raw: string): number | null {
  const s = String(raw || '').trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

export interface ContractForm { customer: string; type: string; total: string; startMonth: string; termMonths: string; billedDate: string; receivedDate: string; notes: string }
export interface LotForm { description: string; quantity: string; unitCost: string; inServiceMonth: string; usefulLife: string; salvage: string; notes: string }

/** Validation de la fenêtre « contrat » : mêmes règles que le serveur (qui revalide toujours). */
export function validateContractForm(f: ContractForm, typeKeys: string[]): { errors: Record<string, string>; body: Record<string, unknown> | null } {
  const errors: Record<string, string> = {};
  const total = parseAmount(f.total);
  const term = parseIntStrict(f.termMonths);
  if (!f.customer.trim()) errors.customer = 'bad_customer';
  else if (f.customer.length > 200) errors.customer = 'too_long';
  if (!typeKeys.includes(f.type)) errors.type = 'bad_type';
  if (total == null || total <= 0 || total >= 1e10) errors.total = 'bad_total';
  if (ym(f.startMonth) == null) errors.startMonth = 'bad_start';
  if (term == null || term < 1 || term > 600) errors.termMonths = 'bad_term';
  if (f.billedDate && !isDate(f.billedDate)) errors.billedDate = 'bad_billed_date';
  if (f.receivedDate && !isDate(f.receivedDate)) errors.receivedDate = 'bad_received_date';
  if (f.notes.length > 1000) errors.notes = 'too_long';
  if (Object.keys(errors).length) return { errors, body: null };
  return {
    errors,
    body: {
      customer: f.customer.trim(), type: f.type, total, startMonth: f.startMonth, termMonths: term,
      billedDate: f.billedDate || null, receivedDate: f.receivedDate || null, notes: f.notes.trim() || null,
    },
  };
}

export function validateLotForm(f: LotForm, defaultLife: number): { errors: Record<string, string>; body: Record<string, unknown> | null } {
  const errors: Record<string, string> = {};
  const qty = parseIntStrict(f.quantity);
  const unit = parseAmount(f.unitCost);
  const life = f.usefulLife.trim() ? parseIntStrict(f.usefulLife) : defaultLife;
  const salvage = f.salvage.trim() ? parseAmount(f.salvage) : 0;
  if (!f.description.trim()) errors.description = 'bad_description';
  if (qty == null || qty < 1 || qty > 1e6) errors.quantity = 'bad_quantity';
  if (unit == null || unit <= 0 || unit >= 1e7) errors.unitCost = 'bad_unit_cost';
  if (ym(f.inServiceMonth) == null) errors.inServiceMonth = 'bad_in_service';
  if (life == null || life < 1 || life > 600) errors.usefulLife = 'bad_life';
  if (salvage == null || salvage < 0) errors.salvage = 'bad_salvage';
  else if (qty != null && unit != null && salvage > qty * unit) errors.salvage = 'salvage_above_cost';
  if (f.notes.length > 1000) errors.notes = 'too_long';
  if (Object.keys(errors).length) return { errors, body: null };
  return {
    errors,
    body: { description: f.description.trim(), quantity: qty, unitCost: unit, inServiceMonth: f.inServiceMonth, usefulLife: life, salvage, notes: f.notes.trim() || null },
  };
}

/** Aperçu de la fenêtre : montant mensuel (affichage seulement ; le serveur arrondit au cumul). */
export function monthlyPreview(total: number | null, months: number | null, salvage = 0): number | null {
  if (total == null || months == null || months < 1) return null;
  return Math.round(((total - salvage) / months) * 100) / 100;
}
