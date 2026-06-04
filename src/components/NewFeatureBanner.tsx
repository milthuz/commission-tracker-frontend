import { useTranslation } from 'react-i18next';
import { useNewFeatures } from '../context/NewFeaturesContext';

// On-page announcement for a newly-shipped feature. Shows on the feature's own page
// during its "New" window; dismissible per-user (✕). Mounted once in DefaultLayout —
// it auto-matches the current route.
export default function NewFeatureBanner() {
  const { currentBanner, dismissBanner } = useNewFeatures();
  const { t } = useTranslation();
  const feature = currentBanner();
  if (!feature) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-md border border-primary/30 bg-primary/10 p-4">
      <span className="mt-0.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase leading-none text-white">
        {t('common.new')}
      </span>
      <div className="flex-1">
        {feature.title && (
          <p className="text-sm font-semibold text-black dark:text-white">{feature.title}</p>
        )}
        {feature.description && (
          <p className="mt-0.5 text-sm text-body">{feature.description}</p>
        )}
      </div>
      <button
        onClick={() => dismissBanner(feature.id)}
        aria-label={t('common.dismiss') as string}
        className="ml-2 text-body hover:text-black dark:hover:text-white"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
