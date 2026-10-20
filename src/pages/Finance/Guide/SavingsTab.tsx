// Guide — volet 2 : pistes d'économies tirées des RÉELS du grand livre (Zoho Books). Tant qu'il n'y a
// pas de réels, l'écran le dit et explique ce qu'il fera ensuite : rien n'est inventé.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineError, StatusPill, toast } from '../../../components/ui';
import type { StatusFamily } from '../../../components/ui';
import { CARD, CARD_HEAD, CARD_SUB, CARD_TITLE, TABLE, TABLE_WRAP, TD, TH, THEAD_ROW } from '../../../components/ui/surface';
import { ContentLoader } from '../../../common/Loader';
import { useFinance } from '../FinanceContext';
import { sum } from '../model';
import { AssignModal } from './AssignModal';
import { errCode, guideApi, type SavingsPayload } from './api';
import { leadPrompt, topAccountPrompt, variancePrompt } from './guideModel';
import { copyText, fmtUnit, monthLabel, useL } from './shared';

const BOOKS_FAMILY: Record<string, StatusFamily> = { ok: 'ok', reconnect: 'err', error: 'err', never: 'wait', busy: 'wait', warning: 'wait' };

export function SavingsTab() {
  const { t } = useTranslation();
  const L = useL();
  const { payload, result, fmt } = useFinance();
  const [data, setData] = useState<SavingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const load = useCallback(async () => {
    try { setData(await guideApi.savings()); setError(null); } catch (e) { setError(errCode(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const ml = (m: string) => monthLabel(fmt, m);
  const copy = async (text: string) => { if (await copyText(text)) toast.success(L('copied')); else setError('copy_failed'); };

  // Budget vs réel : seulement pour les lignes rattachées ET les mois de l'exercice du budget.
  const variances = useMemo(() => {
    if (!data) return { rows: [] as { key: string; line: string; month: string; actual: number; budget: number; ytdActual: number; ytdBudget: number }[], anyLine: false };
    const fy = payload.budget.fiscalYear;
    const rows: { key: string; line: string; month: string; actual: number; budget: number; ytdActual: number; ytdBudget: number }[] = [];
    const lines = Object.entries(data.budgetLines);
    for (const [bl, byMonth] of lines) {
      const key = bl.slice(4);
      const bv = result.opex27.byKey[key];
      if (!bv) continue;
      const months = Object.keys(byMonth).filter((m) => m.startsWith(`${fy}-`)).sort();
      if (!months.length) continue;
      const last = months[months.length - 1];
      const item = payload.reference.opex.find((it) => it.key === key);
      rows.push({
        key: bl, line: item ? item.name : key, month: last, actual: byMonth[last], budget: bv[Number(last.slice(5)) - 1],
        ytdActual: sum(months.map((m) => byMonth[m])), ytdBudget: sum(months.map((m) => bv[Number(m.slice(5)) - 1])),
      });
    }
    return { rows, anyLine: lines.length > 0 };
  }, [data, result, payload.reference.opex, payload.budget.fiscalYear]);

  if (error && !data) {
    const msg = error === 'forbidden' || error === 'demo' ? L(`errors.${error}`) : L('errors.load');
    return <InlineError title={msg} detail={error} onRetry={load} />;
  }
  if (!data) return <ContentLoader label={L('loading')} />;
  const errText = error ? (t(`finance.guide.errors.${error}`, { defaultValue: t('finance.guide.errors.generic', { code: error }) }) as string) : null;

  // --------------------------------------------------------------- aucun réel
  if (!data.hasActuals) {
    const why = data.books.state === 'reconnect' ? L('savings.noActuals.reconnect')
      : data.books.state === 'ok' ? L('savings.noActuals.noMonths') : L('savings.noActuals.never');
    return (
      <div className="space-y-4">
        <div className={`${CARD} p-5`}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-base font-bold text-black dark:text-white">{L('savings.noActuals.title')}</h2>
            <StatusPill family={BOOKS_FAMILY[data.books.state] || 'neutral'}>{L(`savings.books.${data.books.state}`, {})}</StatusPill>
          </div>
          <p className="m-0 text-[13px] text-body dark:text-bodydark2">{why}</p>
          <p className="m-0 mt-3 text-[13px] font-bold text-black dark:text-white">{L('savings.noActuals.next')}</p>
          <ul className="m-0 mt-1 list-disc space-y-1 pl-5 text-[13px] text-body dark:text-bodydark2">
            {[1, 2, 3, 4, 5].map((i) => <li key={i}>{L(`savings.noActuals.next${i}`)}</li>)}
          </ul>
        </div>
      </div>
    );
  }

  const monthTag = data.latestMonth ? ml(data.latestMonth) : '';
  const deptPill = (d: string | null) => (d ? <StatusPill family="new">{L(`dept.${d}`)}</StatusPill> : <StatusPill family="wait">{L('savings.toAssign')}</StatusPill>);

  return (
    <div className="space-y-4">
      {errText && <InlineError title={errText} />}
      <div className={`${CARD} flex flex-wrap items-center gap-3 px-4 py-3`}>
        <div className="min-w-0 flex-1 text-[13px] text-body dark:text-bodydark2">
          {L('savings.summary', { month: monthTag, months: data.monthsAvailable })}
          {data.classification.unknown > 0 && <span> {L('savings.unknown', { n: data.classification.unknown })}</span>}
        </div>
        <Button size="sm" variant={data.unassigned.length ? 'primary' : 'secondary'} onClick={() => setAssignOpen(true)} disabled={!data.caps.canEdit}>
          {L('savings.assignButton', { n: data.unassigned.length })}
        </Button>
      </div>
      {data.unassigned.length > 0 && (
        <p role="status" className="m-0 rounded-xl border border-[rgba(247,144,9,0.45)] bg-[rgba(247,144,9,0.08)] px-4 py-3 text-[13px] text-[#93370D] dark:text-[#FEC84B]">
          {L('savings.unassignedBanner', { n: data.unassigned.length })}{!data.caps.canEdit && ` ${L('savings.readOnly')}`}
        </p>
      )}

      <section className={CARD}>
        <div className={CARD_HEAD}><h2 className={CARD_TITLE}>{L('savings.leads.title')}</h2><p className={CARD_SUB}>{L('savings.leads.sub', { pct: data.params.minPct, amt: fmtUnit(fmt, data.params.minAbs, 'cad'), month: monthTag })}</p></div>
        {data.leads.length === 0 ? <p className="m-0 p-5 text-[13px] text-body dark:text-bodydark2">{L('savings.leads.none')}</p> : (
          <div className={`${TABLE_WRAP} m-3`}>
            <table className={TABLE}>
              <thead><tr className={THEAD_ROW}>
                <th className={`${TH} text-left`}>{L('savings.col.account')}</th><th className={`${TH} text-left`}>{L('savings.col.dept')}</th>
                <th className={`${TH} text-left`}>{L('savings.col.basis')}</th><th className={`${TH} text-right`}>{L('savings.col.amount')}</th>
                <th className={`${TH} text-right`}>{L('savings.col.baseline')}</th><th className={`${TH} text-right`}>{L('savings.col.delta')}</th><th className={TH}><span className="sr-only">{L('savings.col.action')}</span></th>
              </tr></thead>
              <tbody>
                {data.leads.map((l) => (
                  <tr key={l.id}>
                    <td className={TD}>{l.accountName}<div className="text-[12px] text-body dark:text-bodydark2">{l.section}</div></td>
                    <td className={TD}>{deptPill(l.department)}{l.owner && <div className="mt-1 text-[12px] text-body dark:text-bodydark2">{l.owner}</div>}</td>
                    <td className={TD}>{L(`savings.basis.${l.type}`)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{fmtUnit(fmt, l.amount, 'cad')}</td>
                    <td className={`${TD} text-right tabular-nums`}>{fmtUnit(fmt, l.baseline, 'cad')}</td>
                    <td className={`${TD} text-right tabular-nums font-bold text-[#B42318] dark:text-[#F46060]`}>+{fmtUnit(fmt, l.deltaAbs, 'cad')}{l.deltaPct != null ? ` (${fmt.pct(l.deltaPct, true)})` : ` (${L('s.newSpend')})`}</td>
                    <td className={TD}><Button size="xs" variant="secondary" aria-label={`${L('savings.copyPrompt')} — ${l.accountName}`} onClick={() => copy(leadPrompt(l, fmt, L, ml))}>{L('savings.copyPrompt')}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={CARD}>
        <div className={CARD_HEAD}><h2 className={CARD_TITLE}>{L('savings.top.title')}</h2><p className={CARD_SUB}>{L('savings.top.sub')}</p></div>
        <div className={`${TABLE_WRAP} m-3`}>
          <table className={TABLE}>
            <thead><tr className={THEAD_ROW}>
              <th className={`${TH} text-left`}>{L('savings.col.account')}</th><th className={`${TH} text-left`}>{L('savings.col.dept')}</th>
              <th className={`${TH} text-right`}>{L('savings.col.total')}</th><th className={`${TH} text-right`}>{L('savings.col.share')}</th><th className={TH}><span className="sr-only">{L('savings.col.action')}</span></th>
            </tr></thead>
            <tbody>
              {data.topAccounts.map((a) => (
                <tr key={a.accountKey}>
                  <td className={TD}>{a.accountName}<div className="text-[12px] text-body dark:text-bodydark2">{a.section}</div></td>
                  <td className={TD}>{deptPill(a.department)}{a.owner && <div className="mt-1 text-[12px] text-body dark:text-bodydark2">{a.owner}</div>}</td>
                  <td className={`${TD} text-right tabular-nums`}>{fmtUnit(fmt, a.windowTotal, 'cad')}</td>
                  <td className={`${TD} text-right tabular-nums`}>{a.sharePct == null ? '—' : fmt.pct(a.sharePct)}</td>
                  <td className={TD}><Button size="xs" variant="secondary" aria-label={`${L('savings.copyPrompt')} — ${a.accountName}`} onClick={() => copy(topAccountPrompt(a, a.windowMonths || 12, fmt, L))}>{L('savings.copyPrompt')}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={CARD}>
        <div className={CARD_HEAD}><h2 className={CARD_TITLE}>{L('savings.variance.title')}</h2><p className={CARD_SUB}>{L('savings.variance.sub', { fy: payload.budget.fiscalYear })}</p></div>
        {variances.rows.length === 0 ? (
          <p className="m-0 p-5 text-[13px] text-body dark:text-bodydark2">{variances.anyLine ? L('savings.variance.noMonths', { fy: payload.budget.fiscalYear }) : L('savings.variance.noLines')}</p>
        ) : (
          <div className={`${TABLE_WRAP} m-3`}>
            <table className={TABLE}>
              <thead><tr className={THEAD_ROW}>
                <th className={`${TH} text-left`}>{L('savings.variance.line')}</th><th className={`${TH} text-right`}>{L('savings.variance.actual')}</th>
                <th className={`${TH} text-right`}>{L('savings.variance.budget')}</th><th className={`${TH} text-right`}>{L('savings.variance.delta')}</th>
                <th className={`${TH} text-right`}>{L('savings.variance.ytd')}</th><th className={TH}><span className="sr-only">{L('savings.col.action')}</span></th>
              </tr></thead>
              <tbody>
                {variances.rows.map((v) => {
                  const d = v.actual - v.budget;
                  return (
                    <tr key={v.key}>
                      <td className={TD}>{v.line}<div className="text-[12px] text-body dark:text-bodydark2">{ml(v.month)}</div></td>
                      <td className={`${TD} text-right tabular-nums`}>{fmtUnit(fmt, v.actual, 'cad')}</td>
                      <td className={`${TD} text-right tabular-nums`}>{fmtUnit(fmt, v.budget, 'cad')}</td>
                      <td className={`${TD} text-right tabular-nums ${d > 0 ? 'font-bold text-[#B42318] dark:text-[#F46060]' : ''}`}>{d >= 0 ? '+' : '−'}{fmtUnit(fmt, Math.abs(d), 'cad')}</td>
                      <td className={`${TD} text-right tabular-nums`}>{fmtUnit(fmt, v.ytdActual, 'cad')} / {fmtUnit(fmt, v.ytdBudget, 'cad')}</td>
                      <td className={TD}><Button size="xs" variant="secondary" aria-label={`${L('savings.copyPrompt')} — ${v.line}`} onClick={() => copy(variancePrompt({ line: v.line, month: ml(v.month), actual: v.actual, budget: v.budget }, fmt, L))}>{L('savings.copyPrompt')}</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AssignModal open={assignOpen} onClose={() => setAssignOpen(false)} accounts={data.accounts} knownOwners={data.knownOwners} onSaved={load} />
    </div>
  );
}
