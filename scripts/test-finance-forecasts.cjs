// Moteur des prévisions du module Finance (src/pages/Finance/Forecasts/engine.ts) : formules,
// agrégations, autonomie de trésorerie, seuil de rentabilité — et deux contrôles croisés :
//   - le budget « MRR ajouté » tiré du VRAI modèle de drivers FY2027 (données de la CFO) ;
//   - le coût de l'investissement calculé par le navigateur = celui du serveur (lignes nominatives
//     cachées sans finance:payroll), sur le VRAI classeur de la CFO, au cent près.
// Plus : traductions EN/FR complètes et identiques pour toutes les clés des pages.
//   node scripts/test-finance-forecasts.cjs [dossier design/finance]
// ⚠️ Échoue si le dossier de passation manque.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSync } = require('esbuild');

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '../../design/finance'));
const WORKBOOK = path.join(DIR, 'source_excel', 'Cluster_Budget_Sep2026_Dec2027.xlsx');
const BACK = path.join(__dirname, '../../commission-tracker');
if (!fs.existsSync(WORKBOOK)) { console.error(`ÉCHEC : classeur de la CFO introuvable (${WORKBOOK})`); process.exit(1); }

const build = (entry, name) => {
  const out = path.join(os.tmpdir(), `${name}-${process.pid}.cjs`);
  buildSync({ entryPoints: [entry], outfile: out, format: 'cjs', bundle: true, logLevel: 'error' });
  return require(out);
};
const E = build(path.join(__dirname, '../src/pages/Finance/Forecasts/engine.ts'), 'finance-forecasts');
const M = build(path.join(__dirname, '../src/pages/Finance/model.ts'), 'finance-model-fc');
const { extractHandoff } = require(path.join(BACK, 'services/finance/handoff.js'));
const BC = require(path.join(BACK, 'services/finance/forecastsCompute.js'));
const xlsx = require(path.join(BACK, 'node_modules/xlsx'));

let n = 0;
const ok = (c, m) => { assert(c, m); n++; };
const near = (a, b, m, tol = 1e-6) => ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m} : ${a} ≠ ${b}`);
const cents = (a, b, m) => ok(Math.abs(a - b) < 0.005, `${m} : ${a} ≠ ${b}`);
const s = (a) => a.reduce((x, y) => x + (y || 0), 0);

// ---------------------------------------------------------------- périodes
ok(E.periodGroups('m').length === 12 && E.periodGroups('q')[3].join() === '9,10,11' && E.periodGroups('y')[0].length === 12, 'périodes : 12 mois, 4 trimestres, 1 exercice');
ok(E.sumOrNull([null, null]) === null && E.sumOrNull([null, 2, 3]) === 5, 'somme vide = vide (pas 0)');
ok(E.ymAdd('2026-12', 1) === '2027-01' && E.ymAdd('2027-01', -1) === '2026-12', 'mois : passage d\'année');

// ---------------------------------------------------------------- budget du modèle de drivers (vraies données)
const { reference: ref, roster: raw } = extractHandoff(DIR);
const roster = {
  employees: raw.employees.map((e, i) => ({ id: i + 1, ...e, salaryBase: e.salary, raisePct: null, raiseMo: null, burdenPct: null, startMo: 0, endMo: null })),
  contractors: raw.contractors.map((c, i) => ({ id: i + 1, ...c, rate: c.rate || null, hours: c.hours || null, amtBase: c.amt, startMo: 0, endMo: null })),
};
const pay = M.computePayroll(roster, { burden: 17.5, raise: 0, raiseMo: 0 }, M.payCodesOf(ref));
const R = M.computeAll({ ref, drivers: { drv: {} }, opex: { opx: {}, opxG: {} }, trips: null, payroll: pay }, 1);
const MB = E.modelSalesBudget(ref.start, R.Rm, R.I);
const st = ref.start;
const start0 = st.canEnd * st.canArpu;
near(MB.mrr[0], R.Rm.canSub[0] - start0, 'budget MRR janvier = MRR d\'abonnement Canada janvier − départ décembre');
for (let i = 1; i < 12; i++) near(MB.mrr[i], R.Rm.canSub[i] - R.Rm.canSub[i - 1], `budget MRR mois ${i + 1} = Δ canSub`);
near(s(MB.mrr), R.Rm.canSub[11] - start0, 'Σ MRR ajouté = MRR de sortie − MRR de départ');
for (let i = 0; i < 12; i++) {
  const prevArpu = i ? R.Rm.canArpu[i - 1] : st.canArpu;
  near(MB.mrr[i], MB.grossMrr[i] - MB.churnMrr[i] + R.Rm.canBeg[i] * (R.Rm.canArpu[i] - prevArpu), `mois ${i + 1} : Δ = ajouts × ARPU − churn × ARPU + parc × ΔARPU (exact)`);
}
ok(MB.merchants.every((v, i) => v === R.Rm.newAdds[i]) && MB.installs.every((v, i) => v === R.Rm.newCl[i]), 'budget marchands = ajouts de rooftops ; installations = nouveaux clients');
ok(MB.mrr.every(Number.isFinite) && s(MB.mrr) !== 0, 'budget MRR fini et non nul');

// ---------------------------------------------------------------- ventes
const blank = () => Array(12).fill(null);
const actual = {
  mrr: { source: 'billing', values: [100, 120, 90, 80, 0, 0, 0, 0, 0, 50, null, null], newMrr: [150, 170, 140, 130, 0, 0, 0, 0, 0, 60, null, null], churnMrr: [50, 50, 50, 50, 0, 0, 0, 0, 0, 10, null, null], newSubs: [3, 4, 3, 2, 0, 0, 0, 0, 0, 1, null, null] },
  merchants: { source: 'crm', values: [3, 4, 3, 2, 0, 0, 0, 0, 0, 1, 0, 0] },
  installs: { source: 'none', values: blank() },
  payActivations: { source: 'zentact', values: blank() },
};
const cells = {
  budget: Object.fromEntries(E.yearMonths(2026).map((k) => [k, { mrr: 100, merchants: 3, installs: 2 }])),
  forecast: { '2026-10': { mrr: 140 }, '2026-11': { mrr: 150 } },
  actual: { '2026-01': { installs: 2 }, '2026-12': { installs: 9 } },
};
const months = E.buildSales(2026, '2026-10', actual, cells, null);
ok(months[8].status === 'closed' && months[9].status === 'mtd' && months[10].status === 'future', 'statuts : clos / mois en cours / à venir');
ok(months[0].actual.mrr === 100 && months[0].landing.mrr === 100 && months[0].landingFrom.mrr === 'actual', 'mois clos : atterrissage = réel');
ok(months[9].landing.mrr === 140 && months[9].landingFrom.mrr === 'forecast' && months[9].actual.mrr === 50, 'mois en cours : prévision si saisie (réel à date gardé)');
ok(months[10].landing.mrr === 150 && months[11].landing.mrr === 100 && months[11].landingFrom.mrr === 'budget', 'à venir : prévision, sinon budget');
ok(months[0].actual.installs === 2 && months[11].actual.installs === null, 'installations : réel saisi (aucune source), jamais un réel futur');
ok(months[11].actual.merchants === null, 'source vivante : pas de réel pour un mois à venir');
const withoutFc = E.buildSales(2026, '2026-10', actual, { budget: cells.budget }, null);
ok(withoutFc[9].landing.mrr === 50 && withoutFc[9].landingFrom.mrr === 'actual', 'mois en cours sans prévision : réel à date');
const q = E.salesRows(months, 'q', 2026);
ok(q.length === 4 && q[0].actual.mrr === 310 && q[0].budget.mrr === 300 && q[0].variance === 10, 'trimestre 1 : Σ réel 310, budget 300, écart +10');
ok(q[0].track === 'onTrack' && q[1].track === 'watch' && q[3].track === null && q[3].status === 'mixed', 'statut du trimestre : dans la cible / à surveiller / mixte');
ok(E.trackStatus(98, 100) === 'onTrack' && E.trackStatus(97.9, 100) === 'watch', 'tolérance : 2 % sous le budget');
const fy = E.salesRows(months, 'y', 2026)[0];
near(fy.landing.mrr, 100 + 120 + 90 + 80 + 0 * 5 + 140 + 150 + 100, 'atterrissage FY = réels + prévisions + budget restant');
const tiles = E.salesTiles(months, null, '2026-10', 19);
ok(tiles.mtd.mrr === 50 && tiles.mtd.budget === 100 && tiles.mtd.pct === 50 && tiles.mtd.days === 31, 'tuile mois en cours');
near(tiles.mtd.pace, (1 / 19) * 31, 'rythme linéaire = réel ÷ jours écoulés × jours du mois');
ok(tiles.ytd.months === 9 && tiles.ytd.actual === 390 && tiles.ytd.budget === 900, 'cumul : mois CLOS seulement');
// Facteurs d'écart : se réconcilient avec l'écart total, au cent.
const model = { mrr: Array(12).fill(100), merchants: Array(12).fill(3), installs: Array(12).fill(2), grossMrr: Array(12).fill(150), churnMrr: Array(12).fill(40), arpu: Array(12).fill(45) };
const mm = E.buildSales(2026, '2026-10', actual, cells, model);
const vd = E.varianceDrivers(mm, actual, model, 2026);
cents(s(vd.drivers.map((d) => d.value)), vd.net, 'facteurs d\'écart (modèle) : Σ = écart net');
cents(vd.net, (100 + 120 + 90 + 80 + 0 + 0 + 0 + 0 + 0 + 50) - 100 * 10, 'écart net = Σ (réel − budget), mois clos + en cours');
const vol = vd.drivers.find((d) => d.key === 'volume').value;
cents(vol, ((3 + 4 + 3 + 2 + 1) - 3 * 10) * 45, 'volume = (nouveaux réels − ajouts budget) × ARPU budget');
cents(vd.drivers.find((d) => d.key === 'churn').value, -((50 * 4 + 10) - 40 * 10), 'attrition = MRR perdu budget − réel');
const vs = E.varianceDrivers(months, { ...actual, mrr: { ...actual.mrr, source: 'pending' } }, null, 2026);
cents(s(vs.drivers.map((d) => d.value)), vs.net, 'facteurs d\'écart (simple) : Σ = écart net');
ok(E.varianceDrivers(E.buildSales(2026, '2026-01', actual, {}, null), actual, null, 2026) === null, 'aucun budget : pas de facteurs');

// ---------------------------------------------------------------- paiements
const z = [
  { ym: '2026-06', active: 100, installs: 5, conv: 2, churned: null, grossFees: 20000, residual: 7000 },
  { ym: '2026-07', active: 104, installs: 6, conv: 3, churned: 5, grossFees: 21000, residual: 7350 },
  { ym: '2026-08', active: 110, installs: 7, conv: 4, churned: 5, grossFees: 22000, residual: 7920 },
  { ym: '2026-09', active: 112, installs: 4, conv: 2, churned: 4, grossFees: 23520, residual: 8232 },
];
const act = E.mergeActuals(z, { '2026-09': { residual: 8400 }, '2026-10': { active: 1 }, '2026-11': { residual: 9000, active: 115, grossFees: 25000 } }, '2026-09');
ok(act.length === 5 && act[3].residual === 8400 && act[3].overridden.join() === 'residual', 'dérogation : remplace la valeur Zentact, marquée');
ok(act[4].ym === '2026-11' && act[4].active === 115, 'un mois au-delà de Zentact devient réel si la CFO y saisit le résiduel');
ok(!act.some((m) => m.ym === '2026-10'), 'mois sans Zentact ni résiduel saisi : pas un réel');
near(act[3].arpu, 23520 / 112, 'ARPU = frais bruts ÷ actifs');
near(act[3].margin, (8400 / 23520) * 100, 'marge = résiduel ÷ frais bruts');
const zz = E.mergeActuals(z, {}, '2026-09');
const da = E.defaultAssumptions(zz);
near(da.inst, (6 + 7 + 4) / 3, 'défaut installations = moyenne des 3 derniers mois');
near(da.conv, (3 + 4 + 2) / 3, 'défaut ajouts conversion');
near(da.churn, ((5 / 100 + 5 / 104 + 4 / 110) / 3) * 100, 'défaut attrition = moyenne des taux (perdus ÷ actifs du mois précédent)');
near(da.margin, ((7350 + 7920 + 8232) / (21000 + 22000 + 23520)) * 100, 'défaut marge = Σ résiduel ÷ Σ frais (3 mois)');
ok(da.arpuG === 0 && E.defaultAssumptions([]) === null, 'défaut croissance 0 ; aucun réel → aucune hypothèse');
const A = { inst: 10, conv: 5, churn: 2, arpuG: 1, margin: 40 };
const fc = E.forecastPayments(zz[3], A, '2026-12');
ok(fc.length === 3 && fc[0].ym === '2026-10' && fc.every((m) => m.live), 'prévision : du mois suivant le dernier réel jusqu\'à décembre');
let a0 = 112, arpu = 23520 / 112;
for (const m of fc) {
  const ch = a0 * 0.02; a0 = a0 + 15 - ch; arpu *= 1.01;
  near(m.churned, ch, `${m.ym} perdus = actifs × 2 %`); near(m.active, a0, `${m.ym} actifs`);
  near(m.arpu, arpu, `${m.ym} ARPU part du DERNIER réel (non arrondi)`);
  near(m.residual, a0 * arpu * 0.4, `${m.ym} résiduel = actifs × ARPU × MARGE`);
}
const fc2 = E.forecastPayments(zz[3], { ...A, margin: 30 }, '2026-12');
near(fc2[0].residual / fc[0].residual, 30 / 40, 'la marge change VRAIMENT le résiduel (le prototype l\'affichait seulement)');
const serie = E.paymentSeries(zz, A, 2026);
ok(serie.months.length === 7 && serie.seed.ym === '2026-09', 'série de l\'année : 4 réels + 3 prévus');
const pq = E.paymentRows(serie.months, 'q', 2026);
ok(pq[0].last === null && pq[1].last.ym === '2026-06' && pq[2].last.ym === '2026-09' && !pq[2].live && pq[3].live, 'trimestres : dernier mois de la période, réel / prévu');
near(pq[2].residual, 7350 + 7920 + 8232, 'flux du trimestre = somme');
near(pq[2].margin, ((7350 + 7920 + 8232) / (21000 + 22000 + 23520)) * 100, 'marge du trimestre = Σ résiduel ÷ Σ frais');
const pm = E.paymentRows(serie.months, 'm', 2026);
ok(pm[8].last === serie.seed && pm[8].last.active === serie.months.find((m) => m.ym === '2026-09').active, 'tuiles et tableau lisent la MÊME série (même objet)');

// ---------------------------------------------------------------- trésorerie
ok(E.weekStart('2026-12-21', 1) === '2026-12-28' && E.weekStart('2026-12-21', 2) === '2027-01-04' && E.weekStart('2026-10-26', 1) === '2026-11-02', 'semaines : vraies dates, passages de mois et d\'année (« Oct Nov 7 » du prototype corrigé)');
for (let i = 0; i < 13; i++) ok(new Date(`${E.weekStart('2026-10-19', i)}T12:00:00Z`).getUTCDay() === 1, `semaine ${i + 1} : un lundi`);
// Flux synthétiques du prototype (K$) passés comme SAISIES : la mécanique du solde doit redonner ses chiffres.
const lines = { saas: [], residual: [], hardware: [], payroll: [], vendors: [], debt: [], interco: [] };
for (let w = 1; w <= 13; w++) {
  lines.saas.push(128 + (w % 4 === 1 ? 210 : 0)); lines.residual.push(w % 4 === 2 ? 272 : 0); lines.hardware.push(35 + (w % 3) * 12);
  lines.payroll.push(w % 2 === 0 ? 385 : 0); lines.vendors.push(92 + (w % 5) * 18); lines.debt.push(w % 4 === 0 ? 118 : 0); lines.interco.push(w === 6 ? -250 : 0);
}
const base = E.computeCash('2026-10-05', 2840, 1500, lines, []);
ok(base.weeks.map((w) => Math.round(w.close)).join() === '3115,3061,3078,2586,2891,2581,2628,2166,2375,2345,2422,1954,2193', 'Base : soldes du prototype (SPEC §C.3)');
ok(base.min.week === 12 && Math.round(base.min.value) === 1954 && Math.round(base.end) === 2193, 'Base : minimum S12 1 954 K$, fin 2 193 K$');
ok(base.weeks.every((w, i) => i === 0 || w.open === base.weeks[i - 1].close) && base.weeks[0].open === 2840, 'ouverture = clôture de la semaine précédente');
near(base.weeklyBurn, (2840 - base.end) / 13, 'brûlage hebdomadaire');
near(base.monthlyBurn, ((2840 - base.end) / 13) * 52 / 12, 'brûlage mensuel = hebdo × 52 ÷ 12 (pas ÷ 3)');
near(base.runway, base.end / base.monthlyBurn, 'autonomie = solde S13 ÷ brûlage mensuel');
near(base.runwayAboveReserve, (base.end - 1500) / base.monthlyBurn, 'autonomie au-dessus de la réserve');
ok(base.belowReserve.length === 0, 'Base : jamais sous la réserve de 1 500 K$');
// Pessimiste du prototype = résiduels × 0,94 et fournisseurs + 30/semaine : deux ajustements NOMMÉS.
const down = E.computeCash('2026-10-05', 2840, 1500, lines, [
  { id: 'a', label: 'Residuals −6%', category: 'residual', mode: 'pct', value: -6, from: 1, to: 13 },
  { id: 'b', label: 'Vendors +30/wk', category: 'vendors', mode: 'amount', value: 30, from: 1, to: 13 },
]);
ok(down.min.week === 12 && Math.round(down.min.value) === 1545 && Math.round(down.end) === 1754, 'Pessimiste : minimum S12 1 545 K$, fin 1 754 K$ (SPEC §C.3)');
// Optimiste : résiduels + 4 % et le +15/semaine, désormais VISIBLE (ajustement nommé).
const up = E.computeCash('2026-10-05', 2840, 1500, lines, [
  { id: 'a', label: 'Residuals +4%', category: 'residual', mode: 'pct', value: 4, from: 1, to: 13 },
  { id: 'b', label: 'Other receipts +15/wk', category: 'otherIn', mode: 'amount', value: 15, from: 1, to: 13 },
]);
ok(Math.round(up.min.value) === 2167 && Math.round(up.end) === 2421, 'Optimiste : minimum 2 167 K$, fin 2 421 K$ (SPEC §C.3)');
ok([base, down, up].map((x) => x.runway.toFixed(1)).join() === '10.2,4.8,17.3' && [base, down, up].map((x) => Math.round(x.monthlyBurn)).join() === '216,362,140', 'autonomie et brûlage = prototype (10,2 / 4,8 / 17,3 mois ; 216 / 362 / 140 K$ par mois)');
ok(up.weeks.every((w) => w.adj !== 0), 'l\'ajustement apparaît dans la colonne « Ajust. du scénario » chaque semaine');
const allOut = E.computeCash('2026-10-05', 1000, 0, { payroll: Array(13).fill(100), vendors: Array(13).fill(50) }, [{ id: 'x', label: 'x', category: 'allOut', mode: 'pct', value: 10, from: 2, to: 3 }]);
near(allOut.weeks[0].adj, 0, 'ajustement hors de ses semaines : sans effet');
near(allOut.weeks[1].adj, -15, '+10 % sur tous les décaissements RETIRE 15 du cash');
const flat = E.computeCash('2026-10-05', 1000, 0, { saas: Array(13).fill(1) }, []);
ok(flat.runway === null && flat.monthlyBurn < 0, 'trésorerie qui monte : pas d\'autonomie affichée');

// ---------------------------------------------------------------- investissement (vrai classeur)
const wb = xlsx.read(fs.readFileSync(WORKBOOK), { type: 'buffer', cellDates: true });
const W = { sheetNames: wb.SheetNames, rows: (nm) => xlsx.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: true, defval: null }) };
const P = BC.parseInvestmentWorkbook(W);
const mk = (prog) => {
  const x = P[prog];
  const inv = { months: x.months, initiatives: [{ id: 'main', name: 'Main', capPct: 60, other: {} }, { id: 'kds', name: 'KDS', capPct: null, other: { [x.months[5]]: 1234.56 } }], returns: x.returns || {}, returnLabel: null, source: null };
  const people = x.people.map((pp, i) => ({ id: `p${i}`, ...pp, initiativeId: i % 3 === 0 ? 'kds' : i % 5 === 0 ? null : 'main', alloc: i % 2 ? 100 : 50 }));
  return { inv, people };
};
for (const prog of ['v2', 'payments']) {
  const { inv, people } = mk(prog);
  const f = E.computeInvestment(inv, people);
  const b = BC.computeInvestment(inv, people);
  for (const k of inv.months) cents(f.total[k], b.total[k], `${prog} ${k} : total navigateur = serveur`);
  for (const it of b.initiatives) for (const k of inv.months) cents(f.initiatives.find((x) => x.id === it.id).cost[k], it.cost[k], `${prog} ${it.id} ${k}`);
  ok(f.unassignedCount === b.unassignedCount && Math.abs(f.headcount.fte - b.headcount.fte) < 1e-9, `${prog} : non affectés et ETP identiques`);
  // Tous à 100 %, tous affectés : le total du classeur.
  const full = E.computeInvestment({ ...inv, initiatives: [{ id: 'm', name: 'M', capPct: null, other: {} }] }, people.map((pp) => ({ ...pp, alloc: 100, initiativeId: 'm' })));
  const fy27 = s(E.yearMonths(2027).map((k) => full.total[k]));
  if (prog === 'v2') { cents(fy27, 1223883.22, 'V2 FY2027 = 1 223 883,22 (SPEC §C.4)'); cents(s(['2026-09', '2026-10', '2026-11', '2026-12'].map((k) => full.total[k])), 396078.71, 'V2 sep.–déc. 2026'); }
  else { ok(Math.abs(fy27 - 334634.12) <= 0.0051, `Payments Conversion FY2027 ≈ 334 634,12 (somme exacte ${fy27.toFixed(4)})`); cents(s(E.yearMonths(2027).map((k) => inv.returns[k])), 449588.34, 'rendement FY2027 = 449 588,34'); }
  // Seuil de rentabilité : vérifié par force brute.
  const be = E.breakEven(inv.months, full.total, inv.returns);
  let c = 0, r = 0, want = null;
  inv.months.forEach((k, i) => { c += full.total[k]; r += inv.returns[k] || 0; if (want == null && r > 0 && r >= c) want = i; });
  ok(be.index === want, `${prog} : seuil de rentabilité = premier mois où le cumul du rendement ≥ le cumul du coût (${be.ym})`);
  cents(be.cumCost[be.cumCost.length - 1], s(inv.months.map((k) => full.total[k])), `${prog} : coût cumulé final`);
  if (prog === 'payments') {
    ok(be.index != null && be.gap > 0, `Payments Conversion : cumul rattrapé dans l'horizon (${be.ym}, écart final ${Math.round(be.gap)} $)`);
    console.log('  Payments Conversion : seuil cumulé', be.ym, '· seuil mensuel', be.monthlyYm);
    cents(be.gap, s(inv.months.map((k) => inv.returns[k])) - s(inv.months.map((k) => full.total[k])), 'écart final = Σ rendement − Σ coût');
    ok(be.monthlyYm === '2026-11', 'Payments Conversion : rentable chaque mois dès novembre 2026 (BAIIA du classeur : −4 720 en oct., +1 511 en nov.)');
  } else ok(be.index === null && be.cumRet.every((v) => v === 0), 'V2 : sans rendement saisi, aucun seuil');
  const cp = E.capitalizable(E.computeInvestment(inv, people), E.yearMonths(2027));
  const f2 = E.computeInvestment(inv, people);
  const mainFy = s(E.yearMonths(2027).map((k) => f2.initiatives[0].cost[k]));
  near(cp.pct, 60, 'capitalisable : taux pondéré des initiatives qui en ont un');
  near(cp.amount, mainFy * 0.6, 'capitalisable : montant');
  near(cp.uncovered, s(E.yearMonths(2027).map((k) => f2.initiatives[1].cost[k] + f2.unassigned[k])), 'coût sans taux = initiatives sans taux + non affectés');
}
const bx = E.breakEven(['a', 'b', 'c'], { a: 10, b: 10, c: 10 }, { a: 0, b: 15, c: 20 });
ok(bx.index === 2 && bx.monthlyIndex === 1 && bx.gap === 5, 'seuil cumulé (mois 3) vs seuil mensuel (mois 2)');

// ---------------------------------------------------------------- traductions
const I = require('../src/pages/Finance/i18n/forecasts.json');
const flat2 = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat2(v, `${p}${k}.`) : [`${p}${k}`]));
const en = new Set(flat2(I.en)), fr = new Set(flat2(I.fr));
ok([...en].every((k) => fr.has(k)) && [...fr].every((k) => en.has(k)), `EN et FR : mêmes clés (${en.size})`);
const get = (o, k) => k.split('.').reduce((a, x) => (a == null ? a : a[x]), o);
ok([...en].every((k) => typeof get(I.en, k) === 'string' && get(I.en, k).length && typeof get(I.fr, k) === 'string' && get(I.fr, k).length), 'aucune chaîne vide');
// Chaque clé écrite dans les pages existe.
const SRC = path.join(__dirname, '../src/pages/Finance/Forecasts');
const used = new Set();
for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.tsx'))) {
  const txt = fs.readFileSync(path.join(SRC, f), 'utf8');
  for (const m of txt.matchAll(/['`](finance\.forecasts\.[A-Za-z0-9_.]+)(['`])/g)) if (!m[1].endsWith('.')) used.add(m[1]);
}
// Clés construites (gabarits `${…}`) : toutes leurs valeurs possibles.
const expand = {
  'cash.books_': ['error', 'unavailable'], 'cash.cat.': ['saas', 'residual', 'hardware', 'otherIn', 'payroll', 'vendors', 'debt', 'taxes', 'otherOut', 'interco', 'allIn', 'allOut'],
  'cash.scen.': ['base', 'down', 'up'], 'common.per.': ['m', 'q', 'y'],
  'inv.prog_': ['v2', 'payments'], 'inv.returnHint_': ['v2', 'payments'], 'inv.returnLabel_': ['v2', 'payments'], 'inv.sub_': ['v2', 'payments'], 'inv.title_': ['v2', 'payments'], 'inv.type_': ['Employee', 'Contractor'],
  'payments.asm.': ['inst', 'conv', 'churn', 'arpuG', 'margin'], 'payments.col.': ['active', 'installs', 'conv', 'churned', 'arpu', 'grossFees', 'residual', 'margin'],
  'payments.tiles.': ['active', 'installs', 'conv', 'arpu', 'residual', 'margin'],
  'sales.drivers.': ['volume', 'newArpu', 'churn', 'base', 'other'], 'sales.metric.': ['mrr', 'merchants', 'installs'], 'sales.series.': ['budget', 'forecast', 'actual'],
  'sales.source.': ['billing', 'crm', 'none', 'pending', 'zentact'], 'sales.status.': ['closed', 'mtd', 'forecast', 'mixed', 'onTrack', 'watch'],
  'import.err.': ['bad_month', 'bad_series', 'bad_number', 'unknown_key', 'header_not_found', 'bad_date', 'not_monday', 'unknown_category', 'negative', 'missing_name', 'total_mismatch', 'no_total_row', 'no_people', 'no_month_columns', 'duplicate_months', 'months_not_consecutive'],
};
for (const [pre, vals] of Object.entries(expand)) for (const v of vals) used.add(`finance.forecasts.${pre}${v}`);
const miss2 = [...used].filter((k) => !en.has(k));
ok(!miss2.length, `toutes les clés utilisées existent (${used.size}) — manquantes : ${miss2.join(', ')}`);
// Les codes d'erreur d'import renvoyés par le serveur ont un libellé.
const IMPSRC = fs.readFileSync(path.join(BACK, 'services/finance/forecastsImport.js'), 'utf8') + fs.readFileSync(path.join(BACK, 'services/finance/forecastsCompute.js'), 'utf8');
const codes = new Set([...IMPSRC.matchAll(/code: '([a-z_]+)'/g)].map((m) => m[1]));
for (const c of codes) ok(en.has(`finance.forecasts.import.err.${c}`), `libellé pour l'erreur d'import « ${c} »`);

console.log(`✅ finance forecasts (moteur) : ${n} vérifications`);
