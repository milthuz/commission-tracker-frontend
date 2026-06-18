import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribe, answer, DialogRequest } from '../lib/dialog';

// Mounted once at the app root. Renders the front-most queued dialog (confirm/alert)
// as a styled in-app modal, replacing the browser's native confirm()/alert().
const DialogHost: React.FC = () => {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  useEffect(() => subscribe(setQueue), []);

  const current = queue[0];

  // ESC = cancel/close the front-most dialog.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(current.id, false);
      if (e.key === 'Enter') answer(current.id, true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);

  if (!current) return null;

  const isConfirm = current.kind === 'confirm';
  const title = current.title || (isConfirm ? t('common.confirm') : t('common.notice'));
  const confirmText = current.confirmText || t('common.ok');
  const cancelText = current.cancelText || t('common.cancel');

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop — clicking it cancels (confirm) / closes (alert). */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => answer(current.id, false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md scale-100 rounded-2xl border border-stroke bg-white p-6 shadow-2xl dark:border-strokedark dark:bg-boxdark"
      >
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${current.danger ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary'}`}>
            {current.danger ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
            ) : isConfirm ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            ) : (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-black dark:text-white">{title}</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-body dark:text-gray-300">{current.message}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          {isConfirm && (
            <button
              onClick={() => answer(current.id, false)}
              className="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-body transition hover:bg-gray-1 dark:border-strokedark dark:text-gray-300 dark:hover:bg-meta-4"
            >
              {cancelText}
            </button>
          )}
          <button
            autoFocus
            onClick={() => answer(current.id, true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:bg-opacity-90 ${current.danger ? 'bg-danger' : 'bg-primary'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DialogHost;
