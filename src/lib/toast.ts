// Brief success notification, bottom-right, 4 s (planche « Onglets, filtres et messages »).
//
//   toast.success(t('leads.detail.acceptedOk'));
//   toast.success(t('…'), { actionLabel: t('common.cancel'), onAction: undo });
//
// For SUCCESS only. An error stays in the page, with its cause and « Réessayer »:
// use <InlineError>, never a toast that disappears before it is read.
// Rendered by <ToastHost />, mounted once in App.tsx.

export interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

type Listener = (items: ToastItem[]) => void;
let items: ToastItem[] = [];
let listeners: Listener[] = [];
let seq = 1;
const emit = () => { const snap = [...items]; listeners.forEach((l) => l(snap)); };

export function subscribeToasts(l: Listener): () => void {
  listeners.push(l);
  l([...items]);
  return () => { listeners = listeners.filter((x) => x !== l); };
}

export function dismissToast(id: number) {
  items = items.filter((x) => x.id !== id);
  emit();
}

export const toast = {
  success(message: string, opts?: { actionLabel?: string; onAction?: () => void; durationMs?: number }) {
    const id = seq++;
    items = [...items.slice(-2), { id, message, actionLabel: opts?.actionLabel, onAction: opts?.onAction }];
    emit();
    setTimeout(() => dismissToast(id), opts?.durationMs ?? 4000);
    return id;
  },
};
