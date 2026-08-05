import React, { useEffect, useRef, useState } from 'react';

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * Menu déroulant aux styles de l'application.
 *
 * POURQUOI il existe : la liste qu'ouvre un `<select>` natif est dessinée par le système
 * d'exploitation, pas par la page. Le navigateur ne laisse passer que la couleur de fond
 * et celle du texte — le rayon des coins, lui, n'est atteignable par aucune règle CSS.
 * D'où une liste carrée au milieu d'une interface entièrement arrondie.
 *
 * ⚠️ Sur MOBILE, on garde le natif, et c'est délibéré : le téléphone remplace la liste
 * par une roue plein écran, plus facile à viser au pouce que n'importe quelle liste
 * maison. On corrige un défaut de bureau sans abîmer le mobile — d'autant que
 * l'application est destinée à être empaquetée pour Google Play et l'App Store.
 *
 * L'API reprend celle du natif (`value`, `onChange`, `options`) pour que la bascule des
 * quelque soixante menus existants reste mécanique.
 */
const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return isDesktop;
};

const BASE =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm text-black outline-none ' +
  'transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60 ' +
  'dark:border-form-strokedark dark:bg-form-input dark:text-white';

const Select: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  /**
   * REMPLACE l'habillage par défaut au lieu de s'y ajouter. Nécessaire pour les menus
   * qui ont leur propre allure — pastille arrondie, puce de filtre — car deux classes
   * Tailwind concurrentes (`rounded` contre `rounded-full`) ne se résolvent pas par
   * l'ordre où on les écrit mais par leur ordre dans la feuille de style : le résultat
   * serait imprévisible. Mieux vaut ne pas mettre les deux en présence.
   */
  buttonClassName?: string;
  id?: string;
  'aria-label'?: string;
}> = ({ value, onChange, options, className = '', disabled, placeholder, buttonClassName, id, ...aria }) => {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });

  const skin = buttonClassName ?? BASE;
  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? placeholder ?? '';

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  // L'entrée survolée doit rester visible quand on parcourt au clavier une liste plus
  // longue que sa fenêtre — sinon la sélection continue hors écran.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openAt = () => {
    const i = options.findIndex((o) => o.value === value);
    setActive(i < 0 ? 0 : i);
    setOpen(true);
  };

  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
  };

  const step = (dir: 1 | -1) => {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActive(i);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      openAt();
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); }
    else if (e.key.length === 1) {
      // Frappe rapide : le natif saute à l'entrée qui commence par ce qu'on tape, et les
      // gens s'en servent sans y penser. Une liste maison qui l'oublie paraît cassée.
      const now = Date.now();
      typed.current.text = now - typed.current.at > 800 ? e.key : typed.current.text + e.key;
      typed.current.at = now;
      const q = typed.current.text.toLowerCase();
      const i = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(q));
      if (i >= 0) setActive(i);
    }
  };

  // Mobile : le natif, tel quel.
  if (!isDesktop) {
    return (
      <select
        id={id}
        {...aria}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${skin} ${className}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
    );
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        {...aria}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openAt())}
        onKeyDown={onKeyDown}
        className={`${skin} flex items-center justify-between gap-2 text-left`}
      >
        <span className={selected ? '' : 'text-gray-400'}>{label}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-body transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className="absolute z-[9999] mt-1 max-h-60 w-full overflow-y-auto rounded border border-stroke bg-white py-1 shadow-default dark:border-strokedark dark:bg-boxdark"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              className={`cursor-pointer px-4 py-2 text-sm ${
                o.disabled
                  ? 'cursor-not-allowed text-gray-400'
                  : i === active
                    ? 'bg-primary text-white'
                    : 'text-black dark:text-white'
              }`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Select;
