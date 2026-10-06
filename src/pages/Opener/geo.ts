// Géométrie et suggestion de routes (côté navigateur, aucun appel payant).

export type LatLng = [number, number];

export const haversine = (a: LatLng, b: LatLng) => {
  const R = 6371000, rad = (d: number) => (d * Math.PI) / 180;
  const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
};
export const pathM = (pts: LatLng[]) => pts.reduce((s, p, i) => (i ? s + haversine(pts[i - 1], p) : 0), 0);

// Ordre de visite : plus proche voisin depuis le premier point, puis 2-opt (chemin ouvert).
export function optimize(points: LatLng[]): number[] {
  const n = points.length;
  if (n < 3) return points.map((_, i) => i);
  const d = (i: number, j: number) => haversine(points[i], points[j]);
  const left = new Set(points.map((_, i) => i));
  let cur = 0; left.delete(0);
  const order = [0];
  while (left.size) {
    let best = -1;
    left.forEach((i) => { if (best < 0 || d(cur, i) < d(cur, best)) best = i; });
    order.push(best); left.delete(best); cur = best;
  }
  let improved = true;
  for (let pass = 0; improved && pass < 50; pass++) {
    improved = false;
    for (let i = 0; i < n - 2; i++) for (let k = i + 1; k < n - 1; k++) {
      const a = order[i], b = order[i + 1], c = order[k], e = order[k + 1];
      if (d(a, c) + d(b, e) < d(a, b) + d(c, e) - 0.5) { order.splice(i + 1, k - i, ...order.slice(i + 1, k + 1).reverse()); improved = true; }
    }
  }
  return order;
}

// Enveloppe convexe (chaîne monotone d'Andrew), pour dessiner la zone d'une route suggérée.
export function convexHull(pts: LatLng[]): LatLng[] {
  const p = [...pts].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (p.length < 3) return p;
  const cross = (o: LatLng, a: LatLng, b: LatLng) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
  const lower: LatLng[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper: LatLng[] = [];
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// Polygone (cercle approché) autour d'un point : la zone « autour d'une adresse ».
export function circlePolygon(center: LatLng, radiusM: number, sides = 20): LatLng[] {
  const out: LatLng[] = [];
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((center[0] * Math.PI) / 180));
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides;
    out.push([center[0] + dLat * Math.sin(a), center[1] + dLng * Math.cos(a)]);
  }
  return out;
}

// Catégorie d'un établissement, d'après son type principal Google.
export type PlaceKind = 'restaurant' | 'cafe' | 'bar' | 'bakery' | 'takeout' | 'other';
export function kindOf(primaryType: string | null | undefined): PlaceKind {
  const t = String(primaryType || '').toLowerCase();
  if (/fast_food|meal_takeaway|meal_delivery/.test(t)) return 'takeout';
  if (/bakery|pastry|dessert|donut|ice_cream|confectioner|chocolate/.test(t)) return 'bakery';
  if (/cafe|coffee|tea_house|juice/.test(t)) return 'cafe';
  if (/(^|_)bar($|_)|pub|night_club|wine|brewery|lounge/.test(t)) return 'bar';
  if (/restaurant|diner|food_court|steak|sushi|pizza|brunch|bistro/.test(t)) return 'restaurant';
  return 'other';
}

// ---------------------------------------------------------------------------
// Suggestion de routes
//
// Les restaurants retenus (par les filtres) sont découpés en routes compactes qui tiennent dans
// le temps disponible : marche (vitesse fixe) + un temps fixe par arrêt.
//   1. Graine : le restaurant restant qui a le plus de voisins à moins de 250 m (on commence
//      par les secteurs denses : plus d'arrêts par heure).
//   2. Croissance : on ajoute le plus proche du DERNIER arrêt tant que le temps le permet ET qu'il
//      est à moins de 500 m : au-delà, la route ne traverse pas un trou pour aller attaquer le
//      quartier suivant — celui-ci devient une autre route.
//   3. Ordre final : 2-opt (ne fait que raccourcir).
// Une route de moins de 3 arrêts, après la première, n'est pas proposée : le secteur est trop
// clairsemé pour valoir une journée.
// ---------------------------------------------------------------------------
export interface Candidate { placeId: string; lat: number; lng: number }
export interface Suggestion<T extends Candidate> { stops: T[]; meters: number; minutes: number; hull: LatLng[] }

export function suggestRoutes<T extends Candidate>(cands: T[], opts: { minutes: number; stopMin: number; speed?: number; maxRoutes?: number; maxGapM?: number }): Suggestion<T>[] {
  const speed = opts.speed ?? 80;             // m/min, ~4,8 km/h
  const maxGap = opts.maxGapM ?? 500;
  const maxRoutes = opts.maxRoutes ?? 8;
  let rest = cands.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  const pos = (c: T): LatLng => [c.lat, c.lng];
  const out: Suggestion<T>[] = [];
  while (rest.length && out.length < maxRoutes) {
    let seed = rest[0], best = -1;
    for (const c of rest) {
      let n = 0;
      for (const o of rest) if (o !== c && haversine(pos(c), pos(o)) <= 250) n++;
      if (n > best) { best = n; seed = c; }
    }
    const route = [seed];
    let used = opts.stopMin;
    let cur = seed;
    const left = new Set(rest.filter((c) => c !== seed));
    for (;;) {
      let next: T | null = null, nd = Infinity;
      left.forEach((c) => { const d = haversine(pos(cur), pos(c)); if (d < nd) { nd = d; next = c; } });
      if (!next || nd > maxGap) break;
      const cost = nd / speed + opts.stopMin;
      if (used + cost > opts.minutes) break;
      route.push(next); used += cost; left.delete(next); cur = next;
    }
    if (route.length < 3 && out.length > 0) break;
    const order = optimize(route.map(pos));
    const stops = order.map((i) => route[i]);
    const meters = pathM(stops.map(pos));
    out.push({ stops, meters, minutes: Math.round(meters / speed + stops.length * opts.stopMin), hull: convexHull(stops.map(pos)) });
    const taken = new Set(route);
    rest = rest.filter((c) => !taken.has(c));
  }
  return out;
}
