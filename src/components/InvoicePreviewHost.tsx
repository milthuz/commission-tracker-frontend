import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribe, closeInvoicePreview } from '../lib/invoicePreview';
import ActivityTimeline from './ActivityTimeline';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com';

// Single shared invoice-preview modal (Details PDF + Activity tabs), mounted once at the app
// root (DefaultLayout) so any page can open it via openInvoicePreview(number) — same Details/
// Activity pattern PayStubModal pioneered, now available everywhere an invoice number is shown.
export default function InvoicePreviewHost() {
  const { t } = useTranslation();
  const tp = (k: string) => t(`commissionReport.payStub.${k}`);
  const [num, setNum] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'details' | 'activity'>('details');

  useEffect(() => subscribe((n) => { setNum(n); setTab('details'); setLoading(true); }), []);

  if (!num) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black bg-opacity-60 p-4"
      onClick={(e) => { e.stopPropagation(); closeInvoicePreview(); }}>
      <div className="flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-boxdark"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stroke px-5 py-3 dark:border-strokedark">
          <div className="flex items-center gap-4">
            <p className="font-semibold text-black dark:text-white">{num}</p>
            <div className="flex gap-1 rounded-md bg-gray-2 p-0.5 dark:bg-meta-4">
              <button onClick={() => setTab('details')}
                className={`rounded px-3 py-1 text-xs font-medium transition ${tab === 'details' ? 'bg-white text-black shadow-sm dark:bg-boxdark dark:text-white' : 'text-body'}`}>
                {tp('invoiceDetails')}
              </button>
              <button onClick={() => setTab('activity')}
                className={`rounded px-3 py-1 text-xs font-medium transition ${tab === 'activity' ? 'bg-white text-black shadow-sm dark:bg-boxdark dark:text-white' : 'text-body'}`}>
                {tp('invoiceActivity')}
              </button>
            </div>
          </div>
          <button onClick={closeInvoicePreview} title={t('common.close') as string} className="text-body transition hover:text-danger">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="relative flex-1 overflow-y-auto bg-white dark:bg-boxdark">
          {tab === 'details' ? (
            <>
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-boxdark">
                  <span className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              )}
              <iframe
                src={`${API_URL}/api/invoices/${num}/preview?token=${localStorage.getItem('token')}`}
                className="h-full w-full border-0"
                title="Invoice preview"
                onLoad={() => setLoading(false)}
              />
            </>
          ) : (
            <ActivityTimeline entityType="invoice" entityId={num} />
          )}
        </div>
      </div>
    </div>
  );
}
