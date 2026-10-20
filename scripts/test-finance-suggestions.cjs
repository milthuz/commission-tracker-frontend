// Module Finance — lot F (suggestions de drivers + brouillon IA) : banc du NAVIGATEUR.
//   node scripts/test-finance-suggestions.cjs [dossier design/finance]
//
//  1. logic.ts compilé par esbuild : comparaison avec le budget vivant, options de méthode,
//     « garder la mienne » (par session), sélection recommandée, données du graphique ;
//  2. units.ts = catalogue du serveur (mêmes clés, mêmes types) ;
//  3. traductions src/pages/Finance/i18n/suggestions.json : mêmes clés EN / FR, mêmes {{variables}},
//     tout sous finance.suggestions.* / finance.aiBudget.*, chaque clé utilisée par
//     src/pages/Finance/Suggestions/** existe (littérales ET familles dynamiques), chaque driver
//     du catalogue a son libellé, CHAQUE code d'erreur du serveur a son texte ;
//  4. conventions : pas de <select> natif, pas de window.confirm, pas d'emoji, boutons typés.
// Le calcul statistique est testé côté serveur (services/finance/__tests__/suggestions.test.js).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSync } = require('esbuild');

const ROOT = path.join(__dirname, '..');
const PAGES = path.join(ROOT, 'src/pages/Finance/Suggestions');
const I18N = path.join(ROOT, 'src/pages/Finance/i18n/suggestions.json');
const BACK = path.join(ROOT, '../commission-tracker/services/finance');
const DESIGN = path.resolve(process.argv[2] || path.join(ROOT, '../design/finance'));
for (const p of [PAGES, I18N, path.join(BACK, 'suggestionsCore.js'), path.join(BACK, 'suggestions.js'), path.join(BACK, 'aiBudget.js')]) {
  if (!fs.existsSync(p)) { console.error(`ÉCHEC : introuvable ${p}`); process.exit(1); }
}
if (!fs.existsSync(DESIGN)) { console.error(`ÉCHEC : dossier de passation introuvable ${DESIGN}`); process.exit(1); }

let n = 0;
const ok = (c, m) => { assert(c, m); n++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, `${m} : ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); n++; };

const build = (entry, name) => {
  const out = path.join(os.tmpdir(), `${name}-${process.pid}.cjs`);
  buildSync({ entryPoints: [entry], outfile: out, format: 'cjs', bundle: true, logLevel: 'error' });
  const m = require(out);
  fs.unlinkSync(out);
  return m;
};

// ---------------------------------------------------------------------------- 1. logic.ts
const L = build(path.join(PAGES, 'logic.ts'), 'finance-suggestions-logic');
const sug = (o = {}) => ({
  key: 'intAdds', suggested: Array(12).fill(20), confidence: 'high', current: Array(12).fill(25), alternatives: [],
  basis: { method: 'avg', windowMonths: 6, sample: [], unit: 'count', why: 'stable', cv: 0.1, note: '' },
  history: { months: ['2026-08', '2026-09'], values: [10, 12] }, ...o,
});

eq(L.currentValues({ a: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }, { a: 9, b: 4 }, 'a'), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'valeur courante : ajustement de la CFO');
eq(L.currentValues({ a: [1, 2] }, { a: 9 }, 'a'), Array(12).fill(9), 'ajustement incomplet : valeur par défaut × 12');
eq(L.currentValues({}, { b: 4 }, 'b'), Array(12).fill(4), 'sans ajustement : défaut × 12');
eq(L.currentValues({}, {}, 'x'), Array(12).fill(0), 'driver sans défaut : 0');
ok(L.sameValues([1, 2], [1, 2]) && !L.sameValues([1, 2], [1, 3]) && !L.sameValues([1], [1, 1]), 'sameValues');
ok(L.average([2, 4, 6]) === 4 && L.average([]) === 0, 'moyenne (série vide : 0, pas NaN)');
ok(L.changePct(100, 110) === 10 && L.changePct(-100, -90) === 10 && L.changePct(0, 5) === null, 'écart relatif : jamais de division par zéro');

// options : la méthode par défaut en tête, sans doublon, ordre stable
{
  const s = sug({ basis: { ...sug().basis, method: 'trend', windowMonths: 12 }, alternatives: [
    { method: 'seasonal', windowMonths: 12, suggested: Array(12).fill(3) }, { method: 'avg', windowMonths: 12, suggested: Array(12).fill(2) },
    { method: 'trend', windowMonths: 12, suggested: Array(12).fill(20) }, { method: 'avg', windowMonths: 3, suggested: Array(12).fill(1) },
    { method: 'avg', windowMonths: 6, suggested: Array(12).fill(1) },
  ] });
  eq(L.buildOptions(s).map((o) => o.id), ['trend:12', 'avg:3', 'avg:6', 'avg:12', 'seasonal:12'], 'options : défaut en tête, moyennes 3/6/12, tendance, saisonnier, sans doublon');
  ok(L.buildOptions(s)[0].isDefault && !L.buildOptions(s)[1].isDefault, 'seule la première est « suggérée »');
  eq(L.buildOptions(sug()).length, 1, 'sans alternative : une seule option');
}
eq([L.noteKey('merchants activated per month (all statuses)'), L.noteKey('autre phrase'), L.noteKey('')], ['adyenTarget', null, null], 'notes du serveur → clés de traduction');

// état d'un driver
{
  const s = sug();
  eq(L.driverState(s, Array(12).fill(20), {}), 'same', 'valeur déjà égale : same');
  eq(L.driverState(s, Array(12).fill(25), {}), 'available', 'différente : available');
  eq(L.driverState(s, Array(12).fill(25), { intAdds: L.signature(s.suggested) }), 'kept', 'gardée pour CETTE suggestion : kept');
  eq(L.driverState(s, Array(12).fill(25), { intAdds: L.signature(Array(12).fill(19)) }), 'available', 'la suggestion a changé depuis : la mémoire ne s\'applique plus');
  eq(L.driverState(s, Array(12).fill(20), { intAdds: 'x' }), 'same', 'égal gagne sur gardé');
}
// mémoire par session
{
  const store = {}; const st = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  eq(L.readKept(st), {}, 'mémoire vide');
  const s = sug();
  let kept = L.withKept({}, s);
  L.writeKept(st, kept);
  eq(L.readKept(st), { intAdds: '20,20,20,20,20,20,20,20,20,20,20,20' }, 'mémoire écrite puis relue');
  eq(L.withoutKept(kept, 'intAdds'), {}, 'oubli d\'une clé');
  store[L.KEPT_STORAGE_KEY] = '{ pas du json';
  eq(L.readKept(st), {}, 'mémoire corrompue : ignorée');
  store[L.KEPT_STORAGE_KEY] = '[1,2]';
  eq(L.readKept(st), {}, 'mémoire de mauvaise forme : ignorée');
  store[L.KEPT_STORAGE_KEY] = JSON.stringify({ a: 'x', b: 3 });
  eq(L.readKept(st), { a: 'x' }, 'seules les chaînes sont gardées');
  eq(L.readKept(null), {}, 'stockage indisponible : mémoire vide');
  L.writeKept(null, {}); // ne lève pas
  L.writeKept({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, {}); // ne lève pas
  n += 2;
}
// liste : ce qui demande une décision d'abord ; recommandées = confiance moyenne ou haute et différentes
{
  const a = sug({ key: 'a', suggested: Array(12).fill(1), confidence: 'high' });
  const b = sug({ key: 'b', suggested: Array(12).fill(2), confidence: 'low' });
  const c = sug({ key: 'c', suggested: Array(12).fill(3), confidence: 'medium' });
  const d = sug({ key: 'd', suggested: Array(12).fill(4), confidence: 'high' });
  const cur = { a: Array(12).fill(1), b: Array(12).fill(0), c: Array(12).fill(0), d: Array(12).fill(0) };
  const rows = L.buildRows([a, b, c, d], (k) => cur[k], {});
  eq(rows.map((r) => r.s.key), ['b', 'c', 'd', 'a'], 'les lignes qui diffèrent d\'abord (ordre du serveur conservé)');
  eq(rows.map((r) => r.state), ['available', 'available', 'available', 'same'], 'états');
  eq(L.recommendedKeys(rows), ['c', 'd'], 'recommandées : jamais la confiance basse, jamais les valeurs déjà égales');
}
// graphique : 24 mois d'historique puis les 12 mois de l'exercice
{
  const months = Array.from({ length: 24 }, (_, i) => `m${i}`);
  const s = sug({ history: { months, values: months.map((_, i) => (i === 3 ? null : i)) } });
  const targets = Array.from({ length: 12 }, (_, i) => `t${i}`);
  const c = L.chartData(s, targets, Array(12).fill(7), Array(12).fill(9));
  ok(c.categories.length === 36 && c.history.length === 36 && c.suggested.length === 36 && c.current.length === 36, 'trois séries de 36 points');
  ok(c.history[3] === null && c.history[23] === 23 && c.history[24] === null, 'historique : trous conservés, rien après le dernier mois clos');
  ok(c.suggested[23] === null && c.suggested[24] === 7 && c.current[24] === 9 && c.current[0] === null, 'suggestion et budget actuel : seulement sur l\'exercice');
}
// erreurs : codes connus → texte, sinon « inconnu »
eq(L.errorKey('aiBudget', 'rate_limited'), 'finance.aiBudget.errors.rate_limited', 'clé d\'erreur IA');
eq(L.errorKey('aiBudget', 'nawak'), 'finance.aiBudget.errors.unknown', 'code inconnu → unknown');
eq(L.errorKey('suggestions', 'bad_window'), 'finance.suggestions.errors.bad_window', 'clé d\'erreur suggestions');
eq(L.errorKey('suggestions', 'rate_limited'), 'finance.suggestions.errors.unknown', 'un code IA n\'est pas une erreur de suggestions');
eq(L.errorKey('suggestions', 'demo_blocked'), 'finance.suggestions.errors.demo_blocked', 'codes communs');
eq(L.reasonKey('ledger_required'), 'finance.suggestions.reason.ledger_required', 'clé de raison');
eq(L.reasonKey('autre'), 'finance.suggestions.reason.unknown', 'raison inconnue');
eq(L.unavailableSorted([{ key: 'b', reason: 'z' }, { key: 'a', reason: 'z' }, { key: 'c', reason: 'a' }]).map((u) => u.key), ['c', 'a', 'b'], 'indisponibles : groupés par raison');

// ---------------------------------------------------------------------------- 2. unités = catalogue du serveur
const U = build(path.join(PAGES, 'units.ts'), 'finance-suggestions-units').CATALOG_UNITS;
const SC = require(path.join(BACK, 'suggestionsCore.js'));
const UNIT_OF = { count: 'count', growth: 'pct_per_month', share: 'pct', money: 'money' };
eq(Object.keys(U).sort(), Object.keys(SC.CATALOG).sort(), 'mêmes drivers au catalogue du serveur et du navigateur');
for (const k of Object.keys(SC.CATALOG)) assert.strictEqual(U[k], UNIT_OF[SC.CATALOG[k][0]], `unité de ${k}`);
n++;

// ---------------------------------------------------------------------------- 3. traductions
const dict = JSON.parse(fs.readFileSync(I18N, 'utf8'));
const flat = (o, p = '', acc = {}) => { for (const [k, x] of Object.entries(o)) { const q = p ? `${p}.${k}` : k; if (x && typeof x === 'object') flat(x, q, acc); else acc[q] = x; } return acc; };
const EN = flat(dict.en), FR = flat(dict.fr);
ok(Object.keys(EN).length > 150, `le dictionnaire a été lu (${Object.keys(EN).length} clés)`);
eq(Object.keys(EN).sort(), Object.keys(FR).sort(), 'mêmes clés EN et FR');
const vars = (s) => [...String(s).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
for (const k of Object.keys(EN)) {
  assert.deepStrictEqual(vars(EN[k]), vars(FR[k]), `variables différentes EN/FR pour ${k}`);
  assert(String(FR[k]).trim() && String(EN[k]).trim(), `traduction vide : ${k}`);
  assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(EN[k] + FR[k]), `emoji dans ${k}`);
}
n++;
ok(Object.keys(EN).every((k) => k.startsWith('finance.suggestions.') || k.startsWith('finance.aiBudget.')), 'tout sous finance.suggestions.* ou finance.aiBudget.*');
ok(!Object.keys(EN).some((k) => k.startsWith('finance.suggestions.drivers.') && !(k.split('.').pop() in SC.CATALOG)), 'aucun libellé de driver hors catalogue');

const has = (k) => k in EN || `${k}_one` in EN;
// 3a. clés littérales
const files = fs.readdirSync(PAGES).filter((f) => /\.tsx?$/.test(f));
const src = files.map((f) => fs.readFileSync(path.join(PAGES, f), 'utf8')).join('\n');
const literal = [...new Set([...src.matchAll(/'(finance\.(?:suggestions|aiBudget)\.[A-Za-z0-9_.]+)'/g)].map((m) => m[1]))];
ok(literal.length > 60, `clés littérales trouvées dans les pages (${literal.length})`);
eq(literal.filter((k) => !has(k)), [], 'chaque clé littérale utilisée par les pages existe');
// 3b. familles dynamiques : `finance.suggestions.conf.${…}` etc., chaque membre possible doit exister
const fam = (prefix, members) => { for (const m of members) assert(has(`${prefix}.${m}`), `manque ${prefix}.${m}`); n++; };
const templ = [...src.matchAll(/`(finance\.(?:suggestions|aiBudget)\.[A-Za-z0-9_.]+)\.\$\{/g)].map((m) => m[1]);
const FAMILIES = {
  'finance.suggestions.conf': ['high', 'medium', 'low'],
  'finance.suggestions.method': ['avg', 'trend', 'seasonal'],
  'finance.suggestions.why': ['stable', 'variable', 'trend', 'seasonal', 'short_history', 'chosen'],
  'finance.suggestions.note': ['arpuMix', 'adyenArpu', 'adyenTarget'],
  'finance.suggestions.drivers': Object.keys(SC.CATALOG),
  'finance.suggestions.reason': [...L.REASON_CODES, 'unknown'],
  'finance.aiBudget.status': ['draft', 'applied', 'rejected'],
  'finance.aiBudget.reject': L.REJECT_REASONS,
};
for (const p of new Set(templ)) assert(FAMILIES[p], `famille dynamique sans liste de membres dans le banc : ${p}`);
n++;
for (const [p, members] of Object.entries(FAMILIES)) fam(p, members);
// les notes du serveur connues de logic.ts ont chacune leur clé
const noteSrc = fs.readFileSync(path.join(PAGES, 'logic.ts'), 'utf8');
eq([...noteSrc.matchAll(/: '(arpuMix|adyenArpu|adyenTarget)'/g)].map((m) => m[1]).sort(), ['adyenArpu', 'adyenTarget', 'arpuMix'], 'logic.ts : trois notes connues');
// méthodes / pourquoi : ceux que le serveur peut renvoyer
const coreSrc = fs.readFileSync(path.join(BACK, 'suggestionsCore.js'), 'utf8');
const whys = [...new Set([...coreSrc.matchAll(/why: '([a-z_]+)'/g)].map((m) => m[1]))];
for (const w of whys) assert(FAMILIES['finance.suggestions.why'].includes(w), `« why » du serveur non traduit : ${w}`);
n++;
const serverNotes = [...coreSrc.matchAll(/'((?:rebuilt|revenue per|merchants activated)[^']*)'/g)].map((m) => m[1]);
for (const note of serverNotes) assert(L.noteKey(note), `note du serveur sans clé de traduction : ${note}`);
n++;

// 3c. CHAQUE code d'erreur du serveur a son texte
const codes = (file) => [...new Set([...fs.readFileSync(path.join(BACK, file), 'utf8').matchAll(/json\(\{ error: '([a-z_]+)'/g)].map((m) => m[1]))];
const serverSug = codes('suggestions.js');
const serverAi = codes('aiBudget.js');
for (const c of serverSug) assert(has(`finance.suggestions.errors.${c}`), `erreur serveur sans texte (suggestions) : ${c}`);
for (const c of serverAi) assert(has(`finance.aiBudget.errors.${c}`), `erreur serveur sans texte (IA) : ${c}`);
for (const c of [...L.COMMON_ERRORS, 'unknown']) { assert(has(`finance.suggestions.errors.${c}`) && has(`finance.aiBudget.errors.${c}`), `erreur commune sans texte : ${c}`); }
n++;
for (const c of serverSug) assert(L.SUGGESTION_ERRORS.includes(c), `logic.ts ne connaît pas l'erreur ${c}`);
for (const c of serverAi) assert(L.AI_ERRORS.includes(c), `logic.ts ne connaît pas l'erreur IA ${c}`);
for (const c of L.SUGGESTION_ERRORS) assert(has(`finance.suggestions.errors.${c}`), `texte manquant ${c}`);
for (const c of L.AI_ERRORS) assert(has(`finance.aiBudget.errors.${c}`), `texte manquant IA ${c}`);
n++;
ok(serverAi.includes('rate_limited') && serverAi.includes('ai_unavailable') && serverAi.length >= 10, `codes d'erreur IA lus dans le serveur (${serverAi.length})`);
// Les raisons « indisponible » du serveur
const reasons = [...new Set([...coreSrc.matchAll(/(?:reason|miss\([a-z]+,)\s*'([a-z_]+)'/g), ...coreSrc.matchAll(/: '(billing_not_synced|no_history|insufficient_history|zentact_empty|no_closure_date|no_reliable_join|no_source|not_defined|ledger_required)'/g)].map((m) => m[1]))];
for (const r of Object.keys(SC.UNAVAILABLE_DETAIL)) assert(L.REASON_CODES.includes(r) && has(`finance.suggestions.reason.${r}`), `raison serveur non traduite : ${r}`);
n++;
void reasons;
// Les quatre inputs morts ne sont pas proposés
for (const k of SC.DEAD_DRIVERS) assert(!(k in U), `input mort proposé : ${k}`);
n++;

// ---------------------------------------------------------------------------- 4. conventions
ok(!/<select[\s>]/.test(src), 'aucun <select> natif : le composant Select partout');
ok(!/window\.confirm|\bconfirm\(/.test(src.replace(/dialog\.confirm\(/g, '')), 'aucun window.confirm : dialog.confirm');
ok(!/<button(?![^>]*\btype=)/.test(src), 'chaque <button> est typé');
ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), 'aucun emoji dans les pages');
ok(/applyDriverValues/.test(src) && /useFinance/.test(src), 'appliquer passe par useFinance().applyDriverValues');
ok(/export function SuggestionChip/.test(fs.readFileSync(path.join(PAGES, 'index.tsx'), 'utf8')) && /export function SuggestionsToolbar/.test(fs.readFileSync(path.join(PAGES, 'index.tsx'), 'utf8')), 'index.tsx exporte SuggestionChip et SuggestionsToolbar');

console.log(`test-finance-suggestions.cjs : ${n} vérifications OK`);
