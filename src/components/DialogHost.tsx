import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribe, answer, typedMatches, DialogRequest } from '../lib/dialog';
import Button from './ui/Button';

// Mounted once at the app root. Renders the front-most queued dialog (confirm/alert)
// as a styled in-app modal, replacing the browser's native confirm()/alert().
const DialogHost: React.FC = () => {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  useEffect(() => subscribe(setQueue), []);

  const current = queue[0];
  const [typed, setTyped] = useState('');
  useEffect(() => setTyped(''), [current?.id]);

  const mustType = current?.kind === 'confirm' && !!current.typeToConfirm;
  const canConfirm = !mustType || typedMatches(typed, current!.typeToConfirm!);

  // ESC = cancel/close the front-most dialog. Enter confirms only once the typed text matches.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(current.id, false);
      if (e.key === 'Enter' && canConfirm) answer(current.id, true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, canConfirm]);

  if (!current) return null;

  const isConfirm = current.kind === 'confirm';
  const title = current.title || (isConfirm ? t('common.confirm') : t('common.notice'));
  const confirmText = current.confirmText || t('common.ok');
  const cancelText = current.cancelText || t('common.cancel');

  return (
    <div data-dialog-host className="fixed inset-0 z-[1000000] flex items-start justify-center overflow-y-auto p-4">
      {/* Backdrop — clicking it cancels (confirm) / closes (alert). */}
      <div className="fixed inset-0 bg-black/40" onClick={() => answer(current.id, false)} />
      {/* Kaizen « ConfirmDanger » (planche « Fenêtres et confirmations ») : tuile d'icône, la
          question en titre, ce qui part avec, le nom à taper pour l'irréversible. */}
      <div
        role={current.danger ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={`dlg-${current.id}-title`}
        className="relative my-auto w-full max-w-[480px] rounded-[20px] border border-strokestrong bg-white shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)] dark:border-graydark dark:bg-boxdark"
      >
        <div className="flex flex-col gap-2.5 px-5 pt-5">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            current.danger ? 'bg-[rgba(244,96,96,0.12)] text-[#D92D20] dark:bg-[rgba(244,96,96,0.16)] dark:text-[#F46060]'
            : 'bg-[rgba(245,131,69,0.14)] text-accent-ink dark:bg-[rgba(245,131,69,0.16)] dark:text-accent-ink-dark'}`}>
            {current.danger ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
            ) : isConfirm ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
            )}
          </div>
          <h2 id={`dlg-${current.id}-title`} className="m-0 text-lg font-bold text-black dark:text-white">{title}</h2>
          <p className="m-0 select-text whitespace-pre-line break-words text-sm leading-[1.45] text-[#424242] dark:text-bodydark">{current.message}</p>
          {!!current.details?.length && (
            <ul className="m-0 list-disc pl-[18px] text-sm leading-[1.6] text-[#424242] dark:text-bodydark">
              {current.details.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
          {mustType && (
            <label className="flex flex-col gap-1.5 pt-1.5 text-[13px] font-bold text-[#424242] dark:text-bodydark">
              <span>{t('safety.typeToConfirm')} <span className="select-text text-black dark:text-white">{current.typeToConfirm}</span></span>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={current.typeToConfirm}
                autoComplete="off"
                spellCheck={false}
                className="h-11 rounded-xl border border-stroke bg-white px-3 text-[15px] font-medium text-black outline-none placeholder:opacity-60 focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
              />
            </label>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-5 pb-5 pt-[18px]">
          {isConfirm && (
            <Button variant="secondary" size="md" onClick={() => answer(current.id, false)}>{cancelText}</Button>
          )}
          <Button
            autoFocus={!mustType}
            size="md"
            variant={current.danger ? 'danger' : 'primary'}
            disabled={!canConfirm}
            onClick={() => answer(current.id, true)}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DialogHost;
