import React from 'react';

// Cleo — the Sales Hub guide. Uses the Sales Hub Monogram-S glyph (white arc + orange node) on a
// navy disc (#1c2434), matching the sidebar. Inline SVG so it scales crisply with no asset load.
// Size via className (h-/w-).
const CleoAvatar: React.FC<{ className?: string; ring?: boolean }> = ({ className = 'h-9 w-9', ring = false }) => (
  <span className={`relative inline-flex items-center justify-center overflow-hidden rounded-full ${ring ? 'ring-2 ring-white/70' : ''} ${className}`}>
    <svg viewBox="0 0 64 64" className="h-full w-full" role="img" aria-label="Cleo">
      <circle cx="32" cy="32" r="32" fill="#1c2434" />
      <path d="M42 24 C42 18 24 18 24 26 C24 32.5 42 32 42 40 C42 48 24 48 23 41" stroke="#FFFFFF" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="42" cy="24" r="4.5" fill="#F58345" />
    </svg>
  </span>
);

export default CleoAvatar;
