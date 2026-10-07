import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Minus, Plus } from 'lucide-react';
import { STATUS_BADGE, STATUS_COLOR, type PlaceStatus, type Version } from '../api';

// Éléments d'interface du module terrain (thème sombre du brief, indépendant du thème choisi
// dans Sales Hub : l'opener travaille dehors, sur téléphone).

export const Eyebrow = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <p className={`text-[11px] font-bold uppercase tracking-[.06em] text-[var(--of-faint)] ${className}`}>{children}</p>
);

export const Card = ({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) => (
  <div onClick={onClick} className={`rounded-[14px] border border-[var(--of-stroke)] bg-[var(--of-surface)] p-3.5 ${onClick ? 'cursor-pointer active:bg-[var(--of-raised)]' : ''} ${className}`}>{children}</div>
);

export function StatusBadge({ status, version }: { status: PlaceStatus; version?: Version | null }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {t(`opener.status.${status}`)}{version ? ` ${version.toUpperCase()}` : ''}
    </span>
  );
}

export function ScreenHeader({ eyebrow, title, right, back = -1 }: { eyebrow?: ReactNode; title: ReactNode; right?: ReactNode; back?: string | number }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--of-stroke)] bg-[var(--of-page)] px-4 pb-3" style={{ paddingTop: 'calc(var(--of-top, env(safe-area-inset-top, 0px)) + 12px)' }}>
      <button onClick={() => (typeof back === 'number' ? navigate(back) : navigate(back))} aria-label={t('opener.field.back') as string}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--of-stroke)] bg-[var(--of-surface)] text-[var(--of-text)]">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="truncate text-xs font-medium text-[var(--of-faint)]">{eyebrow}</p>}
        <p className="truncate text-lg font-bold tracking-[-0.01em] text-[var(--of-title)]">{title}</p>
      </div>
      {right}
    </div>
  );
}

export function Chips<T extends string>({ options, value, onChange, multi = false, label }: {
  options: { value: T; label: string }[]; value: T | T[] | null; onChange: (v: any) => void; multi?: boolean; label?: string;
}) {
  const isOn = (v: T) => (multi ? (value as T[]).includes(v) : value === v);
  return (
    <div className="flex flex-wrap gap-2" role={multi ? 'group' : 'radiogroup'} aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={isOn(o.value)}
          onClick={() => {
            if (!multi) return onChange(o.value);
            const cur = value as T[];
            onChange(cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value]);
          }}
          className={`rounded-full px-3.5 py-[9px] text-[13px] font-semibold ${isOn(o.value) ? 'bg-primary text-[#1C2434]' : 'border border-[var(--of-stroke)] bg-[var(--of-surface)] text-[var(--of-text)]'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; label?: string;
}) {
  return (
    <div className="grid gap-1 rounded-xl border border-[var(--of-stroke)] bg-[var(--of-surface)] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`h-10 rounded-[9px] px-1 text-xs font-semibold ${value === o.value ? 'bg-primary text-[#1C2434]' : 'text-[var(--of-muted)]'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 20, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string }) {
  return (
    <div className="flex items-center gap-3" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--of-stroke)] bg-[var(--of-surface)] text-[var(--of-title)]" aria-label="−"><Minus className="h-4 w-4" /></button>
      <span className="w-8 text-center text-[17px] font-bold text-[var(--of-title)]" aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--of-stroke)] bg-[var(--of-surface)] text-[var(--of-title)]" aria-label="+"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-8 w-[52px] shrink-0 rounded-full transition ${on ? 'bg-primary' : 'bg-[var(--of-raised)]'}`}>
      <span className={`absolute top-[3px] h-[26px] w-[26px] rounded-full bg-white transition-all ${on ? 'left-[23px]' : 'left-[3px]'}`} />
    </button>
  );
}

// Bouton(s) fixé(s) en bas d'un écran secondaire (au-dessus de la zone du geste d'accueil).
export const StickyCta = ({ children, withTabBar = false }: { children: ReactNode; withTabBar?: boolean }) => (
  <div className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-4 pt-6"
    style={{
      bottom: withTabBar ? 'calc(84px + env(safe-area-inset-bottom, 0px) - 34px)' : 0,
      paddingBottom: withTabBar ? 12 : 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      background: 'linear-gradient(to bottom, transparent, var(--of-page) 30%)',
    }}>
    <div className="flex gap-2">{children}</div>
  </div>
);

export const btnPrimary = 'inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-[15px] font-bold text-[#1C2434] disabled:opacity-50';
export const btnSecondary = 'inline-flex h-12 items-center justify-center gap-2 rounded-[10px] border border-[var(--of-input-stroke)] bg-[var(--of-raised)] px-4 text-[15px] font-semibold text-[var(--of-title)] disabled:opacity-50';
export const inputCls = 'h-11 w-full rounded-[10px] border border-[var(--of-input-stroke)] bg-[var(--of-input)] px-3 text-sm text-[var(--of-text)] outline-none placeholder:text-[var(--of-faint)] focus:border-primary';
export const labelCls = 'mb-1 block text-xs font-medium text-[var(--of-text)]';
