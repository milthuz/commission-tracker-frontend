import { useTranslation } from 'react-i18next';
import MarkDark from '../images/logo/saleshub-mark-dark.svg';
import MarkLight from '../images/logo/saleshub-mark-light.svg';
import StackedDark from '../images/logo/saleshub-lockup-stacked-dark.svg';
import StackedLight from '../images/logo/saleshub-lockup-stacked-light.svg';

type Variant = 'mark' | 'glyph' | 'horizontal' | 'lockup' | 'stacked';
// Which TILE the mark itself sits on (#141414 dark tile vs white tile) — independent of the
// surrounding page background. Only used by 'mark'/'stacked' (isolated icon on a neutral/white
// surface, e.g. a favicon-style placement or a card on a light page). 'glyph'/'horizontal'/
// 'lockup' never use a tile — they're for placing the mark directly ON an existing dark/colored
// surface (sidebar, login panel), where a second dark tile just reads as a smudge (user
// feedback 2026-07-09: "le noir sort mal partout").
type Tone = 'dark' | 'light';

// The bare glyph — arc + orange node, no tile, transparent background. Arc uses currentColor so
// it picks up whatever text color className sets (text-white on dark, text-[#141414] on light).
// viewBox is cropped tight to the actual ink (the original 0-64 box has generous clear-space
// margins meant for sitting on a tile) — used bare, that dead space made the glyph look tiny
// and oddly gapped from adjacent text (user feedback 2026-07-09).
function Glyph({ className }: { className?: string }) {
  return (
    <svg viewBox="17 14 32 40" fill="none" className={className}>
      <path d="M42 24 C42 18 24 18 24 26 C24 32.5 42 32 42 40 C42 48 24 48 23 41" stroke="currentColor" strokeWidth={6} fill="none" strokeLinecap="round" />
      <circle cx="42" cy="24" r={4.5} fill="#F58345" />
    </svg>
  );
}

// Sales Hub brand mark/lockup (design_handoff_saleshub_logo, 2026-07-09).
// - 'mark'   — tiled icon, for an isolated placement on a neutral/light surface.
// - 'glyph'  — bare arc + node, no tile, for placing directly on a dark/colored surface.
// - 'horizontal' — glyph + "Sales Hub" inline (compact nav/header use).
// - 'lockup' — glyph + "Sales Hub" + "by cluster ●" endorsement, bigger/more prominent — for
//   login/splash-style placements that want full brand presence without a tile.
// - 'stacked' — the official icon-over-wordmark-over-endorsement SVG, tile-based, for a
//   standalone centered logo on a light card (invite/reset-password screens).
export default function SalesHubLogo({
  variant = 'mark',
  tone = 'dark',
  size = 'lg',
  className = '',
  textClassName = 'text-white',
}: {
  variant?: Variant;
  tone?: Tone;
  size?: 'sm' | 'lg';
  className?: string;
  textClassName?: string;
}) {
  const { t } = useTranslation();
  const mark = tone === 'dark' ? MarkDark : MarkLight;
  const mutedClass = textClassName.includes('white') ? 'text-[#8a99af]' : 'text-[#575a61]';

  if (variant === 'stacked') {
    return <img src={tone === 'dark' ? StackedDark : StackedLight} alt="Sales Hub" className={className} />;
  }

  if (variant === 'mark') {
    return <img src={mark} alt="Sales Hub" className={className} />;
  }

  if (variant === 'glyph') {
    return <Glyph className={`${className} ${textClassName}`} />;
  }

  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-2.5 ${className} ${textClassName}`}>
        <Glyph className="h-full w-auto shrink-0" />
        <span className="whitespace-nowrap text-lg font-bold tracking-tight">Sales Hub</span>
      </div>
    );
  }

  // lockup — "by cluster" sits in the SAME text column as "Sales Hub" (indented past the icon),
  // not flush with the icon's left edge — it reads as part of the wordmark, not a stray caption
  // floating under the icon (user feedback 2026-07-09: "j'aime le concept, juste pas l'alignement").
  // size='sm' is the same composition scaled down for tight nav contexts (sidebar).
  // w-auto (not a fixed square) — the glyph's cropped viewBox is portrait (32:40), so a fixed
  // square box centers it with invisible padding on both sides, which read as a gap before the
  // text no matter how tight the flex `gap` was (user feedback 2026-07-09, third time around).
  const iconSize = size === 'sm' ? 'h-7 w-auto' : 'h-10 w-auto';
  const titleSize = size === 'sm' ? 'text-lg' : 'text-3xl';
  const subSize = size === 'sm' ? 'text-[11px]' : 'text-sm';
  const gap = size === 'sm' ? 'gap-1' : 'gap-3';
  const dotSize = size === 'sm' ? 'h-[5px] w-[5px]' : 'h-[6px] w-[6px]';
  return (
    <div className={`flex items-center ${gap} ${className}`}>
      <Glyph className={`${iconSize} shrink-0 ${textClassName}`} />
      <div className="min-w-0">
        <span className={`block whitespace-nowrap leading-none ${titleSize} font-bold tracking-tight ${textClassName}`}>Sales Hub</span>
        <p className={`mt-1 flex items-center gap-1 whitespace-nowrap leading-none ${subSize} ${mutedClass}`}>
          {t('brand.by')} <span className={`font-bold ${textClassName}`}>cluster</span>
          <span className={`inline-block shrink-0 rounded-full bg-[#F58345] ${dotSize}`} />
        </p>
      </div>
    </div>
  );
}
