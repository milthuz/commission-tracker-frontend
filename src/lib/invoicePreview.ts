// In-app service to open the shared invoice-preview modal (InvoicePreviewHost) from anywhere in
// the app, without every page needing its own modal state/JSX. Mirrors the dialog.ts pub-sub
// pattern: one host mounted at the app root, everyone else just calls openInvoicePreview(number).
//
// Usage:
//   import { openInvoicePreview } from '../lib/invoicePreview';
//   openInvoicePreview('INV-012345');
// Or use the <InvoiceLink number={...} /> component for a ready-made clickable cell.

type Listener = (number: string | null) => void;

let current: string | null = null;
let listeners: Listener[] = [];

export function subscribe(l: Listener): () => void {
  listeners.push(l);
  l(current);
  return () => { listeners = listeners.filter((x) => x !== l); };
}

export function openInvoicePreview(number: string): void {
  current = number;
  listeners.forEach((l) => l(current));
}

export function closeInvoicePreview(): void {
  current = null;
  listeners.forEach((l) => l(current));
}
