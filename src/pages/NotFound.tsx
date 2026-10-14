import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Unknown address for a signed-in user. Before, the catch-all route rendered the LOGIN
// screen: a flash of the sign-in form, then a silent jump to the dashboard.
const NotFound = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.06em] text-bodydark2">{t('notFound.eyebrow')}</p>
      <h1 className="mt-3 text-2xl font-bold text-black dark:text-white">{t('notFound.title')}</h1>
      <p className="mt-2 text-sm text-body dark:text-bodydark">
        {t('notFound.body')} <code className="break-all rounded bg-gray-2 px-1.5 py-0.5 text-xs dark:bg-meta-4">{pathname}</code>
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-white hover:bg-opacity-90"
      >
        {t('notFound.home')}
      </Link>
    </div>
  );
};

export default NotFound;
