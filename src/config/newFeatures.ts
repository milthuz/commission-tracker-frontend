// Catalog of "new" features shown with a dot + "New" badge in the sidebar.
// Add an entry whenever a feature ships. The badge clears PER USER (stored backend)
// once they visit the feature's page for a few seconds.
//
//   id    – stable identifier persisted server-side once the user has seen it (never reuse).
//   path  – the route that "reveals" the feature (must match the sidebar NavLink `to`).
//   until – optional ISO date; after it, the badge stops showing even if never seen.

export interface NewFeature {
  id: string;
  path: string;
  until?: string;
}

export const NEW_FEATURES: NewFeature[] = [
  // Invoice Enrichment + recalc-v2 controls added to the Integrations admin tab.
  { id: 'admin-data-tools-2026-06', path: '/admin/sync' },
];
