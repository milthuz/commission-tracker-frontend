// Onglet KPI — import du budget depuis Excel : le serveur lit et VALIDE, renvoie un aperçu des
// cellules qui changent ; la CFO confirme ; puis on enregistre.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, toast } from '../../../components/ui';
import { CARD_SUB, TABLE_WRAP, TD, TH, THEAD_ROW } from '../../../components/ui/surface';
import type { Formatter } from '../format';
import { kpiApi, type ImportPreview } from './api';
import { DEF } from './kpiModel';
import { errCode } from './useKpi';
import { useKpiFormat } from './KpiTable';

export function ImportModal({ open, onClose, fmt, onDone }: { open: boolean; onClose: () => void; fmt: Formatter; onDone: () => void }) {
  const { t } = useTranslation();
  const F = useKpiFormat(fmt);
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setPreview(null); setErr(null); } }, [open]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setReading(true); setErr(null); setPreview(null);
    try { setPreview(await kpiApi.importPreview(f)); }
    catch (e) { setErr(t('finance.kpi.errors.importFailed', { code: errCode(e) })); }
    finally { setReading(false); if (input.current) input.current.value = ''; }
  };
  const confirm = async () => {
    if (!preview || !preview.cells.length) return;
    setBusy(true); setErr(null);
    try {
      await kpiApi.saveBudget(preview.cells.map(({ month, key, value }) => ({ month, key, value })), 'import');
      toast.success(t('finance.kpi.import.done'));
      onDone();
      onClose();
    } catch (e) { setErr(t('finance.kpi.errors.save', { code: errCode(e) })); }
    finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dirty={!!preview && preview.cells.length > 0}
      size="lg"
      title={t('finance.kpi.import.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('finance.kpi.import.cancel')}</Button>
          <Button variant="primary" disabled={busy || !preview || !preview.cells.length} onClick={confirm}>
            {t('finance.kpi.import.confirm', { n: preview ? preview.cells.length : 0 })}
          </Button>
        </>
      }
    >
      <p className={`mb-3 ${CARD_SUB}`}>{t('finance.kpi.import.help')}</p>
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <Button variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={reading}>{t('finance.kpi.import.choose')}</Button>
      {reading && <p className={`mt-3 ${CARD_SUB}`}>{t('finance.kpi.import.reading')}</p>}
      {err && <p role="alert" className="mt-3 text-[12.5px] font-bold text-[#B42318] dark:text-[#F46060]">{err}</p>}
      {preview && (
        <div className="mt-4">
          <p className="mb-2 text-[13px] text-black dark:text-white">
            {preview.cells.length ? t('finance.kpi.import.changes', { n: preview.cells.length }) : t('finance.kpi.import.noChange')}
            {' · '}{t('finance.kpi.import.unchanged', { n: preview.unchanged })}
          </p>
          {preview.cells.length > 0 && (
            <div className={`${TABLE_WRAP} max-h-[320px] overflow-y-auto`}>
              <table className="w-full border-collapse text-[12.5px]">
                <thead><tr className={THEAD_ROW}>
                  <th className={`${TH} text-left`}>{t('finance.kpi.cols.kpi')}</th>
                  <th className={`${TH} text-left`}>{t('finance.kpi.import.month')}</th>
                  <th className={`${TH} text-right`}>{t('finance.kpi.import.old')}</th>
                  <th className={`${TH} text-right`}>{t('finance.kpi.import.new')}</th>
                </tr></thead>
                <tbody>
                  {preview.cells.map((c) => (
                    <tr key={`${c.month}|${c.key}`}>
                      <td className={TD}>{t(`finance.kpi.rows.${c.key}`)}</td>
                      <td className={`${TD} tabular-nums`}>{F.month(c.month)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{F.val(c.old, DEF[c.key].fmt) || '—'}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`}>{F.val(c.value, DEF[c.key].fmt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.errors.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1 text-[13px] font-bold text-black dark:text-white">{t('finance.kpi.import.errors')}</h3>
              <ul className="list-disc pl-5 text-[12.5px] text-body dark:text-bodydark2">
                {preview.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>{t('finance.kpi.import.row', { row: e.row })}{e.month ? ` · ${F.month(e.month)}` : ''} : {t(`finance.kpi.import.err.${e.error}`, { defaultValue: e.error })}{e.value ? ` (${e.value})` : ''}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
