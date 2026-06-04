import { useTranslation } from 'react-i18next';
import { useNewFeatures } from '../context/NewFeaturesContext';

// Renders a "New" indicator for a sidebar item whose `path` is an unseen new feature.
//   - collapsed rail: a single dot pinned to the icon.
//   - expanded:       a leading dot + a small "New" pill, pushed to the row's right edge.
// Renders nothing once the user has seen the feature.
export default function NewBadge({ path, collapsed = false }: { path: string; collapsed?: boolean }) {
  const { isNew } = useNewFeatures();
  const { t } = useTranslation();
  if (!isNew(path)) return null;

  if (collapsed) {
    return <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />;
  }
  return (
    <span className="ml-auto inline-flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-white">
        {t('common.new')}
      </span>
    </span>
  );
}
