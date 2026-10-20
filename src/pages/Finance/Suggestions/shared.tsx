// Module Finance — lot F : briques communes (libellés de drivers, mise en forme par unité,
// pastille de confiance, graphique d'historique).
import { useTranslation } from 'react-i18next';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { StatusPill, type StatusFamily } from '../../../components/ui';
import { useIsDark } from '../../../lib/theme';
import type { Formatter } from '../format';
import type { Confidence, Unit } from './api';
import type { ChartData } from './logic';

export function useDriverLabel() {
  const { t } = useTranslation();
  return (key: string) => t(`finance.suggestions.drivers.${key}`, { defaultValue: key });
}

/** Valeur d'un driver selon son unité : compte, montant, ou pourcentage (croissance mensuelle, part). */
export function fmtUnit(fmt: Formatter, unit: Unit, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (unit === 'count') return fmt.fmt(v, 'n');
  if (unit === 'money') return fmt.fmt(v, '$');
  return `${fmt.two.format(v)}${fmt.fr ? ' %' : '%'}`;
}

const FAMILY: Record<Confidence, StatusFamily> = { high: 'ok', medium: 'wait', low: 'neutral' };
export const ConfidencePill = ({ level }: { level: Confidence }) => {
  const { t } = useTranslation();
  return <StatusPill family={FAMILY[level]}>{t(`finance.suggestions.conf.${level}`)}</StatusPill>;
};

/** Mois « 2026-09 » → « sept. 2026 » dans la langue de l'usager. */
export function monthLabel(m: string, loc: string): string {
  const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1));
  return Number.isNaN(d.getTime()) ? m : d.toLocaleString(loc, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function HistoryChart({ data, fmt, unit, labels }: { data: ChartData; fmt: Formatter; unit: Unit; labels: { history: string; suggested: string; current: string; aria: string } }) {
  const dark = useIsDark();
  const ink = dark ? '#C7C9D1' : '#475467';
  const options: ApexOptions = {
    chart: { type: 'line', toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'inherit', background: 'transparent' },
    stroke: { width: [2, 3, 2], curve: 'straight', dashArray: [0, 0, 5] },
    colors: [dark ? '#98A2B3' : '#667085', '#F58345', dark ? '#7FB2FF' : '#2E6BD8'],
    markers: { size: [0, 3, 0] },
    dataLabels: { enabled: false },
    grid: { borderColor: dark ? '#26272B' : '#E2E8F0', strokeDashArray: 4, xaxis: { lines: { show: false } } },
    legend: { show: true, position: 'top', horizontalAlign: 'left', labels: { colors: ink } },
    xaxis: {
      categories: data.categories,
      tickAmount: 12,
      axisBorder: { show: false }, axisTicks: { show: false },
      labels: { rotate: -45, hideOverlappingLabels: true, style: { colors: ink, fontSize: '10px' }, formatter: (v: string) => (typeof v === 'string' && v.length === 7 ? `${v.slice(2, 4)}-${v.slice(5)}` : v) },
    },
    yaxis: { labels: { style: { colors: ink }, formatter: (v: number) => fmtUnit(fmt, unit, v) } },
    tooltip: { theme: dark ? 'dark' : 'light', shared: true, intersect: false, y: { formatter: (v: number) => fmtUnit(fmt, unit, v) } },
  };
  const series = [
    { name: labels.history, data: data.history },
    { name: labels.suggested, data: data.suggested },
    { name: labels.current, data: data.current },
  ];
  return (
    <div role="img" aria-label={labels.aria}>
      <ReactApexChart type="line" height={240} options={options} series={series as ApexAxisChartSeries} />
    </div>
  );
}
