// Lot H du module Finance (guide des gestionnaires, règle des 40, repères) : moteur du navigateur
// (src/pages/Finance/Guide/guideModel.ts) comparé à celui du serveur (guideCore.js), questions
// générées sur les VRAIES données de passation, parité EN/FR des textes, toutes les clés utilisées
// par les écrans, codes d'erreur traduits, et NON-FUITE : aucune question, aucun prompt ne contient
// un nom ni un salaire de l'effectif.
//   node scripts/test-finance-guide.cjs [dossier design/finance]
//
// Le dossier de passation (données réelles de la CFO) n'est PAS dans le dépôt : par défaut
// ../design/finance à côté du dépôt. ⚠️ Échoue s'il manque, plutôt que de se déclarer vert.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSync } = require('esbuild');

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '../../design/finance'));
const SVC = path.join(__dirname, '../../commission-tracker/services/finance');
const GUIDE_DIR = path.join(__dirname, '../src/pages/Finance/Guide');
const I18N = path.join(__dirname, '../src/pages/Finance/i18n/guide.json');
if (!fs.existsSync(path.join(DIR, 'Finance Module Prototype.dc.html'))) { console.error(`ÉCHEC : paquet de passation introuvable dans ${DIR}`); process.exit(1); }
for (const f of [path.join(SVC, 'guideCore.js'), path.join(SVC, 'guide.js'), path.join(SVC, 'guideBenchmarks.json'), path.join(SVC, 'handoff.js'), I18N]) {
  if (!fs.existsSync(f)) { console.error(`ÉCHEC : ${f} introuvable`); process.exit(1); }
}

const build = (entry, name) => {
  const out = path.join(os.tmpdir(), `${name}-${process.pid}.cjs`);
  buildSync({ entryPoints: [entry], outfile: out, format: 'cjs', bundle: true, logLevel: 'error' });
  return require(out);
};
const GM = build(path.join(GUIDE_DIR, 'guideModel.ts'), 'finance-guide-model');
const F = build(path.join(__dirname, '../src/pages/Finance/model.ts'), 'finance-model-guide');
const FMT = build(path.join(__dirname, '../src/pages/Finance/format.ts'), 'finance-format-guide');
const G = require(path.join(SVC, 'guideCore.js'));
const { extractHandoff } = require(path.join(SVC, 'handoff.js'));
const dict = JSON.parse(fs.readFileSync(I18N, 'utf8'));

let n = 0;
const ok = (c, m) => { assert(c, m); n++; };
const near = (a, b, m, eps = 1e-9) => { assert(a != null && b != null && Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${m} : ${a} ≠ ${b}`); n++; };

// ---------------------------------------------------------------- parité EN / FR des textes
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') flat(v, `${p}${k}.`, out); else out[`${p}${k}`] = v; } return out; };
const en = flat(dict.en), fr = flat(dict.fr);
ok(JSON.stringify(Object.keys(en).sort()) === JSON.stringify(Object.keys(fr).sort()), `mêmes clés en anglais et en français (écart : ${Object.keys(en).filter((k) => !(k in fr)).concat(Object.keys(fr).filter((k) => !(k in en))).slice(0, 5).join(', ')})`);
const ph = (s) => [...String(s).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',');
for (const k of Object.keys(en)) {
  ok(typeof en[k] === 'string' && en[k].trim() && typeof fr[k] === 'string' && fr[k].trim(), `texte vide : ${k}`);
  ok(ph(en[k]) === ph(fr[k]), `mêmes variables {{…}} dans les deux langues : ${k}`);
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(en[k] + fr[k]), `pas d'emoji : ${k}`);
}
ok(Object.keys(en).every((k) => k.startsWith('finance.guide.')) && Object.keys(en).length > 300, 'tout sous finance.guide.*');

// ---------------------------------------------------------------- toutes les clés utilisées par les écrans existent
const srcFiles = fs.readdirSync(GUIDE_DIR).filter((f) => /\.(tsx?|ts)$/.test(f));
let staticUsed = 0;
const prefixes = new Set();
for (const f of srcFiles) {
  const s = fs.readFileSync(path.join(GUIDE_DIR, f), 'utf8');
  for (const m of s.matchAll(/\bL\('([^']+)'/g)) { ok(`finance.guide.${m[1]}` in en, `clé utilisée mais absente : ${m[1]} (${f})`); staticUsed++; }
  for (const m of s.matchAll(/\bL\(`([^`$]*)\$\{/g)) prefixes.add(m[1]);
  for (const m of s.matchAll(/[^A-Za-z]t\('(finance\.guide\.[^']+)'/g)) { ok(m[1] in en, `clé utilisée mais absente : ${m[1]} (${f})`); staticUsed++; }
  for (const m of s.matchAll(/titleKey="(finance\.guide\.[^"]+)"/g)) ok(m[1] in en, `titre absent : ${m[1]}`);
}
ok(staticUsed > 120, `clés statiques vérifiées (${staticUsed})`);
const has = (pre, keys) => keys.forEach((k) => ok(`finance.guide.${pre}.${k}` in en, `clé manquante : ${pre}.${k}`));
has('group', GM.GROUPS); has('groupHelp', GM.GROUPS); has('dept', G.DEPARTMENTS); has('state', ['new', 'asked', 'answered']);
has('metric', Object.keys(G.METRICS)); has('unit', G.UNITS); has('kind', G.KINDS); has('status', ['better', 'on_par', 'worse', 'no_metric', 'to_validate']);
has('savings.books', ['ok', 'reconnect', 'error', 'never', 'busy', 'warning']); has('savings.basis', ['vs_avg', 'vs_last_year']);
has('mapName', ['recurringCogs', 'serviceCogs', 'sm', 'rd', 'ga']); has('driverName', Object.keys(GM.DRIVER_Q));
for (const p of prefixes) ok([...Object.keys(en)].some((k) => k.startsWith(`finance.guide.${p}`)), `préfixe dynamique sans aucune clé : ${p}`);

// ---------------------------------------------------------------- codes d'erreur du serveur tous traduits
const serverCodes = new Set();
for (const f of ['guide.js', 'guideCore.js']) {
  const s = fs.readFileSync(path.join(SVC, f), 'utf8');
  for (const m of s.matchAll(/error: '([a-z_]+)'/g)) serverCodes.add(m[1]);
}
for (const code of ['perm', 'demo_blocked', 'conflict']) serverCodes.delete(code);
serverCodes.add('conflict');
ok(serverCodes.size > 25, `codes d'erreur du serveur relevés (${serverCodes.size})`);
for (const c of serverCodes) ok(`finance.guide.errors.${c}` in en, `code d'erreur non traduit : ${c}`);
ok('finance.guide.errors.forbidden' in en && 'finance.guide.errors.demo' in en && 'finance.guide.errors.network' in en && 'finance.guide.errors.generic' in en, 'erreurs réseau, permission et démo traduites');

// ---------------------------------------------------------------- même calcul que le serveur
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const vals = [0, 1, 100, 1200, 987654.321, -50, null, NaN];
const sameNum = (a, b, m) => { if (a == null || b == null) ok(a === b || (a == null && b == null), `${m} : ${a} / ${b}`); else near(a, b, m); };
for (let i = 0; i < 400; i++) {
  const pick = () => (rnd() < 0.15 ? vals[Math.floor(rnd() * vals.length)] : (rnd() - 0.3) * 5e6);
  const inp = { revenue: pick(), priorRevenue: pick(), profit: pick(), opex: pick() };
  const a = GM.levers(inp), b = G.levers(inp);
  for (const k of ['growth', 'margin', 'score', 'gap', 'onePtGrowthRevenue', 'onePtMarginOpex', 'shortfall', 'extraRevenueNeeded', 'costCutNeeded', 'costCutPctOfOpex']) sameNum(a[k], b[k], `leviers.${k} navigateur = serveur`);
  ok(a.passes === b.passes, 'leviers.passes identique');
  sameNum(GM.marginPtsFromCut(inp.profit, inp.revenue), G.marginPtsFromCut(inp.profit, inp.revenue), 'points de marge');
}
const bms = JSON.parse(fs.readFileSync(path.join(SVC, 'guideBenchmarks.json'), 'utf8')).benchmarks.map((b) => ({ id: b.id, metric: b.metric, value: b.value, direction: b.direction, use_for_flags: b.useForFlags, useForFlags: b.useForFlags }));
for (let i = 0; i < 100; i++) {
  const metrics = {}; for (const k of Object.keys(G.METRICS)) metrics[k] = rnd() < 0.2 ? null : (rnd() * 120 - 10);
  const a = GM.compareBenchmarks(metrics, bms), b = G.compareBenchmarks(metrics, bms);
  ok(JSON.stringify(a.map((x) => [x.id, x.status, x.flag])) === JSON.stringify(b.map((x) => [x.id, x.status, x.flag])), 'comparaison aux repères identique (navigateur et serveur)');
}
ok(bms.filter((b) => b.value == null).every((b) => GM.compareBenchmarks({ [b.metric]: 50 }, [b])[0].status === 'to_validate'), 'les repères livrés sans valeur ne sont jamais comparés');
ok(GM.THRESHOLD === G.THRESHOLD && GM.TOLERANCE_PCT === G.TOLERANCE_PCT, 'mêmes constantes');
ok(JSON.stringify(Object.keys(GM.METRIC_DEPT).sort()) === JSON.stringify(Object.keys(G.METRICS).sort()), 'chaque mesure a un département');

// ---------------------------------------------------------------- données de passation : modèle FY2027
const { reference: ref, roster } = extractHandoff(DIR);
const fullRoster = {
  employees: roster.employees.map((e, i) => ({ id: i + 1, ...e, salaryBase: e.salary, raisePct: null, raiseMo: null, burdenPct: null, startMo: 0, endMo: null })),
  contractors: roster.contractors.map((c, i) => ({ id: i + 1, ...c, rate: c.rate || null, hours: c.hours || null, amtBase: c.amt, startMo: 0, endMo: null })),
};
const payCodes = F.payCodesOf(ref);
const payroll = F.computePayroll(fullRoster, { burden: 17.5, raise: 0, raiseMo: 0 }, payCodes);
const result = F.computeAll({ ref, drivers: { drv: {} }, opex: { opx: {}, opxG: {} }, trips: null, payroll }, 1);

const MM = GM.modelMetrics(result, ref);
const tRev = F.sum(result.master.tRev), eb = F.sum(result.master.ebitda);
near(MM.inputs.revenue, tRev, 'revenu FY27'); near(MM.inputs.priorRevenue, ref.a26.rev, 'revenu de base 2026'); near(MM.inputs.profit, eb, 'BAIIA FY27');
near(MM.metrics.revenue_growth, ((tRev - ref.a26.rev) / ref.a26.rev) * 100, 'croissance du modèle');
near(MM.metrics.ebitda_margin, (eb / tRev) * 100, 'marge BAIIA du modèle');
near(MM.metrics.rule_of_40, MM.metrics.revenue_growth + MM.metrics.ebitda_margin, 'règle des 40 du modèle = croissance + marge');
near(MM.metrics.revenue_growth, result.kpis.revenue.vs, 'croissance identique à la tuile du Budget maître');
near(MM.metrics.ebitda_margin, result.kpis.ebitda.margin, 'marge identique à la tuile du Budget maître');
near(MM.levers.onePtGrowthRevenue, ref.a26.rev * 0.01, '+1 pt de croissance');
near(MM.levers.onePtMarginOpex, tRev * 0.01, '1 pt de marge');
near(MM.metrics.sm_pct + MM.metrics.rd_pct + MM.metrics.ga_pct, (F.sum(result.master.tOpex) / tRev) * 100, 'S&M + R&D + G&A = OPEX total en % des revenus');
ok(MM.metrics.nrr === null && MM.metrics.grr === null, 'rétention nette : le modèle n\'a pas de mesure, jamais inventée');
const smTot = F.sum(result.master.opex['Sales & Marketing']);
near(MM.metrics.cac_payback_months, (smTot / result.kpis.rooftops.added) / (result.kpis.arpu.end * (result.kpis.grossProfit.margin / 100)), 'récupération du coût d\'acquisition (approximation documentée)');
for (const [k, v] of Object.entries(MM.metrics)) ok(v === null || Number.isFinite(v), `mesure du modèle finie ou inconnue : ${k}`);

// ---------------------------------------------------------------- questions : texte rendu avec les vrais textes EN et FR
const flatCache = { en, fr };
const L = (lang) => (key, params = {}) => {
  const s = flatCache[lang][`finance.guide.${key}`];
  if (s == null) throw new Error(`clé absente (${lang}) : ${key}`);
  return s.replace(/\{\{(\w+)\}\}/g, (m, p) => (p in params ? String(params[p]) : m));
};
const names = [...new Set([...roster.employees.map((e) => e.name), ...roster.contractors.map((c) => c.name), ...roster.contractors.map((c) => c.co)].filter((s) => s && String(s).trim().length >= 4).map((s) => String(s).trim().toLowerCase()))];
ok(names.length > 30 && roster.employees.length > 30, 'effectif réel lu pour le test de non-fuite');

for (const lang of ['en', 'fr']) {
  const fmt = FMT.makeFormat(lang);
  const Lg = L(lang);
  const Q = GM.buildQuestions({
    ref, result, opxG: {}, payroll: { payByMap: payroll.payByMap, conByMap: payroll.conByMap, headcount: payroll.headcount, contractorCount: payroll.contractorCount },
    fiscalYear: ref.fiscalYear, fmt, label: (k) => k, L: Lg,
  });
  ok(Q.length > 60, `${lang} : nombre de questions (${Q.length})`);
  ok(new Set(Q.map((q) => q.id)).size === Q.length, `${lang} : identifiants de question uniques`);
  for (const g of GM.GROUPS) {
    const mine = Q.filter((q) => q.group === g);
    ok(mine.length >= GM.GENERAL_COUNTS[g] + 1, `${lang} : le groupe ${g} a des questions (${mine.length})`);
    ok(mine.filter((q) => q.kind === 'general').length === GM.GENERAL_COUNTS[g], `${lang} : questions de fond du groupe ${g}`);
    ok(mine.some((q) => q.kind === 'groupTotal'), `${lang} : sommaire du groupe ${g}`);
  }
  ok(['groupTotal', 'payrollMap', 'opexBig', 'driver', 'general', 'cogsBig'].every((k) => Q.some((q) => q.kind === k)), `${lang} : types de questions attendus présents`);
  for (const q of Q) {
    ok(!/\{\{|undefined|NaN|Infinity|\[object/.test(q.text), `${lang} : texte propre (${q.id}) : ${q.text.slice(0, 80)}`);
    ok(q.text.length > 40 && q.copy.includes(q.text), `${lang} : le texte copiable contient la question (${q.id})`);
    ok(q.copy.includes(Lg(`group.${q.group}`)) && q.copy.includes(String(ref.fiscalYear)), `${lang} : le texte copiable nomme le groupe et l'exercice (${q.id})`);
    const low = (q.text + ' ' + q.copy).toLowerCase();
    for (const nm of names) assert(!low.includes(nm), `FUITE (${lang}) : un nom de l'effectif apparaît dans la question ${q.id}`);
    n += 2;
  }
  // NON-FUITE des salaires : un salaire réel peut coïncider avec le montant d'une ligne du budget
  // (faux positif). On refait donc le calcul avec des salaires SENTINELLES uniques (sept chiffres,
  // aucun total ne peut les égaler) : un seul apparaissant dans une question serait une vraie fuite.
  const sentinel = { employees: fullRoster.employees.map((e, i) => ({ ...e, name: `Zxq${i}name`, salary: 1000003 + 7919 * i })), contractors: fullRoster.contractors.map((c, i) => ({ ...c, name: `Zxq${i}contr`, amt: 2000003 + 7919 * i })) };
  const pay2 = F.computePayroll(sentinel, { burden: 17.5, raise: 0, raiseMo: 0 }, payCodes);
  const res2 = F.computeAll({ ref, drivers: { drv: {} }, opex: { opx: {}, opxG: {} }, trips: null, payroll: pay2 }, 1);
  const Q3 = GM.buildQuestions({ ref, result: res2, opxG: {}, payroll: { payByMap: pay2.payByMap, conByMap: pay2.conByMap, headcount: pay2.headcount, contractorCount: pay2.contractorCount }, fiscalYear: ref.fiscalYear, fmt, label: (k) => k, L: Lg });
  const all3 = Q3.map((q) => `${q.text}\n${q.copy}`).join('\n').toLowerCase();
  const sentinels = [...sentinel.employees.map((e) => e.salary), ...sentinel.contractors.map((c) => c.amt)];
  for (const s of sentinels) {
    assert(!all3.includes(fmt.fmt(s, '$').toLowerCase()) && !new RegExp(`(^|[^0-9])${s}([^0-9]|$)`).test(all3.replace(/[\s,  ]/g, '')), `FUITE (${lang}) : un salaire sentinelle apparaît dans une question`);
  }
  assert(!all3.includes('zxq'), `FUITE (${lang}) : un nom sentinelle apparaît dans une question`);
  n += 2;
  ok(Q3.length === Q.length || Q3.length > 60, `${lang} : les questions existent aussi sur l'effectif sentinelle`);
  // chiffres exacts : le plus gros poste d'OPEX non salarial du groupe « ventes »
  const lines = []; let sec = null;
  for (const it of ref.opex) { if (it.t === 'sec') sec = it.name; else if (it.t === 'line' && it.key && !it.pay) lines.push({ key: it.key, name: it.name, sec, fy27: F.sum(result.opex27.byKey[it.key]) }); }
  const bigS = lines.filter((l) => l.sec === 'Sales & Marketing' && l.fy27 > 0).sort((a, b) => b.fy27 - a.fy27)[0];
  const qBig = Q.find((q) => q.id === `opexBig:${bigS.key}`);
  ok(qBig && qBig.group === 'sales' && qBig.text.includes(bigS.name) && qBig.text.includes(fmt.fmt(bigS.fy27, '$')) && qBig.text.includes(fmt.pct((bigS.fy27 / tRev) * 100)), `${lang} : le plus gros poste de ventes et marketing, avec son montant exact et sa part des revenus`);
  // la croissance saisie par la CFO devient une question
  const g1 = lines.find((l) => l.sec === 'General & Administrative');
  const Q2 = GM.buildQuestions({ ref, result, opxG: { [g1.key]: 2 }, payroll: { payByMap: payroll.payByMap, conByMap: payroll.conByMap, headcount: payroll.headcount, contractorCount: payroll.contractorCount }, fiscalYear: ref.fiscalYear, fmt, label: (k) => k, L: Lg });
  const qg = Q2.find((q) => q.id === `opexGrowth:${g1.key}`);
  ok(qg && qg.group === 'accounting' && qg.text.includes(fmt.pct(2, true)), `${lang} : une croissance mensuelle saisie donne une question`);
  ok(!Q.some((q) => q.kind === 'opexGrowth'), `${lang} : sans croissance saisie, pas de question de croissance`);
  // la question de paie du groupe donne le total par poste, jamais d'effectif nominatif
  const pm = Q.find((q) => q.id === 'payrollMap:sm');
  const smPay = payroll.payByMap['S&M'].map((v, i) => v + payroll.conByMap['S&M'][i]);
  ok(pm && pm.text.includes(fmt.fmt(F.sum(smPay), '$')) && pm.group === 'sales', `${lang} : paie S&M = total du poste (employés + contractuels)`);
  // les prompts des pistes et des repères
  const lead = { id: 'vs_avg:acc:1', rank: 1, type: 'vs_avg', accountKey: 'acc:1', accountName: 'Hosting', section: 'x', kind: 'cogs', month: '2026-09', amount: 5000, baseline: 3000, deltaAbs: 2000, deltaPct: 66.7, owner: 'Resp', department: 'support_ops', assigned: true };
  const ml = (m) => m;
  for (const t of [GM.leadPrompt(lead, fmt, Lg, ml), GM.leadPrompt({ ...lead, type: 'vs_last_year', deltaPct: null, owner: null, department: null }, fmt, Lg, ml),
    GM.topAccountPrompt({ accountName: 'Hosting', windowTotal: 60000, sharePct: 12.3, owner: null, department: null }, 12, fmt, Lg),
    GM.variancePrompt({ line: 'Rent', month: 'sept. 2027', actual: 1200, budget: 1000 }, fmt, Lg),
    GM.benchmarkPrompt({ label: 'L', mine: '10 %', bench: '20 %', source: 'Org 2026', dept: 'Ventes', metricLabel: 'M' }, Lg)]) {
    ok(t.length > 60 && !/\{\{|undefined|NaN/.test(t), `${lang} : prompt sans variable oubliée : ${t.slice(0, 50)}`);
  }
  ok(GM.leadPrompt(lead, fmt, Lg, ml).includes(fmt.fmt(5000, '$')) && GM.leadPrompt(lead, fmt, Lg, ml).includes(fmt.fmt(3000, '$')) && GM.leadPrompt(lead, fmt, Lg, ml).includes('Hosting'), `${lang} : le prompt d'une piste nomme le compte et les montants`);
  ok(GM.leadPrompt({ ...lead, department: null, owner: null }, fmt, Lg, ml).includes(Lg('s.noDept')), `${lang} : sans responsable, le prompt le dit`);
}

// ---------------------------------------------------------------- aucune donnée de la CFO dans le code du lot
const leakFiles = [...srcFiles.map((f) => path.join(GUIDE_DIR, f)), I18N, path.join(SVC, 'guideBenchmarks.json'), path.join(SVC, 'guideCore.js'), path.join(SVC, 'guide.js')];
for (const f of leakFiles) {
  const s = fs.readFileSync(f, 'utf8').toLowerCase();
  for (const nm of names) assert(!s.includes(nm), `DONNÉE DE LA CFO dans le code (${path.basename(f)}) : un nom de l'effectif`);
  n++;
}

console.log(`✅ finance guide (navigateur) : ${n} vérifications`);
