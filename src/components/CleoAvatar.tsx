import React from 'react';

// Cleo — the Sales Hub guide. A glossy gradient orb with a sparkle (premium "AI assistant" look),
// drawn as inline SVG so it scales crisply with no external asset. Size via className (h-/w-).
// `id` keeps the gradient ids unique when several avatars render on one page.
let _seq = 0;
const CleoAvatar: React.FC<{ className?: string; ring?: boolean }> = ({ className = 'h-9 w-9', ring = false }) => {
  const uid = React.useMemo(() => `cleo${_seq++}`, []);
  return (
    <span className={`relative inline-flex items-center justify-center overflow-hidden rounded-full ${ring ? 'ring-2 ring-white/70' : ''} ${className}`}>
      <svg viewBox="0 0 64 64" className="h-full w-full" role="img" aria-label="Cleo">
        <defs>
          <radialGradient id={`${uid}-orb`} cx="35%" cy="30%" r="78%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="55%" stopColor="#6d5ef0" />
            <stop offset="100%" stopColor="#3c50e0" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="32" r="32" fill={`url(#${uid}-orb)`} />
        {/* glossy highlight */}
        <ellipse cx="24" cy="20" rx="12" ry="7.5" fill="#ffffff" opacity="0.28" />
        {/* sparkle */}
        <path d="M32 19l3.4 9.6 9.6 3.4-9.6 3.4L32 45l-3.4-9.6L19 32l9.6-3.4z" fill="#ffffff" />
        <circle cx="46" cy="21" r="2" fill="#ffffff" opacity="0.9" />
        <circle cx="19" cy="44" r="1.4" fill="#ffffff" opacity="0.8" />
      </svg>
    </span>
  );
};

export default CleoAvatar;
