import React, { useCallback, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { dialog } from '../../lib/dialog';
import { useDialog } from './useDialog';

// « Des fenêtres qui ne font rien perdre » (planche « Fenêtres et confirmations ») :
//   · Échap ferme, le focus reste dans la fenêtre et revient où il était à la fermeture ;
//   · les boutons d'action sont toujours visibles en bas ;
//   · une saisie non enregistrée (`dirty`) demande confirmation avant de fermer.
//
// Mise en page (voir la mémoire « modale qui défile ») : c'est le CONTENEUR qui défile, pas la
// boîte — sinon les menus `Select` (absolus) sont coupés. Le pied est `sticky -bottom-4` (le voile a `p-4` : sans ce décalage, le texte défile visible sous le pied) : sur une
// fenêtre plus haute que l'écran, il reste collé en bas de l'écran pendant le défilement.
//
// Pour une simple question ou une suppression, utiliser `dialog.confirm()` (lib/dialog), pas
// cette fenêtre.

const SIZE = { sm: 'max-w-[440px]', md: 'max-w-[560px]', lg: 'max-w-[720px]', xl: 'max-w-[960px]' };

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  /** Action buttons; rendered in the sticky footer, primary last (right-most). */
  footer?: React.ReactNode;
  /** Unsaved input: closing asks first. */
  dirty?: boolean;
  size?: keyof typeof SIZE;
  /** Extra controls in the header, left of the close button. */
  headerExtra?: React.ReactNode;
}

const Modal = ({ open, onClose, title, children, footer, dirty = false, size = 'md', headerExtra }: ModalProps) => {
  const { t } = useTranslation();
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const downOnOverlay = useRef(false);

  const requestClose = useCallback(async () => {
    if (dirty && !(await dialog.confirm(t('ui.modal.discardBody'), {
      title: t('ui.modal.discardTitle'),
      danger: true,
      confirmText: t('ui.modal.discardYes'),
      cancelText: t('ui.modal.keepEditing'),
    }))) return;
    onClose();
  }, [dirty, onClose, t]);

  // Échap, focus gardé et rendu, défilement bloqué : le même comportement que toute fenêtre.
  useDialog(open, requestClose, boxRef, '[data-modal-body]');

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-99999 flex items-start justify-center overflow-y-auto p-4"
      onMouseDown={(e) => { downOnOverlay.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnOverlay.current && e.target === e.currentTarget) requestClose(); }}
    >
      <div className="pointer-events-none fixed inset-0 bg-black/40" aria-hidden="true" />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative my-auto flex w-full ${SIZE[size]} flex-col rounded-[20px] border border-strokestrong bg-white shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)] outline-none dark:border-graydark dark:bg-boxdark`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stroke px-5 py-[18px] dark:border-strokedark">
          <h2 id={titleId} className="m-0 text-lg font-bold text-black dark:text-white">{title}</h2>
          <div className="flex items-center gap-2">
            {headerExtra}
            <button
              type="button"
              onClick={requestClose}
              aria-label={t('common.close')}
              className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#424242] hover:bg-gray dark:text-bodydark dark:hover:bg-meta-4"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div data-modal-body className="flex flex-col gap-3.5 p-5">
          {dirty && (
            <p className="m-0 rounded-xl bg-[rgba(253,176,34,0.18)] px-3 py-2.5 text-[13px] font-medium text-[#B54708] dark:bg-[rgba(253,176,34,0.16)] dark:text-[#FDB022]">
              {t('ui.modal.unsavedNotice')}
            </p>
          )}
          {children}
        </div>
        {footer && (
          <div className="sticky -bottom-4 flex flex-wrap justify-end gap-2 rounded-b-[20px] border-t border-stroke bg-white px-5 py-3.5 dark:border-strokedark dark:bg-boxdark">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
