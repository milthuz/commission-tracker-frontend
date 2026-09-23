import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentLoader } from '../../common/Loader';
import ManagersEditor from '../HR/ManagersEditor';
import { API_URL, authHeaders, type Manager } from '../HR/types';

// Admin → RH (perm hr:manage) : les RÉGLAGES de la section Embauches. Même partage que les
// pistes : le travail quotidien (dossiers d'embauche) vit dans le menu principal, la
// configuration ici. Pour l'instant : la liste des gestionnaires proposés dans « Relève de »
// et « Superviseur ». Les destinataires des avis RH restent dans Admin → Notifications, avec
// tous les autres destinataires.

const HrAdmin = () => {
  const { t } = useTranslation();
  const [managers, setManagers] = useState<Manager[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/hr/managers`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setManagers(d.managers || []))
      .catch(() => setError(t('hr.loadFailed') as string));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  if (error) return <div className="rounded border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>;
  if (!managers) return <ContentLoader />;

  return (
    <>
      {saved && <div className="mb-4 rounded border border-success/40 bg-success/5 px-4 py-3 text-sm text-black dark:text-white">{t('hr.managers.saved')}</div>}
      <ManagersEditor
        key={JSON.stringify(managers)}
        initial={managers}
        onSaved={(list) => { setManagers(list); setSaved(true); }}
      />
    </>
  );
};

export default HrAdmin;
