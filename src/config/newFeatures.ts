// Catalog of "new" features. Indicators:
//   • sidebar DOT   — per-user "not seen yet"; clears immediately when the user opens the page.
//   • sidebar "New" BADGE — time-based; shows for `days` after `since` (stays a few days).
//   • on-page BANNER — shown on the feature's own page during the same window, dismissible per-user.
//
//   id       – stable id persisted server-side once seen/dismissed (never reuse).
//   path     – the route that reveals the feature (must match the sidebar NavLink `to`).
//   since    – ISO date the feature shipped (drives the badge/banner window).
//   days     – how many days to show the badge/banner (default 7).
//   titleKey / descKey – i18n keys for the on-page banner text.

export interface NewFeature {
  id: string;
  path: string;
  since: string;
  days?: number;
  titleKey?: string;
  descKey?: string;
}

export const NEW_FEATURES: NewFeature[] = [
  {
    id: 'admin-data-tools-2026-06',
    path: '/admin/sync',
    since: '2026-06-04',
    titleKey: 'newFeatures.adminDataTools.title',
    descKey: 'newFeatures.adminDataTools.desc',
  },
];
