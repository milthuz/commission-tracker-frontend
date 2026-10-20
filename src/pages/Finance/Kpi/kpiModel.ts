// ============================================================================
// Module Finance — onglet KPI : moteur de calcul (pur, sans React).
//
// Le serveur (commission-tracker/services/finance/kpi.js) envoie les FAITS de chaque mois
// (comptes Zoho Billing, montants du grand livre Books, taux de la Banque du Canada, marchands
// Adyen), le budget saisi par la CFO et ses corrections. Ici : les formules du document Word
// « KPI Dashboard », l'ordre des lignes, les écarts (Var, Var %) et la colonne 12 mois.
//
// Règles (design/finance/ecarts/kpi.md) :
//   - priorité d'une cellule RÉELLE : correction de la CFO > saisie manuelle de la source > source
//     > formule ; une correction se PROPAGE aux formules qui en dépendent ;
//   - priorité d'une cellule BUDGET : valeur enregistrée > préremplissage par le modèle FY2027
//     (mois 2027) > formule à partir des autres lignes du budget ;
//   - Var = Réel − Budget ; Var % = Var ÷ |Budget| (le classeur divisait par le RÉEL dans son
//     bloc P&L — écart signalé) ;
//   - colonne 12 mois : SOMME pour les flux, valeur du DERNIER mois pour les soldes, rapport des
//     SOMMES pour les ARPU / coûts unitaires — jamais la somme des ARPU (bogue du classeur, J29).
//
// Banc d'essai : scripts/test-finance-kpi.cjs (et, de bout en bout avec le serveur,
// services/finance/__tests__/kpi.test.js).
// ============================================================================

export type KpiKey =
  | 'canNew' | 'resellerAdds' | 'coo' | 'newRooftops' | 'churn' | 'usaChurn' | 'totalChurn'
  | 'newMrr' | 'churnMrr' | 'usaMrrUsd' | 'fxUsdCad' | 'usaMrrCad' | 'totalMrr'
  | 'newArpu' | 'churnArpu' | 'rooftopIncrease' | 'mrrIncrease' | 'totalRooftops' | 'arpu'
  | 'sellingExpense' | 'coa' | 'subscriptionRevenue' | 'arpuSaas' | 'adyenIncome' | 'adyenRooftops' | 'paymentsArpu'
  | 'saasCreditNotes';

export type KpiSection = 'rooftops' | 'mrr' | 'formulas' | 'suggestions';
export type KpiFmt = 'n' | '$' | '$2' | 'fx';
export type Agg = 'sum' | 'end' | 'ratio' | 'none';

export interface KpiDef {
  key: KpiKey;
  section: KpiSection;
  fmt: KpiFmt;
  agg: Agg;
  /** Sens favorable d'un écart (couleur) ; null = neutre. */
  good: 'up' | 'down' | null;
  /** Ligne calculée à partir d'autres lignes (sinon : donnée d'une source). */
  formula: boolean;
  /** Pour une ligne « ratio » : numérateur et dénominateur (colonne 12 mois = Σnum ÷ Σden). */
  num?: KpiKey;
  den?: KpiKey;
}

const d = (key: KpiKey, section: KpiSection, fmt: KpiFmt, agg: Agg, good: KpiDef['good'], formula: boolean, num?: KpiKey, den?: KpiKey): KpiDef =>
  ({ key, section, fmt, agg, good, formula, ...(num ? { num, den } : {}) });

// Ordre d'affichage = ordre du document Word, avec les lignes d'appoint là où elles servent.
// GARDER IDENTIQUE à KPI_KEYS de services/finance/kpi.js (le banc d'essai compare).
export const KPI_DEFS: KpiDef[] = [
  d('canNew', 'rooftops', 'n', 'sum', 'up', false),
  d('resellerAdds', 'rooftops', 'n', 'sum', 'up', false),
  d('coo', 'rooftops', 'n', 'sum', null, false),
  d('newRooftops', 'rooftops', 'n', 'sum', 'up', true),
  d('churn', 'rooftops', 'n', 'sum', 'down', false),
  d('usaChurn', 'rooftops', 'n', 'sum', 'down', false),
  d('totalChurn', 'rooftops', 'n', 'sum', 'down', true),
  d('newMrr', 'mrr', '$', 'sum', 'up', false),
  d('churnMrr', 'mrr', '$', 'sum', 'down', false),
  d('usaMrrUsd', 'mrr', '$', 'end', 'up', false),
  d('fxUsdCad', 'mrr', 'fx', 'none', null, false),
  d('usaMrrCad', 'mrr', '$', 'end', 'up', true),
  d('totalMrr', 'mrr', '$', 'end', 'up', false),
  d('newArpu', 'formulas', '$2', 'ratio', 'up', true, 'newMrr', 'newRooftops'),
  d('churnArpu', 'formulas', '$2', 'ratio', null, true, 'churnMrr', 'churn'),
  d('rooftopIncrease', 'formulas', 'n', 'sum', 'up', true),
  d('mrrIncrease', 'formulas', '$', 'sum', 'up', true),
  d('totalRooftops', 'formulas', 'n', 'end', 'up', true),
  d('arpu', 'formulas', '$2', 'ratio', 'up', true, 'totalMrr', 'totalRooftops'),
  d('sellingExpense', 'formulas', '$', 'sum', null, false),
  d('coa', 'formulas', '$2', 'ratio', 'down', true, 'sellingExpense', 'newRooftops'),
  d('subscriptionRevenue', 'formulas', '$', 'sum', 'up', false),
  d('arpuSaas', 'formulas', '$2', 'ratio', 'up', true, 'subscriptionRevenue', 'totalRooftops'),
  d('adyenIncome', 'formulas', '$', 'sum', 'up', false),
  d('adyenRooftops', 'formulas', 'n', 'end', 'up', false),
  d('paymentsArpu', 'formulas', '$2', 'ratio', 'up', true, 'adyenIncome', 'adyenRooftops'),
  d('saasCreditNotes', 'suggestions', '$', 'sum', 'down', false),
];
export const KPI_KEYS = KPI_DEFS.map((x) => x.key);
export const DEF: Record<KpiKey, KpiDef> = Object.fromEntries(KPI_DEFS.map((x) => [x.key, x])) as Record<KpiKey, KpiDef>;
/** Lignes alimentées par Zoho Books (une saisie y remplace Books). */
export const GL_KEYS: KpiKey[] = ['totalMrr', 'sellingExpense', 'subscriptionRevenue', 'adyenIncome', 'saasCreditNotes'];
/** Lignes de comptes Zoho Billing (détail des abonnements disponible). */
export const BILLING_KEYS: KpiKey[] = ['canNew', 'resellerAdds', 'coo', 'churn', 'usaChurn', 'newMrr', 'churnMrr'];

// Ordre d'évaluation : les données, puis les formules dans l'ordre de leurs dépendances.
const EVAL: KpiKey[] = [
  'canNew', 'resellerAdds', 'coo', 'churn', 'usaChurn', 'newRooftops', 'totalChurn',
  'newMrr', 'churnMrr', 'usaMrrUsd', 'fxUsdCad', 'usaMrrCad', 'totalMrr',
  'sellingExpense', 'subscriptionRevenue', 'adyenIncome', 'adyenRooftops', 'saasCreditNotes',
  'newArpu', 'churnArpu', 'rooftopIncrease', 'mrrIncrease', 'totalRooftops', 'arpu', 'coa', 'arpuSaas', 'paymentsArpu',
];

// ---------------------------------------------------------------------------- données de l'API
export interface GlEntry { value: number | null; src: 'books' | 'manual' | null; books: { v: number; note?: string | null; at?: string } | null; manual: Saved | null }
export interface Saved { v: number; note?: string | null; by?: string | null; at?: string | null; version: number }
export interface MonthFacts {
  activations: number; resellerActivations: number; cooCancellations: number; cancellations: number;
  cancelMrr: number; cooCancelMrr: number; newMrrGross: number; cooNewSubs: number; cooNewMrr: number;
  usaChurn: number; usaMrrUsd: number | null; usaMrrSrc: string | null;
  adyenRooftops: number | null;
  gl: Record<'recurringRevenue' | 'sellingExpense' | 'subscriptionRevenue' | 'adyenIncome' | 'saasCreditNotes', GlEntry>;
  fx: { value: number | null; src: 'boc' | 'manual' | null; boc: { v: number; date: string } | null; manual: Saved | null };
}
export interface KpiData {
  end: string;
  windowStart: string;
  months: string[];
  facts: Record<string, MonthFacts>;
  budget: Record<string, Partial<Record<KpiKey, Saved>>>;
  overrides: Record<string, Partial<Record<KpiKey, Saved>>>;
  opening: { month: string; value: number } | null;
  /** false tant que la copie Zoho Billing n'a jamais réussi : les comptes seraient de faux zéros. */
  billingReady: boolean;
}

export type Src = 'billing' | 'books' | 'manual' | 'boc' | 'zentact' | 'formula' | 'override' | 'opening' | 'snapshot' | 'reconstructed';
export interface ACell { v: number | null; src: Src | null; saved?: Saved | null; base?: number | null }
export interface BCell { v: number | null; src: 'stored' | 'model' | 'formula' | null; saved?: Saved | null }
export interface MonthCell { m: string; a: ACell; b: BCell; var: number | null; varPct: number | null }
export interface T12 { a: number | null; b: number | null; var: number | null; varPct: number | null; partialA: boolean; partialB: boolean }
export interface KpiRowOut { def: KpiDef; cells: MonthCell[]; t12: T12 }
export type Prefill = (month: string, key: KpiKey) => number | null;

const GL_LINE: Partial<Record<KpiKey, keyof MonthFacts['gl']>> = {
  totalMrr: 'recurringRevenue', sellingExpense: 'sellingExpense', subscriptionRevenue: 'subscriptionRevenue',
  adyenIncome: 'adyenIncome', saasCreditNotes: 'saasCreditNotes',
};

const div = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : a / b);
const add = (a: number | null, b: number | null) => (a == null || b == null ? null : a + b);
const sub = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
const mul = (a: number | null, b: number | null) => (a == null || b == null ? null : a * b);

type Vals = Partial<Record<KpiKey, number | null>>;

// Formules du document Word. V = valeurs FINALES du mois (corrections comprises), P = mois précédent.
function formula(key: KpiKey, V: Vals, P: Vals | null): number | null {
  const g = (k: KpiKey) => (V[k] == null ? null : (V[k] as number));
  switch (key) {
    case 'newRooftops': return add(g('canNew'), g('resellerAdds'));
    case 'totalChurn': return add(g('churn'), g('usaChurn'));
    case 'usaMrrCad': return mul(g('usaMrrUsd'), g('fxUsdCad'));
    case 'newArpu': return div(g('newMrr'), g('newRooftops'));
    case 'churnArpu': return div(g('churnMrr'), g('churn'));
    case 'rooftopIncrease': return sub(g('newRooftops'), g('totalChurn'));
    case 'mrrIncrease': return P ? sub(g('totalMrr'), P.totalMrr ?? null) : null;
    case 'totalRooftops': return P ? add(P.totalRooftops ?? null, g('rooftopIncrease')) : null;
    case 'arpu': return div(g('totalMrr'), g('totalRooftops'));
    case 'coa': return div(g('sellingExpense'), g('newRooftops'));
    case 'arpuSaas': return div(g('subscriptionRevenue'), g('totalRooftops'));
    case 'paymentsArpu': return div(g('adyenIncome'), g('adyenRooftops'));
    default: return null;
  }
}

// Donnée RÉELLE d'une ligne « source », à partir des faits du mois.
function sourceActual(key: KpiKey, f: MonthFacts | undefined, billingReady: boolean): ACell {
  if (!f) return { v: null, src: null };
  const b = (v: number): ACell => (billingReady ? { v, src: 'billing' } : { v: null, src: null });
  switch (key) {
    // Canada : activations − revendeurs − changements de propriétaire (nombre de résiliations CoO).
    case 'canNew': return b(f.activations - f.resellerActivations - f.cooCancellations);
    case 'resellerAdds': return b(f.resellerActivations);
    case 'coo': return b(f.cooCancellations);
    case 'churn': return b(f.cancellations - f.cooCancellations);
    case 'usaChurn': return b(f.usaChurn);
    // Nouvelle MRR moins celle des nouveaux abonnements rapprochés d'une résiliation CoO.
    case 'newMrr': return b(f.newMrrGross - f.cooNewMrr);
    case 'churnMrr': return b(f.cancelMrr - f.cooCancelMrr);
    case 'usaMrrUsd':
      if (!billingReady || f.usaMrrUsd == null) return { v: null, src: null };
      return { v: f.usaMrrUsd, src: f.usaMrrSrc && f.usaMrrSrc.startsWith('snapshot') ? 'snapshot' : 'reconstructed' };
    case 'fxUsdCad': return { v: f.fx.value, src: f.fx.src, saved: f.fx.manual };
    case 'adyenRooftops': return { v: f.adyenRooftops, src: f.adyenRooftops == null ? null : 'zentact' };
    default: {
      const line = GL_LINE[key];
      if (!line) return { v: null, src: null };
      const e = f.gl[line];
      return { v: e ? e.value : null, src: e ? e.src : null, saved: e ? e.manual : null };
    }
  }
}

// Série RÉELLE de toutes les lignes, sur TOUS les mois reçus (la fenêtre + le mois d'avant et,
// s'il est plus ancien, le mois d'ouverture du parc de rooftops).
export function computeActuals(data: KpiData): Record<string, Record<KpiKey, ACell>> {
  const out: Record<string, Record<KpiKey, ACell>> = {};
  let P: Vals | null = null;
  for (const m of data.months) {
    const f = data.facts[m];
    const ov = data.overrides[m] || {};
    const V: Vals = {};
    const row = {} as Record<KpiKey, ACell>;
    for (const k of EVAL) {
      const def = DEF[k];
      let cell: ACell;
      if (k === 'totalRooftops' && data.opening && m === data.opening.month) cell = { v: data.opening.value, src: 'opening' };
      else if (k === 'totalRooftops' && data.opening && m < data.opening.month) cell = { v: null, src: null };
      else if (def.formula) { const v = formula(k, V, P); cell = { v, src: v == null ? null : 'formula' }; }
      else cell = sourceActual(k, f, data.billingReady);
      const o = ov[k];
      if (o) cell = { v: o.v, src: 'override', saved: o, base: cell.v };
      row[k] = cell;
      V[k] = cell.v;
    }
    out[m] = row;
    P = V;
  }
  return out;
}

export function computeBudget(data: KpiData, prefill?: Prefill): Record<string, Record<KpiKey, BCell>> {
  const out: Record<string, Record<KpiKey, BCell>> = {};
  let P: Vals | null = null;
  for (const m of data.months) {
    const st = data.budget[m] || {};
    const V: Vals = {};
    const row = {} as Record<KpiKey, BCell>;
    for (const k of EVAL) {
      let cell: BCell;
      const s = st[k];
      const pf = prefill ? prefill(m, k) : null;
      if (s) cell = { v: s.v, src: 'stored', saved: s };
      else if (pf != null && Number.isFinite(pf)) cell = { v: pf, src: 'model' };
      else if (DEF[k].formula) { const v = formula(k, V, P); cell = { v, src: v == null ? null : 'formula' }; }
      else cell = { v: null, src: null };
      row[k] = cell;
      V[k] = cell.v;
    }
    out[m] = row;
    P = V;
  }
  return out;
}

const variance = (a: number | null, b: number | null) => ({
  var: a == null || b == null ? null : a - b,
  varPct: a == null || b == null || b === 0 ? null : (a - b) / Math.abs(b),
});

// Colonne « 12 mois » d'une ligne, sur un côté (réel ou budget).
function aggregate(def: KpiDef, months: string[], get: (m: string, k: KpiKey) => number | null) {
  const vals = months.map((m) => get(m, def.key));
  const known = vals.filter((v) => v != null) as number[];
  if (def.agg === 'none') return { v: null, partial: false };
  if (def.agg === 'sum') return { v: known.length ? known.reduce((a, b) => a + b, 0) : null, partial: known.length > 0 && known.length < months.length };
  if (def.agg === 'end') { const v = vals[vals.length - 1]; return { v: v == null ? null : v, partial: false }; }
  // Rapport des sommes : Σ(valeur × dénominateur) ÷ Σ dénominateur. Avec des valeurs calculées,
  // c'est exactement Σnum ÷ Σden ; avec une valeur corrigée à la main, elle pèse ce que pèse son
  // dénominateur ce mois-là.
  let n = 0, den = 0, cnt = 0;
  months.forEach((m, i) => {
    const v = vals[i];
    const dv = get(m, def.den as KpiKey);
    if (v == null || dv == null || dv === 0) return;
    n += v * dv; den += dv; cnt++;
  });
  return { v: den ? n / den : null, partial: cnt > 0 && cnt < months.length };
}

export function windowMonths(end: string): string[] {
  const out: string[] = [];
  let y = +end.slice(0, 4), mo = +end.slice(5, 7);
  for (let i = 0; i < 12; i++) {
    out.unshift(`${y}-${String(mo).padStart(2, '0')}`);
    mo--; if (mo === 0) { mo = 12; y--; }
  }
  return out;
}

export function computeKpiTable(data: KpiData, prefill?: Prefill) {
  const A = computeActuals(data);
  const B = computeBudget(data, prefill);
  const months = windowMonths(data.end).filter((m) => A[m]);
  const rows: KpiRowOut[] = KPI_DEFS.map((def) => {
    const cells = months.map((m) => {
      const a = A[m][def.key], b = B[m][def.key];
      return { m, a, b, ...variance(a.v, b.v) };
    });
    const ta = aggregate(def, months, (m, k) => A[m][k].v);
    const tb = aggregate(def, months, (m, k) => B[m][k].v);
    return { def, cells, t12: { a: ta.v, b: tb.v, ...variance(ta.v, tb.v), partialA: ta.partial, partialB: tb.partial } };
  });
  return { months, rows, actuals: A, budget: B };
}

export type KpiTable = ReturnType<typeof computeKpiTable>;

// ---------------------------------------------------------------------------- budget : modèle
// Préremplissage des mois de l'exercice du budget maître (FY2027) à partir du modèle de drivers
// déjà calculé dans le navigateur (FinanceContext.result). Lignes sans équivalent dans le modèle
// (CoO, Nouvelle MRR, MRR perdue, ARPU des nouveaux / perdus, notes de crédit) : rien.
export interface ModelLike {
  Rm: Record<string, number[]>;
  master: { opex: Record<string, number[]> };
}
export function modelPrefill(result: ModelLike, fiscalYear = 2027): Prefill {
  const map: Partial<Record<KpiKey, () => number[] | undefined>> = {
    canNew: () => result.Rm.intAdds_in,
    resellerAdds: () => result.Rm.resAdds_in,
    churn: () => result.Rm.canChurn_in,
    usaChurn: () => result.Rm.usaChurn_in,
    usaMrrCad: () => result.Rm.usaSub,
    totalMrr: () => result.Rm.recurring,
    totalRooftops: () => result.Rm.totEnd,
    sellingExpense: () => result.master.opex['Sales & Marketing'],
    subscriptionRevenue: () => result.Rm.totalSub,
    adyenIncome: () => result.Rm.clusterPP,
    adyenRooftops: () => result.Rm.adyenEnd,
  };
  return (month, key) => {
    if (+month.slice(0, 4) !== fiscalYear) return null;
    const f = map[key];
    const s = f ? f() : undefined;
    const v = s ? s[+month.slice(5, 7) - 1] : undefined;
    return v == null || !Number.isFinite(v) ? null : v;
  };
}

// Les « adds » et le churn du modèle sont des INPUTS (FinanceContext.result.I), pas des sorties :
// on les expose sous Rm.<clé>_in pour modelPrefill.
export function modelLike(result: { Rm: Record<string, number[]>; I: Record<string, number[]>; master: { opex: Record<string, number[]> } }): ModelLike {
  return {
    Rm: { ...result.Rm, intAdds_in: result.I.intAdds, resAdds_in: result.I.resAdds, canChurn_in: result.I.canChurn, usaChurn_in: result.I.usaChurn },
    master: result.master,
  };
}
