import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

// Banner shown whenever the logged-in account is flagged demo_mode: the backend
// scrambles every response (fake client names, scaled amounts) and blocks writes,
// so make it impossible to mistake what's on screen for real numbers.
const DemoModeBanner: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user?.isDemo) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-[#8B5CF6] px-6 py-2 text-sm font-medium text-white shadow">
      <span>🧪</span>
      <span>{t('demo.banner')}</span>
    </div>
  );
};

export default DemoModeBanner;
