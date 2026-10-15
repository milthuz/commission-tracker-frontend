import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActionMenu, MenuItem } from './ActionMenu';

// « Barre de filtres · la même partout » : une carte pleine largeur SOUS le titre de la page
// (jamais flottante à côté — voir la mémoire « header toolbar »). Ligne 1 : recherche, boutons
// de filtre, export à droite. Ligne 2 : les filtres actifs en puces retirables.

export interface FilterChip {
  key: string;
  /** « Champ : valeur » */
  label: React.ReactNode;
  onRemove: () => void;
}

const FilterBar = ({ search, onSearch, onSubmit, searchPlaceholder, children, chips = [], onClearAll, exportItems }: {
  search?: string;
  onSearch?: (v: string) => void;
  /** Enter in the search box — for screens that search on the SERVER (e.g. Proposals). */
  onSubmit?: () => void;
  searchPlaceholder?: string;
  /** Filter controls (Select, « + Source » buttons…). */
  children?: React.ReactNode;
  chips?: FilterChip[];
  onClearAll?: () => void;
  exportItems?: MenuItem[];
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-stroke bg-white px-4 py-3.5 dark:border-strokedark dark:bg-boxdark">
      <div className="flex flex-wrap items-center gap-2">
        {onSearch && (
          <label className="flex h-10 min-w-0 flex-[1_1_280px] items-center gap-2 rounded-xl border border-stroke bg-white px-3 text-body focus-within:border-primary dark:border-strokedark dark:bg-form-input dark:text-bodydark2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <span className="sr-only">{t('ui.filter.search')}</span>
            <input
              type="search"
              value={search ?? ''}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={onSubmit ? (e) => { if (e.key === 'Enter') onSubmit(); } : undefined}
              placeholder={searchPlaceholder || (t('ui.filter.searchPlaceholder') as string)}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-black outline-none placeholder:opacity-75 dark:text-white"
            />
          </label>
        )}
        {children}
        {exportItems && exportItems.length > 0 && (
          <div className="ml-auto">
            <ActionMenu
              items={exportItems}
              trigger={(props) => (
                <button type="button" {...props} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-strokestrong bg-gray px-3.5 text-sm font-bold text-black hover:bg-[#E4E4E7] dark:border-graydark dark:bg-meta-4 dark:text-white dark:hover:bg-[#2A2A2A]">
                  {t('ui.filter.export')} <span aria-hidden="true">▾</span>
                </button>
              )}
            />
          </div>
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-[rgba(245,131,69,0.14)] pl-3 pr-1.5 text-[13px] font-bold text-accent-ink dark:bg-[rgba(245,131,69,0.16)] dark:text-accent-ink-dark">
              {c.label}
              <button
                type="button"
                onClick={c.onRemove}
                aria-label={t('ui.filter.removeFilter')}
                className="flex h-[22px] w-[22px] items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              >
                ×
              </button>
            </span>
          ))}
          {onClearAll && (
            <button type="button" onClick={onClearAll} className="h-[30px] px-2 text-[13px] font-medium text-body hover:text-black dark:text-bodydark2 dark:hover:text-white">
              {t('ui.filter.clearAll')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FilterBar;
