// Check-in LIBRE (2026-10-16) : le restaurant choisi autour de soi (ou par nom), sans route.
// Gardé le temps de la visite (sessionStorage, protégé) pour que le check-in et la piste le
// retrouvent après un rechargement de la page.
import type { PlaceStatus, Version } from '../api';

export interface FreePlace {
  placeId: string; name: string; address: string; lat: number | null; lng: number | null;
  status: PlaceStatus; version?: Version | null; franchise?: boolean; brand?: string | null;
  competitorPos?: string | null; lastVisitAt?: string | null; distanceM?: number | null;
}

const KEY = 'opener_free_place_';
const memory = new Map<string, FreePlace>();

export function saveFreePlace(p: FreePlace) {
  memory.set(p.placeId, p);
  try { sessionStorage.setItem(KEY + p.placeId, JSON.stringify(p)); } catch { /* mémoire seulement */ }
}
export function loadFreePlace(placeId: string | undefined): FreePlace | null {
  if (!placeId) return null;
  if (memory.has(placeId)) return memory.get(placeId)!;
  try { const v = sessionStorage.getItem(KEY + placeId); return v ? JSON.parse(v) : null; } catch { return null; }
}
