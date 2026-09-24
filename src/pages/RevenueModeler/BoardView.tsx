import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { buildRows, YEARS, type Inputs, type Model } from './model';

// Vue conseil du modélisateur — le P&L 5 ans en plein écran, épuré, prêt à projeter ou imprimer
// devant la direction (demande de David, 2026-09-24).
//
// ⚠️ INTERNE : cette vue montre les COÛTS de Cluster (réseau, achat des terminaux, marges). Elle
// n'est pas faite pour un client — la proposition de chaîne est le document client.
//
// Aucun calcul ici : tout vient de `model` (compute) et de buildRows, les mêmes que la page. Un
// chiffre de la vue conseil ne peut donc pas différer de celui du tableau.
//
// Rendue par un portail sur <body> : l'en-tête collant de l'application (z-999) passerait
// par-dessus, et un ancêtre à contexte d'empilement neutraliserait tout z-index (même raison que
// SaasIncreaseBoard).

type T = (k: string, o?: Record<string, unknown>) => string;

interface Props {
  inputs: Inputs;
  model: Model;
  t: T;
  locale: string;
  money: (n: number) => string;
  compact: (n: number) => string;
  num: (n: number, d?: number) => string;
  chart: React.ReactNode;
  onClose: () => void;
}

const YEAR_NUMS = Array.from({ length: YEARS }, (_, k) => k + 1);
const ORANGE = '#FE6523';

export default function BoardView({ inputs, model, t, locale, money, compact, num, chart, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // La page derrière ne doit pas défiler sous la vue.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const p = 'revenueModeler.board.';
  const today = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });

  // Le résultat par section = les sous-totaux du P&L, plus le profit net. Mêmes lignes que la page.
  const rows = buildRows(inputs, model, t, num);
  const results = rows.filter((r) => r.kind === 'subtotal' || r.kind === 'total');
  const sum = (a: number[]) => a.reduce((x, v) => x + v, 0);

  const stats: { label: string; value: string; sub?: string; accent?: boolean }[] = [
    { label: t('revenueModeler.pl.col.total', { n: YEARS }), value: compact(model.totalProfit), sub: money(model.totalProfit), accent: true },
    { label: t('revenueModeler.pl.col.year', { n: 1 }), value: compact(model.profitYear1), sub: t(p + 'y1Sub') },
    { label: t('revenueModeler.summary.laterYears', { n: YEARS }), value: compact(model.profitRecurring), sub: t(p + 'recSub') },
    { label: t('revenueModeler.summary.avgTitle'), value: compact(model.totalProfit / YEARS), sub: t('revenueModeler.summary.avg', { n: YEARS }) },
  ];

  // Hypothèses clés, en trois colonnes : ce qu'on facture, ce que ça nous coûte, ce qu'on verse.
  const pct = (v: number) => `${num(v, 6)} %`;
  // Prix UNITAIRE : les cents comptent (une garantie à 3,60 $ ne doit pas se lire « 4 $ »).
  // `money` arrondit au dollar — il est fait pour les totaux, pas pour les hypothèses.
  const unit = (v: number) => v.toLocaleString(locale, {
    style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2,
  });
  const per = (v: number, u: string) => `${unit(v)} ${u}`;
  const mo = t(p + 'perMonth');
  const assumptions: { title: string; items: [string, string][] }[] = [
    {
      title: t(p + 'prices'),
      items: [
        [t('revenueModeler.in.saasPerLoc'), per(inputs.saasPerLoc, t(p + 'perLocMonth'))],
        [t('revenueModeler.in.markupRate'), pct(inputs.markupRate)],
        [t('revenueModeler.in.txnFeeCredit'), `${num(inputs.txnFeeCredit, 6)} $`],
        [t('revenueModeler.in.txnFeeInterac'), `${num(inputs.txnFeeInterac, 6)} $`],
        [t('revenueModeler.in.termRentalRev'), per(inputs.termRentalRev, mo)],
        [t('revenueModeler.in.hwPrice'), unit(inputs.hwPrice)],
        [t('revenueModeler.in.instPrice'), unit(inputs.instPrice)],
      ],
    },
    {
      title: t(p + 'costs'),
      items: [
        [t('revenueModeler.in.creditCostPct'), pct(inputs.creditCostPct)],
        [t('revenueModeler.in.creditCostPerTxn'), `${num(inputs.creditCostPerTxn, 6)} $`],
        [t('revenueModeler.in.interacCostPct'), pct(inputs.interacCostPct || 0)],
        [t('revenueModeler.in.interacCostPerTxn'), `${num(inputs.interacCostPerTxn, 6)} $`],
        [t('revenueModeler.in.termWarrantyCost'), per(inputs.termWarrantyCost, mo)],
        [t('revenueModeler.in.termUnitCost'), unit(inputs.termUnitCost)],
        [t('revenueModeler.in.hwCost'), unit(inputs.hwCost)],
        [t('revenueModeler.in.instCost'), unit(inputs.instCost)],
      ],
    },
    {
      title: t(p + 'commissions'),
      items: [
        [t('revenueModeler.in.commSaasMonths'), `${num(inputs.commSaasMonths, 2)} ${t('revenueModeler.unit.months')}`],
        [t('revenueModeler.in.commPayPerLoc'), unit(inputs.commPayPerLoc)],
        [t('revenueModeler.in.commHwPct'), `${num(inputs.commHwPct, 2)} %`],
        [t('revenueModeler.in.commInstPct'), `${num(inputs.commInstPct, 2)} %`],
        [t(p + 'commTotal'), money(model.commissionsYear1)],
      ],
    },
  ];

  const investment: [string, number][] = [
    [t(p + 'termBuy'), model.terminalPurchaseCost],
    [t(p + 'commY1'), model.commissionsYear1],
  ];

  const card = 'rounded-2xl border border-gray-200 bg-white';
  const eyebrow = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400';

  return createPortal(
    <div className="fixed inset-0 z-[100000] overflow-y-auto bg-gray-100 print:static print:overflow-visible print:bg-white">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .rm-board, .rm-board * { visibility: visible !important; }
          .rm-board { position: absolute !important; left: 0; top: 0; width: 100%; }
          .rm-board, .rm-board * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .rm-board-block { break-inside: avoid; page-break-inside: avoid; }
          .rm-board-break { break-before: page; page-break-before: always; }
          .rm-board tr { break-inside: avoid; }
          @page { size: letter landscape; margin: 12mm; }
        }
      `}</style>

      <div className="rm-board">
        {/* Barre d'outils, écran seulement. */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white/90 px-6 py-3 backdrop-blur print:hidden">
          <div className="text-sm font-medium text-gray-900">{t(p + 'title')}</div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90" style={{ background: ORANGE }}>
              <Printer className="h-4 w-4" />{t(p + 'print')}
            </button>
            <button type="button" onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <X className="h-4 w-4" />{t(p + 'close')}
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-[1180px] px-6 py-8 text-gray-900 print:max-w-none print:px-0 print:py-0">
          {/* ── En-tête ── */}
          <header className="rm-board-block mb-6">
            <div className={eyebrow}>{t(p + 'eyebrow')}</div>
            <h1 className="mt-2 text-[34px] font-semibold leading-tight">{inputs.merchantName || t('revenueModeler.title')}</h1>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {[
                t('revenueModeler.badge.locs', { n: num(inputs.numLocs) }),
                t('revenueModeler.badge.terms', { n: num(model.totalTerminals) }),
                t('revenueModeler.badge.gmv', { v: compact(model.gmvTotal) }),
                t('revenueModeler.badge.saas', { v: money(inputs.saasPerLoc) }),
              ].map((b) => <span key={b} className="rounded-full bg-gray-200 px-2.5 py-0.5">{b}</span>)}
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 font-medium text-red-700">{t('revenueModeler.confidential')}</span>
              <span className="px-1 py-0.5 text-gray-500">{today}</span>
            </div>
          </header>

          {/* ── Les grands chiffres ── */}
          <section className="rm-board-block mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className={`${card} p-5 ${s.accent ? 'ring-2 ring-[#FE6523]/40' : ''}`}>
                <div className={eyebrow}>{s.label}</div>
                <div className={`mt-2 font-semibold tabular-nums ${s.accent ? 'text-[34px]' : 'text-[26px]'}`}
                  style={{ color: s.accent ? ORANGE : undefined }}>{s.value}</div>
                {s.sub && <div className="mt-1 text-xs text-gray-500">{s.sub}</div>}
              </div>
            ))}
          </section>

          {/* ── Résultat par section et par année ── */}
          <section className={`${card} rm-board-block mb-6 overflow-x-auto p-5`}>
            <h2 className="mb-3 text-base font-semibold">{t(p + 'results')}</h2>
            <table className="w-full min-w-[760px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="py-2 pr-3 font-medium" />
                  {YEAR_NUMS.map((n) => <th key={n} className="px-2 py-2 text-right font-medium">{t('revenueModeler.pl.col.year', { n })}</th>)}
                  <th className="py-2 pl-3 text-right font-semibold">{t('revenueModeler.pl.col.total', { n: YEARS })}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const total = sum(r.y);
                  const isTotal = r.kind === 'total';
                  const cls = (v: number) => (v < -0.5 ? 'text-red-700' : isTotal ? '' : 'text-gray-900');
                  return (
                    <tr key={i} className={isTotal ? 'border-t-[3px] border-double border-gray-300 text-[15px] font-bold' : 'border-b border-gray-100'}>
                      <td className="py-2 pr-3">{r.label}</td>
                      {r.y.map((v, j) => (
                        <td key={j} className={`whitespace-nowrap px-2 py-2 text-right ${cls(v)}`}
                          style={isTotal && v >= 0 ? { color: ORANGE } : undefined}>{money(v)}</td>
                      ))}
                      <td className={`whitespace-nowrap py-2 pl-3 text-right font-semibold ${cls(total)}`}
                        style={isTotal && total >= 0 ? { color: ORANGE } : undefined}>{money(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* ── Composition + investissement de l'an 1 ── */}
          <section className="rm-board-block mb-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className={`${card} p-5`}>
              <h2 className="mb-1 text-base font-semibold">{t('revenueModeler.chart.title')}</h2>
              <p className="mb-2 text-xs text-gray-500">{t('revenueModeler.chart.hint')}</p>
              {chart}
            </div>
            <div className={`${card} p-5`}>
              <h2 className="mb-3 text-base font-semibold">{t(p + 'investment')}</h2>
              <dl className="space-y-3 text-sm">
                {investment.map(([label, v]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 border-b border-gray-100 pb-2">
                    <dt className="text-gray-600">{label}</dt>
                    <dd className="whitespace-nowrap font-semibold tabular-nums text-red-700">{money(-v)}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-3 pt-1">
                  <dt className="text-gray-600">{t(p + 'payback')}</dt>
                  <dd className="whitespace-nowrap font-semibold tabular-nums">
                    {model.paybackMonths === null ? t('revenueModeler.kpi.noPayback') : t(p + 'months', { n: num(model.paybackMonths, 1) })}
                  </dd>
                </div>
              </dl>
              {(model.alerts.installLoss || model.alerts.interacLow) && (
                <div className="mt-4 space-y-2">
                  {model.alerts.installLoss && (
                    <div className="rounded-lg border-l-4 border-[#BA7517] bg-amber-50 p-2.5 text-xs">
                      <b>{t('revenueModeler.alert.installTitle')}</b>
                    </div>
                  )}
                  {model.alerts.interacLow && (
                    <div className="rounded-lg border-l-4 border-[#BA7517] bg-amber-50 p-2.5 text-xs">
                      <b>{t('revenueModeler.alert.interacTitle')}</b> — {money(model.netInterac)} / {t(p + 'year')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ── Hypothèses ── */}
          <section className={`${card} rm-board-block p-5`}>
            <h2 className="mb-3 text-base font-semibold">{t(p + 'assumptions')}</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {assumptions.map((g) => (
                <div key={g.title}>
                  <div className={`${eyebrow} mb-2`}>{g.title}</div>
                  <dl className="space-y-1.5 text-[13px]">
                    {g.items.map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3">
                        <dt className="text-gray-600">{k}</dt>
                        <dd className="whitespace-nowrap font-medium tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </section>

          <p className="mt-6 text-center text-[11px] text-gray-400">{t('revenueModeler.footer', { date: today })}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
