import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

type Cat = 'debit' | 'credit' | 'amex';
interface Vol { trx: number; amount: number }
interface RatePair { rate: number; perTrx: number } // rate as % in the UI, $/trx
interface FixedLine { label: string; qty: number; unit: number }

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD' }).format(n || 0);

// Analyze a competitor merchant statement → savings vs Cluster. Mirrors "Rate Calculator v1.xlsx".
const SavingsCalculator: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [merchant, setMerchant] = useState('');
  const [vol, setVol] = useState<Record<Cat, Vol>>({ debit: { trx: 0, amount: 0 }, credit: { trx: 0, amount: 0 }, amex: { trx: 0, amount: 0 } });
  const [curRates, setCurRates] = useState<Record<Cat, RatePair>>({
    debit: { rate: 0, perTrx: 0 }, credit: { rate: 0, perTrx: 0 }, amex: { rate: 0, perTrx: 0 },
  });
  const [curInterchange, setCurInterchange] = useState(0);
  const [curFixed, setCurFixed] = useState<FixedLine[]>([
    { label: 'Terminaux', qty: 0, unit: 0 }, { label: 'PCI', qty: 1, unit: 0 }, { label: 'Frais mensuels', qty: 1, unit: 0 },
  ]);
  const [clusterQty, setClusterQty] = useState({ terminalS1F2: 0, terminalWired: 0, pci: 1, acctOnFile: 1, batch: 1, lte: 0 });

  const [tpl, setTpl] = useState<{ templateId: number; name: string; config: any; canOverride: boolean } | null>(null);
  const [overrides] = useState<any>({});
  const [results, setResults] = useState<any>(null);
  const [clusterResolved, setClusterResolved] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadingTpl, setLoadingTpl] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/api/savings/my-template`, { headers: authHeaders() });
        setTpl(r.data);
      } catch (e: any) {
        setErr(e?.response?.data?.error === 'no_template' ? t('savingsCalc.noTemplate') as string : t('savingsCalc.loadError') as string);
      } finally { setLoadingTpl(false); }
    })();
  }, []);

  // Debounced live calculation via the API (server is source of truth).
  const debounce = useRef<any>(null);
  const reqBody = useMemo(() => ({
    volumes: vol,
    current: {
      rates: {
        debit: { rate: num(curRates.debit.rate) / 100, perTrx: num(curRates.debit.perTrx) },
        credit: { rate: num(curRates.credit.rate) / 100, perTrx: num(curRates.credit.perTrx) },
        amex: { rate: num(curRates.amex.rate) / 100, perTrx: num(curRates.amex.perTrx) },
      },
      interchange: num(curInterchange),
      fixed: curFixed.map(f => ({ label: f.label, qty: num(f.qty), unit: num(f.unit) })),
    },
    clusterQty,
    overrides: (tpl?.canOverride && Object.keys(overrides).length) ? overrides : undefined,
  }), [vol, curRates, curInterchange, curFixed, clusterQty, overrides, tpl]);

  useEffect(() => {
    if (!tpl) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const r = await axios.post(`${API_URL}/api/savings/calculate`, reqBody, { headers: authHeaders() });
        setResults(r.data.results); setClusterResolved(r.data.clusterResolved); setErr(null);
      } catch (e: any) { setErr(t('savingsCalc.calcError') as string); }
    }, 400);
    return () => clearTimeout(debounce.current);
  }, [reqBody, tpl]);

  const save = async () => {
    if (!results) return;
    try {
      await axios.post(`${API_URL}/api/savings/analyses`, {
        merchantName: merchant, templateId: tpl?.templateId, inputs: reqBody, results,
      }, { headers: authHeaders() });
      dialog.alert(t('savingsCalc.saved') as string);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to save'); }
  };

  const downloadPdf = async () => {
    if (!results) return;
    try {
      const r = await axios.post(`${API_URL}/api/savings/pdf`,
        { ...reqBody, merchantName: merchant, lang: (i18n.language || 'fr').startsWith('en') ? 'en' : 'fr' },
        { headers: authHeaders(), responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `savings-${(merchant || 'offer').replace(/[^a-z0-9]+/gi, '-') || 'offer'}.pdf`;
      a.click(); URL.revokeObjectURL(url);
    } catch { dialog.alert(t('savingsCalc.pdfError') as string); }
  };

  const catLabel: Record<Cat, string> = { debit: t('savingsCalc.debit') as string, credit: t('savingsCalc.credit') as string, amex: t('savingsCalc.amex') as string };
  const cats: Cat[] = ['debit', 'credit', 'amex'];
  const inputCls = 'w-full rounded border border-stroke bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white';
  const cardCls = 'rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark';

  if (loadingTpl) return <div className="flex justify-center p-10"><span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-screen-2xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white">{t('savingsCalc.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('savingsCalc.subtitle')}</p>
        </div>
        <input value={merchant} onChange={e => setMerchant(e.target.value)} placeholder={t('savingsCalc.merchantName') as string}
          className="w-full rounded-lg border border-stroke bg-white px-3 py-2 text-sm shadow-sm dark:border-strokedark dark:bg-boxdark dark:text-white sm:w-72" />
      </div>

      {err && <p className="mb-4 rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">{err}</p>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* LEFT: inputs (2 cols) */}
        <div className="space-y-5 xl:col-span-2">
          {/* Volumes */}
          <div className={cardCls}>
            <h3 className="mb-3 text-sm font-semibold text-black dark:text-white">{t('savingsCalc.volumes')}</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500">
                <th className="pb-2 font-medium">{t('savingsCalc.category')}</th>
                <th className="pb-2 font-medium">{t('savingsCalc.numTrx')}</th>
                <th className="pb-2 font-medium">{t('savingsCalc.amount')}</th>
              </tr></thead>
              <tbody>
                {cats.map(c => (
                  <tr key={c}>
                    <td className="py-1 pr-3 font-medium text-black dark:text-white">{catLabel[c]}</td>
                    <td className="py-1 pr-2"><input type="number" className={inputCls} value={vol[c].trx || ''} onChange={e => setVol(v => ({ ...v, [c]: { ...v[c], trx: num(e.target.value) } }))} /></td>
                    <td className="py-1"><input type="number" className={inputCls} value={vol[c].amount || ''} onChange={e => setVol(v => ({ ...v, [c]: { ...v[c], amount: num(e.target.value) } }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Current processor rates */}
          <div className={cardCls}>
            <h3 className="mb-3 text-sm font-semibold text-black dark:text-white">{t('savingsCalc.currentRates')}</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500">
                <th className="pb-2 font-medium">{t('savingsCalc.category')}</th>
                <th className="pb-2 font-medium">{t('savingsCalc.ratePct')}</th>
                <th className="pb-2 font-medium">{t('savingsCalc.perTrx')}</th>
              </tr></thead>
              <tbody>
                {cats.map(c => (
                  <tr key={c}>
                    <td className="py-1 pr-3 font-medium text-black dark:text-white">{catLabel[c]}</td>
                    <td className="py-1 pr-2"><input type="number" step="0.001" className={inputCls} value={curRates[c].rate || ''} onChange={e => setCurRates(r => ({ ...r, [c]: { ...r[c], rate: num(e.target.value) } }))} /></td>
                    <td className="py-1"><input type="number" step="0.001" className={inputCls} value={curRates[c].perTrx || ''} onChange={e => setCurRates(r => ({ ...r, [c]: { ...r[c], perTrx: num(e.target.value) } }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <label className="mt-3 block text-xs font-medium text-gray-500">{t('savingsCalc.interchange')}</label>
            <input type="number" className={`${inputCls} mt-1 max-w-[200px]`} value={curInterchange || ''} onChange={e => setCurInterchange(num(e.target.value))} />
          </div>

          {/* Current fixed fees */}
          <div className={cardCls}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-black dark:text-white">{t('savingsCalc.currentFixed')}</h3>
              <button onClick={() => setCurFixed(f => [...f, { label: '', qty: 1, unit: 0 }])} className="text-xs font-medium text-primary hover:underline">+ {t('savingsCalc.addLine')}</button>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500">
                <th className="pb-2 font-medium">{t('savingsCalc.label')}</th>
                <th className="pb-2 font-medium">{t('savingsCalc.qty')}</th>
                <th className="pb-2 font-medium">{t('savingsCalc.unitPrice')}</th>
                <th></th>
              </tr></thead>
              <tbody>
                {curFixed.map((f, idx) => (
                  <tr key={idx}>
                    <td className="py-1 pr-2"><input className={inputCls} value={f.label} onChange={e => setCurFixed(arr => arr.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} /></td>
                    <td className="py-1 pr-2 w-20"><input type="number" className={inputCls} value={f.qty || ''} onChange={e => setCurFixed(arr => arr.map((x, i) => i === idx ? { ...x, qty: num(e.target.value) } : x))} /></td>
                    <td className="py-1 pr-2 w-28"><input type="number" step="0.01" className={inputCls} value={f.unit || ''} onChange={e => setCurFixed(arr => arr.map((x, i) => i === idx ? { ...x, unit: num(e.target.value) } : x))} /></td>
                    <td className="py-1"><button onClick={() => setCurFixed(arr => arr.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-danger" aria-label="remove"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cluster side */}
          <div className={cardCls}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-black dark:text-white">{t('savingsCalc.clusterSide')}</h3>
              {tpl && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{t('savingsCalc.template')}: {tpl.name}</span>}
            </div>
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t('savingsCalc.clusterHint')}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {([['terminalS1F2', 'termS1F2'], ['terminalWired', 'termWired'], ['pci', 'pci'], ['acctOnFile', 'acctOnFile'], ['batch', 'batch'], ['lte', 'lte']] as const).map(([key, lblKey]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-500">{t(`savingsCalc.${lblKey}`)} {clusterResolved?.fixed?.[key]?.unit != null && <span className="text-gray-400">({money(clusterResolved.fixed[key].unit)})</span>}</label>
                  <input type="number" className={`${inputCls} mt-1`} value={(clusterQty as any)[key] || ''} onChange={e => setClusterQty(q => ({ ...q, [key]: num(e.target.value) }))} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: results */}
        <div className="space-y-5">
          <div className={`${cardCls} sticky top-4`}>
            <h3 className="mb-4 text-sm font-semibold text-black dark:text-white">{t('savingsCalc.results')}</h3>
            {!results ? <p className="text-sm text-gray-400">{t('savingsCalc.fillToSee')}</p> : (
              <>
                <div className="mb-4 rounded-lg bg-success/10 p-4 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-success">{t('savingsCalc.monthlySavings')}</p>
                  <p className="mt-1 text-3xl font-bold text-success">{money(results.savings.monthly)}</p>
                  <p className="mt-1 text-sm text-success">{t('savingsCalc.perYear', { amount: money(results.savings.yearly) })}</p>
                </div>
                <div className="space-y-1.5 text-sm">
                  <Row label={t('savingsCalc.currentTotal') as string} value={money(results.current.total)} />
                  <Row label={t('savingsCalc.clusterTotal') as string} value={money(results.cluster.total)} strong />
                </div>
                <details className="mt-3 text-xs text-gray-500">
                  <summary className="cursor-pointer">{t('savingsCalc.breakdown')}</summary>
                  <div className="mt-2 space-y-1">
                    <Row label={t('savingsCalc.currentTxn') as string} value={money(results.current.txnFees)} small />
                    <Row label={t('savingsCalc.currentFixedTotal') as string} value={money(results.current.fixed)} small />
                    <Row label={t('savingsCalc.clusterTxn') as string} value={money(results.cluster.txnFees)} small />
                    <Row label={t('savingsCalc.clusterFixedTotal') as string} value={money(results.cluster.fixed)} small />
                  </div>
                </details>
                {tpl?.canOverride && (
                  <div className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
                    <p className="text-xs font-semibold text-[#9D5425] dark:text-warning">{t('savingsCalc.clusterMargin')}</p>
                    <p className="mt-1 text-lg font-bold text-black dark:text-white">{money(results.margin.total)}<span className="ml-2 text-xs font-normal text-gray-500">{(results.margin.pctOfVolume * 100).toFixed(2)}% {t('savingsCalc.ofVolume')}</span></p>
                  </div>
                )}
                <button onClick={downloadPdf} className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-opacity-90">{t('savingsCalc.downloadPdf')}</button>
                <button onClick={save} className="mt-2 w-full rounded-lg border border-stroke py-2.5 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4">{t('savingsCalc.save')}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; strong?: boolean; small?: boolean }> = ({ label, value, strong, small }) => (
  <div className={`flex items-center justify-between ${small ? 'text-xs text-gray-500' : ''}`}>
    <span className={strong ? 'font-semibold text-black dark:text-white' : ''}>{label}</span>
    <span className={strong ? 'font-bold text-black dark:text-white' : ''}>{value}</span>
  </div>
);

export default SavingsCalculator;
