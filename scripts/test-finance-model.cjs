// Moteur du module Finance (src/pages/Finance/model.ts) comparé au PROTOTYPE du design exécuté
// tel quel — chaque ligne, chaque mois, au cent près, dans l'état par défaut et dans deux
// scénarios d'ajustements.
//   node scripts/test-finance-model.cjs [dossier design/finance]
//
// Le dossier de passation (données réelles de la CFO) n'est PAS dans le dépôt : par défaut
// ../design/finance à côté du dépôt. Les données sont lues par le MÊME extracteur que l'import
// en base (commission-tracker/services/finance/handoff.js). ⚠️ Échoue s'il manque.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { buildSync } = require('esbuild');

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '../../design/finance'));
const PROTO = path.join(DIR, 'Finance Module Prototype.dc.html');
const HANDOFF = path.join(__dirname, '../../commission-tracker/services/finance/handoff.js');
if (!fs.existsSync(PROTO)) { console.error(`ÉCHEC : paquet de passation introuvable dans ${DIR}`); process.exit(1); }
if (!fs.existsSync(HANDOFF)) { console.error(`ÉCHEC : extracteur introuvable (${HANDOFF})`); process.exit(1); }

const out = path.join(os.tmpdir(), `finance-model-${process.pid}.cjs`);
buildSync({ entryPoints: [path.join(__dirname, '../src/pages/Finance/model.ts')], outfile: out, format: 'cjs', bundle: true, logLevel: 'error' });
const F = require(out);
const { extractHandoff } = require(HANDOFF);

function prototype() {
  const html = fs.readFileSync(PROTO, 'utf8');
  let src = html.split('data-dc-script')[1];
  src = src.slice(src.indexOf('>') + 1);
  src = src.slice(0, src.lastIndexOf('</script>'));
  const hook = '    return {\n      L, navItems';
  if (!src.includes(hook)) throw new Error('point d\'accroche du prototype introuvable');
  src = src.replace(hook, '    this._dbg={Rm,I,payByMap,conByMap,payNN,payEX,payTot,conTot,ox27,OXV,travelBy,tRevM,tCogM,gpM,tOpM,ebM,noiM,noeM,niM,msTiles,msTiles2};\n' + hook);
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  for (const f of ['budget_data.js', 'payroll_data.js', 'opex_data.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx);
  vm.runInContext('class DCLogic{constructor(){this.props={};}setState(o){Object.assign(this.state,o)}};' + src + ';globalThis.C=Component;', ctx);
  return new ctx.C();
}

const { reference: ref, roster: raw } = extractHandoff(DIR);
const baseRoster = () => ({
  employees: raw.employees.map((e, i) => ({ id: i + 1, ...e, salaryBase: e.salary, raisePct: null, raiseMo: null, burdenPct: null, startMo: 0, endMo: null })),
  contractors: raw.contractors.map((c, i) => ({ id: i + 1, ...c, rate: c.rate || null, hours: c.hours || null, amtBase: c.amt, startMo: 0, endMo: null })),
});

let n = 0;
const near = (a, b, m) => { assert(Number.isFinite(a) && Number.isFinite(b), `${m} : non numérique (${a}, ${b})`); assert(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)), `${m} : ${a} ≠ ${b}`); n++; };
const nearS = (a, b, m) => { assert(a && b && a.length === b.length, `${m} : longueurs ${a && a.length} ≠ ${b && b.length}`); a.forEach((v, i) => near(v, b[i], `${m}[${i}]`)); };
const s12 = (a) => a.reduce((x, y) => x + y, 0);

function compare(label, P, R, opexYear) {
  const d = P._dbg;
  // Toutes les lignes du modèle des drivers, mois par mois.
  for (const k of Object.keys(d.Rm)) nearS(R.Rm[k], d.Rm[k], `${label} Rm.${k}`);
  for (const k of Object.keys(d.I)) nearS(R.I[k], d.I[k], `${label} I.${k}`);
  // Budget maître.
  nearS(R.master.tRev, d.tRevM, `${label} revenus`);
  nearS(R.master.tCogs, d.tCogM, `${label} COGS`);
  nearS(R.master.gp, d.gpM, `${label} marge brute`);
  nearS(R.master.tOpex, d.tOpM, `${label} OPEX`);
  nearS(R.master.ebitda, d.ebM, `${label} BAIIA`);
  nearS(R.master.noi, d.noiM, `${label} produits hors exploitation`);
  nearS(R.master.noe, d.noeM, `${label} charges hors exploitation`);
  nearS(R.master.ni, d.niM, `${label} bénéfice net`);
  for (const s of Object.keys(d.ox27)) d.ox27[s].forEach((l, i) => { assert.strictEqual(R.ox[s][i].key, l.key); nearS(R.ox[s][i].vals, l.vals, `${label} ox27 ${l.key}`); });
  // Page OPEX à l'exercice affiché (toutes les lignes, sous-totaux et totaux).
  for (const k of Object.keys(d.OXV)) nearS(R.opexShown.byKey[k], d.OXV[k], `${label} OPEX FY${2026 + opexYear} ${k}`);
  for (const k of Object.keys(d.travelBy)) nearS(R.opex27.travel[k], d.travelBy[k], `${label} voyages ${k}`);
}

// ---------------------------------------------------------------- 1. état par défaut
{
  const P = prototype(); P.renderVals();
  const pay = F.computePayroll(baseRoster(), { burden: 17.5, raise: 0, raiseMo: 0 }, F.payCodesOf(ref));
  for (const mp of F.MAPS) { nearS(pay.payByMap[mp], P._dbg.payByMap[mp], `paie ${mp}`); nearS(pay.conByMap[mp], P._dbg.conByMap[mp], `contractuels ${mp}`); }
  nearS(pay.payTot, P._dbg.payTot, 'paie totale');
  const R = F.computeAll({ ref, drivers: { drv: {} }, opex: { opx: {}, opxG: {} }, trips: null, payroll: pay }, 1);
  compare('défaut', P, R, 1);
  // Chiffres de référence de la spec (design/finance/SPEC-phase1.md §0).
  const r2 = (v) => Math.round(v * 100) / 100;
  assert.strictEqual(r2(F.sum(R.master.tRev)), 11022691.93); n++;
  assert.strictEqual(r2(F.sum(R.master.ebitda)), 573991.65); n++;
  assert.strictEqual(r2(F.sum(R.master.ni)), 200015.13); n++;
  const K = R.kpis;
  assert.strictEqual(K.rooftops.added, 480); assert.strictEqual(K.rooftops.ending, 3662); assert.strictEqual(K.rooftops.churn, 432); n += 3;
  assert.strictEqual(K.arpu.end.toFixed(2), '235.06'); assert.strictEqual(K.arpu.added.toFixed(2), '73.44'); n += 2;
  assert.strictEqual(Math.round(K.mrr.end), 860798); assert.strictEqual(Math.round(K.mrr.added), 276698); assert.strictEqual(Math.round(K.mrr.exitArr), 10329579); n += 3;
  assert.strictEqual(K.adyen.pts.toFixed(1), '17.1'); assert.strictEqual(K.adyen.end.toFixed(1), '38.1'); n += 2;
  assert.strictEqual(K.revenue.vs.toFixed(1), '19.7'); assert.strictEqual(K.grossProfit.vs.toFixed(1), '46.0'); n += 2;
  // Les autres exercices de la page OPEX (lecture seule).
  for (const y of [0, 2]) {
    P.state.opxYear = y; P.renderVals();
    const Ry = F.computeAll({ ref, drivers: { drv: {} }, opex: { opx: {}, opxG: {} }, trips: null, payroll: pay }, y);
    for (const k of Object.keys(P._dbg.OXV)) nearS(Ry.opexShown.byKey[k], P._dbg.OXV[k], `OPEX FY${2026 + y} ${k}`);
  }
}

// ---------------------------------------------------------------- 2. scénario de la spec
{
  const P = prototype();
  P.state.drv = { intAdds: Array(12).fill(30) };
  P.state.pay = { burden: '20', raise: '3', raiseMo: '6', emp: {}, con: {} };
  P.state.opxG = { smMktg: '2' };
  P.state.opx = { gaRent: [30000] };
  P.renderVals();
  const pay = F.computePayroll(baseRoster(), { burden: 20, raise: 3, raiseMo: 6 }, F.payCodesOf(ref));
  const R = F.computeAll({ ref, drivers: { drv: { intAdds: Array(12).fill(30) } }, opex: { opx: { gaRent: { 0: 30000 } }, opxG: { smMktg: 2 } }, trips: null, payroll: pay }, 1);
  compare('scénario', P, R, 1);
  assert.strictEqual(Math.round(F.sum(R.master.ni) * 100) / 100, 64869.47); n++;
}

// ---------------------------------------------------------------- 2b. ajustement de la CFO : contractuels G&A
// La référence importée en base = prototype + ligne « Contractors » G&A (34 500 $ = Sachin, 2 875 $/mois).
// Tout le reste doit rester identique au prototype.
{
  const { applyCfoAdjustments } = require(HANDOFF);
  const adj = applyCfoAdjustments(ref);
  assert.strictEqual(adj.opex.length, ref.opex.length + 1); n++;
  const ix = adj.opex.findIndex((i) => i.key === 'gaContr');
  assert.strictEqual(adj.opex[ix + 1].key, 'gaSal'); assert.strictEqual(adj.opex[ix - 1].key, 'gaIT'); n += 2;
  assert.strictEqual(applyCfoAdjustments(adj).opex.length, adj.opex.length); n++; // idempotent
  const pay = F.computePayroll(baseRoster(), { burden: 17.5, raise: 0, raiseMo: 0 }, F.payCodesOf(adj));
  const a = F.computeAll({ ref: adj, drivers: { drv: {} }, opex: { opx: {}, opxG: {} }, trips: null, payroll: pay }, 1);
  const p0 = F.computePayroll(baseRoster(), { burden: 17.5, raise: 0, raiseMo: 0 }, F.payCodesOf(ref));
  const b = F.computeAll({ ref, drivers: { drv: {} }, opex: { opx: {}, opxG: {} }, trips: null, payroll: p0 }, 1);
  const r2 = (v) => Math.round(v * 100) / 100;
  near(F.sum(a.master.tOpex) - F.sum(b.master.tOpex), 34500, 'OPEX : +34 500 $');
  assert.strictEqual(r2(F.sum(a.master.ebitda)), 539491.65); n++;
  assert.strictEqual(r2(F.sum(a.master.tRev)), r2(F.sum(b.master.tRev))); assert.strictEqual(r2(F.sum(a.master.tCogs)), r2(F.sum(b.master.tCogs))); n += 2;
  near(F.sum(b.master.ni) - F.sum(a.master.ni), 34500, 'bénéfice net : −34 500 $');
  console.log('   BAIIA ajusté', r2(F.sum(a.master.ebitda)), '· bénéfice net', r2(F.sum(a.master.ni)));
}

// ---------------------------------------------------------------- 3. tout bouge
{
  const P = prototype();
  const drv = {
    canChurn: [10, 20, 30, 40, 50, 60, 10, 20, 30, 40, 50, 60], canArpuG: Array(12).fill(0.5), convPct: Array(12).fill(60),
    adyenChurn: Array(12).fill(2), hwPerNew: Array(12).fill(2000), revShare: Array(12).fill(35), halukPct: Array(12).fill(70), licPct: Array(12).fill(40),
    supportWages: Array(12).fill(1), nnWages: Array(12).fill(99999), // inputs morts : sans effet, la paie les remplace
  };
  P.state.drv = drv;
  P.state.pay = { burden: '15', raise: '2', raiseMo: '3', emp: { 0: { salary: '150000', burden: '25' }, 5: { raise: '10', raiseMo: '9' } }, con: { 2: '9000' } };
  P.state.opx = { gaRent: [, , 40000], smConf: [5000] };
  P.state.opxG = { gaSw: '1.5', smConf: '3' };
  const trips = [{ name: 'A', dept: 'R&D', month: 4, people: 3, airfare: 500, nights: 4, hotel: 200, days: 5, perDiem: 80, other: 120 }, { name: 'B', dept: 'G&A', month: 11, people: 1, airfare: 0, nights: 0, hotel: 0, days: 0, perDiem: 0, other: 999 }];
  P.state.trips = trips;
  P.renderVals();
  const ros = baseRoster();
  Object.assign(ros.employees[0], { salary: 150000, burdenPct: 25 });
  Object.assign(ros.employees[5], { raisePct: 10, raiseMo: 9 });
  ros.contractors[2].amt = 9000;
  const pay = F.computePayroll(ros, { burden: 15, raise: 2, raiseMo: 3 }, F.payCodesOf(ref));
  const R = F.computeAll({ ref, drivers: { drv }, opex: { opx: { gaRent: { 2: 40000 }, smConf: { 0: 5000 } }, opxG: { gaSw: 1.5, smConf: 3 } }, trips, payroll: pay }, 1);
  compare('tout bouge', P, R, 1);
}

// ---------------------------------------------------------------- 4. arrivées et départs (ajout de la phase 1)
{
  const ros = baseRoster();
  const full = F.computePayroll(ros, { burden: 17.5, raise: 0, raiseMo: 0 }, []);
  ros.employees[0].startMo = 6;
  ros.employees[1].endMo = 2;
  const part = F.computePayroll(ros, { burden: 17.5, raise: 0, raiseMo: 0 }, []);
  near(part.emp[0].m.slice(0, 6).reduce((a, b) => a + b, 0), 0, 'avant l\'arrivée : 0 $');
  near(part.emp[0].m[6], full.emp[0].m[6], 'à l\'arrivée : plein mois');
  near(s12(part.emp[1].m), s12(full.emp[1].m.slice(0, 3)), 'départ fin mars : trois mois');
}

// ---------------------------------------------------------------- 5. hausse par département (SH-48)
// Navigateur = serveur (services/finance/payroll.js), sur tout l'effectif, avec des hausses de
// département, une hausse d'employé qui doit gagner et un département absent qui suit le global.
{
  const S = require(path.join(__dirname, '..', '..', 'commission-tracker', 'services', 'finance', 'payroll.js'));
  const ros = baseRoster();
  ros.employees[0].raisePct = 1.5;
  const g = { burden: 17.5, raise: 3, raiseMo: 6, deptRaise: { SALES: 8, SUPPORT: 0, [ros.employees[0].dept]: 12 } };
  const web = F.computePayroll(ros, g, F.payCodesOf(ref));
  const srv = S.computePayroll(ros.employees, ros.contractors, g);
  web.emp.forEach((e, i) => nearS(e.m, srv.emp[i].m, `paie navigateur = serveur, employé ${i}`));
  near(web.emp[0].raise, 1.5, 'la hausse de l\'employé gagne sur celle du département');
  const sales = web.emp.find((e) => e.dept === 'SALES' && e.raisePct == null);
  if (sales) near(sales.raise, 8, 'un employé de SALES prend la hausse du département');
  const other = web.emp.find((e) => e.raisePct == null && !(e.dept in g.deptRaise));
  if (other) near(other.raise, 3, 'un département non réglé suit la hausse globale');
  const none = F.computePayroll(ros, { burden: 17.5, raise: 3, raiseMo: 6 }, []);
  const empty = F.computePayroll(ros, { burden: 17.5, raise: 3, raiseMo: 6, deptRaise: {} }, []);
  nearS(empty.payTot, none.payTot, 'deptRaise vide = comportement d\'avant');
}

// ---------------------------------------------------------------- 7. COGS de service en deux blocs (SH-49)
{
  const S = require(path.join(__dirname, '..', '..', 'commission-tracker', 'services', 'finance', 'payroll.js'));
  const ros = baseRoster();
  const pay = F.computePayroll(ros, { burden: 17.5, raise: 0, raiseMo: 0 }, F.payCodesOf(ref));
  const srv = S.payrollAggregate(ros.employees, ros.contractors, { burden: 17.5, raise: 0, raiseMo: 0 }, F.payCodesOf(ref));
  nearS(pay.payImpl, srv.payImpl, 'IMPLEMENTATION : navigateur = serveur');
  assert(s12(pay.payImpl) > 0, 'IMPLEMENTATION : le département existe dans l\'effectif'); n++;
  const run = (drv) => F.computeAll({ ref, drivers: { drv }, opex: { opx: {}, opxG: {} }, trips: null, payroll: pay }, 1);
  const base = run({});
  const R = base.Rm;
  const sumOf = (ks) => R.nnSvc.map((_, i) => ks.reduce((a, k) => a + (R[k] || base.I[k])[i], 0));
  nearS(sumOf(['nnSvc', 'exSvc', 'travel']), R.svcCogs, 'blocs + déplacements = COGS de service');
  nearS(sumOf(['nnDelWages', 'nnImplWages', 'exSvcWages', 'exImplWages']), sumOf(['nnWages', 'exWages']), 'salaires : répartis, rien de perdu');
  nearS(sumOf(['nnContr', 'exContr']), R.svcContr, 'sous-traitants : jobs + coussin répartis');
  nearS(sumOf(['nnSw', 'exSw']), base.I.svcSw, 'logiciels : 50/50');
  near(s12(R.nnImplWages), s12(pay.payImpl) / 2, 'IMPLEMENTATION : 50 % vers Net New par défaut');
  // Déplacer le % ne change PAS le total ; ajouter de l'automobile l'augmente d'autant.
  const moved = run({ implNnPct: Array(12).fill(80), svcSwNnPct: Array(12).fill(20), bufferNnPct: Array(12).fill(100) });
  nearS(moved.Rm.svcCogs, R.svcCogs, 'déplacer les % ne change pas le total');
  near(s12(moved.Rm.nnImplWages), s12(pay.payImpl) * 0.8, 'IMPLEMENTATION 80 % vers Net New');
  assert(s12(moved.Rm.nnSvc) !== s12(R.nnSvc), 'le bloc Net New suit les %'); n++;
  const auto = run({ nnAuto: Array(12).fill(1000), exImplSw: Array(12).fill(250) });
  near(s12(auto.Rm.svcCogs) - s12(R.svcCogs), 15000, 'automobile + logiciel d\'implémentation : +15 000 $');
  near(s12(auto.Rm.totCogs) - s12(R.totCogs), 15000, '… et autant dans le total des COGS');
  near(s12(auto.master.ebitda) - s12(base.master.ebitda), -15000, '… et autant en moins sur le BAIIA');
  const old = F.computeAll({ ref, drivers: { drv: {} }, opex: { opx: {}, opxG: {} }, trips: null, payroll: { ...pay, payImpl: undefined } }, 1);
  nearS(old.Rm.svcCogs, R.svcCogs, 'serveur plus ancien (sans payImpl) : même total');
}

// ---------------------------------------------------------------- 6. détail OPEX du Budget maître (SH-48)
// Les sous-totaux masqués ne changent rien : la somme des LIGNES affichées = le total de section.
{
  const pay = F.computePayroll(baseRoster(), { burden: 17.5, raise: 0, raiseMo: 0 }, F.payCodesOf(ref));
  const R = F.computeAll({ ref, drivers: { drv: {} }, opex: { opx: {}, opxG: {} }, trips: null, payroll: pay }, 1);
  const D = F.opexDetailBySection(ref, R.opex27);
  for (const s of F.OPEX_SECTIONS) {
    const lines = D[s].filter((l) => !l.sub);
    nearS(lines.reduce((acc, l) => acc.map((v, i) => v + l.vals[i]), Array(12).fill(0)), R.master.opex[s], `détail OPEX ${s} : lignes = total`);
    assert(lines.length === R.ox[s].length, `détail OPEX ${s} : toutes les lignes, aucune perdue`); n++;
  }
  const hidden = F.hiddenOpexSubs(ref);
  assert(hidden.has('smMEs') && hidden.has('gaOtherS'), 'sous-totaux masqués : Meals & Entertainment en double, Other G&A'); n++;
  assert(!D['Sales & Marketing'].some((l) => l.key === 'smMEs') && D['Sales & Marketing'].some((l) => l.key === 'smSal' && l.sub), 'Salaries & Commissions reste un sous-total'); n++;
  assert(!Object.values(D).flat().some((l) => /^Total /i.test(l.name) || l.key === 'opTot'), 'aucun total de section dans le détail'); n++;
}

console.log(`✅ moteur Finance = prototype : ${n} vérifications`);
fs.unlinkSync(out);
