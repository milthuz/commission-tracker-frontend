// Tests de la géométrie et de la suggestion de routes du module Opener (src/pages/Opener/geo.ts).
//   npm run test:opener
// Le fichier TypeScript est compilé à la volée par esbuild (déjà présent avec Vite).
const assert = require('assert');
const os = require('os');
const path = require('path');
const { buildSync } = require('esbuild');

const out = path.join(os.tmpdir(), `opener-geo-${process.pid}.cjs`);
buildSync({ entryPoints: [path.join(__dirname, '../src/pages/Opener/geo.ts')], outfile: out, format: 'cjs', bundle: true, logLevel: 'error' });
const G = require(out);

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };
// Deux quartiers denses à ~2 km l'un de l'autre (30 restaurants chacun) + 3 isolés.
const mk = (lat0, lng0, k, tag) => Array.from({ length: k }, (_, i) => ({ placeId: `${tag}${i}`, lat: lat0 + (i % 6) * 0.0006, lng: lng0 + Math.floor(i / 6) * 0.0008 }));
const A = mk(45.520, -73.590, 30, 'A'), B = mk(45.540, -73.590, 30, 'B');
const iso = [{ placeId: 'X1', lat: 45.60, lng: -73.40 }, { placeId: 'X2', lat: 45.62, lng: -73.38 }, { placeId: 'X3', lat: 45.48, lng: -73.80 }];

t('chaque route tient dans le temps disponible', () => {
  const s = G.suggestRoutes([...A, ...B, ...iso], { minutes: 180, stopMin: 12 });
  assert.ok(s.length >= 2);
  for (const r of s) assert.ok(r.minutes <= 181, `${r.minutes} min`);
});
t('une route ne traverse pas un trou pour attaquer le quartier suivant', () => {
  const s = G.suggestRoutes([...A, ...B], { minutes: 600, stopMin: 12 });
  for (const r of s) assert.strictEqual(new Set(r.stops.map((x) => x.placeId[0])).size, 1);
});
t('aucun restaurant dans deux routes', () => {
  const all = G.suggestRoutes([...A, ...B, ...iso], { minutes: 120, stopMin: 10 }).flatMap((r) => r.stops.map((x) => x.placeId));
  assert.strictEqual(all.length, new Set(all).size);
});
t('des isolés ne font pas une route à eux seuls', () => {
  const s = G.suggestRoutes([...A, ...iso], { minutes: 1000, stopMin: 12 });
  assert.ok(!s.slice(1).some((r) => r.stops.length < 3));
});
t('plus de temps → plus d\'arrêts', () => {
  assert.ok(G.suggestRoutes(A, { minutes: 300, stopMin: 12 })[0].stops.length > G.suggestRoutes(A, { minutes: 90, stopMin: 12 })[0].stops.length);
});
t('types Google → catégories', () => {
  assert.strictEqual(G.kindOf('sushi_restaurant'), 'restaurant');
  assert.strictEqual(G.kindOf('fast_food_restaurant'), 'takeout');
  assert.strictEqual(G.kindOf('coffee_shop'), 'cafe');
  assert.strictEqual(G.kindOf('bar_and_grill'), 'bar');
  assert.strictEqual(G.kindOf('bakery'), 'bakery');
  assert.strictEqual(G.kindOf('barber_shop'), 'other');
});
t('cercle autour d\'une adresse : rayon respecté', () => {
  for (const q of G.circlePolygon([45.52, -73.58], 800)) assert.ok(Math.abs(G.haversine([45.52, -73.58], q) - 800) < 5);
});
console.log(`opener geo : ${n} tests OK`);
