// What the user is looking at, for Sofia (audit UX, P2 : « Sofia ne sait pas sur quelle page ou
// quelle fiche se trouve l'utilisateur »). The chat widget always sends the address and the tab
// title; a screen showing ONE record (a lead, a rep's month…) registers it here so Sofia can
// answer « this lead » or « this month » without the user retyping it.
//
//   useEffect(() => { setPageEntity({ kind: 'lead', label: `${lead.businessName} (${lead.refCode})` });
//                     return () => setPageEntity(null); }, [lead]);
//
// Only a short human label goes to the server — never ids it could act on blindly, and the
// server treats it as context, not as an instruction.

export interface PageEntity {
  kind: string;     // 'lead' | 'commissionReport' | …
  label: string;    // what a person would say: « Café Saint-Denis (L-0042) · nouvelle »
}

let current: PageEntity | null = null;

export function setPageEntity(e: PageEntity | null) { current = e; }

export function pageContext() {
  return {
    path: `${window.location.pathname}${window.location.search}`.slice(0, 200),
    title: document.title.slice(0, 120),
    entity: current ? { kind: current.kind.slice(0, 40), label: current.label.slice(0, 200) } : null,
  };
}
