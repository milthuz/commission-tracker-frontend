// ============================================================================
// Module Finance — lot C : moteur des prévisions (pur, sans React). Recalculé à chaque frappe.
//
//   - agrégation Mensuel / Trimestriel / Exercice (ventes, paiements) ;
//   - Prévision des ventes · BvA : réel / budget / prévision / atterrissage, statut, facteurs
//     d'écart CALCULÉS (le prototype les écrivait en dur) ;
//   - Prévision des paiements : réels Zentact (+ dérogations de la CFO), hypothèses par défaut
//     tirées des 3 derniers mois réels, boucle de prévision partant du DERNIER RÉEL, marge
//     réellement appliquée (le prototype l'affichait sans s'en servir) ;
//   - Trésorerie Holdco 13 semaines, méthode directe : soldes, scénarios = ajustements
//     explicites et nommés, semaine du minimum, autonomie (formule documentée ci-dessous) ;
//   - Investissement en ressources : coût par initiative, cumul coût / rendement, mois du seuil
//     de rentabilité CALCULÉ.
// Aucun chiffre ici : tout vient de l'API (données de Sales Hub, saisies et imports de la CFO).
// Banc d'essai : scripts/test-finance-forecasts.cjs.
// ============================================================================

export type Num = number | null;
export type Period = 'm' | 'q' | 'y';

// ---------------------------------------------------------------------------- mois
export const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`; // m = 1..12
export const ymIndex = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
export const ymFromIndex = (i: number) => ym(Math.floor(i / 12), (i % 12) + 1);
export const ymAdd = (s: string, k: number) => ymFromIndex(ymIndex(s) + k);
export const yearMonths = (y: number) => Array.from({ length: 12 }, (_, i) => ym(y, i + 1));
const sumN = (a: Num[]) => a.reduce<number>((s, v) => s + (v || 0), 0);
const allNull = (a: Num[]) => a.every((v) => v == null);
/** Somme qui reste « vide » si toutes les cellules le sont (un total à 0 laisserait croire à un réel nul). */
export const sumOrNull = (a: Num[]): Num => (allNull(a) ? null : sumN(a));

// Groupes de mois d'une année : 12 mois, 4 trimestres ou l'exercice entier.
export function periodGroups(p: Period): number[][] {
  if (p === 'm') return Array.from({ length: 12 }, (_, i) => [i]);
  if (p === 'q') return [0, 1, 2, 3].map((q) => [q * 3, q * 3 + 1, q * 3 + 2]);
  return [Array.from({ length: 12 }, (_, i) => i)];
}

// ---------------------------------------------------------------------------- ventes
export type SalesField = 'mrr' | 'merchants' | 'installs';
export const SALES_FIELDS: SalesField[] = ['mrr', 'merchants', 'installs'];
export type SalesSeries = 'budget' | 'forecast' | 'actual';
export type SalesCells = Partial<Record<SalesSeries, Record<string, Partial<Record<SalesField, number>>>>>;
export type MonthStatus = 'closed' | 'mtd' | 'future';
export interface ActualSource { source: string; values: Num[] }
export interface SalesActuals {
  mrr: ActualSource & { newMrr: Num[]; churnMrr: Num[]; newSubs: Num[]; error?: string };
  merchants: ActualSource;
  installs: ActualSource;
  payActivations: ActualSource;
}
/** Budget du modèle de drivers (année du budget maître) : séries et décomposition du MRR. */
export interface ModelBudget {
  mrr: number[]; merchants: number[]; installs: number[];
  grossMrr: number[]; churnMrr: number[]; arpu: number[];
}

/** Une source est « vivante » quand Sales Hub fournit le réel ; sinon la CFO le saisit. */
export const liveSource = (s: string) => s === 'billing' || s === 'crm' || s === 'zentact';

/**
 * MRR ajouté au budget = variation du MRR d'abonnement CANADA (canSub = canEnd × canArpu) — la base
 * comparable aux réels : l'organisation Zoho Billing « Canada » du module KPI. Décomposition EXACTE :
 *   Δ canSub_m = ajouts_m × ARPU_m − churn_m × ARPU_m + parc_{m−1} × (ARPU_m − ARPU_{m−1})
 * (le dernier terme = hausses de prix / croissance d'ARPU du parc). Le « recurring » du modèle
 * ajoute É.-U., Xperio, contrats, paiements et résiduels, absents de ces réels (ecarts/forecasts.md).
 */
export function modelSalesBudget(start: Record<string, number>, Rm: Record<string, number[]>, I: Record<string, number[]>): ModelBudget {
  const sub = Rm.canSub;
  const start0 = start.canEnd * start.canArpu;
  const mrr = sub.map((v, i) => v - (i ? sub[i - 1] : start0));
  const grossMrr = Rm.newAdds.map((n, i) => n * Rm.canArpu[i]);
  const churnMrr = sub.map((_, i) => I.canChurn[i] * Rm.canArpu[i]);
  return { mrr, merchants: [...Rm.newAdds], installs: [...Rm.newCl], grossMrr, churnMrr, arpu: [...Rm.canArpu] };
}

export interface SalesMonth {
  ym: string; status: MonthStatus;
  actual: Record<SalesField, Num>;
  budget: Record<SalesField, Num>;
  forecast: Record<SalesField, Num>;
  /** Atterrissage : réel (mois clos) ; prévision sinon réel (mois en cours) ; prévision sinon budget (à venir). */
  landing: Record<SalesField, Num>;
  landingFrom: Record<SalesField, 'actual' | 'forecast' | 'budget' | null>;
}

export function monthStatus(k: string, todayYm: string): MonthStatus {
  return k < todayYm ? 'closed' : k === todayYm ? 'mtd' : 'future';
}

export function buildSales(year: number, todayYm: string, actual: SalesActuals, cells: SalesCells, model: ModelBudget | null): SalesMonth[] {
  return yearMonths(year).map((k, i) => {
    const status = monthStatus(k, todayYm);
    const src: Record<SalesField, ActualSource> = { mrr: actual.mrr, merchants: actual.merchants, installs: actual.installs };
    const a = {} as Record<SalesField, Num>, b = {} as Record<SalesField, Num>, f = {} as Record<SalesField, Num>;
    const l = {} as Record<SalesField, Num>, lf = {} as SalesMonth['landingFrom'];
    for (const fld of SALES_FIELDS) {
      const manual = cells.actual?.[k]?.[fld];
      a[fld] = status === 'future' ? null : liveSource(src[fld].source) ? src[fld].values[i] ?? null : manual ?? null;
      b[fld] = model ? model[fld][i] : cells.budget?.[k]?.[fld] ?? null;
      f[fld] = status === 'closed' ? null : cells.forecast?.[k]?.[fld] ?? null;
      if (status === 'closed') { l[fld] = a[fld]; lf[fld] = a[fld] == null ? null : 'actual'; }
      else if (status === 'mtd') { l[fld] = f[fld] ?? a[fld]; lf[fld] = f[fld] != null ? 'forecast' : a[fld] != null ? 'actual' : null; }
      else { l[fld] = f[fld] ?? b[fld]; lf[fld] = f[fld] != null ? 'forecast' : b[fld] != null ? 'budget' : null; }
    }
    return { ym: k, status, actual: a, budget: b, forecast: f, landing: l, landingFrom: lf };
  });
}

/** Tolérance « dans la cible » : 2 % sous le budget (le prototype : −1 000 $ fixes). */
export const ON_TRACK_TOL = 0.02;
export function trackStatus(actual: Num, budget: Num): 'onTrack' | 'watch' | null {
  if (actual == null || budget == null) return null;
  return actual >= budget - Math.abs(budget) * ON_TRACK_TOL ? 'onTrack' : 'watch';
}

export interface SalesRow {
  label: { kind: Period; index: number; year: number };
  months: number[];
  status: MonthStatus | 'mixed';
  actual: Record<SalesField, Num>; budget: Record<SalesField, Num>; landing: Record<SalesField, Num>;
  variance: Num; variancePct: Num; track: 'onTrack' | 'watch' | null;
}

/** Lignes du tableau pour la période choisie. L'écart compare l'ATTERRISSAGE au budget. */
export function salesRows(months: SalesMonth[], p: Period, year: number): SalesRow[] {
  // La page calcule ses lignes AVANT d'avoir reçu les données (liste de mois vide) : rien à montrer.
  if (months.length < 12) return [];
  return periodGroups(p).map((g, index) => {
    const ms = g.map((i) => months[i]);
    const st = new Set(ms.map((m) => m.status));
    const status = st.size === 1 ? ms[0].status : 'mixed';
    const pick = (s: 'actual' | 'budget' | 'landing') => Object.fromEntries(SALES_FIELDS.map((f) => [f, sumOrNull(ms.map((m) => m[s][f]))])) as Record<SalesField, Num>;
    const actual = pick('actual'), budget = pick('budget'), landing = pick('landing');
    const variance = landing.mrr != null && budget.mrr != null ? landing.mrr - budget.mrr : null;
    const variancePct = variance != null && budget.mrr ? (variance / Math.abs(budget.mrr)) * 100 : null;
    const closed = ms.every((m) => m.status === 'closed');
    return { label: { kind: p, index, year }, months: g, status, actual, budget, landing, variance, variancePct, track: closed ? trackStatus(actual.mrr, budget.mrr) : null };
  });
}

export interface SalesTiles {
  mtd: { ym: string; mrr: Num; budget: Num; pct: Num; merchants: Num; merchantsBudget: Num; pace: Num; day: number; days: number } | null;
  ytd: { actual: number; budget: number; pct: Num; prior: Num; months: number } | null;
  fy: { landing: number; budget: Num; pct: Num };
}

/**
 * Tuiles. « Rythme » = projection LINÉAIRE du mois en cours (réel ÷ jours écoulés × jours du
 * mois), libellée comme telle. Cumul annuel = mois CLOS seulement (le mois en cours fausserait
 * la comparaison avec un budget de mois complet).
 */
export function salesTiles(months: SalesMonth[], prior: SalesMonth[] | null, todayYm: string, day: number): SalesTiles {
  const cur = months.find((m) => m.ym === todayYm) || null;
  let mtd: SalesTiles['mtd'] = null;
  if (cur) {
    const y = Number(todayYm.slice(0, 4)), mo = Number(todayYm.slice(5, 7));
    const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const pct = cur.actual.mrr != null && cur.budget.mrr ? (cur.actual.mrr / cur.budget.mrr) * 100 : null;
    const pace = cur.actual.merchants != null && day > 0 ? (cur.actual.merchants / day) * days : null;
    mtd = { ym: todayYm, mrr: cur.actual.mrr, budget: cur.budget.mrr, pct, merchants: cur.actual.merchants, merchantsBudget: cur.budget.merchants, pace, day, days };
  }
  const closed = months.filter((m) => m.status === 'closed' && m.actual.mrr != null);
  let ytd: SalesTiles['ytd'] = null;
  if (closed.length) {
    const a = sumN(closed.map((m) => m.actual.mrr));
    const bArr = closed.map((m) => m.budget.mrr);
    const b = sumN(bArr);
    const pr = prior ? sumOrNull(closed.map((m) => prior.find((p) => p.ym.slice(5) === m.ym.slice(5))?.actual.mrr ?? null)) : null;
    ytd = { actual: a, budget: b, pct: allNull(bArr) || !b ? null : ((a - b) / Math.abs(b)) * 100, prior: pr, months: closed.length };
  }
  const land = sumN(months.map((m) => m.landing.mrr));
  const bud = sumOrNull(months.map((m) => m.budget.mrr));
  return { mtd, ytd, fy: { landing: land, budget: bud, pct: bud ? ((land - bud) / Math.abs(bud)) * 100 : null } };
}

export interface VarianceDriver { key: 'volume' | 'newArpu' | 'churn' | 'base' | 'other'; value: number }
/**
 * Facteurs d'écart du MRR ajouté, mois clos et mois en cours (cumul) — se réconcilient EXACTEMENT
 * avec l'écart total :
 *   volume  = (nouveaux abonnements réels − ajouts au budget) × ARPU du budget
 *   newArpu = MRR des nouveaux réels − nouveaux réels × ARPU du budget
 *   churn   = −(MRR perdu réel − MRR perdu au budget)
 *   base    = le reste (hausses de prix et croissance d'ARPU du parc au budget, absentes des réels)
 * Sans décomposition (budget saisi, source MRR en attente) : volume sur les nouveaux marchands et
 * « autre » pour le reste.
 */
export function varianceDrivers(months: SalesMonth[], actual: SalesActuals, model: ModelBudget | null, year: number): { drivers: VarianceDriver[]; net: number; months: number } | null {
  const idx = months.map((m, i) => (m.status !== 'future' && m.actual.mrr != null && m.budget.mrr != null ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return null;
  const net = idx.reduce((s, i) => s + (months[i].actual.mrr as number) - (months[i].budget.mrr as number), 0);
  void year;
  if (model && actual.mrr.source === 'billing') {
    let volume = 0, newArpu = 0, churn = 0;
    for (const i of idx) {
      const subs = actual.mrr.newSubs[i] || 0, nm = actual.mrr.newMrr[i] || 0, cm = actual.mrr.churnMrr[i] || 0;
      volume += (subs - model.merchants[i]) * model.arpu[i];
      newArpu += nm - subs * model.arpu[i];
      churn += -(cm - model.churnMrr[i]);
    }
    const base = net - volume - newArpu - churn;
    return { drivers: [{ key: 'volume', value: volume }, { key: 'newArpu', value: newArpu }, { key: 'churn', value: churn }, { key: 'base', value: base }], net, months: idx.length };
  }
  let volume = 0;
  for (const i of idx) {
    const m = months[i];
    if (m.actual.merchants != null && m.budget.merchants) volume += (m.actual.merchants - m.budget.merchants) * ((m.budget.mrr as number) / m.budget.merchants);
  }
  return { drivers: [{ key: 'volume', value: volume }, { key: 'other', value: net - volume }], net, months: idx.length };
}

// ---------------------------------------------------------------------------- paiements
export type PayField = 'active' | 'installs' | 'conv' | 'churned' | 'grossFees' | 'residual';
export const PAY_FIELDS: PayField[] = ['active', 'installs', 'conv', 'churned', 'grossFees', 'residual'];
export interface PayActual { ym: string; active: number; installs: number; conv: number; churned: number | null; grossFees: number; residual: number }
export interface Assumptions { inst: number; conv: number; churn: number; arpuG: number; margin: number }
export type AssumptionKey = keyof Assumptions;
export const ASSUMPTION_KEYS: AssumptionKey[] = ['inst', 'conv', 'churn', 'arpuG', 'margin'];
export interface PayMonth {
  ym: string; live: boolean; overridden: PayField[];
  active: number; installs: number; conv: number; churned: number | null;
  grossFees: number; residual: number;
  /** Frais bruts par marchand actif. */
  arpu: number | null;
  /** Marge du processeur : part des frais bruts gardée par Cluster, en %. */
  margin: number | null;
}

/** Réels Zentact + dérogations de la CFO (une cellule saisie remplace la valeur lue). */
export function mergeActuals(zentact: PayActual[], overrides: Record<string, Partial<Record<PayField, number>>>, lastZentact: string | null): PayMonth[] {
  const by = new Map(zentact.map((m) => [m.ym, m]));
  const keys = new Set<string>(zentact.map((m) => m.ym));
  // Un mois sans Zentact devient réel si la CFO y a saisi le résiduel (autre processeur, retard d'import).
  for (const [k, o] of Object.entries(overrides)) if (o.residual != null || (lastZentact && k <= lastZentact)) keys.add(k);
  return [...keys].sort().map((k) => {
    const z = by.get(k);
    const o = overrides[k] || {};
    const pick = (f: PayField, d: number | null) => (o[f] != null ? (o[f] as number) : d);
    const m = {
      ym: k, live: false, overridden: PAY_FIELDS.filter((f) => o[f] != null),
      active: pick('active', z ? z.active : 0) as number, installs: pick('installs', z ? z.installs : 0) as number,
      conv: pick('conv', z ? z.conv : 0) as number, churned: pick('churned', z ? z.churned : null),
      grossFees: pick('grossFees', z ? z.grossFees : 0) as number, residual: pick('residual', z ? z.residual : 0) as number,
    };
    return { ...m, arpu: m.active ? m.grossFees / m.active : null, margin: m.grossFees ? (m.residual / m.grossFees) * 100 : null };
  });
}

/** Hypothèses par défaut = moyenne des 3 derniers mois réels (aucune valeur inventée). */
export function defaultAssumptions(actual: PayMonth[]): Assumptions | null {
  const last = actual.slice(-3);
  if (!last.length) return null;
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const rates: number[] = [];
  for (const m of last) {
    const i = actual.indexOf(m);
    const prev = i > 0 ? actual[i - 1] : null;
    if (prev && prev.active && m.churned != null) rates.push((m.churned / prev.active) * 100);
  }
  const g = last.reduce((s, m) => s + m.grossFees, 0);
  return {
    inst: avg(last.map((m) => m.installs)),
    conv: avg(last.map((m) => m.conv)),
    churn: rates.length ? avg(rates) : 0,
    arpuG: 0,
    margin: g ? (last.reduce((s, m) => s + m.residual, 0) / g) * 100 : 0,
  };
}

/**
 * Prévision : part du DERNIER mois réel (marchands ET ARPU — le prototype repartait d'un ARPU
 * arrondi), jusqu'à `untilYm`.
 *   churned_m = actifs_{m−1} × churn %
 *   actifs_m  = actifs_{m−1} + installations + ajouts conversion − churned_m
 *   ARPU_m    = ARPU_{m−1} × (1 + croissance %)
 *   frais_m   = actifs_m × ARPU_m ;  résiduel_m = frais_m × marge %
 */
export function forecastPayments(seed: PayMonth | null, a: Assumptions, untilYm: string): PayMonth[] {
  if (!seed) return [];
  const out: PayMonth[] = [];
  let act = seed.active;
  let arpu = seed.arpu ?? 0;
  for (let k = ymAdd(seed.ym, 1); k <= untilYm; k = ymAdd(k, 1)) {
    const churned = act * (a.churn / 100);
    act = act + a.inst + a.conv - churned;
    arpu *= 1 + a.arpuG / 100;
    const grossFees = act * arpu;
    out.push({ ym: k, live: true, overridden: [], active: act, installs: a.inst, conv: a.conv, churned, grossFees, residual: grossFees * (a.margin / 100), arpu, margin: a.margin });
  }
  return out;
}

/** Série complète de l'année : réels puis prévision (et les mois précédents pour FY−1). */
export function paymentSeries(actual: PayMonth[], a: Assumptions | null, year: number): { months: PayMonth[]; prior: PayMonth[]; seed: PayMonth | null } {
  const seed = actual.length ? actual[actual.length - 1] : null;
  const fc = a ? forecastPayments(seed, a, `${year}-12`) : [];
  const all = [...actual, ...fc];
  const pick = (y: number) => yearMonths(y).map((k) => all.find((m) => m.ym === k)).filter((m): m is PayMonth => !!m);
  return { months: pick(year), prior: actual.filter((m) => m.ym.startsWith(`${year - 1}-`)), seed };
}

export interface PayRow { months: number[]; last: PayMonth | null; live: boolean; mixed: boolean; installs: number; conv: number; churned: number | null; grossFees: number; residual: number; margin: number | null }
/** Agrégation : actifs / ARPU = DERNIER mois de la période ; flux = somme ; marge = Σ résiduel ÷ Σ frais. */
export function paymentRows(months: PayMonth[], p: Period, year: number): PayRow[] {
  const by = new Map(months.map((m) => [m.ym, m]));
  return periodGroups(p).map((g) => {
    const ms = g.map((i) => by.get(ym(year, i + 1))).filter((m): m is PayMonth => !!m);
    const gross = ms.reduce((s, m) => s + m.grossFees, 0);
    const res = ms.reduce((s, m) => s + m.residual, 0);
    const ch = ms.some((m) => m.churned != null) ? ms.reduce((s, m) => s + (m.churned || 0), 0) : null;
    return {
      months: g, last: ms.length ? ms[ms.length - 1] : null, live: ms.some((m) => m.live), mixed: ms.some((m) => m.live) && ms.some((m) => !m.live),
      installs: ms.reduce((s, m) => s + m.installs, 0), conv: ms.reduce((s, m) => s + m.conv, 0), churned: ch,
      grossFees: gross, residual: res, margin: gross ? (res / gross) * 100 : null,
    };
  });
}

// ---------------------------------------------------------------------------- trésorerie
export const CASH_IN = ['saas', 'residual', 'hardware', 'otherIn'] as const;
export const CASH_OUT = ['payroll', 'vendors', 'debt', 'taxes', 'otherOut'] as const;
export type CashCat = (typeof CASH_IN)[number] | (typeof CASH_OUT)[number] | 'interco';
export const CASH_CATS: CashCat[] = [...CASH_IN, ...CASH_OUT, 'interco'];
export const WEEKS = 13;
export interface Adjustment { id: string; label: string; category: CashCat | 'allIn' | 'allOut'; mode: 'pct' | 'amount'; value: number; from: number; to: number }
export interface CashWeek { n: number; start: string; open: number; cats: Record<CashCat, number>; adj: number; receipts: number; disbursements: number; net: number; close: number }
export interface CashResult {
  weeks: CashWeek[]; min: { week: number; value: number }; end: number;
  weeklyBurn: number; monthlyBurn: number; runway: number | null; runwayAboveReserve: number | null; belowReserve: number[];
}

export const weekStart = (startDate: string, i: number) => {
  const d = new Date(`${startDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * i);
  return d.toISOString().slice(0, 10);
};

/**
 * Effet net d'un ajustement de scénario sur une semaine (en $ de trésorerie : + = plus de cash).
 * Pourcentage : appliqué au montant saisi de la catégorie (une hausse de décaissement RETIRE du
 * cash). Montant : ajouté tel quel à la catégorie (entrée) ou retiré (sortie).
 */
export function adjustmentEffect(a: Adjustment, w: number, cats: Record<CashCat, number>): number {
  if (w < a.from || w > a.to) return 0;
  const sign = (c: CashCat) => ((CASH_OUT as readonly string[]).includes(c) ? -1 : 1);
  const targets: CashCat[] = a.category === 'allIn' ? [...CASH_IN] : a.category === 'allOut' ? [...CASH_OUT] : [a.category];
  if (a.mode === 'pct') return targets.reduce((s, c) => s + sign(c) * cats[c] * (a.value / 100), 0);
  // Un montant sur « toutes les entrées / sorties » compte une fois par semaine, pas par catégorie.
  return sign(targets[0]) * a.value;
}

/**
 * Solde semaine par semaine. Autonomie (« runway ») :
 *   brûlage hebdomadaire = (solde d'ouverture − solde de la semaine 13) ÷ 13
 *   brûlage mensuel      = brûlage hebdomadaire × 52 ÷ 12
 *   autonomie (mois)     = solde de la semaine 13 ÷ brûlage mensuel   (null = la trésorerie ne baisse pas)
 *   au-dessus de la réserve = (solde semaine 13 − réserve) ÷ brûlage mensuel
 * (Même résultat que le « ÷ 3 » du prototype : 13 semaines × 12 ÷ 52 = 3 mois exactement.)
 */
export function computeCash(startDate: string, opening: number, reserve: number, lines: Partial<Record<CashCat, Num[]>>, adjustments: Adjustment[]): CashResult {
  const weeks: CashWeek[] = [];
  let bal = opening;
  for (let i = 0; i < WEEKS; i++) {
    const cats = Object.fromEntries(CASH_CATS.map((c) => [c, (lines[c] && lines[c]![i]) || 0])) as Record<CashCat, number>;
    const adj = adjustments.reduce((s, a) => s + adjustmentEffect(a, i + 1, cats), 0);
    const receipts = CASH_IN.reduce((s, c) => s + cats[c], 0);
    const disbursements = CASH_OUT.reduce((s, c) => s + cats[c], 0);
    const net = receipts - disbursements + cats.interco + adj;
    const open = bal;
    bal = open + net;
    weeks.push({ n: i + 1, start: weekStart(startDate, i), open, cats, adj, receipts, disbursements, net, close: bal });
  }
  let min = { week: 1, value: weeks[0].close };
  for (const w of weeks) if (w.close < min.value) min = { week: w.n, value: w.close };
  const end = weeks[WEEKS - 1].close;
  const weeklyBurn = (opening - end) / WEEKS;
  const monthlyBurn = (weeklyBurn * 52) / 12;
  const runway = monthlyBurn > 0 ? Math.max(0, end) / monthlyBurn : null;
  const runwayAboveReserve = monthlyBurn > 0 ? Math.max(0, end - reserve) / monthlyBurn : null;
  return { weeks, min, end, weeklyBurn, monthlyBurn, runway, runwayAboveReserve, belowReserve: weeks.filter((w) => w.close < reserve).map((w) => w.n) };
}

// ---------------------------------------------------------------------------- investissement
export interface Initiative { id: string; name: string; capPct: number | null; other: Record<string, number> }
export interface InvDoc { months: string[]; initiatives: Initiative[]; returns: Record<string, number>; returnLabel: string | null; source: { sheet: string; file: string | null; importedAt: string; importedBy: string } | null }
export interface Person { id: string; type: 'Employee' | 'Contractor'; name: string; map: string; base: number | null; monthly: Record<string, number>; initiativeId: string | null; alloc: number }
export interface InitiativeCalc { id: string; name: string; capPct: number | null; employees: number; contractors: number; fte: number; payroll: Record<string, number>; other: Record<string, number>; cost: Record<string, number> }
export interface InvCalc { months: string[]; initiatives: InitiativeCalc[]; unassigned: Record<string, number>; unassignedCount: number; total: Record<string, number>; headcount: { employees: number; contractors: number; fte: number } }

// ⚠️ GARDER IDENTIQUE à commission-tracker/services/finance/forecastsCompute.js (computeInvestment) :
// le serveur fait ce calcul pour les usagers sans `finance:payroll`.
const personCost = (p: Person, k: string) => ((p.monthly && Number(p.monthly[k])) || 0) * ((p.alloc == null ? 100 : Number(p.alloc)) / 100);
export function computeInvestment(inv: InvDoc, people: Person[] | null): InvCalc {
  const months = inv.months || [];
  const inits = inv.initiatives || [];
  const ids = new Set(inits.map((i) => i.id));
  const ppl = people || [];
  const zero = () => Object.fromEntries(months.map((k) => [k, 0])) as Record<string, number>;
  const rows = inits.map((it) => {
    const mine = ppl.filter((p) => p.initiativeId === it.id);
    const payroll = zero(), other = zero(), cost = zero();
    for (const k of months) {
      payroll[k] = mine.reduce((s, p) => s + personCost(p, k), 0);
      other[k] = (it.other && Number(it.other[k])) || 0;
      cost[k] = payroll[k] + other[k];
    }
    const emp = mine.filter((p) => p.type === 'Employee');
    return {
      id: it.id, name: it.name, capPct: it.capPct == null ? null : Number(it.capPct),
      employees: emp.length, contractors: mine.length - emp.length,
      fte: emp.reduce((s, p) => s + (p.alloc == null ? 100 : Number(p.alloc)) / 100, 0),
      payroll, other, cost,
    };
  });
  const orphans = ppl.filter((p) => !p.initiativeId || !ids.has(p.initiativeId));
  const unassigned = zero();
  for (const k of months) unassigned[k] = orphans.reduce((s, p) => s + personCost(p, k), 0);
  const total = zero();
  for (const k of months) total[k] = rows.reduce((s, r) => s + r.cost[k], 0) + unassigned[k];
  const emp = ppl.filter((p) => p.type === 'Employee');
  return {
    months, initiatives: rows, unassigned, unassignedCount: orphans.length, total,
    headcount: { employees: emp.length, contractors: ppl.length - emp.length, fte: emp.reduce((s, p) => s + (p.alloc == null ? 100 : Number(p.alloc)) / 100, 0) },
  };
}

/** Coût cumulé, rendement cumulé, premier mois où le cumul du rendement rattrape le coût. */
export function breakEven(months: string[], cost: Record<string, number>, ret: Record<string, number>) {
  let c = 0, r = 0;
  const cumCost: number[] = [], cumRet: number[] = [];
  let be: number | null = null, monthly: number | null = null;
  months.forEach((k, i) => {
    c += cost[k] || 0; r += ret[k] || 0;
    cumCost.push(c); cumRet.push(r);
    if (be == null && c > 0 && r > 0 && r >= c) be = i;
    if (monthly == null && (ret[k] || 0) > 0 && (ret[k] || 0) >= (cost[k] || 0)) monthly = i;
  });
  return { cumCost, cumRet, index: be as number | null, ym: be == null ? null : months[be as number], monthlyIndex: monthly as number | null, monthlyYm: monthly == null ? null : months[monthly as number], gap: r - c };
}

/** Part capitalisable du coût d'un exercice (initiatives sans taux = « non défini », exclues du taux). */
export function capitalizable(calc: InvCalc, months: string[]) {
  let withRate = 0, cap = 0, noRate = 0;
  for (const it of calc.initiatives) {
    const c = months.reduce((s, k) => s + (it.cost[k] || 0), 0);
    if (it.capPct == null) noRate += c; else { withRate += c; cap += (c * it.capPct) / 100; }
  }
  noRate += months.reduce((s, k) => s + (calc.unassigned[k] || 0), 0);
  return { pct: withRate ? (cap / withRate) * 100 : null, amount: cap, uncovered: noRate };
}
