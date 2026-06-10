import React from 'react';
import { useTranslation } from 'react-i18next';

export interface PayStubLine {
  invoice_number: string;
  customer: string | null;
  paid_amount: number;
  app_commission: number | null;
}
export interface PayStubBonus {
  bonus_type: string;
  merchant_name: string | null;
  amount: number;
}
export interface PayStubData {
  repName: string;
  period: string;            // 'YYYY-MM'
  subtitle?: string;         // filename (imported) — optional
  lines: PayStubLine[];
  bonuses: PayStubBonus[];
  total: number;
  source: 'imported' | 'generated';
  linesStored: boolean;      // false → invoice breakdown is reconstructed (old import)
}

// Shared pay-stub detail modal — used by the admin import history AND the rep-facing
// Commission Report. Display-only, EXCEPT the optional commit action (Étape 3): when onCommit is
// provided and the stub is app-generated, a "Mark this period paid" button is shown.
const PayStubModal: React.FC<{
  data: PayStubData | null;
  onClose: () => void;
  onCommit?: () => void;     // only wired by Commission Report for admins (report:mark_paid)
  committing?: boolean;
}> = ({ data, onClose, onCommit, committing }) => {
  const { t, i18n } = useTranslation();
  if (!data) return null;

  const fmt = (val: number) =>
    val.toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', {
      style: 'currency', currency: 'CAD', minimumFractionDigits: 2,
    });

  const tp = (k: string) => t(`commissionReport.payStub.${k}`);

  const printStub = () => {
    const linesHtml = data.lines
      .map(l => `<tr><td>${l.invoice_number}</td><td>${l.customer || ''}</td><td class="r">${fmt(l.paid_amount)}</td></tr>`)
      .join('');
    const bonusHtml = data.bonuses
      .map(b => `<tr><td>${b.bonus_type}</td><td>${b.merchant_name || ''}</td><td class="r">${fmt(b.amount)}</td></tr>`)
      .join('');
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) return;
    w.document.write(`<html><head><title>${tp('title')} - ${data.repName} - ${data.period}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;padding:36px;color:#1c2434}h1{font-size:20px;margin:0}h2{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:22px 0 4px}p.m{color:#64748b;margin:4px 0 0}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}th{background:#f7f9fc}.r{text-align:right}.tot{margin-top:18px;text-align:right;font-size:18px;font-weight:bold}</style>
      </head><body>
      <h1>${tp('title')} — ${data.repName}</h1>
      <p class="m">${tp('period')}: ${data.period}${data.subtitle ? ' · ' + data.subtitle : ''}</p>
      <h2>${tp('commissions')} (${data.lines.length})</h2>
      <table><thead><tr><th>${tp('invoice')}</th><th>${tp('customer')}</th><th class="r">${tp('amount')}</th></tr></thead><tbody>${linesHtml || '<tr><td colspan="3">—</td></tr>'}</tbody></table>
      ${data.bonuses.length ? `<h2>${tp('bonuses')} (${data.bonuses.length})</h2><table><thead><tr><th>${tp('type')}</th><th>${tp('merchant')}</th><th class="r">${tp('amount')}</th></tr></thead><tbody>${bonusHtml}</tbody></table>` : ''}
      <p class="tot">${tp('totalPaid')}: ${fmt(data.total)}</p>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 p-4 sm:p-8" onClick={onClose}>
      {/* flex-col + inner scroll area: the header (and the corner ✕) stay visible while the body scrolls */}
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
        {/* Close button pinned to the popup's own corner */}
        <button
          onClick={onClose}
          title={tp('close') as string}
          className="absolute -right-3 -top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-stroke bg-white text-body shadow-lg transition hover:text-danger dark:border-strokedark dark:bg-boxdark dark:text-bodydark"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="flex items-start justify-between gap-3 border-b border-stroke px-6 py-4 dark:border-strokedark">
          <div>
            <h3 className="text-lg font-semibold text-black dark:text-white">{tp('title')} — {data.repName}</h3>
            <p className="text-sm text-body">
              {tp('period')}: {data.period}{data.subtitle ? ` · ${data.subtitle}` : ''}
            </p>
            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
              data.source === 'imported' ? 'bg-primary bg-opacity-10 text-primary' : 'bg-success bg-opacity-10 text-success'
            }`}>
              {data.source === 'imported' ? tp('sourceImported') : tp('sourceGenerated')}
            </span>
          </div>
          <button onClick={printStub} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90">
            {tp('print')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {/* Banner: invoice breakdown reconstructed (old import without stored lines) */}
          {data.source === 'imported' && !data.linesStored && (
            <div className="mb-4 rounded-md border border-warning border-opacity-40 bg-warning bg-opacity-10 px-4 py-3 text-xs text-black dark:text-white">
              ⚠ {tp('reconstructedBanner')}
            </div>
          )}

          {data.lines.length === 0 && data.bonuses.length === 0 ? (
            <p className="py-6 text-center text-sm text-body">{tp('noData')}</p>
          ) : (
            <>
              {/* Commission lines */}
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-body">{tp('commissions')} ({data.lines.length})</p>
              <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
                <table className="w-full text-sm">
                  <thead className="bg-gray-2 dark:bg-meta-4">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">{tp('invoice')}</th>
                      <th className="px-3 py-2 text-left font-medium">{tp('customer')}</th>
                      <th className="px-3 py-2 text-right font-medium">{tp('amount')}</th>
                      {data.source === 'imported' && <th className="px-3 py-2 text-right font-medium">{tp('appCalc')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.length === 0 ? (
                      <tr><td colSpan={data.source === 'imported' ? 4 : 3} className="px-3 py-3 text-center text-body">—</td></tr>
                    ) : data.lines.map((l) => {
                      const diff = l.app_commission != null && Math.abs(l.app_commission - l.paid_amount) > 0.01;
                      return (
                        <tr key={l.invoice_number} className="border-t border-stroke dark:border-strokedark">
                          <td className="px-3 py-2 font-medium text-primary">{l.invoice_number}</td>
                          <td className="px-3 py-2 text-black dark:text-white">{l.customer || '—'}</td>
                          <td className="px-3 py-2 text-right font-semibold text-black dark:text-white">{fmt(l.paid_amount)}</td>
                          {data.source === 'imported' && (
                            <td className={`px-3 py-2 text-right ${diff ? 'font-medium text-danger' : 'text-body'}`}>
                              {l.app_commission == null ? '—' : fmt(l.app_commission)}{diff ? ' ⚠' : ''}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bonuses */}
              {data.bonuses.length > 0 && (
                <>
                  <p className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-body">{tp('bonuses')} ({data.bonuses.length})</p>
                  <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-2 dark:bg-meta-4">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">{tp('type')}</th>
                          <th className="px-3 py-2 text-left font-medium">{tp('merchant')}</th>
                          <th className="px-3 py-2 text-right font-medium">{tp('amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.bonuses.map((b, i) => (
                          <tr key={i} className="border-t border-stroke dark:border-strokedark">
                            <td className="px-3 py-2 capitalize text-black dark:text-white">{b.bonus_type}</td>
                            <td className="px-3 py-2 text-black dark:text-white">{b.merchant_name || '—'}</td>
                            <td className="px-3 py-2 text-right font-semibold text-success">{fmt(b.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Total */}
              <div className="mt-5 flex items-center justify-between rounded-md bg-gray-2 px-4 py-3 dark:bg-meta-4">
                <span className="font-semibold text-black dark:text-white">{tp('totalPaid')}</span>
                <span className="text-xl font-bold text-primary">{fmt(data.total)}</span>
              </div>
              <p className="mt-2 text-xs text-body">
                {data.source === 'imported' ? tp('discrepancyHint') : tp('generatedHint')}
              </p>

              {/* Commit action — only for app-generated stubs, only when the parent wires it. */}
              {onCommit && data.source === 'generated' && (data.lines.length > 0 || data.bonuses.length > 0) && (
                <button
                  onClick={onCommit}
                  disabled={committing}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-success px-5 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50"
                >
                  {committing ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {tp('committing')}
                    </>
                  ) : tp('commit')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayStubModal;
