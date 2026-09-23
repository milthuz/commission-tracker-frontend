export const API_URL = import.meta.env.VITE_API_URL;
export const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export type HireStatus = 'draft' | 'sent' | 'viewed' | 'employee_signed' | 'completed' | 'declined' | 'cancelled';

export interface Tier { points: number; bonus: number }

export interface Plan {
  version: string;
  monthlyQuota: number;
  pointsInbound: number;
  pointsOutbound: number;
  pointsProcessing: number;
  hardwareRate: number;
  hardwareReducedRate: number;
  discountThreshold: number;
  saasFirstMonthPct: number;
  signupBonus: number;
  processingCap: number;
  biAnnualMinMargin: number;
  rampDays: number;
  monthlyTiers: Tier[];
  annualTiers: Tier[];
}

export interface Terms {
  carAllowance: number;
  phoneAllowance: number;
  vacationWeeks: number;
  commissionEligible: boolean;
}

export interface HireData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  position: string;
  positionFr: string;
  startDate: string;
  offerDate: string;
  reportsToTitle: string;
  reportsToTitleFr?: string;
  reportsToName: string;
  supervisorName: string;
  annualSalary: number | null;
  agreementLang: 'en' | 'fr';
  includeAgreement: boolean;
  notes: string;
}

export interface HireListItem {
  id: string;
  ref: string;
  status: HireStatus;
  name: string;
  email: string;
  position: string;
  startDate: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  employeeSignedAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  cancelledAt: string | null;
  tokenExpiresAt: string | null;
  salespersonName: string | null;
}

// Un document généré. `reference` = version française remise en plus d'un dossier en anglais
// (non signée).
export interface DocRef { key: string; kind: 'offer' | 'agreement'; lang: 'en' | 'fr'; reference: boolean }

export interface HireEvent { event: string; actor: string | null; ip: string | null; detail: Record<string, any>; at: string }
export interface Attachment { id: number; filename: string; size: number; sha256: string; uploadedBy: string; createdAt: string }

export interface HireDetail extends HireListItem {
  hire: HireData;
  terms: Terms;
  plan: Plan;
  planDiffers: string[];
  declineReason: string | null;
  employeeSig: { name: string; at: string; ip: string; ua?: string } | null;
  companySig: { name: string; email: string; at: string; ip: string } | null;
  hasSigned: boolean;
  documents: DocRef[];
  attachments: Attachment[];
  events: HireEvent[];
  emailed?: boolean;
  link?: string | null;
  created?: boolean;
}

export interface Manager { name: string; titleEn: string; titleFr: string }

export interface Meta {
  defaults: Plan;
  terms: Terms;
  managers: Manager[];
  can: { manage: boolean; countersign: boolean };
}

// Le contenu défile dans le conteneur du DefaultLayout, pas dans window : window.scrollTo n'a
// aucun effet ici. On ramène l'ancre posée en haut de la page RH.
export const scrollToTop = () => document.getElementById('hr-top')?.scrollIntoView({ block: 'start' });

export const statusTone: Record<HireStatus, string> = {
  draft: 'bg-gray-2 text-bodydark2 dark:bg-meta-4',
  sent: 'bg-primary/10 text-primary',
  viewed: 'bg-primary/10 text-primary',
  employee_signed: 'bg-warning/15 text-warning',
  completed: 'bg-success/15 text-success',
  declined: 'bg-danger/10 text-danger',
  cancelled: 'bg-gray-2 text-bodydark2 dark:bg-meta-4',
};

// Ouvre un PDF protégé (en-tête d'autorisation) dans un nouvel onglet. La fenêtre est ouverte
// AVANT l'appel réseau : ouverte après un `await`, elle serait bloquée comme fenêtre surgissante.
export async function openAuthedPdf(url: string, download?: string) {
  const w = download ? null : window.open('', '_blank');
  try {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement('a');
      a.href = obj; a.download = download; document.body.appendChild(a); a.click(); a.remove();
    } else if (w) {
      w.location.href = obj;
    }
    setTimeout(() => URL.revokeObjectURL(obj), 60000);
  } catch (e) {
    if (w) w.close();
    throw e;
  }
}
