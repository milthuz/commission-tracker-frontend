// Module Finance — barre de progression du budget : « X/Y drivers approuvés · Z à alimenter », cliquable
// pour ouvrir la liste de contrôle. À placer sous l'en-tête des pages. Se charge seule ; ne rend rien
// sans la permission `finance:progress` (le serveur décide) ni en mode démo.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Button, Modal, StatusPill } from '../../../components/ui';
import { CARD } from '../../../components/ui/surface';
import { useFinance } from '../FinanceContext';
import type { ProgressItem } from './api';
import { ITEM_FAMILY } from './shared';
import { progressStore, useStore } from './store';

export const PROGRESS_PATH = '/finance/progress';

/** Texte d'un point : le serveur renvoie `{ code, ...paramètres }`, l'écran compose la phrase. */
export function useDetailText() {
  const { t } = useTranslation();
  const { fmt } = useFinance();
  return (it: ProgressItem): string => {
    if (!it.detail) return '';
    const { code, ...params } = it.detail;
    const p: Record<string, unknown> = { ...params };
    // Une date absente s'affiche « — », jamais le paramètre brut.
    if ('at' in p) p.at = typeof p.at === 'string' && p.at ? new Date(p.at).toLocaleDateString(fmt.loc) : '—';
    return t(`finance.progress.detail.${code}`, { ...p, defaultValue: '' });
  };
}

export function Bar({ percent, ready }: { percent: number; ready: boolean }) {
  const { t } = useTranslation();
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t('finance.progress.bar.aria', { percent })}
      className="h-2 min-w-[80px] flex-1 overflow-hidden rounded-full bg-gray-2 dark:bg-meta-4">
      <div className={`h-full rounded-full ${ready ? 'bg-[#17B26A]' : 'bg-primary'}`} style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
    </div>
  );
}

/** La liste de contrôle, groupée. `onGo` mène à la page voulue ; le lien vers la page courante est omis. */
export function Checklist({ items, onGo, currentPath }: { items: ProgressItem[]; onGo: (path: string) => void; currentPath?: string }) {
  const { t } = useTranslation();
  const detailText = useDetailText();
  const groups = ['drivers', 'inputs', 'data', 'budgets'] as const;
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const list = items.filter((i) => i.group === g);
        if (!list.length) return null;
        return (
          <section key={g} aria-label={t(`finance.progress.groups.${g}`)}>
            <h3 className="m-0 mb-1 text-[13px] font-semibold text-body dark:text-bodydark2">{t(`finance.progress.groups.${g}`)}</h3>
            <ul className="m-0 list-none p-0">
              {list.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stroke/60 py-2 dark:border-strokedark/60">
                  <StatusPill family={ITEM_FAMILY[it.state]}>{t(`finance.progress.state.${it.state}`)}</StatusPill>
                  <span className="min-w-[180px] flex-1 text-[13px] font-medium text-black dark:text-white">
                    {t(it.labelKey)}
                    {!it.required && <span className="ml-2 text-[11px] font-normal text-body dark:text-bodydark2">{t('finance.progress.optional')}</span>}
                    {detailText(it) && <span className="block text-[12px] font-normal text-body dark:text-bodydark2">{detailText(it)}</span>}
                  </span>
                  {it.total > 0 && <span className="text-[12px] tabular-nums text-body dark:text-bodydark2">{it.done}/{it.total}</span>}
                  {it.link && it.link !== currentPath && (
                    <Button size="xs" variant="ghost" onClick={() => onGo(it.link as string)} aria-label={t('finance.progress.goTo', { item: t(it.labelKey) })}>{t('finance.progress.go')}</Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default function BudgetProgress() {
  const { t } = useTranslation();
  const F = useFinance();
  const path = useLocation().pathname;
  const { data, error, loading } = useStore(progressStore);
  const [open, setOpen] = useState(false);

  useEffect(() => { if (F.saveStatus === 'saved') progressStore.refreshSoon(1500); }, [F.saveStatus]);

  if (error === 'forbidden' || error === 'demo_blocked' || data?.empty) return null;
  if (!data) {
    if (!error) return null;
    return (
      <div role="status" className={`${CARD} mb-4 flex items-center gap-3 px-4 py-2.5 text-[13px] text-body dark:text-bodydark2`}>
        {t('finance.progress.bar.loadError')}
        <Button size="xs" variant="ghost" onClick={() => void progressStore.reload()} disabled={loading}>{t('finance.progress.retry')}</Button>
      </div>
    );
  }
  const S = data.summary;
  const todo = (data.requiredTotal || 0) - (data.requiredDone || 0);
  return (
    <>
      <div className={`${CARD} mb-4 px-4 py-2.5`}>
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 text-left">
          <span className="text-[13px] font-bold text-black dark:text-white">
            {S ? t('finance.progress.bar.summary', { approved: S.approved, total: S.total, todo }) : t('finance.progress.bar.noSummary', { todo })}
          </span>
          <span className="flex min-w-[160px] flex-1 items-center gap-2">
            <Bar percent={data.percent} ready={data.ready} />
            <span className="text-[13px] font-bold tabular-nums text-black dark:text-white">{data.percent} %</span>
          </span>
          <StatusPill family={data.ready ? 'ok' : 'wait'}>{data.ready ? t('finance.progress.bar.ready') : t('finance.progress.bar.notReady')}</StatusPill>
          <span className="text-[12px] font-bold text-accent-ink dark:text-accent-ink-dark">{t('finance.progress.bar.open')}</span>
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t('finance.progress.modal.title')} size="lg"
        footer={<>
          <Button size="md" onClick={() => setOpen(false)}>{t('finance.progress.close')}</Button>
          {path !== PROGRESS_PATH && <Button size="md" variant="primary" onClick={() => { setOpen(false); F.goTo(PROGRESS_PATH); }}>{t('finance.progress.modal.fullPage')}</Button>}
        </>}>
        <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.progress.modal.intro')}</p>
        <Checklist items={data.items} currentPath={path} onGo={(p) => { setOpen(false); F.goTo(p); }} />
        {data.weighting && <p className="m-0 text-[12px] text-body dark:text-bodydark2">{t('finance.progress.weighting', data.weighting)}</p>}
      </Modal>
    </>
  );
}
