// Approbation par driver, responsables et barre de progression (lot G), côté navigateur :
//   - traductions EN / FR : mêmes clés, mêmes variables, aucune chaîne vide, aucune clé orpheline,
//     toute clé utilisée dans le code existe ;
//   - codes d'erreur et de détail émis par le SERVEUR : tous traduits ;
//   - listes de drivers du serveur = cellules saisissables de rows.ts ;
//   - calculs du serveur (valeurs courantes d'un driver / d'une ligne OPEX) = le vrai modèle model.ts ;
//   - cache de module (une seule requête, fusion d'une écriture, rafraîchissement groupé, 403) ;
//   - syntaxe de chaque fichier de l'écran.
//   node scripts/test-finance-progress.cjs [dossier design/finance]
//
// Le dossier de passation (données réelles de la CFO) n'est PAS dans le dépôt : par défaut
// ../design/finance à côté du dépôt. ⚠️ Échoue s'il manque, plutôt que de se déclarer vert.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');

const DIR = path.resolve(process.argv[2] || path.join(__dirname, '../../design/finance'));
const BACK = path.join(__dirname, '../../commission-tracker/services/finance');
const SRC = path.join(__dirname, '../src/pages/Finance');
const SCREEN = path.join(SRC, 'Progress');
if (!fs.existsSync(path.join(DIR, 'Finance Module Prototype.dc.html'))) { console.error(`ÉCHEC : paquet de passation introuvable dans ${DIR}`); process.exit(1); }
for (const f of [path.join(BACK, 'driverApprovalsCore.js'), path.join(BACK, 'driverApprovals.js'), path.join(BACK, 'handoff.js')]) {
  if (!fs.existsSync(f)) { console.error(`ÉCHEC : ${f} introuvable`); process.exit(1); }
}

let n = 0;
const ok = (c, m) => { assert(c, m); n++; };

const build = (entry, name) => {
  const out = path.join(os.tmpdir(), `${name}-${process.pid}.cjs`);
  esbuild.buildSync({ entryPoints: [entry], outfile: out, format: 'cjs', bundle: true, logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': '""' } });
  return require(out);
};
const C = require(path.join(BACK, 'driverApprovalsCore.js'));

// ============================================================================ traductions
const J = JSON.parse(fs.readFileSync(path.join(SRC, 'i18n/progress.json'), 'utf8'));
ok(Object.keys(J).sort().join() === 'en,fr', 'progress.json : deux langues, en et fr');
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) (v && typeof v === 'object') ? flat(v, p ? `${p}.${k}` : k, out) : (out[p ? `${p}.${k}` : k] = v); return out; };
const en = flat(J.en), fr = flat(J.fr);
const missingFr = Object.keys(en).filter((k) => !(k in fr)), missingEn = Object.keys(fr).filter((k) => !(k in en));
ok(!missingFr.length, `chaque clé EN existe en FR (manque : ${missingFr.slice(0, 5)})`);
ok(!missingEn.length, `chaque clé FR existe en EN (manque : ${missingEn.slice(0, 5)})`);
ok(Object.keys(en).every((k) => k.startsWith('finance.approvals.') || k.startsWith('finance.progress.')), 'espaces de noms : finance.approvals.* et finance.progress.* seulement');
ok(Object.entries({ ...en, ...fr }).every(([, v]) => typeof v === 'string' && v.trim().length > 0), 'aucune chaîne vide ni non texte');
const vars = (s) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join();
const badVars = Object.keys(en).filter((k) => vars(en[k]) !== vars(fr[k]));
ok(!badVars.length, `mêmes variables {{…}} en EN et FR (écart : ${badVars.slice(0, 5)})`);
ok(Object.keys(fr).filter((k) => fr[k] === en[k] && !/^finance\.(approvals\.errors\.(perm|forbidden)|progress\.page\.group\.cogs|progress\.page\.group\.opex)$/.test(k) && en[k].length > 12).length === 0, 'les textes longs sont réellement traduits en FR');

// Ce que le code utilise : clés statiques, et domaines des clés dynamiques.
const sources = fs.readdirSync(SCREEN).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ f, text: fs.readFileSync(path.join(SCREEN, f), 'utf8') }));
const STATE_KEYS = ['default', 'proposed', 'submitted', 'approved', 'stale'];
const ITEM_STATES = ['done', 'todo', 'warn', 'blocked'];
const serverText = fs.readFileSync(path.join(BACK, 'driverApprovals.js'), 'utf8') + fs.readFileSync(path.join(BACK, 'driverApprovalsCore.js'), 'utf8');
const errorCodes = [...new Set([...serverText.matchAll(/error:\s*'([a-z_]+)'/g)].map((m) => m[1]))];
const detailCodes = [...new Set([...serverText.matchAll(/code:\s*([^,}]+)/g)].flatMap((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])))];
const DOMAINS = {
  'finance.approvals.state.': STATE_KEYS,
  'finance.approvals.stateHelp.': STATE_KEYS,
  'finance.approvals.action.': ['approve', 'reopen', 'submit'],
  'finance.approvals.errors.': [...errorCodes, 'forbidden', 'perm', 'demo_blocked', 'network', 'generic'],
  'finance.progress.state.': ITEM_STATES,
  'finance.progress.detail.': detailCodes,
  'finance.progress.groups.': ['drivers', 'inputs', 'data', 'budgets'],
  'finance.progress.page.group.': ['revenue', 'cogs', 'opex'],
  'finance.progress.driver.': [...C.REVENUE_INPUTS, ...C.COGS_INPUTS],
  'finance.progress.items.': C.ITEM_DEFS.map((d) => d.id),
  'finance.progress.page.': ['forbidden', 'demo_blocked'],
};
const used = new Set();
const unknownDynamic = [];
for (const { text } of sources) {
  for (const m of text.matchAll(/\bt\(\s*(['"`])((?:\\.|(?!\1).)*?)\1/g)) {
    const key = m[2];
    if (!/^finance\.(approvals|progress)\./.test(key)) continue;
    if (!key.includes('${')) { used.add(key); continue; }
    const prefix = key.slice(0, key.indexOf('${'));
    if (!DOMAINS[prefix]) unknownDynamic.push(key); else for (const s of DOMAINS[prefix]) used.add(prefix + s);
  }
  // t(it.labelKey) : libellé d'un point, `finance.progress.items.<id>` ; t(cond ? 'a' : 'b') : deux clés statiques.
  for (const m of text.matchAll(/\bt\(\s*[^'"`)]*\?\s*'(finance\.[^']+)'\s*:\s*'(finance\.[^']+)'/g)) { used.add(m[1]); used.add(m[2]); }
}
for (const id of C.ITEM_DEFS.map((d) => d.id)) used.add(`finance.progress.items.${id}`);
ok(used.size > 150 && [...used].some((k) => k === 'finance.progress.bar.summary') && [...used].some((k) => k === 'finance.approvals.owner.title'), `le lecteur de clés du code en trouve ${used.size} (garde contre un lecteur vide)`);
ok(!unknownDynamic.length,`clés dynamiques sans domaine connu : ${unknownDynamic}`);
const absent = [...used].filter((k) => !(k in en));
ok(!absent.length, `toute clé utilisée par le code existe (absente : ${absent.slice(0, 8)})`);
const orphan = Object.keys(en).filter((k) => !used.has(k));
ok(!orphan.length, `aucune clé orpheline (inutilisée : ${orphan.slice(0, 8)})`);

// ============================================================================ serveur → traductions
ok(errorCodes.length >= 8 && ['locked', 'conflict', 'bad_owner', 'bad_keys', 'unknown_line', 'bad_reason', 'save_failed', 'not_found'].every((c) => errorCodes.includes(c)), `codes d'erreur du serveur repérés (${errorCodes.length})`);
for (const c of errorCodes) ok(`finance.approvals.errors.${c}` in en && `finance.approvals.errors.${c}` in fr, `erreur « ${c} » traduite EN et FR`);
ok(detailCodes.length >= 20, `codes de détail du serveur repérés (${detailCodes.length})`);
for (const c of detailCodes) ok(`finance.progress.detail.${c}` in en && `finance.progress.detail.${c}` in fr, `détail « ${c} » traduit EN et FR`);
for (const d of C.ITEM_DEFS) ok(`finance.progress.items.${d.id}` in en && `finance.progress.items.${d.id}` in fr, `point « ${d.id} » traduit`);
for (const g of new Set(C.ITEM_DEFS.map((d) => d.group))) ok(`finance.progress.groups.${g}` in en, `groupe « ${g} » traduit`);
for (const k of [...C.REVENUE_INPUTS, ...C.COGS_INPUTS]) ok(`finance.progress.driver.${k}` in en && `finance.progress.driver.${k}` in fr, `libellé du driver « ${k} » EN et FR`);
ok(fs.readFileSync(path.join(BACK, 'driverApprovals.js'), 'utf8').includes("labelKey") || serverText.includes('labelKey'), 'les points portent une clé de libellé');

// ============================================================================ listes de drivers = rows.ts
const rows = build(path.join(SRC, 'rows.ts'), 'finance-rows-progress');
const inputsOf = (spec) => spec.filter((r) => !rows.isSec(r) && r.inp).map((r) => r.key);
const rev = inputsOf(rows.DRV_BOT), cogs = inputsOf(rows.COGS_BOT);
ok(JSON.stringify([...C.REVENUE_INPUTS].sort()) === JSON.stringify([...rev].sort()), 'drivers de revenus du serveur = cellules saisissables de la page des revenus');
ok(JSON.stringify([...C.COGS_INPUTS].sort()) === JSON.stringify([...cogs].sort()), 'drivers de COGS du serveur = cellules saisissables de la page des COGS');
ok(!rev.some((k) => cogs.includes(k)), 'aucun driver n\'est à la fois des revenus et des COGS');

// ============================================================================ calculs du serveur = le vrai modèle
const M = build(path.join(SRC, 'model.ts'), 'finance-model-progress');
const { extractHandoff } = require(path.join(BACK, 'handoff.js'));
const { reference: ref } = extractHandoff(DIR);
const defKeys = Object.keys(ref.drvDefaults);
ok([...rev, ...cogs].every((k) => defKeys.includes(k)), 'tous les drivers saisissables existent dans la référence de la CFO');
const paidByPayroll = defKeys.filter((k) => ![...rev, ...cogs].includes(k));
ok(paidByPayroll.length === 4 && ['supportWages', 'supportContr', 'nnWages', 'exWages'].every((k) => paidByPayroll.includes(k)), 'les seules lignes non suivies sont les 4 lignes alimentées par la paie');

const lines = C.buildLines(ref);
ok(lines.filter((l) => l.kind === 'driver').length === 45 && new Set(lines.map((l) => l.key)).size === lines.length, '45 drivers suivis, identifiants uniques');
const noPay = { lines: {} };
const modelOpex = M.computeOpex(ref, { opx: {}, opxG: {} }, [], noPay, 1);
const editableByModel = modelOpex.rows.filter((r) => r.kind === 'line' && r.editable).map((r) => r.key).sort();
ok(JSON.stringify(lines.filter((l) => l.kind === 'opex').map((l) => l.id).sort()) === JSON.stringify(editableByModel), 'lignes OPEX suivies = lignes modifiables du modèle (page OPEX)');

let seed = 20261020;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
let cases = 0;
for (let round = 0; round < 40; round++) {
  const drv = {};
  for (const k of defKeys) if (rnd() < 0.35) drv[k] = Array.from({ length: 12 }, () => Math.round(rnd() * 5000) / 10);
  const opx = {}, opxG = {};
  for (const k of editableByModel) {
    if (rnd() < 0.4) { opx[k] = {}; for (let i = 0; i < 12; i++) if (rnd() < 0.3) opx[k][i] = Math.round(rnd() * 90000) / 10; }
    if (rnd() < 0.4) opxG[k] = Math.round(rnd() * 800) / 100;
  }
  const I = M.driverInputs(ref, { drv });
  for (const l of lines.filter((x) => x.kind === 'driver')) {
    const mine = C.lineValues(ref, { drivers: { drv } }, l).values;
    ok(mine.every((v, i) => near(v, I[l.id][i])), `tour ${round} : driver ${l.id} = driverInputs du modèle`); cases++;
  }
  const O = M.computeOpex(ref, { opx, opxG }, [], noPay, 1);
  for (const l of lines.filter((x) => x.kind === 'opex')) {
    const mine = C.lineValues(ref, { opex: { opx, opxG } }, l).values;
    ok(mine.every((v, i) => near(v, O.byKey[l.id][i])), `tour ${round} : OPEX ${l.id} = computeOpex du modèle`); cases++;
  }
}
// Par défaut (aucun ajustement) : le hachage « par défaut » d'une ligne = celui de ses valeurs de référence.
const first = lines.find((l) => l.kind === 'opex');
ok(C.hashValues(C.lineValues(ref, {}, first).values, 0) === C.hashValues(modelOpex.byKey[first.id], 0), 'valeurs par défaut d\'une ligne OPEX = celles du modèle sans ajustement');
ok(lines.every((l) => ['David', 'Eric', 'Amanda', 'Fred'].includes(l.suggestedOwner)), 'chaque ligne a un responsable suggéré connu');

// ============================================================================ cache de module
const stubFetch = (handler) => { global.fetch = async (url, init) => { const r = await handler(String(url), init || {}); return { ok: r.status < 400, status: r.status, json: async () => r.body }; }; };
global.window = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const S = build(path.join(SCREEN, 'store.ts'), 'finance-progress-store');
  const A = build(path.join(SCREEN, 'api.ts'), 'finance-progress-api');
  const line = (key, extra = {}) => ({ key, kind: 'driver', id: key.slice(4), group: 'revenue', dept: null, name: null, state: 'default', modified: false, values: Array(12).fill(1), growth: 0, hash: `h-${key}`, owner: null, suggestedOwner: 'David', version: 0, ...extra });
  const summary = (approved) => ({ total: 2, approved, stale: 0, submitted: 0, proposed: 0, default: 2 - approved, ownersMissing: 2, groups: {} });
  const payload = { budget: { id: 1, status: 'draft' }, locked: false, caps: { canEdit: true, canApprove: true }, lines: [line('drv:a'), line('drv:b')], directory: ['X'], summary: summary(0) };
  let calls = 0;
  stubFetch(async (url) => { calls++; return { status: 200, body: url.includes('/progress') ? { items: [], ready: false, percent: 0 } : payload }; });

  S.statusStore.ensure(); S.statusStore.ensure(); S.statusStore.ensure();
  await sleep(20);
  ok(calls === 1, 'ensure() appelé trois fois : UNE seule requête');
  ok(S.statusStore.get().data.lines.length === 2 && S.statusStore.get().error === null, 'données mises en cache');
  S.statusStore.ensure(); await sleep(10);
  ok(calls === 1, 'cache frais : pas de nouvelle requête');

  S.mergeMutation({ lines: [line('drv:b', { state: 'approved', version: 1, hash: 'new', owner: 'Eric' })], summary: summary(1), directory: ['X', 'Y'] });
  const d = S.statusStore.get().data;
  ok(d.lines[0].state === 'default' && d.lines[1].state === 'approved' && d.lines[1].owner === 'Eric', 'une écriture ne remplace que les lignes modifiées');
  ok(d.summary.approved === 1 && d.directory.join() === 'X,Y', 'compteurs et annuaire remplacés par ceux du serveur');
  await sleep(300);

  const before = calls;
  for (let i = 0; i < 6; i++) S.statusStore.refreshSoon(30);
  await sleep(120);
  ok(calls === before + 1, 'six demandes de rafraîchissement rapprochées : UNE requête');

  // 403 : l'écran se tait (aucune pastille, aucune barre).
  stubFetch(async () => ({ status: 403, body: { error: 'perm' } }));
  await S.progressStore.reload();
  ok(S.progressStore.get().error === 'forbidden', '403 : code « forbidden »');
  stubFetch(async () => ({ status: 403, body: { error: 'demo_blocked', demo: true } }));
  await S.progressStore.reload();
  ok(S.progressStore.get().error === 'demo_blocked', 'mode démo : code « demo_blocked »');
  stubFetch(async () => ({ status: 500, body: { error: 'load_failed' } }));
  await S.progressStore.reload();
  ok(S.progressStore.get().error === 'load_failed', 'erreur serveur : code du serveur');
  stubFetch(async () => { throw new Error('offline'); });
  await S.progressStore.reload();
  ok(S.progressStore.get().error === 'network', 'réseau coupé : « network »');

  // Version et hachage vus à l'écran = ce que l'API envoie (concurrence optimiste).
  const exp = A.expectOf([line('drv:a', { version: 3, hash: 'abc' })]);
  ok(exp['drv:a'].version === 3 && exp['drv:a'].hash === 'abc', 'expectOf : version et hachage de chaque ligne');
  let sent = null;
  stubFetch(async (url, init) => { sent = { url, init }; return { status: 200, body: { ok: true } }; });
  await A.progressApi.approve(['drv:a'], exp);
  ok(sent.url === '/api/finance/driver-status/approve' && sent.init.method === 'POST' && JSON.parse(sent.init.body).expect['drv:a'].hash === 'abc', 'approve : POST avec les clés et l\'attente');
  await A.progressApi.setOwner(['drv:a'], null);
  ok(sent.init.method === 'PUT' && JSON.parse(sent.init.body).owner === null, 'owner : PUT, null efface');
  await A.progressApi.removeFromDirectory('Marc-Antoine é');
  ok(sent.init.method === 'DELETE' && sent.url.endsWith('/directory/Marc-Antoine%20%C3%A9'), 'annuaire : nom encodé dans l\'URL');

  // ============================================================================ syntaxe de chaque fichier
  for (const { f, text } of sources) {
    esbuild.transformSync(text, { loader: f.endsWith('.tsx') ? 'tsx' : 'ts', logLevel: 'silent' });
    n++;
  }
  ok(sources.length >= 7, `${sources.length} fichiers de l'écran, tous syntaxiquement valides`);
  const idx = sources.find((s) => s.f === 'index.tsx').text;
  ok(/export \{ default as DriverStatusCell \}/.test(idx) && /export \{ default as BudgetProgress \}/.test(idx) && /export \{ default as ProgressPage \}/.test(idx) && /export function ApprovePageButton/.test(idx), 'index.tsx exporte DriverStatusCell, BudgetProgress, ProgressPage, ApprovePageButton');

  console.log(`✅ finance progress (navigateur) : ${n} vérifications (${cases} comparaisons au modèle)`);
})().catch((e) => { console.error('❌', e.stack || e.message); process.exit(1); });
