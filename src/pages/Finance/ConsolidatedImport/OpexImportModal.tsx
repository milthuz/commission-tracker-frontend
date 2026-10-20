// OPEX (FY2027) — import Excel de la base (feuille OPEX, 36 mois) : choisir le fichier → aperçu par
// ligne (FY26 / FY27 / FY28, avant → après) → confirmer. Seules les valeurs de base des lignes
// DÉJÀ présentes changent ; les lignes sans clé sont listées, jamais créées.
import { useTranslation } from 'react-i18next';
import { Button, Modal, dialog, toast } from '../../../components/ui';
import { TABLE_WRAP } from '../../../components/ui/surface';
import { useFinance } from '../FinanceContext';
import { consolidatedApi, type OpexLine, type OpexPreview } from './api';
import { Block, Chip, FileStep, MessageList, TD_S, TH_S } from './parts';
import { useImportFlow } from './useImportFlow';

const FYS = [2026, 2027, 2028] as const;
const MAX_ROWS = 200;

export function OpexImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { fmt, reload } = useFinance();
  const flow = useImportFlow<OpexPreview, Awaited<ReturnType<typeof consolidatedApi.opexConfirm>>>({
    preview: consolidatedApi.opexPreview,
    confirm: consolidatedApi.opexConfirm,
  });
  const { pv } = flow;
  const money = (v: number) => fmt.fmt(v, '$');
  const close = () => { flow.reset(); onClose(); };
  const nothing = !!pv && pv.changed.length === 0;
  const delta = (b: number, a: number) => (Math.abs(a - b) < 0.005 ? '—' : `${a > b ? '+' : '−'}${money(Math.abs(a - b))}`);

  const apply = async () => {
    if (!pv || !pv.canConfirm || nothing) return;
    const ok = await dialog.confirm(
      t('finance.consolidatedImport.opex.confirmMsg', { n: pv.changed.length, before: money(pv.totals.before[1]), after: money(pv.totals.after[1]) }),
      {
        title: t('finance.consolidatedImport.opex.confirmTitle'),
        confirmText: t('finance.consolidatedImport.opex.apply'),
        details: pv.changed.some((c) => c.special) ? [t('finance.consolidatedImport.opex.confirmComputed')] : undefined,
      });
    if (!ok) return;
    const r = await flow.apply();
    if (!r) return;
    toast.success(t('finance.consolidatedImport.opex.done', { n: r.applied.lines }));
    await reload();
    close();
  };

  const cell = (c: OpexLine, i: number) => {
    const f = c.fy[i];
    const same = Math.abs(f.before - f.after) < 0.005;
    return (
      <td key={i} className={`${TD_S} text-right`}>
        {same ? <span className="text-body dark:text-bodydark2">{money(f.after)}</span> : <><span className="text-body dark:text-bodydark2">{money(f.before)}</span> → <span className="font-bold">{money(f.after)}</span></>}
      </td>
    );
  };

  return (
    <Modal
      open={open}
      onClose={close}
      dirty={!!pv && !!pv.token}
      size="xl"
      title={t('finance.consolidatedImport.opex.title')}
      footer={
        <>
          <Button size="md" onClick={close}>{t('finance.consolidatedImport.cancel')}</Button>
          <Button size="md" variant="primary" disabled={!pv || !pv.canConfirm || nothing || flow.busy}
            disabledReason={pv && !pv.canConfirm ? t('finance.consolidatedImport.fixErrors') : nothing ? t('finance.consolidatedImport.nothing') : undefined}
            onClick={apply}>
            {flow.busy ? t('finance.consolidatedImport.applying') : t('finance.consolidatedImport.opex.apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13px] text-black dark:text-white">
        <FileStep
          intro={t('finance.consolidatedImport.opex.intro')}
          input={flow.input} onPick={flow.pick} reading={flow.reading} error={flow.error}
          onTemplate={() => consolidatedApi.opexTemplate().catch((e) => dialog.alert(t(`finance.consolidatedImport.error.${e?.body?.error || 'template_failed'}`, { defaultValue: t('finance.consolidatedImport.error.template_failed') })))}
          templateLabel={t('finance.consolidatedImport.templateShort')}
        />
        {pv && (
          <>
            {pv.errors.length > 0 && (
              <Block title={t('finance.consolidatedImport.errorsTitle', { n: pv.errors.length })} hint={t('finance.consolidatedImport.errorsHint')}>
                <MessageList items={pv.errors} tone="err" />
              </Block>
            )}
            {pv.warnings.length > 0 && (
              <Block title={t('finance.consolidatedImport.warningsTitle', { n: pv.warnings.length })}>
                <MessageList items={pv.warnings} tone="warn" />
              </Block>
            )}
            <Block title={t('finance.consolidatedImport.opex.changedTitle')}>
              <div className="flex flex-wrap gap-1.5">
                <Chip tone="chg">{t('finance.consolidatedImport.opex.changedCount', { n: pv.changed.length })}</Chip>
                <Chip tone="same">{t('finance.consolidatedImport.counts.unchanged', { n: pv.unchanged })}</Chip>
                <Chip tone="miss">{t('finance.consolidatedImport.opex.unmatchedCount', { n: pv.unmatched.length })}</Chip>
              </div>
              {pv.changed.length > 0 && (
                <div className={`${TABLE_WRAP} max-h-[300px] overflow-y-auto`}>
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead className="sticky top-0 bg-white dark:bg-boxdark">
                      <tr>
                        <th className={`${TH_S} text-left`}>{t('finance.consolidatedImport.opex.line')}</th>
                        {FYS.map((y) => <th key={y} className={`${TH_S} text-right`}>FY{y}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {pv.changed.slice(0, MAX_ROWS).map((c) => (
                        <tr key={c.key}>
                          <td className={`${TD_S} text-black dark:text-white`}>
                            <span className="font-bold">{c.name}</span>
                            {c.special === 'payroll' && <span className="ml-1.5" title={t('finance.consolidatedImport.opex.special.payrollTip')}><Chip tone="chg">{t('finance.consolidatedImport.opex.special.payroll')}</Chip></span>}
                            {c.special === 'travel' && <span className="ml-1.5" title={t('finance.consolidatedImport.opex.special.travelTip')}><Chip tone="chg">{t('finance.consolidatedImport.opex.special.travel')}</Chip></span>}
                            <span className="block text-[11.5px] text-body dark:text-bodydark2">{c.section} · {t('finance.consolidatedImport.opex.monthsChanged', { n: c.months })}</span>
                          </td>
                          {FYS.map((_, i) => cell(c, i))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {pv.changed.length > MAX_ROWS && <p className="m-0 text-[12px] text-body dark:text-bodydark2">{t('finance.consolidatedImport.showingFirst', { n: MAX_ROWS, total: pv.changed.length })}</p>}
              {pv.changed.some((c) => c.special) && <p className="m-0 text-[12px] text-body dark:text-bodydark2">{t('finance.consolidatedImport.opex.specialNote')}</p>}
            </Block>
            <Block title={t('finance.consolidatedImport.opex.totalsTitle')} hint={t('finance.consolidatedImport.opex.totalsHint')}>
              <div className={TABLE_WRAP}>
                <table className="w-full border-collapse text-[12.5px]">
                  <thead><tr>
                    <th className={`${TH_S} text-left`}>{t('finance.consolidatedImport.cols.measure')}</th>
                    <th className={`${TH_S} text-right`}>{t('finance.consolidatedImport.cols.before')}</th>
                    <th className={`${TH_S} text-right`}>{t('finance.consolidatedImport.cols.after')}</th>
                    <th className={`${TH_S} text-right`}>{t('finance.consolidatedImport.cols.change')}</th>
                  </tr></thead>
                  <tbody>
                    {FYS.map((y, i) => (
                      <tr key={y}>
                        <td className={`${TD_S} text-left`}>{t('finance.consolidatedImport.opex.totalFy', { y })}</td>
                        <td className={`${TD_S} text-right`}>{money(pv.totals.before[i])}</td>
                        <td className={`${TD_S} text-right font-bold`}>{money(pv.totals.after[i])}</td>
                        <td className={`${TD_S} text-right`}>{delta(pv.totals.before[i], pv.totals.after[i])}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className={`${TD_S} text-left`}>{t('finance.consolidatedImport.opex.editable27')}</td>
                      <td className={`${TD_S} text-right`}>{money(pv.totals.fy27Editable.before)}</td>
                      <td className={`${TD_S} text-right font-bold`}>{money(pv.totals.fy27Editable.after)}</td>
                      <td className={`${TD_S} text-right`}>{delta(pv.totals.fy27Editable.before, pv.totals.fy27Editable.after)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Block>
            {pv.unmatched.length > 0 && (
              <Block title={t('finance.consolidatedImport.opex.unmatchedTitle', { n: pv.unmatched.length })} hint={t('finance.consolidatedImport.opex.unmatchedHint')}>
                <div className={`${TABLE_WRAP} max-h-[200px] overflow-y-auto`}>
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead><tr>
                      <th className={`${TH_S} text-left`}>{t('finance.consolidatedImport.opex.line')}</th>
                      <th className={`${TH_S} text-left`}>{t('finance.consolidatedImport.opex.section')}</th>
                      <th className={`${TH_S} text-right`}>{t('finance.consolidatedImport.opex.row')}</th>
                      <th className={`${TH_S} text-right`}>FY2027</th>
                    </tr></thead>
                    <tbody>
                      {pv.unmatched.map((u, i) => (
                        <tr key={i}>
                          <td className={`${TD_S} text-black dark:text-white`}>{u.name}{u.duplicate && <span className="ml-1.5"><Chip tone="chg">{t('finance.consolidatedImport.opex.duplicate')}</Chip></span>}</td>
                          <td className={`${TD_S} text-left`}>{u.section || '—'}</td>
                          <td className={`${TD_S} text-right`}>{u.row}</td>
                          <td className={`${TD_S} text-right`}>{money(u.fy[1])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Block>
            )}
            {pv.notInFile.length > 0 && (
              <Block title={t('finance.consolidatedImport.opex.notInFileTitle', { n: pv.notInFile.length })} hint={t('finance.consolidatedImport.opex.notInFileHint')}>
                <p className="m-0 text-[12.5px] text-body dark:text-bodydark2">{pv.notInFile.map((x) => x.name).join(' · ')}</p>
              </Block>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
