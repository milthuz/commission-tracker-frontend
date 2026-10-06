#!/usr/bin/env node
/**
 * Couverture de la visite guidée et des traductions.
 *
 * POURQUOI CE SCRIPT EXISTE.
 *
 * La visite guidée et l'assistante Sofia ont été conçues pour « se tenir à jour toutes
 * seules ». C'est vrai à MOITIÉ, et la moitié fausse ne se plaint jamais :
 *
 *   - buildSteps() énumère la barre latérale VIVANTE, donc un nouvel élément de menu
 *     apparaît dans la visite sans toucher au code de la visite — mais sa copie dédiée
 *     (NAV_DESC) est une ligne MANUELLE. Sans elle, l'élément tombe silencieusement sur un
 *     texte générique. Aucune erreur, aucun avertissement : la visite a simplement l'air
 *     moins utile.
 *   - une clé i18n mal orthographiée dans NAV_DESC produit exactement le même silence.
 *
 * Deux audits (2026-07-09 et 2026-08-17) ont trouvé la même dérive, et le second a montré
 * qu'elle ne se limite pas à « la dernière fonctionnalité manque » : toute une section
 * construite pendant des semaines était absente. D'où ce contrôle mécanique, qui pose la
 * question à chaque fois plutôt que de compter sur quelqu'un pour y penser.
 *
 * Usage :  npm run check:tour      (sort non nul si quelque chose manque)
 *
 * ⚠️ Ce script ne couvre PAS l'invite de Sofia (ASSISTANT_SYSTEM dans server.js, autre
 * dépôt) ni la publication des notes de version. Les deux restent à vérifier à la main
 * après une livraison notable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
const fail = (msg) => { failures += 1; console.log(`  ✗ ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);

// --- 1. Les routes du menu, telles que la visite les verra à l'exécution.
//
// buildSteps() prend les <li> ENFANTS DIRECTS de [data-tour-menu] et lit le href du <a>
// (ou data-tour-route quand l'élément est un <button> sans href, comme le Panneau Admin).
// L'indentation est le seul marqueur de niveau disponible en lecture statique : les
// sous-éléments sont plus indentés. Si la barre latérale est réindentée un jour, c'est ici
// qu'il faudra regarder — le script dira « aucune route trouvée » plutôt que de mentir.
const sidebar = read('src/components/Sidebar/index.tsx');
const menu = sidebar.slice(sidebar.indexOf('data-tour-menu'));
const routes = new Set([...menu.matchAll(/^\s{16,20}to="(\/[^"?]*)"/gm)].map((m) => m[1]));
for (const m of menu.matchAll(/data-tour-route="([^"]+)"/g)) routes.add(m[1]);

console.log('\n1. la barre latérale');
if (routes.size < 5) fail(`seulement ${routes.size} route(s) trouvée(s) — le sélecteur ne suit plus la mise en page`);
else pass(`${routes.size} éléments de menu de premier niveau`);

// --- 2. NAV_DESC : une copie dédiée par élément de menu.
const tour = read('src/components/SofiaTour.tsx');
const block = tour.slice(tour.indexOf('const NAV_DESC'), tour.indexOf('const PAD'));
const navDesc = new Map([...block.matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));

console.log('\n2. couverture de la visite');
const uncovered = [...routes].filter((r) => !navDesc.has(r));
if (uncovered.length) fail(`sans copie dédiée, donc texte générique : ${uncovered.join(', ')}`);
else pass(`les ${routes.size} éléments de menu ont leur propre copie`);

// --- 3. Chaque clé de NAV_DESC existe VRAIMENT, dans les deux langues.
const en = JSON.parse(read('src/i18n/en.json'));
const fr = JSON.parse(read('src/i18n/fr.json'));
const get = (o, k) => k.split('.').reduce((a, p) => (a ? a[p] : undefined), o);

console.log('\n3. les clés de la visite se résolvent');
let broken = 0;
for (const [route, key] of navDesc) {
  const e = get(en, key);
  const f = get(fr, key);
  if (!e || !f) { broken += 1; fail(`${route} → ${key} (EN ${e ? 'ok' : 'MANQUE'}, FR ${f ? 'ok' : 'MANQUE'})`); }
}
if (!broken) pass(`${navDesc.size} clés présentes en anglais et en français`);

// --- 4. Divergence de clés entre les deux langues, sur TOUT le fichier.
//
// Une clé présente dans une seule langue ne casse rien à la compilation : elle s'affiche
// en clair à l'écran, dans l'autre langue, le jour où quelqu'un ouvre la page.
console.log('\n4. anglais et français portent les mêmes clés');
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (
  v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${p}${k}.`) : [`${p}${k}`]
));
const a = new Set(flat(en));
const b = new Set(flat(fr));
const onlyEn = [...a].filter((k) => !b.has(k));
const onlyFr = [...b].filter((k) => !a.has(k));
if (onlyEn.length) fail(`${onlyEn.length} clé(s) en anglais seulement : ${onlyEn.slice(0, 5).join(', ')}${onlyEn.length > 5 ? '…' : ''}`);
if (onlyFr.length) fail(`${onlyFr.length} clé(s) en français seulement : ${onlyFr.slice(0, 5).join(', ')}${onlyFr.length > 5 ? '…' : ''}`);
if (!onlyEn.length && !onlyFr.length) pass(`${a.size} clés de chaque côté, aucune divergence`);

console.log(failures === 0 ? '\nTOUT PASSE\n' : `\n${failures} PROBLÈME(S)\n`);
process.exit(failures === 0 ? 0 : 1);
