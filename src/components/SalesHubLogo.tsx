import MarkDark from '../images/logo/saleshub-mark-dark.svg';
import MarkLight from '../images/logo/saleshub-mark-light.svg';
import StackedDark from '../images/logo/saleshub-lockup-stacked-dark.svg';
import StackedLight from '../images/logo/saleshub-lockup-stacked-light.svg';

type Variant = 'mark' | 'horizontal' | 'stacked';
// Which TILE the mark itself sits on (#141414 dark tile vs white tile) — independent of the
// surrounding page background. Per brand handoff: dark tile is the default everywhere; light
// tile is only for placing on an already-dark surface where a dark tile would vanish.
type Tone = 'dark' | 'light';

// Sales Hub brand mark/lockup (design_handoff_saleshub_logo, 2026-07-09). 'mark' = icon only,
// 'horizontal' = icon + "Sales Hub" wordmark inline (nav/header use — no horizontal SVG was
// provided in the handoff, so this recreates direction 3b per the README's own instruction to
// "recreate the treatments in your own codebase using the SVGs and tokens"), 'stacked' = the
// official icon-over-wordmark-over-"by cluster" lockup SVG, for login/splash contexts.
export default function SalesHubLogo({
  variant = 'mark',
  tone = 'dark',
  className = '',
  textClassName = 'text-white',
}: {
  variant?: Variant;
  tone?: Tone;
  className?: string;
  textClassName?: string;
}) {
  const mark = tone === 'dark' ? MarkDark : MarkLight;

  if (variant === 'stacked') {
    return <img src={tone === 'dark' ? StackedDark : StackedLight} alt="Sales Hub" className={className} />;
  }

  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        <img src={mark} alt="" className="h-full w-auto shrink-0" />
        <span className={`text-lg font-bold tracking-tight ${textClassName}`}>Sales Hub</span>
      </div>
    );
  }

  return <img src={mark} alt="Sales Hub" className={className} />;
}
