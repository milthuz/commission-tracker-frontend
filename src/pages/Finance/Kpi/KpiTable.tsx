// Onglet KPI — le tableau : une ligne par KPI, une colonne par mois (comme l'onglet « YTD KPI »
// du classeur de la CFO). En vue « Réel c. budget », chaque mois a quatre colonnes : Réel, Budget,
// Écart, Écart %. Dernière colonne : 12 mois.
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TABLE_WRAP } from '../../../components/ui/surface';
import { EDIT_CELL } from '../components';
import type { Formatter } from '../format';
import type { ACell, BCell, KpiDef, KpiFmt, KpiRowOut, KpiSection, KpiTable as Table } from './kpiModel';

export type View = 'bva' | 'actual';

export function useKpiFormat(fmt: Formatter) {
  const fx = new Intl.NumberFormat(fmt.loc, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const val = (v: number | null | undefined, f: KpiFmt) => {
    if (v == null || !Number.isFinite(v)) return '';
    if (f === 'fx') return fx.format(v);
    return fmt.fmt(v, f);
  };
  const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '' : fmt.pct(v * 100, true));
  const month = (m: string) => {
    const s = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleString(fmt.loc, { month: 'short' }).replace('.', '');
    return `${s.charAt(0).toUpperCase()}${s.slice(1)}-${m.slice(2, 4)}`;
  };
  const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(fmt.loc, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  return { val, pct, month, when };
}

// Lecture d'une saisie : espaces et $ ignorés ; en français, une virgule seule est décimale (« 1,3912 »),
// sinon les virgules séparent les milliers. null = illisible.
export function parseNum(raw: string, fr: boolean): number | null {
  let s = raw.replace(/[\s$\u00a0\u202f]/g, '');
  if (fr && s.includes(',') && !s.includes('.') && (s.match(/,/g) || []).length === 1) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!/^-?\d*\.?\d+$|^-?\d+\.?$/.test(s)) return null;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

// Couleur d'un écart : favorable (vert) ou défavorable (rouge) selon le sens de la ligne.
const tone = (def: KpiDef, v: number | null) => {
  if (v == null || v === 0 || !def.good) return '';
  const good = def.good === 'up' ? v > 0 : v < 0;
  return good ? 'text-[#067647] dark:text-[#57D193]' : 'text-[#B42318] dark:text-[#F46060]';
};

// Cellule de budget : modifiable, vidée = valeur retirée (à la sortie du champ).
function BudgetInput({ cell, label, disabled, onChange, fmt }: { cell: BCell; label: string; disabled: boolean; onChange: (v: number | null) => void; fmt: Formatter }) {
  const v = cell.v;
  const plain = v == null ? '' : (fmt.fr ? String(Math.round(v * 10000) / 10000).replace('.', ',') : String(Math.round(v * 10000) / 10000));
  const pretty = v == null ? '' : new Intl.NumberFormat(fmt.loc, { maximumFractionDigits: 2 }).format(v);
  const [raw, setRaw] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setRaw(null); }, [v, focused]);
  const soft = cell.src === 'model' || cell.src === 'formula';
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      disabled={disabled}
      value={raw ?? (focused ? plain : pretty)}
      onChange={(e) => { setRaw(e.target.value); const x = parseNum(e.target.value, fmt.fr); if (x != null) onChange(x); }}
      onBlur={() => {
        setFocused(false);
        if (raw != null && raw.trim() === '' && cell.src === 'stored') onChange(null);
        setRaw(null);
      }}
      onFocus={(e) => { setFocused(true); const el = e.target; requestAnimationFrame(() => el.select()); }}
      className={`h-7 w-[78px] rounded-md border px-1.5 text-right text-[12px] tabular-nums outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-70 ${EDIT_CELL} ${soft ? 'italic opacity-80' : ''}`}
    />
  );
}

export function KpiTable({ table, view, canEdit, fmt, onActual, onBudget, srcTitle, budgetTitle }: {
  table: Table;
  view: View;
  canEdit: boolean;
  fmt: Formatter;
  onActual: (row: KpiRowOut, m: string, cell: ACell) => void;
  onBudget: (m: string, def: KpiDef, v: number | null) => void;
  srcTitle: (def: KpiDef, cell: ACell, m: string) => string;
  budgetTitle: (cell: BCell) => string;
}) {
  const { t } = useTranslation();
  const F = useKpiFormat(fmt);
  const bva = view === 'bva';
  const per = bva ? 4 : 1;
  const th = 'whitespace-nowrap border-b border-stroke px-2 py-1.5 text-right text-[11px] font-bold uppercase tracking-[0.05em] text-body dark:border-strokedark dark:text-bodydark2';
  const td = 'whitespace-nowrap border-b border-stroke/60 px-2 py-1 text-right tabular-nums dark:border-strokedark/60';
  const monthSep = 'border-l border-l-stroke dark:border-l-strokedark';
  const totalCls = 'bg-[#F3F3F3] dark:bg-[#19191B]';
  const label = 'sticky left-0 z-[1] min-w-[260px] max-w-[340px] bg-white text-left dark:bg-boxdark';
  const span = 1 + (table.months.length + 1) * per;
  let lastSec: KpiSection | null = null;

  const actualCell = (row: KpiRowOut, m: string, a: ACell) => {
    const hand = a.src === 'override' || a.src === 'manual';
    const txt = F.val(a.v, row.def.fmt);
    return (
      <button
        type="button"
        onClick={() => onActual(row, m, a)}
        title={srcTitle(row.def, a, m)}
        aria-label={`${t(`finance.kpi.rows.${row.def.key}`)} — ${F.month(m)} : ${txt || t('finance.kpi.src.none')}`}
        className={`min-w-[56px] rounded px-1 text-right tabular-nums hover:underline hover:decoration-dotted hover:decoration-primary hover:underline-offset-[3px] ${hand ? `border ${EDIT_CELL}` : ''} ${a.v == null ? 'text-body/60 dark:text-bodydark2/60' : ''}`}
      >
        {txt || '—'}
      </button>
    );
  };

  return (
    <div className={TABLE_WRAP}>
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr>
            <th rowSpan={bva ? 2 : 1} className={`${th} ${label} z-10 !text-left`}>{t('finance.kpi.cols.kpi')}</th>
            {table.months.map((m) => <th key={m} colSpan={per} className={`${th} ${bva ? `${monthSep} !text-center` : ''}`}>{F.month(m)}</th>)}
            <th colSpan={per} className={`${th} ${monthSep} ${totalCls} ${bva ? '!text-center' : ''}`}>{t('finance.kpi.cols.t12')}</th>
          </tr>
          {bva && (
            <tr>
              {[...table.months, 't12'].map((m) => (
                <React.Fragment key={m}>
                  <th className={`${th} ${monthSep} ${m === 't12' ? totalCls : ''}`}>{t('finance.kpi.cols.actual')}</th>
                  <th className={`${th} ${m === 't12' ? totalCls : ''}`}>{t('finance.kpi.cols.budget')}</th>
                  <th className={`${th} ${m === 't12' ? totalCls : ''}`}>{t('finance.kpi.cols.var')}</th>
                  <th className={`${th} ${m === 't12' ? totalCls : ''}`}>{t('finance.kpi.cols.varPct')}</th>
                </React.Fragment>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {table.rows.map((row) => {
            const out: React.ReactNode[] = [];
            if (row.def.section !== lastSec) {
              lastSec = row.def.section;
              out.push(
                <tr key={`sec:${row.def.section}`}>
                  <td colSpan={span} className="border-b border-stroke px-2.5 pb-1.5 pt-4 text-[13px] font-semibold text-body dark:border-strokedark dark:text-bodydark2">{t(`finance.kpi.sec.${row.def.section}`)}</td>
                </tr>,
              );
            }
            const name = t(`finance.kpi.rows.${row.def.key}`);
            const bold = row.def.formula && (row.def.key === 'totalRooftops' || row.def.key === 'arpu');
            out.push(
              <tr key={row.def.key} className={`text-black dark:text-white ${bold ? 'font-bold' : ''}`}>
                <td className={`${td} ${label} !whitespace-normal`} title={t(`finance.kpi.formula.${row.def.key}`)}>
                  <span className={row.def.formula ? 'italic' : ''}>{name}</span>
                </td>
                {row.cells.map((c) => (
                  <React.Fragment key={c.m}>
                    <td className={`${td} ${bva ? monthSep : ''}`}>{actualCell(row, c.m, c.a)}</td>
                    {bva && (
                      <>
                        <td className={td} title={budgetTitle(c.b)}>
                          {canEdit
                            ? <BudgetInput cell={c.b} fmt={fmt} disabled={false} label={t('finance.kpi.budgetCell', { kpi: name, month: F.month(c.m) })} onChange={(v) => onBudget(c.m, row.def, v)} />
                            : <span className={c.b.src === 'model' || c.b.src === 'formula' ? 'italic text-body dark:text-bodydark2' : ''}>{F.val(c.b.v, row.def.fmt)}</span>}
                        </td>
                        <td className={`${td} ${tone(row.def, c.var)}`}>{row.def.fmt === 'fx' ? '' : F.val(c.var, row.def.fmt)}</td>
                        <td className={`${td} ${tone(row.def, c.var)}`}>{row.def.fmt === 'fx' ? '' : F.pct(c.varPct)}</td>
                      </>
                    )}
                  </React.Fragment>
                ))}
                <td className={`${td} ${monthSep} ${totalCls} font-bold`}>{F.val(row.t12.a, row.def.fmt)}{row.t12.partialA ? '*' : ''}</td>
                {bva && (
                  <>
                    <td className={`${td} ${totalCls}`}>{F.val(row.t12.b, row.def.fmt)}{row.t12.partialB ? '*' : ''}</td>
                    <td className={`${td} ${totalCls} ${tone(row.def, row.t12.var)}`}>{F.val(row.t12.var, row.def.fmt)}</td>
                    <td className={`${td} ${totalCls} ${tone(row.def, row.t12.var)}`}>{F.pct(row.t12.varPct)}</td>
                  </>
                )}
              </tr>,
            );
            return out;
          })}
        </tbody>
      </table>
    </div>
  );
}

// Grille exportée (CSV / Excel), dans la vue affichée. Écart % en points de pourcentage (12,5 = 12,5 %).
export function exportGrid(table: Table, view: View, t: (k: string, o?: any) => string, monthLabel: (m: string) => string) {
  const bva = view === 'bva';
  const sub = bva ? ['actual', 'budget', 'var', 'varPct'] : ['actual'];
  const head: string[] = [t('finance.kpi.cols.kpi')];
  for (const m of [...table.months, 't12']) for (const s of sub) head.push(`${m === 't12' ? t('finance.kpi.cols.t12') : monthLabel(m)}${bva ? ` ${t(`finance.kpi.cols.${s}`)}` : ''}`);
  const rows: (string | number | null)[][] = table.rows.map((r) => {
    const line: (string | number | null)[] = [t(`finance.kpi.rows.${r.def.key}`)];
    for (const c of r.cells) {
      line.push(c.a.v);
      if (bva) line.push(c.b.v, c.var, c.varPct == null ? null : c.varPct * 100);
    }
    line.push(r.t12.a);
    if (bva) line.push(r.t12.b, r.t12.var, r.t12.varPct == null ? null : r.t12.varPct * 100);
    return line;
  });
  return { head, rows };
}
