import React from 'react';
import { useTranslation } from 'react-i18next';

// « Erreur · dans la page, avec la cause et une action ». Replaces the old habit of an error
// that only reached the console, or a blocking alert in English.
const InlineError = ({ title, detail, onRetry, retryLabel, className = '' }: {
  title: React.ReactNode;
  /** The cause and what to do, in plain words. */
  detail?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <div role="alert" className={`flex items-start gap-2.5 rounded-xl bg-[rgba(244,96,96,0.10)] px-3.5 py-3 text-[#D92D20] dark:bg-[rgba(244,96,96,0.12)] dark:text-[#F46060] ${className}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 text-sm font-bold">{title}</p>
        {detail && <p className="m-0 text-[13px] font-medium text-[#424242] dark:text-bodydark">{detail}</p>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="h-8 flex-none rounded-lg border border-current px-3 text-[13px] font-bold hover:bg-[rgba(244,96,96,0.08)]"
        >
          {retryLabel || t('common.retry')}
        </button>
      )}
    </div>
  );
};

export default InlineError;
