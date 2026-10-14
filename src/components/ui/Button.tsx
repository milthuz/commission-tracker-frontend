import React from 'react';

// Boutons du design Kaizen (planche « Statuts et boutons »). Un seul composant pour les cinq
// variantes ; la hauteur suit le contexte (44 en page, 42 en pied de fenêtre, 36 en barre
// d'outils, 32 en ligne de tableau).
//
// Règle de la planche : « Un bouton désactivé dit toujours pourquoi, juste en dessous. »
// → passer `disabledReason` plutôt que `disabled` seul.

export type ButtonVariant = 'primary' | 'secondary' | 'link' | 'danger' | 'ghost';
export type ButtonSize = 'lg' | 'md' | 'sm' | 'xs';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-[#141414] hover:bg-[#F79C6A] active:bg-[#D16630]',
  secondary: 'border border-strokestrong bg-white text-black hover:bg-gray-2 dark:border-graydark dark:bg-boxdark dark:text-white dark:hover:bg-meta-4',
  link: 'bg-transparent text-accent-ink hover:underline dark:text-accent-ink-dark',
  danger: 'bg-[#D92D20] text-white hover:bg-[#B42318]',
  ghost: 'bg-transparent text-body hover:bg-gray dark:text-bodydark dark:hover:bg-meta-4',
};

const SIZE: Record<ButtonSize, string> = {
  lg: 'h-11 px-[18px] rounded-xl text-sm',      // 44 px — page
  md: 'h-[42px] px-4 rounded-xl text-sm',       // 42 px — pied de fenêtre
  sm: 'h-9 px-3 rounded-[10px] text-[13px]',    // 36 px — barre d'outils
  xs: 'h-8 px-3 rounded-lg text-[13px]',        // 32 px — ligne, pagination
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Disables the button AND shows this reason under it. */
  disabledReason?: React.ReactNode;
  icon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'lg', disabledReason, icon, disabled, className = '', children, type = 'button', ...rest }, ref) => {
    const isDisabled = disabled || !!disabledReason;
    const btn = (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed ${SIZE[size]} ${
          isDisabled && variant !== 'link'
            ? 'border-0 bg-gray text-body dark:bg-meta-4 dark:text-bodydark2'
            : VARIANT[variant]
        } ${className}`}
        {...rest}
      >
        {icon}
        {children}
      </button>
    );
    if (!disabledReason) return btn;
    return (
      <span className="inline-flex flex-col items-start gap-1">
        {btn}
        <span className="text-[13px] text-body dark:text-bodydark2">{disabledReason}</span>
      </span>
    );
  },
);
Button.displayName = 'Button';

export default Button;
