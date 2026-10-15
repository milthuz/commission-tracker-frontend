import { useTranslation } from 'react-i18next';
import { Ban, Clock, DoorClosed, Hand, HelpCircle, Loader2, RotateCcw, SearchX } from 'lucide-react';
import { api, type SkipReason } from '../api';
import { dialog } from '../../../lib/dialog';
import { Card } from './ui';

// UNE seule liste de raisons « pas de visite » (audit UX, P2). Avant : 3 choix en haut du
// check-in (plus tard, fermé, n'existe pas) et 6 sur la fiche de l'arrêt (plus tard, fermé, pas le
// temps, refus, autre, pas un restaurant) — le même geste se faisait différemment selon l'écran,
// et « annuler un check-in » n'en acceptait que 3. Les trois écrans montrent maintenant celle-ci.
//
//   later                         → l'arrêt reste à faire, en fin de route du jour
//   closed / no_time / refused / other → arrêt sauté avec cette raison
//   not_found / not_restaurant    → lieu exclu pour de bon (ne revient sur aucune route)
//
// Le serveur accepte exactement ces raisons (services/opener/field.js : SKIP_REASONS + void).

export type NoVisitReason = 'later' | 'closed' | 'no_time' | 'refused' | 'other' | 'not_found' | 'not_restaurant';

const ITEMS: { k: NoVisitReason; Icon: typeof Ban; danger?: boolean }[] = [
  { k: 'later', Icon: RotateCcw },
  { k: 'closed', Icon: DoorClosed },
  { k: 'no_time', Icon: Clock },
  { k: 'refused', Icon: Hand },
  { k: 'other', Icon: HelpCircle },
  { k: 'not_found', Icon: SearchX, danger: true },
  { k: 'not_restaurant', Icon: Ban, danger: true },
];

export const excludes = (k: NoVisitReason) => k === 'not_found' || k === 'not_restaurant';
/** What the stop becomes locally once the server accepted the reason. */
export const skipReasonOf = (k: NoVisitReason): SkipReason => (excludes(k) ? 'excluded' : (k as SkipReason));

/** Asks before an exclusion (it is permanent); other reasons go through in one tap. */
export async function confirmNoVisit(k: NoVisitReason, t: (key: string) => string): Promise<boolean> {
  if (!excludes(k)) return true;
  return dialog.confirm(t(`opener.noVisit.confirm.${k}`), { confirmText: t(`opener.noVisit.${k}`), danger: true });
}

/** Applies a reason to a planned stop (not a sent check-in — that one goes through /void). */
export async function applyNoVisit(k: NoVisitReason, stop: { id: number; placeId: string }) {
  if (k === 'later') return api(`/api/opener/stops/${stop.id}/later`, { method: 'POST' });
  if (excludes(k)) return api(`/api/opener/places/${encodeURIComponent(stop.placeId)}/exclude`, { method: 'POST', body: { reason: k, stopId: stop.id } });
  return api(`/api/opener/stops/${stop.id}/skip`, { method: 'POST', body: { reason: k } });
}

export function NoVisitPicker({ title, busy, onPick, onCancel }: {
  title: string;
  busy: string | null;
  onPick: (k: NoVisitReason) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <p className="mb-2 text-xs font-semibold text-[var(--of-muted)]">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {ITEMS.map(({ k, Icon, danger }) => (
          <button key={k} type="button" disabled={!!busy} onClick={() => onPick(k)}
            className={`flex min-h-[48px] items-center justify-center gap-2 rounded-[10px] border border-[var(--of-stroke)] bg-[var(--of-page)] px-2 text-center text-[13px] font-semibold leading-tight disabled:opacity-50 ${
              k === 'later' ? 'col-span-2 !border-primary bg-[rgba(245,131,70,.08)] text-primary' : danger ? 'text-[var(--of-bad)]' : 'text-[var(--of-text)]'}`}>
            {busy === k ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 flex-none" />}{t(`opener.noVisit.${k}`)}
          </button>
        ))}
      </div>
      {onCancel && <button type="button" onClick={onCancel} className="mt-2 w-full py-2 text-xs text-[var(--of-faint)]">{t('opener.field.cancel')}</button>}
    </Card>
  );
}
