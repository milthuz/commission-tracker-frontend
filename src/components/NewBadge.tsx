import { useTranslation } from 'react-i18next';
import { useNewFeatures } from '../context/NewFeaturesContext';

// Sidebar item indicator — both the "New" pill (expanded) and the dot (collapsed rail)
// show only while a feature is recent AND unseen by this user, and clear the moment
// they open the section (per-user, permanent). No lingering day-counter.
export default function NewBadge({ path, collapsed = false }: { path: string; collapsed?: boolean }) {
  const { showBadge } = useNewFeatures();
  const { t } = useTranslation();
  if (!showBadge(path)) return null;

  if (collapsed) {
    return <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />;
  }
  return (
    <span className="ml-auto inline-flex items-center">
      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-white">
        {t('common.new')}
      </span>
    </span>
  );
}
