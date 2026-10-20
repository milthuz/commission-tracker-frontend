// Module Finance — pastille d'état d'un driver / d'une ligne OPEX, avec son responsable et l'action
// qui convient (« Approuver », « Rouvrir », « Soumettre »). À afficher dans la colonne libellé d'une
// ligne. Le serveur décide de l'état et des droits ; ici on n'affiche que ce qu'il renvoie.
//
// Une valeur modifiée à l'écran mais pas encore enregistrée (enregistrement automatique à retardement)
// rend l'état « à jour » avant que le serveur l'ait relu : on le montre tout de suite (approuvé → à
// ré-approuver, soumis → proposé) et on bloque les actions jusqu'à l'enregistrement.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFinance } from '../FinanceContext';
import { progressStore, statusStore, useStore } from './store';
import { OwnerModal, ReasonModal, StateBadge, effectiveState, useActions, useLineLabel } from './shared';

const SMALL_BTN = 'h-6 shrink-0 rounded-md border border-stroke px-2 text-[11px] font-bold text-black hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-strokedark dark:text-white dark:hover:bg-meta-4';

/** `driverKey` : clé de driver (`intAdds`) ou identifiant de ligne (`drv:intAdds`, `opx:gaRent`). */
export default function DriverStatusCell({ driverKey }: { driverKey: string }) {
  const { t } = useTranslation();
  const F = useFinance();
  const key = driverKey.includes(':') ? driverKey : `drv:${driverKey}`;
  const { data } = useStore(statusStore);
  const actions = useActions();
  const labelOf = useLineLabel();
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);

  // Une valeur enregistrée ou le verrou qui change : le serveur relit (groupé, une seule requête).
  useEffect(() => {
    if (F.saveStatus === 'saved') { statusStore.refreshSoon(); progressStore.refreshSoon(1500); }
  }, [F.saveStatus]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    statusStore.refreshSoon(300); progressStore.refreshSoon(600);
  }, [F.locked]);

  const line = data && !data.empty ? data.lines.find((l) => l.key === key) : undefined;
  if (!data || !data.caps || !line) return null;

  const local = line.kind === 'driver' ? F.result.I[line.id] : F.result.opex27.byKey[line.id];
  const dirty = !!local && local.some((v, i) => Math.abs(v - line.values[i]) > 1e-6);
  const pending = F.saveStatus === 'pending' || F.saveStatus === 'saving';
  const waiting = dirty || pending;
  const state = effectiveState(line.state, dirty);
  const caps = data.caps;
  const name = labelOf(line);

  let act: 'approve' | 'reopen' | 'submit' | null = null;
  if (caps.canApprove) act = line.state === 'approved' && !dirty ? 'reopen' : 'approve';
  else if (caps.canEdit && (state === 'default' || state === 'proposed' || state === 'stale')) act = 'submit';

  const onAct = async () => {
    if (!act || waiting) return;
    if (act === 'reopen') { setReopenOpen(true); return; }
    await (act === 'approve' ? actions.approve([line]) : actions.submit([line]));
  };

  const ownerText = line.owner || line.suggestedOwner;
  const ownerCls = `max-w-[110px] truncate text-[11px] ${line.owner ? 'text-body dark:text-bodydark2' : 'italic text-body/80 dark:text-bodydark2/80'}`;
  const ownerTitle = line.owner ? t('finance.approvals.ownerIs', { owner: line.owner }) : t('finance.approvals.ownerSuggested', { owner: line.suggestedOwner });

  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 align-middle" data-driver-status={key}>
      <StateBadge state={state} />
      {caps.canEdit ? (
        <button type="button" className={`${ownerCls} rounded px-1 hover:bg-gray-2 hover:underline dark:hover:bg-meta-4`} title={ownerTitle}
          aria-label={t('finance.approvals.ownerChange', { line: name })} onClick={() => setOwnerOpen(true)}>
          {ownerText}{!line.owner && ` · ${t('finance.approvals.suggestedShort')}`}
        </button>
      ) : (
        <span className={ownerCls} title={ownerTitle}>{ownerText}{!line.owner && ` · ${t('finance.approvals.suggestedShort')}`}</span>
      )}
      {act && (
        <button type="button" className={SMALL_BTN} disabled={waiting || actions.busy} onClick={onAct}
          title={waiting ? t('finance.approvals.savingFirst') : undefined}
          aria-label={t('finance.approvals.actionOf', { action: t(`finance.approvals.action.${act}`), line: name })}>
          {t(`finance.approvals.action.${act}`)}
        </button>
      )}
      {ownerOpen && <OwnerModal open lines={[line]} onClose={() => setOwnerOpen(false)} />}
      {reopenOpen && <ReasonModal open count={1} onClose={() => setReopenOpen(false)} onConfirm={async (reason) => !!(await actions.reopen([line], reason))} />}
    </span>
  );
}
