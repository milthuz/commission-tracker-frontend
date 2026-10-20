// Moteur des budgets d'entité et départementaux (src/pages/Finance/EntityBudgets/entityModel.ts)
// comparé au PROTOTYPE du design exécuté tel quel : chaque ligne (GL compris, tout déplié), chaque
// colonne, dans les deux vues (Sommaire, 18 mois), texte affiché ET valeurs, dans l'état par défaut
// et dans plusieurs scénarios d'ajustements ; plus les budgets départementaux, onglet par onglet.
//   node scripts/test-finance-entity.cjs [dossier design/finance]
//
// Les données (réelles, de la CFO) ne sont PAS dans le dépôt : lues dans ../design/finance par le
// MÊME extracteur que l'import en base (commission-tracker/services/finance/handoff.js).
// ⚠️ Échoue s'il manque, et vérifie que le prototype a bien chargé des données (sinon une
// comparaison de tableaux vides passerait pour la mauvaise raison).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { buildSync } = require('esbuild');

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '../../design/finance'));
const PROTO = path.join(DIR, 'Finance Module Prototype.dc.html');
const BACK = path.join(__dirname, '../../commission-tracker');
const HANDOFF = path.join(BACK, 'services/finance/handoff.js');
const XLSX_FILE = path.join(DIR, 'source_excel', 'Cluster_Budget_Sep2026_Dec2027.xlsx');
for (const f of [PROTO, HANDOFF, XLSX_FILE]) if (!fs.existsSync(f)) { console.error(`ÉCHEC : introuvable ${f}`); process.exit(1); }

const out = path.join(os.tmpdir(), `finance-entity-${process.pid}.cjs`);
buildSync({ entryPoints: [path.join(__dirname, '../src/pages/Finance/EntityBudgets/entityModel.ts')], outfile: out, format: 'cjs', bundle: true, logLevel: 'error' });
const M = require(out);
const { extractEntityBudgets } = require(HANDOFF);
const xlsx = require(path.join(BACK, 'node_modules/xlsx'));

function prototype() {
  const html = fs.readFileSync(PROTO, 'utf8');
  let src = html.split('data-dc-script')[1];
  src = src.slice(src.indexOf('>') + 1);
  src = src.slice(0, src.lastIndexOf('</script>'));
  const hook = '    return {\n      L, navItems';
  if (!src.includes(hook)) throw new Error('point d\'accroche du prototype introuvable');
  src = src.replace(hook, '    this._dbg={lineData,tRev,tCogs,tOpx,gp,ebitda,noi,noe,ni,drvVals,dkey};\n' + hook);
  const ctx = { window: {}, console, setTimeout: () => 0, clearTimeout: () => 0 };
  vm.createContext(ctx);
  for (const f of ['budget_data.js', 'payroll_data.js', 'opex_data.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx);
  vm.runInContext('class DCLogic{constructor(){this.props={};}setState(o){Object.assign(this.state,o)}};' + src + ';globalThis.C=Component;', ctx);
  const c = new ctx.C();
  c._W = ctx.window;
  return c;
}

let n = 0;
const ok = (c, m) => { assert(c, m); n++; };
const near = (a, b, m, tol = 1e-6) => { assert(Number.isFinite(a) && Number.isFinite(b), `${m} : non numérique (${a}, ${b})`); assert(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m} : ${a} ≠ ${b}`); n++; };
const cent = (a, b, m) => { assert(Math.abs(a - b) < 0.005, `${m} : ${a} ≠ ${b}`); n++; };
const nearS = (a, b, m) => { assert(a && b && a.length === b.length, `${m} : longueurs`); a.forEach((v, i) => near(v, b[i], `${m}[${i}]`)); };
const FMT = M.makeBudgetFormat('en');

const H = extractEntityBudgets(DIR);
const P0 = prototype();
const B = P0._W.BUDGET;
ok(B && B.drivers.length === 223 && B.cluster.length === 23, 'prototype : budget_data.js chargé (223 drivers, 23 lignes)');
// Correspondance identifiant stable ↔ clé du prototype (ent|cat|gl|sub), même ordre de fichier.
const keyOf = {}, idOf = {};
for (const [k, ent] of [['cluster', 'Cluster'], ['xperio', 'Xperio']]) {
  const pd = B.drivers.filter((d) => d.ent === ent);
  ok(pd.length === H[k].drivers.length, `${k} : même nombre de drivers que le prototype`);
  pd.forEach((d, i) => { const id = H[k].drivers[i].id; assert(H[k].drivers[i].gl === d.gl); keyOf[id] = `${d.ent}|${d.cat}|${d.gl}|${d.sub}`; idOf[keyOf[id]] = id; });
}

const CLS = { sec: 'sec', line: 'ln', total: 'tot', gm: 'gm', grp: 'gl grp', gl: 'gl' };
function compare(label, view, ovById) {
  const ref = H[view];
  const res = M.computeEntity(ref, ovById);
  const ovProto = {};
  for (const [id, v] of Object.entries(ovById)) ovProto[keyOf[id]] = v;
  for (const mode of ['sum', 'm']) {
    const c = prototype();
    Object.assign(c.state, { view, entity: view, colMode: mode, open: { __all: true }, ov: ovProto, ovRaw: {} });
    const r = c.renderVals();
    const d = c._dbg;
    ok(r.bRows.length > 100, `${label} ${mode} : le prototype a rendu ses lignes (${r.bRows.length})`);
    // Valeurs exactes (sans arrondi d'affichage).
    if (mode === 'sum') {
      for (const nm of M.LINE_NAMES) if (d.lineData[nm]) nearS(res.lines[nm].m, d.lineData[nm].m, `${label} ${nm}`);
      nearS(res.rev.m, d.tRev, `${label} tRev`); nearS(res.cogs.m, d.tCogs, `${label} tCogs`); nearS(res.opx.m, d.tOpx, `${label} tOpx`);
      nearS(res.gp.m, d.gp, `${label} gp`); nearS(res.ebitda.m, d.ebitda, `${label} ebitda`);
      nearS(res.noi.m, d.noi, `${label} noi`); nearS(res.noe.m, d.noe, `${label} noe`); nearS(res.ni.m, d.ni, `${label} ni`);
      for (const dr of ref.drivers) {
        const pd = B.drivers.find((x) => `${x.ent}|${x.cat}|${x.gl}|${x.sub}` === keyOf[dr.id]);
        nearS(res.vals[dr.id], d.drvVals(pd), `${label} driver ${dr.gl}`);
      }
    }
    // Texte affiché, ligne par ligne, colonne par colonne (tout déplié).
    const rows = M.buildRows(ref, res, ovById);
    assert.strictEqual(rows.length, r.bRows.length, `${label} ${mode} : nombre de lignes ${rows.length} ≠ ${r.bRows.length}`); n++;
    rows.forEach((row, i) => {
      const p = r.bRows[i];
      const name = row.kind === 'sec' ? p.name : row.name; // sections : libellés traduits côté écran
      assert.strictEqual(name, p.name, `${label} ${mode} ligne ${i}`);
      const cls = CLS[row.kind] + (row.kind === 'gl' && row.sub ? ' sub' : '');
      assert.strictEqual(p.cls.replace(' open', ''), cls, `${label} ${mode} ${row.name} : classe ${p.cls} ≠ ${cls}`);
      const cells = M.cellsOf(row, mode, res).map((v) => (row.kind === 'gm' ? FMT.pct(v) : FMT.money(v)));
      assert.deepStrictEqual(cells, Array.from(p.cells, (x) => x.v), `${label} ${mode} ${row.name} : cellules`);
      if (row.kind === 'gl') {
        assert.strictEqual(!!row.editable, !!p.editable, `${label} ${row.name} modifiable`);
        assert.strictEqual(!!row.changed, p.cells.every((x) => x.cls.includes('chg')), `${label} ${row.name} marqué modifié`);
        assert.strictEqual(!row.sub && !!row.driver.type, !!p.hasType, `${label} ${row.name} pastille de type`);
        if (p.hasType) assert.strictEqual(row.driver.type, p.type);
        assert.strictEqual(row.driver.note || row.driver.basis, p.note, `${label} ${row.name} infobulle`);
        if (row.editable) {
          assert.strictEqual(FMT.input(row.driver.input * 100), p.input, `${label} ${row.name} entrée par défaut`);
          // Indice sous la cellule : type (entrée / par mois) et escalade de janvier 2027.
          assert.strictEqual(`% ${row.driver.type === 'Run-rate' ? 'input' : '/mo'}${row.driver.esc ? ` · Jan-27 esc. ${FMT.int(row.driver.esc * 100)}%` : ''}`, p.inputHint, `${label} ${row.name} indice`);
        }
      }
      if (row.kind === 'line') assert.strictEqual(`${row.count} GL drivers`, p.note);
      n++;
    });
    // Tuiles.
    const T = M.tiles(res);
    T.forEach((t, i) => {
      const p = r.bTiles[i];
      assert.strictEqual(FMT.money(t.t16), p.v, `${label} tuile ${t.key}`);
      assert.strictEqual(FMT.money(t.sd), p.sd); assert.strictEqual(FMT.money(t.fy), p.fy);
      assert.strictEqual(t.t16 < 0 ? 'dn' : '', p.cls, `${label} tuile ${t.key} ton`);
      if (t.key === 'grossProfit') assert.strictEqual(`Gross Profit · ${FMT.pct(t.margin)}`, p.l);
      n++;
    });
    if (mode === 'sum') ok(r.ovCount === (Object.keys(ovProto).length ? `(${Object.keys(ovProto).length})` : '') && res.overrideCount === Object.keys(ovProto).length, `${label} : nombre d'ajustements`);
  }
  return res;
}
const fy = (a) => M.sumOf(a.m).fy, t16 = (a) => M.sumOf(a.m).t16;
const idBy = (view, gl) => H[view].drivers.find((d) => d.gl === gl).id;

// ---------------------------------------------------------------- 1. état par défaut
const C0 = compare('Cluster défaut', 'cluster', {});
cent(fy(C0.rev), 10141175.20, 'Cluster FY27 revenus'); cent(fy(C0.ebitda), 1344784.18, 'Cluster FY27 BAIIA'); cent(fy(C0.ni), 1093670.62, 'Cluster FY27 NI');
cent(t16(C0.rev), 12975616.28, 'Cluster 16 mois revenus'); cent(M.sumOf(C0.ebitda.m).sd, -26189.28, 'Cluster S–D BAIIA');
cent(fy(C0.cogs), 3518671.91, 'Cluster FY27 COGS'); cent(fy(C0.opx), 5277719.11, 'Cluster FY27 OPEX'); cent(fy(C0.noe), 251113.56, 'Cluster FY27 hors exploitation');
const X0 = compare('Xperio défaut', 'xperio', {});
cent(fy(X0.rev), 1180808.76, 'Xperio FY27 revenus'); cent(fy(X0.ebitda), -438913.82, 'Xperio FY27 BAIIA'); cent(fy(X0.ni), -561776.78, 'Xperio FY27 NI');
cent(t16(X0.ni), -757895.61, 'Xperio 16 mois NI');
cent(t16(C0.ebitda) + t16(X0.ebitda), 724516.58, 'consolidé 16 mois BAIIA');
cent(fy(C0.rev) + fy(X0.rev), 11321983.96, 'consolidé FY27 revenus');
cent(fy(C0.ni) + fy(X0.ni), 531893.84, 'consolidé FY27 NI');
// Un driver non modifié montre ses valeurs source, au cent — tous.
for (const k of ['cluster', 'xperio']) for (const d of H[k].drivers) ok(C0 && (k === 'cluster' ? C0 : X0).vals[d.id] === d.m, `${k} ${d.gl} : non modifié = source`);
ok(M.buildRows(H.cluster, C0, {}).length === 170, 'Cluster tout déplié : 170 lignes (SPEC §A.7)');

// ---------------------------------------------------------------- 2. scénarios de SPEC-phase2 §A.1
const C1 = compare('Cluster SPEC', 'cluster', { [idBy('cluster', 'Payments Revenue')]: 4, [idBy('cluster', 'Service Discount')]: 10 });
cent(fy(C1.rev), 10391685.39, 'Cluster ajusté FY27 revenus'); cent(t16(C1.rev), 13234175.60, 'Cluster ajusté 16 mois revenus');
cent(fy(C1.ebitda), 1595294.37, 'Cluster ajusté FY27 BAIIA'); cent(fy(C1.ni), 1344180.81, 'Cluster ajusté FY27 NI');
cent(C1.vals[idBy('cluster', 'Payments Revenue')][0], 152808.03, 'Payments Revenue sep. 2026');
cent(C1.vals[idBy('cluster', 'Payments Revenue')][15], 280702.61, 'Payments Revenue déc. 2027');
cent(C1.vals[idBy('cluster', 'Service Discount')][0], -21174.73, 'Service Discount sep. 2026');
cent(C1.vals[idBy('cluster', 'Service Discount')][4], -21598.22, 'Service Discount jan. 2027');
const X1 = compare('Xperio SPEC', 'xperio', { [idBy('xperio', 'POS Subscription Revenue')]: 2 });
cent(fy(X1.rev), 1237424.26, 'Xperio ajusté FY27 revenus'); cent(t16(X1.rev), 1610691.44, 'Xperio ajusté 16 mois revenus');
cent(fy(X1.ebitda), -382298.32, 'Xperio ajusté FY27 BAIIA'); cent(t16(X1.ni), -697412.24, 'Xperio ajusté 16 mois NI');

// ---------------------------------------------------------------- 3. scénario large : tous les drivers recalculables sauf le calendrier
for (const view of ['cluster', 'xperio']) {
  const ov = {};
  H[view].drivers.filter((d) => M.recomputable(d) && !M.isSchedule(d)).forEach((d, i) => { ov[d.id] = [-3, 0, 2.5, 7, -12.5][i % 5]; });
  ok(Object.keys(ov).length > 30, `${view} : scénario large (${Object.keys(ov).length} ajustements)`);
  compare(`${view} large`, view, ov);
}

// ---------------------------------------------------------------- 4. calendrier (Subscription Revenue) — écart voulu
const sch = [...M.scheduleIds(H.cluster)].map((id) => H.cluster.drivers.find((d) => d.id === id).gl);
ok(sch.length === 1 && sch[0] === 'Subscription Revenue' && M.scheduleIds(H.xperio).size === 0, `un seul driver à calendrier : Cluster Subscription Revenue (${sch.join(', ')})`);
const subId = idBy('cluster', 'Subscription Revenue');
const subD = H.cluster.drivers.find((d) => d.id === subId);
const retype = M.computeEntity(H.cluster, { [subId]: 1.5 });
nearS(retype.vals[subId], subD.m, 'Subscription Revenue : retaper 1,5 redonne la source');
cent(fy(retype.rev), 10141175.20, 'retaper 1,5 : FY27 inchangé');
{ // Le prototype, lui, perd la hausse de prix (SPEC §A.4) — c'est l'écart corrigé.
  const c = prototype();
  Object.assign(c.state, { view: 'cluster', entity: 'cluster', colMode: 'sum', ov: { [keyOf[subId]]: 1.5 }, ovRaw: {} });
  c.renderVals();
  cent(c._dbg.tRev.slice(4).reduce((a, b) => a + b, 0) - fy(retype.rev), -461777.17, 'prototype : retaper 1,5 perdait 461 777,17 $ sur FY27');
}
// Avec 2 %/mois : exactement la formule du CLASSEUR (croissance organique × escalade + MRR cumulatif
// de la hausse de prix, bloc « SUBSCRIPTION PRICE INCREASE SCHEDULE » de la feuille Drivers).
{
  const wb = xlsx.readFile(XLSX_FILE);
  const R = xlsx.utils.sheet_to_json(wb.Sheets['Drivers →'], { header: 1, raw: true, defval: null });
  const h = R.findIndex((r) => r[0] === 'SUBSCRIPTION PRICE INCREASE SCHEDULE');
  ok(h > 0, 'classeur : bloc du calendrier de hausse de prix trouvé');
  const cum = R.slice(h + 2, h + 18).map((r) => r[3]);
  ok(cum.length === 16 && cum.every((v) => typeof v === 'number') && cum[15] > 40000, 'calendrier : 16 mois de MRR cumulatif');
  // Contrôle : avec 1,5 %, la formule du classeur redonne la source (on lit bien la bonne formule).
  const excel = (g) => Array.from({ length: 16 }, (_, n2) => subD.base * Math.pow(1 + g, n2 + 1) * (n2 >= 4 ? 1 + subD.esc : 1) + cum[n2]);
  nearS(excel(0.015), subD.m, 'formule du classeur à 1,5 % = source');
  const two = M.computeEntity(H.cluster, { [subId]: 2 });
  nearS(two.vals[subId], excel(0.02), 'Subscription Revenue à 2 % = formule du classeur');
}

// ---------------------------------------------------------------- 5. budgets départementaux
{
  const D = H.departments;
  ok(D.depts.length === 4 && D.depts.every((d) => d.rows.length > 5), 'départements : 4 feuilles chargées');
  const tabs = { sales: 0, rd: 1, ops: 2, acct: 3 };
  for (const mode of ['sum', 'm']) {
    for (const [tab, i] of Object.entries(tabs)) {
      const c = prototype();
      Object.assign(c.state, { view: 'dept', deptTab: tab, colMode: mode });
      const r = c.renderVals();
      ok(r.deptRows.length > 5, `prototype ${tab} ${mode} : lignes rendues (${r.deptRows.length})`);
      const mine = M.deptRows(D.depts[i].rows);
      assert.strictEqual(mine.length, r.deptRows.length, `${tab} : nombre de lignes`);
      mine.forEach((row, j) => {
        const p = r.deptRows[j];
        assert.strictEqual(row.name, p.name);
        assert.strictEqual({ sec: 'sec', total: 'tot', line: '' }[row.kind], p.cls, `${tab} ${row.name} classe`);
        assert.deepStrictEqual(M.deptCells(row, mode).map(FMT.money), Array.from(p.cells, (x) => x.v), `${tab} ${mode} ${row.name} cellules`);
        n++;
      });
      assert.strictEqual(r.deptTitle, D.depts[i].title, `${tab} : titre`); n++;
    }
  }
  const c = prototype();
  Object.assign(c.state, { view: 'dept', deptTab: 'overview' });
  const r = c.renderVals();
  ok(r.leaderRows.length === 4, 'prototype : 4 leaders');
  r.leaderRows.forEach((p, i) => {
    const L = D.leaders[i];
    assert.strictEqual(L.name, p.name);
    assert.deepStrictEqual([FMT.money(L.v[0]), FMT.money(L.v[1]), FMT.money(L.v[2])], [p.sd, p.fy, p.t16], `leader ${L.name}`);
    n++;
  });
}

// Format français (sans équivalent dans le prototype) : parenthèses, « $ » après, tiret pour zéro.
{
  const F = M.makeBudgetFormat('fr');
  ok(F.money(-1234.4).replace(/\s/g, ' ') === '(1 234 $)' && F.money(0.3) === '–' && F.pct(0.641).replace(/\s/g, ' ') === '64,1 %', 'format FR');
}

fs.unlinkSync(out);
console.log(`✅ finance entity budgets (moteur vs prototype) : ${n} vérifications`);
