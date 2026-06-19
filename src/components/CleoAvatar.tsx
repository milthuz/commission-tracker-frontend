import React from 'react';

// Cleo — the Sales Hub guide. Uses the Cluster brand mark (the orange "C" ring, #fe6523) on a
// navy disc (#1c2434), matching the sidebar. Inline SVG so it scales crisply with no asset load.
// Size via className (h-/w-).
const CleoAvatar: React.FC<{ className?: string; ring?: boolean }> = ({ className = 'h-9 w-9', ring = false }) => (
  <span className={`relative inline-flex items-center justify-center overflow-hidden rounded-full ${ring ? 'ring-2 ring-white/70' : ''} ${className}`}>
    <svg viewBox="0 0 64 64" className="h-full w-full" role="img" aria-label="Cleo">
      <circle cx="32" cy="32" r="32" fill="#1c2434" />
      <g transform="translate(16.7,15) scale(0.68)">
        <path d="M24.97,49.94C11.2,49.94,0,38.74,0,24.97S11.2,0,24.97,0c7.31,0,14.22,3.19,18.98,8.74,1.58,1.84,1.36,4.61-.48,6.19-1.84,1.58-4.61,1.36-6.18-.48-3.08-3.6-7.57-5.67-12.31-5.67-8.93,0-16.2,7.27-16.2,16.2s7.27,16.2,16.2,16.2c4.74,0,9.23-2.07,12.31-5.67,1.57-1.84,4.34-2.06,6.18-.48,1.84,1.58,2.06,4.34.48,6.19-4.75,5.56-11.67,8.74-18.98,8.74Z" fill="#fe6523" />
      </g>
    </svg>
  </span>
);

export default CleoAvatar;
