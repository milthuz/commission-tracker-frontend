import React from 'react';
import { useTranslation } from 'react-i18next';
import { StateCard } from '../../components/ui';
import { usePartnerAuth } from '../../context/PartnerAuthContext';

// Team and Organization are partner-ADMIN screens. A standard partner user who lands on one
// (an old bookmark, a shared link) used to get an empty shell — the API refuses with 403 and
// the page showed headings over nothing. Same « Accès restreint » card as the internal app's
// DefaultLayout, with the partner portal's own wording. The server stays the real gate.
const PartnerAdminOnly = ({ children, fallbackHeader }: { children: React.ReactNode; fallbackHeader?: React.ReactNode }) => {
  const { t } = useTranslation();
  const { user } = usePartnerAuth();
  if (user?.role === 'admin') return <>{children}</>;
  return (
    <>
      {fallbackHeader}
      <div className="rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
        <StateCard kind="empty" label={t('access.label')} title={t('partnerPortal.access.adminOnlyTitle')} body={t('partnerPortal.access.adminOnlyBody')} />
      </div>
    </>
  );
};

export default PartnerAdminOnly;
