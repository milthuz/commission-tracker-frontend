import React from 'react';

// Cleo — the Sales Hub guide. A friendly headset-wearing assistant avatar, drawn as inline SVG
// (no external asset; scales crisply and works in light/dark). Pass a size via className (h-/w-).
const CleoAvatar: React.FC<{ className?: string; ring?: boolean }> = ({ className = 'h-9 w-9', ring = false }) => (
  <span className={`relative inline-flex items-center justify-center overflow-hidden rounded-full ${ring ? 'ring-2 ring-white/70' : ''} ${className}`}>
    <svg viewBox="0 0 48 48" className="h-full w-full" role="img" aria-label="Cleo">
      <defs>
        <linearGradient id="cleoBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3c50e0" />
          <stop offset="55%" stopColor="#7a5af8" />
          <stop offset="100%" stopColor="#c850c0" />
        </linearGradient>
      </defs>
      {/* background */}
      <rect width="48" height="48" fill="url(#cleoBg)" />
      {/* hair / head silhouette */}
      <path d="M24 9c-7.2 0-12 5-12 12.5V31c0 1.2 1 2.2 2.2 2.2h.3V21.5C14.5 16 18.8 12.6 24 12.6S33.5 16 33.5 21.5v11.7h.3c1.2 0 2.2-1 2.2-2.2v-9.5C36 14 31.2 9 24 9z" fill="#f7d9b8" opacity="0.0" />
      {/* face */}
      <circle cx="24" cy="23" r="9.5" fill="#fbe3c8" />
      {/* hair top */}
      <path d="M24 10.5c-6 0-10.2 4.2-10.2 10.4 0 1.2.2 2 .2 2l2.1-1.4c.2-3.3 1.1-5 2.9-6.2 1.2 1.8 4.2 3.2 9 3.2 1.6 0 2.6.1 3.4.9.6.6.9 1.4 1 2.1l2.1 1.4s.2-.8.2-2C34.7 14.7 30.2 10.5 24 10.5z" fill="#5b3b2e" />
      {/* eyes */}
      <circle cx="20.6" cy="22.6" r="1.25" fill="#3a2a22" />
      <circle cx="27.4" cy="22.6" r="1.25" fill="#3a2a22" />
      {/* smile */}
      <path d="M20.5 26.4c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8" fill="none" stroke="#b5654a" strokeWidth="1.4" strokeLinecap="round" />
      {/* headset band + ear cups */}
      <path d="M14 23c0-5.5 4.5-10 10-10s10 4.5 10 10" fill="none" stroke="#1c2434" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="12.2" y="22" width="3.4" height="6" rx="1.7" fill="#1c2434" />
      <rect x="32.4" y="22" width="3.4" height="6" rx="1.7" fill="#1c2434" />
      {/* mic */}
      <path d="M33.7 28v3.2c0 1.4-1.1 2.5-2.5 2.5h-3" fill="none" stroke="#1c2434" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="27.7" cy="33.7" r="1.3" fill="#22c55e" />
    </svg>
  </span>
);

export default CleoAvatar;
