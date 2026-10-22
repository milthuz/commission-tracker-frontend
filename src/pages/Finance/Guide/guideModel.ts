// ============================================================================
// Module Finance — lot H : calculs PURS du guide (sans React, sans réseau).
//   - règle des 40, leviers chiffrés, comparaison aux repères (GARDER IDENTIQUES à
//     commission-tracker/services/finance/guideCore.js : le banc d'essai les compare) ;
//   - indicateurs du modèle FY2027 comparables aux repères ;
//   - questions aux gestionnaires, tirées des chiffres du modèle ;
//   - textes copiables (prompts) des pistes d'économies et des zones à améliorer.
//
// 🔑 Aucun nom d'employé ni salaire : la paie n'entre ici qu'en TOTAUX par poste du P&L (la même
// donnée agrégée que le serveur envoie à tous) et en effectif TOTAL. Le banc d'essai le vérifie
// contre l'effectif réel de la CFO.
// ============================================================================
import { COGS_GL, MAPS, MONTHS, REV_CATS, sum, type FinanceResult, type PayrollAgg, type Reference } from '../model';
import type { Formatter } from '../format';
import type { Benchmark, Department, Lead, Levers, MetricKey } from './api';

export const THRESHOLD = 40;
export const TOLERANCE_PCT = 5;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------- règle des 40
export const growthPct = (cur: number | null | undefined, prior: number | null | undefined): number | null =>
  (finite(cur) && finite(prior) && prior > 0 ? ((cur - prior) / prior) * 100 : null);
export const marginPct = (profit: number | null | undefined, revenue: number | null | undefined): number | null =>
  (finite(profit) && finite(revenue) && revenue > 0 ? (profit / revenue) * 100 : null);

export function rule40(growth: number | null, margin: number | null) {
  if (!finite(growth) || !finite(margin)) return { growth: finite(growth) ? growth : null, margin: finite(margin) ? margin : null, score: null, gap: null, passes: null };
  const score = growth + margin;
  return { growth, margin, score, gap: score - THRESHOLD, passes: score >= THRESHOLD };
}

export interface LeverInput { revenue: number | null; priorRevenue: number | null; profit: number | null; opex: number | null }
export function levers(input: LeverInput): Levers {
  const { revenue, priorRevenue, profit, opex } = input;
  const growth = growthPct(revenue, priorRevenue);
  const margin = marginPct(profit, revenue);
  const r = rule40(growth, margin);
  const onePtGrowthRevenue = finite(priorRevenue) && priorRevenue > 0 ? priorRevenue * 0.01 : null;
  const onePtMarginOpex = finite(revenue) && revenue > 0 ? revenue * 0.01 : null;
  const shortfall = r.gap != null && r.gap < 0 ? -r.gap : 0;
  const extraRevenueNeeded = r.gap == null ? null : (onePtGrowthRevenue == null ? null : onePtGrowthRevenue * shortfall);
  const costCutNeeded = r.gap == null ? null : (onePtMarginOpex == null ? null : onePtMarginOpex * shortfall);
  const costCutPctOfOpex = costCutNeeded != null && finite(opex) && opex > 0 ? (costCutNeeded / opex) * 100 : null;
  return { ...r, onePtGrowthRevenue, onePtMarginOpex, shortfall, extraRevenueNeeded, costCutNeeded, costCutPctOfOpex };
}
export const marginPtsFromCut = (cut: number, revenue: number): number | null => (finite(cut) && finite(revenue) && revenue > 0 ? (cut / revenue) * 100 : null);

// ---------------------------------------------------------------------------- repères
export type CompareStatus = 'to_validate' | 'no_metric' | 'on_par' | 'better' | 'worse';
export interface Compared { id: string; metric: string; status: CompareStatus; flag: boolean; delta: number | null; current: number | null }
export function compareBenchmarks(metrics: Partial<Record<string, number | null>> | null, benchmarks: Pick<Benchmark, 'id' | 'metric' | 'value' | 'direction' | 'useForFlags'>[], tolPct = TOLERANCE_PCT): Compared[] {
  return benchmarks.map((b) => {
    const base = { id: b.id, metric: b.metric };
    if (b.value == null || !finite(Number(b.value))) return { ...base, status: 'to_validate' as const, flag: false, delta: null, current: null };
    const bv = Number(b.value);
    const cur = metrics ? metrics[b.metric] : null;
    if (!finite(cur)) return { ...base, status: 'no_metric' as const, flag: false, delta: null, current: null };
    const delta = cur - bv;
    let status: CompareStatus;
    if (Math.abs(delta) <= (Math.abs(bv) * tolPct) / 100) status = 'on_par';
    else if (b.direction === 'lower_better') status = delta < 0 ? 'better' : 'worse';
    else status = delta > 0 ? 'better' : 'worse';
    return { ...base, status, flag: status === 'worse' && b.useForFlags !== false, delta, current: cur };
  });
}

// Département à qui poser la question quand une mesure est à améliorer.
export const METRIC_DEPT: Record<MetricKey, GroupId> = {
  rule_of_40: 'accounting', revenue_growth: 'sales', gross_margin: 'support_ops', ebitda_margin: 'accounting', sm_pct: 'sales', rd_pct: 'rnd',
  ga_pct: 'accounting', recurring_share: 'sales', churn_annual: 'support_ops', cac_payback_months: 'sales', ltv_cac: 'sales',
  arpu_monthly: 'sales', arr_per_location: 'sales', nrr: 'support_ops', grr: 'support_ops',
};

// ---------------------------------------------------------------------------- indicateurs du modèle
// Les mesures « proxy » (coût d'acquisition, récupération, LTV/CAC) utilisent TOUT le S&M du budget
// et l'ARPU de décembre : l'écran le dit.
export function modelMetrics(result: FinanceResult, ref: Reference) {
  const M = result.master, K = result.kpis;
  const tRev = sum(M.tRev);
  const profit = sum(M.ebitda);
  const opex = sum(M.tOpex);
  const priorRevenue = ref.a26.rev;
  const g = growthPct(tRev, priorRevenue);
  const mg = marginPct(profit, tRev);
  const r = rule40(g, mg);
  const sm = sum(M.opex['Sales & Marketing']);
  const gm = K.grossProfit.margin;
  const added = K.rooftops.added;
  const arpuM = K.arpu.end;
  const opening = ref.start.prevTot;
  const annualChurn = finite(opening) && opening > 0 ? (K.rooftops.churn / opening) * 100 : null;
  const cac = added > 0 ? sm / added : null;
  const gmFrac = gm / 100;
  const payback = cac != null && arpuM > 0 && gmFrac > 0 ? cac / (arpuM * gmFrac) : null;
  const ltv = annualChurn != null && annualChurn > 0 && arpuM > 0 ? (arpuM * 12 * gmFrac) / (annualChurn / 100) : null;
  const num = (v: number | null) => (v != null && Number.isFinite(v) ? v : null);
  const metrics: Record<MetricKey, number | null> = {
    rule_of_40: num(r.score), revenue_growth: num(g), gross_margin: num(gm), ebitda_margin: num(mg),
    sm_pct: tRev > 0 ? (sm / tRev) * 100 : null,
    rd_pct: tRev > 0 ? (sum(M.opex['Research & Development']) / tRev) * 100 : null,
    ga_pct: tRev > 0 ? (sum(M.opex['General & Administrative']) / tRev) * 100 : null,
    recurring_share: num(K.revenue.recurringShare),
    churn_annual: num(annualChurn),
    cac_payback_months: num(payback),
    ltv_cac: cac != null && cac > 0 && ltv != null ? num(ltv / cac) : null,
    arpu_monthly: num(arpuM),
    arr_per_location: K.rooftops.ending > 0 ? num(K.mrr.exitArr / K.rooftops.ending) : null,
    nrr: null, grr: null,
  };
  const inputs: LeverInput = { revenue: tRev, priorRevenue, profit, opex };
  return { metrics, inputs, levers: levers(inputs) };
}

// ---------------------------------------------------------------------------- questions
export type GroupId = 'sales' | 'support_ops' | 'accounting' | 'rnd';
export const GROUPS: GroupId[] = ['sales', 'support_ops', 'accounting', 'rnd'];
const GENERAL_COUNT: Record<GroupId, number> = { sales: 5, support_ops: 6, accounting: 6, rnd: 5 };
export const GENERAL_COUNTS = GENERAL_COUNT;

// Drivers de revenus / COGS qui donnent une question (le reste est un calcul, pas une hypothèse).
export const DRIVER_Q: Record<string, { group: GroupId; kind: 'n' | '%' | '$' }> = {
  intAdds: { group: 'sales', kind: 'n' }, resAdds: { group: 'sales', kind: 'n' }, xpAdds: { group: 'sales', kind: 'n' },
  canChurn: { group: 'support_ops', kind: 'n' }, usaChurn: { group: 'support_ops', kind: 'n' }, xpChurn: { group: 'support_ops', kind: 'n' },
  canArpuG: { group: 'sales', kind: '%' }, usaArpuG: { group: 'sales', kind: '%' }, xpArpuG: { group: 'sales', kind: '%' },
  contractsG: { group: 'sales', kind: '%' }, residG: { group: 'sales', kind: '%' },
  adyenTarget: { group: 'sales', kind: 'n' }, convPct: { group: 'sales', kind: '%' }, adyenChurn: { group: 'support_ops', kind: 'n' }, adyenArpuG: { group: 'sales', kind: '%' },
  partnerPayG: { group: 'sales', kind: '%' }, newClientPct: { group: 'sales', kind: '%' }, installPrice: { group: 'sales', kind: 'n' }, discount: { group: 'sales', kind: 'n' },
  licG: { group: 'sales', kind: '%' }, revShare: { group: 'sales', kind: '%' },
  halukPct: { group: 'support_ops', kind: '%' }, onsites: { group: 'support_ops', kind: 'n' }, jobCost: { group: 'support_ops', kind: 'n' },
  hostingG: { group: 'support_ops', kind: '%' }, merchantFees: { group: 'accounting', kind: '$' }, platformFees: { group: 'accounting', kind: '$' },
};
// Ligne de COGS → qui répond. (Hypothèse à confirmer par la CFO : voir ecarts/guide.md.)
export const COGS_GROUP: Record<string, GroupId> = {
  supportWages: 'support_ops', supportContr: 'support_ops', supportSw: 'support_ops', hosting: 'support_ops',
  merchantFees: 'accounting', platformFees: 'accounting', payout: 'sales',
  clHwCogs: 'support_ops', xpHwCogs: 'support_ops',
  // SH-49 : COGS de service détaillés en deux blocs ; ils remplacent nnWages, exWages, svcContr et
  // svcSw, qu'ils répartissent (garder les deux compterait ces montants deux fois).
  nnDelWages: 'support_ops', nnImplWages: 'support_ops', nnSw: 'support_ops', nnImplSw: 'support_ops', nnAuto: 'support_ops', nnContr: 'support_ops',
  exSvcWages: 'support_ops', exImplWages: 'support_ops', exSw: 'support_ops', exImplSw: 'support_ops', exAuto: 'support_ops', exContr: 'support_ops',
  travel: 'support_ops', licCogs: 'support_ops',
};
const MAP_GROUP: Record<string, GroupId> = { 'S&M': 'sales', 'R&D': 'rnd', 'G&A': 'accounting', 'Recurring COGS': 'support_ops', 'Service COGS': 'support_ops' };
const MAP_KEY: Record<string, string> = { 'S&M': 'sm', 'R&D': 'rd', 'G&A': 'ga', 'Recurring COGS': 'recurringCogs', 'Service COGS': 'serviceCogs' };
const SECTION_GROUP = (s: string | null): GroupId => (s === 'Sales & Marketing' ? 'sales' : s === 'Research & Development' ? 'rnd' : 'accounting');

export interface Question { id: string; group: GroupId; kind: string; text: string; copy: string }
export interface QInput {
  ref: Reference;
  result: FinanceResult;
  /** Croissance mensuelle saisie par ligne d'OPEX (finance_state 'opex' → opxG). */
  opxG: Record<string, number>;
  /** Totaux de paie par poste (la donnée agrégée envoyée à tous, jamais la liste de noms). */
  payroll: Pick<PayrollAgg, 'payByMap' | 'conByMap' | 'headcount' | 'contractorCount'>;
  fiscalYear: number;
  fmt: Formatter;
  /** Libellé d'une ligne de COGS (clé de série du modèle). */
  label: (key: string) => string;
  /** Traduction sous finance.guide.* avec paramètres. */
  L: (key: string, params?: Record<string, string | number>) => string;
}

const MIN_ABS = 2500;
const rank = <T,>(a: T[], f: (x: T) => number) => [...a].sort((x, y) => f(y) - f(x));

export function buildQuestions(inp: QInput): Question[] {
  const { ref, result, fmt, L } = inp;
  const tRev = sum(result.master.tRev);
  const floor = Math.max(MIN_ABS, 0.002 * tRev);
  const money = (v: number) => fmt.fmt(v, '$');
  const pctOf = (v: number) => (tRev > 0 ? fmt.pct((v / tRev) * 100) : '—');
  const monthLabels = fmt.months(inp.fiscalYear % 100);
  const out: Question[] = [];
  const add = (group: GroupId, id: string, kind: string, key: string, params: Record<string, string | number>) => {
    const text = L(key, params);
    out.push({ id, group, kind, text, copy: L('copyWrap', { group: L(`group.${group}`), fy: inp.fiscalYear, question: text }) });
  };

  // --- lignes d'OPEX, avec leur section (S&M / R&D / G&A) et leur FY2026 de base
  interface OLine { key: string; name: string; group: GroupId; pay: boolean; fy27: number; fy26: number | null; vals: number[] }
  const lines: OLine[] = [];
  let sec: string | null = null;
  for (const it of ref.opex) {
    if (it.t === 'sec') { sec = it.name; continue; }
    if (it.t !== 'line' || !it.key) continue;
    const vals = result.opex27.byKey[it.key];
    if (!vals) continue;
    const v26 = it.v ? it.v.slice(0, 12) : null;
    lines.push({ key: it.key, name: it.name, group: SECTION_GROUP(sec), pay: !!it.pay, fy27: sum(vals), fy26: v26 && v26.length === 12 ? sum(v26.map((x) => +x || 0)) : null, vals });
  }

  // 1) sommaire par groupe
  const spend: Record<GroupId, number> = { sales: 0, support_ops: 0, accounting: 0, rnd: 0 };
  for (const l of lines) spend[l.group] += l.fy27;
  for (const [k, g] of Object.entries(COGS_GROUP)) if (result.Rm[k]) spend[g] += sum(result.Rm[k]);
  for (const g of GROUPS) add(g, `groupTotal:${g}`, 'groupTotal', 'q.groupTotal', { group: L(`group.${g}`), amt: money(spend[g]), pctRev: pctOf(spend[g]) });

  // 2) paie : totaux par poste du P&L (employés + contractuels), jamais de nom
  for (const mp of MAPS) {
    const emp = inp.payroll.payByMap[mp] || [], con = inp.payroll.conByMap[mp] || [];
    const monthly = Array.from({ length: MONTHS }, (_, i) => (emp[i] || 0) + (con[i] || 0));
    const total = sum(monthly);
    if (total <= 0) continue;
    const jan = monthly[0], dec = monthly[11];
    add(MAP_GROUP[mp], `payrollMap:${MAP_KEY[mp]}`, 'payrollMap', 'q.payrollMap', {
      map: L(`mapName.${MAP_KEY[mp]}`), amt: money(total), pctRev: pctOf(total), jan: money(jan), dec: money(dec),
      change: jan > 0 ? fmt.pct(((dec - jan) / jan) * 100, true) : '—',
    });
  }
  for (const l of lines.filter((x) => x.pay && x.fy27 > 0)) {
    add(l.group, `payroll:${l.key}`, 'payroll', 'q.payrollLine', {
      line: l.name, amt: money(l.fy27), pctRev: pctOf(l.fy27),
      vs26: l.fy26 != null && l.fy26 > 0 ? fmt.pct(((l.fy27 - l.fy26) / l.fy26) * 100, true) : '—',
    });
  }

  // 3) OPEX non salarial : variations, plus gros postes, lignes irrégulières, croissance saisie
  const plain = lines.filter((l) => !l.pay);
  for (const g of GROUPS) {
    const mine = plain.filter((l) => l.group === g);
    const changed = rank(mine.filter((l) => {
      if (l.fy26 == null) return false;
      const d = l.fy27 - l.fy26;
      const p = l.fy26 > 0 ? (d / l.fy26) * 100 : null;
      return Math.abs(d) >= floor && (p == null || Math.abs(p) >= 10);
    }), (l) => Math.abs(l.fy27 - (l.fy26 as number))).slice(0, 4);
    for (const l of changed) {
      const d = l.fy27 - (l.fy26 as number);
      add(g, `opexChange:${l.key}`, 'opexChange', (l.fy26 as number) > 0 ? 'q.opexChange' : 'q.opexNew', {
        line: l.name, a: money(l.fy26 as number), b: money(l.fy27), delta: `${d >= 0 ? '+' : '−'}${money(Math.abs(d))}`,
        pct: (l.fy26 as number) > 0 ? fmt.pct((d / (l.fy26 as number)) * 100, true) : '—',
      });
    }
    for (const l of rank(mine.filter((x) => x.fy27 > 0), (x) => x.fy27).slice(0, 3)) {
      add(g, `opexBig:${l.key}`, 'opexBig', 'q.opexBig', { line: l.name, amt: money(l.fy27), pctRev: pctOf(l.fy27) });
    }
    const vol = mine.map((l) => {
      const mean = l.fy27 / MONTHS;
      const sd = Math.sqrt(l.vals.reduce((a, v) => a + (v - mean) ** 2, 0) / MONTHS);
      return { l, cv: mean > 0 ? sd / mean : 0 };
    }).filter((x) => x.cv > 0.5 && x.l.fy27 >= floor);
    for (const { l } of rank(vol, (x) => x.cv).slice(0, 2)) {
      let lo = 0, hi = 0;
      l.vals.forEach((v, i) => { if (v < l.vals[lo]) lo = i; if (v > l.vals[hi]) hi = i; });
      add(g, `opexVolatile:${l.key}`, 'opexVolatile', 'q.opexVolatile', { line: l.name, min: money(l.vals[lo]), minMonth: monthLabels[lo], max: money(l.vals[hi]), maxMonth: monthLabels[hi] });
    }
    for (const l of mine) {
      const gr = inp.opxG[l.key];
      if (!gr) continue;
      add(g, `opexGrowth:${l.key}`, 'opexGrowth', 'q.opexGrowth', { line: l.name, g: fmt.pct(gr, true), total: fmt.pct((Math.pow(1 + gr / 100, 11) - 1) * 100, true) });
    }
  }

  // 4) hypothèses des drivers de revenus et de COGS
  for (const [key, d] of Object.entries(DRIVER_Q)) {
    const v = result.I[key];
    if (!v) continue;
    const f = (x: number) => (d.kind === '%' ? fmt.pct(x) : d.kind === '$' ? money(x) : fmt.fmt(x, 'n'));
    add(d.group, `driver:${key}`, 'driver', 'q.driver', { name: L(`driverName.${key}`), jan: f(v[0]), dec: f(v[11]), avg: f(sum(v) / MONTHS), total: d.kind === '%' ? '—' : f(sum(v)) });
  }

  // 5) lignes de COGS : variations et poids dans le revenu
  const cogsKeys = [...new Set(REV_CATS.flatMap((c) => COGS_GL[c]))].filter((k) => result.Rm[k] && COGS_GROUP[k]);
  const cogs = cogsKeys.map((k) => ({ k, fy27: sum(result.Rm[k]), fy26: typeof ref.fy26[k] === 'number' ? ref.fy26[k] : null }));
  for (const c of rank(cogs.filter((x) => x.fy26 != null && x.fy26 > 0 && Math.abs(x.fy27 - x.fy26) >= floor && Math.abs((x.fy27 - x.fy26) / x.fy26) * 100 >= 10), (x) => Math.abs(x.fy27 - (x.fy26 as number))).slice(0, 5)) {
    const d = c.fy27 - (c.fy26 as number);
    add(COGS_GROUP[c.k], `cogsChange:${c.k}`, 'cogsChange', 'q.cogsChange', {
      line: inp.label(c.k), a: money(c.fy26 as number), b: money(c.fy27), delta: `${d >= 0 ? '+' : '−'}${money(Math.abs(d))}`, pct: fmt.pct((d / (c.fy26 as number)) * 100, true),
    });
  }
  for (const c of rank(cogs.filter((x) => x.fy27 > 0), (x) => x.fy27).slice(0, 4)) {
    add(COGS_GROUP[c.k], `cogsBig:${c.k}`, 'cogsBig', 'q.cogsBig', { line: inp.label(c.k), amt: money(c.fy27), pctRev: pctOf(c.fy27) });
  }

  // 6) questions de fond (sans chiffre propre), par groupe
  for (const g of GROUPS) {
    for (let i = 1; i <= GENERAL_COUNT[g]; i++) {
      add(g, `general:${g}:${i}`, 'general', `q.general.${g}.${i}`, { headcount: inp.payroll.headcount, contractors: inp.payroll.contractorCount });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------- prompts des pistes
export type LFn = (key: string, params?: Record<string, string | number>) => string;

export function leadPrompt(lead: Lead, fmt: Formatter, L: LFn, monthLabel: (m: string) => string): string {
  const dept = lead.department ? L(`dept.${lead.department}`) : L('s.noDept');
  const params = {
    account: lead.accountName, month: monthLabel(lead.month), amt: fmt.fmt(lead.amount, '$'), base: fmt.fmt(lead.baseline, '$'),
    delta: fmt.fmt(lead.deltaAbs, '$'), pct: lead.deltaPct == null ? L('s.newSpend') : fmt.pct(lead.deltaPct, true),
    dept, owner: lead.owner || L('s.noOwner'),
  };
  return L(lead.type === 'vs_avg' ? 's.prompt.vsAvg' : 's.prompt.vsLastYear', params);
}

export function topAccountPrompt(a: { accountName: string; windowTotal: number; sharePct: number | null; owner: string | null; department: Department | null }, months: number, fmt: Formatter, L: LFn): string {
  return L('s.prompt.top', {
    account: a.accountName, amt: fmt.fmt(a.windowTotal, '$'), months, share: a.sharePct == null ? '—' : fmt.pct(a.sharePct),
    dept: a.department ? L(`dept.${a.department}`) : L('s.noDept'), owner: a.owner || L('s.noOwner'),
  });
}

export function variancePrompt(v: { line: string; month: string; actual: number; budget: number }, fmt: Formatter, L: LFn): string {
  const d = v.actual - v.budget;
  return L('s.prompt.variance', { line: v.line, month: v.month, actual: fmt.fmt(v.actual, '$'), budget: fmt.fmt(v.budget, '$'), delta: `${d >= 0 ? '+' : '−'}${fmt.fmt(Math.abs(d), '$')}`, pct: v.budget > 0 ? fmt.pct((d / v.budget) * 100, true) : '—' });
}

export function benchmarkPrompt(p: { label: string; mine: string; bench: string; source: string; dept: string; metricLabel: string }, L: LFn): string {
  return L('b.prompt', p);
}
