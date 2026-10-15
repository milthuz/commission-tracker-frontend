import { useEffect, useState } from 'react';

// Media-query hook for the partner tables: they hand DataTable fewer columns on narrow screens
// instead of letting a wide table scroll sideways (every field stays in the detail window).
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    // Belt and braces: some embedded/emulated viewports resize without a `change` event.
    window.addEventListener('resize', on);
    return () => { mq.removeEventListener('change', on); window.removeEventListener('resize', on); };
  }, [query]);
  return match;
}

/** Below Tailwind's `sm` (640 px). */
export const usePhone = () => useMedia('(max-width: 639px)');
