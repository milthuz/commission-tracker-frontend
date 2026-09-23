import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import {
  AlertTriangle, ChevronDown, Download, Link2, Printer, RotateCcw, Save, Settings2, Trash2,
} from 'lucide-react';
import Select from '../../components/Select';
import { ContentLoader } from '../../common/Loader';
import { buildRows, compute, INTERAC_ALERT_FLOOR, upgradeInputs, type Inputs, type NumKey, type Row } from './model';

// Modélisateur de revenus — P&L sur 3 ans de l'intégration d'une chaîne.
//
// Tout se recalcule dans le navigateur à chaque frappe (model.ts). Le serveur ne fournit que
// les valeurs par défaut — ce sont les COÛTS de Cluster, qu'on ne veut pas dans le bundle
// public — et garde les scénarios nommés. Un scénario se partage par son identifiant, jamais
// en mettant le volume d'un marchand dans l'URL.

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

interface Scenario { id: string; name: string; inputs: Inputs; mine: boolean; owner: string; updatedAt: string }

const CARD = 'rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark';
const ORANGE = '#FE6523';
const INPUT_CLS = 'w-full rounded border border-stroke bg-transparent px-2.5 py-1.5 text-sm text-black outline-none transition focus:border-[#FE6523] focus:ring-2 focus:ring-[#FE6523]/15 dark:border-strokedark dark:bg-form-input dark:text-white';

// ── Saisie numérique ─────────────────────────────────────────────────────────────────────
// Champ texte et non `type=number` : ce dernier refuse la virgule décimale selon la langue du
// NAVIGATEUR, pas celle de la page — un rep francophone sur un Chrome anglais ne pourrait pas
// taper « 0,08 ». Le brouillon est local ; la valeur remonte dès qu'elle se lit comme un nombre.
function parseNum(s: string): number | null {
  const clean = s.replace(/[\s\u00a0\u202f$%]/g, '').replace(',', '.');
  if (clean === '' || clean === '.' || clean === '-') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function NumField({ label, value, onChange, unit, decimals = 0, locale, highlight }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string;
  decimals?: number; locale: string; highlight?: string;
}) {
  // Jusqu'à 6 décimales : un frais de 0,0365 $ doit se relire 0,0365, pas 0,037 (David, 2026-09-23).
  // maximumFractionDigits n'ajoute pas de zéros : 4 679 reste 4 679.
  const show = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: Math.max(decimals, 6), useGrouping: true });
  const [draft, setDraft] = useState(() => show(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(show(value)); }, [value, focused, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className={`block ${highlight ? 'rounded border-l-2 border-[#FE6523] bg-[#FE6523]/5 py-1 pl-2' : ''}`}>
      <span className="mb-1 flex items-baseline justify-between gap-2 text-xs text-body dark:text-bodydark">
        <span>{label}</span>
        {highlight && <span className="text-[10px] font-semibold uppercase tracking-wide text-[#FE6523]">{highlight}</span>}
      </span>
      {/* L'unité est un SUFFIXE dans le flux, pas une étiquette posée par-dessus le champ : une
          marge fixe (pr-12) laissait « months » ou « $/mois » chevaucher le chiffre. Ici le
          champ rétrécit de la largeur réelle de l'unité, quelle que soit la langue. */}
      <div className="flex items-center rounded border border-stroke transition focus-within:border-[#FE6523] focus-within:ring-2 focus-within:ring-[#FE6523]/15 dark:border-strokedark dark:bg-form-input">
        <input
          type="text" inputMode="decimal" value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setDraft(show(value)); }}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = parseNum(e.target.value);
            if (n !== null && n >= 0) onChange(n);
          }}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-right text-sm tabular-nums text-black outline-none dark:text-white"
        />
        {unit && <span className="shrink-0 whitespace-nowrap pr-2.5 text-xs text-body dark:text-bodydark">{unit}</span>}
      </div>
    </label>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-stroke last:border-b-0 dark:border-strokedark">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-black dark:text-white">
        <span className="shrink-0">{title}</span>
        <span className="h-px flex-1 bg-stroke dark:bg-strokedark" />
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────────────────
export default function RevenueModeler() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'fr';
  const locale = lang === 'en' ? 'en-CA' : 'fr-CA';
  const [params, setParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<Inputs | null>(null);
  const [tiers, setTiers] = useState<number[]>([89, 119, 149]);
  // Édition des paliers : décidée par le serveur (revmodel:settings), jamais lue du jeton.
  const [canEditTiers, setCanEditTiers] = useState(false);
  const [tierDraft, setTierDraft] = useState<number[] | null>(null);
  const [tierBusy, setTierBusy] = useState(false);
  const [tierErr, setTierErr] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Inputs | null>(null);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [active, setActive] = useState<Scenario | null>(null);
  const [saveName, setSaveName] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setStatus({ kind, text });
    window.setTimeout(() => setStatus((s) => (s && s.text === text ? null : s)), 4000);
  };

  const loadList = async () => {
    const r = await fetch(`${API_URL}/api/revenue-model/scenarios`, { headers: authHeaders() });
    if (r.ok) setScenarios((await r.json()).scenarios || []);
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/revenue-model/defaults`, { headers: authHeaders() });
        if (r.status === 403) { setFatal(t('revenueModeler.noAccess') as string); return; }
        if (!r.ok) throw new Error();
        const d = await r.json();
        setDefaults(d.defaults);
        if (Array.isArray(d.saasTiers)) setTiers(d.saasTiers);
        setCanEditTiers(d.canEditSettings === true);
        let start: Inputs = d.defaults;
        const sid = params.get('scenario');
        if (sid) {
          const s = await fetch(`${API_URL}/api/revenue-model/scenarios/${encodeURIComponent(sid)}`, { headers: authHeaders() });
          if (s.ok) {
            const sc: Scenario = (await s.json()).scenario;
            start = { ...d.defaults, ...upgradeInputs(sc.inputs) };
            setActive(sc);
            setSaveName(sc.mine ? sc.name : '');
          } else {
            flash('err', t('revenueModeler.scenarioNotFound') as string);
          }
        }
        setInputs(start);
        await loadList();
      } catch {
        setFatal(t('revenueModeler.loadError') as string);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const model = useMemo(() => (inputs ? compute(inputs) : null), [inputs]);

  // Le nom du marchand suit dans le titre de l'onglet (et donc dans le nom du PDF imprimé).
  useEffect(() => {
    if (!inputs) return;
    const prev = document.title;
    document.title = `${inputs.merchantName || t('revenueModeler.title')} — ${t('revenueModeler.title')} | Sales Hub`;
    return () => { document.title = prev; };
  }, [inputs?.merchantName, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <ContentLoader />;
  if (fatal || !inputs || !model || !defaults) {
    return <div className={`${CARD} p-8 text-center text-sm text-danger`}>{fatal || t('revenueModeler.loadError')}</div>;
  }

  // ── Formatage ──
  const money = (n: number) => {
    const s = Math.abs(n).toLocaleString(locale, { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
    return n < -0.5 ? `−${s}` : s;
  };
  const compact = (n: number) => {
    const a = Math.abs(n);
    const body = a >= 1e6 ? `${(a / 1e6).toLocaleString(locale, { maximumFractionDigits: 2 })} M`
      : a >= 1e3 ? `${Math.round(a / 1e3).toLocaleString(locale)} k` : Math.round(a).toLocaleString(locale);
    const s = lang === 'en' ? `$${body.replace(' ', '')}` : `${body} $`;
    return n < -0.5 ? `−${s}` : s;
  };
  const num = (n: number, d = 0) => n.toLocaleString(locale, { maximumFractionDigits: d });

  const set = (k: NumKey) => (v: number) => setInputs((p) => (p ? { ...p, [k]: v } : p));
  const f = (k: NumKey, unit?: string, decimals = 0, highlight?: string) => (
    <NumField key={k} label={t(`revenueModeler.in.${k}`)} value={inputs[k]} onChange={set(k)}
      unit={unit} decimals={decimals} locale={locale} highlight={highlight} />
  );

  const rows = buildRows(inputs, model, t as any, num);
  const dirty = active ? JSON.stringify({ ...defaults, ...upgradeInputs(active.inputs) }) !== JSON.stringify(inputs) : false;

  // ── Scénarios ──
  const save = async () => {
    const name = saveName.trim();
    if (!name) { flash('err', t('revenueModeler.nameRequired') as string); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/revenue-model/scenarios`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ name, inputs }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        flash('err', d.demo ? d.error : t(`revenueModeler.err.${d.error}`, { field: d.field, defaultValue: t('revenueModeler.saveError') as string }) as string);
        return;
      }
      setActive(d.scenario);
      setParams({ scenario: d.scenario.id }, { replace: true });
      await loadList();
      flash('ok', t('revenueModeler.saved', { name }) as string);
    } catch {
      flash('err', t('revenueModeler.saveError') as string);
    } finally { setBusy(false); }
  };

  const open = (id: string) => {
    if (dirty && !window.confirm(t('revenueModeler.discard') as string)) return;
    const s = scenarios.find((x) => x.id === id);
    if (!s) return;
    setActive(s);
    setSaveName(s.name);
    setInputs({ ...defaults, ...upgradeInputs(s.inputs) });
    setParams({ scenario: s.id }, { replace: true });
  };

  const remove = async () => {
    if (!active || !window.confirm(t('revenueModeler.confirmDelete', { name: active.name }) as string)) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/revenue-model/scenarios/${active.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) { flash('err', t('revenueModeler.deleteError') as string); return; }
      setActive(null);
      setParams({}, { replace: true });
      await loadList();
      flash('ok', t('revenueModeler.deleted') as string);
    } finally { setBusy(false); }
  };

  const reset = () => {
    if (!window.confirm(t('revenueModeler.confirmReset') as string)) return;
    setInputs(defaults);
    setActive(null);
    setSaveName('');
    setParams({}, { replace: true });
  };

  // Les saisies courantes deviennent le point de départ de TOUT nouveau modèle (revmodel:settings).
  const saveAsDefaults = async () => {
    if (!window.confirm(t('revenueModeler.defaultsConfirm') as string)) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/revenue-model/defaults`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ inputs }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        flash('err', d.demo ? d.error : t(`revenueModeler.err.${d.error}`, { field: d.field, defaultValue: t('revenueModeler.defaultsError') as string }) as string);
        return;
      }
      setDefaults(d.defaults);
      flash('ok', t('revenueModeler.defaultsSaved', { n: d.changed }) as string);
    } catch {
      flash('err', t('revenueModeler.defaultsError') as string);
    } finally { setBusy(false); }
  };

  const copyLink = async () => {
    if (!active) return;
    const url = `${window.location.origin}/revenue-modeler?scenario=${active.id}`;
    try { await navigator.clipboard.writeText(url); flash('ok', t('revenueModeler.linkCopied') as string); }
    catch { window.prompt(t('revenueModeler.copyThis') as string, url); }
  };

  // ── Export CSV ──
  // Séparateur « ; » et virgule décimale en français : c'est ce qu'attend un Excel réglé en
  // fr-CA, qui sinon met toute la ligne dans une seule cellule. BOM UTF-8 pour les accents.
  const exportCsv = () => {
    const sep = lang === 'fr' ? ';' : ',';
    const cell = (s: string) => (/[";,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const n2 = (n: number) => { const s = (Math.round(n * 100) / 100).toFixed(2); return lang === 'fr' ? s.replace('.', ',') : s; };
    const head = [t('revenueModeler.pl.col.item'), t('revenueModeler.pl.col.y1'), t('revenueModeler.pl.col.y2'), t('revenueModeler.pl.col.y3'), t('revenueModeler.pl.col.total')];
    const lines = [
      cell(`${inputs.merchantName} — ${t('revenueModeler.title')}`),
      head.map((h) => cell(h as string)).join(sep),
      ...rows.map((r) => (r.kind === 'section'
        ? cell(r.label.toUpperCase())
        : [cell(r.label), ...r.y.map(n2), n2(r.y[0] + r.y[1] + r.y[2])].join(sep))),
    ];
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    const safe = (inputs.merchantName || 'marchand').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');
    a.href = URL.createObjectURL(blob);
    a.download = `Cluster_Revenue_${safe}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Paliers SaaS (configuration) ──
  const saveTiers = async () => {
    if (!tierDraft) return;
    if (!(tierDraft[0] > 0 && tierDraft[0] < tierDraft[1] && tierDraft[1] < tierDraft[2])) {
      setTierErr(t('revenueModeler.tiers.orderError') as string);
      return;
    }
    setTierBusy(true);
    setTierErr(null);
    try {
      const r = await fetch(`${API_URL}/api/revenue-model/saas-tiers`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ tiers: tierDraft }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setTierErr(d.demo ? d.error : (t('revenueModeler.tiers.saveError') as string)); return; }
      setTiers(d.saasTiers);
      // Un nouveau modèle (Réinitialiser) démarrera au nouveau palier du milieu, comme le serveur.
      setDefaults((prev) => (prev ? { ...prev, saasPerLoc: d.saasTiers[1] } : prev));
      setTierDraft(null);
      flash('ok', t('revenueModeler.tiers.saved') as string);
    } catch {
      setTierErr(t('revenueModeler.tiers.saveError') as string);
    } finally { setTierBusy(false); }
  };

  // ── Comparaison des paliers SaaS ──
  const tierModels = tiers.map((p) => ({ price: p, m: compute({ ...inputs, saasPerLoc: p }) }));

  // ── Graphique ──
  // SaaS BRUT dans la barre : la commission SaaS est déjà dans la tranche « Commissions ».
  // (Le brief empilait le SaaS net ET toutes les commissions, ce qui comptait la commission
  // SaaS deux fois.) Ainsi chaque barre se somme exactement au profit de l'année.
  const yr = (y: 0 | 1 | 2) => y === 0;
  const series = [
    { key: 'saas', color: ORANGE, v: () => model.saasRevenueGross },
    { key: 'credit', color: '#3C50E0', v: () => model.netCredit },
    { key: 'interac', color: '#80CAEE', v: () => model.netInterac },
    { key: 'terminals', color: '#1D9E75', v: () => model.netTerminalAnnual },
    { key: 'hardware', color: '#8B5CF6', v: (y: 0 | 1 | 2) => (yr(y) ? model.hwGrossProfit : 0) },
    { key: 'termBuy', color: '#BA7517', v: (y: 0 | 1 | 2) => (yr(y) ? -model.terminalPurchaseCost : 0) },
    { key: 'comm', color: '#A32D2D', v: (y: 0 | 1 | 2) => (yr(y) ? -model.commissionsYear1 : 0) },
  ];
  const chartOpts: ApexOptions = {
    chart: { fontFamily: 'Satoshi, sans-serif', toolbar: { show: false }, zoom: { enabled: false }, stacked: true },
    colors: series.map((s) => s.color),
    dataLabels: { enabled: false },
    grid: { borderColor: '#E2E8F0', strokeDashArray: 4 },
    tooltip: { theme: 'light', y: { formatter: (v: number) => money(v) } },
    legend: { position: 'top', horizontalAlign: 'left', fontSize: '11px', markers: { radius: 3 } },
    xaxis: { categories: [t('revenueModeler.pl.col.y1'), t('revenueModeler.pl.col.y2'), t('revenueModeler.pl.col.y3')] },
    yaxis: { labels: { formatter: (v: number) => compact(v) } },
    plotOptions: { bar: { borderRadius: 2, columnWidth: '45%' } },
  };

  const kpis: { label: string; value: string; sub?: string; color: string }[] = [
    { label: t('revenueModeler.kpi.gmv'), value: compact(model.gmvTotal), sub: t('revenueModeler.kpi.gmvSub', { credit: compact(inputs.gmvCredit), interac: compact(inputs.gmvInterac) }), color: '#64748B' },
    { label: t('revenueModeler.kpi.netPayments'), value: compact(model.netPayments), sub: t('revenueModeler.kpi.perYear'), color: '#1D9E75' },
    { label: t('revenueModeler.kpi.termBuy'), value: compact(-model.terminalPurchaseCost),
      sub: model.paybackMonths === null ? t('revenueModeler.kpi.noPayback') : t('revenueModeler.kpi.payback', { n: num(model.paybackMonths, 1) }), color: '#BA7517' },
    { label: t('revenueModeler.kpi.commissions'), value: compact(-model.commissionsYear1), sub: t('revenueModeler.kpi.year1'), color: '#A32D2D' },
    { label: t('revenueModeler.kpi.profit1'), value: compact(model.profitYear1), sub: t('revenueModeler.kpi.year1'), color: ORANGE },
  ];

  const instPerLoc = inputs.instPrice * (inputs.commInstPct / 100);

  return (
    <div className="rm-print">
      <style>{`
        /* Isoler par VISIBILITÉ (même technique que les rapports SaaS) : masquer les frères de
           #root effacerait la page elle-même, montée en profondeur dans la mise en page. */
        @media print {
          body * { visibility: hidden !important; }
          .rm-print, .rm-print * { visibility: visible !important; }
          .rm-print { position: absolute !important; left: 0; top: 0; width: 100%; }
          .rm-no-print { display: none !important; }
          .rm-grid { display: block !important; }
          .rm-print table { font-size: 10px; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          tr { break-inside: avoid; }
        }
      `}</style>

      <div className="mb-4">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">{t('revenueModeler.title')}</h2>
        <p className="mt-1 text-sm text-body dark:text-bodydark">{t('revenueModeler.subtitle')}</p>
      </div>

      {/* Barre d'outils : carte pleine largeur sous le titre (convention de l'app pour 3+ contrôles). */}
      <div className={`${CARD} rm-no-print mb-5 flex flex-wrap items-end gap-3 p-4`}>
        <div className="w-full sm:w-64">
          <span className="mb-1 block text-xs text-body dark:text-bodydark">{t('revenueModeler.myScenarios')}</span>
          <Select
            value={active && active.mine ? active.id : ''}
            onChange={(v) => v && open(v)}
            options={[
              { value: '', label: scenarios.length ? (t('revenueModeler.pickScenario') as string) : (t('revenueModeler.noScenarios') as string) },
              ...scenarios.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
        <div className="w-full sm:w-64">
          <span className="mb-1 block text-xs text-body dark:text-bodydark">{t('revenueModeler.scenarioName')}</span>
          <input value={saveName} onChange={(e) => setSaveName(e.target.value)} maxLength={120}
            placeholder={t('revenueModeler.namePlaceholder', { name: inputs.merchantName }) as string}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            className={INPUT_CLS} />
        </div>
        <button type="button" onClick={save} disabled={busy}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded bg-[#FE6523] px-3.5 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
          <Save className="h-4 w-4" />{t('revenueModeler.save')}
        </button>
        {active?.mine && (
          <button type="button" onClick={remove} disabled={busy}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-stroke px-3 py-2 text-sm text-danger hover:bg-danger/5 dark:border-strokedark">
            <Trash2 className="h-4 w-4" />{t('revenueModeler.delete')}
          </button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {active && (
            <button type="button" onClick={copyLink} title={dirty ? (t('revenueModeler.linkIsSaved') as string) : undefined}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-stroke px-3 py-2 text-sm text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
              <Link2 className="h-4 w-4" />{t('revenueModeler.copyLink')}
            </button>
          )}
          <button type="button" onClick={exportCsv}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-stroke px-3 py-2 text-sm text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
            <Download className="h-4 w-4" />{t('revenueModeler.exportCsv')}
          </button>
          <button type="button" onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-stroke px-3 py-2 text-sm text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
            <Printer className="h-4 w-4" />{t('revenueModeler.print')}
          </button>
          {canEditTiers && (
            <button type="button" onClick={saveAsDefaults} disabled={busy} title={t('revenueModeler.defaultsHint') as string}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-[#FE6523]/50 px-3 py-2 text-sm text-[#FE6523] hover:bg-[#FE6523]/5 disabled:opacity-60">
              <Settings2 className="h-4 w-4" />{t('revenueModeler.saveAsDefaults')}
            </button>
          )}
          <button type="button" onClick={reset} title={t('revenueModeler.resetHint') as string}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-stroke px-3 py-2 text-sm text-body hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4">
            <RotateCcw className="h-4 w-4" />{t('revenueModeler.reset')}
          </button>
        </div>
        {(status || (active && !active.mine) || dirty) && (
          <div className="w-full text-xs">
            {status && <span className={status.kind === 'ok' ? 'text-meta-3' : 'text-danger'}>{status.text}</span>}
            {!status && active && !active.mine && (
              <span className="text-body">{t('revenueModeler.sharedBy', { name: active.name, owner: active.owner })}</span>
            )}
            {!status && active?.mine && dirty && <span className="text-[#BA7517]">{t('revenueModeler.unsaved')}</span>}
          </div>
        )}
      </div>

      <div className="rm-grid grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── Colonne des saisies ── */}
        <aside className="rm-no-print self-start">
          <div className={CARD}>
            <Section title={t('revenueModeler.sec.merchant')}>
              <label className="block">
                <span className="mb-1 block text-xs text-body dark:text-bodydark">{t('revenueModeler.in.merchantName')}</span>
                <input value={inputs.merchantName} maxLength={120}
                  onChange={(e) => setInputs({ ...inputs, merchantName: e.target.value })} className={INPUT_CLS} />
              </label>
              {f('numLocs')}
              {f('termsPerLoc')}
            </Section>
            <Section title={t('revenueModeler.sec.volume')}>
              {f('gmvCredit', '$')}
              {f('txnCredit', '#')}
              {f('gmvInterac', '$')}
              {f('txnInterac', '#')}
            </Section>
            <Section title={t('revenueModeler.sec.saas')}>
              <div className="grid grid-cols-3 gap-1.5">
                {tiers.map((p) => (
                  <button key={p} type="button" onClick={() => set('saasPerLoc')(p)}
                    className={`rounded py-1.5 text-sm font-medium transition ${inputs.saasPerLoc === p
                      ? 'bg-[#FE6523] text-white'
                      : 'border border-stroke text-black hover:border-[#FE6523] dark:border-strokedark dark:text-white'}`}>
                    {money(p)}
                  </button>
                ))}
              </div>
              {/* Même éditeur que la carte de comparaison : c'est ICI, à côté des pastilles, qu'on
                  le cherche d'instinct (David ne l'a pas trouvé en bas de page, 2026-09-22). */}
              {canEditTiers && (
                <button type="button"
                  onClick={() => {
                    if (!tierDraft) { setTierDraft([...tiers]); setTierErr(null); }
                    window.setTimeout(() => document.getElementById('rm-tiers')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#FE6523] hover:underline">
                  <Settings2 className="h-3.5 w-3.5" />{t('revenueModeler.tiers.edit')}
                </button>
              )}
              {f('saasPerLoc', t('revenueModeler.unit.perLocMonth') as string, 2)}
            </Section>
            <Section title={t('revenueModeler.sec.payRevenue')}>
              {f('markupRate', '%', 3)}
              {f('txnFeeCredit', '$', 3)}
              {f('txnFeeInterac', '$', 3)}
            </Section>
            <Section title={t('revenueModeler.sec.networkCosts')}>
              {f('creditCostPct', '%', 3)}
              {f('creditCostPerTxn', '$', 3, t('revenueModeler.newCost') as string)}
              {f('interacCostPerTxn', '$', 3)}
            </Section>
            <Section title={t('revenueModeler.sec.terminals')}>
              {f('termRentalRev', t('revenueModeler.unit.perMonth') as string, 2)}
              {f('termWarrantyCost', t('revenueModeler.unit.perMonth') as string, 2)}
              {f('termUnitCost', '$', 2)}
            </Section>
            <Section title={t('revenueModeler.sec.hardware')}>
              {f('hwCost', '$', 2)}
              {f('hwPrice', '$', 2)}
              <p className={`-mt-1 text-xs ${model.hwGrossProfit < 0 ? 'text-danger' : 'text-body dark:text-bodydark'}`}>
                {model.hwMarginPct === null
                  ? t('revenueModeler.hwMarginNone')
                  : t('revenueModeler.hwMargin', { amount: money(inputs.hwPrice - inputs.hwCost), pct: num(model.hwMarginPct, 1) })}
              </p>
              {f('instPrice', '$', 2)}
            </Section>
            <Section title={t('revenueModeler.sec.commissions')}>
              {f('commSaasMonths', t('revenueModeler.unit.months') as string, 2)}
              {f('commPayPerLoc', '$', 2)}
              {f('commHwPct', '%', 1)}
              {f('commInstPct', '%', 1)}
              {f('signupBonus', '$', 2)}
            </Section>
          </div>

          {(model.alerts.installLoss || model.alerts.interacLow) && (
            <div className="mt-4 space-y-3">
              {model.alerts.installLoss && (
                <Alert title={t('revenueModeler.alert.installTitle')}>
                  {t('revenueModeler.alert.installBody', {
                    comm: money(instPerLoc), total: money(model.instCommission),
                    price: model.suggestedInstPrice === null ? '—' : money(model.suggestedInstPrice),
                  })}
                </Alert>
              )}
              {model.alerts.interacLow && (
                <Alert title={t('revenueModeler.alert.interacTitle')}>
                  {t('revenueModeler.alert.interacBody', { net: money(model.netInterac), n: num(inputs.txnInterac), floor: money(INTERAC_ALERT_FLOOR) })}
                </Alert>
              )}
            </div>
          )}
        </aside>

        {/* ── Colonne des résultats ── */}
        <main className="min-w-0 space-y-5">
          <div className={`${CARD} p-5`}>
            <input value={inputs.merchantName} maxLength={120} aria-label={t('revenueModeler.in.merchantName') as string}
              onChange={(e) => setInputs({ ...inputs, merchantName: e.target.value })}
              className="w-full bg-transparent text-xl font-bold text-black outline-none focus:underline focus:decoration-[#FE6523] dark:text-white" />
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {[
                t('revenueModeler.badge.locs', { n: num(inputs.numLocs) }),
                t('revenueModeler.badge.terms', { n: num(model.totalTerminals) }),
                t('revenueModeler.badge.gmv', { v: compact(model.gmvTotal) }),
                t('revenueModeler.badge.saas', { v: money(inputs.saasPerLoc) }),
              ].map((b) => (
                <span key={b} className="rounded-full bg-gray-2 px-2.5 py-0.5 text-black dark:bg-meta-4 dark:text-white">{b}</span>
              ))}
              <span className="rounded-full bg-danger/10 px-2.5 py-0.5 font-medium text-danger">{t('revenueModeler.confidential')}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-sm border border-stroke bg-gray-2 p-3 dark:border-strokedark dark:bg-meta-4" style={{ borderLeft: `3px solid ${k.color}` }}>
                <div className="text-[11px] uppercase tracking-wide text-body dark:text-bodydark">{k.label}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: k.color === '#64748B' ? undefined : k.color }}>{k.value}</div>
                {k.sub && <div className="mt-0.5 text-[11px] text-body dark:text-bodydark">{k.sub}</div>}
              </div>
            ))}
          </div>

          <PLTable rows={rows} money={money} t={t as any} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {([
              ['y1', model.profitYear1], ['y2', model.profitYear2], ['y3', model.profitYear3], ['total', model.total3Years],
            ] as const).map(([k, v]) => (
              <div key={k} className={`${CARD} p-4 ${k === 'total' ? 'ring-1 ring-[#FE6523]/40' : ''}`}>
                <div className="text-[11px] uppercase tracking-wide text-body dark:text-bodydark">{t(`revenueModeler.pl.col.${k}`)}</div>
                <div className={`mt-1 text-xl font-bold tabular-nums ${v < 0 ? 'text-danger' : ''}`} style={v >= 0 ? { color: k === 'total' ? ORANGE : undefined } : undefined}>{money(v)}</div>
                <div className="mt-0.5 text-[11px] text-body dark:text-bodydark">{t(k === 'y1' ? 'revenueModeler.summary.y1' : k === 'total' ? 'revenueModeler.summary.total' : 'revenueModeler.summary.recurring')}</div>
              </div>
            ))}
          </div>

          <div id="rm-tiers" className={`${CARD} scroll-mt-24 p-5`}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-black dark:text-white">{t('revenueModeler.tiers.title')}</h3>
              {canEditTiers && !tierDraft && (
                <button type="button" onClick={() => { setTierDraft([...tiers]); setTierErr(null); }}
                  className="rm-no-print inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-stroke px-2.5 py-1 text-xs text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
                  <Settings2 className="h-3.5 w-3.5" />{t('revenueModeler.tiers.edit')}
                </button>
              )}
            </div>
            <p className="mb-3 text-xs text-body dark:text-bodydark">{t('revenueModeler.tiers.hint')}</p>
            {tierDraft && (
              <div className="rm-no-print mb-4 rounded-sm border border-[#FE6523]/30 bg-[#FE6523]/5 p-3">
                <p className="mb-3 text-xs text-black dark:text-white">{t('revenueModeler.tiers.editHint')}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {tierDraft.map((v, idx) => (
                    <NumField key={idx} label={t(`revenueModeler.tiers.name${idx}`) as string} value={v} decimals={2} locale={locale}
                      unit={t('revenueModeler.unit.perLocMonth') as string}
                      onChange={(n) => setTierDraft((d) => (d ? d.map((x, j) => (j === idx ? n : x)) : d))} />
                  ))}
                </div>
                {tierErr && <p className="mt-2 text-xs text-danger">{tierErr}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={saveTiers} disabled={tierBusy}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded bg-[#FE6523] px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
                    <Save className="h-3.5 w-3.5" />{t('revenueModeler.tiers.saveTiers')}
                  </button>
                  <button type="button" onClick={() => { setTierDraft(null); setTierErr(null); }} disabled={tierBusy}
                    className="whitespace-nowrap rounded border border-stroke px-3 py-1.5 text-xs text-body hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4">
                    {t('revenueModeler.tiers.cancel')}
                  </button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-stroke text-left text-xs text-body dark:border-strokedark dark:text-bodydark">
                    <th className="py-2 pr-3 font-medium" />
                    {tierModels.map(({ price }, idx) => (
                      <th key={price} className={`px-3 py-2 text-right font-semibold ${inputs.saasPerLoc === price ? 'text-[#FE6523]' : 'text-black dark:text-white'}`}>
                        {t(`revenueModeler.tiers.name${idx}`, { defaultValue: '' })} {money(price)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {([
                    ['saas', (m: ReturnType<typeof compute>) => m.saasRevenueGross],
                    ['y1', (m: ReturnType<typeof compute>) => m.profitYear1],
                    ['y2', (m: ReturnType<typeof compute>) => m.profitYear2],
                    ['total', (m: ReturnType<typeof compute>) => m.total3Years],
                  ] as const).map(([k, get]) => (
                    <tr key={k} className="border-b border-stroke last:border-b-0 dark:border-strokedark">
                      <td className="py-2 pr-3 text-black dark:text-white">{t(`revenueModeler.tiers.row.${k}`)}</td>
                      {tierModels.map(({ price, m }) => (
                        <td key={price} className={`px-3 py-2 text-right ${k === 'total' ? 'font-semibold' : ''} ${get(m) < 0 ? 'text-danger' : 'text-black dark:text-white'}`}>{money(get(m))}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${CARD} p-5`}>
            <h3 className="mb-1 text-sm font-semibold text-black dark:text-white">{t('revenueModeler.chart.title')}</h3>
            <p className="mb-2 text-xs text-body dark:text-bodydark">{t('revenueModeler.chart.hint')}</p>
            <ReactApexChart type="bar" height={300} options={chartOpts}
              series={series.map((s) => ({ name: t(`revenueModeler.chart.${s.key}`) as string, data: [0, 1, 2].map((y) => Math.round(s.v(y as 0 | 1 | 2))) }))} />
          </div>

          <p className="pb-2 text-center text-[11px] text-body dark:text-bodydark">
            {t('revenueModeler.footer', { date: new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' }) })}
          </p>
        </main>
      </div>
    </div>
  );
}

function Alert({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-sm border border-l-4 border-[#BA7517]/30 border-l-[#BA7517] bg-[#BA7517]/10 p-3 text-xs text-black dark:text-white">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#BA7517]" />
      <div><div className="mb-0.5 font-semibold">{title}</div><div className="text-body dark:text-bodydark">{children}</div></div>
    </div>
  );
}

function PLTable({ rows, money, t }: { rows: Row[]; money: (n: number) => string; t: (k: string) => string }) {
  const rowCls: Record<Row['kind'], string> = {
    section: 'bg-gray-2 dark:bg-meta-4',
    rev: '',
    cost: 'bg-red-50/60 dark:bg-red-500/5',
    newcost: 'bg-[#FE6523]/5',
    comm: 'bg-red-50 dark:bg-red-500/10',
    subtotal: 'bg-gray-2/70 font-semibold dark:bg-meta-4/60 border-y border-stroke dark:border-strokedark',
    total: 'border-t-[3px] border-double border-stroke dark:border-strokedark text-[15px] font-bold',
  };
  const labelCls: Record<Row['kind'], string> = {
    section: 'text-[10px] font-bold uppercase tracking-wider text-black dark:text-white',
    rev: 'text-black dark:text-white',
    cost: 'pl-7 text-red-700 dark:text-red-400',
    newcost: 'pl-7 border-l-2 border-[#FE6523] text-[#C2410C] dark:text-[#FE8A55]',
    comm: 'pl-7 font-medium text-red-800 dark:text-red-300',
    subtotal: 'text-black dark:text-white',
    total: 'text-black dark:text-white',
  };
  const valCls = (r: Row, v: number) => {
    if (r.kind === 'total') return v < 0 ? 'text-danger' : 'text-[#FE6523]';
    if (r.kind === 'cost' || r.kind === 'comm' || r.kind === 'newcost') return v === 0 ? 'text-body/60' : 'text-red-700 dark:text-red-400';
    if (v < 0) return 'text-danger';
    return v === 0 ? 'text-body/60' : 'text-black dark:text-white';
  };
  const arrow = (k: Row['kind']) => (k === 'cost' || k === 'comm' || k === 'newcost' ? '↳ ' : '');
  return (
    <div className={`${CARD} overflow-x-auto`}>
      <table className="w-full min-w-[640px] text-[13px]">
        <thead>
          <tr className="border-b border-stroke text-left text-xs text-body dark:border-strokedark dark:text-bodydark">
            <th className="px-4 py-3 font-medium">{t('revenueModeler.pl.col.item')}</th>
            <th className="w-28 px-3 py-3 text-right font-medium">{t('revenueModeler.pl.col.y1')}</th>
            <th className="w-28 px-3 py-3 text-right font-medium">{t('revenueModeler.pl.col.y2')}</th>
            <th className="w-28 px-3 py-3 text-right font-medium">{t('revenueModeler.pl.col.y3')}</th>
            <th className="w-32 px-4 py-3 text-right font-semibold">{t('revenueModeler.pl.col.total')}</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r, i) => {
            if (r.kind === 'section') {
              return (
                <tr key={i} className={rowCls.section}>
                  <td colSpan={5} className={`px-4 py-1.5 ${labelCls.section}`}>{r.label}</td>
                </tr>
              );
            }
            const total = r.y[0] + r.y[1] + r.y[2];
            return (
              <tr key={i} className={`${rowCls[r.kind]} transition-colors hover:bg-[#FE6523]/[0.04]`}>
                <td className={`px-4 py-1.5 ${labelCls[r.kind]}`}>
                  {arrow(r.kind)}{r.label}
                  {r.oneTime && (
                    <span className="ml-2 rounded bg-[#185FA5]/10 px-1.5 py-px align-middle text-[9px] font-semibold uppercase tracking-wide text-[#185FA5] dark:text-[#6FA8E0]">
                      {t('revenueModeler.pl.oneTime')}
                    </span>
                  )}
                </td>
                {r.y.map((v, j) => (
                  <td key={j} className={`whitespace-nowrap px-3 py-1.5 text-right ${valCls(r, v)}`}>{money(v)}</td>
                ))}
                <td className={`whitespace-nowrap px-4 py-1.5 text-right font-semibold ${valCls(r, total)}`}>{money(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
