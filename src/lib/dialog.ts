// In-app replacement for the browser's native confirm()/alert() dialogs.
//
// Usage (drop-in for the native calls):
//   import { dialog } from '../../lib/dialog';
//   if (!(await dialog.confirm('Delete this?'))) return;   // returns Promise<boolean>
//   dialog.alert('Saved.');                                 // fire-and-forget, styled toast-modal
//
// A single <DialogHost /> mounted at the app root subscribes to this service and
// renders one dialog at a time (extra requests queue). Labels/title fall back to
// i18n defaults inside the host when not provided here.

export type DialogKind = 'confirm' | 'alert';

export interface DialogOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;        // red confirm button (destructive action)
}

export interface DialogRequest extends DialogOptions {
  id: number;
  kind: DialogKind;
  message: string;
  resolve: (value: boolean) => void;
}

type Listener = (queue: DialogRequest[]) => void;

let queue: DialogRequest[] = [];
let listeners: Listener[] = [];
let seq = 1;

const emit = () => { const snap = [...queue]; listeners.forEach((l) => l(snap)); };

export function subscribe(l: Listener): () => void {
  listeners.push(l);
  l([...queue]);
  return () => { listeners = listeners.filter((x) => x !== l); };
}

function push(kind: DialogKind, message: string, opts?: DialogOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    queue.push({ id: seq++, kind, message: String(message ?? ''), resolve, ...(opts || {}) });
    emit();
  });
}

// Called by the host when the user answers the front-most dialog.
export function answer(id: number, value: boolean): void {
  const idx = queue.findIndex((q) => q.id === id);
  if (idx === -1) return;
  const [req] = queue.splice(idx, 1);
  req.resolve(value);
  emit();
}

export const dialog = {
  confirm: (message: string, opts?: DialogOptions): Promise<boolean> => push('confirm', message, opts),
  alert: (message: string, opts?: DialogOptions): void => { void push('alert', message, opts); },
};
