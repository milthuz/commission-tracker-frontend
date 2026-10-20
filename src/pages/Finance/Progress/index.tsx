// Module Finance — approbation par driver, responsables par ligne et barre de progression (lot G).
// Composants autonomes : chacun charge ses données (cache de module, une seule requête) et lit
// `useFinance()`. À câbler par l'intégrateur :
//   /finance/progress   ProgressPage         finance:progress (+ finance:view)
//   DriverStatusCell    { driverKey }        dans la colonne libellé d'une ligne de driver / OPEX
//   BudgetProgress      ()                   sous l'en-tête des pages
//   ApprovePageButton   { group }            « Approuver tous les drivers de cette page »
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, dialog } from '../../../components/ui';
import { useFinance } from '../FinanceContext';
import type { LineGroup } from './api';
import { useActions } from './shared';
import { statusStore, useStore } from './store';

export { default as DriverStatusCell } from './DriverStatusCell';
export { default as BudgetProgress } from './BudgetProgress';
export { default as ProgressPage } from './ProgressPage';
export { default } from './ProgressPage';

/**
 * Bouton « Approuver tous les drivers de cette page » : approuve en lot les lignes du groupe
 * (`revenue` | `cogs` | `opex`) qui ne le sont pas, aux valeurs actuellement enregistrées. Ne rend rien
 * sans le droit d'approuver. Confirmation avant d'écrire ; refusé si une valeur a bougé entre-temps.
 */
export function ApprovePageButton({ group }: { group: LineGroup }) {
  const { t } = useTranslation();
  const F = useFinance();
  const { data } = useStore(statusStore);
  const actions = useActions();
  const [done, setDone] = useState(false);
  if (!data || data.empty || !data.caps?.canApprove) return null;
  const pending = F.saveStatus === 'pending' || F.saveStatus === 'saving';
  const todo = data.lines.filter((l) => l.group === group && l.state !== 'approved');
  const onClick = async () => {
    const yes = await dialog.confirm(t('finance.approvals.approvePage.confirm', { count: todo.length }), {
      title: t('finance.approvals.approvePage.title'), confirmText: t('finance.approvals.action.approve'),
      details: [t('finance.approvals.approvePage.note')],
    });
    if (!yes) return;
    const r = await actions.approve(todo);
    setDone(!!r);
  };
  return (
    <Button size="sm" disabled={!todo.length || pending || actions.busy} disabledReason={pending ? t('finance.approvals.savingFirst') : undefined} onClick={onClick}>
      {done && !todo.length ? t('finance.approvals.approvePage.done') : t('finance.approvals.approvePage.button', { count: todo.length })}
    </Button>
  );
}
