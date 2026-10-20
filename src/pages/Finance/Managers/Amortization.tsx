// Module Finance — Amortissement des terminaux (finance:amortization). Lots de terminaux achetés,
// amortis en ligne droite À PARTIR du mois de mise en service (rien avant) sur leur durée de vie
// (36 mois par défaut, valeur résiduelle 0) ; écriture du mois (Dt 6200 / Ct 1590) et écriture de
// radiation, passées dans Zoho Books ; projection de la valeur nette comptable.
// Données : saisie de la CFO et import Excel — aucune donnée d'exemple.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { ContentLoader } from '../../../common/Loader';
import PageTitle from '../../../components/PageTitle';
import { Button, InlineError, Modal, StateCard, StatusPill, dialog, toast } from '../../../components/ui';
import { INPUT, TABLE_WRAP } from '../../../components/ui/surface';
import { useIsDark } from '../../../lib/theme';
import { Card, Kpi, KpiRow } from '../components';
import { amortApi, errCode, type AmortPayload, type AmortSettings, type Lot, type LotStatus } from './api';
import { monthLabel, monthlyPreview, parseAmount, parseIntStrict, validateLotForm, type LotForm } from './logic';
import { Field, ImportModal, JournalCard, ManagersHeader, MonthBar, MonthInput, RowButton, TD, TDR, TH, THR, TextInput, money2, useErrText, useFmt } from './shared';
import { BooksAccountsModal } from './BooksAccounts';

const STATUS_PILL: Record<LotStatus, 'ok' | 'new' | 'neutral' | 'err'> = { amortizing: 'ok', notInService: 'new', fullyAmortized: 'neutral', writtenOff: 'err' };

export default function Amortization() {
  const { t } = useTranslation();
  const fmt = useFmt();
  const errText = useErrText();
  const [data, setData] = useState<AmortPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<Lot | 'new' | null>(null);
  const [writingOff, setWritingOff] = useState<Lot | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);

  const load = useCallback(async (m?: string) => {
    try { const p = await amortApi.load(m); setData(p); setError(null); return p; }
    catch (e) { setError(errCode(e)); return null; }
  }, []);
  useEffect(() => { load(month); }, [load, month]);
  const reload = useCallback(async () => { await load(data?.month); }, [load, data?.month]);

  if (error === 'perm' || error === 'demo_blocked') return <StateCard kind="empty" title={t(error === 'perm' ? 'finance.managers.noAccess' : 'finance.managers.demo')} />;
  if (error && !data) return <InlineError title={t('finance.managers.loadError')} detail={errText(error)} onRetry={() => load(month)} retryLabel={t('finance.managers.retry')} />;
  if (!data) return <ContentLoader label={t('finance.managers.loading')} />;

  const { summary: s, caps } = data;
  const M = data.month;
  const money = (v: number) => fmt.fmt(v, '$');
  const mShort = monthLabel(M, fmt.loc, true);
  const showWo = data.writeOffJournal.lines.length > 0 || !!data.writeOffJournal.post;

  const remove = async (l: Lot) => {
    if (!(await dialog.confirm(t('finance.managers.amort.removeConfirm', { ref: l.ref, name: l.description }), { danger: true }))) return;
    try { await amortApi.remove(l.id, l.version); toast.success(t('finance.managers.amort.removed')); await reload(); }
    catch (e) { dialog.alert(errText(errCode(e))); await reload(); }
  };
  const restore = async (l: Lot) => {
    if (!(await dialog.confirm(t('finance.managers.amort.restoreConfirm', { ref: l.ref })))) return;
    try { await amortApi.restore(l.id, l.version); toast.success(t('finance.managers.amort.restored')); await reload(); }
    catch (e) { dialog.alert(errText(errCode(e))); await reload(); }
  };

  return (
    <>
      <PageTitle titleKey="finance.managers.amort.title" />
      <ManagersHeader
        title={t('finance.managers.amort.title')}
        subtitle={t('finance.managers.amort.subtitle')}
        toolbar={
          <>
            <MonthBar month={M} current={data.currentMonth} range={data.range} onChange={(m) => setMonth(m)} />
            <span className="flex-1" />
            {caps.canEdit && <Button size="sm" variant="primary" onClick={() => setEditing('new')}>{t('finance.managers.amort.add')}</Button>}
            {caps.canEdit && <Button size="sm" onClick={() => setImportOpen(true)}>{t('finance.managers.import.button')}</Button>}
            <Button size="sm" onClick={() => amortApi.exportXlsx(M).catch((e) => dialog.alert(errText(errCode(e))))}>{t('finance.managers.exportXlsx')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>{t('finance.managers.settings')}</Button>
            {caps.canPost && <Button size="sm" variant="ghost" onClick={() => setAccountsOpen(true)}>{t('finance.managers.accounts.button')}</Button>}
          </>
        }
      />

      <KpiRow>
        <Kpi label={t('finance.managers.amort.kpi.cost')} value={money(s.cost)} detail={t('finance.managers.amort.kpi.lots', { lots: s.lots, units: fmt.int.format(s.unitsDeployed) })} sub={s.notInService ? t('finance.managers.amort.kpi.notInService', { n: s.notInService }) : undefined} />
        <Kpi label={t('finance.managers.amort.kpi.accumulated', { month: mShort })} value={money(s.accumulated)} detail={s.writtenOff ? t('finance.managers.amort.kpi.writtenOff', { n: s.writtenOff }) : undefined} />
        <Kpi label={t('finance.managers.amort.kpi.nbv', { month: mShort })} value={money(s.nbv)} detail={s.nbvPct == null ? undefined : t('finance.managers.amort.kpi.ofCost', { pct: fmt.pct(s.nbvPct * 100) })} />
        <Kpi label={t('finance.managers.amort.kpi.monthly', { month: mShort })} value={money(s.monthly)} detail={t('finance.managers.amort.kpi.straightLine')} />
      </KpiRow>

      <Projection points={s.projection} />

      <JournalCard
        key={`je-${M}`}
        journal={data.journal}
        title={t('finance.managers.amort.je.title', { month: monthLabel(M, fmt.loc) })}
        sub={t('finance.managers.amort.je.sub')}
        canPost={caps.canPost}
        post={(hash) => amortApi.post(M, 'amortization', hash)}
        onDone={reload}
        onGoAccounts={() => setAccountsOpen(true)}
        emptyText={t('finance.managers.amort.je.empty')}
      />
      {showWo && (
        <JournalCard
          key={`wo-${M}`}
          journal={data.writeOffJournal}
          title={t('finance.managers.amort.je.woTitle', { month: monthLabel(M, fmt.loc) })}
          sub={t(`finance.managers.amort.je.woSub_${data.writeOffJournal.mode || 'derecognize'}`, { lots: (data.writeOffJournal.lots || []).join(', ') })}
          canPost={caps.canPost}
          post={(hash) => amortApi.post(M, 'writeoff', hash)}
          onDone={reload}
          onGoAccounts={() => setSettingsOpen(true)}
          emptyText={t('finance.managers.amort.je.woEmpty')}
        />
      )}

      <Card title={t('finance.managers.amort.lots')} sub={t('finance.managers.amort.lotsSub', { n: data.lots.length })}>
        {data.lots.length === 0 ? (
          <StateCard kind="empty" title={t('finance.managers.amort.emptyTitle')} body={caps.canEdit ? t('finance.managers.amort.emptyBody') : undefined} />
        ) : (
          <div className={TABLE_WRAP}>
            <table className="w-full border-collapse text-[12.5px] text-black dark:text-white">
              <thead>
                <tr>
                  <th className={TH}>{t('finance.managers.amort.col.ref')}</th>
                  <th className={TH}>{t('finance.managers.amort.col.description')}</th>
                  <th className={THR}>{t('finance.managers.amort.col.qty')}</th>
                  <th className={THR}>{t('finance.managers.amort.col.unitCost')}</th>
                  <th className={THR}>{t('finance.managers.amort.col.cost')}</th>
                  <th className={TH}>{t('finance.managers.amort.col.inService')}</th>
                  <th className={THR}>{t('finance.managers.amort.col.life')}</th>
                  <th className={THR}>{t('finance.managers.amort.col.thisMonth')}</th>
                  <th className={THR}>{t('finance.managers.amort.col.nbv')}</th>
                  <th className={TH}>{t('finance.managers.amort.col.end')}</th>
                  <th className={TH}>{t('finance.managers.amort.col.status')}</th>
                  {caps.canEdit && <th className={TH}><span className="sr-only">{t('finance.managers.actions')}</span></th>}
                </tr>
              </thead>
              <tbody>
                {data.lots.map((l) => (
                  <tr key={l.id}>
                    <td className={TD}>{l.ref}</td>
                    <td className={`${TD} max-w-[220px] truncate`} title={l.description}>{l.description}</td>
                    <td className={TDR}>{fmt.int.format(l.quantity)}</td>
                    <td className={TDR}>{money2(fmt, l.unitCost)}</td>
                    <td className={TDR}>{money2(fmt, l.calc.cost)}</td>
                    <td className={TD}>{monthLabel(l.inServiceMonth, fmt.loc, true)}</td>
                    <td className={TDR}>{t('finance.managers.monthsShort', { n: l.usefulLife })}</td>
                    <td className={TDR}>{money2(fmt, l.calc.thisMonth)}</td>
                    <td className={`${TDR} font-bold`}>{money2(fmt, l.calc.nbv)}</td>
                    <td className={TD}>{monthLabel(l.calc.endMonth, fmt.loc, true)}</td>
                    <td className={TD}>
                      <StatusPill family={STATUS_PILL[l.calc.status]} title={l.writeOffReason || undefined}>
                        {l.writtenOffMonth && l.calc.status !== 'writtenOff'
                          ? t('finance.managers.amort.status.woPlanned', { month: monthLabel(l.writtenOffMonth, fmt.loc, true) })
                          : l.calc.status === 'writtenOff'
                            ? t('finance.managers.amort.status.writtenOffOn', { month: monthLabel(l.writtenOffMonth || '', fmt.loc, true) })
                            : l.calc.status === 'notInService'
                              ? t('finance.managers.amort.status.startsOn', { month: monthLabel(l.inServiceMonth, fmt.loc, true) })
                              : t(`finance.managers.amort.status.${l.calc.status}`)}
                      </StatusPill>
                    </td>
                    {caps.canEdit && (
                      <td className={TD}>
                        <span className="flex gap-1">
                          <RowButton onClick={() => setEditing(l)} label={t('finance.managers.editOf', { name: l.ref })}>{t('finance.managers.edit')}</RowButton>
                          {l.writtenOffMonth
                            ? <RowButton onClick={() => restore(l)}>{t('finance.managers.amort.restore')}</RowButton>
                            : <RowButton danger onClick={() => setWritingOff(l)}>{t('finance.managers.amort.writeOff')}</RowButton>}
                          <RowButton danger onClick={() => remove(l)} label={t('finance.managers.removeOf', { name: l.ref })}>{t('finance.managers.remove')}</RowButton>
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <LotModal lot={editing === 'new' ? null : editing} defaultLife={data.settings.data.defaultLife} defaultMonth={M} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); await reload(); }} />}
      {writingOff && <WriteOffModal lot={writingOff} defaultMonth={M} mode={data.settings.data.writeOffMode} onClose={() => setWritingOff(null)} onDone={async () => { setWritingOff(null); await reload(); }} />}
      {settingsOpen && <SettingsModal settings={data.settings} canEdit={caps.canEdit} onClose={() => setSettingsOpen(false)} onDone={async () => { setSettingsOpen(false); await reload(); }} />}
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('finance.managers.amort.importTitle')}
        preview={amortApi.importPreview}
        confirm={amortApi.importConfirm}
        onTemplate={amortApi.template}
        onDone={reload}
        columns={[
          { key: 'description', label: t('finance.managers.amort.col.description') },
          { key: 'quantity', label: t('finance.managers.amort.col.qty') },
          { key: 'unitCost', label: t('finance.managers.amort.col.unitCost'), render: (r) => (typeof r.body.unitCost === 'number' ? money2(fmt, r.body.unitCost) : '') },
          { key: 'inServiceMonth', label: t('finance.managers.amort.col.inService') },
          { key: 'usefulLife', label: t('finance.managers.amort.col.life') },
          { key: 'salvage', label: t('finance.managers.amort.form.salvage') },
          { key: 'ref', label: t('finance.managers.amort.col.ref') },
        ]}
      />
      {accountsOpen && <BooksAccountsModal onClose={() => setAccountsOpen(false)} onSaved={reload} />}
    </>
  );
}

// ---------------------------------------------------------------------------- projection
function Projection({ points }: { points: { month: string; nbv: number }[] }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const dark = useIsDark();
  const ink = dark ? '#AEB7C0' : '#575A61';
  const options: ApexOptions = {
    chart: { type: 'area', toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit', zoom: { enabled: false } },
    theme: { mode: dark ? 'dark' : 'light' },
    colors: ['#F58345'],
    stroke: { curve: 'straight', width: 2 },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.02 } },
    dataLabels: { enabled: false },
    grid: { borderColor: dark ? '#26272B' : '#E2E8F0', strokeDashArray: 4 },
    xaxis: { categories: points.map((p) => monthLabel(p.month, fmt.loc, true)), labels: { rotate: -45, hideOverlappingLabels: true, style: { colors: ink, fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { min: 0, forceNiceScale: true, labels: { formatter: (v: number) => fmt.fmt(v, '$'), style: { colors: ink } } },
    tooltip: { theme: dark ? 'dark' : 'light', y: { formatter: (v: number) => money2(fmt, v) } },
  };
  const empty = points.every((p) => p.nbv === 0);
  return (
    <Card title={t('finance.managers.amort.projection')} sub={t('finance.managers.amort.projectionSub')}>
      {empty
        ? <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.managers.amort.projectionEmpty')}</p>
        : <ReactApexChart key={`${dark}-${fmt.loc}`} type="area" height={260} options={options} series={[{ name: t('finance.managers.amort.nbvSeries'), data: points.map((p) => p.nbv) }]} />}
      <p className="sr-only">{points.map((p) => `${monthLabel(p.month, fmt.loc)} ${money2(fmt, p.nbv)}`).join(' ; ')}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------- fenêtres
function LotModal({ lot, defaultLife, defaultMonth, onClose, onDone }: { lot: Lot | null; defaultLife: number; defaultMonth: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const errText = useErrText();
  const init: LotForm = lot
    ? { description: lot.description, quantity: String(lot.quantity), unitCost: String(lot.unitCost), inServiceMonth: lot.inServiceMonth, usefulLife: String(lot.usefulLife), salvage: String(lot.salvage), notes: lot.notes || '' }
    : { description: '', quantity: '', unitCost: '', inServiceMonth: defaultMonth, usefulLife: String(defaultLife), salvage: '0', notes: '' };
  const [f, setF] = useState<LotForm>(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof LotForm) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const qty = parseIntStrict(f.quantity), unit = parseAmount(f.unitCost);
  const cost = qty != null && unit != null ? qty * unit : null;
  const preview = monthlyPreview(cost, f.usefulLife.trim() ? parseIntStrict(f.usefulLife) : defaultLife, parseAmount(f.salvage) || 0);
  const fe = (k: string) => (errors[k] ? errText(errors[k]) : null);

  const submit = async () => {
    const v = validateLotForm(f, defaultLife);
    setErrors(v.errors);
    if (!v.body) return;
    setBusy(true); setServerErr(null);
    try {
      if (lot) await amortApi.edit(lot.id, { ...v.body, version: lot.version });
      else await amortApi.add(v.body);
      toast.success(t(lot ? 'finance.managers.amort.saved' : 'finance.managers.amort.added'));
      await onDone();
    } catch (e) {
      const code = errCode(e);
      setServerErr(code === 'conflict' ? t('finance.managers.errors.conflictReload') : errText(code));
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} dirty={dirty && !busy} size="lg"
      title={lot ? t('finance.managers.amort.editTitle', { ref: lot.ref }) : t('finance.managers.amort.addTitle')}
      footer={<><Button size="md" onClick={onClose}>{t('finance.managers.cancel')}</Button><Button size="md" variant="primary" onClick={submit} disabled={busy}>{lot ? t('finance.managers.save') : t('finance.managers.amort.add')}</Button></>}>
      {!lot && <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.managers.amort.refNote')}</p>}
      <Field label={t('finance.managers.amort.col.description')} error={fe('description')} htmlFor="l-desc"><TextInput id="l-desc" value={f.description} onChange={set('description')} placeholder={t('finance.managers.amort.form.descriptionHint')} /></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('finance.managers.amort.col.qty')} error={fe('quantity')} htmlFor="l-qty"><TextInput id="l-qty" inputMode="numeric" value={f.quantity} onChange={set('quantity')} /></Field>
        <Field label={t('finance.managers.amort.form.unitCost')} error={fe('unitCost')} htmlFor="l-unit"><TextInput id="l-unit" inputMode="decimal" value={f.unitCost} onChange={set('unitCost')} /></Field>
        <Field label={t('finance.managers.amort.col.inService')} error={fe('inServiceMonth')} htmlFor="l-ins" hint={t('finance.managers.amort.form.inServiceHint')}><MonthInput id="l-ins" value={f.inServiceMonth} onChange={set('inServiceMonth')} /></Field>
        <Field label={t('finance.managers.amort.form.life')} error={fe('usefulLife')} htmlFor="l-life"><TextInput id="l-life" inputMode="numeric" value={f.usefulLife} onChange={set('usefulLife')} /></Field>
        <Field label={t('finance.managers.amort.form.salvage')} error={fe('salvage')} htmlFor="l-salv"><TextInput id="l-salv" inputMode="decimal" value={f.salvage} onChange={set('salvage')} /></Field>
        <div className="flex flex-col justify-end pb-2 text-[13px] text-black dark:text-white">
          {cost != null && <span>{t('finance.managers.amort.form.cost', { v: money2(fmt, cost) })}</span>}
          {preview != null && <span>{t('finance.managers.amort.form.monthly', { v: money2(fmt, preview) })}</span>}
        </div>
      </div>
      <Field label={t('finance.managers.notes')} error={fe('notes')} htmlFor="l-notes">
        <textarea id="l-notes" rows={2} maxLength={1000} value={f.notes} onChange={(e) => set('notes')(e.target.value)} className={`${INPUT} h-auto w-full py-2`} />
      </Field>
      {lot && <p className="m-0 text-[12px] text-body dark:text-bodydark2">{t('finance.managers.amort.form.editWarning')}</p>}
      {serverErr && <InlineError title={serverErr} />}
    </Modal>
  );
}

function WriteOffModal({ lot, defaultMonth, mode, onClose, onDone }: { lot: Lot; defaultMonth: string; mode: AmortSettings['writeOffMode']; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [month, setMonth] = useState(defaultMonth);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (reason.trim().length < 3) { setErr(t('finance.managers.errors.bad_reason')); return; }
    setBusy(true); setErr(null);
    try { await amortApi.writeOff(lot.id, { month, reason: reason.trim(), version: lot.version }); toast.success(t('finance.managers.amort.writtenOff')); await onDone(); }
    catch (e) { const c = errCode(e); setErr(c === 'conflict' ? t('finance.managers.errors.conflictReload') : errText(c)); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={t('finance.managers.amort.woTitle', { ref: lot.ref })} size="md" dirty={!!reason.trim() && !busy}
      footer={<><Button size="md" onClick={onClose}>{t('finance.managers.cancel')}</Button><Button size="md" variant="danger" onClick={submit} disabled={busy}>{t('finance.managers.amort.writeOff')}</Button></>}>
      <p className="m-0 text-[13px] text-black dark:text-white">{t('finance.managers.amort.woBody', { name: lot.description, qty: lot.quantity })}</p>
      <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t(`finance.managers.amort.woMode_${mode}`)}</p>
      <Field label={t('finance.managers.amort.woMonth')} htmlFor="wo-month"><MonthInput id="wo-month" value={month} onChange={setMonth} /></Field>
      <Field label={t('finance.managers.reason')} htmlFor="wo-reason" error={err}>
        <textarea id="wo-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={`${INPUT} h-auto w-full py-2`} />
      </Field>
      <p className="m-0 text-[12px] text-body dark:text-bodydark2">{t('finance.managers.amort.woPartial')}</p>
    </Modal>
  );
}

function SettingsModal({ settings, canEdit, onClose, onDone }: { settings: AmortPayload['settings']; canEdit: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [d, setD] = useState<AmortSettings>({ ...settings.data });
  const [life, setLife] = useState(String(settings.data.defaultLife));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useMemo(() => JSON.stringify({ ...d, defaultLife: life }) !== JSON.stringify({ ...settings.data, defaultLife: String(settings.data.defaultLife) }), [d, life, settings.data]);
  const save = async () => {
    const lv = parseIntStrict(life);
    if (lv == null || lv < 1 || lv > 600) { setErr(errText('bad_life')); return; }
    setBusy(true); setErr(null);
    try { await amortApi.saveSettings({ ...d, defaultLife: lv }, settings.version); toast.success(t('finance.managers.settingsSaved')); await onDone(); }
    catch (e) { const c = errCode(e); setErr(c === 'conflict' ? t('finance.managers.errors.conflictReload') : errText(c)); setBusy(false); }
  };
  const acct = (k: 'expenseAccount' | 'accumAccount' | 'assetAccount' | 'lossAccount', role: string) => (
    <Field label={`${t(`finance.managers.roles.${role}`)}`} htmlFor={`as-${k}`} hint={k === 'assetAccount' || k === 'lossAccount' ? t('finance.managers.amort.accountWoHint') : undefined}>
      <input id={`as-${k}`} className={`${INPUT} w-[160px]`} value={d[k]} disabled={!canEdit} maxLength={20} onChange={(e) => setD((x) => ({ ...x, [k]: e.target.value }))} />
    </Field>
  );
  return (
    <Modal open onClose={onClose} title={t('finance.managers.amort.settingsTitle')} size="lg" dirty={dirty && !busy}
      footer={<><Button size="md" onClick={onClose}>{canEdit ? t('finance.managers.cancel') : t('finance.managers.closeWindow')}</Button>{canEdit && <Button size="md" variant="primary" onClick={save} disabled={busy || !dirty}>{t('finance.managers.save')}</Button>}</>}>
      <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.managers.amort.settingsIntro')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {acct('expenseAccount', 'amortExpense')}
        {acct('accumAccount', 'accumAmort')}
        {acct('lossAccount', 'writeOffLoss')}
        {acct('assetAccount', 'terminalAsset')}
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-xs font-bold text-body dark:text-bodydark2">{t('finance.managers.amort.woModeLabel')}</legend>
        {(['derecognize', 'accelerate'] as const).map((k) => (
          <label key={k} className="flex items-start gap-2 text-[13px] text-black dark:text-white">
            <input type="radio" name="wo-mode" value={k} checked={d.writeOffMode === k} disabled={!canEdit} onChange={() => setD((x) => ({ ...x, writeOffMode: k }))} className="mt-0.5" />
            <span><b>{t(`finance.managers.amort.woModes.${k}`)}</b><br /><span className="text-body dark:text-bodydark2">{t(`finance.managers.amort.woMode_${k}`)}</span></span>
          </label>
        ))}
      </fieldset>
      <Field label={t('finance.managers.amort.defaultLife')} htmlFor="as-life">
        <input id="as-life" className={`${INPUT} w-[120px]`} value={life} disabled={!canEdit} inputMode="numeric" onChange={(e) => setLife(e.target.value)} />
      </Field>
      {err && <InlineError title={err} />}
    </Modal>
  );
}
