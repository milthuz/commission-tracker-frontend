// Formes renvoyées par le backend (SH-20). Elles suivent `publicLead()` de server.js — les
// champs de contact sont volontairement À PLAT (`contactEmail` et non `contact.email`) : le mode
// démo masque par NOM de clé, et une clé générique `email` toucherait aussi les courriels des
// représentants partout ailleurs dans l'application.

// 'support_ticket' : client existant, sa demande est devenue un billet Zoho Desk.
export const LEAD_STATUSES = ['new', 'in_review', 'accepted', 'rejected', 'duplicate', 'support_ticket'] as const;
export const LEAD_SOURCES = ['website', 'phone', 'walk_in', 'referral', 'event', 'other'] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface DuplicateRecord {
  module: string;
  // Tableau depuis 2026-08-05 (une même fiche trouvée par plusieurs critères) ; chaîne avant.
  matchedOn: string | string[];
  company: string | null;
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  // À qui la fiche appartient déjà dans Zoho. Absent sur les fiches vérifiées avant 2026-09-28.
  owner?: { id: string | null; name: string; email: string | null } | null;
}

export interface Lead {
  id: number;
  refCode: string;
  status: LeadStatus;
  source: LeadSource;
  sourceDetail: string | null;

  businessName: string;
  businessType: string | null;
  website: string | null;

  contactFirstName: string | null;
  contactLastName: string | null;
  contactTitle: string | null;
  contactEmail: string | null;
  contactPhone: string | null;

  city: string | null;
  province: string | null;
  postalCode: string | null;
  language: 'fr' | 'en';

  interest: string[];
  locationsCount: number | null;
  currentPos: string | null;
  timeline: string | null;
  notes: string | null;

  createdBy: string | null;
  createdAt: string;

  suggested: { repName: string; via: 'rule' | 'rotation' | 'none'; ruleId: number | null; ruleName: string | null } | null;
  assigned: { repName: string; email: string | null; at: string | null; by: string | null } | null;

  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;

  duplicate: { status: string | null; summary: string | null; records: DuplicateRecord[] };
  crm: {
    leadId: string | null;
    error: string | null;
    dealId: string | null;
    dealStage: string | null;
    depositDate: string | null;
    followupId: string | null;
    followupKind: string | null;
  };

  callbackAt: string | null;
  repNotifiedAt: string | null;
  merchantNotifiedAt: string | null;
  // Rendez-vous (services/leadBooking) : proposé à l'acceptation, puis confirmé / déplacé /
  // annulé par le client depuis la page publique /rdv.
  booking?: { status: 'proposed' | 'confirmed' | 'callback' | 'cancelled' | null; updatedAt: string | null; changes: number; inGoogleCalendar: boolean; meetUrl?: string | null };
  // Journal par étape écrit à l'acceptation : { crm, callback, repEmail, merchantEmail }.
  // Chaque entrée porte `ok` et, en cas d'échec, `error` ou `skipped`.
  automation: Record<string, any>;
  // Client existant : contacts Zoho Books (3 organisations) et Desk, par courriel. null = pas
  // encore vérifié. Masqué à qui n'examine pas (comme le doublon).
  existingCustomer?: ExistingCustomer | null;
  deskTicket?: { id: string; number: string | null; url: string | null } | null;
}

export interface ExistingCustomer {
  checkedAt: string;
  byEmail: string | null;
  matches: { source: 'books' | 'desk'; org?: string; id: string; customerName: string | null; active?: boolean; url?: string | null }[];
  errors: string[];
}

export interface LeadRep {
  name: string;
  in_rotation: boolean;
  away_until: string | null;
  last_assigned_at: string | null;
  assigned_count: number;
}

export interface LeadRule {
  id: number;
  position: number;
  name: string;
  is_active: boolean;
  match_sources: string[];
  match_provinces: string[];
  match_languages: string[];
  match_business_types: string[];
  match_postal_prefix: string[];
  target_reps: string[];
}

export interface LeadSettings {
  callbackEnabled: boolean;
  callbackType: 'call' | 'task';
  callbackDelayHours: number;
  businessHours: { start: number; end: number };
  notifyRep: boolean;
  notifyMerchant: boolean;
  merchantFrom: string;
  sendFromRep: boolean;
  merchantSiteUrl: string;
  bookingEnabled: boolean;
  slotMinutes: number;
  bookingDays: number;
  minNoticeHours: number;
  allowCancel: boolean;
  includeMeet: boolean;
  reviewReminderHours: number;
  leadSourceWebsite: string;
  leadSourcePhone: string;
  contactMethodWebsite: string;
  contactMethodPhone: string;
}

export const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export const leadFullName = (l: Lead) =>
  [l.contactFirstName, l.contactLastName].filter(Boolean).join(' ') || null;

export const statusTone: Record<LeadStatus, string> = {
  new: 'bg-warning/15 text-warning',
  in_review: 'bg-primary/15 text-primary',
  accepted: 'bg-success/15 text-success',
  rejected: 'bg-danger/10 text-danger',
  duplicate: 'bg-bodydark2/15 text-bodydark2 dark:text-bodydark1',
  support_ticket: 'bg-[#3C50E0]/10 text-[#3C50E0] dark:text-[#8FA1FF]',
};
