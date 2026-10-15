// Sofia's chat panel can be opened from outside the widget — the phone tab bar's « Sofia » tab
// (refonte UI, P2). Two window events, no shared React state, because ChatAssistant is also
// mounted by the partner portal where nothing else listens.
//   sofia:set    → { detail: boolean } ask the panel to open / close
//   sofia:state  → { detail: boolean } the panel says whether it is open now

export const SOFIA_SET_EVENT = 'sofia:set';
export const SOFIA_STATE_EVENT = 'sofia:state';

export const setSofiaOpen = (open: boolean) =>
  window.dispatchEvent(new CustomEvent<boolean>(SOFIA_SET_EVENT, { detail: open }));

export const announceSofiaState = (open: boolean) =>
  window.dispatchEvent(new CustomEvent<boolean>(SOFIA_STATE_EVENT, { detail: open }));
