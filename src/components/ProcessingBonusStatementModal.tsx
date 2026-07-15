import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { dialog } from '../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com';

export interface BonusStatementAccount {
  merchantName: string | null;
  amount: number;
  reportDate?: string | null;
}
export interface BonusStatementData {
  repName: string;
  period: string; // 'YYYY-MM'
  accounts: BonusStatementAccount[];
  total: number;
}

// Dedicated document for the bi-annual processing bonus (June/December) — deliberately
// separate from PayStubModal so this twice-yearly bonus never gets mixed into a specific
// month's regular commission pay stub (2026-07-15).
const ProcessingBonusStatementModal: React.FC<{
  data: BonusStatementData | null;
  onClose: () => void;
}> = ({ data, onClose }) => {
  const { t, i18n } = useTranslation();
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  if (!data) return null;

  const tp = (k: string) => t(`commissionReport.bonusStatement.${k}`);
  const fmt = (val: number) =>
    val.toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', {
      style: 'currency', currency: 'CAD', minimumFractionDigits: 2,
    });

  const sendEmail = async () => {
    if (!data || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailTo.trim())) return;
    setEmailSending(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/commissions/processing-bonus-statement/email`, {
        repName: data.repName, period: data.period, to: emailTo.trim(),
        accounts: data.accounts, total: data.total,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setEmailOpen(false); setEmailTo('');
      dialog.alert(tp('emailSent'));
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || 'Failed to send');
    } finally {
      setEmailSending(false);
    }
  };

  const printStatement = () => {
    const esc = (s: string | null | undefined) =>
      String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const locale = i18n.language === 'fr' ? 'fr-CA' : 'en-CA';
    const issued = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    const rowsHtml = data.accounts.map((a, i) => `
      <tr${i % 2 ? ' class="alt"' : ''}>
        <td>${esc(a.merchantName) || '—'}</td>
        <td class="num">${fmt(a.amount)}</td>
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
  .brand { display: flex; align-items: center; gap: 12px; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
  .brand img { height: 36px; width: 36px; }
  .brand small { display: block; font-size: 11px; font-weight: 400; color: #8a99af; letter-spacing: .04em; margin-top: 2px; }
  .doc { text-align: right; }
  .doc .t { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: #f2682c; font-weight: 700; max-width: 260px; }
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
  .num { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { margin-top: 26px; display: flex; justify-content: flex-end; }
  .totals .box { min-width: 290px; }
  .grand { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding: 13px 16px; background: #fff4ec; border: 1px solid #f7c8ab; border-radius: 10px; }
  .grand span { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: #f2682c; font-weight: 700; }
  .grand b { font-size: 21px; font-variant-numeric: tabular-nums; }
  footer { margin-top: 34px; padding-top: 12px; border-top: 1px solid #e8edf3; display: flex; justify-content: space-between; gap: 16px; font-size: 9.5px; color: #94a3b8; }
  footer .d { font-style: italic; }
</style></head><body>
<div class="wrap">
  <div class="accent"></div>
  <div class="band">
    <div class="brand"><img src="${window.location.origin}/saleshub-mark-dark.svg" alt=""><span>Sales Hub<small>by Cluster Systems</small></span></div>
    <div class="doc"><div class="t">${tp('title')}</div><div class="p">${esc(data.period)}</div></div>
  </div>
  <div class="meta">
    <div><span>${tp('repLabel')}</span><b>${esc(data.repName)}</b></div>
    <div><span>${tp('period')}</span><b>${esc(data.period)}</b></div>
    <div><span>${tp('issuedOn')}</span><b>${issued}</b></div>
  </div>
  <div class="content">
    <h2>${tp('merchant')} (${data.accounts.length})</h2>
    <table>
      <thead><tr><th>${tp('merchant')}</th><th class="num">${tp('amount')}</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="2" style="text-align:center;color:#94a3b8">—</td></tr>`}</tbody>
    </table>
    <div class="totals"><div class="box">
      <div class="grand"><span>${tp('totalPaid')}</span><b>${fmt(data.total)}</b></div>
    </div></div>
    <footer>
      <div class="d">${tp('hint')}</div>
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
      <div className="relative w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          title={tp('close') as string}
          className="absolute -right-3 -top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-stroke bg-white text-body shadow-lg transition hover:text-danger dark:border-strokedark dark:bg-boxdark dark:text-bodydark"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-boxdark">
          <div className="flex items-start justify-between gap-3 border-b border-stroke px-6 py-4 dark:border-strokedark">
            <div>
              <h3 className="text-lg font-semibold text-black dark:text-white">{tp('title')} — {data.repName}</h3>
              <p className="text-sm text-body">{tp('period')}: {data.period}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setEmailOpen(o => !o)} title={tp('email') as string}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stroke bg-transparent px-3 py-2 text-sm font-medium text-body transition hover:border-primary hover:text-primary dark:border-strokedark">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  {tp('email')}
                </button>
                <button onClick={printStatement} title={tp('pdf') as string}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-opacity-90">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
                  {tp('pdf')}
                </button>
              </div>
              {emailOpen && (
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    autoFocus
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendEmail(); }}
                    placeholder={tp('emailPlaceholder') as string}
                    className="min-w-0 flex-1 rounded border border-stroke bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white sm:flex-none sm:w-56"
                  />
                  <button onClick={sendEmail} disabled={emailSending || !emailTo.trim()}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
                    {emailSending ? tp('emailSending') : tp('emailSend')}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {data.accounts.length === 0 ? (
              <p className="py-6 text-center text-sm text-body">{tp('noData')}</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-2 dark:bg-meta-4">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">{tp('merchant')}</th>
                        <th className="px-3 py-2 text-right font-medium">{tp('amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.accounts.map((a, i) => (
                        <tr key={i} className="border-t border-stroke dark:border-strokedark">
                          <td className="px-3 py-2 text-black dark:text-white">{a.merchantName || '—'}</td>
                          <td className="px-3 py-2 text-right font-semibold text-black dark:text-white whitespace-nowrap">{fmt(a.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-5 flex items-center justify-between rounded-md bg-gray-2 px-4 py-3 dark:bg-meta-4">
                  <span className="font-semibold text-black dark:text-white">{tp('totalPaid')}</span>
                  <span className="text-xl font-bold text-primary">{fmt(data.total)}</span>
                </div>
                <p className="mt-2 text-xs text-body">{tp('hint')}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcessingBonusStatementModal;
