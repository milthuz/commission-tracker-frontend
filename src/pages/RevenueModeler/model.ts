// Modélisateur de revenus — le moteur de calcul.
//
// Pur et sans React : la page, l'export CSV et le tableau de comparaison des paliers SaaS
// appellent tous `compute()`, donc un chiffre ne peut pas différer d'un endroit à l'autre.
// Formules : spec/calculations.md du brief, une par une.
//
// ⚠️ Les pourcentages sont en POINTS : markupRate = 0.08 veut dire 0,08 % du volume.

export interface Inputs {
  merchantName: string;
  numLocs: number;
  termsPerLoc: number;
  gmvCredit: number;
  txnCredit: number;
  gmvInterac: number;
  txnInterac: number;
  saasPerLoc: number;
  markupRate: number;
  txnFeeCredit: number;
  txnFeeInterac: number;
  creditCostPct: number;
  creditCostPerTxn: number;
  interacCostPerTxn: number;
  interacCostPct: number; // coût réseau Interac en % du volume Interac, comme creditCostPct
  // Frais de traitement PAR EMPLACEMENT PAR MOIS : revenu et coût de chacun.
  aofRev: number;  aofCost: number;   // Account on file
  pciRev: number;  pciCost: number;   // PCI Fee
  bankRev: number; bankCost: number;  // Bank transfer
  termRentalRev: number;
  termWarrantyCost: number;
  termUnitCost: number;
  hwCost: number;   // prix d'ACHAT du matériel par emplacement
  hwPrice: number;  // prix de VENTE du matériel par emplacement
  instPrice: number;
  instCost: number;  // coût de l'installation par emplacement
  commSaasMonths: number;
  commPayPerLoc: number;
  commHwPct: number;
  commInstPct: number;
}

export type NumKey = Exclude<keyof Inputs, 'merchantName'>;

// Sous ce seuil, la marge nette Interac déclenche l'alerte.
export const INTERAC_ALERT_FLOOR = 10000;

export function compute(i: Inputs) {
  const totalTerminals = i.numLocs * i.termsPerLoc;

  const saasRevenueGross = i.numLocs * i.saasPerLoc * 12;
  const commissionSaas = i.numLocs * i.saasPerLoc * i.commSaasMonths;

  const revMarkup = i.gmvCredit * (i.markupRate / 100);
  const costCreditPct = i.gmvCredit * (i.creditCostPct / 100);
  const revTxnCredit = i.txnCredit * i.txnFeeCredit;
  const costTxnCredit = i.txnCredit * i.creditCostPerTxn;
  const netCredit = revMarkup - costCreditPct + revTxnCredit - costTxnCredit;

  const revTxnInterac = i.txnInterac * i.txnFeeInterac;
  const costTxnInterac = i.txnInterac * i.interacCostPerTxn;
  // `|| 0` : absent d'un scénario enregistré avant le 2026-09-23 = aucun coût en %.
  const costInteracPct = i.gmvInterac * ((i.interacCostPct || 0) / 100);
  const netInterac = revTxnInterac - costTxnInterac - costInteracPct;

  // Frais de traitement : par emplacement, par mois → × emplacements × 12, chaque année.
  const fee = (v: number) => i.numLocs * (v || 0) * 12;
  const procFees = {
    aof:  { rev: fee(i.aofRev),  cost: fee(i.aofCost) },
    pci:  { rev: fee(i.pciRev),  cost: fee(i.pciCost) },
    bank: { rev: fee(i.bankRev), cost: fee(i.bankCost) },
  };
  const netProcFees = Object.values(procFees).reduce((a, f) => a + f.rev - f.cost, 0);

  const rentalRevAnnual = totalTerminals * i.termRentalRev * 12;
  const warrantyCostAnnual = totalTerminals * i.termWarrantyCost * 12;
  const netTerminalAnnual = rentalRevAnnual - warrantyCostAnnual;
  const terminalPurchaseCost = totalTerminals * i.termUnitCost;
  const commissionPayment = i.numLocs * i.commPayPerLoc;
  // Sans revenu net mensuel positif, l'achat ne se rembourse jamais : null, pas l'infini.
  const paybackMonths = netTerminalAnnual > 0 ? terminalPurchaseCost / (netTerminalAnnual / 12) : null;

  const hwRevenue = i.numLocs * i.hwPrice;
  const hwCOGS = i.numLocs * i.hwCost;
  const hwGrossProfit = hwRevenue - hwCOGS;
  // La marge est un RÉSULTAT (achat vs vente), plus une saisie. null quand rien n'est vendu.
  const hwMarginPct = i.hwPrice > 0 ? ((i.hwPrice - i.hwCost) / i.hwPrice) * 100 : null;
  const hwCommission = hwRevenue * (i.commHwPct / 100);
  const hwNet = hwGrossProfit - hwCommission;

  const instRevenue = i.numLocs * i.instPrice;
  const instCOGS = i.numLocs * i.instCost;
  const instGrossProfit = instRevenue - instCOGS;
  const instCommission = instRevenue * (i.commInstPct / 100);
  const instNet = instGrossProfit - instCommission;

  const recurring = saasRevenueGross + netCredit + netInterac + netProcFees + netTerminalAnnual;
  // La commission paiement est versée au VENDEUR à la signature : elle n'est rattachée à aucune
  // ligne de produit (surtout pas aux terminaux, qui ne portent aucune commission).
  const otherCommissions = commissionPayment;
  const profitYear1 = recurring - commissionSaas - terminalPurchaseCost - otherCommissions + hwNet + instNet;
  const profitYear2 = recurring;
  const profitYear3 = recurring;

  const commissionsYear1 = commissionSaas + hwCommission + instCommission + otherCommissions;

  // Prix d'installation qui ramène la ligne à zéro une fois la commission payée : P − coût − P×taux = 0.
  const suggestedInstPrice = i.commInstPct < 100 ? i.instCost / (1 - i.commInstPct / 100) : null;

  return {
    totalTerminals,
    saasRevenueGross, commissionSaas,
    revMarkup, costCreditPct, revTxnCredit, costTxnCredit, netCredit,
    revTxnInterac, costTxnInterac, costInteracPct, netInterac,
    procFees, netProcFees,
    rentalRevAnnual, warrantyCostAnnual, netTerminalAnnual, terminalPurchaseCost, commissionPayment, paybackMonths,
    hwRevenue, hwCOGS, hwGrossProfit, hwMarginPct, hwCommission, hwNet,
    instRevenue, instCOGS, instGrossProfit, instCommission, instNet,
    profitYear1, profitYear2, profitYear3,
    total3Years: profitYear1 + profitYear2 + profitYear3,
    commissionsYear1, otherCommissions,
    netPayments: netCredit + netInterac + netProcFees,
    gmvTotal: i.gmvCredit + i.gmvInterac,
    alerts: {
      // L'installation perd de l'argent une fois sa commission payée.
      installLoss: i.numLocs > 0 && instNet < -0.005,
      interacLow: netInterac < INTERAC_ALERT_FLOOR,
    },
    suggestedInstPrice,
  };
}

export type Model = ReturnType<typeof compute>;

// Remet un scénario ancien au format courant sans changer un seul de ses chiffres.
// ⚠️ Même logique que upgradeInputs() de commission-tracker/services/revenueModel/defaults.js :
// garder les deux identiques.
const FEE_KEYS = ['aofRev', 'aofCost', 'pciRev', 'pciCost', 'bankRev', 'bankCost'];
export function upgradeInputs(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;
  const out = { ...raw };
  // Avant le 2026-09-22 : marge matériel en % → le prix d'achat qui donne la même marge.
  if (out.hwCost == null && out.hwMarginPct != null) {
    out.hwCost = Math.round(Number(out.hwPrice ?? 0) * (1 - Number(out.hwMarginPct) / 100) * 100) / 100;
  }
  delete out.hwMarginPct;
  // Avant le 2026-09-23 : installation refacturée au coût, donc coût = prix.
  if (out.instCost == null && out.instPrice != null) out.instCost = Number(out.instPrice);
  // Avant le 2026-09-23 : aucun frais de traitement par emplacement.
  if (Object.keys(raw).length) for (const k of FEE_KEYS) if (out[k] == null) out[k] = 0;
  return out;
}

// ── Lignes du P&L ────────────────────────────────────────────────────────────────────────
// Une structure de données, pas du JSX : le tableau ET l'export CSV la lisent.
export type RowKind = 'section' | 'rev' | 'cost' | 'newcost' | 'comm' | 'subtotal' | 'total';
export interface Row {
  kind: RowKind;
  label: string;
  y: [number, number, number];
  oneTime?: boolean;
}

type T = (key: string, opts?: Record<string, unknown>) => string;

export function buildRows(i: Inputs, m: Model, t: T, num: (n: number, d?: number) => string): Row[] {
  const p = 'revenueModeler.pl.';
  const same = (v: number): [number, number, number] => [v, v, v];
  const once = (v: number): [number, number, number] => [v, 0, 0];
  const sec = (key: string): Row => ({ kind: 'section', label: t(p + 'sec.' + key), y: [0, 0, 0] });

  return [
    sec('saas'),
    { kind: 'rev', label: t(p + 'saasGross', { price: num(i.saasPerLoc), locs: num(i.numLocs) }), y: same(m.saasRevenueGross) },
    { kind: 'comm', label: t(p + 'saasComm', { months: num(i.commSaasMonths, 2), price: num(i.saasPerLoc), locs: num(i.numLocs) }), y: once(-m.commissionSaas), oneTime: true },
    { kind: 'subtotal', label: t(p + 'saasNet'), y: [m.saasRevenueGross - m.commissionSaas, m.saasRevenueGross, m.saasRevenueGross] },

    sec('credit'),
    { kind: 'rev', label: t(p + 'markup', { rate: num(i.markupRate, 6) }), y: same(m.revMarkup) },
    { kind: 'cost', label: t(p + 'creditCostPct', { rate: num(i.creditCostPct, 6) }), y: same(-m.costCreditPct) },
    { kind: 'rev', label: t(p + 'txnFeeCredit', { fee: num(i.txnFeeCredit, 6), n: num(i.txnCredit) }), y: same(m.revTxnCredit) },
    { kind: 'newcost', label: t(p + 'creditCostTxn', { fee: num(i.creditCostPerTxn, 6) }), y: same(-m.costTxnCredit) },
    { kind: 'subtotal', label: t(p + 'creditNet'), y: same(m.netCredit) },

    sec('interac'),
    { kind: 'rev', label: t(p + 'txnFeeInterac', { fee: num(i.txnFeeInterac, 6), n: num(i.txnInterac) }), y: same(m.revTxnInterac) },
    { kind: 'cost', label: t(p + 'interacCostPct', { rate: num(i.interacCostPct || 0, 6) }), y: same(-m.costInteracPct) },
    { kind: 'cost', label: t(p + 'interacCostTxn', { fee: num(i.interacCostPerTxn, 6) }), y: same(-m.costTxnInterac) },
    { kind: 'subtotal', label: t(p + 'interacNet'), y: same(m.netInterac) },

    sec('procFees'),
    ...(['aof', 'pci', 'bank'] as const).flatMap((k) => [
      { kind: 'rev' as const, label: t(p + 'feeRev', { name: t(p + 'fee.' + k), fee: num(i[`${k}Rev`], 6), locs: num(i.numLocs) }), y: same(m.procFees[k].rev) },
      { kind: 'cost' as const, label: t(p + 'feeCost', { name: t(p + 'fee.' + k), fee: num(i[`${k}Cost`], 6), locs: num(i.numLocs) }), y: same(-m.procFees[k].cost) },
    ]),
    { kind: 'subtotal', label: t(p + 'procFeesNet'), y: same(m.netProcFees) },

    sec('terminals'),
    { kind: 'rev', label: t(p + 'rental', { n: num(m.totalTerminals), fee: num(i.termRentalRev, 2) }), y: same(m.rentalRevAnnual) },
    { kind: 'cost', label: t(p + 'warranty', { fee: num(i.termWarrantyCost, 2) }), y: same(-m.warrantyCostAnnual) },
    { kind: 'cost', label: t(p + 'termPurchase', { n: num(m.totalTerminals), cost: num(i.termUnitCost, 2) }), y: once(-m.terminalPurchaseCost), oneTime: true },
    { kind: 'subtotal', label: t(p + 'terminalsNet'), y: [m.netTerminalAnnual - m.terminalPurchaseCost, m.netTerminalAnnual, m.netTerminalAnnual] },

    sec('hardware'),
    { kind: 'rev', label: t(p + 'hwRevenue', { price: num(i.hwPrice, 2), locs: num(i.numLocs) }), y: once(m.hwRevenue), oneTime: true },
    { kind: 'cost', label: t(p + 'hwCogs', { cost: num(i.hwCost, 2), locs: num(i.numLocs) }), y: once(-m.hwCOGS), oneTime: true },
    { kind: 'comm', label: t(p + 'hwComm', { pct: num(i.commHwPct, 1) }), y: once(-m.hwCommission), oneTime: true },
    { kind: 'subtotal', label: t(p + 'hwNet'), y: once(m.hwNet) },

    sec('install'),
    { kind: 'rev', label: t(p + 'instRevenue', { price: num(i.instPrice, 2), locs: num(i.numLocs) }), y: once(m.instRevenue), oneTime: true },
    { kind: 'cost', label: t(p + 'instCogs', { cost: num(i.instCost, 2), locs: num(i.numLocs) }), y: once(-m.instCOGS), oneTime: true },
    { kind: 'comm', label: t(p + 'instComm', { pct: num(i.commInstPct, 1) }), y: once(-m.instCommission), oneTime: true },
    { kind: 'subtotal', label: t(p + 'instNet'), y: once(m.instNet) },

    sec('otherComm'),
    { kind: 'comm', label: t(p + 'payComm', { fee: num(i.commPayPerLoc, 2), locs: num(i.numLocs) }), y: once(-m.commissionPayment), oneTime: true },
    { kind: 'subtotal', label: t(p + 'otherCommNet'), y: once(-m.otherCommissions) },

    { kind: 'total', label: t(p + 'profit'), y: [m.profitYear1, m.profitYear2, m.profitYear3] },
  ];
}
