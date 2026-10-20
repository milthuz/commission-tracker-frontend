// Module Finance — import Excel du budget consolidé : banc du NAVIGATEUR.
//   node scripts/test-finance-consolidated.cjs
//
//  1. traductions src/pages/Finance/i18n/consolidatedImport.json : mêmes clés EN / FR, mêmes
//     {{variables}}, aucune valeur vide, tout sous finance.consolidatedImport.* ;
//  2. chaque clé écrite en toutes lettres dans src/pages/Finance/ConsolidatedImport/** existe ;
//  3. les clés construites (`error.${code}`, `msg.${code}`, `field.${f}`, `kind.${k}`) : TOUTES les
//     valeurs que le serveur peut produire (services/finance/consolidatedImport.js et
//     consolidatedXlsx.js, lus tels quels) ont leur texte ;
//  4. les fichiers compilent (esbuild, syntaxe) et les deux pages posent bien les boutons.
// Le calcul d'import est testé côté serveur (services/finance/__tests__/consolidatedImport.test.js).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { transformSync } = require('esbuild');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'src/pages/Finance/ConsolidatedImport');
const I18N = path.join(ROOT, 'src/pages/Finance/i18n/consolidatedImport.json');
const BACK = path.join(ROOT, '../commission-tracker/services/finance');
for (const p of [DIR, I18N, path.join(BACK, 'consolidatedImport.js'), path.join(BACK, 'consolidatedXlsx.js')]) {
  if (!fs.existsSync(p)) { console.error(`ÉCHEC : introuvable ${p}`); process.exit(1); }
}

let n = 0;
const ok = (c, m) => { assert(c, m); n++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, `${m} : ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); n++; };

// ---------------------------------------------------------------------------- 1. dictionnaire
const dict = JSON.parse(fs.readFileSync(I18N, 'utf8'));
eq(Object.keys(dict).sort(), ['en', 'fr'], 'le fichier a deux langues : en et fr');
const flat = (o, p = '', acc = {}) => { for (const [k, x] of Object.entries(o)) { const q = p ? `${p}.${k}` : k; if (x && typeof x === 'object') flat(x, q, acc); else acc[q] = x; } return acc; };
const EN = flat(dict.en), FR = flat(dict.fr);
ok(Object.keys(EN).length > 100, `le dictionnaire a été lu (${Object.keys(EN).length} clés)`);
eq(Object.keys(EN).sort(), Object.keys(FR).sort(), 'mêmes clés EN et FR');
const vars = (s) => [...String(s).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
for (const k of Object.keys(EN)) {
  assert.deepStrictEqual(vars(EN[k]), vars(FR[k]), `variables différentes EN/FR pour ${k}`);
  assert(String(FR[k]).trim() && String(EN[k]).trim(), `traduction vide : ${k}`);
  assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(EN[k] + FR[k]), `emoji interdit : ${k}`);
}
n++;
ok(Object.keys(EN).every((k) => k.startsWith('finance.consolidatedImport.')), 'tout sous finance.consolidatedImport.*');
ok(Object.values(FR).some((v) => /[éèà]/.test(v)) && FR['finance.consolidatedImport.import'] === 'Importer (Excel)' && FR['finance.consolidatedImport.template'] === 'Télécharger le modèle', 'le français est bien du français (libellés demandés)');

// ---------------------------------------------------------------------------- 2. clés littérales
const files = fs.readdirSync(DIR).filter((f) => /\.tsx?$/.test(f));
ok(files.length >= 6, `fichiers du dossier : ${files.join(', ')}`);
const src = files.map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const literal = [...new Set([...src.matchAll(/'(finance\.consolidatedImport\.[A-Za-z0-9_.]+)'/g)].map((m) => m[1]))];
ok(literal.length > 40, `clés trouvées dans le code (${literal.length})`);
const has = (k) => k in EN;
eq(literal.filter((k) => !has(k)), [], 'chaque clé utilisée par le code existe');
// À l'inverse : aucune clé du dictionnaire n'est orpheline (hors celles construites, vérifiées plus bas).
const dynPrefixes = ['finance.consolidatedImport.error.', 'finance.consolidatedImport.msg.', 'finance.consolidatedImport.field.', 'finance.consolidatedImport.kind.'];
const used = (k) => literal.includes(k) || dynPrefixes.some((p) => k.startsWith(p));
eq(Object.keys(EN).filter((k) => !used(k)), [], 'aucune clé orpheline dans le dictionnaire');

// ---------------------------------------------------------------------------- 3. clés construites
for (const p of dynPrefixes) ok(src.includes(`\`${p}\${`), `gabarit utilisé dans le code : ${p}\${…}`);
const back = fs.readFileSync(path.join(BACK, 'consolidatedImport.js'), 'utf8');
const xl = fs.readFileSync(path.join(BACK, 'consolidatedXlsx.js'), 'utf8');
const THROWN = [...new Set([...xl.matchAll(/Object\.assign\(new Error\('\w+'\), \{ code: '(\w+)' \}\)/g)].map((m) => m[1]))];
ok(THROWN.length >= 4, `codes levés par la lecture du classeur : ${THROWN.join(', ')}`);
// Erreurs de haut niveau (corps { error }) : serveur + codes levés + ceux du navigateur.
const top = new Set([
  ...[...back.matchAll(/error: '(\w+)'/g)].map((m) => m[1]),
  ...THROWN,
  'demo_blocked', 'forbidden', 'network', 'generic', 'template_failed',
]);
ok(top.size >= 18, `codes d'erreur de haut niveau : ${top.size}`);
for (const c of top) ok(`finance.consolidatedImport.error.${c}` in EN, `erreur traduite : ${c}`);
// Anomalies de lecture ligne par ligne (feuille, rang, code).
const rowCodes = new Set([
  ...[...xl.matchAll(/code: '(\w+)'/g)].map((m) => m[1]),
  ...[...xl.matchAll(/\berr\('(\w+)'/g)].map((m) => m[1]),
  ...[...back.matchAll(/code: '(\w+)'/g)].map((m) => m[1]),
].filter((c) => !THROWN.includes(c)));
ok(rowCodes.size >= 20, `codes d'anomalie de lecture : ${[...rowCodes].join(', ')}`);
for (const c of rowCodes) ok(`finance.consolidatedImport.msg.${c}` in EN, `anomalie traduite : ${c}`);
// Champs comparés et genres de changement.
const fields = new Set([...xl.matchAll(/field: '(\w+)'/g)].map((m) => m[1]));
ok(fields.size === 8, `champs comparés par le serveur : ${[...fields].join(', ')}`);
for (const f of fields) ok(`finance.consolidatedImport.field.${f}` in EN, `champ traduit : ${f}`);
for (const k of ['added', 'changed', 'missing']) ok(`finance.consolidatedImport.kind.${k}` in EN, `genre traduit : ${k}`);
// Les types du navigateur connaissent les mêmes champs.
const api = fs.readFileSync(path.join(DIR, 'api.ts'), 'utf8');
for (const f of fields) ok(api.includes(`'${f}'`), `api.ts : champ ${f} typé`);

// ---------------------------------------------------------------------------- 4. compilation, câblage
for (const f of files) {
  const code = fs.readFileSync(path.join(DIR, f), 'utf8');
  transformSync(code, { loader: f.endsWith('x') ? 'tsx' : 'ts', logLevel: 'silent' });
  n++;
}
const payroll = fs.readFileSync(path.join(ROOT, 'src/pages/Finance/Payroll.tsx'), 'utf8');
const opex = fs.readFileSync(path.join(ROOT, 'src/pages/Finance/Opex.tsx'), 'utf8');
ok(/\{can && <RosterImportActions \/>\}/.test(payroll), 'Salaires : boutons posés seulement si canEditPayroll');
ok(/\{canEdit && opexYear === 1 && <OpexImportActions \/>\}/.test(opex), 'OPEX : boutons posés seulement en FY2027 et si canEdit');
ok(/reload\(\)/.test(src), 'la fenêtre recharge le budget après l\'import (reload)');
ok(/dialog\.confirm\(/.test(src) && !/window\.confirm|confirm\(\s*['"`]/.test(src.replace(/dialog\.confirm\(/g, '')), 'confirmation par dialog.confirm, jamais window.confirm');
ok(!/<select\b/.test(src), 'aucun <select> natif (composant Select du projet)');

console.log(`✅ test-finance-consolidated : ${n} vérifications OK`);
