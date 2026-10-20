// Module Finance, phase 2 lot A — moteur des budgets d'ENTITÉ (Cluster, Xperio) : P&L autonome
// Sep 2026 → Dec 2027 tiré du classeur de la CFO, recalculé quand elle modifie un driver GL.
// Pur (aucune dépendance React) : le banc d'essai scripts/test-finance-entity.cjs le compare au
// PROTOTYPE du design exécuté tel quel, chaque ligne et chaque colonne, au cent près.
//
// Règles (SPEC-phase2 §A.4) :
//   - ligne du P&L = ligne SOURCE du classeur + Σ (valeurs du driver − valeurs source du driver).
//     Jamais Σ drivers : 5 lignes de COGS ne s'additionnent pas exactement à leurs drivers ;
//   - seuls « Run-rate » et « Monthly growth » se recalculent :
//       Run-rate        base · (1 + p/100) · e
//       Monthly growth  base · (1 + p/100)^(n+1) · e        (n = 0 en sep. 2026)
//       e = 1 + escalade à partir de janvier 2027 (n ≥ 4), 1 avant ;
//   - un driver NON modifié montre toujours ses valeurs source, au cent ;
//   - colonnes Jan–Aug 2026 et Aug 2026 (réels) : jamais touchées.
//
// ÉCART VOULU avec le prototype (design/finance/ecarts/entityBudgets.md) : un driver dont la
// formule, avec sa propre valeur par défaut, NE redonne PAS ses valeurs source porte un calendrier
// que la formule ignore (Cluster « Subscription Revenue » : la hausse de prix à partir d'octobre
// 2026). Pour lui, l'ajustement s'applique PAR-DESSUS le calendrier :
//       valeurs = source + formule(p) − formule(p₀)        (p₀ = l'entrée du classeur)
// C'est exactement la formule du classeur (croissance organique + MRR cumulatif de la hausse de
// prix), avec une autre croissance. Retaper la valeur par défaut redonne la source ; le prototype,
// lui, perdait 461 777 $ sur FY2027.

export const MONTHS = 16;
export type ColMode = 'sum' | 'm';

export interface EntityDriver {
  id: string;
  ent: string;
  sec: string;
  cat: string;
  /** Ligne de charges sociales : le GL de paie auquel elle se rattache ; '' sinon. */
  parent: string;
  dept: string;
  gl: string;
  type: string;
  basis: string;
  janAug: number;
  aug: number;
  base: number | null;
  /** Fraction (0.015 = 1,5 %). */
  input: number;
  esc: number;
  note: string;
  m: number[];
}
export interface PlRow { name: string; v: (number | null)[] }
export interface EntityReference {
  v: number;
  kind: 'entity';
  entity: string;
  fiscalYear: number;
  source: { kind: string; file?: string | null; sheets?: string[]; sha256?: string };
  pl: PlRow[];
  drivers: EntityDriver[];
}
export type Overrides = Record<string, number>;

export const REV = ['Recurring Revenue', 'Hardware Revenue', 'Service Revenue', 'Licence & Other Revenue'] as const;
export const COGS = ['Recurring COGS', 'Hardware COGS', 'Service COGS', 'Licence COGS'] as const;
export const OPX = ['Sales & Marketing', 'Research & Development', 'General & Administrative'] as const;
export const NOI = 'Non-operating Income';
export const NOE = 'Non-operating Expense';
export const LINE_NAMES: string[] = [...REV, ...COGS, ...OPX, NOI, NOE];
export const CAT_MAP: Record<string, string[]> = {
  'Licence & Other Revenue': ['Other Revenue', 'License Revenue', 'Licence & Other Revenue'],
  'Licence COGS': ['License COGS', 'Licence COGS'],
  'Service COGS': ['Service COGS', 'Service Auto', 'Service Travel'],
  'Recurring COGS': ['Recurring COGS', 'Support Software & Phone Costs'],
  'Non-operating Income': ['Non-Operating Income', 'Gain on Sale of Division'],
  'Non-operating Expense': ['Other Non-Operating Expenses', 'Non-Operating Professional Expenses', 'Exchange Gain or Loss', 'Amortization'],
};
export const OV_MIN = -100;
export const OV_MAX = 500;

export const recomputable = (d: EntityDriver) => (d.type === 'Run-rate' || d.type === 'Monthly growth') && d.base != null && Number.isFinite(d.base);
export const driversFor = (ref: EntityReference, line: string) => {
  const cats = CAT_MAP[line] || [line];
  return ref.drivers.filter((d) => cats.includes(d.cat));
};

/** Formule du prototype, `pct` en pour cent (1.5 = 1,5 %). */
export function formula(d: EntityDriver, pct: number): number[] {
  const inp = pct / 100, esc = d.esc || 0, base = d.base as number;
  return Array.from({ length: MONTHS }, (_, n) => {
    const e = n >= 4 ? 1 + esc : 1;
    return d.type === 'Run-rate' ? base * (1 + inp) * e : base * Math.pow(1 + inp, n + 1) * e;
  });
}

/** Driver à calendrier : sa formule, avec sa propre entrée, ne redonne pas ses valeurs source. */
export function isSchedule(d: EntityDriver): boolean {
  if (!recomputable(d)) return false;
  const f = formula(d, d.input * 100);
  return f.some((v, i) => Math.abs(v - (d.m[i] || 0)) > 0.005);
}
export const scheduleIds = (ref: EntityReference) => new Set(ref.drivers.filter(isSchedule).map((d) => d.id));

export function drvVals(d: EntityDriver, ov: Overrides, schedules: Set<string>): number[] {
  const o = ov[d.id];
  if (o == null || !recomputable(d)) return d.m;
  if (schedules.has(d.id)) {
    const f = formula(d, o), f0 = formula(d, d.input * 100);
    return d.m.map((v, i) => v + (f[i] - f0[i]));
  }
  return formula(d, o);
}

const zero = () => Array<number>(MONTHS).fill(0);
export const sumOf = (m: number[]) => ({
  sd: m.slice(0, 4).reduce((a, b) => a + b, 0),
  fy: m.slice(4).reduce((a, b) => a + b, 0),
  t16: m.reduce((a, b) => a + b, 0),
});

export interface LineData { name: string; janAug: number | null; aug: number | null; m: number[]; ds: EntityDriver[] }
export interface Agg { janAug: number; aug: number; m: number[] }
export interface EntityResult {
  lines: Record<string, LineData>;
  vals: Record<string, number[]>;
  rev: Agg; cogs: Agg; opx: Agg; gp: Agg; ebitda: Agg; noi: Agg; noe: Agg; ni: Agg;
  schedules: Set<string>;
  overrideCount: number;
}

export function computeEntity(ref: EntityReference, ov: Overrides, schedules: Set<string> = scheduleIds(ref)): EntityResult {
  const vals: Record<string, number[]> = {};
  for (const d of ref.drivers) vals[d.id] = drvVals(d, ov, schedules);
  const lines: Record<string, LineData> = {};
  for (const n of LINE_NAMES) {
    const r = ref.pl.find((x) => x.name === n);
    if (!r) continue;
    const ds = driversFor(ref, n);
    const delta = Array.from({ length: MONTHS }, (_, i) => ds.reduce((a, d) => a + (vals[d.id][i] - d.m[i]), 0));
    lines[n] = { name: n, janAug: r.v[0], aug: r.v[1], m: r.v.slice(2, 18).map((v, i) => (v || 0) + delta[i]), ds };
  }
  const agg = (names: readonly string[]): Agg => ({
    janAug: names.reduce((a, n) => a + (lines[n] ? lines[n].janAug || 0 : 0), 0),
    aug: names.reduce((a, n) => a + (lines[n] ? lines[n].aug || 0 : 0), 0),
    m: names.reduce((acc, n) => (lines[n] ? acc.map((v, i) => v + lines[n].m[i]) : acc), zero()),
  });
  const minus = (a: Agg, b: Agg): Agg => ({ janAug: a.janAug - b.janAug, aug: a.aug - b.aug, m: a.m.map((v, i) => v - b.m[i]) });
  const plus = (a: Agg, b: Agg): Agg => ({ janAug: a.janAug + b.janAug, aug: a.aug + b.aug, m: a.m.map((v, i) => v + b.m[i]) });
  const rev = agg(REV), cogs = agg(COGS), opx = agg(OPX), noi = agg([NOI]), noe = agg([NOE]);
  const gp = minus(rev, cogs), ebitda = minus(gp, opx), ni = minus(plus(ebitda, noi), noe);
  const ids = new Set(ref.drivers.filter(recomputable).map((d) => d.id));
  return { lines, vals, rev, cogs, opx, gp, ebitda, noi, noe, ni, schedules, overrideCount: Object.keys(ov).filter((k) => ids.has(k)).length };
}

// ---------------------------------------------------------------------------- lignes du tableau
export type RowKind = 'sec' | 'line' | 'total' | 'gm' | 'grp' | 'gl';
export interface BudgetRow {
  id: string;
  kind: RowKind;
  /** Nom tel qu'il vient des données (ligne du P&L, GL) ; pour 'sec' : la clé de section. */
  name: string;
  /** Ligne du P&L dont dépend une ligne GL / un en-tête de groupe (visible quand elle est dépliée). */
  line?: string;
  janAug: number | null;
  aug: number | null;
  m: number[];
  driver?: EntityDriver;
  sub?: boolean;
  changed?: boolean;
  editable?: boolean;
  schedule?: boolean;
  count?: number;
  /** Groupe GL : entité et catégorie (« Cluster · Other Revenue »). */
  group?: { ent: string; cat: string };
}

export function buildRows(_ref: EntityReference, res: EntityResult, ov: Overrides): BudgetRow[] {
  const out: BudgetRow[] = [];
  const sec = (k: string) => out.push({ id: `sec:${k}`, kind: 'sec', name: k, janAug: null, aug: null, m: [] });
  const tot = (name: string, a: Agg) => out.push({ id: `tot:${name}`, kind: 'total', name, janAug: a.janAug, aug: a.aug, m: a.m });
  const line = (n: string) => {
    const d = res.lines[n];
    if (!d) return;
    out.push({ id: `line:${n}`, kind: 'line', name: n, janAug: d.janAug, aug: d.aug, m: d.m, count: d.ds.length });
    let lastGrp: string | null = null;
    for (const dr of d.ds) {
      const grp = dr.ent + (dr.cat !== n ? ' · ' + dr.cat : '');
      // Pages autonomes : un en-tête de groupe seulement quand la catégorie diffère de la ligne.
      if (grp !== lastGrp && dr.cat !== n) {
        out.push({ id: `grp:${n}:${grp}`, kind: 'grp', name: grp, line: n, janAug: null, aug: null, m: [], group: { ent: dr.ent, cat: dr.cat } });
        lastGrp = grp;
      }
      out.push({
        id: `gl:${dr.id}`, kind: 'gl', name: dr.gl, line: n, janAug: dr.janAug, aug: dr.aug, m: res.vals[dr.id], driver: dr,
        sub: !!dr.parent, changed: ov[dr.id] != null && recomputable(dr), editable: recomputable(dr), schedule: res.schedules.has(dr.id),
      });
    }
  };
  sec('revenue'); REV.forEach(line); tot('Total Revenue', res.rev);
  sec('cogs'); COGS.forEach(line); tot('Total COGS', res.cogs);
  tot('GROSS PROFIT', res.gp);
  out.push({ id: 'gm', kind: 'gm', name: 'Gross Margin', janAug: null, aug: null, m: [] });
  sec('opex'); OPX.forEach(line); tot('Total OPEX', res.opx);
  tot('EBITDA', res.ebitda);
  line(NOI); line(NOE);
  tot('NET INCOME / (LOSS)', res.ni);
  return out;
}

/** Cellules d'une ligne pour la vue choisie : nombres ($) ou ratios (marge brute). */
export function cellsOf(row: BudgetRow, mode: ColMode, res: EntityResult): (number | null)[] {
  if (row.kind === 'sec' || row.kind === 'grp') return [];
  if (row.kind === 'gm') {
    const div = (a: number, b: number) => { const v = a / b; return Number.isFinite(v) ? v : null; };
    const ja = div(res.gp.janAug, res.rev.janAug), au = div(res.gp.aug, res.rev.aug);
    const S = sumOf(res.gp.m), R = sumOf(res.rev.m);
    if (mode === 'sum') return [ja, au, div(S.sd, R.sd), div(S.fy, R.fy), div(S.t16, R.t16)];
    return [ja, au, ...res.gp.m.map((v, i) => (res.rev.m[i] ? v / res.rev.m[i] : 0)), div(S.t16, R.t16)];
  }
  const t = sumOf(row.m);
  return mode === 'sum' ? [row.janAug, row.aug, t.sd, t.fy, t.t16] : [row.janAug, row.aug, ...row.m, t.t16];
}

export function tiles(res: EntityResult) {
  const t = (a: Agg) => sumOf(a.m);
  const gp = t(res.gp), rv = t(res.rev);
  return [
    { key: 'revenue', ...t(res.rev) },
    { key: 'grossProfit', ...gp, margin: gp.t16 / rv.t16 },
    { key: 'ebitda', ...t(res.ebitda) },
    { key: 'netIncome', ...t(res.ni) },
  ];
}

// ---------------------------------------------------------------------------- mise en forme
// Comme le prototype : « ($1,234) », « – » pour zéro, « $ » sur chaque cellule ; en français
// « (1 234 $) ».
export function makeBudgetFormat(lang: string | undefined) {
  const fr = !!lang && lang.startsWith('fr');
  const loc = fr ? 'fr-CA' : 'en-CA';
  const int = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  const fix1 = new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const money = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return '';
    if (Math.abs(n) < 0.5) return '–';
    const s = int.format(Math.round(Math.abs(n)));
    const body = fr ? `${s} $` : `$${s}`;
    return n < 0 ? `(${body})` : body;
  };
  const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '' : `${fix1.format(n * 100)}${fr ? ' %' : '%'}`);
  const input = (p: number) => fix1.format(p);
  return { fr, loc, money, pct, input, fix1, int: (v: number) => int.format(v) };
}
export type BudgetFormat = ReturnType<typeof makeBudgetFormat>;

// ---------------------------------------------------------------------------- budgets départementaux
export interface DeptRow { name: string; v: (number | null)[]; basis?: string | null }
export interface DeptReference {
  v: number;
  kind: 'departments';
  fiscalYear: number;
  source: { kind: string; file?: string | null };
  summary: { name: string; v: (number | null)[] }[];
  leaders: { key: string; name: string; v: (number | null)[] }[];
  depts: { key: string; title: string; contribution: boolean; rows: DeptRow[] }[];
}
export interface DeptDisplayRow { name: string; kind: 'sec' | 'line' | 'total'; janAug: number | null; aug: number | null; m: number[] }

/** Lignes d'une feuille de département, comme le prototype (affichage seul, aucun recalcul). */
export function deptRows(rows: DeptRow[]): DeptDisplayRow[] {
  return rows.filter((r) => r.name && !/Department Budget|expense layout/.test(r.name)).map((r) => {
    const hasV = r.v.slice(0, 18).some((v) => v != null);
    const isTot = /^(Total|TOTAL|NET)/.test(r.name);
    return { name: r.name, kind: !hasV ? 'sec' : isTot ? 'total' : 'line', janAug: hasV ? r.v[0] : null, aug: hasV ? r.v[1] : null, m: hasV ? r.v.slice(2, 18).map((v) => v || 0) : [] };
  });
}
export function deptCells(row: DeptDisplayRow, mode: ColMode): (number | null)[] {
  if (row.kind === 'sec') return [];
  const t = sumOf(row.m);
  return mode === 'sum' ? [row.janAug, row.aug, t.sd, t.fy, t.t16] : [row.janAug, row.aug, ...row.m, t.t16];
}
