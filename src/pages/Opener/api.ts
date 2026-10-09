// Module Opener — types et appels à l'API (services/opener/field.js côté serveur).

const API_URL = import.meta.env.VITE_API_URL || '';

export type PlaceStatus = 'client' | 'former' | 'prospect' | 'new';
export type ServiceType = 'tables' | 'quick' | 'both';
export type Version = 'v1' | 'v2';
export type Service = 'payments' | 'pos' | 'beverage_control';
export type SkipReason = 'closed' | 'no_time' | 'refused' | 'other' | 'postponed' | 'excluded';
// Verdict d'une visite, d'après la position GPS au check-in (serveur : field.js, verdict()).
export type Verdict = 'onsite' | 'far' | 'imprecise' | 'nogps';
// Visite d'un client Cluster : qui traite ses paiements.
export type PaymentsBy = 'cluster' | 'other' | 'unknown';

export interface ClusterInfo {
  status: PlaceStatus;
  version?: Version | null;
  clusterName?: string | null;
  source?: 'kaizen' | 'billing' | null;
  lastVisitAt?: string | null;
  lastVisitBy?: string | null;
  competitorPos?: string | null;
  serviceTypeSeen?: ServiceType | null;
  lastInterest?: number | null;
  lastSatisfaction?: number | null;
  seasonal?: boolean;   // client dont tous les abonnements sont en pause
  lastPaymentsBy?: PaymentsBy | null;
  lead?: { id: number; refCode: string; status: string } | null;
  visits?: number;
}

export interface ScannedPlace extends ClusterInfo {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  reviews: number | null;
  primaryType: string | null;
  serviceType: ServiceType | null;
}

export interface Stop extends ClusterInfo {
  id: number;
  placeId: string;
  position: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  outcome: 'planned' | 'done' | 'skipped';
  skipReason: SkipReason | null;
  doneAt: string | null;
  checkin: { id: string; at: string; interest: number; leadId: number | null; decisionMaker: string | null; currentPos: string;
    distanceM?: number | null; accuracyM?: number | null; verdict?: Verdict;
    startedAt?: string | null; durationMin?: number | null; endDistanceM?: number | null } | null;
}

export interface Route {
  id: number;
  name: string;
  date: string;
  openerEmail: string | null;
  openerName: string | null;
  status: 'draft' | 'published' | 'closed';
  zone: [number, number][] | null;
  start: [number, number] | null;
  version: number;
  publishedAt: string | null;
  publishedBy: string | null;
  updatedAt: string;
  stops: Stop[];
}

export interface RouteSummary {
  id: number; name: string; date: string; openerEmail: string | null; openerName: string | null;
  status: Route['status']; stops: number; done: number; updatedAt: string; version: number;
}

export interface PlaceCard {
  placeId: string;
  google: {
    name: string | null; address: string | null; lat: number | null; lng: number | null;
    rating: number | null; reviews: number | null; priceLevel: string | null; category: string | null;
    phone: string | null; website: string | null; mapsUrl: string | null; openNow: boolean | null;
    hours: string[]; serviceType: ServiceType | null; businessStatus: string | null;
    city: string | null; province: string | null; postalCode: string | null;
  } | null;
  googleError: string | null;
  cluster: ClusterInfo;
  history: {
    id: string; at: string; by: string; currentPos: string; serviceType: ServiceType; terminals: number | null;
    decisionMaker: string | null; interest: number; services: Service[]; notes: string | null; leadRef: string | null;
    distanceM?: number | null; verdict?: Verdict; durationMin?: number | null;
    satisfaction?: number | null; paymentsBy?: PaymentsBy | null;
  }[];
}

export interface DaySummary {
  date: string;
  route: { id: number; name: string; status: Route['status'] } | null;
  stats: { stops: number; done: number; skipped: number; checkins: number; leads: number; decisionMakers: number; distanceM: number; durationMin: number;
    visitMinutes: number; avgVisitMin: number | null };
  leads: { id: number; refCode: string; businessName: string; status: string; interest: string[]; level: number | null }[];
  notVisited: { id: number; name: string; status: PlaceStatus; outcome: Stop['outcome']; skipReason: SkipReason | null }[];
}

// Vue de suivi (GET /api/opener/routes-overview).
export interface OverviewRoute {
  id: number; name: string; date: string; status: Route['status']; openerEmail: string | null; openerName: string | null;
  zone: [number, number][] | null; total: number; done: number; skipped: number;
  stops: { id: number; name: string; lat: number | null; lng: number | null; outcome: Stop['outcome']; skipReason: SkipReason | null; doneAt: string | null;
    checkin: { at: string; lat: number | null; lng: number | null; distanceM: number | null; accuracyM: number | null; verdict: Verdict;
      startedAt: string | null; durationMin: number | null; endDistanceM: number | null } | null }[];
  verdicts: Partial<Record<Verdict, number>>;
  visitMinutes: number;
  lastCheckin: { at: string; lat: number | null; lng: number | null; stopName: string; distanceM: number | null } | null;
}

export const VERDICT_COLOR: Record<Verdict, string> = { onsite: '#57D193', far: '#F87171', imprecise: '#F2B53C', nogps: '#94A3B8' };

// Campagne de couverture (GET /api/opener/campaign).
export type CampaignStatus = 'todo' | 'planned' | 'done';
export interface CampaignRegion {
  key: string; fr: string; en: string; polygon: [number, number][];
  cells: { total: number; done: number };
  places: { total: number; clients: number; visited: number };
}
export interface CampaignRoute {
  id: number; seq: number; region: string; mode: 'walk' | 'car'; n: number; minutes: number; meters: number;
  hull: [number, number][]; centroid: [number, number]; status: CampaignStatus; routeId: number | null;
  date: string | null; openerEmail: string | null; openerName: string | null; visited: number; clients?: number;
}
export interface Campaign {
  regions: CampaignRegion[];
  excluded: number;
  inventory: { running: boolean; progress: { done: number; total: number; cells?: number; places?: number } | null;
    last: { at: string; calls: number; cells: number; places: number; stopped?: string } | null };
  computed: { at: string; routes: number; places: number; walk: number; car: number } | null;
  routes: CampaignRoute[];
}
export interface CampaignRouteDetail {
  id: number; seq: number; region: string; mode: 'walk' | 'car'; minutes: number; meters: number; status: CampaignStatus; routeId: number | null;
  stops: (ClusterInfo & { placeId: string; name: string | null; address: string | null; lat: number | null; lng: number | null; kind: string | null })[];
}
export const CAMPAIGN_COLOR: Record<CampaignStatus, string> = { todo: '#64748B', planned: '#3C50E0', done: '#10B981' };

export interface CheckinInput {
  id: string; placeId: string; stopId?: number | null; at: string;
  lat?: number | null; lng?: number | null; accuracy?: number | null;
  startedAt?: string | null; startLat?: number | null; startLng?: number | null; startAccuracy?: number | null;
  currentPos: string; serviceType: ServiceType; terminals: number; onlineDelivery: boolean;
  decisionMaker: 'yes' | 'no' | 'later' | null; interest: number; services: Service[]; notes: string;
  satisfaction?: number | null; paymentsBy?: PaymentsBy | null;
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data);
  return data as T;
}

// Identifiant généré sur le téléphone : un check-in mis en file hors ligne garde le même, et le
// serveur l'ignore s'il l'a déjà reçu.
export const uuid = () => (crypto as any).randomUUID
  ? (crypto as any).randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export const haversine = (a: [number, number], b: [number, number]) => {
  const R = 6371000, rad = (d: number) => (d * Math.PI) / 180;
  const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
};

// Couleurs de statut du brief de design (pins, points, badges).
export const STATUS_COLOR: Record<PlaceStatus, string> = {
  client: '#57D193', former: '#7FA6C9', prospect: '#F58346', new: '#AEB7C0',
};
// Texte par variable (field.css) : pastel en sombre, teinte foncée en clair.
export const STATUS_BADGE: Record<PlaceStatus, string> = {
  client: 'bg-[rgba(87,209,147,.15)] text-[var(--of-st-client)]',
  former: 'bg-[rgba(127,166,201,.18)] text-[var(--of-st-former)]',
  prospect: 'bg-[rgba(245,131,70,.15)] text-[var(--of-st-prospect)]',
  new: 'bg-[rgba(138,153,175,.18)] text-[var(--of-st-new)]',
};

// Durée en minutes → « 17 min » ou « 1 h 05 ».
export const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);

export const fmtDistance = (m: number, lng: string) =>
  m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString(lng === 'fr' ? 'fr-CA' : 'en-CA', { maximumFractionDigits: 1 })} km`;
// Minutes de marche à 4,8 km/h.
export const walkMin = (m: number) => Math.max(1, Math.round(m / 80));

export const directionsUrl = (lat: number, lng: number, placeId?: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}${placeId ? `&destination_place_id=${encodeURIComponent(placeId)}` : ''}&travelmode=walking`;
