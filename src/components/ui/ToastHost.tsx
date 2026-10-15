import { useEffect, useState } from 'react';
import { subscribeToasts, dismissToast, ToastItem } from '../../lib/toast';

// Inverted surface, as on the board: white toast on the dark theme, near-black on the light one.
const ToastHost = () => {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);
  return (
    <div className="pointer-events-none fixed bottom-4 max-lg:bottom-[calc(4.6rem+env(safe-area-inset-bottom))] right-4 z-[1000001] flex flex-col items-end gap-2" aria-live="polite">
      {items.map((it) => (
        <div
          key={it.id}
          role="status"
          className="pointer-events-auto flex max-w-[420px] animate-fade-in items-center gap-2.5 rounded-xl bg-[#141414] px-4 py-3 text-sm font-bold text-white shadow-[0_12px_24px_-6px_rgba(0,0,0,0.35)] dark:bg-white dark:text-[#141414]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none stroke-[#57D193] dark:stroke-[#067647]"><path d="M20 6 9 17l-5-5" /></svg>
          <span className="min-w-0">{it.message}</span>
          {it.actionLabel && (
            <button
              type="button"
              onClick={() => { it.onAction?.(); dismissToast(it.id); }}
              className="ml-2 h-7 flex-none rounded-lg px-2 text-[13px] font-bold text-[#F79C6A] hover:bg-white/10 dark:text-[#B5521F] dark:hover:bg-black/5"
            >
              {it.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default ToastHost;
