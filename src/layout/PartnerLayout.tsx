import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePartnerAuth } from '../context/PartnerAuthContext';
import SalesHubLogo from '../components/SalesHubLogo';

// Deliberately minimal — no Sidebar, no internal nav. A partner account should never even have
// the internal nav DOM rendered anywhere near it, not just hidden from view (SH-25).
const PartnerLayout: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = usePartnerAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/partner-portal/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-boxdark-2 dark:text-bodydark">
      <header className="flex items-center justify-between border-b border-stroke bg-white px-4 py-3.5 dark:border-strokedark dark:bg-boxdark md:px-8">
        <SalesHubLogo variant="horizontal" textClassName="text-black dark:text-white" className="h-7" />
        <div className="flex items-center gap-3.5">
          {user && (
            <div className="text-right">
              <div className="text-sm font-semibold text-black dark:text-white">{user.name}</div>
              <div className="text-xs text-body">{user.partnerName}</div>
            </div>
          )}
          <button onClick={handleLogout}
            className="rounded-full border border-stroke px-3.5 py-1.5 text-xs font-semibold text-body hover:border-danger hover:text-danger dark:border-strokedark">
            {t('header.logOut')}
          </button>
        </div>
      </header>
      <main>
        <div className="mx-auto max-w-screen-xl p-4 md:p-6 2xl:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default PartnerLayout;
