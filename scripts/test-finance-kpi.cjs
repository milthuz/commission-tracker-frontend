// Moteur de l'onglet KPI (src/pages/Finance/Kpi/kpiModel.ts) : formules du document Word de la
// CFO, priorités (correction > source > formule ; budget enregistré > modèle > formule), écarts,
// colonne 12 mois, et préremplissage du budget par le VRAI modèle de drivers FY2027 calculé sur
// les données de passation.
//   node scripts/test-finance-kpi.cjs [dossier design/finance]
//
// Le dossier de passation (données réelles de la CFO) n'est PAS dans le dépôt : par défaut
// ../design/finance à côté du dépôt. ⚠️ Échoue s'il manque, plutôt que de se déclarer vert.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSync } = require('esbuild');

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '../../design/finance'));
const HANDOFF = path.join(__dirname, '../../commission-tracker/services/finance/handoff.js');
const BACK_KPI = path.join(__dirname, '../../commission-tracker/services/finance/kpi.js');
if (!fs.existsSync(path.join(DIR, 'Finance Module Prototype.dc.html'))) { console.error(`ÉCHEC : paquet de passation introuvable dans ${DIR}`); process.exit(1); }
if (!fs.existsSync(path.join(DIR, 'kpi', 'KPI Dashboard.docx'))) { console.error(`ÉCHEC : document KPI de la CFO introuvable dans ${DIR}/kpi`); process.exit(1); }
for (const f of [HANDOFF, BACK_KPI]) if (!fs.existsSync(f)) { console.error(`ÉCHEC : ${f} introuvable`); process.exit(1); }

const build = (entry, name) => {
  const out = path.join(os.tmpdir(), `${name}-${process.pid}.cjs`);
  buildSync({ entryPoints: [entry], outfile: out, format: 'cjs', bundle: true, logLevel: 'error' });
  return require(out);
};
const K = build(path.join(__dirname, '../src/pages/Finance/Kpi/kpiModel.ts'), 'finance-kpi');
const F = build(path.join(__dirname, '../src/pages/Finance/model.ts'), 'finance-model-kpi');

let n = 0;
const ok = (c, m) => { assert(c, m); n++; };
const near = (a, b, m) => { assert(a != null && b != null && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${m} : ${a} ≠ ${b}`); n++; };

// ---------------------------------------------------------------- mêmes lignes que le serveur
ok(JSON.stringify(require(BACK_KPI).KPI_KEYS) === JSON.stringify(K.KPI_KEYS), 'mêmes KPI, même ordre, navigateur et serveur');
ok(K.KPI_DEFS.filter((d) => d.agg === 'ratio').every((d) => d.num && d.den), 'chaque ARPU / coût unitaire a son numérateur et son dénominateur');

// ---------------------------------------------------------------- jeu de données synthétique
const months = [];
for (let y = 2025, mo = 9; months.length < 13; mo++) { if (mo > 12) { mo = 1; y++; } months.push(`${y}-${String(mo).padStart(2, '0')}`); }
const END = months[12]; // 2026-09
const gl = (v) => ({ value: v, src: v == null ? null : 'books', books: v == null ? null : { v }, manual: null });
const facts = {};
months.forEach((m, i) => {
  facts[m] = {
    activations: 10 + i, resellerActivations: 2, cooCancellations: 1, cancellations: 4,
    cancelMrr: 400, cooCancelMrr: 100, newMrrGross: 1000 + 10 * i, cooNewSubs: 1, cooNewMrr: 90,
    usaChurn: 1, usaMrrUsd: 5000 + i, usaMrrSrc: 'reconstructed', adyenRooftops: 600 + i,
    gl: { recurringRevenue: gl(300000 + 1000 * i), sellingExpense: gl(50000), subscriptionRevenue: gl(250000), adyenIncome: gl(60000), saasCreditNotes: gl(1200) },
    fx: { value: 1.35 + i / 1000, src: 'boc', boc: { v: 1.35 + i / 1000, date: `${m}-28` }, manual: null },
  };
});
const base = () => ({ end: END, windowStart: months[1], months, facts: JSON.parse(JSON.stringify(facts)), budget: {}, overrides: {}, opening: { month: months[0], value: 3000 }, billingReady: true });
const cellOf = (T, key, m = END) => T.rows.find((r) => r.def.key === key).cells.find((c) => c.m === m);
const rowOf = (T, key) => T.rows.find((r) => r.def.key === key);

let T = K.computeKpiTable(base());
ok(T.months.length === 12 && T.months[0] === months[1] && T.months[11] === END, 'fenêtre = 12 mois, le mois d\'avant sert au calcul seulement');
const i12 = 12;
ok(cellOf(T, 'canNew').a.v === 10 + i12 - 2 - 1, 'Canada = activations − revendeurs − CoO');
ok(cellOf(T, 'churn').a.v === 3 && cellOf(T, 'totalChurn').a.v === 4, 'churn = résiliations − CoO ; total = + É.-U.');
near(cellOf(T, 'newMrr').a.v, 1000 + 120 - 90, 'nouvelle MRR = brute − CoO rapprochés');
near(cellOf(T, 'churnMrr').a.v, 300, 'MRR perdue = résiliations − CoO');
near(cellOf(T, 'usaMrrCad').a.v, (5000 + i12) * (1.35 + i12 / 1000), 'MRR É.-U. × taux du MÊME mois');
const newRoof = (i) => (10 + i - 3) + 2;
near(cellOf(T, 'newArpu').a.v, (1000 + 120 - 90) / newRoof(12), 'ARPU des nouveaux = nouvelle MRR ÷ total nouveaux');
near(cellOf(T, 'churnArpu').a.v, 300 / 3, 'ARPU des pertes = MRR perdue ÷ churn Canada');
ok(cellOf(T, 'rooftopIncrease').a.v === newRoof(12) - 4, 'hausse = nouveaux − attrition totale');
let roof = 3000; for (let i = 1; i <= 12; i++) roof += newRoof(i) - 4;
ok(cellOf(T, 'totalRooftops').a.v === roof, `parc = solde de départ + hausses cumulées (${roof})`);
near(cellOf(T, 'mrrIncrease').a.v, 1000, 'hausse de la MRR = mois − mois précédent');
near(cellOf(T, 'arpu').a.v, (300000 + 12000) / roof, 'ARPU = MRR totale ÷ parc');
near(cellOf(T, 'coa').a.v, 50000 / newRoof(12), 'coût d\'acquisition = frais de vente ÷ total nouveaux');
near(cellOf(T, 'arpuSaas').a.v, 250000 / roof, 'ARPU SaaS = revenus d\'abonnement ÷ parc');
near(cellOf(T, 'paymentsArpu').a.v, 60000 / 612, 'ARPU paiements = Adyen ÷ rooftops Adyen');
ok(cellOf(T, 'arpu').a.src === 'formula' && cellOf(T, 'canNew').a.src === 'billing' && cellOf(T, 'totalMrr').a.src === 'books', 'sources');

// ---------------------------------------------------------------- 12 mois
const win = T.months;
ok(rowOf(T, 'canNew').t12.a === win.reduce((a, m, k) => a + (10 + k + 1 - 3), 0), '12 mois d\'un flux = somme');
ok(rowOf(T, 'totalRooftops').t12.a === roof && rowOf(T, 'usaMrrUsd').t12.a === 5012, '12 mois d\'un solde = dernier mois');
const roofs = []; { let r = 3000; for (let i = 1; i <= 12; i++) { r += newRoof(i) - 4; roofs.push(r); } }
const sumMrr = win.reduce((a, m, k) => a + 300000 + 1000 * (k + 1), 0);
near(rowOf(T, 'arpu').t12.a, sumMrr / roofs.reduce((a, b) => a + b, 0), '12 mois de l\'ARPU = Σ MRR ÷ Σ parc');
const sumNewMrr = win.reduce((a, m, k) => a + 1000 + 10 * (k + 1) - 90, 0);
const sumNew = win.reduce((a, m, k) => a + newRoof(k + 1), 0);
near(rowOf(T, 'newArpu').t12.a, sumNewMrr / sumNew, '12 mois de l\'ARPU des nouveaux = Σ MRR ÷ Σ nouveaux');
ok(Math.abs(rowOf(T, 'newArpu').t12.a - rowOf(T, 'newArpu').cells.reduce((a, c) => a + c.a.v, 0)) > 1, 'jamais la somme des ARPU');
near(rowOf(T, 'mrrIncrease').t12.a, 12000, '12 mois de la hausse de MRR = fin − début');
ok(rowOf(T, 'fxUsdCad').t12.a === null, 'taux : pas de total');

// ---------------------------------------------------------------- corrections
let D = base();
D.overrides[END] = { canNew: { v: 100, version: 1, note: 'x' } };
T = K.computeKpiTable(D);
ok(cellOf(T, 'canNew').a.v === 100 && cellOf(T, 'canNew').a.src === 'override' && cellOf(T, 'canNew').a.base === 19, 'correction gagne, valeur d\'origine gardée');
ok(cellOf(T, 'newRooftops').a.v === 102 && cellOf(T, 'totalRooftops').a.v === roof + 100 - 19, 'correction propagée aux formules');
D = base();
D.overrides[months[6]] = { totalRooftops: { v: 5000, version: 1 } };
T = K.computeKpiTable(D);
let r2 = 5000; for (let i = 7; i <= 12; i++) r2 += newRoof(i) - 4;
ok(cellOf(T, 'totalRooftops').a.v === r2, 'parc corrigé un mois : les mois suivants repartent de la correction');
D = base();
D.overrides[END] = { arpu: { v: 99, version: 1 } };
T = K.computeKpiTable(D);
ok(cellOf(T, 'arpu').a.v === 99, 'une ligne-formule se corrige aussi');
D = base(); D.facts[END].gl.recurringRevenue = gl(null);
T = K.computeKpiTable(D);
ok(cellOf(T, 'totalMrr').a.v === null && cellOf(T, 'arpu').a.v === null && cellOf(T, 'mrrIncrease').a.v === null, 'donnée absente : formules vides (jamais 0)');
ok(rowOf(T, 'totalMrr').t12.a === null, 'solde absent au dernier mois : 12 mois vide');
D = base(); D.billingReady = false;
T = K.computeKpiTable(D);
ok(cellOf(T, 'canNew').a.v === null && cellOf(T, 'usaMrrUsd').a.v === null && cellOf(T, 'totalMrr').a.v != null, 'Billing jamais copié : comptes vides, Books reste');
D = base(); D.opening = null;
T = K.computeKpiTable(D);
ok(cellOf(T, 'totalRooftops').a.v === null && cellOf(T, 'arpu').a.v === null, 'sans solde de départ : pas de parc ni d\'ARPU');
D = base(); D.opening = { month: months[5], value: 4000 };
T = K.computeKpiTable(D);
ok(cellOf(T, 'totalRooftops', months[4]).a.v === null && cellOf(T, 'totalRooftops', months[5]).a.v === 4000, 'avant l\'ouverture : vide ; mois d\'ouverture = solde');

// ---------------------------------------------------------------- budget et écarts
D = base();
D.budget[END] = { canNew: { v: 8, version: 1 }, resellerAdds: { v: 2, version: 1 }, sellingExpense: { v: 40000, version: 1 } };
const pre = (m, k) => (k === 'canNew' ? 999 : k === 'churn' && m === END ? 3 : null);
T = K.computeKpiTable(D, pre);
const bc = cellOf(T, 'canNew');
ok(bc.b.v === 8 && bc.b.src === 'stored', 'budget enregistré gagne sur le préremplissage');
ok(cellOf(T, 'canNew', months[11]).b.src === 'model' && cellOf(T, 'canNew', months[11]).b.v === 999, 'mois sans budget enregistré : préremplissage');
ok(bc.var === 19 - 8 && near(bc.varPct, 11 / 8, 'Var %') === undefined, 'écart = réel − budget ; écart % = écart ÷ budget');
near(cellOf(T, 'coa').b.v, 40000 / 10, 'ligne-formule du budget calculée à partir du budget');
ok(cellOf(T, 'coa').b.src === 'formula', 'source : formule du budget');
ok(cellOf(T, 'churnMrr').b.v === null && cellOf(T, 'churnMrr').var === null, 'sans budget : pas d\'écart');
D.budget[END].newArpu = { v: 0, version: 1 };
T = K.computeKpiTable(D, pre);
ok(cellOf(T, 'newArpu').varPct === null, 'budget nul : écart % vide (pas de division par zéro)');

// ---------------------------------------------------------------- vrai modèle FY2027 → préremplissage
const { extractHandoff } = require(HANDOFF);
const { reference: ref, roster: raw } = extractHandoff(DIR);
const roster = {
  employees: raw.employees.map((e, i) => ({ id: i + 1, ...e, salaryBase: e.salary, raisePct: null, raiseMo: null, burdenPct: null, startMo: 0, endMo: null })),
  contractors: raw.contractors.map((c, i) => ({ id: i + 1, ...c, rate: c.rate || null, hours: c.hours || null, amtBase: c.amt, startMo: 0, endMo: null })),
};
const pay = F.computePayroll(roster, { burden: 17.5, raise: 0, raiseMo: 0 }, F.payCodesOf(ref));
const R = F.computeAll({ ref, drivers: { drv: {} }, opex: { opx: {}, opxG: {} }, trips: null, payroll: pay }, 1);
const P = K.modelPrefill(K.modelLike(R), 2027);
for (let i = 0; i < 12; i++) {
  const m = `2027-${String(i + 1).padStart(2, '0')}`;
  near(P(m, 'canNew'), R.I.intAdds[i], `${m} Canada = intAdds`);
  near(P(m, 'resellerAdds'), R.I.resAdds[i], `${m} revendeurs = resAdds`);
  near(P(m, 'churn'), R.I.canChurn[i], `${m} churn = canChurn`);
  near(P(m, 'usaChurn'), R.I.usaChurn[i], `${m} É.-U. = usaChurn`);
  near(P(m, 'totalRooftops'), R.Rm.totEnd[i], `${m} parc = totEnd`);
  near(P(m, 'totalMrr'), R.Rm.recurring[i], `${m} MRR = recurring`);
  near(P(m, 'usaMrrCad'), R.Rm.usaSub[i], `${m} MRR É.-U. = usaSub`);
  near(P(m, 'sellingExpense'), R.master.opex['Sales & Marketing'][i], `${m} frais de vente = OPEX S&M`);
  near(P(m, 'subscriptionRevenue'), R.Rm.totalSub[i], `${m} abonnements = totalSub`);
  near(P(m, 'adyenIncome'), R.Rm.clusterPP[i], `${m} Adyen = clusterPP`);
  near(P(m, 'adyenRooftops'), R.Rm.adyenEnd[i], `${m} rooftops Adyen = adyenEnd`);
  ok(P(m, 'coo') === null && P(m, 'newMrr') === null && P(m, 'churnMrr') === null, `${m} : rien pour ce que le modèle ne prévoit pas`);
}
ok(P('2026-12', 'totalRooftops') === null && P('2028-01', 'canNew') === null, 'hors FY2027 : aucun préremplissage');
// ARPU paiements du budget, recalculé par la formule, = adyenArpu du modèle (clusterPP = adyenEnd × adyenArpu).
const bm = ['2026-12', ...Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, '0')}`)];
const BD = { end: '2027-12', windowStart: '2027-01', months: bm, facts: {}, budget: {}, overrides: {}, opening: null, billingReady: false };
const TB = K.computeKpiTable(BD, P);
for (let i = 0; i < 12; i++) near(cellOf(TB, 'paymentsArpu', bm[i + 1]).b.v, R.Rm.adyenArpu[i], `ARPU paiements du budget = adyenArpu[${i}]`);
near(cellOf(TB, 'arpu', '2027-12').b.v, R.Rm.recurring[11] / R.Rm.totEnd[11], 'ARPU du budget = recurring ÷ totEnd (tuile « Blended ARPU »)');

// ---------------------------------------------------------------- vitesse
const t0 = process.hrtime.bigint();
for (let i = 0; i < 200; i++) K.computeKpiTable(base(), pre);
const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
ok(ms < 20, `un calcul complet de l'onglet en ${ms.toFixed(2)} ms (< 20 ms)`);

console.log(`✅ finance kpi model : ${n} vérifications (calcul de l'onglet : ${ms.toFixed(2)} ms)`);
