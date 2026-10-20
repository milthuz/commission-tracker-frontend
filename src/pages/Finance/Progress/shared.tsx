// Module Finance — approbation par driver : briques communes (familles de pastilles, textes d'erreur,
// libellés de lignes, actions avec mise à jour du cache, fenêtres « responsable » et « raison »).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, StatusPill, dialog, type StatusFamily } from '../../../components/ui';
import { INPUT, LABEL } from '../../../components/ui/surface';
import Select from '../../../components/Select';
import {
  errCode, expectOf, progressApi,
  type ItemState, type LineGroup, type LineState, type Mutation, type StatusLine,
} from './api';
import { mergeMutation, progressStore, statusStore, useStore } from './store';

// « Une couleur = un sens » (StatusPill) : toujours un libellé, jamais la couleur seule.
export const STATE_FAMILY: Record<LineState, StatusFamily> = { default: 'neutral', proposed: 'new', submitted: 'wait', approved: 'ok', stale: 'err' };
export const ITEM_FAMILY: Record<ItemState, StatusFamily> = { done: 'ok', todo: 'new', warn: 'wait', blocked: 'err' };
export const GROUP_PAGE: Record<LineGroup, string> = { revenue: '/finance/revenue-drivers', cogs: '/finance/cogs-drivers', opex: '/finance/opex' };

/** Texte d'une erreur du serveur (code connu), sinon un message générique avec le code. */
export function useErrText() {
  const { t } = useTranslation();
  return useCallback((code: string) => t(`finance.approvals.errors.${code}`, { defaultValue: t('finance.approvals.errors.generic', { code }) }), [t]);
}

/** Libellé d'une ligne : driver = finance.progress.driver.<clé> ; OPEX = libellé existant de la page OPEX. */
export function useLineLabel() {
  const { t } = useTranslation();
  return useCallback((l: StatusLine) => (l.kind === 'opex'
    ? t(`finance.opexLines.${l.id}`, { defaultValue: l.name || l.id })
    : t(`finance.progress.driver.${l.id}`, { defaultValue: l.id })), [t]);
}

/** État effectif quand la valeur affichée a changé depuis la dernière lecture du serveur. */
export function effectiveState(state: LineState, dirty: boolean): LineState {
  if (!dirty) return state;
  return state === 'approved' || state === 'stale' ? 'stale' : 'proposed';
}

export function StateBadge({ state }: { state: LineState }) {
  const { t } = useTranslation();
  return <StatusPill family={STATE_FAMILY[state]} title={t(`finance.approvals.stateHelp.${state}`)}>{t(`finance.approvals.state.${state}`)}</StatusPill>;
}

// ---------------------------------------------------------------------------- actions
/** Écritures sur les lignes : appel, mise à jour du cache avec la réponse, message clair si refusé. */
export function useActions() {
  const errText = useErrText();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<Mutation>): Promise<Mutation | null> => {
    setBusy(true);
    try {
      const r = await fn();
      mergeMutation(r);
      return r;
    } catch (e) {
      const code = errCode(e);
      dialog.alert(errText(code));
      // Verrou ou valeur changée entre-temps : on recharge pour montrer l'état réel.
      if (code === 'conflict' || code === 'locked') { void statusStore.reload(); void progressStore.reload(); }
      return null;
    } finally { setBusy(false); }
  }, [errText]);
  return {
    busy,
    submit: (lines: StatusLine[]) => run(() => progressApi.submit(lines.map((l) => l.key), expectOf(lines))),
    approve: (lines: StatusLine[]) => run(() => progressApi.approve(lines.map((l) => l.key), expectOf(lines))),
    reopen: (lines: StatusLine[], reason: string) => run(() => progressApi.reopen(lines.map((l) => l.key), reason, expectOf(lines))),
    setOwner: (lines: StatusLine[], owner: string | null) => run(() => progressApi.setOwner(lines.map((l) => l.key), owner, expectOf(lines))),
    confirmOwners: (keys: string[]) => run(() => progressApi.confirmOwners(keys)),
  };
}

// ---------------------------------------------------------------------------- responsable
const OTHER = '__other__';
const NONE = '__none__';

/** Choisir (ou effacer) le responsable de une ou plusieurs lignes : annuaire, ou un nom libre. */
export function OwnerModal({ open, lines, onClose }: { open: boolean; lines: StatusLine[]; onClose: () => void }) {
  const { t } = useTranslation();
  const errText = useErrText();
  const { data } = useStore(statusStore);
  const { busy, setOwner } = useActions();
  const directory = data?.directory || [];
  const [choice, setChoice] = useState(NONE);
  const [custom, setCustom] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const owners = [...new Set(lines.map((l) => l.owner))];
    const one = owners.length === 1 ? owners[0] : null;
    if (one && directory.includes(one)) { setChoice(one); setCustom(''); }
    else if (one) { setChoice(OTHER); setCustom(one); }
    else if (lines.length === 1 && lines[0].suggestedOwner && directory.includes(lines[0].suggestedOwner)) { setChoice(lines[0].suggestedOwner); setCustom(''); }
    else { setChoice(NONE); setCustom(''); }
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const options = useMemo(() => [
    ...directory.map((d) => ({ value: d, label: d })),
    { value: OTHER, label: t('finance.approvals.owner.other') },
    { value: NONE, label: t('finance.approvals.owner.none') },
  ], [directory, t]);

  const save = async () => {
    const owner = choice === NONE ? null : choice === OTHER ? custom.trim() : choice;
    if (choice === OTHER && !owner) { setErr(errText('bad_owner')); return; }
    const r = await setOwner(lines, owner);
    if (r) onClose();
  };
  const label = lines.length === 1 ? '' : t('finance.approvals.owner.forLines', { count: lines.length });
  return (
    <Modal open={open} onClose={onClose} title={t('finance.approvals.owner.title')} size="sm" dirty={choice === OTHER && !!custom.trim() && !busy}
      footer={<><Button size="md" onClick={onClose}>{t('finance.approvals.cancel')}</Button><Button size="md" variant="primary" onClick={save} disabled={busy}>{t('finance.approvals.save')}</Button></>}>
      {label && <p className="m-0 text-[13px] text-body dark:text-bodydark2">{label}</p>}
      <div>
        <label className={LABEL} htmlFor="fin-owner-select">{t('finance.approvals.owner.label')}</label>
        <Select id="fin-owner-select" value={choice} onChange={setChoice} options={options} aria-label={t('finance.approvals.owner.label')}
          buttonClassName="h-10 w-full rounded-[10px] border border-stroke bg-transparent px-3 text-left text-sm text-black dark:border-strokedark dark:text-white" />
      </div>
      {choice === OTHER && (
        <div>
          <label className={LABEL} htmlFor="fin-owner-custom">{t('finance.approvals.owner.customLabel')}</label>
          <input id="fin-owner-custom" type="text" value={custom} maxLength={80} onChange={(e) => setCustom(e.target.value)} className={`${INPUT} w-full`} />
          <p className="m-0 mt-1 text-[12px] text-body dark:text-bodydark2">{t('finance.approvals.owner.customHint')}</p>
        </div>
      )}
      {err && <p role="alert" className="m-0 text-[12px] font-bold text-[#B42318] dark:text-[#F46060]">{err}</p>}
    </Modal>
  );
}

// ---------------------------------------------------------------------------- raison d'une réouverture
export function ReasonModal({ open, count, onClose, onConfirm }: { open: boolean; count: number; onClose: () => void; onConfirm: (reason: string) => Promise<boolean> }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setReason(''); setErr(null); } }, [open]);
  const submit = async () => {
    if (reason.trim().length < 3) { setErr(t('finance.approvals.errors.bad_reason')); return; }
    setBusy(true);
    const ok = await onConfirm(reason.trim());
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={t('finance.approvals.reopen.title')} size="sm" dirty={!!reason.trim() && !busy}
      footer={<><Button size="md" onClick={onClose}>{t('finance.approvals.cancel')}</Button><Button size="md" variant="primary" onClick={submit} disabled={busy}>{t('finance.approvals.reopen.confirm')}</Button></>}>
      <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.approvals.reopen.body', { count })}</p>
      <div>
        <label className={LABEL} htmlFor="fin-reopen-reason">{t('finance.approvals.reopen.reason')}</label>
        <textarea id="fin-reopen-reason" value={reason} maxLength={300} rows={3} onChange={(e) => setReason(e.target.value)} className={`${INPUT} h-auto w-full py-2`} />
      </div>
      {err && <p role="alert" className="m-0 text-[12px] font-bold text-[#B42318] dark:text-[#F46060]">{err}</p>}
    </Modal>
  );
}
