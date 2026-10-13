import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../components/Select';
import { LEAD_SOURCES, authHeaders } from './types';

const API_URL = import.meta.env.VITE_API_URL;

// Filtres du rapport des pistes (2026-10-13, demande de David) : source + période. La période se
// choisit en mots (cette semaine, mois dernier…) ou se fixe précisément (une semaine, un mois, une
// année, une plage libre) ; l'écran la traduit TOUJOURS en deux dates incluses `from`/`to`, que le
// serveur compte en journées de Montréal. Semaine = lundi → dimanche.

export interface StatsQuery { from: string; to: string; source: string }

type Preset = 'this_week' | 'last_week' | 'week' | 'this_month' | 'last_month' | 'month' | 'this_quarter'
  | 'this_year' | 'last_year' | 'year' | 'last_3m' | 'last_6m' | 'last_12m' | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

export function rangeFor(p: Preset, opts: { weekDay: string; month: number; year: number; from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (p) {
    case 'this_week': { const s = monday(today); return { from: ymd(s), to: ymd(addDays(s, 6)) }; }
    case 'last_week': { const s = addDays(monday(today), -7); return { from: ymd(s), to: ymd(addDays(s, 6)) }; }
    case 'week': { const s = monday(parse(opts.weekDay || ymd(today))); return { from: ymd(s), to: ymd(addDays(s, 6)) }; }
    case 'this_month': return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
    case 'last_month': return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case 'month': return { from: ymd(new Date(opts.year, opts.month, 1)), to: ymd(new Date(opts.year, opts.month + 1, 0)) };
    case 'this_quarter': { const q = Math.floor(m / 3) * 3; return { from: ymd(new Date(y, q, 1)), to: ymd(new Date(y, q + 3, 0)) }; }
    case 'this_year': return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'last_year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'year': return { from: `${opts.year}-01-01`, to: `${opts.year}-12-31` };
    case 'last_3m': return { from: ymd(new Date(y, m - 3, today.getDate())), to: ymd(today) };
    case 'last_6m': return { from: ymd(new Date(y, m - 6, today.getDate())), to: ymd(today) };
    case 'last_12m': return { from: ymd(new Date(y - 1, m, today.getDate())), to: ymd(today) };
    case 'custom': default: return { from: opts.from, to: opts.to };
  }
}

const SELECT_BTN = 'rounded border border-stroke bg-transparent px-4 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4';
const INPUT = 'rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4 dark:text-white';

const StatsFilters = ({ onChange, canExport = false }: { onChange: (q: StatsQuery) => void; canExport?: boolean }) => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');
  const now = new Date();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [source, setSource] = useState('');
  const [weekDay, setWeekDay] = useState(ymd(now));
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(ymd(now));

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const range = useMemo(() => rangeFor(preset, { weekDay, month, year, from, to }), [preset, weekDay, month, year, from, to]);
  const valid = !!range.from && !!range.to && range.from <= range.to;

  useEffect(() => {
    if (valid) onChange({ from: range.from, to: range.to, source });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [range.from, range.to, source, valid]);

  // L'export : les MÊMES filtres que l'écran, dans la langue de l'interface. Téléchargé par fetch
  // (le jeton part dans l'en-tête, jamais dans l'adresse), puis remis au navigateur.
  const exportXlsx = async () => {
    if (!valid) return;
    setExporting(true); setExportError(null);
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to, lang: fr ? 'fr' : 'en' });
      if (source) qs.set('source', source);
      const res = await fetch(`${API_URL}/api/leads/stats/export?${qs}`, { headers: authHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setExportError(d.error === 'demo_mode' ? t('leads.stats.exportDemo') as string : (d.error || t('leads.stats.exportFailed') as string));
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'leads-report.xlsx';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setExportError((e as Error).message); } finally { setExporting(false); }
  };

  // Les salons et le portail partenaire existent depuis 2023 (migration du portail).
  const years = Array.from({ length: now.getFullYear() - 2022 }, (_, i) => now.getFullYear() - i);
  const monthName = (i: number) => new Date(2026, i, 1).toLocaleString(fr ? 'fr-CA' : 'en-CA', { month: 'long' });
  const label = (d: string) => parse(d).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short', year: 'numeric' });
  const PRESETS: Preset[] = ['this_week', 'last_week', 'week', 'this_month', 'last_month', 'month', 'this_quarter',
    'this_year', 'last_year', 'year', 'last_3m', 'last_6m', 'last_12m', 'custom'];

  return (
    <div className="mb-5 rounded-sm border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={source} onChange={setSource} buttonClassName={SELECT_BTN}
          options={[{ value: '', label: t('leads.filters.allSources') as string },
            ...[...LEAD_SOURCES, 'partner'].map((s) => ({ value: s, label: t(`leads.source.${s}`, { defaultValue: s }) as string }))]} />
        <Select value={preset} onChange={(v) => setPreset(v as Preset)} buttonClassName={SELECT_BTN}
          options={PRESETS.map((p) => ({ value: p, label: t(`leads.stats.period.${p}`) as string }))} />

        {preset === 'week' && (
          <label className="flex items-center gap-2 text-sm text-bodydark2">
            {t('leads.stats.period.weekOf')}
            <input type="date" className={INPUT} value={weekDay} onChange={(e) => e.target.value && setWeekDay(e.target.value)} />
          </label>
        )}
        {preset === 'month' && (
          <Select value={String(month)} onChange={(v) => setMonth(Number(v))} buttonClassName={SELECT_BTN}
            options={Array.from({ length: 12 }, (_, i) => ({ value: String(i), label: monthName(i) }))} />
        )}
        {(preset === 'month' || preset === 'year') && (
          <Select value={String(year)} onChange={(v) => setYear(Number(v))} buttonClassName={SELECT_BTN}
            options={years.map((y) => ({ value: String(y), label: String(y) }))} />
        )}
        {preset === 'custom' && (
          <>
            <input type="date" className={INPUT} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label={t('leads.stats.period.from') as string} />
            <span className="text-sm text-bodydark2">→</span>
            <input type="date" className={INPUT} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label={t('leads.stats.period.to') as string} />
          </>
        )}

        <span className={`ml-auto text-sm ${valid ? 'text-bodydark2' : 'text-danger'}`}>
          {valid ? `${label(range.from)} → ${label(range.to)}` : t('leads.stats.period.invalid')}
        </span>
        {canExport && (
          <button type="button" onClick={exportXlsx} disabled={!valid || exporting}
            className="inline-flex items-center gap-2 rounded border border-stroke px-4 py-2 text-sm font-medium text-black hover:bg-gray-2 disabled:opacity-50 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            {exporting ? t('leads.stats.exporting') : t('leads.stats.export')}
          </button>
        )}
      </div>
      {exportError && <p className="mt-2 text-sm text-danger">{exportError}</p>}
    </div>
  );
};

export default StatsFilters;
