import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';

// Pistes reçues par période, empilées par source (2026-10-13, demande de David) : par MOIS par
// défaut, par SEMAINE (lundi → dimanche) au besoin. Les séries viennent de /api/leads/stats
// (`chart.month` / `chart.week`, découpées à l'heure de Montréal) ; ici on comble les périodes
// vides pour que le temps ne soit jamais tassé.
//
// Couleur = la SOURCE, jamais son rang : chaque source garde sa case de la palette catégorielle de
// référence (skill dataviz), dans un ordre fixe validé par le vérificateur (clair sur #ffffff,
// sombre sur la surface boxdark #24303F). Trois teintes claires et le vert sombre sont sous 3:1 :
// la bulle au survol, la légende et la vue Tableau sont l'appui exigé.

export interface ChartPoint { period: string; source: string; n: number }

const ORDER = ['partner', 'website', 'event', 'phone', 'opener', 'referral', 'walk_in', 'other'];
const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
// Partagés avec le tableau « par représentant » : une source a la MÊME couleur partout.
export const SOURCE_ORDER = ORDER;
export const sourceColor = (source: string, dark: boolean) => (dark ? DARK : LIGHT)[Math.max(0, ORDER.indexOf(source)) % 8];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

// Toutes les périodes de la plage, vides comprises.
function periods(unit: 'month' | 'week', from: string, to: string): string[] {
  const out: string[] = [];
  const end = parse(to);
  let d = parse(from);
  if (unit === 'month') d = new Date(d.getFullYear(), d.getMonth(), 1);
  else d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  while (d <= end && out.length < 400) {
    out.push(ymd(d));
    d = unit === 'month' ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  }
  return out;
}

// Le thème suit le réglage unique de l'app EN DIRECT (lib/theme).
import { useIsDark } from '../../lib/theme';
export { useIsDark };

const LeadsChart = ({ chart, from, to, hidden, onHiddenChange }: {
  chart: { week: ChartPoint[]; month: ChartPoint[] } | undefined; from: string; to: string;
  // Les sources décochées vivent dans la PAGE : le bouton d'export les applique aux graphiques Excel.
  hidden: Set<string>; onHiddenChange: (h: Set<string>) => void;
}) => {
  const { t, i18n } = useTranslation();
  const loc = i18n.language?.startsWith('fr') ? 'fr-CA' : 'en-CA';
  const [unit, setUnit] = useState<'month' | 'week'>('month');
  const [asTable, setAsTable] = useState(false);
  // Le filtre PROPRE au graphique (David, 2026-10-13) : les sources décochées sortent des colonnes,
  // de la bulle et du tableau. Gardé en passant mois ↔ semaine ; le filtre de la barre du haut,
  // lui, restreint déjà ce que le serveur renvoie.
  const dark = useIsDark();

  const data = useMemo(() => {
    const rows = chart?.[unit] || [];
    const cats = periods(unit, from, to);
    const present = ORDER.filter((s) => rows.some((r) => r.source === s && r.n > 0));
    const extra = [...new Set(rows.map((r) => r.source))].filter((s) => !ORDER.includes(s));
    const sources = [...present, ...extra];
    const at = new Map(rows.map((r) => [`${r.period}|${r.source}`, r.n]));
    const series = sources.filter((s) => !hidden.has(s))
      .map((s) => ({ source: s, data: cats.map((p) => at.get(`${p}|${s}`) || 0) }));
    const totals = cats.map((_, i) => series.reduce((a, x) => a + x.data[i], 0));
    return { cats, series, totals, sources };
  }, [chart, unit, from, to, hidden]);
  const toggle = (k: string) => {
    const n = new Set(hidden);
    if (n.has(k)) n.delete(k); else n.add(k);
    onHiddenChange(n);
  };

  const label = (p: string) => (unit === 'month'
    ? parse(p).toLocaleDateString(loc, { month: 'short', year: 'numeric' })
    : parse(p).toLocaleDateString(loc, { day: 'numeric', month: 'short' }));
  const longLabel = (p: string) => (unit === 'month'
    ? parse(p).toLocaleDateString(loc, { month: 'long', year: 'numeric' })
    : t('leads.stats.chart.weekOf', { date: parse(p).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }) }) as string);
  const srcName = (s: string) => t(`leads.source.${s}`, { defaultValue: s }) as string;
  const colorOf = (s: string) => (dark ? DARK : LIGHT)[Math.max(0, ORDER.indexOf(s)) % 8];

  const ink = dark ? '#AEB7C0' : '#64748B';
  const surface = dark ? '#24303F' : '#FFFFFF';
  const options: ApexOptions = {
    chart: { type: 'bar', stacked: true, fontFamily: 'Satoshi, sans-serif', toolbar: { show: false }, zoom: { enabled: false }, background: 'transparent', animations: { enabled: false } },
    theme: { mode: dark ? 'dark' : 'light' },
    colors: data.series.map((x) => colorOf(x.source)),
    dataLabels: { enabled: false },
    // Couleurs PLEINES : la transparence par défaut d'Apex délave la palette validée.
    fill: { opacity: 1 },
    // Un fin liseré de la couleur de la surface sépare les segments empilés.
    stroke: { show: true, width: 2, colors: [surface] },
    plotOptions: { bar: { columnWidth: data.cats.length > 30 ? '85%' : '60%', borderRadius: 4, borderRadiusApplication: 'end', borderRadiusWhenStacked: 'last' } },
    grid: { borderColor: dark ? '#2E3A47' : '#E2E8F0', strokeDashArray: 4, xaxis: { lines: { show: false } } },
    // La légende, ce sont les pastilles de source au-dessus (elles filtrent en plus).
    legend: { show: false },
    xaxis: {
      // Au plus ~12 étiquettes : sur 26 semaines elles se chevaucheraient. La bulle donne la date complète.
      categories: data.cats.map((p, i) => (i % Math.max(1, Math.ceil(data.cats.length / 12)) === 0 ? label(p) : '')),
      labels: { rotate: -45, hideOverlappingLabels: true, style: { colors: ink, fontSize: '11px' } },
      axisBorder: { show: false }, axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: { min: 0, forceNiceScale: true, labels: { formatter: (v: number) => String(Math.round(v)), style: { colors: ink } } },
    tooltip: {
      shared: true, intersect: false, theme: dark ? 'dark' : 'light',
      x: { formatter: (_v: number, o?: { dataPointIndex: number }) => {
        const i = o?.dataPointIndex ?? 0;
        return `${longLabel(data.cats[i])} — ${t('leads.stats.chart.total', { n: data.totals[i] })}`;
      } },
      y: { formatter: (v: number) => String(v) },
    },
    states: { hover: { filter: { type: 'none' } } as never },
  };

  const BTN = (on: boolean) => `rounded px-3 py-1 text-xs font-medium ${on ? 'bg-primary text-white' : 'text-bodydark2 hover:text-black dark:hover:text-white'}`;
  const empty = !data.series.length;
  const nothingAtAll = !data.sources.length;

  return (
    <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark lg:col-span-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-black dark:text-white">{t('leads.stats.chart.title')}</h3>
          <p className="text-xs text-bodydark2">{t('leads.stats.chart.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded border border-stroke p-0.5 dark:border-strokedark">
            <button type="button" className={BTN(unit === 'month')} onClick={() => setUnit('month')}>{t('leads.stats.chart.byMonth')}</button>
            <button type="button" className={BTN(unit === 'week')} onClick={() => setUnit('week')}>{t('leads.stats.chart.byWeek')}</button>
          </span>
          <span className="inline-flex rounded border border-stroke p-0.5 dark:border-strokedark">
            <button type="button" className={BTN(!asTable)} onClick={() => setAsTable(false)}>{t('leads.stats.chart.graph')}</button>
            <button type="button" className={BTN(asTable)} onClick={() => setAsTable(true)}>{t('leads.stats.chart.table')}</button>
          </span>
        </div>
      </div>

      {!nothingAtAll && (
        <div className="mb-2 flex flex-wrap items-center gap-2" role="group" aria-label={t('leads.stats.chart.filterSources') as string}>
          {data.sources.map((k) => {
            const on = !hidden.has(k);
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => toggle(k)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  on ? 'border-stroke text-black dark:border-strokedark dark:text-white' : 'border-dashed border-stroke text-bodydark2 line-through dark:border-strokedark'}`}>
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: on ? colorOf(k) : 'transparent', boxShadow: on ? 'none' : `inset 0 0 0 1.5px ${colorOf(k)}` }} />
                {srcName(k)}
              </button>
            );
          })}
          {hidden.size > 0 && (
            <button type="button" onClick={() => onHiddenChange(new Set())} className="text-xs font-medium text-primary hover:underline">
              {t('leads.stats.chart.allSources')}
            </button>
          )}
        </div>
      )}

      {empty ? (
        <p className="py-12 text-center text-sm text-bodydark2">{nothingAtAll ? t('leads.stats.noData') : t('leads.stats.chart.allHidden')}</p>
      ) : asTable ? (
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full min-w-[520px] table-auto text-sm">
            <thead className="sticky top-0 bg-white dark:bg-boxdark">
              <tr className="text-left text-xs text-bodydark2">
                <th className="pb-2 font-medium">{unit === 'month' ? t('leads.stats.chart.month') : t('leads.stats.chart.week')}</th>
                {data.series.map((x) => (
                  <th key={x.source} className="pb-2 text-right font-medium">
                    <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorOf(x.source) }} />
                    {srcName(x.source)}
                  </th>
                ))}
                <th className="pb-2 text-right font-medium">{t('leads.stats.chart.totalCol')}</th>
              </tr>
            </thead>
            <tbody>
              {data.cats.map((p, i) => (
                <tr key={p} className="border-t border-stroke dark:border-strokedark">
                  <td className="py-1.5 text-black dark:text-white">{longLabel(p)}</td>
                  {data.series.map((x) => <td key={x.source} className="py-1.5 text-right text-black dark:text-white">{x.data[i] || '—'}</td>)}
                  <td className="py-1.5 text-right font-medium text-black dark:text-white">{data.totals[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ReactApexChart key={`${unit}-${dark}`} type="bar" height={300} options={options}
          series={data.series.map((x) => ({ name: srcName(x.source), data: x.data }))} />
      )}
    </div>
  );
};

export default LeadsChart;
