// Module Finance — lot F : suggestions de drivers selon l'historique + brouillon de budget par l'IA.
//
// Deux composants AUTONOMES (chargent leurs données, lisent useFinance()) que l'intégrateur place :
//   - <SuggestionChip driverKey="intAdds" />  dans la colonne libellé d'une ligne de driver ;
//   - <SuggestionsToolbar />                  dans la barre d'outils de la page Drivers.
// Appliquer = useFinance().applyDriverValues(key, 12 valeurs) — comme une saisie de la CFO (donc
// verrou d'approbation et concurrence optimiste habituels). Le serveur n'écrit jamais rien.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui';
import { useFinance } from '../FinanceContext';
import { AiBudgetModal } from './AiBudgetModal';
import { ListModal } from './ListModal';
import { SuggestionModal } from './SuggestionModal';
import { currentValues, driverState } from './logic';
import { useDriverLabel } from './shared';
import { useKept, useSuggestionData } from './useSuggestions';

/** Puce discrète : ne rend RIEN sans suggestion pour ce driver, sans permission ou en mode démo. */
export function SuggestionChip({ driverKey }: { driverKey: string }) {
  const { t } = useTranslation();
  const F = useFinance();
  const S = useSuggestionData(6);
  const { kept } = useKept();
  const [open, setOpen] = useState(false);
  const label = useDriverLabel()(driverKey);
  const s = S.data && S.status !== 'forbidden' ? S.data.suggestions.find((x) => x.key === driverKey) : undefined;
  const current = useMemo(() => currentValues(F.drivers.drv, F.payload.reference.drvDefaults, driverKey), [F.drivers.drv, F.payload.reference.drvDefaults, driverKey]);
  if (!s || !S.data || !S.data.meta) return null;
  const state = driverState(s, current, kept);
  const text = state === 'same' ? t('finance.suggestions.chip.same') : t('finance.suggestions.chip.label');
  const cls = state === 'available'
    ? 'border-primary text-accent-ink hover:bg-[rgba(245,131,69,0.10)] dark:text-accent-ink-dark'
    : 'border-stroke text-body hover:bg-gray-2 dark:border-strokedark dark:text-bodydark2 dark:hover:bg-meta-4';
  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        aria-label={t('finance.suggestions.chip.aria', { driver: label })}
        className={`ml-2 inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border bg-transparent px-2 align-middle text-[11px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${cls}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {state === 'same' ? <path d="M20 6 9 17l-5-5" /> : <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />}
        </svg>
        {text}
      </button>
      {open && <SuggestionModal open={open} onClose={() => setOpen(false)} suggestion={s} targets={S.data.meta.targets} current={current} />}
    </>
  );
}

/** Boutons de la barre d'outils de la page Drivers : « Suggestions » et, avec finance:ai_budget, « Brouillon IA ». */
export function SuggestionsToolbar() {
  const { t } = useTranslation();
  const F = useFinance();
  const S = useSuggestionData(6);
  const [list, setList] = useState(false);
  const [ai, setAi] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  if (S.status === 'forbidden' || !S.data) return null;
  const s = detail ? S.data.suggestions.find((x) => x.key === detail) : undefined;
  const current = detail ? currentValues(F.drivers.drv, F.payload.reference.drvDefaults, detail) : [];
  return (
    <>
      <Button size="sm" onClick={() => setList(true)}>{t('finance.suggestions.toolbar.open')}</Button>
      {S.data.caps.canAiBudget && <Button size="sm" onClick={() => setAi(true)}>{t('finance.suggestions.toolbar.ai')}</Button>}
      {list && <ListModal open={list} onClose={() => setList(false)} onOpenDriver={(k) => { setList(false); setDetail(k); }} />}
      {ai && <AiBudgetModal open={ai} onClose={() => setAi(false)} />}
      {s && S.data.meta && <SuggestionModal open onClose={() => setDetail(null)} suggestion={s} targets={S.data.meta.targets} current={current} />}
    </>
  );
}
