import { useEffect, useState } from 'react';
import { subscribeBadgeRefresh } from '../../lib/badgeEvents';
import type { NavBadge } from '../../config/navigation';
import { authHeaders } from '../../lib/auth';

// "Needs attention" counters of the menu, each polled every 2 min and re-read as soon as an action
// succeeds elsewhere (lib/badgeEvents). Only fetched for users who can see the matching screen.
const ENDPOINTS: Record<NavBadge, string> = {
  leads: '/api/leads/pending-count',              // pistes du site en attente d'examen (leads:review)
  partners: '/api/admin/partner-opportunities/pending-count', // opportunités partenaires (partners:manage)
  health: '/api/admin/data-health',               // « À corriger » (admin)
};

function useCount(kind: NavBadge, enabled: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${import.meta.env.VITE_API_URL || ''}${ENDPOINTS[kind]}`, {
          headers: authHeaders(),
        });
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setN((kind === 'health' ? d.totalIssues : d.count) || 0);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 120000);
    const off = subscribeBadgeRefresh(load);
    return () => { cancelled = true; clearInterval(id); off(); };
  }, [kind, enabled]);
  return n;
}

export function useNavBadges(flags: Record<NavBadge, boolean>): Record<NavBadge, number> {
  return {
    leads: useCount('leads', flags.leads),
    partners: useCount('partners', flags.partners),
    health: useCount('health', flags.health),
  };
}
