// Module Finance — briques communes : en-tête des pages, tuiles, cellule modifiable, tableau
// « état financier » (sections, sous-totaux, totaux soulignés deux fois, négatifs entre
// parenthèses, colonne Total ombrée).
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, PageHeader, StatusPill, dialog, toast } from '../../components/ui';
import { CARD, CARD_HEAD, CARD_SUB, CARD_TITLE, TABLE_WRAP } from '../../components/ui/surface';
import { useFinance } from './FinanceContext';
// Fichiers du lot Progress importés directement (pas son index) : l'index charge ProgressPage, qui
// importe ce fichier-ci — un cycle d'imports à éviter.
import BudgetProgress from './Progress/BudgetProgress';
import { progressApi } from './Progress/api';
import type { Fmt } from './format';

// Cellules modifiables (jaune-orangé du design) et ligne surlignée par un lien d'une autre page.
export const EDIT_CELL = 'border-[#F58345] bg-[#FDE6DA] text-[#9A3F12] dark:border-[#D16630] dark:bg-[#2A2015] dark:text-[#FFBE9B]';
const HL_ROW = 'bg-[rgba(253,176,34,0.16)] dark:bg-[rgba(253,176,34,0.12)]';
// Le mois du chiffre cliqué, dans la ligne source : plus marqué que le reste de la ligne.
const HL_CELL = 'outline outline-2 -outline-offset-2 outline-[#FDB022] bg-[rgba(253,176,34,0.30)] dark:bg-[rgba(253,176,34,0.26)]';

// ---------------------------------------------------------------------------- en-tête
export function FinanceHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  const { t } = useTranslation();
  const { payload, locked, saveStatus, saveError, notice, approve, unlock, fmt } = useFinance();
  const b = payload.budget;
  const onApprove = async () => {
    // Avant de verrouiller : dire combien de drivers ne sont pas approuvés (avertissement, pas un blocage).
    let pendingNote: string[] = [];
    try {
      const p = await progressApi.progress();
      if (!p.empty && !p.ready) pendingNote = [t('finance.approve.notReady', { pct: Math.round(p.percent) })];
    } catch { /* pas de droit de voir l'avancement ou serveur indisponible : on approuve comme avant */ }
    const yes = await dialog.confirm(t('finance.approve.confirm', { fy: b.fiscalYear }), { details: [t('finance.approve.confirmDetail'), ...pendingNote] });
    if (!yes) return;
    await approve();
    toast.success(t('finance.approve.done'));
  };
  const onUnlock = async () => {
    const yes = await dialog.confirm(t('finance.approve.unlockConfirm', { fy: b.fiscalYear }));
    if (!yes) return;
    await unlock();
    toast.success(t('finance.approve.unlocked'));
  };
  return (
    <>
      <PageHeader
        section={`${t('sidebar.sections.finance')} · FY${b.fiscalYear} · ${t('finance.consolidated')}`}
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <SaveBadge status={saveStatus} error={saveError} />
            <StatusPill family={locked ? 'ok' : 'neutral'}>{locked ? t('finance.status.approved') : t('finance.status.draft')}</StatusPill>
            {payload.caps.canApprove && (locked
              ? <Button size="sm" onClick={onUnlock}>{t('finance.approve.unlock')}</Button>
              : <Button size="sm" variant="primary" onClick={onApprove}>{t('finance.approve.approve')}</Button>)}
          </>
        }
      />
      {/* Commandes de la page : barre en carte pleine largeur sous le titre (convention des barres d'outils). */}
      {actions && <div className={`${CARD} mb-4 flex flex-wrap items-center gap-2 px-3 py-2.5`}>{actions}</div>}
      {/* Avancement du budget : drivers approuvés, ce qu'il reste à alimenter (rien sans finance:progress). */}
      <BudgetProgress />
      {locked && (
        <div role="status" className="mb-4 rounded-xl border border-[rgba(23,178,106,0.35)] bg-[rgba(23,178,106,0.08)] px-4 py-3 text-[13px] text-[#067647] dark:text-[#57D193]">
          {t('finance.locked', { who: b.approvedBy || '—', when: b.approvedAt ? new Date(b.approvedAt).toLocaleDateString(fmt.loc, { day: 'numeric', month: 'long', year: 'numeric' }) : '—' })}
        </div>
      )}
      {notice && <div role="status" className="mb-4 rounded-xl border border-stroke bg-gray-2 px-4 py-3 text-[13px] text-black dark:border-strokedark dark:bg-meta-4 dark:text-white">{notice}</div>}
    </>
  );
}

function SaveBadge({ status, error }: { status: string; error: string | null }) {
  const { t } = useTranslation();
  if (status === 'idle') return null;
  const txt = status === 'error' ? t('finance.save.error', { code: error }) : t(`finance.save.${status}`);
  return <span aria-live="polite" className={`text-[12px] ${status === 'error' ? 'font-bold text-[#B42318] dark:text-[#F46060]' : 'text-body dark:text-bodydark2'}`}>{txt}</span>;
}

// ---------------------------------------------------------------------------- tuiles
// `chart` : tendance mensuelle sous le chiffre (SH-50, Budget maître).
export function Kpi({ label, value, detail, sub, tone, onClick, chart }: { label: string; value: React.ReactNode; detail?: React.ReactNode; sub?: React.ReactNode; tone?: 'up' | 'dn'; onClick?: () => void; chart?: React.ReactNode }) {
  const body = (
    <>
      <div className="text-[13px] font-semibold text-body dark:text-bodydark2">{label}</div>
      <div className={`mt-1 text-[28px] font-bold tabular-nums leading-tight tracking-[-0.01em] ${tone === 'dn' ? 'text-[#B42318] dark:text-[#F46060]' : 'text-black dark:text-white'}`}>{value}</div>
      {chart}
      {detail && <div className="mt-1.5 text-[13.5px] text-body dark:text-bodydark2">{detail}</div>}
      {sub && <div className="mt-0.5 text-[13px] tabular-nums text-body dark:text-bodydark2">{sub}</div>}
    </>
  );
  const cls = `${CARD} p-4 text-left`;
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} transition hover:border-primary`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

export const KpiRow = ({ children }: { children: React.ReactNode }) => <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;

export function Card({ title, sub, actions, children }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`${CARD} mb-5`}>
      <div className={`${CARD_HEAD} flex flex-wrap items-center justify-between gap-2`}>
        <div className="min-w-0"><h2 className={CARD_TITLE}>{title}</h2>{sub && <p className={CARD_SUB}>{sub}</p>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------- cellule modifiable
// Garde le texte tapé pendant la saisie (« 1, » n'est pas encore un nombre) et ne remonte qu'une
// valeur lisible ; à la sortie du champ, réaffiche la valeur retenue.
export function NumCell({ value, onChange, disabled, label, width = 'w-[84px]', decimals = 2 }: { value: number; onChange: (v: number) => void; disabled?: boolean; label: string; width?: string; decimals?: number }) {
  const { fmt } = useFinance();
  const rounded = Number.isFinite(value) ? Math.round(value * 10 ** decimals) / 10 ** decimals : null;
  const plain = rounded == null ? '' : (fmt.fr ? String(rounded).replace('.', ',') : String(rounded));
  // Hors saisie : milliers séparés, comme les cellules calculées ; en saisie : le nombre brut.
  const pretty = rounded == null ? '' : new Intl.NumberFormat(fmt.loc, { maximumFractionDigits: decimals }).format(rounded);
  const [raw, setRaw] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setRaw(null); }, [value, focused]);
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      disabled={disabled}
      value={raw ?? (focused ? plain : pretty)}
      onChange={(e) => { setRaw(e.target.value); const v = fmt.parse(e.target.value); if (v != null) onChange(v); }}
      onBlur={() => { setFocused(false); setRaw(null); }}
      onFocus={(e) => { setFocused(true); const el = e.target; requestAnimationFrame(() => el.select()); }}
      className={`${width} h-8 rounded-md border px-1.5 text-right text-[13.5px] tabular-nums outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-70 ${EDIT_CELL}`}
    />
  );
}

// ---------------------------------------------------------------------------- tableau
// 'glsub' : sous-total à l'intérieur d'un détail déplié (OPEX du Budget maître, SH-48).
export type RowKind = 'sec' | 'line' | 'sub' | 'grand' | 'pct' | 'gl' | 'glsub';
export interface FRow {
  id: string;
  label: React.ReactNode;
  kind: RowKind;
  fmt?: Fmt;
  vals?: (number | null)[];
  total?: number | null;
  fy26?: number | null;
  vs?: number | null;
  edit?: { values: number[]; onChange: (i: number, v: number) => void; onFill?: () => void; decimals?: number };
  onClick?: () => void;
  linkCells?: boolean;
  /** Cliquer un NOMBRE mène à sa source ; reçoit le mois (0..11) ou null pour la colonne Total. */
  onCellClick?: (month: number | null) => void;
  expand?: { open: boolean; toggle: () => void };
  extra?: React.ReactNode;
  focus?: string;
  /** Override the per-cell format (e.g. $ on the first line of a block only). */
  cellFmt?: Fmt;
}

// Style « relevé épuré » choisi par la CFO (SH-50, direction A) : sections en titres, sous-totaux en
// simple filet sans fond, BAIIA et bénéfice net en bande douce.
const ROW_CLS: Record<RowKind, string> = {
  sec: 'text-[15px] font-bold text-black dark:text-white',
  line: 'text-[#2B2B2B] dark:text-[#E4E4E7]',
  sub: 'font-bold text-black dark:text-white [&>td]:border-t [&>td]:border-t-[#C9C9C5] dark:[&>td]:border-t-[#3A3C42]',
  grand: 'text-[15px] font-extrabold text-black dark:text-white [&>td]:border-t-2 [&>td]:border-t-[#141414] dark:[&>td]:border-t-[#E4E4E7] [&>td]:bg-[#FFF7F1] dark:[&>td]:bg-[#2A2015]',
  pct: 'text-[13px] text-body dark:text-bodydark2',
  gl: 'text-[#424242] dark:text-bodydark [&>td]:bg-[#FAFAFA] dark:[&>td]:bg-[#121214]',
  glsub: 'font-bold text-[#141414] dark:text-white [&>td]:bg-[#FAFAFA] dark:[&>td]:bg-[#121214] [&>td]:border-t [&>td]:border-t-[#C9C9C5] dark:[&>td]:border-t-[#3A3C42]',
};

export function FinTable({ rows, months, showFy26, showVs, totalLabel, fy26Label, vsLabel, labelHead, editable, focus, focusMonth }: {
  rows: FRow[];
  months: string[];
  showFy26?: boolean;
  showVs?: boolean;
  totalLabel: string;
  fy26Label?: string;
  vsLabel?: string;
  labelHead: string;
  editable: boolean;
  focus?: string | null;
  /** Mois à surligner dans la ligne ciblée (lien venu d'un chiffre d'une autre page). */
  focusMonth?: number | null;
}) {
  const { t } = useTranslation();
  const { fmt } = useFinance();
  // Alignement à part : deux classes text-left / text-right concurrentes se règlent par l'ordre de la
  // feuille de style, pas par l'ordre écrit.
  const thBase = 'whitespace-nowrap border-b border-stroke px-2.5 py-2.5 text-[13px] font-semibold text-body dark:border-strokedark dark:text-bodydark2';
  const tdBase = 'border-b border-[#F0F0ED] px-2.5 py-2.5 tabular-nums dark:border-[#232428]';
  // Douze mois en montants complets ne tiennent pas sur un écran de portable : comme des volets
  // figés d'Excel, le libellé reste à gauche et le total de l'année (et l'écart) à droite ; seuls
  // les mois défilent entre les deux, et la coupe passe sous le total, avec une ombre (SH-50).
  const VS_W = 'w-[88px] min-w-[88px]';
  const stickyTotal = `sticky ${showVs ? 'right-[88px]' : 'right-0'} z-[1] shadow-[-8px_0_10px_-8px_rgba(0,0,0,0.22)] dark:shadow-[-8px_0_10px_-8px_rgba(0,0,0,0.7)]`;
  const stickyVs = `sticky right-0 z-[1] ${VS_W} bg-white dark:bg-boxdark`;
  const th = `${thBase} text-right`;
  const td = `${tdBase} whitespace-nowrap text-right`;
  const totalCls = 'bg-[#FAFAF8] dark:bg-[#19191B] border-l border-l-stroke dark:border-l-strokedark';
  // Les chiffres restent cliquables (ils mènent à leur source) mais ne sont soulignés qu'au survol :
  // un pointillé sous chaque nombre rendait les tableaux difficiles à lire (CFO, 2026-10-22).
  const linkCls = 'tabular-nums decoration-primary underline-offset-[3px] hover:underline hover:text-accent-ink focus-visible:underline dark:hover:text-accent-ink-dark';
  return (
    <div className={TABLE_WRAP}>
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr>
            <th className={`${thBase} sticky left-0 z-10 min-w-[260px] bg-white text-left dark:bg-boxdark`}>{labelHead}</th>
            {showFy26 && <th className={`${th} ${totalCls}`}>{fy26Label}</th>}
            {months.map((m) => <th key={m} className={th}>{m}</th>)}
            <th className={`${th} ${totalCls} ${stickyTotal}`}>{totalLabel}</th>
            {showVs && <th className={`${th} ${stickyVs}`}>{vsLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const span = months.length + 2 + (showFy26 ? 1 : 0) + (showVs ? 1 : 0);
            if (r.kind === 'sec') {
              return (
                <tr key={r.id} className={ROW_CLS.sec} data-focus={r.focus}>
                  <td colSpan={span} className="border-b border-stroke px-3 pb-2 pt-6 dark:border-strokedark">{r.label}</td>
                </tr>
              );
            }
            const f = r.cellFmt || r.fmt || 's';
            const hl = focus && r.focus === focus;
            const labelInner = (
              // flex-wrap + a label floor: a driver's chips (suggestion, status, Approve) are ~300 px and
              // never shrink, so without these the label was squeezed to one word per line under them.
              <span className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 ${r.kind === 'gl' || r.kind === 'glsub' ? 'pl-5' : ''}`}>
                {r.expand && <span aria-hidden className="inline-block w-3 text-[10px] text-body">{r.expand.open ? '▾' : '▸'}</span>}
                <span className="min-w-[180px] flex-1 whitespace-normal">{r.label}</span>
                {r.extra}
              </span>
            );
            const label = r.expand
              ? <button type="button" aria-expanded={r.expand.open} onClick={r.expand.toggle} className="w-full text-left hover:text-accent-ink dark:hover:text-accent-ink-dark">{labelInner}</button>
              : r.onClick
                ? <button type="button" onClick={r.onClick} className="w-full text-left decoration-primary underline-offset-[3px] hover:underline hover:text-accent-ink focus-visible:underline dark:hover:text-accent-ink-dark">{labelInner}</button>
                : labelInner;
            const cellText = (v: number | null | undefined) => (v == null ? '' : fmt.fmt(v, f));
            return (
              <tr key={r.id} data-focus={r.focus} className={`${ROW_CLS[r.kind]} ${hl ? HL_ROW : ''}`}>
                <td className={`${tdBase} sticky left-0 z-[1] min-w-[260px] max-w-[380px] text-left ${hl ? 'bg-[#FFF4DB] dark:bg-[#2A2410]' : 'bg-white dark:bg-boxdark'} ${r.kind === 'gl' || r.kind === 'glsub' ? '!bg-[#FAFAFA] dark:!bg-[#121214]' : ''}`}>{label}</td>
                {showFy26 && <td className={`${td} ${totalCls}`}>{r.fy26 == null ? '' : fmt.fmt(r.fy26, f)}</td>}
                {months.map((_, i) => {
                  const hlCell = hl && focusMonth === i;
                  const txt = cellText(r.vals?.[i]);
                  return (
                    <td key={i} className={`${td} ${hlCell ? HL_CELL : ''}`} data-month={i}>
                      {r.edit
                        ? <NumCell value={r.edit.values[i]} decimals={r.edit.decimals} disabled={!editable} label={`${typeof r.label === 'string' ? r.label : r.id} — ${months[i]}`} onChange={(v) => r.edit!.onChange(i, v)} />
                        : r.onCellClick && txt
                          ? <button type="button" onClick={() => r.onCellClick!(i)} aria-label={`${typeof r.label === 'string' ? r.label : r.id} — ${months[i]} : ${t('finance.goToSource')}`} className={linkCls}>{txt}</button>
                          : r.linkCells && r.onClick
                            ? <button type="button" onClick={r.onClick} className={linkCls}>{txt}</button>
                            : txt}
                    </td>
                  );
                })}
                <td className={`${td} ${totalCls} ${stickyTotal} font-bold`}>
                  <span className="inline-flex items-center gap-1.5">
                    {r.edit?.onFill && editable && (
                      <button type="button" onClick={r.edit.onFill} title={t('finance.fillRight')} aria-label={t('finance.fillRight')} className="rounded px-1 text-[13px] text-accent-ink hover:bg-[#FDE6DA] dark:text-accent-ink-dark dark:hover:bg-[#2A2015]">⇥</button>
                    )}
                    {r.total == null ? '' : r.onCellClick && !r.edit
                      ? <button type="button" onClick={() => r.onCellClick!(null)} aria-label={`${typeof r.label === 'string' ? r.label : r.id} — ${totalLabel} : ${t('finance.goToSource')}`} className={linkCls}>{fmt.fmt(r.total, f)}</button>
                      : fmt.fmt(r.total, f)}
                  </span>
                </td>
                {showVs && (
                  <td className={`${td} ${stickyVs} ${r.vs == null ? '' : r.vs >= 0 ? 'text-[#067647] dark:text-[#57D193]' : 'text-[#B42318] dark:text-[#F46060]'}`}>{r.vs == null ? '' : fmt.pct(r.vs, true)}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Légende des cellules modifiables, sous un tableau.
export const EditLegend = () => {
  const { t } = useTranslation();
  return (
    <p className="mt-2 flex items-center gap-2 text-[12px] text-body dark:text-bodydark2">
      <span aria-hidden className={`inline-block h-3 w-5 rounded border ${EDIT_CELL}`} />
      {t('finance.legendEditable')}
    </p>
  );
};
