import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, Download, AlertTriangle, ClipboardPaste, Loader2 } from 'lucide-react';
import Select from '../../components/Select';
import { ContentLoader } from '../../common/Loader';
import { extractCells, looksScanned } from './extract';

// Calculateur comparatif IC+.
//
// Le rep dépose le relevé de son processeur actuel ; la page compare ce qu'il paie
// aujourd'hui avec ce que Cluster facturerait sur le même volume, et signale les frais qui
// ne correspondent à aucun taux réseau publié.
//
// ⚠️ AUCUN CALCUL D'ARGENT ICI. Le navigateur extrait le texte du PDF et affiche ce que le
// serveur renvoie : c'est le serveur qui lit le relevé, classe chaque ligne et calcule. Un
// montant affiché ne peut donc pas diverger de celui qui partira dans le PDF, et un rep ne
// peut pas modifier une économie en touchant à la page.

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

type Note = { code: string; params: Record<string, unknown>; text: string };
type Processor = { key: string; name: string; implemented: boolean; verified: boolean };

interface AuditRow {
  desc: string; count?: number; volume?: number; rate?: number | null; total: number;
  cat?: string | null; publishedRate?: number | null; theoretical?: number | null;
  delta?: number | null; status: string; tier?: string | null; why?: string;
}

interface Result {
  volume: any;
  current: { markup: number; interchange: number; fixed: number; hiddenBumps: number; suspectBumps: number; pretax: number; tax: number; grand: number; effectiveBlendedRate: number | null };
  cluster: { markup: number; interchange: number; interchangeMode: string; fixed: number; pretax: number; tax: number; grand: number };
  savings: { monthly: number; annual: number; clusterIsCheaper: boolean; breakdown: any };
  margin?: { rows: any[]; totalBilled: number; totalCost: number; revenue: number; revenuePct: number | null };
}

const CARD = 'rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark';

export default function RateCalculator() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'fr';

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [processor, setProcessor] = useState('auto');

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<any>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [detectedAs, setDetectedAs] = useState<string | null>(null);

  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [salesperson, setSalesperson] = useState('');
  const [clientNotes, setClientNotes] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  const money = (v: number | null | undefined) =>
    new Intl.NumberFormat(lang === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' }).format(Number(v) || 0);
  // Décimale à la virgule et espace avant le % en français ; point et % collé en anglais.
  const pct = (v: number | null | undefined, d = 4) => {
    if (v == null) return '—';
    const s = (Number(v) * 100).toFixed(d);
    return lang === 'en' ? `${s}%` : `${s.replace('.', ',')} %`;
  };

  useEffect(() => {
    fetch(`${API_URL}/api/icplus/config?lang=${lang}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setConfig)
      .catch(() => setError(t('icplus.loadError') as string))
      .finally(() => setLoading(false));
  }, [lang]);

  // ---- lecture d'un relevé
  async function onFile(file: File) {
    setError(null); setBusy('parse');
    try {
      const extracted = await extractCells(file);
      if (looksScanned(extracted)) {
        setBusy(null);
        setError(t('icplus.scannedPdf') as string);
        setShowPaste(true);
        return;
      }
      const res = await fetch(`${API_URL}/api/icplus/parse`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ cells: extracted.cells, processor, lang, salesperson }),
      });
      const data = await res.json();
      applyResponse(data);
    } catch (e: any) {
      setError(e?.message || (t('icplus.parseError') as string));
    } finally {
      setBusy(null);
    }
  }

  async function onPaste() {
    setError(null); setBusy('import');
    try {
      const res = await fetch(`${API_URL}/api/icplus/import`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ text: pasteText, lang, salesperson }),
      });
      applyResponse(await res.json());
      if (pasteText) setShowPaste(false);
    } catch (e: any) {
      setError(e?.message || (t('icplus.parseError') as string));
    } finally {
      setBusy(null);
    }
  }

  function applyResponse(data: any) {
    setNotes(data.notes || []);
    if (!data.ok) {
      setState(null); setResult(null);
      setError((data.notes?.[0]?.text) || (t('icplus.unreadable') as string));
      return;
    }
    setState(data.state);
    setResult(data.result);
    setDetectedAs(data.detected || data.processor || null);
    setError(null);
  }

  // ⚠️ Toute modification repasse par le serveur : il recalcule, la page n'additionne rien.
  async function recalc(next: any) {
    setState(next);
    const res = await fetch(`${API_URL}/api/icplus/calculate`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ state: next, lang }),
    });
    const data = await res.json();
    if (data.ok) setResult(data.result);
  }

  const setVolume = (field: string, v: string) =>
    recalc({ ...state, volume: { ...state.volume, [field]: Number(v) || 0 } });

  const setRate = (side: 'current' | 'cluster', brand: string, key: 'pct' | 'perItem', v: string) =>
    recalc({
      ...state,
      [side]: { ...state[side], rates: { ...state[side].rates, [brand]: { ...state[side].rates[brand], [key]: Number(v) || 0 } } },
    });

  const setFixed = (side: 'current' | 'cluster', key: string, field: 'qty' | 'unit', v: string) =>
    recalc({
      ...state,
      [side]: { ...state[side], fixed: { ...state[side].fixed, [key]: { ...state[side].fixed[key], [field]: Number(v) || 0 } } },
    });

  async function download(kind: 'client' | 'detailed') {
    setBusy(kind);
    try {
      const res = await fetch(`${API_URL}/api/icplus/pdf`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ state, kind, lang, salesperson, notes: clientNotes }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)/);
      const name = m ? decodeURIComponent(m[1]) : `${state.merchantName || 'analyse'}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t('icplus.pdfError') as string);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <ContentLoader />;

  const processors: Processor[] = config?.processors || [];
  const procOptions = [
    { value: 'auto', label: t('icplus.autoDetect') as string },
    ...processors.filter((p) => p.implemented).map((p) => ({
      value: p.key,
      label: p.verified ? p.name : `${p.name} — ${t('icplus.unverified')}`,
    })),
  ];

  return (
    <>
      <div className="mb-6">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">{t('icplus.title')}</h2>
        <p className="mt-1 text-sm text-body dark:text-bodydark">{t('icplus.subtitle')}</p>
      </div>

      {/* Barre d'outils en carte pleine largeur SOUS le titre — convention de la maison pour
          un en-tête portant trois contrôles ou plus. */}
      <div className={`${CARD} mb-6`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">{t('icplus.processor')}</label>
            <Select value={processor} onChange={setProcessor} options={procOptions} />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">{t('icplus.salesperson')}</label>
            <input value={salesperson} onChange={(e) => setSalesperson(e.target.value)}
              className="w-full rounded border border-stroke bg-transparent px-4 py-2 outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input" />
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={!!busy}
            className="flex items-center gap-2 rounded bg-primary px-4 py-2 font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
            {busy === 'parse' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t('icplus.uploadStatement')}
          </button>
          <button onClick={() => setShowPaste((v) => !v)}
            className="flex items-center gap-2 rounded border border-stroke px-4 py-2 font-medium text-black hover:border-primary dark:border-strokedark dark:text-white">
            <ClipboardPaste className="h-4 w-4" />{t('icplus.pasteJson')}
          </button>
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        </div>

        {showPaste && (
          <div className="mt-4 border-t border-stroke pt-4 dark:border-strokedark">
            <p className="mb-2 text-sm text-body dark:text-bodydark">{t('icplus.pasteHelp')}</p>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6}
              className="w-full rounded border border-stroke bg-transparent p-3 font-mono text-xs outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input"
              placeholder='{"current_processor": {...}, "volume": {...}}' />
            <button onClick={onPaste} disabled={!pasteText.trim() || !!busy}
              className="mt-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy === 'import' ? '…' : t('icplus.import')}
            </button>
          </div>
        )}
      </div>

      {/* ⚠️ Les tables de taux de référence sont encore incomplètes : sans cet avertissement,
          chaque ligne d'interchange affiche « À vérifier » et la page a simplement l'air cassée. */}
      {config?.rateData?.incomplete && (
        <div className="mb-6 flex items-start gap-3 rounded-sm border border-warning bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="text-sm text-black dark:text-white">
            <p className="font-medium">{t('icplus.rateDataIncomplete')}</p>
            <p className="mt-1 text-body dark:text-bodydark">
              {t('icplus.rateDataIncompleteDetail', { tables: config.rateData.unsourced.join(', ') })}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-sm border border-danger bg-danger/10 p-4 text-sm text-danger">{error}</div>
      )}

      {!state && !error && (
        <div className={`${CARD} text-center`}>
          <FileText className="mx-auto mb-3 h-10 w-10 text-body" />
          <p className="text-body dark:text-bodydark">{t('icplus.empty')}</p>
        </div>
      )}

      {state && result && (
        <>
          {/* Économies */}
          <div className={`${CARD} mb-6`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-body dark:text-bodydark">{t('icplus.merchant')}</p>
                <input value={state.merchantName || ''} onChange={(e) => setState({ ...state, merchantName: e.target.value })}
                  className="w-full min-w-[240px] border-0 border-b border-stroke bg-transparent pb-1 text-xl font-semibold text-black outline-none focus:border-primary dark:border-strokedark dark:text-white" />
                {detectedAs && <p className="mt-1 text-xs text-body">{t('icplus.detectedAs', { name: detectedAs })}</p>}
              </div>
              <div className="text-right">
                <p className="text-sm text-body dark:text-bodydark">
                  {result.savings.clusterIsCheaper ? t('icplus.savingsMonthly') : t('icplus.differenceMonthly')}
                </p>
                <p className={`text-3xl font-bold ${result.savings.clusterIsCheaper ? 'text-success' : 'text-danger'}`}>
                  {money(Math.abs(result.savings.monthly))}
                </p>
                <p className="text-sm text-body dark:text-bodydark">
                  {money(Math.abs(result.savings.annual))} {t('icplus.perYear')}
                </p>
              </div>
            </div>
          </div>

          {/* Volumes */}
          <div className={`${CARD} mb-6`}>
            <h3 className="mb-4 font-semibold text-black dark:text-white">{t('icplus.volume')}</h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {(['debit', 'visa', 'mc', 'amex'] as const).map((b) => (
                <div key={b}>
                  <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">{t(`icplus.brand.${b}`)}</label>
                  <input type="number" value={state.volume[`${b}_count`]} onChange={(e) => setVolume(`${b}_count`, e.target.value)}
                    placeholder={t('icplus.count') as string}
                    className="mb-2 w-full rounded border border-stroke bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input" />
                  <input type="number" step="0.01" value={state.volume[`${b}_amt`]} onChange={(e) => setVolume(`${b}_amt`, e.target.value)}
                    placeholder={t('icplus.amount') as string}
                    className="w-full rounded border border-stroke bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input" />
                </div>
              ))}
            </div>
          </div>

          {/* Les deux colonnes */}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            {(['current', 'cluster'] as const).map((side) => (
              <div key={side} className={CARD}>
                <h3 className={`mb-4 font-semibold ${side === 'cluster' ? 'text-primary' : 'text-black dark:text-white'}`}>
                  {t(side === 'current' ? 'icplus.currentSide' : 'icplus.clusterSide')}
                </h3>

                <table className="w-full text-sm">
                  <tbody>
                    {(['debit', 'visa', 'mc', 'amex'] as const).map((b) => (
                      <tr key={b} className="border-b border-stroke dark:border-strokedark">
                        <td className="py-2 text-black dark:text-white">{t(`icplus.brand.${b}`)}</td>
                        <td className="py-2 text-right">
                          <input type="number" step="0.0001" value={state[side].rates[b].pct}
                            onChange={(e) => setRate(side, b, 'pct', e.target.value)}
                            className="w-24 rounded border border-stroke bg-transparent px-2 py-1 text-right text-xs outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input" />
                        </td>
                        <td className="py-2 text-right">
                          <input type="number" step="0.001" value={state[side].rates[b].perItem}
                            onChange={(e) => setRate(side, b, 'perItem', e.target.value)}
                            className="w-20 rounded border border-stroke bg-transparent px-2 py-1 text-right text-xs outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-4 space-y-1 text-sm">
                  <Row label={t('icplus.markup') as string} value={money(result[side].markup)} />
                  <Row label={t('icplus.interchange') as string} value={money(result[side].interchange)} />
                  <Row label={t('icplus.fixedFees') as string} value={money(result[side].fixed)} />
                  {side === 'current' && result.current.hiddenBumps > 0 && (
                    <Row label={t('icplus.hiddenBumps') as string} value={money(result.current.hiddenBumps)} muted />
                  )}
                  <div className="border-t border-stroke pt-2 dark:border-strokedark">
                    <Row label={t('icplus.pretax') as string} value={money(result[side].pretax)} bold />
                    <Row label={t('icplus.tax') as string} value={money(result[side].tax)} muted />
                    <Row label={t('icplus.grandTotal') as string} value={money(result[side].grand)} bold />
                  </div>
                </div>

                {/* Frais fixes modifiables */}
                <div className="mt-4 border-t border-stroke pt-3 dark:border-strokedark">
                  {(config?.defaults?.fixedKeys || []).map((k: string) => (
                    <div key={k} className="mb-1.5 flex items-center gap-2 text-xs">
                      <span className="flex-1 text-body dark:text-bodydark">{t(`icplus.fixed.${k}`)}</span>
                      <input type="number" value={state[side].fixed[k].qty} onChange={(e) => setFixed(side, k, 'qty', e.target.value)}
                        className="w-14 rounded border border-stroke bg-transparent px-2 py-1 text-right dark:border-form-strokedark dark:bg-form-input" />
                      <input type="number" step="0.01" value={state[side].fixed[k].unit} onChange={(e) => setFixed(side, k, 'unit', e.target.value)}
                        className="w-20 rounded border border-stroke bg-transparent px-2 py-1 text-right dark:border-form-strokedark dark:bg-form-input" />
                    </div>
                  ))}
                  {(state[side].extraFixed || []).map((r: any, i: number) => (
                    <div key={i} className="mb-1.5 flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate text-body dark:text-bodydark" title={r.label}>{r.label}</span>
                      <span className="w-14 text-right text-body">×{r.qty}</span>
                      <span className="w-20 text-right text-black dark:text-white">{money(r.unit)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Vérification ligne par ligne */}
          {(['interchange', 'brand', 'interac'] as const).map((bucket) =>
            state.lineAudit?.[bucket]?.length ? (
              <div key={bucket} className={`${CARD} mb-6`}>
                <h3 className="mb-3 font-semibold text-black dark:text-white">{t(`icplus.audit.${bucket}`)}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-stroke text-left text-xs text-body dark:border-strokedark">
                        <th className="py-2">{t('icplus.audit.desc')}</th>
                        <th className="py-2 text-right">{t('icplus.audit.applied')}</th>
                        <th className="py-2 text-right">{t('icplus.audit.published')}</th>
                        <th className="py-2 text-right">{t('icplus.audit.amount')}</th>
                        <th className="py-2 text-right">{t('icplus.audit.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.lineAudit[bucket].map((r: AuditRow, i: number) => (
                        <tr key={i} className="border-b border-stroke dark:border-strokedark">
                          <td className="py-2 text-black dark:text-white" title={r.why}>{r.desc}</td>
                          <td className="py-2 text-right text-body">{pct(r.rate)}</td>
                          <td className="py-2 text-right text-body">{pct(r.publishedRate)}</td>
                          <td className="py-2 text-right text-black dark:text-white">{money(r.total)}</td>
                          <td className="py-2 text-right">
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                              r.status === 'SUSPECT' ? 'bg-danger/10 text-danger'
                                : r.status === 'Conforme' ? 'bg-success/10 text-success'
                                : 'bg-warning/10 text-warning'}`}>{r.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null
          )}

          {/* Rentabilité interne — permission distincte, absente de la réponse sans elle. */}
          {result.margin && (
            <div className={`${CARD} mb-6`}>
              <h3 className="mb-3 font-semibold text-black dark:text-white">{t('icplus.margin')}</h3>
              <table className="w-full text-sm">
                <tbody>
                  {result.margin.rows.map((r: any) => (
                    <tr key={r.key} className="border-b border-stroke dark:border-strokedark">
                      <td className="py-1.5 text-black dark:text-white">{t(`icplus.marginRow.${r.key}`, { defaultValue: r.key }) as string}</td>
                      <td className="py-1.5 text-right text-body">{money(r.billed)}</td>
                      <td className="py-1.5 text-right text-body">{money(r.cost)}</td>
                      <td className="py-1.5 text-right font-medium text-black dark:text-white">{money(r.revenue)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 font-semibold text-primary">{t('icplus.total')}</td>
                    <td className="py-2 text-right text-body">{money(result.margin.totalBilled)}</td>
                    <td className="py-2 text-right text-body">{money(result.margin.totalCost)}</td>
                    <td className="py-2 text-right font-bold text-primary">{money(result.margin.revenue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Notes de lecture */}
          {notes.length > 0 && (
            <div className={`${CARD} mb-6`}>
              <h3 className="mb-3 font-semibold text-black dark:text-white">{t('icplus.notes')}</h3>
              <ul className="space-y-2 text-sm text-body dark:text-bodydark">
                {notes.map((n, i) => <li key={i} className="flex gap-2"><span>•</span><span>{n.text}</span></li>)}
              </ul>
            </div>
          )}

          {/* Exports */}
          <div className={CARD}>
            <h3 className="mb-3 font-semibold text-black dark:text-white">{t('icplus.exports')}</h3>
            <textarea value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} rows={2}
              placeholder={t('icplus.clientNotesPlaceholder') as string}
              className="mb-3 w-full rounded border border-stroke bg-transparent p-3 text-sm outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input" />
            <div className="flex flex-wrap gap-3">
              <button onClick={() => download('client')} disabled={!!busy}
                className="flex items-center gap-2 rounded bg-primary px-4 py-2 font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
                <Download className="h-4 w-4" />{t('icplus.downloadClient')}
              </button>
              {config?.canSeeMargin && (
                <button onClick={() => download('detailed')} disabled={!!busy}
                  className="flex items-center gap-2 rounded border border-stroke px-4 py-2 font-medium text-black hover:border-primary dark:border-strokedark dark:text-white">
                  <Download className="h-4 w-4" />{t('icplus.downloadDetailed')}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className={muted ? 'text-body dark:text-bodydark' : 'text-black dark:text-white'}>{label}</span>
      <span className={`${bold ? 'font-semibold' : ''} ${muted ? 'text-body' : 'text-black dark:text-white'}`}>{value}</span>
    </div>
  );
}
