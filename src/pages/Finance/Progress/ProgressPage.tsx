// Module Finance — page « Progression du budget » : liste de contrôle complète, responsables à confirmer
// et tableau des drivers / lignes OPEX à approuver, groupés par responsable. Route `progress`.
// Le serveur calcule états et droits ; les approbations en lot envoient la version et le hachage vus
// à l'écran (refusées si quelqu'un a modifié entre-temps).
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Button, InlineError, PageHeader, StateCard, dialog } from '../../../components/ui';
import { CARD, INPUT, TABLE_WRAP } from '../../../components/ui/surface';
import { ContentLoader } from '../../../common/Loader';
import PageTitle from '../../../components/PageTitle';
import Select from '../../../components/Select';
import { Card } from '../components';
import { useFinance } from '../FinanceContext';
import { errCode, progressApi, type LineGroup, type LineState, type StatusLine } from './api';
import { Bar, Checklist, PROGRESS_PATH } from './BudgetProgress';
import { GROUP_PAGE, OwnerModal, ReasonModal, StateBadge, effectiveState, useActions, useErrText, useLineLabel } from './shared';
import { progressStore, statusStore, useStore } from './store';

const TH = 'whitespace-nowrap border-b border-stroke px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:border-strokedark dark:text-bodydark2';
const TD = 'border-b border-stroke/60 px-2.5 py-1.5 align-middle dark:border-strokedark/60';
const SEL = 'h-9 min-w-[150px] rounded-[10px] border border-stroke bg-transparent px-3 text-left text-[13px] text-black dark:border-strokedark dark:text-white';
const STATES: LineState[] = ['default', 'proposed', 'submitted', 'approved', 'stale'];
const GROUPS: LineGroup[] = ['revenue', 'cogs', 'opex'];
const UNASSIGNED = '__unassigned__';

export default function ProgressPage() {
  const { t } = useTranslation();
  const F = useFinance();
  const path = useLocation().pathname;
  const status = useStore(statusStore);
  const progress = useStore(progressStore);
  const actions = useActions();
  const labelOf = useLineLabel();
  const errText = useErrText();

  const [group, setGroup] = useState<'all' | LineGroup>('all');
  const [stateF, setStateF] = useState<'all' | LineState>('all');
  const [ownerF, setOwnerF] = useState('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ownerFor, setOwnerFor] = useState<StatusLine[] | null>(null);
  const [reopenFor, setReopenFor] = useState<StatusLine[] | null>(null);
  const [newName, setNewName] = useState('');
  const [dirErr, setDirErr] = useState<string | null>(null);

  useEffect(() => { if (F.saveStatus === 'saved') { statusStore.refreshSoon(); progressStore.refreshSoon(1500); } }, [F.saveStatus]);

  const data = status.data && !status.data.empty ? status.data : null;
  const lines = data?.lines || [];
  const caps = data?.caps || { canEdit: false, canApprove: false };
  const pending = F.saveStatus === 'pending' || F.saveStatus === 'saving';

  // Valeurs modifiées à l'écran mais pas encore relues par le serveur.
  const dirty = useMemo(() => {
    const out = new Set<string>();
    for (const l of lines) {
      const local = l.kind === 'driver' ? F.result.I[l.id] : F.result.opex27.byKey[l.id];
      if (local && local.some((v, i) => Math.abs(v - l.values[i]) > 1e-6)) out.add(l.key);
    }
    return out;
  }, [lines, F.result]);
  const stateOf = (l: StatusLine) => effectiveState(l.state, dirty.has(l.key));

  const owners = useMemo(() => [...new Set(lines.map((l) => l.owner).filter((o): o is string => !!o))].sort((a, b) => a.localeCompare(b)), [lines]);
  const view = useMemo(() => lines.filter((l) => (group === 'all' || l.group === group)
    && (stateF === 'all' || stateOf(l) === stateF)
    && (ownerF === 'all' || (ownerF === UNASSIGNED ? !l.owner : l.owner === ownerF))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [lines, group, stateF, ownerF, dirty]);

  // Groupes par responsable ; les lignes sans responsable confirmé en dernier.
  const grouped = useMemo(() => {
    const m = new Map<string, StatusLine[]>();
    for (const l of view) { const k = l.owner || UNASSIGNED; m.set(k, [...(m.get(k) || []), l]); }
    return [...m.entries()].sort(([a], [b]) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b)));
  }, [view]);

  if (status.error === 'forbidden' || status.error === 'demo_blocked') return <StateCard kind="empty" title={t(`finance.progress.page.${status.error}`)} />;
  if (!status.data && status.error) return <InlineError title={t('finance.progress.page.loadError')} detail={errText(status.error)} onRetry={() => void statusStore.reload()} retryLabel={t('finance.progress.retry')} />;
  if (!status.data) return <ContentLoader label={t('finance.progress.page.loading')} />;
  if (!data) return <StateCard kind="empty" title={t('finance.progress.page.noBudget')} />;

  const selected = view.filter((l) => sel.has(l.key));
  const clean = (ls: StatusLine[]) => ls.filter((l) => !dirty.has(l.key));
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleMany = (ks: string[], on: boolean) => setSel((s) => { const n = new Set(s); ks.forEach((k) => (on ? n.add(k) : n.delete(k))); return n; });
  const wait = pending || actions.busy;
  const waitReason = pending ? t('finance.approvals.savingFirst') : undefined;

  const approveLines = async (ls: StatusLine[], all: boolean) => {
    const todo = clean(ls).filter((l) => l.state !== 'approved');
    if (!todo.length) { dialog.alert(t('finance.progress.page.nothingToApprove')); return; }
    const stale = todo.filter((l) => l.state === 'stale').length;
    const yes = await dialog.confirm(t(all ? 'finance.progress.page.confirmApproveAll' : 'finance.progress.page.confirmApprove', { count: todo.length }), {
      title: t('finance.progress.page.confirmApproveTitle'), confirmText: t('finance.approvals.action.approve'),
      details: [t('finance.progress.page.confirmApproveNote'), ...(stale ? [t('finance.progress.page.confirmApproveStale', { count: stale })] : [])],
    });
    if (!yes) return;
    const r = await actions.approve(todo);
    if (r) setSel(new Set());
  };
  const submitLines = async (ls: StatusLine[]) => {
    const todo = clean(ls).filter((l) => l.state !== 'approved' && l.state !== 'submitted');
    if (!todo.length) { dialog.alert(t('finance.progress.page.nothingToSubmit')); return; }
    const r = await actions.submit(todo);
    if (r) setSel(new Set());
  };
  const reopenable = selected.filter((l) => ['approved', 'stale', 'submitted'].includes(l.state));

  // Responsables suggérés pas encore confirmés, par responsable proposé.
  const unconfirmed = lines.filter((l) => !l.owner);
  const suggestions = [...unconfirmed.reduce((m, l) => m.set(l.suggestedOwner, [...(m.get(l.suggestedOwner) || []), l.key]), new Map<string, string[]>()).entries()].sort(([a], [b]) => a.localeCompare(b));

  const dirRun = async (fn: () => Promise<{ directory: string[] }>) => {
    setDirErr(null);
    try { const r = await fn(); statusStore.patch((d) => ({ ...d, directory: r.directory })); return true; }
    catch (e) { setDirErr(errText(errCode(e))); return false; }
  };
  const addName = async () => { if (newName.trim() && (await dirRun(() => progressApi.addToDirectory(newName.trim())))) setNewName(''); };
  const removeName = async (name: string) => {
    if (!(await dialog.confirm(t('finance.progress.owners.removeConfirm', { name }), { danger: true }))) return;
    await dirRun(() => progressApi.removeFromDirectory(name));
  };

  const fmtNum = new Intl.NumberFormat(F.fmt.loc, { maximumFractionDigits: 2 });
  const P = progress.data && !progress.data.empty ? progress.data : null;
  const locked = !!data.locked;

  return (
    <>
      <PageTitle title={t('finance.progress.page.title')} />
      <PageHeader
        section={t('finance.progress.section')}
        title={t('finance.progress.page.title')}
        subtitle={t('finance.progress.page.subtitle')}
        actions={<Button size="sm" onClick={() => { void statusStore.reload(); void progressStore.reload(); }}>{t('finance.progress.page.refresh')}</Button>}
      />
      {locked && <p role="status" className="mb-4 rounded-xl bg-[rgba(253,176,34,0.18)] px-3 py-2.5 text-[13px] font-medium text-[#B54708] dark:bg-[rgba(253,176,34,0.16)] dark:text-[#FDB022]">{t('finance.progress.page.locked')}</p>}

      {/* Liste de contrôle */}
      <Card title={t('finance.progress.page.checklist')} sub={P ? t('finance.progress.page.checklistSub', { done: P.requiredDone, total: P.requiredTotal }) : undefined}
        actions={P && <span className="flex min-w-[220px] items-center gap-2"><Bar percent={P.percent} ready={P.ready} /><span className="text-[13px] font-bold tabular-nums text-black dark:text-white">{P.percent} %</span></span>}>
        {P ? (
          <>
            <Checklist items={P.items} currentPath={path} onGo={(p) => F.goTo(p)} />
            {P.weighting && <p className="m-0 mt-3 text-[12px] text-body dark:text-bodydark2">{t('finance.progress.weighting', P.weighting)}</p>}
          </>
        ) : progress.error === 'forbidden'
          ? <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.progress.page.noChecklistPerm')}</p>
          : progress.error ? <InlineError title={t('finance.progress.bar.loadError')} onRetry={() => void progressStore.reload()} retryLabel={t('finance.progress.retry')} />
            : <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.progress.page.loading')}</p>}
      </Card>

      {/* Responsables */}
      <Card title={t('finance.progress.owners.title')}
        sub={data.summary.ownersMissing ? t('finance.progress.owners.missing', { count: data.summary.ownersMissing, total: data.summary.total }) : t('finance.progress.owners.allSet')}
        actions={caps.canEdit && suggestions.length > 1 ? (
          <Button size="sm" variant="primary" disabled={wait} onClick={() => void actions.confirmOwners(unconfirmed.map((l) => l.key))}>
            {t('finance.progress.owners.confirmAll', { count: unconfirmed.length })}
          </Button>
        ) : undefined}>
        {suggestions.length > 0 ? (
          <>
            <p className="m-0 mb-2 text-[13px] text-body dark:text-bodydark2">{t('finance.progress.owners.hint')}</p>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {suggestions.map(([owner, keys]) => (
                <li key={owner} className="flex items-center gap-2 rounded-xl border border-stroke px-3 py-2 text-[13px] dark:border-strokedark">
                  <span className="text-black dark:text-white"><strong>{owner}</strong> · {t('finance.progress.owners.lines', { count: keys.length })}</span>
                  {caps.canEdit && <Button size="xs" disabled={wait} onClick={() => void actions.confirmOwners(keys)}>{t('finance.progress.owners.confirm')}</Button>}
                </li>
              ))}
            </ul>
          </>
        ) : <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.progress.owners.noneMissing')}</p>}

        <div className="mt-4 border-t border-stroke pt-3 dark:border-strokedark">
          <p className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark2">{t('finance.progress.owners.directory')}</p>
          <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
            {data.directory.map((name) => (
              <li key={name} className="inline-flex items-center gap-1 rounded-full bg-gray-2 py-1 pl-3 pr-1.5 text-[13px] text-black dark:bg-meta-4/60 dark:text-white">
                {name}
                {caps.canEdit && <button type="button" onClick={() => removeName(name)} aria-label={t('finance.progress.owners.remove', { name })} className="rounded-full px-1.5 text-body hover:text-[#B42318] dark:text-bodydark2">✕</button>}
              </li>
            ))}
            {!data.directory.length && <li className="text-[13px] text-body dark:text-bodydark2">{t('finance.progress.owners.emptyDirectory')}</li>}
          </ul>
          {caps.canEdit && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input type="text" value={newName} maxLength={80} aria-label={t('finance.progress.owners.newName')} placeholder={t('finance.progress.owners.newName')}
                onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addName(); }} className={`${INPUT} h-9 w-[220px]`} />
              <Button size="sm" disabled={!newName.trim()} onClick={() => void addName()}>{t('finance.progress.owners.add')}</Button>
            </div>
          )}
          {dirErr && <p role="alert" className="m-0 mt-2 text-[12px] font-bold text-[#B42318] dark:text-[#F46060]">{dirErr}</p>}
        </div>
      </Card>

      {/* Drivers à approuver */}
      <div className={`${CARD} mb-4 flex flex-wrap items-center gap-2 px-3 py-2.5`}>
        <Select value={group} onChange={(v) => setGroup(v as typeof group)} aria-label={t('finance.progress.page.filterGroup')} buttonClassName={SEL}
          options={[{ value: 'all', label: t('finance.progress.page.allGroups') }, ...GROUPS.map((g) => ({ value: g, label: t(`finance.progress.page.group.${g}`) }))]} />
        <Select value={stateF} onChange={(v) => setStateF(v as typeof stateF)} aria-label={t('finance.progress.page.filterState')} buttonClassName={SEL}
          options={[{ value: 'all', label: t('finance.progress.page.allStates') }, ...STATES.map((s) => ({ value: s, label: t(`finance.approvals.state.${s}`) }))]} />
        <Select value={ownerF} onChange={setOwnerF} aria-label={t('finance.progress.page.filterOwner')} buttonClassName={SEL}
          options={[{ value: 'all', label: t('finance.progress.page.allOwners') }, { value: UNASSIGNED, label: t('finance.progress.page.unassigned') }, ...owners.map((o) => ({ value: o, label: o }))]} />
        <span className="ml-auto text-[13px] text-body dark:text-bodydark2">{t('finance.progress.page.shown', { shown: view.length, total: lines.length })}</span>
      </div>

      <Card title={t('finance.progress.page.drivers')} sub={t('finance.progress.page.driversSub')}
        actions={caps.canApprove ? (
          <Button size="sm" variant="primary" disabled={wait} disabledReason={waitReason} onClick={() => void approveLines(view, true)}>
            {t('finance.progress.page.approveShown', { count: clean(view).filter((l) => l.state !== 'approved').length })}
          </Button>
        ) : undefined}>
        {(caps.canEdit || caps.canApprove) && (
          <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={t('finance.progress.page.bulk')}>
            <span className="text-[13px] font-bold text-black dark:text-white">{t('finance.progress.page.selected', { count: selected.length })}</span>
            {caps.canEdit && <Button size="xs" disabled={!selected.length || wait} onClick={() => void submitLines(selected)}>{t('finance.approvals.action.submit')}</Button>}
            {caps.canApprove && <Button size="xs" disabled={!selected.length || wait} onClick={() => void approveLines(selected, false)}>{t('finance.approvals.action.approve')}</Button>}
            {caps.canApprove && <Button size="xs" disabled={!reopenable.length || wait} onClick={() => setReopenFor(reopenable)}>{t('finance.approvals.action.reopen')}</Button>}
            {caps.canEdit && <Button size="xs" disabled={!selected.length || wait} onClick={() => setOwnerFor(selected)}>{t('finance.progress.page.assign')}</Button>}
            {selected.length > 0 && <Button size="xs" variant="ghost" onClick={() => setSel(new Set())}>{t('finance.progress.page.clearSelection')}</Button>}
            {pending && <span className="text-[12px] text-body dark:text-bodydark2">{t('finance.approvals.savingFirst')}</span>}
          </div>
        )}
        {view.length === 0 ? (
          <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.progress.page.empty')}</p>
        ) : (
          <div className={TABLE_WRAP}>
            <table className="w-full border-collapse text-[12.5px] text-black dark:text-white">
              <thead>
                <tr>
                  <th className={TH}><span className="sr-only">{t('finance.progress.page.select')}</span></th>
                  <th className={TH}>{t('finance.progress.page.col.line')}</th>
                  <th className={TH}>{t('finance.progress.page.col.state')}</th>
                  <th className={`${TH} text-right`}>{t('finance.progress.page.col.first')}</th>
                  <th className={`${TH} text-right`}>{t('finance.progress.page.col.last')}</th>
                  <th className={TH}>{t('finance.progress.page.col.by')}</th>
                  <th className={TH}><span className="sr-only">{t('finance.progress.page.col.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([owner, ls]) => {
                  const allOn = ls.every((l) => sel.has(l.key));
                  const approved = ls.filter((l) => stateOf(l) === 'approved').length;
                  return [
                    <tr key={`h:${owner}`} className="bg-gray-2/70 dark:bg-meta-4/40">
                      <td className={TD}>
                        {(caps.canEdit || caps.canApprove) && <input type="checkbox" checked={allOn} aria-label={t('finance.progress.page.selectGroup', { owner: owner === UNASSIGNED ? t('finance.progress.page.unassigned') : owner })}
                          onChange={(e) => toggleMany(ls.map((l) => l.key), e.target.checked)} />}
                      </td>
                      <td className={`${TD} font-bold`} colSpan={6}>
                        {owner === UNASSIGNED ? t('finance.progress.page.unassigned') : owner}
                        <span className="ml-2 font-normal text-body dark:text-bodydark2">{t('finance.progress.page.groupCount', { approved, total: ls.length })}</span>
                      </td>
                    </tr>,
                    ...ls.map((l) => {
                      const st = stateOf(l);
                      const name = labelOf(l);
                      const who = st === 'approved' || st === 'stale' ? l.approvedBy || l.updatedBy : l.submittedBy || l.updatedBy;
                      return (
                        <tr key={l.key} className={sel.has(l.key) ? 'bg-[rgba(245,131,69,0.06)]' : ''}>
                          <td className={TD}>
                            {(caps.canEdit || caps.canApprove) && <input type="checkbox" checked={sel.has(l.key)} onChange={() => toggle(l.key)} aria-label={t('finance.progress.page.selectLine', { line: name })} />}
                          </td>
                          <td className={TD}>
                            <button type="button" onClick={() => F.goTo(GROUP_PAGE[l.group], l.id)} className="text-left font-medium hover:underline" aria-label={t('finance.progress.page.openLine', { line: name })}>{name}</button>
                            <span className="ml-2 text-[11px] text-body dark:text-bodydark2">{l.dept ? `${t(`finance.progress.page.group.${l.group}`)} · ${l.dept}` : t(`finance.progress.page.group.${l.group}`)}</span>
                            {!l.owner && <span className="ml-2 text-[11px] italic text-body dark:text-bodydark2">{t('finance.approvals.ownerSuggested', { owner: l.suggestedOwner })}</span>}
                          </td>
                          <td className={TD}><StateBadge state={st} /></td>
                          <td className={`${TD} text-right tabular-nums`}>{fmtNum.format(l.values[0])}</td>
                          <td className={`${TD} text-right tabular-nums`}>{fmtNum.format(l.values[11])}</td>
                          <td className={`${TD} text-[12px] text-body dark:text-bodydark2`}>{who || ''}</td>
                          <td className={`${TD} text-right`}>
                            {caps.canEdit && <Button size="xs" variant="ghost" onClick={() => setOwnerFor([l])} aria-label={t('finance.approvals.ownerChange', { line: name })}>{t('finance.progress.page.owner')}</Button>}
                          </td>
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="m-0 mt-3 text-[12px] text-body dark:text-bodydark2">{t('finance.progress.page.valuesNote')}</p>
      </Card>

      {ownerFor && <OwnerModal open lines={ownerFor} onClose={() => setOwnerFor(null)} />}
      {reopenFor && <ReasonModal open count={reopenFor.length} onClose={() => setReopenFor(null)}
        onConfirm={async (reason) => { const r = await actions.reopen(reopenFor, reason); if (r) setSel(new Set()); return !!r; }} />}
    </>
  );
}

export { PROGRESS_PATH };
