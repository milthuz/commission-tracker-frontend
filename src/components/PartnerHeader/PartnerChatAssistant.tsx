import React from 'react';
import ChatAssistant from '../ChatAssistant';

// Sofia, scoped to the Partner Portal: its own token, endpoint, i18n copy, and tour trigger
// event, so it never mixes internal Sales Hub content into a partner conversation and never
// collides with the internal ChatAssistant when both happen to share a browser.
// `mobileTabBar`: on a phone the panel opens from PartnerMobileTabBar's « Sofia » tab.
const PartnerChatAssistant: React.FC = () => (
  <ChatAssistant
    i18nPrefix="partnerPortal.assistant"
    tokenKey="partnerToken"
    endpoint="/api/partner-portal/assistant/chat"
    tourEventName="partner-sofia:tour"
    mobileTabBar
  />
);

export default PartnerChatAssistant;
