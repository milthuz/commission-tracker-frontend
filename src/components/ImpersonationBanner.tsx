import React from 'react';
import { useTranslation } from 'react-i18next';

// Banner that appears at the top of the layout whenever an admin has set
// localStorage.impersonateAs. Provides a one-click "Stop" button.
const ImpersonationBanner: React.FC = () => {
  const { t } = useTranslation();
  const impersonateAs = typeof window !== 'undefined' ? localStorage.getItem('impersonateAs') : null;

  if (!impersonateAs) return null;

  const stopImpersonating = () => {
    localStorage.removeItem('impersonateAs');
    window.location.reload();
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between bg-[#F59E0B] px-6 py-2 text-sm font-medium text-white shadow">
      <div className="flex items-center gap-2">
        <span>🎭</span>
        <span>
          {t('impersonation.banner', { name: impersonateAs })}
        </span>
      </div>
      <button
        onClick={stopImpersonating}
        className="inline-flex items-center gap-1.5 rounded-md bg-white bg-opacity-20 px-3 py-1 text-xs font-semibold hover:bg-opacity-30 transition"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        {t('impersonation.stop')}
      </button>
    </div>
  );
};

export default ImpersonationBanner;
