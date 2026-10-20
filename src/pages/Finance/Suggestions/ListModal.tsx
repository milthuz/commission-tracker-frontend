// Module Finance — lot F : liste complète des suggestions (barre d'outils de la page Drivers) :
// cases à cocher, choix de la fenêtre de moyenne, « Appliquer la sélection ». Rien ne bouge sans
// clic ; la sélection recommandée exclut toujours la confiance basse.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineError, Modal, StateCard, toast } from '../../../components/ui';
import { TABLE, TABLE_WRAP, TD, TH, THEAD_ROW } from '../../../components/ui/surface';
import Select from '../../../components/Select';
import { useFinance } from '../FinanceContext';
import { average, buildRows, changePct, currentValues, errorKey, reasonKey, recommendedKeys, unavailableSorted } from './logic';
import { ConfidencePill, fmtUnit, monthLabel, useDriverLabel } from './shared';
import { useKept, useSuggestionData } from './useSuggestions';

export function ListModal({ open, onClose, onOpenDriver }: { open: boolean; onClose: () => void; onOpenDriver: (key: string) => void }) {
  const { t } = useTranslation();
  const F = useFinance();
  const { fmt } = F;
  const label = useDriverLabel();
  const [windowN, setWindowN] = useState(6);
  const S = useSuggestionData(windowN);
  const { kept } = useKept();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => { if (open) setPicked(new Set()); }, [open, windowN]);

  const data = S.data;
  const rows = useMemo(
    () => buildRows(data ? data.suggestions : [], (k) => currentValues(F.drivers.drv, F.payload.reference.drvDefaults, k), kept),
    [data, F.drivers.drv, F.payload.reference.drvDefaults, kept],
  );
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const apply = () => {
    let count = 0;
    for (const r of rows) if (picked.has(r.s.key) && r.differs) { F.applyDriverValues(r.s.key, r.s.suggested); count++; }
    toast.success(t('finance.suggestions.list.applied', { count }));
    setPicked(new Set());
    onClose();
  };
  const disabledReason = F.locked ? t('finance.suggestions.detail.locked') : !F.canEdit ? t('finance.suggestions.detail.noEdit') : picked.size === 0 ? t('finance.suggestions.list.pickSome') : undefined;
  const meta = data && data.meta;
  const winOpts = [3, 6, 12].map((n) => ({ value: String(n), label: t('finance.suggestions.list.windowOpt', { n }) }));

  return (
    <Modal
      open={open} onClose={onClose} size="xl"
      title={t('finance.suggestions.list.title')}
      footer={(
        <>
          <Button size="md" onClick={onClose}>{t('finance.suggestions.list.close')}</Button>
          <Button size="md" variant="primary" onClick={apply} disabledReason={disabledReason}>{t('finance.suggestions.list.apply', { count: picked.size })}</Button>
        </>
      )}
    >
      {S.status === 'error' && !data && <InlineError title={t('finance.suggestions.list.loadError')} detail={t(errorKey('suggestions', S.error || 'network'))} onRetry={S.reload} retryLabel={t('finance.suggestions.list.retry')} />}
      {S.loading && !data && <StateCard kind="loading" />}
      {data && (
        <>
          {meta && <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.suggestions.list.intro', { from: monthLabel(meta.months[0], fmt.loc), to: monthLabel(meta.lastClosedMonth, fmt.loc) })}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-body dark:text-bodydark2">{t('finance.suggestions.list.window')}</span>
            <div className="w-[150px]"><Select value={String(windowN)} onChange={(v) => setWindowN(Number(v))} options={winOpts} /></div>
            <Button size="sm" onClick={() => setPicked(new Set(recommendedKeys(rows)))}>{t('finance.suggestions.list.selectRecommended')}</Button>
            <Button size="sm" onClick={() => setPicked(new Set())}>{t('finance.suggestions.list.selectNone')}</Button>
          </div>
          {rows.length === 0 ? (
            <StateCard kind="empty" title={t('finance.suggestions.list.emptyTitle')} body={t('finance.suggestions.list.emptyBody')} />
          ) : (
            <div className={TABLE_WRAP}>
              <table className={TABLE}>
                <caption className="sr-only">{t('finance.suggestions.list.caption')}</caption>
                <thead>
                  <tr className={THEAD_ROW}>
                    <th scope="col" className={`${TH} w-10`}><span className="sr-only">{t('finance.suggestions.list.pick')}</span></th>
                    <th scope="col" className={`${TH} text-left`}>{t('finance.suggestions.list.col.driver')}</th>
                    <th scope="col" className={`${TH} text-left`}>{t('finance.suggestions.list.col.confidence')}</th>
                    <th scope="col" className={`${TH} text-left`}>{t('finance.suggestions.list.col.method')}</th>
                    <th scope="col" className={`${TH} text-right`}>{t('finance.suggestions.list.col.current')}</th>
                    <th scope="col" className={`${TH} text-right`}>{t('finance.suggestions.list.col.suggested')}</th>
                    <th scope="col" className={`${TH} text-right`}>{t('finance.suggestions.list.col.change')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const unit = r.s.basis.unit;
                    const c = changePct(average(r.current), average(r.s.suggested));
                    return (
                      <tr key={r.s.key}>
                        <td className={TD}>
                          <input
                            type="checkbox" className="h-4 w-4 accent-[#F58345]" checked={picked.has(r.s.key)} disabled={!r.differs}
                            onChange={() => toggle(r.s.key)} aria-label={t('finance.suggestions.list.pickDriver', { driver: label(r.s.key) })}
                          />
                        </td>
                        <td className={TD}>
                          <button type="button" className="text-left font-bold text-accent-ink underline-offset-2 hover:underline dark:text-accent-ink-dark" onClick={() => onOpenDriver(r.s.key)}>{label(r.s.key)}</button>
                          {r.state === 'same' && <span className="ml-2 text-xs text-body dark:text-bodydark2">{t('finance.suggestions.chip.same')}</span>}
                          {r.state === 'kept' && <span className="ml-2 text-xs text-body dark:text-bodydark2">{t('finance.suggestions.list.keptMine')}</span>}
                        </td>
                        <td className={TD}><ConfidencePill level={r.s.confidence} /></td>
                        <td className={`${TD} text-[13px]`}>{t(`finance.suggestions.method.${r.s.basis.method}`, { n: r.s.basis.windowMonths })}</td>
                        <td className={`${TD} text-right tabular-nums`}>{fmtUnit(fmt, unit, average(r.current))}</td>
                        <td className={`${TD} text-right font-bold tabular-nums`}>{fmtUnit(fmt, unit, average(r.s.suggested))}</td>
                        <td className={`${TD} text-right tabular-nums`}>{!r.differs ? '—' : c == null ? t('finance.suggestions.table.new') : fmt.pct(c, true)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="m-0 text-xs text-body dark:text-bodydark2">{t('finance.suggestions.list.averageNote')}</p>
          {data.unavailable.length > 0 && (
            <details className="rounded-xl border border-stroke px-4 py-3 dark:border-strokedark">
              <summary className="cursor-pointer text-sm font-bold text-black dark:text-white">{t('finance.suggestions.list.unavailableTitle', { count: data.unavailable.length })}</summary>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                {unavailableSorted(data.unavailable).map((u) => (
                  <li key={u.key} className="flex flex-wrap gap-x-2 text-[13px]">
                    <span className="font-bold text-black dark:text-white">{label(u.key)}</span>
                    <span className="text-body dark:text-bodydark2">{t(reasonKey(u.reason))}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Modal>
  );
}
