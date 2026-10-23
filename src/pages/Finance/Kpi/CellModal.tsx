// Onglet KPI — une cellule RÉELLE expliquée : sa source, sa formule, les abonnements qui la
// composent (lignes Zoho Billing) et, pour un usager qui peut écrire, sa correction.
//   - ligne du grand livre → saisie manuelle (remplace Zoho Books) ;
//   - taux de change → taux manuel (remplace la Banque du Canada) ;
//   - autre ligne → correction du réel (gagne sur le calcul, se propage aux formules).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, dialog, toast } from '../../../components/ui';
import { CARD_SUB, INPUT, LABEL, TABLE_WRAP, TD, TH, THEAD_ROW } from '../../../components/ui/surface';
import type { Formatter } from '../format';
import { kpiApi, type DetailRow } from './api';
import { BILLING_KEYS, GL_KEYS, type ACell, type KpiDef } from './kpiModel';
import { errCode } from './useKpi';
import { parseNum, useKpiFormat } from './KpiTable';

type DetailKind = 'activations' | 'cancellations' | 'usaChurn';
const DETAIL: Partial<Record<string, DetailKind>> = {
  canNew: 'activations', resellerAdds: 'activations', newMrr: 'activations',
  coo: 'cancellations', churn: 'cancellations', churnMrr: 'cancellations', usaChurn: 'usaChurn',
};

export function CellModal({ open, onClose, month, def, cell, canEdit, fmt, srcText, onSaved }: {
  open: boolean;
  onClose: () => void;
  month: string;
  def: KpiDef;
  cell: ACell;
  canEdit: boolean;
  fmt: Formatter;
  srcText: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const F = useKpiFormat(fmt);
  const kind = DETAIL[def.key];
  const [detail, setDetail] = useState<DetailRow[] | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = cell.saved || null;
  const isGl = GL_KEYS.includes(def.key);
  const isFx = def.key === 'fxUsdCad';

  useEffect(() => {
    if (!open) return;
    setValue(saved ? String(saved.v).replace('.', fmt.fr ? ',' : '.') : '');
    setNote(saved?.note || '');
    setErr(null);
    setDetail(null); setDetailErr(null);
    if (kind && BILLING_KEYS.includes(def.key)) {
      kpiApi.detail(month).then((r) => setDetail(r.detail[kind])).catch((e) => setDetailErr(errCode(e)));
    }
  }, [open, month, def.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = (detail || []).filter((d) => {
    if (def.key === 'resellerAdds') return !!d.reseller;
    if (def.key === 'canNew') return !d.reseller;
    if (def.key === 'coo') return !!d.coo;
    if (def.key === 'churn' || def.key === 'churnMrr') return !d.coo;
    if (def.key === 'newMrr') return !d.cooOf;
    return true;
  });

  const save = async (v: number | null) => {
    setBusy(true); setErr(null);
    try {
      await kpiApi.saveActual(month, def.key, v, v == null ? null : note.trim() || null, saved?.version || 0);
      toast.success(v == null ? t('finance.kpi.cell.removed') : t('finance.kpi.cell.saved'));
      onSaved();
      onClose();
    } catch (e) {
      const c = errCode(e);
      setErr(c === 'conflict' ? t('finance.kpi.errors.conflict') : t('finance.kpi.errors.save', { code: c }));
      if (c === 'conflict') onSaved();
    } finally { setBusy(false); }
  };
  const onSave = () => {
    const v = parseNum(value, fmt.fr);
    if (v == null) { setErr(t('finance.kpi.cell.badValue')); return; }
    save(v);
  };
  const onRemove = async () => {
    if (!(await dialog.confirm(t('finance.kpi.cell.removeConfirm')))) return;
    save(null);
  };

  const name = t(`finance.kpi.rows.${def.key}`);
  const dirty = canEdit && (value !== (saved ? String(saved.v).replace('.', fmt.fr ? ',' : '.') : '') || note !== (saved?.note || ''));
  return (
    <Modal
      open={open}
      onClose={onClose}
      dirty={dirty}
      size="lg"
      title={t('finance.kpi.cell.title', { kpi: name, month: F.month(month) })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('finance.kpi.cell.close')}</Button>
          {canEdit && saved && <Button variant="danger" disabled={busy} onClick={onRemove}>{t('finance.kpi.cell.remove')}</Button>}
          {canEdit && <Button variant="primary" disabled={busy} onClick={onSave}>{t('finance.kpi.cell.save')}</Button>}
        </>
      }
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[160px_1fr]">
        <dt className="font-bold text-body dark:text-bodydark2">{t('finance.kpi.cell.value')}</dt>
        <dd className="tabular-nums text-black dark:text-white">{F.val(cell.v, def.fmt) || '—'}</dd>
        <dt className="font-bold text-body dark:text-bodydark2">{t('finance.kpi.cell.source')}</dt>
        <dd className="text-black dark:text-white">{srcText}</dd>
        <dt className="font-bold text-body dark:text-bodydark2">{t('finance.kpi.cell.formula')}</dt>
        <dd className="text-black dark:text-white">{t(`finance.kpi.formula.${def.key}`)}</dd>
      </dl>
      {cell.src === 'override' && cell.base !== undefined && (
        <p className={`mt-2 ${CARD_SUB}`}>{t('finance.kpi.cell.original', { v: F.val(cell.base ?? null, def.fmt) || '—' })}</p>
      )}

      {kind && BILLING_KEYS.includes(def.key) && (
        <div className="mt-4">
          <h3 className="mb-2 text-[13px] font-bold text-black dark:text-white">{t('finance.kpi.cell.detail')}</h3>
          {detailErr ? <p className={CARD_SUB}>{t('finance.kpi.errors.load')} ({detailErr})</p>
            : detail == null ? <p className={CARD_SUB}>{t('finance.kpi.cell.detailLoading')}</p>
              : !filtered.length ? <p className={CARD_SUB}>{t('finance.kpi.cell.detailEmpty')}</p>
                : (
                  <div className={`${TABLE_WRAP} max-h-[320px] overflow-y-auto`}>
                    <table className="w-full border-collapse text-[14px]">
                      <thead><tr className={THEAD_ROW}>
                        <th className={`${TH} text-left`}>{t('finance.kpi.cell.customer')}</th>
                        <th className={`${TH} text-left`}>{t('finance.kpi.cell.sub')}</th>
                        <th className={`${TH} text-left`}>{t('finance.kpi.cell.date')}</th>
                        <th className={`${TH} text-right`}>{t('finance.kpi.cell.monthly')}</th>
                        <th className={`${TH} text-left`}>{t('finance.kpi.cell.flag')}</th>
                      </tr></thead>
                      <tbody>
                        {filtered.map((d) => (
                          <tr key={`${d.org}|${d.sub}`}>
                            <td className={TD}>{d.customer}</td>
                            <td className={`${TD} tabular-nums`}>{d.sub}</td>
                            <td className={`${TD} tabular-nums`}>{d.date}{d.dateSrc ? ` (${t('finance.kpi.cell.dateFallback', { src: d.dateSrc })})` : ''}</td>
                            <td className={`${TD} text-right tabular-nums`}>{fmt.fmt(d.monthly, '$2')}</td>
                            <td className={TD}>
                              {d.reseller ? t('finance.kpi.cell.reseller', { name: d.reseller })
                                : d.cooOf ? t('finance.kpi.cell.cooNew', { sub: d.cooOf })
                                  : d.coo ? t('finance.kpi.cell.coo') : (d.reason || '')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
        </div>
      )}

      {canEdit && (
        <div className="mt-5 rounded-xl border border-stroke p-3 dark:border-strokedark">
          <h3 className="mb-2 text-[13px] font-bold text-black dark:text-white">
            {isGl ? t('finance.kpi.cell.editGl') : isFx ? t('finance.kpi.cell.editFx') : t('finance.kpi.cell.editOverride')}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
            <label className="block">
              <span className={LABEL}>{t('finance.kpi.cell.newValue')}</span>
              <input type="text" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className={`${INPUT} w-full text-right tabular-nums`} />
            </label>
            <label className="block">
              <span className={LABEL}>{t('finance.kpi.cell.note')}</span>
              <input type="text" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={`${INPUT} w-full`} />
            </label>
          </div>
          {err && <p role="alert" className="mt-2 text-[13.5px] font-bold text-[#B42318] dark:text-[#F46060]">{err}</p>}
        </div>
      )}
    </Modal>
  );
}
