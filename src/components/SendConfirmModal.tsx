import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface SendConfirmAccount {
  merchant_name: string;
  amount: number;
}

export interface SendConfirmRow {
  rep: string;
  total: number;
  note?: string;
  accounts?: SendConfirmAccount[];
}

interface SendConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
  title: string;
  subtitle?: string;
  rows: SendConfirmRow[];
  grandTotal: number;
  recipients: string[];
  confirmLabel: string;
  fmt: (n: number) => string;
  accent?: 'primary' | 'warning';
}

// Final on-screen checkpoint before an email send fires — restates exactly who gets paid what,
// replacing the old plain-text confirm() popup so admins can catch a mistake before it's sent.
const SendConfirmModal: React.FC<SendConfirmModalProps> = ({
  open, onClose, onConfirm, confirming, title, subtitle, rows, grandTotal, recipients, confirmLabel, fmt, accent = 'primary',
}) => {
  const { t } = useTranslation();
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
  if (!open) return null;
  const accentText = accent === 'warning' ? 'text-warning' : 'text-primary';
  const accentBg = accent === 'warning' ? 'bg-warning' : 'bg-primary';

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !confirming && onClose()} />
      <div role="dialog" aria-modal="true"
        className="relative w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-2xl dark:border-strokedark dark:bg-boxdark">
        <h3 className="text-base font-semibold text-black dark:text-white">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-body dark:text-gray-300">{subtitle}</p>}

        <div className="mt-4 max-h-64 overflow-y-auto rounded border border-stroke dark:border-strokedark">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-2 dark:bg-meta-4">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('admin.commissionImport.sendConfirm.rep')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('admin.commissionImport.sendConfirm.total')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const hasAccounts = !!r.accounts?.length;
                const open = expandedRep === r.rep;
                return (
                  <React.Fragment key={r.rep}>
                    <tr
                      onClick={hasAccounts ? () => setExpandedRep(open ? null : r.rep) : undefined}
                      className={`border-t border-stroke dark:border-strokedark ${hasAccounts ? 'cursor-pointer hover:bg-gray-1 dark:hover:bg-meta-4/40' : ''}`}
                    >
                      <td className="px-3 py-2 text-black dark:text-white">
                        <span className="inline-flex items-center gap-1.5">
                          {hasAccounts && (
                            <svg className={`h-3 w-3 text-body transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          )}
                          {r.rep}
                        </span>
                        {r.note && <span className="ml-2 text-xs text-body">{r.note}</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-black dark:text-white">{fmt(r.total)}</td>
                    </tr>
                    {open && hasAccounts && (
                      <tr className="border-t border-stroke bg-gray-1 dark:border-strokedark dark:bg-meta-4/20">
                        <td colSpan={2} className="px-3 py-2">
                          <table className="w-full text-xs">
                            <tbody>
                              {r.accounts!.map((a, i) => (
                                <tr key={i}>
                                  <td className="py-0.5 pl-5 text-body">{a.merchant_name}</td>
                                  <td className="py-0.5 text-right text-body">{fmt(a.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black dark:border-white">
                <td className="px-3 py-2 font-bold text-black dark:text-white">{t('admin.commissionImport.sendConfirm.grandTotal')}</td>
                <td className={`px-3 py-2 text-right font-bold ${accentText}`}>{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-3 text-xs text-body">
          <span className="font-semibold uppercase">{t('admin.commissionImport.sendConfirm.recipients')}:</span>{' '}
          {recipients.join(', ')}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} disabled={confirming}
            className="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-body transition hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:text-gray-300 dark:hover:bg-meta-4">
            {t('admin.commissionImport.sendConfirm.cancel')}
          </button>
          <button onClick={onConfirm} disabled={confirming} autoFocus
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:bg-opacity-90 disabled:opacity-50 ${accentBg}`}>
            {confirming ? t('admin.commissionImport.sendConfirm.sending') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendConfirmModal;
