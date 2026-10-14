import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// The one actions menu of the redesign: the ⋮ of a table row, the « Exporter ▾ » of a filter bar.
// Destructive items go LAST, after a separator, and end with « … » when they open a confirmation.

export interface MenuItem {
  label: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Draw a separator above this item. */
  separated?: boolean;
}

export function ActionMenu({ items, trigger, align = 'right', onOpenChange }: {
  items: MenuItem[];
  /** Render the trigger; spread `props` on the <button>. */
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }, open: boolean) => React.ReactNode;
  align?: 'left' | 'right';
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const setOpen = (v: boolean) => { setOpenState(v); onOpenChange?.(v); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    // Focus the first item so the menu is usable from the keyboard.
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const els = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') || []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
  };

  return (
    <div ref={wrap} className="relative inline-block">
      {trigger({ onClick: () => setOpen(!open), 'aria-expanded': open, 'aria-haspopup': 'menu' }, open)}
      {open && (
        <div
          role="menu"
          onKeyDown={onMenuKey}
          className={`absolute top-full z-999 mt-1.5 flex w-[200px] flex-col rounded-xl border border-strokestrong bg-white p-1.5 shadow-[0_12px_24px_-6px_rgba(0,0,0,0.35)] dark:border-graydark dark:bg-form-input ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((it, i) => (
            <React.Fragment key={i}>
              {it.separated && <div className="my-1 h-px bg-stroke dark:bg-strokedark" role="separator" />}
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onSelect(); }}
                className={`flex h-9 items-center rounded-lg px-2.5 text-left text-sm hover:bg-gray focus:bg-gray focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-meta-4 dark:focus:bg-meta-4 ${
                  it.danger ? 'text-[#D92D20] dark:text-[#F46060]' : 'text-black dark:text-white'
                }`}
              >
                {it.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/** The ⋮ button of a table row. */
export function RowMenu({ items, label, onOpenChange }: { items: MenuItem[]; label?: string; onOpenChange?: (open: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <ActionMenu
      items={items}
      onOpenChange={onOpenChange}
      trigger={(props, open) => (
        <button
          type="button"
          {...props}
          onClick={(e) => { e.stopPropagation(); props.onClick(); }}
          aria-label={label || t('ui.table.actions')}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border border-stroke text-[#424242] dark:border-strokedark dark:text-bodydark ${open ? 'bg-gray dark:bg-meta-4' : 'hover:bg-gray dark:hover:bg-meta-4'}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
        </button>
      )}
    />
  );
}

export default ActionMenu;
