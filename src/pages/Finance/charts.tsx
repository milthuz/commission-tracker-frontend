// Module Finance — graphiques du Budget maître (SH-50, direction B choisie par la CFO).
// Palette validée (scripts du guide dataviz : bande de clarté, chroma, séparation daltonisme,
// contraste) en clair ET en sombre : revenus = orange Cluster foncé, dépenses = bleu.
// Montants complets (jamais en milliers) ; chaque barre et chaque point a une infobulle, au
// survol comme au clavier ; le relevé juste en dessous sert de vue tableau.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CARD, CARD_HEAD, CARD_SUB, CARD_TITLE } from '../../components/ui/surface';

// Teintes adoucies à la demande de la CFO (« less harsh », 2026-10-23) : saturation ramenée juste
// au-dessus du plancher du validateur — le plus doux qui reste distinguable pour les daltoniens et
// contrasté sur le fond, en clair comme en sombre (toutes les vérifications passent).
const REV_BG = 'bg-[#B8693F] dark:bg-[#C47A52]';
const SPEND_BG = 'bg-[#4A73BC] dark:bg-[#6C8ED2]';
const REV_INK = 'text-[#B8693F] dark:text-[#C47A52]';

type Money = (v: number) => string;

// Graduation « ronde » juste au-dessus du maximum (1 ; 1,2 ; 1,5 ; 2 ; 2,5 ; 3 ; 4 ; 5 ; 6 ; 8 × 10ⁿ),
// assez fine pour que les barres occupent la hauteur du graphique.
function niceMax(v: number) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * p >= v) || 10;
  return step * p;
}

// ---------------------------------------------------------------------------- tendance d'une tuile
export function Sparkline({ vals, months, money, label }: { vals: number[]; months: string[]; money: Money; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 240, h = 44, pad = 4;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (i: number) => (i / Math.max(1, vals.length - 1)) * w;
  const y = (v: number) => h - pad - ((v - lo) / ((hi - lo) || 1)) * (h - pad * 2);
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <div className="relative mt-2">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label={label} className={REV_INK}>
        <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="currentColor" opacity={0.14} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover != null && <circle cx={x(hover)} cy={y(vals[hover])} r={4} fill="currentColor" stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        {vals.map((_, i) => (
          <rect key={i} x={x(i) - w / vals.length / 2} y={0} width={w / vals.length} height={h} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#141414] px-2 py-1 text-[12px] font-semibold text-white shadow dark:bg-white dark:text-[#141414]"
          style={{ left: `${(x(hover) / w) * 100}%` }}>
          {months[hover]} · {money(vals[hover])}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------- revenus et dépenses
export function RevenueSpendChart({ months, revenue, spending, money, fy }: { months: string[]; revenue: number[]; spending: number[]; money: Money; fy: number }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const top = niceMax(Math.max(...revenue, ...spending));
  const pct = (v: number) => `${Math.max(0, (v / top) * 100).toFixed(2)}%`;
  return (
    <section className={`${CARD} flex flex-col`}>
      <div className={`${CARD_HEAD} flex flex-wrap items-center justify-between gap-3`}>
        <div className="min-w-0">
          <h2 className={CARD_TITLE}>{t('finance.charts.revSpend.title')}</h2>
          <p className={CARD_SUB}>{t('finance.charts.revSpend.sub', { fy })}</p>
        </div>
        <div className="flex gap-4 text-[13px] text-[#424242] dark:text-bodydark">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className={`h-3 w-3 rounded-[3px] ${REV_BG}`} />{t('finance.charts.revenue')}</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className={`h-3 w-3 rounded-[3px] ${SPEND_BG}`} />{t('finance.charts.spending')}</span>
        </div>
      </div>
      <div className="px-5 pb-4 pt-5">
        <div className="relative flex">
          {/* Axe : trois graduations discrètes (0, moitié, sommet). */}
          <div aria-hidden className="mr-2 flex h-[220px] w-[92px] shrink-0 flex-col justify-between text-right text-[11.5px] tabular-nums text-body dark:text-bodydark2">
            <span>{money(top)}</span><span>{money(top / 2)}</span><span>{money(0)}</span>
          </div>
          <div className="relative min-w-0 flex-1">
            <div aria-hidden className="pointer-events-none absolute inset-0 flex h-[220px] flex-col justify-between">
              <span className="border-t border-dashed border-[#E3E5E9] dark:border-[#2A2B2F]" /><span className="border-t border-dashed border-[#E3E5E9] dark:border-[#2A2B2F]" /><span className="border-t border-[#C9C9C5] dark:border-[#3A3C42]" />
            </div>
            <div className="relative flex h-[220px] items-end gap-1 sm:gap-2">
              {months.map((m, i) => (
                <button key={m} type="button"
                  aria-label={t('finance.charts.revSpend.point', { m, rev: money(revenue[i]), sp: money(spending[i]) })}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  className={`relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${hover === i ? 'bg-[#F4F5F7] dark:bg-[#1F2023]' : ''}`}>
                  <span className={`w-[32%] max-w-[22px] rounded-t-[4px] ${REV_BG}`} style={{ height: pct(revenue[i]) }} />
                  <span className={`w-[32%] max-w-[22px] rounded-t-[4px] ${SPEND_BG}`} style={{ height: pct(spending[i]) }} />
                </button>
              ))}
            </div>
            {hover != null && (
              <div className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-xl border border-stroke bg-white px-3 py-2 text-[12.5px] shadow-lg dark:border-strokedark dark:bg-boxdark"
                style={{ left: `${((hover + 0.5) / months.length) * 100}%` }}>
                <p className="m-0 font-bold text-black dark:text-white">{months[hover]}</p>
                <p className="m-0 mt-1 flex items-center gap-1.5 tabular-nums text-[#2B2B2B] dark:text-[#E4E4E7]"><span aria-hidden className={`h-2.5 w-2.5 rounded-[2px] ${REV_BG}`} />{t('finance.charts.revenue')} : {money(revenue[hover])}</p>
                <p className="m-0 flex items-center gap-1.5 tabular-nums text-[#2B2B2B] dark:text-[#E4E4E7]"><span aria-hidden className={`h-2.5 w-2.5 rounded-[2px] ${SPEND_BG}`} />{t('finance.charts.spending')} : {money(spending[hover])}</p>
                <p className="m-0 mt-1 font-semibold tabular-nums text-black dark:text-white">{t('finance.charts.gap')} : {money(revenue[hover] - spending[hover])}</p>
              </div>
            )}
            <div aria-hidden className="mt-2 flex gap-1 sm:gap-2">
              {months.map((m) => <span key={m} className="flex-1 truncate text-center text-[11.5px] text-body dark:text-bodydark2">{m}</span>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------- où va chaque dollar
export function DollarShare({ items, revenue, ebitda, money, pct, fy }: { items: { label: string; value: number }[]; revenue: number; ebitda: number; money: Money; pct: (percent: number) => string; fy: number }) {
  const { t } = useTranslation();
  const rows = items.filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...rows.map((x) => x.value));
  const share = (v: number) => (revenue ? pct((v / revenue) * 100) : '—');
  return (
    <section className={`${CARD} flex flex-col`}>
      <div className={CARD_HEAD}>
        <h2 className={CARD_TITLE}>{t('finance.charts.dollar.title')}</h2>
        <p className={CARD_SUB}>{t('finance.charts.dollar.sub', { fy })}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3.5 px-5 py-4">
        {rows.map((x) => (
          <li key={x.label} title={`${x.label} : ${money(x.value)}`}>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="min-w-0 truncate text-[#2B2B2B] dark:text-[#E4E4E7]">{x.label}</span>
              <span className="shrink-0 font-bold tabular-nums text-black dark:text-white">{share(x.value)}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-[#EEF0F3] dark:bg-[#26272B]">
              <div className={`h-2 rounded-full ${SPEND_BG}`} style={{ width: `${(x.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-3 border-t border-stroke pt-3 text-[14px] dark:border-strokedark">
          <span className="font-bold text-black dark:text-white">{t('finance.charts.dollar.left')}</span>
          <span className={`font-extrabold tabular-nums ${ebitda >= 0 ? 'text-[#067647] dark:text-[#57D193]' : 'text-[#B42318] dark:text-[#F46060]'}`}>{share(ebitda)}</span>
        </li>
      </ul>
    </section>
  );
}
