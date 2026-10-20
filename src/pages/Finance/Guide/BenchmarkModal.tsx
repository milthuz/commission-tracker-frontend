// Guide — modification d'un repère. Règle de la CFO : une VALEUR n'est enregistrée que si sa source
// est citable (organisme + année, + URL sauf cible interne). Sans valeur = « à valider par la CFO ».
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../../components/Select';
import { Button, InlineError, Modal, dialog, toast } from '../../../components/ui';
import { INPUT, LABEL } from '../../../components/ui/surface';
import { useFinance } from '../FinanceContext';
import { errCode, guideApi, type Benchmark, type BenchmarkInput, type MetricKey, type Unit } from './api';
import { TEXTAREA, useL } from './shared';

const UNITS: Unit[] = ['pct', 'pts', 'months', 'ratio', 'cad', 'usd', 'cad_year', 'usd_year'];
const BLANK: BenchmarkInput = {
  metric: 'gross_margin', labelEn: '', labelFr: '', value: null, unit: 'pct', direction: 'higher_better', kind: 'internal', useForFlags: true,
  sourceOrg: null, sourceUrl: null, sourceYear: null, sourceDate: null, note: null,
};

export function BenchmarkModal({ open, onClose, existing, metrics, onSaved }: {
  open: boolean; onClose: () => void; existing: Benchmark | null; metrics: string[]; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const L = useL();
  const { fmt } = useFinance();
  const init: BenchmarkInput = existing ? {
    metric: existing.metric, labelEn: existing.labelEn, labelFr: existing.labelFr, value: existing.value, unit: existing.unit, direction: existing.direction,
    kind: existing.kind, useForFlags: existing.useForFlags, sourceOrg: existing.sourceOrg, sourceUrl: existing.sourceUrl, sourceYear: existing.sourceYear,
    sourceDate: existing.sourceDate, note: existing.note,
  } : BLANK;
  const [f, setF] = useState<BenchmarkInput>(init);
  const [valueText, setValueText] = useState(init.value == null ? '' : String(init.value));
  const [yearText, setYearText] = useState(init.sourceYear == null ? '' : String(init.sourceYear));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof BenchmarkInput>(k: K, v: BenchmarkInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const blankToNull = (s: string | null) => (s == null || s.trim() === '' ? null : s.trim());

  const build = (): BenchmarkInput | null => {
    const v = valueText.trim() === '' ? null : fmt.parse(valueText);
    if (valueText.trim() !== '' && v == null) { setError('bad_value'); return null; }
    const y = yearText.trim() === '' ? null : Number(yearText);
    if (y != null && !Number.isInteger(y)) { setError('bad_source_year'); return null; }
    return { ...f, value: v, sourceYear: y, sourceOrg: blankToNull(f.sourceOrg), sourceUrl: blankToNull(f.sourceUrl), sourceDate: blankToNull(f.sourceDate), note: blankToNull(f.note), labelEn: f.labelEn.trim(), labelFr: f.labelFr.trim() };
  };
  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true); setError(null);
    try { await fn(); toast.success(okMsg); onSaved(); onClose(); } catch (e) { setError(errCode(e)); } finally { setBusy(false); }
  };
  const save = () => {
    const b = build();
    if (!b) return;
    return run(() => (existing ? guideApi.saveBenchmark(existing.id, b, existing.version) : guideApi.createBenchmark(b)), L('bench.saved'));
  };
  const reset = async () => {
    if (!existing || !(await dialog.confirm(L('bench.resetConfirm')))) return;
    await run(() => guideApi.resetBenchmark(existing.id), L('bench.resetDone'));
  };
  const remove = async () => {
    if (!existing || !(await dialog.confirm(L('bench.deleteConfirm'), { danger: true }))) return;
    await run(() => guideApi.deleteBenchmark(existing.id), L('bench.deleted'));
  };
  const errText = error ? (t(`finance.guide.errors.${error}`, { defaultValue: t('finance.guide.errors.generic', { code: error }) }) as string) : null;
  const dirty = JSON.stringify(f) !== JSON.stringify(init) || valueText !== (init.value == null ? '' : String(init.value)) || yearText !== (init.sourceYear == null ? '' : String(init.sourceYear));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      dirty={dirty}
      title={existing ? L('bench.editTitle') : L('bench.addTitle')}
      footer={(
        <>
          {existing && existing.origin === 'shipped' && existing.edited && <Button variant="secondary" disabled={busy} onClick={reset}>{L('bench.reset')}</Button>}
          {existing && existing.origin === 'cfo' && <Button variant="danger" disabled={busy} onClick={remove}>{L('bench.delete')}</Button>}
          <Button variant="secondary" onClick={onClose}>{L('bench.cancel')}</Button>
          <Button variant="primary" disabled={busy || !f.labelEn.trim() || !f.labelFr.trim()} onClick={save}>{L('bench.save')}</Button>
        </>
      )}
    >
      <p className="m-0 mb-3 text-[13px] text-body dark:text-bodydark2">{L('bench.rule')}</p>
      {errText && <InlineError title={errText} className="mb-3" />}
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className={LABEL} htmlFor="bm-en">{L('bench.labelEn')}</label><input id="bm-en" className={`${INPUT} w-full`} maxLength={120} value={f.labelEn} onChange={(e) => set('labelEn', e.target.value)} /></div>
        <div><label className={LABEL} htmlFor="bm-fr">{L('bench.labelFr')}</label><input id="bm-fr" className={`${INPUT} w-full`} maxLength={120} value={f.labelFr} onChange={(e) => set('labelFr', e.target.value)} /></div>
        <div><label className={LABEL}>{L('bench.metric')}</label><Select value={f.metric} onChange={(v) => set('metric', v as MetricKey)} options={metrics.map((m) => ({ value: m, label: L(`metric.${m}`) }))} /></div>
        <div><label className={LABEL}>{L('bench.unit')}</label><Select value={f.unit} onChange={(v) => set('unit', v as Unit)} options={UNITS.map((u) => ({ value: u, label: L(`unit.${u}`) }))} /></div>
        <div><label className={LABEL} htmlFor="bm-value">{L('bench.value')}</label><input id="bm-value" inputMode="decimal" className={`${INPUT} w-full`} value={valueText} onChange={(e) => setValueText(e.target.value)} placeholder={L('bench.valueEmpty')} /></div>
        <div><label className={LABEL}>{L('bench.direction')}</label><Select value={f.direction} onChange={(v) => set('direction', v as BenchmarkInput['direction'])} options={[{ value: 'higher_better', label: L('bench.higher') }, { value: 'lower_better', label: L('bench.lower') }]} /></div>
        <div><label className={LABEL}>{L('bench.kind')}</label><Select value={f.kind} onChange={(v) => set('kind', v as BenchmarkInput['kind'])} options={(['public', 'reference', 'internal'] as const).map((k) => ({ value: k, label: L(`kind.${k}`) }))} /></div>
        <div className="flex items-end"><label className="flex items-center gap-2 text-[13px] text-black dark:text-white"><input type="checkbox" checked={f.useForFlags} onChange={(e) => set('useForFlags', e.target.checked)} />{L('bench.useForFlags')}</label></div>
        <div><label className={LABEL} htmlFor="bm-org">{L('bench.sourceOrg')}</label><input id="bm-org" className={`${INPUT} w-full`} maxLength={120} value={f.sourceOrg || ''} onChange={(e) => set('sourceOrg', e.target.value)} /></div>
        <div><label className={LABEL} htmlFor="bm-year">{L('bench.sourceYear')}</label><input id="bm-year" inputMode="numeric" className={`${INPUT} w-full`} value={yearText} onChange={(e) => setYearText(e.target.value)} /></div>
        <div className="md:col-span-2"><label className={LABEL} htmlFor="bm-url">{L('bench.sourceUrl')}</label><input id="bm-url" type="url" className={`${INPUT} w-full`} maxLength={500} value={f.sourceUrl || ''} onChange={(e) => set('sourceUrl', e.target.value)} placeholder="https://" /></div>
        <div><label className={LABEL} htmlFor="bm-date">{L('bench.sourceDate')}</label><input id="bm-date" type="date" className={`${INPUT} w-full`} value={f.sourceDate || ''} onChange={(e) => set('sourceDate', e.target.value)} /></div>
        <div className="md:col-span-2"><label className={LABEL} htmlFor="bm-note">{L('bench.note')}</label><textarea id="bm-note" className={TEXTAREA} rows={2} maxLength={400} value={f.note || ''} onChange={(e) => set('note', e.target.value)} /></div>
      </div>
    </Modal>
  );
}
