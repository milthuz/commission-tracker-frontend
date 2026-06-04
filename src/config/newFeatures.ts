// Catalog of "new" features. Two independent indicators in the sidebar:
//   • a DOT  — per-user "not seen yet"; clears immediately when the user opens the page.
//   • a "New" BADGE — time-based; shows for `days` after `since` for everyone (stays a few days).
//
//   id    – stable id persisted server-side once seen (never reuse).
//   path  – the route that reveals the feature (must match the sidebar NavLink `to`).
//   since – ISO date the feature shipped (drives the badge window).
//   days  – how many days to show the "New" badge (default 7).

export interface NewFeature {
  id: string;
  path: string;
  since: string;
  days?: number;
}

export const NEW_FEATURES: NewFeature[] = [
  // Invoice Enrichment + recalc-v2 controls added to the Integrations admin tab.
  { id: 'admin-data-tools-2026-06', path: '/admin/sync', since: '2026-06-04' },
];
