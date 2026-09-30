import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Menu « ⋯ » d'une ligne de tableau. Rendu dans un PORTAIL en position fixe, calculée depuis le
// bouton : le tableau est dans un conteneur `overflow-x-auto`, qui couperait un menu en absolu.
// Se ferme au clic extérieur, à Échap, au défilement et au redimensionnement.

export interface RowAction {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'success' | 'violet';
  hint?: string;
  divider?: boolean; // trait AVANT cet élément
}

const TONE: Record<NonNullable<RowAction['tone']>, string> = {
  default: 'text-black dark:text-white',
  danger: 'text-danger',
  success: 'text-success',
  violet: 'text-[#8B5CF6]',
};

export default function RowActionsMenu({ actions, label }: { actions: RowAction[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const W = 224;

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const est = actions.length * 38 + 16;
    const up = r.bottom + est > window.innerHeight - 8 && r.top > est;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8)), up });
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === 'mousedown' && (menu.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
        onClick={() => { if (!open) place(); setOpen((o) => !o); }}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-body transition hover:border-primary hover:text-primary ${open ? 'border-primary text-primary' : 'border-stroke dark:border-strokedark'}`}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && createPortal(
        <div ref={menu} role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: W, transform: pos.up ? 'translateY(-100%)' : undefined }}
          className="z-[99999] rounded-md border border-stroke bg-white py-1.5 shadow-lg dark:border-strokedark dark:bg-boxdark">
          {actions.map((a, i) => (
            <div key={i}>
              {a.divider && <div className="my-1.5 border-t border-stroke dark:border-strokedark" />}
              <button type="button" role="menuitem" title={a.hint}
                onClick={() => { setOpen(false); a.onClick(); }}
                className={`block w-full px-4 py-2 text-left text-sm hover:bg-gray-2 dark:hover:bg-meta-4 ${TONE[a.tone || 'default']}`}>
                {a.label}
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
