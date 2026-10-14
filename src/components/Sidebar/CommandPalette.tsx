import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { flattenNav, NavCtx } from '../../config/navigation';
import { useTheme } from '../../lib/theme';
import NavIcon from './NavIcon';

// « Rechercher, aller à… » — ⌘K / Ctrl K from anywhere, or the search button of the menu.
// Lists every screen the user can open (from config/navigation) plus a few app actions.

const OPEN_EVENT = 'sh-command-palette';
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_EVENT));
export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Entry { id: string; title: string; trail: string; run: () => void; haystack: string }

const CommandPalette = ({ ctx }: { ctx: NavCtx }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [, , toggleTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ(''); setSel(0);
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const pages = flattenNav(ctx).map(({ item, trail }) => {
      const title = t(item.label);
      const tr = trail.map((k) => t(k)).join(' › ');
      return { id: item.id, title, trail: tr, run: () => navigate(item.to!), haystack: norm(`${title} ${tr} ${item.keywords || ''}`) };
    });
    const other = i18n.language?.startsWith('fr') ? 'en' : 'fr';
    const actions: Entry[] = [
      { id: 'act-theme', title: t('palette.toggleTheme'), trail: t('palette.actions'), run: toggleTheme, haystack: norm(`${t('palette.toggleTheme')} theme thème dark sombre clair light`) },
      { id: 'act-lang', title: t('palette.switchLanguage'), trail: t('palette.actions'), run: () => { i18n.changeLanguage(other); localStorage.setItem('language', other); }, haystack: norm(`${t('palette.switchLanguage')} langue language english français`) },
      { id: 'act-profile', title: t('sidebar.profile'), trail: t('palette.actions'), run: () => navigate('/profile'), haystack: norm(`${t('sidebar.profile')} profil préférences profile`) },
    ];
    return [...pages, ...actions];
  }, [ctx, t, i18n, navigate, toggleTheme]);

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return entries;
    return entries.filter((e) => words.every((w) => e.haystack.includes(w)));
  }, [q, entries]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { list.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  if (!open) return null;

  const choose = (e?: Entry) => { if (!e) return; setOpen(false); e.run(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[sel]); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-start justify-center p-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="pointer-events-none fixed inset-0 bg-black/40" aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={t('palette.title')} className="relative flex max-h-[70vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[20px] border border-strokestrong bg-white shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)] dark:border-graydark dark:bg-boxdark" onKeyDown={onKey}>
        <label className="flex items-center gap-2.5 border-b border-stroke px-4 dark:border-strokedark">
          <NavIcon name="search" className="text-body dark:text-bodydark2" />
          <span className="sr-only">{t('palette.title')}</span>
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('sidebar.search') as string}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[sel] ? `palette-${results[sel].id}` : undefined}
            className="h-14 flex-1 border-0 bg-transparent text-[15px] text-black outline-none placeholder:text-body dark:text-white dark:placeholder:text-bodydark2"
          />
          <kbd className="rounded-md bg-gray px-1.5 py-0.5 text-[11px] font-bold text-body dark:bg-meta-4 dark:text-bodydark2">Esc</kbd>
        </label>
        <ul ref={list} id="palette-list" role="listbox" className="overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-body dark:text-bodydark2">{t('palette.noResults')}</li>}
          {results.map((e, i) => (
            <li
              key={e.id}
              id={`palette-${e.id}`}
              data-idx={i}
              role="option"
              aria-selected={i === sel}
              onMouseMove={() => setSel(i)}
              onClick={() => choose(e)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 ${i === sel ? 'bg-[rgba(245,131,69,0.14)] dark:bg-[rgba(245,131,69,0.16)]' : ''}`}
            >
              <span className={`text-sm ${i === sel ? 'font-bold text-accent-ink dark:text-accent-ink-dark' : 'font-medium text-black dark:text-white'}`}>{e.title}</span>
              <span className="truncate text-xs text-body dark:text-bodydark2">{e.trail}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
};

export default CommandPalette;
