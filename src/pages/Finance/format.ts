// Module Finance — mise en forme des nombres, à la manière d'un état financier : montants
// arrondis au dollar, négatifs entre parenthèses, « % » à une décimale, chiffres tabulaires.
// Le symbole $ suit la langue : « $1,234 » en anglais, « 1 234 $ » en français.

export type Fmt = '$' | 's' | 'n' | '%' | '$2' | 'ratio';

export const localeOf = (lang: string | undefined) => (lang && lang.startsWith('fr') ? 'fr-CA' : 'en-CA');

export function makeFormat(lang: string | undefined) {
  const loc = localeOf(lang);
  const fr = loc === 'fr-CA';
  const int = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  const one = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const fix1 = new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const two = new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (s: string) => (fr ? `${s} $` : `$${s}`);
  const paren = (neg: boolean, s: string) => (neg ? `(${s})` : s);
  // Arrondi d'abord : « -0,4 » ne doit pas s'afficher « (0) ».
  const r0 = (v: number) => { const x = Math.round(v); return x === 0 ? 0 : x; };

  const f0 = (v: number) => paren(r0(v) < 0, int.format(Math.abs(r0(v))));
  const fmt = (v: number | null | undefined, kind: Fmt): string => {
    if (v == null || !Number.isFinite(v)) return '';
    switch (kind) {
      case '$': return paren(r0(v) < 0, money(int.format(Math.abs(r0(v)))));
      case 's': return f0(v);
      case 'n': return Number.isInteger(v) ? paren(v < 0, int.format(Math.abs(v))) : paren(v < 0, one.format(Math.abs(v)));
      case '%': return `${fix1.format(v)}${fr ? ' %' : '%'}`;
      case 'ratio': return `${fix1.format(v * 100)}${fr ? ' %' : '%'}`;
      case '$2': return paren(v < 0, money(two.format(Math.abs(v))));
      default: return f0(v);
    }
  };
  const pct = (v: number | null | undefined, signed = false) => {
    if (v == null || !Number.isFinite(v)) return '';
    const s = `${fix1.format(Math.abs(v))}${fr ? ' %' : '%'}`;
    return signed ? `${v >= 0 ? '+' : '−'}${s}` : (v < 0 ? `−${s}` : s);
  };
  const months = (yy: number) => Array.from({ length: 12 }, (_, i) => {
    const m = new Date(2000 + yy, i, 1).toLocaleString(loc, { month: 'short' }).replace('.', '');
    return `${m.charAt(0).toUpperCase()}${m.slice(1)}-${yy}`;
  });
  // Lecture d'une saisie : virgule décimale acceptée, espaces et $ ignorés. null = illisible.
  const parse = (raw: string): number | null => {
    const s = raw.replace(/[\s $  ]/g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '');
    if (!/^-?\d*\.?\d+$|^-?\d+\.?$/.test(s)) return null;
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : null;
  };
  return { loc, fr, fmt, pct, money, months, parse, int, two };
}

export type Formatter = ReturnType<typeof makeFormat>;

// CSV pour Excel : « ; » et virgule décimale en français (Excel fr-CA), BOM UTF-8.
export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][], fr: boolean) {
  const sep = fr ? ';' : ',';
  const cell = (v: string | number | null) => {
    if (v == null) return '';
    const s = typeof v === 'number' ? (fr ? String(Math.round(v * 100) / 100).replace('.', ',') : String(Math.round(v * 100) / 100)) : v;
    return /[";,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(sep)).join('\r\n');
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
