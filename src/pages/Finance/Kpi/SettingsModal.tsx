// Onglet KPI — réglages de la CFO : solde de départ du parc, organisations Zoho Billing, motifs
// « changement de propriétaire », alias des revendeurs, et RATTACHEMENT des comptes Zoho Books
// aux lignes KPI (jamais deviné : les suggestions ne sont que des indices).
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../../components/Select';
import { Button, Modal, toast } from '../../../components/ui';
import { CARD_SUB, INPUT, LABEL } from '../../../components/ui/surface';
import type { Formatter } from '../format';
import { kpiApi, type Account, type GlLine, type KpiSettings } from './api';
import { errCode } from './useKpi';
import { parseNum, useKpiFormat } from './KpiTable';

const LINES: GlLine[] = ['recurringRevenue', 'sellingExpense', 'subscriptionRevenue', 'adyenIncome'];
const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export function SettingsModal({ open, onClose, settings, orgs, months, canEdit, fmt, onSaved }: {
  open: boolean;
  onClose: () => void;
  settings: KpiSettings;
  orgs: { id: string; name: string }[];
  months: string[];
  canEdit: boolean;
  fmt: Formatter;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const F = useKpiFormat(fmt);
  const [openingMonth, setOpeningMonth] = useState('');
  const [openingValue, setOpeningValue] = useState('');
  const [can, setCan] = useState('');
  const [usa, setUsa] = useState('');
  const [coo, setCoo] = useState('');
  const [aliases, setAliases] = useState('');
  const [useTable, setUseTable] = useState(true);
  const [mapping, setMapping] = useState<Record<GlLine, Set<string>>>({ recurringRevenue: new Set(), sellingExpense: new Set(), subscriptionRevenue: new Set(), adyenIncome: new Set() });
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [filter, setFilter] = useState('');
  const [line, setLine] = useState<GlLine>('recurringRevenue');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOpeningMonth(settings.opening?.month || '');
    setOpeningValue(settings.opening ? String(settings.opening.value) : '');
    setCan(settings.canadaOrgIds[0] || '');
    setUsa(settings.usaOrgIds[0] || '');
    setCoo(settings.cooReasons.join('\n'));
    setAliases(settings.resellerAliases.join('\n'));
    setUseTable(settings.useResellersTable);
    setMapping(Object.fromEntries(LINES.map((l) => [l, new Set((settings.glMapping[l] || []).map((m) => m.key))])) as Record<GlLine, Set<string>>);
    setErr(null); setDirty(false); setFilter('');
    setAccounts(null);
    kpiApi.accounts().then((r) => setAccounts(r.accounts)).catch(() => setAccounts([]));
  }, [open, settings]);

  const touch = <T,>(f: (v: T) => void) => (v: T) => { f(v); setDirty(true); };
  const toggle = (key: string) => {
    setMapping((m) => { const s = new Set(m[line]); if (s.has(key)) s.delete(key); else s.add(key); return { ...m, [line]: s }; });
    setDirty(true);
  };
  const shown = useMemo(() => (accounts || []).filter((a) => !filter || `${a.section} ${a.name}`.toLowerCase().includes(filter.toLowerCase())), [accounts, filter]);
  const orgOpts = orgs.map((o) => ({ value: o.id, label: o.name }));
  const monthOpts = [{ value: '', label: t('finance.kpi.settings.none') }, ...months.map((m) => ({ value: m, label: F.month(m) }))];

  const save = async () => {
    setErr(null);
    let opening: KpiSettings['opening'] = null;
    if (openingMonth) {
      const v = parseNum(openingValue, fmt.fr);
      if (v == null || v < 0) { setErr(t('finance.kpi.cell.badValue')); return; }
      opening = { month: openingMonth, value: v };
    }
    setBusy(true);
    try {
      await kpiApi.saveSettings({
        canadaOrgIds: can ? [can] : settings.canadaOrgIds,
        usaOrgIds: usa ? [usa] : settings.usaOrgIds,
        cooReasons: lines(coo),
        resellerAliases: lines(aliases),
        useResellersTable: useTable,
        opening,
        glMapping: Object.fromEntries(LINES.map((l) => [l, [...mapping[l]].map((key) => ({ key }))])) as KpiSettings['glMapping'],
      }, settings.version);
      toast.success(t('finance.kpi.settings.saved'));
      onSaved();
      onClose();
    } catch (e) {
      const c = errCode(e);
      setErr(c === 'conflict' ? t('finance.kpi.errors.conflict') : t('finance.kpi.settings.error', { code: c }));
      if (c === 'conflict') onSaved();
    } finally { setBusy(false); }
  };

  const dis = !canEdit;
  return (
    <Modal
      open={open}
      onClose={onClose}
      dirty={dirty && canEdit}
      size="xl"
      title={t('finance.kpi.settings.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('finance.kpi.settings.cancel')}</Button>
          {canEdit && <Button variant="primary" disabled={busy} onClick={save}>{t('finance.kpi.settings.save')}</Button>}
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section>
          <h3 className="mb-1 text-[13px] font-bold text-black dark:text-white">{t('finance.kpi.settings.opening')}</h3>
          <p className={`mb-2 ${CARD_SUB}`}>{t('finance.kpi.settings.openingHelp')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={LABEL}>{t('finance.kpi.settings.openingMonth')}</span><Select value={openingMonth} onChange={touch(setOpeningMonth)} options={monthOpts} disabled={dis} /></div>
            <label className="block"><span className={LABEL}>{t('finance.kpi.settings.openingValue')}</span>
              <input type="text" inputMode="decimal" disabled={dis || !openingMonth} value={openingValue} onChange={(e) => touch(setOpeningValue)(e.target.value)} className={`${INPUT} w-full text-right tabular-nums`} />
            </label>
          </div>

          <h3 className="mb-2 mt-5 text-[13px] font-bold text-black dark:text-white">{t('finance.kpi.settings.orgs')}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><span className={LABEL}>{t('finance.kpi.settings.canada')}</span><Select value={can} onChange={touch(setCan)} options={orgOpts} disabled={dis} /></div>
            <div><span className={LABEL}>{t('finance.kpi.settings.usa')}</span><Select value={usa} onChange={touch(setUsa)} options={orgOpts} disabled={dis} /></div>
          </div>

          <label className="mt-5 block">
            <span className="mb-1 block text-[13px] font-bold text-black dark:text-white">{t('finance.kpi.settings.coo')}</span>
            <span className={`mb-2 block ${CARD_SUB}`}>{t('finance.kpi.settings.cooHelp')}</span>
            <textarea rows={3} disabled={dis} value={coo} onChange={(e) => touch(setCoo)(e.target.value)} className={`${INPUT} h-auto w-full py-2`} />
          </label>

          <label className="mt-5 block">
            <span className="mb-1 block text-[13px] font-bold text-black dark:text-white">{t('finance.kpi.settings.aliases')}</span>
            <span className={`mb-2 block ${CARD_SUB}`}>{t('finance.kpi.settings.aliasesHelp')}</span>
            <textarea rows={4} disabled={dis} value={aliases} onChange={(e) => touch(setAliases)(e.target.value)} className={`${INPUT} h-auto w-full py-2`} />
          </label>
          <label className="mt-2 flex items-center gap-2 text-[13px] text-black dark:text-white">
            <input type="checkbox" disabled={dis} checked={useTable} onChange={(e) => touch(setUseTable)(e.target.checked)} />
            {t('finance.kpi.settings.useTable')}
          </label>
        </section>

        <section>
          <h3 className="mb-1 text-[13px] font-bold text-black dark:text-white">{t('finance.kpi.settings.mapping')}</h3>
          <p className={`mb-2 ${CARD_SUB}`}>{t('finance.kpi.settings.mappingHelp')}</p>
          <div className="mb-2 flex flex-wrap gap-1" role="tablist">
            {LINES.map((l) => (
              <button key={l} type="button" role="tab" aria-selected={line === l} onClick={() => setLine(l)}
                className={`rounded-lg px-2.5 py-1 text-[13.5px] font-bold ${line === l ? 'bg-primary text-[#141414]' : 'bg-gray-2 text-body hover:text-black dark:bg-meta-4 dark:text-bodydark2 dark:hover:text-white'}`}>
                {t(`finance.kpi.settings.lines.${l}`)} ({mapping[l].size})
              </button>
            ))}
          </div>
          <input type="search" aria-label={t('finance.kpi.settings.search')} placeholder={t('finance.kpi.settings.search')} value={filter} onChange={(e) => setFilter(e.target.value)} className={`${INPUT} mb-2 w-full`} />
          {accounts == null ? <p className={CARD_SUB}>…</p> : !accounts.length ? <p className={CARD_SUB}>{t('finance.kpi.settings.noAccounts')}</p> : (
            <ul className="max-h-[360px] overflow-y-auto rounded-xl border border-stroke dark:border-strokedark">
              {shown.map((a) => (
                <li key={a.key} className="border-b border-stroke/60 px-3 py-1.5 last:border-b-0 dark:border-strokedark/60">
                  <label className="flex items-start gap-2 text-[13.5px] text-black dark:text-white">
                    <input type="checkbox" className="mt-0.5" disabled={dis} checked={mapping[line].has(a.key)} onChange={() => toggle(a.key)} />
                    <span className="min-w-0 flex-1">
                      <span className={a.isGroup ? 'font-bold' : ''}>{a.name}</span>
                      {a.isGroup && <span className="ml-1 text-[11px] uppercase text-body dark:text-bodydark2">({t('finance.kpi.settings.group')})</span>}
                      {a.suggest.includes(line) && <span className="ml-1 rounded bg-[rgba(253,176,34,0.18)] px-1 text-[11px] text-[#93370D] dark:text-[#FEC84B]">{t('finance.kpi.settings.suggested')}</span>}
                      <span className="block text-[11.5px] text-body dark:text-bodydark2">{a.section}</span>
                    </span>
                    <span className="tabular-nums text-body dark:text-bodydark2">{a.lastAmount == null ? '' : fmt.fmt(a.lastAmount, '$')}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {err && <p role="alert" className="mt-3 text-[13.5px] font-bold text-[#B42318] dark:text-[#F46060]">{err}</p>}
    </Modal>
  );
}
