// File d'envoi de l'application terrain : un check-in ou une piste faits sans réseau attendent
// dans le téléphone et partent au retour du réseau, DANS L'ORDRE (le check-in d'une visite part
// avant la piste qui s'y rattache). Chaque élément porte son identifiant généré sur le téléphone
// (check-in : `id` ; piste : `clientRef`), donc un envoi répété est sans danger : le serveur
// ignore ce qu'il a déjà reçu.
//
// Pistes hors ligne (audit UX, P2) : avant, créer une piste exigeait du réseau. La vérification
// des doublons se fait maintenant à l'arrivée sur le serveur, comme pour une piste saisie en ligne.
//
// Refus définitif du serveur (4xx) : un check-in est retiré pour ne pas bloquer la file (comme
// avant) ; une PISTE, elle, reste dans la file, marquée bloquée avec la raison — on ne jette pas
// en silence une fiche que l'opener a tapée. Le bandeau de l'application la montre, avec
// « Réessayer ».
//
// localStorage peut être indisponible (navigation privée, stockage plein) : tout accès est
// protégé, et la file vit alors en mémoire le temps de la session.

import { api, ApiError, type CheckinInput } from '../api';

const KEY = 'opener_outbox_v1';
const DRAFT_PREFIX = 'opener_checkin_draft_';
export type LeadInput = Record<string, unknown> & { clientRef: string; businessName: string };
type Item =
  | { kind: 'checkin'; payload: CheckinInput; tries: number; lastError?: string; blocked?: boolean }
  | { kind: 'lead'; payload: LeadInput; tries: number; lastError?: string; blocked?: boolean };

let memory: Item[] = [];
const listeners = new Set<() => void>();

const keyOf = (i: Item) => (i.kind === 'lead' ? `lead:${i.payload.clientRef}` : `checkin:${i.payload.id}`);

function read(): Item[] {
  try {
    const v = localStorage.getItem(KEY);
    // Files écrites avant l'ajout des pistes : leurs éléments n'ont pas toujours de `kind`.
    return v ? (JSON.parse(v) as Item[]).map((i) => ({ ...i, kind: i.kind || 'checkin' }) as Item) : memory;
  } catch { return memory; }
}
function write(items: Item[]) {
  memory = items;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* mémoire seulement */ }
  listeners.forEach((l) => l());
}

export const pending = () => read();
/** Leads the server refused: they wait for « Réessayer » instead of being dropped. */
export const blocked = () => read().filter((i) => i.blocked && i.kind === 'lead') as Extract<Item, { kind: 'lead' }>[];
export const onOutboxChange = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function enqueueCheckin(payload: CheckinInput) {
  const items = read().filter((i) => keyOf(i) !== `checkin:${payload.id}`);
  write([...items, { kind: 'checkin', payload, tries: 0 }]);
}

export function enqueueLead(payload: LeadInput) {
  const items = read().filter((i) => keyOf(i) !== `lead:${payload.clientRef}`);
  write([...items, { kind: 'lead', payload, tries: 0 }]);
}

/** Puts refused leads back in line (after the opener fixed the network or the data). */
export function retryBlocked() {
  write(read().map((i) => (i.blocked ? { ...i, blocked: false } : i)));
  return flush();
}

let flushing: Promise<{ sent: number; failed: number }> | null = null;
export function flush(): Promise<{ sent: number; failed: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0, failed = 0;
    for (const item of read()) {
      if (item.blocked) continue;
      const key = keyOf(item);
      try {
        if (item.kind === 'lead') await api('/api/opener/leads', { method: 'POST', body: item.payload });
        else await api('/api/opener/checkins', { method: 'POST', body: item.payload });
        write(read().filter((i) => keyOf(i) !== key));
        sent++;
      } catch (e) {
        const err = e as ApiError;
        const refused = err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
        if (refused && item.kind === 'checkin') {
          // Données invalides : on retire l'élément pour ne pas bloquer la file.
          write(read().filter((i) => keyOf(i) !== key));
          failed++;
        } else {
          write(read().map((i) => (keyOf(i) === key ? { ...i, tries: i.tries + 1, lastError: err?.message, blocked: refused } : i)));
          if (refused) failed++;
        }
      }
    }
    return { sent, failed };
  })().finally(() => { flushing = null; });
  return flushing;
}

// Brouillon du check-in en cours, par arrêt : rien n'est perdu si l'écran se ferme.
export function loadDraft<T>(stopKey: string): T | null {
  try { const v = localStorage.getItem(DRAFT_PREFIX + stopKey); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function saveDraft(stopKey: string, value: unknown) {
  try { localStorage.setItem(DRAFT_PREFIX + stopKey, JSON.stringify(value)); } catch { /* sans brouillon */ }
}
export function clearDraft(stopKey: string) {
  try { localStorage.removeItem(DRAFT_PREFIX + stopKey); } catch { /* rien */ }
}
