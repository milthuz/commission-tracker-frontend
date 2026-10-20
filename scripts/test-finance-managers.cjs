// Module Finance — gestionnaires (revenus reportés, amortissement, écritures Zoho Books) : banc du
// NAVIGATEUR.
//   node scripts/test-finance-managers.cjs
//
//  1. logic.ts (mois, lecture des saisies, validation des fenêtres) compilé par esbuild ;
//  2. traductions src/pages/Finance/i18n/managers.json : mêmes clés EN / FR, mêmes {{variables}},
//     chaque clé utilisée par src/pages/Finance/Managers/** existe, et CHAQUE code d'erreur que le
//     serveur peut renvoyer (services/finance/managers*.js) a son texte.
// Le calcul comptable est testé côté serveur (services/finance/__tests__/managers.test.js).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSync } = require('esbuild');

const ROOT = path.join(__dirname, '..');
const PAGES = path.join(ROOT, 'src/pages/Finance/Managers');
const I18N = path.join(ROOT, 'src/pages/Finance/i18n/managers.json');
const BACK = path.join(ROOT, '../commission-tracker/services/finance');
for (const p of [PAGES, I18N, path.join(BACK, 'managers.js')]) {
  if (!fs.existsSync(p)) { console.error(`ÉCHEC : introuvable ${p}`); process.exit(1); }
}

let n = 0;
const ok = (c, m) => { assert(c, m); n++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, `${m} : ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); n++; };

// ---------------------------------------------------------------------------- 1. logic.ts
const out = path.join(os.tmpdir(), `finance-managers-${process.pid}.cjs`);
buildSync({ entryPoints: [path.join(PAGES, 'logic.ts')], outfile: out, format: 'cjs', bundle: true, logLevel: 'error' });
const L = require(out);
fs.unlinkSync(out);

eq(L.ym('2026-09'), 2026 * 12 + 8, 'ym');
eq(L.ym('2026-13'), null, 'ym : mois 13 refusé');
eq(L.mStr(L.ym('2026-12') + 1), '2027-01', 'mStr : passage d\'année');
eq(L.addMonths('2026-01', -1), '2025-12', 'addMonths négatif');
const r = L.monthRange('2026-10', '2027-01');
eq(r, ['2027-01', '2026-12', '2026-11', '2026-10'], 'monthRange : du plus récent au plus ancien');
eq(L.monthRange('2027-01', '2026-01'), [], 'monthRange inversée : vide');
ok(/^Septembre 2026$/i.test(L.monthLabel('2026-09', 'fr-CA')), `monthLabel fr : ${L.monthLabel('2026-09', 'fr-CA')}`);
ok(/^September 2026$/.test(L.monthLabel('2026-09', 'en-CA')), `monthLabel en : ${L.monthLabel('2026-09', 'en-CA')}`);
eq(L.parseAmount('12 000,50'), 12000.5, 'parseAmount : « 12 000,50 »');
eq(L.parseAmount('$12,000.50'), 12000.5, 'parseAmount : « $12,000.50 »');
eq(L.parseAmount('1.234,5'), 1234.5, 'parseAmount : « 1.234,5 »');
eq(L.parseAmount('abc'), null, 'parseAmount : illisible');
eq(L.parseAmount(''), null, 'parseAmount : vide');
eq(L.parseIntStrict('12'), 12, 'parseIntStrict');
eq(L.parseIntStrict('12.5'), null, 'parseIntStrict : décimal refusé');
ok(L.isDate('2028-02-29') && !L.isDate('2026-02-29') && !L.isDate('2026-02-30'), 'isDate : bissextile');

const base = { customer: 'Client', type: 'subscription', total: '12 000', startMonth: '2026-10', termMonths: '12', billedDate: '', receivedDate: '', notes: '' };
let v = L.validateContractForm(base, ['subscription']);
ok(v.body && v.body.total === 12000 && v.body.termMonths === 12 && v.body.billedDate === null, 'contrat valide → corps');
v = L.validateContractForm({ ...base, customer: '  ', type: 'x', total: '0', startMonth: '', termMonths: '0', billedDate: '2026-02-30' }, ['subscription']);
eq(v.body, null, 'contrat invalide : pas de corps');
eq(Object.keys(v.errors).sort(), ['billedDate', 'customer', 'startMonth', 'termMonths', 'total', 'type'], 'contrat invalide : chaque champ signalé');
const lot = { description: 'PAX', quantity: '200', unitCost: '520', inServiceMonth: '2026-10', usefulLife: '', salvage: '', notes: '' };
v = L.validateLotForm(lot, 36);
ok(v.body && v.body.usefulLife === 36 && v.body.salvage === 0, 'lot : vie et résiduelle par défaut');
v = L.validateLotForm({ ...lot, salvage: '200000' }, 36);
eq(v.errors.salvage, 'salvage_above_cost', 'lot : résiduelle > coût');
v = L.validateLotForm({ ...lot, quantity: '1.5', unitCost: '-1' }, 36);
ok(v.errors.quantity === 'bad_quantity' && v.errors.unitCost === 'bad_unit_cost', 'lot : quantité et coût signalés');
eq(L.monthlyPreview(12000, 12), 1000, 'aperçu mensuel');
eq(L.monthlyPreview(104000, 36, 0), 2888.89, 'aperçu mensuel arrondi au cent');
eq(L.monthlyPreview(1000, 0), null, 'aperçu : durée 0 → rien');

// ---------------------------------------------------------------------------- 2. traductions
const dict = JSON.parse(fs.readFileSync(I18N, 'utf8'));
const flat = (o, p = '', acc = {}) => { for (const [k, x] of Object.entries(o)) { const q = p ? `${p}.${k}` : k; if (x && typeof x === 'object') flat(x, q, acc); else acc[q] = x; } return acc; };
const EN = flat(dict.en), FR = flat(dict.fr);
ok(Object.keys(EN).length > 250, `le dictionnaire a été lu (${Object.keys(EN).length} clés)`);
eq(Object.keys(EN).sort(), Object.keys(FR).sort(), 'mêmes clés EN et FR');
const vars = (s) => [...String(s).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
for (const k of Object.keys(EN)) {
  assert.deepStrictEqual(vars(EN[k]), vars(FR[k]), `variables différentes EN/FR pour ${k}`);
  assert(String(FR[k]).trim() && String(EN[k]).trim(), `traduction vide : ${k}`);
}
n++;
ok(Object.keys(EN).every((k) => k.startsWith('finance.managers.')), 'tout sous finance.managers.*');

// Clés écrites en toutes lettres dans les pages.
const src = fs.readdirSync(PAGES).filter((f) => /\.tsx?$/.test(f)).map((f) => fs.readFileSync(path.join(PAGES, f), 'utf8')).join('\n');
const literal = [...new Set([...src.matchAll(/'(finance\.managers\.[A-Za-z0-9_.]+)'/g)].map((m) => m[1]))];
ok(literal.length > 200, `clés trouvées dans les pages (${literal.length})`);
const has = (k) => k in EN || `${k}_one` in EN;
const missing = literal.filter((k) => !has(k));
eq(missing, [], 'chaque clé utilisée par les pages existe');

// Clés construites (gabarits `${…}`) : toutes les valeurs possibles.
const dyn = {
  'finance.managers.deferred.status.': ['recognizing', 'upcoming', 'complete', 'closed', 'notBilled', 'closed_release', 'closed_cancel'],
  'finance.managers.deferred.filters.': ['open', 'complete', 'closed', 'all'],
  'finance.managers.deferred.treatments.': ['release', 'releaseHint', 'cancel', 'cancelHint'],
  'finance.managers.amort.status.': ['amortizing', 'notInService', 'fullyAmortized', 'writtenOff'],
  'finance.managers.amort.woModes.': ['derecognize', 'accelerate'],
  'finance.managers.amort.woMode_': ['derecognize', 'accelerate'],
  'finance.managers.amort.je.woSub_': ['derecognize', 'accelerate'],
  'finance.managers.roles.': ['deferred', 'revenue', 'amortExpense', 'accumAmort', 'writeOffLoss', 'terminalAsset'],
  'finance.managers.je.status.': ['posted', 'posting', 'failed', 'voided'],
  'finance.managers.accounts.module.': ['deferred', 'amortization'],
};
for (const [prefix, vals] of Object.entries(dyn)) {
  ok(src.includes(`'${prefix}`) || src.includes(`\`${prefix}`), `gabarit utilisé : ${prefix}`);
  for (const x of vals) ok(`${prefix}${x}` in EN, `clé construite : ${prefix}${x}`);
}
// Rôles et statuts du serveur : la liste ci-dessus suit le moteur.
const engine = fs.readFileSync(path.join(BACK, 'managersEngine.js'), 'utf8');
for (const role of [...new Set([...engine.matchAll(/role: '(\w+)'/g)].map((m) => m[1]))]) ok(`finance.managers.roles.${role}` in EN, `rôle du moteur traduit : ${role}`);
for (const st of [...new Set([...engine.matchAll(/return '(\w+)';/g)].map((m) => m[1]))]) {
  ok(`finance.managers.deferred.status.${st}` in EN || `finance.managers.amort.status.${st}` in EN, `statut du moteur traduit : ${st}`);
}

// Chaque code d'erreur que le serveur peut renvoyer a son texte.
const back = ['managers.js', 'managersXlsx.js', 'managersBooks.js'].map((f) => fs.readFileSync(path.join(BACK, f), 'utf8')).join('\n');
const codes = new Set([
  ...[...back.matchAll(/error: '([a-z_]+)'/g)].map((m) => m[1]),
  ...[...back.matchAll(/errors\.push\('([a-z_]+)'\)/g)].map((m) => m[1]),
  ...[...back.matchAll(/new BooksError\('([a-z_]+)'/g)].map((m) => m[1]),
  ...[...back.matchAll(/[?:] '(books_[a-z_]+)'/g)].map((m) => m[1]),
  ...[...back.matchAll(/resolve\('([a-z_]+)'\)/g)].map((m) => m[1]),
  ...[...back.matchAll(/\? '([a-z_]+)' : '([a-z_]+)'/g)].flatMap((m) => [m[1], m[2]]),
]);
ok(codes.size > 40, `codes d'erreur trouvés dans le serveur (${codes.size})`);
const untranslated = [...codes].filter((c) => !(`finance.managers.errors.${c}` in EN)).sort();
eq(untranslated, [], 'chaque code d\'erreur du serveur est traduit');

console.log(`✅ finance managers (navigateur) : ${n} vérifications`);
