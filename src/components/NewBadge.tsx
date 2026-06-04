import { useTranslation } from 'react-i18next';
import { useNewFeatures } from '../context/NewFeaturesContext';

// Sidebar item indicator:
//   • dot   — per-user "not seen yet"; clears immediately when they open the page.
//   • "New" — time-based badge that stays for a few days (even after seen).
// Collapsed rail shows only the per-user dot.
export default function NewBadge({ path, collapsed = false }: { path: string; collapsed?: boolean }) {
  const { showBadge, hasDot } = useNewFeatures();
  const { t } = useTranslation();
  const badge = showBadge(path);
  const dot = hasDot(path);
  if (!badge && !dot) return null;

  if (collapsed) {
    return dot ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden /> : null;
  }
  return (
    <span className="ml-auto inline-flex items-center gap-1.5">
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
      {badge && (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-white">
          {t('common.new')}
        </span>
      )}
    </span>
  );
}
