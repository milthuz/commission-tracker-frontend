import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com';

export type ActivityEntityType = 'invoice' | 'proposal' | 'rep_pay';

interface ActivityEvent {
  id: number;
  event_type: string;
  description: string;
  actor: string | null;
  amount: number | null;
  created_at: string;
}

// Icon + color per event type — mirrors Zoho's "Quote Activity" feed (created = green plus,
// everything else = a small colored dot on a connecting line).
const ICONS: Record<string, { bg: string; fg: string; glyph: string }> = {
  created:                      { bg: 'bg-success/15', fg: 'text-success', glyph: '+' },
  paid:                         { bg: 'bg-success/15', fg: 'text-success', glyph: '✓' },
  payment_undone:                { bg: 'bg-gray-200 dark:bg-meta-4', fg: 'text-body', glyph: '↺' },
  excluded:                      { bg: 'bg-danger/15', fg: 'text-danger', glyph: '✕' },
  restored:                      { bg: 'bg-primary/15', fg: 'text-primary', glyph: '↻' },
  adjusted:                      { bg: 'bg-primary/15', fg: 'text-primary', glyph: '→' },
  adjustment_undone:             { bg: 'bg-gray-200 dark:bg-meta-4', fg: 'text-body', glyph: '↺' },
  sent:                          { bg: 'bg-primary/15', fg: 'text-primary', glyph: '✎' },
  deleted:                       { bg: 'bg-danger/15', fg: 'text-danger', glyph: '✕' },
  login:                         { bg: 'bg-gray-200 dark:bg-meta-4', fg: 'text-body', glyph: '⏻' },
  invited:                       { bg: 'bg-primary/15', fg: 'text-primary', glyph: '✉' },
  roles_changed:                 { bg: 'bg-primary/15', fg: 'text-primary', glyph: '⚙' },
  quota_waiver_set:              { bg: 'bg-success/15', fg: 'text-success', glyph: '✓' },
  quota_waiver_removed:          { bg: 'bg-gray-200 dark:bg-meta-4', fg: 'text-body', glyph: '↺' },
  quota_forfeit_confirmed:       { bg: 'bg-danger/15', fg: 'text-danger', glyph: '✕' },
  quota_forfeit_ack_undone:      { bg: 'bg-gray-200 dark:bg-meta-4', fg: 'text-body', glyph: '↺' },
  manual_bonus_added:            { bg: 'bg-success/15', fg: 'text-success', glyph: '+' },
  manual_bonus_removed:          { bg: 'bg-danger/15', fg: 'text-danger', glyph: '−' },
  adjustment_added:              { bg: 'bg-primary/15', fg: 'text-primary', glyph: '→' },
  adjustment_removed:            { bg: 'bg-gray-200 dark:bg-meta-4', fg: 'text-body', glyph: '↺' },
  stub_committed:                { bg: 'bg-success/15', fg: 'text-success', glyph: '✓' },
  stub_uncommitted:              { bg: 'bg-gray-200 dark:bg-meta-4', fg: 'text-body', glyph: '↺' },
  processing_bonus_committed:    { bg: 'bg-success/15', fg: 'text-success', glyph: '✓' },
  processing_bonus_uncommitted:  { bg: 'bg-gray-200 dark:bg-meta-4', fg: 'text-body', glyph: '↺' },
};
const defaultIcon = { bg: 'bg-primary/15', fg: 'text-primary', glyph: '✎' };

export default function ActivityTimeline({ entityType, entityId }: { entityType: ActivityEntityType; entityId: string }) {
  const { i18n, t } = useTranslation();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(false);
    const token = localStorage.getItem('token');
    axios.get(`${API_URL}/api/activity-log`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { entityType, entityId },
    }).then(res => { if (!cancelled) setEvents(res.data.rows || []); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  if (error) return <p className="py-8 text-center text-sm text-body">{t('activity.error')}</p>;
  if (events === null) {
    return (
      <div className="flex items-center justify-center py-10">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (events.length === 0) return <p className="py-8 text-center text-sm text-body">{t('activity.empty')}</p>;

  return (
    <div className="px-5 py-4">
      <ul className="relative">
        {events.map((e, i) => {
          const icon = ICONS[e.event_type] || defaultIcon;
          const isLast = i === events.length - 1;
          const dt = new Date(e.created_at);
          return (
            <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
              {!isLast && <span className="absolute left-[15px] top-8 h-full w-px bg-stroke dark:bg-strokedark" />}
              <div className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${icon.bg} ${icon.fg}`}>
                {icon.glyph}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-xs text-body">
                  {dt.toLocaleDateString(i18n.language)} · {dt.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="mt-0.5 text-sm text-black dark:text-white">
                  {e.description}
                  {e.amount != null && <span className="ml-1 font-semibold">({e.amount < 0 ? '-' : ''}${Math.abs(e.amount).toFixed(2)})</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
