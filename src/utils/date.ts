/**
 * Format a DB DATE-only value (e.g. activated_at, close_date, sold_date)
 * without timezone conversion. The DB returns "2026-05-01T00:00:00.000Z"
 * for a value stored as 2026-05-01. In EDT (UTC-4), the browser would
 * naively show "4/30/2026" — wrong. Forcing UTC display keeps the date
 * the same as what's stored.
 *
 * Use this for DATE columns ONLY. For TIMESTAMPTZ columns (created_at,
 * updated_at, last_login, etc.) keep the regular Date toLocaleDateString
 * since those are real wall-clock moments.
 */
export function formatDateOnly(value: string | Date | null | undefined, locale = 'en-CA'): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { timeZone: 'UTC' });
}
