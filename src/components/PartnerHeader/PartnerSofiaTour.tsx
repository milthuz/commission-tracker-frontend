import React from 'react';
import SofiaTour from '../SofiaTour';

// Route -> i18n key map for the Partner Portal's own menu (PartnerSidebar.tsx). Any item
// without an entry here falls back to a generic blurb, same as the internal tour's NAV_DESC.
const PARTNER_NAV_DESC: Record<string, string> = {
  '/partner-portal': 'partnerPortal.tour.opportunitiesBody',
  '/partner-portal/team': 'partnerPortal.tour.teamBody',
  '/partner-portal/organization': 'partnerPortal.tour.organizationBody',
  '/partner-portal/profile': 'partnerPortal.tour.settingsBody',
};

// Sofia's guided tour, scoped to the Partner Portal: builds itself from PartnerSidebar's own
// [data-tour-menu] (same generic mechanism as the internal tour), with Partner Portal copy and
// its own "seen" key so completing one tour never marks the other done.
const PartnerSofiaTour: React.FC = () => (
  <SofiaTour
    i18nPrefix="partnerPortal.tour"
    navDesc={PARTNER_NAV_DESC}
    tourKey="partner-sofia-tour-v1"
    chatTokenKey="partnerToken"
    chatEndpoint="/api/partner-portal/assistant/chat"
    startEventName="partner-sofia:tour"
  />
);

export default PartnerSofiaTour;
