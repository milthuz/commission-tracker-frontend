import React from 'react';
import { useTranslation } from 'react-i18next';

export interface PayStubLine {
  invoice_number: string;
  customer: string | null;
  paid_amount: number;
  app_commission: number | null;
  not_in_db?: boolean;       // paid per the file but the invoice predates our DB (pre-2025)
}
export interface PayStubBonus {
  bonus_type: string;
  merchant_name: string | null;
  amount: number;
}
export interface PayStubMissed {
  invoice_number: string;
  customer: string | null;
  app_commission: number;
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
  missed?: PayStubMissed[];  // earned this period per the app but NOT paid (imported stubs)
  missedTotal?: number;
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

  // Branded, print-optimized pay-stub document (opens in a new window, auto-prints).
  const printStub = () => {
    const esc = (s: string | null | undefined) =>
      String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const locale = i18n.language === 'fr' ? 'fr-CA' : 'en-CA';
    const issued = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    const linesSum = data.lines.reduce((a, l) => a + l.paid_amount, 0);
    const bonusSum = data.bonuses.reduce((a, b) => a + b.amount, 0);
    const other = data.total - linesSum - bonusSum; // e.g. monthly bonus stored only in the import total
    const sourceLabel = data.source === 'imported'
      ? (data.subtitle ? esc(data.subtitle) : (tp('sourceImported') as string))
      : (tp('sourceGenerated') as string);

    const linesHtml = data.lines.map((l, i) => `
      <tr${i % 2 ? ' class="alt"' : ''}>
        <td class="mono">${esc(l.invoice_number)}</td>
        <td>${esc(l.customer) || '—'}${l.not_in_db ? ` <span class="pill">${tp('notInDb')}</span>` : ''}</td>
        <td class="num">${fmt(l.paid_amount)}</td>
      </tr>`).join('');
    const bonusHtml = data.bonuses.map((b, i) => `
      <tr${i % 2 ? ' class="alt"' : ''}>
        <td class="cap">${esc(b.bonus_type)}</td>
        <td>${esc(b.merchant_name) || '—'}</td>
        <td class="num">${fmt(b.amount)}</td>
      </tr>`).join('');

    const w = window.open('', '_blank', 'width=860,height=980');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${tp('title')} — ${esc(data.repName)} — ${esc(data.period)}</title>
<style>
  @page { margin: 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: 'Segoe UI', -apple-system, Arial, sans-serif; color: #1c2434; background: #fff; }
  .wrap { max-width: 740px; margin: 0 auto; }
  .accent { height: 6px; background: #f2682c; }
  .band { display: flex; justify-content: space-between; align-items: flex-end; background: #1c2434; color: #fff; padding: 26px 34px; }
  .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
  .brand small { display: block; font-size: 11px; font-weight: 400; color: #8a99af; letter-spacing: .04em; margin-top: 2px; }
  .doc { text-align: right; }
  .doc .t { font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: #f2682c; font-weight: 700; }
  .doc .p { font-size: 22px; font-weight: 700; margin-top: 2px; }
  .meta { display: flex; gap: 36px; padding: 18px 34px; border-bottom: 1px solid #e8edf3; flex-wrap: wrap; }
  .meta div span { display: block; font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: #94a3b8; margin-bottom: 3px; }
  .meta div b { font-size: 13.5px; font-weight: 600; }
  .content { padding: 10px 34px 26px; }
  h2 { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: #f2682c; margin: 26px 0 8px; display: flex; align-items: center; gap: 10px; }
  h2:after { content: ''; flex: 1; height: 1px; background: #eef2f7; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  thead th { text-align: left; font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: #64748b; padding: 7px 10px; border-bottom: 2px solid #1c2434; }
  thead th.num { text-align: right; }
  td { padding: 8px 10px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
  tr.alt td { background: #fafbfd; }
  .mono { font-family: 'Consolas', 'Courier New', monospace; font-size: 11.5px; color: #3b4a63; }
  .num { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .cap { text-transform: capitalize; }
  .pill { display: inline-block; font-size: 9px; background: #eef2f7; color: #64748b; border-radius: 99px; padding: 1px 7px; margin-left: 6px; vertical-align: middle; }
  .totals { margin-top: 26px; display: flex; justify-content: flex-end; }
  .totals .box { min-width: 290px; }
  .trow { display: flex; justify-content: space-between; padding: 5px 12px; font-size: 12.5px; color: #475569; }
  .trow b { font-variant-numeric: tabular-nums; color: #1c2434; }
  .grand { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding: 13px 16px; background: #fff4ec; border: 1px solid #f7c8ab; border-radius: 10px; }
  .grand span { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: #f2682c; font-weight: 700; }
  .grand b { font-size: 21px; font-variant-numeric: tabular-nums; }
  footer { margin-top: 34px; padding-top: 12px; border-top: 1px solid #e8edf3; display: flex; justify-content: space-between; gap: 16px; font-size: 9.5px; color: #94a3b8; }
  footer .d { font-style: italic; }
</style></head><body>
<div class="wrap">
  <div class="accent"></div>
  <div class="band">
    <div class="brand">Sales Hub<small>by Cluster Systems</small></div>
    <div class="doc"><div class="t">${tp('title')}</div><div class="p">${esc(data.period)}</div></div>
  </div>
  <div class="meta">
    <div><span>${tp('repLabel')}</span><b>${esc(data.repName)}</b></div>
    <div><span>${tp('period')}</span><b>${esc(data.period)}</b></div>
    <div><span>${tp('sourceLabel')}</span><b>${sourceLabel}</b></div>
    <div><span>${tp('issuedOn')}</span><b>${issued}</b></div>
  </div>
  <div class="content">
    <h2>${tp('commissions')} (${data.lines.length})</h2>
    <table>
      <thead><tr><th>${tp('invoice')}</th><th>${tp('customer')}</th><th class="num">${tp('amount')}</th></tr></thead>
      <tbody>${linesHtml || `<tr><td colspan="3" style="text-align:center;color:#94a3b8">—</td></tr>`}</tbody>
    </table>
    ${data.bonuses.length ? `
    <h2>${tp('bonuses')} (${data.bonuses.length})</h2>
    <table>
      <thead><tr><th>${tp('type')}</th><th>${tp('merchant')}</th><th class="num">${tp('amount')}</th></tr></thead>
      <tbody>${bonusHtml}</tbody>
    </table>` : ''}
    <div class="totals"><div class="box">
      <div class="trow"><span>${tp('subtotalCommissions')}</span><b>${fmt(linesSum)}</b></div>
      ${data.bonuses.length ? `<div class="trow"><span>${tp('subtotalBonuses')}</span><b>${fmt(bonusSum)}</b></div>` : ''}
      ${Math.abs(other) > 0.01 ? `<div class="trow"><span>${tp('otherAmounts')}</span><b>${fmt(other)}</b></div>` : ''}
      <div class="grand"><span>${tp('totalPaid')}</span><b>${fmt(data.total)}</b></div>
    </div></div>
    <footer>
      <div class="d">${t('commissionReport.grossDisclaimer')}</div>
      <div>Sales Hub · saleshub.clusterpos.com</div>
    </footer>
  </div>
</div>
</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 p-4 sm:p-8" onClick={onClose}>
      {/* Outer wrapper = position context for the corner ✕ (kept OUTSIDE the clipped box so it isn't cut);
          inner box is overflow-hidden so the scroll area's scrollbar gets clipped by the rounded corners. */}
      <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          title={tp('close') as string}
          className="absolute -right-3 -top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-stroke bg-white text-body shadow-lg transition hover:text-danger dark:border-strokedark dark:bg-boxdark dark:text-bodydark"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="flex max-h-[92vh] flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-boxdark">
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

          {data.lines.length === 0 && data.bonuses.length === 0 && !(data.missed && data.missed.length) ? (
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
                      const diff = !l.not_in_db && l.app_commission != null && Math.abs(l.app_commission - l.paid_amount) > 0.01;
                      return (
                        <tr key={l.invoice_number} className="border-t border-stroke dark:border-strokedark">
                          <td className="px-3 py-2 font-medium text-primary">{l.invoice_number}</td>
                          <td className="px-3 py-2 text-black dark:text-white">
                            {l.customer || '—'}
                            {l.not_in_db && (
                              <span className="ml-2 inline-flex rounded-full bg-gray-200 px-1.5 py-0 text-[9px] font-bold text-body dark:bg-meta-4">
                                {tp('notInDb')}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-black dark:text-white">{fmt(l.paid_amount)}</td>
                          {data.source === 'imported' && (
                            <td className={`px-3 py-2 text-right ${diff ? 'font-medium text-danger' : 'text-body'}`}>
                              {l.not_in_db || l.app_commission == null ? '—' : fmt(l.app_commission)}{diff ? ' ⚠' : ''}
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

              {/* Forgot-to-pay radar: earned this period per the app's model but not paid. */}
              {data.missed && data.missed.length > 0 && (
                <div className="mt-5 rounded-md border border-warning border-opacity-40 bg-warning bg-opacity-5 p-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">
                    ⚠ {tp('missedTitle')} ({data.missed.length})
                  </p>
                  <div className="overflow-x-auto rounded border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-2 dark:bg-meta-4">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">{tp('invoice')}</th>
                          <th className="px-3 py-2 text-left font-medium">{tp('customer')}</th>
                          <th className="px-3 py-2 text-right font-medium">{tp('appCalc')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.missed.map((m) => (
                          <tr key={m.invoice_number} className="border-t border-stroke dark:border-strokedark">
                            <td className="px-3 py-2 font-medium text-primary">{m.invoice_number}</td>
                            <td className="px-3 py-2 text-black dark:text-white">{m.customer || '—'}</td>
                            <td className="px-3 py-2 text-right font-semibold text-warning">{fmt(m.app_commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-body">{tp('missedHint')}</p>
                    <p className="whitespace-nowrap pl-4 text-sm font-bold text-warning">
                      {tp('missedSubtotal')}: {fmt(data.missedTotal || 0)}
                    </p>
                  </div>
                </div>
              )}

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
    </div>
  );
};

export default PayStubModal;
