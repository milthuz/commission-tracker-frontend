import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';
import { ContentLoader } from '../../common/Loader';
import PdfViewerModal, { type PdfSource } from '../../components/PdfViewerModal';
import Select from '../../components/Select';

// Rapport mensuel des crédits processeur marchand, pour la comptabilité (credits:report) et les
// approbateurs. Lecture seule : les crédits APPROUVÉS pendant le mois (heure de Montréal), avec le
// compte Zoho Books et la note de crédit, les reprises tranchées pendant le mois, et l'export CSV
// (réglages Excel fr-CA ou en). Un clic sur une ligne ouvre l'entente signée.

const API_URL = import.meta.env.VITE_API_URL || '';
const auth = (): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });
const CARD = 'rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark';
const BTN = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-stroke px-3 py-2 text-sm text-black hover:border-primary hover:text-primary disabled:opacity-50 dark:border-strokedark dark:text-white';

interface Row {
  id: string; ref: string; legalName: string; booksCustomerId: string | null; booksCustomerName: string | null; amount: number;
  creditnoteNumber: string | null; rep: string; approvedBy: string; approvedDay: string; commitmentEnd: string | null; clawback: string | null;
}
interface Clawback { id: string; ref: string; legalName: string; amount: number; creditnoteNumber: string | null; decision: 'reclaimed' | 'waived'; decidedBy: string; decidedDay: string; note: string | null }
interface Report {
  month: string; months: string[]; rows: Row[]; clawbacks: Clawback[];
  totals: { count: number; amount: number; withCreditNote: number; pendingCreditNote: number; reclaimedCount: number; reclaimedAmount: number };
}

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const shift = (m: string, k: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export default function CreditsReport({ t, money, date, locale }: {
  t: (k: string, o?: any) => string; money: (v: number) => string; date: (d: string | null) => string; locale: string;
}) {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [viewer, setViewer] = useState<PdfSource | null>(null);

  useEffect(() => {
    let off = false;
    setLoading(true); setErr(null);
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/credits/report?month=${month}`, { headers: auth() });
        const d = await r.json().catch(() => ({}));
        if (off) return;
        if (!r.ok) { setErr(t('credits.report.loadError')); setData(null); } else setData(d);
      } catch { if (!off) setErr(t('credits.report.loadError')); } finally { if (!off) setLoading(false); }
    })();
    return () => { off = true; };
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    const s = new Date(y, mo - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  // Mois proposés : ceux qui ont des crédits approuvés, plus le mois affiché et le mois courant.
  const months = useMemo(() => [...new Set([thisMonth(), month, ...(data?.months || [])])].sort().reverse(), [data, month]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const r = await fetch(`${API_URL}/api/credits/report.csv?month=${month}&lang=${locale.startsWith('en') ? 'en' : 'fr'}`, { headers: auth() });
      if (!r.ok) throw new Error();
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `${locale.startsWith('en') ? 'merchant-processor-credits' : 'credits-processeur-marchand'}-${month}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { setErr(t('credits.report.exportError')); } finally { setExporting(false); }
  };

  const openPdf = (r: { id: string; ref: string }) => setViewer({ url: `${API_URL}/api/credits/${r.id}/pdf`, headers: auth(), title: `${r.ref}`, filename: `${r.ref}.pdf` });

  const tot = data?.totals;
  const tile = (k: string, v: string, tone = '') => (
    <div className={`${CARD} p-4`}>
      <div className="text-xs text-body dark:text-bodydark">{t(k)}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone || 'text-black dark:text-white'}`}>{v}</div>
    </div>
  );

  return (
    <div>
      {viewer && <PdfViewerModal source={viewer} onClose={() => setViewer(null)} />}
      <div className={`${CARD} mb-5 flex flex-wrap items-center gap-3 p-4`}>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonth(shift(month, -1))} className={BTN} aria-label={t('credits.report.prev') as string}><ChevronLeft className="h-4 w-4" /></button>
          <div className="min-w-[180px]">
            <Select value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: label(m) }))} aria-label={t('credits.report.month') as string} />
          </div>
          <button type="button" onClick={() => setMonth(shift(month, 1))} disabled={month >= thisMonth()} className={BTN} aria-label={t('credits.report.next') as string}><ChevronRight className="h-4 w-4" /></button>
        </div>
        <p className="min-w-[200px] flex-1 text-sm text-body dark:text-bodydark">{t('credits.report.hint')}</p>
        <button type="button" onClick={exportCsv} disabled={exporting || !data} className={BTN}>
          <Download className="h-4 w-4" />{exporting ? t('credits.report.exporting') : t('credits.report.export')}
        </button>
      </div>

      {loading ? <ContentLoader /> : err ? (
        <div className={`${CARD} p-8 text-center text-sm text-danger`}>{err}</div>
      ) : data && tot && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {tile('credits.report.count', String(tot.count))}
            {tile('credits.report.total', money(tot.amount), 'text-primary')}
            {tile('credits.report.creditNotes', `${tot.withCreditNote} / ${tot.count}`)}
            {tile('credits.report.reclaimed', tot.reclaimedCount ? `${money(tot.reclaimedAmount)} (${tot.reclaimedCount})` : '—')}
          </div>
          {tot.pendingCreditNote > 0 && (
            <p className="mb-4 rounded border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-black dark:text-white">{t('credits.report.pendingCn', { count: tot.pendingCreditNote })}</p>
          )}

          {data.rows.length === 0 ? (
            <div className={`${CARD} p-10 text-center text-sm text-body`}>{t('credits.report.empty', { month: label(month) })}</div>
          ) : (
            <div className={`${CARD} overflow-x-auto`}>
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-gray-2 text-left text-xs text-body dark:bg-meta-4 dark:text-bodydark">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('credits.report.col.approved')}</th>
                    <th className="px-4 py-3 font-medium">{t('credits.col.ref')}</th>
                    <th className="px-4 py-3 font-medium">{t('credits.col.merchant')}</th>
                    <th className="px-4 py-3 font-medium">{t('credits.report.col.books')}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('credits.col.amount')}</th>
                    <th className="px-4 py-3 font-medium">{t('credits.report.col.creditNote')}</th>
                    <th className="px-4 py-3 font-medium">{t('credits.col.rep')}</th>
                    <th className="px-4 py-3 font-medium">{t('credits.report.col.approvedBy')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-t border-stroke dark:border-strokedark">
                      <td className="whitespace-nowrap px-4 py-3 text-body dark:text-bodydark">{date(r.approvedDay)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-black dark:text-white">{r.ref}</td>
                      <td className="px-4 py-3 text-black dark:text-white">
                        {r.legalName}
                        {r.clawback && <span className={`ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${r.clawback === 'flagged' ? 'bg-danger/10 text-danger' : 'bg-gray-2 text-body dark:bg-meta-4'}`}>{t(`credits.report.cb.${r.clawback}`)}</span>}
                      </td>
                      <td className="px-4 py-3 text-body dark:text-bodydark">{r.booksCustomerName || (r.booksCustomerId ? `#${r.booksCustomerId}` : '—')}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-black dark:text-white">{money(r.amount)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{r.creditnoteNumber
                        ? <span className="text-black dark:text-white">{r.creditnoteNumber}</span>
                        : <span className="text-warning">{t('credits.report.toCreate')}</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-body dark:text-bodydark">{r.rep}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-body dark:text-bodydark">{r.approvedBy}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => openPdf(r)} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                          <FileText className="h-4 w-4" />{t('credits.report.pdf')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-stroke font-semibold dark:border-strokedark">
                    <td className="px-4 py-3 text-black dark:text-white" colSpan={4}>{t('credits.report.totalRow', { count: tot.count })}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-black dark:text-white">{money(tot.amount)}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {data.clawbacks.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-black dark:text-white">{t('credits.report.clawbacksTitle')}</h3>
              <div className={`${CARD} overflow-x-auto`}>
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-gray-2 text-left text-xs text-body dark:bg-meta-4 dark:text-bodydark">
                    <tr>
                      <th className="px-4 py-3 font-medium">{t('credits.report.col.decided')}</th>
                      <th className="px-4 py-3 font-medium">{t('credits.col.ref')}</th>
                      <th className="px-4 py-3 font-medium">{t('credits.col.merchant')}</th>
                      <th className="px-4 py-3 text-right font-medium">{t('credits.col.amount')}</th>
                      <th className="px-4 py-3 font-medium">{t('credits.report.col.decision')}</th>
                      <th className="px-4 py-3 font-medium">{t('credits.report.col.note')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clawbacks.map((r) => (
                      <tr key={r.id} className="border-t border-stroke dark:border-strokedark">
                        <td className="whitespace-nowrap px-4 py-3 text-body dark:text-bodydark">{date(r.decidedDay)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-black dark:text-white">{r.ref}</td>
                        <td className="px-4 py-3 text-black dark:text-white">{r.legalName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-black dark:text-white">{money(r.amount)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-black dark:text-white">{t(`credits.report.cb.${r.decision}`)} · <span className="text-body">{r.decidedBy}</span></td>
                        <td className="px-4 py-3 text-body dark:text-bodydark">{r.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
