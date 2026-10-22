import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Select from '../../components/Select';
import ProbationBadge from '../../components/ProbationBadge';
import { Button, StatusPill } from '../../components/ui';
import { fmtDateOnly, fmtMoney } from '../../lib/format';
import { pressable } from '../../lib/pressable';
import { Legend, RaceBar, RepChart, Sparkline, TeamPaceChart } from './charts';
import {
  type MonthClock, type RepData, type Status, STATUS_FAMILY, cumulative, isRisky,
  nextMonthlyTier, project, repStatus, weekPoints,
} from './points';

export interface MonthRow {
  rep: RepData;
  cum: number[] | null;
  proj: number;
  status: Status;
}

const card = 'rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';
const inner = 'rounded-[14px] bg-[#F7F7F8] px-3.5 py-3 dark:bg-[#1B1B1B]';

export function buildRows(reps: RepData[], clock: MonthClock): MonthRow[] {
  return reps.map((rep) => {
    const quota = rep.quota || 15;
    const proj = project(rep.totalPoints, clock);
    return { rep, cum: cumulative(rep, clock), proj, status: repStatus(rep.totalPoints, quota, proj, clock) };
  });
}

export default function MonthView({ rows, clock, target, teamPoints, monthLabel, lastDayLabel, isAdmin, leadSourceGroups, unassigned, activeReps, onOverrideSource, onAssign, selfName }: {
  rows: MonthRow[];
  clock: MonthClock;
  target: number;
  teamPoints: number;
  monthLabel: string;
  lastDayLabel: string;
  isAdmin: boolean;
  leadSourceGroups: string[];
  unassigned: RepData | null;
  activeReps: string[];
  onOverrideSource: (dealId: string, source: string) => void;
  onAssign: (merchantId: string, repName: string) => void;
  /** Nom de la personne connectée : sa ligne, s'il en a une. */
  selfName?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selName, setSelName] = useState<string | null>(null);
  const [editingDeal, setEditingDeal] = useState<string | null>(null);

  // La ligne de la personne connectée : par son nom, sinon la seule ligne détaillée parmi des
  // coéquipiers « restreints » (le serveur ne laisse à un représentant que son propre détail).
  const norm = (x?: string) => (x || '').trim().toLowerCase();
  const detailed = rows.filter((r) => !r.rep.restricted);
  const selfRow = rows.find((r) => selfName && norm(r.rep.repName) === norm(selfName))
    || (detailed.length === 1 && rows.some((r) => r.rep.restricted) ? detailed[0] : null);
  // Un représentant (il ne voit pas le détail des autres) : SON mois passe en grande carte en haut,
  // au lieu d'un panneau à droite — les reps trouvaient leurs propres points relégués sur le côté.
  const repMode = !!selfRow && rows.some((r) => r.rep.restricted);
  const sel = (repMode ? selfRow : rows.find((r) => r.rep.repName === selName) || selfRow || rows[0]) || null;

  // Courbe d'équipe = somme des courbes des représentants affichés. Sans le détail de chacun
  // (représentant qui voit ses coéquipiers), on ne dessine pas de courbe inventée.
  const team = useMemo(() => {
    const complete = rows.every((r) => r.cum);
    const cum: number[] = [];
    if (complete) for (let d = 0; d < clock.elapsed; d++) cum.push(rows.reduce((s, r) => s + (r.cum![d] || 0), 0));
    if (cum.length) cum[cum.length - 1] = teamPoints;
    const proj = project(teamPoints, clock);
    const pace = Math.round(target * (clock.elapsed / Math.max(clock.total, 1)));
    return {
      complete, cum, proj, pace,
      met: rows.filter((r) => r.rep.totalPoints >= (r.rep.quota || 15)).length,
      risk: rows.filter((r) => isRisky(r.status)).length,
    };
  }, [rows, clock, target, teamPoints]);

  // Regroupement par équipe (ordre alphabétique, « sans équipe » à la fin) : un compte paiement ne se
  // confond plus avec un autre type d'équipe. Un seul groupe visible = pas d'en-tête.
  const teamGroups = useMemo(() => {
    const none = t('pointsTracker.noTeam');
    const map = new Map<string, { name: string; rows: MonthRow[]; pts: number }>();
    rows.forEach((row) => {
      const name = row.rep.team?.name || none;
      const g = map.get(name) || { name, rows: [], pts: 0 };
      g.rows.push(row); g.pts += row.rep.totalPoints;
      map.set(name, g);
    });
    return [...map.values()].sort((a, b) => (a.name === none ? 1 : b.name === none ? -1 : a.name.localeCompare(b.name)));
  }, [rows, t]);

  const diff = teamPoints - team.pace;
  const headline = !clock.current
    ? (teamPoints >= target ? t('pointsTracker.team.closedMet', { pts: teamPoints, target }) : t('pointsTracker.team.closedMissed', { pts: teamPoints, target }))
    : diff === 0 ? t('pointsTracker.team.onPace')
      : t(diff > 0 ? 'pointsTracker.team.ahead' : 'pointsTracker.team.behind', { count: Math.abs(diff) });
  const sub = clock.current
    ? t('pointsTracker.team.sub', { pts: teamPoints, day: clock.elapsed, total: clock.total, pace: team.pace })
    : t('pointsTracker.team.subClosed', { month: monthLabel });

  const statusLabel = (s: Status) => t(`pointsTracker.status.${s}`);
  // Colonnes de « Où en est chacun ». Le détail s'affiche sous la liste (plus de panneau à droite) :
  // la liste garde toute la largeur et les graduations 15-20-25-30+ ne se chevauchent plus.
  const raceCols = 'md:grid-cols-[160px_1fr_96px_150px]';
  const paceCell = 'hidden md:block';

  // ───────── panneau de détail ─────────
  const renderPanel = (sel: MonthRow) => {
    const r = sel.rep;
    const quota = r.quota || 15;
    const miss = Math.max(0, quota - r.totalPoints);
    const nextTier = nextMonthlyTier(r.totalPoints);
    const advice = !clock.current
      ? (r.totalPoints >= quota ? t('pointsTracker.advice.closedMet') : t('pointsTracker.advice.closedMissed', { count: miss }))
      : miss > 0
        ? t('pointsTracker.advice.missing', { count: miss, date: lastDayLabel, outbound: Math.ceil(miss / 2), other: miss })
        : nextTier ? t('pointsTracker.advice.toTier', { count: nextTier - r.totalPoints, tier: nextTier }) : t('pointsTracker.advice.top');
    const week = weekPoints(r);
    type Sale = { key: string; date: string; name: string; meta: string; pts: number; counts: boolean; deal?: (typeof r.deals)[number] };
    const sales: Sale[] = [
      ...(r.deals || []).map((d) => ({
        key: `d-${d.crm_deal_id}`, date: String(d.close_date).slice(0, 10), name: d.deal_name || d.account_name,
        meta: `${d.lead_source_group || t('pointsTracker.sale.noSource')} · ${fmtDateOnly(d.close_date, { day: 'numeric', month: 'short' })}`,
        pts: Number(d.points) || 0, counts: r.includeDeals !== false, deal: d,
      })),
      ...(r.zentactMerchants || []).map((m) => ({
        key: `z-${m.merchant_account_id}`, date: String(m.activated_at).slice(0, 10), name: m.business_name,
        meta: `${t('pointsTracker.sale.activation')}${m.bonus_amount > 0 ? ` (${fmtMoney(m.bonus_amount, { decimals: 0 })})` : ''} · ${fmtDateOnly(m.activated_at, { day: 'numeric', month: 'short' })}`,
        pts: Number(m.points) || 0, counts: r.includePayments !== false,
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1));

    const parts = {
      head: (<>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs text-body dark:text-bodydark2">{r.team?.name || t('pointsTracker.noTeam')}</span>
            <h2 id="pt-rep-h" className="m-0 flex flex-wrap items-center gap-2 text-xl font-bold text-black dark:text-white">{r.repName} <ProbationBadge probation={r.probation} /></h2>
          </div>
          <StatusPill family={STATUS_FAMILY[sel.status]}>{statusLabel(sel.status)}</StatusPill>
        </div>
      </>),
      big: (<>
        <div className="flex items-baseline gap-2">
          <span className="text-[40px] font-bold leading-none text-black dark:text-white">{r.totalPoints}</span>
          <span className="text-[15px] text-body dark:text-bodydark2">/ {quota} pts</span>
          {clock.current && <span className="ml-auto text-[13px] text-body dark:text-bodydark2">{t('pointsTracker.projection')} <b className="text-black dark:text-white">{sel.proj}</b></span>}
        </div>
      </>),
      chart: (<>
        {sel.cum ? (
          <RepChart cum={sel.cum} total={clock.total} quota={quota} proj={sel.proj} today={clock.current}
            quotaLabel={t('pointsTracker.quotaN', { n: quota })}
            ariaLabel={t('pointsTracker.repChartAria', { name: r.repName, pts: r.totalPoints, day: clock.elapsed, proj: sel.proj, quota })} />
        ) : (
          <p className="m-0 rounded-xl bg-[#F7F7F8] px-3 py-2.5 text-[13px] text-body dark:bg-[#1B1B1B] dark:text-bodydark2">{t('pointsTracker.restricted')}</p>
        )}
      </>),
      advice: (<>
        <p className="m-0 rounded-xl bg-[rgba(245,131,69,0.14)] px-3 py-2.5 text-[13px] font-medium leading-relaxed text-accent-ink dark:bg-[rgba(245,131,69,0.16)] dark:text-[#F79C6A]">{advice}</p>
      </>),
      dl: (<>
        <dl className="m-0 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-body dark:text-bodydark2">{t('pointsTracker.crmPoints')}</dt>
            <dd className="m-0 font-bold text-black dark:text-white">{r.crmPoints} pts{r.includeDeals === false && <span className="ml-1 font-normal text-body dark:text-bodydark2">({t('pointsTracker.notCounted')})</span>}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-body dark:text-bodydark2">{t('pointsTracker.paymentPoints')}</dt>
            <dd className="m-0 font-bold text-black dark:text-white">{r.zentactPoints} pts{r.includePayments === false && <span className="ml-1 font-normal text-body dark:text-bodydark2">({t('pointsTracker.notCounted')})</span>}</dd>
          </div>
          {clock.current && week != null && (
            <div className="flex justify-between gap-3">
              <dt className="text-body dark:text-bodydark2">{t('pointsTracker.thisWeek')}</dt>
              <dd className="m-0 font-bold text-black dark:text-white">{week ? `+${week} pts` : t('pointsTracker.noPoints')}</dd>
            </div>
          )}
          {(r.monthlyBonus > 0 || r.zentactBonus > 0) && (
            <div className="flex justify-between gap-3">
              <dt className="text-body dark:text-bodydark2">{t('pointsTracker.bonuses')}</dt>
              <dd className="m-0 font-bold text-black dark:text-white">{fmtMoney(r.monthlyBonus + r.zentactBonus, { decimals: 0 })}</dd>
            </div>
          )}
        </dl>
      </>),
      sales: (<>
        {!r.restricted && (
          <div className="flex flex-col">
            <span className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2">{t('pointsTracker.recentSales')}</span>
            {sales.length === 0 && <p className="m-0 py-2 text-sm text-body dark:text-bodydark2">{t('pointsTracker.noSales')}</p>}
            <ul className="m-0 max-h-[340px] list-none overflow-y-auto p-0">
              {sales.map((s) => {
                const check = s.counts && (s.pts === 0 || (s.deal && !s.deal.lead_source_group));
                return (
                  <li key={s.key} className="flex items-center justify-between gap-2.5 border-b border-stroke py-2.5 last:border-0 dark:border-strokedark">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-black dark:text-white">{s.name}</span>
                      <span className="text-xs text-body dark:text-bodydark2">
                        {s.meta}
                        {s.deal?.source_overridden && <> · {t('pointsTracker.sale.manualSource')}</>}
                      </span>
                      {isAdmin && s.deal && (editingDeal === s.deal.crm_deal_id ? (
                        <Select autoOpen onClose={() => setEditingDeal(null)} value={s.deal.lead_source_group || ''}
                          onChange={(v) => { onOverrideSource(s.deal!.crm_deal_id, v); setEditingDeal(null); }}
                          options={[{ value: '', label: '—' }, ...leadSourceGroups.map((g) => ({ value: g, label: g }))]}
                          buttonClassName="mt-1 rounded border border-primary bg-transparent px-2 py-1 text-xs text-black outline-none dark:bg-form-input dark:text-white" />
                      ) : (
                        <span><Button variant="link" size="sm" onClick={() => setEditingDeal(s.deal!.crm_deal_id)}>{t('pointsTracker.sale.changeSource')}</Button></span>
                      ))}
                    </span>
                    <span className={`shrink-0 text-[13px] font-bold ${!s.counts ? 'text-body line-through dark:text-bodydark2' : check ? 'text-[#B42318] dark:text-[#F46060]' : 'text-[#067647] dark:text-[#57D193]'}`}>
                      {check ? t('pointsTracker.sale.toCheck') : `+${s.pts} ${s.pts > 1 ? 'pts' : 'pt'}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </>),
      link: (<>
        {!r.restricted && (
          <button type="button" className="self-start text-sm font-bold text-accent-ink hover:underline dark:text-[#F79C6A]"
            onClick={() => {
              // Le rapport de commissions retient le représentant choisi (useLocalStorage, JSON).
              try { localStorage.setItem('commissionReport.selectedRep', JSON.stringify(r.repName)); } catch { /* stockage bloqué */ }
              navigate('/commission-report?onglet=mois');
            }}>
            {t('pointsTracker.openReport')}
          </button>
        )}
      </>),
    };
    // Carte pleine largeur : chiffres | courbe et conseil | dernières ventes. Pour un représentant c'est
    // « Ton mois » ; pour un gestionnaire, le détail du représentant choisi, sous la liste.
    {
      return (
        <section id="pt-detail" aria-labelledby="pt-rep-h" className={`${card} grid grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] sm:p-6`}>
          <div className="flex min-w-0 flex-col gap-4">
            {repMode && <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-accent-ink dark:text-[#F79C6A]">{t('pointsTracker.yourMonth', { month: monthLabel })}</span>}
            {parts.head}
            {parts.big}
            {parts.dl}
            {parts.link}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {parts.chart}
            {parts.advice}
          </div>
          <div className="min-w-0">{parts.sales}</div>
        </section>
      );
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5">
      <div className="flex min-w-0 flex-col gap-5">
        {repMode && sel && renderPanel(sel)}
        {/* Rythme de l'équipe */}
        <section aria-labelledby="pt-pace-h" className={`${card} flex flex-wrap gap-5 p-5`}>
          <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-2">
            <div>
              <h2 id="pt-pace-h" className="m-0 text-base font-bold text-black dark:text-white">{headline}</h2>
              <span className="text-[13px] text-body dark:text-bodydark2">{sub}</span>
            </div>
            {team.complete && clock.elapsed > 0 ? (
              <>
                <TeamPaceChart cum={team.cum} total={clock.total} target={target} proj={team.proj} today={clock.current}
                  todayLabel={t('pointsTracker.today')} projLabel={t('pointsTracker.projected', { n: team.proj })} targetLabel={t('pointsTracker.targetN', { n: target })}
                  ariaLabel={t('pointsTracker.teamChartAria', { pts: teamPoints, day: clock.elapsed, proj: team.proj, target })} />
                <Legend items={[
                  { swatch: <span className="h-0.5 w-4 bg-primary" />, label: t('pointsTracker.legend.cumulative') },
                  ...(clock.current ? [{ swatch: <span className="w-4 border-t-2 border-dashed border-primary" />, label: t('pointsTracker.legend.projection') }] : []),
                  { swatch: <span className="w-4 border-t-2 border-dashed border-[#575A61] dark:border-[#999AA7]" />, label: t('pointsTracker.legend.targetPace') },
                ]} />
              </>
            ) : (
              // Sans le détail de chaque vente : une barre, pas une courbe inventée.
              <div className="mt-2 flex flex-col gap-2">
                <RaceBar points={Math.round((teamPoints / Math.max(target, 1)) * 15)} proj={Math.round((team.proj / Math.max(target, 1)) * 15)} quota={15}
                  ariaLabel={t('pointsTracker.teamChartAria', { pts: teamPoints, day: clock.elapsed, proj: team.proj, target })} />
                <span className="text-xs text-body dark:text-bodydark2">{t('pointsTracker.noCurve')}</span>
              </div>
            )}
          </div>
          <div className="grid flex-[1_1_180px] grid-cols-[repeat(auto-fit,minmax(150px,1fr))] content-start gap-2.5">
            <div className={inner}><span className="block text-xs text-body dark:text-bodydark2">{t('pointsTracker.kpi.teamPoints')}</span><span className="text-[22px] font-bold text-black dark:text-white">{teamPoints} <span className="text-[13px] font-medium text-body dark:text-bodydark2">/ {target}</span></span></div>
            <div className={inner}><span className="block text-xs text-body dark:text-bodydark2">{t('pointsTracker.kpi.atQuota')}</span><span className="text-[22px] font-bold text-black dark:text-white">{team.met} <span className="text-[13px] font-medium text-body dark:text-bodydark2">{t('pointsTracker.ofN', { n: rows.length })}</span></span></div>
            <div className={inner}><span className="block text-xs text-body dark:text-bodydark2">{t('pointsTracker.kpi.daysLeft')}</span><span className="text-[22px] font-bold text-black dark:text-white">{clock.remaining} <span className="text-[13px] font-medium text-body dark:text-bodydark2">{t('pointsTracker.ofN', { n: clock.total })}</span></span></div>
            <div className={inner}><span className="block text-xs text-body dark:text-bodydark2">{t(clock.current ? 'pointsTracker.kpi.atRisk' : 'pointsTracker.kpi.missed')}</span><span className={`text-[22px] font-bold ${team.risk ? 'text-[#B54708] dark:text-[#FDB022]' : 'text-[#067647] dark:text-[#57D193]'}`}>{team.risk}</span></div>
          </div>
        </section>

        {/* Où en est chacun */}
        <section aria-labelledby="pt-race-h" className={`${card} flex flex-col gap-1 p-4 sm:p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2">
            <h2 id="pt-race-h" className="m-0 text-base font-bold text-black dark:text-white">{t('pointsTracker.race.title')}</h2>
            <Legend items={[
              { swatch: <span className="h-2 w-3.5 rounded-sm bg-primary" />, label: t('pointsTracker.legend.done') },
              ...(clock.current ? [{ swatch: <span className="h-2 w-3.5 rounded-sm bg-[rgba(245,131,69,0.32)]" />, label: t('pointsTracker.legend.projection') }] : []),
              { swatch: <span className="h-3 w-0.5 bg-[#141414] dark:bg-white" />, label: t('pointsTracker.legend.quota') },
            ]} />
          </div>
          <div aria-hidden="true" className={`hidden gap-3.5 text-[11px] text-body dark:text-bodydark2 md:grid ${raceCols}`}>
            <span />
            <span className="relative block h-3.5"><span className="absolute left-0">0</span><span className="absolute left-1/2 -translate-x-1/2">15</span><span className="absolute left-[66.66%] -translate-x-1/2">20</span><span className="absolute left-[83.33%] -translate-x-1/2">25</span><span className="absolute right-0">30+</span></span>
            <span className={`text-center ${paceCell}`}>{t('pointsTracker.race.pace')}</span><span />
          </div>
          {rows.length === 0 && <p className="m-0 py-6 text-center text-sm text-body dark:text-bodydark2">{t('pointsTracker.race.empty', { month: monthLabel })}</p>}
          {teamGroups.map((g) => (
            <div key={g.name} className="flex flex-col">
              {teamGroups.length > 1 && (
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-0 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.06em] text-body first:pt-1 dark:text-bodydark2">
                  <span>{g.name}</span>
                  <span className="font-medium normal-case tracking-normal">{t('pointsTracker.race.teamSummary', { count: g.rows.length, pts: g.pts })}</span>
                </div>
              )}
          {g.rows.map((row) => {
            const r = row.rep;
            const on = sel?.rep.repName === r.repName;
            const quota = r.quota || 15;
            const pick = () => { setSelName(r.repName); requestAnimationFrame(() => document.getElementById('pt-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); };
            return (
              // Représentant : les lignes ne s'ouvrent pas (le détail d'un coéquipier est privé) ; la sienne reste surlignée.
              <div key={r.repName} {...(repMode ? {} : { onClick: pick, ...pressable(pick) })} aria-current={on ? 'true' : undefined}
                className={`-mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 rounded-xl px-2 py-2.5 ${raceCols} ${on ? 'bg-[rgba(245,131,69,0.08)]' : repMode ? '' : 'hover:bg-[#F7F7F8] dark:hover:bg-[#1B1B1B]'} ${repMode ? '' : 'cursor-pointer'}`}>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-bold text-black dark:text-white">{r.repName}</span>
                  <span className="truncate text-xs text-body dark:text-bodydark2">{[r.team?.name, r.probation?.inProbation ? t('pointsTracker.probation') : null].filter(Boolean).join(' · ') || t('pointsTracker.noTeam')}</span>
                </span>
                <span className="order-3 col-span-2 md:order-none md:col-span-1">
                  <RaceBar points={r.totalPoints} proj={clock.current ? row.proj : r.totalPoints} quota={quota}
                    ariaLabel={t('pointsTracker.race.aria', { pts: r.totalPoints, quota, proj: row.proj })} />
                </span>
                <span className={paceCell}>{row.cum ? <Sparkline cum={row.cum} total={clock.total} quota={quota} proj={row.proj} /> : <span className="block text-center text-xs text-body dark:text-bodydark2">—</span>}</span>
                <span className="flex items-center justify-end gap-2">
                  <span className="whitespace-nowrap text-[15px] font-bold text-black dark:text-white">{r.totalPoints}<span className="text-xs font-medium text-body dark:text-bodydark2"> / {quota}</span></span>
                  <StatusPill family={STATUS_FAMILY[row.status]}>{statusLabel(row.status)}</StatusPill>
                </span>
              </div>
            );
          })}
            </div>
          ))}
        </section>

        {!repMode && sel && renderPanel(sel)}

        {/* Activations sans représentant (administrateurs) */}
        {isAdmin && unassigned && unassigned.zentactMerchants.length > 0 && (
          <section aria-labelledby="pt-unassigned-h" className={`${card} flex flex-col gap-2 p-4 sm:p-5`}>
            <h2 id="pt-unassigned-h" className="m-0 text-base font-bold text-black dark:text-white">{t('pointsTracker.unassigned.title', { count: unassigned.zentactMerchants.length })}</h2>
            <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('pointsTracker.unassigned.hint')}</p>
            <ul className="m-0 list-none p-0">
              {unassigned.zentactMerchants.map((m) => (
                <li key={m.merchant_account_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke py-2.5 last:border-0 dark:border-strokedark">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-black dark:text-white">{m.business_name}</span>
                    <span className="text-xs text-body dark:text-bodydark2">{t('pointsTracker.sale.activation')} · {fmtDateOnly(m.activated_at)}{m.opportunity_id ? ` · ${m.opportunity_id}` : ''}</span>
                  </span>
                  <Select value="" onChange={(v) => onAssign(m.merchant_account_id, v)} placeholder={t('pointsTracker.unassigned.assign') as string}
                    options={activeReps.map((n) => ({ value: n, label: n }))} aria-label={t('pointsTracker.unassigned.assign') as string}
                    buttonClassName="rounded-lg border border-stroke bg-transparent px-3 py-1.5 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:text-white" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

    </div>
  );
}
