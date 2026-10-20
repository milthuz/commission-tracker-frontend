// Module Finance — Revenus reportés (finance:deferred). Contrats facturés d'avance, constatés
// en ligne droite chaque mois ; solde, constaté du mois, nouveaux reports, 12 prochains mois ;
// waterfall ; écriture du mois (Dt 2400 / Ct revenus PAR TYPE de contrat) passée dans Zoho Books.
// Données : saisie de la CFO et import Excel — aucune donnée d'exemple.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { ContentLoader } from '../../../common/Loader';
import PageTitle from '../../../components/PageTitle';
import Select from '../../../components/Select';
import { Button, InlineError, Modal, StateCard, StatusPill, dialog, toast } from '../../../components/ui';
import { INPUT, SEG, TABLE_WRAP, segBtn } from '../../../components/ui/surface';
import { useIsDark } from '../../../lib/theme';
import { downloadCsv } from '../format';
import { Card, Kpi, KpiRow } from '../components';
import { deferredApi, errCode, type Contract, type ContractStatus, type ContractType, type DeferredPayload, type DeferredSettings } from './api';
import { monthLabel, monthlyPreview, parseAmount, parseIntStrict, validateContractForm, type ContractForm } from './logic';
import { DateInput, Field, ImportModal, JournalCard, ManagersHeader, MonthBar, MonthInput, RowButton, TD, TDR, TH, THR, TextInput, money2, useErrText, useFmt } from './shared';
import { BooksAccountsModal } from './BooksAccounts';

type Filter = 'open' | 'complete' | 'closed' | 'all';
const STATUS_PILL: Record<ContractStatus, 'ok' | 'new' | 'neutral' | 'wait'> = { recognizing: 'ok', upcoming: 'new', complete: 'neutral', closed: 'neutral', notBilled: 'wait' };

export default function DeferredRevenue() {
  const { t, i18n } = useTranslation();
  const fmt = useFmt();
  const errText = useErrText();
  const [data, setData] = useState<DeferredPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Contract | 'new' | null>(null);
  const [closing, setClosing] = useState<Contract | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);

  const load = useCallback(async (m?: string) => {
    try { const p = await deferredApi.load(m); setData(p); setError(null); return p; }
    catch (e) { setError(errCode(e)); return null; }
  }, []);
  useEffect(() => { load(month); }, [load, month]);
  const reload = useCallback(async () => { await load(data?.month); }, [load, data?.month]);

  const fr = i18n.language.startsWith('fr');
  const typeLabel = useCallback((key: string) => {
    const ty = data?.settings.data.types.find((x) => x.key === key);
    return ty ? (fr ? ty.labelFr : ty.labelEn) : key;
  }, [data, fr]);

  if (error === 'perm' || error === 'demo_blocked') return <StateCard kind="empty" title={t(error === 'perm' ? 'finance.managers.noAccess' : 'finance.managers.demo')} />;
  if (error && !data) return <InlineError title={t('finance.managers.loadError')} detail={errText(error)} onRetry={() => load(month)} retryLabel={t('finance.managers.retry')} />;
  if (!data) return <ContentLoader label={t('finance.managers.loading')} />;

  const { summary: s, caps } = data;
  const M = data.month;
  const money = (v: number) => fmt.fmt(v, '$');
  const q = search.trim().toLowerCase();
  const rows = data.contracts.filter((c) => {
    const st = c.calc.status;
    const keep = filter === 'all' ? true : filter === 'open' ? ['recognizing', 'upcoming', 'notBilled'].includes(st) : filter === 'complete' ? st === 'complete' : st === 'closed';
    return keep && (!q || c.customer.toLowerCase().includes(q) || c.ref.toLowerCase().includes(q));
  });
  const counts = {
    open: data.contracts.filter((c) => ['recognizing', 'upcoming', 'notBilled'].includes(c.calc.status)).length,
    complete: data.contracts.filter((c) => c.calc.status === 'complete').length,
    closed: data.contracts.filter((c) => c.calc.status === 'closed').length,
    all: data.contracts.length,
  };
  const byAccount = data.journal.lines.filter((l) => l.side === 'credit').map((l) => `${l.code} ${money(l.amount)}`).join(' · ');

  const exportCsv = () => downloadCsv(`deferred-revenue-${M}.csv`,
    [t('finance.managers.deferred.col.ref'), t('finance.managers.deferred.col.customer'), t('finance.managers.deferred.col.type'), t('finance.managers.deferred.col.total'),
      t('finance.managers.deferred.col.start'), t('finance.managers.deferred.col.term'), t('finance.managers.deferred.col.end'), t('finance.managers.deferred.col.billed'),
      t('finance.managers.deferred.col.received'), t('finance.managers.deferred.col.recToDate'), t('finance.managers.deferred.col.remaining'),
      t('finance.managers.deferred.col.thisMonth'), t('finance.managers.deferred.col.status')],
    data.contracts.map((c) => [c.ref, c.customer, typeLabel(c.type), c.total, c.startMonth, c.termMonths, c.calc.endMonth, c.billedDate, c.receivedDate,
      c.calc.recognizedToDate, c.calc.remaining, c.calc.thisMonth, t(`finance.managers.deferred.status.${c.calc.status}`)]), fmt.fr);

  const remove = async (c: Contract) => {
    if (!(await dialog.confirm(t('finance.managers.deferred.removeConfirm', { ref: c.ref, customer: c.customer }), { danger: true }))) return;
    try { await deferredApi.remove(c.id, c.version); toast.success(t('finance.managers.deferred.removed')); await reload(); }
    catch (e) { dialog.alert(errText(errCode(e))); await reload(); }
  };
  const reopen = async (c: Contract) => {
    if (!(await dialog.confirm(t('finance.managers.deferred.reopenConfirm', { ref: c.ref })))) return;
    try { await deferredApi.reopen(c.id, c.version); toast.success(t('finance.managers.deferred.reopened')); await reload(); }
    catch (e) { dialog.alert(errText(errCode(e))); await reload(); }
  };

  return (
    <>
      <PageTitle titleKey="finance.managers.deferred.title" />
      <ManagersHeader
        title={t('finance.managers.deferred.title')}
        subtitle={t('finance.managers.deferred.subtitle')}
        toolbar={
          <>
            <MonthBar month={M} current={data.currentMonth} range={data.range} onChange={(m) => setMonth(m)} />
            <span className="flex-1" />
            {caps.canEdit && <Button size="sm" variant="primary" onClick={() => setEditing('new')}>{t('finance.managers.deferred.add')}</Button>}
            {caps.canEdit && <Button size="sm" onClick={() => setImportOpen(true)}>{t('finance.managers.import.button')}</Button>}
            <Button size="sm" onClick={exportCsv}>{t('finance.managers.exportCsv')}</Button>
            <Button size="sm" onClick={() => deferredApi.exportXlsx(M).catch((e) => dialog.alert(errText(errCode(e))))}>{t('finance.managers.exportXlsx')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>{t('finance.managers.settings')}</Button>
            {caps.canPost && <Button size="sm" variant="ghost" onClick={() => setAccountsOpen(true)}>{t('finance.managers.accounts.button')}</Button>}
          </>
        }
      />

      <KpiRow>
        <Kpi label={t('finance.managers.deferred.kpi.balance', { month: monthLabel(M, fmt.loc, true) })} value={money(s.balance)} detail={t('finance.managers.deferred.kpi.open', { n: s.openContracts })} />
        <Kpi label={t('finance.managers.deferred.kpi.recognized', { month: monthLabel(M, fmt.loc, true) })} value={money(s.recognized)} detail={byAccount || t('finance.managers.deferred.kpi.none')} />
        <Kpi label={t('finance.managers.deferred.kpi.new', { month: monthLabel(M, fmt.loc, true) })} value={money(s.newDeferrals)} detail={t('finance.managers.deferred.kpi.newCount', { count: s.newCount })} />
        <Kpi label={t('finance.managers.deferred.kpi.next12')} value={money(s.next12)} detail={t('finance.managers.deferred.kpi.beyond', { v: money(s.beyond12) })} />
      </KpiRow>

      <Waterfall points={s.waterfall} />

      <JournalCard
        key={`je-${M}`}
        journal={data.journal}
        title={t('finance.managers.deferred.je.title', { month: monthLabel(M, fmt.loc) })}
        sub={t('finance.managers.deferred.je.sub')}
        canPost={caps.canPost}
        post={(hash) => deferredApi.post(M, hash)}
        onDone={reload}
        onGoAccounts={() => setAccountsOpen(true)}
        emptyText={t('finance.managers.deferred.je.empty')}
      />

      <Card title={t('finance.managers.deferred.contracts')} sub={t('finance.managers.deferred.shown', { n: rows.length, total: data.contracts.length })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('finance.managers.deferred.search')} aria-label={t('finance.managers.deferred.search')} className={`${INPUT} h-9 w-[200px]`} />
            <div className={SEG} role="group" aria-label={t('finance.managers.deferred.filter')}>
              {(['open', 'complete', 'closed', 'all'] as Filter[]).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} className={segBtn(filter === f)} onClick={() => setFilter(f)}>{t(`finance.managers.deferred.filters.${f}`)} ({counts[f]})</button>
              ))}
            </div>
          </div>
        }>
        {data.contracts.length === 0 ? (
          <StateCard kind="empty" title={t('finance.managers.deferred.emptyTitle')} body={caps.canEdit ? t('finance.managers.deferred.emptyBody') : undefined} />
        ) : (
          <div className={TABLE_WRAP}>
            <table className="w-full border-collapse text-[12.5px] text-black dark:text-white">
              <thead>
                <tr>
                  <th className={TH}>{t('finance.managers.deferred.col.ref')}</th>
                  <th className={TH}>{t('finance.managers.deferred.col.customer')}</th>
                  <th className={TH}>{t('finance.managers.deferred.col.type')}</th>
                  <th className={THR}>{t('finance.managers.deferred.col.total')}</th>
                  <th className={TH}>{t('finance.managers.deferred.col.start')}</th>
                  <th className={THR}>{t('finance.managers.deferred.col.term')}</th>
                  <th className={THR}>{t('finance.managers.deferred.col.recToDate')}</th>
                  <th className={THR}>{t('finance.managers.deferred.col.remaining')}</th>
                  <th className={THR}>{t('finance.managers.deferred.col.thisMonth')}</th>
                  <th className={TH}>{t('finance.managers.deferred.col.status')}</th>
                  {caps.canEdit && <th className={TH}><span className="sr-only">{t('finance.managers.actions')}</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className={TD}>{c.ref}</td>
                    <td className={`${TD} max-w-[240px] truncate`} title={c.customer}>{c.customer}</td>
                    <td className={TD}><StatusPill family="neutral">{typeLabel(c.type)}</StatusPill></td>
                    <td className={TDR}>{money2(fmt, c.total)}</td>
                    <td className={TD}>{monthLabel(c.startMonth, fmt.loc, true)}</td>
                    <td className={TDR}>{t('finance.managers.monthsShort', { n: c.termMonths })}</td>
                    <td className={TDR}>{money2(fmt, c.calc.recognizedToDate)}</td>
                    <td className={TDR}>{money2(fmt, c.calc.remaining)}</td>
                    <td className={TDR}>{money2(fmt, c.calc.thisMonth)}</td>
                    <td className={TD}>
                      <StatusPill family={STATUS_PILL[c.calc.status]} title={c.closeReason || undefined}>
                        {c.calc.status === 'upcoming' ? t('finance.managers.deferred.status.startsOn', { month: monthLabel(c.startMonth, fmt.loc, true) })
                          : c.calc.status === 'closed' ? t(`finance.managers.deferred.status.closed_${c.closeTreatment}`, { month: monthLabel(c.closedMonth || '', fmt.loc, true) })
                            : t(`finance.managers.deferred.status.${c.calc.status}`)}
                      </StatusPill>
                    </td>
                    {caps.canEdit && (
                      <td className={TD}>
                        <span className="flex gap-1">
                          <RowButton onClick={() => setEditing(c)} label={t('finance.managers.editOf', { name: c.ref })}>{t('finance.managers.edit')}</RowButton>
                          {c.closedMonth
                            ? <RowButton onClick={() => reopen(c)}>{t('finance.managers.deferred.reopen')}</RowButton>
                            : <RowButton onClick={() => setClosing(c)}>{t('finance.managers.deferred.close')}</RowButton>}
                          <RowButton danger onClick={() => remove(c)} label={t('finance.managers.removeOf', { name: c.ref })}>{t('finance.managers.remove')}</RowButton>
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

      {editing && <ContractModal contract={editing === 'new' ? null : editing} types={data.settings.data.types} defaultStart={M} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); await reload(); }} />}
      {closing && <CloseModal contract={closing} defaultMonth={M} onClose={() => setClosing(null)} onDone={async () => { setClosing(null); await reload(); }} />}
      {settingsOpen && <SettingsModal settings={data.settings} canEdit={caps.canEdit} onClose={() => setSettingsOpen(false)} onDone={async () => { setSettingsOpen(false); await reload(); }} />}
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('finance.managers.deferred.importTitle')}
        preview={deferredApi.importPreview}
        confirm={deferredApi.importConfirm}
        onTemplate={deferredApi.template}
        onDone={reload}
        columns={[
          { key: 'customer', label: t('finance.managers.deferred.col.customer') },
          { key: 'type', label: t('finance.managers.deferred.col.type'), render: (r) => typeLabel(String(r.body.type || '')) },
          { key: 'total', label: t('finance.managers.deferred.col.total'), render: (r) => (typeof r.body.total === 'number' ? money2(fmt, r.body.total) : '') },
          { key: 'startMonth', label: t('finance.managers.deferred.col.start') },
          { key: 'termMonths', label: t('finance.managers.deferred.col.term') },
          { key: 'billedDate', label: t('finance.managers.deferred.col.billed') },
          { key: 'ref', label: t('finance.managers.deferred.col.ref') },
        ]}
      />
      {accountsOpen && <BooksAccountsModal onClose={() => setAccountsOpen(false)} onSaved={reload} />}
    </>
  );
}

// ---------------------------------------------------------------------------- waterfall
function Waterfall({ points }: { points: { month: string; amount: number }[] }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const dark = useIsDark();
  const total = points.reduce((a, p) => a + p.amount, 0);
  const ink = dark ? '#AEB7C0' : '#575A61';
  const options: ApexOptions = {
    chart: { type: 'bar', toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
    theme: { mode: dark ? 'dark' : 'light' },
    colors: ['#F58345'],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
    dataLabels: { enabled: false },
    grid: { borderColor: dark ? '#26272B' : '#E2E8F0', strokeDashArray: 4, xaxis: { lines: { show: false } } },
    xaxis: { categories: points.map((p) => monthLabel(p.month, fmt.loc, true)), labels: { style: { colors: ink, fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { min: 0, forceNiceScale: true, labels: { formatter: (v: number) => fmt.fmt(v, '$'), style: { colors: ink } } },
    tooltip: { theme: dark ? 'dark' : 'light', y: { formatter: (v: number) => money2(fmt, v) } },
  };
  return (
    <Card title={t('finance.managers.deferred.waterfall')} sub={t('finance.managers.deferred.waterfallSub', { total: fmt.fmt(total, '$') })}>
      {total === 0
        ? <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.managers.deferred.waterfallEmpty')}</p>
        : <ReactApexChart key={`${dark}-${fmt.loc}`} type="bar" height={260} options={options} series={[{ name: t('finance.managers.deferred.waterfallSeries'), data: points.map((p) => p.amount) }]} />}
      {/* Les mêmes chiffres en texte, pour un lecteur d'écran. */}
      <p className="sr-only">{points.map((p) => `${monthLabel(p.month, fmt.loc)} ${money2(fmt, p.amount)}`).join(' ; ')}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------- fenêtres
function ContractModal({ contract, types, defaultStart, onClose, onDone }: { contract: Contract | null; types: ContractType[]; defaultStart: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const fmt = useFmt();
  const errText = useErrText();
  const fr = i18n.language.startsWith('fr');
  const init: ContractForm = contract
    ? { customer: contract.customer, type: contract.type, total: String(contract.total), startMonth: contract.startMonth, termMonths: String(contract.termMonths), billedDate: contract.billedDate || '', receivedDate: contract.receivedDate || '', notes: contract.notes || '' }
    : { customer: '', type: types[0]?.key || '', total: '', startMonth: defaultStart, termMonths: '12', billedDate: '', receivedDate: '', notes: '' };
  const [f, setF] = useState<ContractForm>(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ContractForm) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const preview = monthlyPreview(parseAmount(f.total), parseIntStrict(f.termMonths));
  const fe = (k: string) => (errors[k] ? errText(errors[k]) : null);

  const submit = async () => {
    const v = validateContractForm(f, types.map((x) => x.key));
    setErrors(v.errors);
    if (!v.body) return;
    setBusy(true); setServerErr(null);
    try {
      if (contract) await deferredApi.edit(contract.id, { ...v.body, version: contract.version });
      else await deferredApi.add(v.body);
      toast.success(t(contract ? 'finance.managers.deferred.saved' : 'finance.managers.deferred.added'));
      await onDone();
    } catch (e) {
      const code = errCode(e);
      setServerErr(code === 'conflict' ? t('finance.managers.errors.conflictReload') : errText(code));
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} dirty={dirty && !busy} size="lg"
      title={contract ? t('finance.managers.deferred.editTitle', { ref: contract.ref }) : t('finance.managers.deferred.addTitle')}
      footer={<><Button size="md" onClick={onClose}>{t('finance.managers.cancel')}</Button><Button size="md" variant="primary" onClick={submit} disabled={busy}>{contract ? t('finance.managers.save') : t('finance.managers.deferred.add')}</Button></>}>
      {!contract && <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.managers.deferred.refNote')}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('finance.managers.deferred.col.customer')} error={fe('customer')} htmlFor="c-customer"><TextInput id="c-customer" value={f.customer} onChange={set('customer')} /></Field>
        <Field label={t('finance.managers.deferred.col.type')} error={fe('type')}>
          <Select value={f.type} onChange={set('type')} aria-label={t('finance.managers.deferred.col.type')} options={types.map((x) => ({ value: x.key, label: `${fr ? x.labelFr : x.labelEn} (${x.account})` }))} />
        </Field>
        <Field label={t('finance.managers.deferred.form.total')} error={fe('total')} htmlFor="c-total"><TextInput id="c-total" inputMode="decimal" value={f.total} onChange={set('total')} /></Field>
        <Field label={t('finance.managers.deferred.form.term')} error={fe('termMonths')} htmlFor="c-term"><TextInput id="c-term" inputMode="numeric" value={f.termMonths} onChange={set('termMonths')} /></Field>
        <Field label={t('finance.managers.deferred.form.start')} error={fe('startMonth')} htmlFor="c-start" hint={t('finance.managers.deferred.form.startHint')}><MonthInput id="c-start" value={f.startMonth} onChange={set('startMonth')} /></Field>
        <div className="flex items-end pb-2 text-[13px] text-black dark:text-white">
          {preview != null ? t('finance.managers.deferred.form.monthly', { v: money2(fmt, preview) }) : ''}
        </div>
        <Field label={t('finance.managers.deferred.col.billed')} error={fe('billedDate')} htmlFor="c-billed" hint={t('finance.managers.deferred.form.billedHint')}><DateInput id="c-billed" value={f.billedDate} onChange={set('billedDate')} /></Field>
        <Field label={t('finance.managers.deferred.col.received')} error={fe('receivedDate')} htmlFor="c-received"><DateInput id="c-received" value={f.receivedDate} onChange={set('receivedDate')} /></Field>
      </div>
      <Field label={t('finance.managers.notes')} error={fe('notes')} htmlFor="c-notes">
        <textarea id="c-notes" rows={2} maxLength={1000} value={f.notes} onChange={(e) => set('notes')(e.target.value)} className={`${INPUT} h-auto w-full py-2`} />
      </Field>
      {contract && <p className="m-0 text-[12px] text-body dark:text-bodydark2">{t('finance.managers.deferred.form.editWarning')}</p>}
      {serverErr && <InlineError title={serverErr} />}
    </Modal>
  );
}

function CloseModal({ contract, defaultMonth, onClose, onDone }: { contract: Contract; defaultMonth: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const errText = useErrText();
  const [month, setMonth] = useState(defaultMonth < contract.startMonth ? contract.startMonth : defaultMonth);
  const [treatment, setTreatment] = useState<'release' | 'cancel'>('release');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await deferredApi.close(contract.id, { month, treatment, reason: reason.trim(), version: contract.version }); toast.success(t('finance.managers.deferred.closed')); await onDone(); }
    catch (e) { const c = errCode(e); setErr(c === 'conflict' ? t('finance.managers.errors.conflictReload') : errText(c)); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={t('finance.managers.deferred.closeTitle', { ref: contract.ref })} size="md" dirty={!!reason.trim() && !busy}
      footer={<><Button size="md" onClick={onClose}>{t('finance.managers.cancel')}</Button><Button size="md" variant="primary" onClick={submit} disabled={busy}>{t('finance.managers.deferred.close')}</Button></>}>
      <p className="m-0 text-[13px] text-black dark:text-white">{t('finance.managers.deferred.closeBody', { customer: contract.customer, remaining: money2(fmt, contract.calc.remaining) })}</p>
      <Field label={t('finance.managers.deferred.closeMonth')} htmlFor="cl-month"><MonthInput id="cl-month" value={month} onChange={setMonth} /></Field>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-xs font-bold text-body dark:text-bodydark2">{t('finance.managers.deferred.treatment')}</legend>
        {(['release', 'cancel'] as const).map((k) => (
          <label key={k} className="flex items-start gap-2 text-[13px] text-black dark:text-white">
            <input type="radio" name="treatment" value={k} checked={treatment === k} onChange={() => setTreatment(k)} className="mt-0.5" />
            <span><b>{t(`finance.managers.deferred.treatments.${k}`)}</b><br /><span className="text-body dark:text-bodydark2">{t(`finance.managers.deferred.treatments.${k}Hint`)}</span></span>
          </label>
        ))}
      </fieldset>
      <Field label={t('finance.managers.reason')} htmlFor="cl-reason">
        <textarea id="cl-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={`${INPUT} h-auto w-full py-2`} />
      </Field>
      {err && <InlineError title={err} />}
    </Modal>
  );
}

function SettingsModal({ settings, canEdit, onClose, onDone }: { settings: DeferredPayload['settings']; canEdit: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [d, setD] = useState<DeferredSettings>(() => JSON.parse(JSON.stringify(settings.data)));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useMemo(() => JSON.stringify(d) !== JSON.stringify(settings.data), [d, settings.data]);
  const setType = (i: number, patch: Partial<ContractType>) => setD((x) => ({ ...x, types: x.types.map((ty, j) => (j === i ? { ...ty, ...patch } : ty)) }));
  const addType = () => setD((x) => {
    let k = 1; while (x.types.some((ty) => ty.key === `type_${k}`)) k++;
    return { ...x, types: [...x.types, { key: `type_${k}`, labelEn: '', labelFr: '', account: x.types[0]?.account || '' }] };
  });
  const save = async () => {
    setBusy(true); setErr(null);
    try { await deferredApi.saveSettings(d, settings.version); toast.success(t('finance.managers.settingsSaved')); await onDone(); }
    catch (e: any) { const c = errCode(e); setErr(c === 'type_in_use' ? t('finance.managers.errors.type_in_use', { type: e?.body?.type }) : c === 'conflict' ? t('finance.managers.errors.conflictReload') : errText(c)); setBusy(false); }
  };
  const cell = `${INPUT} h-9 w-full`;
  return (
    <Modal open onClose={onClose} title={t('finance.managers.deferred.settingsTitle')} size="xl" dirty={dirty && !busy}
      footer={<><Button size="md" onClick={onClose}>{canEdit ? t('finance.managers.cancel') : t('finance.managers.closeWindow')}</Button>{canEdit && <Button size="md" variant="primary" onClick={save} disabled={busy || !dirty}>{t('finance.managers.save')}</Button>}</>}>
      <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.managers.deferred.settingsIntro')}</p>
      <Field label={t('finance.managers.deferred.deferredAccount')} htmlFor="s-def">
        <input id="s-def" className={`${INPUT} w-[160px]`} value={d.deferredAccount} disabled={!canEdit} maxLength={20} onChange={(e) => setD((x) => ({ ...x, deferredAccount: e.target.value }))} />
      </Field>
      <div className={TABLE_WRAP}>
        <table className="w-full border-collapse text-[12.5px] text-black dark:text-white">
          <thead><tr><th className={TH}>{t('finance.managers.deferred.typeKey')}</th><th className={TH}>{t('finance.managers.deferred.labelEn')}</th><th className={TH}>{t('finance.managers.deferred.labelFr')}</th><th className={TH}>{t('finance.managers.deferred.revenueAccount')}</th></tr></thead>
          <tbody>
            {d.types.map((ty, i) => {
              const isNew = !settings.data.types.some((x) => x.key === ty.key);
              return (
                <tr key={i}>
                  <td className={TD}>{isNew && canEdit
                    ? <input aria-label={t('finance.managers.deferred.typeKey')} className={cell} value={ty.key} maxLength={30} onChange={(e) => setType(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
                    : <code>{ty.key}</code>}</td>
                  <td className={TD}><input aria-label={t('finance.managers.deferred.labelEn')} className={cell} value={ty.labelEn} disabled={!canEdit} maxLength={80} onChange={(e) => setType(i, { labelEn: e.target.value })} /></td>
                  <td className={TD}><input aria-label={t('finance.managers.deferred.labelFr')} className={cell} value={ty.labelFr} disabled={!canEdit} maxLength={80} onChange={(e) => setType(i, { labelFr: e.target.value })} /></td>
                  <td className={TD}><input aria-label={t('finance.managers.deferred.revenueAccount')} className={`${INPUT} h-9 w-[110px]`} value={ty.account} disabled={!canEdit} maxLength={20} onChange={(e) => setType(i, { account: e.target.value })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit && <div><Button size="sm" onClick={addType}>{t('finance.managers.deferred.addType')}</Button></div>}
      {err && <InlineError title={err} />}
    </Modal>
  );
}
