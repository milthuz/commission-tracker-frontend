// The redesign's surfaces as class strings (refonte UI, P3) — for the places that can't use
// <DataTable> without changing behaviour (row checkboxes, expandable rows, sticky matrices,
// inline editing). Same look as DataTable / StateCard: a hand-made table built from these is
// indistinguishable from the shared one.

/** Section card (what DataTable sits in). */
export const CARD = 'rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';
/** Card header strip and its title / subtitle. */
export const CARD_HEAD = 'border-b border-stroke px-5 py-4 dark:border-strokedark';
export const CARD_TITLE = 'text-base font-bold text-black dark:text-white';
export const CARD_SUB = 'mt-0.5 text-[13px] text-body dark:text-bodydark2';
export const CARD_BODY = 'px-5 py-4';

/** Table pieces. Wrap the <table> in TABLE_WRAP (scrolls sideways on a phone). */
export const TABLE_WRAP = 'overflow-x-auto rounded-xl border border-stroke dark:border-strokedark';
export const TABLE = 'w-full border-collapse text-sm';
export const THEAD_ROW = 'text-xs text-body dark:text-bodydark2';
export const TH = 'whitespace-nowrap border-b border-stroke px-4 py-3 font-bold dark:border-strokedark';
export const TD = 'border-b border-stroke px-4 py-3 text-black dark:border-strokedark dark:text-white';
export const TR_CLICK = 'cursor-pointer hover:bg-gray-2 dark:hover:bg-[#1B1B1B]';

/** Form controls. */
export const INPUT = 'h-10 rounded-[10px] border border-stroke bg-transparent px-3 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white';
export const LABEL = 'mb-1 block text-xs font-bold text-body dark:text-bodydark2';

/** Segmented control (small view switches inside a card). */
export const SEG = 'flex flex-wrap gap-1 rounded-xl bg-gray-2 p-1 dark:bg-meta-4/60';
export const segBtn = (active: boolean) => `rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${active ? 'bg-white text-black shadow-sm dark:bg-boxdark dark:text-white' : 'text-body hover:text-black dark:text-bodydark2 dark:hover:text-white'}`;
