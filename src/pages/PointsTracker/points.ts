// Calculs du suivi des points (maquette « Suivi des points — écran retenu », canevas
// « Sales Hub — refonte UI »). Aucun appel réseau ici : tout part de la réponse de
// /api/crm/points, pour que l'écran et ses tests disent la même chose.

export interface Deal {
  crm_deal_id: string;
  deal_name: string;
  account_name: string;
  lead_source_group: string;
  source_overridden?: boolean;
  synced_source?: string | null;
  points: number;
  close_date: string;
}

export interface ZentactMerchant {
  merchant_account_id: string;
  business_name: string;
  sales_rep_name: string;
  opportunity_id: string | null;
  points: number;
  bonus_amount: number;
  activated_at: string;
}

export interface RepData {
  repName: string;
  probation?: { inProbation: boolean; endDate: string | null; daysLeft: number | null } | null;
  totalPoints: number;
  crmPoints: number;
  zentactPoints: number;
  zentactActivations: number;
  zentactBonus: number;
  quota: number;
  quotaMet: boolean;
  pointsToQuota: number;
  monthlyBonus: number;
  bonusTier: { points: number; bonus: number } | null;
  nextBonusTier: { points: number; bonus: number } | null;
  annualPoints: number;
  annualBonus: number;
  dealsCount: number;
  deals: Deal[];
  zentactMerchants: ZentactMerchant[];
  restricted?: boolean;
  team?: { id: number; name: string } | null;
  countsTowardQuota?: boolean;
  includeDeals?: boolean;
  includePayments?: boolean;
}

export interface TeamAgg {
  teamId: number | null;
  name: string;
  countsTowardQuota: boolean;
  includeDeals: boolean;
  includePayments: boolean;
  totalPoints: number;
  memberCount: number;
  membersMet: number;
  quotaTarget: number;
  quotaMet: boolean;
}

export interface PointsData {
  year: number;
  month: number;
  quota: number;
  reps: RepData[];
  teams?: TeamAgg[];
  companyPoints?: number;
  companyTarget?: number;
  leadSourceGroups?: string[];
}

/** Pseudo-représentant du serveur pour les activations de paiement sans représentant. */
export const UNASSIGNED = 'Unassigned';
/** Paliers du plan v7.7 (services/zohoCRMService.js). */
export const MONTHLY_TIERS = [20, 25, 30];
export const ANNUAL_TIERS = [240, 300, 360];
/** Début du plan v7.7 : l'année des bonus annuels part de là. */
export const PLAN_START = { year: 2026, month: 5 };

const ymd = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '');

/** Jours ouvrables (lundi au vendredi) d'un mois, sous forme « AAAA-MM-JJ ». */
export function workingDays(year: number, month: number): string[] {
  const out: string[] = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

/** Aujourd'hui en heure de Montréal, « AAAA-MM-JJ » (le serveur range les dates ainsi). */
export function todayYmd(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}

export interface MonthClock {
  days: string[];
  /** Nombre de jours ouvrables écoulés (aujourd'hui compris). Mois passé = tous ; futur = 0. */
  elapsed: number;
  total: number;
  remaining: number;
  /** Le mois choisi est le mois en cours : il y a une projection à faire. */
  current: boolean;
}

export function monthClock(year: number, month: number, today = todayYmd()): MonthClock {
  const days = workingDays(year, month);
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const tKey = today.slice(0, 7);
  let elapsed: number;
  if (key < tKey) elapsed = days.length;
  else if (key > tKey) elapsed = 0;
  else elapsed = days.filter((d) => d <= today).length;
  return { days, elapsed, total: days.length, remaining: days.length - elapsed, current: key === tKey };
}

/** Rang (1…n) du jour ouvrable où tombe une date ; un samedi compte avec le vendredi d'avant. */
function dayIndex(days: string[], date: string): number {
  let i = 0;
  while (i < days.length && days[i] <= date) i++;
  return Math.max(1, i);
}

/**
 * Points cumulés à la fin de chaque jour ouvrable écoulé. `null` quand le détail n'est pas
 * transmis (coéquipier vu par un représentant : le serveur retire ses ventes).
 * Seules les sources que l'équipe compte entrent dans la courbe — comme dans le total.
 */
export function cumulative(rep: RepData, clock: MonthClock): number[] | null {
  if (rep.restricted) return null;
  const perDay = new Array(clock.total).fill(0);
  if (rep.includeDeals !== false) {
    for (const d of rep.deals || []) {
      const day = ymd(d.close_date);
      if (day) perDay[dayIndex(clock.days, day) - 1] += Number(d.points) || 0;
    }
  }
  if (rep.includePayments !== false) {
    for (const m of rep.zentactMerchants || []) {
      const day = ymd(m.activated_at);
      if (day) perDay[dayIndex(clock.days, day) - 1] += Number(m.points) || 0;
    }
  }
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < Math.max(clock.elapsed, 0); i++) { s += perDay[i]; out.push(s); }
  // Le total du serveur fait foi : s'il diffère (vente sans date, arrondi), on recale le dernier point.
  if (out.length && out[out.length - 1] !== rep.totalPoints) out[out.length - 1] = rep.totalPoints;
  return out;
}

/** Projection de fin de mois au rythme actuel (mois en cours seulement). */
export function project(points: number, clock: MonthClock): number {
  if (!clock.current || clock.elapsed <= 0) return points;
  return Math.round((points / clock.elapsed) * clock.total);
}

export type Status = 'tier' | 'met' | 'onTrack' | 'atRisk' | 'behind' | 'missed';
export const STATUS_FAMILY: Record<Status, 'ok' | 'new' | 'wait' | 'err'> = {
  tier: 'ok', met: 'ok', onTrack: 'new', atRisk: 'wait', behind: 'err', missed: 'err',
};

/** Statut d'un représentant pour le mois (maquette : palier 20, quota, rythme, retard). */
export function repStatus(points: number, quota: number, proj: number, clock: MonthClock): Status {
  if (points >= MONTHLY_TIERS[0]) return 'tier';
  if (points >= quota) return 'met';
  if (!clock.current) return 'missed';
  if (proj >= quota) return 'onTrack';
  if (proj >= quota * 0.8) return 'atRisk';
  return 'behind';
}

export const isRisky = (s: Status) => s === 'atRisk' || s === 'behind' || s === 'missed';

/** Points de la semaine en cours (lundi → aujourd'hui), à partir du détail. */
export function weekPoints(rep: RepData, today = todayYmd()): number | null {
  if (rep.restricted) return null;
  const t = new Date(`${today}T12:00:00Z`);
  const monday = new Date(t);
  monday.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  const from = monday.toISOString().slice(0, 10);
  let s = 0;
  if (rep.includeDeals !== false) for (const d of rep.deals || []) { const x = ymd(d.close_date); if (x >= from && x <= today) s += Number(d.points) || 0; }
  if (rep.includePayments !== false) for (const m of rep.zentactMerchants || []) { const x = ymd(m.activated_at); if (x >= from && x <= today) s += Number(m.points) || 0; }
  return s;
}

/** Prochain palier mensuel au-dessus du total (ou null au plafond). */
export const nextMonthlyTier = (points: number) => MONTHLY_TIERS.find((p) => points < p) ?? null;
export const nextAnnualTier = (points: number) => ANNUAL_TIERS.find((p) => points < p) ?? null;

/** Mois du plan v7.7 jusqu'au mois donné compris (12 au plus, les plus récents). */
export function planMonths(year: number, month: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = PLAN_START.year, m = PLAN_START.month;
  while (y < year || (y === year && m <= month)) {
    out.push({ year: y, month: m });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out.slice(-12);
}

/** Chemin SVG d'une suite de points. */
export function linePath(vals: number[], X: (i: number) => number, Y: (v: number) => number): string {
  return vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
}
