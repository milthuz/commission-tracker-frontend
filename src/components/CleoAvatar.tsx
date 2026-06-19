import React from 'react';

// Cleo — the Sales Hub guide. A clean monogram avatar (gradient circle + "C"), drawn as inline
// SVG so it scales crisply and needs no external asset. Pass a size via className (h-/w-).
const CleoAvatar: React.FC<{ className?: string; ring?: boolean }> = ({ className = 'h-9 w-9', ring = false }) => (
  <span className={`relative inline-flex items-center justify-center overflow-hidden rounded-full ${ring ? 'ring-2 ring-white/70' : ''} ${className}`}>
    <svg viewBox="0 0 48 48" className="h-full w-full" role="img" aria-label="Cleo">
      <defs>
        <linearGradient id="cleoBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3c50e0" />
          <stop offset="100%" stopColor="#7a5af8" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" fill="url(#cleoBg)" />
      <text x="24" y="24" textAnchor="middle" dominantBaseline="central"
        fontFamily="Satoshi, system-ui, sans-serif" fontWeight="600" fontSize="24" fill="#ffffff">C</text>
    </svg>
  </span>
);

export default CleoAvatar;
