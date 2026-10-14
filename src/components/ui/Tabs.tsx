import React, { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

// « Onglets · l'onglet actif est dans l'adresse » (planche « Onglets, filtres et messages »).
// Un lien vers « Rapport › Factures » se partage, et recharger la page garde l'onglet.
//
//   const [tab, setTab] = useUrlTab('apercu', ['apercu', 'mois', 'factures']);
//   <Tabs tabs={[{ id: 'apercu', label: t('…') }, …]} value={tab} onChange={setTab} />

export function useUrlTab<T extends string>(fallback: T, allowed: readonly T[], param = 'onglet'): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(param) as T | null;
  const value = raw && allowed.includes(raw) ? raw : fallback;
  const set = useCallback((next: T) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (next === fallback) n.delete(param); else n.set(param, next);
      return n;
    }, { replace: true });
  }, [setParams, fallback, param]);
  return [value, set];
}

export interface TabItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  count?: number;
}

function Tabs<T extends string>({ tabs, value, onChange, right, card = true, ariaLabel }: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Content on the right of the bar (a filter, a button). */
  right?: React.ReactNode;
  /** Wrap in the bordered card of the board (false = bare underline row). */
  card?: boolean;
  ariaLabel?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + tabs.length) % tabs.length;
    refs.current[j]?.focus();
    onChange(tabs[j].id);
  };
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${card ? 'rounded-2xl border border-stroke bg-white px-4 dark:border-strokedark dark:bg-boxdark' : 'border-b border-stroke dark:border-strokedark'}`}>
      <div role="tablist" aria-label={ariaLabel} className="-mb-px flex gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab, i) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              ref={(el) => { refs.current[i] = el; }}
              role="tab"
              type="button"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`inline-flex h-12 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 text-sm font-bold transition-colors ${
                active ? 'border-primary text-black dark:text-white' : 'border-transparent text-body hover:text-black dark:text-bodydark2 dark:hover:text-white'
              }`}
            >
              {tab.label}
              {tab.count != null && (
                <span className="rounded-full bg-gray px-[7px] py-px text-[11px] font-bold text-[#424242] dark:bg-meta-4 dark:text-bodydark">{tab.count}</span>
              )}
            </button>
          );
        })}
      </div>
      {right}
    </div>
  );
}

export default Tabs;
