// File d'envoi des check-ins : un check-in fait sans réseau attend dans le téléphone et part au
// retour du réseau. Chaque check-in porte son identifiant (généré sur le téléphone), donc un
// envoi répété est sans danger : le serveur ignore ce qu'il a déjà reçu.
//
// localStorage peut être indisponible (navigation privée, stockage plein) : tout accès est
// protégé, et la file vit alors en mémoire le temps de la session.

import { api, ApiError, type CheckinInput } from '../api';

const KEY = 'opener_outbox_v1';
const DRAFT_PREFIX = 'opener_checkin_draft_';
interface Item { kind: 'checkin'; payload: CheckinInput; tries: number; lastError?: string }

let memory: Item[] = [];
const listeners = new Set<() => void>();

function read(): Item[] {
  try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : memory; } catch { return memory; }
}
function write(items: Item[]) {
  memory = items;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* mémoire seulement */ }
  listeners.forEach((l) => l());
}

export const pending = () => read();
export const onOutboxChange = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function enqueueCheckin(payload: CheckinInput) {
  const items = read().filter((i) => i.payload.id !== payload.id);
  write([...items, { kind: 'checkin', payload, tries: 0 }]);
}

let flushing: Promise<{ sent: number; failed: number }> | null = null;
export function flush(): Promise<{ sent: number; failed: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0, failed = 0;
    for (const item of read()) {
      try {
        await api('/api/opener/checkins', { method: 'POST', body: item.payload });
        write(read().filter((i) => i.payload.id !== item.payload.id));
        sent++;
      } catch (e) {
        const err = e as ApiError;
        // Refus définitif du serveur (données invalides) : on retire l'élément pour ne pas
        // bloquer la file, en gardant la trace de l'erreur. Réseau ou serveur indisponible : on garde.
        if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
          write(read().filter((i) => i.payload.id !== item.payload.id));
          failed++;
        } else {
          write(read().map((i) => (i.payload.id === item.payload.id ? { ...i, tries: i.tries + 1, lastError: err?.message } : i)));
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
