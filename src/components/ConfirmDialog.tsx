import React from 'react';
import { useTranslation } from 'react-i18next';

// Confirmation À L'IMAGE DE L'APPLICATION, à la place du confirm() de Chrome : même habillage que
// SendConfirmModal (qui reste réservé aux envois d'ARGENT, avec ses totaux). Le contenu est libre :
// une liste de destinataires, une mise en garde… — ce qu'il faut relire avant de cliquer.
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  tone?: 'primary' | 'warning' | 'danger';
  onConfirm: () => void;
  onClose: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open, title, message, children, confirmLabel, busyLabel, busy = false, tone = 'primary', onConfirm, onClose,
}) => {
  const { t } = useTranslation();
  if (!open) return null;
  const bg = tone === 'danger' ? 'bg-danger' : tone === 'warning' ? 'bg-warning' : 'bg-primary';
  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div role="alertdialog" aria-modal="true"
        className="relative w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-2xl dark:border-strokedark dark:bg-boxdark">
        <h3 className="text-base font-semibold text-black dark:text-white">{title}</h3>
        {message && <div className="mt-1 text-sm text-body dark:text-gray-300">{message}</div>}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy}
            className="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-body transition hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:text-gray-300 dark:hover:bg-meta-4">
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} autoFocus
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:bg-opacity-90 disabled:opacity-50 ${bg}`}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
