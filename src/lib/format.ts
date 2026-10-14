import i18n from '../i18n';

// Numbers, money and dates in the language the user CHOSE (audit UX, P1: many screens forced
// 'en-CA' or the browser default, so a French user saw "$1,104.00", "Aug 2026" or "PAID").
//
//   fmtMoney(1104)          → « 1 104,00 $ »  /  "$1,104.00"
//   fmtDate(createdAt)      → « 14 oct. 2026 » / "Oct 14, 2026"      (timestamps)
//   fmtDateOnly('2026-08-01') → « 1 août 2026 » / "Aug 1, 2026"     (DATE columns, no TZ shift)
//   fmtMonth(2026, 8)       → « août 2026 »   /  "August 2026"
//   fmtPeriod('2026-08')    → « août 2026 »   /  "August 2026"
//
// Keep `'en-CA'` ONLY where an ISO date string (YYYY-MM-DD) is wanted on purpose — a file name,
// an <input type="date"> value, an API parameter — never for text a person reads.

export const appLocale = (): string => (i18n.language?.startsWith('en') ? 'en-CA' : 'fr-CA');

export function fmtMoney(value: number | null | undefined, opts: { currency?: string; decimals?: number } = {}): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const d = opts.decimals ?? 2;
  return new Intl.NumberFormat(appLocale(), {
    style: 'currency', currency: opts.currency || 'CAD', currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: d, maximumFractionDigits: d,
  }).format(Number(value));
}

export function fmtNumber(value: number | null | undefined, decimals?: number): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat(appLocale(), decimals == null ? undefined : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value));
}

const toDate = (v: string | number | Date | null | undefined): Date | null => {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** A real moment (TIMESTAMPTZ): shown in the user's time zone. */
export function fmtDate(value: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const d = toDate(value);
  return d ? d.toLocaleString(appLocale(), opts) : '—';
}

export const fmtDateTime = (value: string | number | Date | null | undefined) =>
  fmtDate(value, { dateStyle: 'medium', timeStyle: 'short' });

/** A calendar DATE column (sold_date, activated_at…): no time-zone shift. */
export function fmtDateOnly(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const d = toDate(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return d ? d.toLocaleDateString(appLocale(), { ...opts, timeZone: 'UTC' }) : '—';
}

/** month: 1–12. */
export function fmtMonth(year: number, month: number, style: 'long' | 'short' = 'long'): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(appLocale(), { month: style, year: 'numeric', timeZone: 'UTC' });
}

/** « 2026-08 » → « août 2026 ». Anything else is returned as is. */
export function fmtPeriod(period: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(period || '');
  return m ? fmtMonth(Number(m[1]), Number(m[2])) : (period || '—');
}

/** Month names for selectors and chart axes, in the user's language. */
export function monthNames(style: 'long' | 'short' = 'short'): string[] {
  return Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, i, 1)).toLocaleDateString(appLocale(), { month: style, timeZone: 'UTC' }));
}
