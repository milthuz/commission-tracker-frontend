// Salaires & contractuels — import Excel (feuilles Payroll et Contractors) : choisir le fichier →
// aperçu (ajoutés / modifiés / absents du fichier, totaux avant / après) → confirmer. Rien n'est
// écrit avant la confirmation ; les absents du fichier ne sont retirés que si la case est cochée.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, dialog, toast } from '../../../components/ui';
import { TABLE_WRAP } from '../../../components/ui/surface';
import { useFinance } from '../FinanceContext';
import { consolidatedApi, type Change, type ConRow, type EmpRow, type RosterPreview, type Side } from './api';
import { Block, Chip, FileStep, MessageList, TD_S, TH_S } from './parts';
import { useImportFlow } from './useImportFlow';

const MAX_ROWS = 200;

type Row = { kind: 'added' | 'changed' | 'missing'; key: string; who: string; where: string; changes: Change[] };

function rowsOf(side: Side<any>, who: (x: any) => string, where: (x: any) => string): Row[] {
  return [
    ...side.added.map((x, i): Row => ({ kind: 'added', key: `a${i}`, who: who(x), where: where(x), changes: [] })),
    ...side.changed.map((x): Row => ({ kind: 'changed', key: `c${x.id}`, who: who(x), where: where(x), changes: x.changes })),
    ...side.missing.map((x): Row => ({ kind: 'missing', key: `m${x.id}`, who: who(x), where: where(x), changes: [] })),
  ];
}

export function RosterImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { fmt, reload, payload } = useFinance();
  const [removeMissing, setRemoveMissing] = useState(false);
  const flow = useImportFlow<RosterPreview, Awaited<ReturnType<typeof consolidatedApi.rosterConfirm>>>({
    preview: consolidatedApi.rosterPreview,
    confirm: (p) => consolidatedApi.rosterConfirm(p, removeMissing),
  });
  const { pv } = flow;
  const money = (v: number) => fmt.fmt(v, '$');

  const close = () => { flow.reset(); setRemoveMissing(false); onClose(); };
  const onPick = (f: File | undefined) => { setRemoveMissing(false); flow.pick(f); };

  const nMissing = pv ? pv.employees.missing.length + pv.contractors.missing.length : 0;
  const nAdded = pv ? pv.employees.added.length + pv.contractors.added.length : 0;
  const nChanged = pv ? pv.employees.changed.length + pv.contractors.changed.length : 0;
  const nRemoved = removeMissing ? nMissing : 0;
  const nothing = !!pv && nAdded + nChanged + nRemoved === 0;
  const after = pv ? (removeMissing ? pv.totals.afterRemoveMissing : pv.totals.after) : null;

  const value = (c: Change, v: string | number | null) => {
    if (v == null || v === '') return '—';
    if (c.field === 'salary' || c.field === 'amt' || c.field === 'rate') return money(Number(v));
    if (c.field === 'alloc') return `${Math.round(Number(v) * 1000) / 10} %`;
    if (c.field === 'hours') return fmt.fmt(Number(v), 'n');
    if (c.field === 'map') return t(`finance.maps.${v}`, { defaultValue: String(v) });
    return String(v);
  };
  const changeText = (c: Change) => `${t(`finance.consolidatedImport.field.${c.field}`)} : ${value(c, c.before)} → ${value(c, c.after)}`;

  const apply = async () => {
    if (!pv || !pv.canConfirm || !after) return;
    const ok = await dialog.confirm(
      t('finance.consolidatedImport.roster.confirmMsg', { fy: payload.budget.fiscalYear, added: nAdded, changed: nChanged, removed: nRemoved, before: money(pv.totals.before.total), after: money(after.total) }),
      {
        title: t('finance.consolidatedImport.roster.confirmTitle'),
        confirmText: t('finance.consolidatedImport.roster.apply'),
        danger: nRemoved > 0,
        details: nRemoved > 0 ? [t('finance.consolidatedImport.roster.confirmRemoves', { n: nRemoved })] : undefined,
      });
    if (!ok) return;
    const r = await flow.apply();
    if (!r) return;
    const a = r.applied;
    toast.success(t('finance.consolidatedImport.roster.done', {
      added: a.employees.added + a.contractors.added, changed: a.employees.changed + a.contractors.changed, removed: a.employees.removed + a.contractors.removed,
    }));
    await reload();
    close();
  };

  const block = (title: string, side: Side<EmpRow | ConRow>, who: (x: any) => string, where: (x: any) => string) => {
    const rows = rowsOf(side, who, where);
    return (
      <Block title={title}>
        {!side.compared ? (
          <p className="m-0 text-[12.5px] text-body dark:text-bodydark2">{t('finance.consolidatedImport.roster.notCompared')}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="add">{t('finance.consolidatedImport.counts.added', { n: side.added.length })}</Chip>
              <Chip tone="chg">{t('finance.consolidatedImport.counts.changed', { n: side.changed.length })}</Chip>
              <Chip tone="miss">{t('finance.consolidatedImport.counts.missing', { n: side.missing.length })}</Chip>
              <Chip tone="same">{t('finance.consolidatedImport.counts.unchanged', { n: side.unchanged })}</Chip>
            </div>
            {rows.length > 0 && (
              <div className={`${TABLE_WRAP} max-h-[260px] overflow-y-auto`}>
                <table className="w-full border-collapse text-[12.5px]">
                  <thead className="sticky top-0 bg-white dark:bg-boxdark">
                    <tr>
                      <th className={`${TH_S} text-left`}>{t('finance.consolidatedImport.cols.kind')}</th>
                      <th className={`${TH_S} text-left`}>{t('finance.consolidatedImport.cols.person')}</th>
                      <th className={`${TH_S} text-left`}>{t('finance.consolidatedImport.cols.detail')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, MAX_ROWS).map((r) => (
                      <tr key={r.key}>
                        <td className={TD_S}><Chip tone={r.kind === 'added' ? 'add' : r.kind === 'changed' ? 'chg' : 'miss'}>{t(`finance.consolidatedImport.kind.${r.kind}`)}</Chip></td>
                        <td className={`${TD_S} text-black dark:text-white`}><span className="font-bold">{r.who}</span><span className="block text-[11.5px] text-body dark:text-bodydark2">{r.where}</span></td>
                        <td className={`${TD_S} text-left`}>
                          {r.kind === 'changed' ? r.changes.map((c) => <span key={c.field} className="block">{changeText(c)}</span>) : r.kind === 'missing' ? t('finance.consolidatedImport.roster.missingNote') : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rows.length > MAX_ROWS && <p className="m-0 text-[12px] text-body dark:text-bodydark2">{t('finance.consolidatedImport.showingFirst', { n: MAX_ROWS, total: rows.length })}</p>}
          </>
        )}
      </Block>
    );
  };

  const tot = (label: string, b: number, a: number, isMoney = true) => (
    <tr>
      <td className={`${TD_S} text-left`}>{label}</td>
      <td className={`${TD_S} text-right`}>{isMoney ? money(b) : fmt.fmt(b, 'n')}</td>
      <td className={`${TD_S} text-right font-bold`}>{isMoney ? money(a) : fmt.fmt(a, 'n')}</td>
      <td className={`${TD_S} text-right`}>{a === b ? '—' : `${a > b ? '+' : '−'}${isMoney ? money(Math.abs(a - b)) : fmt.fmt(Math.abs(a - b), 'n')}`}</td>
    </tr>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      dirty={!!pv && !!pv.token}
      size="xl"
      title={t('finance.consolidatedImport.roster.title')}
      footer={
        <>
          <Button size="md" onClick={close}>{t('finance.consolidatedImport.cancel')}</Button>
          <Button size="md" variant="primary" disabled={!pv || !pv.canConfirm || nothing || flow.busy}
            disabledReason={pv && !pv.canConfirm ? t('finance.consolidatedImport.fixErrors') : nothing ? t('finance.consolidatedImport.nothing') : undefined}
            onClick={apply}>
            {flow.busy ? t('finance.consolidatedImport.applying') : t('finance.consolidatedImport.roster.apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13px] text-black dark:text-white">
        <FileStep
          intro={<>{t('finance.consolidatedImport.roster.intro')} {t('finance.consolidatedImport.roster.keeps')}</>}
          input={flow.input} onPick={onPick} reading={flow.reading} error={flow.error}
          onTemplate={() => consolidatedApi.rosterTemplate(i18n.language).catch((e) => dialog.alert(t(`finance.consolidatedImport.error.${e?.body?.error || 'template_failed'}`, { defaultValue: t('finance.consolidatedImport.error.template_failed') })))}
          templateLabel={t('finance.consolidatedImport.template')}
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
            {block(t('finance.consolidatedImport.roster.employees'), pv.employees, (x: EmpRow) => x.name, (x: EmpRow) => `${x.ent} · ${x.dept} · ${t(`finance.maps.${x.map}`, { defaultValue: x.map })}`)}
            {block(t('finance.consolidatedImport.roster.contractors'), pv.contractors, (x: ConRow) => [x.co, x.name].filter(Boolean).join(' — '), (x: ConRow) => `${x.svc || '—'} · ${t(`finance.maps.${x.map}`, { defaultValue: x.map })}`)}
            {nMissing > 0 && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-stroke bg-gray-2 px-3 py-2 dark:border-strokedark dark:bg-meta-4">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={removeMissing} onChange={(e) => setRemoveMissing(e.target.checked)} />
                <span>
                  <span className="block font-bold">{t('finance.consolidatedImport.roster.removeMissing', { n: nMissing })}</span>
                  <span className="block text-[12px] text-body dark:text-bodydark2">{t('finance.consolidatedImport.roster.removeMissingHint')}</span>
                </span>
              </label>
            )}
            {after && (
              <Block title={t('finance.consolidatedImport.roster.totalsTitle', { fy: payload.budget.fiscalYear })} hint={t('finance.consolidatedImport.roster.totalsHint')}>
                <div className={TABLE_WRAP}>
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead><tr>
                      <th className={`${TH_S} text-left`}>{t('finance.consolidatedImport.cols.measure')}</th>
                      <th className={`${TH_S} text-right`}>{t('finance.consolidatedImport.cols.before')}</th>
                      <th className={`${TH_S} text-right`}>{t('finance.consolidatedImport.cols.after')}</th>
                      <th className={`${TH_S} text-right`}>{t('finance.consolidatedImport.cols.change')}</th>
                    </tr></thead>
                    <tbody>
                      {tot(t('finance.consolidatedImport.roster.payroll'), pv.totals.before.payroll, after.payroll)}
                      {tot(t('finance.consolidatedImport.roster.contractorsTotal'), pv.totals.before.contractors, after.contractors)}
                      {tot(t('finance.consolidatedImport.roster.total'), pv.totals.before.total, after.total)}
                      {tot(t('finance.consolidatedImport.roster.headcount'), pv.totals.before.headcount, after.headcount, false)}
                      {tot(t('finance.consolidatedImport.roster.contractorCount'), pv.totals.before.contractorCount, after.contractorCount, false)}
                    </tbody>
                  </table>
                </div>
              </Block>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
