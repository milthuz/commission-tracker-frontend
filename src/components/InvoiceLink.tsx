import { openInvoicePreview } from '../lib/invoicePreview';

// A Zoho invoice number rendered as a click-to-preview link — opens the shared
// InvoicePreviewHost modal (Details PDF + Activity tabs). Use this instead of plain text
// anywhere an invoice number is shown, for a consistent affordance across the app.
export default function InvoiceLink({
  number,
  className = 'font-medium text-primary hover:underline',
  fallback = '—',
}: {
  number?: string | null;
  className?: string;
  fallback?: string;
}) {
  if (!number) return <>{fallback}</>;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); openInvoicePreview(number); }} className={className}>
      {number}
    </button>
  );
}
