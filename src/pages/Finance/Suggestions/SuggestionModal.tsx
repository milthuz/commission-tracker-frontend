// Module Finance — lot F : fenêtre de détail d'UNE suggestion — valeurs suggérées par mois, base
// de calcul dite, historique en graphique, choix de la méthode, « Appliquer » ou « Garder la mienne ».
// Rien n'est modifié tant que la CFO n'a pas cliqué « Appliquer » (applyDriverValues, comme une saisie).
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, toast } from '../../../components/ui';
import { TABLE, TABLE_WRAP, TD, TH, THEAD_ROW } from '../../../components/ui/surface';
import Select from '../../../components/Select';
import { useFinance } from '../FinanceContext';
import type { Suggestion } from './api';
import { average, buildOptions, changePct, chartData, noteKey, sameValues } from './logic';
import { ConfidencePill, HistoryChart, fmtUnit, monthLabel, useDriverLabel } from './shared';
import { useKept } from './useSuggestions';

export function SuggestionModal({ open, onClose, suggestion: s, targets, current }: {
  open: boolean;
  onClose: () => void;
  suggestion: Suggestion;
  targets: string[];
  current: number[];
}) {
  const { t } = useTranslation();
  const F = useFinance();
  const { fmt } = F;
  const label = useDriverLabel()(s.key);
  const { keep, forget } = useKept();
  const options = useMemo(() => buildOptions(s), [s]);
  const [optId, setOptId] = useState(options[0].id);
  useEffect(() => { if (open) setOptId(options[0].id); }, [open, options]);
  const opt = options.find((o) => o.id === optId) || options[0];
  const unit = s.basis.unit;
  const same = sameValues(current, opt.values);
  const data = useMemo(() => chartData(s, targets, opt.values, current), [s, targets, opt, current]);

  const methodLabel = (m: string, n: number) => t(`finance.suggestions.method.${m}`, { n });
  const why = t(`finance.suggestions.why.${s.basis.why}`, { defaultValue: '', cv: s.basis.cv == null ? '—' : fmt.fmt(s.basis.cv * 100, 'n') });
  const nk = noteKey(s.basis.note);
  const note = s.basis.note ? (nk ? t(`finance.suggestions.note.${nk}`) : s.basis.note) : '';

  const disabledReason = F.locked ? t('finance.suggestions.detail.locked') : !F.canEdit ? t('finance.suggestions.detail.noEdit') : same ? t('finance.suggestions.detail.alreadySame') : undefined;
  const apply = () => {
    F.applyDriverValues(s.key, opt.values);
    forget(s.key);
    toast.success(t('finance.suggestions.detail.applied', { driver: label }));
    onClose();
  };
  const keepMine = () => {
    keep({ ...s, suggested: opt.values });
    toast.success(t('finance.suggestions.detail.keptToast', { driver: label }));
    onClose();
  };
  const loc = fmt.loc;

  return (
    <Modal
      open={open} onClose={onClose} size="xl"
      title={t('finance.suggestions.detail.title', { driver: label })}
      footer={(
        <>
          <Button size="md" onClick={keepMine}>{t('finance.suggestions.detail.keep')}</Button>
          <Button size="md" variant="primary" onClick={apply} disabledReason={disabledReason}>{t('finance.suggestions.detail.apply')}</Button>
        </>
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ConfidencePill level={s.confidence} />
        <span className="text-[13px] text-body dark:text-bodydark2">{t('finance.suggestions.detail.notApplied')}</span>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-body dark:text-bodydark2">{t('finance.suggestions.detail.methodLabel')}</span>
          <Select
            value={optId} onChange={setOptId}
            options={options.map((o) => ({ value: o.id, label: `${methodLabel(o.method, o.windowMonths)}${o.isDefault ? ` — ${t('finance.suggestions.detail.suggestedMethod')}` : ''}` }))}
          />
          <p className="m-0 text-[13px] text-body dark:text-bodydark2">
            {opt.isDefault && why ? why : t('finance.suggestions.why.chosen')}
          </p>
          {note && <p className="m-0 text-[13px] text-body dark:text-bodydark2">{note}</p>}
          <p className="m-0 text-[13px] text-body dark:text-bodydark2">
            {t('finance.suggestions.detail.sample', { values: s.basis.sample.map((v) => fmtUnit(fmt, unit, v)).join(' · ') })}
          </p>
          <p className="m-0 text-[13px] font-bold text-black dark:text-white">
            {t('finance.suggestions.detail.averages', { current: fmtUnit(fmt, unit, average(current)), suggested: fmtUnit(fmt, unit, average(opt.values)) })}
          </p>
        </div>
        <div>
          <HistoryChart
            data={data} fmt={fmt} unit={unit}
            labels={{ history: t('finance.suggestions.chart.history'), suggested: t('finance.suggestions.chart.suggested'), current: t('finance.suggestions.chart.current'), aria: t('finance.suggestions.chart.aria', { driver: label }) }}
          />
        </div>
      </div>

      <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <caption className="sr-only">{t('finance.suggestions.detail.tableCaption', { driver: label })}</caption>
          <thead>
            <tr className={THEAD_ROW}>
              <th scope="col" className={`${TH} text-left`}>{t('finance.suggestions.table.month')}</th>
              <th scope="col" className={`${TH} text-right`}>{t('finance.suggestions.table.current')}</th>
              <th scope="col" className={`${TH} text-right`}>{t('finance.suggestions.table.suggested')}</th>
              <th scope="col" className={`${TH} text-right`}>{t('finance.suggestions.table.change')}</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((m, i) => {
              const c = changePct(current[i], opt.values[i]);
              return (
                <tr key={m}>
                  <td className={TD}>{monthLabel(m, loc)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{fmtUnit(fmt, unit, current[i])}</td>
                  <td className={`${TD} text-right font-bold tabular-nums`}>{fmtUnit(fmt, unit, opt.values[i])}</td>
                  <td className={`${TD} text-right tabular-nums`}>{c == null ? (Math.abs(opt.values[i] - current[i]) < 1e-9 ? '—' : t('finance.suggestions.table.new')) : fmt.pct(c, true)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
