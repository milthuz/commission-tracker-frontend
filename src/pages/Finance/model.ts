// ============================================================================
// Module Finance — moteur de calcul (pur, sans React). Phase 1 : budget consolidé FY2027.
//
// Port fidèle de `renderVals()` du prototype du design (design/finance, « spec of record ») :
// boucle 2027 des drivers, paie, OPEX, agrégation du Budget maître, tuiles. Les bancs d'essai
// (scripts/test-finance-model.cjs) comparent CHAQUE ligne à celles du prototype exécuté tel
// quel, dans l'état par défaut et dans un scénario d'ajustements — au cent près.
//
// Les DONNÉES (valeurs par défaut, soldes de départ, colonne 2026, lignes OPEX, effectif) ne
// sont pas ici : elles viennent de l'API (/api/finance/budget). Le frontend est public.
//
// Les incohérences du prototype sont REPRODUITES, pas corrigées (décision de David,
// 2026-10-19 : on reproduit et on signale à la CFO) — voir design/finance/ECARTS-pour-la-CFO.md.
// ============================================================================

export const MONTHS = 12;
export const MAPS = ['Recurring COGS', 'Service COGS', 'S&M', 'R&D', 'G&A'] as const;
export type PnlMap = (typeof MAPS)[number];
export type Series = number[];

export interface OpexItem { t: 'sec' | 'line' | 'sub'; name: string; key: string | null; pay: string | null; v: number[] | null }
export interface Trip { name: string; dept: 'S&M' | 'R&D' | 'G&A'; month: number; people: number; airfare: number; nights: number; hotel: number; days: number; perDiem: number; other: number }
export interface NonOpSide { v: Series; gl: { name: string; v: Series }[] }
export interface Reference {
  v: number;
  fiscalYear: number;
  drvDefaults: Record<string, number>;
  start: Record<string, number>;
  fy26: Record<string, number>;
  a26: { rev: number; cogs: number; opex: number };
  opex: OpexItem[];
  trips: Trip[];
  nonOp: { income: NonOpSide; expense: NonOpSide };
}

export interface DriverState { drv: Record<string, Series> }
export interface OpexState { opx: Record<string, Record<string, number>>; opxG: Record<string, number> }
// deptRaise (SH-48) : hausse par code de département ; absent = suit `raise`.
export interface PayrollGlobals { burden: number; raise: number; raiseMo: number; deptRaise?: Record<string, number> }

export interface Employee {
  id: number; ent: string; dept: string; name: string; salary: number; salaryBase: number | null; alloc: number; map: PnlMap;
  raisePct: number | null; raiseMo: number | null; burdenPct: number | null; startMo: number; endMo: number | null;
}
export interface Contractor {
  id: number; co: string; name: string; svc: string; rate: number | null; hours: number | null; amt: number; amtBase: number | null;
  map: PnlMap; dept: string; startMo: number; endMo: number | null;
}
export interface Roster { employees: Employee[]; contractors: Contractor[] }

// Ce que le serveur envoie à TOUS les usagers de la section : aucun nom, aucun salaire.
export interface PayrollAgg {
  payByMap: Record<PnlMap, Series>;
  conByMap: Record<PnlMap, Series>;
  payNN: Series;
  payEX: Series;
  lines: Record<string, Series>;
  headcount: number;
  contractorCount: number;
}

export const z12 = (): Series => Array(MONTHS).fill(0);
export const sum = (a: Series) => a.reduce((x, y) => x + y, 0);
const plus = (...as: Series[]) => as.reduce((acc, a) => acc.map((v, i) => v + a[i]), z12());
const minus = (a: Series, b: Series) => a.map((v, i) => v - b[i]);
const sumM = (list: { m: Series }[]) => list.reduce((acc, x) => acc.map((v, i) => v + x.m[i]), z12());

// ---------------------------------------------------------------------------- paie
// GARDER IDENTIQUE à commission-tracker/services/finance/payroll.js (le serveur fait ce calcul
// pour les usagers qui ne voient pas les salaires).
export interface EmployeeCalc extends Employee { raise: number; raiseMoV: number; burden: number; incl: number; m: Series }
export interface ContractorCalc extends Contractor { m: Series }
export interface PayrollCalc extends PayrollAgg { emp: EmployeeCalc[]; con: ContractorCalc[]; payTot: Series; conTot: Series }

const NET_NEW_RE = /NET NEW|IMPLEMENTATION/;
const active = (p: { startMo: number | null; endMo: number | null }, k: number) =>
  k >= (p.startMo == null ? 0 : p.startMo) && (p.endMo == null || k <= p.endMo);

export function computePayroll(roster: Roster, g: PayrollGlobals, payCodes: string[]): PayrollCalc {
  const deptRaise = g.deptRaise || {};
  const emp: EmployeeCalc[] = roster.employees.map((e) => {
    // Priorité (SH-48) : hausse de l'employé > hausse de son département > hausse globale.
    const dRaise = deptRaise[e.dept] == null ? g.raise : deptRaise[e.dept];
    const raise = e.raisePct == null ? dRaise : e.raisePct;
    const raiseMoV = e.raiseMo == null ? g.raiseMo : e.raiseMo;
    const burden = e.burdenPct == null ? g.burden : e.burdenPct;
    const incl = e.salary * e.alloc;
    const m = z12().map((_, k) => (active(e, k) ? (incl / 12) * (1 + burden / 100) * (k >= raiseMoV ? 1 + raise / 100 : 1) : 0));
    return { ...e, raise, raiseMoV, burden, incl, m };
  });
  const con: ContractorCalc[] = roster.contractors.map((c) => ({ ...c, m: z12().map((_, k) => (active(c, k) ? c.amt : 0)) }));
  const payByMap = Object.fromEntries(MAPS.map((mp) => [mp, sumM(emp.filter((e) => e.map === mp))])) as Record<PnlMap, Series>;
  const conByMap = Object.fromEntries(MAPS.map((mp) => [mp, sumM(con.filter((c) => c.map === mp))])) as Record<PnlMap, Series>;
  const payNN = sumM(emp.filter((e) => e.map === 'Service COGS' && NET_NEW_RE.test(e.dept)));
  const payEX = sumM(emp.filter((e) => e.map === 'Service COGS' && !NET_NEW_RE.test(e.dept)));
  const deptPay = (d: string) => sumM(emp.filter((e) => (d === 'R&D' ? e.map === 'R&D' : e.dept === d || (d === 'OPERATIONS' && e.dept === 'CONTROL PLUS'))));
  const lines: Record<string, Series> = {};
  for (const code of payCodes) lines[code] = code.startsWith('con:') ? conByMap[code.slice(4) as PnlMap] || z12() : deptPay(code);
  return {
    emp, con, payByMap, conByMap, payNN, payEX, lines,
    headcount: emp.length, contractorCount: con.length, payTot: sumM(emp), conTot: sumM(con),
  };
}

export const payCodesOf = (ref: Reference) => [...new Set(ref.opex.filter((it) => it.pay).map((it) => it.pay as string))];

// Combien de fois une personne entre-t-elle dans le Budget maître ? Les COGS se rangent par POSTE
// du P&L (et la ligne R&D de l'OPEX aussi), mais les autres lignes de paie de l'OPEX lisent le CODE
// DE DÉPARTEMENT, quel que soit le poste (prototype). D'où deux pièges que la page Salaires
// signale : 0 = la personne disparaît (département qu'aucune ligne ne lit, contractuel de G&A —
// aucune ligne « con:G&A ») ; 2 = comptée deux fois (ex. poste COGS dans le département SALES).
export function masterCount(payCodes: string[], p: { map: PnlMap; dept: string }, contractor: boolean) {
  if (contractor) return p.map === 'Recurring COGS' || p.map === 'Service COGS' || payCodes.includes(`con:${p.map}`) ? 1 : 0;
  let n = p.map === 'Recurring COGS' || p.map === 'Service COGS' ? 1 : 0;
  if (p.map === 'R&D' && payCodes.includes('R&D')) n++;
  n += payCodes.filter((c) => c !== 'R&D' && !c.startsWith('con:') && (c === p.dept || (c === 'OPERATIONS' && p.dept === 'CONTROL PLUS'))).length;
  return n;
}

// ---------------------------------------------------------------------------- drivers 2027
// Inputs du mois i : l'ajustement de la CFO s'il existe, sinon la valeur par défaut.
export function driverInputs(ref: Reference, st: DriverState): Record<string, Series> {
  const I: Record<string, Series> = {};
  for (const k of Object.keys(ref.drvDefaults)) {
    const o = st.drv[k];
    I[k] = z12().map((_, i) => { const v = o && o[i] != null ? o[i] : ref.drvDefaults[k]; return +v || 0; });
  }
  return I;
}

export function computeDrivers(ref: Reference, I: Record<string, Series>, pay: PayrollAgg) {
  const Rm: Record<string, Series> = {};
  const push = (k: string, v: number) => { (Rm[k] = Rm[k] || []).push(v); };
  let { canEnd, usaEnd, xpEnd, canArpu, usaArpu, xpArpu, contracts, resid, adyenEnd, adyenArpu, conv, partnerPay, xpPartner, lic, prevTot, hosting, resellerSaas } = ref.start;
  for (let i = 0; i < MONTHS; i++) {
    const x = (k: string) => I[k][i];
    push('canBeg', canEnd); canEnd = canEnd + x('intAdds') + x('resAdds') + x('xpAdds') - x('canChurn'); push('canEnd', canEnd);
    push('usaBeg', usaEnd); usaEnd -= x('usaChurn'); push('usaEnd', usaEnd);
    push('xpBeg', xpEnd); xpEnd -= x('xpChurn'); push('xpEnd', xpEnd);
    const tot = canEnd + usaEnd + xpEnd; push('totEnd', tot); push('newAdds', x('intAdds') + x('resAdds') + x('xpAdds')); push('netRoof', tot - prevTot); prevTot = tot;
    // L'ARPU croît AVANT d'être appliqué : janvier = décembre × (1 + g).
    canArpu *= 1 + x('canArpuG') / 100; usaArpu *= 1 + x('usaArpuG') / 100; xpArpu *= 1 + x('xpArpuG') / 100;
    push('canArpu', canArpu); push('usaArpu', usaArpu); push('xpArpu', xpArpu);
    const canSub = canEnd * canArpu, usaSub = usaEnd * usaArpu, xpSub = xpEnd * xpArpu;
    contracts *= 1 + x('contractsG') / 100;
    push('canSub', canSub); push('usaSub', usaSub); push('xpSub', xpSub); push('contracts', contracts); push('totalSub', canSub + usaSub + xpSub + contracts);
    resid *= 1 + x('residG') / 100; push('resid', resid);
    push('adyenBeg', adyenEnd);
    const netNew = (x('convPct') / 100) * x('intAdds'), exist = x('adyenTarget') - netNew - x('adyenResAdds') - x('adyenXpAdds');
    adyenEnd = adyenEnd + netNew + exist + x('adyenResAdds') + x('adyenXpAdds') - x('adyenChurn');
    push('adyenNetNew', netNew); push('adyenExist', exist); push('adyenEnd', adyenEnd);
    adyenArpu *= 1 + x('adyenArpuG') / 100; push('adyenArpu', adyenArpu); conv += exist; push('conv', conv);
    const clusterPP = adyenEnd * adyenArpu; partnerPay *= 1 + x('partnerPayG') / 100; xpPartner *= 1 + x('xpPartnerG') / 100;
    push('clusterPP', clusterPP); push('partnerPay', partnerPay); push('xpPartner', xpPartner); push('totalPP', clusterPP + partnerPay + xpPartner);
    push('convRev', conv * adyenArpu); // informatif seulement : compris dans clusterPP, dans aucun total
    const newCl = (x('newClientPct') / 100) * x('intAdds'); push('newCl', newCl);
    const newHW = newCl * x('hwPerNew'), existHW = x('existClients') * x('hwPerExist');
    push('newHW', newHW); push('existHW', existHW); push('totalHW', newHW + existHW + x('xpHw') + x('cpHw'));
    const install = newCl * (x('installPrice') - x('discount')); push('install', install); push('totalSvc', install + x('onsite') + x('xpService'));
    lic *= 1 + x('licG') / 100; push('lic', lic);
    hosting *= 1 + x('hostingG') / 100; resellerSaas *= 1 + x('resellerSaasG') / 100;
    const payout = (resellerSaas * x('revShare')) / 100;
    push('hosting', hosting); push('resellerSaas', resellerSaas); push('payout', payout);
    push('recCogs', x('supportWages') + x('supportContr') + x('supportSw') + x('merchantFees') + x('platformFees') + payout + hosting);
    const clHwRev = newHW + existHW, clHwCogs = (clHwRev * x('clusterHwPct')) / 100, xpHwCogs = (x('xpHw') * x('xperioHwPct')) / 100;
    push('clHwRev', clHwRev); push('clHwCogs', clHwCogs); push('xpHwCogs', xpHwCogs); push('hwCogs', clHwCogs + xpHwCogs);
    push('hwCogsPct', Rm.totalHW[i] ? ((clHwCogs + xpHwCogs) / Rm.totalHW[i]) * 100 : 0);
    const halukJobs = (newCl * x('halukPct')) / 100, jobsCost = (halukJobs + x('onsites')) * x('jobCost'), svcContr = jobsCost + x('buffer');
    push('halukJobs', halukJobs); push('jobsCost', jobsCost); push('svcContr', svcContr);
    push('svcCogs', x('nnWages') + x('exWages') + svcContr + x('travel') + x('svcSw'));
    const licCogs = (lic * x('licPct')) / 100; push('licCogs', licCogs);
    push('totCogs', Rm.recCogs[i] + Rm.hwCogs[i] + Rm.svcCogs[i] + licCogs);
    push('recurring', Rm.totalSub[i] + Rm.totalPP[i] + resid); push('transaction', Rm.totalHW[i] + Rm.totalSvc[i] + lic); push('total', Rm.recurring[i] + Rm.transaction[i]);
  }
  // La paie REMPLACE les quatre lignes de salaires des COGS (leurs valeurs par défaut ne servent
  // plus à rien — inputs morts du prototype, gardés pour l'égalité des chiffres).
  Rm.recCogs = Rm.recCogs.map((v, i) => v - I.supportWages[i] - I.supportContr[i] + pay.payByMap['Recurring COGS'][i] + pay.conByMap['Recurring COGS'][i]);
  Rm.svcCogs = Rm.svcCogs.map((v, i) => v - I.nnWages[i] - I.exWages[i] + pay.payNN[i] + pay.payEX[i] + pay.conByMap['Service COGS'][i]);
  Rm.totCogs = Rm.recCogs.map((v, i) => v + Rm.hwCogs[i] + Rm.svcCogs[i] + Rm.licCogs[i]);
  Rm.supportWages = pay.payByMap['Recurring COGS'];
  Rm.supportContr = pay.conByMap['Recurring COGS'];
  Rm.nnWages = pay.payNN;
  Rm.exWages = pay.payEX.map((v, i) => v + pay.conByMap['Service COGS'][i]);
  // Alias affichés dans les tableaux.
  Rm.newCl2 = Rm.newCl;
  Rm.xpHw2 = I.xpHw;
  Rm.lic2 = Rm.lic;
  return Rm;
}

// ---------------------------------------------------------------------------- OPEX
export const TRAVEL_KEYS: Record<string, 'S&M' | 'R&D' | 'G&A'> = { smTravel: 'S&M', rdTravel: 'R&D', gaTravel: 'G&A' };
export const tripTotal = (t: Trip) => (+t.people || 0) * ((+t.airfare || 0) + (+t.nights || 0) * (+t.hotel || 0) + (+t.days || 0) * (+t.perDiem || 0)) + (+t.other || 0);

export function travelByDept(trips: Trip[]) {
  const by: Record<'S&M' | 'R&D' | 'G&A', Series> = { 'S&M': z12(), 'R&D': z12(), 'G&A': z12() };
  for (const t of trips) { const d = by[t.dept] ? t.dept : 'G&A'; by[d][+t.month || 0] += tripTotal(t); }
  return by;
}

// Croissance mensuelle : composée à partir de JANVIER (la cellule saisie de janvier si elle
// existe) ; une cellule saisie gagne toujours ; les mois 2 à 12 de la base sont alors ignorés.
export function applyGrowth(base: Series, cells: Record<string, number> | undefined, g: number | undefined) {
  const o = cells || {};
  const has = (i: number) => o[i] != null;
  if (!g) return base.map((v, i) => (has(i) ? o[i] : v));
  const jan = has(0) ? o[0] : base[0];
  return base.map((_, i) => (has(i) ? o[i] : i === 0 ? jan : jan * Math.pow(1 + g / 100, i)));
}

export type OpexRowKind = 'sec' | 'line' | 'sub' | 'grand';
export interface OpexRow { kind: OpexRowKind; item: OpexItem; key: string; vals: Series; editable: boolean; pay: boolean; travel: boolean }

// year : 0 = FY2026, 1 = FY2027 (le budget, modifiable), 2 = FY2028 (référence, lecture seule).
export function computeOpex(ref: Reference, st: OpexState, trips: Trip[], pay: PayrollAgg, year: 0 | 1 | 2) {
  const travel = travelByDept(trips);
  const rows: OpexRow[] = [];
  const byKey: Record<string, Series> = {};
  let secAcc = z12(), subAcc = z12(), totAcc = z12();
  const lineVals = (it: OpexItem): Series => {
    const k = it.key as string;
    if (TRAVEL_KEYS[k] && year === 1) return travel[TRAVEL_KEYS[k]];
    if (it.pay && year === 1) return pay.lines[it.pay] || z12();
    const base = (it.v || []).slice(year * 12, year * 12 + 12);
    return year !== 1 ? base : applyGrowth(base, st.opx[k], st.opxG[k]);
  };
  for (const it of ref.opex) {
    if (it.t === 'sec') { rows.push({ kind: 'sec', item: it, key: 'sec:' + it.name, vals: [], editable: false, pay: false, travel: false }); continue; }
    if (it.t === 'line') {
      const k = it.key as string;
      const vals = lineVals(it);
      byKey[k] = vals;
      subAcc = subAcc.map((v, i) => v + vals[i]);
      const isTravel = !!TRAVEL_KEYS[k];
      rows.push({ kind: 'line', item: it, key: k, vals, editable: year === 1 && !it.pay && !isTravel, pay: !!it.pay, travel: isTravel });
      continue;
    }
    const k = it.key as string;
    if (/^Total /.test(it.name)) {
      byKey[k] = secAcc; rows.push({ kind: 'grand', item: it, key: k, vals: secAcc, editable: false, pay: false, travel: false });
      totAcc = totAcc.map((v, i) => v + secAcc[i]); secAcc = z12();
      continue;
    }
    if (k === 'opTot') { byKey.opTot = totAcc; rows.push({ kind: 'grand', item: it, key: k, vals: totAcc, editable: false, pay: false, travel: false }); continue; }
    byKey[k] = subAcc; secAcc = secAcc.map((v, i) => v + subAcc[i]);
    rows.push({ kind: 'sub', item: it, key: k, vals: subAcc, editable: false, pay: false, travel: false });
    subAcc = z12();
  }
  return { rows, byKey, travel };
}

export const OPEX_SECTIONS = ['Sales & Marketing', 'Research & Development', 'General & Administrative'] as const;
export type OpexSection = (typeof OPEX_SECTIONS)[number];

// FY2027 par section du Budget maître (quel que soit l'exercice affiché sur la page OPEX).
export function opexBySection(ref: Reference, opex27: ReturnType<typeof computeOpex>) {
  const out: Record<OpexSection, { key: string; name: string; vals: Series }[]> = { 'Sales & Marketing': [], 'Research & Development': [], 'General & Administrative': [] };
  let sec: string | null = null;
  for (const it of ref.opex) {
    if (it.t === 'sec') sec = it.name;
    else if (it.t === 'line') {
      const s: OpexSection = sec === 'Sales & Marketing' ? 'Sales & Marketing' : sec === 'Research & Development' ? 'Research & Development' : 'General & Administrative';
      out[s].push({ key: it.key as string, name: it.name, vals: opex27.byKey[it.key as string] });
    }
  }
  return out;
}

// Sous-totaux de l'OPEX que la liste de la CFO n'a pas (SH-48) : masqués à l'AFFICHAGE seulement,
// leurs lignes restent comptées dans le total de section. Un sous-total qui porte le même nom que
// son unique ligne (« Meals & Entertainment ») la répète pour rien ; « Other G&A » n'est pas dans
// sa liste.
const HIDDEN_OPEX_SUBS = new Set(['gaOtherS']);
export function hiddenOpexSubs(ref: Reference) {
  const out = new Set(HIDDEN_OPEX_SUBS);
  let lines: OpexItem[] = [];
  for (const it of ref.opex) {
    if (it.t === 'line') lines.push(it);
    else if (it.t === 'sub') {
      if (lines.length === 1 && lines[0].name.trim() === it.name.trim() && it.key) out.add(it.key);
      lines = [];
    } else lines = [];
  }
  return out;
}

// Détail OPEX d'une section du Budget maître, dans l'ordre de la référence, avec les sous-totaux.
export function opexDetailBySection(ref: Reference, opex27: ReturnType<typeof computeOpex>) {
  const hidden = hiddenOpexSubs(ref);
  const out: Record<OpexSection, { key: string; name: string; vals: Series; sub: boolean }[]> = { 'Sales & Marketing': [], 'Research & Development': [], 'General & Administrative': [] };
  let sec: OpexSection = 'General & Administrative';
  for (const it of ref.opex) {
    if (it.t === 'sec') { sec = it.name === 'Sales & Marketing' ? 'Sales & Marketing' : it.name === 'Research & Development' ? 'Research & Development' : 'General & Administrative'; continue; }
    const key = it.key as string;
    if (it.t === 'sub' && (/^Total /i.test(it.name) || key === 'opTot' || hidden.has(key))) continue;
    out[sec].push({ key, name: it.name, vals: opex27.byKey[key] || z12(), sub: it.t === 'sub' });
  }
  return out;
}

// ---------------------------------------------------------------------------- Budget maître
export const REV_CATS = ['recurring', 'hardware', 'service', 'licence'] as const;
export type RevCat = (typeof REV_CATS)[number];

// Lignes de détail (GL) sous chaque ligne du Budget maître, et la page où elles mènent.
export const REV_GL: Record<RevCat, string[]> = {
  recurring: ['canSub', 'usaSub', 'xpSub', 'contracts', 'clusterPP', 'partnerPay', 'xpPartner', 'resid'],
  hardware: ['newHW', 'existHW', 'xpHw', 'cpHw'],
  service: ['install', 'onsite', 'xpService'],
  licence: ['lic'],
};
export const COGS_GL: Record<RevCat, string[]> = {
  // Ordre de la CFO (SH-48) : hébergement avant les versements récurrents.
  recurring: ['supportWages', 'supportContr', 'supportSw', 'merchantFees', 'platformFees', 'hosting', 'payout'],
  hardware: ['clHwCogs', 'xpHwCogs'],
  service: ['nnWages', 'exWages', 'svcContr', 'travel', 'svcSw'],
  licence: ['licCogs'],
};
export const PAYROLL_KEYS = new Set(['supportWages', 'supportContr', 'nnWages', 'exWages']);

export function computeMaster(ref: Reference, Rm: Record<string, Series>, ox: ReturnType<typeof opexBySection>) {
  const rev: Record<RevCat, Series> = { recurring: Rm.recurring, hardware: Rm.totalHW, service: Rm.totalSvc, licence: Rm.lic };
  const cogs: Record<RevCat, Series> = { recurring: Rm.recCogs, hardware: Rm.hwCogs, service: Rm.svcCogs, licence: Rm.licCogs };
  const tRev = plus(...REV_CATS.map((c) => rev[c]));
  const tCogs = plus(...REV_CATS.map((c) => cogs[c]));
  const gp = minus(tRev, tCogs);
  const gpBy = Object.fromEntries(REV_CATS.map((c) => [c, minus(rev[c], cogs[c])])) as Record<RevCat, Series>;
  const opex = Object.fromEntries(OPEX_SECTIONS.map((s) => [s, plus(...ox[s].map((l) => l.vals))])) as Record<OpexSection, Series>;
  const tOpex = plus(...OPEX_SECTIONS.map((s) => opex[s]));
  const ebitda = minus(gp, tOpex);
  const noi = ref.nonOp.income.v.map((v) => v || 0);
  const noe = ref.nonOp.expense.v.map((v) => v || 0);
  const ni = plus(ebitda, noi).map((v, i) => v - noe[i]);
  return { rev, cogs, tRev, tCogs, gp, gpBy, opex, tOpex, ebitda, noi, noe, ni };
}

// Ratio d'une ligne « % » : par mois num/den (0 si den = 0), total = Σnum / Σden.
export const ratio = (num: Series, den: Series) => ({
  months: num.map((v, i) => (den[i] ? v / den[i] : 0)),
  total: sum(den) ? sum(num) / sum(den) : 0,
});

// ---------------------------------------------------------------------------- tuiles
export function computeKpis(ref: Reference, I: Record<string, Series>, Rm: Record<string, Series>, M: ReturnType<typeof computeMaster>) {
  const a = ref.a26;
  const a26 = { rev: a.rev, gp: a.rev - a.cogs, eb: a.rev - a.cogs - a.opex };
  const ni26 = a26.eb; // le prototype pose « hors exploitation 2026 = 0 »
  const vs = (cur: number, prev: number) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : null);
  const tRev = sum(M.tRev), gp = sum(M.gp), eb = sum(M.ebitda), ni = sum(M.ni);
  const recurring26 = ref.fy26.recurring;
  const roofStart = ref.start.prevTot;
  const mrrStart = recurring26 / 12;
  const mrrEnd = Rm.recurring[11];
  const arpuStart = mrrStart / roofStart;
  const arpuEnd = Rm.recurring[11] / Rm.totEnd[11];
  const penStart = (ref.start.adyenEnd / ref.start.canEnd) * 100;
  const penEnd = (Rm.adyenEnd[11] / Rm.canEnd[11]) * 100;
  return {
    revenue: { value: tRev, prev: a26.rev, vs: vs(tRev, a26.rev), recurringShare: sum(Rm.recurring) / tRev * 100, transactionShare: sum(Rm.transaction) / tRev * 100 },
    grossProfit: { value: gp, prev: a26.gp, vs: vs(gp, a26.gp), margin: gp / tRev * 100, prevMargin: a26.gp / a26.rev * 100 },
    ebitda: { value: eb, prev: a26.eb, vs: vs(eb, a26.eb), margin: eb / tRev * 100, prevMargin: a26.eb / a26.rev * 100 },
    netIncome: { value: ni, prev: ni26, vs: vs(ni, ni26), margin: ni / tRev * 100, prevMargin: ni26 / a26.rev * 100 },
    // Le churn additionne les trois régions (prototype : can + usa + xp).
    rooftops: { added: sum(Rm.newAdds), ending: Rm.totEnd[11], churn: sum(plus(I.canChurn, I.usaChurn, I.xpChurn)), net: Rm.totEnd[11] - roofStart },
    arpu: { start: arpuStart, end: arpuEnd, added: arpuEnd - arpuStart },
    mrr: { start: mrrStart, end: mrrEnd, added: mrrEnd - mrrStart, exitArr: mrrEnd * 12, vsAvg: (mrrEnd / mrrStart - 1) * 100 },
    adyen: { start: penStart, end: penEnd, pts: penEnd - penStart },
  };
}

// ---------------------------------------------------------------------------- tout ensemble
export interface FinanceInputs {
  ref: Reference;
  drivers: DriverState;
  opex: OpexState;
  trips: Trip[] | null;
  payroll: PayrollAgg;
}

export function computeAll(inp: FinanceInputs, opexYear: 0 | 1 | 2 = 1) {
  const { ref } = inp;
  const I = driverInputs(ref, inp.drivers);
  const Rm = computeDrivers(ref, I, inp.payroll);
  const trips = inp.trips || ref.trips;
  const opex27 = computeOpex(ref, inp.opex, trips, inp.payroll, 1);
  const opexShown = opexYear === 1 ? opex27 : computeOpex(ref, inp.opex, trips, inp.payroll, opexYear);
  const ox = opexBySection(ref, opex27);
  const master = computeMaster(ref, Rm, ox);
  const kpis = computeKpis(ref, I, Rm, master);
  return { I, Rm, trips, opex27, opexShown, ox, master, kpis };
}

export type FinanceResult = ReturnType<typeof computeAll>;
