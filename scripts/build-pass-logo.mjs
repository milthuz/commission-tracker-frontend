#!/usr/bin/env node
/**
 * Exporte les fichiers du logo de La Passe depuis LA MEME geometrie que le composant React.
 *
 *     node scripts/build-pass-logo.mjs
 *
 * Pourquoi un script plutot que des fichiers dessines a la main : le symbole vit dans
 * `PASS_MARK_GEOMETRY` (src/pages/Pass/passUi.tsx) parce que c'est lui que l'application
 * affiche. Des SVG autonomes recopies a cote auraient diverge des la premiere retouche, et
 * la divergence se serait vue dans les courriels avant de se voir dans le code.
 *
 * Produit dans `public/brand/` :
 *   pass-mark-on-dark.svg     symbole blanc + accent orange (fonds sombres)
 *   pass-mark-on-light.svg    symbole encre + accent orange (fonds clairs)
 *   pass-mark-compact-*.svg   version reduite, sans lignes interieures (< 24 px)
 *
 * Les SVG servent au transfert vers le designer et aux usages web. Pour les COURRIELS il
 * faut du PNG — la plupart des clients de messagerie refusent le SVG — genere separement.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../src/pages/Pass/passUi.tsx');
const OUT = resolve(here, '../public/brand');

// On lit la geometrie dans le source plutot que de l'importer : passUi.tsx est du TSX avec
// des imports React et d'images, que Node ne sait pas charger tel quel.
const src = readFileSync(SRC, 'utf8');
const grab = (key) => {
  const m = src.match(new RegExp(`${key}:\\s*\\n?\\s*'([^']+)'`));
  if (!m) throw new Error(`geometrie introuvable dans passUi.tsx : ${key}`);
  return m[1];
};
const grabNum = (key) => {
  const m = src.match(new RegExp(`${key}:\\s*([\\d.]+)`));
  if (!m) throw new Error(`geometrie introuvable dans passUi.tsx : ${key}`);
  return Number(m[1]);
};

const g = {
  viewBox: grab('viewBox'),
  outlineDetailed: grab('outlineDetailed'),
  outlineCompact: grab('outlineCompact'),
  lineAccent: grab('lineAccent'),
  lineMuted: grab('lineMuted'),
  strokeDetailed: grabNum('strokeDetailed'),
  strokeCompact: grabNum('strokeCompact'),
  accent: grab('accent'),
};

const INK = { dark: '#FFFFFF', light: '#141414' };

function svg({ surface, compact }) {
  const ink = INK[surface];
  const outline = compact ? g.outlineCompact : g.outlineDetailed;
  const w = compact ? g.strokeCompact : g.strokeDetailed;
  const inner = compact
    ? ''
    : `\n  <path d="${g.lineAccent}" stroke="${g.accent}" stroke-width="${g.strokeDetailed}" stroke-linecap="round"/>` +
      `\n  <path d="${g.lineMuted}" stroke="${ink}" stroke-width="${g.strokeDetailed}" stroke-linecap="round" opacity="0.38"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g.viewBox}" width="64" height="64" fill="none" role="img" aria-label="La Passe">
  <path d="${outline}" stroke="${ink}" stroke-width="${w}" stroke-linejoin="round"/>${inner}
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
const files = [
  ['pass-mark-on-dark.svg', { surface: 'dark', compact: false }],
  ['pass-mark-on-light.svg', { surface: 'light', compact: false }],
  ['pass-mark-compact-on-dark.svg', { surface: 'dark', compact: true }],
  ['pass-mark-compact-on-light.svg', { surface: 'light', compact: true }],
];
for (const [name, opts] of files) {
  writeFileSync(resolve(OUT, name), svg(opts), 'utf8');
  console.log('ecrit  public/brand/' + name);
}
console.log('\n%d fichiers, geometrie lue depuis passUi.tsx', files.length);
