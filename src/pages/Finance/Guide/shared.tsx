// Module Finance — lot H : petites briques communes aux trois volets du guide.
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Formatter } from '../format';
import type { LFn } from './guideModel';
import type { Unit } from './api';

/** Traducteur du guide : `L('q.opexChange', {...})` = t('finance.guide.q.opexChange', {...}). Sans échappement HTML (« Sales & Marketing »). */
export function useL(): LFn {
  const { t } = useTranslation();
  return useCallback((key: string, params?: Record<string, string | number>) => (t as unknown as (k: string, o?: unknown) => string)(`finance.guide.${key}`, { ...(params || {}), interpolation: { escapeValue: false } }), [t]);
}

/** Copie dans le presse-papiers ; true si ça a marché. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* on tente le repli */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/** Montant ou ratio d'un repère, selon son unité. */
export function fmtUnit(fmt: Formatter, v: number | null | undefined, unit: Unit): string {
  if (v == null || !Number.isFinite(v)) return '—';
  switch (unit) {
    case 'pct': return fmt.pct(v);
    case 'pts': return `${fmt.int.format(Math.round(v * 10) / 10)} pts`;
    case 'months': return `${Math.round(v * 10) / 10} ${fmt.fr ? 'mois' : 'mo'}`;
    case 'ratio': return `${fmt.fr ? String(Math.round(v * 10) / 10).replace('.', ',') : Math.round(v * 10) / 10}x`;
    case 'cad': return fmt.fmt(v, '$');
    case 'usd': return `${fmt.fmt(v, '$')} USD`;
    case 'cad_year': return `${fmt.fmt(v, '$')} / ${fmt.fr ? 'an' : 'yr'}`;
    case 'usd_year': return `${fmt.fmt(v, '$')} USD / ${fmt.fr ? 'an' : 'yr'}`;
    default: return String(v);
  }
}

/** « 2026-09 » → « sept. 2026 » (ou « Sep 2026 »). */
export const monthLabel = (fmt: Formatter, m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleString(fmt.loc, { month: 'short', year: 'numeric' });

export const TEXTAREA = 'w-full rounded-[10px] border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white';
