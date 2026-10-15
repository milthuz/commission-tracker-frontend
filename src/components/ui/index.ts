// Shared components of the UI redesign (audit UX, P1). Built from the « Composants » boards of the
// Claude Design canvas « Sales Hub — refonte UI ». New screens use these; existing screens move
// to them one by one in P2 — no new hand-rolled table, modal, tab bar or status colour map.
export { default as Button } from './Button';
export { default as StatusPill, STATUS_PILL_CLS, STATUS_DOT_CLS } from './StatusPill';
export type { StatusFamily } from './StatusPill';
export { default as Modal } from './Modal';
export { useDialog } from './useDialog';
export { default as Tabs, useUrlTab } from './Tabs';
export type { TabItem } from './Tabs';
export { default as FilterBar } from './FilterBar';
export type { FilterChip } from './FilterBar';
export { default as DataTable, StateCard } from './DataTable';
export type { Column } from './DataTable';
export { ActionMenu, RowMenu } from './ActionMenu';
export type { MenuItem } from './ActionMenu';
export { default as InlineError } from './InlineError';
export { toast } from '../../lib/toast';
export { dialog } from '../../lib/dialog';
export { default as PageHeader } from './PageHeader';
export * from './surface';
