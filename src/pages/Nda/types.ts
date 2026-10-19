export { authHeaders } from '../../lib/auth';
export const API_URL = import.meta.env.VITE_API_URL;

export type NdaStatus = 'draft' | 'sent' | 'viewed' | 'party_signed' | 'completed' | 'declined' | 'cancelled';
export type NdaMode = 'template' | 'upload';

export interface NdaData {
  mode: NdaMode;
  lang: 'en' | 'fr';
  company: { legalName: string; address: string; city: string; province: string; postalCode: string; country: string };
  signer: { firstName: string; lastName: string; title: string; email: string };
  purpose: string;
  effectiveDate: string;
  team: string;
  notes: string;
  // En copie : avis d'envoi (sans le lien de signature) + copie signée.
  cc?: string[];
}

export interface NdaListItem {
  id: string;
  ref: string;
  status: NdaStatus;
  mode: NdaMode;
  company: string;
  email: string;
  signerName: string;
  team: string;
  lang: 'en' | 'fr';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  partySignedAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  cancelledAt: string | null;
  tokenExpiresAt: string | null;
}

export interface NdaEvent { event: string; actor: string | null; ip: string | null; detail: Record<string, any>; at: string }
export interface NdaAttachment { id: number; filename: string; size: number; sha256: string; uploadedBy: string; createdAt: string }

export interface NdaDetail extends NdaListItem {
  nda: NdaData;
  clusterSigner: { name: string; title: string; email: string } | null;
  declineReason: string | null;
  partySig: { name: string; title?: string; at: string; ip: string; ua?: string } | null;
  clusterSig: { name: string; email: string; at: string; ip: string } | null;
  attachments: NdaAttachment[];
  events: NdaEvent[];
  emailed?: boolean;
  link?: string | null;
}

export interface EmailPreview {
  from: string | null;
  to: string;
  subject: string;
  html: string;
  cc: string[];
  ccNotice: { subject: string; html: string } | null;
}

export interface Signer { name: string; titleEn: string; titleFr: string; email: string }

export interface NdaMeta {
  signer: Signer;
  defaultPurpose: { en: string; fr: string };
  can: { send: boolean; viewAll: boolean; countersign: boolean; editSigner: boolean };
}

// Le contenu défile dans le conteneur du DefaultLayout, pas dans window.
export const scrollToTop = () => document.getElementById('nda-top')?.scrollIntoView({ block: 'start' });

// Même liste que DELETABLE côté serveur : jamais un NDA signé ni en cours de signature.
export const DELETABLE: NdaStatus[] = ['draft', 'cancelled', 'declined'];

export const statusFamily: Record<NdaStatus, 'neutral' | 'new' | 'wait' | 'ok' | 'err'> = {
  draft: 'neutral', sent: 'new', viewed: 'new', party_signed: 'wait', completed: 'ok', declined: 'err', cancelled: 'neutral',
};
